# Alam’s Dump

A private-feeling browser photo lab for restoring and styling digital keepsakes. The app uses Canvas pixel processing, low-resolution resampling, tone curves, color remapping, luma/RGB grain, ordered dither, bloom, adjustable noise cancellation, controllable sharpening, JPEG export, and a customizable timeline stamp.

## Highlights

- Separate photo-library and camera inputs, plus drag and drop.
- Crop ratios with adjustable crop position.
- Handheld shake, subject ghosting, and light trails while keeping the studio focused on single-photo treatments.
- An Alam’s Dump timeline stamp by default, with name and date customization tucked behind the Timeline option.
- Sharpness and noise-cancellation controls for cleaner restoration-focused edits.
- Explicit consent before an edited image is added to the session-only hanging photo wall.
- Local processing, JPEG download/share, recipes, remixable damage, and contact sheets.
- Four single-photo modes: classic detail, RGB glitch, pixel dispersion, and neon noir.

## Supabase wall: next steps

You already created a Supabase project. The interface now previews the complete signed-in Wall flow locally; connect it to Supabase next:

1. Enable Supabase Auth with email magic links or one-time passwords.
2. Create `profiles`, `wall_photos`, `wall_reactions`, `wall_comments`, and `wall_likes` tables, plus a Storage bucket for approved image files.
3. Add row-level security so anyone can read approved Wall entries, while feature, reaction, comment, like, and share records require `auth.uid()` and an existing profile.
4. Require moderation approval on `wall_photos` before an uploaded photograph becomes public.
5. Replace the local session profile and in-memory Wall actions in `app.js` with Supabase Auth, Storage uploads, and table reads/writes.

## Run locally

```bash
npm run serve
```

Then open <http://localhost:4173>.

## Test

```bash
npm test
```

The page also includes a browser-side before/after comparison panel that scores the rendered output against the intended reference signature: black crush, cyan shadows, blue/red separation, saturation, high-frequency sensor detail, and timestamp coverage. Mobile users can explicitly choose between their photo library and camera, while desktop users can drag and drop. Everyone can remix deterministic grain, share supported output files, apply four advanced recipes, and generate a deterministic 2×2 contact sheet.
