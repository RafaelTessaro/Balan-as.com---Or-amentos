// Identidade desta instalação e escolha da porta do servidor.
//
// Outros sistemas da empresa rodam na mesma máquina e na mesma rede (o BC Fichas
// Control, por exemplo, usa a porta 3000). Para não abrir o sistema errado:
//   - a porta padrão é exclusiva deste sistema (4980) e fica gravada em dados/servidor.json;
//   - se a porta estiver ocupada, o sistema pergunta quem está nela (GET /api/identidade)
//     e só reaproveita a janela se for este mesmo sistema, com esta mesma pasta de dados;
//   - se for outro programa, passa para a próxima porta livre e grava a escolha.

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const ID_APP = 'balancas-orcamentos';
const NOME_APP = 'Orçamentos BALANÇAS.COM';
const PORTA_PADRAO = 4980;
const VERSAO = require('../package.json').version;

function arquivoPreferencias(pastaDados) {
  return path.join(pastaDados, 'servidor.json');
}

// dados/servidor.json: { "porta": 4980, "janela": "aplicativo" | "navegador" }
function lerPreferencias(pastaDados) {
  try {
    const p = JSON.parse(fs.readFileSync(arquivoPreferencias(pastaDados), 'utf8'));
    return p && typeof p === 'object' && !Array.isArray(p) ? p : {};
  } catch {
    return {};
  }
}

function salvarPreferencias(pastaDados, mudancas) {
  const arquivo = arquivoPreferencias(pastaDados);
  const novo = { ...lerPreferencias(pastaDados), ...mudancas };
  try {
    fs.writeFileSync(`${arquivo}.tmp`, `${JSON.stringify(novo, null, 2)}\n`);
    fs.renameSync(`${arquivo}.tmp`, arquivo);
  } catch (e) {
    console.warn(`  Não foi possível gravar ${arquivo}: ${e.message}`);
  }
}

function portaValida(n) {
  return Number.isInteger(n) && n >= 1024 && n <= 65535;
}

// Caminho real da pasta de dados, para comparar duas instalações.
function pastaReal(pasta) {
  try {
    return fs.realpathSync.native(pasta);
  } catch {
    return path.resolve(pasta);
  }
}

function mesmaPasta(a, b) {
  if (!a || !b) return false;
  const x = path.resolve(a);
  const y = path.resolve(b);
  return process.platform === 'win32' ? x.toLowerCase() === y.toLowerCase() : x === y;
}

function enderecosRede() {
  const lista = [];
  for (const ifs of Object.values(os.networkInterfaces())) {
    for (const i of ifs || []) {
      if (i.family === 'IPv4' && !i.internal) lista.push(i.address);
    }
  }
  return lista;
}

// Resposta de GET /api/identidade.
function identidade(pastaDados, porta) {
  return {
    app: ID_APP,
    nome: NOME_APP,
    versao: VERSAO,
    porta,
    pasta: pastaReal(pastaDados),
    enderecos: enderecosRede().map((ip) => `http://${ip}:${porta}`),
  };
}

// Pergunta a quem está na porta se é este sistema. Devolve a identidade ou null.
// Usa um agente próprio (agent: false) para nunca passar pelo proxy configurado
// para a consulta de CNPJ (NODE_USE_ENV_PROXY).
function perguntarIdentidade(porta, tempo = 2500) {
  return new Promise((resolver) => {
    const req = http.get(
      { host: '127.0.0.1', port: porta, path: '/api/identidade', agent: false, timeout: tempo },
      (res) => {
        let corpo = '';
        res.setEncoding('utf8');
        res.on('data', (p) => {
          corpo += p;
          if (corpo.length > 64 * 1024) req.destroy();
        });
        res.on('end', () => {
          try {
            const j = JSON.parse(corpo);
            resolver(res.statusCode === 200 && j && j.app === ID_APP ? j : null);
          } catch {
            resolver(null);
          }
        });
        res.on('error', () => resolver(null));
      }
    );
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolver(null));
  });
}

// Uma segunda tentativa cobre o caso de este sistema estar ocupado gerando um PDF.
async function identificar(porta) {
  return (await perguntarIdentidade(porta)) || (await perguntarIdentidade(porta, 4000));
}

function escutar(servidor, porta, host) {
  return new Promise((resolver, rejeitar) => {
    const falhou = (e) => {
      servidor.off('listening', ouviu);
      rejeitar(e);
    };
    const ouviu = () => {
      servidor.off('error', falhou);
      resolver();
    };
    servidor.once('error', falhou);
    servidor.once('listening', ouviu);
    servidor.listen(porta, host);
  });
}

const TENTATIVAS = 30;

// Coloca o servidor no ar. Resultados:
//   { situacao: 'iniciado', porta, mudou, ocupada }
//   { situacao: 'ja-aberto', porta }                  este sistema, mesma pasta, já está rodando
//   { situacao: 'outra-copia', porta, pasta }         outra cópia deste sistema (outra pasta) na porta
//   { situacao: 'porta-fixa-ocupada', porta }         PORT definida no ambiente e ocupada por outro programa
//   { situacao: 'sem-porta', porta }                  nenhuma porta livre nas próximas tentativas
async function iniciarServidor(servidor, { host, pastaDados, portaAmbiente }) {
  const fixa = portaValida(portaAmbiente) ? portaAmbiente : 0;
  const salva = Number(lerPreferencias(pastaDados).porta);
  const preferida = fixa || (portaValida(salva) ? salva : PORTA_PADRAO);
  const minha = pastaReal(pastaDados);
  let ocupada = null;

  for (let i = 0, porta = preferida; i < TENTATIVAS && porta <= 65535; i++, porta++) {
    try {
      await escutar(servidor, porta, host);
      if (!fixa && porta !== salva) salvarPreferencias(pastaDados, { porta });
      return { situacao: 'iniciado', porta, mudou: porta !== preferida, ocupada };
    } catch (e) {
      // EACCES: porta reservada pelo Windows (Hyper-V/WSL) ou sem permissão.
      if (e.code !== 'EADDRINUSE' && e.code !== 'EACCES') throw e;
      if (e.code === 'EADDRINUSE') {
        const quem = await identificar(porta);
        if (quem) {
          if (mesmaPasta(quem.pasta, minha)) return { situacao: 'ja-aberto', porta };
          return { situacao: 'outra-copia', porta, pasta: quem.pasta };
        }
      }
      if (fixa) return { situacao: 'porta-fixa-ocupada', porta };
      if (ocupada === null) ocupada = porta;
    }
  }
  return { situacao: 'sem-porta', porta: preferida };
}

module.exports = {
  ID_APP,
  NOME_APP,
  PORTA_PADRAO,
  VERSAO,
  lerPreferencias,
  salvarPreferencias,
  enderecosRede,
  identidade,
  identificar,
  mesmaPasta,
  iniciarServidor,
};
