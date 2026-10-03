// Inicialização da interface e navegação entre telas (rotas com #/).
//
// Cada tela é um módulo em js/paginas/ que exporta:
//   export async function montar(el, { params, query }) { ...; return { sair, desmontar } }
// - el: o <main> onde a tela deve ser desenhada
// - sair(): opcional; retorne false para impedir a saída (ex.: alterações não salvas)
// - desmontar(): opcional; limpeza ao sair da tela

import { api } from './api.js';
import { $, $$, hidratarIcones, carregandoHTML, erro, esc, icone } from './ui.js';

const ROTAS = [
  { padrao: /^\/?$/, redirecionar: '/inicio' },
  { padrao: /^\/inicio$/, modulo: 'inicio', menu: 'inicio' },
  { padrao: /^\/ordens$/, modulo: 'ordens', menu: 'ordens' },
  { padrao: /^\/ordens\/nova$/, modulo: 'nova-ordem', menu: 'ordens' },
  { padrao: /^\/ordens\/(\d+)$/, modulo: 'ordem', menu: 'ordens', chaves: ['id'] },
  { padrao: /^\/clientes$/, modulo: 'clientes', menu: 'clientes' },
  { padrao: /^\/servicos$/, modulo: 'catalogo', menu: 'servicos', extra: { tipo: 'servicos' } },
  { padrao: /^\/pecas$/, modulo: 'catalogo', menu: 'pecas', extra: { tipo: 'pecas' } },
  { padrao: /^\/configuracoes$/, modulo: 'configuracoes', menu: 'configuracoes' },
];

const conteudo = $('#conteudo');
let telaAtual = null;
let hashAtual = null;
let navegacao = 0; // identifica a navegação mais recente
let ignorarProxima = false;

function lerHash() {
  const bruto = decodeURIComponent(location.hash.replace(/^#/, '')) || '/';
  const [caminho, busca = ''] = bruto.split('?');
  return { caminho, query: Object.fromEntries(new URLSearchParams(busca)) };
}

export function navegar(rota, { substituir = false } = {}) {
  const novo = `#${rota}`;
  if (substituir) {
    history.replaceState(null, '', novo);
    rotear();
  } else if (location.hash === novo) {
    rotear();
  } else {
    location.hash = novo;
  }
}

async function rotear() {
  if (ignorarProxima) {
    ignorarProxima = false;
    return;
  }
  // Pergunta à tela atual se pode sair (ex.: alterações não salvas).
  if (telaAtual?.sair && hashAtual !== null && location.hash !== hashAtual) {
    const pode = await telaAtual.sair();
    if (pode === false) {
      ignorarProxima = true;
      location.hash = hashAtual;
      return;
    }
  }
  const minha = ++navegacao;
  const atual = () => minha === navegacao;
  telaAtual?.desmontar?.();
  telaAtual = null;
  hashAtual = location.hash;

  const { caminho, query } = lerHash();
  const rota = ROTAS.find((r) => r.padrao.test(caminho));
  if (!rota) return navegar('/inicio', { substituir: true });
  if (rota.redirecionar) return navegar(rota.redirecionar, { substituir: true });

  const m = rota.padrao.exec(caminho);
  const params = { ...(rota.extra || {}) };
  (rota.chaves || []).forEach((k, i) => (params[k] = m[i + 1]));

  $$('.menu-item[data-rota]').forEach((a) => a.classList.toggle('ativo', a.dataset.rota === rota.menu));
  $('#app').classList.remove('menu-aberto');
  // Cada tela recebe um contêiner novo: os eventos da tela anterior somem com ele
  // e uma tela que termina de carregar depois da navegação não aparece por cima.
  const tela = document.createElement('div');
  tela.className = 'tela';
  tela.innerHTML = carregandoHTML();
  conteudo.replaceChildren(tela);
  window.scrollTo(0, 0);

  try {
    const modulo = await import(`./paginas/${rota.modulo}.js`);
    if (!atual()) return;
    tela.innerHTML = '';
    const r = (await modulo.montar(tela, { params, query })) || {};
    if (!atual()) {
      r.desmontar?.();
      return;
    }
    telaAtual = r;
    hidratarIcones(tela);
  } catch (e) {
    if (!atual()) return;
    erro(e);
    tela.innerHTML = `<div class="vazio">${icone('triangle-alert', 'i-xg')}<h3>Não foi possível abrir esta tela</h3><p>${esc(
      e.message
    )}</p><a class="btn" href="#/inicio">Voltar ao início</a></div>`;
  }
}

// Contador de ordens em andamento no menu lateral.
export async function atualizarContadores() {
  try {
    const r = await api.get('/resumo');
    const p = r.porStatus;
    const andamento = p.em_analise + p.aguardando_aprovacao + p.aprovada + p.aguardando_peca;
    const el = $('#contador-abertas');
    el.textContent = andamento;
    el.classList.toggle('oculto', !andamento);
  } catch {
    /* sem contador */
  }
}
window.addEventListener('ordens-alteradas', atualizarContadores);

// Aviso ao fechar a aba com alterações não salvas.
window.addEventListener('beforeunload', (e) => {
  if (telaAtual?.temAlteracoes?.()) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// Busca global → lista de ordens filtrada.
$('#busca-global').addEventListener('submit', (e) => {
  e.preventDefault();
  const q = e.target.q.value.trim();
  navegar(`/ordens${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  e.target.q.blur();
});

// Atalho "/" para focar a busca.
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement.tagName)) {
    e.preventDefault();
    $('#busca-global input').focus();
  }
});

// Menu no celular/tablet.
$('#btn-menu').addEventListener('click', () => $('#app').classList.toggle('menu-aberto'));
$('#menu-sobreposicao').addEventListener('click', () => $('#app').classList.remove('menu-aberto'));

// Borda no topo ao rolar.
window.addEventListener('scroll', () => $('#topo').classList.toggle('com-borda', window.scrollY > 4), {
  passive: true,
});

hidratarIcones(document);
window.addEventListener('hashchange', rotear);
rotear();
atualizarContadores();
