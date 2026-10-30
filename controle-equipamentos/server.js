// Servidor web: entrega as telas (pasta public) e expõe a API REST em /api.
import express from 'express';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as servicos from './src/servicos.js';
import * as auth from './src/auth.js';

const app = express();
const PORTA = Number(process.env.PORT) || 3000;
app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY === '1');

app.use(express.json({ limit: '200kb' }));
app.use(express.static(resolve(dirname(fileURLToPath(import.meta.url)), 'public')));

// Envolve cada rota para devolver o resultado em JSON e tratar erros em um só lugar.
const rota = (fn, status = 200) => (req, res, next) => {
  try {
    res.status(status).json(fn(req));
  } catch (erro) {
    next(erro);
  }
};

const lerCookie = (req, nome) =>
  (req.headers.cookie || '')
    .split(';')
    .map((c) => c.trim().split('='))
    .find(([k]) => k === nome)?.[1];

const cookieSessao = (req, valor, maxAge) =>
  `${auth.COOKIE}=${valor}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(maxAge / 1000)}${req.secure ? '; Secure' : ''}`;

const api = express.Router();

// Gravações só aceitam JSON: um formulário de outro site não consegue enviar esse tipo sem permissão do navegador.
api.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  if (['POST', 'PUT', 'DELETE'].includes(req.method) && !req.is('application/json')) {
    return res.status(415).json({ erro: 'Envie os dados em JSON.' });
  }
  next();
});

api.post('/login', (req, res, next) => {
  try {
    const { token, usuario, duracao } = auth.login(req.body.email, req.body.senha, req.ip);
    res.setHeader('Set-Cookie', cookieSessao(req, token, duracao));
    res.json(usuario);
  } catch (erro) {
    next(erro);
  }
});

api.post('/logout', (req, res) => {
  auth.logout(lerCookie(req, auth.COOKIE));
  res.setHeader('Set-Cookie', cookieSessao(req, '', 0));
  res.json({ ok: true });
});

// Daqui em diante, todas as rotas exigem uma sessão válida.
api.use((req, res, next) => {
  req.usuario = auth.usuarioDaSessao(lerCookie(req, auth.COOKIE));
  if (!req.usuario) return res.status(401).json({ erro: 'Sessão expirada. Entre novamente.' });
  next();
});

api.get('/sessao', rota((req) => ({ ...req.usuario, perfis: auth.PERFIS })));
api.post('/senha', rota((req) => {
  auth.trocarSenha(req.usuario.id, req.body.atual, req.body.nova);
  return { ok: true };
}));

// Com senha provisória, o usuário precisa trocá-la antes de usar o sistema.
api.use((req, res, next) => {
  if (req.usuario.trocar_senha) return res.status(403).json({ erro: 'Troque a senha provisória para continuar.', trocar_senha: true });
  next();
});

const somenteAdministrador = (req, res, next) =>
  req.usuario.perfil === 'administrador' ? next() : res.status(403).json({ erro: 'Acesso restrito ao administrador.' });

api.get('/usuarios', somenteAdministrador, rota(() => auth.listarUsuarios()));
api.post('/usuarios', somenteAdministrador, rota((req) => auth.criarUsuario(req.body), 201));
api.put('/usuarios/:id', somenteAdministrador, rota((req) => auth.atualizarUsuario(req.params.id, req.body, req.usuario)));

// Cada movimentação registra qual usuário a lançou.
const comUsuario = (req) => ({ ...req.body, usuario_id: req.usuario.id });

api.get('/resumo', rota(() => servicos.resumo()));
api.get('/opcoes', rota(() => servicos.opcoes()));

api.get('/equipamentos', rota((req) => servicos.listar(req.query)));
api.get('/equipamentos/:id', rota((req) => servicos.obter(req.params.id)));
api.post('/equipamentos', rota((req) => ({ ids: servicos.cadastrar(comUsuario(req)) }), 201));
api.put('/equipamentos/:id', rota((req) => servicos.atualizar(req.params.id, req.body)));

api.post('/entregas', rota((req) => servicos.entregar(comUsuario(req)), 201));
api.post('/devolucoes', rota((req) => servicos.devolver(comUsuario(req)), 201));
api.post('/trocas', rota((req) => servicos.trocar(comUsuario(req)), 201));
api.post('/avaliacoes', rota((req) => servicos.avaliar(comUsuario(req)), 201));

api.get('/movimentacoes', rota((req) => servicos.movimentacoes(req.query)));
api.get('/clientes/:codigo', rota((req) => servicos.porCliente(req.params.codigo)));

api.use((req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));

app.use('/api', api);

app.use((erro, req, res, next) => {
  if (erro instanceof servicos.ErroNegocio) {
    return res.status(erro.status).json({ erro: erro.message, detalhes: erro.detalhes });
  }
  if (erro.type === 'entity.parse.failed') return res.status(400).json({ erro: 'Dados enviados em formato inválido.' });
  console.error(erro);
  res.status(500).json({ erro: 'Erro interno ao processar a solicitação.' });
});

const adminCriado = auth.garantirAdministrador();
if (adminCriado) {
  console.log(`Primeiro acesso: entre com ${adminCriado.email} e a senha provisória "${adminCriado.senha}" (será pedida a troca).`);
}

app.listen(PORTA, () => {
  console.log(`Controle de Equipamentos disponível em http://localhost:${PORTA}`);
});
