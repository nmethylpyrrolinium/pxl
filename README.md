# Alam’s Dump

**A browser-based photo lab for restoring digital keepsakes and giving them a distinct, artifact-rich finish.**

Alam’s Dump combines practical photo cleanup with deliberate digital damage. Visitors can crop, reduce noise, sharpen, color-grade, add motion artifacts, apply a timeline stamp, and export an edited JPEG without sending the source image to a server.

## First look

The interface opens on a living public photo wall, then leads into the editor and its before/after canvas. The visual identity is dark, technical, and intentionally tactile rather than a conventional filter-app layout.

> A repository preview image has not been committed yet. Add an optimized screenshot at `assets/previews/editor.webp`, then reference it here.

## What it does

- Processes source photos locally in the browser with the Canvas API.
- Provides crop, noise cancellation, sharpening, tone, color, grain, dither, optical artifact, and timestamp controls.
- Includes four creative modes: classic detail, RGB glitch, pixel dispersion, and neon noir.
- Exports individual JPEGs and deterministic four-treatment contact sheets.
- Lets guests explicitly submit a processed image to a moderated public wall.
- Provides a hash-routed moderation view for authorized administrators.

Source photos remain local unless a visitor chooses **Approve & hang**. Public-wall submissions use a Supabase-backed guest submission and moderation flow.

## Tech stack

- HTML5 and CSS
- Vanilla JavaScript
- Canvas API
- Supabase browser client for the public wall and moderation flow
- Node.js for repository tests

No frontend build step or framework is required.

## Repository structure

```text
.
├── index.html                  # Static deployment entry point
├── app.js                      # Editor, wall, and moderation behavior
├── styles.css                  # Complete visual system and responsive layout
├── tests/
│   ├── admin-moderation-wiring.test.js
│   └── photon-signature.test.js
├── .gitignore
├── package.json
├── README.md
└── SECURITY.md
```

The flat application layout is intentional: it keeps static hosting paths stable and avoids adding a build system to a small browser-native project.

## Run locally

Requirements: Node.js and Python 3.

```bash
git clone <repository-url>
cd alam-s-dump
npm run serve
```

Open <http://localhost:4173>. Running a local server is recommended because browser security rules can limit features when opening `index.html` directly.

## Test

```bash
npm test
```

The test suite checks JavaScript syntax, deterministic image-processing behavior, supported image handling, public-wall wiring, and moderation authentication contracts.

## Configuration and security

The current static client contains a Supabase project URL and a **publishable/anonymous client key**. These values are designed to be visible in browser applications and must only be used with correctly configured Row Level Security, storage policies, and server-side moderation checks.

- Never place a Supabase service-role key, admin password, private token, or other privileged credential in this repository.
- Keep local secrets in an ignored `.env` file if a future server-side component needs them.
- Treat all browser input as untrusted and preserve the server-side moderation gate for wall submissions.
- Rotate any privileged credential immediately if it is ever committed, even after deleting it from the latest revision.

See [SECURITY.md](SECURITY.md) for responsible disclosure and maintainer guidance.

## Deployment

This is a static site. Deploy the repository root so that `index.html`, `styles.css`, and `app.js` remain at the same public path.

For GitHub Pages:

1. Push the intended release branch.
2. In **Settings → Pages**, choose **Deploy from a branch**.
3. Select the branch and the repository root (`/`).
4. Confirm the configured Supabase Auth URLs, CORS rules, database policies, storage policies, and Edge Function behavior for the deployed origin.

The same root-directory setup works with static hosts such as Netlify or Vercel. No deployment configuration file is required by the repository.

## Roadmap

- Add an optimized repository preview image.
- Add browser-level smoke tests for the upload, edit, export, and consent flows.
- Document the public-wall backend schema and deployment procedure without exposing privileged configuration.

## Repository metadata

**Suggested About description:** Browser photo lab for restoring digital keepsakes and creating artifact-rich edits.

**Suggested topics:** `canvas`, `css`, `frontend`, `html`, `javascript`, `photo-editor`, `supabase`, `web-design`

## Credits

Designed and maintained as **Alam’s Dump**. The interface uses IBM Plex Mono, Inter, and Share Tech Mono through Google Fonts.
