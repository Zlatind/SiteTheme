import type { Tone } from '../types';

export const isNeutralTone = (t: Tone) => Object.values(t).every((v) => v === 0);

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Levels end points derived from the Whites / Blacks sliders (0..255 space). */
export function levelsFor(t: Tone) {
  const inBlack = (Math.max(0, -t.blacks) / 100) * 64;
  const outBlack = (Math.max(0, t.blacks) / 100) * 64;
  const inWhite = 255 - (Math.max(0, t.whites) / 100) * 64;
  const outWhite = 255 - (Math.max(0, -t.whites) / 100) * 64;
  return { inBlack, outBlack, inWhite, outWhite };
}

/** Per-channel curve: exposure -> levels -> brightness (gamma) -> contrast (S-curve). */
export function buildCurve(t: Tone): Uint8Array {
  const lut = new Uint8Array(256);
  const exp = Math.pow(2, (t.exposure / 100) * 1.5);
  const { inBlack, outBlack, inWhite, outWhite } = levelsFor(t);
  const gamma = Math.pow(2, -(t.brightness / 100) * 0.8);
  const c = t.contrast / 100;
  for (let i = 0; i < 256; i++) {
    let x = clamp01((i / 255) * exp);
    x = clamp01((x * 255 - inBlack) / Math.max(1, inWhite - inBlack));
    x = (outBlack + x * (outWhite - outBlack)) / 255;
    x = Math.pow(x, gamma);
    if (c > 0) {
      const s = x < 0.5 ? 2 * x * x : 1 - 2 * (1 - x) * (1 - x);
      x = x + (s - x) * c;
    } else if (c < 0) {
      x = x + (0.5 + (x - 0.5) * 0.4 - x) * -c;
    }
    lut[i] = Math.round(clamp01(x) * 255);
  }
  return lut;
}

/** Luminance-indexed additive offset for Shadows / Highlights. */
function buildToneOffsets(t: Tone): Float32Array {
  const off = new Float32Array(256);
  const s = t.shadows / 100;
  const h = t.highlights / 100;
  for (let i = 0; i < 256; i++) {
    const l = i / 255;
    const sw = (1 - l) * (1 - l) * (1 - l);
    const hw = l * l * l;
    off[i] = (s * 0.45 * sw + h * 0.35 * hw) * 255;
  }
  return off;
}

/** Box blur of a single-channel buffer with a sliding window (O(n), any radius). */
export function boxBlur1(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r < 1) return src.slice();
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  const div = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += src[row + Math.min(w - 1, Math.max(0, k))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = (sum / div + 0.5) | 0;
      const add = Math.min(w - 1, x + r + 1);
      const sub = Math.max(0, x - r);
      sum += src[row + add] - src[row + sub];
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += tmp[Math.min(h - 1, Math.max(0, k)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = (sum / div + 0.5) | 0;
      const add = Math.min(h - 1, y + r + 1);
      const sub = Math.max(0, y - r);
      sum += tmp[add * w + x] - tmp[sub * w + x];
    }
  }
  return out;
}

/**
 * Applies all tone adjustments in place on an RGBA buffer.
 * `pxScale` keeps sharpening radius consistent between preview and full-res export.
 */
export function applyTone(data: Uint8ClampedArray, w: number, h: number, t: Tone, pxScale = 1) {
  if (isNeutralTone(t)) return;
  const n = w * h;
  const curve = buildCurve(t);
  const needHS = t.shadows !== 0 || t.highlights !== 0;
  const offsets = needHS ? buildToneOffsets(t) : null;
  const sat = 1 + t.saturation / 100;
  const warm = t.warmth / 100;
  const rMul = 1 + warm * 0.12;
  const bMul = 1 - warm * 0.12;
  const gMul = 1 + warm * 0.02;

  for (let i = 0, p = 0; i < n; i++, p += 4) {
    let r = curve[data[p]];
    let g = curve[data[p + 1]];
    let b = curve[data[p + 2]];
    if (offsets) {
      const l = (r * 77 + g * 150 + b * 29) >> 8;
      const o = offsets[l];
      r += o; g += o; b += o;
    }
    if (sat !== 1) {
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      r = l + (r - l) * sat;
      g = l + (g - l) * sat;
      b = l + (b - l) * sat;
    }
    if (warm !== 0) {
      r *= rMul; g *= gMul; b *= bMul;
    }
    data[p] = r; // Uint8ClampedArray clamps + rounds
    data[p + 1] = g;
    data[p + 2] = b;
  }

  if (t.sharpness !== 0) {
    const lum = new Uint8Array(n);
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      lum[i] = (data[p] * 77 + data[p + 1] * 150 + data[p + 2] * 29) >> 8;
    }
    const radius = Math.max(1, Math.round(pxScale));
    const blur = boxBlur1(lum, w, h, radius);
    const amount = t.sharpness > 0 ? (t.sharpness / 100) * 1.6 : t.sharpness / 100;
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      const d = (lum[i] - blur[i]) * amount;
      if (d === 0) continue;
      data[p] += d;
      data[p + 1] += d;
      data[p + 2] += d;
    }
  }
}

/** 256-bin luminance histogram; pixels with alpha < 128 in `alpha` are skipped. */
export function histogram(data: Uint8ClampedArray, alpha: Uint8Array | null): Uint32Array {
  const hist = new Uint32Array(256);
  const n = data.length >> 2;
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    if (alpha && alpha[i] < 128) continue;
    hist[(data[p] * 77 + data[p + 1] * 150 + data[p + 2] * 29) >> 8]++;
  }
  return hist;
}

/**
 * Auto levels: stretch the combined RGB histogram so 0.5% clips at each end,
 * expressed as Blacks/Whites slider values, plus mild contrast.
 */
export function autoTone(data: Uint8ClampedArray, alpha: Uint8Array | null): Partial<Tone> {
  const hist = new Uint32Array(256);
  const n = data.length >> 2;
  let count = 0;
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    if (alpha && alpha[i] < 128) continue;
    hist[data[p]]++;
    hist[data[p + 1]]++;
    hist[data[p + 2]]++;
    count += 3;
  }
  if (!count) return {};
  const clip = count * 0.005;
  let lo = 0;
  for (let acc = 0; lo < 255; lo++) { acc += hist[lo]; if (acc > clip) break; }
  let hi = 255;
  for (let acc = 0; hi > 0; hi--) { acc += hist[hi]; if (acc > clip) break; }
  if (hi - lo < 32) return { contrast: 10 };
  const blacks = -Math.min(100, Math.round((lo / 64) * 100));
  const whites = Math.min(100, Math.round(((255 - hi) / 64) * 100));
  return { blacks, whites, contrast: 10 };
}
