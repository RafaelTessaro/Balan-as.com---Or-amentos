// Utilitários de interface compartilhados por todas as telas.

import { icone } from './icones.js';
export { icone };

// ---------------------------------------------------------------------------
// DOM e texto
// ---------------------------------------------------------------------------
export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => Array.from(raiz.querySelectorAll(sel));

export function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Destaca o termo buscado dentro do texto (já escapado). */
export function realcar(texto, termo) {
  const t = esc(texto);
  const q = String(termo || '').trim();
  if (!q) return t;
  const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const base = norm(String(texto ?? ''));
  const idx = base.indexOf(norm(q));
  if (idx < 0) return t;
  const original = String(texto ?? '');
  return (
    esc(original.slice(0, idx)) +
    '<mark>' +
    esc(original.slice(idx, idx + q.length)) +
    '</mark>' +
    esc(original.slice(idx + q.length))
  );
}

/** Insere os ícones nos elementos marcados com data-icone="nome". */
export function hidratarIcones(raiz = document) {
  for (const el of $$('[data-icone]', raiz)) {
    if (el.dataset.iconeOk) continue;
    el.insertAdjacentHTML('afterbegin', icone(el.dataset.icone));
    el.dataset.iconeOk = '1';
  }
}

export function definirTitulo(titulo) {
  document.title = titulo ? `${titulo} · BALANÇAS.COM` : 'BALANÇAS.COM — Checklist e Orçamentos';
}

export function debounce(fn, ms = 300) {
  let t;
  const f = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  f.cancelar = () => clearTimeout(t);
  return f;
}

// ---------------------------------------------------------------------------
// Formatação (pt-BR)
// ---------------------------------------------------------------------------
const fmtMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const moeda = (v) => fmtMoeda.format(Number(v) || 0).replace(/ /g, ' ');

export const numeroBR = (v, casas = 2) =>
  (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

/** Quantidade sem casas decimais desnecessárias: 1 → "1", 1.5 → "1,5". */
export const qtd = (v) => (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });

