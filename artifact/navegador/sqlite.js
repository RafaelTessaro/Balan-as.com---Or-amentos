// Substitui o `node:sqlite` na versão de teste: o mesmo SQLite, compilado para
// rodar no navegador (sql.js). Só o que o sistema usa: DatabaseSync com exec()
// e prepare() → run() / get() / all().
//
// O banco do sql.js é criado antes (entrada.js) e fica em globalThis.__bancoSql.
// As instruções são preparadas a cada uso: exportar o banco para salvá-lo fecha
// e reabre a conexão, o que invalidaria instruções guardadas.

function objetoSimples(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Uint8Array);
}

function valor(v) {
  if (v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'bigint') return Number(v);
  return v;
}

// node:sqlite aceita parâmetros nomeados sem o prefixo ({ nome: 1 } para :nome,
// @nome ou $nome); no sql.js a chave precisa do prefixo.
function parametros(lista) {
  if (lista.length === 1 && objetoSimples(lista[0])) {
    const nomeados = {};
    for (const [k, v] of Object.entries(lista[0])) {
      const chave = /^[:@$]/.test(k) ? k.slice(1) : k;
      for (const p of [':', '@', '$']) nomeados[p + chave] = valor(v);
    }
    return nomeados;
  }
  return lista.map(valor);
}

class StatementSync {
  constructor(banco, sql) {
    this.banco = banco;
    this.sql = sql;
  }

  preparar(lista) {
    const st = this.banco.conexao().prepare(this.sql);
    const p = parametros(lista);
    if (Array.isArray(p) ? p.length : Object.keys(p).length) st.bind(p);
    return st;
  }

  run(...lista) {
    const st = this.preparar(lista);
    try {
      while (st.step()) {
        /* consome o resultado, se houver */
      }
    } finally {
      st.free();
    }
    const conexao = this.banco.conexao();
    const changes = conexao.getRowsModified();
    const r = conexao.exec('SELECT last_insert_rowid() AS id');
    return { changes, lastInsertRowid: r.length ? r[0].values[0][0] : 0 };
  }

  get(...lista) {
    const st = this.preparar(lista);
    try {
      return st.step() ? st.getAsObject() : undefined;
    } finally {
      st.free();
    }
  }

  all(...lista) {
    const st = this.preparar(lista);
    const linhas = [];
    try {
      while (st.step()) linhas.push(st.getAsObject());
    } finally {
      st.free();
    }
    return linhas;
  }

  iterate(...lista) {
    return this.all(...lista)[Symbol.iterator]();
  }
}

class DatabaseSync {
  constructor() {
    if (!globalThis.__bancoSql) throw new Error('Banco do navegador não iniciado.');
  }

  conexao() {
    return globalThis.__bancoSql.conexao;
  }

  exec(sql) {
    // Os PRAGMAs valem por conexão: são repetidos depois de exportar o banco.
    if (/^\s*PRAGMA\s+foreign_keys/i.test(sql)) globalThis.__bancoSql.pragmas.add(sql);
    this.conexao().exec(sql);
  }

  prepare(sql) {
    return new StatementSync(this, sql);
  }

  close() {}
}

module.exports = { DatabaseSync, StatementSync };
