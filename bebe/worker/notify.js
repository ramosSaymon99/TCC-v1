/**
 * Notificações push do Ninho: preferências por usuário, envio para os cuidadores de um bebê
 * e lembretes agendados (Cron Trigger a cada 15 min).
 */
import { sendPush } from './push.js';

export const PREFS_PADRAO = {
  atividade: false, // cada registro feito por outro cuidador
  recados: true,
  lembretes: true, // mamada atrasada e cronômetro esquecido
  estoque: true,
  consultas: true,
  familia: true, // alguém entrou no perfil do bebê
  silencio: { on: false, de: '22:00', ate: '06:00' },
};

export const CATEGORIAS = Object.keys(PREFS_PADRAO).filter((k) => k !== 'silencio');

const PAPEL = { mae: 'mãe', pai: 'pai', avo_f: 'avó', avo_m: 'avô', baba: 'babá', tia: 'tia', tio: 'tio', irma: 'irmã', irmao: 'irmão', madrinha: 'madrinha', padrinho: 'padrinho', outro: 'cuidador' };
export const nomePapel = (r) => PAPEL[r] ?? 'cuidador';

function horaLocal(tz) {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: tz || 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
  } catch {
    return null;
  }
}
function emSilencio(prefs, tz) {
  const s = prefs.silencio;
  if (!s?.on) return false;
  const h = horaLocal(tz);
  if (!h) return false;
  return s.de <= s.ate ? h >= s.de && h < s.ate : h >= s.de || h < s.ate;
}

export const lerPrefs = (raw) => {
  const p = raw ? JSON.parse(raw) : {};
  return { ...PREFS_PADRAO, ...p, silencio: { ...PREFS_PADRAO.silencio, ...(p.silencio ?? {}) } };
};

