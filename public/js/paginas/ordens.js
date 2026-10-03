// Lista de ordens de serviço com busca e filtro por situação.

import { api } from '../api.js';
import { navegar } from '../app.js';
import {
  $,
  esc,
  icone,
  moeda,
  dataBR,
  tempoRelativo,
  debounce,
  seloStatus,
  STATUS_ROTULO,
  definirTitulo,
  hidratarIcones,
  carregandoHTML,
  vazioHTML,
  realcar,
  erro,
} from '../ui.js';

function vencido(o, hoje) {
  if (o.status !== 'aguardando_aprovacao' || !o.orcamento_enviado_em) return false;
  const limite = new Date(o.orcamento_enviado_em);
  limite.setDate(limite.getDate() + (Number(o.validade_dias) || 10));
  return limite < hoje;
}

export async function montar(el, { query }) {
  definirTitulo('Ordens de serviço');
  let filtro = query.status || '';
  let busca = query.q || '';

  el.innerHTML = `
    <div class="pagina-topo">
      <div>
        <h1>Ordens de serviço</h1>
        <p class="subtitulo">Checklists, orçamentos e o andamento de cada equipamento.</p>
      </div>
      <div class="acoes">
        <a class="btn" href="/imprimir/checklist?branco=1" target="_blank" rel="noopener">${icone('printer')}Checklist em branco</a>
        <a class="btn btn-primario" href="#/ordens/nova">${icone('plus')}Nova OS</a>
      </div>
    </div>
    <div class="cartao">
      <div class="barra-ferramentas">
        <div class="busca campo">
          ${icone('search')}
          <input class="entrada" id="busca-ordens" type="search" value="${esc(busca)}" placeholder="Nº da OS, cliente, equipamento, nº de série ou técnico" />
        </div>
        <div class="chips" id="filtros"></div>
      </div>
      <div id="lista">${carregandoHTML()}</div>
    </div>`;

  const lista = $('#lista', el);
  const filtros = $('#filtros', el);

  async function desenharFiltros() {
    const r = await api.get('/resumo');
    const total = Object.values(r.porStatus).reduce((a, b) => a + b, 0);
    const chip = (valor, rotulo, n) =>
      `<button type="button" class="chip" data-filtro="${valor}" aria-pressed="${filtro === valor}">${esc(rotulo)}<span class="n">${n}</span></button>`;
    filtros.innerHTML =
      chip('', 'Todas', total) +
      Object.entries(STATUS_ROTULO)
        .filter(([s]) => r.porStatus[s] || filtro === s)
        .map(([s, rot]) => chip(s, rot, r.porStatus[s] || 0))
        .join('');
  }

  async function carregar() {
    const params = new URLSearchParams();
    if (busca) params.set('q', busca);
    if (filtro) params.set('status', filtro);
    try {
      const ordens = await api.get(`/ordens?${params}`);
      desenhar(ordens);
    } catch (e) {
      erro(e);
    }
  }

  function desenhar(ordens) {
    if (!ordens.length) {
      lista.innerHTML =
        busca || filtro
          ? vazioHTML({ icone: 'search', titulo: 'Nenhuma OS encontrada', texto: 'Tente outro termo de busca ou limpe o filtro de situação.' })
          : vazioHTML({
              icone: 'clipboard-list',
              titulo: 'Nenhuma ordem de serviço ainda',
              texto: 'Abra a primeira OS para registrar o checklist de entrada da balança e montar o orçamento.',
              acao: `<a class="btn btn-primario" href="#/ordens/nova">${icone('plus')}Nova OS</a>`,
            });
      return;
    }
    const hoje = new Date();
    lista.innerHTML = `
      <div class="tabela-envolve">
        <table class="tabela clicavel lista-ordens">
          <thead><tr>
            <th>Nº</th><th>Cliente / equipamento</th><th>Técnico</th><th>Entrada</th><th>Situação</th><th class="valor">Total</th><th></th>
          </tr></thead>
          <tbody>
            ${ordens
              .map(
                (o) => `
              <tr data-id="${o.id}">
                <td class="num-os">${o.numero}</td>
                <td>
                  <span class="destaque">${realcar(o.cliente_nome || 'Cliente não informado', busca)}</span>
                  <span class="secundario">${realcar(o.equipamento || '—', busca)}${
                    o.numero_serie ? ` · Série ${realcar(o.numero_serie, busca)}` : ''
                  }</span>
                </td>
                <td>${realcar(o.tecnico || '—', busca)}</td>
                <td>${esc(dataBR(o.data_entrada))}<span class="secundario">${esc(tempoRelativo(o.atualizado_em))}</span></td>
                <td>${seloStatus(o.status)}${vencido(o, hoje) ? '<span class="etiqueta etiqueta-vencido">Orçamento vencido</span>' : ''}</td>
                <td class="valor destaque">${moeda(o.total)}</td>
                <td class="acoes-linha">
                  <a class="btn btn-fantasma btn-icone btn-p" href="/imprimir/checklist?id=${o.id}" target="_blank" rel="noopener" title="Imprimir checklist" data-parar>${icone('printer')}</a>
                  <a class="btn btn-fantasma btn-icone btn-p" href="/api/ordens/${o.id}/orcamento.pdf" target="_blank" rel="noopener" title="Abrir orçamento (PDF)" data-parar>${icone('file-text')}</a>
                </td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>`;
  }

  lista.addEventListener('click', (e) => {
    if (e.target.closest('[data-parar]')) return;
    const tr = e.target.closest('tr[data-id]');
    if (tr) navegar(`/ordens/${tr.dataset.id}`);
  });

  filtros.addEventListener('click', (e) => {
    const b = e.target.closest('[data-filtro]');
    if (!b) return;
    filtro = b.dataset.filtro;
    filtros.querySelectorAll('[data-filtro]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    atualizarUrl();
    carregar();
  });

  const buscar = debounce(() => {
    atualizarUrl();
    carregar();
  }, 250);
  $('#busca-ordens', el).addEventListener('input', (e) => {
    busca = e.target.value.trim();
    buscar();
  });

  function atualizarUrl() {
    const p = new URLSearchParams();
    if (busca) p.set('q', busca);
    if (filtro) p.set('status', filtro);
    const novo = `#/ordens${p.toString() ? `?${p}` : ''}`;
    history.replaceState(null, '', novo);
  }

  await Promise.all([desenharFiltros(), carregar()]);
  hidratarIcones(el);
  const campoBusca = $('#busca-global input');
  if (campoBusca) campoBusca.value = '';
  return {};
}
