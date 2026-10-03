// API REST usada pela interface (tudo em /api).

const express = require('express');
const { db, lerConfig, salvarConfig, transacao } = require('./db');
const ordens = require('./ordens');
const cadastros = require('./cadastros');
const imagens = require('./imagens');
const email = require('./email');
const modelos = require('./modelos');
const { gerarOrcamentoPdf } = require('./pdf/orcamento');
const { consultarCNPJ } = require('./cnpj');

const api = express.Router();

// Pequeno utilitário: captura erros de funções assíncronas.
const rota = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const naoEncontrado = (res, msg = 'Registro não encontrado.') => res.status(404).json({ erro: msg });

// ---------------------------------------------------------------------------
// Configurações
// ---------------------------------------------------------------------------
function configPublica() {
  const cfg = lerConfig();
  // A senha do e-mail nunca volta para o navegador.
  cfg.email = { ...cfg.email, senha: '', senhaDefinida: Boolean(cfg.email.senha) };
  cfg.imagens = {
    cabecalhoPersonalizado: imagens.ehPersonalizado('cabecalho'),
    rodapePersonalizado: imagens.ehPersonalizado('rodape'),
  };
  cfg.status = ordens.STATUS;
  return cfg;
}

api.get('/config', (req, res) => res.json(configPublica()));

api.put('/config', (req, res) => {
  const dados = { ...req.body };
  delete dados.imagens;
  delete dados.status;
  if (dados.email) {
    dados.email = { ...dados.email };
    delete dados.email.senhaDefinida;
    // Senha em branco = manter a atual.
    if (!dados.email.senha) delete dados.email.senha;
  }
  salvarConfig(dados);
  res.json(configPublica());
});

api.put('/config/imagens/:nome', (req, res) => {
  imagens.salvar(req.params.nome, req.body.dataUrl);
  res.json(configPublica());
});

api.delete('/config/imagens/:nome', (req, res) => {
  imagens.restaurar(req.params.nome);
  res.json(configPublica());
});

