import type { EditParams, ExportSettings, FramePresetId, Tone } from '../types';

export const PREVIEW_MAX = 2048;
export const FAST_MAX = 1024;
export const HISTORY_LIMIT = 50;

export const TONE_KEYS: { key: keyof Tone; label: string }[] = [
  { key: 'exposure', label: 'Exposure' },
  { key: 'brightness', label: 'Brightness' },
  { key: 'contrast', label: 'Contrast' },
  { key: 'highlights', label: 'Highlights' },
  { key: 'shadows', label: 'Shadows' },
  { key: 'whites', label: 'Whites' },
  { key: 'blacks', label: 'Blacks' },
  { key: 'saturation', label: 'Saturation' },
  { key: 'warmth', label: 'Warmth' },
  { key: 'sharpness', label: 'Sharpness' },
];

export const zeroTone = (): Tone => ({
  brightness: 0, contrast: 0, exposure: 0, highlights: 0, shadows: 0,
  whites: 0, blacks: 0, saturation: 0, warmth: 0, sharpness: 0,
});

export const FRAME_PRESETS: { id: FramePresetId; label: string; w: number; h: number }[] = [
  { id: 'sq2000', label: '1:1 2000', w: 2000, h: 2000 },
  { id: 'sq1500', label: '1:1 1500', w: 1500, h: 1500 },
  { id: 'p3x4', label: '3:4 1500×2000', w: 1500, h: 2000 },
  { id: 'p4x5', label: '4:5 1600×2000', w: 1600, h: 2000 },
  { id: 'custom', label: 'Custom', w: 2000, h: 2000 },
];

export const defaultParams = (): EditParams => ({
  bg: { remove: false, mode: 'white', color: '#FFFFFF', feather: 1, shrink: 1 },
  tone: zeroTone(),
  frame: { enabled: false, preset: 'sq2000', width: 2000, height: 2000, padding: 5, align: 'center' },
});

export const defaultExport = (): ExportSettings => ({
  format: 'jpeg',
  quality: 90,
  maxKB: 0,
  pattern: '{name}_{index}',
});

export const bgColor = (p: EditParams): string | null => {
  switch (p.bg.mode) {
    case 'white': return '#FFFFFF';
    case 'grey': return '#F5F5F5';
    case 'custom': return p.bg.color;
    case 'transparent': return null;
  }
};

export const clone = <T,>(v: T): T => structuredClone(v);

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
