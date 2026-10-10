// Abre o sistema numa janela própria, como um aplicativo: sem barra de endereço
// nem abas, com o ícone e o nome do sistema na barra de tarefas (modo --app do
// Edge, Chrome ou Brave). Usa o navegador padrão do Windows quando ele permite
// esse modo, para o WhatsApp Web abrir na conta de sempre; senão usa o Edge,
// que vem com o Windows. Sem nenhum deles, abre no navegador padrão, como antes.
//
// Para abrir sempre no navegador comum: "janela": "navegador" em dados/servidor.json
// (ou a variável de ambiente JANELA=navegador).

const fs = require('fs');
const path = require('path');
const { exec, execFile, spawn } = require('child_process');

function caminhos(...relativos) {
  const bases = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA].filter(Boolean);
  return bases.flatMap((b) => relativos.map((r) => path.join(b, r)));
}

const NAVEGADORES = {
  edge: () => caminhos('Microsoft\\Edge\\Application\\msedge.exe'),
  chrome: () => caminhos('Google\\Chrome\\Application\\chrome.exe'),
  brave: () => caminhos('BraveSoftware\\Brave-Browser\\Application\\brave.exe'),
};

const ASSOCIACAO = 'HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https';

function lerProgId(chave) {
  return new Promise((resolver) => {
    execFile('reg', ['query', chave, '/v', 'ProgId'], { windowsHide: true, timeout: 3000 }, (erro, saida) => {
      resolver((!erro && /ProgId\s+REG_SZ\s+(\S+)/i.exec(String(saida))?.[1]) || '');
    });
  });
}

// Navegador padrão do usuário, pelo ProgId da associação de https
// (as versões novas do Windows 11 gravam em UserChoiceLatest).
async function navegadorPadrao() {
  const progId = (await lerProgId(`${ASSOCIACAO}\\UserChoiceLatest`)) || (await lerProgId(`${ASSOCIACAO}\\UserChoice`));
  if (/^MSEdge/i.test(progId)) return 'edge';
  if (/^ChromeHTML/i.test(progId)) return 'chrome';
  if (/^BraveHTML/i.test(progId)) return 'brave';
  return null;
}

function primeiroExistente(lista) {
  return lista.find((p) => {
    try {
      return fs.statSync(p).isFile();
    } catch {
      return false;
    }
  });
}

function abrirNoNavegador(url) {
  const cmd =
    process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd, { windowsHide: true }, () => {});
}

async function abrirJanela(url, { modo = 'aplicativo' } = {}) {
  if (process.platform !== 'win32' || modo === 'navegador') return abrirNoNavegador(url);

  const padrao = await navegadorPadrao();
  const ordem = [padrao, 'edge', 'chrome', 'brave'].filter((n, i, a) => n && a.indexOf(n) === i);
  const exe = primeiroExistente(ordem.flatMap((n) => NAVEGADORES[n]()));
  if (!exe) return abrirNoNavegador(url);

  try {
    const filho = spawn(exe, [`--app=${url}`], { detached: true, stdio: 'ignore' });
    filho.on('error', () => abrirNoNavegador(url));
    filho.unref();
  } catch {
    abrirNoNavegador(url);
  }
}

module.exports = { abrirJanela };
