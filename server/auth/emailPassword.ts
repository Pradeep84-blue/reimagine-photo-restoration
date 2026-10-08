import { randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { CookieOptions, Request, Response } from "express";
import { passwordCredentials, users, type User } from "../../drizzle/schema";
import { COOKIE_NAME } from "../../shared/const";
import * as dbAccess from "../db";
import { getSessionCookieOptions } from "../_core/cookies";
import { sdk } from "../_core/sdk";

const PASSWORD_BYTES = 64;
const PASSWORD_COST = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const attempts = new Map<string, { count: number; resetAt: number }>();

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function consumeLimit(key: string, maximum: number, windowMs: number) {
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    if (attempts.size > 4_000) {
      for (const [entry, value] of attempts) {
        if (value.resetAt <= now) attempts.delete(entry);
      }
    }
    return true;
  }
  if (current.count >= maximum) return false;
  current.count += 1;
  return true;
}

function passwordLimits(password: string) {
  if (password.length < 12 || password.length > 128) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Choose a password between 12 and 128 characters.",
    });
  }
}

async function derivePassword(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, PASSWORD_BYTES, PASSWORD_COST, (error, derived) => {
      if (error) reject(error);
      else resolve(derived);
    });
  });
}

export async function hashPassword(password: string) {
  passwordLimits(password);
  const salt = randomBytes(16);
  const hash = await derivePassword(password, salt);
  return { salt: salt.toString("hex"), passwordHash: hash.toString("hex") };
}

export async function verifyPassword(
  password: string,
  saltHex: string,
  hashHex: string
) {
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  if (salt.length !== 16 || expected.length !== PASSWORD_BYTES) return false;
  const actual = await derivePassword(password, salt);
  return timingSafeEqual(actual, expected);
}

function userForClient(user: User) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  };
}

async function setSessionCookie(req: Request, res: Response, user: User) {
  const token = await sdk.createSessionToken(user.openId, {
    name: user.name ?? user.email ?? "",
    expiresInMs: SESSION_MS,
    sessionVersion: user.sessionVersion,
  });
  const options: CookieOptions = {
    ...getSessionCookieOptions(req),
    maxAge: SESSION_MS,
  };
  res.cookie(COOKIE_NAME, token, options);
}

export function clearSessionCookie(req: Request, res: Response) {
  res.clearCookie(COOKIE_NAME, getSessionCookieOptions(req));
}

export async function createEmailAccount(
  req: Request,
  res: Response,
  rawEmail: string,
  password: string
) {
  const email = normalizeEmail(rawEmail);
  const ip = req.ip || "unknown";
  if (!consumeLimit(`register:${ip}`, 6, 60 * 60 * 1000)) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Too many account attempts. Please try again later.",
    });
  }
  passwordLimits(password);
  const database = await dbAccess.getDb();
  if (!database)
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "Accounts are temporarily unavailable.",
    });
  const { salt, passwordHash } = await hashPassword(password);
  const openId = `reimagine_${randomUUID()}`;

  let user: User;
  try {
    user = await database.transaction(async tx => {
      const created = await tx
        .insert(users)
        .values({
          openId,
          email,
          name: null,
          loginMethod: "email",
          role: "user",
        })
        .$returningId();
      const id = created[0]?.id;
      if (!id) throw new Error("Account insert returned no id");
      await tx
        .insert(passwordCredentials)
        .values({ userId: id, salt, passwordHash });
      const rows = await tx
        .select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);
      if (!rows[0]) throw new Error("New account could not be read");
      return rows[0];
    });
  } catch (error) {
    if (isDuplicateKey(error)) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "An account could not be created with those details.",
      });
    }
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "Account creation is temporarily unavailable.",
    });
  }
  await setSessionCookie(req, res, user);
  return userForClient(user);
}

export async function signInWithPassword(
  req: Request,
  res: Response,
  rawEmail: string,
  password: string
) {
  const email = normalizeEmail(rawEmail);
  const ip = req.ip || "unknown";
  if (
    !consumeLimit(`login-ip:${ip}`, 60, 15 * 60 * 1000) ||
    !consumeLimit(`login:${ip}:${email}`, 10, 15 * 60 * 1000)
  ) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Too many attempts. Please wait and try again.",
    });
  }
  const database = await dbAccess.getDb();
  if (!database)
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "Accounts are temporarily unavailable.",
    });
  const rows = await database
    .select({ user: users, credential: passwordCredentials })
    .from(users)
    .innerJoin(passwordCredentials, eq(passwordCredentials.userId, users.id))
    .where(eq(users.email, email))
    .limit(1);
  const match = rows[0];
  const valid = match
    ? await verifyPassword(
        password,
        match.credential.salt,
        match.credential.passwordHash
      )
    : false;
  if (!match || !valid) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Email or password is incorrect.",
    });
  }
  const signedInAt = new Date();
  await database
    .update(users)
    .set({ lastSignedIn: signedInAt })
    .where(eq(users.id, match.user.id));
  const user = { ...match.user, lastSignedIn: signedInAt };
  await setSessionCookie(req, res, user);
  return userForClient(user);
}

export async function changePassword(
  req: Request,
  res: Response,
  user: User,
  currentPassword: string,
  newPassword: string
) {
  if (!consumeLimit(`password:${user.id}`, 5, 60 * 60 * 1000)) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Too many changes. Please try again later.",
    });
  }
  const database = await dbAccess.getDb();
  if (!database)
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "Accounts are temporarily unavailable.",
    });
  const rows = await database
    .select()
    .from(passwordCredentials)
    .where(eq(passwordCredentials.userId, user.id))
    .limit(1);
  const credential = rows[0];
  if (
    !credential ||
    !(await verifyPassword(
      currentPassword,
      credential.salt,
      credential.passwordHash
    ))
  ) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Current password is incorrect.",
    });
  }
  passwordLimits(newPassword);
  if (currentPassword === newPassword) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Choose a different password.",
    });
  }
  const replacement = await hashPassword(newPassword);
  await database.transaction(async tx => {
    await tx
      .update(passwordCredentials)
      .set({ ...replacement, updatedAt: new Date() })
      .where(eq(passwordCredentials.userId, user.id));
    await tx
      .update(users)
      .set({ sessionVersion: user.sessionVersion + 1, updatedAt: new Date() })
      .where(eq(users.id, user.id));
  });
  const updated = { ...user, sessionVersion: user.sessionVersion + 1 };
  await setSessionCookie(req, res, updated);
  return { success: true as const };
}

function isDuplicateKey(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ER_DUP_ENTRY"
  );
}
