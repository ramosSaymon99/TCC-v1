-- =====================================================================
-- Ninho · Indicadores do piloto (Cloudflare D1 / SQLite)
-- Antes de rodar, ajuste as datas do piloto no bloco "p" de cada consulta
-- (substituir em todo o arquivo: 2026-10-19T03:00Z = início, 2026-11-02T03:00Z = fim — 00:00 de Brasília).
-- Rodar:  npx wrangler d1 execute ninho-db --remote --file piloto/indicadores.sql
-- Contas de exemplo (@exemplo.ninho) e bebês só com contas de exemplo são excluídos.
-- Horários convertidos para Brasília (UTC-3).
-- =====================================================================

-- Q1 · Visão geral do piloto
WITH p AS (SELECT '2026-10-19T03:00:00Z' AS ini, '2026-11-02T03:00:00Z' AS fim),
reais AS (SELECT id FROM users WHERE email NOT LIKE '%@exemplo.ninho'),
fam AS (SELECT DISTINCT m.baby_id FROM members m JOIN reais r ON r.id = m.user_id),
ev AS (SELECT e.* FROM events e, p WHERE e.baby_id IN (SELECT baby_id FROM fam) AND e.start_at >= p.ini AND e.start_at < p.fim),
dias AS (SELECT (julianday(fim) - julianday(ini)) AS n FROM p)
SELECT
  (SELECT COUNT(*) FROM fam) AS familias,
  (SELECT COUNT(*) FROM members WHERE baby_id IN (SELECT baby_id FROM fam)) AS vinculos_cuidadores,
  ROUND((SELECT COUNT(*) * 1.0 FROM members WHERE baby_id IN (SELECT baby_id FROM fam)) / MAX(1, (SELECT COUNT(*) FROM fam)), 2) AS cuidadores_por_bebe,
  ROUND(100.0 * (SELECT COUNT(*) FROM (SELECT baby_id FROM members WHERE baby_id IN (SELECT baby_id FROM fam) GROUP BY baby_id HAVING COUNT(*) >= 2)) / MAX(1, (SELECT COUNT(*) FROM fam)), 1) AS pct_bebes_2mais_cuidadores,
  (SELECT COUNT(*) FROM ev) AS registros,
  ROUND((SELECT COUNT(*) * 1.0 FROM ev) / MAX(1, (SELECT COUNT(*) FROM fam)) / (SELECT n FROM dias), 1) AS registros_por_bebe_dia,
  ROUND(100.0 * (SELECT COUNT(*) FROM babies WHERE id IN (SELECT baby_id FROM fam) AND routine IS NOT NULL AND routine != 'null') / MAX(1, (SELECT COUNT(*) FROM fam)), 1) AS pct_com_rotina_planejada;

-- Q2 · Por família (engajamento, regularidade e divisão do cuidado)
WITH p AS (SELECT '2026-10-19T03:00:00Z' AS ini, '2026-11-02T03:00:00Z' AS fim),
reais AS (SELECT id FROM users WHERE email NOT LIKE '%@exemplo.ninho'),
fam AS (SELECT DISTINCT m.baby_id FROM members m JOIN reais r ON r.id = m.user_id),
ev AS (SELECT e.* FROM events e, p WHERE e.baby_id IN (SELECT baby_id FROM fam) AND e.start_at >= p.ini AND e.start_at < p.fim),
porpessoa AS (SELECT baby_id, user_id, COUNT(*) AS n FROM ev GROUP BY baby_id, user_id)
SELECT
  substr(b.id, 1, 8) AS familia,
  CAST(julianday('now') - julianday(b.birth_date) AS INTEGER) AS idade_dias,
  (SELECT COUNT(*) FROM members m WHERE m.baby_id = b.id) AS cuidadores,
  (SELECT group_concat(role, ', ') FROM members m WHERE m.baby_id = b.id) AS papeis,
  (SELECT COUNT(*) FROM ev WHERE ev.baby_id = b.id) AS registros,
  (SELECT COUNT(DISTINCT date(start_at, '-3 hours')) FROM ev WHERE ev.baby_id = b.id) AS dias_ativos,
  ROUND(100.0 * (SELECT COUNT(DISTINCT date(start_at, '-3 hours')) FROM ev WHERE ev.baby_id = b.id) / (SELECT julianday(fim) - julianday(ini) FROM p), 1) AS pct_dias_ativos,
  (SELECT COUNT(*) FROM porpessoa pp WHERE pp.baby_id = b.id) AS cuidadores_que_registraram,
  ROUND(100.0 * (SELECT MAX(n) FROM porpessoa pp WHERE pp.baby_id = b.id) / MAX(1, (SELECT COUNT(*) FROM ev WHERE ev.baby_id = b.id)), 1) AS pct_registros_do_principal
