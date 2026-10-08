# Reimagine — approved implementation plan

## Product scope

Reimagine is a polished restoration studio for turning old black-and-white photographs into color. Keep the existing upload and full-frame comparison workbench, true AI colorization, download workflow and synthetic example. Add open email/password accounts, a private per-account photo library, and batch colorizing. The user has expressly skipped Google OAuth.

The user explicitly chose the less-secure account option: allow open email/password registration **without email verification or email-based password recovery**. No Resend or Google credentials are needed or should be requested. Each normalized email maps to one account. Provide an authenticated password-change action that requires the current password; clearly and briefly state that recovery is not available if a user loses access. Use Reimagine's own account session only, not Manus OAuth or the Preview-injected Manus session.

The private account library includes search, date sorting, favorites, renaming, Natural/Vivid choices for a new color pass, before/after comparison and downloads. A new pass is stored as a separate history item rather than relabeling an existing result. History removal is account-scoped soft removal only because the platform’s runtime storage cannot physically delete bytes; disclose this when confirming removal and in the account/data policy.

Remove the three large warning notices the user identified. Retain just one concise, professional AI disclosure near the colorize action; avoid cautionary paragraphs, inaccurate privacy promises and claims of historically accurate or guaranteed skin color.

Batch processing accepts up to **five** JPEG, PNG or WebP photos per batch, each at or below the existing 15 MB limit. Process jobs sequentially to protect the image service; show progress and a status for every file; continue after an individual failure; allow failed items to be retried. Save each successful original and result in that account's history.

## Implementation approach

- Continue on the initialized React 19, TypeScript, Vite and Express application. Preserve the Reimagine editorial style, synthetic comparison sample, natural-aspect-ratio framing and responsive, accessible studio.
- The user has explicitly approved the one-way managed Database enablement. Keep Server enabled; use managed MySQL and deterministic, additive Drizzle migrations. Do not introduce another database, overwrite existing user data, or change the existing auto-publish-off state.
- Implement application-owned email/password signup, login and logout. Use a database uniqueness constraint on normalized email addresses. Signup creates an ordinary `user` account and session immediately, because email verification was explicitly declined. Do not add Google, Manus or other provider login or identity linking.
- Hash passwords with Node's built-in scrypt, unique random salts and constant-time verification. Rate-limit signup/login/password changes, bound request sizes, protect state-changing requests against CSRF, and never log credentials or session values. Sign Reimagine app sessions only with the dedicated protected `REIMAGINE_SESSION_SECRET`; keep platform-signed scheduled-work tickets on the platform key. The app cookie is HttpOnly, HTTPS-Preview compatible (`SameSite=None; Secure`) and distinct from Manus' injected session cookie; authenticate only Reimagine's cookie.
- Include an Account page that allows a signed-in user to change a password after entering the current password. Do not include email verification, password-reset email or account recovery flows. Include concise, accurate microcopy that account recovery is not available.
- Require a valid Reimagine account session for upload/colorization, batch jobs, history, edits, downloads and image reads. Record each successful job's user ID, original/result storage keys, source filename, selected Natural/Vivid style, creation time, favorite, title and soft-removal state. Filter every read and mutation by the authenticated owner.
- Validate file MIME type and magic bytes server-side, accept only JPEG/PNG/WebP, and enforce 15 MB per file for both single and batch requests. For each job, call the existing image service only after an explicit user action, persist the source and result under separate random storage keys, and add the account-owned history row. Return a photo ID, never an object path.
- Serve private original/result bytes from authenticated same-origin media routes. Each request checks the application session and history ownership, gets a short-lived object-storage download URL server-side and streams the bytes. Do not expose stable project storage addresses or signed download URLs to client code or API responses.
- Add an account library with search, date sort, favorites, rename, Natural/Vivid preset selection, before/after comparison, downloads and owner-only soft removal. Keep the database row hidden after removal while storage bytes remain; do not promise physical erasure.
- Use a client-side batch queue capped at five; process sequentially, show per-item processing/completed/failed status, continue unaffected items and let a user retry failed items. Store every successful result as a separate item in the signed-in user's library.
- Remove the named warning blocks and replace them with one calm AI disclosure adjacent to Colorize. Show the password-recovery limitation only where a user creates or manages credentials; show the soft-removal limitation only at that action.
- Synchronize `client/public/manus-routes.json` to the current page routes `/`, `/login`, `/library` and `/account`. Auth APIs, image APIs and media streams are not page routes.

