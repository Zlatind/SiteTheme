import type { ImageItem } from '../types';
import { defaultParams, uid } from './defaults';
import { engine } from './engine';
import { rememberThumb } from '../state/persist';

const isHeic = (f: File) => /image\/hei[cf]/i.test(f.type) || /\.(heic|heif)$/i.test(f.name);
export const stripExt = (name: string) => name.replace(/\.[^.]+$/, '') || 'image';

async function heicToJpeg(file: File): Promise<Blob> {
  const { default: heic2any } = await import('heic2any');
  const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.95 });
  return Array.isArray(out) ? out[0] : out;
}

/** Imports files one by one (keeps memory low). Unsupported files are skipped and reported. */
export async function importFiles(
  files: File[],
  onProgress: (done: number, total: number) => void,
  isCancelled: () => boolean,
): Promise<{ items: ImageItem[]; failed: string[] }> {
  const items: ImageItem[] = [];
  const failed: string[] = [];
  for (let i = 0; i < files.length; i++) {
    if (isCancelled()) break;
    const file = files[i];
    onProgress(i, files.length);
    try {
      let blob: Blob = file;
      let info;
      try {
        info = await engine.import(blob);
      } catch (err) {
        // Chrome can't decode HEIC natively — convert, then retry.
        if (!isHeic(file)) throw err;
        blob = await heicToJpeg(file);
        info = await engine.import(blob);
      }
      const id = uid();
      rememberThumb(id, info.thumb);
      items.push({
        id,
        name: stripExt(file.name),
        blob,
        width: info.width,
        height: info.height,
        thumbUrl: URL.createObjectURL(info.thumb),
        history: [{ params: defaultParams(), strokes: [] }],
        hIndex: 0,
        live: false,
      });
    } catch (e) {
      console.warn('Import failed', file.name, e);
      failed.push(file.name);
    }
  }
  onProgress(files.length, files.length);
  return { items, failed };
}
