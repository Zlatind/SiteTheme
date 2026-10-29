import { useActive, currentState, useStore } from '../../state/store';
import type { BgMode } from '../../types';
import { downloadModel, removeBackground } from '../../lib/actions';
import { Btn, Icon, Section, Seg, Slider, Toggle } from '../ui';

const SWATCHES: { mode: BgMode; label: string; color?: string }[] = [
  { mode: 'white', label: 'White', color: '#FFFFFF' },
  { mode: 'grey', label: 'Grey', color: '#F5F5F5' },
  { mode: 'custom', label: 'Custom' },
  { mode: 'transparent', label: 'None' },
];

const validHex = (s: string) => /^#[0-9a-f]{6}$/i.test(s);

export function BackgroundPanel() {
  const img = useActive();
  const update = useStore((s) => s.update);
  const brush = useStore((s) => s.brush);
  const setBrush = useStore((s) => s.setBrush);
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  if (!img) return null;
  const { params, strokes } = currentState(img);
  const bg = params.bg;
  const cut = bg.remove && !!img.mask;

  return (
    <div className="space-y-5">
      {!cut ? (
        <Btn kind="primary" className="w-full flex items-center justify-center gap-2 text-base min-h-[52px]" onClick={() => removeBackground(img.id)}>
          <Icon name="wand" size={20} /> Remove background
        </Btn>
      ) : (
        <Toggle label="Background removed" hint="Turn off to show the original background" checked={bg.remove}
          onChange={(v) => update((s) => { s.params.bg.remove = v; }, 'commit')} />
      )}

      <Section title="Fill">
        <div className="grid grid-cols-4 gap-2">
          {SWATCHES.map((sw) => (
            <button
              key={sw.mode}
              onClick={() => update((s) => { s.params.bg.mode = sw.mode; }, 'commit')}
              className={`flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-xl border-2 text-xs ${bg.mode === sw.mode ? 'border-accent' : 'border-transparent bg-ink-800'}`}
            >
              <span
                className={`h-6 w-6 rounded-md border border-white/20 ${sw.mode === 'transparent' ? 'checker' : ''}`}
                style={{ background: sw.mode === 'custom' ? bg.color : sw.color }}
              />
              {sw.label}
            </button>
          ))}
        </div>
        {bg.mode === 'custom' && (
          <div className="flex items-center gap-2">
            <input type="color" value={validHex(bg.color) ? bg.color : '#ffffff'}
              onChange={(e) => update((s) => { s.params.bg.color = e.target.value.toUpperCase(); }, 'commit')}
              className="h-11 w-14 rounded-lg bg-transparent" />
            <input
              defaultValue={bg.color}
              key={bg.color}
              maxLength={7}
              className="h-11 flex-1 rounded-lg bg-ink-800 px-3 font-mono uppercase"
              onBlur={(e) => {
                let v = e.target.value.trim();
                if (!v.startsWith('#')) v = '#' + v;
                if (validHex(v)) update((s) => { s.params.bg.color = v.toUpperCase(); }, 'commit');
              }}
            />
          </div>
        )}
      </Section>

      <Section title="Edge">
        <Slider label="Feather" unit=" px" value={bg.feather} min={0} max={10} defaultValue={1}
          onChange={(v, m) => update((s) => { s.params.bg.feather = v; }, m)} />
        <Slider label="Shrink edge" unit=" px" value={bg.shrink} min={0} max={5} defaultValue={1}
          onChange={(v, m) => update((s) => { s.params.bg.shrink = v; }, m)} />
      </Section>

      <Section title="Fix brush" right={strokes.length ? <span className="text-xs text-neutral-500">{strokes.length} strokes</span> : null}>
        <Toggle label={<span className="flex items-center gap-2"><Icon name="brush" size={16} /> Paint on the photo</span>}
          hint="One finger paints · two fingers zoom and pan"
          checked={brush.enabled} onChange={(v) => setBrush({ enabled: v })} />
        {brush.enabled && (
          <>
            <Seg value={brush.mode} onChange={(mode) => setBrush({ mode })}
              options={[{ value: 'restore', label: 'Restore' }, { value: 'erase', label: 'Erase' }]} />
            <Slider label="Brush size" unit=" px" value={brush.size} min={6} max={160} defaultValue={40}
              onChange={(v) => setBrush({ size: v })} />
          </>
        )}
        {strokes.length > 0 && (
          <Btn kind="danger" className="w-full" onClick={() => update((s) => { s.strokes = []; }, 'commit')}>Clear all strokes</Btn>
        )}
      </Section>

      <Section title="AI model">
        <Seg value={settings.model} onChange={(model) => setSettings({ model })}
          options={[{ value: 'isnet_fp16', label: 'Quality' }, { value: 'isnet_quint8', label: 'Fast' }]} />
        <Toggle label="Use GPU (experimental)" hint="Faster on some phones; turn off if it fails" checked={settings.gpu}
          onChange={(gpu) => setSettings({ gpu })} />
        <Btn className="w-full" onClick={downloadModel}>Download model for offline use</Btn>
      </Section>
    </div>
  );
}
