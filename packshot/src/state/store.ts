import { create } from 'zustand';
import type { EditState, ExportSettings, ImageItem, Mask, Preset } from '../types';
import { HISTORY_LIMIT, clone, defaultExport, uid } from '../lib/defaults';
import type { ModelId } from '../lib/engine';

export type Tab = 'bg' | 'adjust' | 'frame' | 'export';

export interface Busy {
  title: string;
  label?: string;
  progress: number | null; // 0..1, null = indeterminate
  cancel?: () => void;
}

export interface BrushState {
  enabled: boolean;
  mode: 'restore' | 'erase';
  size: number; // screen px
}

export interface AppSettings {
  model: ModelId;
  gpu: boolean;
  autoRemoveOnPreset: boolean;
}

export interface ReadyFiles {
  files: File[];
  note?: string;
}

interface State {
  ready: ReadyFiles | null;
  setReady: (r: ReadyFiles | null) => void;
  images: ImageItem[];
  activeId: string | null;
  tab: Tab;
  exportSettings: ExportSettings;
  presets: Preset[];
  activePresetId: string | null;
  brush: BrushState;
  settings: AppSettings;
  interacting: boolean;
  showOriginal: boolean;
  busy: Busy | null;
  toast: string | null;

  addImages: (items: ImageItem[]) => void;
  removeImage: (id: string) => void;
  setActive: (id: string) => void;
  setTab: (t: Tab) => void;
  update: (fn: (s: EditState) => void, mode: 'live' | 'commit', id?: string) => void;
  undo: () => void;
  redo: () => void;
  setMask: (id: string, mask: Mask | undefined) => void;
  setExport: (patch: Partial<ExportSettings>) => void;
  setBrush: (patch: Partial<BrushState>) => void;
  setSettings: (patch: Partial<AppSettings>) => void;
  setInteracting: (v: boolean) => void;
  setShowOriginal: (v: boolean) => void;
  setBusy: (b: Busy | null) => void;
  toastMsg: (msg: string) => void;
  savePreset: (name: string) => Preset | null;
  deletePreset: (id: string) => void;
  renamePreset: (id: string, name: string) => void;
  applyPreset: (id: string, imageIds: string[]) => void;
  hydrate: (patch: Partial<State>) => void;
}

export const currentState = (img: ImageItem): EditState => img.history[img.hIndex];

function pushState(img: ImageItem, next: EditState, mode: 'live' | 'commit'): ImageItem {
  let { history, hIndex, live } = img;
  if (live) {
    // A running slider drag updates its own history entry in place.
    history = [...history.slice(0, hIndex), next];
  } else {
    history = [...history.slice(0, hIndex + 1), next];
    hIndex++;
  }
  live = mode === 'live';
  if (history.length > HISTORY_LIMIT) {
    const drop = history.length - HISTORY_LIMIT;
    history = history.slice(drop);
    hIndex -= drop;
  }
  return { ...img, history, hIndex, live };
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useStore = create<State>((set, get) => ({
  ready: null,
  setReady: (ready) => set({ ready }),
  images: [],
  activeId: null,
  tab: 'bg',
  exportSettings: defaultExport(),
  presets: [],
  activePresetId: null,
  brush: { enabled: false, mode: 'erase', size: 40 },
  settings: { model: 'isnet_fp16', gpu: false, autoRemoveOnPreset: true },
  interacting: false,
  showOriginal: false,
  busy: null,
  toast: null,

  addImages: (items) =>
    set((s) => ({ images: [...s.images, ...items], activeId: s.activeId ?? items[0]?.id ?? null })),

  removeImage: (id) =>
    set((s) => {
      const idx = s.images.findIndex((i) => i.id === id);
      if (idx < 0) return {};
      URL.revokeObjectURL(s.images[idx].thumbUrl);
      const images = s.images.filter((i) => i.id !== id);
      const activeId = s.activeId === id ? images[Math.min(idx, images.length - 1)]?.id ?? null : s.activeId;
      return { images, activeId };
    }),

  setActive: (id) => set({ activeId: id, brush: { ...get().brush, enabled: false } }),
  setTab: (tab) => set((s) => ({ tab, brush: tab === 'bg' ? s.brush : { ...s.brush, enabled: false } })),

  update: (fn, mode, id) =>
    set((s) => {
      const target = id ?? s.activeId;
      return {
        images: s.images.map((img) => {
          if (img.id !== target) return img;
          const next = clone(currentState(img));
          fn(next);
          return pushState(img, next, mode);
        }),
      };
    }),

  undo: () =>
    set((s) => ({
      images: s.images.map((img) =>
        img.id === s.activeId && img.hIndex > 0 ? { ...img, hIndex: img.hIndex - 1, live: false } : img,
      ),
    })),

  redo: () =>
    set((s) => ({
      images: s.images.map((img) =>
        img.id === s.activeId && img.hIndex < img.history.length - 1 ? { ...img, hIndex: img.hIndex + 1, live: false } : img,
      ),
    })),

  setMask: (id, mask) => set((s) => ({ images: s.images.map((img) => (img.id === id ? { ...img, mask } : img)) })),
  setExport: (patch) => set((s) => ({ exportSettings: { ...s.exportSettings, ...patch } })),
  setBrush: (patch) => set((s) => ({ brush: { ...s.brush, ...patch } })),
  setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
  setInteracting: (interacting) => set({ interacting }),
  setShowOriginal: (showOriginal) => set({ showOriginal }),
  setBusy: (busy) => set({ busy }),

  toastMsg: (toast) => {
    clearTimeout(toastTimer);
    set({ toast });
    toastTimer = setTimeout(() => set({ toast: null }), 2600);
  },

  savePreset: (name) => {
    const s = get();
    const img = s.images.find((i) => i.id === s.activeId);
    if (!img) return null;
    const preset: Preset = {
      id: uid(),
      name: name.trim() || `Preset ${s.presets.length + 1}`,
      params: clone(currentState(img).params),
      exportSettings: clone(s.exportSettings),
    };
    set({ presets: [...s.presets, preset], activePresetId: preset.id });
    return preset;
  },

  deletePreset: (id) =>
    set((s) => ({ presets: s.presets.filter((p) => p.id !== id), activePresetId: s.activePresetId === id ? null : s.activePresetId })),

  renamePreset: (id, name) =>
    set((s) => ({ presets: s.presets.map((p) => (p.id === id ? { ...p, name } : p)) })),

  applyPreset: (id, imageIds) =>
    set((s) => {
      const preset = s.presets.find((p) => p.id === id);
      if (!preset) return {};
      const ids = new Set(imageIds);
      return {
        activePresetId: id,
        exportSettings: clone(preset.exportSettings),
        images: s.images.map((img) => {
          if (!ids.has(img.id)) return img;
          const next: EditState = { params: clone(preset.params), strokes: currentState(img).strokes };
          return { ...pushState({ ...img, live: false }, next, 'commit'), presetName: preset.name };
        }),
      };
    }),

  hydrate: (patch) => set(patch),
}));

export const useActive = () => useStore((s) => s.images.find((i) => i.id === s.activeId) ?? null);
