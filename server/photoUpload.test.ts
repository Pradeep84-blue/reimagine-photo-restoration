import { createServer, request as httpRequest, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerPhotoUploadRoute } from "./photoUpload";

const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3,
]);

type HttpReply = {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
};
let server: Server;
let port: number;

function postPhoto(path: string, photo: Buffer): Promise<HttpReply> {
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
  return JSON.parse(reply.body.toString("utf8")) as { error?: string };
}

describe("photo upload and AI colorization routes", () => {
  beforeEach(async () => {
    vi.stubEnv("MANUS_API_URL", "https://api.example");
    vi.stubEnv("MANUS_API_KEY", "test-runtime-key");
    const app = express();
    registerPhotoUploadRoute(app);
    server = createServer(app);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    await new Promise<void>((resolve, reject) =>
      server.close(error => (error ? reject(error) : resolve()))
    );
  });

  it("rejects mislabeled image content before contacting storage or the model", async () => {
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

  it("uses the listed GPT Image 2 model, asks for individual natural skin tones, and stores the actual result", async () => {
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
          expect(requestBody.originalImages).toEqual([
            { b64Json: PNG_BYTES.toString("base64"), mimeType: "image/png" },
          ]);
          return Response.json({
            image: {
              b64Json: generated.toString("base64"),
            },
          });
        }
        if (url.startsWith("https://api.example/v1/storage/presign/put?")) {
          return Response.json({ url: "https://storage.example/put-object" });
        }
        if (url === "https://storage.example/put-object" && method === "PUT") {
          expect(init?.headers).toEqual({ "Content-Type": "image/png" });
          return new Response(null, { status: 200 });
        }
        throw new Error(`Unexpected mocked request: ${method} ${url}`);
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    const reply = await postPhoto("/api/photos/colorize", PNG_BYTES);

    expect(reply.status).toBe(201);
    expect(reply.headers["content-type"]).toContain("image/png");
    expect(reply.headers["cache-control"]).toBe("no-store");
    expect(reply.headers["x-photo-asset-url"]).toMatch(
      /^\/manus-storage\/photos\/colorized\/[\w-]+\.png$/
    );
    expect(reply.body).toEqual(generated);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("does not silently select another model when GPT Image 2 is unavailable", async () => {
    const fetchMock = vi.fn(
      async (): Promise<Response> =>
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

    const reply = await postPhoto("/api/photos/colorize", PNG_BYTES);

    expect(reply.status).toBe(503);
    expect(jsonBody(reply).error).toMatch(/not available/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
