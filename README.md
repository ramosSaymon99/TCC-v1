# Pivot Hub · Gestão Comercial

Sistema web (SaaS multiempresa) de gestão comercial para pequenos negócios de serviços, desenvolvido como TCC. A base de demonstração é uma empresa de tecnologia (treinamentos, manutenção de computadores e criação de sites).

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

## Plataforma SaaS (console do fornecedor)

O Pivot Hub é multiempresa: cada empresa assinante tem uma base isolada e o plano contratado define o que ela acessa. O console aparece no menu **Plataforma SaaS** apenas para o proprietário da empresa principal (`saymon@pivothub.com`).

| Tela | Destaques |
|------|-----------|
| Visão da plataforma | MRR/ARR, pagantes e ticket médio (ARPA), churn de receita e NRR, inadimplência, testes grátis e conversão, CAC, LTV e payback; "Onde agir agora" (testes acabando, atrasos, contas em risco, empresas no limite de usuários, fidelidades a renovar); decomposição do MRR (novos, expansão, contração, cancelamentos); receita por plano e aquisição por canal |
| Empresas assinantes | Cadastro da empresa com geração de acesso (senha provisória), teste grátis ou assinatura paga, base vazia ou com dados de exemplo; troca de plano com impacto no MRR e módulos ganhos/perdidos; estender teste, converter, marcar inadimplente, suspender, reativar, cancelar com motivo; saúde da conta (acesso + adoção + pagamento) e histórico |
| Planos e preços | Básico, Intermediário e Completo (editáveis): preço, desconto anual, usuários incluídos, usuário extra e módulos liberados; matriz de módulos × adoção real; simulador de reajuste com ponto de equilíbrio; regras comerciais (módulo avulso, dias de teste, tolerância de atraso, investimento em aquisição) |
| Faturamento SaaS | Emissão das faturas do mês, baixa de pagamento (reativa a conta automaticamente), régua de inadimplência e suspensão, adimplência por competência, exportação CSV |

Na empresa assinante: módulos fora do plano aparecem com cadeado e mostram o plano que os libera (com a diferença de preço); o limite de usuários é aplicado ao criar ou reativar usuários; avisos de teste grátis e de fatura em atraso; "Minha assinatura" em Configurações. As regras também são validadas no Worker (plano, limite de usuários, e-mail único na plataforma, bloqueio de contas suspensas, canceladas ou com teste vencido).

## Cobrança automática (Asaas)

Cada empresa assinante pode ser cobrada automaticamente: o Worker cria o cliente e uma **assinatura mensal** no Asaas (Pix, boleto, cartão ou "cliente escolhe"), o Asaas gera e envia as faturas e avisa o Pivot Hub pelo **webhook** `/api/asaas/webhook`.

O que acontece sozinho:

- Pagamento confirmado → fatura baixada; teste grátis vira assinatura; conta inadimplente ou suspensa volta a ficar ativa.
- Troca de plano, usuários extras ou desconto → valor da assinatura atualizado no Asaas (inclusive cobranças pendentes).
- Cancelamento da empresa → assinatura encerrada no Asaas.
- Todo dia às 7h (Cron Trigger) → conferência dos pagamentos no Asaas (caso algum webhook se perca) e, se ativada em *Regras comerciais*, a régua de inadimplência/suspensão.
- A empresa cliente vê o aviso de vencimento com o botão **Pagar agora** (link seguro do Asaas).

### Como ativar

1. No Asaas (comece pelo **sandbox**: sandbox.asaas.com): *Integrações → Chaves de API* → gerar chave.
2. No Cloudflare: *Workers & Pages → techgest → Settings → Variables and Secrets → Add* → tipo **Secret**, nome `ASAAS_API_KEY`, valor = chave. **Nunca** coloque a chave no código ou no repositório.
3. No Pivot Hub: *Plataforma SaaS → Faturamento SaaS* → **Configurar webhook** (o token é gerado e guardado no banco).
4. Em *Empresas assinantes* → menu da empresa → **Ativar cobrança automática** (exige CPF/CNPJ válido).

O ambiente é deduzido do prefixo da chave (`$aact_hmlg_` = sandbox, `$aact_prod_` = produção) ou definido pela variável `ASAAS_AMBIENTE`. Para ir à produção: troque o secret pela chave de produção e clique em **Reconfigurar webhook**.

## WhatsApp Business

Cada empresa conecta o **próprio número** do WhatsApp Business. Há dois modos:

- **Modo link (sem configuração):** nos botões de WhatsApp, o sistema abre o WhatsApp do usuário com a mensagem pronta (`wa.me`). Funciona desde o primeiro dia e também no modo local.
- **Conectado à API oficial (Cloud API da Meta):** as mensagens saem direto do sistema, o status (entregue/lida) é atualizado, as respostas dos clientes ficam no histórico e **contatos novos viram oportunidades no Funil** (origem WhatsApp).

Onde aparece:

- **Orçamentos** → menu da linha → *Enviar pelo WhatsApp* (proposta com número, serviço, valor e validade; marca como "Proposta enviada").
- **Ordens de Serviço** → *Avisar cliente pelo WhatsApp* (texto conforme o status: concluída, aguardando material, andamento).
- **Financeiro** → receitas pendentes → *Cobrar pelo WhatsApp*.
- **Clientes** → painel → aba *WhatsApp* com a conversa e *Nova mensagem*.
- **Funil** → cartões de leads com o telefone, a última mensagem recebida e o atalho de resposta.

### Como conectar (API oficial)

1. Em developers.facebook.com: crie um app do tipo **Business** e adicione o produto **WhatsApp**; cadastre e verifique o número da empresa.
2. No Gerenciador de Negócios: crie um **usuário do sistema**, dê acesso ao app e à conta do WhatsApp e gere um **token permanente** com as permissões `whatsapp_business_messaging` e `whatsapp_business_management`.
3. No Pivot Hub: *Configurações → WhatsApp Business → Conectar* e informe o **Phone number ID**, o **token** e o **App secret** (*Configurações do app → Básico*). O sistema valida os dados na Meta antes de salvar. Token e App secret ficam só no banco do servidor e nunca voltam para o navegador.
4. Copie a **URL de retorno** (`/api/whatsapp/webhook/<empresa>`) e o **token de verificação** mostrados no cartão e cole em *WhatsApp → Configuração → Webhook* no app da Meta; assine o campo **messages**.
5. Opcional: cadastre e aprove na Meta um **modelo de mensagem** (ex.: `aviso_cliente`, corpo com `{{1}}` = nome e `{{2}}` = mensagem) e informe o nome no cartão. Fora da janela de 24 h desde a última mensagem do cliente, a Meta só aceita modelos aprovados; o Pivot Hub reenvia automaticamente como modelo quando o texto livre é recusado.

Segurança: o webhook só aceita eventos com a assinatura `X-Hub-Signature-256` válida (HMAC com o App secret); eventos repetidos são ignorados. Variáveis opcionais do Worker: `WHATSAPP_GRAPH_VERSION` (versão da Graph API, padrão `v23.0`) e `WHATSAPP_GRAPH_URL` (usada em testes).

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
3. Nome do projeto: `techgest` (precisa ser igual ao `name` do `wrangler.toml`; o nome técnico do Worker e do banco foi mantido após a troca de marca para não quebrar o deploy já configurado).
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

Usuários de demonstração (senha `123456`): `saymon@pivothub.com` (Proprietário), `ana@pivothub.com` (Operador), `carlos@pivothub.com` (Financeiro), `lucas@pivothub.com` (Técnico).

> Observação: no modo local (sem Worker) a autenticação é apenas de demonstração, feita no navegador.
