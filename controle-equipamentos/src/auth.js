// Autenticação: senhas com scrypt, sessões no banco e controle de usuários.
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { db } from './db.js';
import { ErroNegocio } from './servicos.js';

export const PERFIS = { administrador: 'Administrador', operador: 'Operador' };
export const COOKIE = 'sessao';
const DURACAO_SESSAO = 8 * 60 * 60 * 1000; // um turno de trabalho
// Por e-mail o limite é baixo; por IP é alto, pois toda a equipe costuma sair pelo mesmo IP do escritório.
const MAX_TENTATIVAS = { e: 5, ip: 30 };
const BLOQUEIO = 5 * 60 * 1000;
const SENHA_MINIMA = 8;

/* ---------- Senhas ---------- */

export function gerarHash(senha) {
  const sal = randomBytes(16);
  const hash = scryptSync(senha, sal, 64);
  return `scrypt$${sal.toString('hex')}$${hash.toString('hex')}`;
}

function conferirSenha(senha, armazenado) {
  const [, sal, hash] = String(armazenado).split('$');
  if (!sal || !hash) return false;
  const esperado = Buffer.from(hash, 'hex');
  const calculado = scryptSync(String(senha), Buffer.from(sal, 'hex'), esperado.length);
  return timingSafeEqual(esperado, calculado);
}

function validarSenha(senha) {
  const s = String(senha ?? '');
  if (s.length < SENHA_MINIMA) throw new ErroNegocio(`A senha deve ter ao menos ${SENHA_MINIMA} caracteres.`);
  if (s.length > 128) throw new ErroNegocio('A senha deve ter no máximo 128 caracteres.');
  if (!/[a-zA-Z]/.test(s) || !/\d/.test(s)) throw new ErroNegocio('A senha deve conter letras e números.');
  return s;
}

// Hash de uma senha aleatória: usado quando o e-mail não existe, para o tempo de resposta não revelar isso.
const HASH_FALSO = gerarHash(randomBytes(12).toString('hex'));

/* ---------- Login e sessões ---------- */

// Tentativas erradas por e-mail e por endereço IP (em memória).
const tentativas = new Map();

function bloqueado(chave) {
  const t = tentativas.get(chave);
  if (!t) return false;
  if (t.ate && t.ate > Date.now()) return true;
  if (t.ate) tentativas.delete(chave);
  return false;
}

function registrarFalha(chave) {
  const t = tentativas.get(chave) || { n: 0 };
  t.n += 1;
  if (t.n >= MAX_TENTATIVAS[chave.split(':')[0]]) t.ate = Date.now() + BLOQUEIO;
  tentativas.set(chave, t);
}

export function login(email, senha, ip) {
  const e = String(email ?? '').trim().toLowerCase();
  if (!e || !senha) throw new ErroNegocio('Informe e-mail e senha.');
  const chaves = [`e:${e}`, `ip:${ip}`];
  if (chaves.some(bloqueado)) {
    throw new ErroNegocio('Muitas tentativas sem sucesso. Aguarde alguns minutos e tente novamente.', 429);
  }

  const usuario = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(e);
  const senhaOk = conferirSenha(senha, usuario?.senha_hash ?? HASH_FALSO);
  if (!usuario || !senhaOk) {
    chaves.forEach(registrarFalha);
    throw new ErroNegocio('E-mail ou senha incorretos.', 401);
  }
  if (!usuario.ativo) throw new ErroNegocio('Usuário desativado. Procure o administrador.', 403);

  tentativas.delete(chaves[0]);
  db.prepare('DELETE FROM sessoes WHERE expira_em < ?').run(Date.now());
  const token = randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessoes (token, usuario_id, expira_em) VALUES (?, ?, ?)').run(token, usuario.id, Date.now() + DURACAO_SESSAO);
  db.prepare("UPDATE usuarios SET ultimo_acesso = datetime('now','localtime') WHERE id = ?").run(usuario.id);
  return { token, usuario: publico(usuario), duracao: DURACAO_SESSAO };
}

export function usuarioDaSessao(token) {
  if (!token) return null;
  const u = db
    .prepare('SELECT u.* FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id WHERE s.token = ? AND s.expira_em > ? AND u.ativo = 1')
    .get(token, Date.now());
  return u ? publico(u) : null;
}

export function logout(token) {
  if (token) db.prepare('DELETE FROM sessoes WHERE token = ?').run(token);
}

