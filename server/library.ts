import { and, asc, desc, eq, isNull, like, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  photoHistory,
  type ColorStyle,
  type PhotoHistory,
} from "../drizzle/schema";
import * as dbAccess from "./db";

export type NewPhotoHistory = {
  id: string;
  userId: number;
  batchId?: string | null;
  fileName: string;
  title: string;
  style: ColorStyle;
  originalPath: string;
  originalMimeType: string;
  resultPath: string;
  resultMimeType: string;
};

export async function createPhotoHistory(record: NewPhotoHistory) {
  const database = await dbAccess.getDb();
  if (!database) throw new Error("Database is unavailable");
  await database.insert(photoHistory).values(record);
  const rows = await database
    .select({
      id: photoHistory.id,
      title: photoHistory.title,
      fileName: photoHistory.fileName,
      style: photoHistory.style,
      favorite: photoHistory.favorite,
      createdAt: photoHistory.createdAt,
      batchId: photoHistory.batchId,
    })
    .from(photoHistory)
    .where(
      and(
        eq(photoHistory.id, record.id),
        eq(photoHistory.userId, record.userId)
      )
    )
    .limit(1);
  if (!rows[0]) throw new Error("Saved photo could not be read");
  return rows[0];
}

export async function listPhotoHistory(
  userId: number,
  options: {
    search?: string;
    sort?: "newest" | "oldest";
    favoritesOnly?: boolean;
  }
) {
  const database = await dbAccess.getDb();
  if (!database)
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "Photo history is temporarily unavailable.",
    });
  const conditions = [
    eq(photoHistory.userId, userId),
    isNull(photoHistory.removedAt),
  ];
  const search = options.search?.trim().slice(0, 100);
  if (search) {
    conditions.push(
      or(
        like(photoHistory.title, `%${search}%`),
        like(photoHistory.fileName, `%${search}%`)
      )!
    );
  }
  if (options.favoritesOnly) conditions.push(eq(photoHistory.favorite, true));
  return database
    .select({
      id: photoHistory.id,
      title: photoHistory.title,
      fileName: photoHistory.fileName,
      style: photoHistory.style,
      favorite: photoHistory.favorite,
      createdAt: photoHistory.createdAt,
      batchId: photoHistory.batchId,
      originalMimeType: photoHistory.originalMimeType,
      resultMimeType: photoHistory.resultMimeType,
    })
    .from(photoHistory)
    .where(and(...conditions))
    .orderBy(
      options.sort === "oldest"
        ? asc(photoHistory.createdAt)
        : desc(photoHistory.createdAt)
    )
    .limit(200);
}

export async function getOwnedPhoto(
  id: string,
  userId: number
): Promise<PhotoHistory | null> {
  const database = await dbAccess.getDb();
  if (!database)
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "Photo history is temporarily unavailable.",
    });
  const rows = await database
    .select()
    .from(photoHistory)
    .where(
      and(
        eq(photoHistory.id, id),
        eq(photoHistory.userId, userId),
        isNull(photoHistory.removedAt)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function renamePhoto(userId: number, id: string, title: string) {
  const database = await dbAccess.getDb();
  if (!database)
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "Photo history is temporarily unavailable.",
    });
  const safeTitle = title.trim().slice(0, 160);
  if (!safeTitle)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Enter a photo name.",
    });
  const owned = await getOwnedPhoto(id, userId);
  if (!owned)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "This photo is not in your history.",
    });
  await database
    .update(photoHistory)
    .set({ title: safeTitle, updatedAt: new Date() })
    .where(
      and(
        eq(photoHistory.id, id),
        eq(photoHistory.userId, userId),
        isNull(photoHistory.removedAt)
      )
    );
  return { id, title: safeTitle };
}

export async function setPhotoFavorite(
  userId: number,
  id: string,
  favorite: boolean
) {
  const database = await dbAccess.getDb();
  if (!database)
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "Photo history is temporarily unavailable.",
    });
  const owned = await getOwnedPhoto(id, userId);
  if (!owned)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "This photo is not in your history.",
    });
  await database
    .update(photoHistory)
    .set({ favorite, updatedAt: new Date() })
    .where(
      and(
        eq(photoHistory.id, id),
        eq(photoHistory.userId, userId),
        isNull(photoHistory.removedAt)
      )
    );
  return { id, favorite };
}

export async function softRemovePhoto(userId: number, id: string) {
  const database = await dbAccess.getDb();
  if (!database)
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "Photo history is temporarily unavailable.",
    });
  const owned = await getOwnedPhoto(id, userId);
  if (!owned)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "This photo is not in your history.",
    });
  await database
    .update(photoHistory)
    .set({ removedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(photoHistory.id, id),
        eq(photoHistory.userId, userId),
        isNull(photoHistory.removedAt)
      )
    );
  return { success: true as const };
}
