import { useApp, type Aba } from '../ctx';
import type { Insight } from '../lib/metrics';

export function InsightList({ itens, vazio }: { itens: Insight[]; vazio: string }) {
  const { setAba } = useApp();
  if (!itens.length) return <p className="muted">{vazio}</p>;
  return (
    <div className="stack">
      {itens.map((i, k) => (
        <div key={k} className={`ins ${i.nivel}`}>
          <span className="bar" />
          <div className="grow">
            <div style={{ fontWeight: 800 }}>{i.titulo}</div>
            <div className="muted" style={{ fontSize: 13.5 }}>{i.detalhe}</div>
            {i.acao && <div className="act">→ {i.acao}</div>}
          </div>
          {i.aba && <button className="btn sm ghost" onClick={() => setAba(i.aba as Aba)}>Ver</button>}
        </div>
      ))}
    </div>
  );
}
