const assert = require('node:assert/strict');
const fs = require('node:fs');
const {
  DEFAULT_PARAMS,
  applyPhotonPixels,
  applyArtifactPixels,
  applyNeonNoirPixels,
  applyGlitchPixels,
  reduceNoise,
  getCrop,
  formatTimestamp,
  rgbToHsl,
  scoreSignature,
  isSupportedImageFile,
  REFERENCE_SIGNATURE,
} = require('../app.js');

function makeImageData(width, height, painter) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = painter(x, y, width, height);
      const index = (y * width + x) * 4;
      data[index] = r;
      data[index + 1] = g;
      data[index + 2] = b;
      data[index + 3] = 255;
    }
  }
  return { data, width, height };
}

function cloneImageData(imageData) {
  return {
    data: new Uint8ClampedArray(imageData.data),
    width: imageData.width,
    height: imageData.height,
  };
}

function processPixel(rgb, overrides = {}) {
  const imageData = makeImageData(1, 1, () => rgb);
  const params = {
    ...DEFAULT_PARAMS,
    lumaNoise: 0,
    chromaNoise: 0,
    orderedDitherStrength: 0,
    vignetteStrength: 0,
    ...overrides,
  };
  applyPhotonPixels(imageData, params, 123);
  return [imageData.data[0], imageData.data[1], imageData.data[2]];
}

function simpleSignature(imageData) {
  const { data, width, height } = imageData;
  let black = 0;
  let saturation = 0;
  let blueMinusRed = 0;
  let hf = 0;
  let hfSamples = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (lum < 50) black += 1;
      saturation += max === 0 ? 0 : (max - min) / max;
      blueMinusRed += b - r;
      if (x > 0) {
        const left = index - 4;
        hf += Math.abs(r - data[left]) + Math.abs(g - data[left + 1]) + Math.abs(b - data[left + 2]);
        hfSamples += 3;
      }
    }
  }

  const pixels = width * height;
  return {
    blackCrush: black / pixels,
    saturation: saturation / pixels,
    blueRedSeparation: blueMinusRed / pixels,
    highFrequencyEnergy: hf / hfSamples,
  };
}

function makePortraitLikeSubject() {
  return makeImageData(96, 128, (x, y, width, height) => {
    const nx = x / width;
    const ny = y / height;
    if (ny < 0.18) return [196, 178, 130]; // warm ceiling
    if (nx < 0.22) return [116, 74, 38]; // staircase wood
    if (nx > 0.74 && ny > 0.58) return [132, 74, 35]; // rail wood
    if (nx > 0.36 && nx < 0.68 && ny > 0.1 && ny < 0.36) return [190, 116, 82]; // skin
    if (nx > 0.2 && nx < 0.86 && ny > 0.34 && ny < 0.84) {
      if (Math.abs(nx - 0.79) < 0.035 || Math.abs(nx - 0.27) < 0.025) return [195, 24, 34]; // jersey red
      if (Math.abs(nx - 0.74) < 0.018 || Math.abs(nx - 0.32) < 0.018) return [237, 235, 224]; // jersey white
      return [20, 30, 65]; // navy jersey shadows
    }
    if (ny > 0.84) return [10, 10, 12]; // crushed lower frame
    return [210, 200, 160]; // cream wall
  });
}

function testCrop() {
  assert.deepEqual(getCrop(1080, 1440), { sx: 0, sy: 0, sw: 1080, sh: 1440 });
  assert.deepEqual(getCrop(1600, 900), { sx: 462.5, sy: 0, sw: 675, sh: 900 });
}

function testCropOptionsAndTimestamp() {
  assert.deepEqual(getCrop(1600, 900, 1), { sx: 350, sy: 0, sw: 900, sh: 900 });
  assert.deepEqual(getCrop(1600, 900, 1, 0), { sx: 0, sy: 0, sw: 900, sh: 900 });
  assert.deepEqual(getCrop(1600, 900, 1, 1), { sx: 700, sy: 0, sw: 900, sh: 900 });
  const stamp = formatTimestamp(new Date(2026, 5, 6, 9, 8, 7), 'Mira');
  assert.equal(stamp.line1, '06 06 2026 09:08:07');
  assert.match(stamp.line2, /MIRA$/);
  assert.match(formatTimestamp(new Date(2026, 5, 6, 9, 8, 7)).line2, /ALAM’S DUMP$/);
}

