import { useRef, useState } from 'react';
import { Building2, Database as DbIcon, Download, RotateCcw, Target, Upload } from 'lucide-react';
import { useStore } from '../store/Store';
import type { Database, Empresa } from '../types';
import { Confirm, PageHeader } from '../components/ui';
import { Field, toNumber } from '../components/fields';
import { money, today } from '../utils/format';

export default function Configuracoes() {
  const { db, setEmpresa, resetDemo, toast } = useStore();
  const [f, setF] = useState<Empresa>(db.empresa);
  const [reset, setReset] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof Empresa>(k: K, v: Empresa[K]) => setF((x) => ({ ...x, [k]: v }));

  // Referência para a meta: média mensal dos últimos 3 meses fechados
  const ref = (() => {
    const d = new Date();
    const vals = [1, 2, 3].map((i) => {
      const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
      const k = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`;
      return db.lancamentos.filter((l) => l.tipo === 'Receita' && l.data.startsWith(k)).reduce((a, l) => a + l.valor, 0);
    });
    return vals.reduce((a, b) => a + b, 0) / 3;
  })();

  const backup = () => {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `techgest-backup-${today()}.json`; a.click();
    URL.revokeObjectURL(a.href);
  };
  const importar = (file: File) => {
    file.text().then((t) => {
      const data = JSON.parse(t) as Database;
      if (!Array.isArray(data.clientes) || !Array.isArray(data.lancamentos)) throw new Error('inválido');
      localStorage.setItem('techgest:db:v1', JSON.stringify(data));
      window.location.reload();
    }).catch(() => toast('Arquivo de backup inválido.', 'error'));
  };

  return (
    <>
      <PageHeader title="Configurações" subtitle="Dados da empresa, metas e gestão dos dados do sistema." />
      <div className="grid g-2">
        <div className="card">
          <div className="card-head"><h3 className="row"><Building2 size={16} color="var(--primary)" /> Dados da empresa</h3></div>
          <form className="form-grid" style={{ padding: 20 }} onSubmit={(e) => { e.preventDefault(); setEmpresa(f); toast('Configurações salvas.'); }}>
            <Field label="Nome fantasia" full><input className="input" value={f.nome} onChange={(e) => set('nome', e.target.value)} /></Field>
            <Field label="CNPJ"><input className="input" value={f.cnpj} onChange={(e) => set('cnpj', e.target.value)} /></Field>
            <Field label="Telefone"><input className="input" value={f.telefone} onChange={(e) => set('telefone', e.target.value)} /></Field>
            <Field label="E-mail"><input className="input" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
            <Field label="Cidade/UF"><input className="input" value={f.endereco} onChange={(e) => set('endereco', e.target.value)} /></Field>
            <div className="full divider" />
            <div className="full row strong"><Target size={16} color="var(--primary)" /> Metas e alertas</div>
            <Field label="Meta de faturamento mensal (R$)" hint={`Média dos últimos 3 meses fechados: ${money(ref)}. Uma meta 5–10% acima da média é desafiadora e realista.`}>
              <input className="input" inputMode="decimal" defaultValue={String(f.metaMensal).replace('.', ',')} onChange={(e) => set('metaMensal', toNumber(e.target.value))} />
            </Field>
            <Field label="Alertar orçamentos que vencem em até (dias)">
              <input className="input" type="number" min={1} max={60} value={f.diasAlertaOrcamento} onChange={(e) => set('diasAlertaOrcamento', Number(e.target.value))} />
            </Field>
            <div className="full"><button className="btn btn-primary">Salvar configurações</button></div>
          </form>
        </div>

        <div className="card">
          <div className="card-head"><h3 className="row"><DbIcon size={16} color="var(--primary)" /> Dados do sistema</h3></div>
          <div style={{ padding: 20, display: 'grid', gap: 14 }}>
            <p className="small muted" style={{ margin: 0 }}>
              Os dados ficam salvos neste navegador. Faça backups periódicos para não perdê-los ao limpar o navegador ou trocar de computador.
            </p>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <button className="btn" onClick={backup}><Download size={15} /> Exportar backup (JSON)</button>
              <button className="btn" onClick={() => fileRef.current?.click()}><Upload size={15} /> Restaurar backup</button>
              <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importar(e.target.files[0])} />
            </div>
            <div className="divider" style={{ margin: 0 }} />
            <div className="small">
              <strong>Resumo da base:</strong> {db.clientes.length} clientes · {db.orcamentos.length} orçamentos · {db.ordens.length} OS · {db.equipamentos.length} equipamentos · {db.lancamentos.length} lançamentos
            </div>
            <div>
              <button className="btn" style={{ color: 'var(--danger)' }} onClick={() => setReset(true)}><RotateCcw size={15} /> Restaurar dados de demonstração</button>
            </div>
          </div>
        </div>
      </div>
      {reset && <Confirm label="Restaurar" text="Todos os dados atuais serão substituídos pelos dados de demonstração. Deseja continuar?" onClose={() => setReset(false)} onConfirm={() => { resetDemo(); toast('Dados de demonstração restaurados.'); setTimeout(() => window.location.reload(), 300); }} />}
    </>
  );
}
