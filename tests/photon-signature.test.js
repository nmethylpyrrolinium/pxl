const assert = require('node:assert/strict');
const {
  DEFAULT_PARAMS,
  applyPhotonPixels,
  getCrop,
  rgbToHsl,
  scoreSignature,
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
testHueRemapping();
testDeterministicPhotonDamage();
testReferenceSignatureContract();
console.log('photon-signature tests passed');
