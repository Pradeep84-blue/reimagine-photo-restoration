# Reimagine

A responsive photo-restoration studio for bringing black-and-white photographs back into color. Reimagine combines a full-frame comparison workbench, account-owned history, and server-side AI colorization.

## Features

- Open email/password registration; no email verification or email-based password recovery. Passwords can be changed from Account after confirming the current password. If a user loses their password, account recovery is unavailable.
- Passwords are salted and hashed with Node.js `scrypt`; login attempts and password changes are throttled. Reimagine sessions use an app-specific, protected signing secret and secure, HttpOnly cookies.
- Private per-account photo history with search, sorting, favorites, renaming, alternate Natural/Vivid color passes, before/after review, downloads, and history-only removal.
- Single-photo colorization or sequential batches of up to five JPEG, PNG, or WebP files (15 MB maximum per photo), with per-file progress and retry for failed items.
- Server-side MIME, byte-limit, and image-signature validation. Originals are retained separately from generated results and are never overwritten.
- Live image-model selection from the available server catalog, with GPT Image 2 preferred when present. The selected model applies to single photos, batches, retries, and new history color passes. Prompts prioritize scene-appropriate color and preserving each person's complexion, undertone, variation, and skin texture; generated colors remain estimates.
- Manual Cutout.Pro backup for the configured owner/test account only. The existing ImageService remains the default; Cutout.Pro is contacted only after explicit provider selection and never as an automatic fallback. Its API key stays server-side, and its standard pass is carried through single-photo, batch, and retry requests.
- Private image reads go through authenticated same-origin routes. Stable object paths and temporary signed storage URLs are not returned to browser code.
- Full-frame comparison, responsive layout, keyboard-accessible controls, and bundled synthetic demo images.

Removing a photo from history hides its database record from the account library; project storage has no runtime delete operation, so stored bytes remain. The confirmation states this limitation.

## Run locally

Requirements: Node.js 22+ and pnpm 10.18.0 (declared in `package.json`).

```bash
pnpm install
cp .env.example .env
# Fill the server-only values through an authorized local secrets setup.
pnpm db:migrate
pnpm dev
```

The server listens on `PORT` (default `3000`). Database-backed accounts require `DATABASE_URL`; login sessions require `PROJECT_ID` and the dedicated `REIMAGINE_SESSION_SECRET`. Colorization and private storage reads require `API_URL` and `API_KEY`. The optional owner-only backup requires `CUTOUT_PRO_API_KEY` and `CUTOUT_PRO_ALLOWED_EMAIL`, configured on the server only. Never commit `.env` or expose these values to browser code.

## Useful commands

```bash
pnpm check       # TypeScript
pnpm test        # Vitest
pnpm build       # Vite client and Express server bundle
pnpm start       # Serve the built app (honors PORT)
pnpm exec prettier --check <files...>
```

For an intentional schema change, update `drizzle/schema.ts`, generate a migration with `pnpm db:push`, and commit the resulting SQL and Drizzle metadata.

## Colorization and data flow

The browser sends a selected image's bytes to `POST /api/photos/colorize` only after the signed-in user requests a color pass and chooses a provider. The server checks the Reimagine session, validates the request and image bytes, and calls either the ImageService with the selected current model or the manual Cutout.Pro adapter for the allowlisted account. A primary-provider failure never triggers an automatic Cutout.Pro request. The server validates the generated result, uploads the original and result to separate random object keys, and saves an owner-linked history row. Batch work uses the same selected provider/model sequentially, with one history record per successful photo.

The history API filters by the authenticated account. To display or download a stored image, the server checks ownership, obtains a short-lived storage URL server-side, and streams the bytes with private/no-store headers. The browser receives image bytes and a photo identifier, not an object key or signed storage URL. Failed colorization does not create a successful history row.

## Project structure

- `client/src/pages/Home.tsx` — signed-in restoration workbench and single-photo workflow.
- `client/src/pages/Login.tsx` — email/password sign-in and open registration.
- `client/src/pages/Library.tsx` — private history tools and downloads.
- `client/src/pages/Account.tsx` — current-password-confirmed password change and recovery limitation.
- `client/src/components/BatchColorizer.tsx` — five-photo sequential queue with per-item statuses and retry.
- `client/src/components/PhotoComparison.tsx` — full-frame slider and side-by-side comparison.
- `client/src/lib/photoApi.ts` — same-origin authenticated upload and private-media helpers.
- `client/public/routes.json` — the page-route manifest; `client/public/images/` contains clone-ready synthetic demo photos.
- `server/auth/emailPassword.ts` — email normalization, password hashing, account creation, login, throttling, and password change.
- `server/library.ts` — owner-filtered history queries and metadata/soft-removal actions.
- `server/photoUpload.ts` — upload validation, live model/provider catalog, owner-only Cutout.Pro adapter, and owner-scoped storage writes.
- `server/privateMedia.ts` — authenticated, owner-checked media streaming.
- `server/_core/` — application sessions, cookie settings, platform environment, Express and tRPC setup.
- `drizzle/schema.ts` and `drizzle/` — managed MySQL schema and committed additive migrations.

## License

The repository declares the MIT License; see [`LICENSE`](LICENSE).