## Project structure

- `client/src/App.tsx` — routes and auth-aware shell.
- `client/src/pages/Home.tsx` — signed-in colorization workbench.
- `client/src/pages/Login.tsx` — email/password login and open signup.
- `client/src/pages/Library.tsx` — account-owned history search, sort, favorites, rename, presets, compare, download and soft removal.
- `client/src/pages/Account.tsx` — password change with current-password verification and recovery-availability microcopy.
- `client/src/components/BatchColorizer.tsx` — five-file queue, sequential progress, per-photo outcome and retry.
- `client/src/lib/photoApi.ts` — same-origin authenticated photo and media helpers; no stable storage URLs.
- `client/src/index.css` — archival editorial palette, responsive workbench/library and concise notices.
- `client/public/` — favicon/mark, synchronized route manifest and bundled synthetic demo pair.
- `server/auth/emailPassword.ts` — email normalization, scrypt, account creation, login, session-cookie and password-change operations; no verification/reset/provider integration.
- `server/library.ts` — owner-filtered history list and metadata/favorite/soft-removal operations.
- `server/photoUpload.ts` — validated single/batch model processing and account-owned original/result storage.
- `server/privateMedia.ts` — session- and ownership-checked server-side storage reads.
- `server/_core/context.ts`, `server/_core/index.ts`, `server/_core/cookies.ts` and `server/routers.ts` — custom Reimagine auth context, account/API routes, secure cookie and protected procedures.
- `server/db.ts`, `drizzle/schema.ts`, `drizzle/relations.ts` and `drizzle/0001_*.sql` — managed DB helpers, unique account identities, photo-history ownership/metadata and additive migration.
- `README.md`, `plan.md`, `TODO.md` and `.github/workflows/ci.yml` — setup, security tradeoffs, scope and reproducible checks.

## Design direction

- **Design Movement**: Contemporary archival editorial — the tactility of a well-kept photo album paired with a precise restoration tool.
- **Core Principles**: Warm and human, photo-first, plainspoken interactions, clear account boundaries.
- **Color Philosophy**: Soft paper and ink for the archival base; signature persimmon-coral for the action; restrained teal/saffron for restoration states, all with clear contrast.
- **Layout Paradigm**: Asymmetric comparison workbench with a narrow status/control rail and a quiet account library, not a generic dashboard.
- **Signature Elements**: Fine comparison seam with a color-dot handle; a small spectral aperture around the restoration mark; clear Original/Colorized labels.
- **Interaction Philosophy**: Create an account, choose one photo or a batch of up to five, inspect each result and keep successful items in the same account library; retry individual failures without discarding successes.
- **Animation**: 160–220ms transitions and restrained per-item progress; no perpetual movement; honor `prefers-reduced-motion`.
- **Typography System**: Fraunces display headings with DM Sans for controls and body text; compact kickers and readable status hierarchy.
- **Brand Essence**: Reimagine is a thoughtful photo-restoration studio for people bringing archival and family photos back to life; **thoughtful, luminous, reassuring**.
- **Brand Voice**: Warm and plainspoken without promising historical truth. “A little color, a lot of history.” “Your originals and results stay in your library.”
- **Wordmark & Logo**: Reimagine paired with the existing aperture/half-tone restoration mark.
- **Signature Brand Color**: Persimmon coral (`#E66D50`).

## Dependencies and constraints

Use existing React, Express, Drizzle, MySQL, `jose` and Node built-in cryptography/fetch; avoid new runtime packages. Account login requires the protected, application-specific `REIMAGINE_SESSION_SECRET`; never reuse the platform-owned `MANUS_JWT_SECRET` for Reimagine sessions. The managed Database and app-specific secret are enabled through the approved project flows. No Google, Resend, email verification, email-based reset, physical storage deletion or publishing is included; `auto_publish` stays off.
