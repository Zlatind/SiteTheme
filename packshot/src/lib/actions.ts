import type { ImageItem, Mask } from '../types';
import { currentState, useStore } from '../state/store';
import { CancelledError } from '../workers/rpc';
import { bgEngine, describeBgProgress, engine, renderWorker } from './engine';
import { extOf, mimeOf } from './encode';
import { formatName, uniqueNames } from './filename';
import { importFiles } from './import';
import { download, shareFiles, stamp, zipFiles } from './share';
import { ensureLoaded, invalidate, pauseRendering, resumeRendering } from './viewer';

const st = () => useStore.getState();
const findImg = (id: string) => st().images.find((i) => i.id === id);

function fail(e: unknown) {
  if (e instanceof CancelledError) st().toastMsg('Cancelled');
  else {
    console.error(e);
    const msg = e instanceof Error ? e.message : String(e);
    st().toastMsg(/failed to fetch|networkerror/i.test(msg)
      ? 'No connection — the AI model must be downloaded once while online'
      : msg);
  }
}

// ---------- Import ----------

export async function importPicked(fileList: FileList | File[]) {
  const files = Array.from(fileList).filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));
  if (!files.length) return;
  let cancelled = false;
  st().setBusy({ title: 'Importing', progress: 0, cancel: () => { cancelled = true; } });
  try {
    const { items, failed } = await importFiles(
      files,
      (done, total) => st().setBusy({ title: 'Importing', label: `${done} / ${total}`, progress: done / total, cancel: () => { cancelled = true; } }),
      () => cancelled,
    );
    st().addImages(items);
    if (failed.length) st().toastMsg(`Could not read: ${failed.join(', ')}`);
  } catch (e) {
    fail(e);
  } finally {
    st().setBusy(null);
  }
}

// ---------- Background removal ----------

/** Runs the AI cutout for one image (no UI). Assumes rendering is paused or the image is active. */
async function segment(id: string, onLabel: (label: string, value: number | null) => void): Promise<Mask> {
  await ensureLoaded(id);
  const { buf, w, h } = await engine.previewRGBA(id);
  const { model, gpu } = st().settings;
  const mask = await bgEngine.segment(buf, w, h, model, gpu, (p) => {
    const d = describeBgProgress(p);
    onLabel(d.label, d.value);
  });
  st().setMask(id, mask);
  return mask;
}

export async function removeBackground(id: string) {
  const img = findImg(id);
  if (!img) return;
  if (img.mask) {
    st().update((s) => { s.params.bg.remove = true; }, 'commit', id);
    return;
  }
  const cancel = () => bgEngine.cancel();
  st().setBusy({ title: 'Remove background', label: 'Loading model…', progress: null, cancel });
  try {
    await segment(id, (label, value) => st().setBusy({ title: 'Remove background', label, progress: value, cancel }));
    st().update((s) => { s.params.bg.remove = true; }, 'commit', id);
  } catch (e) {
    fail(e);
  } finally {
    st().setBusy(null);
  }
}

export async function downloadModel() {
  const cancel = () => bgEngine.cancel();
  st().setBusy({ title: 'Offline model', label: 'Starting…', progress: null, cancel });
  try {
    const { model, gpu } = st().settings;
    await bgEngine.preload(model, gpu, (p) => {
      const d = describeBgProgress(p);
      st().setBusy({ title: 'Offline model', label: d.label, progress: d.value, cancel });
    });
    st().toastMsg('Model saved — background removal now works offline');
  } catch (e) {
    fail(e);
  } finally {
    st().setBusy(null);
  }
}

// ---------- Adjust ----------

export async function autoAdjust() {
  const img = findImg(st().activeId ?? '');
  if (!img) return;
  try {
    await ensureLoaded(img.id);
    const patch = await engine.auto(img.id, currentState(img));
    st().update((s) => { Object.assign(s.params.tone, patch); }, 'commit', img.id);
  } catch (e) {
    fail(e);
  }
}

