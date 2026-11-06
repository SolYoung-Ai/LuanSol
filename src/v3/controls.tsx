/* 十步向导通用控件：简洁、轻量、无装饰 */
import React from 'react';
import { unitLabel, fromMm, toMm, type Unit } from './draft';

export function OptionCard({ active, title, desc, tag, onClick, children }: {
  active?: boolean; title: string; desc?: string; tag?: string; onClick: () => void; children?: React.ReactNode;
}) {
  return <button type="button" className={`v3-option ${active ? 'on' : ''}`} onClick={onClick}>
    {children}
    <span className="v3-option-body"><strong>{title}</strong>{desc && <span>{desc}</span>}</span>
    {tag && <span className="v3-option-tag">{tag}</span>}
    <span className="v3-option-check" aria-hidden>{active ? '✓' : ''}</span>
  </button>;
}

export function MultiChips({ options, value, onChange }: { options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  return <div className="v3-chips">{options.map((o) => {
    const on = value.includes(o);
    return <button type="button" key={o} className={`v3-chip ${on ? 'on' : ''}`} onClick={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])}>
      <span className="v3-chip-box" aria-hidden>{on ? '✓' : ''}</span>{o}
    </button>;
  })}</div>;
}

export function NumField({ label, value, unit, onChange, hint, min = 0, max = 9999, step = 1, placeholder }: {
  label: string; value: number; unit?: Unit; onChange: (mm: number) => void;
  hint?: string; min?: number; max?: number; step?: number; placeholder?: string;
}) {
  const u = unit || 'mm';
  const shown = value === 0 && placeholder ? '' : fromMm(value, u);
  return <label className="v3-numfield">
    <span className="v3-numfield-label">{label}</span>
    <span className="v3-numfield-input">
      <input type="number" min={fromMm(min, u)} max={fromMm(max, u)} step={u === 'mm' ? step : 0.1}
        value={shown} placeholder={placeholder}
        onChange={(e) => { const v = Number(e.target.value); onChange(e.target.value === '' ? 0 : Math.max(0, toMm(v, u))); }} />
      <em>{unitLabel(u)}</em>
    </span>
    {hint && <span className="v3-numfield-hint">{hint}</span>}
  </label>;
}

export function Note({ children, tone = 'info' }: { children: React.ReactNode; tone?: 'info' | 'warn' | 'ok' }) {
  return <div className={`v3-note v3-note-${tone}`}>{children}</div>;
}

export function Why({ text }: { text: string }) {
  return <div className="v3-why"><strong>为什么需要这一步</strong><span>{text}</span></div>;
}

export function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return <div className="v3-fieldlabel"><span>{children}</span>{hint && <em>{hint}</em>}</div>;
}

export function TextField({ label, value, onChange, placeholder, hint, multiline, mono }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: string; multiline?: boolean; mono?: boolean;
}) {
  return <label className="v3-textfield">
    <FieldLabel hint={hint}>{label}</FieldLabel>
    {multiline
      ? <textarea rows={3} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={mono ? 'mono' : ''} />
      : <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={mono ? 'mono' : ''} />}
  </label>;
}

export function ColorInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label?: string }) {
  const [draft, setDraft] = React.useState(value);
  React.useEffect(() => setDraft(value), [value]);
  const commit = (v: string) => {
    const t = v.trim();
    if (/^#[0-9a-f]{6}$/i.test(t)) onChange(t);
    else if (/^#?[0-9a-f]{3}$/i.test(t)) {
      const h = t.replace('#', '').split('').map((c) => c + c).join('');
      onChange('#' + h);
    } else setDraft(value);
  };
  // 没选颜色时不要拿一个默认色假装「已经选好了」——那会让用户以为填了、实际草稿却是空的。
  const valid = /^#[0-9a-f]{6}$/i.test(value);
  return <div className="v3-colorinput">
    {label && <FieldLabel>{label}</FieldLabel>}
    <div className="v3-colorinput-row">
      <input type="color" value={valid ? value : '#e6e4df'} onChange={(e) => onChange(e.target.value)} aria-label={valid ? '选择颜色' : '选择颜色（尚未选择）'} />
      <input className="mono" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => commit(draft)}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(draft); }} placeholder="#20463a" aria-invalid={draft !== '' && !/^#?[0-9a-f]{3,6}$/i.test(draft)} />
    </div>
  </div>;
}

export function Swatch({ color, size = 26, title }: { color: string; size?: number; title?: string }) {
  return <span className="v3-swatch" title={title || color} style={{ background: color, width: size, height: size }} />;
}

export function StepSection({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return <section className="v3-section">
    <div className="v3-section-head"><h3>{title}</h3>{aside}</div>
    {children}
  </section>;
}
