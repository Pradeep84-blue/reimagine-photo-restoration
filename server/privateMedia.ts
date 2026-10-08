import type { Express, Request } from "express";
import { ENV } from "./_core/env";
import { sdk } from "./_core/sdk";
import { getOwnedPhoto } from "./library";

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

type StoredPhoto = NonNullable<Awaited<ReturnType<typeof getOwnedPhoto>>>;

function getStorageReadConfig() {
  const baseUrl = ENV.forgeApiUrl;
  const apiKey = ENV.forgeApiKey;
  if (!baseUrl || !apiKey) throw new Error("Storage is unavailable");
  return { baseUrl, apiKey };
}

async function getSignedReadUrl(path: string) {
  const { baseUrl, apiKey } = getStorageReadConfig();
  const endpoint = new URL(
    "v1/storage/presign/get",
    `${baseUrl.replace(/\/+$/, "")}/`
  );
  endpoint.searchParams.set("path", path);
  const response = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error("Storage read authorization failed");
  const result = (await response.json()) as { url?: unknown; error?: unknown };
  if (typeof result.url !== "string")
    throw new Error("Storage read address is missing");
  const signedUrl = new URL(result.url);
  if (
    signedUrl.protocol !== "https:" ||
    signedUrl.username ||
    signedUrl.password
  ) {
    throw new Error("Storage returned an invalid read address");
  }
  return signedUrl;
}

async function fetchStoredBytes(path: string) {
  const signedUrl = await getSignedReadUrl(path);
  const response = await fetch(signedUrl, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error("Stored image is unavailable");
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_BYTES) {
    throw new Error("Stored image exceeds the limit");
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) {
    throw new Error("Stored image size is invalid");
  }
  return bytes;
}

async function findSignedInAccount(req: Request) {
  try {
    const user = await sdk.authenticateRequest(req);
    return user.isCron ? null : user;
  } catch {
    return null;
  }
}

export function registerPrivateMediaRoute(app: Express) {
  app.get("/api/library/:photoId/media", async (req, res) => {
    const account = await findSignedInAccount(req);
    if (!account) {
      res.status(401).json({ error: "Sign in to open this photo." });
      return;
    }

    const variant = req.query.variant;
    if (variant !== "original" && variant !== "colorized") {
      res.status(400).json({ error: "Choose an image variant." });
      return;
    }

    let photo: StoredPhoto | null;
    try {
      photo = await getOwnedPhoto(req.params.photoId, account.id);
    } catch {
      res
        .status(503)
        .json({ error: "Photo history is temporarily unavailable." });
      return;
    }
    if (!photo) {
      res.status(404).json({ error: "This photo is not in your history." });
      return;
    }

    const path = variant === "original" ? photo.originalPath : photo.resultPath;
    const contentType =
      variant === "original" ? photo.originalMimeType : photo.resultMimeType;
    try {
      const bytes = await fetchStoredBytes(path);
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.type(contentType).status(200).send(bytes);
    } catch {
      res.status(502).json({ error: "This image is temporarily unavailable." });
    }
  });
}
