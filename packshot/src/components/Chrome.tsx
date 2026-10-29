import { useRef } from 'react';
import { useActive, useStore, type Tab } from '../state/store';
import { applyPresetToActive, exportActive, importPicked, saveZip } from '../lib/actions';
import { canShareFiles, download, shareFiles } from '../lib/share';
import { Btn, Icon } from './ui';

export function FilePicker({ children, className, capture }: { children: React.ReactNode; className?: string; capture?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button className={className} onClick={() => ref.current?.click()}>{children}</button>
      <input ref={ref} type="file" accept="image/*,.heic,.heif" multiple={!capture} capture={capture ? 'environment' : undefined}
        className="hidden" onChange={(e) => { const f = e.target.files; if (f) importPicked(Array.from(f)); e.target.value = ''; }} />
    </>
  );
}

export function Header() {
  const count = useStore((s) => s.images.length);
  const img = useActive();
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 px-3 pt-[env(safe-area-inset-top)]">
      <span className="font-bold tracking-tight">Pack<span className="text-accent">Shot</span></span>
      <span className="truncate text-xs text-neutral-500">{img ? `${img.name} · ${img.width}×${img.height}` : ''}{count > 1 ? ` · ${count} photos` : ''}</span>
      <div className="flex-1" />
      <button className="flex h-10 items-center gap-1 rounded-xl bg-accent px-3 text-sm font-semibold" onClick={() => exportActive('share')} aria-label="Export">
        <Icon name="share" size={18} /> Export
      </button>
    </header>
  );
}

