#!/usr/bin/env bash
# Inicia o sistema no Linux ou macOS.
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "O Node.js não está instalado. Instale a versão LTS em https://nodejs.org/pt-br"
  exit 1
fi
if ! node -e "require('node:sqlite')" >/dev/null 2>&1; then
  echo "A versão do Node.js é muito antiga. Instale a versão LTS mais recente (22 ou superior)."
  exit 1
fi
if [ ! -f node_modules/express/package.json ]; then
  echo "Preparando o sistema pela primeira vez. Aguarde..."
  npm install --omit=dev --no-audit --no-fund || exit 1
fi
exec node --no-warnings server.js
