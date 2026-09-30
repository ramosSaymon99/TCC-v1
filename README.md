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

## Tecnologias

React 18 + TypeScript + Vite, React Router, Recharts e Lucide Icons. Back-end em Cloudflare Workers com banco Cloudflare D1.

O app detecta sozinho onde está rodando:

- **Publicado no Cloudflare** (`/api` disponível): dados no banco D1, compartilhados entre usuários; login validado no servidor (senhas com PBKDF2, sessão assinada com HMAC, permissões por perfil checadas na API).
- **Arquivo aberto direto / hospedagem estática**: modo local, dados no `localStorage` do navegador.

## Publicar no Cloudflare (Worker + D1)

O banco `techgest-db` já está criado e com as tabelas (`worker/schema.sql`). O `wrangler.toml` já aponta para ele.

```bash
npm install
npx wrangler login                    # abre o navegador para autorizar sua conta
npm run deploy                        # gera o index.html único e publica o Worker
npx wrangler secret put AUTH_SECRET   # cole uma frase longa e aleatória (assina as sessões)
```

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
