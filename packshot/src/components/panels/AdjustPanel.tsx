import { useActive, currentState, useStore } from '../../state/store';
import { TONE_KEYS, zeroTone } from '../../lib/defaults';
import { autoAdjust } from '../../lib/actions';
import { Histogram } from '../Histogram';
import { Btn, Icon, Slider } from '../ui';

export function AdjustPanel() {
  const img = useActive();
  const update = useStore((s) => s.update);
  if (!img) return null;
  const tone = currentState(img).params.tone;
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Btn kind="primary" className="flex-1 flex items-center justify-center gap-2" onClick={autoAdjust}>
          <Icon name="wand" size={18} /> Auto
        </Btn>
        <Btn onClick={() => update((s) => { s.params.tone = zeroTone(); }, 'commit')}>Reset all</Btn>
      </div>
      <Histogram />
      <p className="px-1 text-xs text-neutral-500">Hold the photo to compare with the original · double-tap a slider to reset</p>
      {TONE_KEYS.map(({ key, label }) => (
        <Slider
          key={key}
          label={label}
          value={tone[key]}
          min={-100}
          max={100}
          onChange={(v, mode) => update((s) => { s.params.tone[key] = v; }, mode)}
        />
      ))}
    </div>
  );
}
