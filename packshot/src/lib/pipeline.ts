import type { EditParams, EditState } from '../types';
import { bgColor } from './defaults';
import { bbox, buildAlpha } from './mask';
import { applyTone } from './tone';

export interface Rect { x: number; y: number; w: number; h: number }

/** Where the product rect lands on the output canvas. */
export function frameLayout(src: Rect, outW: number, outH: number, params: EditParams) {
  const pad = Math.min(0.45, Math.max(0, params.frame.padding / 100));
  const innerW = outW * (1 - 2 * pad);
  const innerH = outH * (1 - 2 * pad);
  const s = Math.min(innerW / src.w, innerH / src.h);
  const dw = src.w * s;
  const dh = src.h * s;
  const dx = (outW - dw) / 2;
  const dy = params.frame.align === 'bottom' ? outH - outH * pad - dh : (outH - dh) / 2;
  return { dx, dy, dw, dh };
}

export interface ComposeInput {
  rgba: Uint8ClampedArray; // source pixels at (w, h) — will be modified in place
  w: number;
  h: number;
  baseMask: Uint8Array | null; // AI mask resized to (w, h)
  state: EditState;
  pxScale: number; // (w,h) long side / preview long side
  view: 'final' | 'edit';
  maxOut?: number; // downscale the framed output for preview
  forceOpaque?: boolean; // JPEG export: never leave transparent pixels
  alpha?: Uint8Array | null; // precomputed final alpha (worker cache)
  toned?: boolean; // rgba already has the tone applied
}

export interface ComposeOutput {
  canvas: OffscreenCanvas;
  toned: Uint8ClampedArray;
  alpha: Uint8Array | null;
}

export function compose(inp: ComposeInput): ComposeOutput {
  const { rgba, w, h, state, pxScale, view } = inp;
  const { params, strokes } = state;
  const alpha = inp.alpha !== undefined ? inp.alpha : buildAlpha(inp.baseMask, w, h, params.bg, strokes, pxScale);
  if (!inp.toned) applyTone(rgba, w, h, params.tone, pxScale);

  // Toned cutout as a canvas.
  const cut = new OffscreenCanvas(w, h);
  const cctx = cut.getContext('2d')!;
  const img = new ImageData(rgba, w, h);
  if (alpha) {
    for (let i = 0, p = 3; i < alpha.length; i++, p += 4) rgba[p] = alpha[i];
  }
  cctx.putImageData(img, 0, 0);

  let color = bgColor(params);
  if (!color && inp.forceOpaque) color = '#FFFFFF';

  if (view === 'edit') {
    const out = new OffscreenCanvas(w, h);
    const ctx = out.getContext('2d')!;
    if (color) { ctx.fillStyle = color; ctx.fillRect(0, 0, w, h); }
    if (alpha) {
      // Ghost of the full photo so Restore has something to aim at.
      const ghost = new OffscreenCanvas(w, h);
      const gctx = ghost.getContext('2d')!;
      const gimg = new ImageData(new Uint8ClampedArray(rgba), w, h);
      for (let p = 3; p < gimg.data.length; p += 4) gimg.data[p] = 255;
      gctx.putImageData(gimg, 0, 0);
      ctx.globalAlpha = 0.22;
      ctx.drawImage(ghost, 0, 0);
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(cut, 0, 0);
    return { canvas: out, toned: rgba, alpha };
  }

  if (!params.frame.enabled) {
    if (!color) return { canvas: cut, toned: rgba, alpha };
    const out = new OffscreenCanvas(w, h);
    const ctx = out.getContext('2d')!;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(cut, 0, 0);
    return { canvas: out, toned: rgba, alpha };
  }

  let outW = params.frame.width;
  let outH = params.frame.height;
  if (inp.maxOut) {
    const s = Math.min(1, inp.maxOut / Math.max(outW, outH));
    outW = Math.round(outW * s);
    outH = Math.round(outH * s);
  }
  const src = alpha ? bbox(alpha, w, h) : { x: 0, y: 0, w, h };
  const { dx, dy, dw, dh } = frameLayout(src, outW, outH, params);
  const out = new OffscreenCanvas(outW, outH);
  const ctx = out.getContext('2d')!;
  if (color) { ctx.fillStyle = color; ctx.fillRect(0, 0, outW, outH); }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(cut, src.x, src.y, src.w, src.h, dx, dy, dw, dh);
  return { canvas: out, toned: rgba, alpha };
}
