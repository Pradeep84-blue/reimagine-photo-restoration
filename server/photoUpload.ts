import { randomUUID } from "crypto";
import express, { type Express } from "express";

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const ALLOWED_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
type PresignResponse = { url?: unknown };
type PhotoKind = "original" | "colorized";

function hasValidImageSignature(contentType: string, photo: Buffer) {
  if (contentType === "image/jpeg") return photo.length >= 3 && photo[0] === 0xff && photo[1] === 0xd8 && photo[2] === 0xff;
  if (contentType === "image/png") return photo.length >= 8 && photo.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (contentType === "image/webp") return photo.length >= 12 && photo.toString("ascii", 0, 4) === "RIFF" && photo.toString("ascii", 8, 12) === "WEBP";
  return false;
}

export function registerPhotoUploadRoute(app: Express) {
  app.post(
    "/api/photos/upload",
    (req, res, next) => {
      const contentType = (req.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      if (!ALLOWED_EXTENSIONS[contentType]) {
        res.status(415).json({ error: "Choose a JPEG, PNG, or WebP image." });
        return;
      }
      express.raw({ type: contentType, limit: MAX_IMAGE_BYTES })(req, res, error => {
        if (error) {
          const status = (error as { type?: string }).type === "entity.too.large" ? 413 : 400;
          res.status(status).json({ error: status === 413 ? "Image must be 15 MB or smaller." : "The image could not be read." });
          return;
        }
        next();
      });
    },
    async (req, res) => {
      const contentType = (req.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      const extension = ALLOWED_EXTENSIONS[contentType];
      const kindHeader = req.get("x-photo-kind");
      const kind: PhotoKind | null = kindHeader === "original" || kindHeader === "colorized" ? kindHeader : null;
      const photo = req.body;
      if (!kind) {
        res.status(400).json({ error: "Choose a valid photo upload type." });
        return;
      }
      if (!Buffer.isBuffer(photo) || photo.length === 0 || photo.length > MAX_IMAGE_BYTES) {
        res.status(photo?.length > MAX_IMAGE_BYTES ? 413 : 400).json({ error: "Image must be between 1 byte and 15 MB." });
        return;
      }
      if (!hasValidImageSignature(contentType, photo)) {
        res.status(415).json({ error: "The file contents do not match the selected image format." });
        return;
      }

      const apiUrl = process.env.MANUS_API_URL;
      const apiKey = process.env.MANUS_API_KEY;
      if (!apiUrl || !apiKey) {
        res.status(503).json({ error: "Secure project storage is not configured for this runtime." });
        return;
      }

      const objectPath = `photos/${kind}/${randomUUID()}.${extension}`;
      try {
        const endpoint = new URL("/v1/storage/presign/put", apiUrl);
        endpoint.searchParams.set("path", objectPath);
        const presign = await fetch(endpoint, {
          method: "GET",
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        const result = (await presign.json().catch(() => ({}))) as PresignResponse;
        if (!presign.ok || typeof result.url !== "string") {
          res.status(502).json({ error: "A secure upload link could not be created." });
          return;
        }

        const photoBytes = photo.buffer.slice(photo.byteOffset, photo.byteOffset + photo.byteLength) as ArrayBuffer;
        const transfer = await fetch(result.url, {
          method: "PUT",
          headers: { "Content-Type": contentType },
          body: new Blob([photoBytes], { type: contentType }),
        });
        if (!transfer.ok) {
          res.status(502).json({ error: "Project storage could not accept this photo." });
          return;
        }
        res.status(201).json({ assetUrl: `/manus-storage/${objectPath}` });
      } catch {
        res.status(502).json({ error: "Project storage is temporarily unavailable." });
      }
    },
  );
}
