import { createStore, del, get, set } from 'idb-keyval';
import type { EditState, ExportSettings, ImageItem, Mask, Preset } from '../types';
import { useStore, type AppSettings } from './store';

const db = createStore('packshot', 'kv');

interface SessionIndex {
  order: string[];
  activeId: string | null;
  exportSettings: ExportSettings;
  activePresetId: string | null;
  settings: AppSettings;
}

interface StoredImage {
  id: string;
  name: string;
  blob: Blob;
  thumb: Blob;
  width: number;
  height: number;
  mask?: Mask;
  history: EditState[];
  hIndex: number;
  presetName?: string;
}

// Thumbnails are kept as blobs so a restored session doesn't need re-decoding.
const thumbBlobs = new Map<string, Blob>();
export const rememberThumb = (id: string, blob: Blob) => thumbBlobs.set(id, blob);

export async function restore() {
  const [presets, index] = await Promise.all([
    get<Preset[]>('presets', db),
    get<SessionIndex>('session', db),
  ]);
  const images: ImageItem[] = [];
  if (index) {
    for (const id of index.order) {
      const s = await get<StoredImage>(`img:${id}`, db);
      if (!s) continue;
      thumbBlobs.set(id, s.thumb);
      images.push({
        id: s.id, name: s.name, blob: s.blob, width: s.width, height: s.height,
        thumbUrl: URL.createObjectURL(s.thumb), mask: s.mask,
        history: s.history, hIndex: s.hIndex, live: false, presetName: s.presetName,
      });
    }
  }
  const st = useStore.getState();
  st.hydrate({
    presets: presets ?? [],
    images,
    activeId: images.find((i) => i.id === index?.activeId)?.id ?? images[0]?.id ?? null,
    exportSettings: index?.exportSettings ?? st.exportSettings,
    activePresetId: index?.activePresetId ?? null,
    settings: { ...st.settings, ...index?.settings },
  });
}

let timer: ReturnType<typeof setTimeout> | undefined;
let saved = new Map<string, ImageItem>();
let chain: Promise<void> = Promise.resolve();

async function saveSession() {
  const s = useStore.getState();
  const index: SessionIndex = {
    order: s.images.map((i) => i.id),
    activeId: s.activeId,
    exportSettings: s.exportSettings,
    activePresetId: s.activePresetId,
    settings: s.settings,
  };
  const next = new Map<string, ImageItem>();
  for (const img of s.images) {
    next.set(img.id, img);
    if (saved.get(img.id) === img) continue;
    const thumb = thumbBlobs.get(img.id);
    if (!thumb) continue;
    const rec: StoredImage = {
      id: img.id, name: img.name, blob: img.blob, thumb, width: img.width, height: img.height,
      mask: img.mask, history: img.history, hIndex: img.hIndex, presetName: img.presetName,
    };
    try { await set(`img:${img.id}`, rec, db); } catch (e) { console.warn('Session save failed', e); }
  }
  for (const id of saved.keys()) if (!next.has(id)) { await del(`img:${id}`, db); thumbBlobs.delete(id); }
  saved = next;
  await set('session', index, db);
}

export function startPersistence() {
  saved = new Map(useStore.getState().images.map((i) => [i.id, i]));
  let lastPresets = useStore.getState().presets;
  useStore.subscribe((s, prev) => {
    if (s.presets !== lastPresets) {
      lastPresets = s.presets;
      set('presets', s.presets, db).catch(() => {});
    }
    if (
      s.images !== prev.images || s.activeId !== prev.activeId || s.exportSettings !== prev.exportSettings ||
      s.settings !== prev.settings || s.activePresetId !== prev.activePresetId
    ) {
      clearTimeout(timer);
      const tick = () => {
        if (useStore.getState().interacting || useStore.getState().busy) timer = setTimeout(tick, 1200);
        else chain = chain.then(saveSession).catch((e) => console.warn(e));
      };
      timer = setTimeout(tick, 1200);
    }
  });
}
