# Ninho · Rotina do bebê

App web (otimizado para celular) para **criar, registrar e acompanhar a rotina de bebês, recém-nascidos e crianças**, compartilhado por toda a rede de cuidado: mãe, pai, avós, babá, tios, irmãos, padrinhos.

## Conceito

O **bebê é o registro central**. Cada pessoa cria sua conta e se **vincula ao bebê** com:

- um **papel** (mãe, pai, avó, avô, babá, tia, tio, irmã, irmão, madrinha, padrinho, outro);
- um **nível de acesso**: *Administrador* (edita o bebê, convida/remove cuidadores), *Cuidador* (registra rotina, mural e saúde) ou *Acompanha* (só visualiza — ex.: avós que moram longe).

Novos cuidadores entram por **código de convite** (6 caracteres, uso único, válido por 7 dias, com envio pelo WhatsApp). Uma mesma pessoa pode acompanhar mais de um bebê (irmãos).

## Telas

| Tela | O que faz | Pergunta que responde |
|---|---|---|
| **Hoje** | Registro em 1 toque (amamentação com cronômetro e lado sugerido, mamadeira, sono com cronômetro, fralda xixi/cocô com consistência e cor, remédio, banho, papinha, outro); "desde a última" mamada/fralda/sono; **hoje até agora × média dos 7 dias no mesmo horário**; rotina planejada × realizada; linha do tempo com quem registrou; **Onde agir agora**; recados fixados | O bebê está bem agora? O que fazer a seguir? |
| **Indicadores** | Dia / Semana / Mês com comparação ao período anterior (base equivalente para o dia em curso), faixa de referência por idade, **leitura automática do período** (decompõe a variação do sono em noturno × sonecas), gráficos de sono, alimentação e fraldas, **padrão 24 h**, **quem cuidou** (% dos registros), filtro por cuidador (ex.: relatório do turno da babá) e exportação CSV | O que mudou, quanto e por quê? |
| **Mural** | Materiais de uso por categoria com estoque e mínimo, **baixa automática de fraldas** a cada troca registrada, **cobertura em dias** no ritmo atual, lista de compras com "Eu compro" / "Comprado", e **recados** entre cuidadores (fixar/concluir) | O que está acabando e quem compra? |
| **Saúde** | Curva de peso e altura, ganho de peso (g/dia) × referência, consultas, calendário de vacinas (PNI) com status por idade, histórico de remédios | Está crescendo bem? Vacinas em dia? |
| **Família** | Perfil do bebê, **rotina planejada** (mamadas, sonecas, acorda/dorme, intervalo máximo), cuidadores com participação nos últimos 7 dias, convites, perfil pessoal e dados de exemplo | Quem cuida, com qual acesso, e quanto cada um participa? |

### Fotos de perfil

Bebê e cuidadores podem ter foto (galeria ou câmera do celular). O app recorta em quadrado e reduz para ~25 KB (JPEG 320×320) antes de enviar. As fotos ficam no D1 e são servidas por **link assinado** (HMAC), que só é entregue a quem está vinculado ao bebê; só administradores trocam a foto do bebê. Aparecem no topo, na troca de bebê, na lista de cuidadores, na linha do tempo ("quem registrou"), em "Quem cuidou", nos recados e nas notificações.

### Notificações

- **Sino 🔔 no topo (dentro do app):** alertas atuais do bebê + o que os outros cuidadores registraram nas últimas 24 h e recados novos, com contador de não lidas. Com a tela aberta, um aviso aparece quando outro cuidador registra algo (sincronização a cada 30 s).
- **Push no celular/computador (mesmo com o app fechado)** — Família → *Configurar notificações* → *Ativar neste aparelho*. Cada pessoa escolhe o que receber:

| Categoria | Quando chega | Padrão |
|---|---|---|
| 🍼 Lembretes | Mamada passou do intervalo planejado (rotina ou referência da idade); cronômetro de mamada > 75 min ou de sono > 10 h | ligado |
| 📌 Recados | Novo recado no mural | ligado |
| 🛒 Materiais | Item fica abaixo do mínimo ou acaba (inclusive pela baixa automática de fraldas) | ligado |
| 🩺 Consultas | Ao agendar, 24 h antes e 2 h antes | ligado |
| 👋 Família | Novo cuidador aceitou o convite | ligado |
| 📝 Cada registro | Toda mamada, fralda e sono registrados por outra pessoa (ideal para avós que moram longe) | desligado |

