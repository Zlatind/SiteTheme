/// <reference lib="webworker" />
import type { EditState, ExportSettings, Mask, Tone } from '../types';
import { FAST_MAX, PREVIEW_MAX } from '../lib/defaults';
import { encodeCanvas } from '../lib/encode';
import { buildAlpha, resizeMask } from '../lib/mask';
import { compose } from '../lib/pipeline';
import { applyTone, autoTone, histogram } from '../lib/tone';
import { serve } from './rpc';

interface Level {
  rgba: Uint8ClampedArray;
  w: number;
  h: number;
  mask: Uint8Array | null; // AI mask resized to this level
  alphaKey: string;
  alpha: Uint8Array | null;
  toneKey: string;
  toned: Uint8ClampedArray | null;
}

interface Current {
  id: string;
  fullW: number;
  fullH: number;
  preview: Level;
  fast: Level;
}

let cur: Current | null = null;

function fitSize(w: number, h: number, max: number) {
  const s = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

function drawScaled(src: CanvasImageSource, w: number, h: number): Uint8ClampedArray {
  const c = new OffscreenCanvas(w, h);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h).data;
}

function makeLevel(rgba: Uint8ClampedArray, w: number, h: number, mask: Mask | null): Level {
  return {
    rgba, w, h,
    mask: mask ? resizeMask(mask.data, mask.w, mask.h, w, h) : null,
    alphaKey: '', alpha: null, toneKey: '', toned: null,
  };
}

function setMask(mask: Mask | null) {
  if (!cur) return;
  for (const lv of [cur.preview, cur.fast]) {
    lv.mask = mask ? resizeMask(mask.data, mask.w, mask.h, lv.w, lv.h) : null;
    lv.alphaKey = '';
    lv.alpha = null;
  }
}

function levelAlpha(lv: Level, state: EditState, pxScale: number) {
  const key = JSON.stringify([!!lv.mask, state.params.bg.remove, state.params.bg.shrink, state.params.bg.feather, state.strokes]);
  if (key !== lv.alphaKey) {
    lv.alpha = buildAlpha(lv.mask, lv.w, lv.h, state.params.bg, state.strokes, pxScale);
    lv.alphaKey = key;
  }
  return lv.alpha;
}

function levelToned(lv: Level, tone: Tone, pxScale: number) {
  const key = JSON.stringify(tone);
  if (key !== lv.toneKey || !lv.toned) {
    const t = new Uint8ClampedArray(lv.rgba);
    applyTone(t, lv.w, lv.h, tone, pxScale);
    lv.toned = t;
    lv.toneKey = key;
  }
  return lv.toned;
}

function need(id: string): Current {
  if (!cur || cur.id !== id) throw new Error('Image not loaded');
  return cur;
}

serve({
  /** Reads dimensions and builds a small thumbnail. */
  async import({ blob }: { blob: Blob }) {
    const bmp = await createImageBitmap(blob);
    const width = bmp.width;
    const height = bmp.height;
    const t = fitSize(width, height, 200);
    const c = new OffscreenCanvas(t.w, t.h);
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0, t.w, t.h);
    bmp.close();
    const thumb = await c.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
    return { width, height, thumb };
  },

  /** Makes an image current: decodes once, keeps a ≤2048 preview and a ≤1024 fast copy. */
  async load({ id, blob, mask }: { id: string; blob: Blob; mask: Mask | null }, ctx) {
    cur = null; // drop the previous image first so peak memory stays low
    const bmp = await createImageBitmap(blob);
    const p = fitSize(bmp.width, bmp.height, PREVIEW_MAX);
    const f = fitSize(bmp.width, bmp.height, FAST_MAX);
    const prgba = drawScaled(bmp, p.w, p.h);
    const fullW = bmp.width;
    const fullH = bmp.height;
    bmp.close();
    const pc = new OffscreenCanvas(p.w, p.h);
    pc.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(prgba), p.w, p.h), 0, 0);
    const frgba = drawScaled(pc, f.w, f.h);
    const original = pc.transferToImageBitmap();
    cur = {
      id, fullW, fullH,
      preview: makeLevel(prgba, p.w, p.h, mask),
      fast: makeLevel(frgba, f.w, f.h, mask),
    };
    ctx.transfer.push(original);
    return { original, pw: p.w, ph: p.h };
  },

  setMask({ id, mask }: { id: string; mask: Mask | null }) {
    need(id);
    setMask(mask);
    return true;
  },

  /** Raw RGBA of the preview — input for background removal. */
  previewRGBA({ id }: { id: string }, ctx) {
    const c = need(id);
    const copy = new Uint8ClampedArray(c.preview.rgba);
    ctx.transfer.push(copy.buffer);
    return { buf: copy.buffer, w: c.preview.w, h: c.preview.h };
  },

  render({ id, state, view, fast }: { id: string; state: EditState; view: 'final' | 'edit'; fast: boolean }, ctx) {
    const c = need(id);
    const lv = fast ? c.fast : c.preview;
    const pxScale = lv.w / c.preview.w;
    const alpha = levelAlpha(lv, state, pxScale);
    const toned = levelToned(lv, state.params.tone, pxScale);
    const hist = histogram(toned, alpha);
    const out = compose({
      rgba: new Uint8ClampedArray(toned), w: lv.w, h: lv.h,
      baseMask: lv.mask, state, pxScale, view,
      maxOut: fast ? FAST_MAX : 1600,
      alpha, toned: true,
    });
    const bitmap = out.canvas.transferToImageBitmap();
    ctx.transfer.push(bitmap, hist.buffer);
    return { bitmap, hist, w: bitmap.width, h: bitmap.height };
  },

  auto({ id, state }: { id: string; state: EditState }) {
    const c = need(id);
    const lv = c.fast;
    const alpha = levelAlpha(lv, state, lv.w / c.preview.w);
    return autoTone(lv.rgba, alpha);
  },

  /** Full-resolution render + encode. Independent of the current preview. */
  async export(
    { blob, state, mask, settings }: { blob: Blob; state: EditState; mask: Mask | null; settings: ExportSettings },
    ctx,
  ) {
    ctx.progress({ key: 'decode', current: 0, total: 3 });
    const bmp = await createImageBitmap(blob);
    const w = bmp.width;
    const h = bmp.height;
    const rgba = drawScaled(bmp, w, h);
    bmp.close();
    const previewLong = Math.min(PREVIEW_MAX, Math.max(w, h));
    const pxScale = Math.max(w, h) / previewLong;
    const base = mask ? resizeMask(mask.data, mask.w, mask.h, w, h) : null;
    ctx.progress({ key: 'process', current: 1, total: 3 });
    const out = compose({
      rgba, w, h, baseMask: base, state, pxScale, view: 'final',
      forceOpaque: settings.format === 'jpeg',
    });
    ctx.progress({ key: 'encode', current: 2, total: 3 });
    const enc = await encodeCanvas(out.canvas, settings);
    return { blob: enc.blob, quality: enc.quality, fits: enc.fits, w: out.canvas.width, h: out.canvas.height };
  },

  unload() {
    cur = null;
    return true;
  },
});
