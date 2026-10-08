import type { ReactNode } from 'react';
import { useStore } from '../store/Store';

export function Field({ label, children, full, hint }: { label: string; children: ReactNode; full?: boolean; hint?: string }) {
  return (
    <div className={`field ${full ? 'full' : ''}`}>
      <label>{label}</label>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function PacienteSelect({ value, onChange }: { value?: string; onChange: (id: string) => void }) {
  const { db } = useStore();
  return (
    <select className="select" value={value ?? ''} onChange={(e) => onChange(e.target.value)} required>
      <option value="">Selecione o paciente</option>
      {db.pacientes.filter((p) => !p.arquivado).sort((a, b) => a.nome.localeCompare(b.nome)).map((p) => (
        <option key={p.id} value={p.id}>{p.nome}</option>
      ))}
    </select>
  );
}

export function Options<T extends string>({ items }: { items: readonly T[] }) {
  return <>{items.map((i) => <option key={i} value={i}>{i}</option>)}</>;
}

/** Converte input numérico em número mesmo com vírgula decimal. */
export const toNumber = (v: string) => Number(String(v).replace(',', '.')) || 0;
