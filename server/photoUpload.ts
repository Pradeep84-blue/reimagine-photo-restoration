import { randomUUID } from "crypto";
import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const ALLOWED_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
type PhotoKind = "original" | "colorized";
type ImageModel = { model?: unknown; id?: unknown };
type ImageResult = { url?: unknown; b64Json?: unknown; mimeType?: unknown };
type ImageResponse = {
  image?: ImageResult;
  models?: ImageModel[];
  error?: { message?: string } | string;
};
type StoredImage = { bytes: Buffer; mimeType: string };

class ColorizationError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

function hasValidImageSignature(contentType: string, photo: Buffer) {
  if (contentType === "image/jpeg")
    return (
      photo.length >= 3 &&
      photo[0] === 0xff &&
      photo[1] === 0xd8 &&
      photo[2] === 0xff
    );
  if (contentType === "image/png")
    return (
      photo.length >= 8 &&
      photo
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    );
  if (contentType === "image/webp")
    return (
      photo.length >= 12 &&
      photo.toString("ascii", 0, 4) === "RIFF" &&
      photo.toString("ascii", 8, 12) === "WEBP"
    );
  return false;
}

function imageTypeFromSignature(photo: Buffer) {
  return (
    Object.keys(ALLOWED_EXTENSIONS).find(type =>
      hasValidImageSignature(type, photo)
    ) ?? null
  );
}

function validatePhotoBody(req: Request, res: Response, next: NextFunction) {
  const contentType = (req.get("content-type") ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (!ALLOWED_EXTENSIONS[contentType]) {
    res.status(415).json({ error: "Choose a JPEG, PNG, or WebP image." });
    return;
  }
  express.raw({ type: contentType, limit: MAX_IMAGE_BYTES })(
    req,
    res,
    error => {
      if (error) {
        const status =
          (error as { type?: string }).type === "entity.too.large" ? 413 : 400;
        res.status(status).json({
          error:
            status === 413
              ? "Image must be 15 MB or smaller."
              : "The image could not be read.",
        });
        return;
      }
      const photo = req.body;
      if (!Buffer.isBuffer(photo) || photo.length === 0) {
        res.status(400).json({ error: "Choose a non-empty photo." });
        return;
      }
      if (!hasValidImageSignature(contentType, photo)) {
        res.status(415).json({
          error: "The file contents do not match the selected image format.",
        });
        return;
      }
      res.locals.photo = photo as Buffer;
      res.locals.contentType = contentType;
      next();
    }
  );
}

function platformCredentials() {
  const apiUrl = process.env.MANUS_API_URL;
  const apiKey = process.env.MANUS_API_KEY;
  if (!apiUrl || !apiKey)
    throw new ColorizationError(
      503,
      "The image service is not configured for this project."
    );
  return { apiUrl: apiUrl.replace(/\/+$/, ""), apiKey };
}

async function storePhotoAsset(
  apiUrl: string,
  apiKey: string,
  photo: Buffer,
  contentType: string,
  kind: PhotoKind
) {
  const extension = ALLOWED_EXTENSIONS[contentType];
  const objectPath = `photos/${kind}/${randomUUID()}.${extension}`;
  const endpoint = new URL("/v1/storage/presign/put", apiUrl);
  endpoint.searchParams.set("path", objectPath);
  const presign = await fetch(endpoint, {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(20_000),
  });
  const result = (await presign.json().catch(() => ({}))) as {
    url?: unknown;
    error?: unknown;
  };
  if (!presign.ok || typeof result.url !== "string")
    throw new ColorizationError(
      502,
      "Project storage could not prepare the photo."
    );

  const signedUrl = new URL(result.url);
  if (
    signedUrl.protocol !== "https:" ||
    signedUrl.username ||
    signedUrl.password
  ) {
    throw new ColorizationError(
      502,
      "Project storage returned an invalid transfer address."
    );
  }
  const photoBytes = photo.buffer.slice(
    photo.byteOffset,
    photo.byteOffset + photo.byteLength
  ) as ArrayBuffer;
  const transfer = await fetch(signedUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: new Blob([photoBytes], { type: contentType }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!transfer.ok)
    throw new ColorizationError(
      502,
      "Project storage could not accept this photo."
    );
  return `/manus-storage/${objectPath}`;
}

function imageServiceHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "connect-protocol-version": "1",
  };
}

async function readImageWithinLimit(response: globalThis.Response) {
  const reader = response.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) return Buffer.concat(chunks, totalBytes);
    totalBytes += value.byteLength;
    if (totalBytes > MAX_IMAGE_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new ColorizationError(
        413,
        "The colorized result is larger than 15 MB."
      );
    }
    chunks.push(Buffer.from(value));
  }
}

