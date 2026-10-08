export const COOKIE_NAME = "reimagine_session";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = "Please sign in to continue";
export const NOT_ADMIN_ERR_MSG = "You do not have required permission";

// Kept solely so the unused legacy OAuth modules continue to typecheck; those
// routes are not registered and the Reimagine UI only offers email/password.
export const OAUTH_STATE_COOKIE = "__Host-oauth_state";
export type OAuthState = { redirectUri: string; nonce?: string };
export const encodeOAuthState = (state: OAuthState): string =>
  btoa(JSON.stringify(state));
export const decodeOAuthState = (state: string): OAuthState => {
  let decoded: string;
  try {
    decoded = atob(state);
  } catch {
    return { redirectUri: "" };
  }
  try {
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed.redirectUri === "string") return parsed;
  } catch {
    // Fall through to the legacy bare redirect state.
  }
  return { redirectUri: decoded };
};
