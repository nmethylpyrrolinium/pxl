const DEFAULT_PARAMS = {
  outputWidth: 410,
  outputHeight: 547,
  internalScale: 0.58,
  exposure: 0.02,
  blackPoint: 0.045,
  whitePoint: 0.925,
  contrast: 1.38,
  gamma: 0.96,
  globalSaturation: 1.24,
  temperature: -0.09,
  tint: -0.045,
  blueHueShift: -12,
  blueSaturation: 1.32,
  cyanSaturation: 1.24,
  greenHueShift: -14,
  greenSaturation: 1.18,
  greenLuminance: -0.035,
  redSaturation: 1.3,
  orangeSaturation: 1.24,
  shadowCyan: 0.075,
  shadowBlue: 0.055,
  shadowRedLoss: 0.045,
  bloomThreshold: 0.82,
  bloomRadius: 5,
  bloomStrength: 0.065,
  vignetteStrength: 0.16,
  vignetteRadius: 0.74,
  sharpenAmount: 0.65,
  lumaNoise: 17,
  chromaNoise: 9,
  shadowNoiseBoost: 1.35,
  highlightNoiseReduction: 0.55,
  orderedDitherStrength: 7,
  chromaticAberration: 1.25,
  scanlineStrength: 0.055,
  dustStrength: 0.018,
  lightLeakStrength: 0.08,
  aspectRatio: 0.75,
  cropPosition: 0.5,
  motionStyle: 'still',
  motionAmount: 0.45,
  timestampDate: null,
  jpegQuality: 0.58,
};

const REFERENCE_SIGNATURE = {
  blackCrush: [0.18, 0.58],
  cyanShadowBias: [0.012, 0.18],
  blueRedSeparation: [4, 45],
  saturation: [0.28, 0.72],
  highFrequencyEnergy: [7, 34],
  timestampCoverage: [0.005, 0.08],
};

const BAYER_8 = [
  [0, 48, 12, 60, 3, 51, 15, 63],
  [32, 16, 44, 28, 35, 19, 47, 31],
  [8, 56, 4, 52, 11, 59, 7, 55],
  [40, 24, 36, 20, 43, 27, 39, 23],
  [2, 50, 14, 62, 1, 49, 13, 61],
  [34, 18, 46, 30, 33, 17, 45, 29],
  [10, 58, 6, 54, 9, 57, 5, 53],
  [42, 26, 38, 22, 41, 25, 37, 21],
];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const clamp01 = (value) => clamp(value, 0, 1);
const clamp255 = (value) => clamp(Math.round(value), 0, 255);
const lerp = (a, b, t) => a + (b - a) * t;
const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

function smoothstep(edge0, edge1, value) {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function seededRandom(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function contrastSCurve(value, amount) {
  const denominator = 2 * Math.tanh(amount * 1.1);
  return clamp01(0.5 + Math.tanh((value - 0.5) * amount * 2.2) / denominator);
}

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const lightness = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = lightness > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    if (max === g) h = (b - r) / d + 2;
    if (max === b) h = (r - g) / d + 4;
    h *= 60;
  }

  return [h, s, lightness];
}

function hslToRgb(h, s, lightness) {
  const hue = (((h % 360) + 360) % 360) / 360;
  if (s === 0) {
    const gray = clamp255(lightness * 255);
    return [gray, gray, gray];
  }

  const q = lightness < 0.5 ? lightness * (1 + s) : lightness + s - lightness * s;
  const p = 2 * lightness - q;
  const hue2rgb = (t) => {
    let adjusted = t;
    if (adjusted < 0) adjusted += 1;
    if (adjusted > 1) adjusted -= 1;
    if (adjusted < 1 / 6) return p + (q - p) * 6 * adjusted;
    if (adjusted < 1 / 2) return q;
    if (adjusted < 2 / 3) return p + (q - p) * (2 / 3 - adjusted) * 6;
    return p;
  };

  return [
    clamp255(hue2rgb(hue + 1 / 3) * 255),
    clamp255(hue2rgb(hue) * 255),
    clamp255(hue2rgb(hue - 1 / 3) * 255),
  ];
}

function getCrop(sourceWidth, sourceHeight, targetAspect = 3 / 4, cropPosition = 0.5) {
  const sourceAspect = sourceWidth / sourceHeight;
  const safePosition = clamp01(cropPosition);
  let sw = sourceWidth;
  let sh = sourceHeight;

  if (sourceAspect > targetAspect) {
    sw = sourceHeight * targetAspect;
  } else {
    sh = sourceWidth / targetAspect;
  }

  return {
    sx: (sourceWidth - sw) * safePosition,
    sy: (sourceHeight - sh) * safePosition,
    sw,
    sh,
  };
}

