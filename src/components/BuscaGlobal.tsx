import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useClienteNome, useStore } from '../store/Store';
import type { Modulo } from '../types';
import { money, normalize } from '../utils/format';

interface Resultado { tipo: string; titulo: string; sub: string; to: string; mod: Modulo }

/** Busca em todos os cadastros a partir da barra superior (atalho Ctrl+K / ⌘K). */
export function BuscaGlobal() {
  const { db, can } = useStore();
  const nome = useClienteNome();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(0);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); ref.current?.focus(); setOpen(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const resultados = useMemo<Resultado[]>(() => {
    const t = normalize(q.trim());
    if (t.length < 2) return [];
    const has = (...xs: (string | undefined)[]) => normalize(xs.filter(Boolean).join(' ')).includes(t);
    const out: Resultado[] = [
      ...db.clientes.filter((c) => has(c.nome, c.email, c.telefone, c.documento))
        .map((c) => ({ tipo: 'Cliente', titulo: c.nome, sub: `${c.telefone} · ${c.email}`, to: `/clientes?id=${c.id}`, mod: 'clientes' as Modulo })),
      ...db.ordens.filter((o) => has(o.numero, o.servico, nome(o.clienteId)))
        .map((o) => ({ tipo: 'OS', titulo: `${o.numero} · ${o.servico}`, sub: `${nome(o.clienteId)} · ${o.status}`, to: `/ordens?id=${o.id}`, mod: 'ordens' as Modulo })),
      ...db.orcamentos.filter((o) => has(o.numero, o.servico, nome(o.clienteId)))
        .map((o) => ({ tipo: 'Orçamento', titulo: `${o.numero} · ${o.servico}`, sub: `${nome(o.clienteId)} · ${money(o.valor)} · ${o.status}`, to: '/orcamentos', mod: 'orcamentos' as Modulo })),
      ...db.equipamentos.filter((e) => has(e.nome, e.marca, e.numeroSerie, nome(e.clienteId)))
        .map((e) => ({ tipo: 'Equipamento', titulo: e.nome, sub: `${nome(e.clienteId)} · ${e.numeroSerie}`, to: '/equipamentos', mod: 'equipamentos' as Modulo })),
      ...db.contratos.filter((c) => has(c.tipo, c.descricao, nome(c.clienteId)))
        .map((c) => ({ tipo: 'Contrato', titulo: `${c.tipo} · ${nome(c.clienteId)}`, sub: `${money(c.valorMensal)}/mês · ${c.status}`, to: '/contratos', mod: 'contratos' as Modulo })),
      ...db.pecas.filter((p) => has(p.nome, p.sku, p.fornecedor))
        .map((p) => ({ tipo: 'Peça', titulo: p.nome, sub: `${p.sku} · ${p.quantidade} em estoque`, to: '/estoque', mod: 'estoque' as Modulo })),
      ...db.servicos.filter((s) => has(s.nome, s.categoria))
        .map((s) => ({ tipo: 'Serviço', titulo: s.nome, sub: `${s.categoria} · ${money(s.preco)}`, to: '/servicos', mod: 'servicos' as Modulo })),
      ...db.turmas.filter((tu) => has(tu.curso, ...tu.alunos.map((a) => a.nome)))
        .map((tu) => ({ tipo: 'Turma', titulo: tu.curso, sub: `${tu.alunos.length}/${tu.vagas} alunos · ${tu.status}`, to: '/treinamentos', mod: 'treinamentos' as Modulo })),
      ...db.posts.filter((p) => has(p.titulo, p.rede, p.pilar))
        .map((p) => ({ tipo: 'Post', titulo: p.titulo, sub: `${p.rede} · ${p.status} · ${p.data.split('-').reverse().join('/')}`, to: '/social', mod: 'social' as Modulo })),
    ];
    return out.filter((r) => can(r.mod)).slice(0, 10);
  }, [q, db, nome, can]);

  const ir = (r: Resultado) => { nav(r.to); setQ(''); setOpen(false); ref.current?.blur(); };

  return (
    <div className="busca" style={{ position: 'relative', flex: '0 1 420px' }}>
      <div className="search" style={{ minWidth: 0 }}>
        <Search size={16} />
        <input ref={ref} className="input" placeholder="Buscar clientes, OS, orçamentos, peças…  (Ctrl+K)" value={q}
          onChange={(e) => { setQ(e.target.value); setSel(0); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, resultados.length - 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
            if (e.key === 'Enter' && resultados[sel]) ir(resultados[sel]);
            if (e.key === 'Escape') { setOpen(false); ref.current?.blur(); }
          }} />
      </div>
      {open && q.trim().length >= 2 && (
        <div className="card" style={{ position: 'absolute', top: 42, left: 0, right: 0, zIndex: 60, boxShadow: 'var(--shadow-lg)', padding: 6, maxHeight: 420, overflowY: 'auto' }}>
          {resultados.length === 0 && <div className="small muted" style={{ padding: 12 }}>Nada encontrado para "{q}".</div>}
          {resultados.map((r, i) => (
            <button key={`${r.tipo}-${r.titulo}-${i}`} className="btn btn-ghost" onMouseDown={(e) => e.preventDefault()} onClick={() => ir(r)} onMouseEnter={() => setSel(i)}
              style={{ width: '100%', height: 'auto', padding: '8px 10px', justifyContent: 'flex-start', textAlign: 'left', background: i === sel ? 'var(--primary-50)' : undefined }}>
              <span className="badge b-blue" style={{ minWidth: 86, justifyContent: 'center' }}>{r.tipo}</span>
              <span style={{ minWidth: 0 }}>
                <span className="strong" style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.titulo}</span>
                <span className="small muted">{r.sub}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
