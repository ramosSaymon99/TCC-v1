# TechGest · Gestão Comercial

Sistema web de gestão comercial para pequenos negócios de tecnologia (treinamentos de informática, manutenção de computadores e criação de sites), desenvolvido como TCC.

## Telas

| # | Tela | Destaques |
|---|------|-----------|
| – | Login | Acesso por perfil (demo: senha `123456`) |
| 1 | Dashboard | KPIs com comparação em base equivalente de dias, meta e projeção, painel **"Onde agir agora"** com insights automáticos, faturamento 6 meses, compromissos, OS em andamento, últimos clientes |
| 2 | Clientes | Busca/filtros, receita 12m e participação, última compra, painel lateral (dados, histórico, serviços, orçamentos), alerta de risco (+90 dias) e sugestão de cross-sell |
| 3 | Orçamentos e Propostas | Abas por status, valor em aberto, taxa de conversão, alerta de vencimento, conversão direta em OS |
| 4 | Funil Comercial | Kanban com arrastar-e-soltar, taxa de avanço por etapa, previsão ponderada, oportunidades paradas |
| 5 | Ordens de Serviço | Prazo/atraso, SLA de entrega, tempo médio de execução; ao finalizar lança a receita no financeiro |
| 6 | Equipamentos | Cadastro por cliente, garantia, histórico de OS, alerta de garantias a vencer (oportunidade de contrato) |
| 7 | Agenda e Tarefas | Visões dia/semana/mês, ocupação da capacidade diária, detecção de conflito de horário, tarefas com prioridade |
| 8 | Financeiro | Período livre, receitas × despesas, lucro e margem, despesas por categoria, a receber/a pagar, baixa de lançamentos |
| 9 | Relatórios | DRE, Fluxo de Caixa, Curva ABC de clientes, Clientes em risco, Vendas por serviço (efeito volume × ticket), Desempenho operacional, Conversão do funil — com exportação CSV e impressão/PDF |
| 10 | Usuários e Permissões | Perfis Proprietário/Operador/Financeiro/Técnico com módulos configuráveis |
| 11 | Configurações | Dados da empresa, meta mensal (com referência histórica), backup/restauração em JSON |
| 12 | Serviços e Preços | Catálogo com preço de tabela, custo, margem, lucro por hora, preço praticado vs. tabela e classificação (carro-chefe, volume, nicho, revisar); alimenta os orçamentos |
| 13 | Estoque de Peças | Mínimo, consumo de 90 dias, cobertura em dias, sugestão e lista de compras, entradas (com despesa automática) e saídas vinculadas à OS |
| 14 | Contratos | Suporte mensal, hospedagem, manutenção preventiva e domínios: MRR, peso na receita, renovações, churn, geração das cobranças do mês e clientes com perfil para contrato |
| 15 | Treinamentos | Turmas com vagas, ocupação, ponto de equilíbrio por turma, alunos e pagamentos (viram receita) |
| 16 | Planejamento | Ponto de equilíbrio com pró-labore, simulador de cenários com a alavanca de maior impacto e meta do mês por categoria |
| 17 | Social Media | Calendário editorial, produção (ideia → publicado), métricas por post, engajamento por formato/pilar/rede, seguidores, sugestões de pauta baseadas nos dados do negócio e atribuição de leads e receita por canal (custo por lead e retorno do impulsionamento) |

Funções transversais: busca global (Ctrl+K), proposta comercial e OS/termo de entrega em PDF, NPS de satisfação nas OS, menu agrupado por área e novos alertas no painel "Onde agir agora". Bases criadas na versão anterior são completadas automaticamente com os módulos novos, sem perder dados.

## Outros apps neste repositório

- [`nutri/`](nutri/README.md) — **NutriGest**, app de gestão para consultório de nutrição (projeto independente, mesma stack).

## Tecnologias

React 18 + TypeScript + Vite, React Router, Recharts e Lucide Icons. Back-end em Cloudflare Workers com banco Cloudflare D1.

O app detecta sozinho onde está rodando:

- **Publicado no Cloudflare** (`/api` disponível): dados no banco D1, compartilhados entre usuários; login validado no servidor (senhas com PBKDF2, sessão assinada com HMAC, permissões por perfil checadas na API).
- **Arquivo aberto direto / hospedagem estática**: modo local, dados no `localStorage` do navegador.

## Publicar no Cloudflare (Worker + D1)

O banco `techgest-db` já está criado; o `wrangler.toml` aponta para ele e roda o build automaticamente antes de cada deploy. As tabelas e a chave que assina as sessões são criadas pelo próprio Worker no primeiro acesso.

**Pelo painel, sem linha de comando (recomendado):**

1. Cloudflare → **Workers & Pages** → **Create application** → **Import a repository**.
2. Conecte o GitHub e escolha o repositório `TCC-v1`.
3. Nome do projeto: `techgest` (precisa ser igual ao `name` do `wrangler.toml`).
4. Branch de produção: a branch com este código. Build command: deixe em branco. Deploy command: `npx wrangler deploy`.
5. **Save and Deploy**. A cada push na branch, o Cloudflare publica de novo.

**Pela linha de comando:**

```bash
npm install
npx wrangler login
npm run deploy
```

Opcional: `npx wrangler secret put AUTH_SECRET` define você mesmo a chave das sessões; sem ele, o Worker gera uma e guarda no D1.

No primeiro acesso, o app popula o banco com os dados de demonstração. Todos os usuários começam com a senha `123456`; troque em **Configurações → Alterar minha senha** (o proprietário redefine a dos demais em **Usuários**).

| Arquivo | Função |
|---|---|
| `worker/index.js` | API (`/api/status`, `/login`, `/db`, `/items/:col/:id`, `/config/:key`, `/password`, `/reset`) e entrega do app |
| `worker/schema.sql` | Tabelas `items`, `config`, `credentials` |
| `wrangler.toml` | Configuração do Worker, assets estáticos e vínculo com o D1 |
| `scripts/singlefile.mjs` | Gera `cloudflare-dist/index.html` com JS e CSS embutidos |

## Como executar

```bash
npm install
npm run dev      # ambiente de desenvolvimento
npm run build    # gera a versão de produção em dist/
npm run preview  # serve o build localmente
```

Usuários de demonstração (senha `123456`): `saymon@techgest.com` (Proprietário), `ana@techgest.com` (Operador), `carlos@techgest.com` (Financeiro), `lucas@techgest.com` (Técnico).

> Observação: no modo local (sem Worker) a autenticação é apenas de demonstração, feita no navegador.
