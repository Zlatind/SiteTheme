import { currentState, useStore } from '../state/store';
import { engine, type RenderResult } from './engine';

// Keeps exactly one image decoded in the render worker and coalesces render
// requests: while one render runs, only the newest pending request survives.

let loadedId: string | null = null;
let loadedMask: unknown = undefined;
let loadPromise: Promise<void> | null = null;
let original: ImageBitmap | null = null;
let paused = 0;
let inflight: Promise<void> | null = null;
let dirty = false;

type Listener = (r: RenderResult | null, original: ImageBitmap | null) => void;
const listeners = new Set<Listener>();
export const onFrame = (l: Listener) => { listeners.add(l); return () => { listeners.delete(l); }; };

export const getOriginal = () => original;

/** Forget the worker-side image (e.g. after the worker was terminated). */
export function invalidate() {
  loadedId = null;
  loadedMask = undefined;
  original?.close();
  original = null;
}

export async function ensureLoaded(id: string): Promise<void> {
  while (loadPromise) await loadPromise;
  const img = useStore.getState().images.find((i) => i.id === id);
  if (!img) throw new Error('Image missing');
  if (loadedId === id) {
    if (loadedMask !== img.mask) {
      await engine.setMask(id, img.mask ?? null);
      loadedMask = img.mask;
    }
    return;
  }
  loadPromise = (async () => {
    try {
      const res = await engine.load(id, img.blob, img.mask ?? null);
      original?.close();
      original = res.original;
      loadedId = id;
      loadedMask = img.mask;
    } finally {
      loadPromise = null;
    }
  })();
  await loadPromise;
}

async function pump() {
  while (dirty && !paused) {
    dirty = false;
    const s = useStore.getState();
    const img = s.images.find((i) => i.id === s.activeId);
    if (!img) {
      listeners.forEach((l) => l(null, null));
      continue;
    }
    try {
      await ensureLoaded(img.id);
      const view = s.tab === 'bg' && s.brush.enabled ? 'edit' : 'final';
      const res = await engine.render(img.id, currentState(img), view, s.interacting);
      if (useStore.getState().activeId === img.id) listeners.forEach((l) => l(res, original));
      else res.bitmap.close();
    } catch (e) {
      console.warn('Render failed', e);
    }
  }
}

export function requestRender() {
  dirty = true;
  if (inflight) return;
  inflight = pump().finally(() => {
    inflight = null;
    if (dirty && !paused) requestRender();
  });
}

/** Stops preview rendering (used by batch jobs that load other images into the worker). */
export async function pauseRendering() {
  paused++;
  if (inflight) await inflight;
}

export function resumeRendering() {
  paused = Math.max(0, paused - 1);
  if (!paused) requestRender();
}
