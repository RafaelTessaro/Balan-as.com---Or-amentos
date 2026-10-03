// Gera o pacote completo para Windows: o sistema, os componentes (node_modules)
// e o Node.js portátil oficial (node.exe), tudo dentro de um único .zip.
// Quem recebe o pacote só precisa extrair e dar dois cliques em iniciar.bat.
//
// Uso:  npm run empacotar                 um único .zip (cerca de 46 MB)
//       npm run empacotar -- --dividir     dois .zip menores que 30 MB, para enviar
//                                          por e-mail ou chat; o iniciar.bat junta
//                                          as partes do Node.js na primeira vez
//       NODE_VERSAO=v24.21.0 npm run empacotar
//
// Requer git, npm, curl, unzip e zip (Linux/macOS). O resultado fica em dist/.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const NODE_VERSAO = process.env.NODE_VERSAO || 'v24.21.0';
const NOME = 'BalancasOrcamentos';
const RAIZ = path.join(__dirname, '..');
const DIST = path.join(RAIZ, 'dist');
const CACHE = path.join(DIST, 'cache');
const PASTA = path.join(DIST, NOME);
const ZIP = path.join(DIST, `${NOME}-windows.zip`);
const DIVIDIR = process.argv.includes('--dividir');
const ZIP_PARTE1 = path.join(DIST, `${NOME}-parte1.zip`);
const ZIP_PARTE2 = path.join(DIST, `${NOME}-parte2.zip`);
const LIMITE_PARTE = 29 * 1024 * 1024; // abaixo dos limites comuns de anexo (30 MB)
const ARQ_NODE = `node-${NODE_VERSAO}-win-x64.zip`;
const URL_NODE = `https://nodejs.org/dist/${NODE_VERSAO}`;

const rodar = (cmd, args, opcoes = {}) => execFileSync(cmd, args, { stdio: 'inherit', ...opcoes });
const passo = (t) => console.log(`\n▸ ${t}`);

function baixar(url, destino) {
  if (fs.existsSync(destino)) return;
  rodar('curl', ['-fsSL', '--retry', '3', '-o', `${destino}.parcial`, url]);
  fs.renameSync(`${destino}.parcial`, destino);
}

function sha256(arquivo) {
  return crypto.createHash('sha256').update(fs.readFileSync(arquivo)).digest('hex');
}

const COMO_INSTALAR_PARTES = `BALANÇAS.COM - Checklist e Orçamentos
======================================

Este pacote veio em 2 arquivos e já traz tudo o que o sistema precisa.
Não é preciso instalar nem baixar mais nada.

COMO USAR (Windows 10 ou 11, 64 bits)

1. Baixe os dois arquivos para a pasta Downloads:
   BalancasOrcamentos-parte1.zip e BalancasOrcamentos-parte2.zip
2. Clique com o botão direito em "BalancasOrcamentos-parte1.zip" e escolha "Extrair tudo...".
   Extraia para uma pasta fixa, por exemplo C:\\BalancasOrcamentos.
   (A parte 2 não precisa ser extraída: deixe o arquivo na pasta Downloads.)
3. Abra a pasta extraída e dê dois cliques em "iniciar.bat".
   Na primeira vez ele junta as duas partes sozinho (alguns segundos).
   Se não achar a parte 2, copie o arquivo BalancasOrcamentos-parte2.zip
   para dentro da pasta do sistema e rode de novo.
   Se o Windows mostrar um aviso de segurança, clique em "Mais informações"
   e depois em "Executar assim mesmo".
4. O navegador abre sozinho em http://localhost:3000.
   Deixe a janela preta aberta enquanto usa o sistema.

Na primeira vez é criado o atalho "Orcamentos BALANCAS.COM" na Área de Trabalho.
Tablets na mesma rede Wi-Fi acessam pelo endereço "Na rede local" mostrado na janela.

Os dados ficam na pasta "dados" (criada automaticamente). Faça backup dela.
Internet só é necessária para enviar orçamentos por e-mail ou WhatsApp.

Conteúdo da pasta "runtime": Node.js ${NODE_VERSAO} para Windows (https://nodejs.org),
distribuído sem alterações, sob a licença em runtime/LICENSE.
`;

