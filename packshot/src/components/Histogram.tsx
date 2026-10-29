import { useEffect, useRef } from 'react';
import { onFrame } from '../lib/viewer';

export function Histogram() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => onFrame((res) => {
    const c = ref.current;
    if (!c || !res) return;
    const ctx = c.getContext('2d')!;
    const W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);
    const h = res.hist;
    let max = 1;
    for (let i = 1; i < 255; i++) max = Math.max(max, h[i]);
    ctx.fillStyle = 'rgba(229,229,229,0.75)';
    for (let i = 0; i < 256; i++) {
      const v = Math.min(1, Math.sqrt(h[i] / max));
      ctx.fillRect((i / 256) * W, H - v * H, W / 256 + 0.5, v * H);
    }
    // Clipping warnings at both ends.
    const total = h.reduce((a, b) => a + b, 0) || 1;
    if (h[0] / total > 0.01) { ctx.fillStyle = '#3b82f6'; ctx.fillRect(0, 0, 3, H); }
    if (h[255] / total > 0.01) { ctx.fillStyle = '#ef4444'; ctx.fillRect(W - 3, 0, 3, H); }
  }), []);
  return <canvas ref={ref} width={512} height={96} className="h-12 w-full rounded-lg bg-ink-800" />;
}
