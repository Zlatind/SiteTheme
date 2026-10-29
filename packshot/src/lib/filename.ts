const clean = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').trim();

/** Expands {name}, {index} (zero-padded to 2 digits) and {preset}. */
export function formatName(pattern: string, t: { name: string; index: number; preset?: string }, ext: string) {
  const base = (pattern || '{name}')
    .replace(/\{name\}/g, t.name)
    .replace(/\{index\}/g, String(t.index).padStart(2, '0'))
    .replace(/\{preset\}/g, t.preset || 'custom');
  return `${clean(base) || 'image'}.${ext}`;
}

/** Makes names unique within one export batch: a.jpg, a-2.jpg, ... */
export function uniqueNames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((n) => {
    const key = n.toLowerCase();
    const c = (seen.get(key) ?? 0) + 1;
    seen.set(key, c);
    if (c === 1) return n;
    const dot = n.lastIndexOf('.');
    return `${n.slice(0, dot)}-${c}${n.slice(dot)}`;
  });
}
