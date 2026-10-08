import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect } from 'react';

export function Sheet({ title, onClose, children, footer }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, [onClose]);
  return (
    <div className="ov" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true">
        <div className="sheet-h">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </div>
        <div className="stack" style={{ gap: 14 }}>{children}</div>
        {footer && <div className="row" style={{ marginTop: 18, justifyContent: 'flex-end', flexWrap: 'wrap' }}>{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="f">
      {label}
      {children}
      {hint && <span className="faint" style={{ fontWeight: 600 }}>{hint}</span>}
    </label>
  );
}

export function Choice<T extends string>({ value, onChange, options }: { value: T | undefined; onChange: (v: T) => void; options: { v: T; l: ReactNode }[] }) {
  return (
    <div className="choice">
      {options.map((o) => (
        <button type="button" key={o.v} className={value === o.v ? 'on' : ''} onClick={() => onChange(o.v)}>{o.l}</button>
      ))}
    </div>
  );
}

export function Seg<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { v: T; l: ReactNode }[] }) {
  return (
    <div className="seg">
      {options.map((o) => <button key={o.v} className={value === o.v ? 'on' : ''} onClick={() => onChange(o.v)}>{o.l}</button>)}
    </div>
  );
}

/** Variação % com seta e cor. `bomQuandoSobe=false` inverte a leitura (ex.: despertares). */
export function Delta({ atual, anterior, bomQuandoSobe = true, neutro = false }: { atual: number; anterior: number; bomQuandoSobe?: boolean; neutro?: boolean }) {
  if (!anterior) return <span className="delta flat">sem base</span>;
  const v = atual / anterior - 1;
  if (Math.abs(v) < 0.03) return <span className="delta flat">= estável</span>;
  const cls = neutro ? 'flat' : (v > 0) === bomQuandoSobe ? 'up' : 'down';
  return <span className={`delta ${cls}`}>{v > 0 ? '▲' : '▼'} {Math.abs(Math.round(v * 100))}%</span>;
}

export function Empty({ emoji, children }: { emoji: string; children: ReactNode }) {
  return <div className="empty"><div className="em">{emoji}</div><div style={{ marginTop: 6 }}>{children}</div></div>;
}
