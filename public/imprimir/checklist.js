// Checklist técnico em A4 (uma única folha), para imprimir preenchido ou em branco.
//
//   /imprimir/checklist?id=<ordemId>   → preenchido com os dados da ordem de serviço
//   /imprimir/checklist?branco=1       → formulário em branco (preenchimento à mão)
//   &auto=1                            → abre a janela de impressão ao terminar de montar
//
// A folha tem altura fixa (área útil do A4 com margens de 10 mm). Depois de desenhar,
// o ajuste automático mede o conteúdo e compacta o que for preciso (altura das linhas
// do checklist, espaçamentos, linhas de escrita, fonte e textos longos) para que tudo
// caiba sempre em uma página.

import { api } from '/js/api.js';
import { esc, dataBR, qtd, icone } from '/js/ui.js';

const PX_POR_MM = 96 / 25.4;
const ALTURA_UTIL_MM = 276; // 297 mm − 2 × 10 mm de margem, com 1 mm de folga
const H_LINHA_MM = 7; // altura mínima de uma linha para escrita à mão
const BORDA_MM = 0.2;

const params = new URLSearchParams(location.search);
const ordemId = Number(params.get('id')) || 0;
const emBranco = ['1', 'true', 'sim'].includes(params.get('branco') || '') || !ordemId;
const autoImprimir = params.get('auto') === '1';

const pagina = document.getElementById('pagina');
const folha = document.getElementById('folha');
const btnImprimir = document.getElementById('btn-imprimir');
const btnFechar = document.getElementById('btn-fechar');
const barraTitulo = document.getElementById('barra-titulo');

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------
const texto = (v) => String(v ?? '').trim();

const chave = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '');