async function selectAvailableModel(apiUrl: string, apiKey: string) {
  const response = await fetch(`${apiUrl}/images.v1.ImageService/ListModels`, {
    method: "POST",
    headers: imageServiceHeaders(apiKey),
    body: "{}",
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await response.json().catch(() => ({}))) as ImageResponse;
  if (!response.ok || data.error)
    throw new ColorizationError(
      503,
      "The project's image models are unavailable right now. Please try again."
    );
  const model = data.models?.find(
    candidate =>
      candidate.id === "gpt-image-2" && typeof candidate.model === "string"
  );
  if (!model || typeof model.model !== "string") {
    throw new ColorizationError(
      503,
      "The natural-detail colorization model is not available for this project right now."
    );
  }
  return model.model;
}

async function getModelResult(
  apiUrl: string,
  apiKey: string,
  model: string,
  photo: Buffer,
  contentType: string
): Promise<StoredImage> {
  const prompt = [
    "Faithfully colorize the supplied black-and-white historical photograph as a realistic archival restoration, not a sepia filter.",
    "Use richer, clearly visible yet natural colors chosen for the scene; preserve the exact composition, people, facial identity, face shape, age, expression, gaze, pose, clothing, objects, background, and photographic texture. Do not crop, add, remove, or invent subjects or details.",
    "Give particular care to skin: preserve each person's own apparent complexion, undertone, and variation in the original lighting; do not homogenize, over-saturate, make orange or pink, lighten, darken, smooth, or repaint anyone's skin. Keep highlights, shadow depth, facial detail, and realistic skin texture.",
    "Color other scene elements distinctly and plausibly, with balanced saturation. The result should feel naturally vivid rather than muted or monochrome-tinted. Return one complete image with the input framing and aspect ratio; no text, labels, or border.",
  ].join(" ");

  const response = await fetch(
    `${apiUrl}/images.v1.ImageService/GenerateImage`,
    {
      method: "POST",
      headers: imageServiceHeaders(apiKey),
      body: JSON.stringify({
        prompt,
        model,
        originalImages: [
          { b64Json: photo.toString("base64"), mimeType: contentType },
        ],
      }),
      signal: AbortSignal.timeout(180_000),
    }
  );
  const data = (await response.json().catch(() => ({}))) as ImageResponse;
  if (!response.ok || data.error) {
    if (response.status === 429)
      throw new ColorizationError(
        503,
        "The colorizer is busy. Please wait a moment and try again."
      );
    if (response.status === 401 || response.status === 403)
      throw new ColorizationError(
        503,
        "Image colorization is not enabled for this project."
      );
    throw new ColorizationError(
      502,
      "The image model could not colorize this photo. Please try again."
    );
  }

  const image = data.image;
  if (!image)
    throw new ColorizationError(
      502,
      "The image model returned no colorized photo. Please try again."
    );
  let bytes: Buffer;
  let mimeType =
    typeof image.mimeType === "string"
      ? image.mimeType.split(";")[0].trim().toLowerCase()
      : "";
  if (typeof image.b64Json === "string") {
    let encoded = image.b64Json;
    const dataUri = encoded.match(/^data:(image\/(?:jpeg|png|webp));base64,/i);
    if (dataUri) {
      if (!mimeType) mimeType = dataUri[1].toLowerCase();
      encoded = encoded.slice(dataUri[0].length);
    }
    if (
      encoded.length > Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 8 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)
    ) {
      throw new ColorizationError(
        502,
        "The model returned an invalid or oversized image. Please try again."
      );
    }
    bytes = Buffer.from(encoded, "base64");
  } else if (typeof image.url === "string") {
    const imageUrl = new URL(image.url);
    if (
      imageUrl.protocol !== "https:" ||
      imageUrl.username ||
      imageUrl.password
    ) {
      throw new ColorizationError(
        502,
        "The image model returned an invalid result address."
      );
    }
    const result = await fetch(imageUrl, {
      signal: AbortSignal.timeout(45_000),
    });
    if (!result.ok)
      throw new ColorizationError(
        502,
        "The model's photo result could not be retrieved. Please try again."
      );
    mimeType ||= (result.headers.get("content-type") ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (Number(result.headers.get("content-length")) > MAX_IMAGE_BYTES)
      throw new ColorizationError(
        413,
        "The colorized result is larger than 15 MB."
      );
    bytes = await readImageWithinLimit(result);
  } else {
    throw new ColorizationError(
      502,
      "The image model returned no downloadable photo. Please try again."
    );
  }

  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES)
    throw new ColorizationError(
      413,
      "The colorized result is larger than 15 MB."
    );
  const verifiedMimeType = imageTypeFromSignature(bytes);
  if (
    !verifiedMimeType ||
    (ALLOWED_EXTENSIONS[mimeType] && mimeType !== verifiedMimeType)
  ) {
    throw new ColorizationError(
      502,
      "The image model returned an unsupported photo format. Please try again."
    );
  }
  return { bytes, mimeType: verifiedMimeType };
}

export function registerPhotoUploadRoute(app: Express) {
  app.post("/api/photos/upload", validatePhotoBody, async (_req, res) => {
    try {
      const { apiUrl, apiKey } = platformCredentials();
      const photo = res.locals.photo as Buffer;
      const contentType = res.locals.contentType as string;
      const assetUrl = await storePhotoAsset(
        apiUrl,
        apiKey,
        photo,
        contentType,
        "original"
      );
      res.status(201).json({ assetUrl });
    } catch (error) {
      const failure =
        error instanceof ColorizationError
          ? error
          : new ColorizationError(
              502,
              "Project file storage is temporarily unavailable."
            );
      res.status(failure.status).json({ error: failure.message });
    }
  });

  app.post("/api/photos/colorize", validatePhotoBody, async (_req, res) => {
    try {
      const { apiUrl, apiKey } = platformCredentials();
      const photo = res.locals.photo as Buffer;
      const contentType = res.locals.contentType as string;
      const model = await selectAvailableModel(apiUrl, apiKey);
      const result = await getModelResult(
        apiUrl,
        apiKey,
        model,
        photo,
        contentType
      );
      const assetUrl = await storePhotoAsset(
        apiUrl,
        apiKey,
        result.bytes,
        result.mimeType,
        "colorized"
      );
      res.status(201);
      res.setHeader("Content-Type", result.mimeType);
      res.setHeader("X-Photo-Asset-Url", assetUrl);
      res.setHeader("Cache-Control", "no-store");
      res.send(result.bytes);
    } catch (error) {
      const failure =
        error instanceof ColorizationError
          ? error
          : new ColorizationError(
              502,
              "Colorization failed. Please try again."
            );
      res.status(failure.status).json({ error: failure.message });
    }
  });
}
