@echo off
chcp 65001 >nul
title BALANÇAS.COM - Checklist e Orçamentos
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   O Node.js não está instalado neste computador.
  echo   Baixe e instale a versão LTS em https://nodejs.org/pt-br
  echo   Depois, dê dois cliques novamente neste arquivo.
  echo.
  start "" "https://nodejs.org/pt-br/download"
  pause
  exit /b 1
)

node -e "require('node:sqlite')" >nul 2>nul
if errorlevel 1 (
  echo.
  echo   A versão do Node.js instalada é muito antiga.
  echo   Instale a versão LTS mais recente em https://nodejs.org/pt-br
  echo.
  start "" "https://nodejs.org/pt-br/download"
  pause
  exit /b 1
)

if not exist "node_modules\express\package.json" (
  echo.
  echo   Preparando o sistema pela primeira vez. Aguarde...
  echo.
  call npm install --omit=dev --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo   Não foi possível instalar os componentes. Verifique a internet e tente de novo.
    pause
    exit /b 1
  )
)

node --no-warnings server.js
pause
