import type { StatusAssinatura } from '../../types';
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
