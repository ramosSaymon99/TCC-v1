import type { Cliente, Empresa, Lancamento, Mensagem, Orcamento, OrdemServico } from '../types';
import type { Rotulos } from '../store/segmentos';
import { date, money } from './format';

/** Somente dígitos, com DDI 55 para números brasileiros informados sem ele. */
export function normalizarTelefone(tel?: string) {
  const d = String(tel ?? '').replace(/\D/g, '');
  if (!d) return '';
  return d.length === 10 || d.length === 11 ? `55${d}` : d;
}
/** DDD + 8 últimos dígitos: casa números com e sem o nono dígito. */
export function chaveTelefone(tel?: string) {
  let d = normalizarTelefone(tel);
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
  return d.length >= 10 ? `${d.slice(0, 2)}${d.slice(-8)}` : d;
}
export const telefoneValido = (tel?: string) => normalizarTelefone(tel).length >= 12;
/** Link "clique para conversar" do WhatsApp com a mensagem já escrita. */
export const linkWhatsApp = (tel: string, texto: string) => `https://wa.me/${normalizarTelefone(tel)}?text=${encodeURIComponent(texto)}`;
export const telefoneFormatado = (tel?: string) => {
  const d = normalizarTelefone(tel);
  const m = d.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : d ? `+${d}` : '';
};

/** Mensagens do cliente (por cadastro ou pelo telefone), da mais antiga para a mais recente. */
export function conversaDe(mensagens: Mensagem[], cliente?: Pick<Cliente, 'id' | 'telefone'>, telefone?: string) {
  const chave = chaveTelefone(telefone ?? cliente?.telefone);
  return mensagens
    .filter((m) => (cliente && m.clienteId === cliente.id) || (chave && chaveTelefone(m.telefone) === chave))
    .sort((a, b) => a.data.localeCompare(b.data));
}

/** Pessoa física: primeiro nome; empresa: nome completo. */
const primeiroNome = (c?: Pick<Cliente, 'nome'> & Partial<Pick<Cliente, 'tipo'>>) => (c?.tipo === 'Pessoa Jurídica' ? c.nome : (c?.nome ?? '').split(' ')[0]) || 'tudo bem';

/* ---------------- modelos de mensagem ---------------- */
export const msgOrcamento = (o: Orcamento, c: Cliente | undefined, e: Empresa) =>
  `Olá, ${primeiroNome(c)}! Aqui é da ${e.nome}.\n\nSegue o orçamento ${o.numero}:\n• ${o.servico}: ${money(o.valor)}\n\nVálido até ${date(o.validade)}. Podemos confirmar para dar início?`;

export function msgOrdem(o: OrdemServico, c: Cliente | undefined, e: Empresa, r: Pick<Rotulos, 'ordem'>) {
  const ref = `${r.ordem.toLowerCase()} ${o.numero}`;
  const ini = `Olá, ${primeiroNome(c)}! Aqui é da ${e.nome}.`;
  switch (o.status) {
    case 'Finalizada': return `${ini}\n\nSeu serviço "${o.servico}" (${ref}) está concluído e pronto para retirada/entrega. Valor: ${money(o.valor)}.\n\nQual o melhor horário para você?`;
    case 'Aguardando material': return `${ini}\n\nSua ${ref} (${o.servico}) está aguardando a chegada de material. Assim que chegar, damos continuidade e avisamos por aqui.`;
    case 'Cancelada': return `${ini}\n\nConforme combinado, a ${ref} (${o.servico}) foi cancelada. Qualquer dúvida, estamos à disposição.`;
    default: return `${ini}\n\nAtualização da sua ${ref} (${o.servico}): ${o.status.toLowerCase()}, com previsão para ${date(o.prazo)}.`;
  }
}

export const msgCobranca = (l: Lancamento, c: Cliente | undefined, e: Empresa) =>
  `Olá, ${primeiroNome(c)}! Aqui é da ${e.nome}.\n\nPassando para lembrar do pagamento de ${money(l.valor)} referente a "${l.descricao}", com vencimento em ${date(l.data)}.\n\nSe já pagou, por favor desconsidere esta mensagem. Obrigado!`;

export const msgLivre = (c: Pick<Cliente, 'nome'> | undefined, e: Empresa) => `Olá, ${primeiroNome(c)}! Aqui é da ${e.nome}. `;
