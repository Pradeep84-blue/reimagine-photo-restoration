import { createServer, request as httpRequest, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./_core/sdk", () => ({ sdk: { authenticateRequest: vi.fn() } }));
vi.mock("./library", () => ({ createPhotoHistory: vi.fn() }));

import { sdk } from "./_core/sdk";
import { createPhotoHistory, type NewPhotoHistory } from "./library";
import { registerPhotoUploadRoute } from "./photoUpload";

const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3,
]);
const BATCH_ID = "970bdad9-687d-43cc-9a24-2c70bdb4e89a";

type HttpReply = {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
};

let server: Server;
let port: number;

function postPhoto(
  path: string,
  photo: Buffer,
  headers: Record<string, string> = {}
): Promise<HttpReply> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method: "POST",
        agent: false,
        headers: {
          "Content-Type": "image/png",
          "Content-Length": photo.length,
          "X-Reimagine-Request": "1",
          "X-Color-Style": "natural",
          "X-Photo-Name": "test.png",
          ...headers,
        },
      },
      response => {
        const chunks: Buffer[] = [];
        response.on("data", chunk => chunks.push(Buffer.from(chunk)));
        response.on("end", () =>
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            body: Buffer.concat(chunks),
          })
        );
      }
    );
    req.on("error", reject);
    req.end(photo);
  });
}

function jsonBody(reply: HttpReply) {
  return JSON.parse(reply.body.toString("utf8")) as {
    photo?: {
      id: string;
      title: string;
      style: string;
      batchId: string | null;
    };
    error?: string;
    originalPath?: string;
    resultPath?: string;
  };
}

const account = { id: 42, isCron: false } as unknown as Awaited<
  ReturnType<typeof sdk.authenticateRequest>
>;

function storagePathFromUrl(input: RequestInfo | URL) {
  return new URL(String(input)).searchParams.get("path") ?? "";
}

describe("authenticated photo colorization and account history", () => {
  beforeEach(async () => {
    vi.stubEnv("API_URL", "https://api.example");
    vi.stubEnv("API_KEY", "test-runtime-key");
    vi.mocked(sdk.authenticateRequest).mockResolvedValue(account);
    vi.mocked(createPhotoHistory).mockImplementation(
      async (record: NewPhotoHistory) => ({
        id: record.id,
        title: record.title,
        fileName: record.fileName,
        style: record.style,
        favorite: false,
        createdAt: new Date(),
        batchId: record.batchId ?? null,
      })
    );

    const app = express();
    registerPhotoUploadRoute(app);
    server = createServer(app);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    await new Promise<void>((resolve, reject) =>
      server.close(error => (error ? reject(error) : resolve()))
    );
  });

  it("rejects requests without the same-origin mutation header before authentication or storage", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const reply = await postPhoto("/api/photos/colorize", PNG_BYTES, {
      "X-Reimagine-Request": "",
    });

    expect(reply.status).toBe(403);
    expect(vi.mocked(sdk.authenticateRequest)).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires a signed-in account before reading photo bytes or calling the model", async () => {
    vi.mocked(sdk.authenticateRequest).mockRejectedValue(
      new Error("no session")
    );
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const reply = await postPhoto("/api/photos/colorize", PNG_BYTES);

    expect(reply.status).toBe(401);
    expect(jsonBody(reply).error).toMatch(/sign in/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects mislabeled image bytes before contacting storage or the model", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const reply = await postPhoto(
      "/api/photos/colorize",
      Buffer.from("not a PNG")
    );

    expect(reply.status).toBe(415);
    expect(jsonBody(reply).error).toMatch(/contents do not match/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("enforces the 15 MB limit before inference", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const reply = await postPhoto(
      "/api/photos/colorize",
      Buffer.alloc(15 * 1024 * 1024 + 1)
    );

    expect(reply.status).toBe(413);
    expect(jsonBody(reply).error).toMatch(/15 MB/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stores owner-scoped originals and real AI results without returning object keys", async () => {
    const generated = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 8, 7,
    ]);
    const fetchMock = vi.fn(
      async (
        input: RequestInfo | URL,
        init?: RequestInit
      ): Promise<Response> => {
        const url = String(input);
        const method = init?.method ?? "GET";

        if (url.endsWith("/images.v1.ImageService/ListModels")) {
          return Response.json({
            models: [{ id: "gpt-image-2", model: "MODEL_GPT_IMAGE_2" }],
          });
        }
        if (url.endsWith("/images.v1.ImageService/GenerateImage")) {
          const requestBody = JSON.parse(String(init?.body)) as {
            model: string;
            prompt: string;
            originalImages: Array<{ b64Json: string; mimeType: string }>;
          };
          expect(requestBody.model).toBe("MODEL_GPT_IMAGE_2");
          expect(requestBody.prompt).toMatch(
            /richer, clearly visible yet natural colors/i
          );
          expect(requestBody.prompt).toMatch(/complexion|skin/i);
          expect(requestBody.prompt).toMatch(/undertone/i);
          expect(requestBody.prompt).toMatch(/vivid pass/i);
          expect(requestBody.originalImages).toEqual([
            { b64Json: PNG_BYTES.toString("base64"), mimeType: "image/png" },
          ]);
          return Response.json({
            image: { b64Json: generated.toString("base64") },
          });
        }
        if (url.startsWith("https://api.example/v1/storage/presign/put?")) {
          const path = storagePathFromUrl(input);
          return Response.json({
            url: `https://storage.example/put/${encodeURIComponent(path)}`,
          });
        }
        if (
          url.startsWith("https://storage.example/put/") &&
          method === "PUT"
        ) {
          expect(init?.headers).toEqual({ "Content-Type": "image/png" });
          return new Response(null, { status: 200 });
        }
        throw new Error(`Unexpected mocked request: ${method} ${url}`);
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    const reply = await postPhoto("/api/photos/colorize", PNG_BYTES, {
      "X-Color-Style": "vivid",
      "X-Photo-Name": "lake-family.png",
      "X-Photo-Batch": BATCH_ID,
    });

    expect(reply.status).toBe(201);
    expect(reply.headers["cache-control"]).toBe("no-store");
    const response = jsonBody(reply);
    expect(response.photo).toMatchObject({
      title: "lake-family",
      style: "vivid",
      batchId: BATCH_ID,
    });
    expect(response.originalPath).toBeUndefined();
    expect(response.resultPath).toBeUndefined();
    const stored = vi.mocked(createPhotoHistory).mock.calls[0]?.[0];
    expect(stored).toMatchObject({
      userId: account.id,
      fileName: "lake-family.png",
      originalMimeType: "image/png",
      resultMimeType: "image/png",
      style: "vivid",
    });
    expect(stored?.originalPath).toMatch(/^photos\/42\/original\//);
    expect(stored?.resultPath).toMatch(/^photos\/42\/colorized\//);
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("does not silently select another model when GPT Image 2 is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (): Promise<Response> =>
          Response.json({
            models: [
              {
                id: "gemini-2.5-flash-image-preview",
                model: "MODEL_GEMINI_2_5_FLASH_IMAGE_PREVIEW",
              },
            ],
          })
      )
    );

    const reply = await postPhoto("/api/photos/colorize", PNG_BYTES);

    expect(reply.status).toBe(503);
    expect(jsonBody(reply).error).toMatch(/not available/i);
  });

  it("rejects invalid batch identifiers without contacting the model", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const reply = await postPhoto("/api/photos/colorize", PNG_BYTES, {
      "X-Photo-Batch": "not-a-uuid",
    });

    expect(reply.status).toBe(400);
    expect(jsonBody(reply).error).toMatch(/batch identifier/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
