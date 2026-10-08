import type { Request, Response } from "express";
import type { User } from "../../drizzle/schema";
import { users, passwordCredentials } from "../../drizzle/schema";
import { COOKIE_NAME } from "../../shared/const";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({ getDb: vi.fn().mockResolvedValue(null) }));

import { getDb } from "../db";
import { sdk } from "../_core/sdk";
import {
  changePassword,
  createEmailAccount,
  hashPassword,
  normalizeEmail,
  signInWithPassword,
  verifyPassword,
} from "./emailPassword";

beforeEach(() => {
  vi.stubEnv("MANUS_PROJECT_ID", "reimagine-auth-tests");
  vi.stubEnv(
    "REIMAGINE_SESSION_SECRET",
    "app-session-secret-used-only-by-tests-not-production"
  );
  vi.mocked(getDb).mockResolvedValue(null);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

function createMockAccountDatabase() {
  const now = new Date();
  let userRow = {
    id: 42,
    openId: "reimagine_test_account",
    email: "person@example.com",
    name: null,
    loginMethod: "email",
    role: "user",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
    sessionVersion: 0,
  } as User;
  let credentialRow: {
    userId: number;
    salt: string;
    passwordHash: string;
    createdAt: Date;
    updatedAt: Date;
  } | null = null;

  const tx = {
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        if (table === users) {
          userRow = { ...userRow, ...values } as User;
        } else if (table === passwordCredentials) {
          credentialRow = {
            userId: Number(values.userId),
            salt: String(values.salt),
            passwordHash: String(values.passwordHash),
            createdAt: now,
            updatedAt: now,
          };
        }
        return { $returningId: async () => [{ id: 42 }] };
      },
    }),
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: async () => (table === users ? [userRow] : []),
        }),
      }),
    }),
  };

  const database = {
    transaction: async (callback: (transaction: typeof tx) => unknown) =>
      callback(tx),
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            limit: async () =>
              credentialRow
                ? [{ user: userRow, credential: credentialRow }]
                : [],
          }),
        }),
      }),
    }),
    update: () => ({
      set: (values: Partial<User>) => ({
        where: async () => {
          userRow = { ...userRow, ...values };
        },
      }),
    }),
  };

  return {
    database,
    getUser: () => userRow,
    getCredential: () => credentialRow,
  };
}

describe("Reimagine email/password accounts", () => {
  it("normalizes emails consistently for account identity", () => {
    expect(normalizeEmail("  Person+Family@Example.COM  ")).toBe(
      "person+family@example.com"
    );
  });

  it("stores a salted scrypt hash and verifies only the matching password", async () => {
    const first = await hashPassword("a-long-test-password-1");
    const second = await hashPassword("a-long-test-password-1");

    expect(first.salt).not.toBe(second.salt);
    expect(first.passwordHash).not.toBe(second.passwordHash);
    await expect(
      verifyPassword("a-long-test-password-1", first.salt, first.passwordHash)
    ).resolves.toBe(true);
    await expect(
      verifyPassword("a-different-password", first.salt, first.passwordHash)
    ).resolves.toBe(false);
  });

  it("requires a password of at least 12 characters", async () => {
    await expect(hashPassword("too-short")).rejects.toThrow(
      "Choose a password between 12 and 128 characters."
    );
  });

  it("creates an account without email verification and signs in with its normalized email", async () => {
    const mock = createMockAccountDatabase();
    vi.mocked(getDb).mockResolvedValue(mock.database as never);
    const cookie = vi.fn();
    const req = { ip: "127.0.0.1" } as Request;
    const res = { cookie } as unknown as Response;

    const created = await createEmailAccount(
      req,
      res,
      "  Person@Example.COM ",
      "a-long-test-password-1"
    );

    expect(created).toMatchObject({
      id: 42,
      email: "person@example.com",
      role: "user",
    });
    expect(mock.getUser().loginMethod).toBe("email");
    expect(mock.getCredential()).toMatchObject({ userId: 42 });
    expect(cookie).toHaveBeenCalledWith(
      COOKIE_NAME,
      expect.any(String),
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: "none",
      })
    );
    const registrationToken = cookie.mock.calls[0]?.[1] as string;
    expect(await sdk.verifySession(registrationToken)).toMatchObject({
      openId: mock.getUser().openId,
      sessionVersion: 0,
    });

    cookie.mockClear();
    await expect(
      signInWithPassword(req, res, "PERSON@example.com", "wrong-password-long")
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(cookie).not.toHaveBeenCalled();

    const signedIn = await signInWithPassword(
      req,
      res,
      "PERSON@example.com",
      "a-long-test-password-1"
    );
    expect(signedIn).toMatchObject({ id: 42, email: "person@example.com" });
    expect(cookie).toHaveBeenCalledTimes(1);
    const loginToken = cookie.mock.calls[0]?.[1] as string;
    expect(await sdk.verifySession(loginToken)).toMatchObject({
      openId: mock.getUser().openId,
      sessionVersion: 0,
    });
  });

  it("throttles password changes before querying account credentials", async () => {
    const userId = 100_000 + Math.floor(Math.random() * 1_000_000);
    const user = { id: userId, sessionVersion: 0 } as User;
    const req = { ip: "127.0.0.1" } as Request;
    const res = {} as Response;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(
        changePassword(
          req,
          res,
          user,
          "incorrect-current-password",
          "new-password-for-test"
        )
      ).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    }
    await expect(
      changePassword(
        req,
        res,
        user,
        "incorrect-current-password",
        "new-password-for-test"
      )
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });
});