function formatTimestamp(date = new Date()) {
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const pad = (value) => String(value).padStart(2, '0');
  const line1 = `${pad(safeDate.getMonth() + 1)} ${pad(safeDate.getDate())} ${safeDate.getFullYear()} ${pad(safeDate.getHours())}:${pad(safeDate.getMinutes())}:${pad(safeDate.getSeconds())}`;
  const timezone = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(safeDate).find((part) => part.type === 'timeZoneName')?.value || 'LOCAL';
  return { line1, line2: `${timezone.toUpperCase()} / ALAM’S DUMP` };
}

function applyPhotonPixels(imageData, params, seed) {
  const { data, width, height } = imageData;
  const rand = seededRandom(seed);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const nx = x / Math.max(1, width - 1);
      const ny = y / Math.max(1, height - 1);
      let r = data[index] / 255;
      let g = data[index + 1] / 255;
      let b = data[index + 2] / 255;

      r = contrastSCurve(Math.pow(clamp01((r + params.exposure - params.blackPoint) / (params.whitePoint - params.blackPoint)), params.gamma), params.contrast);
      g = contrastSCurve(Math.pow(clamp01((g + params.exposure - params.blackPoint) / (params.whitePoint - params.blackPoint)), params.gamma), params.contrast);
      b = contrastSCurve(Math.pow(clamp01((b + params.exposure - params.blackPoint) / (params.whitePoint - params.blackPoint)), params.gamma), params.contrast);

      r = clamp01(r * (1 + params.temperature * 0.75) * (1 + params.tint * 0.25));
      g = clamp01(g * (1 - params.tint * 0.45));
      b = clamp01(b * (1 - params.temperature));

      const preLuma = luma(r, g, b);
      const shadowMask = 1 - smoothstep(0.08, 0.42, preLuma);
      r = clamp01(r - params.shadowRedLoss * shadowMask);
      g = clamp01(g + params.shadowCyan * shadowMask * 0.65);
      b = clamp01(b + params.shadowBlue * shadowMask);

      let [h, s, lightness] = rgbToHsl(r * 255, g * 255, b * 255);
      s *= params.globalSaturation;

      if (h >= 70 && h <= 160) {
        const m = Math.sin(((h - 70) / 90) * Math.PI);
        h += params.greenHueShift * m;
        s *= lerp(1, params.greenSaturation, m);
        lightness += params.greenLuminance * m;
      }

      if (h >= 195 && h <= 250) {
        const m = Math.sin(((h - 195) / 55) * Math.PI);
        h += params.blueHueShift * m;
        s *= lerp(1, params.blueSaturation, m);
      }

      if (h >= 165 && h < 195) {
        const m = Math.sin(((h - 165) / 30) * Math.PI);
        s *= lerp(1, params.cyanSaturation, m);
      }

      if (h <= 18 || h >= 342) s *= params.redSaturation;

      if (h > 18 && h <= 65) {
        const m = Math.sin(((h - 18) / 47) * Math.PI);
        s *= lerp(1, params.orangeSaturation, m);
      }

      [r, g, b] = hslToRgb(h, clamp01(s), clamp01(lightness));

      const dx = nx - 0.5;
      const dy = ny - 0.5;
      const distance = Math.sqrt(dx * dx + dy * dy) / 0.7071;
      const vignette = smoothstep(params.vignetteRadius, 1.05, distance) * params.vignetteStrength;
      r *= 1 - vignette;
      g *= 1 - vignette;
      b *= 1 - vignette;

      const currentLuma = luma(r / 255, g / 255, b / 255);
      const shadowBoost = lerp(params.shadowNoiseBoost, 1, smoothstep(0.05, 0.45, currentLuma));
      const highlightReduce = lerp(1, params.highlightNoiseReduction, smoothstep(0.65, 1, currentLuma));
      const noiseScale = shadowBoost * highlightReduce;
      const lumaNoise = (rand() + rand() - 1) * params.lumaNoise * noiseScale;
      const dither = (BAYER_8[y & 7][x & 7] / 63 - 0.5) * params.orderedDitherStrength;

      data[index] = clamp255(r + lumaNoise + (rand() * 2 - 1) * params.chromaNoise * noiseScale + dither);
      data[index + 1] = clamp255(g + lumaNoise + (rand() * 2 - 1) * params.chromaNoise * noiseScale + dither * 0.8);
      data[index + 2] = clamp255(b + lumaNoise + (rand() * 2 - 1) * params.chromaNoise * noiseScale + dither * 1.15);
      data[index + 3] = 255;
    }
  }

  return imageData;
}

