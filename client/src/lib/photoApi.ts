export type ColorStyle = "natural" | "vivid";
export type SavedPhoto = {
  id: string;
  title: string;
  fileName: string;
  style: ColorStyle;
  favorite: boolean;
  createdAt: string | Date;
  batchId: string | null;
};

export async function colorizePhoto(
  file: Blob,
  fileName: string,
  style: ColorStyle,
  batchId?: string
): Promise<SavedPhoto> {
  const response = await fetch("/api/photos/colorize", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": file.type,
      "X-Reimagine-Request": "1",
      "X-Color-Style": style,
      "X-Photo-Name": encodeURIComponent(fileName),
      ...(batchId ? { "X-Photo-Batch": batchId } : {}),
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
