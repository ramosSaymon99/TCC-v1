// Comunicação com a API REST do servidor.
export class ErroApi extends Error {
  constructor(mensagem, status, detalhes) {
    super(mensagem);
    this.status = status;
    this.detalhes = detalhes;
  }
}

async function requisicao(metodo, caminho, corpo) {
  let resposta;
  try {
    resposta = await fetch(`/api${caminho}`, {
      method: metodo,
      headers: corpo ? { 'Content-Type': 'application/json' } : undefined,
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
  } catch {
    throw new ErroApi('Não foi possível conectar ao servidor. Verifique se ele está em execução.', 0);
  }
  const dados = await resposta.json().catch(() => ({}));
  // Sem sessão: volta para o login e, depois de entrar, retorna à tela em que estava.
  if (resposta.status === 401 && caminho !== '/login') {
    location.href = `login.html?voltar=${encodeURIComponent(location.hash)}`;
    return new Promise(() => {});
  }
  if (resposta.status === 403 && dados.trocar_senha && location.hash !== '#/senha') location.hash = '#/senha';
  if (!resposta.ok) throw new ErroApi(dados.erro || 'Erro ao processar a solicitação.', resposta.status, dados.detalhes);
  return dados;
}

const consulta = (params = {}) => {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null));
  return q.toString() ? `?${q}` : '';
};

export const api = {
  login: (email, senha) => requisicao('POST', '/login', { email, senha }),
  logout: () => requisicao('POST', '/logout', {}),
  sessao: () => requisicao('GET', '/sessao'),
  trocarSenha: (atual, nova) => requisicao('POST', '/senha', { atual, nova }),
  usuarios: () => requisicao('GET', '/usuarios'),
  criarUsuario: (dados) => requisicao('POST', '/usuarios', dados),
  atualizarUsuario: (id, dados) => requisicao('PUT', `/usuarios/${id}`, dados),
  resumo: () => requisicao('GET', '/resumo'),
  opcoes: () => requisicao('GET', '/opcoes'),
  equipamentos: (filtros) => requisicao('GET', `/equipamentos${consulta(filtros)}`),
  equipamento: (id) => requisicao('GET', `/equipamentos/${id}`),
  cadastrar: (dados) => requisicao('POST', '/equipamentos', dados),
  atualizar: (id, dados) => requisicao('PUT', `/equipamentos/${id}`, dados),
  entregar: (dados) => requisicao('POST', '/entregas', dados),
  devolver: (dados) => requisicao('POST', '/devolucoes', dados),
  trocar: (dados) => requisicao('POST', '/trocas', dados),
  avaliar: (dados) => requisicao('POST', '/avaliacoes', dados),
  movimentacoes: (filtros) => requisicao('GET', `/movimentacoes${consulta(filtros)}`),
  cliente: (codigo) => requisicao('GET', `/clientes/${encodeURIComponent(codigo)}`),
};