function applyArtifactPixels(imageData, params, seed = 1977) {
  const { data, width, height } = imageData;
  const source = new Uint8ClampedArray(data);
  const rand = seededRandom(seed);
  const aberration = Math.max(0, Math.round(params.chromaticAberration || 0));
  const scanlineStrength = params.scanlineStrength || 0;
  const dustStrength = params.dustStrength || 0;
  const lightLeakStrength = params.lightLeakStrength || 0;
  const leakX = width * 0.82;
  const leakY = height * 0.28;
  const leakRadius = width * 0.62;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const edge = Math.hypot(x / width - 0.5, y / height - 0.5) / 0.7071;
      const shift = Math.round(aberration * smoothstep(0.18, 1, edge));
      const redX = clamp(x + shift, 0, width - 1);
      const blueX = clamp(x - shift, 0, width - 1);
      let r = source[(y * width + redX) * 4];
      let g = source[index + 1];
      let b = source[(y * width + blueX) * 4 + 2];

      if (scanlineStrength > 0 && y % 3 === 0) {
        const lineMultiplier = 1 - scanlineStrength;
        r *= lineMultiplier;
        g *= lineMultiplier;
        b *= lineMultiplier;
      }

      if (lightLeakStrength > 0) {
        const leakDistance = Math.hypot(x - leakX, y - leakY);
        const leak = (1 - smoothstep(0, leakRadius, leakDistance)) * lightLeakStrength;
        r += 255 * leak;
        g += 92 * leak;
        b += 22 * leak;
      }

      if (dustStrength > 0 && rand() < dustStrength * 0.008) {
        const dust = rand() > 0.34 ? 84 : -72;
        r += dust;
        g += dust;
        b += dust;
      }

      data[index] = clamp255(r);
      data[index + 1] = clamp255(g);
      data[index + 2] = clamp255(b);
    }
  }

  return imageData;
}

function unsharpMask(imageData, amount) {
  const { data, width, height } = imageData;
  const src = new Uint8ClampedArray(data);
  const kernel = [1, 2, 1, 2, 4, 2, 1, 2, 1];

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width + x) * 4;
      for (let c = 0; c < 3; c += 1) {
        let blur = 0;
        let k = 0;
        for (let yy = -1; yy <= 1; yy += 1) {
          for (let xx = -1; xx <= 1; xx += 1) {
            blur += src[((y + yy) * width + x + xx) * 4 + c] * kernel[k];
            k += 1;
          }
        }
        blur /= 16;
        data[index + c] = clamp255(src[index + c] + (src[index + c] - blur) * amount);
      }
    }
  }

  return imageData;
}

function drawTimestamp(canvas, date = new Date()) {
  const { line1, line2 } = formatTimestamp(date);
  const ctx = canvas.getContext('2d');
  const fontSize = Math.round(canvas.width * 0.041);
  const right = Math.round(canvas.width * 0.03);
  const bottom = Math.round(canvas.height * 0.027);
  const gap = Math.round(canvas.height * 0.035);
  const x = canvas.width - right;
  const y2 = canvas.height - bottom;
  const y1 = y2 - gap;

  ctx.save();
  ctx.font = `${fontSize}px "Share Tech Mono", "OCR A Std", "Courier New", monospace`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(0, 0, 0, 0.96)';
  [[-2, 0], [2, 0], [0, -2], [0, 2], [1, 1]].forEach(([ox, oy]) => {
    ctx.fillText(line1, x + ox, y1 + oy);
    ctx.fillText(line2, x + ox, y2 + oy);
  });
  ctx.fillStyle = 'rgba(255, 251, 232, 0.98)';
  ctx.fillText(line1, x, y1);
  ctx.fillText(line2, x, y2);
  ctx.restore();
}

function applyMotionDamage(canvas, style = 'still', amount = 0, seed = 1) {
  if (style === 'still' || amount <= 0) return;
  const ctx = canvas.getContext('2d');
  const copy = document.createElement('canvas');
  copy.width = canvas.width;
  copy.height = canvas.height;
  copy.getContext('2d').drawImage(canvas, 0, 0);
  const rand = seededRandom(seed);
  const strength = clamp01(amount);

  ctx.save();
  if (style === 'shake') {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#05070d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.filter = `blur(${(strength * 1.8).toFixed(2)}px)`;
    for (let i = 0; i < 5; i += 1) {
      ctx.globalAlpha = i === 0 ? 0.55 : 0.12;
      ctx.drawImage(copy, (rand() - 0.5) * 14 * strength, (rand() - 0.5) * 9 * strength);
    }
  } else if (style === 'ghost') {
    ctx.globalAlpha = 0.2 + strength * 0.24;
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(copy, 5 + strength * 18, -2 - strength * 5);
  } else if (style === 'trails') {
    ctx.globalCompositeOperation = 'screen';
    ctx.filter = `blur(${(strength * 2.2).toFixed(2)}px)`;
    for (let i = 1; i <= 7; i += 1) {
      ctx.globalAlpha = (0.13 * strength) * (1 - i / 9);
      ctx.drawImage(copy, i * 5 * strength, -i * 1.3 * strength);
    }
  } else if (style === 'double') {
    ctx.globalAlpha = 0.24 + strength * 0.26;
    ctx.globalCompositeOperation = 'screen';
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((strength * 2.2 * Math.PI) / 180);
    ctx.drawImage(copy, -canvas.width / 2 + strength * 13, -canvas.height / 2 - strength * 7);
  }
  ctx.restore();
}

