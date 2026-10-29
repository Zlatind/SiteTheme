import type { BgSettings, Stroke } from '../types';
import { boxBlur1 } from './tone';

/** Bilinear resize of a single-channel mask. */
export function resizeMask(src: Uint8Array, sw: number, sh: number, dw: number, dh: number): Uint8Array {
  if (sw === dw && sh === dh) return src.slice();
  const out = new Uint8Array(dw * dh);
  const xr = (sw - 1) / Math.max(1, dw - 1);
  const yr = (sh - 1) / Math.max(1, dh - 1);
  for (let y = 0; y < dh; y++) {
    const fy = y * yr;
    const y0 = fy | 0;
    const y1 = Math.min(sh - 1, y0 + 1);
    const wy = fy - y0;
    const r0 = y0 * sw;
    const r1 = y1 * sw;
    for (let x = 0; x < dw; x++) {
      const fx = x * xr;
      const x0 = fx | 0;
      const x1 = Math.min(sw - 1, x0 + 1);
      const wx = fx - x0;
      const top = src[r0 + x0] + (src[r0 + x1] - src[r0 + x0]) * wx;
      const bot = src[r1 + x0] + (src[r1 + x1] - src[r1 + x0]) * wx;
      out[y * dw + x] = (top + (bot - top) * wy + 0.5) | 0;
    }
  }
  return out;
}

/** Separable min filter (erosion) — shrinks the cutout edge to remove halos. */
export function erode(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r < 1) return src;
  const tmp = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let m = 255;
      const a = Math.max(0, x - r);
      const b = Math.min(w - 1, x + r);
      for (let k = a; k <= b; k++) {
        const v = src[row + k];
        if (v < m) { m = v; if (m === 0) break; }
      }
      tmp[row + x] = m;
    }
  }
  const out = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let m = 255;
      const a = Math.max(0, y - r);
      const b = Math.min(h - 1, y + r);
      for (let k = a; k <= b; k++) {
        const v = tmp[k * w + x];
        if (v < m) { m = v; if (m === 0) break; }
      }
      out[y * w + x] = m;
    }
  }
  return out;
}

/** Two box passes ≈ gaussian feather. */
export function feather(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r < 1) return src;
  const half = Math.max(1, Math.round(r / 2));
  return boxBlur1(boxBlur1(src, w, h, half), w, h, half);
}

/** Paints Restore/Erase brush strokes into the mask using a 2D canvas. */
export function applyStrokes(mask: Uint8Array, w: number, h: number, strokes: Stroke[]): Uint8Array {
  if (!strokes.length) return mask;
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d')!;
  const img = new ImageData(w, h);
  const d = img.data;
  for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
    d[p] = d[p + 1] = d[p + 2] = 255;
    d[p + 3] = mask[i];
  }
  ctx.putImageData(img, 0, 0);
  const long = Math.max(w, h);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#fff';
  ctx.fillStyle = '#fff';
  for (const s of strokes) {
    ctx.globalCompositeOperation = s.mode === 'restore' ? 'source-over' : 'destination-out';
    ctx.lineWidth = Math.max(1, s.size * long);
    const pts = s.points;
    if (pts.length === 2) {
      ctx.beginPath();
      ctx.arc(pts[0] * w, pts[1] * h, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(pts[0] * w, pts[1] * h);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i] * w, pts[i + 1] * h);
    ctx.stroke();
  }
  const out = ctx.getImageData(0, 0, w, h).data;
  const res = new Uint8Array(w * h);
  for (let i = 0, p = 3; i < res.length; i++, p += 4) res[i] = out[p];
  return res;
}

/**
 * Final alpha for an image at (w, h). Returns null when the image has no cutout.
 * `base` is the AI mask already resized to (w, h); `pxScale` maps preview px to this resolution.
 */
export function buildAlpha(
  base: Uint8Array | null,
  w: number,
  h: number,
  bg: BgSettings,
  strokes: Stroke[],
  pxScale: number,
): Uint8Array | null {
  const useAi = bg.remove && base;
  if (!useAi && !strokes.length) return null;
  let a = useAi ? base!.slice() : new Uint8Array(w * h).fill(255);
  a = applyStrokes(a, w, h, strokes);
  if (bg.shrink > 0) a = erode(a, w, h, Math.round(bg.shrink * pxScale));
  if (bg.feather > 0) a = feather(a, w, h, Math.round(bg.feather * pxScale));
  return a;
}

/** Bounding box of pixels with alpha above `thr`. */
export function bbox(alpha: Uint8Array, w: number, h: number, thr = 16) {
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (alpha[row + x] > thr) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        maxY = y;
      }
    }
  }
  if (maxX < 0) return { x: 0, y: 0, w, h };
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}
