// Ordens de serviço: checklist técnico + serviços/peças + dados do orçamento.

const { db, agora, transacao, lerConfig } = require('./db');

const STATUS = {
  em_analise: 'Em análise',
  aguardando_aprovacao: 'Aguardando aprovação',
  aprovada: 'Aprovada',
  aguardando_peca: 'Aguardando peça',
  concluida: 'Liberada',
  entregue: 'Entregue',
  recusada: 'Recusada',
};

const CAMPOS_TEXTO = [
  'cliente_nome',
  'cliente_telefone',
  'cliente_email',
  'cliente_documento',
  'data_entrada',
  'tecnico',
  'equipamento',
  'numero_serie',
  'pam',
  'lacre1',
  'lacre2',
  'lacres_aplicados',
  'selo',
  'capacidade',
  'acessorios_outros',
  'defeito_relatado',
  'tensao_entrada',
  'tensao_saida',
  'servico_executado',
  'observacoes',
  'data_situacao',
  'prazo_conclusao',
  'condicoes',
  'garantia',
];
const CAMPOS_JSON = ['acessorios', 'checklist', 'formas_pagamento'];

const hoje = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

function somarDias(isoData, dias) {
  const d = new Date(`${isoData}T12:00:00`);
  d.setDate(d.getDate() + Number(dias || 0));
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const arred = (v) => Math.round((Number(v) || 0) * 100) / 100;

function calcularTotais(itens, desconto) {
  let servicos = 0;
  let pecas = 0;
  for (const i of itens) {
    const v = arred(i.valor_unitario * i.quantidade);
    if (i.tipo === 'servico') servicos += v;
    else pecas += v;
  }
  servicos = arred(servicos);
  pecas = arred(pecas);
  const subtotal = arred(servicos + pecas);
  const desc = Math.min(arred(desconto), subtotal);
  return { servicos, pecas, subtotal, desconto: desc, total: arred(subtotal - desc) };
}

function hidratar(linha) {
  if (!linha) return null;
  const o = { ...linha };
  for (const c of CAMPOS_JSON) {
    try {
      o[c] = JSON.parse(o[c] || '[]');
    } catch {
      o[c] = [];
    }
  }
  o.status_rotulo = STATUS[o.status] || o.status;
  return o;
}

function obterItens(ordemId) {
  return db
    .prepare('SELECT * FROM ordem_itens WHERE ordem_id = ? ORDER BY tipo DESC, posicao, id')
    .all(ordemId)
    .map((i) => ({ ...i }));
}

function obter(id) {
  const o = hidratar(db.prepare('SELECT * FROM ordens WHERE id = ?').get(id));
  if (!o) return null;
  o.itens = obterItens(o.id);
  o.totais = calcularTotais(o.itens, o.desconto);
  o.cliente = o.cliente_id
    ? { ...(db.prepare('SELECT * FROM clientes WHERE id = ?').get(o.cliente_id) || {}) }
    : null;
  o.historico = db
    .prepare('SELECT * FROM historico WHERE ordem_id = ? ORDER BY id DESC LIMIT 50')
    .all(o.id)
    .map((h) => ({ ...h }));
  return o;
}

function listar({ q = '', status = '', limite = 200 } = {}) {
  const where = [];
  const params = [];
  if (status) {
    where.push('o.status = ?');
    params.push(status);
  }
  if (q) {
    const termo = `%${q.trim()}%`;
    const numero = Number(q.replace(/\D/g, ''));
    where.push(
      `(o.cliente_nome LIKE ? OR o.equipamento LIKE ? OR o.numero_serie LIKE ? OR o.tecnico LIKE ?${
        numero ? ' OR o.numero = ?' : ''
      })`
    );
    params.push(termo, termo, termo, termo);
    if (numero) params.push(numero);
  }
  const sql = `
    SELECT o.id, o.numero, o.status, o.cliente_nome, o.equipamento, o.numero_serie,
           o.tecnico, o.data_entrada, o.atualizado_em, o.desconto, o.orcamento_enviado_em, o.validade_dias,
           COALESCE((SELECT SUM(ROUND(valor_unitario * quantidade, 2)) FROM ordem_itens WHERE ordem_id = o.id), 0) AS subtotal
    FROM ordens o
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY o.numero DESC
    LIMIT ?`;
  params.push(Number(limite) || 200);
  return db
    .prepare(sql)
    .all(...params)
    .map((r) => ({
      ...r,
      status_rotulo: STATUS[r.status] || r.status,
      total: arred(Math.max(0, r.subtotal - Math.min(r.desconto, r.subtotal))),
    }));
}

function proximoNumero() {
  const cfg = lerConfig();
  const max = db.prepare('SELECT MAX(numero) AS m FROM ordens').get().m || 0;
  return Math.max(max + 1, Number(cfg.numeracao.inicioOS) || 1);
}

function registrarHistorico(ordemId, tipo, descricao) {
  db.prepare('INSERT INTO historico (ordem_id, tipo, descricao, criado_em) VALUES (?, ?, ?, ?)').run(
    ordemId,
    tipo,
    descricao,
    agora()
  );
}

function criar(dados = {}) {
  const cfg = lerConfig();
  const t = agora();
  const base = {
    data_entrada: hoje(),
    validade_dias: cfg.orcamento.validadeDias,
    prazo_conclusao: somarDias(hoje(), cfg.orcamento.prazoPadraoDias),
    formas_pagamento: cfg.orcamento.formasPagamento,
    condicoes: cfg.orcamento.condicoes,
    garantia: cfg.orcamento.garantia,
    checklist: cfg.checklist.itens.map((item) => ({ item, entrada: '', saida: '', obs: '' })),
    acessorios: [],
    tecnico: cfg.tecnicos.length === 1 ? cfg.tecnicos[0].nome || '' : '',
    data_situacao: hoje(),
  };
  const id = transacao(() => {
    const numero = proximoNumero();
    const r = db
      .prepare(
        `INSERT INTO ordens (numero, status, data_entrada, validade_dias, prazo_conclusao, formas_pagamento,
          condicoes, garantia, checklist, acessorios, tecnico, data_situacao, criado_em, atualizado_em)
         VALUES (?, 'em_analise', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        numero,
        base.data_entrada,
        base.validade_dias,
        base.prazo_conclusao,
        JSON.stringify(base.formas_pagamento),
        base.condicoes,
        base.garantia,
        JSON.stringify(base.checklist),
        JSON.stringify(base.acessorios),
        base.tecnico,
        base.data_situacao,
        t,
        t
      );
    const novoId = Number(r.lastInsertRowid);
    registrarHistorico(novoId, 'criacao', `Ordem de serviço nº ${numero} aberta`);
    return novoId;
  });
  if (Object.keys(dados).length) return salvar(id, dados);
  return obter(id);
}

function salvar(id, dados) {
  const atual = obter(id);
  if (!atual) return null;
  const sets = [];
  const params = [];

  for (const c of CAMPOS_TEXTO) {
    if (dados[c] !== undefined) {
      sets.push(`${c} = ?`);
      params.push(String(dados[c] ?? ''));
    }
  }
  for (const c of CAMPOS_JSON) {
    if (dados[c] !== undefined) {
      sets.push(`${c} = ?`);
      params.push(JSON.stringify(Array.isArray(dados[c]) ? dados[c] : []));
    }
  }
  if (dados.cliente_id !== undefined) {
    sets.push('cliente_id = ?');
    params.push(dados.cliente_id ? Number(dados.cliente_id) : null);
  }
  if (dados.desconto !== undefined) {
    sets.push('desconto = ?');
    params.push(Math.max(0, arred(dados.desconto)));
  }
  if (dados.validade_dias !== undefined) {
    sets.push('validade_dias = ?');
    params.push(Math.max(0, parseInt(dados.validade_dias, 10) || 0));
  }
  if (dados.orcamento_enviado_em !== undefined) {
    sets.push('orcamento_enviado_em = ?');
    params.push(String(dados.orcamento_enviado_em || ''));
  }
  let mudouStatus = false;
  if (dados.status !== undefined && dados.status !== atual.status && STATUS[dados.status]) {
    sets.push('status = ?');
    params.push(dados.status);
    mudouStatus = true;
    if (dados.data_situacao === undefined) {
      sets.push('data_situacao = ?');
      params.push(hoje());
    }
  }

  transacao(() => {
    if (sets.length) {
      sets.push('atualizado_em = ?');
      params.push(agora());
      db.prepare(`UPDATE ordens SET ${sets.join(', ')} WHERE id = ?`).run(...params, id);
    }
    if (Array.isArray(dados.itens)) {
      db.prepare('DELETE FROM ordem_itens WHERE ordem_id = ?').run(id);
      const ins = db.prepare(
        `INSERT INTO ordem_itens (ordem_id, tipo, ref_id, descricao, valor_unitario, quantidade, posicao)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      );
      dados.itens.forEach((it, idx) => {
        const descricao = String(it.descricao || '').trim();
        if (!descricao) return;
        ins.run(
          id,
          it.tipo === 'peca' ? 'peca' : 'servico',
          it.ref_id ? Number(it.ref_id) : null,
          descricao,
          arred(it.valor_unitario),
          Number(it.quantidade) > 0 ? Number(it.quantidade) : 1,
          idx
        );
      });
      if (!sets.length) {
        db.prepare('UPDATE ordens SET atualizado_em = ? WHERE id = ?').run(agora(), id);
      }
    }
    if (mudouStatus) {
      registrarHistorico(id, 'status', `Situação alterada para "${STATUS[dados.status]}"`);
    }
  });
  return obter(id);
}

