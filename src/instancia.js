// Identidade desta instalação e escolha da porta do servidor.
//
// Outros sistemas da empresa rodam na mesma máquina e na mesma rede (o BC Fichas
// Control, por exemplo, usa a porta 3000). Para não abrir o sistema errado:
//   - a porta padrão é exclusiva deste sistema (4980) e fica gravada em dados/servidor.json;
//   - se a porta estiver ocupada, o sistema pergunta quem está nela (GET /api/identidade)
//     e só reaproveita a janela se for este mesmo sistema, com esta mesma pasta de dados;
//   - se for outro programa, passa para a próxima porta livre e grava a escolha.
// O arquivo dados/servidor.pid diz qual processo serve esta pasta, para reconhecer o
// próprio sistema mesmo quando ele não responde (ex.: janela preta em modo de seleção).

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFile } = require('child_process');

const ID_APP = 'balancas-orcamentos';
const NOME_APP = 'Orçamentos BALANÇAS.COM';
const PORTA_PADRAO = 4980;
const VERSAO = require('../package.json').version;

const arquivoPreferencias = (pastaDados) => path.join(pastaDados, 'servidor.json');
const arquivoPid = (pastaDados) => path.join(pastaDados, 'servidor.pid');

function portaValida(n) {
  return Number.isInteger(n) && n >= 1 && n <= 65535;
}

// dados/servidor.json: { "porta": 4980, "janela": "aplicativo" | "navegador" }
// Devolve { dados, estado: 'ok' | 'ausente' | 'invalido' }. Um arquivo com erro
// nunca é sobrescrito: a escolha do usuário fica lá para ele corrigir.
function lerArquivoPreferencias(pastaDados) {
  let texto;
  try {
    texto = fs.readFileSync(arquivoPreferencias(pastaDados), 'utf8');
  } catch (e) {
    return { dados: {}, estado: e.code === 'ENOENT' ? 'ausente' : 'invalido' };
  }
  try {
    const p = JSON.parse(texto.replace(/^﻿/, '')); // o Bloco de Notas pode gravar com BOM
    if (p && typeof p === 'object' && !Array.isArray(p)) return { dados: p, estado: 'ok' };
  } catch {
    /* JSON com erro */
  }
  return { dados: {}, estado: 'invalido' };
}

function lerPreferencias(pastaDados) {
  return lerArquivoPreferencias(pastaDados).dados;
}

