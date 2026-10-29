import { useActive, currentState, useStore } from '../../state/store';
import { FRAME_PRESETS } from '../../lib/defaults';
import { Section, Seg, Slider, Toggle } from '../ui';

const clampDim = (v: number) => Math.max(100, Math.min(8000, Math.round(v) || 0));

export function FramePanel() {
  const img = useActive();
  const update = useStore((s) => s.update);
  if (!img) return null;
  const { params } = currentState(img);
  const f = params.frame;
  const hasCut = !!img.mask && params.bg.remove;

  return (
    <div className="space-y-5">
      <Toggle label="Marketplace frame" hint={hasCut ? 'Crops to the product and places it on the canvas' : 'Tip: remove the background first so the crop finds the product'}
        checked={f.enabled} onChange={(v) => update((s) => { s.params.frame.enabled = v; }, 'commit')} />

      <div className={f.enabled ? 'space-y-5' : 'pointer-events-none space-y-5 opacity-40'}>
        <Section title="Canvas">
          <div className="grid grid-cols-3 gap-2">
            {FRAME_PRESETS.map((p) => (
              <button key={p.id}
                onClick={() => update((s) => {
                  s.params.frame.preset = p.id;
                  if (p.id !== 'custom') { s.params.frame.width = p.w; s.params.frame.height = p.h; }
                }, 'commit')}
                className={`min-h-[48px] rounded-xl px-2 text-xs font-medium ${f.preset === p.id ? 'bg-accent text-white' : 'bg-ink-800 text-neutral-300'}`}>
                {p.label}
              </button>
            ))}
          </div>
          {f.preset === 'custom' && (
            <div className="flex items-center gap-2">
              <input type="number" inputMode="numeric" defaultValue={f.width} key={`w${f.width}`}
                className="h-11 w-full rounded-lg bg-ink-800 px-3 tabular-nums"
                onBlur={(e) => update((s) => { s.params.frame.width = clampDim(+e.target.value); }, 'commit')} />
              <span className="text-neutral-500">×</span>
              <input type="number" inputMode="numeric" defaultValue={f.height} key={`h${f.height}`}
                className="h-11 w-full rounded-lg bg-ink-800 px-3 tabular-nums"
                onBlur={(e) => update((s) => { s.params.frame.height = clampDim(+e.target.value); }, 'commit')} />
            </div>
          )}
          <p className="px-1 text-xs text-neutral-500">Output {f.width} × {f.height} px</p>
        </Section>

        <Section title="Placement">
          <Slider label="Padding (each side)" unit="%" value={f.padding} min={0} max={30} step={0.5} defaultValue={5}
            onChange={(v, m) => update((s) => { s.params.frame.padding = v; }, m)} />
          <Seg value={f.align} onChange={(align) => update((s) => { s.params.frame.align = align; }, 'commit')}
            options={[{ value: 'center', label: 'Center' }, { value: 'bottom', label: 'Bottom (shoes)' }]} />
        </Section>
      </div>
    </div>
  );
}
