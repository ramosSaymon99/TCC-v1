# Controle de Equipamentos · Provedor de Internet

Aplicação web para controle de entregas, devoluções, trocas e estoque de equipamentos (ONUs, roteadores, repetidores) em um provedor de internet. Substitui os registros manuais em folha por registros organizados, com histórico completo de cada aparelho.

## Tecnologias e requisitos do curso (ADS)

| Tecnologia | Exigência | Onde é usada |
|---|---|---|
| **HTML5** | Obrigatória | `public/index.html` e telas: formulários com validação nativa (`required`, `type="date"`, `min`/`max`, `maxlength`, `pattern`), `datalist` para sugestões e leitura de código de barras, elementos semânticos (`header`, `nav`, `main`, `section`, `aside`, `fieldset`) |
| **CSS3** | Obrigatória | `public/css/style.css`: variáveis CSS, Grid, Flexbox, media queries (celular), modo escuro (`prefers-color-scheme`), seletor `:has()`, animações |
| **JavaScript** | Obrigatória | Telas em JavaScript puro com módulos ES (`public/js`) e servidor em JavaScript (Node.js) |
| Banco de dados estruturado | Opcional | SQLite (módulo nativo `node:sqlite`), com chaves estrangeiras, restrições `CHECK` e `UNIQUE` |
| Node.js + Express | Opcional | Servidor web e API (`server.js`) |
| Consumo de API REST | Opcional | As telas consomem a API REST própria (`/api`) com `fetch` (`public/js/api.js`) |

Sem frameworks no front-end: as telas usam apenas HTML5, CSS3 e JavaScript, o que deixa explícito o uso das três tecnologias obrigatórias.

## Telas

| Tela | O que faz |
|---|---|
| Login | Acesso com e-mail e senha; mostrar/ocultar senha; após entrar, volta para a tela que a pessoa tentou abrir |
| Início | Resumo por situação, painel **“Onde agir agora”** (estoque acabando, fila de avaliação parada, modelos com falha acima da média, concentração de queimas), estoque e cobertura por tipo, entregas × devoluções em 6 meses, falhas por modelo, fila de avaliação e últimas movimentações |
| Cadastro de equipamentos | Tipo, marca, modelo e número de série; cadastro de um aparelho ou de um lote inteiro (um número por linha), com bloqueio de duplicados; edição dos dados de cadastro |
| Entrega | Equipamento disponível, código do cliente, data e responsável; mostra os aparelhos que o cliente já possui (evita entrega em duplicidade) |
| Devolução | Aparelho recebido, motivo e condição informada; busca por código do cliente |
| Troca | Relaciona o equipamento devolvido ao novo equipamento entregue, em uma única operação |
| Estoque e histórico | Pesquisa por número de série, modelo, marca ou cliente; filtros por tipo e situação; exportação CSV; linha do tempo do aparelho; **avaliação técnica** |
| Usuários (administrador) | Cadastro de usuários com senha provisória, perfil, ativação/desativação e redefinição de senha |
| Alterar senha | Troca da própria senha; obrigatória no primeiro acesso |

## Login e perfis

| Perfil | Pode |
|---|---|
| Operador | Cadastrar equipamentos, registrar entregas, devoluções, trocas e avaliações, consultar estoque e histórico |
| Administrador | Tudo o que o operador faz e gerenciar usuários |

- Cada movimentação guarda **quem a lançou** (usuário conectado), além do responsável informado (quem fez a entrega em campo, por exemplo). O histórico mostra os dois quando são pessoas diferentes.
- O responsável vem preenchido com o nome do usuário conectado.
- Usuário novo ou com senha redefinida recebe senha **provisória** e só consegue usar o sistema depois de trocá-la.

Segurança:

- Senhas guardadas com **scrypt** e sal aleatório (nunca em texto); comparação em tempo constante.
- Sessão em cookie `HttpOnly` e `SameSite=Strict` (inacessível ao JavaScript da página), válida por 8 horas e guardada no banco. Sair, desativar o usuário ou redefinir a senha encerra a sessão.
- Todas as rotas da API exigem sessão válida; as de usuários exigem perfil administrador. A verificação é feita no servidor, não só escondendo menus.
- Após 5 senhas erradas para o mesmo e-mail, o acesso dele fica bloqueado por 5 minutos (e 30 erros pelo mesmo IP bloqueiam aquele IP). A mensagem não informa se o e-mail existe.
- Senha com no mínimo 8 caracteres, letras e números. Gravações só aceitam JSON, o que impede envio de formulários a partir de outros sites.
- Não é possível desativar a própria conta nem ficar sem nenhum administrador ativo.

## Regras de negócio

Motivo da devolução e situação do equipamento são informações separadas:

- **Motivo da devolução:** cancelamento, troca, defeito relatado ou queima relatada.
- **Situação do equipamento:** disponível, com cliente, aguardando avaliação, em manutenção ou baixado.

Fluxo de situações:

```
cadastro ──► Disponível ──entrega──► Com cliente ──devolução/troca──► Aguardando avaliação
                 ▲                                                        │
                 └──────────── avaliação: aprovado ◄──────────────────────┤
                                                                          ├─► Em manutenção ─► (nova avaliação)
                                                                          └─► Baixado (exige motivo)
```

