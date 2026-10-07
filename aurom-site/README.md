# Site Aurom Tech

Site institucional da Aurom Tech no conceito de página de produto (estilo Apple), publicado como **Cloudflare Worker**. O formulário de orçamento grava no **D1**, o mesmo banco do TechGest.

```
aurom-site/
├── public/index.html   site completo (HTML, CSS e JS em um arquivo)
├── worker/index.js     API /api/contato + entrega do site
├── worker/schema.sql   tabela leads (criada sozinha no primeiro pedido)
└── wrangler.toml       Worker "aurom-tech" + vínculo com o D1 techgest-db
```

## Como o formulário funciona

1. O visitante envia o pedido para `POST /api/contato`.
2. O Worker valida os campos, descarta robôs (campo invisível), aceita só envios do próprio site e limita a 5 pedidos a cada 10 minutos por IP (o IP é guardado só como hash).
3. O pedido é gravado na tabela `leads` **e** entra como oportunidade na etapa **Leads do Funil Comercial do TechGest** (origem "Site", com telefone, e-mail, prazo e mensagem).
4. O visitante recebe um protocolo (ex.: `AT-261007-3504`).

Sem o Worker (arquivo aberto direto ou hospedagem estática), o formulário monta a mensagem para WhatsApp ou cópia, e o pedido não se perde.

## Publicar no Cloudflare

**Pelo painel (igual ao TechGest):**

1. Cloudflare → **Workers & Pages** → **Create application** → **Import a repository** → `TCC-v1`.
2. Nome do projeto: `aurom-tech` (igual ao `name` do `wrangler.toml`).
3. **Root directory: `aurom-site`**. É isso que separa este Worker do TechGest.
4. Build command: em branco. Deploy command: `npx wrangler deploy`.
5. **Save and Deploy**. O site fica em `https://aurom-tech.<sua-conta>.workers.dev`.

**Pela linha de comando:**

```bash
cd aurom-site
npm install
npx wrangler login
npm run deploy      # publicar
npm run dev         # testar em http://localhost:8787 com D1 local
```

### Variáveis opcionais (Worker → Settings → Variables and Secrets)

| Variável | Para quê |
|---|---|
| `ALLOWED_ORIGINS` | Domínios extras aceitos, separados por vírgula, se o site for servido por outro endereço (ex.: `https://auromtech.com.br`). O endereço do próprio Worker já é aceito. |
| `NOTIFY_WEBHOOK` | URL de webhook (Discord, Slack ou Google Chat) avisada a cada novo pedido. |

### Consultar os pedidos

```bash
npx wrangler d1 execute techgest-db --remote --command "SELECT protocolo, criado_em, nome, telefone, servico, prazo FROM leads ORDER BY criado_em DESC LIMIT 20"
```

## Antes de publicar

No início do `<script>` de `public/index.html`, preencha `CONFIG` (`whatsapp` só com dígitos, DDI + DDD; `email`). Campos vazios somem do site. Confirme também as afirmações comerciais: orçamento sem custo, atendimento presencial e remoto, garantia e cópia dos dados antes da formatação.
