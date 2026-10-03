// Editor da ordem de serviço: checklist técnico, serviços e peças, orçamento e envio.
// Tudo é salvo automaticamente enquanto o técnico preenche.

import { api, obterConfig } from '../api.js';
import { navegar } from '../app.js';
import { abrirCadastroCliente, rotuloDocumento, tipoDoDocumento } from '../cliente-form.js';
import {
  $,
  $$,
  esc,
  icone,
  moeda,
  qtd,
  lerNumero,
  numeroBR,
  dataHoraBR,
  tempoRelativo,
  debounce,
  toast,
  erro,
  abrirModal,
  confirmar,
  autocompletar,
  seloStatus,
  STATUS_ICONE,
  STATUS_ROTULO,
  definirTitulo,
  hidratarIcones,
  mascaraTelefone,
  mascaraDocumento,
  realcar,
  hojeISO,
} from '../ui.js';

// Campos simples (texto) editados diretamente pelos inputs com data-campo.
const CAMPOS = [
  'numero_os',
  'cliente_nome',
  'cliente_tipo',
  'cliente_cidade',
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
  'lacre_saida1',
  'lacre_saida2',
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

const SECOES = [
  { id: 'identificacao', titulo: 'Identificação' },
  { id: 'checklist', titulo: 'Checklist funcional' },
  { id: 'itens', titulo: 'Serviços e peças' },
  { id: 'orcamento', titulo: 'Orçamento e envio' },
  { id: 'situacao', titulo: 'Situação' },
];

const COR_STATUS = {
  em_analise: ['var(--info-fundo)', 'var(--info)'],
  aguardando_aprovacao: ['var(--alerta-fundo)', 'var(--alerta)'],
  aprovada: ['var(--verde-suave)', 'var(--verde-escuro)'],
  aguardando_peca: ['var(--roxo-fundo)', 'var(--roxo)'],
  concluida: ['var(--verde-escuro)', '#fff'],
  entregue: ['var(--cinza-claro)', 'var(--cinza-marca)'],
  recusada: ['var(--perigo-fundo)', 'var(--perigo)'],
};

const DESCRICAO_STATUS = {
  em_analise: 'Equipamento recebido, em diagnóstico',
  aguardando_aprovacao: 'Orçamento enviado ao cliente',
  aprovada: 'Cliente aprovou, em execução',
  aguardando_peca: 'Execução parada à espera de peça',
  concluida: 'Pronta, aguardando retirada',
  entregue: 'Equipamento devolvido ao cliente',
  recusada: 'Cliente não aprovou o orçamento',
};

const arred = (v) => Math.round((Number(v) || 0) * 100) / 100;
const normalizar = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
const iniciais = (nome) =>
  String(nome || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

let chaveItem = 0;
const novaChave = () => `k${++chaveItem}`;

export async function montar(el, { params, query }) {
  const id = Number(params.id);
  const [cfg, inicial, servicosCat, pecasCat] = await Promise.all([
    obterConfig(),
    api.get(`/ordens/${id}`),
    api.get('/servicos?ativos=1'),
    api.get('/pecas?ativos=1'),
  ]);

  const catalogo = { servico: servicosCat, peca: pecasCat };
  const o = inicial;
  o.itens = o.itens.map((i) => ({ ...i, _k: novaChave() }));
  const recemCriada = query.nova === '1';
  let modoDesconto = 'valor'; // 'valor' | 'percentual'

  el.classList.add('largo');
  // "OS nº 12345" (nº do sistema principal) ou "OS sem número" enquanto não for informado.
  const rotuloOS = () => (o.numero_os.trim() ? `OS nº ${o.numero_os.trim()}` : 'OS sem número');
  definirTitulo(rotuloOS());

  // -------------------------------------------------------------------------
  // Salvamento automático
  // -------------------------------------------------------------------------
  let pendente = false;
  let salvando = null;
  let ultimoSalvo = o.atualizado_em;

  function dadosParaSalvar() {
    const d = {};
    for (const c of CAMPOS) d[c] = o[c] ?? '';
    d.acessorios = o.acessorios;
    d.checklist = o.checklist;
    d.formas_pagamento = o.formas_pagamento;
    d.cliente_id = o.cliente_id || null;
    d.desconto = o.desconto;
    d.validade_dias = o.validade_dias;
    d.status = o.status;
    d.itens = o.itens.map(({ tipo, ref_id, descricao, nome_interno, valor_unitario, quantidade }) => ({
      tipo,
      ref_id,
      descricao,
      nome_interno,
      valor_unitario,
      quantidade,
    }));
    return d;
  }

  async function salvarAgora() {
    salvarDepois.cancelar();
    if (salvando) await salvando;
    if (!pendente) return;
    pendente = false;
    indicador('salvando');
    salvando = api
      .put(`/ordens/${id}`, dadosParaSalvar())
      .then((r) => {
        o.historico = r.historico;
        o.orcamento_enviado_em = r.orcamento_enviado_em;
        o.cliente = r.cliente;
        ultimoSalvo = r.atualizado_em;
        if (!pendente) indicador('salvo');
        desenharHistorico();
        window.dispatchEvent(new Event('ordens-alteradas'));
      })
      .catch((e) => {
        pendente = true;
        indicador('erro');
        erro(e);
      })
      .finally(() => {
        salvando = null;
      });
    await salvando;
  }
  const salvarDepois = debounce(salvarAgora, 700);

  function alterou({ imediato = false } = {}) {
    pendente = true;
    indicador('pendente');
    atualizarResumo();
    if (imediato) salvarAgora();
    else salvarDepois();
  }

  function indicador(estado) {
    const ind = $('#indicador-salvo', el);
    if (!ind) return;
    ind.className = `indicador-salvo ${estado}`;
    if (estado === 'salvando' || estado === 'pendente') {
      ind.innerHTML = `${icone('loader-circle', 'girando')}Salvando…`;
    } else if (estado === 'erro') {
      ind.innerHTML = `${icone('circle-alert')}Não salvo — clique para tentar de novo`;
    } else {
      const hora = new Date(ultimoSalvo || Date.now()).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      });
      ind.innerHTML = `${icone('circle-check')}Salvo às ${hora}`;
    }
  }

  // -------------------------------------------------------------------------
  // Cálculos
  // -------------------------------------------------------------------------
  function totais() {
    let servicos = 0;
    let pecas = 0;
    for (const i of o.itens) {
      const v = arred(i.valor_unitario * i.quantidade);
      if (i.tipo === 'servico') servicos += v;
      else pecas += v;
    }
    servicos = arred(servicos);
    pecas = arred(pecas);
    const subtotal = arred(servicos + pecas);
    const desconto = Math.min(arred(o.desconto), subtotal);
    return { servicos, pecas, subtotal, desconto, total: arred(subtotal - desconto) };
  }

  function estadoSecao(sid) {
    if (sid === 'identificacao') {
      const ok = o.numero_os.trim() && o.cliente_nome.trim() && o.equipamento.trim();
      return ok ? 'ok' : '';
    }
    if (sid === 'checklist') {
      const total = o.checklist.length;
      const entrada = o.checklist.filter((c) => c.entrada).length;
      const faltaObs = o.checklist.some((c) => (c.entrada === 'NC' || c.saida === 'NC') && !c.obs.trim());
      if (faltaObs) return 'atencao';
      return total && entrada === total ? 'ok' : '';
    }
    if (sid === 'itens') return o.itens.length ? 'ok' : '';
    if (sid === 'orcamento') return o.orcamento_enviado_em ? 'ok' : '';
    if (sid === 'situacao') return ['concluida', 'entregue'].includes(o.status) ? 'ok' : '';
    return '';
  }

  // -------------------------------------------------------------------------
  // Modelos de HTML
  // -------------------------------------------------------------------------
  const campoTexto = (campo, rotulo, { tipo = 'text', classe = '', dica = '', ph = '', extra = '' } = {}) => `
    <div class="campo ${classe}">
      <label for="c-${campo}">${rotulo}</label>
      <input id="c-${campo}" type="${tipo}" data-campo="${campo}" value="${esc(o[campo])}" placeholder="${esc(ph)}" ${extra} />
      ${dica ? `<span class="dica">${dica}</span>` : ''}
    </div>`;

  const campoArea = (campo, rotulo, { classe = 'span-tudo', ph = '', linhas = 3 } = {}) => `
    <div class="campo ${classe}">
      <label for="c-${campo}">${rotulo}</label>
      <textarea id="c-${campo}" data-campo="${campo}" rows="${linhas}" placeholder="${esc(ph)}">${esc(o[campo])}</textarea>
    </div>`;

  const pilula = ({ nome, valor, marcado, tipo = 'checkbox', redondo = false, dados = '' }) => `
    <label class="pilula">
      <input type="${tipo}" name="${esc(nome)}" value="${esc(valor)}" ${marcado ? 'checked' : ''} ${dados} />
      <span class="marcador${redondo ? ' redondo' : ''}">${icone('check')}</span>${esc(valor)}
    </label>`;

  function htmlCliente() {
    if (o.cliente_id && o.cliente) {
      const c = o.cliente;
      const tipo = c.tipo || tipoDoDocumento(c.documento);
      const detalhes = [rotuloDocumento({ ...c, tipo }), c.cidade].filter(Boolean).join(' · ');
      return `
        <div class="cliente-card">
          <div class="avatar">${esc(iniciais(c.nome))}</div>
          <div class="info">
            <strong>${esc(c.nome)} <span class="etiqueta etiqueta-tipo">${tipo === 'PF' ? 'Pessoa física' : 'Pessoa jurídica'}</span></strong>
            <span>${esc(detalhes || 'Sem CPF/CNPJ e cidade cadastrados')}</span>
          </div>
          <button type="button" class="btn btn-fantasma btn-p" data-acao="editar-cliente">${icone('pencil')}Editar</button>
          <button type="button" class="btn btn-fantasma btn-p" data-acao="trocar-cliente">${icone('refresh-cw')}Trocar</button>
        </div>`;
    }
    return `
      <div class="campo">
        <label for="busca-cliente">Cliente</label>
        <div class="busca">
          ${icone('search')}
          <input id="busca-cliente" class="entrada" value="${esc(o.cliente_nome)}" placeholder="Buscar por nome, CPF ou CNPJ — ou cadastrar um novo…" />
        </div>
        <span class="dica">Escolha um cliente da lista ou cadastre um novo direto daqui (para CNPJ, os dados vêm da Receita).</span>
      </div>`;
  }

  function htmlIdentificacao() {
    const tecnicos = (cfg.tecnicos || []).map((t) => t.nome).filter(Boolean);
    const acessorios = [...new Set([...(cfg.checklist.acessorios || []), ...(o.acessorios || [])])];
    const tensoesE = [...new Set([...(cfg.checklist.tensoesEntrada || []), o.tensao_entrada].filter(Boolean))];
    const tensoesS = [...new Set([...(cfg.checklist.tensoesSaida || []), o.tensao_saida].filter(Boolean))];
    return `
      <section class="cartao secao" id="sec-identificacao">
        <div class="cartao-topo">
          <div class="titulo"><span class="passo">1</span><div><h2>Identificação do equipamento</h2><p>Dados do cliente, da balança e do recebimento.</p></div></div>
        </div>
        <div class="cartao-corpo">
          <div class="bloco">
            <div class="grade grade-4">
              ${campoTexto('numero_os', 'Nº da OS <span class="obrigatorio">*</span>', {
                classe: 'campo-numero-os',
                ph: 'Ex.: 12345',
                dica: 'Número gerado no sistema de ordens de serviço.',
                extra: 'autocomplete="off" inputmode="numeric"',
              })}
              ${campoTexto('data_entrada', 'Data de entrada', { tipo: 'date' })}
              <div class="campo span-2">
                <label for="c-tecnico">Técnico</label>
                <input id="c-tecnico" data-campo="tecnico" list="lista-tecnicos" value="${esc(o.tecnico)}" placeholder="Nome do técnico" />
                <datalist id="lista-tecnicos">${tecnicos.map((t) => `<option value="${esc(t)}"></option>`).join('')}</datalist>
              </div>
            </div>
            <div id="area-cliente" style="margin-top:16px">${htmlCliente()}</div>
          </div>

          <div class="bloco">
            <div class="grade grade-4">
              ${campoTexto('equipamento', 'Equipamento / marca / modelo', { classe: 'span-2', ph: 'Ex.: Toledo Prix 5 Plus 15 kg' })}
              ${campoTexto('numero_serie', 'Nº de série')}
              ${campoTexto('capacidade', 'Capacidade', { ph: 'Ex.: 15 kg / 5 g' })}
              ${campoTexto('pam', 'PAM <span class="opcional">(portaria do modelo)</span>', { classe: 'span-2', ph: 'Ex.: Portaria Inmetro 236/2014' })}
              ${campoTexto('selo', 'Selo de reparo nº', { classe: 'span-2' })}
            </div>
            <div class="lacres" role="group" aria-label="Lacres">
              <span class="rotulo">Lacres</span>
              <div class="lacres-grade">
                <span></span><span class="lacres-col">Lacre 1</span><span class="lacres-col">Lacre 2</span>
                <span class="lacres-lin">Entrada</span>
                <input class="entrada" data-campo="lacre1" value="${esc(o.lacre1)}" aria-label="Lacre 1 na entrada" placeholder="Nº do lacre" />
                <input class="entrada" data-campo="lacre2" value="${esc(o.lacre2)}" aria-label="Lacre 2 na entrada" placeholder="Nº do lacre" />
                <span class="lacres-lin">Saída</span>
                <input class="entrada" data-campo="lacre_saida1" value="${esc(o.lacre_saida1)}" aria-label="Lacre 1 na saída" placeholder="Nº do lacre" />
                <input class="entrada" data-campo="lacre_saida2" value="${esc(o.lacre_saida2)}" aria-label="Lacre 2 na saída" placeholder="Nº do lacre" />
              </div>
              <span class="dica">Balança que chega com dois lacres deve sair com dois lacres.</span>
            </div>
          </div>

          <div class="bloco">
            <div class="campo">
              <span class="rotulo">Acessórios recebidos</span>
              <div class="opcoes" id="acessorios">
                ${acessorios.map((a) => pilula({ nome: 'acessorio', valor: a, marcado: o.acessorios.includes(a), dados: 'data-acessorio' })).join('')}
                <input class="entrada" data-campo="acessorios_outros" value="${esc(o.acessorios_outros)}" placeholder="Outros acessórios…" style="max-width:240px;height:38px" aria-label="Outros acessórios" />
              </div>
            </div>
            <div style="margin-top:18px">${campoArea('defeito_relatado', 'Defeito relatado / solicitação do cliente', { ph: 'Descreva o que o cliente relatou…' })}</div>
            <div class="grade grade-2" style="margin-top:18px">
              <div class="campo">
                <span class="rotulo">Tensão de entrada</span>
                <div class="opcoes">${tensoesE
                  .map((t) => pilula({ nome: 'tensao_entrada', valor: t, marcado: o.tensao_entrada === t, redondo: true, dados: 'data-unico="tensao_entrada"' }))
                  .join('')}</div>
              </div>
              <div class="campo">
                <span class="rotulo">Tensão testada na saída</span>
                <div class="opcoes">${tensoesS
                  .map((t) => pilula({ nome: 'tensao_saida', valor: t, marcado: o.tensao_saida === t, redondo: true, dados: 'data-unico="tensao_saida"' }))
                  .join('')}</div>
              </div>
            </div>
          </div>
        </div>
      </section>`;
  }

  function segmento(i, col, valor) {
    const atual = o.checklist[i][col];
    const b = (v, rot, cls, ic) =>
      `<button type="button" class="${cls}" aria-pressed="${atual === v}" data-ck="${i}" data-col="${col}" data-v="${v}" title="${esc(
        { C: 'Conforme', NC: 'Não conforme', NA: 'Não se aplica' }[v]
      )}">${ic ? icone(ic, 'i-s') : ''}${rot}</button>`;
    return `<div class="segmentado" role="group">${b('C', 'C', 'c', 'check')}${b('NC', 'NC', 'nc', 'x')}${b('NA', 'N/A', 'na', '')}</div>`;
  }

  function htmlLinhaChecklist(c, i) {
    const temNC = c.entrada === 'NC' || c.saida === 'NC';
    const mostrarObs = temNC || c.obs;
    const faltaObs = temNC && !c.obs.trim();
    return `
      <tr class="item${temNC ? ' nc' : ''}${mostrarObs ? ' tem-obs' : ''}" data-linha="${i}">
        <td class="item-nome">${esc(c.item)}</td>
        <td class="col" data-rotulo="Na entrada">${segmento(i, 'entrada')}</td>
        <td class="col" data-rotulo="Após manutenção">${segmento(i, 'saida')}</td>
      </tr>
      ${
        mostrarObs
          ? `<tr class="obs-linha${temNC ? ' nc' : ''}${faltaObs ? ' falta' : ''}" data-obs-linha="${i}"><td colspan="3">
              <input class="entrada" data-ck-obs="${i}" value="${esc(c.obs)}" placeholder="${
                temNC ? 'Descreva a não conformidade (obrigatório)…' : 'Observação…'
              }" aria-label="Detalhe da não conformidade: ${esc(c.item)}" />
            </td></tr>`
          : ''
      }`;
  }

  function htmlChecklist() {
    return `
      <section class="cartao secao" id="sec-checklist">
        <div class="cartao-topo">
          <div class="titulo"><span class="passo">2</span><div><h2>Checklist funcional</h2><p>Marque C, NC ou N/A na entrada e após a manutenção.</p></div></div>
          <a class="btn btn-p" href="/imprimir/checklist?id=${id}" target="_blank" rel="noopener">${icone('printer')}Imprimir A4</a>
        </div>
        <div class="cartao-corpo">
          <div class="checklist-topo">
            <div class="progresso" id="progresso-checklist"></div>
          </div>
          <table class="checklist">
            <thead><tr>
              <th>Item de verificação</th>
              <th class="col">Na entrada<button type="button" class="marcar-todos" data-marcar-todos="entrada">Marcar restantes como C</button></th>
              <th class="col">Após manutenção<button type="button" class="marcar-todos" data-marcar-todos="saida">Marcar restantes como C</button></th>
            </tr></thead>
            <tbody id="corpo-checklist">${o.checklist.map(htmlLinhaChecklist).join('')}</tbody>
          </table>
          <div class="legenda"><span><b>C</b> = Conforme</span><span><b>NC</b> = Não conforme</span><span><b>N/A</b> = Não se aplica</span><span>Itens NC pedem o detalhe da não conformidade.</span></div>
        </div>
      </section>`;
  }

  function htmlLinhaItem(it) {
    const total = arred(it.valor_unitario * it.quantidade);
    return `
      <tr class="item" data-k="${it._k}">
        <td class="c-desc">
          ${
            it.nome_interno && it.nome_interno !== it.descricao
              ? `<span class="item-interno">${esc(it.nome_interno)}</span>
                 <label class="item-nome-os"><span>Sai na OS como</span>
                   <input class="entrada" data-item="descricao" value="${esc(it.descricao)}" aria-label="Nome que sai na OS" /></label>`
              : `<input class="entrada" data-item="descricao" value="${esc(it.descricao)}" aria-label="Descrição" />`
          }
          ${it.ref_id ? '' : '<span class="item-origem">Item avulso (não cadastrado no catálogo)</span>'}
        </td>
        <td class="c-qtd">
          <div class="qtd-controle">
            <button type="button" data-qtd="-1" aria-label="Diminuir">${icone('minus', 'i-s')}</button>
            <input data-item="quantidade" inputmode="decimal" value="${esc(qtd(it.quantidade))}" aria-label="Quantidade" />
            <button type="button" data-qtd="1" aria-label="Aumentar">${icone('plus', 'i-s')}</button>
          </div>
        </td>
        <td class="c-valor">
          <div class="entrada-prefixo"><span>R$</span><input class="entrada entrada-valor" data-item="valor_unitario" inputmode="decimal" value="${esc(
            numeroBR(it.valor_unitario)
          )}" aria-label="Valor unitário" /></div>
        </td>
        <td class="c-total" data-total>${moeda(total)}</td>
        <td class="c-acao"><button type="button" class="btn btn-fantasma btn-icone btn-p" data-remover title="Remover">${icone('trash-2')}</button></td>
      </tr>`;
  }

  function htmlTabelaItens(tipo) {
    const ehServico = tipo === 'servico';
    const lista = o.itens.filter((i) => i.tipo === tipo);
    return `
      <div class="itens-cabecalho">
        <h3>${icone(ehServico ? 'wrench' : 'package')}${ehServico ? 'Serviços executados' : 'Peças utilizadas'}</h3>
        <span class="subtotal">Subtotal <strong data-subtotal="${tipo}">${moeda(
          lista.reduce((s, i) => s + arred(i.valor_unitario * i.quantidade), 0)
        )}</strong></span>
      </div>
      <table class="tabela-itens">
        <thead><tr>
          <th>${ehServico ? 'Serviço' : 'Peça'}</th><th class="c-qtd">Qtd</th><th class="c-valor">${ehServico ? 'Valor' : 'Valor unit.'}</th><th class="c-total">Total</th><th class="c-acao"></th>
        </tr></thead>
        <tbody data-itens="${tipo}">
          ${lista.map(htmlLinhaItem).join('')}
          <tr class="linha-adicionar"><td colspan="5">
            <div class="adicionar-item">${icone('plus')}<input class="entrada" data-adicionar="${tipo}" placeholder="${
              ehServico ? 'Adicionar serviço — busque no catálogo ou digite um novo…' : 'Adicionar peça — busque no catálogo ou digite uma nova…'
            }" /></div>
          </td></tr>
        </tbody>
      </table>`;
  }

  function htmlItens() {
    return `
      <section class="cartao secao" id="sec-itens">
        <div class="cartao-topo">
          <div class="titulo"><span class="passo">3</span><div><h2>Serviços e peças</h2><p>Escolha no catálogo ou cadastre na hora. Os valores podem ser ajustados nesta OS.</p></div></div>
        </div>
        <div class="cartao-corpo">
          <div class="bloco" id="bloco-servico">${htmlTabelaItens('servico')}</div>
          <div class="bloco" id="bloco-peca">${htmlTabelaItens('peca')}</div>
          <div class="bloco grade grade-2">
            ${campoArea('servico_executado', 'Serviço executado / peças substituídas', { classe: '', ph: 'Resumo técnico do que foi feito…' })}
            ${campoArea('observacoes', 'Observações / pendências / recomendações ao cliente', { classe: '', ph: 'Aparece também no orçamento enviado ao cliente.' })}
          </div>
        </div>
      </section>`;
  }

  function htmlQuadroTotais() {
    const t = totais();
    return `
      <dl>
        <dt>Serviços</dt><dd>${moeda(t.servicos)}</dd>
        <dt>Peças</dt><dd>${moeda(t.pecas)}</dd>
        ${t.desconto ? `<dt>Desconto</dt><dd class="vermelho">− ${moeda(t.desconto)}</dd>` : ''}
      </dl>
      <div class="total"><span>Total do orçamento</span><strong>${moeda(t.total)}</strong></div>`;
  }

  function htmlOrcamento() {
    const formas = [...new Set([...(cfg.orcamento.formasPagamento || []), ...(o.formas_pagamento || [])])];
    const valorDesconto = modoDesconto === 'valor' ? numeroBR(o.desconto) : '';
    return `
      <section class="cartao secao" id="sec-orcamento">
        <div class="cartao-topo">
          <div class="titulo"><span class="passo">4</span><div><h2>Orçamento e envio</h2><p>Confira as condições e envie o PDF ao cliente.</p></div></div>
        </div>
        <div class="cartao-corpo">
          <div class="orcamento-grade">
            <div class="pilha">
              <div class="orc-campos">
                <div class="campo">
                  <label for="c-desconto">Desconto</label>
                  <div class="desconto-campo">
                    <div class="entrada-prefixo" style="flex:1"><span id="prefixo-desconto">${modoDesconto === 'valor' ? 'R$' : '%'}</span>
                      <input id="c-desconto" class="entrada entrada-valor" inputmode="decimal" value="${esc(valorDesconto)}" placeholder="0,00" /></div>
                    <div class="segmentado" role="group" aria-label="Tipo de desconto">
                      <button type="button" data-modo-desconto="valor" aria-pressed="${modoDesconto === 'valor'}">R$</button>
                      <button type="button" data-modo-desconto="percentual" aria-pressed="${modoDesconto === 'percentual'}">%</button>
                    </div>
                  </div>
                </div>
                <div class="campo">
                  <label for="c-validade">Validade do orçamento</label>
                  <div class="entrada-prefixo"><input id="c-validade" class="entrada" type="number" min="1" data-validade value="${esc(o.validade_dias)}" style="padding-right:48px" /><span style="left:auto;right:12px">dias</span></div>
                </div>
                ${campoTexto('prazo_conclusao', 'Data estimada de conclusão', { tipo: 'date' })}
              </div>
              <div class="campo">
                <span class="rotulo">Formas de pagamento</span>
                <div class="opcoes">${formas
                  .map((f) => pilula({ nome: 'forma', valor: f, marcado: o.formas_pagamento.includes(f), dados: 'data-forma' }))
                  .join('')}</div>
              </div>
              <details class="textos">
                <summary>${icone('chevron-right', 'i-s')}Garantia e condições gerais</summary>
                <div class="grade">
                  ${campoArea('garantia', 'Garantia', { linhas: 3 })}
                  ${campoArea('condicoes', 'Condições gerais', { linhas: 4 })}
                </div>
              </details>
            </div>
            <div class="quadro-totais" id="quadro-totais">${htmlQuadroTotais()}</div>
          </div>

          <div class="bloco">
            <div class="secao-sub">Enviar ao cliente</div>
            <div class="envio-opcoes">
              <button type="button" class="envio-opcao" data-acao="ver-pdf"><span class="icone-redondo">${icone('eye')}</span><strong>Visualizar PDF</strong><small>Confira o orçamento antes de enviar.</small></button>
              <button type="button" class="envio-opcao whats" data-acao="whatsapp"><span class="icone-redondo">${icone('message-circle')}</span><strong>WhatsApp</strong><small>Baixa o PDF e abre a conversa com a mensagem pronta.</small></button>
              <button type="button" class="envio-opcao" data-acao="email"><span class="icone-redondo">${icone('mail')}</span><strong>E-mail</strong><small>Envia o PDF em anexo direto do sistema.</small></button>
              <button type="button" class="envio-opcao" data-acao="baixar"><span class="icone-redondo">${icone('file-down')}</span><strong>Baixar / imprimir</strong><small>Salva o arquivo PDF no computador.</small></button>
            </div>
            <div id="enviado-info"></div>
          </div>
        </div>
      </section>`;
  }

  function htmlEnviadoInfo() {
    if (!o.orcamento_enviado_em) return '';
    return `<div class="aviso aviso-sucesso enviado-info">${icone('circle-check')}<div>Orçamento enviado em ${esc(
      dataHoraBR(o.orcamento_enviado_em)
    )}. Quando o cliente responder, atualize a situação abaixo.</div></div>`;
  }

  function htmlStatusOpcoes() {
    return Object.keys(STATUS_ROTULO)
      .map((s) => {
        const [fundo, cor] = COR_STATUS[s];
        return `<button type="button" class="status-opcao" data-status="${s}" aria-pressed="${o.status === s}">
          <span class="ic" style="background:${fundo};color:${cor}">${icone(STATUS_ICONE[s], 'i-s')}</span>
          <span><span style="display:block">${esc(STATUS_ROTULO[s])}</span><small class="texto-suave texto-xp" style="font-weight:450">${esc(
            DESCRICAO_STATUS[s]
          )}</small></span>
        </button>`;
      })
      .join('');
  }

  function htmlSituacao() {
    return `
      <section class="cartao secao" id="sec-situacao">
        <div class="cartao-topo">
          <div class="titulo"><span class="passo">5</span><div><h2>Situação</h2><p>Acompanhe o andamento até a entrega do equipamento.</p></div></div>
        </div>
        <div class="cartao-corpo">
          <div class="status-opcoes" id="status-opcoes">${htmlStatusOpcoes()}</div>
          <div class="grade grade-4" style="margin-top:18px">
            ${campoTexto('data_situacao', 'Data da situação', { tipo: 'date' })}
          </div>
          <div class="bloco">
            <div class="secao-sub">Histórico</div>
            <ul class="historico" id="historico"></ul>
          </div>
        </div>
      </section>`;
  }

  function htmlTopo() {
    return `
      <div class="migalha"><a href="#/ordens">Ordens de serviço</a>${icone('chevron-right', 'i-s')}<span data-rotulo-os>${esc(rotuloOS())}</span></div>
      <div class="editor-topo">
        <div>
          <h1><span data-rotulo-os>${esc(rotuloOS())}</span> <span id="selo-topo" title="Alterar situação">${seloStatus(o.status)}</span></h1>
          <div class="subtitulo">
            <span id="subtitulo-cliente">${esc(o.cliente_nome || 'Cliente não informado')}${o.equipamento ? ` · ${esc(o.equipamento)}` : ''}</span>
            <span aria-hidden="true">·</span>
            <span class="indicador-salvo salvo" id="indicador-salvo"></span>
          </div>
        </div>
        <div class="grupo-botoes">
          <a class="btn" href="/imprimir/checklist?id=${id}" target="_blank" rel="noopener">${icone('printer')}Imprimir checklist</a>
          <button type="button" class="btn btn-primario" data-acao="ver-pdf">${icone('file-text')}Orçamento PDF</button>
          <div class="suspenso">
            <button type="button" class="btn btn-icone" data-acao="mais" aria-label="Mais ações" aria-haspopup="true">${icone('ellipsis')}</button>
            <div class="suspenso-lista oculto" id="menu-mais">
              <button type="button" data-acao="duplicar">${icone('copy')}Duplicar OS</button>
              <a href="/api/ordens/${id}/orcamento.pdf?baixar=1">${icone('download')}Baixar orçamento</a>
              <a href="/imprimir/checklist?branco=1" target="_blank" rel="noopener">${icone('file-text')}Checklist em branco</a>
              <hr />
              <button type="button" class="perigo" data-acao="excluir">${icone('trash-2')}Excluir OS</button>
            </div>
          </div>
        </div>
      </div>`;
  }

  // -------------------------------------------------------------------------
  // Desenho
  // -------------------------------------------------------------------------
  el.innerHTML = `
    <div class="editor">
      ${htmlTopo()}
      <nav class="secoes-nav" id="indice" aria-label="Seções da OS">
        ${SECOES.map(
          (sec, i) =>
            `<button type="button" data-ir="${sec.id}"><span class="n">${i + 1}</span><span class="t">${esc(sec.titulo)}</span><span class="estado" data-estado="${sec.id}"></span></button>`
        ).join('')}
      </nav>
      <div class="editor-corpo">
        <div class="editor-secoes">
          ${htmlIdentificacao()}
          ${htmlChecklist()}
          ${htmlItens()}
          ${htmlOrcamento()}
          ${htmlSituacao()}
        </div>
      </div>
      <div class="barra-inferior">
        <div class="total-barra"><small>Total do orçamento</small><strong id="barra-total"></strong></div>
        <div class="resumo-barra" id="resumo-barra"></div>
        <div class="grupo-botoes">
          <button type="button" class="btn" data-acao="whatsapp" title="Enviar por WhatsApp">${icone('message-circle')}<span>WhatsApp</span></button>
          <button type="button" class="btn" data-acao="email" title="Enviar por e-mail">${icone('mail')}<span>E-mail</span></button>
          <button type="button" class="btn btn-primario" data-acao="ver-pdf">${icone('file-text')}<span>Orçamento PDF</span></button>
        </div>
      </div>
    </div>`;

  indicador('salvo');
  atualizarResumo();
  desenharHistorico();
  $('#enviado-info', el).innerHTML = htmlEnviadoInfo();
  ligarAutocompletarCliente();
  ligarAdicionarItens();

  function atualizarResumo() {
    const t = totais();
    const barra = $('#barra-total', el);
    if (barra) barra.textContent = moeda(t.total);
    const rb = $('#resumo-barra', el);
    if (rb) {
      rb.innerHTML = `<span>Serviços <b>${moeda(t.servicos)}</b></span><span>Peças <b>${moeda(t.pecas)}</b></span>${
        t.desconto ? `<span>Desconto <b class="vermelho">− ${moeda(t.desconto)}</b></span>` : ''
      }`;
    }
    const qt = $('#quadro-totais', el);
    if (qt) qt.innerHTML = htmlQuadroTotais();
    for (const tipo of ['servico', 'peca']) {
      const s = $(`[data-subtotal="${tipo}"]`, el);
      if (s) s.textContent = moeda(tipo === 'servico' ? t.servicos : t.pecas);
    }
    // Progresso do checklist
    const prog = $('#progresso-checklist', el);
    if (prog) {
      const total = o.checklist.length || 1;
      const preench = o.checklist.filter((c) => c.entrada).length;
      const ncs = o.checklist.filter((c) => c.entrada === 'NC' || c.saida === 'NC').length;
      prog.innerHTML = `<span class="barra"><span style="width:${Math.round((preench / total) * 100)}%"></span></span>
        <span><b>${preench}/${o.checklist.length}</b> itens verificados na entrada${
          ncs ? ` · <b class="vermelho">${ncs} NC</b>` : ''
        }</span>`;
    }
    // Índice lateral
    for (const s of SECOES) {
      const est = $(`[data-estado="${s.id}"]`, el);
      if (!est) continue;
      const e = estadoSecao(s.id);
      est.className = `estado ${e}`;
      est.innerHTML = icone(e === 'ok' ? 'circle-check' : e === 'atencao' ? 'circle-alert' : 'circle-dashed', 'i-s');
    }
    for (const r of $$('[data-rotulo-os]', el)) r.textContent = rotuloOS();
    definirTitulo(rotuloOS());
    const sub = $('#subtitulo-cliente', el);
    if (sub) sub.textContent = `${o.cliente_nome || 'Cliente não informado'}${o.equipamento ? ` · ${o.equipamento}` : ''}`;
  }

  function desenharHistorico() {
    const ul = $('#historico', el);
    if (!ul) return;
    ul.innerHTML = (o.historico || [])
      .map(
        (h) =>
          `<li><span>${esc(h.descricao)}</span><time datetime="${esc(h.criado_em)}" title="${esc(dataHoraBR(h.criado_em))}">${esc(
            tempoRelativo(h.criado_em)
          )}</time></li>`
      )
      .join('') || '<li><span class="texto-suave">Sem registros.</span></li>';
  }

  function definirStatus(status) {
    if (o.status === status) return;
    o.status = status;
    o.data_situacao = hojeISO();
    const ds = $('[data-campo="data_situacao"]', el);
    if (ds) ds.value = o.data_situacao;
    $('#selo-topo', el).innerHTML = seloStatus(status);
    $$('#status-opcoes [data-status]', el).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.status === status)));
    alterou({ imediato: true });
  }

  // -------------------------------------------------------------------------
  // Cliente
  // -------------------------------------------------------------------------
  function preencherContatoCliente(c) {
    o.cliente_id = c.id;
    o.cliente = c;
    o.cliente_nome = c.nome;
    o.cliente_tipo = c.tipo || tipoDoDocumento(c.documento);
    o.cliente_documento = c.documento || '';
    o.cliente_cidade = c.cidade || '';
    // Contatos antigos do cadastro (se houver) só servem para pré-preencher o envio.
    o.cliente_telefone = c.whatsapp || c.telefone || o.cliente_telefone || '';
    o.cliente_email = c.email || o.cliente_email || '';
    redesenharCliente();
    alterou({ imediato: true });
  }

  function redesenharCliente() {
    $('#area-cliente', el).innerHTML = htmlCliente();
    ligarAutocompletarCliente();
  }

  let clientesCache = null;
  function ligarAutocompletarCliente() {
    const input = $('#busca-cliente', el);
    if (!input) return;
    input.addEventListener('input', () => {
      o.cliente_nome = input.value;
      alterou();
    });
    autocompletar(input, {
      buscar: async (q) => {
        if (!clientesCache) clientesCache = await api.get('/clientes');
        const n = normalizar(q.trim());
        return clientesCache
          .filter((c) => !n || normalizar(`${c.nome} ${c.documento} ${c.cidade}`).includes(n))
          .slice(0, 8);
      },
      item: (c, q) =>
        `<div class="nome">${realcar(c.nome, q)}<small>${esc([rotuloDocumento(c), c.cidade].filter(Boolean).join(' · '))}</small></div>`,
      escolher: (c) => preencherContatoCliente(c),
      criar: (q) => modalCliente({ nome: q }),
      rotuloCriar: (q) => `Cadastrar novo cliente “${q}”`,
    });
  }

  async function modalCliente(base = {}) {
    const editando = Boolean(base.id);
    if (!clientesCache) clientesCache = await api.get('/clientes').catch(() => []);
    const cidades = [...new Set(clientesCache.map((c) => c.cidade).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    // Texto digitado na busca: se parece CPF/CNPJ vai para o documento, senão para o nome.
    const pareceDoc = /^[\d.\-/ ]{11,}$/.test(String(base.nome || '').trim());
    const cliente = !editando && pareceDoc ? { documento: base.nome } : base;
    const salvo = await abrirCadastroCliente(cliente, {
      textoSalvar: editando ? 'Salvar' : 'Cadastrar e usar nesta OS',
      cidades,
    });
    if (salvo && salvo.id) {
      clientesCache = null;
      toast(editando ? 'Cliente atualizado.' : 'Cliente cadastrado.');
      preencherContatoCliente(salvo);
    }
  }

  // -------------------------------------------------------------------------
  // Itens (serviços e peças)
  // -------------------------------------------------------------------------
  function redesenharItens(tipo, focarK, focarCampo = 'valor_unitario') {
    $(`#bloco-${tipo}`, el).innerHTML = htmlTabelaItens(tipo);
    ligarAdicionarItens(tipo);
    atualizarResumo();
    if (focarK) {
      const inp = $(`[data-k="${focarK}"] [data-item="${focarCampo}"]`, el);
      inp?.focus();
      inp?.select?.();
    }
  }

  // Item a partir do catálogo: a descrição é o nome que sai na OS; o técnico vê o nome interno.
  function dadosDoCatalogo(c) {
    const nomeOs = (c.nome_os || '').trim();
    return {
      ref_id: c.id,
      descricao: nomeOs || c.nome,
      nome_interno: nomeOs && nomeOs !== c.nome ? c.nome : '',
      valor_unitario: c.valor,
    };
  }

  function adicionarItem(tipo, dados, { focar = 'valor_unitario' } = {}) {
    if (dados.ref_id) {
      const existente = o.itens.find((i) => i.tipo === tipo && i.ref_id === dados.ref_id && i.valor_unitario === dados.valor_unitario);
      if (existente) {
        existente.quantidade = arred(existente.quantidade + 1);
        redesenharItens(tipo);
        toast(`Quantidade de “${existente.nome_interno || existente.descricao}” atualizada para ${qtd(existente.quantidade)}.`, 'info');
        alterou();
        return;
      }
    }
    const item = { tipo, ref_id: null, descricao: '', valor_unitario: 0, quantidade: 1, ...dados, _k: novaChave() };
    o.itens.push(item);
    redesenharItens(tipo, dados.ref_id ? null : item._k, focar);
    if (dados.ref_id) $(`[data-adicionar="${tipo}"]`, el)?.focus();
    alterou();
  }

  function ligarAdicionarItens(apenas) {
    for (const tipo of apenas ? [apenas] : ['servico', 'peca']) {
      const input = $(`[data-adicionar="${tipo}"]`, el);
      if (!input) continue;
      autocompletar(input, {
        buscar: async (q) => {
          const n = normalizar(q.trim());
          const r = catalogo[tipo]
            .filter((c) => !n || normalizar(`${c.nome} ${c.nome_os || ''} ${c.descricao || ''} ${c.codigo || ''}`).includes(n))
            .slice(0, 30);
          if (q.trim()) r.push({ __avulso: true, nome: q.trim() });
          return r;
        },
        item: (c, q) =>
          c.__avulso
            ? `<div class="nome">${icone('plus', 'i-s')} Adicionar “${esc(c.nome)}” só nesta OS<small>Item avulso, sem cadastrar no catálogo</small></div>`
            : `<div class="nome">${realcar(c.nome, q)}${
                c.nome_os && c.nome_os !== c.nome
                  ? `<small>Sai na OS como: ${esc(c.nome_os)}</small>`
                  : c.descricao || c.codigo
                    ? `<small>${esc(c.descricao || `Cód. ${c.codigo}`)}</small>`
                    : ''
              }</div><div class="preco">${moeda(c.valor)}</div>`,
        escolher: (c) => {
          input.value = '';
          if (c.__avulso) adicionarItem(tipo, { descricao: c.nome });
          else adicionarItem(tipo, dadosDoCatalogo(c));
        },
        criar: (q) => {
          input.value = '';
          modalCatalogo(tipo, q);
        },
        rotuloCriar: (q) => `Cadastrar “${q}” no catálogo de ${tipo === 'servico' ? 'serviços' : 'peças'}`,
      });
    }
  }

  async function modalCatalogo(tipo, nome) {
    const ehServico = tipo === 'servico';
    const m = abrirModal({
      titulo: ehServico ? 'Cadastrar serviço' : 'Cadastrar peça',
      tamanho: 'pequeno',
      corpo: `
        <div class="grade">
          <div class="campo"><label>${ehServico ? 'Serviço' : 'Nome da peça'} *</label><input name="nome" value="${esc(nome)}" /></div>
          <div class="grade grade-2">
            <div class="campo"><label>${ehServico ? 'Valor padrão' : 'Valor unitário'}</label>
              <div class="entrada-prefixo"><span>R$</span><input name="valor" class="entrada-valor" inputmode="decimal" placeholder="0,00" /></div></div>
            <div class="campo"><label>${ehServico ? 'Nome na OS' : 'Código'} <span class="opcional">(opcional)</span></label><input name="${
              ehServico ? 'nome_os' : 'codigo'
            }" /></div>
          </div>
          <p class="texto-suave texto-p">Fica salvo no catálogo para as próximas ordens de serviço.</p>
        </div>`,
      acoes: [
        { texto: 'Cancelar', classe: 'btn-fantasma' },
        {
          texto: 'Cadastrar e adicionar',
          classe: 'btn-primario',
          tipo: 'submit',
          icone: 'check',
          aoClicar: async ({ form }) => {
            const dados = Object.fromEntries(new FormData(form));
            if (!dados.nome.trim()) {
              form.nome.closest('.campo').classList.add('erro');
              return false;
            }
            dados.valor = lerNumero(dados.valor);
            try {
              return await api.post(ehServico ? '/servicos' : '/pecas', dados);
            } catch (e) {
              erro(e);
              return false;
            }
          },
        },
      ],
      aoAbrir: ({ form }) => setTimeout(() => form.valor.focus(), 40),
    });
    const novo = await m.resultado;
    if (novo && novo.id) {
      catalogo[tipo].push(novo);
      toast(`${ehServico ? 'Serviço' : 'Peça'} cadastrad${ehServico ? 'o' : 'a'} no catálogo.`);
      adicionarItem(tipo, dadosDoCatalogo(novo));
    }
  }

  // -------------------------------------------------------------------------
  // PDF e envio
  // -------------------------------------------------------------------------
  const urlPdf = (baixar = false) => `/api/ordens/${id}/orcamento.pdf?${baixar ? 'baixar=1&' : ''}t=${Date.now()}`;

  function validarAntesDoPdf() {
    const avisos = [];
    if (!o.cliente_nome.trim()) avisos.push('o nome do cliente');
    if (!o.itens.length) avisos.push('ao menos um serviço ou peça');
    return avisos;
  }

  async function prepararPdf() {
    await salvarAgora();
    const avisos = validarAntesDoPdf();
    if (avisos.length) {
      const seguir = await confirmar({
        titulo: 'Orçamento incompleto',
        mensagem: `Ainda falta informar ${avisos.join(' e ')}. Deseja continuar mesmo assim?`,
        confirmar: 'Continuar',
      });
      return seguir;
    }
    return true;
  }

  async function verPdf() {
    if (!(await prepararPdf())) return;
    const m = abrirModal({
      titulo: `Orçamento — ${rotuloOS()}`,
      tamanho: 'grande',
      corpo: `<iframe class="pdf-quadro" src="${urlPdf()}" title="Pré-visualização do orçamento"></iframe>`,
      acoes: [
        { texto: 'Fechar', classe: 'btn-fantasma' },
        { texto: 'Baixar PDF', icone: 'download', valor: 'baixar' },
        { texto: 'E-mail', icone: 'mail', valor: 'email' },
        { texto: 'WhatsApp', icone: 'message-circle', classe: 'btn-primario', valor: 'whatsapp' },
      ],
    });
    const r = await m.resultado;
    if (r === 'baixar') baixarPdf();
    if (r === 'email') enviarEmail();
    if (r === 'whatsapp') enviarWhatsapp();
  }

  function baixarArquivo(url) {
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function baixarPdf() {
    if (!(await prepararPdf())) return;
    baixarArquivo(urlPdf(true));
    toast('PDF do orçamento baixado.');
  }

  function aplicarRetornoEnvio(r) {
    o.orcamento_enviado_em = r.orcamento_enviado_em;
    o.historico = r.historico;
    if (r.status !== o.status) {
      o.status = r.status;
      o.data_situacao = r.data_situacao;
      const ds = $('[data-campo="data_situacao"]', el);
      if (ds) ds.value = o.data_situacao;
      $('#selo-topo', el).innerHTML = seloStatus(o.status);
      $$('#status-opcoes [data-status]', el).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.status === o.status)));
    }
    ultimoSalvo = r.atualizado_em;
    $('#enviado-info', el).innerHTML = htmlEnviadoInfo();
    desenharHistorico();
    atualizarResumo();
    window.dispatchEvent(new Event('ordens-alteradas'));
  }

  async function enviarEmail() {
    if (!(await prepararPdf())) return;
    const msg = await api.get(`/ordens/${id}/mensagens`);
    const e = msg.email;
    const m = abrirModal({
      titulo: 'Enviar orçamento por e-mail',
      tamanho: 'grande',
      corpo: `
        ${
          e.configurado
            ? ''
            : `<div class="aviso aviso-alerta" style="margin-bottom:16px">${icone('triangle-alert')}<div>O envio por e-mail ainda não foi configurado. <a href="#/configuracoes" data-fechar-modal>Configure o servidor de e-mail</a> ou use o WhatsApp / baixe o PDF.</div></div>`
        }
        <div class="grade">
          <div class="campo"><label>Para *</label><input name="para" type="email" value="${esc(e.para)}" placeholder="email@cliente.com.br" /></div>
          <div class="campo"><label>Assunto</label><input name="assunto" value="${esc(e.assunto)}" /></div>
          <div class="campo"><label>Mensagem</label><textarea name="mensagem" rows="9">${esc(e.mensagem)}</textarea></div>
          <div class="aviso">${icone('file-text')}<div>Anexo: <b>${esc(msg.arquivo)}</b></div></div>
        </div>`,
      acoes: [
        { texto: 'Cancelar', classe: 'btn-fantasma' },
        {
          texto: 'Enviar e-mail',
          classe: 'btn-primario',
          icone: 'send',
          tipo: 'submit',
          aoClicar: async ({ form }) => {
            const dados = Object.fromEntries(new FormData(form));
            if (!dados.para.trim()) {
              form.para.closest('.campo').classList.add('erro');
              form.para.focus();
              return false;
            }
            const botao = form.querySelector('[type=submit]');
            botao.disabled = true;
            botao.innerHTML = `${icone('loader-circle', 'girando')}Enviando…`;
            try {
              const r = await api.post(`/ordens/${id}/enviar-email`, dados);
              if (!o.cliente_email && dados.para) {
                o.cliente_email = dados.para;
                alterou();
              }
              return r;
            } catch (err) {
              erro(err);
              botao.disabled = false;
              botao.innerHTML = `${icone('send')}Enviar e-mail`;
              return false;
            }
          },
        },
      ],
      aoAbrir: ({ form, fechar }) => {
        form.querySelector('[data-fechar-modal]')?.addEventListener('click', () => fechar());
      },
    });
    const r = await m.resultado;
    if (r && r.id) {
      aplicarRetornoEnvio(r);
      toast('Orçamento enviado por e-mail.');
    }
  }

  async function enviarWhatsapp() {
    if (!(await prepararPdf())) return;
    const msg = await api.get(`/ordens/${id}/mensagens`);
    const w = msg.whatsapp;
    const podeCompartilhar = Boolean(navigator.canShare && window.isSecureContext);
    const m = abrirModal({
      titulo: 'Enviar orçamento pelo WhatsApp',
      corpo: `
        <div class="grade">
          <div class="campo"><label>WhatsApp do cliente</label><input name="telefone" data-mascara="telefone" value="${esc(
            mascaraTelefone(w.telefone)
          )}" placeholder="(19) 99999-9999" /><span class="dica">Deixe em branco para escolher o contato no WhatsApp.</span></div>
          <div class="campo"><label>Mensagem</label><textarea name="mensagem" rows="6">${esc(w.mensagem)}</textarea></div>
          <div class="aviso aviso-info">${icone('info')}<div>O WhatsApp não permite anexar arquivos por link. O PDF <b>${esc(
            msg.arquivo
          )}</b> será baixado no computador — é só arrastá-lo para a conversa que vai abrir.</div></div>
        </div>`,
      acoes: [
        { texto: 'Cancelar', classe: 'btn-fantasma' },
        ...(podeCompartilhar ? [{ texto: 'Compartilhar PDF…', icone: 'send', valor: 'compartilhar' }] : []),
        { texto: 'Baixar PDF e abrir WhatsApp', classe: 'btn-primario', icone: 'message-circle', tipo: 'submit', aoClicar: () => 'whatsapp' },
      ],
      aoAbrir: ({ form }) => ligarMascaras(form),
    });
    const form = m.el;
    const r = await m.resultado;
    if (!r) return;
    const telefone = form.telefone.value;
    const mensagem = form.mensagem.value;
    if (r === 'compartilhar') {
      try {
        const blob = await (await fetch(urlPdf())).blob();
        const arquivo = new File([blob], msg.arquivo, { type: 'application/pdf' });
        if (!navigator.canShare({ files: [arquivo] })) throw new Error('Compartilhamento de arquivos indisponível neste navegador.');
        await navigator.share({ files: [arquivo], text: mensagem, title: `Orçamento — ${rotuloOS()}` });
      } catch (e) {
        if (e.name !== 'AbortError') erro(e);
        return;
      }
    } else {
      baixarArquivo(urlPdf(true));
      const numero = telefone.replace(/\D/g, '');
      const destino = numero ? (numero.length <= 11 ? `55${numero}` : numero) : '';
      window.open(`https://wa.me/${destino}?text=${encodeURIComponent(mensagem)}`, '_blank', 'noopener');
    }
    if (telefone && !o.cliente_telefone) {
      o.cliente_telefone = telefone;
      alterou();
    }
    try {
      aplicarRetornoEnvio(await api.post(`/ordens/${id}/registrar-envio`, { canal: 'WhatsApp', destino: telefone }));
      toast('Envio pelo WhatsApp registrado na OS.');
    } catch (e) {
      erro(e);
    }
  }

  // -------------------------------------------------------------------------
  // Eventos
  // -------------------------------------------------------------------------
  function ligarMascaras(raiz) {
    raiz.addEventListener('input', (e) => {
      const m = e.target.dataset?.mascara;
      if (m === 'telefone') e.target.value = mascaraTelefone(e.target.value);
      if (m === 'documento') e.target.value = mascaraDocumento(e.target.value);
    });
  }

  el.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.campo) {
      if (t.dataset.mascara === 'telefone') t.value = mascaraTelefone(t.value);
      if (t.dataset.mascara === 'documento') t.value = mascaraDocumento(t.value);
      o[t.dataset.campo] = t.value;
      alterou();
      return;
    }
    if (t.dataset.ckObs !== undefined) {
      const i = Number(t.dataset.ckObs);
      o.checklist[i].obs = t.value;
      const linha = t.closest('tr');
      const temNC = o.checklist[i].entrada === 'NC' || o.checklist[i].saida === 'NC';
      linha.classList.toggle('falta', temNC && !t.value.trim());
      alterou();
      return;
    }
    if (t.dataset.item) {
      const tr = t.closest('tr[data-k]');
      const item = o.itens.find((i) => i._k === tr.dataset.k);
      if (!item) return;
      if (t.dataset.item === 'descricao') item.descricao = t.value;
      if (t.dataset.item === 'quantidade') item.quantidade = Math.max(0, lerNumero(t.value)) || 1;
      if (t.dataset.item === 'valor_unitario') item.valor_unitario = arred(lerNumero(t.value));
      $('[data-total]', tr).textContent = moeda(item.valor_unitario * item.quantidade);
      alterou();
      return;
    }
    if (t.id === 'c-desconto') {
      const v = lerNumero(t.value);
      o.desconto = modoDesconto === 'valor' ? arred(v) : arred((totais().subtotal * Math.min(100, v)) / 100);
      alterou();
      return;
    }
    if (t.dataset.validade !== undefined) {
      o.validade_dias = Math.max(1, parseInt(t.value, 10) || 0);
      alterou();
    }
  });

  el.addEventListener(
    'blur',
    (e) => {
      const t = e.target;
      if (t.dataset?.item === 'valor_unitario') t.value = numeroBR(lerNumero(t.value));
      if (t.dataset?.item === 'quantidade') {
        const tr = t.closest('tr[data-k]');
        const item = o.itens.find((i) => i._k === tr?.dataset.k);
        if (item) t.value = qtd(item.quantidade);
      }
      if (t.id === 'c-desconto' && modoDesconto === 'valor') t.value = o.desconto ? numeroBR(o.desconto) : '';
    },
    true
  );

  el.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.acessorio !== undefined) {
      o.acessorios = $$('[data-acessorio]', el)
        .filter((c) => c.checked)
        .map((c) => c.value);
      alterou();
    } else if (t.dataset.forma !== undefined) {
      o.formas_pagamento = $$('[data-forma]', el)
        .filter((c) => c.checked)
        .map((c) => c.value);
      alterou();
    } else if (t.dataset.unico) {
      const campo = t.dataset.unico;
      o[campo] = t.checked ? t.value : '';
      $$(`[data-unico="${campo}"]`, el).forEach((c) => {
        if (c !== t) c.checked = false;
      });
      alterou();
    }
  });

  el.addEventListener('click', async (e) => {
    const b = e.target.closest('button, [data-acao], [data-status]');
    if (!b || !el.contains(b)) return;

    // Checklist C / NC / N/A
    if (b.dataset.ck !== undefined) {
      const i = Number(b.dataset.ck);
      const col = b.dataset.col;
      const c = o.checklist[i];
      c[col] = c[col] === b.dataset.v ? '' : b.dataset.v;
      const tr = b.closest('tr');
      const proxima = tr.nextElementSibling?.dataset.obsLinha !== undefined ? tr.nextElementSibling : null;
      const tmp = document.createElement('tbody');
      tmp.innerHTML = htmlLinhaChecklist(c, i);
      proxima?.remove();
      tr.replaceWith(...tmp.children);
      if ((c.entrada === 'NC' || c.saida === 'NC') && !c.obs) $(`[data-ck-obs="${i}"]`, el)?.focus();
      alterou();
      return;
    }
    if (b.dataset.marcarTodos) {
      const col = b.dataset.marcarTodos;
      let n = 0;
      o.checklist.forEach((c) => {
        if (!c[col]) {
          c[col] = 'C';
          n++;
        }
      });
      if (!n) return toast('Todos os itens já estavam marcados.', 'info');
      $('#corpo-checklist', el).innerHTML = o.checklist.map(htmlLinhaChecklist).join('');
      toast(`${n} ${n === 1 ? 'item marcado' : 'itens marcados'} como Conforme.`);
      alterou();
      return;
    }

    // Itens
    if (b.dataset.qtd) {
      const tr = b.closest('tr[data-k]');
      const item = o.itens.find((i) => i._k === tr.dataset.k);
      item.quantidade = Math.max(1, arred(item.quantidade + Number(b.dataset.qtd)));
      $('[data-item="quantidade"]', tr).value = qtd(item.quantidade);
      $('[data-total]', tr).textContent = moeda(item.valor_unitario * item.quantidade);
      alterou();
      return;
    }
    if (b.dataset.remover !== undefined) {
      const tr = b.closest('tr[data-k]');
      const idx = o.itens.findIndex((i) => i._k === tr.dataset.k);
      const [removido] = o.itens.splice(idx, 1);
      redesenharItens(removido.tipo);
      alterou();
      return;
    }

    // Desconto
    if (b.dataset.modoDesconto) {
      modoDesconto = b.dataset.modoDesconto;
      $$('[data-modo-desconto]', el).forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.modoDesconto === modoDesconto)));
      $('#prefixo-desconto', el).textContent = modoDesconto === 'valor' ? 'R$' : '%';
      const inp = $('#c-desconto', el);
      const sub = totais().subtotal;
      inp.value =
        modoDesconto === 'valor'
          ? o.desconto
            ? numeroBR(o.desconto)
            : ''
          : sub && o.desconto
            ? numeroBR((o.desconto / sub) * 100, 1)
            : '';
      inp.focus();
      return;
    }

    // Situação
    if (b.dataset.status) {
      definirStatus(b.dataset.status);
      return;
    }

    // Índice lateral
    if (b.dataset.ir) {
      $(`#sec-${b.dataset.ir}`, el).scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    const acao = b.dataset.acao;
    if (!acao) return;
    if (acao === 'mais') {
      e.stopPropagation();
      $('#menu-mais', el).classList.toggle('oculto');
      return;
    }
    $('#menu-mais', el)?.classList.add('oculto');
    try {
      if (acao === 'ver-pdf') await verPdf();
      else if (acao === 'baixar') await baixarPdf();
      else if (acao === 'email') await enviarEmail();
      else if (acao === 'whatsapp') await enviarWhatsapp();
      else if (acao === 'trocar-cliente') {
        o.cliente_id = null;
        o.cliente = null;
        redesenharCliente();
        $('#busca-cliente', el)?.focus();
        alterou();
      } else if (acao === 'editar-cliente') {
        await modalCliente(o.cliente);
      } else if (acao === 'duplicar') {
        await salvarAgora();
        const nova = await api.post(`/ordens/${id}/duplicar`);
        toast("Cópia criada. Informe o nº da nova OS.");
        navegar(`/ordens/${nova.id}?nova=1`);
      } else if (acao === 'excluir') {
        const ok = await confirmar({
          titulo: `Excluir ${rotuloOS()}?`,
          mensagem: 'O checklist, os itens e o histórico desta ordem de serviço serão apagados. Esta ação não pode ser desfeita.',
          confirmar: 'Excluir',
          perigo: true,
        });
        if (!ok) return;
        salvarDepois.cancelar();
        pendente = false;
        await api.del(`/ordens/${id}`);
        excluida = true;
        window.dispatchEvent(new Event('ordens-alteradas'));
        toast(`${rotuloOS()} excluída.`);
        navegar('/ordens');
      }
    } catch (err) {
      erro(err);
    }
  });

  $('#selo-topo', el).addEventListener('click', () =>
    $('#sec-situacao', el).scrollIntoView({ behavior: 'smooth', block: 'start' })
  );
  $('#indicador-salvo', el).addEventListener('click', () => {
    if ($('#indicador-salvo', el).classList.contains('erro')) {
      pendente = true;
      salvarAgora();
    }
  });

  const fecharMenu = (e) => {
    if (!e.target.closest('.suspenso')) $('#menu-mais', el)?.classList.add('oculto');
  };
  document.addEventListener('click', fecharMenu);

  // Destaca no índice a seção visível.
  const observador = new IntersectionObserver(
    (entradas) => {
      for (const en of entradas) {
        if (en.isIntersecting) {
          const sid = en.target.id.replace('sec-', '');
          $$('#indice [data-ir]', el).forEach((b) => b.classList.toggle('atual', b.dataset.ir === sid));
          $('#indice .atual', el)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
      }
    },
    { rootMargin: '-30% 0px -60% 0px' }
  );
  $$('.secao', el).forEach((s) => observador.observe(s));

  hidratarIcones(el);
  if (recemCriada) {
    history.replaceState(null, '', `#/ordens/${id}`);
    setTimeout(() => $('[data-campo="numero_os"]', el)?.focus(), 60);
  }

  // OS recém-criada e abandonada sem nenhum dado é descartada.
  let excluida = false;
  const vazia = () =>
    !o.numero_os.trim() &&
    !o.cliente_nome.trim() &&
    !o.equipamento.trim() &&
    !o.numero_serie.trim() &&
    !o.defeito_relatado.trim() &&
    !o.itens.length &&
    !o.checklist.some((c) => c.entrada || c.saida);

  return {
    temAlteracoes: () => pendente || Boolean(salvando),
    async sair() {
      if (recemCriada && !excluida && vazia()) {
        salvarDepois.cancelar();
        pendente = false;
        try {
          await api.del(`/ordens/${id}`);
          excluida = true;
          window.dispatchEvent(new Event('ordens-alteradas'));
        } catch {
          /* ignora */
        }
        return true;
      }
      await salvarAgora();
      if (pendente) {
        return confirmar({
          titulo: 'Alterações não salvas',
          mensagem: 'Não foi possível salvar as últimas alterações. Deseja sair mesmo assim?',
          confirmar: 'Sair sem salvar',
          perigo: true,
        });
      }
      return true;
    },
    desmontar() {
      document.removeEventListener('click', fecharMenu);
      observador.disconnect();
    },
  };
}
