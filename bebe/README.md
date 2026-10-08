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

### Insights automáticos ("Onde agir agora")

Intervalo desde a última mamada acima do planejado · sem cocô há mais de 3 dias · menos mamadas ou fraldas de xixi do que o habitual até este horário · variação de sono ≥ 12% na semana · sono abaixo da faixa da idade · aderência à rotina planejada · carga de cuidados concentrada em uma pessoa (≥ 70%) · material acabando ou com cobertura < 3 dias · consulta nos próximos 3 dias · vacinas sem registro para a idade · ganho de peso entre pesagens.

> As referências (AAP, AASM, SBP, PNI) são gerais. O app organiza os dados para conversar com o pediatra; não faz diagnóstico.

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
```

Segurança: senhas com PBKDF2 (100 mil iterações), sessão assinada com HMAC (30 dias), e **toda rota de bebê verifica o vínculo e o nível de acesso no servidor**.

## Publicar no Cloudflare

**Pelo painel (recomendado):** Workers & Pages → Create → Import a repository → `TCC-v1`:
- Project name: `ninho` · **Root directory: `bebe`** · Build command: em branco · Deploy command: `npx wrangler deploy`.

O `wrangler.toml` já aponta para o D1 e gera o app (arquivo único) antes do deploy. Publica em `https://ninho.<sua-conta>.workers.dev`.

**Pela linha de comando:**

```bash
cd bebe
npm install
npx wrangler login
npm run deploy
```

Opcional: `npx wrangler secret put AUTH_SECRET` (sem ele, o Worker gera a chave e guarda no D1).

## Rodar localmente

```bash
cd bebe
npm install
npm run dev                                 # só front-end: modo local (dados no navegador)
npm run build:single && npx wrangler dev    # Worker + D1 local, igual à produção
```

Na tela inicial, **"Explorar com uma família de exemplo"** cria mãe, pai, avó e babá vinculados à Helena (3 meses) com 5 semanas de rotina, mural, consultas, vacinas e pesagens — bom para apresentação.

| Arquivo | Função |
|---|---|
| `worker/index.js` | API (`/api/auth/*`, `/me`, `/babies/:id`, convites, cuidadores, eventos, crescimento, mural, recados, consultas, vacinas, `/seed`) e entrega do app |
| `src/lib/metrics.ts` | Indicadores, referências por idade, aderência à rotina, cobertura do mural e insights |
| `src/lib/api.ts` | Cliente da API + modo local com o mesmo contrato |
| `src/lib/demo.ts` | Rotina sugerida por idade e gerador de dados de exemplo |
