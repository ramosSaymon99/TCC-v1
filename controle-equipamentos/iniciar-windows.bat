@echo off
chcp 65001 >nul
title Controle de Equipamentos
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale a versao 22 LTS ou superior em https://nodejs.org e execute este arquivo novamente.
  pause
  exit /b 1
)

if not exist "node_modules\express" (
  echo Instalando dependencias...
  call npm install --omit=dev
)

echo Abrindo http://localhost:3000 ...
start "" http://localhost:3000
node --disable-warning=ExperimentalWarning server.js
pause