FROM babies b WHERE b.id IN (SELECT baby_id FROM fam) ORDER BY registros DESC;

-- Q3 · Retenção semanal (família com ao menos 1 registro na semana)
WITH p AS (SELECT '2026-10-19T03:00:00Z' AS ini, '2026-11-02T03:00:00Z' AS fim),
reais AS (SELECT id FROM users WHERE email NOT LIKE '%@exemplo.ninho'),
fam AS (SELECT DISTINCT m.baby_id FROM members m JOIN reais r ON r.id = m.user_id),
ev AS (SELECT e.*, CAST((julianday(e.start_at) - julianday(p.ini)) / 7 AS INTEGER) + 1 AS semana FROM events e, p WHERE e.baby_id IN (SELECT baby_id FROM fam) AND e.start_at >= p.ini AND e.start_at < p.fim)
SELECT semana, COUNT(DISTINCT baby_id) AS familias_ativas, COUNT(DISTINCT user_id) AS cuidadores_ativos, COUNT(*) AS registros
FROM ev GROUP BY semana ORDER BY semana;

-- Q4 · Tipos de registro
WITH p AS (SELECT '2026-10-19T03:00:00Z' AS ini, '2026-11-02T03:00:00Z' AS fim),
reais AS (SELECT id FROM users WHERE email NOT LIKE '%@exemplo.ninho'),
fam AS (SELECT DISTINCT m.baby_id FROM members m JOIN reais r ON r.id = m.user_id),
ev AS (SELECT e.* FROM events e, p WHERE e.baby_id IN (SELECT baby_id FROM fam) AND e.start_at >= p.ini AND e.start_at < p.fim)
SELECT type AS tipo, COUNT(*) AS registros, ROUND(100.0 * COUNT(*) / (SELECT COUNT(*) FROM ev), 1) AS pct,
       SUM(CASE WHEN end_at IS NOT NULL AND type IN ('sono', 'mamada') THEN 1 ELSE 0 END) AS com_cronometro_encerrado
FROM ev GROUP BY type ORDER BY registros DESC;

-- Q5 · Quem registra (por papel na família)
WITH p AS (SELECT '2026-10-19T03:00:00Z' AS ini, '2026-11-02T03:00:00Z' AS fim),
reais AS (SELECT id FROM users WHERE email NOT LIKE '%@exemplo.ninho'),
fam AS (SELECT DISTINCT m.baby_id FROM members m JOIN reais r ON r.id = m.user_id),
ev AS (SELECT e.* FROM events e, p WHERE e.baby_id IN (SELECT baby_id FROM fam) AND e.start_at >= p.ini AND e.start_at < p.fim)
SELECT COALESCE(m.role, 'ex-cuidador') AS papel, COUNT(*) AS registros, ROUND(100.0 * COUNT(*) / (SELECT COUNT(*) FROM ev), 1) AS pct,
       SUM(CASE WHEN CAST(strftime('%H', ev.start_at, '-3 hours') AS INTEGER) >= 22 OR CAST(strftime('%H', ev.start_at, '-3 hours') AS INTEGER) < 6 THEN 1 ELSE 0 END) AS registros_madrugada
FROM ev LEFT JOIN members m ON m.baby_id = ev.baby_id AND m.user_id = ev.user_id
GROUP BY papel ORDER BY registros DESC;

-- Q6 · Notificações: adesão, envio e abertura por categoria
WITH p AS (SELECT '2026-10-19T03:00:00Z' AS ini, '2026-11-02T03:00:00Z' AS fim),
reais AS (SELECT id FROM users WHERE email NOT LIKE '%@exemplo.ninho'),
u AS (SELECT uso.* FROM uso, p WHERE uso.user_id IN (SELECT id FROM reais) AND uso.at >= p.ini AND uso.at < p.fim)
SELECT
  (SELECT COUNT(*) FROM reais) AS usuarios,
  (SELECT COUNT(DISTINCT user_id) FROM push_subs WHERE user_id IN (SELECT id FROM reais)) AS usuarios_com_push,
  ROUND(100.0 * (SELECT COUNT(DISTINCT user_id) FROM push_subs WHERE user_id IN (SELECT id FROM reais)) / MAX(1, (SELECT COUNT(*) FROM reais)), 1) AS pct_adesao_push,
  (SELECT COUNT(*) FROM u WHERE evento = 'notif_enviada') AS enviadas,
  (SELECT COUNT(*) FROM u WHERE evento IN ('notif_clique', 'notif_acao')) AS abertas,
  ROUND(100.0 * (SELECT COUNT(*) FROM u WHERE evento IN ('notif_clique', 'notif_acao')) / MAX(1, (SELECT COUNT(*) FROM u WHERE evento = 'notif_enviada')), 1) AS pct_abertura,
  (SELECT COUNT(*) FROM u WHERE evento = 'notif_acao') AS acoes_direto_na_notificacao,
  (SELECT group_concat(valor || ': ' || n, ' · ') FROM (SELECT valor, COUNT(*) AS n FROM u WHERE evento = 'notif_enviada' GROUP BY valor ORDER BY n DESC)) AS enviadas_por_categoria;