/** Normaliza a marcação do checklist: 'C' | 'NC' | 'NA' | ''. */
function marcacao(v) {
  const s = String(v ?? '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
  return s === 'C' || s === 'NC' || s === 'NA' ? s : '';
}

/** Lista de opções da configuração + valores da OS que não estão na lista (marcados). */
function opcoesCom(base, selecionados) {
  const sel = selecionados.map(texto).filter(Boolean);
  const marcadas = new Set(sel.map(chave));
  const lista = base.map((rotulo) => ({ rotulo, marcada: marcadas.has(chave(rotulo)) }));
  const conhecidas = new Set(base.map(chave));
  for (const s of sel) {
    if (!conhecidas.has(chave(s))) {
      conhecidas.add(chave(s));
      lista.push({ rotulo: s, marcada: true });
    }
  }
  return lista;
}

/** Corta o texto em n caracteres, terminando com reticências. */
const cortar = (t, n) => (n >= t.length ? t : `${t.slice(0, Math.max(0, n)).replace(/[\s,.;:–-]+$/, '')}…`);

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

// ---------------------------------------------------------------------------
// Dados
// ---------------------------------------------------------------------------
function montarDados(cfg, ordem) {
  const ck = cfg.checklist || {};
  const o = ordem || {};
  const d = {
    branco: !ordem,
    o,
    empresa: cfg.empresa || {},
    rodape: ck.rodape || '',
    tecnicoDoc: '',
    documento: '',
    rotuloDocumento: 'CPF / CNPJ',
    ncs: [],
    servicos: [],
    pecas: [],
  };

  const itensOrdem = Array.isArray(o.checklist) ? o.checklist.filter((c) => texto(c?.item)) : [];
  d.itens = itensOrdem.length
    ? itensOrdem.map((c) => ({
        item: texto(c.item),
        entrada: marcacao(c.entrada),
        saida: marcacao(c.saida),
        obs: texto(c.obs),
      }))
    : (ck.itens || []).map((item) => ({ item: texto(item), entrada: '', saida: '', obs: '' }));

  d.acessorios = opcoesCom(ck.acessorios || [], Array.isArray(o.acessorios) ? o.acessorios : []);
  d.tensoesEntrada = opcoesCom(ck.tensoesEntrada || [], [o.tensao_entrada]);
  d.tensoesSaida = opcoesCom(ck.tensoesSaida || [], [o.tensao_saida]);

  if (ordem) {
    const tec = (cfg.tecnicos || []).find((t) => chave(t?.nome) && chave(t.nome) === chave(o.tecnico));
    d.tecnicoDoc = texto(tec?.documento);
    d.documento = texto(o.cliente_documento) || texto(o.cliente?.documento);
    const tipo = texto(o.cliente_tipo) || texto(o.cliente?.tipo);
    if (tipo === 'PF') d.rotuloDocumento = 'CPF';
    else if (tipo === 'PJ') d.rotuloDocumento = 'CNPJ';
    d.cidade = texto(o.cliente_cidade) || texto(o.cliente?.cidade);
    d.liberado = ['concluida', 'entregue'].includes(o.status);
    d.aguardando = o.status === 'aguardando_peca';
    d.ncs = d.itens.map((it, i) => ({ ...it, n: i + 1 })).filter((it) => it.obs);
    d.temNC = d.itens.some((it) => it.entrada === 'NC' || it.saida === 'NC');
    d.checklistPreenchido = d.itens.some((it) => it.entrada || it.saida);
    const itens = Array.isArray(o.itens) ? o.itens : [];
    // Documento interno: mostra o nome interno do serviço (o PDF do cliente usa o nome na OS).
    const linhaItem = (i) => ({ q: `${qtd(i.quantidade || 1)}×`, desc: texto(i.nome_interno) || texto(i.descricao) });
    d.servicos = itens.filter((i) => i.tipo !== 'peca' && texto(i.descricao)).map(linhaItem);
    d.pecas = itens.filter((i) => i.tipo === 'peca' && texto(i.descricao)).map(linhaItem);
  }
  return d;
}

// ---------------------------------------------------------------------------
// Peças de HTML
// ---------------------------------------------------------------------------
const MARCA_SVG = {
  C: '<path d="M2.1 5.3 4.2 7.4 8 2.8"/>',
  NC: '<path d="M2.7 2.7 7.3 7.3M7.3 2.7 2.7 7.3"/>',
  NA: '<path d="M2.6 5h4.8"/>',
};

function caixa(marca, classe = '') {
  const svg = marca ? `<svg viewBox="0 0 10 10" aria-hidden="true">${MARCA_SVG[marca]}</svg>` : '';
  return `<span class="cx${classe ? ` ${classe}` : ''}">${svg}</span>`;
}

const opcao = ({ rotulo, marcada }) =>
  `<span class="opcao${marcada ? ' marcada' : ''}">${caixa(marcada ? 'C' : '', 'cx-o')}<span>${esc(rotulo)}</span></span>`;

function valor(v, { forte = false, extra = '' } = {}) {
  const t = texto(v);
  return `<div class="v">${t ? `<span class="t${forte ? ' forte' : ''}">${esc(t)}</span>` : ''}${
    extra ? `<span class="extra">${esc(extra)}</span>` : ''
  }</div>`;
}

const guiaData = '<div class="v"><span class="guia-data"><i></i>/<i></i>/<i></i></span></div>';
const valorData = (iso) => (texto(iso) ? valor(dataBR(iso)) : guiaData);

const valorLacre = (n, v) =>
  `<div class="v lacre"><span class="num">${n}.</span>${texto(v) ? `<span class="t">${esc(v)}</span>` : ''}</div>`;

const linhasEscrita = (n) => `<div class="linhas">${'<i></i>'.repeat(Math.max(1, n))}</div>`;

/** Bloco de várias linhas com altura fixa (n linhas de 7 mm + a borda inferior). */
function bloco({ tipo, n, conteudo = null, classe = '' }) {
  const corpo = conteudo === null ? linhasEscrita(n) : `<div class="conteudo">${conteudo}</div>`;
  const altura = n * H_LINHA_MM + BORDA_MM;
  return `<div class="bloco${classe ? ` ${classe}` : ''}" data-tipo="${tipo}" style="height:${altura}mm">${corpo}</div>`;
}

const tituloSecao = (n, titulo) => `<div class="secao-titulo"><span class="n">${n}</span><h2>${esc(titulo)}</h2></div>`;

// ---------------------------------------------------------------------------
// Folha
// ---------------------------------------------------------------------------
function cabecalho(d) {
  const e = d.empresa;
  const contato = [e.telefone, e.site || e.email].map(texto).filter(Boolean).join(' · ');
  return `
    <header class="cab">
      <div class="cab-marca">
        <img src="/img/logo-simbolo.png" alt="" />
        <div>
          <div class="cab-empresa">${esc(e.nome || 'BALANÇAS.COM')}</div>
          ${e.subtitulo ? `<div class="cab-sub">${esc(e.subtitulo)}</div>` : ''}
          ${contato ? `<div class="cab-contato">${esc(contato)}</div>` : ''}
        </div>
      </div>
      <div class="cab-titulo">
        <h1>CHECKLIST TÉCNICO</h1>
        <p>Entrada, manutenção e liberação de balanças</p>
      </div>
      <div class="cab-os">
        <div class="cab-os-rotulo">ORDEM DE SERVIÇO</div>
        <div class="cab-os-num"><span>Nº</span><strong>${d.branco ? '' : esc(texto(d.o.numero_os))}</strong></div>
      </div>
    </header>`;
}

function linhaEntrada(d) {
  const o = d.o;
  return `
    <div class="grade grade-data solta">
      <div class="r">Data de entrada</div>
      ${valorData(o.data_entrada)}
      <div class="r">Técnico</div>
      ${valor(o.tecnico, { forte: true, extra: d.tecnicoDoc })}
    </div>`;
}

function secao1(d, p) {
  const o = d.o;
  return `
    <section class="secao s1">
      ${tituloSecao(1, 'Identificação do equipamento')}
      <div class="grade grade-4">
        <div class="r">Cliente</div>
        ${valor(o.cliente_nome, { forte: true })}
        <div class="r">${esc(d.rotuloDocumento)}</div>
        ${valor(d.documento)}

        <div class="r">Equipamento / marca / modelo</div>
        ${valor(o.equipamento, { forte: true })}
        <div class="r">Nº de série</div>
        ${valor(o.numero_serie, { forte: true })}

        <div class="r">PAM<small>Portaria de aprovação de modelo</small></div>
        ${valor(o.pam)}
        <div class="r">Capacidade</div>
        ${valor(o.capacidade)}

        <div class="r r-span2">Lacres de entrada<small>Encontrados na balança</small></div>
        ${valorLacre(1, o.lacre1)}
        <div class="r r-span2">Lacres de saída<small>Aplicados após o reparo</small></div>
        ${valorLacre(1, o.lacre_saida1)}
        ${valorLacre(2, o.lacre2)}
        ${valorLacre(2, o.lacre_saida2)}
        <div class="r">Selo de reparo Nº</div>
        ${valor(o.selo)}
        <div class="r">Cidade</div>
        ${valor(d.cidade)}

        <div class="r">Acessórios recebidos</div>
        <div class="v opcoes span3">
          ${d.acessorios.map(opcao).join('')}
          <span class="outros"><span>Outros:</span><span class="linha">${esc(texto(o.acessorios_outros))}</span></span>
        </div>

        <div class="r topo">Defeito relatado / solicitação do cliente</div>
        ${bloco({
          tipo: 'texto',
          n: p.linhas.defeito,
          classe: 'span3',
          conteudo: d.branco ? null : `<p>${esc(texto(o.defeito_relatado))}</p>`,
        })}

        <div class="r">Tensão de entrada</div>
        <div class="v opcoes">${d.tensoesEntrada.map(opcao).join('')}</div>
        <div class="r">Tensão testada na saída</div>
        <div class="v opcoes">${d.tensoesSaida.map(opcao).join('')}</div>
      </div>
    </section>`;
}

const marcasLinha = (v) =>
  ['C', 'NC', 'NA'].map((m, j) => `<td class="m${j === 0 ? ' sep' : ''}">${caixa(v === m ? m : '')}</td>`).join('');

/**
 * Detalhes das não conformidades (itens do checklist com observação).
 * modo 'linhas': uma por linha; modo 'fluxo': texto corrido (mais compacto).
 * k: quantas mostrar inteiras; parcial: nº de caracteres da observação seguinte (cortada).
 */
function htmlNC(ncs, { modo = 'linhas', k = ncs.length, parcial = 0 } = {}) {
  const visiveis = ncs.slice(0, k);
  if (parcial > 0 && ncs[k]) visiveis.push({ ...ncs[k], obs: cortar(ncs[k].obs, parcial) });
  const resto = ncs.length - visiveis.length;
  const entradas = visiveis.map((it) => `<span class="nc"><b>${it.n}. ${esc(it.item)}:</b> ${esc(it.obs)}</span>`);
  if (resto > 0) entradas.push(`<span class="mais">+ ${plural(resto, 'registro', 'registros')} na OS</span>`);
  return modo === 'linhas'
    ? `<ul class="lista-nc">${entradas.map((e) => `<li>${e}</li>`).join('')}</ul>`
    : `<p class="nc-fluxo">${entradas.join('<span class="sep"> • </span>')}</p>`;
}

function secao2(d, p) {
  const linhas = d.itens
    .map(
      (it, i) => `
        <tr>
          <td class="n">${i + 1}</td>
          <td class="item">${esc(it.item)}</td>
          ${marcasLinha(it.entrada)}${marcasLinha(it.saida)}
        </tr>`
    )
    .join('');

  const legenda = d.branco
    ? `<b>LEGENDA:</b>
       <span>C = Conforme</span><span class="divisor">·</span>
       <span>NC = Não conforme</span><span class="divisor">·</span>
       <span>N/A = Não se aplica</span>`
    : `<b>LEGENDA:</b>
       <span class="item-leg">${caixa('C', 'cx-mini')} C = Conforme</span>
       <span class="item-leg">${caixa('NC', 'cx-mini')} NC = Não conforme</span>
       <span class="item-leg">${caixa('NA', 'cx-mini')} N/A = Não se aplica</span>`;

  let detalhes = null; // em branco: linhas de escrita
  if (!d.branco) {
    if (d.ncs.length) detalhes = htmlNC(d.ncs);
    else if (d.checklistPreenchido && !d.temNC) detalhes = '<p class="vazio">Nenhuma não conformidade registrada.</p>';
    else detalhes = '';
  }

  return `
    <section class="secao s2">
      ${tituloSecao(2, 'Checklist funcional – marque C, NC ou N/A')}
      <table class="ck">
        <colgroup>
          <col class="c-n" /><col />
          <col class="c-m" /><col class="c-m" /><col class="c-m" />
          <col class="c-m" /><col class="c-m" /><col class="c-m" />
        </colgroup>
        <thead>
          <tr class="h1">
            <th class="n" rowspan="2">Nº</th>
            <th class="item" rowspan="2">ITEM DE VERIFICAÇÃO</th>
            <th class="grupo sep" colspan="3">NA ENTRADA</th>
            <th class="grupo sep" colspan="3">APÓS MANUTENÇÃO</th>
          </tr>
          <tr class="h2">
            <th class="sep">C</th><th>NC</th><th>N/A</th>
            <th class="sep">C</th><th>NC</th><th>N/A</th>
          </tr>
        </thead>
        <tbody>${linhas}</tbody>
      </table>
      <div class="legenda">
        ${legenda}
        <span class="nota"><span class="divisor">|</span>&nbsp; Registre detalhes das não conformidades abaixo.</span>
      </div>
      <div class="grade grade-2">
        <div class="r topo">Detalhes das não conformidades</div>
        ${bloco({ tipo: 'nc', n: p.linhas.nc, conteudo: detalhes })}
      </div>
    </section>`;
}

/**
 * Conteúdo do bloco "Serviço executado / peças substituídas" (sem valores).
 * modo 'lista': serviços e peças em colunas, um por linha; 'fluxo': texto corrido por grupo.
 * limite: máximo de itens por grupo (o excedente vira "+ N itens"); textoMax: caracteres do texto.
 */
function htmlServico(d, { modo = 'lista', limite = Infinity, textoMax = Infinity } = {}) {
  const partes = [];
  const t = texto(d.o.servico_executado);
  if (t) partes.push(`<p class="txt-servico">${esc(cortar(t, textoMax))}</p>`);

  const grupo = (titulo, lista) => {
    if (!lista.length) return '';
    const max = Math.max(0, limite);
    const mostrar = lista.length > max ? lista.slice(0, max) : lista;
    const resto = lista.length - mostrar.length;
    const mais = resto > 0 ? `+ ${plural(resto, 'item', 'itens')}` : '';
    if (modo === 'lista') {
      const lis = mostrar.map((i) => `<li><b>${esc(i.q)}</b>${esc(i.desc)}</li>`);
      if (mais) lis.push(`<li class="mais">${mais}</li>`);
      return `<div class="grupo"><div class="grupo-t">${titulo}</div><ul>${lis.join('')}</ul></div>`;
    }
    const itens = mostrar.map((i) => `<span class="it"><b>${esc(i.q)}</b> ${esc(i.desc)}</span>`);
    if (mais) itens.push(`<span class="mais">${mais}</span>`);
    return `<p class="grupo-fluxo"><span class="grupo-t">${titulo}:</span> ${itens.join('<span class="sep"> · </span>')}</p>`;
  };

  const gs = [grupo('Serviços', d.servicos), grupo('Peças', d.pecas)].filter(Boolean);
  if (gs.length) {
    const classe = modo === 'lista' ? `itens-os${gs.length > 1 ? ' duas' : ''}` : 'itens-os fluxo';
    partes.push(`<div class="${classe}">${gs.join('')}</div>`);
  }
  return partes.join('');
}

function secao3(d, p) {
  const o = d.o;
  const comSituacao = d.liberado || d.aguardando;
  const tecnico = !d.branco && texto(o.tecnico) ? [texto(o.tecnico), d.tecnicoDoc].filter(Boolean).join(' · ') : '';
  return `
    <section class="secao s3">
      ${tituloSecao(3, 'Serviço executado, peças e observações')}
      <div class="grade grade-2 elastico">
        <div class="r topo">Serviço executado / peças substituídas</div>
        <div class="bloco" data-tipo="servico">${
          d.branco ? '<div class="linhas"></div>' : `<div class="conteudo">${htmlServico(d)}</div>`
        }</div>
      </div>
      <div class="grade grade-2">
        <div class="r topo">Observações / pendências / recomendações ao cliente</div>
        ${bloco({ tipo: 'texto', n: p.linhas.obs, conteudo: d.branco ? null : `<p>${esc(texto(o.observacoes))}</p>` })}
      </div>
      <div class="grade grade-4">
        <div class="r">Situação</div>
        <div class="v opcoes">
          ${opcao({ rotulo: 'Liberado', marcada: d.liberado })}
          ${opcao({ rotulo: 'Aguardando peça', marcada: d.aguardando })}
        </div>
        <div class="r">Data da situação</div>
        ${comSituacao ? valorData(o.data_situacao) : guiaData}
      </div>
      <div class="assinaturas">
        <div class="ass">
          <div class="linha-ass"></div>
          <div class="leg">Assinatura do técnico${tecnico ? `<span class="nome"> — ${esc(tecnico)}</span>` : ''}</div>
        </div>
        <div class="ass">
          <div class="linha-ass"></div>
          <div class="leg">Assinatura do cliente / recebedor</div>
        </div>
      </div>
    </section>`;
}

function rodape(d) {
  const e = d.empresa;
  const direita = [e.nome || 'BALANÇAS.COM', e.cnpj ? `CNPJ ${e.cnpj}` : '', e.permissionaria ? `Permissionária ${e.permissionaria}` : '']
    .map(texto)
    .filter(Boolean)
    .join(' · ');
  return `<footer class="rodape"><span>${esc(d.rodape)}</span><span>${esc(direita)}</span></footer>`;
}

// ---------------------------------------------------------------------------
// Encaixe de textos (versão preenchida)
// ---------------------------------------------------------------------------
const pt = (el, v) => (el.style.fontSize = `${v.toFixed(2)}pt`);
const ptAtual = (el) => parseFloat(getComputedStyle(el).fontSize) * 0.75; // px → pt
const cabeLargura = (el) => el.scrollWidth <= el.clientWidth + 0.5;
const cabeAltura = (el) => el.scrollHeight <= el.clientHeight + 0.5;

/** Reduz a fonte até `condicao()` ser verdadeira ou chegar ao mínimo. */
function reduzirAte(el, condicao, maximo, minimo, passo = 0.2) {
  let v = maximo;
  pt(el, v);
  while (!condicao() && v > minimo) {
    v = Math.max(minimo, v - passo);
    pt(el, v);
  }
  return condicao();
}

/** Corta o texto do elemento (busca binária) até `condicao()` ser verdadeira. */
function cortarAte(el, original, condicao) {
  let lo = 0;
  let hi = original.length;
  while (lo < hi) {
    const meio = Math.ceil((lo + hi) / 2);
    el.textContent = cortar(original, meio);
    if (condicao()) lo = meio;
    else hi = meio - 1;
  }
  el.textContent = cortar(original, lo);
}

/**
 * Textos de uma linha: reduz a fonte; se ainda não couber, quebra em até 2 linhas
 * (reduzindo mais um pouco) e, em último caso, corta com "…".
 */
function encaixarLinhasSimples() {
  for (const el of pagina.querySelectorAll('.ck td.item, .opcoes')) {
    if (cabeLargura(el) || reduzirAte(el, () => cabeLargura(el), ptAtual(el), 6.6)) continue;
    if (el.classList.contains('opcoes')) el.classList.add('quebra'); // muitas opções: quebra a linha
  }
  for (const el of pagina.querySelectorAll('.v .t, .outros .linha')) {
    if (cabeLargura(el)) continue;
    if (reduzirAte(el, () => cabeLargura(el), ptAtual(el), 7.6)) continue;
    el.classList.add('duas');
    if (reduzirAte(el, () => cabeAltura(el), 7.6, 6.2)) continue;
    cortarAte(el, el.textContent, () => cabeAltura(el));
  }
}

const cabeNoBloco = (b) => {
  const c = b.querySelector('.conteudo');
  return !c || c.offsetHeight <= b.clientHeight + 0.5;
};

function encaixarTexto(b) {
  const c = b.querySelector('.conteudo');
  if (!c || reduzirAte(c, () => cabeNoBloco(b), 8.4, 6.8)) return;
  const p = c.querySelector('p');
  if (p) cortarAte(p, p.textContent, () => cabeNoBloco(b));
}

function encaixarNC(b, ncs) {
  const c = b.querySelector('.conteudo');
  const cabe = () => cabeNoBloco(b);
  c.innerHTML = htmlNC(ncs, { modo: 'linhas' });
  if (reduzirAte(c, cabe, 8.2, 7.2)) return;
  c.innerHTML = htmlNC(ncs, { modo: 'fluxo' });
  if (reduzirAte(c, cabe, 7.8, 6.6)) return;
  // Mostra o máximo de registros inteiros e completa o espaço com o seguinte cortado.
  let k = ncs.length - 1;
  for (; k > 0; k--) {
    c.innerHTML = htmlNC(ncs, { modo: 'fluxo', k });
    if (cabe()) break;
  }
  let lo = 0;
  let hi = ncs[k]?.obs.length || 0;
  while (lo < hi) {
    const meio = Math.ceil((lo + hi) / 2);
    c.innerHTML = htmlNC(ncs, { modo: 'fluxo', k, parcial: meio });
    if (cabe()) lo = meio;
    else hi = meio - 1;
  }
  c.innerHTML = htmlNC(ncs, { modo: 'fluxo', k, parcial: lo >= 12 ? lo : 0 });
}

/** Bloco de serviço: ocupa o espaço que sobrar na folha. */
function encaixarServico(d) {
  const b = pagina.querySelector('.bloco[data-tipo="servico"]');
  if (!b) return;
  if (d.branco) {
    const n = Math.max(1, Math.floor(b.clientHeight / PX_POR_MM / H_LINHA_MM + 0.005));
    b.innerHTML = linhasEscrita(n);
    return;
  }
  const c = b.querySelector('.conteudo');
  const cabe = () => cabeNoBloco(b);
  const desenharServico = (opcoes) => (c.innerHTML = htmlServico(d, opcoes));

  // 1) Lista em colunas, reduzindo a fonte.
  if (reduzirAte(c, cabe, 8.4, 7.2)) return;
  // 2) Itens em texto corrido.
  desenharServico({ modo: 'fluxo' });
  if (reduzirAte(c, cabe, 7.8, 6.8)) return;
  // 3) Limita o texto a ~3 linhas, depois reduz a quantidade de itens mostrados.
  const t = texto(d.o.servico_executado);
  const p = () => c.querySelector('.txt-servico');
  let textoMax = Infinity;
  if (p()) {
    const alturaLinha = ptAtual(c) * 1.3 * (25.4 / 72) * PX_POR_MM;
    cortarAte(p(), t, () => p().offsetHeight <= alturaLinha * 3 + 1);
    textoMax = p().textContent.endsWith('…') ? p().textContent.length - 1 : Infinity;
    if (cabe()) return;
  }
  const maior = Math.max(d.servicos.length, d.pecas.length);
  for (let limite = maior - 1; limite >= 1; limite--) {
    desenharServico({ modo: 'fluxo', limite, textoMax });
    if (cabe()) return;
  }
  // 4) Último recurso: corta o texto até caber.
  desenharServico({ modo: 'fluxo', limite: 1, textoMax });
  if (p() && !cabe()) cortarAte(p(), p().textContent, cabe);
}

// ---------------------------------------------------------------------------
// Desenho + ajuste automático para caber em uma folha
// ---------------------------------------------------------------------------
function desenhar(d, p) {
  pagina.style.setProperty('--h-ck', `${p.hCk.toFixed(2)}mm`);
  pagina.style.setProperty('--cx', `${Math.min(3.8, Math.max(3, p.hCk - 1.6)).toFixed(2)}mm`);
  pagina.style.setProperty('--min-el', `${p.linhas.servico * H_LINHA_MM + 2 * BORDA_MM + 0.1}mm`);
  pagina.classList.toggle('compacta', p.compacta);
  pagina.innerHTML = [cabecalho(d), linhaEntrada(d), secao1(d, p), secao2(d, p), secao3(d, p), rodape(d)].join('');
  encaixarLinhasSimples();
  if (!d.branco) {
    for (const b of pagina.querySelectorAll('.bloco[data-tipo="texto"]')) encaixarTexto(b);
    const nc = pagina.querySelector('.bloco[data-tipo="nc"]');
    if (nc && d.ncs.length) encaixarNC(nc, d.ncs);
  }
}

/** Altura natural do conteúdo menos a área útil (mm). Positivo = não cabe. */
function medirExcesso() {
  pagina.classList.add('medindo');
  const altura = pagina.getBoundingClientRect().height;
  pagina.classList.remove('medindo');
  return altura / PX_POR_MM - ALTURA_UTIL_MM;
}

function ajustar(d) {
  const n = Math.max(1, d.itens.length);
  const p = {
    hCk: n <= 12 ? Math.min(7, 75 / n) : 6.25,
    compacta: false,
    linhas: { defeito: 2, nc: 2, servico: 3, obs: 2 },
  };
  const reduzirCk = (minimo, excesso) => {
    if (p.hCk <= minimo + 0.01) return false;
    p.hCk = Math.max(minimo, p.hCk - Math.max(0.1, excesso / n));
    return true;
  };
  const menosLinhas = (campo, minimo) => {
    if (p.linhas[campo] <= minimo) return false;
    p.linhas[campo]--;
    return true;
  };
  // Ordem de compactação: do menos ao mais perceptível. Em branco, preserva as linhas de
  // escrita; preenchida, preserva o espaço dos textos (as marcações já vêm impressas).
  // Defeito e observações ficam com 2 linhas no mínimo: os rótulos ocupam essa altura.
  const passos = d.branco
    ? [
        (e) => reduzirCk(5.6, e),
        () => !p.compacta && (p.compacta = true),
        (e) => reduzirCk(5, e),
        () => menosLinhas('servico', 2),
        () => menosLinhas('nc', 1),
        (e) => reduzirCk(4.4, e),
        () => menosLinhas('servico', 1),
        (e) => reduzirCk(3.8, e),
      ]
    : [
        (e) => reduzirCk(5.6, e),
        () => !p.compacta && (p.compacta = true),
        (e) => reduzirCk(4.6, e),
        () => menosLinhas('servico', 2),
        (e) => reduzirCk(4.2, e),
        () => menosLinhas('nc', 1),
        () => menosLinhas('servico', 1),
        (e) => reduzirCk(3.8, e),
      ];

  let passo = 0;
  for (let tentativa = 0; tentativa < 80; tentativa++) {
    desenhar(d, p);
    const excesso = medirExcesso();
    if (excesso <= 0.05) break;
    let mudou = false;
    while (passo < passos.length && !(mudou = passos[passo](excesso))) passo++;
    if (!mudou) break; // nada mais a compactar: o excedente fica oculto, mas a folha continua única
  }
  encaixarServico(d);
  return p;
}

// ---------------------------------------------------------------------------
// Tela
// ---------------------------------------------------------------------------
function ajustarZoom() {
  const disponivel = document.documentElement.clientWidth - 24;
  const largura = 210 * PX_POR_MM;
  folha.style.zoom = disponivel < largura ? String(Math.max(0.3, disponivel / largura)) : '';
}

function mostrarErro(titulo, detalhe = '') {
  pagina.innerHTML = `<div class="aviso"><strong>${esc(titulo)}</strong>${esc(detalhe)}</div>`;
  pagina.removeAttribute('aria-busy');
  barraTitulo.textContent = titulo;
  document.body.dataset.pronto = 'erro';
}

async function esperarFontes() {
  try {
    await Promise.all([document.fonts.load('500 8pt Inter'), document.fonts.load('800 8pt Inter')]);
    await document.fonts.ready;
  } catch {
    /* segue com a fonte reserva (Arial) */
  }
}

async function esperarImagens() {
  const imgs = Array.from(pagina.querySelectorAll('img'));
  await Promise.all(imgs.map((img) => (img.complete ? null : img.decode().catch(() => {}))));
}

async function iniciar() {
  for (const el of document.querySelectorAll('[data-icone]')) el.innerHTML = icone(el.dataset.icone);
  btnImprimir.addEventListener('click', () => window.print());
  btnFechar.addEventListener('click', () => {
    window.close();
    // Se a janela não puder ser fechada (não foi aberta pelo sistema), volta para a aplicação.
    setTimeout(() => {
      location.href = emBranco ? '/' : `/#/ordens/${ordemId}`;
    }, 250);
  });
  addEventListener('resize', ajustarZoom);
  ajustarZoom();

  let cfg;
  let ordem = null;
  try {
    [cfg, ordem] = await Promise.all([api.get('/config'), emBranco ? null : api.get(`/ordens/${ordemId}`)]);
  } catch (e) {
    if (e.status === 404) mostrarErro('Ordem de serviço não encontrada', 'Ela pode ter sido excluída. Feche esta janela e abra a OS novamente.');
    else mostrarErro('Não foi possível montar o checklist', e.message);
    return;
  }

  const d = montarDados(cfg, ordem);
  const cliente = texto(ordem?.cliente_nome);
  barraTitulo.textContent = d.branco
    ? 'Checklist técnico em branco'
    : `Checklist técnico · OS nº ${texto(ordem.numero_os) || '—'}${cliente ? ` — ${cliente}` : ''}`;
  // O título vira o nome sugerido do arquivo ao salvar em PDF.
  document.title = d.branco
    ? 'Checklist técnico em branco · BALANÇAS.COM'
    : `Checklist OS ${texto(ordem.numero_os) || ordem.numero}${cliente ? ` - ${cliente}` : ''}`;

  await esperarFontes();
  ajustar(d);
  await esperarImagens();

  pagina.removeAttribute('aria-busy');
  document.body.dataset.pronto = '1';
  btnImprimir.disabled = false;

  if (autoImprimir) requestAnimationFrame(() => setTimeout(() => window.print(), 150));
}

iniciar();
