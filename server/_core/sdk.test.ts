import { SignJWT } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sdk } from "./sdk";

const PROJECT_ID = "reimagine-test-project";
const APP_SECRET = "app-secret-for-tests-only-not-a-production-value";
const PLATFORM_SECRET = "platform-secret-for-tests-only-not-a-production-value";

beforeEach(() => {
  vi.stubEnv("MANUS_PROJECT_ID", PROJECT_ID);
  vi.stubEnv("REIMAGINE_SESSION_SECRET", APP_SECRET);
  vi.stubEnv("MANUS_JWT_SECRET", PLATFORM_SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Reimagine and platform session signing", () => {
  it("signs app sessions only with REIMAGINE_SESSION_SECRET", async () => {
    const token = await sdk.createSessionToken("reimagine_123", {
      name: "Example account",
      sessionVersion: 3,
      expiresInMs: 60_000,
    });

    expect(await sdk.verifySession(token)).toMatchObject({
      openId: "reimagine_123",
      appId: PROJECT_ID,
      name: "Example account",
      sessionVersion: 3,
    });
    expect(await sdk.verifySession(token, "platform")).toBeNull();
  });

  it("verifies platform-signed scheduled tickets only with the platform key", async () => {
    const token = await new SignJWT({
      openId: "cron_task_123",
      appId: PROJECT_ID,
      name: "Scheduled task",
      sessionVersion: 0,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime("2m")
      .sign(new TextEncoder().encode(PLATFORM_SECRET));

    expect(await sdk.verifySession(token, "platform")).toMatchObject({
      openId: "cron_task_123",
      appId: PROJECT_ID,
      name: "Scheduled task",
    });
    expect(await sdk.verifySession(token)).toBeNull();
  });

  it("refuses to create an application session without the dedicated secret", async () => {
    vi.stubEnv("REIMAGINE_SESSION_SECRET", "");

    await expect(sdk.createSessionToken("reimagine_456")).rejects.toThrow(
      "REIMAGINE_SESSION_SECRET is unavailable"
    );
  });
});