function excluir(id) {
  return db.prepare('DELETE FROM ordens WHERE id = ?').run(id).changes > 0;
}

function duplicar(id) {
  const o = obter(id);
  if (!o) return null;
  const copia = {};
  for (const c of [...CAMPOS_TEXTO, ...CAMPOS_JSON]) copia[c] = o[c];
  copia.cliente_id = o.cliente_id;
  copia.desconto = o.desconto;
  copia.validade_dias = o.validade_dias;
  copia.data_entrada = hoje();
  copia.data_situacao = hoje();
  copia.checklist = (o.checklist || []).map((c) => ({ item: c.item, entrada: '', saida: '', obs: '' }));
  copia.itens = o.itens.map(({ tipo, ref_id, descricao, valor_unitario, quantidade }) => ({
    tipo,
    ref_id,
    descricao,
    valor_unitario,
    quantidade,
  }));
  const nova = criar(copia);
  registrarHistorico(nova.id, 'criacao', `Copiada da OS nº ${o.numero}`);
  return obter(nova.id);
}

function marcarOrcamentoEnviado(id, canal, destino) {
  const o = obter(id);
  if (!o) return null;
  const dados = { orcamento_enviado_em: agora() };
  if (o.status === 'em_analise') dados.status = 'aguardando_aprovacao';
  salvar(id, dados);
  registrarHistorico(id, 'envio', `Orçamento enviado por ${canal}${destino ? ` para ${destino}` : ''}`);
  return obter(id);
}

