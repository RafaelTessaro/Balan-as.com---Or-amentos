// Banco de dados local (SQLite nativo do Node.js, sem dependências).
// O arquivo fica em ./dados/balancas.db — faça backup dessa pasta.

const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const CONFIG_PADRAO = require('./config-padrao');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'dados');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'balancas.db'));
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

const agora = () => new Date().toISOString();

// ---------------------------------------------------------------------------
// Migrações: cada posição do array é uma versão do esquema.
// ---------------------------------------------------------------------------
const MIGRACOES = [
  `
  CREATE TABLE config (
    chave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
  );

  CREATE TABLE clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    documento TEXT DEFAULT '',
    telefone TEXT DEFAULT '',
    whatsapp TEXT DEFAULT '',
    email TEXT DEFAULT '',
    endereco TEXT DEFAULT '',
    cidade TEXT DEFAULT '',
    observacoes TEXT DEFAULT '',
    criado_em TEXT NOT NULL,
    atualizado_em TEXT NOT NULL
  );

  CREATE TABLE servicos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    descricao TEXT DEFAULT '',
    valor REAL NOT NULL DEFAULT 0,
    ativo INTEGER NOT NULL DEFAULT 1,
    criado_em TEXT NOT NULL,
    atualizado_em TEXT NOT NULL
  );

  CREATE TABLE pecas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    codigo TEXT DEFAULT '',
    valor REAL NOT NULL DEFAULT 0,
    ativo INTEGER NOT NULL DEFAULT 1,
    criado_em TEXT NOT NULL,
    atualizado_em TEXT NOT NULL
  );

  CREATE TABLE ordens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero INTEGER NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'em_analise',
    cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
    cliente_nome TEXT DEFAULT '',
    cliente_telefone TEXT DEFAULT '',
    cliente_email TEXT DEFAULT '',
    cliente_documento TEXT DEFAULT '',
    data_entrada TEXT DEFAULT '',
    tecnico TEXT DEFAULT '',
    equipamento TEXT DEFAULT '',
    numero_serie TEXT DEFAULT '',
    pam TEXT DEFAULT '',
    lacre1 TEXT DEFAULT '',
    lacre2 TEXT DEFAULT '',
    lacres_aplicados TEXT DEFAULT '',
    selo TEXT DEFAULT '',
    capacidade TEXT DEFAULT '',
    acessorios TEXT DEFAULT '[]',
    acessorios_outros TEXT DEFAULT '',
    defeito_relatado TEXT DEFAULT '',
    tensao_entrada TEXT DEFAULT '',
    tensao_saida TEXT DEFAULT '',
    checklist TEXT DEFAULT '[]',
    servico_executado TEXT DEFAULT '',
    observacoes TEXT DEFAULT '',
    data_situacao TEXT DEFAULT '',
    desconto REAL NOT NULL DEFAULT 0,
    validade_dias INTEGER NOT NULL DEFAULT 10,
    prazo_conclusao TEXT DEFAULT '',
    formas_pagamento TEXT DEFAULT '[]',
    condicoes TEXT DEFAULT '',
    garantia TEXT DEFAULT '',
    orcamento_enviado_em TEXT DEFAULT '',
    criado_em TEXT NOT NULL,
    atualizado_em TEXT NOT NULL
  );
  CREATE INDEX idx_ordens_status ON ordens(status);
  CREATE INDEX idx_ordens_cliente ON ordens(cliente_id);

  CREATE TABLE ordem_itens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ordem_id INTEGER NOT NULL REFERENCES ordens(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL CHECK (tipo IN ('servico', 'peca')),
    ref_id INTEGER,
    descricao TEXT NOT NULL,
    valor_unitario REAL NOT NULL DEFAULT 0,
    quantidade REAL NOT NULL DEFAULT 1,
    posicao INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_itens_ordem ON ordem_itens(ordem_id);

  CREATE TABLE historico (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ordem_id INTEGER NOT NULL REFERENCES ordens(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL,
    descricao TEXT NOT NULL,
    criado_em TEXT NOT NULL
  );
  CREATE INDEX idx_historico_ordem ON historico(ordem_id);
  `,
];

function migrar() {
  const versao = db.prepare('PRAGMA user_version').get().user_version;
  for (let v = versao; v < MIGRACOES.length; v++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRACOES[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    if (v === 0) popularDadosIniciais();
  }
}

// Serviços e peças que já estavam cadastrados na planilha.
function popularDadosIniciais() {
  const t = agora();
  const insServ = db.prepare(
    'INSERT INTO servicos (nome, descricao, valor, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?)'
  );
  insServ.run('Limpeza, Regulagem, Ajuste de Peso e Lacração', '', 190, t, t);
  insServ.run('Limpeza, Regulagem, Ajuste de Peso e Lacração', 'Valor reduzido', 140, t, t);
  insServ.run('Formatação', '', 120, t, t);

  const dataPlanilha = '2026-08-03T12:00:00.000Z';
  const insPeca = db.prepare(
    'INSERT INTO pecas (nome, codigo, valor, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?)'
  );
  insPeca.run('Cabeçote Térmico Toledo', '', 980, dataPlanilha, dataPlanilha);
  insPeca.run('Cabeçote Térmico Filizola', '', 300, dataPlanilha, dataPlanilha);
  insPeca.run('Teclado Prix 5 Plus Preto 32KG', '', 280, dataPlanilha, dataPlanilha);
  insPeca.run('Teclado Filizola', '', 250, dataPlanilha, dataPlanilha);
}

migrar();

// ---------------------------------------------------------------------------
// Transações
// ---------------------------------------------------------------------------
function transacao(fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Configuração (mesclada com os valores padrão)
// ---------------------------------------------------------------------------
function ehObjeto(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

function mesclar(base, extra) {
  if (!ehObjeto(base) || !ehObjeto(extra)) return extra === undefined ? base : extra;
  const out = { ...base };
  for (const k of Object.keys(extra)) out[k] = mesclar(base[k], extra[k]);
  return out;
}

function lerConfig() {
  const linhas = db.prepare('SELECT chave, valor FROM config').all();
  const salvo = {};
  for (const l of linhas) {
    try {
      salvo[l.chave] = JSON.parse(l.valor);
    } catch {
      /* ignora valor corrompido */
    }
  }
  return mesclar(structuredClone(CONFIG_PADRAO), salvo);
}

function salvarConfig(parcial) {
  const atual = lerConfig();
  const nova = mesclar(atual, parcial || {});
  const up = db.prepare(
    'INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor'
  );
  transacao(() => {
    for (const chave of Object.keys(nova)) {
      if (chave in CONFIG_PADRAO) up.run(chave, JSON.stringify(nova[chave]));
    }
  });
  return lerConfig();
}

module.exports = { db, DATA_DIR, agora, transacao, lerConfig, salvarConfig };
