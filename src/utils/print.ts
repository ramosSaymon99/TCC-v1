import type { Cliente, Empresa, Orcamento, OrdemServico } from '../types';
import { date, money, today } from './format';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

const CSS = `
*{box-sizing:border-box} body{font-family:Inter,system-ui,Segoe UI,Roboto,sans-serif;color:#0f1e36;margin:0;padding:40px;font-size:13px;line-height:1.5}
.top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #1e6fe8;padding-bottom:16px;margin-bottom:24px}
.brand{font-size:22px;font-weight:700;color:#0a2656}.brand small{display:block;font-size:11px;color:#6b7a90;font-weight:400}
.doc{text-align:right}.doc h1{margin:0;font-size:18px;color:#1e6fe8}.doc div{color:#6b7a90;font-size:12px}
h2{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#6b7a90;margin:22px 0 8px}
.box{border:1px solid #e4e9f1;border-radius:8px;padding:12px 14px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px}.grid b{display:block;font-size:11px;color:#6b7a90;font-weight:500}
table{width:100%;border-collapse:collapse;margin-top:6px}th{background:#f3f6fb;text-align:left;font-size:11px;color:#6b7a90;padding:8px 10px}
td{padding:10px;border-bottom:1px solid #e4e9f1}.r{text-align:right}.total td{font-weight:700;font-size:15px;border:0;background:#eaf2fe}
.sign{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:60px}.sign div{border-top:1px solid #0f1e36;padding-top:6px;text-align:center;font-size:12px}
.foot{margin-top:40px;font-size:11px;color:#6b7a90;text-align:center}
@media print{body{padding:0}@page{margin:18mm}}`;

function abrir(titulo: string, corpo: string) {
  const w = window.open('', '_blank');
  if (!w) { alert('Permita pop-ups para gerar o documento.'); return; }
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>${CSS}</style></head><body>${corpo}<script>window.onload=()=>setTimeout(()=>window.print(),200)<\/script></body></html>`);
  w.document.close();
}

const cabecalho = (e: Empresa, titulo: string, numero: string, sub: string) => `
<div class="top">
  <div class="brand">${esc(e.nome)}<small>CNPJ ${esc(e.cnpj)} · ${esc(e.telefone)} · ${esc(e.email)} · ${esc(e.endereco)}</small></div>
  <div class="doc"><h1>${esc(titulo)}</h1><div>Nº ${esc(numero)}</div><div>${esc(sub)}</div></div>
</div>`;

const blocoCliente = (c?: Cliente) => `
<h2>Cliente</h2>
<div class="box grid">
  <div><b>Nome / Razão social</b>${esc(c?.nome ?? '—')}</div>
  <div><b>${c?.tipo === 'Pessoa Jurídica' ? 'CNPJ' : 'CPF'}</b>${esc(c?.documento || '—')}</div>
  <div><b>Telefone</b>${esc(c?.telefone ?? '—')}</div>
  <div><b>E-mail</b>${esc(c?.email ?? '—')}</div>
  <div style="grid-column:1/-1"><b>Endereço</b>${esc(c ? `${c.endereco} - ${c.cidade}` : '—')}</div>
</div>`;

export function imprimirProposta(o: Orcamento, c: Cliente | undefined, e: Empresa) {
  abrir(`Proposta ${o.numero}`, `
${cabecalho(e, 'Proposta Comercial', o.numero, `Emitida em ${date(o.criadoEm)} · Válida até ${date(o.validade)}`)}
${blocoCliente(c)}
<h2>Serviço proposto</h2>
<table>
  <thead><tr><th>Descrição</th><th>Categoria</th><th class="r">Valor</th></tr></thead>
  <tbody>
    <tr><td><strong>${esc(o.servico)}</strong>${o.descricao ? `<div style="color:#3d4b63;margin-top:4px">${esc(o.descricao)}</div>` : ''}</td><td>${esc(o.categoria)}</td><td class="r">${money(o.valor)}</td></tr>
    <tr class="total"><td colspan="2">Total</td><td class="r">${money(o.valor)}</td></tr>
  </tbody>
</table>
<h2>Condições</h2>
<div class="box">
  • Validade da proposta: até ${date(o.validade)}.<br>
  • Pagamento: 50% na aprovação e 50% na entrega, via PIX ou transferência (a combinar).<br>
  • Prazo de execução definido na aprovação, conforme agenda.<br>
  • Garantia de 90 dias sobre o serviço executado.
</div>
<div class="sign"><div>${esc(e.nome)}</div><div>De acordo — ${esc(c?.nome ?? 'Cliente')}</div></div>
<div class="foot">Documento gerado pelo TechGest em ${date(today())}.</div>`);
}

export function imprimirOS(o: OrdemServico, c: Cliente | undefined, e: Empresa, equipamento?: string, pecas: { nome: string; qtd: number }[] = []) {
  abrir(`OS ${o.numero}`, `
${cabecalho(e, 'Ordem de Serviço', o.numero, `Abertura ${date(o.abertura)} · Prazo ${date(o.prazo)}`)}
${blocoCliente(c)}
<h2>Serviço</h2>
<div class="box grid">
  <div><b>Serviço</b>${esc(o.servico)}</div>
  <div><b>Categoria</b>${esc(o.categoria)}</div>
  <div><b>Equipamento</b>${esc(equipamento ?? 'Não informado')}</div>
  <div><b>Técnico responsável</b>${esc(o.tecnico ?? '—')}</div>
  <div><b>Status</b>${esc(o.status)}</div>
  <div><b>Conclusão</b>${esc(o.conclusao ? date(o.conclusao) : '—')}</div>
  <div style="grid-column:1/-1"><b>Descrição / problema relatado</b>${esc(o.descricao || '—')}</div>
</div>
${pecas.length ? `<h2>Peças utilizadas</h2><table><thead><tr><th>Peça</th><th class="r">Qtd.</th></tr></thead><tbody>${pecas.map((p) => `<tr><td>${esc(p.nome)}</td><td class="r">${p.qtd}</td></tr>`).join('')}</tbody></table>` : ''}
<table style="margin-top:18px"><tbody><tr class="total"><td>Valor total do serviço</td><td class="r">${money(o.valor)}</td></tr></tbody></table>
<h2>Termo de entrega</h2>
<div class="box">Declaro ter recebido o equipamento/serviço acima em perfeito funcionamento. Garantia de 90 dias para o serviço executado, não cobrindo mau uso, quedas, líquidos ou intervenção de terceiros.</div>
<div class="sign"><div>Técnico — ${esc(o.tecnico ?? e.nome)}</div><div>Cliente — ${esc(c?.nome ?? '')}</div></div>
<div class="foot">Documento gerado pelo TechGest em ${date(today())}.</div>`);
}
