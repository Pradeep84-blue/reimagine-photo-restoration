import { createServer, request as httpRequest, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./_core/env", () => ({
  ENV: {
    forgeApiUrl: "https://api.example",
    forgeApiKey: "private-media-test-key",
  },
}));
vi.mock("./_core/sdk", () => ({ sdk: { authenticateRequest: vi.fn() } }));
vi.mock("./library", () => ({ getOwnedPhoto: vi.fn() }));

import { ENV } from "./_core/env";
import { sdk } from "./_core/sdk";
import { getOwnedPhoto } from "./library";
import { registerPrivateMediaRoute } from "./privateMedia";

const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 5, 4, 3,
]);
const PHOTO_ID = "970bdad9-687d-43cc-9a24-2c70bdb4e89a";
const account = { id: 77, isCron: false } as unknown as Awaited<
  ReturnType<typeof sdk.authenticateRequest>
>;

type HttpReply = {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
};

let server: Server;
let port: number;

function getPhoto(path: string): Promise<HttpReply> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method: "GET",
        agent: false,
        headers: { Cookie: "reimagine_session=test-session" },
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

const photo = {
  id: PHOTO_ID,
  userId: account.id,
  batchId: null,
  fileName: "family.png",
  title: "Family",
  style: "natural",
  originalPath: "photos/77/original/source.png",
  originalMimeType: "image/png",
  resultPath: "photos/77/colorized/result.png",
  resultMimeType: "image/png",
  favorite: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  removedAt: null,
} as NonNullable<Awaited<ReturnType<typeof getOwnedPhoto>>>;

describe("private photo media route", () => {
  beforeEach(async () => {
    vi.mocked(sdk.authenticateRequest).mockResolvedValue(account);
    vi.mocked(getOwnedPhoto).mockResolvedValue(photo);

    const app = express();
    registerPrivateMediaRoute(app);
    server = createServer(app);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    await new Promise<void>((resolve, reject) =>
      server.close(error => (error ? reject(error) : resolve()))
    );
  });

  it("requires a Reimagine account session", async () => {
    vi.mocked(sdk.authenticateRequest).mockRejectedValue(
      new Error("no session")
    );
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const reply = await getPhoto(
      `/api/library/${PHOTO_ID}/media?variant=colorized`
    );

    expect(reply.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getOwnedPhoto).not.toHaveBeenCalled();
  });

  it("does not fetch a storage object when the photo is not owned by the signed-in account", async () => {
    vi.mocked(getOwnedPhoto).mockResolvedValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const reply = await getPhoto(
      `/api/library/${PHOTO_ID}/media?variant=colorized`
    );

    expect(reply.status).toBe(404);
    expect(vi.mocked(getOwnedPhoto)).toHaveBeenCalledWith(PHOTO_ID, account.id);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("streams stored bytes privately without returning an object key or signed URL", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL): Promise<Response> => {
        const url = new URL(String(input));
        if (url.origin === "https://api.example") {
          expect(url.pathname).toBe("/v1/storage/presign/get");
          expect(url.searchParams.get("path")).toBe(photo.resultPath);
          return Response.json({ url: "https://storage.example/signed/read" });
        }
        if (String(input) === "https://storage.example/signed/read") {
          return new Response(PNG_BYTES, { status: 200 });
        }
        throw new Error(`Unexpected URL: ${String(input)}`);
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    const reply = await getPhoto(
      `/api/library/${PHOTO_ID}/media?variant=colorized`
    );

    expect(reply.status).toBe(200);
    expect(reply.headers["cache-control"]).toBe("private, no-store");
    expect(reply.headers["cross-origin-resource-policy"]).toBe("same-origin");
    expect(reply.headers["content-type"]).toMatch(/image\/png/);
    expect(reply.body).toEqual(PNG_BYTES);
    expect(reply.body.toString("utf8")).not.toContain("storage.example");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects unknown image variants", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const reply = await getPhoto(
      `/api/library/${PHOTO_ID}/media?variant=thumbnail`
    );

    expect(reply.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getOwnedPhoto).not.toHaveBeenCalled();
  });
});
