import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';
import type { Stroke } from '../types';
import { onFrame } from '../lib/viewer';

interface View { z: number; tx: number; ty: number }
const HOLD_MS = 280;

export function Viewport() {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<ImageBitmap | null>(null);
  const originalRef = useRef<ImageBitmap | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [aspect, setAspect] = useState(1);
  const [view, setView] = useState<View>({ z: 1, tx: 0, ty: 0 });
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;

  const activeId = useStore((s) => s.activeId);
  const showOriginal = useStore((s) => s.showOriginal);
  const brush = useStore((s) => s.brush);
  const brushOn = useStore((s) => s.tab === 'bg' && s.brush.enabled);

  // Fit the displayed image inside the box.
  const margin = 12;
  const availW = Math.max(1, box.w - margin * 2);
  const availH = Math.max(1, box.h - margin * 2);
  const dw = Math.min(availW, availH * aspect);
  const dh = dw / aspect;
  const left = (box.w - dw) / 2;
  const top = (box.h - dh) / 2;

  useLayoutEffect(() => {
    const el = boxRef.current!;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const paint = () => {
    const c = canvasRef.current;
    const bmp = useStore.getState().showOriginal && originalRef.current ? originalRef.current : frameRef.current;
    if (!c || !bmp) return;
    try {
      if (c.width !== bmp.width || c.height !== bmp.height) { c.width = bmp.width; c.height = bmp.height; }
      const ctx = c.getContext('2d')!;
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(bmp, 0, 0);
      setAspect(bmp.width / bmp.height);
    } catch { /* bitmap was closed while switching images */ }
  };

  useEffect(() => onFrame((res, original) => {
    frameRef.current?.close();
    frameRef.current = res?.bitmap ?? null;
    originalRef.current = original;
    if (!res) {
      const c = canvasRef.current;
      c?.getContext('2d')?.clearRect(0, 0, c.width, c.height);
      return;
    }
    paint();
    const o = overlayRef.current;
    o?.getContext('2d')?.clearRect(0, 0, o.width, o.height);
  }), []);

  useEffect(paint, [showOriginal]);
  useEffect(() => setView({ z: 1, tx: 0, ty: 0 }), [activeId]);

  // ---- gestures ----
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    kind: 'none' | 'hold' | 'pan' | 'pinch' | 'paint';
    start: { x: number; y: number };
    v0: View;
    d0: number;
    m0: { x: number; y: number };
    timer?: ReturnType<typeof setTimeout>;
    stroke?: Stroke;
    lastTap: number;
  }>({ kind: 'none', start: { x: 0, y: 0 }, v0: view, d0: 1, m0: { x: 0, y: 0 }, lastTap: 0 });

  const local = (p: { x: number; y: number }, v = viewRef.current) => ({
    x: (p.x - left - v.tx) / v.z,
    y: (p.y - top - v.ty) / v.z,
  });

  const rel = (e: React.PointerEvent) => {
    const r = boxRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const stopHold = () => {
    const g = gesture.current;
    clearTimeout(g.timer);
    if (useStore.getState().showOriginal) useStore.getState().setShowOriginal(false);
  };

  const drawOverlay = (s: Stroke) => {
    const o = overlayRef.current;
    if (!o) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(dw * dpr), H = Math.round(dh * dpr);
    if (o.width !== W || o.height !== H) { o.width = W; o.height = H; }
    const ctx = o.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = s.mode === 'erase' ? 'rgba(239,68,68,0.55)' : 'rgba(34,197,94,0.55)';
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = s.size * Math.max(W, H);
    const p = s.points;
    ctx.beginPath();
    if (p.length === 2) { ctx.arc(p[0] * W, p[1] * H, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill(); return; }
    ctx.moveTo(p[0] * W, p[1] * H);
    for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i] * W, p[i + 1] * H);
    ctx.stroke();
  };

  const onDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = rel(e);
    pointers.current.set(e.pointerId, p);
    const g = gesture.current;
    if (pointers.current.size === 2) {
      // Second finger: switch to pinch/pan, drop whatever single-finger action was running.
      stopHold();
      if (g.kind === 'paint') { g.stroke = undefined; const o = overlayRef.current; o?.getContext('2d')?.clearRect(0, 0, o.width, o.height); }
      const [a, b] = [...pointers.current.values()];
      g.kind = 'pinch';
      g.v0 = viewRef.current;
      g.d0 = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      g.m0 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      return;
    }
    if (pointers.current.size > 2) return;
    g.start = p;
    g.v0 = viewRef.current;
    if (brushOn) {
      const l = local(p);
      const st = useStore.getState().brush;
      g.kind = 'paint';
      g.stroke = { mode: st.mode, size: st.size / viewRef.current.z / Math.max(dw, dh), points: [l.x / dw, l.y / dh] };
      drawOverlay(g.stroke);
      setCursor(p);
      return;
    }
    g.kind = 'hold';
    g.timer = setTimeout(() => {
      if (gesture.current.kind === 'hold') useStore.getState().setShowOriginal(true);
    }, HOLD_MS);
  };

  const onMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) {
      if (brushOn && e.pointerType === 'mouse') setCursor(rel(e));
      return;
    }
    const p = rel(e);
    pointers.current.set(e.pointerId, p);
    const g = gesture.current;
    if (g.kind === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const z = Math.min(10, Math.max(1, g.v0.z * (d / g.d0)));
      const l0 = local(g.m0, g.v0);
      setView({ z, tx: m.x - left - l0.x * z, ty: m.y - top - l0.y * z });
      return;
    }
    if (g.kind === 'paint' && g.stroke) {
      const l = local(p);
      g.stroke.points.push(l.x / dw, l.y / dh);
      drawOverlay(g.stroke);
      setCursor(p);
      return;
    }
    const moved = Math.hypot(p.x - g.start.x, p.y - g.start.y);
    if (g.kind === 'hold' && moved > 10) {
      stopHold();
      g.kind = viewRef.current.z > 1 ? 'pan' : 'none';
    }
    if (g.kind === 'pan') {
      setView({ z: g.v0.z, tx: g.v0.tx + p.x - g.start.x, ty: g.v0.ty + p.y - g.start.y });
    }
  };

  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (g.kind === 'paint' && g.stroke) {
      const stroke = g.stroke;
      g.stroke = undefined;
      useStore.getState().update((s) => { s.strokes.push(stroke); }, 'commit');
    }
    if (g.kind === 'hold') {
      const now = performance.now();
      if (now - g.lastTap < 300) { setView({ z: 1, tx: 0, ty: 0 }); g.lastTap = 0; } else g.lastTap = now;
    }
    stopHold();
    if (pointers.current.size === 0) { g.kind = 'none'; if (e.pointerType !== 'mouse') setCursor(null); }
    else if (pointers.current.size === 1) {
      // Lifting one finger of a pinch continues as a pan.
      const [p] = [...pointers.current.values()];
      g.kind = 'pan'; g.start = p; g.v0 = viewRef.current;
    }
  };

  return (
    <div
      ref={boxRef}
      className="relative flex-1 overflow-hidden bg-ink-950"
      style={{ touchAction: 'none' }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onPointerLeave={() => brushOn && setCursor(null)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        className="absolute checker shadow-2xl"
        style={{
          left, top, width: dw, height: dh,
          transformOrigin: '0 0',
          transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.z})`,
          imageRendering: view.z > 2.5 ? 'pixelated' : 'auto',
        }}
      >
        <canvas ref={canvasRef} className="block h-full w-full" />
        <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full" />
      </div>
      {brushOn && cursor && (
        <div
          className="pointer-events-none absolute rounded-full border-2 border-white/90 mix-blend-difference"
          style={{ left: cursor.x - brush.size / 2, top: cursor.y - brush.size / 2, width: brush.size, height: brush.size }}
        />
      )}
      {showOriginal && (
        <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-xs">Original</div>
      )}
      {view.z > 1 && (
        <div className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/60 px-2 py-0.5 text-xs tabular-nums">{view.z.toFixed(1)}×</div>
      )}
    </div>
  );
}
