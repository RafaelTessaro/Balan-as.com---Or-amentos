@echo off
chcp 65001 >nul
title Orçamentos BALANÇAS.COM - iniciando...
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
rem Atalho "Orcamentos BALANCAS.COM" na Área de Trabalho e no menu Iniciar.
rem Ele abre o sistema numa janela própria e deixa esta janela preta minimizada.
rem É refeito só se a pasta do sistema mudar de lugar (a marca guarda a pasta).
set "ATALHO_MARCA="
if exist "dados\.atalho-v2" set /p ATALHO_MARCA=<"dados\.atalho-v2"
if /i "%ATALHO_MARCA%"=="%~dp0" goto iniciar
if not exist "dados" mkdir "dados"
if exist "dados\.atalho-criado" del "dados\.atalho-criado" >nul 2>nul
set "ATALHO_ALVO=%~dp0iniciar.bat"
set "ATALHO_PASTA=%~dp0"
set "ATALHO_ICONE=%~dp0public\img\icone.ico"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference = 'Stop'; $w = New-Object -ComObject WScript.Shell; foreach ($d in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) { if (-not $d) { continue }; $a = $w.CreateShortcut((Join-Path $d 'Orcamentos BALANCAS.COM.lnk')); $a.TargetPath = $env:ATALHO_ALVO; $a.WorkingDirectory = $env:ATALHO_PASTA; $a.IconLocation = $env:ATALHO_ICONE + ',0'; $a.Description = 'Checklist tecnico e orcamentos - BALANCAS.COM'; $a.WindowStyle = 7; $a.Save() }; [IO.File]::WriteAllText((Join-Path $env:ATALHO_PASTA 'dados\.atalho-v2'), $env:ATALHO_PASTA)" >nul 2>nul
if not errorlevel 1 echo   Atalho "Orcamentos BALANCAS.COM" criado na Área de Trabalho e no menu Iniciar.

:iniciar
rem Usa o proxy do sistema (se houver) na consulta de CNPJ.
set "NODE_USE_ENV_PROXY=1"
"%NODE%" --no-warnings server.js
rem 0 = encerrado normalmente, ou o sistema já estava aberto e só a janela foi aberta.
if not errorlevel 1 exit /b 0
rem Erro: a janela pode estar minimizada (atalho), então avisa com uma mensagem na tela.
set "AVISO_TITULO=Orçamentos BALANÇAS.COM"
set "AVISO_TEXTO=O sistema não conseguiu abrir. O motivo aparece na janela preta, que fica na barra de tarefas."
powershell -NoProfile -Command "[void](New-Object -ComObject WScript.Shell).Popup($env:AVISO_TEXTO, 0, $env:AVISO_TITULO, 48 + 4096)" >nul 2>nul
pause
exit /b 1

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