function resumo() {
  const porStatus = {};
  for (const k of Object.keys(STATUS)) porStatus[k] = 0;
  for (const r of db.prepare('SELECT status, COUNT(*) AS n FROM ordens GROUP BY status').all()) {
    porStatus[r.status] = r.n;
  }
  const inicioMes = hoje().slice(0, 8) + '01';
  const doMes = db
    .prepare(
      `SELECT o.id, o.desconto, o.status,
         COALESCE((SELECT SUM(ROUND(valor_unitario * quantidade, 2)) FROM ordem_itens WHERE ordem_id = o.id), 0) AS subtotal
       FROM ordens o WHERE o.data_entrada >= ?`
    )
    .all(inicioMes);
  let orcadoMes = 0;
  let aprovadoMes = 0;
  for (const r of doMes) {
    const total = Math.max(0, r.subtotal - Math.min(r.desconto, r.subtotal));
    orcadoMes += total;
    if (['aprovada', 'aguardando_peca', 'concluida', 'entregue'].includes(r.status)) aprovadoMes += total;
  }
  return {
    porStatus,
    abertasMes: doMes.length,
    orcadoMes: arred(orcadoMes),
    aprovadoMes: arred(aprovadoMes),
    totalOrdens: db.prepare('SELECT COUNT(*) AS n FROM ordens').get().n,
    recentes: listar({ limite: 8 }),
  };
}

module.exports = {
  STATUS,
  obter,
  listar,
  criar,
  salvar,
  excluir,
  duplicar,
  marcarOrcamentoEnviado,
  calcularTotais,
  resumo,
  somarDias,
  hoje,
};
