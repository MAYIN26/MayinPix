'use client';
import { useId, type ReactNode } from 'react';
import { Info } from 'lucide-react';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

export function Card({ title, icon, children, actions, className }: { title?: ReactNode; icon?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={cx('rounded-2xl border border-line bg-panel-2/60 p-4', className)}>
      {title && (
        <header className="mb-3 flex items-center gap-2">
          {icon && <span className="text-accent">{icon}</span>}
          <h3 className="text-[13px] font-semibold tracking-wide">{title}</h3>
          <div className="ml-auto flex items-center gap-1">{actions}</div>
        </header>
      )}
      <div className="space-y-3.5">{children}</div>
    </section>
  );
}

export function Slider({
  label, value, min, max, step = 1, onChange, suffix = '', disabled, hint, format,
}: {
  label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void;
  suffix?: string; disabled?: boolean; hint?: string; format?: (v: number) => string;
}) {
  const id = useId();
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <div className={cx(disabled && 'opacity-50')}>
      <div className="mb-1 flex items-center justify-between text-xs">
        <label htmlFor={id} className="flex items-center gap-1 text-muted">
          {label}
          {hint && <Hint text={hint} />}
        </label>
        <input
          type="number"
          className="w-16 rounded-md border border-transparent bg-transparent px-1 text-right font-mono text-xs text-fg tabular-nums outline-none hover:border-line focus:border-accent"
          value={Number.isInteger(step) ? value : Number(value.toFixed(2))}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          aria-label={`${label} value`}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (!Number.isNaN(v)) onChange(Math.min(max, Math.max(min, v)));
          }}
        />
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        style={{ ['--fill' as string]: `${fill}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {format && <div className="mt-0.5 text-right text-[10px] text-faint">{format(value)}{suffix}</div>}
    </div>
  );
}

export function Toggle({ label, checked, onChange, hint, disabled }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; hint?: string; disabled?: boolean }) {
  return (
    <label className={cx('flex cursor-pointer items-center justify-between gap-3 text-xs', disabled && 'pointer-events-none opacity-50')}>
      <span className="flex items-center gap-1 text-muted">
        {label}
        {hint && <Hint text={hint} />}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx('relative h-5 w-9 shrink-0 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-line-strong')}
      >
        <span className={cx('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', checked ? 'left-[18px]' : 'left-0.5')} />
      </button>
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange, size = 'md' }: { value: T; options: { value: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void; size?: 'sm' | 'md' }) {
  return (
    <div className="flex rounded-xl border border-line bg-panel p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cx(
            'flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] font-medium transition-colors',
            size === 'sm' ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1.5 text-xs',
            value === o.value ? 'bg-raised text-fg shadow-sm' : 'text-muted hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Button({
  children, onClick, variant = 'secondary', disabled, title, className, type = 'button', active,
}: {
  children: ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; disabled?: boolean; title?: string; className?: string; type?: 'button' | 'submit'; active?: boolean;
}) {
  return (
    <button
      type={type}
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        variant === 'primary' && 'bg-accent px-3.5 py-2 text-white hover:bg-accent-strong',
        variant === 'secondary' && 'border border-line bg-raised px-3 py-2 text-fg hover:border-line-strong',
        variant === 'ghost' && 'px-2 py-1.5 text-muted hover:bg-raised hover:text-fg',
        variant === 'danger' && 'border border-line bg-raised px-3 py-2 text-danger hover:border-danger/50',
        active && 'bg-accent-soft text-accent ring-1 ring-accent/40',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Hint({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <Info size={12} className="text-faint" />
      <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 hidden w-56 -translate-x-1/2 rounded-lg border border-line bg-raised p-2 text-[11px] leading-snug font-normal text-fg shadow-xl group-hover:block">
        {text}
      </span>
    </span>
  );
}

export function Swatch({ color, onClick, title, selected }: { color: string; onClick?: () => void; title?: string; selected?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={cx('h-7 w-7 shrink-0 rounded-lg border transition-transform hover:scale-105', selected ? 'border-accent ring-2 ring-accent/50' : 'border-line-strong')}
      style={{ background: color }}
    />
  );
}

export function Note({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' }) {
  return (
    <p className={cx('rounded-xl border px-3 py-2 text-[11px] leading-relaxed', tone === 'warn' ? 'border-amber-500/30 bg-amber-500/10 text-amber-200 [[data-theme=light]_&]:text-amber-800' : 'border-line bg-panel text-muted')}>
      {children}
    </p>
  );
}

export function Progress({ value }: { value: number | null }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
      {value === null ? (
        <div className="h-full w-1/3 animate-[slide_1.1s_ease-in-out_infinite] rounded-full bg-accent" style={{ animationName: 'pc-slide' }} />
      ) : (
        <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${Math.round(value * 100)}%` }} />
      )}
      <style>{`@keyframes pc-slide{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}`}</style>
    </div>
  );
}