function testHueRemapping() {
  const greenInHue = rgbToHsl(50, 145, 60)[0];
  const greenOutHue = rgbToHsl(...processPixel([50, 145, 60]))[0];
  assert.ok(greenOutHue < greenInHue, `green hue should move toward yellow: ${greenInHue} -> ${greenOutHue}`);

  const blueInHue = rgbToHsl(40, 90, 185)[0];
  const blueOutHue = rgbToHsl(...processPixel([40, 90, 185]))[0];
  assert.ok(blueOutHue < blueInHue, `blue hue should move toward cyan: ${blueInHue} -> ${blueOutHue}`);

  const redInSat = rgbToHsl(150, 54, 48)[1];
  const redOutSat = rgbToHsl(...processPixel([150, 54, 48], { contrast: 1.12 }))[1];
  assert.ok(redOutSat > redInSat, `red saturation should increase: ${redInSat} -> ${redOutSat}`);
}

function testDeterministicPhotonDamage() {
  const subject = makePortraitLikeSubject();
  const a = cloneImageData(subject);
  const b = cloneImageData(subject);
  applyPhotonPixels(a, DEFAULT_PARAMS, 20260516);
  applyPhotonPixels(b, DEFAULT_PARAMS, 20260516);
  assert.deepEqual(a.data, b.data, 'seeded photon noise must be deterministic for visual regression comparisons');

  const before = simpleSignature(subject);
  const after = simpleSignature(a);
  assert.ok(after.blackCrush > before.blackCrush + 0.01, `black crush should increase: ${before.blackCrush} -> ${after.blackCrush}`);
  assert.ok(after.highFrequencyEnergy > before.highFrequencyEnergy + 4, `sensor damage should increase high-frequency energy: ${before.highFrequencyEnergy} -> ${after.highFrequencyEnergy}`);
  assert.ok(after.saturation > before.saturation, `selective/global saturation should increase: ${before.saturation} -> ${after.saturation}`);
}

function testAdvancedArtifacts() {
  const source = makeImageData(24, 18, (x, y, width) => [x === width - 1 ? 250 : 20, 70 + y, x === 0 ? 240 : 35]);
  const a = cloneImageData(source);
  const b = cloneImageData(source);
  const params = { chromaticAberration: 4, scanlineStrength: 0.12, dustStrength: 0.08, lightLeakStrength: 0.25 };
  applyArtifactPixels(a, params, 777);
  applyArtifactPixels(b, params, 777);
  assert.deepEqual(a.data, b.data, 'advanced artifacts must stay deterministic for contact-sheet regeneration');
  assert.notDeepEqual(a.data, source.data, 'advanced artifact stack must alter the rendered image');

  const rightEdge = ((9 * source.width) + source.width - 1) * 4;
  assert.ok(a.data[rightEdge] >= source.data[rightEdge], 'spatial heat leak should preserve or add red energy near the right edge');
}

function testCreativePixelEffects() {
  const source = makeImageData(18, 12, (x, y, width, height) => [30 + x * 8, 55 + y * 9, 90 + (width - x) * 5]);
  const neon = cloneImageData(source);
  applyNeonNoirPixels(neon, 0.8);
  assert.notDeepEqual(neon.data, source.data, 'neon-noir grading must alter the image');
  const shadow = 0;
  assert.ok(neon.data[shadow + 2] > source.data[shadow + 2], 'neon-noir shadows should gain blue energy');

  const glitchA = cloneImageData(source);
  const glitchB = cloneImageData(source);
  applyGlitchPixels(glitchA, 0.8, 0.5, 4242);
  applyGlitchPixels(glitchB, 0.8, 0.5, 4242);
  assert.deepEqual(glitchA.data, glitchB.data, 'seeded RGB glitches must be deterministic');
  assert.notDeepEqual(glitchA.data, source.data, 'RGB glitch must split or displace source pixels');
}


function testNoiseCancellation() {
  const noisy = makeImageData(5, 5, (x, y) => {
    const value = (x === 2 && y === 2) ? 96 : 126;
    return [value, value, value];
  });
  const beforeCenter = noisy.data[(2 * noisy.width + 2) * 4];
  reduceNoise(noisy, 0.8);
  const afterCenter = noisy.data[(2 * noisy.width + 2) * 4];
  assert.ok(afterCenter > beforeCenter, `noise cancellation should smooth isolated pixels: ${beforeCenter} -> ${afterCenter}`);
}

