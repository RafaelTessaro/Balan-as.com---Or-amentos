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
import { esc, dataBR, qtd, icone, STATUS_ROTULO } from '/js/ui.js';

const PX_POR_MM = 96 / 25.4;
const ALTURA_UTIL_MM = 276; // 297 mm − 2 × 10 mm de margem, com 1 mm de folga
const H_LINHA_MM = 7; // altura mínima de uma linha para escrita à mão

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

const texto = (v) => String(v ?? '').trim();

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

const cortar = (t, n) => (n >= t.length ? t : `${t.slice(0, n).replace(/[\s,.;:–-]+$/, '')}…`);

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
    telefone: '',
  };

  const itensOrdem = Array.isArray(o.checklist) ? o.checklist.filter((c) => texto(c?.item)) : [];
  d.itens = itensOrdem.length
    ? itensOrdem.map((c) => ({
        item: texto(c.item),
        entrada: marcacao(c.entrada),
        saida: marcacao(c.saida),
        obs: texto(c.obs),
      }))
    : (ck.itens || []).map((item) => ({ item, entrada: '', saida: '', obs: '' }));

  d.acessorios = opcoesCom(ck.acessorios || [], Array.isArray(o.acessorios) ? o.acessorios : []);
  d.tensoesEntrada = opcoesCom(ck.tensoesEntrada || [], [o.tensao_entrada]);
  d.tensoesSaida = opcoesCom(ck.tensoesSaida || [], [o.tensao_saida]);

  if (ordem) {
    const tec = (cfg.tecnicos || []).find((t) => chave(t?.nome) && chave(t.nome) === chave(o.tecnico));
    d.tecnicoDoc = texto(tec?.documento);
    d.telefone = texto(o.cliente_telefone) || texto(o.cliente?.whatsapp) || texto(o.cliente?.telefone);
    d.liberado = ['concluida', 'entregue'].includes(o.status);
    d.aguardando = o.status === 'aguardando_peca';
    d.ncs = d.itens
      .map((it, i) => ({ ...it, n: i + 1 }))
      .filter((it) => it.obs);
    d.temNC = d.itens.some((it) => it.entrada === 'NC' || it.saida === 'NC');
    const itens = Array.isArray(o.itens) ? o.itens : [];
    const linhaItem = (i) => ({ q: `${qtd(i.quantidade || 1)}×`, desc: texto(i.descricao) });
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

/** Bloco de várias linhas com altura fixa (n linhas de 7 mm). */
function bloco({ tipo, n, conteudo = '', classe = '' }) {
  const corpo = conteudo ? `<div class="conteudo">${conteudo}</div>` : linhasEscrita(n);
  return `<div class="bloco${classe ? ` ${classe}` : ''}" data-tipo="${tipo}" style="height:${n * H_LINHA_MM}mm">${corpo}</div>`;
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
        <div class="cab-os-num"><span>Nº</span><strong>${d.branco ? '' : esc(d.o.numero ?? '')}</strong></div>
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
  const outros = texto(o.acessorios_outros);
  const defeito = texto(o.defeito_relatado);
  return `
    <section class="secao s1">
      ${tituloSecao(1, 'Identificação do equipamento')}
      <div class="grade grade-4">
        <div class="r">Cliente</div>
        ${valor(o.cliente_nome, { forte: true })}
        <div class="r">Telefone</div>
        ${valor(d.telefone)}

        <div class="r">Equipamento / marca / modelo</div>
        ${valor(o.equipamento, { forte: true })}
        <div class="r">Nº de série</div>
        ${valor(o.numero_serie, { forte: true })}

        <div class="r">PAM<small>Portaria de aprovação de modelo</small></div>
        ${valor(o.pam)}
        <div class="r">Capacidade</div>
        ${valor(o.capacidade)}

        <div class="r r-span2">Lacre Nº<small>Encontrados na entrada</small></div>
        ${valorLacre(1, o.lacre1)}
        <div class="r">Lacres aplicados</div>
        ${valor(o.lacres_aplicados)}
        ${valorLacre(2, o.lacre2)}
        <div class="r">Selo de reparo Nº</div>
        ${valor(o.selo)}

        <div class="r">Acessórios recebidos</div>
        <div class="v opcoes span3">
          ${d.acessorios.map(opcao).join('')}
          <span class="outros"><span>Outros:</span><span class="linha">${esc(outros)}</span></span>
        </div>

        <div class="r topo">Defeito relatado / solicitação do cliente</div>
        ${bloco({
          tipo: 'texto',
          n: p.linhas.defeito,
          classe: 'span3',
          conteudo: d.branco ? '' : `<p>${esc(defeito)}</p>`,
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

function listaNC(ncs, limite = ncs.length) {
  const mostrar = limite < ncs.length ? ncs.slice(0, Math.max(0, limite - 1)) : ncs;
  const resto = ncs.length - mostrar.length;
  const lis = mostrar.map((it) => `<li><b>${it.n}. ${esc(it.item)}:</b> ${esc(it.obs)}</li>`);
  if (resto > 0) lis.push(`<li class="mais">+ ${resto} ${resto === 1 ? 'registro' : 'registros'} na OS</li>`);
  return `<ul class="lista-nc${ncs.length > 3 ? ' colunas' : ''}">${lis.join('')}</ul>`;
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

  let detalhes = '';
  if (!d.branco) {
    if (d.ncs.length) detalhes = listaNC(d.ncs);
    else if (!d.temNC) detalhes = '<p class="vazio">Nenhuma não conformidade registrada.</p>';
    else detalhes = '<p></p>';
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

function conteudoServico(d, limite = Infinity) {
  const partes = [];
  const t = texto(d.o.servico_executado);
  if (t) partes.push(`<p>${esc(t)}</p>`);
  const grupo = (titulo, lista) => {
    if (!lista.length) return '';
    const max = Math.max(1, limite);
    const mostrar = lista.length > max ? lista.slice(0, max - 1) : lista;
    const resto = lista.length - mostrar.length;
    const lis = mostrar.map((i) => `<li><b>${esc(i.q)}</b>${esc(i.desc)}</li>`);
    if (resto > 0) lis.push(`<li class="mais">+ ${resto} ${resto === 1 ? 'item' : 'itens'}</li>`);
    return `<div class="grupo"><div class="grupo-t">${titulo}</div><ul>${lis.join('')}</ul></div>`;
  };
  const gs = [grupo('Serviços', d.servicos), grupo('Peças', d.pecas)].filter(Boolean);
  if (gs.length) partes.push(`<div class="itens-os${gs.length > 1 ? ' duas' : ''}">${gs.join('')}</div>`);
  return partes.join('');
}

function secao3(d, p) {
  const o = d.o;
  const obs = texto(o.observacoes);
  const comSituacao = d.liberado || d.aguardando;
  const situacaoAtual =
    !d.branco && !comSituacao && o.status
      ? `<span class="situacao-atual">No sistema: ${esc(STATUS_ROTULO[o.status] || o.status_rotulo || o.status)}</span>`
      : '';
  const servico = d.branco ? '' : conteudoServico(d);
  return `
    <section class="secao s3">
      ${tituloSecao(3, 'Serviço executado, peças e observações')}
      <div class="grade grade-2 elastico">
        <div class="r topo">Serviço executado / peças substituídas</div>
        <div class="bloco" data-tipo="servico">${
          d.branco ? '<div class="linhas"></div>' : `<div class="conteudo">${servico}</div>`
        }</div>
      </div>
      <div class="grade grade-2">
        <div class="r topo">Observações / pendências / recomendações ao cliente</div>
        ${bloco({ tipo: 'texto', n: p.linhas.obs, conteudo: d.branco ? '' : `<p>${esc(obs)}</p>` })}
      </div>
      <div class="grade grade-4">
        <div class="r">Situação</div>
        <div class="v opcoes">
          ${opcao({ rotulo: 'Liberado', marcada: d.liberado })}
          ${opcao({ rotulo: 'Aguardando peça', marcada: d.aguardando })}
          ${situacaoAtual}
        </div>
        <div class="r">Data da situação</div>
        ${comSituacao ? valorData(o.data_situacao) : guiaData}
      </div>
      <div class="assinaturas">
        <div class="ass">
          <div class="linha-ass"></div>
          <div class="leg">Assinatura do técnico</div>
          ${
            !d.branco && texto(o.tecnico)
              ? `<div class="nome">${esc(o.tecnico)}${d.tecnicoDoc ? ` · ${esc(d.tecnicoDoc)}` : ''}</div>`
              : ''
          }
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
// Desenho + ajuste automático para caber em uma folha
// ---------------------------------------------------------------------------
function desenhar(d, p) {
  pagina.style.setProperty('--h-ck', `${p.hCk.toFixed(2)}mm`);
  pagina.style.setProperty('--cx', `${Math.min(3.8, Math.max(3, p.hCk - 1.4)).toFixed(2)}mm`);
  pagina.style.setProperty('--min-el', `${p.linhas.servico * H_LINHA_MM}mm`);
  pagina.classList.toggle('compacta', p.compacta);
  pagina.innerHTML = [cabecalho(d), linhaEntrada(d), secao1(d, p), secao2(d, p), secao3(d, p), rodape(d)].join('');
  encaixarLinhasSimples();
  if (!d.branco) {
    for (const b of pagina.querySelectorAll('.bloco[data-tipo="texto"]')) encaixarTexto(b);
    const nc = pagina.querySelector('.bloco[data-tipo="nc"]');
    if (nc && d.ncs.length) encaixarNC(nc, d);
  }
}

/** Altura natural do conteúdo menos a área útil (mm). Positivo = não cabe. */
function medirExcesso() {
  pagina.classList.add('medindo');
  const altura = pagina.getBoundingClientRect().height;
  pagina.classList.remove('medindo');
  return altura / PX_POR_MM - ALTURA_UTIL_MM;
}

/** Textos de uma linha: reduz a fonte até caber (o restante vira "…"). */
function encaixarLinhasSimples() {
  const alvos = pagina.querySelectorAll('.v .t, .outros .linha, .ck td.item, .opcoes');
  for (const el of alvos) {
    if (el.scrollWidth <= el.clientWidth + 0.5) continue;
    const base = parseFloat(getComputedStyle(el).fontSize) * 0.75; // px → pt
    let pt = base;
    const minimo = Math.min(base, 6.4);
    while (el.scrollWidth > el.clientWidth + 0.5 && pt > minimo) {
      pt = Math.max(minimo, pt - 0.2);
      el.style.fontSize = `${pt}pt`;
    }
  }
}

const cabeNoBloco = (b) => {
  const c = b.querySelector('.conteudo');
  return !c || c.offsetHeight <= b.clientHeight + 0.5;
};

/** Reduz a fonte de um bloco de texto; se ainda não couber, corta o texto com "…". */
function reduzirFonte(b, max = 8.4, min = 6.8) {
  const c = b.querySelector('.conteudo');
  if (!c) return true;
  let pt = max;
  c.style.fontSize = `${pt}pt`;
  while (!cabeNoBloco(b) && pt > min) {
    pt = Math.max(min, pt - 0.2);
    c.style.fontSize = `${pt}pt`;
  }
  return cabeNoBloco(b);
}

function truncarParagrafo(b, p) {
  const original = p.dataset.original ?? p.textContent;
  p.dataset.original = original;
  let lo = 0;
  let hi = original.length;
  while (lo < hi) {
    const meio = Math.ceil((lo + hi) / 2);
    p.textContent = cortar(original, meio);
    if (cabeNoBloco(b)) lo = meio;
    else hi = meio - 1;
  }
  p.textContent = cortar(original, lo);
}

function encaixarTexto(b) {
  if (reduzirFonte(b)) return;
  const p = b.querySelector('.conteudo p');
  if (p) truncarParagrafo(b, p);
}

function encaixarNC(b, d) {
  if (reduzirFonte(b, 8, 6.6)) return;
  const c = b.querySelector('.conteudo');
  for (let limite = d.ncs.length - 1; limite >= 1; limite--) {
    c.innerHTML = listaNC(d.ncs, limite);
    if (cabeNoBloco(b)) return;
  }
}

/** Bloco de serviço (ocupa o espaço que sobrar na folha). */
function finalizarServico(d) {
  const b = pagina.querySelector('.bloco[data-tipo="servico"]');
  if (!b) return;
  if (d.branco) {
    const n = Math.max(1, Math.floor(b.clientHeight / PX_POR_MM / H_LINHA_MM + 0.02));
    b.innerHTML = linhasEscrita(n);
    return;
  }
  if (reduzirFonte(b, 8.4, 7)) return;
  const c = b.querySelector('.conteudo');
  const maior = Math.max(d.servicos.length, d.pecas.length);
  for (let limite = maior - 1; limite >= 1; limite--) {
    c.innerHTML = conteudoServico(d, limite);
    if (cabeNoBloco(b)) return;
  }
  reduzirFonte(b, 7, 6.6);
  const p = c.querySelector('p');
  if (p && !cabeNoBloco(b)) truncarParagrafo(b, p);
}

function ajustar(d) {
  const n = Math.max(1, d.itens.length);
  const p = {
    hCk: n <= 12 ? Math.min(7, 74.4 / n) : 6.2,
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
  // Ordem de compactação: do menos ao mais perceptível.
  const passos = [
    (e) => reduzirCk(5.6, e),
    () => !p.compacta && (p.compacta = true),
    (e) => reduzirCk(5, e),
    () => menosLinhas('servico', 2),
    () => menosLinhas('nc', 1),
    (e) => reduzirCk(4.4, e),
    () => menosLinhas('obs', 1),
    () => menosLinhas('defeito', 1),
    () => menosLinhas('servico', 1),
  ];

  let passo = 0;
  for (let tentativa = 0; tentativa < 80; tentativa++) {
    desenhar(d, p);
    const excesso = medirExcesso();
    if (excesso <= 0.05) break;
    let mudou = false;
    while (passo < passos.length && !(mudou = passos[passo](excesso))) passo++;
    if (!mudou) break; // nada mais a compactar: o que sobrar fica oculto, mas a folha continua única
  }
  finalizarServico(d);
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
      location.href = !emBranco ? `/#/ordens/${ordemId}` : '/';
    }, 250);
  });
  addEventListener('resize', ajustarZoom);

  let cfg;
  let ordem = null;
  try {
    [cfg, ordem] = await Promise.all([api.get('/config'), emBranco ? null : api.get(`/ordens/${ordemId}`)]);
  } catch (e) {
    const titulo = e.status === 404 ? 'Ordem de serviço não encontrada' : 'Não foi possível montar o checklist';
    mostrarErro(titulo, e.status === 404 ? `Verifique o número da OS (id ${ordemId}).` : e.message);
    ajustarZoom();
    return;
  }

  const d = montarDados(cfg, ordem);
  const titulo = d.branco
    ? 'Checklist técnico em branco'
    : `Checklist técnico · OS nº ${ordem.numero}${texto(ordem.cliente_nome) ? ` — ${texto(ordem.cliente_nome)}` : ''}`;
  barraTitulo.textContent = titulo;
  document.title = d.branco
    ? 'Checklist técnico em branco · BALANÇAS.COM'
    : `Checklist OS ${ordem.numero}${texto(ordem.cliente_nome) ? ` - ${texto(ordem.cliente_nome)}` : ''}`;

  await esperarFontes();
  ajustar(d);
  await esperarImagens();

  pagina.removeAttribute('aria-busy');
  document.body.dataset.pronto = '1';
  btnImprimir.disabled = false;
  ajustarZoom();

  if (autoImprimir) requestAnimationFrame(() => setTimeout(() => window.print(), 150));
}

iniciar();
