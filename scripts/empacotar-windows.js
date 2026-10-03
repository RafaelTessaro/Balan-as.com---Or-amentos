// Gera o pacote completo para Windows: o sistema, os componentes (node_modules)
// e o Node.js portátil oficial (node.exe), tudo dentro de um único .zip.
// Quem recebe o pacote só precisa extrair e dar dois cliques em iniciar.bat.
//
// Uso:  npm run empacotar            (Node.js padrão abaixo)
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

passo('Gerando o arquivo .zip');
fs.writeFileSync(path.join(PASTA, 'COMO INSTALAR.txt'), COMO_INSTALAR.replace(/\n/g, '\r\n'));
rodar('zip', ['-q', '-r', '-9', ZIP, NOME], { cwd: DIST });

const mb = (fs.statSync(ZIP).size / 1024 / 1024).toFixed(1);
console.log(`\n✔ Pacote pronto: ${path.relative(RAIZ, ZIP)} (${mb} MB)\n`);