function salvarPreferencias(pastaDados, mudancas) {
  const arquivo = arquivoPreferencias(pastaDados);
  const { dados, estado } = lerArquivoPreferencias(pastaDados);
  if (estado === 'invalido') return;
  const novo = { porta: PORTA_PADRAO, janela: 'aplicativo', ...dados, ...mudancas };
  try {
    fs.writeFileSync(`${arquivo}.tmp`, `${JSON.stringify(novo, null, 2)}\n`);
    fs.renameSync(`${arquivo}.tmp`, arquivo);
  } catch (e) {
    console.warn(`  Não foi possível gravar ${arquivo}: ${e.message}`);
  }
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

// Endereços IPv4 da rede local, com o nome do adaptador (Wi-Fi, Ethernet...).
// Os 169.254.x.x (sem resposta do roteador) não servem para os tablets.
function redesLocais() {
  const lista = [];
  for (const [nome, ifs] of Object.entries(os.networkInterfaces())) {
    for (const i of ifs || []) {
      if (i.family === 'IPv4' && !i.internal && !i.address.startsWith('169.254.')) lista.push({ ip: i.address, adaptador: nome });
    }
  }
  return lista;
}

function enderecosRede() {
  return redesLocais().map((r) => r.ip);
}

// Resposta de GET /api/identidade.
function identidade(pastaDados, porta) {
  const redes = redesLocais().map((r) => ({ endereco: `http://${r.ip}:${porta}`, adaptador: r.adaptador }));
  return {
    app: ID_APP,
    nome: NOME_APP,
    versao: VERSAO,
    porta,
    pasta: pastaReal(pastaDados),
    enderecos: redes.map((r) => r.endereco),
    redes,
  };
}

// Pergunta a quem está na porta se é este sistema. Devolve a identidade ou null.
// Usa um agente próprio (agent: false) para nunca passar pelo proxy configurado
// para a consulta de CNPJ (NODE_USE_ENV_PROXY).
function perguntarIdentidade(host, porta, tempo = 2500) {
  return new Promise((resolver) => {
    const req = http.get({ host, port: porta, path: '/api/identidade', agent: false, timeout: tempo }, (res) => {
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
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolver(null));
  });
}

// Uma segunda tentativa cobre o caso de este sistema estar ocupado gerando um PDF.
async function identificar(host, porta) {
  return (await perguntarIdentidade(host, porta)) || (await perguntarIdentidade(host, porta, 4000));
}

// --- Processo que serve esta pasta de dados --------------------------------
function processoVivo(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

function registrarProcesso(pastaDados, porta) {
  try {
    fs.writeFileSync(arquivoPid(pastaDados), JSON.stringify({ pid: process.pid, porta }));
  } catch {
    /* sem o arquivo, só perde a detecção de "não está respondendo" */
  }
}

function liberarProcesso(pastaDados) {
  try {
    const r = JSON.parse(fs.readFileSync(arquivoPid(pastaDados), 'utf8'));
    if (r.pid === process.pid) fs.unlinkSync(arquivoPid(pastaDados));
  } catch {
    /* nada a liberar */
  }
}

function lerRegistro(pastaDados) {
  try {
    const r = JSON.parse(fs.readFileSync(arquivoPid(pastaDados), 'utf8'));
    if (Number.isInteger(r.pid) && r.pid !== process.pid && portaValida(r.porta) && processoVivo(r.pid)) return r;
  } catch {
    /* sem registro */
  }
  return null;
}

// PID de quem escuta na porta (Windows, pelo netstat; as colunas não mudam com o
// idioma: Proto, Endereço local, Endereço externo, Estado, PID). null se não souber.
function donoDaPorta(porta) {
  return new Promise((resolver) => {
    execFile('netstat', ['-ano', '-p', 'TCP'], { windowsHide: true, timeout: 5000, maxBuffer: 8 * 1024 * 1024 }, (erro, saida) => {
      if (erro) return resolver(null);
      for (const linha of String(saida).split(/\r?\n/)) {
        const c = linha.trim().split(/\s+/);
        if (c.length >= 5 && /^TCP/i.test(c[0]) && c[1].endsWith(`:${porta}`) && /:0$/.test(c[2])) {
          return resolver(Number(c[c.length - 1]));
        }
      }
      resolver(null);
    });
  });
}

// O processo registrado em servidor.pid é mesmo este sistema? (o Windows
// reaproveita números de processo depois de um desligamento sem encerrar).
async function registroConfere(reg) {
  if (process.platform === 'win32') {
    const dono = await donoDaPorta(reg.porta);
    return dono === null ? false : dono === reg.pid;
  }
  try {
    return fs.readFileSync(`/proc/${reg.pid}/cmdline`, 'utf8').includes('node');
  } catch {
    return true; // sem /proc (macOS): confia no processo vivo
  }
}

// Este sistema (mesma pasta) está rodando nesta porta, mas não respondeu?
async function processoDestaPasta(pastaDados, porta) {
  const reg = lerRegistro(pastaDados);
  return Boolean(reg && reg.porta === porta && (await registroConfere(reg)));
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
//   { situacao: 'iniciado', porta, mudou, ocupada, avisos }
//   { situacao: 'ja-aberto', porta }                  este sistema, mesma pasta, já está rodando
//   { situacao: 'sem-resposta', porta }               este sistema, mesma pasta, rodando mas sem responder
//   { situacao: 'outra-copia', porta, pasta }         outra cópia deste sistema (outra pasta) na porta
//   { situacao: 'porta-fixa-ocupada', porta }         PORT definida no ambiente e ocupada por outro programa
//   { situacao: 'sem-porta', porta }                  nenhuma porta livre nas próximas tentativas
async function iniciarServidor(servidor, { host, pastaDados, portaAmbiente }) {
  const avisos = [];
  const fixa = portaValida(portaAmbiente) ? portaAmbiente : 0;
  const arquivo = lerArquivoPreferencias(pastaDados);
  const salva = Number(arquivo.dados.porta);
  const portaErrada = 'porta' in arquivo.dados && !portaValida(salva);
  if (arquivo.estado === 'invalido') {
    avisos.push(`O arquivo ${arquivoPreferencias(pastaDados)} tem um erro e foi ignorado. Corrija ou apague o arquivo.`);
  } else if (portaErrada) {
    avisos.push(`A porta "${arquivo.dados.porta}" de ${arquivoPreferencias(pastaDados)} não é válida (use de 1 a 65535).`);
  }
  const preferida = fixa || (portaValida(salva) ? salva : PORTA_PADRAO);
  const minha = pastaReal(pastaDados);
  // Escutando em todas as interfaces, pergunta pelo 127.0.0.1; senão, pelo endereço escolhido.
  const consulta = !host || host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host;
  let ocupada = null;

  // Já está aberto em outra porta (ex.: servidor.json com erro e a preferida estava
  // ocupada da outra vez)? O registro do processo diz onde: confirma pela identidade.
  const reg = lerRegistro(pastaDados);
  if (reg && reg.porta !== preferida) {
    const quem = await identificar(consulta, reg.porta);
    if (quem && mesmaPasta(quem.pasta, minha)) return { situacao: 'ja-aberto', porta: reg.porta };
  }

  for (let i = 0, porta = preferida; i < TENTATIVAS && porta <= 65535; i++, porta++) {
    try {
      await escutar(servidor, porta, host);
      registrarProcesso(pastaDados, porta);
      // Grava a porta usada (não mexe num arquivo que o usuário editou com erro).
      if (!fixa && !portaErrada && (porta !== salva || arquivo.estado === 'ausente')) salvarPreferencias(pastaDados, { porta });
      return { situacao: 'iniciado', porta, mudou: porta !== preferida, ocupada, avisos };
    } catch (e) {
      // EACCES: porta reservada pelo Windows (Hyper-V/WSL) ou sem permissão.
      if (e.code !== 'EADDRINUSE' && e.code !== 'EACCES') throw e;
      if (e.code === 'EADDRINUSE') {
        const quem = await identificar(consulta, porta);
        if (quem) {
          if (mesmaPasta(quem.pasta, minha)) return { situacao: 'ja-aberto', porta };
          return { situacao: 'outra-copia', porta, pasta: quem.pasta };
        }
        if (await processoDestaPasta(pastaDados, porta)) return { situacao: 'sem-resposta', porta };
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
  liberarProcesso,
};