// ---------- Presets ----------

export async function applyPresetToActive(presetId: string) {
  const id = st().activeId;
  if (!id) return;
  st().applyPreset(presetId, [id]);
  const img = findImg(id)!;
  if (currentState(img).params.bg.remove && !img.mask && st().settings.autoRemoveOnPreset) {
    await removeBackground(id);
  }
}

// ---------- Export / batch ----------

async function renderFiles(items: ImageItem[], title: string): Promise<{ files: File[]; oversize: string[] } | null> {
  let cancelled = false;
  const cancel = () => {
    cancelled = true;
    bgEngine.cancel();
    renderWorker.terminate();
    invalidate();
  };
  const all = st().images;
  const files: File[] = [];
  const oversize: string[] = [];
  await pauseRendering();
  try {
    for (let i = 0; i < items.length; i++) {
      if (cancelled) throw new CancelledError();
      const base = items.length > 1 ? `${i + 1} / ${items.length}` : '';
      const show = (label: string, sub = 0) =>
        st().setBusy({ title, label: base ? `${base} · ${label}` : label, progress: (i + sub) / items.length, cancel });
      let img = findImg(items[i].id) ?? items[i];
      const state = currentState(img);
      if (state.params.bg.remove && !img.mask) {
        show('Removing background');
        await segment(img.id, (label, value) => show(label, (value ?? 0) * 0.5));
        img = findImg(img.id)!;
      }
      show('Rendering', 0.5);
      const { exportSettings: settings } = st();
      const res = await engine.export(img.blob, state, img.mask ?? null, settings);
      const index = all.findIndex((x) => x.id === img.id) + 1;
      const name = formatName(settings.pattern, { name: img.name, index, preset: img.presetName }, extOf(settings.format));
      files.push(new File([res.blob], name, { type: mimeOf(settings.format) }));
      if (!res.fits) oversize.push(name);
    }
    const names = uniqueNames(files.map((f) => f.name));
    return { files: files.map((f, i) => (f.name === names[i] ? f : new File([f], names[i], { type: f.type }))), oversize };
  } catch (e) {
    fail(e);
    return null;
  } finally {
    st().setBusy(null);
    resumeRendering();
  }
}

const sizeNote = (oversize: string[]) =>
  oversize.length ? `${oversize.length} file(s) could not reach the size limit` : undefined;

/** Export the active image and open the share sheet (falls back to a "ready" sheet / download). */
export async function exportActive(mode: 'share' | 'download') {
  const img = findImg(st().activeId ?? '');
  if (!img) return;
  const out = await renderFiles([img], 'Exporting');
  if (!out) return;
  const note = sizeNote(out.oversize);
  if (note) st().toastMsg(note);
  const file = out.files[0];
  if (mode === 'download') {
    download(file, file.name);
    st().toastMsg(`Saved ${file.name} (${Math.round(file.size / 1024)} KB)`);
    return;
  }
  const r = await shareFiles([file]);
  if (r === 'denied') st().setReady({ files: [file], note });
  else if (r === 'unavailable') { download(file, file.name); st().toastMsg(`Saved ${file.name}`); }
}

/** Export every loaded image; ZIP download, or keep them ready to share as a set. */
export async function exportAll(presetId?: string) {
  const s = st();
  if (!s.images.length) return;
  if (presetId) s.applyPreset(presetId, s.images.map((i) => i.id));
  const out = await renderFiles(st().images, 'Batch export');
  if (!out) return;
  st().setReady({ files: out.files, note: sizeNote(out.oversize) });
}

export async function saveZip(files: File[]) {
  st().setBusy({ title: 'Creating ZIP', progress: 0 });
  try {
    const zip = await zipFiles(files, (p) => st().setBusy({ title: 'Creating ZIP', progress: p }));
    download(zip, `packshot_${stamp()}.zip`);
  } catch (e) {
    fail(e);
  } finally {
    st().setBusy(null);
  }
}
