# Painel do desenvolvedor — Ninho

Worker separado (`painel-ninho`) que lê o mesmo banco D1 (`ninho-db`) do app, mas **só mostra agregados anônimos**.

## O que mostra (menu lateral; no celular vira abas roláveis)
- **Visão geral:** alertas com ação sugerida, KPIs (usuários, ativos dia/semana/mês, famílias ativas, ativação, famílias esfriando, saúde do servidor) e resumo com atalhos.
- **Crescimento e ativação:** cadastros por dia, convites aceitos, contas excluídas e **funil de ativação** (conta → bebê vinculado → 1º registro → hábito em 3+ dias), com a etapa de maior perda e o tempo até o 1º registro.
- **Engajamento e retenção:** saúde das famílias (intensa, regular, leve, esfriando, paradas), adoção de cada funcionalidade, **mapa de calor** de uso por dia × hora, tipos de registro e retenção por turma de cadastro.
- **Localização:** usuários ativos por **país, estado e cidade** e onde as contas foram criadas.
- **Aparelhos:** **aparelho de cadastro** (modelo, sistema, tipo, navegador) e aparelhos em uso; % com app instalado.
- **Notificações:** % com push, enviadas × abertas por dia, aparelhos por serviço de entrega.
- **Estabilidade** (requisições, erro e tempo por hora; rotas) · **Erros** (por dia e lista agrupada) · **Sistema** (lembretes, versão, volume do banco).
- Toda lista/tabela pode ser **baixada em CSV** (só os números agregados).

## Privacidade por desenho
- Nenhuma consulta retorna nome, e-mail, foto, dados do bebê, notas ou recados.
- Usuários aparecem só como contagem; atividade diária e origem do cadastro usam um ID embaralhado (HMAC), sem volta.
- Local estimado pela rede (Cloudflare: país, estado, cidade), nunca GPS; modelo do aparelho só quando o navegador informa.
- Grupos com menos de 3 pessoas (cidade, modelo, etc.) são somados em "Outros" (k-anonimato).
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
