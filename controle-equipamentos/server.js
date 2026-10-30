// Servidor web: entrega as telas (pasta public) e expõe a API REST em /api.
import express from 'express';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as servicos from './src/servicos.js';

const app = express();
const PORTA = Number(process.env.PORT) || 3000;

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

const api = express.Router();

api.get('/resumo', rota(() => servicos.resumo()));
api.get('/opcoes', rota(() => servicos.opcoes()));

api.get('/equipamentos', rota((req) => servicos.listar(req.query)));
api.get('/equipamentos/:id', rota((req) => servicos.obter(req.params.id)));
api.post('/equipamentos', rota((req) => ({ ids: servicos.cadastrar(req.body) }), 201));
api.put('/equipamentos/:id', rota((req) => servicos.atualizar(req.params.id, req.body)));

api.post('/entregas', rota((req) => servicos.entregar(req.body), 201));
api.post('/devolucoes', rota((req) => servicos.devolver(req.body), 201));
api.post('/trocas', rota((req) => servicos.trocar(req.body), 201));
api.post('/avaliacoes', rota((req) => servicos.avaliar(req.body), 201));

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

app.listen(PORTA, () => {
  console.log(`Controle de Equipamentos disponível em http://localhost:${PORTA}`);
});