/** Converte "1.234,56", "1234,56" ou "1234.56" em número. */
export function lerNumero(texto) {
  if (typeof texto === 'number') return texto;
  let s = String(texto ?? '').replace(/[^\d,.-]/g, '');
  if (!s) return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

export function dataBR(iso) {
  if (!iso) return '';
  const s = String(iso);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return s;
  if (s.length > 10) {
    const d = new Date(s);
    return d.toLocaleDateString('pt-BR');
  }
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function dataHoraBR(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

export function tempoRelativo(iso) {
  if (!iso) return '';
  const seg = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seg < 45) return 'agora há pouco';
  const min = Math.round(seg / 60);
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  if (d === 1) return 'ontem';
  if (d < 30) return `há ${d} dias`;
  return dataBR(iso);
}

export function hojeISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Máscara simples de telefone brasileiro enquanto digita. */
export function mascaraTelefone(v) {
  const d = String(v || '').replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Máscara de CPF/CNPJ conforme a quantidade de dígitos. */
export function mascaraDocumento(v) {
  const d = String(v || '').replace(/\D/g, '').slice(0, 14);
  if (d.length <= 11) {
    return d
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

// ---------------------------------------------------------------------------
// Status das ordens de serviço
// ---------------------------------------------------------------------------
export const STATUS_ICONE = {
  em_analise: 'search',
  aguardando_aprovacao: 'clock',
  aprovada: 'thumbs-up',
  aguardando_peca: 'package',
  concluida: 'circle-check',
  entregue: 'hand',
  recusada: 'circle-x',
};

export const STATUS_ROTULO = {
  em_analise: 'Em análise',
  aguardando_aprovacao: 'Aguardando aprovação',
  aprovada: 'Aprovada',
  aguardando_peca: 'Aguardando peça',
  concluida: 'Liberada',
  entregue: 'Entregue',
  recusada: 'Recusada',
};

export function seloStatus(status) {
  return `<span class="selo selo-${esc(status)}">${icone(STATUS_ICONE[status] || 'circle-dashed')}${esc(
    STATUS_ROTULO[status] || status
  )}</span>`;
}

// ---------------------------------------------------------------------------
// Notificações
// ---------------------------------------------------------------------------
export function toast(mensagem, tipo = 'sucesso', duracao = 3800) {
  const area = $('#toasts');
  if (!area) return;
  const el = document.createElement('div');
  el.className = `toast ${tipo}`;
  const ic = tipo === 'erro' ? 'circle-alert' : tipo === 'info' ? 'info' : 'circle-check';
  el.innerHTML = `${icone(ic)}<div>${esc(mensagem)}</div>`;
  area.appendChild(el);
  const fechar = () => {
    el.classList.add('saindo');
    setTimeout(() => el.remove(), 220);
  };
  el.addEventListener('click', fechar);
  setTimeout(fechar, tipo === 'erro' ? duracao + 2500 : duracao);
}

export function erro(e) {
  console.error(e);
  toast(e?.message || String(e), 'erro');
}

// ---------------------------------------------------------------------------
// Modal (janela central)
// ---------------------------------------------------------------------------
/**
 * Abre um modal. `corpo` pode ser HTML (string) ou um elemento.
 * `acoes`: [{ texto, classe, valor, icone, tipo: 'submit' }]
 * Retorna { el, corpo, fechar(valor), resultado: Promise }.
 */
export function abrirModal({ titulo, corpo = '', acoes = [], tamanho = '', aoAbrir } = {}) {
  // Sempre uma janela no centro da tela (o dono preferiu a painéis laterais).
  const fundo = document.createElement('div');
  fundo.className = 'modal-fundo';
  fundo.innerHTML = `
    <form class="modal ${esc(tamanho)}" role="dialog" aria-modal="true" aria-label="${esc(titulo)}" novalidate>
      <div class="modal-topo">
        <h3>${esc(titulo)}</h3>
        <button type="button" class="btn btn-fantasma btn-icone btn-p" data-fechar aria-label="Fechar">${icone('x')}</button>
      </div>
      <div class="modal-corpo"></div>
      ${
        acoes.length
          ? `<div class="modal-rodape">${acoes
              .map(
                (a, i) =>
                  `<button type="${a.tipo || 'button'}" class="btn ${esc(a.classe || '')}" data-acao="${i}">${
                    a.icone ? icone(a.icone) : ''
                  }${esc(a.texto)}</button>`
              )
              .join('')}</div>`
          : ''
      }
    </form>`;
  const form = fundo.querySelector('.modal');
  const areaCorpo = fundo.querySelector('.modal-corpo');
  if (typeof corpo === 'string') areaCorpo.innerHTML = corpo;
  else if (corpo) areaCorpo.appendChild(corpo);
  hidratarIcones(areaCorpo);

  let resolver;
  const resultado = new Promise((r) => (resolver = r));
  const anterior = document.activeElement;

  const fechar = (valor) => {
    document.removeEventListener('keydown', teclas);
    fundo.remove();
    if (anterior && anterior.focus) anterior.focus();
    resolver(valor);
  };
  const teclas = (e) => {
    if (e.key !== 'Escape') return;
    // Com modais empilhados (ex.: confirmação sobre um painel), fecha só o de cima.
    const abertos = document.querySelectorAll('.modal-fundo');
    if (abertos[abertos.length - 1] !== fundo) return;
    e.stopImmediatePropagation();
    fechar(undefined);
  };
  document.addEventListener('keydown', teclas);

  fundo.addEventListener('mousedown', (e) => {
    if (e.target === fundo) fechar(undefined);
  });
  fundo.querySelector('[data-fechar]').addEventListener('click', () => fechar(undefined));

  const executar = async (acao) => {
    if (acao.aoClicar) {
      const r = await acao.aoClicar({ form, fechar });
      if (r === false) return;
      if (r !== undefined) return fechar(r);
    }
    fechar(acao.valor);
  };
  fundo.querySelectorAll('[data-acao]').forEach((b) => {
    const acao = acoes[Number(b.dataset.acao)];
    if (acao.tipo === 'submit') return;
    b.addEventListener('click', () => executar(acao));
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const acao = acoes.find((a) => a.tipo === 'submit');
    if (acao) executar(acao);
  });

  document.body.appendChild(fundo);
  const foco = areaCorpo.querySelector('input:not([type=hidden]), textarea, select');
  setTimeout(() => (foco || form.querySelector('[data-acao]'))?.focus(), 30);
  if (aoAbrir) aoAbrir({ form, corpo: areaCorpo, fechar });
  return { el: form, corpo: areaCorpo, fechar, resultado };
}

/** Pergunta de confirmação. Retorna true/false. */
export async function confirmar({
  titulo = 'Confirmar',
  mensagem = '',
  confirmar: textoConfirmar = 'Confirmar',
  cancelar = 'Cancelar',
  perigo = false,
} = {}) {
  const m = abrirModal({
    titulo,
    tamanho: 'pequeno',
    corpo: `<p>${esc(mensagem)}</p>`,
    acoes: [
      { texto: cancelar, classe: 'btn-fantasma', valor: false },
      { texto: textoConfirmar, classe: perigo ? 'btn-perigo-cheio' : 'btn-primario', valor: true },
    ],
  });
  return Boolean(await m.resultado);
}

// ---------------------------------------------------------------------------
// Autocompletar
// ---------------------------------------------------------------------------
/**
 * Liga uma lista de sugestões a um <input>.
 * opcoes.buscar(q) -> Promise<array>
 * opcoes.item(obj, q) -> HTML do item
 * opcoes.escolher(obj) -> chamado ao escolher
 * opcoes.criar(q) -> opcional; mostra "+ Cadastrar “q”" no fim da lista
 * opcoes.rotuloCriar(q) -> texto do item de criação
 */
export function autocompletar(input, opcoes) {
  const raiz = input.parentElement;
  raiz.classList.add('auto');
  const lista = document.createElement('div');
  lista.className = 'auto-lista oculto';
  lista.setAttribute('role', 'listbox');
  raiz.appendChild(lista);

  let itens = [];
  let ativo = -1;
  let consulta = 0;
  let aberto = false;

  const fechar = () => {
    lista.classList.add('oculto');
    aberto = false;
    ativo = -1;
  };

  const desenhar = (q) => {
    const linhas = itens.map(
      (it, i) => `<div class="auto-item${i === ativo ? ' ativo' : ''}" data-i="${i}" role="option">${opcoes.item(it, q)}</div>`
    );
    if (!itens.length && !opcoes.criar) linhas.push('<div class="auto-vazio">Nada encontrado.</div>');
    if (!itens.length && opcoes.criar && !q.trim()) linhas.push('<div class="auto-vazio">Digite para buscar…</div>');
    if (opcoes.criar && q.trim()) {
      const i = itens.length;
      linhas.push(
        `<div class="auto-item criar${i === ativo ? ' ativo' : ''}" data-i="${i}" role="option">${icone('plus')}${esc(
          opcoes.rotuloCriar ? opcoes.rotuloCriar(q.trim()) : `Cadastrar “${q.trim()}”`
        )}</div>`
      );
    }
    lista.innerHTML = linhas.join('');
    lista.classList.remove('oculto');
    aberto = true;
  };

  const atualizar = async () => {
    const q = input.value;
    const n = ++consulta;
    const r = await opcoes.buscar(q);
    if (n !== consulta) return;
    itens = r || [];
    ativo = itens.length ? 0 : opcoes.criar && q.trim() ? 0 : -1;
    if (document.activeElement === input) desenhar(q);
  };
  const atualizarDepois = debounce(() => {
    buscaPendente = false;
    atualizar();
  }, 150);
  let buscaPendente = false;

  const escolher = (i) => {
    const q = input.value.trim();
    fechar();
    if (i < itens.length) opcoes.escolher(itens[i]);
    else if (opcoes.criar && q) opcoes.criar(q);
  };

  input.setAttribute('autocomplete', 'off');
  input.addEventListener('input', () => {
    buscaPendente = true;
    atualizarDepois();
  });
  input.addEventListener('focus', atualizar);
  input.addEventListener('blur', () => setTimeout(fechar, 150));
  input.addEventListener('keydown', async (e) => {
    // Enter logo após digitar: termina a busca antes de escolher.
    if (e.key === 'Enter' && buscaPendente) {
      e.preventDefault();
      atualizarDepois.cancelar();
      buscaPendente = false;
      await atualizar();
      if (aberto && ativo >= 0) escolher(ativo);
      return;
    }
    const total = itens.length + (opcoes.criar && input.value.trim() ? 1 : 0);
    if (!aberto && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      atualizar();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      ativo = Math.min(total - 1, ativo + 1);
      desenhar(input.value);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      ativo = Math.max(0, ativo - 1);
      desenhar(input.value);
    } else if (e.key === 'Enter' && aberto && ativo >= 0) {
      e.preventDefault();
      escolher(ativo);
    } else if (e.key === 'Escape' && aberto) {
      e.stopPropagation();
      fechar();
    }
  });
  lista.addEventListener('mousedown', (e) => {
    const el = e.target.closest('[data-i]');
    if (!el) return;
    e.preventDefault();
    escolher(Number(el.dataset.i));
  });

  return { fechar, atualizar };
}

// ---------------------------------------------------------------------------
// Diversos
// ---------------------------------------------------------------------------
export function carregandoHTML(texto = 'Carregando…') {
  return `<div class="carregando">${icone('loader-circle', 'girando')}<span>${esc(texto)}</span></div>`;
}

export function vazioHTML({ icone: ic = 'clipboard-list', titulo, texto = '', acao = '' }) {
  return `<div class="vazio">${icone(ic, 'i-xg')}<h3>${esc(titulo)}</h3>${texto ? `<p>${esc(texto)}</p>` : ''}${acao}</div>`;
}

/** Lê arquivo escolhido pelo usuário como Data URL. */
export function lerArquivo(arquivo) {
  return new Promise((ok, falha) => {
    const r = new FileReader();
    r.onload = () => ok(r.result);
    r.onerror = () => falha(new Error('Não foi possível ler o arquivo.'));
    r.readAsDataURL(arquivo);
  });
}

/** Lê arquivo de texto (ex.: backup JSON). */
export function lerTexto(arquivo) {
  return new Promise((ok, falha) => {
    const r = new FileReader();
    r.onload = () => ok(r.result);
    r.onerror = () => falha(new Error('Não foi possível ler o arquivo.'));
    r.readAsText(arquivo);
  });
}