Há também **horário de silêncio** e botão de teste. Ninguém recebe aviso do que ele mesmo registrou. Os lembretes rodam por **Cron Trigger a cada 15 min** (`wrangler.toml`), sem duplicar o mesmo aviso. Tocar na notificação abre o app já no bebê e na tela certos.

Implementação: Web Push padrão (VAPID + criptografia aes128gcm) feito só com WebCrypto no Worker — sem serviço externo nem chave para configurar (o par VAPID é gerado e guardado no D1 no primeiro uso). Funciona no Chrome, Edge e Firefox (Android e computador) e no Safari; **no iPhone/iPad é preciso "Adicionar à Tela de Início"** e abrir pelo ícone (iOS 16.4+) — o app explica isso na tela de configuração. O app é instalável (PWA com manifesto e ícones).

### Relatório em PDF para o pediatra

Saúde → **Relatório para o pediatra** (também em Indicadores, no lembrete de consulta e no atalho do ícone). Escolha 7, 14 ou 30 dias e anote as dúvidas da família (ficam salvas no aparelho até a consulta). O PDF (A4, ~3 páginas, ~30 KB) é gerado **no próprio aparelho** e pode ser compartilhado (WhatsApp, e-mail), baixado ou aberto:

- cabeçalho com idade, período e quem gerou; cartões de peso, ganho g/dia, sono, mamadas e fraldas;
- **tabela-resumo** (média/dia, mínimo–máximo diário, variação × período anterior e referência da idade, com destaque do que está fora da faixa);
- gráficos de sono (noturno × sonecas), mamadas (peito × mamadeira) e fraldas (xixi × cocô) por dia;
- **padrão de 24 h** (sono, mamadas e evacuações dia a dia);
- evacuações (consistência, cor, maior intervalo), alimentação complementar, crescimento, remédios, vacinas (aplicadas, atrasadas, previstas e próximas), observações de tendência do app;
- **dúvidas da família** e espaço para **anotações do pediatra**.

Usa só dias completos (até ontem) e avisa quando o período tem poucos registros.

### Notificações na tela de bloqueio e na tela inicial

- **Formato para a tela de bloqueio:** título curto com o nome do bebê ("🍼 Helena · hora da mamada"), corpo de até 2–3 linhas, horário do fato, agrupamento (um aviso substitui o anterior em vez de empilhar), avisos discretos sem som para registros comuns e fixos para lembretes importantes.
- **Cronômetro "ao vivo":** ao iniciar sono ou mamada, todos os cuidadores recebem um aviso fixo "😴 Helena está dormindo · desde 14:05" com o botão **☀️ Acordou**; ao terminar, ele é trocado por "☀️ Helena acordou · dormiu 1h20 (14:05–15:25)".
- **Botões de ação:** *Acordou/Terminou* e *Eu compro* gravam direto, sem abrir o app; *Registrar mamada* e *Gerar relatório* abrem o app já na tela certa.
- **Contador no ícone do app** (não lidas), na tela inicial do celular.
- **Atalhos no ícone** (pressionar o ícone, Android/Windows): Mamada, Sono, Fralda, Relatório.

> **Dynamic Island, Atividades ao Vivo e widgets** são recursos exclusivos de apps nativos (iOS ActivityKit/WidgetKit; widgets Android). Um app web não aparece neles. Ver "Próximo passo: app nativo" abaixo.

### Insights automáticos ("Onde agir agora")

Intervalo desde a última mamada acima do planejado · sem cocô há mais de 3 dias · menos mamadas ou fraldas de xixi do que o habitual até este horário · variação de sono ≥ 12% na semana · sono abaixo da faixa da idade · aderência à rotina planejada · carga de cuidados concentrada em uma pessoa (≥ 70%) · material acabando ou com cobertura < 3 dias · consulta nos próximos 3 dias · vacinas sem registro para a idade · ganho de peso entre pesagens.

