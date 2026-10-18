export type ColorStyle = "natural" | "vivid";
export type ColorizationProvider = "reimagine" | "cutout-pro";
export type SavedPhoto = {
  id: string;
  title: string;
  fileName: string;
  style: ColorStyle;
  favorite: boolean;
  createdAt: string | Date;
  batchId: string | null;
};
export type ColorizationModelOption = { id: string; label: string };
export type ColorizationModelCatalog = {
  models: ColorizationModelOption[];
  defaultModelId: string;
  cutoutProAvailable: boolean;
  modelError?: string;
};

const MODEL_PREFERENCE_KEY = "reimagine-image-model";

export function getPreferredImageModelId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(MODEL_PREFERENCE_KEY);
  } catch {
    return null;
  }
}

export function setPreferredImageModelId(modelId: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(MODEL_PREFERENCE_KEY, modelId);
  } catch {
    // Model choice remains usable for this page even if storage is unavailable.
  }
}

export async function fetchColorizationModelCatalog(): Promise<ColorizationModelCatalog> {
  const response = await fetch("/api/photos/models", {
    credentials: "include",
    cache: "no-store",
  });
  const data = (await response.json().catch(() => ({}))) as {
    models?: unknown;
    defaultModelId?: unknown;
    cutoutProAvailable?: unknown;
    modelError?: unknown;
    error?: unknown;
  };
  const models = Array.isArray(data.models)
    ? data.models.filter(
        (model): model is ColorizationModelOption =>
          model !== null &&
          typeof model === "object" &&
          typeof (model as { id?: unknown }).id === "string" &&
          typeof (model as { label?: unknown }).label === "string"
      )
    : [];
  if (!response.ok) {
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : response.status === 401
          ? "Sign in again to load available image models."
          : "Available image models could not be loaded."
    );
  }
  const cutoutProAvailable = data.cutoutProAvailable === true;
  if (!models.length && !cutoutProAvailable) {
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : typeof data.modelError === "string"
          ? data.modelError
          : "No image models are currently available."
    );
  }
  const defaultModelId =
    typeof data.defaultModelId === "string" &&
    models.some(model => model.id === data.defaultModelId)
      ? data.defaultModelId
      : (models[0]?.id ?? "");
  return {
    models,
    defaultModelId,
    cutoutProAvailable,
    modelError:
      typeof data.modelError === "string" ? data.modelError : undefined,
  };
}

export async function colorizePhoto(
  file: Blob,
  fileName: string,
  style: ColorStyle,
  batchId?: string,
  modelId?: string,
  provider: ColorizationProvider = "reimagine"
): Promise<SavedPhoto> {
  const response = await fetch("/api/photos/colorize", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": file.type,
      "X-Reimagine-Request": "1",
      "X-Color-Style": style,
      "X-Photo-Provider": provider,
      "X-Photo-Name": encodeURIComponent(fileName),
      ...(batchId ? { "X-Photo-Batch": batchId } : {}),
      ...(provider === "reimagine" && modelId
        ? { "X-Image-Model": modelId }
        : {}),
    },
    body: file,
  });
  const data = (await response.json().catch(() => ({}))) as {
    photo?: SavedPhoto;
    error?: string;
  };
  if (!response.ok || !data.photo) {
    throw new Error(
      data.error ||
        (response.status === 401
          ? "Sign in again to colorize this photo."
          : "This photo could not be colorized. Please try again.")
    );
  }
  return data.photo;
}

export async function fetchPrivatePhoto(
  photoId: string,
  variant: "original" | "colorized"
): Promise<Blob> {
  const response = await fetch(
    `/api/library/${encodeURIComponent(photoId)}/media?variant=${variant}`,
    { credentials: "include", cache: "no-store" }
  );
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(
      data.error || "This photo is not available in your history."
    );
  }
  return response.blob();
}
