import { useRef, type ReactNode } from 'react';
import { useStore } from '../state/store';

export function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  defaultValue?: number;
  unit?: string;
  onChange: (v: number, mode: 'live' | 'commit') => void;
}) {
  const { label, value, min, max, step = 1, defaultValue = 0, unit = '', onChange } = props;
  const lastUp = useRef(0);
  const setInteracting = useStore((s) => s.setInteracting);
  const commit = (el: HTMLInputElement) => {
    setInteracting(false);
    const now = performance.now();
    const dbl = now - lastUp.current < 320;
    lastUp.current = dbl ? 0 : now;
    onChange(dbl ? defaultValue : Number(el.value), 'commit');
  };
  return (
    <div className="px-1">
      <div className="flex items-center justify-between text-[13px] text-neutral-300 -mb-2">
        <span>{label}</span>
        <span className={`tabular-nums ${value !== defaultValue ? 'text-accent' : 'text-neutral-500'}`}>
          {value > 0 && min < 0 ? '+' : ''}{value}{unit}
        </span>
      </div>
      <input
        type="range"
        className="ps-range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onPointerDown={() => setInteracting(true)}
        onChange={(e) => onChange(Number(e.currentTarget.value), 'live')}
        onPointerUp={(e) => commit(e.currentTarget)}
        onPointerCancel={(e) => commit(e.currentTarget)}
        onKeyUp={(e) => commit(e.currentTarget)}
      />
    </div>
  );
}

export function Seg<T extends string>(props: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-xl bg-ink-800 p-1 gap-1">
      {props.options.map((o) => (
        <button
          key={o.value}
          className={`flex-1 min-h-[40px] rounded-lg text-sm font-medium ${props.value === o.value ? 'bg-ink-600 text-white' : 'text-neutral-400'}`}
          onClick={() => props.onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle(props: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <button className="flex w-full items-center justify-between min-h-[44px] px-1" onClick={() => props.onChange(!props.checked)}>
      <span className="text-left">
        <span className="block text-sm">{props.label}</span>
        {props.hint && <span className="block text-xs text-neutral-500">{props.hint}</span>}
      </span>
      <span className={`relative h-7 w-12 rounded-full transition-colors ${props.checked ? 'bg-accent' : 'bg-ink-600'}`}>
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${props.checked ? 'left-6' : 'left-1'}`} />
      </span>
    </button>
  );
}

export function Btn(props: { children: ReactNode; onClick?: () => void; kind?: 'primary' | 'ghost' | 'danger'; disabled?: boolean; className?: string }) {
  const k = props.kind ?? 'ghost';
  const cls =
    k === 'primary' ? 'bg-accent text-white active:bg-blue-600'
    : k === 'danger' ? 'bg-red-600/20 text-red-300 active:bg-red-600/30'
    : 'bg-ink-700 text-neutral-100 active:bg-ink-600';
  return (
    <button
      disabled={props.disabled}
      onClick={props.onClick}
      className={`min-h-[44px] rounded-xl px-4 text-sm font-semibold disabled:opacity-40 ${cls} ${props.className ?? ''}`}
    >
      {props.children}
    </button>
  );
}

export const Section = ({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) => (
  <section className="space-y-2">
    <div className="flex items-center justify-between px-1">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{title}</h3>
      {right}
    </div>
    {children}
  </section>
);

const paths: Record<string, string> = {
  undo: 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  redo: 'm15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13',
  plus: 'M12 5v14M5 12h14',
  share: 'M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13',
  x: 'M18 6 6 18M6 6l12 12',
  bg: 'M3 3h18v18H3zM3 15l5-5 4 4 3-3 6 6',
  adjust: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  frame: 'M6 2v14a2 2 0 0 0 2 2h14M18 22V8a2 2 0 0 0-2-2H2',
  export: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  camera: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  images: 'M21 15V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10M3 15l5-5 5 5M14 14l2-2 5 5M17 19h6M20 16v6',
  wand: 'M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8 19 13M15 9h0M17.8 6.2 19 5M3 21l9-9M12.2 6.2 11 5',
  brush: 'M9.06 11.9 17.6 3.37a2.1 2.1 0 0 1 3 3L12.1 14.9M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z',
};

export const Icon = ({ name, size = 22 }: { name: keyof typeof paths | string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={paths[name]} />
  </svg>
);