> As referências (AAP, AASM, SBP, PNI) são gerais. O app organiza os dados para conversar com o pediatra; não faz diagnóstico.

## Sem internet, desfazer e fuso horário

- **Funciona sem internet.** O app fica guardado no aparelho (service worker) e abre mesmo offline, com a última cópia dos dados. Registros, cronômetros, mural, recados, saúde e vacinas feitos sem conexão entram numa **fila** e aparecem na hora (marcados "⏳ aguardando internet"). Quando a conexão volta, tudo é enviado na ordem e o app avisa quantos foram. O servidor é idempotente pelo id do registro: reenviar não duplica nem baixa o estoque duas vezes. Encerrar um cronômetro ou editar algo que ainda está na fila junta na mesma operação; excluir algo que ainda não subiu simplesmente cancela o envio. Se o servidor recusar um item (ex.: acesso removido), ele sai da fila e o app informa.
- **Desfazer em 1 toque.** Depois de registrar, editar ou excluir um registro, encerrar um cronômetro, mexer no estoque do mural ou publicar/excluir recado, o aviso mostra **DESFAZER** por 6 segundos (funciona também offline).
- **Fuso horário por pessoa.** Cada aparelho inscrito guarda seu fuso; os horários dentro das notificações saem no fuso de quem recebe (ex.: avó em Lisboa vê 18:05, pai em São Paulo vê 14:05).

## Segurança, privacidade e LGPD

| Proteção | Como funciona |
|---|---|
| **Consentimento** | Cadastro exige aceite da Política de Privacidade e dos Termos (versão registrada). Ao cadastrar uma criança, quem cadastra declara ser responsável legal ou autorizado (LGPD, art. 14) — data e autor ficam registrados. |
| **Política de Privacidade** | Na tela de entrada e em Família → Meu perfil. Defina o contato do controlador com `VITE_CONTATO_PRIVACIDADE` no build. Texto-base: revise com assessoria jurídica antes de uso comercial. |
| **Limite de tentativas** | 5 erros de senha por e-mail ou 30 por IP em 15 min bloqueiam novas tentativas; também limita cadastros, pedidos de redefinição e códigos. |
| **Sessões** | Assinadas (HMAC) e amarradas à senha: **trocar ou redefinir a senha derruba as sessões dos outros aparelhos**. |
| **Esqueci minha senha** | (a) **Por e-mail**, com link de uso único válido por 1 h — liga sozinho quando os secrets `RESEND_API_KEY` e `EMAIL_FROM` existem (`npx wrangler secret put …`). (b) **Sem e-mail**, um administrador do bebê gera um **código de 8 caracteres** (30 min, uso único) em Família → cuidador → "Gerar código de senha". Por segurança, não vale para administradores nem para quem acompanha bebês fora do alcance desse administrador. Só o hash do código/link fica no banco. |
| **Exclusão de conta** | Família → Meu perfil → *Excluir minha conta* (senha + digitar EXCLUIR). Apaga nome, e-mail, senha, foto, aparelhos e preferências. Bebê em que a pessoa era a única cuidadora é apagado por inteiro; nos compartilhados, o histórico fica com a família e, se ela era a única administradora, a administração passa ao cuidador mais antigo. |
| **Portabilidade** | Família → Dados → *Exportar dados (JSON)* (administradores): todo o histórico do bebê. |
| **Contas de exemplo** | Marcadas com aviso no topo e **apagadas automaticamente 24 h** após a criação (Cron), junto com tentativas de login e códigos expirados. |

## Banco de dados (Cloudflare D1)

Banco **`ninho-db`** (id `13f1a93c-7d59-4dd7-93cd-47297ede0756`), já criado e com as tabelas aplicadas. Esquema em `worker/schema.sql` (o Worker também cria tudo sozinho no primeiro acesso):

