# Painel do desenvolvedor — Ninho

Worker separado (`ninho-painel`) que lê o mesmo banco D1 (`ninho-db`) do app, mas **só mostra agregados anônimos**.

## O que mostra
- Usuários totais, novos, ativos (DAU/WAU/MAU), famílias ativas, registros.
- Oscilação: série diária de ativos, cadastros e registros; requisições e latência por hora (48h); rotas mais lentas/com erro.
- Erros: servidor, app (navegador), push e cron, com mensagens higienizadas.
- Região (país/estado, nunca cidade), sistema do aparelho, instalado × navegador.
- Retenção por coorte semanal, uso de funcionalidades, alertas com ação sugerida.

## Privacidade por desenho
- Nenhuma consulta retorna nome, e-mail, foto, dados do bebê, notas ou recados.
- Usuários aparecem só como contagem; a atividade diária usa um ID embaralhado (HMAC), sem volta.
- Grupos com menos de 3 pessoas são somados em "Outros" (k-anonimato).
- Contas de exemplo (`@exemplo.ninho`) ficam fora das métricas.

## Segurança do acesso
- Contas próprias do painel (tabela `painel_admins`), senha PBKDF2, sessão em cookie HttpOnly/SameSite=Strict de 12h.
- Primeiro acesso exige o código de configuração guardado em `secrets` (chave `painel_setup`); depois ele é apagado.
- Limite de tentativas de login, cabeçalho anti-CSRF, CSP restrita e `noindex`.

## Publicar (Cloudflare → Workers & Pages → Create → Import a repository)
- Repositório: este; branch de produção: `claude/determined-ptolemy-820eml`
- Root directory: `painel`
- Build command: (vazio) · Deploy command: `npx wrangler deploy`

## Rodar local
```
npm install
npx wrangler dev --port 8788 --persist-to ../.estado-local
```
