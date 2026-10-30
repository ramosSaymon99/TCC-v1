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
| Início | Resumo por situação, painel **“Onde agir agora”** (estoque acabando, fila de avaliação parada, modelos com falha acima da média, concentração de queimas), estoque e cobertura por tipo, entregas × devoluções em 6 meses, falhas por modelo, fila de avaliação e últimas movimentações |
| Cadastro de equipamentos | Tipo, marca, modelo e número de série; cadastro de um aparelho ou de um lote inteiro (um número por linha), com bloqueio de duplicados; edição dos dados de cadastro |
| Entrega | Equipamento disponível, código do cliente, data e responsável; mostra os aparelhos que o cliente já possui (evita entrega em duplicidade) |
| Devolução | Aparelho recebido, motivo e condição informada; busca por código do cliente |
| Troca | Relaciona o equipamento devolvido ao novo equipamento entregue, em uma única operação |
| Estoque e histórico | Pesquisa por número de série, modelo, marca ou cliente; filtros por tipo e situação; exportação CSV; linha do tempo do aparelho; **avaliação técnica** |

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

Para desenvolvimento com reinício automático: `npm run dev`. A porta pode ser alterada com `PORT=8080 npm start` e o arquivo do banco com `DB_PATH=/caminho/banco.db`.

> `npm run seed` **apaga** os dados existentes antes de criar a demonstração.

## Estrutura

```
controle-equipamentos/
├── server.js              servidor Express: arquivos estáticos + API REST
├── src/
│   ├── db.js              conexão SQLite e criação das tabelas
│   └── servicos.js        regras de negócio e consultas
├── scripts/seed.js        base de demonstração
├── data/                  arquivo do banco (criado automaticamente)
└── public/
    ├── index.html         estrutura da aplicação (HTML5)
    ├── css/style.css      estilos e responsividade (CSS3)
    └── js/
        ├── app.js         navegação entre telas
        ├── api.js         chamadas à API REST
        ├── ui.js          componentes e funções de apoio
        └── telas/         inicio, cadastro, entrega, devolucao, troca, estoque
```

## Modelo de dados

| Tabela | Campos principais |
|---|---|
| `equipamentos` | id, tipo, marca, modelo, numero_serie (único), situacao, cliente_codigo, situacao_desde, observacao |
| `movimentacoes` | id, equipamento_id → equipamentos, tipo (cadastro/entrega/devolucao/avaliacao), cliente_codigo, data, responsavel, motivo, condicao, situacao_anterior, situacao_nova, troca_id → trocas, observacao |
| `trocas` | id, cliente_codigo, equipamento_devolvido_id → equipamentos, equipamento_entregue_id → equipamentos, data, responsavel, motivo |

## API REST

| Método | Rota | Descrição |
|---|---|---|
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

Erros de validação retornam `400`, regras de situação/duplicidade `409` e registros inexistentes `404`, sempre no formato `{ "erro": "mensagem" }`.
