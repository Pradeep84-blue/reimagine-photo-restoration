# ChromaLab — approved implementation plan

## Product scope
A clean, creative, understandable web interface for a deep-learning project that restores old black-and-white photos with color. The approved workflow includes drag-and-drop/file-picker upload, an image preview with validation and replace/remove controls, a prominent colorization action with progress and status feedback, an interactive before/after comparison slider, a side-by-side view, a download action, responsive/accessibility support, and clear empty/loading/success/error states. The confirmed power-up adds secure photo file handling: validate image files and store source uploads and generated results via project file storage for workflow access.

This delivery is the UI and its storage-upload path, not a trained or connected colorization model. A bundled archival example can demonstrate the comparison UI. For user uploads, a clearly labeled prototype color-preview state and progress flow will not imply that a real inference model is connected. The UI should identify that model inference is a future integration point; a generated sample or CSS treatment is illustrative only. Download should export the visible preview and remain labeled accordingly.

## Implementation approach
- Build on the initialized React 19 + TypeScript + Vite client and starter Express server; no database or user-account system is required for this interface.
- Implement the Studio screen as focused React components and local state: upload/validation, image preview, colorization progress/status, comparison modes, and download. Use native file input and keyboard-accessible controls, responsive layout, and reduced-motion-aware transitions.
- For secure file transfer, the same-origin server endpoint accepts the actual binary bytes, validates JPEG/PNG/WebP MIME and file signatures, enforces a 15 MB request ceiling, and validates an `original` or `colorized` upload kind before requesting the object-storage presign. The server keeps `MANUS_API_KEY` and the short-lived signed URL private, transfers the bytes to storage, then returns a stable project asset path. Each object gets a collision-resistant key. Store the original and the illustrative prototype preview separately. No project database or user-account system means the app will not claim per-user ownership, asset listing, or deletion/retention controls.
- Keep the API endpoint and UI in one origin. Enable the confirmed Server capability with the database off, and use the starter's server-backed development command on its configured port.
- Serve `/manus-routes.json` with the single `/` page route before starting the server.
- The bundled archival comparison example is a generated color photograph rendered in monochrome on the “Before” side and in natural color on the “After” side; it is explicitly an illustrative example, not model output from the user's uploaded image. User-file previews apply a gentle browser-side color treatment, store that PNG as a separate prototype result, and state plainly that a trained inference endpoint is not connected.

## Project structure
- `client/src/pages/Home.tsx` — colorizer studio screen and user workflow.
- `client/src/components/` — reusable focused upload, comparison, and status components as useful.
- `client/src/index.css` — visual system, page layout, responsive behavior, and motion preferences.
- `client/public/images/` — bundled sample comparison photography and small site artwork.
- `server/_core/index.ts` — starter Express/Vite server; add the scoped upload presign endpoint here or in a small imported route module.
- `public/manus-routes.json` at the Vite public root (`client/public/manus-routes.json`) — route manifest for `/`.
- `plan.md` and `TODO.md` — approved direction and independently deliverable outcomes.

## Design direction
- **Design Movement**: Contemporary archival editorial — a restoration lab with the tactility of a well-kept photo album and the precision of a modern creative tool.
- **Core Principles**: Warm, human visual tone; explain every action plainly; make the photograph the hero; celebrate color without sacrificing legibility.
- **Color Philosophy**: Soft paper and ink provide a calm archival base. A distinctive persimmon-coral calls attention to the primary action; restrained teal and saffron mark the color-recovery story. Contrast remains WCAG-minded.
- **Layout Paradigm**: An asymmetrical editorial workbench: a broad image-comparison canvas paired with a narrower step/status rail, collapsing into a simple stacked flow on small screens rather than a centered dashboard grid.
- **Signature Elements**: A finely ruled comparison seam with a color-dot handle; a tiny spectral arc around the restoration mark; pill-shaped “Original” and “Colorized” image labels.
- **Interaction Philosophy**: Gentle, direct manipulation. Drop or choose a photo, see it immediately, start processing explicitly, scrub the comparison, and download only when a result is ready. Always state prototype/inference status honestly.
- **Animation**: Short 160–220ms fades/slides for small state transitions; a smooth progress fill for processing; no perpetual movement; disable or reduce transitions when `prefers-reduced-motion` is set.
- **Typography System**: Fraunces for expressive editorial display headings and DM Sans for labels, controls, and supporting copy; compact uppercase kickers, readable body size, clear numerical/status labels.
- **Brand Essence**: A small creative restoration studio for people bringing family and archival photographs back to life; **thoughtful, luminous, reassuring**.
- **Brand Voice**: Warm and plainspoken; guide rather than oversell. Example lines: “A little color, a lot of history.” and “Your original stays untouched.”
- **Wordmark & Logo**: “ChromaLab” wordmark paired with a custom aperture/half-tone mark: one split circular lens whose monochrome half opens into three color rays.
- **Signature Brand Color**: Persimmon coral (`#E66D50`), a warm restoration cue distinct from generic AI blue/purple.

## Dependencies and constraints
Use existing React, lucide-react, Tailwind/Vite and Express dependencies. Do not add a colorization library or claim live model inference without an actual model integration. The object-store API credential remains on the server; upload size, MIME and image-signature validation are server-enforced before URL issuance. The confirmed one-way server capability is enabled; the database remains off. Preview runs on the already configured project port. Publishing is not included in the user request.
