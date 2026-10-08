import { useEffect, useState } from 'react';
import { Download, ExternalLink, FileText, Share2 } from 'lucide-react';
import { useApp } from '../ctx';
import { papel } from '../lib/constants';
import { dataBr } from '../lib/time';
import { Field, Seg, Sheet } from './ui';

const chaveDuvidas = (babyId: string) => `ninho-duvidas-${babyId}`;

export function RelatorioSheet({ onClose }: { onClose: () => void }) {
  const { data, user, toast } = useApp();
  const [dias, setDias] = useState<'7' | '14' | '30'>('14');
  const [duvidas, setDuvidas] = useState(() => { try { return localStorage.getItem(chaveDuvidas(data.baby.id)) ?? ''; } catch { return ''; } });
  const [pdf, setPdf] = useState<{ url: string; blob: Blob; nome: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const proxima = data.appointments.filter((a) => !a.done && new Date(a.date).getTime() > Date.now() - 6 * 3600_000).sort((a, b) => a.date.localeCompare(b.date))[0];

  useEffect(() => { try { localStorage.setItem(chaveDuvidas(data.baby.id), duvidas); } catch { /* sem storage */ } }, [duvidas, data.baby.id]);
  useEffect(() => () => { if (pdf) URL.revokeObjectURL(pdf.url); }, [pdf]);

  async function gerar() {
    setBusy(true);
    try {
      const { gerarRelatorio } = await import('../lib/relatorio');
      const r = await gerarRelatorio(data, { dias: Number(dias), duvidas, geradoPor: `${user.name} (${papel(data.role).label.toLowerCase()})` });
      setPdf({ ...r, url: URL.createObjectURL(r.blob) });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível gerar o PDF.');
    }
    setBusy(false);
  }
  const arquivo = pdf ? new File([pdf.blob], pdf.nome, { type: 'application/pdf' }) : null;
  const podeCompartilhar = !!arquivo && typeof navigator.canShare === 'function' && navigator.canShare({ files: [arquivo] });

  return (
    <Sheet title="📄 Relatório para o pediatra" onClose={onClose}>
      <p className="muted">PDF com crescimento, sono, mamadas, fraldas, padrão de 24 h, remédios, vacinas e as dúvidas da família — pronto para mostrar na consulta ou mandar pelo WhatsApp.</p>
      {proxima && <div className="chip info" style={{ alignSelf: 'flex-start', whiteSpace: 'normal' }}>🩺 Próxima consulta: {proxima.title} em {dataBr(proxima.date.slice(0, 10))}</div>}
      <Field label="Período analisado" hint="Usa dias completos até ontem e compara com o período anterior">
        <Seg value={dias} onChange={(v) => { setDias(v); setPdf(null); }} options={[{ v: '7', l: '7 dias' }, { v: '14', l: '14 dias' }, { v: '30', l: '30 dias' }]} />
      </Field>
      <Field label="Dúvidas para levar à consulta" hint="Uma por linha. Fica salvo neste aparelho até a consulta.">
        <textarea className="input" rows={4} value={duvidas} onChange={(e) => { setDuvidas(e.target.value); setPdf(null); }} placeholder={'Ex.: É normal acordar 3 vezes à noite?\nQuando começar a papinha?'} />
      </Field>
      {!pdf ? (
        <button className="btn primary block" disabled={busy} onClick={gerar}><FileText size={16} /> {busy ? 'Gerando…' : 'Gerar PDF'}</button>
      ) : (
        <div className="card" style={{ background: 'var(--ok-soft)', borderColor: 'transparent', boxShadow: 'none' }}>
          <b>✓ Relatório pronto</b>
          <p className="faint" style={{ marginBottom: 10 }}>{pdf.nome} · {Math.round(pdf.blob.size / 1024)} KB</p>
          <div className="wrap-row">
            {podeCompartilhar && <button className="btn primary" onClick={() => navigator.share({ files: [arquivo!], title: `Relatório de ${data.baby.name}` }).catch(() => undefined)}><Share2 size={15} /> Compartilhar</button>}
            <a className="btn" href={pdf.url} download={pdf.nome}><Download size={15} /> Baixar</a>
            <a className="btn" href={pdf.url} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Abrir</a>
          </div>
        </div>
      )}
    </Sheet>
  );
}