```
users ──< members >── babies ──< events        (mamada, mamadeira, sono, fralda, remédio, banho, papinha, extração, outro)
                        │    ──< growth        (peso, altura, perímetro cefálico)
                        │    ──< supplies      (mural de materiais, estoque, baixa automática)
                        │    ──< notes         (recados)
                        │    ──< appointments  (consultas)
                        │    ──< vaccines      (vacinas aplicadas)
                        └────< invites         (códigos de convite)
photos (fotos do bebê e dos cuidadores) · push_subs (aparelhos inscritos) · notif_prefs (preferências) · notif_log (evita aviso repetido)
login_attempts (limite de tentativas) · password_resets (hash dos códigos/links de redefinição)
```

Segurança: senhas com PBKDF2 (100 mil iterações), sessão assinada com HMAC (30 dias), e **toda rota de bebê verifica o vínculo e o nível de acesso no servidor**.

## Publicar no Cloudflare

**Pelo painel (recomendado):** Workers & Pages → Create → Import a repository → `TCC-v1`. Depois, em **ninho → Settings → Build**:
- **Comando da build:** `npm run build` (ou em branco) · **Comando de implantação:** `npx wrangler deploy` · **Diretório raiz:** `bebe`
- **Branch control → Production branch:** a branch com este código.

O primeiro deploy, feito antes desses ajustes, usa a `main`/raiz do repositório (o TechGest) — é só corrigir e fazer um novo push. O `wrangler.toml` desta pasta liga o Worker ao D1 `ninho-db` e ao Cron dos lembretes; a cada push na branch o Cloudflare publica de novo.

**Pela linha de comando:**

```bash
cd bebe
npm install
npx wrangler login
npm run deploy
```

Opcional: `npx wrangler secret put AUTH_SECRET` (sem ele, o Worker gera a chave e guarda no D1).

## Próximo passo: app nativo (Dynamic Island e widgets)

Para a Dynamic Island, as Atividades ao Vivo e os widgets da tela inicial, o caminho é empacotar este mesmo app com **Capacitor** e adicionar extensões nativas:

- **iOS:** Widget Extension (WidgetKit) com "última mamada / sono atual / fraldas hoje" e uma **Live Activity** (ActivityKit) para o cronômetro de sono/mamada na Dynamic Island e na tela de bloqueio, atualizada por **APNs** a partir deste mesmo Worker.
- **Android:** widget de tela inicial (Glance) com os mesmos dados e notificação contínua do cronômetro.

Requisitos: Mac com Xcode, conta Apple Developer (US$ 99/ano), Android Studio e uma chave APNs (.p8). A API e o banco atuais já servem esses apps sem mudanças estruturais.

## Rodar localmente

```bash
cd bebe
npm install
npm run dev                                 # só front-end: modo local (dados no navegador)
npm run build && npx wrangler dev           # Worker + D1 local, igual à produção
```

Na tela inicial, **"Explorar com uma família de exemplo"** cria mãe, pai, avó e babá vinculados à Helena (3 meses) com 5 semanas de rotina, mural, consultas, vacinas e pesagens — bom para apresentação.

| Arquivo | Função |
|---|---|
| `worker/index.js` | API (`/api/auth/*`, `/me`, `/babies/:id`, convites, cuidadores, eventos, crescimento, mural, recados, consultas, vacinas, `/seed`) e entrega do app |
| `worker/conta.js` | Limite de tentativas, redefinição de senha, exclusão de conta e limpeza das contas de exemplo |
| `worker/push.js` | Web Push: chaves VAPID, assinatura ES256 e criptografia aes128gcm |
| `worker/notify.js` | Quem recebe o quê (preferências, silêncio) e lembretes do Cron |
| `public/sw.js` | Service worker: mostra a notificação e abre o app no lugar certo |
| `src/lib/metrics.ts` | Indicadores, referências por idade, aderência à rotina, cobertura do mural e insights |
| `src/lib/api.ts` | Cliente da API + modo local com o mesmo contrato + envio da fila offline |
| `src/lib/offline.ts` | Fila de registros sem internet, aplicação otimista e cache dos dados |
| `src/lib/demo.ts` | Rotina sugerida por idade e gerador de dados de exemplo |