function applyBloom(canvas, params) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const source = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const brightCanvas = document.createElement('canvas');
  brightCanvas.width = canvas.width;
  brightCanvas.height = canvas.height;
  const brightCtx = brightCanvas.getContext('2d');
  const bright = brightCtx.createImageData(canvas.width, canvas.height);

  for (let i = 0; i < source.data.length; i += 4) {
    const lum = luma(source.data[i] / 255, source.data[i + 1] / 255, source.data[i + 2] / 255);
    const mask = smoothstep(params.bloomThreshold, 1, lum);
    bright.data[i] = source.data[i] * mask;
    bright.data[i + 1] = source.data[i + 1] * mask;
    bright.data[i + 2] = source.data[i + 2] * mask;
    bright.data[i + 3] = 255 * mask;
  }

  brightCtx.putImageData(bright, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = params.bloomStrength;
  ctx.filter = `blur(${params.bloomRadius}px)`;
  ctx.drawImage(brightCanvas, 0, 0);
  ctx.restore();
}

function renderSourceToCanvas(source, canvas, params = DEFAULT_PARAMS, seed = 20260516) {
  const outputWidth = canvas.width;
  const outputHeight = canvas.height;
  const internalWidth = Math.round(outputWidth * params.internalScale);
  const internalHeight = Math.round(outputHeight * params.internalScale);
  const sourceWidth = source.naturalWidth || source.width || source.videoWidth;
  const sourceHeight = source.naturalHeight || source.height || source.videoHeight;
  const crop = getCrop(sourceWidth, sourceHeight, params.aspectRatio || outputWidth / outputHeight, params.cropPosition ?? 0.5);
  const internalCanvas = document.createElement('canvas');
  internalCanvas.width = internalWidth;
  internalCanvas.height = internalHeight;
  const internalContext = internalCanvas.getContext('2d', { willReadFrequently: true });
  internalContext.imageSmoothingEnabled = true;
  internalContext.imageSmoothingQuality = 'low';
  internalContext.drawImage(source, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, internalWidth, internalHeight);

  let imageData = internalContext.getImageData(0, 0, internalWidth, internalHeight);
  imageData = applyPhotonPixels(imageData, params, seed);
  imageData = unsharpMask(imageData, params.sharpenAmount);
  internalContext.putImageData(imageData, 0, 0);
  applyBloom(internalCanvas, params);

  const outputContext = canvas.getContext('2d');
  outputContext.imageSmoothingEnabled = true;
  outputContext.imageSmoothingQuality = 'low';
  outputContext.clearRect(0, 0, outputWidth, outputHeight);
  outputContext.drawImage(internalCanvas, 0, 0, outputWidth, outputHeight);
  applyMotionDamage(canvas, params.motionStyle, params.motionAmount, seed + 17);
  const artifactData = outputContext.getImageData(0, 0, outputWidth, outputHeight);
  outputContext.putImageData(applyArtifactPixels(artifactData, params, seed + 31), 0, 0);
  drawTimestamp(canvas, params.timestampDate ? new Date(params.timestampDate) : new Date());
}

function renderRawPreview(source, canvas, params = DEFAULT_PARAMS) {
  const sourceWidth = source.naturalWidth || source.width || source.videoWidth;
  const sourceHeight = source.naturalHeight || source.height || source.videoHeight;
  const crop = getCrop(sourceWidth, sourceHeight, params.aspectRatio || canvas.width / canvas.height, params.cropPosition ?? 0.5);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, canvas.width, canvas.height);
}

