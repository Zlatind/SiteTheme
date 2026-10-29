import { useState } from 'react';
import { useActive, useStore } from '../../state/store';
import type { ExportFormat } from '../../types';
import { exportActive, exportAll } from '../../lib/actions';
import { extOf } from '../../lib/encode';
import { formatName } from '../../lib/filename';
import { Btn, Icon, Section, Seg, Slider } from '../ui';

const SIZE_LIMITS = [0, 500, 1024, 2048];
const kbLabel = (kb: number) => (kb === 0 ? 'No limit' : kb >= 1024 ? `< ${kb / 1024} MB` : `< ${kb} KB`);

export function ExportPanel() {
  const img = useActive();
  const images = useStore((s) => s.images);
  const ex = useStore((s) => s.exportSettings);
  const setExport = useStore((s) => s.setExport);
  const presets = useStore((s) => s.presets);
  const activePresetId = useStore((s) => s.activePresetId);
  const savePreset = useStore((s) => s.savePreset);
  const deletePreset = useStore((s) => s.deletePreset);
  const renamePreset = useStore((s) => s.renamePreset);
  const toastMsg = useStore((s) => s.toastMsg);
  const [name, setName] = useState('');
  if (!img) return null;

  const index = images.findIndex((i) => i.id === img.id) + 1;
  const example = formatName(ex.pattern, { name: img.name, index, preset: img.presetName }, extOf(ex.format));
  const lossy = ex.format !== 'png';

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2">
        <Btn kind="primary" className="flex items-center justify-center gap-2" onClick={() => exportActive('share')}>
          <Icon name="share" size={18} /> Share
        </Btn>
        <Btn className="flex items-center justify-center gap-2" onClick={() => exportActive('download')}>
          <Icon name="export" size={18} /> Save
        </Btn>
      </div>
      {images.length > 1 && (
        <Btn className="w-full" onClick={() => exportAll()}>Export all {images.length} photos</Btn>
      )}

      <Section title="Format">
        <Seg<ExportFormat> value={ex.format} onChange={(format) => setExport({ format })}
          options={[{ value: 'jpeg', label: 'JPG' }, { value: 'png', label: 'PNG' }, { value: 'webp', label: 'WEBP' }]} />
        {lossy && (
          <Slider label="Quality" value={ex.quality} min={40} max={100} defaultValue={90}
            onChange={(quality) => setExport({ quality })} />
        )}
        <div className="grid grid-cols-4 gap-2">
          {SIZE_LIMITS.map((kb) => (
            <button key={kb} onClick={() => setExport({ maxKB: kb })}
              className={`min-h-[44px] rounded-xl text-xs font-medium ${ex.maxKB === kb ? 'bg-accent text-white' : 'bg-ink-800 text-neutral-300'}`}>
              {kbLabel(kb)}
            </button>
          ))}
        </div>
        {ex.maxKB > 0 && !lossy && <p className="px-1 text-xs text-amber-400">PNG can't be compressed to a size — use JPG or WEBP.</p>}
        {ex.maxKB > 0 && lossy && <p className="px-1 text-xs text-neutral-500">Quality is lowered automatically until the file fits.</p>}
      </Section>

      <Section title="File name">
        <input value={ex.pattern} onChange={(e) => setExport({ pattern: e.target.value })}
          className="h-11 w-full rounded-lg bg-ink-800 px-3 font-mono text-sm" spellCheck={false} autoCapitalize="off" />
        <div className="flex gap-2">
          {['{name}', '{index}', '{preset}'].map((t) => (
            <button key={t} className="min-h-[36px] rounded-lg bg-ink-700 px-3 font-mono text-xs"
              onClick={() => setExport({ pattern: ex.pattern + (ex.pattern && !ex.pattern.endsWith('_') ? '_' : '') + t })}>{t}</button>
          ))}
        </div>
        <p className="px-1 text-xs text-neutral-500 break-all">→ {example}</p>
      </Section>

      <Section title="Presets">
        <p className="px-1 text-xs text-neutral-500">Saves background, tone, frame and these export settings.</p>
        <div className="flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Preset name"
            className="h-11 min-w-0 flex-1 rounded-lg bg-ink-800 px-3 text-sm" />
          <Btn kind="primary" onClick={() => { const p = savePreset(name); if (p) { setName(''); toastMsg(`Saved preset “${p.name}”`); } }}>Save</Btn>
        </div>
        {presets.map((p) => (
          <div key={p.id} className={`flex items-center gap-2 rounded-xl px-3 py-1 ${p.id === activePresetId ? 'bg-accent/15' : 'bg-ink-800'}`}>
            <span className="flex-1 truncate text-sm">{p.name}</span>
            <button className="min-h-[44px] px-2 text-xs text-neutral-400" onClick={() => {
              const n = prompt('Rename preset', p.name);
              if (n?.trim()) renamePreset(p.id, n.trim());
            }}>Rename</button>
            <button className="min-h-[44px] px-2 text-xs text-red-400" onClick={() => { if (confirm(`Delete “${p.name}”?`)) deletePreset(p.id); }}>Delete</button>
          </div>
        ))}
        {presets.length > 0 && images.length > 0 && (
          <Btn kind="primary" className="w-full" disabled={!activePresetId}
            onClick={() => activePresetId && exportAll(activePresetId)}>
            Apply “{presets.find((p) => p.id === activePresetId)?.name ?? 'select a preset'}” to all {images.length} & export
          </Btn>
        )}
      </Section>
    </div>
  );
}
