import type { BabyData } from '../types';
import { api, localCriarUsuarioDemo, type Modo } from './api';
import { gerarDemo, nascimentoDemo, ROTINA_DEMO } from './demo';

/** Carrega ~5 semanas de dados de exemplo no bebê (usa os cuidadores existentes por papel). */
export async function carregarExemplo(data: BabyData, meuId: string, modo: Modo) {
  const { baby } = data;
  const ids: Record<string, string> = { mae: meuId };
  for (const m of data.members) if (!ids[m.role]) ids[m.role] = m.user_id;
  if (modo === 'local') {
    for (const [role, nome] of [['pai', 'Rafael'], ['avo_f', 'Dona Lúcia'], ['baba', 'Marta']] as const) {
      if (!ids[role]) ids[role] = localCriarUsuarioDemo(baby.id, nome, role);
    }
  }
  const { seed, vacinas } = gerarDemo(baby.birth_date, ids, Date.now());
  await api.seed(baby.id, seed);
  for (const v of vacinas) await api.setVaccine(baby.id, v.code, v.date);
  if (!baby.routine?.feeds?.length) await api.updateBaby(baby.id, { routine: ROTINA_DEMO });
}

/**
 * Cria uma família de exemplo completa pela própria API (funciona no D1 e no modo local):
 * mãe (admin) cadastra a bebê, convida pai, avó e babá, que aceitam os convites; depois carrega a rotina.
 */
export async function criarFamiliaExemplo() {
  const tag = Math.random().toString(36).slice(2, 8);
  const senha = `demo-${tag}-${Math.random().toString(36).slice(2, 8)}`;
  const email = (p: string) => `${p}.${tag}@exemplo.ninho`;
  await api.signup('Ana (exemplo)', email('ana'), senha);
  const { id } = await api.createBaby({ name: 'Helena', birth_date: nascimentoDemo(), sex: 'F', color: '#E0708A', role: 'mae', routine: ROTINA_DEMO, notes: 'Exemplo: sem alergias conhecidas. Usa chupeta só para dormir.' });
  const convidados = [['Rafael', 'pai', 'admin'], ['Dona Lúcia', 'avo_f', 'editor'], ['Marta', 'baba', 'editor']] as const;
  const codigos = [];
  for (const [, role, access] of convidados) codigos.push((await api.invite(id, role, access)).code);
  for (let i = 0; i < convidados.length; i++) {
    await api.signup(convidados[i][0], email(convidados[i][1]), senha);
    await api.acceptInvite(codigos[i], convidados[i][1]);
  }
  await api.login(email('ana'), senha);
  const data = await api.getBaby(id, new Date(0).toISOString());
  // Os cuidadores já existem de verdade, então não cria usuários extras (mesmo no modo local)
  await carregarExemplo(data, data.members.find((m) => m.role === 'mae')!.user_id, 'cloud');
  return id;
}
