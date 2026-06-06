# Alam’s Dump

A rare 3D landing page and browser-based forensic camera aesthetic engine. The app reconstructs the supplied Alam’s Dump look with Canvas pixel processing, low-resolution resampling, tone curves, color remapping, luma/RGB grain, ordered dither, bloom, sharpening, JPEG export, and a timestamp overlay.

## Files

- `index.html` — semantic landing page and lab UI.
- `styles.css` — 3D art direction, responsive layout, typography, and visual polish.
- `app.js` — full client-side photon-processing mechanism plus output signature scoring.
- `tests/photon-signature.test.js` — deterministic Node tests for crop behavior, hue remapping, seeded damage, and reference-signature ranges.
- `package.json` — local scripts for serving and testing.

## Run locally

```bash
npm run serve
```

Then open <http://localhost:4173>.

## Test

```bash
npm test
```

The page also includes a browser-side before/after comparison panel that scores the rendered output against the intended reference signature: black crush, cyan shadows, blue/red separation, saturation, high-frequency sensor damage, and timestamp coverage. Mobile users can explicitly choose between their photo library and camera, while desktop users can drag and drop. Everyone can remix deterministic grain, share supported output files, apply four advanced recipes, and generate a deterministic 2×2 contact sheet. The extended artifact stack adds radial chromatic aberration, scan fields, sensor dust, and spatial heat leaks.