// Junta as duas partes do node.exe e confere a soma SHA-256 oficial.
const montarBat = (esperado) => `@echo off
rem Junta as duas partes do Node.js portátil (pacote enviado em 2 arquivos).
pushd "%~dp0"
set "ESPERADO=${esperado}"
if exist "node.exe.parte2" goto juntar
echo.
echo   Procurando a segunda parte do sistema...
set "ZIP2="
for %%F in ("..\\${NOME}-parte2*.zip" "..\\..\\${NOME}-parte2*.zip" "..\\..\\..\\${NOME}-parte2*.zip" "%USERPROFILE%\\Downloads\\${NOME}-parte2*.zip") do if exist "%%~F" set "ZIP2=%%~F"
for %%F in ("..\\..\\${NOME}-parte2\\node.exe.parte2" "..\\..\\..\\${NOME}-parte2\\node.exe.parte2" "%USERPROFILE%\\Downloads\\${NOME}-parte2\\node.exe.parte2") do if exist "%%~F" copy /y "%%~F" "node.exe.parte2" >nul
if exist "node.exe.parte2" goto juntar
if not defined ZIP2 goto faltando
echo   Extraindo: %ZIP2%
tar -xf "%ZIP2%" 2>nul
if not exist "node.exe.parte2" powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath $env:ZIP2 -DestinationPath . -Force" >nul 2>nul
if not exist "node.exe.parte2" goto faltando

:juntar
echo   Juntando as partes do Node.js...
copy /b "node.exe.parte1" + "node.exe.parte2" "node.exe" >nul
certutil -hashfile "node.exe" SHA256 | findstr /i "%ESPERADO%" >nul
if errorlevel 1 goto corrompido
del "node.exe.parte1" "node.exe.parte2" >nul 2>nul
echo   Pronto.
popd
exit /b 0

:faltando
echo.
echo   Falta a segunda parte do sistema: ${NOME}-parte2.zip
echo   Copie esse arquivo para dentro desta pasta:
echo   %CD%
echo   e dê dois cliques em iniciar.bat novamente.
echo.
popd
exit /b 1

:corrompido
del "node.exe" >nul 2>nul
del "node.exe.parte2" >nul 2>nul
echo.
echo   A segunda parte parece estar corrompida ou incompleta.
echo   Baixe novamente o arquivo ${NOME}-parte2.zip e tente de novo.
echo.
popd
exit /b 1
`;

const COMO_INSTALAR = `BALANÇAS.COM - Checklist e Orçamentos
======================================

Este pacote já vem com tudo o que o sistema precisa.
Não é preciso instalar nem baixar mais nada.

COMO USAR (Windows 10 ou 11, 64 bits)

1. Clique com o botão direito no arquivo .zip e escolha "Extrair tudo...".
   Extraia para uma pasta fixa, por exemplo C:\\BalancasOrcamentos.
   Não rode o sistema de dentro do .zip.
2. Abra a pasta extraída e dê dois cliques em "iniciar.bat".
   Se o Windows mostrar um aviso de segurança, clique em "Mais informações"
   e depois em "Executar assim mesmo".
3. O navegador abre sozinho em http://localhost:3000.
   Deixe a janela preta aberta enquanto usa o sistema.

Na primeira vez é criado o atalho "Orcamentos BALANCAS.COM" na Área de Trabalho.
Tablets na mesma rede Wi-Fi acessam pelo endereço "Na rede local" mostrado na janela.

Os dados ficam na pasta "dados" (criada automaticamente). Faça backup dela.
Para atualizar o sistema, extraia a versão nova por cima da pasta antiga:
a pasta "dados" é mantida.

Internet só é necessária para enviar orçamentos por e-mail ou WhatsApp.

Conteúdo da pasta "runtime": Node.js ${NODE_VERSAO} para Windows (https://nodejs.org),
distribuído sem alterações, sob a licença em runtime/LICENSE.
`;

// ---------------------------------------------------------------------------

passo('Conferindo o repositório');
const pendentes = execFileSync('git', ['status', '--porcelain'], { cwd: RAIZ, encoding: 'utf8' }).trim();
if (pendentes) {
  console.log('  Atenção: há alterações não salvas no git. O pacote usa a última versão commitada (HEAD).');
}

passo(`Preparando ${path.relative(RAIZ, PASTA)}`);
fs.rmSync(PASTA, { recursive: true, force: true });
fs.rmSync(ZIP, { force: true });
fs.mkdirSync(PASTA, { recursive: true });
fs.mkdirSync(CACHE, { recursive: true });
const tar = path.join(DIST, 'fonte.tar');
rodar('git', ['archive', '--format=tar', '-o', tar, 'HEAD'], { cwd: RAIZ });
rodar('tar', ['-xf', tar, '-C', PASTA]);
fs.rmSync(tar);

