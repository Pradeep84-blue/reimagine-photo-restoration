# ChromaLab

A responsive photo-restoration studio for colorizing black-and-white photographs. ChromaLab pairs an editorial workbench with a server-side image-model workflow, an interactive before/after comparison, and PNG export.

## Features

- Drag-and-drop or file-picker uploads for JPEG, PNG, and WebP, limited to 15 MB.
- Server-side MIME, byte-limit, and image-signature validation.
- AI-assisted colorization via the project’s built-in ImageService and the currently available GPT Image 2 model.
- A detailed edit prompt asks for vivid, scene-appropriate color while preserving facial identity and each person’s complexion, undertone, skin variation, and texture.
- Original and model-generated result are saved as separate, collision-resistant project-storage assets. The original is never overwritten.
- Interactive comparison slider, side-by-side view, processing feedback, errors/retry, and PNG download.
- Responsive layout and keyboard-accessible comparison controls.
- Bundled synthetic before/after sample images, so a fresh GitHub clone renders the demonstration without project-only storage objects.

## Run locally

Requirements: Node.js 22+ and pnpm 10.18.0 (the version is declared in `package.json`).

```bash
pnpm install
cp .env.example .env
pnpm dev
```

The server listens on `PORT` (defaults to `3000`). The browser UI loads without local service credentials, but upload and inference require the project-provided `MANUS_API_URL` and `MANUS_API_KEY` on the **server runtime**. In Manus Webdev, these are supplied by the managed project environment. If running outside that environment, populate the ignored `.env` with credentials obtained through an authorized configuration flow; never commit them or embed them in client code.

## Useful commands

```bash
pnpm check       # TypeScript
pnpm test        # Vitest
pnpm build       # Vite client and Express server bundle
pnpm start       # Serve the built app (honors PORT)
pnpm exec prettier --check <files...>
```

## Colorization flow

The client sends the selected image’s bytes to `POST /api/photos/colorize` only when the user starts colorization. The Express handler validates the bytes, checks the current ImageService model catalog, selects GPT Image 2 only when it is available, and requests the result. It validates the returned image, stores it in project storage, then streams the generated image back to the initiating browser with its stable storage address in `X-Photo-Asset-Url`. The `MANUS_API_KEY` is used only in server-to-service Authorization headers and never appears in browser source or the image prompt; temporary signed transfer URLs stay server-side. Model and storage failures are returned as actionable errors; there is no fake filter fallback.

The UI explicitly describes AI output as a **color estimate**. The prompt prioritizes individual skin tone and undertone, but no image model can guarantee historically accurate colors or perfect preservation. Review faces and important details before downloading.

## Project structure

- `client/src/pages/Home.tsx` — studio workflow, state, real colorization request, and PNG download.
- `client/public/images/demo-before.jpg` and `demo-after.jpg` — portable grayscale demo input and AI-colorized sample output.
- `client/src/components/PhotoUploadPanel.tsx` — accessible file picker, drag-and-drop, validation feedback, and upload state.
- `client/src/components/PhotoComparison.tsx` — slider and side-by-side comparisons.
- `client/src/index.css` — responsive design system and motion preferences.
- `server/photoUpload.ts` — photo validation, project-storage transfer, ImageService model selection, inference, and result storage.
- `server/photoUpload.test.ts` — route tests for upload limits, image signatures, model choice, skin-tone prompt, and storage.
- `server/demoAssets.test.ts` — verifies that both clone-ready demo images are present, valid JPEGs, and small.
- `server/_core/index.ts` — Express/Vite server and API route registration.

## Data and privacy notes

Colorization sends the selected photo to the project’s built-in AI image service when the user presses **Colorize photo**. Originals and generated results are stored in project file storage; the storage interface used here does not provide an application database, per-user ownership, user sign-in, an asset browser, or runtime deletion. Object paths use random IDs, but this is **not private per-user storage**. Do not use the current prototype for confidential, highly sensitive, or regulated photographs until account authorization, ownership controls, and a deletion/retention workflow are added.

The upload panel also warns users that project-storage links are not private per user and advises against sensitive photos.

The colorization endpoint also runs on the project’s service identity and currently has no application-level login or request quota. Add authentication, rate limiting, and abuse monitoring before exposing it to a broad public audience.

## License

The repository declares the MIT License; see [`LICENSE`](LICENSE).