api.post(
  '/config/email/testar',
  rota(async (req, res) => {
    const cfg = lerConfig();
    const dados = { ...cfg.email, ...(req.body || {}) };
    if (!req.body?.senha) dados.senha = cfg.email.senha;
    await email.testar(dados);
    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------------------
// Consulta de CNPJ (preenche razão social e cidade no cadastro de clientes)
// ---------------------------------------------------------------------------
api.get(
  '/cnpj/:cnpj',
  rota(async (req, res) => res.json(await consultarCNPJ(req.params.cnpj)))
);

// ---------------------------------------------------------------------------
// Painel
// ---------------------------------------------------------------------------
api.get('/resumo', (req, res) => res.json(ordens.resumo()));

// ---------------------------------------------------------------------------
// Cadastros (clientes, serviços, peças)
// ---------------------------------------------------------------------------
for (const [nome, repo] of Object.entries(cadastros)) {
  api.get(`/${nome}`, (req, res) =>
    res.json(repo.listar({ q: req.query.q || '', ativos: req.query.ativos === '1' }))
  );
  api.get(`/${nome}/:id`, (req, res) => {
    const r = repo.obter(Number(req.params.id));
    return r ? res.json(r) : naoEncontrado(res);
  });
  api.post(`/${nome}`, (req, res) => res.status(201).json(repo.criar(req.body || {})));
  api.put(`/${nome}/:id`, (req, res) => {
    const r = repo.atualizar(Number(req.params.id), req.body || {});
    return r ? res.json(r) : naoEncontrado(res);
  });
  api.delete(`/${nome}/:id`, (req, res) =>
    repo.excluir(Number(req.params.id)) ? res.json({ ok: true }) : naoEncontrado(res)
  );
}

// ---------------------------------------------------------------------------
// Ordens de serviço
// ---------------------------------------------------------------------------
api.get('/ordens', (req, res) =>
  res.json(ordens.listar({ q: req.query.q || '', status: req.query.status || '', limite: req.query.limite }))
);

api.post('/ordens', (req, res) => res.status(201).json(ordens.criar(req.body || {})));

api.get('/ordens/:id', (req, res) => {
  const o = ordens.obter(Number(req.params.id));
  return o ? res.json(o) : naoEncontrado(res, 'Ordem de serviço não encontrada.');
});

api.put('/ordens/:id', (req, res) => {
  const o = ordens.salvar(Number(req.params.id), req.body || {});
  return o ? res.json(o) : naoEncontrado(res, 'Ordem de serviço não encontrada.');
});

api.delete('/ordens/:id', (req, res) =>
  ordens.excluir(Number(req.params.id)) ? res.json({ ok: true }) : naoEncontrado(res)
);

api.post('/ordens/:id/duplicar', (req, res) => {
  const o = ordens.duplicar(Number(req.params.id));
  return o ? res.status(201).json(o) : naoEncontrado(res);
});

async function pdfDaOrdem(id) {
  const o = ordens.obter(id);
  if (!o) return null;
  const cfg = lerConfig();
  const paraPdf = { ...o, numero: ordens.identificacao(o).replace(' (interno)', '') };
  const buffer = await gerarOrcamentoPdf(paraPdf, cfg, {
    cabecalho: imagens.caminho('cabecalho'),
    rodape: imagens.caminho('rodape'),
  });
  return { ordem: o, cfg, buffer, nome: modelos.nomeArquivoPdf(o) };
}

api.get(
  '/ordens/:id/orcamento.pdf',
  rota(async (req, res) => {
    const r = await pdfDaOrdem(Number(req.params.id));
    if (!r) return naoEncontrado(res);
    const disp = req.query.baixar === '1' ? 'attachment' : 'inline';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader(
      'Content-Disposition',
      `${disp}; filename="${r.nome.replace(/[^\x20-\x7e]/g, '')}"; filename*=UTF-8''${encodeURIComponent(r.nome)}`
    );
    res.send(Buffer.from(r.buffer));
  })
);

// Textos prontos para e-mail e WhatsApp, já com os dados da OS.
api.get('/ordens/:id/mensagens', (req, res) => {
  const o = ordens.obter(Number(req.params.id));
  if (!o) return naoEncontrado(res);
  const cfg = lerConfig();
  const telefone = o.cliente?.whatsapp || o.cliente_telefone || o.cliente?.telefone || '';
  res.json({
    email: {
      para: o.cliente_email || o.cliente?.email || '',
      assunto: modelos.preencher(cfg.email.assunto, o, cfg),
      mensagem: modelos.preencher(cfg.email.mensagem, o, cfg),
      configurado: Boolean(cfg.email.host && cfg.email.usuario),
    },
    whatsapp: {
      telefone,
      numero: modelos.telefoneWhatsapp(telefone),
      mensagem: modelos.preencher(cfg.whatsapp.mensagem, o, cfg),
    },
    arquivo: modelos.nomeArquivoPdf(o),
  });
});

api.post(
  '/ordens/:id/enviar-email',
  rota(async (req, res) => {
    const { para, assunto, mensagem } = req.body || {};
    if (!para || !/^[^@\s]+@[^@\s]+\.[^@\s]+/.test(String(para).split(',')[0].trim())) {
      return res.status(400).json({ erro: 'Informe um e-mail válido para o cliente.' });
    }
    const r = await pdfDaOrdem(Number(req.params.id));
    if (!r) return naoEncontrado(res);
    await email.enviar(r.cfg.email, {
      para,
      assunto: assunto || `Orçamento nº ${r.ordem.numero}`,
      mensagem: mensagem || '',
      anexos: [{ filename: r.nome, content: Buffer.from(r.buffer), contentType: 'application/pdf' }],
    });
    res.json(ordens.marcarOrcamentoEnviado(r.ordem.id, 'e-mail', para));
  })
);

// Registra envios feitos fora do sistema (WhatsApp, download, impressão).
api.post('/ordens/:id/registrar-envio', (req, res) => {
  const { canal = 'WhatsApp', destino = '' } = req.body || {};
  const o = ordens.marcarOrcamentoEnviado(Number(req.params.id), String(canal), String(destino));
  return o ? res.json(o) : naoEncontrado(res);
});

// ---------------------------------------------------------------------------
// Backup completo em JSON
// ---------------------------------------------------------------------------
const TABELAS = ['config', 'clientes', 'servicos', 'pecas', 'ordens', 'ordem_itens', 'historico'];

api.get('/backup', (req, res) => {
  const dados = { sistema: 'balancas-orcamentos', versao: 1, gerado_em: new Date().toISOString() };
  for (const t of TABELAS) dados[t] = db.prepare(`SELECT * FROM ${t}`).all().map((r) => ({ ...r }));
  dados.imagens = imagens.exportar();
  const nome = `backup-balancas-${new Date().toISOString().slice(0, 10)}.json`;
  res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
  res.json(dados);
});

api.post('/backup/restaurar', (req, res) => {
  const dados = req.body || {};
  if (dados.sistema !== 'balancas-orcamentos') {
    return res.status(400).json({ erro: 'Arquivo de backup inválido.' });
  }
  transacao(() => {
    for (const t of [...TABELAS].reverse()) db.prepare(`DELETE FROM ${t}`).run();
    for (const t of TABELAS) {
      for (const linha of dados[t] || []) {
        const cols = Object.keys(linha);
        if (!cols.length) continue;
        db.prepare(`INSERT INTO ${t} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(
          ...cols.map((c) => linha[c])
        );
      }
    }
  });
  imagens.importar(dados.imagens);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Erros
// ---------------------------------------------------------------------------
api.use((req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));

// eslint-disable-next-line no-unused-vars
api.use((err, req, res, next) => {
  const status = err.status || (err.type === 'entity.too.large' ? 413 : 500);
  if (status >= 500) console.error(err);
  let msg = err.message || 'Erro inesperado.';
  if (err.code === 'EAUTH') msg = 'Usuário ou senha do e-mail recusados pelo servidor SMTP.';
  else if (['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'ENOTFOUND', 'EDNS', 'ECONNREFUSED'].includes(err.code)) {
    msg = 'Não foi possível conectar ao servidor de e-mail. Verifique o endereço, a porta e a internet.';
  }
  res.status(status).json({ erro: msg });
});

module.exports = api;