passo('Instalando os componentes (somente produção)');
rodar('npm', ['ci', '--omit=dev', '--no-audit', '--no-fund'], { cwd: PASTA });
const nativos = execFileSync('find', ['node_modules', '-name', '*.node'], { cwd: PASTA, encoding: 'utf8' }).trim();
if (nativos) {
  throw new Error(`Há módulos nativos que não funcionariam no Windows:\n${nativos}`);
}

passo(`Baixando o Node.js ${NODE_VERSAO} para Windows (x64)`);
const zipNode = path.join(CACHE, ARQ_NODE);
const somas = path.join(CACHE, `SHASUMS256-${NODE_VERSAO}.txt`);
baixar(`${URL_NODE}/SHASUMS256.txt`, somas);
baixar(`${URL_NODE}/${ARQ_NODE}`, zipNode);
const esperado = fs
  .readFileSync(somas, 'utf8')
  .split('\n')
  .find((l) => l.trim().endsWith(`  ${ARQ_NODE}`))
  ?.split(/\s+/)[0];
const obtido = sha256(zipNode);
if (!esperado || esperado !== obtido) {
  fs.rmSync(zipNode, { force: true });
  throw new Error(`Soma SHA-256 do ${ARQ_NODE} não confere (esperado ${esperado}, obtido ${obtido}).`);
}
console.log(`  SHA-256 conferido: ${obtido}`);

const runtime = path.join(PASTA, 'runtime');
fs.mkdirSync(runtime);
const base = ARQ_NODE.replace(/\.zip$/, '');
rodar('unzip', ['-q', '-j', zipNode, `${base}/node.exe`, `${base}/LICENSE`, '-d', runtime]);

const crlf = (t) => t.replace(/\n/g, '\r\n');
const mb = (arq) => `${(fs.statSync(arq).size / 1024 / 1024).toFixed(1)} MB`;

if (!DIVIDIR) {
  passo('Gerando o arquivo .zip');
  fs.writeFileSync(path.join(PASTA, 'COMO INSTALAR.txt'), crlf(COMO_INSTALAR));
  rodar('zip', ['-q', '-r', '-9', ZIP, NOME], { cwd: DIST });
  console.log(`\n✔ Pacote pronto: ${path.relative(RAIZ, ZIP)} (${mb(ZIP)})\n`);
} else {
  passo('Dividindo o Node.js em duas partes');
  const exe = path.join(runtime, 'node.exe');
  const bytes = fs.readFileSync(exe);
  const hash = sha256(exe);
  const corte = Math.floor(bytes.length * 0.4);
  const pastaParte2 = path.join(DIST, 'parte2');
  fs.rmSync(pastaParte2, { recursive: true, force: true });
  fs.mkdirSync(pastaParte2);
  fs.writeFileSync(path.join(runtime, 'node.exe.parte1'), bytes.subarray(0, corte));
  fs.writeFileSync(path.join(pastaParte2, 'node.exe.parte2'), bytes.subarray(corte));
  fs.rmSync(exe);
  fs.writeFileSync(path.join(runtime, 'montar.bat'), crlf(montarBat(hash)));
  fs.writeFileSync(path.join(PASTA, 'COMO INSTALAR.txt'), crlf(COMO_INSTALAR_PARTES));

  passo('Gerando os arquivos .zip');
  fs.rmSync(ZIP_PARTE1, { force: true });
  fs.rmSync(ZIP_PARTE2, { force: true });
  rodar('zip', ['-q', '-r', '-9', ZIP_PARTE1, NOME], { cwd: DIST });
  rodar('zip', ['-q', '-9', ZIP_PARTE2, 'node.exe.parte2'], { cwd: pastaParte2 });
  fs.rmSync(pastaParte2, { recursive: true, force: true });
  for (const z of [ZIP_PARTE1, ZIP_PARTE2]) {
    if (fs.statSync(z).size > LIMITE_PARTE) console.log(`  Atenção: ${path.basename(z)} passou de 29 MB.`);
  }
  console.log(`\n✔ Pacote pronto em 2 partes:`);
  console.log(`  ${path.relative(RAIZ, ZIP_PARTE1)} (${mb(ZIP_PARTE1)})`);
  console.log(`  ${path.relative(RAIZ, ZIP_PARTE2)} (${mb(ZIP_PARTE2)})\n`);
}
