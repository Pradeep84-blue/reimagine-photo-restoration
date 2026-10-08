type ErrorRecord = Record<string, unknown>;

function asRecord(value: unknown): ErrorRecord | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as ErrorRecord;
}

function getIssues(payload: unknown): unknown[] | undefined {
  if (Array.isArray(payload)) return payload;

  const record = asRecord(payload);
  return Array.isArray(record?.issues) ? record.issues : undefined;
}

function hasPasswordIssue(
  issues: ErrorRecord[],
  code: string
): ErrorRecord | undefined {
  return issues.find(issue => {
    const path = issue.path;
    return (
      issue.code === code &&
      Array.isArray(path) &&
      path.some(segment => segment === "password")
    );
  });
}

export function formatAuthValidationError(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";

  if (!message) return "Please check your details and try again.";

  let payload: unknown;
  try {
    payload = JSON.parse(message);
  } catch {
    return message;
  }

  const rawIssues = getIssues(payload);
  if (!rawIssues) return message;

  const issues = rawIssues
    .map(asRecord)
    .filter((issue): issue is ErrorRecord => issue !== undefined);
  const shortPassword = hasPasswordIssue(issues, "too_small");
  if (shortPassword) {
    const minimum =
      typeof shortPassword.minimum === "number" ? shortPassword.minimum : 12;
    return `Password must be at least ${minimum} characters.`;
  }

  const longPassword = hasPasswordIssue(issues, "too_big");
  if (longPassword) {
    const maximum =
      typeof longPassword.maximum === "number" ? longPassword.maximum : 128;
    return `Password must be ${maximum} characters or fewer.`;
  }

  return "Please check your email and password, then try again.";
}