export function ThumbStrip() {
  const images = useStore((s) => s.images);
  const activeId = useStore((s) => s.activeId);
  const setActive = useStore((s) => s.setActive);
  const removeImage = useStore((s) => s.removeImage);
  return (
    <div className="scroll-thin flex h-[68px] shrink-0 items-center gap-2 overflow-x-auto px-3">
      <FilePicker className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-dashed border-ink-600 text-neutral-400">
        <Icon name="plus" />
      </FilePicker>
      {images.map((img) => (
        <div key={img.id} className="relative shrink-0">
          <button onClick={() => setActive(img.id)}
            className={`block h-14 w-14 overflow-hidden rounded-xl border-2 ${img.id === activeId ? 'border-accent' : 'border-transparent'}`}>
            <img src={img.thumbUrl} alt={img.name} className="h-full w-full object-cover" draggable={false} />
          </button>
          {img.mask && <span className="pointer-events-none absolute bottom-1 left-1 h-2 w-2 rounded-full bg-green-400" />}
          {img.id === activeId && (
            <button aria-label="Remove photo" onClick={() => removeImage(img.id)}
              className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-ink-700 text-neutral-300">
              <Icon name="x" size={14} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export function PresetBar() {
  const presets = useStore((s) => s.presets);
  const activePresetId = useStore((s) => s.activePresetId);
  const img = useActive();
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const savePreset = useStore((s) => s.savePreset);
  const toastMsg = useStore((s) => s.toastMsg);
  const canUndo = !!img && img.hIndex > 0;
  const canRedo = !!img && img.hIndex < img.history.length - 1;
  return (
    <div className="flex h-12 shrink-0 items-center gap-1 border-t border-ink-800 px-2">
      <button aria-label="Undo" disabled={!canUndo} onClick={undo} className="flex h-11 w-11 items-center justify-center rounded-xl disabled:opacity-30"><Icon name="undo" /></button>
      <button aria-label="Redo" disabled={!canRedo} onClick={redo} className="flex h-11 w-11 items-center justify-center rounded-xl disabled:opacity-30"><Icon name="redo" /></button>
      <div className="mx-1 h-6 w-px bg-ink-700" />
      <div className="scroll-thin flex flex-1 items-center gap-2 overflow-x-auto">
        {presets.map((p) => (
          <button key={p.id} onClick={() => applyPresetToActive(p.id)}
            className={`h-9 shrink-0 rounded-full px-4 text-sm font-medium ${p.id === activePresetId ? 'bg-accent text-white' : 'bg-ink-800 text-neutral-300'}`}>
            {p.name}
          </button>
        ))}
        <button className="h-9 shrink-0 rounded-full border border-dashed border-ink-600 px-3 text-sm text-neutral-400"
          onClick={() => {
            const n = prompt('Save current settings as preset', `Preset ${presets.length + 1}`);
            if (n !== null) { const p = savePreset(n); if (p) toastMsg(`Saved preset “${p.name}”`); }
          }}>
          + Preset
        </button>
      </div>
    </div>
  );
}

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'bg', label: 'Background', icon: 'bg' },
  { id: 'adjust', label: 'Adjust', icon: 'adjust' },
  { id: 'frame', label: 'Frame', icon: 'frame' },
  { id: 'export', label: 'Export', icon: 'export' },
];

export function TabBar() {
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  return (
    <nav className="grid shrink-0 grid-cols-4 border-t border-ink-800 bg-ink-900 pb-[env(safe-area-inset-bottom)]">
      {TABS.map((t) => (
        <button key={t.id} onClick={() => setTab(t.id)}
          className={`flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${tab === t.id ? 'text-accent' : 'text-neutral-400'}`}>
          <Icon name={t.icon} size={20} />
          {t.label}
        </button>
      ))}
    </nav>
  );
}

export function BusyOverlay() {
  const busy = useStore((s) => s.busy);
  if (!busy) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 pb-[calc(env(safe-area-inset-bottom)+16px)]">
      <div className="w-full max-w-md space-y-3 rounded-2xl bg-ink-800 p-5 shadow-2xl">
        <div className="font-semibold">{busy.title}</div>
        <div className="h-2 overflow-hidden rounded-full bg-ink-600">
          {busy.progress === null
            ? <div className="indeterminate h-full rounded-full bg-accent" />
            : <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${Math.round(busy.progress * 100)}%` }} />}
        </div>
        <div className="min-h-[1.25rem] text-sm text-neutral-400">{busy.label}</div>
        {busy.cancel && <Btn className="w-full" onClick={busy.cancel}>Cancel</Btn>}
      </div>
    </div>
  );
}

export function ReadySheet() {
  const ready = useStore((s) => s.ready);
  const setReady = useStore((s) => s.setReady);
  if (!ready) return null;
  const { files, note } = ready;
  const total = files.reduce((a, f) => a + f.size, 0);
  const canShare = canShareFiles(files);
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-4 pb-[calc(env(safe-area-inset-bottom)+16px)]" onClick={() => setReady(null)}>
      <div className="w-full max-w-md space-y-3 rounded-2xl bg-ink-800 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="font-semibold">{files.length === 1 ? files[0].name : `${files.length} photos ready`}</div>
        <div className="text-sm text-neutral-400">{(total / 1048576).toFixed(2)} MB total{note ? ` · ${note}` : ''}</div>
        {canShare && (
          <Btn kind="primary" className="w-full" onClick={async () => { const r = await shareFiles(files); if (r === 'shared') setReady(null); }}>
            Share {files.length > 1 ? 'all' : ''}
          </Btn>
        )}
        {files.length > 1
          ? <Btn className="w-full" onClick={() => saveZip(files)}>Download ZIP</Btn>
          : <Btn className="w-full" onClick={() => { download(files[0], files[0].name); setReady(null); }}>Download</Btn>}
        <Btn className="w-full" onClick={() => setReady(null)}>Close</Btn>
      </div>
    </div>
  );
}

export function Toast() {
  const toast = useStore((s) => s.toast);
  if (!toast) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-16 z-[60] flex justify-center px-4">
      <div className="rounded-xl bg-ink-700/95 px-4 py-2 text-sm shadow-xl">{toast}</div>
    </div>
  );
}

export function ImportScreen() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="text-3xl font-bold tracking-tight">Pack<span className="text-accent">Shot</span></div>
      <p className="max-w-xs text-sm text-neutral-400">Product photos for marketplaces: cutout, white background, framing and export — all on your phone, offline.</p>
      <FilePicker className="flex min-h-[56px] w-full max-w-xs items-center justify-center gap-2 rounded-2xl bg-accent text-base font-semibold">
        <Icon name="images" /> Choose photos
      </FilePicker>
      <FilePicker capture className="flex min-h-[52px] w-full max-w-xs items-center justify-center gap-2 rounded-2xl bg-ink-700 text-base font-semibold">
        <Icon name="camera" /> Take photo
      </FilePicker>
      <p className="text-xs text-neutral-600">JPG · PNG · WEBP · HEIC</p>
    </div>
  );
}
