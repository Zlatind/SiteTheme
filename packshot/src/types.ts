export type BgMode = 'white' | 'grey' | 'custom' | 'transparent';

export interface BgSettings {
  remove: boolean;
  mode: BgMode;
  color: string; // used when mode === 'custom'
  feather: number; // 0..10 px (preview scale)
  shrink: number; // 0..5 px (preview scale)
}

export interface Tone {
  brightness: number;
  contrast: number;
  exposure: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  saturation: number;
  warmth: number;
  sharpness: number;
}

export type ToneKey = keyof Tone;

export type FramePresetId = 'sq2000' | 'sq1500' | 'p3x4' | 'p4x5' | 'custom';

export interface FrameSettings {
  enabled: boolean; // auto-crop to product + canvas preset
  preset: FramePresetId;
  width: number;
  height: number;
  padding: number; // percent of each side, 0..30
  align: 'center' | 'bottom';
}

export interface EditParams {
  bg: BgSettings;
  tone: Tone;
  frame: FrameSettings;
}

export interface Stroke {
  mode: 'restore' | 'erase';
  size: number; // brush diameter, relative to the image's long side
  points: number[]; // flat [x0, y0, x1, y1, ...] normalized 0..1
}

export interface EditState {
  params: EditParams;
  strokes: Stroke[];
}

export type ExportFormat = 'jpeg' | 'png' | 'webp';

export interface ExportSettings {
  format: ExportFormat;
  quality: number; // 1..100
  maxKB: number; // 0 = no limit
  pattern: string;
}

export interface Preset {
  id: string;
  name: string;
  params: EditParams;
  exportSettings: ExportSettings;
}

export interface Mask {
  w: number;
  h: number;
  data: Uint8Array;
}

export interface ImageItem {
  id: string;
  name: string; // original file name without extension
  blob: Blob; // original (HEIC already converted)
  width: number; // full resolution, orientation applied
  height: number;
  thumbUrl: string;
  mask?: Mask; // AI cutout at preview resolution
  history: EditState[];
  hIndex: number;
  live: boolean; // a slider drag is updating history[hIndex] in place
  presetName?: string;
}