const fmtDur = (min) => (min < 60 ? `${Math.round(min)} min` : `${Math.floor(min / 60)}h${String(Math.round(min % 60)).padStart(2, '0')}`);
const hora = (iso, tz) => {
  try {
    return new Intl.DateTimeFormat('pt-BR', { timeZone: tz || 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  } catch {
    return iso.slice(11, 16);
  }
};

export function descreverEvento(e, data) {
  const d = data ?? {};
  switch (e.type) {
    case 'mamada': return e.end_at ? `mamou no peito por ${fmtDur((Date.parse(e.end_at) - Date.parse(e.start_at)) / 60000)}` : 'começou a mamar no peito';
    case 'mamadeira': return `tomou ${d.ml ? `${d.ml} ml de ` : ''}${d.milk === 'formula' ? 'fórmula' : 'leite'} na mamadeira`;
    case 'sono': return e.end_at ? `acordou (dormiu ${fmtDur((Date.parse(e.end_at) - Date.parse(e.start_at)) / 60000)})` : 'dormiu';
    case 'fralda': return `trocou a fralda (${({ xixi: 'xixi', coco: 'cocô', ambos: 'xixi + cocô', seca: 'seca' })[d.diaper] ?? 'xixi'})`;
    case 'remedio': return `tomou ${d.med || 'remédio'}${d.dose ? ` (${d.dose})` : ''}`;
    case 'banho': return 'tomou banho';
    case 'alimentacao': return `comeu ${d.food || 'papinha'}`;
    case 'extracao': return `extração de ${d.ml ?? '?'} ml`;
    default: return 'novo registro';
  }
}

/**
 * Envia uma notificação a todos os cuidadores do bebê inscritos (exceto `exceto`) que aceitam a categoria.
 * Inscrições expiradas (404/410) são removidas.
 */
export async function notificar(env, babyId, categoria, msg, exceto = null) {
  const subs = (await env.DB.prepare(
    `SELECT p.endpoint, p.p256dh, p.auth, p.tz, p.user_id, n.data AS prefs
       FROM members m JOIN push_subs p ON p.user_id = m.user_id LEFT JOIN notif_prefs n ON n.user_id = m.user_id
      WHERE m.baby_id = ?`,
  ).bind(babyId).all()).results;
  const baby = await env.DB.prepare('SELECT id, name, photo_v FROM babies WHERE id = ?').bind(babyId).first();
  if (!baby) return 0;
  const payload = {
    title: msg.title ?? baby.name,
    body: msg.body,
    tag: msg.tag ?? `${categoria}-${babyId}`,
    url: `./?baby=${babyId}#${msg.aba ?? 'hoje'}`,
    icon: msg.icon ?? './icon-192.png',
  };
  let enviados = 0;
  await Promise.all(subs.map(async (s) => {
    if (exceto && s.user_id === exceto) return;
    const prefs = lerPrefs(s.prefs);
    if (!prefs[categoria] || emSilencio(prefs, s.tz)) return;
    try {
      const st = await sendPush(env, s, payload, categoria === 'lembretes' ? 'high' : 'normal');
      if (st === 404 || st === 410) await env.DB.prepare('DELETE FROM push_subs WHERE endpoint = ?').bind(s.endpoint).run();
      else if (st < 300) enviados++;
    } catch {
      /* falha de rede em uma inscrição não interrompe as demais */
    }
  }));
  return enviados;
}

/** Registra uma chave de deduplicação; retorna true só na primeira vez. */
async function primeiraVez(env, key) {
  const r = await env.DB.prepare('INSERT OR IGNORE INTO notif_log (key, at) VALUES (?, ?)').bind(key, new Date().toISOString()).run();
  return r.meta.changes > 0;
}

function intervaloMaxMin(baby) {
  const r = baby.routine ? JSON.parse(baby.routine) : null;
  if (r?.feedIntervalMin) return r.feedIntervalMin;
  const dias = (Date.now() - Date.parse(`${baby.birth_date}T12:00:00Z`)) / 86400_000;
  return dias < 30 ? 180 : dias < 90 ? 240 : null;
}

/** Lembretes periódicos (Cron Trigger). */
export async function lembretes(env) {
  const agora = Date.now();
  const iso = (ms) => new Date(ms).toISOString();
  await env.DB.prepare('DELETE FROM notif_log WHERE at < ?').bind(iso(agora - 14 * 86400_000)).run();
  const bebes = (await env.DB.prepare(
    'SELECT DISTINCT b.* FROM babies b JOIN members m ON m.baby_id = b.id JOIN push_subs p ON p.user_id = m.user_id',
  ).all()).results;
  for (const b of bebes) {
    const nome = b.name.split(' ')[0];
    // Fuso horário de quem acompanha (para mostrar os horários certos no texto)
    const tz = (await env.DB.prepare('SELECT p.tz FROM push_subs p JOIN members m ON m.user_id = p.user_id WHERE m.baby_id = ? AND p.tz IS NOT NULL LIMIT 1').bind(b.id).first())?.tz;

    // 1) Mamada atrasada em relação ao intervalo planejado
    const max = intervaloMaxMin(b);
    if (max) {
      const ult = await env.DB.prepare("SELECT id, start_at FROM events WHERE baby_id = ? AND type IN ('mamada','mamadeira') ORDER BY start_at DESC LIMIT 1").bind(b.id).first();
      if (ult) {
        const min = (agora - Date.parse(ult.start_at)) / 60000;
        if (min > max && min < max + 180 && (await primeiraVez(env, `feed:${ult.id}`))) {
          const dormindo = await env.DB.prepare("SELECT 1 FROM events WHERE baby_id = ? AND type = 'sono' AND end_at IS NULL").bind(b.id).first();
          await notificar(env, b.id, 'lembretes', {
            title: `🍼 ${nome}: hora da mamada`,
            body: `Última mamada há ${fmtDur(min)} (às ${hora(ult.start_at, tz)}). O intervalo planejado é de até ${fmtDur(max)}.${dormindo ? ` ${nome} está dormindo.` : ''}`,
            tag: `feed-${b.id}`,
          });
        }
      }
    }

    // 2) Cronômetro esquecido (mamada > 75 min ou sono > 10 h)
    const abertos = (await env.DB.prepare("SELECT id, type, start_at FROM events WHERE baby_id = ? AND end_at IS NULL AND type IN ('mamada','sono')").bind(b.id).all()).results;
    for (const e of abertos) {
      const min = (agora - Date.parse(e.start_at)) / 60000;
      if ((e.type === 'mamada' ? min > 75 : min > 600) && (await primeiraVez(env, `timer:${e.id}`))) {
        await notificar(env, b.id, 'lembretes', {
          title: `⏱️ Cronômetro de ${e.type === 'sono' ? 'sono' : 'mamada'} ainda rodando`,
          body: `Começou às ${hora(e.start_at, tz)} (há ${fmtDur(min)}). Toque para encerrar ou corrigir o horário.`,
          tag: `timer-${e.id}`,
        });
      }
    }

    // 3) Consultas: véspera (24 h) e 2 h antes
    const consultas = (await env.DB.prepare('SELECT * FROM appointments WHERE baby_id = ? AND done = 0 AND date > ? AND date <= ?').bind(b.id, iso(agora), iso(agora + 24 * 3600_000)).all()).results;
    for (const a of consultas) {
      const h = (Date.parse(a.date) - agora) / 3600_000;
      const chave = h <= 2 ? `appt2:${a.id}` : `appt24:${a.id}`;
      if (await primeiraVez(env, chave)) {
        await notificar(env, b.id, 'consultas', {
          title: `🩺 ${a.title}`,
          body: `${h <= 2 ? 'Daqui a pouco' : `Em ${Math.round(h)} h`}, às ${hora(a.date, tz)}${a.doctor ? ` · ${a.doctor}` : ''}. ${a.note ?? ''}`.trim(),
          tag: `appt-${a.id}`,
          aba: 'saude',
        });
      }
    }
  }
}
