# ChromaLab — approved implementation plan

## Product scope

A clean, creative, understandable web interface for a deep-learning project that restores old black-and-white photos with color. The approved workflow includes drag-and-drop/file-picker upload, an image preview with validation and replace/remove controls, a prominent colorization action with progress and status feedback, an interactive before/after comparison slider, a side-by-side view, a download action, responsive/accessibility support, and clear empty/loading/success/error states. The confirmed power-up adds validated image upload and project file storage for source uploads and generated results. Since this prototype has no sign-in or per-user ownership, show a privacy disclosure beside the upload controls.

The user-upload path uses the project's built-in ImageService to colorize the selected black-and-white photograph instead of simulating color with a CSS/sepia filter. Resolve available models from `ListModels` and use the currently available GPT Image 2 enum for image editing; do not silently fall back to a decorative filter if model inference fails. Prompt for distinct, vivid but plausible scene colors, while preserving each person's existing complexion and undertones, identity, and facial detail; never claim that skin-tone estimates are guaranteed. Tell users that the model estimates color, recommend checking skin tones, and keep the original unchanged. The homepage family example is now a genuine sample pair: its bundled grayscale original and bundled model-colorized output use the same model flow as uploaded photos and work from a fresh repository clone. The sample demonstrates the model but does not establish historical color truth. Downloads export the actual model result.

## Implementation approach

- Build on the initialized React 19 + TypeScript + Vite client and starter Express server; no database or user-account system is required for this interface.
- Implement the Studio screen as focused React components and local state: upload/validation, image preview, colorization progress/status, comparison modes, and download. Use native file input and keyboard-accessible controls, responsive layout, and reduced-motion-aware transitions.
- The same-origin server validates JPEG/PNG/WebP MIME and file signatures and enforces the 15 MB request ceiling. It stores the original under a collision-resistant project-storage key, then—only after the user selects colorize—sends the supplied bytes to ImageService using server-only platform credentials. Confirm GPT Image 2 is available from `ListModels` before invoking it; validate the returned image and store the model result under a distinct randomized key before displaying/downloading it. Keep the API credential and presigned object URLs on the server; return the image bytes only to the initiating browser and the stable storage path in a response header. No project database or user-account system means the app will not claim per-user ownership, asset listing, or deletion/retention controls.
- Keep the API endpoint and UI in one origin. Enable the confirmed Server capability with the database off, and use the starter's server-backed development command on its configured port.
- Serve `/manus-routes.json` with the single `/` page route before starting the server.
- The bundled archival comparison example uses a generated family image whose grayscale original and AI-colorized result are checked into `client/public/images/`; it demonstrates the same model flow without relying on project-only sample storage paths or implying that inferred colors are historically verified. For user photos, send the original bytes to the available model-editing service, request vibrant but natural colors and careful individual skin-tone preservation, store the returned image, and display that actual model result in the comparison.

## Project structure

- `client/src/pages/Home.tsx` — colorizer studio screen and user workflow.
- `client/src/components/` — reusable focused upload, comparison, and status components as useful.
- `client/src/index.css` — visual system, page layout, responsive behavior, and motion preferences.
- `client/public/` — favicon, route metadata, and the checked-in synthetic demo pair.
- `client/public/images/demo-before.jpg` and `client/public/images/demo-after.jpg` — portable grayscale sample input and model-generated comparison result.
- `server/photoUpload.ts` — validated upload, image-model call, and original/result storage endpoints registered from `server/_core/index.ts`.
- `server/photoUpload.test.ts` — request validation, selected-model, complexion-prompt, and stored-result behavior.
- `server/demoAssets.test.ts` — ensure the source-bundled comparison pair stays present and portable.
- `public/manus-routes.json` at the Vite public root (`client/public/manus-routes.json`) — route manifest for `/`.
- `plan.md` and `TODO.md` — approved direction and independently deliverable outcomes.

## Design direction

- **Design Movement**: Contemporary archival editorial — a restoration lab with the tactility of a well-kept photo album and the precision of a modern creative tool.
- **Core Principles**: Warm, human visual tone; explain every action plainly; make the photograph the hero; celebrate color without sacrificing legibility.
- **Color Philosophy**: Soft paper and ink provide a calm archival base. A distinctive persimmon-coral calls attention to the primary action; restrained teal and saffron mark the color-recovery story. Contrast remains WCAG-minded.
- **Layout Paradigm**: An asymmetrical editorial workbench: a broad image-comparison canvas paired with a narrower step/status rail, collapsing into a simple stacked flow on small screens rather than a centered dashboard grid.
- **Signature Elements**: A finely ruled comparison seam with a color-dot handle; a tiny spectral arc around the restoration mark; pill-shaped “Original” and “Colorized” image labels.
- **Interaction Philosophy**: Gentle, direct manipulation. Drop or choose a photo, see it immediately, start processing explicitly, scrub the comparison, and download only when a result is ready. State that the model infers color and ask users to review skin tones honestly.
- **Animation**: Short 160–220ms fades/slides for small state transitions; a smooth progress fill for processing; no perpetual movement; disable or reduce transitions when `prefers-reduced-motion` is set.
- **Typography System**: Fraunces for expressive editorial display headings and DM Sans for labels, controls, and supporting copy; compact uppercase kickers, readable body size, clear numerical/status labels.
- **Brand Essence**: A small creative restoration studio for people bringing family and archival photographs back to life; **thoughtful, luminous, reassuring**.
- **Brand Voice**: Warm and plainspoken; guide rather than oversell. Example lines: “A little color, a lot of history.” and “Your original stays untouched.”
- **Wordmark & Logo**: “ChromaLab” wordmark paired with a custom aperture/half-tone mark: one split circular lens whose monochrome half opens into three color rays.
- **Signature Brand Color**: Persimmon coral (`#E66D50`), a warm restoration cue distinct from generic AI blue/purple.

## Dependencies and constraints

Use existing React, lucide-react, Tailwind/Vite and Express dependencies plus the project's built-in ImageService; no extra provider API key is required. Never expose model/storage credentials or signed URLs to the browser. Upload size, MIME, and image-signature validation are server-enforced. The confirmed one-way server capability is enabled; the database remains off. Preview runs on the already configured project port. Publishing is not included in the user request.
