import { ReactNode, useEffect, useRef, useState } from 'react';

/** Campo numérico que aceita vírgula, mantém o texto enquanto o usuário digita e só publica valores válidos. */
export function NumberField({
  label,
  value,
  onChange,
  prefix,
  suffix,
  step = 1,
  min = 0,
  max,
  scale = 1,
  digits = 0,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  prefix?: string;
  suffix?: string;
  step?: number;
  min?: number;
  max?: number;
  scale?: number; // ex.: 100 para editar uma fração como porcentagem
  digits?: number;
  hint?: string;
}) {
  const show = (v: number) => (v * scale).toLocaleString('pt-BR', { maximumFractionDigits: digits });
  const [text, setText] = useState(show(value));
  const editing = useRef(false);
  // só reformata quando o valor muda por fora (preset, otimizador), nunca no meio da digitação
  useEffect(() => {
    if (!editing.current) setText(show(value));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const clamp = (v: number) => Math.min(max ?? Infinity, Math.max(min, v));
  const commit = (raw: string) => {
    if (raw.trim() === '') return;
    const n = Number(raw.replace(/\./g, '').replace(',', '.'));
    if (Number.isFinite(n)) onChange(clamp(n / scale));
  };

  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="input-wrap">
        {prefix && <span className="affix">{prefix}</span>}
        <input
          inputMode="decimal"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            commit(e.target.value);
          }}
          onFocus={() => (editing.current = true)}
          onBlur={() => {
            editing.current = false;
            setText(show(value));
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault();
              const v = clamp((value * scale + (e.key === 'ArrowUp' ? step : -step)) / scale);
              onChange(v);
              setText(show(v));
            }
          }}
        />
        {suffix && <span className="affix">{suffix}</span>}
      </span>
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Card({ title, action, children, className = '' }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <div className="card-head">
          {title && <h2>{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: ReactNode; tone?: 'good' | 'bad' | 'warn' }) {
  return (
    <div className="kpi">
      <span className="kpi-label">{label}</span>
      <strong className="kpi-value">{value}</strong>
      {sub && <span className={`kpi-sub ${tone ?? ''}`}>{sub}</span>}
    </div>
  );
}

export function Dot({ color }: { color: string }) {
  return <span className="dot" style={{ background: color }} aria-hidden />;
}

export function copyText(text: string) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  ta.remove();
  return Promise.resolve();
}

export function downloadFile(name: string, content: string | Blob, type = 'text/plain') {
  const blob = typeof content === 'string' ? new Blob([content], { type: `${type};charset=utf-8` }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const csv = (rows: (string | number)[][]) =>
  '﻿' + rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
