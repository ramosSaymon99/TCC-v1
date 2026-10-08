import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Download, MessageCircle, Plus } from 'lucide-react';
import { useStore } from '../store/Store';
import { Avatar, Badge, Empty, PageHeader, Pager, SearchInput, Th, useSortPage } from '../components/ui';
import { Options } from '../components/fields';
import { PacienteModal } from '../components/modais';
import { OBJETIVOS, ORIGENS } from '../types';
import { date, downloadCSV, money, normalize } from '../utils/format';
import { linkWhatsApp, primeiroNome, STATUS_PACIENTE, type StatusPaciente } from '../utils/metrics';
import { evolucao } from '../utils/nutri';

interface Row {
  id: string; nome: string; objetivo: string; origem: string; telefone: string; status: StatusPaciente;
  ultima: string; proxima: string; delta: number | null; realizadas: number; receita: number; dias: number;
}

export default function Pacientes() {
  const { db, resumo } = useStore();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') as StatusPaciente | null) ?? 'Todos';
  const [q, setQ] = useState('');
  const [objetivo, setObjetivo] = useState('');
  const [origem, setOrigem] = useState('');
  const [novo, setNovo] = useState(false);

  const todas = useMemo<Row[]>(() => db.pacientes.map((p) => {
    const r = resumo.get(p.id)!;
    const ev = evolucao(db.avaliacoes.filter((a) => a.pacienteId === p.id));
    return {
      id: p.id, nome: p.nome, objetivo: p.objetivo, origem: p.origem, telefone: p.telefone, status: r.status,
      ultima: r.ultima ?? '', proxima: r.proxima ? `${r.proxima.data} ${r.proxima.hora}` : '',
      delta: ev.ord.length >= 2 ? ev.deltaTotal : null, realizadas: r.realizadas, receita: r.receita, dias: r.diasSemConsulta ?? 9999,
    };
  }), [db.pacientes, db.avaliacoes, resumo]);

  const filtradas = useMemo(() => {
    const t = normalize(q);
    return todas.filter((r) => (status === 'Todos' ? r.status !== 'Arquivado' : r.status === status)
      && (!objetivo || r.objetivo === objetivo) && (!origem || r.origem === origem)
      && (!t || normalize(r.nome).includes(t) || r.telefone.includes(q)));
  }, [todas, status, objetivo, origem, q]);

  const s = useSortPage(filtradas, 12, status === 'Retorno vencido' ? { key: 'dias', dir: 'asc' } : { key: 'nome', dir: 'asc' });
  const contagem = (st: string) => todas.filter((r) => (st === 'Todos' ? r.status !== 'Arquivado' : r.status === st)).length;
  const potencial = status === 'Retorno vencido' ? filtradas.length * db.config.precos.Retorno : 0;

  const exportar = () => downloadCSV('pacientes.csv', [
    ['Nome', 'Telefone', 'Objetivo', 'Origem', 'Status', 'Última consulta', 'Próxima consulta', 'Variação de peso (kg)', 'Consultas', 'Receita'],
    ...filtradas.map((r) => [r.nome, r.telefone, r.objetivo, r.origem, r.status, date(r.ultima), r.proxima ? date(r.proxima) : '', r.delta?.toFixed(1) ?? '', r.realizadas, r.receita.toFixed(2)]),
  ]);

  return (
    <>
      <PageHeader title="Pacientes" subtitle="Acompanhamento, evolução e recuperação de pacientes sem retorno">
        <button className="btn" onClick={exportar}><Download size={16} /> Exportar CSV</button>
        <button className="btn btn-primary" onClick={() => setNovo(true)}><Plus size={16} /> Novo paciente</button>
      </PageHeader>

      <div className="card">
        <div className="tabs">
          {(['Todos', ...STATUS_PACIENTE] as const).map((st) => (
            <button key={st} className={`tab ${status === st ? 'active' : ''}`} onClick={() => setParams(st === 'Todos' ? {} : { status: st })}>
              {st}<span className="count">{contagem(st)}</span>
            </button>
          ))}
        </div>
        {status === 'Retorno vencido' && filtradas.length > 0 && (
          <div className="insights" style={{ paddingBottom: 0 }}>
            <div className="insight warn">
              <div>
                <div className="t">{filtradas.length} pacientes sem retorno há mais de {db.config.retornoDias} dias — {money(potencial)} em retornos potenciais</div>
                <div className="d">Ordenados pelos mais recentes, que têm mais chance de voltar. Use o botão de WhatsApp para enviar o convite já escrito.</div>
              </div>
            </div>
          </div>
        )}
        <div className="toolbar">
          <SearchInput value={q} onChange={setQ} placeholder="Buscar por nome ou telefone" />
          <select className="select" value={objetivo} onChange={(e) => setObjetivo(e.target.value)}><option value="">Todos os objetivos</option><Options items={OBJETIVOS} /></select>
          <select className="select" value={origem} onChange={(e) => setOrigem(e.target.value)}><option value="">Todas as origens</option><Options items={ORIGENS} /></select>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <Th label="Paciente" k="nome" s={s} />
                <Th label="Status" k="status" s={s} />
                <Th label="Última consulta" k="dias" s={s} />
                <Th label="Próxima" k="proxima" s={s} />
                <Th label="Evolução" k="delta" s={s} className="num" />
                <Th label="Consultas" k="realizadas" s={s} className="num" />
                <Th label="Receita" k="receita" s={s} className="num" />
                <th />
              </tr>
            </thead>
            <tbody>
              {s.view.map((r) => (
                <tr key={r.id} className="clickable" onClick={() => nav(`/pacientes/${r.id}`)}>
                  <td><div className="person"><Avatar nome={r.nome} /><div><div className="name">{r.nome}</div><div className="meta">{r.objetivo} · {r.origem}</div></div></div></td>
                  <td><Badge>{r.status}</Badge></td>
                  <td>{r.ultima ? <>{date(r.ultima)}<div className="sub">há {r.dias} dias</div></> : <span className="muted">—</span>}</td>
                  <td>{r.proxima ? `${date(r.proxima)} ${r.proxima.slice(11)}` : <span className="muted">sem agendamento</span>}</td>
                  <td className="num">{r.delta === null ? <span className="muted">—</span> : <span className={!r.delta ? '' : (r.delta > 0) === (r.objetivo === 'Hipertrofia' || r.objetivo === 'Gestação') ? 'text-success' : 'text-warning'}>{r.delta > 0 ? '+' : ''}{r.delta.toFixed(1).replace('.', ',')} kg</span>}</td>
                  <td className="num">{r.realizadas}</td>
                  <td className="num">{money(r.receita)}</td>
                  <td className="right" onClick={(e) => e.stopPropagation()}>
                    {(r.status === 'Retorno vencido' || r.status === 'Inativo') && (
                      <a className="btn btn-sm wa" href={linkWhatsApp(r.telefone, `Olá, ${primeiroNome(r.nome)}! Tudo bem? Faz um tempinho desde a nossa última consulta e queria saber como você está com o plano. Que tal agendarmos seu retorno para ajustarmos juntos? Tenho horários nesta semana.`)} target="_blank" rel="noreferrer">
                        <MessageCircle size={14} /> Convidar
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {s.total === 0 && <Empty text="Nenhum paciente encontrado com esses filtros." />}
        </div>
        <Pager {...s} noun="pacientes" />
      </div>
      {novo && <PacienteModal onClose={() => setNovo(false)} onSaved={(id) => nav(`/pacientes/${id}`)} />}
    </>
  );
}
