import type { EditState, ExportSettings, Mask, Tone } from '../types';
import { WorkerClient, type RpcProgress } from '../workers/rpc';

export const renderWorker = new WorkerClient(
  () => new Worker(new URL('../workers/render.worker.ts', import.meta.url), { type: 'module' }),
);
export const bgWorker = new WorkerClient(
  () => new Worker(new URL('../workers/bg.worker.ts', import.meta.url), { type: 'module' }),
);

export interface RenderResult { bitmap: ImageBitmap; hist: Uint32Array; w: number; h: number }
export interface ExportResult { blob: Blob; quality: number; fits: boolean; w: number; h: number }

export const engine = {
  import: (blob: Blob) => renderWorker.call<{ width: number; height: number; thumb: Blob }>('import', { blob }),
  load: (id: string, blob: Blob, mask: Mask | null) =>
    renderWorker.call<{ original: ImageBitmap; pw: number; ph: number }>('load', { id, blob, mask }),
  setMask: (id: string, mask: Mask | null) => renderWorker.call<boolean>('setMask', { id, mask }),
  previewRGBA: (id: string) => renderWorker.call<{ buf: ArrayBuffer; w: number; h: number }>('previewRGBA', { id }),
  render: (id: string, state: EditState, view: 'final' | 'edit', fast: boolean) =>
    renderWorker.call<RenderResult>('render', { id, state, view, fast }),
  auto: (id: string, state: EditState) => renderWorker.call<Partial<Tone>>('auto', { id, state }),
  export: (blob: Blob, state: EditState, mask: Mask | null, settings: ExportSettings, onProgress?: (p: RpcProgress) => void) =>
    renderWorker.call<ExportResult>('export', { blob, state, mask, settings }, [], onProgress),
};

export type ModelId = 'isnet_fp16' | 'isnet_quint8';

export const bgEngine = {
  preload: (model: ModelId, gpu: boolean, onProgress?: (p: RpcProgress) => void) =>
    bgWorker.call<boolean>('preload', { model, gpu }, [], onProgress),
  segment: (buf: ArrayBuffer, w: number, h: number, model: ModelId, gpu: boolean, onProgress?: (p: RpcProgress) => void) =>
    bgWorker.call<Mask>('segment', { buf, w, h, model, gpu }, [buf], onProgress),
  cancel: () => bgWorker.terminate(),
};

/** Human readable model download / inference progress. */
export function describeBgProgress(p: RpcProgress): { label: string; value: number | null } {
  if (p.key.startsWith('fetch:')) {
    const what = p.key.includes('/models/') ? 'Downloading model' : 'Downloading runtime';
    const mb = (n: number) => (n / 1048576).toFixed(1);
    return { label: `${what} ${mb(p.current)} / ${mb(p.total)} MB`, value: p.total ? p.current / p.total : null };
  }
  return { label: 'Removing background…', value: null };
}
