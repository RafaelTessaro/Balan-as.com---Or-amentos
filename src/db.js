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

  // v2: cliente pessoa física/jurídica, nº da OS vindo do sistema principal,
  // lacres 1 e 2 de entrada e de saída, e nome do serviço que sai na OS.
  () => {
    db.exec(`
      ALTER TABLE clientes ADD COLUMN tipo TEXT NOT NULL DEFAULT 'PJ';
      ALTER TABLE servicos ADD COLUMN nome_os TEXT DEFAULT '';
      ALTER TABLE ordem_itens ADD COLUMN nome_interno TEXT DEFAULT '';
      ALTER TABLE ordens ADD COLUMN numero_os TEXT DEFAULT '';
      ALTER TABLE ordens ADD COLUMN cliente_tipo TEXT DEFAULT '';
      ALTER TABLE ordens ADD COLUMN cliente_cidade TEXT DEFAULT '';
      ALTER TABLE ordens ADD COLUMN lacre_saida1 TEXT DEFAULT '';
      ALTER TABLE ordens ADD COLUMN lacre_saida2 TEXT DEFAULT '';
    `);
    const digitos = (v) => String(v || '').replace(/[^0-9A-Za-z]/g, '');
    for (const c of db.prepare('SELECT id, documento FROM clientes').all()) {
      db.prepare('UPDATE clientes SET tipo = ? WHERE id = ?').run(digitos(c.documento).length === 11 ? 'PF' : 'PJ', c.id);
    }
    // "Lacres aplicados" (texto livre) passa a ser lacre 1 e 2 de saída.
    for (const o of db.prepare("SELECT id, lacres_aplicados FROM ordens WHERE lacres_aplicados <> ''").all()) {
      const [l1 = '', l2 = ''] = String(o.lacres_aplicados).split(/\s*[,;/]\s*|\s+e\s+/).filter(Boolean);
      db.prepare('UPDATE ordens SET lacre_saida1 = ?, lacre_saida2 = ? WHERE id = ?').run(l1, l2, o.id);
    }
    db.exec(`
      UPDATE ordens SET cliente_cidade = COALESCE((SELECT cidade FROM clientes c WHERE c.id = ordens.cliente_id), '');
      UPDATE ordens SET cliente_tipo = COALESCE((SELECT tipo FROM clientes c WHERE c.id = ordens.cliente_id), '');
    `);
    // Mão de obra por tipo de balança: nomes internos diferentes, mesmo nome na OS.
    const existe = db.prepare('SELECT 1 FROM servicos WHERE nome = ?');
    const t = agora();
    for (const [nome, valor] of MAO_DE_OBRA) {
      if (!existe.get(nome)) {
        db.prepare('INSERT INTO servicos (nome, nome_os, valor, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?)').run(
          nome,
          NOME_OS_MAO_DE_OBRA,
          valor,
          t,
          t
        );
      }
    }
  },
];

const NOME_OS_MAO_DE_OBRA = 'Limpeza, regulagem, calibração e lacração';
const MAO_DE_OBRA = [
  ['Mão de obra – balança com compressor', 190],
  ['Mão de obra – balança sem compressor', 150],
  ['Mão de obra – PET', 120],
];

function migrar() {
  const versao = db.prepare('PRAGMA user_version').get().user_version;
  for (let v = versao; v < MIGRACOES.length; v++) {
    db.exec('BEGIN');
    try {
      if (typeof MIGRACOES[v] === 'function') MIGRACOES[v]();
      else db.exec(MIGRACOES[v]);
      if (v === 0) popularDadosIniciais();
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
}

// Peças da planilha original e o serviço de formatação. A mão de obra por
// tipo de balança é criada pela migração v2.
function popularDadosIniciais() {
  const t = agora();
  db.prepare('INSERT INTO servicos (nome, descricao, valor, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?)').run(
    'Formatação',
    '',
    120,
    t,
    t
  );

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
