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

React 18 + TypeScript + Vite, React Router, Recharts e Lucide Icons. Os dados ficam no `localStorage` do navegador (há dados de demonstração gerados relativos à data atual).

## Como executar

```bash
npm install
npm run dev      # ambiente de desenvolvimento
npm run build    # gera a versão de produção em dist/
npm run preview  # serve o build localmente
```

Usuários de demonstração (senha `123456`): `saymon@techgest.com` (Proprietário), `ana@techgest.com` (Operador), `carlos@techgest.com` (Financeiro), `lucas@techgest.com` (Técnico).

> Observação: a autenticação é apenas de demonstração (front-end). Para produção, é necessário um back-end com autenticação e banco de dados.
