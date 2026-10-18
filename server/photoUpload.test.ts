import { createServer, request as httpRequest, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./_core/sdk", () => ({ sdk: { authenticateRequest: vi.fn() } }));
vi.mock("./library", () => ({ createPhotoHistory: vi.fn() }));

import { sdk } from "./_core/sdk";
import { createPhotoHistory, type NewPhotoHistory } from "./library";
import { hasCutoutProAccess, registerPhotoUploadRoute } from "./photoUpload";

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

function getPhotoModels(): Promise<HttpReply> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: "127.0.0.1",
        port,
        path: "/api/photos/models",
        method: "GET",
        agent: false,
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
    req.end();
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
    models?: Array<{ id: string; label: string }>;
    defaultModelId?: string;
    cutoutProAvailable?: boolean;
    modelError?: string;
    error?: string;
    originalPath?: string;
    resultPath?: string;
  };
}

const account = {
  id: 42,
  isCron: false,
  email: "owner@example.test",
} as unknown as Awaited<ReturnType<typeof sdk.authenticateRequest>>;

function storagePathFromUrl(input: RequestInfo | URL) {
  return new URL(String(input)).searchParams.get("path") ?? "";
}

describe("authenticated photo colorization and account history", () => {
  beforeEach(async () => {
    vi.stubEnv("API_URL", "https://api.example");
    vi.stubEnv("API_KEY", "test-runtime-key");
    vi.stubEnv("CUTOUT_PRO_API_KEY", "test-cutout-key");
    vi.stubEnv("CUTOUT_PRO_ALLOWED_EMAIL", "owner@example.test");
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

  it("returns a protected, sanitized model catalog with GPT Image 2 preferred", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        models: [
          { id: "gpt-image-2", model: "MODEL_GPT_IMAGE_2" },
          {
            id: "gemini-2.5-flash-image-preview",
            model: "MODEL_GEMINI_2_5_FLASH_IMAGE_PREVIEW",
          },
        ],
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const reply = await getPhotoModels();
    const response = jsonBody(reply);

    expect(reply.status).toBe(200);
    expect(reply.headers["cache-control"]).toBe("private, no-store");
    expect(response.models).toEqual([
      { id: "gpt-image-2", label: "GPT Image 2" },
      {
        id: "gemini-2.5-flash-image-preview",
        label: "Gemini 2.5 Flash Image Preview",
      },
    ]);
    expect(response.defaultModelId).toBe("gpt-image-2");
    expect(response.cutoutProAvailable).toBe(true);
    expect(reply.body.toString("utf8")).not.toContain("MODEL_GPT_IMAGE_2");
    expect(vi.mocked(sdk.authenticateRequest)).toHaveBeenCalledOnce();
  });

  it("requires a signed-in account to load the model catalog", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.mocked(sdk.authenticateRequest).mockRejectedValueOnce(
      new Error("No session")
    );

    const reply = await getPhotoModels();

    expect(reply.status).toBe(401);
    expect(jsonBody(reply).error).toMatch(/sign in/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("normalizes the owner email and requires both backup settings", () => {
    expect(
      hasCutoutProAccess(
        " Owner@Example.Test ",
        "test-key",
        "owner@example.test"
      )
    ).toBe(true);
    expect(
      hasCutoutProAccess("other@example.test", "test-key", "owner@example.test")
    ).toBe(false);
    expect(
      hasCutoutProAccess("owner@example.test", "", "owner@example.test")
    ).toBe(false);
    expect(hasCutoutProAccess("owner@example.test", "test-key", " ")).toBe(
      false
    );
  });

  it("does not advertise Cutout.Pro to accounts outside the owner allowlist", async () => {
    vi.mocked(sdk.authenticateRequest).mockResolvedValueOnce({
      ...account,
      email: "another@example.test",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          models: [{ id: "gpt-image-2", model: "MODEL_GPT_IMAGE_2" }],
        })
      )
    );

    const response = jsonBody(await getPhotoModels());

    expect(response.cutoutProAvailable).toBe(false);
  });

  it("keeps the owner backup available when the primary model catalog is exhausted", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { code: "resource_exhausted", message: "usage quota exhausted" },
          { status: 503 }
        )
      )
    );

    const reply = await getPhotoModels();
    const response = jsonBody(reply);

    expect(reply.status).toBe(200);
    expect(response.models).toEqual([]);
    expect(response.cutoutProAvailable).toBe(true);
    expect(response.modelError).toMatch(/account usage limit/i);
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
            models: [
              { id: "gpt-image-2", model: "MODEL_GPT_IMAGE_2" },
              {
                id: "gemini-2.5-flash-image-preview",
                model: "MODEL_GEMINI_2_5_FLASH_IMAGE_PREVIEW",
              },
            ],
          });
        }
        if (url.endsWith("/images.v1.ImageService/GenerateImage")) {
          const requestBody = JSON.parse(String(init?.body)) as {
            model: string;
            prompt: string;
            originalImages: Array<{ b64Json: string; mimeType: string }>;
          };
          expect(requestBody.model).toBe(
            "MODEL_GEMINI_2_5_FLASH_IMAGE_PREVIEW"
          );
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
      "X-Image-Model": "gemini-2.5-flash-image-preview",
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

  it("sends to Cutout.Pro only when the authenticated owner selects it and stores its binary result privately", async () => {
    const generated = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7, 6, 5,
    ]);
    const generatedBytes = generated.buffer.slice(
      generated.byteOffset,
      generated.byteOffset + generated.byteLength
    ) as ArrayBuffer;
    const fetchMock = vi.fn(
      async (
        input: RequestInfo | URL,
        init?: RequestInit
      ): Promise<Response> => {
        const url = String(input);
        const method = init?.method ?? "GET";

        if (url === "https://www.cutout.pro/api/v1/matting?mattingType=19") {
          expect(method).toBe("POST");
          expect(init?.headers).toEqual({ APIKEY: "test-cutout-key" });
          expect(init?.body).toBeInstanceOf(FormData);
          const upload = (init?.body as FormData).get("file");
          expect(upload).toBeInstanceOf(Blob);
          expect((upload as Blob).type).toBe("image/png");
          return new Response(generatedBytes, {
            headers: { "Content-Type": "image/png" },
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
          return new Response(null, { status: 200 });
        }
        throw new Error(`Unexpected mocked request: ${method} ${url}`);
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    const reply = await postPhoto("/api/photos/colorize", PNG_BYTES, {
      "X-Photo-Provider": "cutout-pro",
      "X-Color-Style": "vivid",
      "X-Image-Model": "ignored-by-cutout",
    });

    expect(reply.status).toBe(201);
    expect(jsonBody(reply).photo).toMatchObject({ style: "natural" });
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).includes("ImageService/GenerateImage")
      )
    ).toBe(false);
    const stored = vi.mocked(createPhotoHistory).mock.calls[0]?.[0];
    expect(stored).toMatchObject({ userId: account.id, style: "natural" });
    expect(stored?.originalPath).toMatch(/^photos\/42\/original\//);
    expect(stored?.resultPath).toMatch(/^photos\/42\/colorized\//);
  });

  it("rejects a non-allowlisted account's Cutout.Pro request before any external call", async () => {
    vi.mocked(sdk.authenticateRequest).mockResolvedValueOnce({
      ...account,
      email: "another@example.test",
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const reply = await postPhoto("/api/photos/colorize", PNG_BYTES, {
      "X-Photo-Provider": "cutout-pro",
    });

    expect(reply.status).toBe(403);
    expect(jsonBody(reply).error).toMatch(/not available for this account/i);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(createPhotoHistory).not.toHaveBeenCalled();
  });

  it("defaults to GPT Image 2 when it is available and no selection is sent", async () => {
    let requestedModel = "";
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/images.v1.ImageService/ListModels")) {
          return Response.json({
            models: [
              {
                id: "gemini-2.5-flash-image-preview",
                model: "MODEL_GEMINI_2_5_FLASH_IMAGE_PREVIEW",
              },
              { id: "gpt-image-2", model: "MODEL_GPT_IMAGE_2" },
            ],
          });
        }
        if (url.endsWith("/images.v1.ImageService/GenerateImage")) {
          requestedModel = (JSON.parse(String(init?.body)) as { model: string })
            .model;
          return Response.json(
            { error: "Intentional test stop." },
            { status: 400 }
          );
        }
        throw new Error(`Unexpected mocked request: ${url}`);
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    const reply = await postPhoto("/api/photos/colorize", PNG_BYTES);

    expect(reply.status).toBe(502);
    expect(requestedModel).toBe("MODEL_GPT_IMAGE_2");
    expect(createPhotoHistory).not.toHaveBeenCalled();
  });

  it("rejects an explicitly selected model that is no longer available", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        models: [
          {
            id: "gemini-2.5-flash-image-preview",
            model: "MODEL_GEMINI_2_5_FLASH_IMAGE_PREVIEW",
          },
        ],
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const reply = await postPhoto("/api/photos/colorize", PNG_BYTES, {
      "X-Image-Model": "gpt-image-2",
    });

    expect(reply.status).toBe(400);
    expect(jsonBody(reply).error).toMatch(/no longer available/i);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(createPhotoHistory).not.toHaveBeenCalled();
  });

  it("explains top-level account usage exhaustion instead of a generic model failure", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/images.v1.ImageService/ListModels")) {
        return Response.json({
          models: [{ id: "gpt-image-2", model: "MODEL_GPT_IMAGE_2" }],
        });
      }
      if (url.endsWith("/images.v1.ImageService/GenerateImage")) {
        return Response.json(
          {
            code: "failed_precondition",
            message: "your account has hit a usage exhausted",
          },
          { status: 400 }
        );
      }
      throw new Error(`Unexpected mocked request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const reply = await postPhoto("/api/photos/colorize", PNG_BYTES);

    expect(reply.status).toBe(503);
    expect(jsonBody(reply).error).toMatch(/account usage limit/i);
    expect(createPhotoHistory).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes("cutout.pro"))
    ).toBe(false);
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
