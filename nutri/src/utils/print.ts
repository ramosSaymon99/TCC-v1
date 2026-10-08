import type { Alimento, Config, Paciente, PlanoAlimentar } from '../types';
import { date, today } from './format';
import { medidaCaseira, totaisItens, totaisPlano } from './nutri';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const f0 = (n: number) => Math.round(n).toLocaleString('pt-BR');

const CSS = `
*{box-sizing:border-box} body{font-family:'Plus Jakarta Sans',system-ui,Segoe UI,Roboto,sans-serif;color:#10241c;margin:0;padding:36px;font-size:13px;line-height:1.5}
.top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #2f6b4f;padding-bottom:14px;margin-bottom:20px}
.brand{font-size:20px;font-weight:700;color:#1d2a22}.brand small{display:block;font-size:11px;color:#5f7a6e;font-weight:400}
.doc{text-align:right}.doc h1{margin:0;font-size:18px;color:#2f6b4f}.doc div{color:#5f7a6e;font-size:12px}
h2{font-size:14px;margin:18px 0 6px;color:#1d2a22;display:flex;justify-content:space-between;align-items:baseline}
h2 span{font-size:11px;color:#5f7a6e;font-weight:500}
.box{border:1px solid #dfe8e3;border-radius:8px;padding:10px 14px;background:#f7faf8}
table{width:100%;border-collapse:collapse}td{padding:6px 8px;border-bottom:1px solid #e8efeb}td.q{width:42%;color:#3d5249}
.meal{break-inside:avoid;margin-bottom:6px}
.or{white-space:pre-line}
.foot{margin-top:28px;font-size:11px;color:#5f7a6e;display:flex;justify-content:space-between;border-top:1px solid #dfe8e3;padding-top:10px}
@media print{body{padding:0}@page{margin:16mm}}`;

export function imprimirPlano(plano: PlanoAlimentar, p: Paciente, cfg: Config, alimentos: Map<string, Alimento>, peso: number) {
  const w = window.open('', '_blank');
  if (!w) { alert('Permita pop-ups para gerar o documento.'); return; }
  const tot = totaisPlano(plano, alimentos);
  const refeicoes = [...plano.refeicoes].sort((a, b) => a.hora.localeCompare(b.hora)).map((r) => {
    const t = totaisItens(r.itens, alimentos);
    const linhas = r.itens.map((it) => {
      const a = alimentos.get(it.alimentoId);
      if (!a) return '';
      const mc = medidaCaseira(a, it.gramas);
      return `<tr><td>${esc(a.nome)}</td><td class="q">${f0(it.gramas)} g${mc ? ` · ${esc(mc)}` : ''}</td></tr>`;
    }).join('');
    return `<div class="meal"><h2>${esc(r.hora)} · ${esc(r.nome)}<span>${f0(t.kcal)} kcal</span></h2><table>${linhas}</table></div>`;
  }).join('');
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(plano.nome)} - ${esc(p.nome)}</title><style>${CSS}</style></head><body>
<div class="top">
  <div class="brand">${esc(cfg.nome)}<small>Nutricionista · ${esc(cfg.crn)} · ${esc(cfg.telefone)} · ${esc(cfg.email)}</small></div>
  <div class="doc"><h1>Plano alimentar</h1><div>${esc(p.nome)}</div><div>Emitido em ${date(plano.criadoEm)}</div></div>
</div>
<div class="box">Energia total ≈ <b>${f0(tot.kcal)} kcal</b> · Proteínas ${f0(tot.prot)} g · Carboidratos ${f0(tot.carb)} g · Gorduras ${f0(tot.gord)} g · Fibras ${f0(tot.fibra)} g · Água: ${(peso * 0.035).toFixed(1).replace('.', ',')} L/dia</div>
${refeicoes}
${plano.orientacoes ? `<h2>Orientações</h2><div class="box or">${esc(plano.orientacoes)}</div>` : ''}
<div class="foot"><span>${esc(cfg.endereco)}</span><span>Gerado em ${date(today())}</span></div>
<script>window.onload=()=>setTimeout(()=>window.print(),200)<\/script></body></html>`);
  w.document.close();
}
