import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, MoreHorizontal, ChevronLeft, ChevronRight, ChevronsUpDown, ChevronUp, ChevronDown, Inbox, Minus, Search, X } from 'lucide-react';
import { pct } from '../utils/format';

/* ---------- Logo ---------- */
export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill="#0F8A63" />
      <path d="M9 21c0-7 5-12 14-12 0 9-5 14-12 14" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M9 23 17 15" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

/* ---------- Badge ---------- */
const STATUS_TONE: Record<string, string> = {
  'Agendada': 'gray', 'Confirmada': 'blue', 'Realizada': 'green', 'Faltou': 'red', 'Cancelada': 'gray',
  'Em acompanhamento': 'green', 'Retorno vencido': 'orange', 'Inativo': 'gray', 'Novo': 'blue', 'Arquivado': 'gray',
  'Pago': 'green', 'Pendente': 'orange', 'Receita': 'green', 'Despesa': 'red',
  'Primeira consulta': 'green', 'Retorno': 'blue', 'Online': 'purple', 'Bioimpedância': 'orange',
  'Ativo': 'green',
};
export function Badge({ children, tone }: { children: ReactNode; tone?: string }) {
  const t = tone ?? STATUS_TONE[String(children)] ?? 'gray';
  return <span className={`badge b-${t}`}><span className="dot" />{children}</span>;
}

/* ---------- Trend ---------- */
export function Trend({ value, invert = false, suffix }: { value: number | null; invert?: boolean; suffix?: string }) {
  if (value === null) return <span className="trend flat">novo</span>;
  const good = invert ? value < 0 : value > 0;
  const cls = Math.abs(value) < 0.005 ? 'flat' : good ? 'up' : 'down';
  const Icon = Math.abs(value) < 0.005 ? Minus : value > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`trend ${cls}`}>
      <Icon size={14} />{suffix === 'p.p.' ? `${(Math.abs(value) * 100).toFixed(1).replace('.', ',')} p.p.` : `${pct(Math.abs(value))}${suffix ? ` ${suffix}` : ''}`}
    </span>
  );
}

/* ---------- Page header ---------- */
export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </div>
  );
}

/* ---------- KPI ---------- */
export function Kpi({ icon, tone, label, value, foot, children }: {
  icon: ReactNode; tone: string; label: string; value: ReactNode; foot?: ReactNode; children?: ReactNode;
}) {
  return (
    <div className="card kpi">
      <div className={`kpi-icon tone-${tone}`}>{icon}</div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="kpi-label">{label}</div>
        <div className="kpi-value">{value}</div>
        {foot && <div className="kpi-foot">{foot}</div>}
        {children}
      </div>
    </div>
  );
}

/* ---------- Modal ---------- */
export function Modal({ title, onClose, children, footer, wide }: {
  title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Confirm({ text, onConfirm, onClose, label = 'Excluir' }: {
  text: ReactNode; onConfirm: () => void; onClose: () => void; label?: string;
}) {
  return (
    <Modal title="Confirmar ação" onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancelar</button>
      <button className="btn btn-danger" onClick={() => { onConfirm(); onClose(); }}>{label}</button>
    </>}>
      <p style={{ margin: 0 }}>{text}</p>
    </Modal>
  );
}

/* ---------- Search ---------- */
export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="search">
      <Search size={16} />
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

/* ---------- Sorting & paging ---------- */
export type SortState<T> = { key: keyof T | null; dir: 'asc' | 'desc' };

export function useSortPage<T>(rows: T[], pageSize = 8, initial: SortState<T> = { key: null, dir: 'asc' }) {
  const [sort, setSort] = useState<SortState<T>>(initial);
  const [page, setPage] = useState(1);
  const sorted = useMemo(() => {
    if (!sort.key) return rows;
    const k = sort.key;
    return [...rows].sort((a, b) => {
      const va = a[k] as unknown, vb = b[k] as unknown;
      const r = typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : String(va ?? '').localeCompare(String(vb ?? ''), 'pt-BR', { numeric: true });
      return sort.dir === 'asc' ? r : -r;
    });
  }, [rows, sort]);
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const cur = Math.min(page, pages);
  useEffect(() => { setPage(1); }, [rows.length]);
  const view = sorted.slice((cur - 1) * pageSize, cur * pageSize);
  const toggle = (key: keyof T) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  return { view, sort, toggle, page: cur, pages, setPage, total: sorted.length, pageSize };
}

export function Th<T>({ label, k, s, className }: {
  label: string; k: keyof T; s: { sort: SortState<T>; toggle: (k: keyof T) => void }; className?: string;
}) {
  const active = s.sort.key === k;
  const Icon = !active ? ChevronsUpDown : s.sort.dir === 'asc' ? ChevronUp : ChevronDown;
  return (
    <th className={`sortable ${className ?? ''}`} onClick={() => s.toggle(k)}>
      <span className="row" style={{ gap: 4, display: 'inline-flex' }}>{label}<Icon size={12} opacity={active ? 1 : 0.45} /></span>
    </th>
  );
}

export function Pager({ page, pages, setPage, total, pageSize, noun }: {
  page: number; pages: number; setPage: (p: number) => void; total: number; pageSize: number; noun: string;
}) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="pager">
      <div className="pager-btns">
        <button disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Anterior"><ChevronLeft size={14} /></button>
        {Array.from({ length: pages }, (_, i) => i + 1).slice(Math.max(0, page - 3), Math.max(5, page + 2)).map((p) => (
          <button key={p} className={p === page ? 'active' : ''} onClick={() => setPage(p)}>{p}</button>
        ))}
        <button disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Próxima"><ChevronRight size={14} /></button>
      </div>
      <span>Mostrando {from}–{to} de {total} {noun}</span>
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return <div className="empty"><Inbox size={36} /><div>{text}</div></div>;
}

export function Avatar({ nome, size, navy }: { nome: string; size?: 'lg'; navy?: boolean }) {
  const ini = nome.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  return <div className={`avatar ${size ?? ''} ${navy ? 'navy' : ''}`}>{ini}</div>;
}

/* ---------- Row menu (posição fixa para não ser cortado pela tabela) ---------- */
export interface MenuAction { label: ReactNode; onClick: () => void; danger?: boolean; hidden?: boolean }

export function RowMenu({ actions }: { actions: MenuAction[] }) {
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); };
  }, [pos]);
  return (
    <>
      <button className="btn btn-ghost btn-icon btn-sm" aria-label="Ações" onClick={(e) => {
        e.stopPropagation();
        const r = e.currentTarget.getBoundingClientRect();
        const est = actions.filter((a) => !a.hidden).length * 32 + 12;
        const top = r.bottom + est > window.innerHeight ? Math.max(8, r.top - est) : r.bottom + 4;
        setPos({ top, right: window.innerWidth - r.right });
      }}><MoreHorizontal size={16} /></button>
      {pos && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 80 }} onClick={(e) => { e.stopPropagation(); setPos(null); }} />
          <div className="card" style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 81, minWidth: 210, padding: 6, boxShadow: 'var(--shadow-lg)', textAlign: 'left' }}>
            {actions.filter((a) => !a.hidden).map((a, i) => (
              <button key={i} className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'flex-start', color: a.danger ? 'var(--danger)' : undefined }}
                onClick={(e) => { e.stopPropagation(); setPos(null); a.onClick(); }}>
                {a.label}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}