-- Q7 · Uso das funcionalidades (relatório, desfazer, offline, atalhos, instalação)
WITH p AS (SELECT '2026-10-19T03:00:00Z' AS ini, '2026-11-02T03:00:00Z' AS fim),
reais AS (SELECT id FROM users WHERE email NOT LIKE '%@exemplo.ninho'),
u AS (SELECT uso.* FROM uso, p WHERE uso.user_id IN (SELECT id FROM reais) AND uso.at >= p.ini AND uso.at < p.fim AND uso.evento NOT LIKE 'notif_%')
SELECT evento, COUNT(*) AS vezes, COUNT(DISTINCT user_id) AS usuarios, COUNT(DISTINCT baby_id) AS familias,
       SUM(CASE WHEN evento = 'sync_offline' THEN CAST(valor AS INTEGER) ELSE 0 END) AS registros_enviados_apos_offline
FROM u GROUP BY evento ORDER BY vezes DESC;

-- Q8 · Mural, recados e saúde (adoção dos módulos)
WITH reais AS (SELECT id FROM users WHERE email NOT LIKE '%@exemplo.ninho'),
fam AS (SELECT DISTINCT m.baby_id FROM members m JOIN reais r ON r.id = m.user_id)
SELECT
  ROUND(100.0 * (SELECT COUNT(DISTINCT baby_id) FROM supplies WHERE baby_id IN (SELECT baby_id FROM fam)) / MAX(1, (SELECT COUNT(*) FROM fam)), 1) AS pct_familias_usam_mural,
  (SELECT COUNT(*) FROM supplies WHERE baby_id IN (SELECT baby_id FROM fam)) AS itens_mural,
  ROUND(100.0 * (SELECT COUNT(*) FROM supplies WHERE baby_id IN (SELECT baby_id FROM fam) AND buyer_id IS NOT NULL) / MAX(1, (SELECT COUNT(*) FROM supplies WHERE baby_id IN (SELECT baby_id FROM fam))), 1) AS pct_itens_com_responsavel,
  (SELECT COUNT(*) FROM supplies WHERE baby_id IN (SELECT baby_id FROM fam) AND auto_type = 'fralda') AS itens_baixa_automatica,
  (SELECT COUNT(*) FROM notes WHERE baby_id IN (SELECT baby_id FROM fam)) AS recados,
  (SELECT COUNT(*) FROM growth WHERE baby_id IN (SELECT baby_id FROM fam)) AS medidas_crescimento,
  (SELECT COUNT(*) FROM appointments WHERE baby_id IN (SELECT baby_id FROM fam)) AS consultas,
  (SELECT COUNT(*) FROM vaccines WHERE baby_id IN (SELECT baby_id FROM fam)) AS vacinas_registradas,
  (SELECT COUNT(*) FROM photos WHERE kind = 'baby' AND id IN (SELECT baby_id FROM fam)) AS bebes_com_foto;

-- Q9 · Registros por hora do dia (Brasília) — mostra o peso das madrugadas
WITH p AS (SELECT '2026-10-19T03:00:00Z' AS ini, '2026-11-02T03:00:00Z' AS fim),
reais AS (SELECT id FROM users WHERE email NOT LIKE '%@exemplo.ninho'),
fam AS (SELECT DISTINCT m.baby_id FROM members m JOIN reais r ON r.id = m.user_id)
SELECT strftime('%H', e.start_at, '-3 hours') AS hora, COUNT(*) AS registros
FROM events e, p WHERE e.baby_id IN (SELECT baby_id FROM fam) AND e.start_at >= p.ini AND e.start_at < p.fim
GROUP BY hora ORDER BY hora;
