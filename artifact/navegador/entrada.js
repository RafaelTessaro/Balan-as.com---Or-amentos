// Versão de teste dentro do Claude: o sistema inteiro rodando no navegador.
//
// O código do servidor (src/) é o mesmo do sistema instalado; o esbuild troca
// só o que depende do computador (node:sqlite, Express, arquivos, e-mail,
// consulta de CNPJ). Os pedidos que a tela faz para /api/... são atendidos
// aqui mesmo, sem rede, e o banco fica guardado neste navegador.

const armazenamento = require('./armazenamento.js');
const fs = require('fs');
const { instalarInterface } = require('./interface.js');

let roteador = null;
let imagens = null;
let semArmazenamento = false;

const pronto = iniciar();
pronto.catch((e) => console.error('Não foi possível iniciar a versão de teste:', e));

async function iniciar() {
  if (typeof initSqlJs !== 'function') throw new Error('O banco de dados do navegador (sql-asm.js) não carregou.');
  const SQL = await initSqlJs();
  const salvo = await armazenamento.ler('banco');
  semArmazenamento = !armazenamento.disponivel;
  const conexao = salvo ? new SQL.Database(new Uint8Array(salvo)) : new SQL.Database();
  globalThis.__bancoSql = { conexao, pragmas: new Set() };

  for (const [chave, dados] of await armazenamento.lerComPrefixo('arquivo:')) {
    fs.__carregar(chave.slice('arquivo:'.length), dados);
  }
  fs.__aoMudar((caminho, dados) =>
    dados ? armazenamento.gravar(`arquivo:${caminho}`, new Uint8Array(dados)) : armazenamento.apagar(`arquivo:${caminho}`)
  );

  // Abre o banco e aplica as migrações, como o servidor faz ao iniciar.
  roteador = require('../../src/api.js');
  imagens = require('../../src/imagens.js');
  await salvarAgora();
}

// --- Gravação do banco no navegador ------------------------------------------
let timer = null;
let fila = Promise.resolve();

function salvarAgora() {
  const b = globalThis.__bancoSql;
  if (!b) return fila;
  // Exportar fecha e reabre a conexão: os PRAGMAs são reaplicados.
  const bytes = b.conexao.export();
  for (const p of b.pragmas) b.conexao.exec(p);
  fila = fila.then(() => armazenamento.gravar('banco', bytes));
  return fila;
}

function agendarSalvar() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    salvarAgora();
  }, 400);
}

function salvarSePendente() {
  if (!timer) return;
  clearTimeout(timer);
  timer = null;
  salvarAgora();
}
addEventListener('pagehide', salvarSePendente);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') salvarSePendente();
});

// --- Pedidos para /api ----------------------------------------------------
const PREFIXO_API = /^(?:https?:\/\/[^/]+)?(?:\/[^?#]*?)?\/api(\/[^?#]*)(\?[^#]*)?/;

function ehApi(texto) {
  return typeof texto === 'string' && /^(?:https?:\/\/[^/]+)?\/api\//.test(texto);
}

async function atender(metodo, endereco, corpo) {
  await pronto;
  const m = PREFIXO_API.exec(endereco);
  const caminho = m ? m[1] : '/';
  const query = Object.fromEntries(new URLSearchParams(m && m[2] ? m[2] : ''));
  const r = await roteador.atender({ metodo, caminho, query, body: corpo });
  if (metodo !== 'GET' && r.status < 400) agendarSalvar();
  return r;
}

async function responder(metodo, endereco, corpo) {
  const r = await atender(metodo, endereco, corpo);
  return new Response(r.corpo, { status: r.status, headers: r.headers });
}

const fetchOriginal = window.fetch.bind(window);
window.fetch = function fetchTeste(entrada, opcoes = {}) {
  const texto = typeof entrada === 'string' ? entrada : entrada && entrada.url;
  if (!ehApi(texto)) return fetchOriginal(entrada, opcoes);
  const metodo = String(opcoes.method || (entrada && entrada.method) || 'GET').toUpperCase();
  let corpo;
  if (typeof opcoes.body === 'string' && opcoes.body) {
    try {
      corpo = JSON.parse(opcoes.body);
    } catch {
      corpo = opcoes.body;
    }
  }
  return responder(metodo, texto, corpo);
};

// --- Usado pela interface e pela página do checklist ---------------------------
async function arquivoDaApi(endereco) {
  const r = await atender('GET', endereco);
  if (r.status >= 400) {
    let msg = `Erro ${r.status}`;
    try {
      msg = JSON.parse(r.corpo).erro || msg;
    } catch {
      /* corpo sem JSON */
    }
    throw new Error(msg);
  }
  const disp = r.headers['content-disposition'] || '';
  const nome = /filename\*=UTF-8''([^;]+)/i.exec(disp)?.[1];
  const simples = /filename="([^"]+)"/i.exec(disp)?.[1];
  return {
    nome: nome ? decodeURIComponent(nome) : simples || 'arquivo',
    tipo: r.headers['content-type'] || 'application/octet-stream',
    dados: typeof r.corpo === 'string' ? new TextEncoder().encode(r.corpo) : new Uint8Array(r.corpo),
  };
}

async function urlImagemTimbrado(nome) {
  await pronto;
  const p = imagens.caminho(nome);
  if (!p) return null;
  return URL.createObjectURL(new Blob([fs.readFileSync(p)], { type: 'image/png' }));
}

async function apagarDadosDeTeste() {
  clearTimeout(timer);
  timer = null;
  await fila;
  await armazenamento.limparTudo();
  location.reload();
}

window.__teste = {
  pronto,
  fetch: window.fetch,
  responder,
  arquivoDaApi,
  urlImagemTimbrado,
  apagarDadosDeTeste,
  get semArmazenamento() {
    return semArmazenamento;
  },
};

instalarInterface(window.__teste);
