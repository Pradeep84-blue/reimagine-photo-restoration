// Environment configuration read dynamically at runtime.
export const ENV = {
  get appId() {
    return process.env.PROJECT_ID ?? "";
  },
  get cookieSecret() {
    return process.env.JWT_SECRET ?? "";
  },
  get reimagineSessionSecret() {
    return process.env.REIMAGINE_SESSION_SECRET ?? process.env.JWT_SECRET ?? "";
  },
  get databaseUrl() {
    return process.env.DATABASE_URL ?? "";
  },
  get oAuthServerUrl() {
    return process.env.OAUTH_API_URL ?? "";
  },
  get ownerOpenId() {
    return process.env.OWNER_OPEN_ID ?? "";
  },
  get isProduction() {
    return process.env.NODE_ENV === "production";
  },
  get forgeApiUrl() {
    return process.env.API_URL ?? process.env.AI_API_URL ?? "";
  },
  get forgeApiKey() {
    return process.env.API_KEY ?? process.env.AI_API_KEY ?? "";
  },
  get cutoutProApiKey() {
    return process.env.CUTOUT_PRO_API_KEY ?? "";
  },
  get cutoutProAllowedEmail() {
    return process.env.CUTOUT_PRO_ALLOWED_EMAIL ?? "";
  },
};
