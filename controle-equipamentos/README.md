# Controle de Equipamentos · Provedor de Internet

**Desenvolvimento de uma aplicação web para controle de entregas, devoluções, trocas e estoque de equipamentos em um provedor de internet.**

Projeto de conclusão do curso de Análise e Desenvolvimento de Sistemas (ADS).

---

## Sumário

1. [Como abrir o sistema (início rápido)](#1-como-abrir-o-sistema-início-rápido)
2. [Apresentação do projeto](#2-apresentação-do-projeto)
3. [Problema e justificativa](#3-problema-e-justificativa)
4. [Objetivos](#4-objetivos)
5. [Público-alvo e perfis de usuário](#5-público-alvo-e-perfis-de-usuário)
6. [Tecnologias utilizadas e requisitos do curso](#6-tecnologias-utilizadas-e-requisitos-do-curso)
7. [Requisitos funcionais](#7-requisitos-funcionais)
8. [Requisitos não funcionais](#8-requisitos-não-funcionais)
9. [Regras de negócio](#9-regras-de-negócio)
10. [Telas do sistema](#10-telas-do-sistema)
11. [Indicadores e alertas da tela Início](#11-indicadores-e-alertas-da-tela-início)
12. [Arquitetura](#12-arquitetura)
13. [Modelo de dados](#13-modelo-de-dados)
14. [API REST](#14-api-rest)
15. [Segurança](#15-segurança)
16. [Estrutura de arquivos](#16-estrutura-de-arquivos)
17. [Instalação e configuração](#17-instalação-e-configuração)
18. [Base de demonstração](#18-base-de-demonstração)
19. [Testes realizados](#19-testes-realizados)
20. [Limitações e trabalhos futuros](#20-limitações-e-trabalhos-futuros)
21. [Solução de problemas](#21-solução-de-problemas)

---

## 1. Como abrir o sistema (início rápido)

> O sistema é uma **aplicação web com servidor**. O arquivo `public/index.html` **não funciona se for aberto com dois cliques**, porque as telas buscam os dados no servidor. Use um dos scripts abaixo, que ligam o servidor e abrem o navegador.

**Pré-requisito:** ter o **Node.js 22.13 ou superior** instalado ([nodejs.org](https://nodejs.org), versão LTS). Para conferir, abra o terminal e digite `node -v`.

| Sistema | Como iniciar |
|---|---|
| Windows | Dê dois cliques em **`iniciar-windows.bat`** |
| Linux / macOS | No terminal, dentro da pasta: `./iniciar-linux-mac.sh` |
| Qualquer um (terminal) | `npm start` e abra **http://localhost:3000** |

Para encerrar, feche a janela do terminal (ou `Ctrl + C`).

**Acessos da base de demonstração:**

| E-mail | Senha | Perfil |
|---|---|---|
| `admin@provedor.local` | `admin123` | Administrador |
| `tecnico@provedor.local` | `tecnico123` | Operador |

As dependências (`node_modules`) e uma base de demonstração (`data/equipamentos.db`) já vêm no pacote: não é preciso internet para executar.

---

## 2. Apresentação do projeto

Em provedores de internet, cada cliente recebe equipamentos em comodato (ONU, roteador Wi-Fi, repetidor). Esses aparelhos saem do estoque na instalação, voltam no cancelamento, são trocados quando apresentam defeito ou queimam e, depois de avaliados, podem voltar a ser entregues ou ser descartados.

Esta aplicação substitui os registros manuais em folha por um sistema web em que cada aparelho é identificado pelo número de série e todas as movimentações ficam registradas: **quem entregou, para qual cliente, quando, por que voltou, em que condição chegou e o que foi decidido na avaliação técnica**.

## 3. Problema e justificativa

Com registros em papel:

- não se sabe com rapidez **onde está** um número de série (em estoque, com qual cliente, em manutenção);
- aparelhos devolvidos podem voltar a ser entregues **sem passar por teste**, gerando nova visita técnica;
- trocas não ficam vinculadas: perde-se a relação entre o aparelho que saiu e o que entrou;
- não há visão de **quanto estoque resta** e de quantos dias ele dura no ritmo atual de instalações;
- não é possível identificar **modelos que falham mais** e direcionar compras ou acionar garantia;
- não há registro confiável de **quem** realizou cada movimentação.

A aplicação resolve esses pontos com um histórico único por aparelho, regras que impedem movimentações inválidas e um painel inicial que transforma os registros em alertas e ações.

## 4. Objetivos

**Objetivo geral:** desenvolver uma aplicação web para controlar entregas, devoluções, trocas e estoque de equipamentos de um provedor de internet.

**Objetivos específicos:**

- cadastrar equipamentos por tipo, marca, modelo e número de série, inclusive em lote;
- registrar entregas, devoluções e trocas, vinculando cada aparelho ao código do cliente;
- separar o **motivo da devolução** da **situação do equipamento**, exigindo avaliação técnica antes de um aparelho devolvido voltar ao estoque;
- manter o histórico completo de cada aparelho e de cada cliente;
- oferecer indicadores de estoque, fila de avaliação e taxa de falha por modelo;
- controlar o acesso por login e perfis de usuário.

## 5. Público-alvo e perfis de usuário

Equipe de um provedor de internet de pequeno ou médio porte: estoque, técnicos de campo, atendimento e gestão.

| Perfil | Pode fazer |
|---|---|
| **Operador** | Cadastrar equipamentos; registrar entregas, devoluções, trocas e avaliações; consultar estoque e histórico; trocar a própria senha |
| **Administrador** | Tudo o que o operador faz, além de cadastrar usuários, alterar perfis, desativar contas e redefinir senhas |

## 6. Tecnologias utilizadas e requisitos do curso

| Tecnologia | Exigência | Onde e como é usada |
|---|---|---|
| **HTML5** | **Obrigatória** | `public/index.html`, `public/login.html` e telas geradas em JavaScript. Elementos semânticos (`header`, `nav`, `main`, `section`, `aside`, `fieldset`, `legend`), formulários com validação nativa (`required`, `type="email"`, `type="date"` com `min`/`max`, `minlength`, `maxlength`, `pattern`), `datalist` para sugestões e leitura de código de barras, atributos de acessibilidade (`aria-*`, `role`) |
| **CSS3** | **Obrigatória** | `public/css/style.css`: variáveis CSS (tema claro e escuro com `prefers-color-scheme`), Grid, Flexbox, media queries para celular, seletor `:has()`, gradientes, animações e transições |
| **JavaScript** | **Obrigatória** | Telas em JavaScript puro com módulos ES (`import`/`export`), `fetch`, `async/await`; servidor em JavaScript (Node.js) |
| Banco de dados estruturado | Opcional | **SQLite** (módulo nativo `node:sqlite`), com chaves estrangeiras, restrições `CHECK`, `UNIQUE`, índices e transações |
| Node.js + Express | Opcional | Servidor web que entrega as telas e expõe a API (`server.js`) |
| Consumo de API REST | Opcional | As telas consomem a API REST própria (`/api`) por `fetch` (`public/js/api.js`) |

**Por que JavaScript puro nas telas (sem React ou outro framework):** deixa explícito o uso das três tecnologias obrigatórias, dispensa etapa de compilação e mantém o projeto simples de executar e de explicar.

**Por que SQLite:** banco relacional completo em um único arquivo, sem instalação de servidor de banco, adequado ao porte do problema e fácil de copiar para backup.

**Dependência externa única:** `express` (servidor HTTP). Todo o restante usa recursos nativos do Node.js (`node:sqlite`, `node:crypto`).

## 7. Requisitos funcionais

| Código | Requisito |
|---|---|
| RF01 | Autenticar usuários por e-mail e senha |
| RF02 | Exigir troca da senha provisória no primeiro acesso |
| RF03 | Permitir ao usuário alterar a própria senha |
| RF04 | Permitir ao administrador cadastrar, editar, desativar usuários e redefinir senhas |
| RF05 | Cadastrar equipamentos (tipo, marca, modelo, número de série), individualmente ou em lote |
| RF06 | Editar os dados de cadastro de um equipamento |
| RF07 | Registrar a entrega de um equipamento disponível a um cliente (código, data, responsável) |
| RF08 | Registrar a devolução de um equipamento com cliente (motivo, condição informada, data, responsável) |
| RF09 | Registrar a troca, vinculando o aparelho devolvido ao novo aparelho entregue ao mesmo cliente |
| RF10 | Registrar a avaliação técnica de aparelhos devolvidos (aprovado, manutenção ou baixa) |
| RF11 | Pesquisar equipamentos por número de série, modelo, marca ou cliente, com filtros por tipo e situação |
| RF12 | Exibir o histórico de movimentações de cada equipamento |
| RF13 | Exibir os equipamentos e o histórico de um cliente |
| RF14 | Exibir o resumo por situação, indicadores e alertas na tela inicial |
| RF15 | Exportar a lista de equipamentos em CSV |
| RF16 | Registrar o usuário que lançou cada movimentação |

## 8. Requisitos não funcionais

| Código | Requisito |
|---|---|
| RNF01 | Aplicação web acessível por navegador, em computador e celular (layout responsivo) |
| RNF02 | Interface em português, com mensagens de erro claras e validação dos campos antes do envio |
| RNF03 | Senhas armazenadas com hash e sal; sessão protegida contra acesso por JavaScript |
| RNF04 | Regras de negócio e permissões validadas no servidor, independentemente da interface |
| RNF05 | Integridade dos dados: movimentações compostas gravadas em transação (tudo ou nada) |
| RNF06 | Execução local sem dependência de internet e sem instalação de servidor de banco de dados |
| RNF07 | Tarefas principais acessíveis em até dois cliques a partir do menu |
| RNF08 | Suporte a leitor de código de barras nos campos de número de série |
| RNF09 | Tema claro e escuro conforme a preferência do sistema operacional |

## 9. Regras de negócio

### 9.1 Motivo × situação

O projeto separa duas informações:

- **Motivo da devolução:** cancelamento, troca, defeito relatado ou queima relatada.
- **Situação do equipamento:** disponível, com cliente, aguardando avaliação, em manutenção ou baixado.

Assim, um aparelho devolvido **não é considerado automaticamente disponível** para nova entrega.

**Condição informada na recepção:** aparentemente em bom estado, com avarias físicas, sem fonte ou acessórios, não liga, não verificada na recepção.

### 9.2 Ciclo de vida do equipamento

```
cadastro ──► Disponível ──entrega──► Com cliente ──devolução / troca──► Aguardando avaliação
                 ▲                                                          │
                 └──────────────── avaliação: aprovado ◄────────────────────┤
                                                                            ├──► Em manutenção ──► (nova avaliação)
                                                                            └──► Baixado (descarte, exige motivo)
```

### 9.3 Regras

| Código | Regra |
|---|---|
| RN01 | O número de série é único (sem diferenciar maiúsculas de minúsculas) e não pode conter espaços |
| RN02 | No cadastro em lote, se houver qualquer número repetido (na lista ou já cadastrado), **nada** é gravado e os repetidos são informados |
| RN03 | Só é possível entregar equipamentos **disponíveis** |
| RN04 | Só é possível devolver ou trocar equipamentos **com cliente** |
| RN05 | Toda devolução leva o aparelho para **aguardando avaliação**; ele só volta a ficar disponível por avaliação técnica |
| RN06 | Na troca, o novo aparelho é entregue ao mesmo cliente do aparelho devolvido e as duas movimentações ficam vinculadas |
| RN07 | Avaliação só se aplica a aparelhos aguardando avaliação ou em manutenção; a **baixa exige motivo** |
| RN08 | A situação do equipamento **não é editável manualmente**: só muda por movimentação, o que mantém o histórico confiável |
| RN09 | A data da movimentação não pode estar no futuro nem ser anterior à última movimentação do aparelho |
| RN10 | Troca, devolução, entrega e avaliação gravam a mudança de situação e o histórico na mesma transação |
| RN11 | Cada movimentação registra o **responsável** (quem a executou) e o **usuário** que a lançou no sistema |
| RN12 | Usuários novos ou com senha redefinida recebem senha provisória e precisam trocá-la antes de usar o sistema |
| RN13 | Senha com no mínimo 8 caracteres, contendo letras e números |
| RN14 | Não é possível desativar a própria conta, retirar o próprio perfil de administrador nem ficar sem nenhum administrador ativo |
| RN15 | Desativar um usuário ou redefinir sua senha encerra as sessões abertas dele |

## 10. Telas do sistema

| Tela | Endereço | O que permite |
|---|---|---|
| **Login** | `/login.html` | Entrar com e-mail e senha; mostrar/ocultar senha. Depois de entrar, volta para a tela que a pessoa tentou abrir |
| **Início** | `#/inicio` | Quantidade por situação; painel **“Onde agir agora”**; estoque e cobertura por tipo; entregas × devoluções nos últimos 6 meses; falhas por modelo; fila de avaliação; últimas movimentações. Os cartões e linhas levam ao detalhe |
| **Entrega** | `#/entrega` | Escolher um equipamento disponível (digitando ou com leitor de código de barras), informar o código do cliente, data, responsável e observação. Mostra os equipamentos que o cliente já possui, para evitar entrega em duplicidade |
| **Devolução** | `#/devolucao` | Escolher o aparelho recebido (ou buscar pelo código do cliente), motivo, condição informada, data e responsável. Sugere usar a tela Troca quando houver substituição |
| **Troca** | `#/troca` | Em uma só operação: aparelho devolvido → novo aparelho entregue ao mesmo cliente, com motivo e condição. Avisa quando os tipos são diferentes (upgrade) |
| **Estoque e histórico** | `#/estoque` | Pesquisa, filtros por tipo e situação, contadores por situação, exportação CSV. Ao clicar em um aparelho: dados, ações (entregar, devolver, trocar, editar), **avaliação técnica** e linha do tempo com todas as movimentações (inclusive o aparelho vinculado em trocas) |
| **Cadastro de equipamentos** | `#/cadastro` | Cadastro individual ou em lote (um número de série por linha), com contagem e aviso de repetidos; lista dos últimos cadastrados; edição de cadastro (`#/cadastro?id=N`) |
| **Usuários** | `#/usuarios` | (Administrador) lista com perfil, último acesso e situação; cadastro com senha provisória; edição de nome, e-mail, perfil, ativação e redefinição de senha |
| **Alterar senha** | `#/senha` | Troca da própria senha, com confirmação. Obrigatória no primeiro acesso |

O menu lateral mostra o usuário conectado, com os atalhos **Alterar senha** e **Sair**. No celular, o menu abre pelo botão ☰.

## 11. Indicadores e alertas da tela Início

| Indicador | Cálculo | Para que serve |
|---|---|---|
| Equipamentos por situação | Contagem por situação; percentual sobre o parque ativo (exclui baixados) | Visão geral do parque |
| Saídas em 30 dias | Entregas do tipo nos últimos 30 dias | Ritmo de consumo do estoque |
| **Cobertura do estoque** | Disponíveis ÷ (saídas em 30 dias ÷ 30), em dias | Quantos dias o estoque dura no ritmo atual |
| Fila de avaliação | Aparelhos aguardando avaliação ou em manutenção e há quantos dias estão parados | Priorizar a bancada técnica |
| **Taxa de falha por modelo** | Devoluções por defeito ou queima ÷ entregas do modelo | Identificar modelos problemáticos |
| Entregas × devoluções | Totais por mês nos últimos 6 meses | Tendência do volume |

**Alertas automáticos (“Onde agir agora”):**

| Situação detectada | Nível | Ação sugerida |
|---|---|---|
| Tipo sem nenhum aparelho disponível e com saídas nos últimos 30 dias | Crítico | Repor a quantidade necessária para 30 dias; avaliar os aparelhos desse tipo em análise |
| Cobertura abaixo de 15 dias | Atenção | Programar compra para cobrir 30 dias |
| Cobertura acima de 120 dias | Informativo | Adiar compras do tipo e direcionar o orçamento aos itens com cobertura baixa |
| Aparelhos aguardando avaliação há mais de 7 dias | Atenção | Reservar horário de bancada: aparelhos aprovados evitam compras |
| Modelo com taxa de falha ≥ 1,5 × a média (mínimo 8%) e ao menos 10 entregas | Crítico | Verificar lote, firmware e garantia; priorizar o modelo do mesmo tipo com menor taxa |
| Queimas ≥ 30% das falhas dos últimos 90 dias | Informativo | Hipótese a validar: problemas de energia por região; orientar uso de DPS/estabilizador |

## 12. Arquitetura

Aplicação cliente-servidor em três camadas:

```
┌─────────────────────────────┐        HTTP / JSON        ┌──────────────────────────────┐        ┌──────────────┐
│ Navegador                   │  ───── fetch /api/... ──► │ Servidor Node.js + Express   │ ─────► │ SQLite       │
│ HTML5 + CSS3 + JavaScript   │  ◄──── respostas JSON ─── │ server.js (rotas e sessão)   │ ◄───── │ data/*.db    │
│ public/                     │     cookie de sessão      │ src/auth.js (login/usuários) │        └──────────────┘
└─────────────────────────────┘                           │ src/servicos.js (regras)     │
                                                          └──────────────────────────────┘
```

- **Front-end (`public/`):** página única (`index.html`) com navegação pelo endereço após o `#` (`app.js`). Cada tela é um módulo em `js/telas/` com a função `renderizar`. `api.js` concentra as chamadas ao servidor; `ui.js` reúne componentes e formatações.
- **Servidor (`server.js`):** entrega os arquivos estáticos, verifica a sessão e o perfil e encaminha as chamadas para as regras de negócio.
- **Regras de negócio (`src/servicos.js`, `src/auth.js`):** validações, mudanças de situação, histórico, indicadores, login e usuários.
- **Banco (`src/db.js`):** cria as tabelas na primeira execução e oferece a função de transação.

**Fluxo de uma entrega:** o usuário preenche o formulário (validação HTML5) → `api.entregar()` envia JSON para `POST /api/entregas` → o servidor confere a sessão → `servicos.entregar()` valida a situação e a data → em uma transação, atualiza o equipamento e grava a movimentação → devolve o equipamento atualizado → a tela mostra a confirmação.

## 13. Modelo de dados

```
usuarios 1 ──── N sessoes
usuarios 1 ──── N movimentacoes        (usuario_id: quem lançou)
equipamentos 1 ── N movimentacoes
trocas 1 ──────── 2 movimentacoes      (a devolução e a entrega da troca)
equipamentos 1 ── N trocas             (como devolvido e como entregue)
```

### equipamentos

| Campo | Tipo | Obrig. | Descrição |
|---|---|---|---|
| id | INTEGER PK | S | Identificador |
| tipo | TEXT | S | Ex.: ONU, Roteador Wi-Fi, Repetidor Mesh |
| marca | TEXT | S | Fabricante |
| modelo | TEXT | S | Modelo |
| numero_serie | TEXT UNIQUE | S | Número de série (único, maiúsculas) |
| situacao | TEXT CHECK | S | disponivel, com_cliente, aguardando_avaliacao, em_manutencao, baixado |
| cliente_codigo | TEXT | N | Cliente atual (quando com cliente) |
| situacao_desde | TEXT (data) | S | Data da última mudança de situação |
| observacao | TEXT | N | Observação do cadastro |
| criado_em | TEXT | S | Data e hora do cadastro |

### movimentacoes

| Campo | Tipo | Obrig. | Descrição |
|---|---|---|---|
| id | INTEGER PK | S | Identificador |
| equipamento_id | INTEGER FK | S | Equipamento movimentado |
| tipo | TEXT CHECK | S | cadastro, entrega, devolucao, avaliacao |
| cliente_codigo | TEXT | N | Cliente envolvido |
| data | TEXT (data) | S | Data da movimentação |
| responsavel | TEXT | S | Quem executou |
| motivo | TEXT CHECK | N | cancelamento, troca, defeito_relatado, queima_relatada (devoluções) |
| condicao | TEXT | N | Condição informada na recepção (devoluções) |
| situacao_anterior | TEXT | N | Situação antes da movimentação |
| situacao_nova | TEXT | S | Situação após a movimentação |
| troca_id | INTEGER FK | N | Troca à qual pertence |
| observacao | TEXT | N | Observação ou laudo |
| usuario_id | INTEGER FK | N | Usuário que lançou no sistema |
| criado_em | TEXT | S | Data e hora do lançamento |

### trocas

| Campo | Tipo | Obrig. | Descrição |
|---|---|---|---|
| id | INTEGER PK | S | Identificador |
| cliente_codigo | TEXT | S | Cliente da troca |
| equipamento_devolvido_id | INTEGER FK | S | Aparelho recebido |
| equipamento_entregue_id | INTEGER FK | S | Aparelho entregue |
| data | TEXT | S | Data |
| responsavel | TEXT | S | Quem executou |
| motivo | TEXT | S | defeito_relatado, queima_relatada ou troca (solicitação/upgrade) |
| observacao | TEXT | N | Observação |

### usuarios

| Campo | Tipo | Obrig. | Descrição |
|---|---|---|---|
| id | INTEGER PK | S | Identificador |
| nome | TEXT | S | Nome |
| email | TEXT UNIQUE | S | E-mail de acesso |
| senha_hash | TEXT | S | Hash scrypt com sal (`scrypt$sal$hash`) |
| perfil | TEXT CHECK | S | administrador ou operador |
| ativo | INTEGER | S | 1 = ativo, 0 = desativado |
| trocar_senha | INTEGER | S | 1 = senha provisória |
| ultimo_acesso | TEXT | N | Data e hora do último login |
| criado_em | TEXT | S | Data e hora do cadastro |

### sessoes

| Campo | Tipo | Obrig. | Descrição |
|---|---|---|---|
| token | TEXT PK | S | Token aleatório de 256 bits |
| usuario_id | INTEGER FK | S | Usuário da sessão |
| expira_em | INTEGER | S | Expiração (milissegundos) |

Índices: movimentações por equipamento e data, por data; equipamentos por situação e por cliente.

## 14. API REST

Todas as respostas são JSON. Todas as rotas, exceto login e logout, exigem sessão válida (cookie).

| Método | Rota | Perfil | Descrição |
|---|---|---|---|
| POST | `/api/login` | — | Entrar (`email`, `senha`); cria o cookie de sessão |
| POST | `/api/logout` | — | Sair |
| GET | `/api/sessao` | Todos | Usuário conectado |
| POST | `/api/senha` | Todos | Trocar a própria senha (`atual`, `nova`) |
| GET | `/api/usuarios` | Admin | Listar usuários |
| POST | `/api/usuarios` | Admin | Cadastrar (`nome`, `email`, `perfil`, `senha`) |
| PUT | `/api/usuarios/:id` | Admin | Alterar `nome`, `email`, `perfil`, `ativo` e/ou `nova_senha` |
| GET | `/api/resumo` | Todos | Indicadores da tela Início |
| GET | `/api/opcoes` | Todos | Situações, motivos, condições e listas de sugestão |
| GET | `/api/equipamentos?busca=&tipo=&situacao=` | Todos | Pesquisa |
| GET | `/api/equipamentos/:id` | Todos | Equipamento com histórico |
| POST | `/api/equipamentos` | Todos | Cadastro (`tipo`, `marca`, `modelo`, `numeros_serie[]`, `data`, `responsavel`, `observacao`) |
| PUT | `/api/equipamentos/:id` | Todos | Editar cadastro |
| POST | `/api/entregas` | Todos | `equipamento_id`, `cliente_codigo`, `data`, `responsavel`, `observacao` |
| POST | `/api/devolucoes` | Todos | `equipamento_id`, `motivo`, `condicao`, `data`, `responsavel`, `observacao` |
| POST | `/api/trocas` | Todos | `equipamento_devolvido_id`, `equipamento_entregue_id`, `motivo`, `condicao`, `data`, `responsavel`, `observacao` |
| POST | `/api/avaliacoes` | Todos | `equipamento_id`, `resultado` (disponivel, em_manutencao, baixado), `data`, `responsavel`, `observacao` |
| GET | `/api/movimentacoes?tipo=&limite=` | Todos | Últimas movimentações |
| GET | `/api/clientes/:codigo` | Todos | Equipamentos e histórico de um cliente |

**Códigos de resposta:** `200`/`201` sucesso · `400` dado inválido · `401` sem sessão · `403` sem permissão ou senha provisória pendente · `404` não encontrado · `409` conflito (situação incompatível, número de série repetido) · `415` corpo que não é JSON · `429` muitas tentativas de login · `500` erro interno. Erros vêm no formato `{ "erro": "mensagem" }`.

Exemplo:

```http
POST /api/entregas
Content-Type: application/json

{ "equipamento_id": 12, "cliente_codigo": "20481", "data": "2026-10-30", "responsavel": "Carlos Souza" }
```

## 15. Segurança

| Medida | Como foi implementada |
|---|---|
| Armazenamento de senhas | `scrypt` com sal aleatório de 16 bytes; comparação em tempo constante (`timingSafeEqual`) |
| Sessão | Token aleatório de 256 bits guardado no banco; cookie `HttpOnly` (inacessível ao JavaScript), `SameSite=Strict`, `Secure` quando em HTTPS; validade de 8 horas |
| Controle de acesso | Todas as rotas verificam a sessão no servidor; rotas de usuários exigem perfil administrador; o menu apenas reflete essas permissões |
| Força bruta | 5 senhas erradas para o mesmo e-mail bloqueiam aquele acesso por 5 minutos; 30 erros pelo mesmo IP bloqueiam o IP (limite alto porque a equipe costuma compartilhar o IP do escritório) |
| Enumeração de usuários | Mensagem única (“E-mail ou senha incorretos”) e tempo de resposta equivalente para e-mail existente ou não |
| Requisições forjadas (CSRF) | Cookie `SameSite=Strict` e gravações aceitas apenas com `Content-Type: application/json` |
| Injeção de SQL | Todas as consultas usam parâmetros (`?`), nunca concatenação de valores |
| XSS | Todo texto vindo do banco é escapado antes de ser inserido no HTML (`esc()` em `ui.js`) |
| Senha provisória | Troca obrigatória antes de qualquer outra operação |
| Cache | Respostas da API com `Cache-Control: no-store` |

## 16. Estrutura de arquivos

```
controle-equipamentos/
├── README.md                  esta documentação
├── iniciar-windows.bat        inicia o servidor e abre o navegador (Windows)
├── iniciar-linux-mac.sh       inicia o servidor e abre o navegador (Linux/macOS)
├── package.json               dados do projeto, scripts e dependências
├── package-lock.json          versões exatas das dependências
├── server.js                  servidor Express: arquivos estáticos, sessão e API REST
├── src/
│   ├── db.js                  conexão SQLite, criação das tabelas e transações
│   ├── auth.js                senhas, login, sessões e usuários
│   └── servicos.js            regras de negócio, consultas e indicadores
├── scripts/
│   └── seed.js                gera a base de demonstração
├── data/
│   └── equipamentos.db        banco de dados (criado automaticamente se não existir)
├── node_modules/              dependências já instaladas (Express)
└── public/                    tudo o que roda no navegador
    ├── index.html             estrutura da aplicação (menu e área das telas)
    ├── login.html             tela de login
    ├── img/icone.svg          ícone
    ├── css/style.css          estilos, temas e responsividade
    └── js/
        ├── app.js             verificação da sessão e navegação entre telas
        ├── login.js           envio do login
        ├── api.js             chamadas à API REST
        ├── ui.js              componentes e funções de apoio
        └── telas/
            ├── inicio.js      Início (indicadores e alertas)
            ├── cadastro.js    Cadastro e edição de equipamentos
            ├── entrega.js     Entrega
            ├── devolucao.js   Devolução
            ├── troca.js       Troca
            ├── estoque.js     Estoque, histórico e avaliação técnica
            ├── usuarios.js    Usuários (administrador)
            └── senha.js       Alterar senha
```

## 17. Instalação e configuração

### Requisitos

- Node.js **22.13 ou superior** (traz o SQLite embutido).
- Navegador atualizado (Chrome, Edge, Firefox ou Safari).

### Comandos

```bash
npm install      # só é necessário se a pasta node_modules não existir
npm start        # inicia em http://localhost:3000
npm run dev      # reinicia sozinho ao alterar arquivos (desenvolvimento)
npm run seed     # APAGA os dados e recria a base de demonstração
```

### Começar com o banco vazio (uso real)

1. Feche o sistema.
2. Apague o arquivo `data/equipamentos.db` (e, se existirem, `equipamentos.db-shm` e `equipamentos.db-wal`).
3. Inicie novamente. O sistema cria as tabelas e o administrador **`admin@provedor.local`** com a senha provisória **`admin123`**, que deve ser trocada no primeiro acesso.

### Variáveis de ambiente (opcionais)

| Variável | Padrão | Uso |
|---|---|---|
| `PORT` | `3000` | Porta do servidor |
| `DB_PATH` | `data/equipamentos.db` | Caminho do arquivo do banco |
| `ADMIN_EMAIL` | `admin@provedor.local` | E-mail do primeiro administrador (banco vazio) |
| `ADMIN_SENHA` | `admin123` | Senha provisória do primeiro administrador |
| `TRUST_PROXY` | — | Use `1` atrás de proxy reverso (Nginx etc.) para o cookie `Secure` e o IP real |

Exemplo: `PORT=8080 ADMIN_EMAIL=ti@meuprovedor.com.br ADMIN_SENHA=Inicial2026 npm start`

### Uso em rede

Outros computadores da mesma rede podem acessar pelo IP da máquina que executa o servidor, por exemplo `http://192.168.0.10:3000`. Para uso pela internet, publique atrás de HTTPS.

### Backup

Todos os dados ficam em `data/equipamentos.db`. Para fazer backup, feche o sistema e copie esse arquivo.

## 18. Base de demonstração

O comando `npm run seed` (já executado no pacote) simula **6 meses de operação** com dados fictícios:

- cerca de 540 equipamentos de 6 modelos (ONUs Huawei, ZTE e Nokia; roteadores TP-Link e Intelbras; repetidor TP-Link Deco);
- instalações diárias, cancelamentos, trocas por defeito e queima, upgrades e avaliações técnicas;
- um modelo com taxa de falha propositalmente alta, roteadores com estoque apertado e repetidores sem estoque, para demonstrar os alertas;
- usuários `admin@provedor.local` / `admin123` e `tecnico@provedor.local` / `tecnico123`.

As datas são calculadas a partir do dia em que o comando é executado. Rodar novamente atualiza as datas, mas **apaga tudo** o que foi lançado.

## 19. Testes realizados

Testes automatizados de ponta a ponta no navegador Chromium (Playwright) e testes da API por requisições HTTP:

| Grupo | Casos verificados | Resultado |
|---|---|---|
| Login | Redirecionamento sem sessão; senha errada; login correto retornando à tela pedida; logout | Aprovado |
| Senha provisória | Usuário novo é levado à troca; outras telas e a API ficam bloqueadas até trocar; senha fraca recusada | Aprovado |
| Permissões | Operador não vê o menu Usuários; acesso direto à tela e à API de usuários negado (403) | Aprovado |
| Proteções | Bloqueio após tentativas erradas (429); requisição sem JSON recusada (415); usuário desativado perde a sessão (401); administrador não pode se desativar | Aprovado |
| Cadastro | Lote de 3 aparelhos; recusa de número repetido sem gravar nenhum | Aprovado |
| Entrega | Entrega de aparelho disponível; número inexistente bloqueado no formulário | Aprovado |
| Troca | Devolvido vai para aguardando avaliação, novo vai para o mesmo cliente, vínculo exibido no histórico | Aprovado |
| Devolução | Busca por cliente, registro com motivo e condição | Aprovado |
| Avaliação | Baixa sem motivo bloqueada; baixa com motivo registrada | Aprovado |
| Rastreabilidade | Histórico mostra o responsável e o usuário que lançou | Aprovado |
| Responsividade | Todas as telas em 390 px de largura sem rolagem lateral | Aprovado |
| Estabilidade | Nenhum erro de JavaScript em todas as telas | Aprovado |

## 20. Limitações e trabalhos futuros

**Limitações atuais:**

- o código do cliente é digitado; não há integração com o sistema de gestão (ERP) do provedor;
- não há cadastro de endereço ou região do cliente, o que impede confirmar se as queimas se concentram em determinados bairros;
- o bloqueio de tentativas de login fica em memória e é reiniciado quando o servidor reinicia;
- recuperação de senha depende do administrador (não há envio por e-mail).

**Possíveis evoluções:**

- integração com o ERP do provedor para buscar clientes e ordens de serviço;
- registro de região/bairro para análise de falhas por localidade;
- termo de entrega em PDF com assinatura do cliente;
- leitura do número de série pela câmera do celular;
- relatório de custo de reposição e de garantia por fornecedor;
- recuperação de senha por e-mail e registro de auditoria das alterações de usuários.

## 21. Solução de problemas

| Problema | Solução |
|---|---|
| Ao abrir `index.html` com dois cliques aparece “Carregando…” ou erro | O sistema precisa do servidor. Use `iniciar-windows.bat`, `iniciar-linux-mac.sh` ou `npm start` e acesse `http://localhost:3000` |
| “node não é reconhecido” | Instale o Node.js 22 LTS ou superior em nodejs.org e reabra o terminal |
| Erro mencionando `node:sqlite` | Versão antiga do Node.js. Atualize para 22.13 ou superior (`node -v` para conferir) |
| “EADDRINUSE” / porta em uso | Já existe outro programa (ou o próprio sistema) na porta 3000. Feche-o ou use `PORT=3001 npm start` |
| No Linux/macOS: “Permissão negada” ao rodar o script | Execute `chmod +x iniciar-linux-mac.sh` uma vez |
| Esqueci a senha do administrador | Outro administrador pode redefini-la. Se não houver, apague `data/equipamentos.db` (perde os dados) ou rode `npm run seed` para a demonstração |
| “Muitas tentativas sem sucesso” | Aguarde 5 minutos ou reinicie o servidor |