function imageSignature(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let blackPixels = 0;
  let shadowPixels = 0;
  let cyanShadowTotal = 0;
  let saturationTotal = 0;
  let blueRedTotal = 0;
  let highFrequencyTotal = 0;
  let highFrequencySamples = 0;
  let timestampPixels = 0;
  let opaquePixels = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const lum = luma(r / 255, g / 255, b / 255);
      const maxChannel = Math.max(r, g, b);
      const minChannel = Math.min(r, g, b);

      opaquePixels += 1;
      if (lum < 0.06) blackPixels += 1;
      saturationTotal += maxChannel === 0 ? 0 : (maxChannel - minChannel) / maxChannel;
      blueRedTotal += b - r;

      if (lum < 0.32) {
        shadowPixels += 1;
        cyanShadowTotal += ((g + b) / 2 - r) / 255;
      }

      if (x > 0) {
        const left = index - 4;
        highFrequencyTotal += Math.abs(r - data[left]) + Math.abs(g - data[left + 1]) + Math.abs(b - data[left + 2]);
        highFrequencySamples += 3;
      }

      if (x > width * 0.45 && y > height * 0.86 && r > 220 && g > 220 && b > 220) {
        timestampPixels += 1;
      }
    }
  }

  return {
    blackCrush: blackPixels / opaquePixels,
    cyanShadowBias: shadowPixels ? cyanShadowTotal / shadowPixels : 0,
    blueRedSeparation: blueRedTotal / opaquePixels,
    saturation: saturationTotal / opaquePixels,
    highFrequencyEnergy: highFrequencySamples ? highFrequencyTotal / highFrequencySamples : 0,
    timestampCoverage: timestampPixels / opaquePixels,
  };
}

function scoreSignature(signature, target = REFERENCE_SIGNATURE) {
  return Object.entries(target).map(([key, [min, max]]) => {
    const value = signature[key];
    return {
      key,
      value,
      min,
      max,
      pass: value >= min && value <= max,
    };
  });
}

function updateSignatureReport(sourceCanvas, outputCanvas) {
  const report = document.getElementById('signatureReport');
  const verdict = document.getElementById('signatureVerdict');
  if (!report || !verdict) return;

  const sourceSignature = imageSignature(sourceCanvas);
  const outputSignature = imageSignature(outputCanvas);
  const scored = scoreSignature(outputSignature);
  const passed = scored.filter((item) => item.pass).length;

  verdict.textContent = `${passed}/${scored.length} reference-signature checks passing`;
  verdict.dataset.state = passed === scored.length ? 'pass' : 'warn';
  report.innerHTML = scored.map((item) => {
    const delta = item.value - (sourceSignature[item.key] ?? 0);
    const value = item.value.toFixed(item.key === 'blueRedSeparation' || item.key === 'highFrequencyEnergy' ? 1 : 3);
    const range = `${item.min}–${item.max}`;
    const deltaText = `${delta >= 0 ? '+' : ''}${delta.toFixed(item.key === 'blueRedSeparation' || item.key === 'highFrequencyEnergy' ? 1 : 3)}`;
    return `<li class="${item.pass ? 'pass' : 'warn'}"><span>${item.key}</span><strong>${value}</strong><small>target ${range} · Δ ${deltaText}</small></li>`;
  }).join('');
}