export function trocarSenha(usuarioId, atual, nova) {
  const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(usuarioId);
  if (!conferirSenha(atual, u.senha_hash)) throw new ErroNegocio('A senha atual está incorreta.');
  const senha = validarSenha(nova);
  if (senha === atual) throw new ErroNegocio('A nova senha deve ser diferente da atual.');
  db.prepare('UPDATE usuarios SET senha_hash = ?, trocar_senha = 0 WHERE id = ?').run(gerarHash(senha), usuarioId);
}

/* ---------- Usuários (administrador) ---------- */

function publico(u) {
  return {
    id: u.id, nome: u.nome, email: u.email, perfil: u.perfil, ativo: !!u.ativo,
    trocar_senha: !!u.trocar_senha, ultimo_acesso: u.ultimo_acesso, criado_em: u.criado_em,
  };
}

export const listarUsuarios = () => db.prepare('SELECT * FROM usuarios ORDER BY ativo DESC, nome').all().map(publico);

function dadosUsuario(dados) {
  const nome = String(dados.nome ?? '').trim();
  const email = String(dados.email ?? '').trim().toLowerCase();
  if (!nome || nome.length > 80) throw new ErroNegocio('Informe o nome (até 80 caracteres).');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) throw new ErroNegocio('Informe um e-mail válido.');
  if (!PERFIS[dados.perfil]) throw new ErroNegocio('Selecione um perfil válido.');
  return { nome, email, perfil: dados.perfil };
}

const administradoresAtivos = (excetoId) =>
  db.prepare("SELECT COUNT(*) AS n FROM usuarios WHERE perfil = 'administrador' AND ativo = 1 AND id <> ?").get(excetoId).n;

// A senha inicial é provisória: o usuário precisa trocá-la no primeiro acesso.
export function criarUsuario(dados) {
  const { nome, email, perfil } = dadosUsuario(dados);
  const senha = validarSenha(dados.senha);
  if (db.prepare('SELECT id FROM usuarios WHERE email = ?').get(email)) throw new ErroNegocio('Já existe um usuário com este e-mail.', 409);
  const { lastInsertRowid } = db
    .prepare('INSERT INTO usuarios (nome, email, senha_hash, perfil, trocar_senha) VALUES (?, ?, ?, ?, 1)')
    .run(nome, email, gerarHash(senha), perfil);
  return publico(db.prepare('SELECT * FROM usuarios WHERE id = ?').get(Number(lastInsertRowid)));
}

export function atualizarUsuario(id, dados, quemAltera) {
  const atual = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(Number(id));
  if (!atual) throw new ErroNegocio('Usuário não encontrado.', 404);
  const { nome, email, perfil } = dadosUsuario({ ...publico(atual), ...dados });
  const ativo = dados.ativo === undefined ? !!atual.ativo : !!dados.ativo;

  if (db.prepare('SELECT id FROM usuarios WHERE email = ? AND id <> ?').get(email, atual.id)) {
    throw new ErroNegocio('Já existe um usuário com este e-mail.', 409);
  }
  if (atual.id === quemAltera.id && (!ativo || perfil !== 'administrador')) {
    throw new ErroNegocio('Você não pode desativar nem remover o perfil de administrador da sua própria conta.');
  }
  if (atual.perfil === 'administrador' && (!ativo || perfil !== 'administrador') && !administradoresAtivos(atual.id)) {
    throw new ErroNegocio('É preciso manter ao menos um administrador ativo.');
  }

  db.prepare('UPDATE usuarios SET nome = ?, email = ?, perfil = ?, ativo = ? WHERE id = ?').run(nome, email, perfil, ativo ? 1 : 0, atual.id);
  if (dados.nova_senha) {
    db.prepare('UPDATE usuarios SET senha_hash = ?, trocar_senha = 1 WHERE id = ?').run(gerarHash(validarSenha(dados.nova_senha)), atual.id);
  }
  // Desativar ou redefinir a senha encerra as sessões abertas daquele usuário.
  if (!ativo || dados.nova_senha) db.prepare('DELETE FROM sessoes WHERE usuario_id = ?').run(atual.id);
  return publico(db.prepare('SELECT * FROM usuarios WHERE id = ?').get(atual.id));
}

// Primeiro uso: sem nenhum usuário, cria um administrador com senha provisória.
export function garantirAdministrador() {
  if (db.prepare('SELECT COUNT(*) AS n FROM usuarios').get().n) return null;
  const email = (process.env.ADMIN_EMAIL || 'admin@provedor.local').toLowerCase();
  const senha = process.env.ADMIN_SENHA || 'admin123';
  db.prepare("INSERT INTO usuarios (nome, email, senha_hash, perfil, trocar_senha) VALUES ('Administrador', ?, ?, 'administrador', 1)").run(
    email, gerarHash(senha)
  );
  return { email, senha };
}