- Um aparelho devolvido **nunca** volta direto para disponível: passa por avaliação técnica.
- Só é possível entregar aparelhos disponíveis e devolver aparelhos que estão com cliente.
- A situação não é editável manualmente; ela só muda por movimentação, o que mantém o histórico confiável.
- A data não pode estar no futuro nem ser anterior à última movimentação do aparelho.
- Número de série é único (sem diferenciar maiúsculas/minúsculas). No cadastro em lote, se houver qualquer repetido, nada é gravado.
- Troca, devolução e avaliação gravam a mudança de situação e o histórico na mesma transação.

## Como executar

Requisito: **Node.js 22.13 ou superior** (o SQLite já vem embutido no Node).

```bash
cd controle-equipamentos
npm install
npm run seed     # opcional: cria uma base de demonstração com 6 meses de movimentações
npm start        # http://localhost:3000
```

**Primeiro acesso:**

- Com `npm run seed`: `admin@provedor.local` / `admin123` (administrador) e `tecnico@provedor.local` / `tecnico123` (operador).
- Sem a demonstração (banco vazio): o servidor cria o administrador `admin@provedor.local` com a senha provisória `admin123` e pede a troca no primeiro acesso. Para escolher outros dados: `ADMIN_EMAIL=voce@provedor.com.br ADMIN_SENHA=SenhaInicial1 npm start`.

Em produção, publique atrás de HTTPS. Se houver um proxy reverso (Nginx, por exemplo), use `TRUST_PROXY=1` para o cookie ser marcado como `Secure` e o bloqueio por IP usar o IP real.

Para desenvolvimento com reinício automático: `npm run dev`. A porta pode ser alterada com `PORT=8080 npm start` e o arquivo do banco com `DB_PATH=/caminho/banco.db`.

> `npm run seed` **apaga** os dados existentes antes de criar a demonstração.

## Estrutura

```
controle-equipamentos/
├── server.js              servidor Express: arquivos estáticos + API REST
├── src/
│   ├── db.js              conexão SQLite e criação das tabelas
│   ├── auth.js            login, sessões, senhas e usuários
│   └── servicos.js        regras de negócio e consultas
├── scripts/seed.js        base de demonstração
├── data/                  arquivo do banco (criado automaticamente)
└── public/
    ├── login.html         tela de login
    ├── index.html         estrutura da aplicação (HTML5)
    ├── css/style.css      estilos e responsividade (CSS3)
    └── js/
        ├── login.js       envio do login
        ├── app.js         verificação da sessão e navegação entre telas
        ├── api.js         chamadas à API REST
        ├── ui.js          componentes e funções de apoio
        └── telas/         inicio, cadastro, entrega, devolucao, troca, estoque, usuarios, senha
```

## Modelo de dados

| Tabela | Campos principais |
|---|---|
| `equipamentos` | id, tipo, marca, modelo, numero_serie (único), situacao, cliente_codigo, situacao_desde, observacao |
| `movimentacoes` | id, equipamento_id → equipamentos, tipo (cadastro/entrega/devolucao/avaliacao), cliente_codigo, data, responsavel, motivo, condicao, situacao_anterior, situacao_nova, troca_id → trocas, observacao, usuario_id → usuarios |
| `trocas` | id, cliente_codigo, equipamento_devolvido_id → equipamentos, equipamento_entregue_id → equipamentos, data, responsavel, motivo |
| `usuarios` | id, nome, email (único), senha_hash, perfil (administrador/operador), ativo, trocar_senha, ultimo_acesso |
| `sessoes` | token, usuario_id → usuarios, expira_em |

## API REST

| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/login` | Entrar (`email`, `senha`); cria o cookie de sessão |
| POST | `/api/logout` | Sair |
| GET | `/api/sessao` | Usuário conectado |
| POST | `/api/senha` | Trocar a própria senha (`atual`, `nova`) |
| GET / POST | `/api/usuarios` | Listar / cadastrar usuários (administrador) |
| PUT | `/api/usuarios/:id` | Alterar dados, perfil, ativo ou redefinir senha (administrador) |
| GET | `/api/resumo` | Indicadores da tela Início |
| GET | `/api/opcoes` | Situações, motivos, condições e listas de sugestão |
| GET | `/api/equipamentos?busca=&tipo=&situacao=` | Pesquisa de equipamentos |
| GET | `/api/equipamentos/:id` | Equipamento com histórico |
| POST | `/api/equipamentos` | Cadastro (`numeros_serie` aceita lista) |
| PUT | `/api/equipamentos/:id` | Edição dos dados de cadastro |
| POST | `/api/entregas` | Entrega |
| POST | `/api/devolucoes` | Devolução |
| POST | `/api/trocas` | Troca |
| POST | `/api/avaliacoes` | Avaliação técnica |
| GET | `/api/movimentacoes?tipo=&limite=` | Últimas movimentações |
| GET | `/api/clientes/:codigo` | Equipamentos e histórico de um cliente |

Todas as rotas, exceto login e logout, exigem sessão. Sem sessão a API retorna `401`; sem permissão, `403`; muitas tentativas de login, `429`. Erros de validação retornam `400`, regras de situação/duplicidade `409` e registros inexistentes `404`, sempre no formato `{ "erro": "mensagem" }`.
