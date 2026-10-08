import { describe, expect, it } from "vitest";
import { formatAuthValidationError } from "../client/src/lib/authErrors";

describe("formatAuthValidationError", () => {
  it("turns a short-password Zod issue into a clear sentence", () => {
    const rawIssue = JSON.stringify([
      {
        origin: "string",
        code: "too_small",
        minimum: 12,
        inclusive: true,
        path: ["password"],
        message: "Too small: expected string to have >=12 characters",
      },
    ]);

    expect(formatAuthValidationError(new Error(rawIssue))).toBe(
      "Password must be at least 12 characters."
    );
  });

  it("does not expose raw Zod arrays for other validation failures", () => {
    const rawIssue = JSON.stringify([
      {
        origin: "string",
        code: "invalid_format",
        path: ["email"],
        message: "Invalid email address",
      },
    ]);

    expect(formatAuthValidationError(rawIssue)).toBe(
      "Please check your email and password, then try again."
    );
  });

  it("preserves readable server errors", () => {
    expect(
      formatAuthValidationError(new Error("Invalid email or password."))
    ).toBe("Invalid email or password.");
  });
});
