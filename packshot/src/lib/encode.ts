import type { ExportSettings } from '../types';

export const mimeOf = (f: ExportSettings['format']) => `image/${f}`;
export const extOf = (f: ExportSettings['format']) => (f === 'jpeg' ? 'jpg' : f);

export interface EncodeResult { blob: Blob; quality: number; fits: boolean }

/**
 * Encodes the canvas. With a size limit, binary-searches quality (JPG/WEBP)
 * for the highest value that still fits. Canvas encoding never carries EXIF.
 */
export async function encodeCanvas(canvas: OffscreenCanvas, s: ExportSettings): Promise<EncodeResult> {
  const type = mimeOf(s.format);
  if (s.format === 'png') {
    const blob = await canvas.convertToBlob({ type });
    return { blob, quality: 100, fits: !s.maxKB || blob.size <= s.maxKB * 1024 };
  }
  const limit = s.maxKB * 1024;
  const q0 = s.quality / 100;
  const first = await canvas.convertToBlob({ type, quality: q0 });
  if (!limit || first.size <= limit) return { blob: first, quality: s.quality, fits: true };

  let lo = 0.05;
  let hi = q0;
  let best: Blob | null = null;
  let bestQ = lo;
  for (let i = 0; i < 7; i++) {
    const mid = (lo + hi) / 2;
    const b = await canvas.convertToBlob({ type, quality: mid });
    if (b.size <= limit) { best = b; bestQ = mid; lo = mid; } else { hi = mid; }
  }
  if (!best) {
    const b = await canvas.convertToBlob({ type, quality: 0.05 });
    return { blob: b, quality: 5, fits: b.size <= limit };
  }
  return { blob: best, quality: Math.round(bestQ * 100), fits: true };
}
