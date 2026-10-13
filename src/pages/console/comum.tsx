import type { FormaPagamento, StatusAssinatura } from '../../types';
import { Badge } from '../../components/ui';
import type { Saude } from '../../store/plataforma';
import { MODULOS } from '../../store/seed';

export const STATUS_ASSINATURA: StatusAssinatura[] = ['Trial', 'Ativa', 'Inadimplente', 'Suspensa', 'Cancelada'];
const TOM: Record<StatusAssinatura, string> = { Trial: 'purple', Ativa: 'green', Inadimplente: 'orange', Suspensa: 'red', Cancelada: 'gray' };
export const StatusBadge = ({ s }: { s: StatusAssinatura }) => <Badge tone={TOM[s]}>{s === 'Trial' ? 'Teste grátis' : s}</Badge>;

export const SaudeBadge = ({ s }: { s: Saude }) => (
  <span title={`Acesso: ${s.diasSemAcesso === null ? 'nunca' : `há ${s.diasSemAcesso} dia(s)`} · Adoção: ${Math.round(s.adocao * 100)}% · Atraso: ${s.atrasoDias} dia(s)`}>
    <Badge tone={s.nivel === 'Saudável' ? 'green' : s.nivel === 'Atenção' ? 'orange' : 'red'}>{s.score} · {s.nivel}</Badge>
  </span>
);

export const nomeModulo = (id: string) => MODULOS.find((m) => m.id === id)?.label ?? id;

export const FORMAS_PAGAMENTO: { id: FormaPagamento; label: string }[] = [
  { id: 'UNDEFINED', label: 'Cliente escolhe (Pix, boleto ou cartão)' },
  { id: 'PIX', label: 'Pix' },
  { id: 'BOLETO', label: 'Boleto (com QR Code Pix)' },
  { id: 'CREDIT_CARD', label: 'Cartão de crédito (recorrente)' },
];
export const nomeForma = (f?: string) => ({ UNDEFINED: 'cliente escolhe', PIX: 'Pix', BOLETO: 'boleto', CREDIT_CARD: 'cartão' } as Record<string, string>)[f ?? ''] ?? f ?? '—';
