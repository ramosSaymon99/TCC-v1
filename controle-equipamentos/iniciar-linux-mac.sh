#!/bin/sh
# Inicia o Controle de Equipamentos e abre o navegador.
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js não encontrado. Instale a versão 22 LTS ou superior em https://nodejs.org"
  exit 1
fi

[ -d node_modules/express ] || npm install --omit=dev

URL="http://localhost:${PORT:-3000}"
( sleep 1.5; if command -v open >/dev/null 2>&1; then open "$URL"; elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL"; fi ) >/dev/null 2>&1 &
echo "Abrindo $URL (Ctrl+C para encerrar)"
exec node --disable-warning=ExperimentalWarning server.js
