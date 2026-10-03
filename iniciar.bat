@echo off
chcp 65001 >nul
title BALANÇAS.COM - Checklist e Orçamentos
cd /d "%~dp0"

rem -------------------------------------------------------------------
rem  Usa o Node.js que acompanha o sistema (pasta "runtime").
rem  Sem essa pasta (cópia baixada do GitHub), usa o Node.js instalado.
rem -------------------------------------------------------------------
if exist "runtime\node.exe" goto usar_runtime
if not exist "runtime\montar.bat" goto usar_instalado
rem Pacote dividido em 2 arquivos: junta as partes do Node.js na primeira vez.
call "runtime\montar.bat"
if errorlevel 1 goto parar

:usar_runtime
set "NODE=runtime\node.exe"
goto componentes

:usar_instalado
set "NODE=node"
where node >nul 2>nul
if errorlevel 1 goto sem_node
node -e "require('node:sqlite')" >nul 2>nul
if errorlevel 1 goto node_antigo

:componentes
if exist "node_modules\express\package.json" goto atalho
if not "%NODE%"=="node" goto pacote_incompleto
echo.
echo   Preparando o sistema pela primeira vez. Aguarde...
echo.
call npm install --omit=dev --no-audit --no-fund
if errorlevel 1 goto falha_instalacao

:atalho
rem Na primeira vez, cria um atalho na Área de Trabalho (uma vez só).
if exist "dados\.atalho-criado" goto iniciar
if not exist "dados" mkdir "dados"
set "ATALHO_ALVO=%~dp0iniciar.bat"
set "ATALHO_PASTA=%~dp0"
set "ATALHO_ICONE=%~dp0public\img\icone.ico"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$w = New-Object -ComObject WScript.Shell; $a = $w.CreateShortcut([Environment]::GetFolderPath('Desktop') + '\Orcamentos BALANCAS.COM.lnk'); $a.TargetPath = $env:ATALHO_ALVO; $a.WorkingDirectory = $env:ATALHO_PASTA; $a.IconLocation = $env:ATALHO_ICONE; $a.Description = 'Checklist tecnico e orcamentos'; $a.Save()" >nul 2>nul
if not errorlevel 1 echo   Atalho "Orcamentos BALANCAS.COM" criado na Área de Trabalho.
echo.> "dados\.atalho-criado"

:iniciar
rem Usa o proxy do sistema (se houver) na consulta de CNPJ.
set "NODE_USE_ENV_PROXY=1"
"%NODE%" --no-warnings server.js
pause
exit /b 0

:parar
pause
exit /b 1

:sem_node
echo.
echo   Esta cópia do sistema não traz o Node.js embutido e ele não está instalado.
echo   Use o pacote completo para Windows, que já vem com tudo,
echo   ou instale o Node.js versão LTS em https://nodejs.org/pt-br
echo.
pause
exit /b 1

:node_antigo
echo.
echo   A versão do Node.js instalada neste computador é muito antiga.
echo   Use o pacote completo para Windows, que já vem com tudo,
echo   ou instale o Node.js versão LTS mais recente em https://nodejs.org/pt-br
echo.
pause
exit /b 1

:pacote_incompleto
echo.
echo   O pacote parece incompleto: falta a pasta "node_modules".
echo   Extraia novamente o arquivo .zip completo e tente de novo.
echo.
pause
exit /b 1

:falha_instalacao
echo.
echo   Não foi possível instalar os componentes. Verifique a internet e tente de novo.
echo.
pause
exit /b 1
