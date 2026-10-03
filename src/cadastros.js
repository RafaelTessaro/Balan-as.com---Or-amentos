// Cadastros simples: clientes, serviços e peças.

const { db, agora } = require('./db');

function criarCadastro(tabela, campos, { busca, ordem, numericos = [] }) {
  const normalizar = (dados) => {
    const out = {};
    for (const c of campos) {
      if (dados[c] === undefined) continue;
      if (numericos.includes(c)) out[c] = Math.round((Number(dados[c]) || 0) * 100) / 100;
      else if (c === 'ativo') out[c] = dados[c] ? 1 : 0;
      else out[c] = String(dados[c] ?? '').trim();
    }
    return out;
  };

  return {
    listar({ q = '', ativos = false } = {}) {
      const where = [];
      const params = [];
      if (q) {
        where.push('(' + busca.map((c) => `${c} LIKE ?`).join(' OR ') + ')');
        busca.forEach(() => params.push(`%${q.trim()}%`));
      }
      if (ativos && campos.includes('ativo')) where.push('ativo = 1');
      return db
        .prepare(`SELECT * FROM ${tabela} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${ordem}`)
        .all(...params)
        .map((r) => ({ ...r }));
    },
    obter(id) {
      const r = db.prepare(`SELECT * FROM ${tabela} WHERE id = ?`).get(id);
      return r ? { ...r } : null;
    },
    criar(dados) {
      const d = normalizar(dados);
      if (!d.nome) throw Object.assign(new Error('Informe o nome.'), { status: 400 });
      const t = agora();
      const cols = [...Object.keys(d), 'criado_em', 'atualizado_em'];
      const r = db
        .prepare(`INSERT INTO ${tabela} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
        .run(...Object.values(d), t, t);
      return this.obter(Number(r.lastInsertRowid));
    },
    atualizar(id, dados) {
      const d = normalizar(dados);
      if (d.nome !== undefined && !d.nome) throw Object.assign(new Error('Informe o nome.'), { status: 400 });
      const cols = Object.keys(d);
      const atual = this.obter(id);
      if (!atual) return null;
      if (!cols.length) return atual;
      // No catálogo, "atualizado_em" é a data da última alteração de PREÇO
      // (como a coluna "Última atualização" da planilha); nos clientes, de qualquer campo.
      const temPreco = campos.includes('valor');
      const mudouPreco = d.valor !== undefined && d.valor !== atual.valor;
      const sets = cols.map((c) => `${c} = ?`);
      const params = Object.values(d);
      if (!temPreco || mudouPreco) {
        sets.push('atualizado_em = ?');
        params.push(agora());
      }
      db.prepare(`UPDATE ${tabela} SET ${sets.join(', ')} WHERE id = ?`).run(...params, id);
      return this.obter(id);
    },
    excluir(id) {
      return db.prepare(`DELETE FROM ${tabela} WHERE id = ?`).run(id).changes > 0;
    },
  };
}

const clientes = criarCadastro(
  'clientes',
  ['nome', 'documento', 'telefone', 'whatsapp', 'email', 'endereco', 'cidade', 'observacoes'],
  { busca: ['nome', 'documento', 'telefone', 'whatsapp', 'email', 'cidade'], ordem: 'nome COLLATE NOCASE' }
);

const servicos = criarCadastro('servicos', ['nome', 'descricao', 'valor', 'ativo'], {
  busca: ['nome', 'descricao'],
  ordem: 'nome COLLATE NOCASE, valor DESC',
  numericos: ['valor'],
});

const pecas = criarCadastro('pecas', ['nome', 'codigo', 'valor', 'ativo'], {
  busca: ['nome', 'codigo'],
  ordem: 'nome COLLATE NOCASE',
  numericos: ['valor'],
});

module.exports = { clientes, servicos, pecas };
