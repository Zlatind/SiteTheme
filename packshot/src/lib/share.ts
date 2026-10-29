export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const canShareFiles = (files: File[]) => {
  try { return !!navigator.canShare?.({ files }); } catch { return false; }
};

export type ShareOutcome = 'shared' | 'cancelled' | 'denied' | 'unavailable';

/** Opens the share sheet. 'denied' usually means the tap's user activation expired during a long export. */
export async function shareFiles(files: File[]): Promise<ShareOutcome> {
  if (!canShareFiles(files)) return 'unavailable';
  try {
    await navigator.share({ files });
    return 'shared';
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
    if (e instanceof DOMException && e.name === 'NotAllowedError') return 'denied';
    return 'unavailable';
  }
}

export async function zipFiles(files: File[], onProgress?: (p: number) => void): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  for (const f of files) zip.file(f.name, f);
  // Images are already compressed: STORE is much faster and saves memory.
  return zip.generateAsync({ type: 'blob', compression: 'STORE' }, (m) => onProgress?.(m.percent / 100));
}

export const stamp = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
};
