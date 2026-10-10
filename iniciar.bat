@echo off
chcp 65001 >nul
title Orçamentos BALANÇAS.COM - iniciando...
cd /d "%~dp0"
set "AVISO_TITULO=Orçamentos BALANÇAS.COM"
set "AVISO_TEXTO=O sistema não conseguiu abrir. O motivo aparece na janela preta, que fica na barra de tarefas."

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
rem -------------------------------------------------------------------
rem  Atalho "Orcamentos BALANCAS.COM" na Área de Trabalho e no menu Iniciar.
rem  Ele abre o sistema numa janela própria e deixa esta janela preta minimizada.
rem  Cada usuário do Windows guarda qual pasta do sistema rodou por último
rem  (na pasta LOCALAPPDATA dele); os atalhos só são refeitos quando ela muda.
rem  Uma cópia nova e ainda sem dados não toma o atalho de outra pasta que
rem  já tem os dados (por exemplo, uma atualização extraída em pasta errada).
rem -------------------------------------------------------------------
if not defined LOCALAPPDATA set "LOCALAPPDATA=%USERPROFILE%\AppData\Local"
set "ATALHO_MARCA_ARQ=%LOCALAPPDATA%\Orcamentos BALANCAS.COM\ultima-pasta.txt"
set "ATALHO_MARCA="
if exist "%ATALHO_MARCA_ARQ%" set /p ATALHO_MARCA=<"%ATALHO_MARCA_ARQ%"
if /i "%ATALHO_MARCA%"=="%~dp0" goto iniciar
if exist "dados\.atalho-criado" del "dados\.atalho-criado" >nul 2>nul
if exist "dados\.atalho-v2" del "dados\.atalho-v2" >nul 2>nul
set "ATALHO_ALVO=%~dp0iniciar.bat"
set "ATALHO_PASTA=%~dp0"
set "ATALHO_ICONE=%~dp0public\img\icone.ico"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference = 'Stop'; $w = New-Object -ComObject WScript.Shell; $semDados = -not (Test-Path -LiteralPath (Join-Path $env:ATALHO_PASTA 'dados\balancas.db')); $mantido = $false; foreach ($d in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) { if (-not $d) { continue }; $l = Join-Path $d 'Orcamentos BALANCAS.COM.lnk'; if ($semDados -and (Test-Path -LiteralPath $l)) { $t = $w.CreateShortcut($l).TargetPath; if ($t -and ($t -ne $env:ATALHO_ALVO) -and (Test-Path -LiteralPath (Join-Path (Split-Path -Parent $t) 'dados\balancas.db'))) { $mantido = $true; continue } }; $a = $w.CreateShortcut($l); $a.TargetPath = $env:ATALHO_ALVO; $a.WorkingDirectory = $env:ATALHO_PASTA; $a.IconLocation = $env:ATALHO_ICONE + ',0'; $a.Description = 'Checklist tecnico e orcamentos - BALANCAS.COM'; $a.WindowStyle = 7; $a.Save() }; [void][IO.Directory]::CreateDirectory((Split-Path -Parent $env:ATALHO_MARCA_ARQ)); [IO.File]::WriteAllText($env:ATALHO_MARCA_ARQ, $env:ATALHO_PASTA); if ($mantido) { exit 2 }" >nul 2>nul
if errorlevel 2 goto atalho_mantido
if not errorlevel 1 echo   Atalho "Orcamentos BALANCAS.COM" criado na Área de Trabalho e no menu Iniciar.
goto iniciar

:atalho_mantido
echo.
echo   O atalho "Orcamentos BALANCAS.COM" continua abrindo a outra pasta do
echo   sistema, que já tem os dados. Esta pasta ainda não tem dados.
echo   Para atualizar o sistema, extraia a versão nova por cima da pasta antiga.
echo.

:iniciar
rem Usa o proxy do sistema (se houver) na consulta de CNPJ.
set "NODE_USE_ENV_PROXY=1"
"%NODE%" --no-warnings server.js
rem 0 = encerrado normalmente, ou o sistema já estava aberto e só a janela foi aberta.
if "%ERRORLEVEL%"=="0" exit /b 0
set "AVISO_TEXTO=O sistema parou ou não conseguiu abrir. O motivo aparece na janela preta, que fica na barra de tarefas."
goto parar

:sem_node
echo.
echo   Esta cópia do sistema não traz o Node.js embutido e ele não está instalado.
echo   Use o pacote completo para Windows, que já vem com tudo,
echo   ou instale o Node.js versão LTS em https://nodejs.org/pt-br
echo.
goto parar

:node_antigo
echo.
echo   A versão do Node.js instalada neste computador é muito antiga.
echo   Use o pacote completo para Windows, que já vem com tudo,
echo   ou instale o Node.js versão LTS mais recente em https://nodejs.org/pt-br
echo.
goto parar

:pacote_incompleto
echo.
echo   O pacote parece incompleto: falta a pasta "node_modules".
echo   Extraia novamente o arquivo .zip completo e tente de novo.
echo.
goto parar

:falha_instalacao
echo.
echo   Não foi possível instalar os componentes. Verifique a internet e tente de novo.
echo.

:parar
rem A janela pode estar minimizada (aberta pelo atalho): avisa com uma mensagem na tela.
powershell -NoProfile -Command "[void](New-Object -ComObject WScript.Shell).Popup($env:AVISO_TEXTO, 0, $env:AVISO_TITULO, 48 + 4096)" >nul 2>nul
pause
exit /b 1