function testImageFileValidation() {
  assert.equal(isSupportedImageFile({ type: 'image/jpeg' }), true, 'camera JPEGs should be accepted');
  assert.equal(isSupportedImageFile({ type: 'image/heic' }), true, 'browser-advertised image formats should reach the decoder');
  assert.equal(isSupportedImageFile({ type: '', name: 'airdrop-photo.JPG' }), true, 'extension fallback should accept files with missing MIME metadata');
  assert.equal(isSupportedImageFile({ type: 'application/octet-stream', name: 'camera-photo.webp' }), true, 'generic binary MIME metadata should fall back to a known image extension');
  assert.equal(isSupportedImageFile({ type: '', name: 'notes.txt' }), false, 'extension fallback should reject non-images');
  assert.equal(isSupportedImageFile({ type: 'application/pdf' }), false, 'non-image files should be rejected');
  assert.equal(isSupportedImageFile(null), false, 'empty picker results should be ignored');
}

function testMergedUiContract() {
  const appSource = fs.readFileSync(require.resolve('../app.js'), 'utf8');
  const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
  assert.match(appSource, /const renderUserEdit = /, 'editor event handlers need renderUserEdit after conflict resolution');
  assert.match(appSource, /let hasUserImage = false/, 'wall consent flow needs its user-image state after conflict resolution');
  assert.doesNotMatch(html, /surreal|doubleExposure|levitation/i, 'removed composite templates must stay out of the UI contract');
  assert.doesNotMatch(html, /data-wall-action|profileForm|wallStatus/, 'living wall must stay free of social and profile controls');
  assert.match(html, /class="living-wall"/, 'the hero must contain the living wall');
  assert.match(html, /class="wall-hanging"/, 'the living wall must include its decorative hanging');
  assert.doesNotMatch(html, /id="memoryTunnel"|Walk through the archive/, 'the wall experience must not be split into a wasteful archive section');
  assert.doesNotMatch(html, /id="googleLogin"|id="loginTrigger"/, 'hanging a photo must not require a login flow');
  assert.match(html, /class="wall-rope"/, 'dimensional detail should be integrated into the existing wall as a hanging rope');
  assert.match(html, /@supabase\/supabase-js@2/, 'Supabase browser client must load before the app');
  assert.match(appSource, /submit_guest_wall_photo/, 'guest wall posts must use the anonymous RPC');
  assert.match(appSource, /checkWallImage\(blob\)/, 'wall uploads must pass the server image gate');
  assert.doesNotMatch(appSource, /service[_-]?role/i, 'client code must never contain a service-role key');
  assert.match(html, /No sign-in needed/, 'wall consent must clearly support guests');
  assert.match(html, /id="contactSheetCanvas"[^>]*hidden/, 'the four-sheet canvas must be absent until requested');
  assert.match(appSource, /setAttribute\('aria-expanded', 'true'\)/, 'making a four-sheet must reveal and announce its output');
  assert.match(appSource, /figure.className = 'living-photo photo-new'/, 'approved edits should join the living wall as animated photos');
  assert.match(appSource, /requestIdleCallback/, 'first-load editor work should be deferred until the browser is idle');
  assert.match(appSource, /IntersectionObserver/, 'expensive below-the-fold editor work should render lazily');
  assert.match(appSource, /maxLongEdge = 720/, 'extreme original aspect ratios must not create unbounded editor canvases');
  assert.match(html, /<script src=["']app\.js["'] defer>/, 'application JavaScript should not block HTML parsing');
  ['featuredGallery', 'wall', 'wallDemoA', 'wallDemoB'].forEach((id) => {
    assert.match(html, new RegExp(`id=["']${id}["']`), `${id} must remain in the page while app.js references it`);
  });
}

function testReferenceSignatureContract() {
  const syntheticReferenceLikeSignature = {
    blackCrush: 0.32,
    cyanShadowBias: 0.08,
    blueRedSeparation: 18,
    saturation: 0.44,
    highFrequencyEnergy: 14,
    timestampCoverage: 0.018,
  };
  const scored = scoreSignature(syntheticReferenceLikeSignature, REFERENCE_SIGNATURE);
  assert.equal(scored.every((item) => item.pass), true, 'known reference-like signature should pass every target range');
}

testCrop();
testCropOptionsAndTimestamp();
testHueRemapping();
testDeterministicPhotonDamage();
testAdvancedArtifacts();
testCreativePixelEffects();
testNoiseCancellation();
testImageFileValidation();
testMergedUiContract();
testReferenceSignatureContract();
console.log('photon-signature tests passed');