function makeProceduralScene(canvas) {
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#0e5bbf');
  gradient.addColorStop(0.42, '#60d1c7');
  gradient.addColorStop(0.58, '#e8d48b');
  gradient.addColorStop(1, '#09120d');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.globalAlpha = 0.8;
  for (let i = 0; i < 18; i += 1) {
    ctx.beginPath();
    const y = 40 + i * 20;
    ctx.ellipse(150 + Math.sin(i) * 100, y, 130 + i * 5, 8 + (i % 3) * 4, 0, 0, Math.PI * 2);
    ctx.fillStyle = i % 2 ? '#b8fff0' : '#1c6a91';
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.fillStyle = '#111509';
  for (let i = 0; i < 16; i += 1) {
    const x = i * 32 - 26;
    const height = 130 + Math.sin(i * 1.8) * 70;
    ctx.fillRect(x + 12, canvas.height - height, 8, height);
    ctx.beginPath();
    ctx.ellipse(x + 18, canvas.height - height + 24, 42, 76, Math.sin(i), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = '#1b180d';
  ctx.beginPath();
  ctx.moveTo(0, canvas.height * 0.77);
  for (let x = 0; x <= canvas.width; x += 16) {
    ctx.lineTo(x, canvas.height * 0.76 + Math.sin(x * 0.04) * 18);
  }
  ctx.lineTo(canvas.width, canvas.height);
  ctx.lineTo(0, canvas.height);
  ctx.closePath();
  ctx.fill();

  ['#ff624f', '#ffd65b', '#76e36f'].forEach((color, colorIndex) => {
    ctx.fillStyle = color;
    for (let i = 0; i < 18; i += 1) {
      ctx.beginPath();
      ctx.arc(70 + i * 19 + colorIndex * 8, 355 + Math.sin(i) * 46, 3 + (i % 4), 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function currentParams() {
  return {
    ...DEFAULT_PARAMS,
    contrast: Number(document.getElementById('contrastControl')?.value || DEFAULT_PARAMS.contrast),
    lumaNoise: Number(document.getElementById('grainControl')?.value || DEFAULT_PARAMS.lumaNoise),
    shadowCyan: Number(document.getElementById('cyanControl')?.value || DEFAULT_PARAMS.shadowCyan),
    orderedDitherStrength: Number(document.getElementById('ditherControl')?.value || DEFAULT_PARAMS.orderedDitherStrength),
    chromaticAberration: Number(document.getElementById('aberrationControl')?.value || DEFAULT_PARAMS.chromaticAberration),
    scanlineStrength: Number(document.getElementById('scanlineControl')?.value || DEFAULT_PARAMS.scanlineStrength),
    dustStrength: Number(document.getElementById('dustControl')?.value || DEFAULT_PARAMS.dustStrength),
    lightLeakStrength: Number(document.getElementById('leakControl')?.value || DEFAULT_PARAMS.lightLeakStrength),
    aspectRatio: document.querySelector('[data-crop].active')?.dataset.crop === 'original' ? null : Number(document.querySelector('[data-crop].active')?.dataset.crop || DEFAULT_PARAMS.aspectRatio),
    cropPosition: Number(document.getElementById('cropPositionControl')?.value || DEFAULT_PARAMS.cropPosition),
    motionStyle: document.querySelector('[data-motion].active')?.dataset.motion || DEFAULT_PARAMS.motionStyle,
    motionAmount: Number(document.getElementById('motionControl')?.value || DEFAULT_PARAMS.motionAmount),
    timestampDate: document.getElementById('timestampNow')?.checked ? null : document.getElementById('customTimestamp')?.value || null,
  };
}

const IMAGE_FILE_EXTENSION = /\.(?:avif|bmp|gif|heic|heif|jpe?g|png|tiff?|webp)$/i;

function isSupportedImageFile(file) {
  if (!file) return false;
  const type = typeof file.type === 'string' ? file.type : '';
  if (type.startsWith('image/')) return true;
  if (type && type !== 'application/octet-stream') return false;
  return typeof file.name === 'string' && IMAGE_FILE_EXTENSION.test(file.name);
}

function initialize() {
  const demoCanvas = document.getElementById('demoCanvas');
  const outputCanvas = document.getElementById('outputCanvas');
  const sourcePreviewCanvas = document.getElementById('sourceCanvas');
  const uploadStatus = document.getElementById('uploadStatus');
  const dropZone = document.getElementById('dropZone');
  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = DEFAULT_PARAMS.outputWidth;
  sourceCanvas.height = DEFAULT_PARAMS.outputHeight;
  makeProceduralScene(sourceCanvas);

  let activeSource = sourceCanvas;
  let renderSeed = 20260516;
  let activeFileName = 'alams-dump';
  let hasUserImage = false;
  let loadRequestId = 0;
  let activeObjectUrl = null;

  const setStatus = (message, state = '') => {
    if (!uploadStatus) return;
    uploadStatus.textContent = message;
    uploadStatus.dataset.state = state;
  };

  const resizeEditorCanvases = (params) => {
    const sourceWidth = activeSource.naturalWidth || activeSource.width || DEFAULT_PARAMS.outputWidth;
    const sourceHeight = activeSource.naturalHeight || activeSource.height || DEFAULT_PARAMS.outputHeight;
    const aspect = params.aspectRatio || sourceWidth / sourceHeight;
    const width = DEFAULT_PARAMS.outputWidth;
    const height = Math.max(1, Math.round(width / aspect));
    [outputCanvas, sourcePreviewCanvas].forEach((canvas) => {
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
    });
  };

  const renderOutput = () => {
    const params = currentParams();
    resizeEditorCanvases(params);
    renderRawPreview(activeSource, sourcePreviewCanvas, params);
    renderSourceToCanvas(activeSource, outputCanvas, params, renderSeed);
    updateSignatureReport(sourcePreviewCanvas, outputCanvas);
  };

  const renderUserEdit = () => {
    renderOutput();
    if (hasUserImage) document.getElementById('featureAsk')?.removeAttribute('hidden');
  };

  const renderAll = (source = activeSource) => {
    activeSource = source;
    renderOutput();
    renderSourceToCanvas(sourceCanvas, demoCanvas, { ...DEFAULT_PARAMS, lumaNoise: 20, contrast: 1.46 }, 20260404);
    const wallDemoA = document.getElementById('wallDemoA');
    const wallDemoB = document.getElementById('wallDemoB');
    if (wallDemoA) renderSourceToCanvas(sourceCanvas, wallDemoA, { ...DEFAULT_PARAMS, motionStyle: 'ghost', motionAmount: 0.42 }, 20260405);
    if (wallDemoB) renderSourceToCanvas(sourceCanvas, wallDemoB, { ...DEFAULT_PARAMS, motionStyle: 'trails', motionAmount: 0.48, lightLeakStrength: 0.28 }, 20260406);
  };

  const loadImageFile = (file) => {
    if (!file) return;
    if (!isSupportedImageFile(file)) {
      setStatus('That file is not an image. Try a JPG, PNG, WebP, or another browser-supported image.', 'error');
      return;
    }

    const requestId = ++loadRequestId;
    if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
    const url = URL.createObjectURL(file);
    activeObjectUrl = url;
    setStatus(`Developing ${file.name || 'camera photo'}…`, 'loading');

    const image = new Image();
    image.decoding = 'async';
    const finishRequest = () => {
      if (activeObjectUrl === url) activeObjectUrl = null;
      URL.revokeObjectURL(url);
    };
    image.onload = () => {
      if (requestId !== loadRequestId) {
        finishRequest();
        return;
      }
      try {
        activeFileName = (file.name || 'camera-photo').replace(/\.[^.]+$/, '').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase();
        renderSeed = Math.max(1, Math.floor(file.lastModified || Date.now()) % 2147483647);
        hasUserImage = true;
        renderAll(image);
        document.getElementById('featureAsk')?.removeAttribute('hidden');
        setStatus(`${file.name || 'Camera photo'} is in the dump. Adjust it, remix the grain, then save or share.`, 'success');
      } catch (error) {
        console.error('Unable to render selected image.', error);
        setStatus('This image opened but could not be rendered. Try a smaller JPG, PNG, or WebP file.', 'error');
      } finally {
        finishRequest();
      }
    };
    image.onerror = () => {
      if (requestId === loadRequestId) {
        setStatus('This image could not be decoded by your browser. Convert HEIC/RAW files to JPG or PNG and try again.', 'error');
      }
      finishRequest();
    };
    image.src = url;
  };

  renderAll();

  ['contrastControl', 'grainControl', 'cyanControl', 'ditherControl', 'aberrationControl', 'scanlineControl', 'dustControl', 'leakControl', 'cropPositionControl', 'motionControl'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', renderUserEdit);
  });

  ['crop', 'motion'].forEach((kind) => {
    document.querySelectorAll(`[data-${kind}]`).forEach((button) => {
      button.addEventListener('click', () => {
        document.querySelectorAll(`[data-${kind}]`).forEach((item) => item.classList.toggle('active', item === button));
        renderUserEdit();
      });
    });
  });

  const timestampNow = document.getElementById('timestampNow');
  const customTimestamp = document.getElementById('customTimestamp');
  const localDateTimeValue = (date = new Date()) => {
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  };
  customTimestamp.value = localDateTimeValue();
  timestampNow?.addEventListener('change', () => {
    customTimestamp.disabled = timestampNow.checked;
    if (timestampNow.checked) customTimestamp.value = localDateTimeValue();
    renderUserEdit();
  });
  customTimestamp?.addEventListener('input', renderUserEdit);

  ['imageInput', 'cameraInput'].forEach((id) => {
    document.getElementById(id)?.addEventListener('change', (event) => {
      loadImageFile(event.target.files?.[0]);
      event.target.value = '';
    });
  });

  ['dragenter', 'dragover'].forEach((eventName) => {
    dropZone?.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.classList.add('is-dragging');
    });
  });
  ['dragleave', 'drop'].forEach((eventName) => {
    dropZone?.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.classList.remove('is-dragging');
    });
  });
  dropZone?.addEventListener('drop', (event) => loadImageFile(event.dataTransfer?.files?.[0]));

  const presets = {
    reference: {},
    night: { contrast: 1.56, lumaNoise: 23, shadowCyan: 0.13, orderedDitherStrength: 10, chromaticAberration: 2.2, lightLeakStrength: 0 },
    heat: { contrast: 1.32, lumaNoise: 15, shadowCyan: 0.045, orderedDitherStrength: 5, chromaticAberration: 1.5, lightLeakStrength: 0.32 },
    hardSensor: { contrast: 1.68, lumaNoise: 27, shadowCyan: 0.09, orderedDitherStrength: 13, chromaticAberration: 3, scanlineStrength: 0.11 },
  };

  document.querySelectorAll('[data-preset]').forEach((button) => {
    button.addEventListener('click', () => {
      const values = { ...DEFAULT_PARAMS, ...(presets[button.dataset.preset] || {}) };
      const mapping = {
        contrastControl: values.contrast,
        grainControl: values.lumaNoise,
        cyanControl: values.shadowCyan,
        ditherControl: values.orderedDitherStrength,
        aberrationControl: values.chromaticAberration,
        scanlineControl: values.scanlineStrength,
        dustControl: values.dustStrength,
        leakControl: values.lightLeakStrength,
      };
      Object.entries(mapping).forEach(([id, value]) => { document.getElementById(id).value = value; });
      document.querySelectorAll('[data-preset]').forEach((item) => item.classList.toggle('active', item === button));
      renderUserEdit();
    });
  });

  document.getElementById('remixButton')?.addEventListener('click', () => {
    renderSeed = (renderSeed + 104729) % 2147483647;
    renderOutput();
    setStatus('Fresh grain, dust, and sensor scars generated. Same photo, different damage.', 'success');
  });

  document.getElementById('contactSheetButton')?.addEventListener('click', () => {
    const sheet = document.getElementById('contactSheetCanvas');
    const sheetContext = sheet.getContext('2d');
    sheet.hidden = false;
    sheetContext.fillStyle = '#05070d';
    sheetContext.fillRect(0, 0, sheet.width, sheet.height);
    Object.entries(presets).forEach(([name, overrides], index) => {
      const tile = document.createElement('canvas');
      tile.width = 410;
      tile.height = 547;
      renderSourceToCanvas(activeSource, tile, { ...DEFAULT_PARAMS, ...overrides }, renderSeed + index * 101);
      const x = (index % 2) * 430 + 20;
      const y = Math.floor(index / 2) * 600 + 20;
      sheetContext.drawImage(tile, x, y, 410, 547);
      sheetContext.fillStyle = '#54f3ff';
      sheetContext.font = '700 18px monospace';
      sheetContext.fillText(name.toUpperCase(), x, y + 575);
    });
    sheet.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  const outputBlob = () => new Promise((resolve) => outputCanvas.toBlob(resolve, 'image/jpeg', DEFAULT_PARAMS.jpegQuality));

  document.getElementById('downloadButton')?.addEventListener('click', async () => {
    const blob = await outputBlob();
    if (!blob) return;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${activeFileName}-dumped.jpg`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 2500);
  });

  document.getElementById('shareButton')?.addEventListener('click', async () => {
    const blob = await outputBlob();
    if (!blob) return;
    const file = new File([blob], `${activeFileName}-dumped.jpg`, { type: 'image/jpeg' });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Alam’s Dump', text: 'A photo I wrecked in Alam’s Dump.' });
        setStatus('Dump shared.', 'success');
      } catch (error) {
        if (error.name !== 'AbortError') setStatus('Sharing was blocked. Download the JPEG instead.', 'error');
      }
    } else {
      setStatus('File sharing is not supported in this browser. Download the JPEG instead.', 'error');
    }
  });

  document.getElementById('featureYes')?.addEventListener('click', () => {
    if (!hasUserImage) return;
    const gallery = document.getElementById('featuredGallery');
    const figure = document.createElement('figure');
    figure.className = 'hanging-photo user-feature';
    const image = new Image();
    image.src = outputCanvas.toDataURL('image/jpeg', 0.76);
    image.alt = 'A user-approved Alam’s Dump edit';
    const caption = document.createElement('figcaption');
    caption.textContent = `${formatTimestamp(new Date()).line1} / APPROVED`;
    figure.append(image, caption);
    gallery.prepend(figure);
    document.getElementById('wallEmpty')?.remove();
    document.getElementById('featureAsk').hidden = true;
    setStatus('Added to the wall for this session.', 'success');
    document.getElementById('wall')?.scrollIntoView({ behavior: 'smooth' });
  });

  document.getElementById('featureNo')?.addEventListener('click', () => {
    document.getElementById('featureAsk').hidden = true;
    setStatus('Kept private.', 'success');
  });

  const rig = document.getElementById('cameraRig');
  window.addEventListener('pointermove', (event) => {
    if (!rig || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const x = (event.clientX / window.innerWidth - 0.5) * 9;
    const y = (event.clientY / window.innerHeight - 0.5) * -7;
    rig.style.setProperty('rotate', `${y}deg ${x}deg`);
  });
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', initialize);
}

if (typeof module !== 'undefined') {
  module.exports = {
    DEFAULT_PARAMS,
    REFERENCE_SIGNATURE,
    BAYER_8,
    clamp01,
    contrastSCurve,
    rgbToHsl,
    hslToRgb,
    getCrop,
    formatTimestamp,
    applyPhotonPixels,
    applyArtifactPixels,
    unsharpMask,
    imageSignature,
    scoreSignature,
    isSupportedImageFile,
  };
}

