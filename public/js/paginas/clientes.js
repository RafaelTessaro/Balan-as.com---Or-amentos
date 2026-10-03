// Tela de clientes: lista com busca instantânea e cadastro em janela central
// (pessoa física ou jurídica, com consulta automática do CNPJ).
//
// Atalhos de rota aceitos: #/clientes?novo=1 (abre o cadastro) e
// #/clientes?editar=<id> (abre a edição do cliente).

import { api } from '../api.js';
import { abrirCadastroCliente, tipoDoDocumento } from '../cliente-form.js';
import {
  $,
  esc,
  realcar,
  hidratarIcones,
  debounce,
  toast,
  erro,
  confirmar,
  carregandoHTML,
  vazioHTML,
  icone,
  definirTitulo,
} from '../ui.js';

function iniciais(nome) {
  const partes = String(nome || '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((p) => p && !/^(d[aeo]s?|e|me|ltda|epp|eireli|s\/?a)$/i.test(p));
  if (!partes.length) return '?';
  const a = partes[0][0] || '';
  const b = partes.length > 1 ? partes[partes.length - 1][0] : partes[0][1] || '';
  return (a + b).toUpperCase();
}

// Cor estável do avatar a partir do nome (tons discretos da paleta).
function tomAvatar(nome) {
  let h = 0;
  for (const ch of String(nome || '')) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h % 5;
}

export async function montar(el, { query = {} } = {}) {
  definirTitulo('Clientes');

  let termo = '';
  let lista = [];
  let totalGeral = null; // quantidade de clientes sem filtro
  let cidades = new Set();
  let consulta = 0;
  let destacarId = null;
  let ativo = true;

  el.innerHTML = `
    <div class="tela-cadastro">
      <div class="pagina-topo">
        <div>
          <h1>Clientes</h1>
          <p class="subtitulo">Pessoas físicas e jurídicas. Para CNPJ, o nome e a cidade são preenchidos pela consulta à Receita.</p>
        </div>
        <div class="acoes">
          <button type="button" class="btn btn-primario" data-novo data-icone="user-plus"><span>Novo cliente</span></button>
        </div>
      </div>

      <section class="cartao cartao-lista">
        <div class="barra-ferramentas">
          <label class="busca">
            <span data-icone="search"></span>
            <input class="entrada" type="search" name="q" placeholder="Nome, CPF/CNPJ ou cidade"
              aria-label="Buscar clientes" autocomplete="off" />
          </label>
          <div class="resumo-lista" aria-live="polite"></div>
        </div>
        <div class="resultado">${carregandoHTML('Carregando clientes…')}</div>
      </section>
    </div>`;

  const raiz = $('.tela-cadastro', el);
  const campoBusca = $('input[name=q]', raiz);
  const areaResultado = $('.resultado', raiz);
  const areaResumo = $('.resumo-lista', raiz);

  // -------------------------------------------------------------------------
  // Lista
  // -------------------------------------------------------------------------
  async function carregar() {
    const n = ++consulta;
    const q = campoBusca.value.trim();
    raiz.classList.add('buscando');
    try {
      const r = await api.get(`/clientes${q ? `?q=${encodeURIComponent(q)}` : ''}`);
      if (n !== consulta || !ativo) return;
      termo = q;
      lista = r;
      if (!q) {
        totalGeral = r.length;
        cidades = new Set(r.map((c) => c.cidade).filter(Boolean));
      }
      desenhar();
    } catch (e) {
      if (n !== consulta || !ativo) return;
      erro(e);
      areaResultado.innerHTML = vazioHTML({
        icone: 'circle-alert',
        titulo: 'Não foi possível carregar os clientes',
        texto: e.message,
        acao: `<button type="button" class="btn" data-recarregar>${icone('refresh-cw')}Tentar novamente</button>`,
      });
    } finally {
      if (n === consulta) raiz.classList.remove('buscando');
    }
  }
  const carregarDepois = debounce(carregar, 250);

  function desenharResumo() {
    if (termo) {
      areaResumo.innerHTML = `<span><b>${lista.length}</b> ${lista.length === 1 ? 'encontrado' : 'encontrados'}${
        totalGeral != null ? ` <span class="texto-fraco">de ${totalGeral}</span>` : ''
      }</span>`;
    } else {
      areaResumo.innerHTML = lista.length
        ? `<span><b>${lista.length}</b> ${lista.length === 1 ? 'cliente' : 'clientes'}</span>`
        : '';
    }
  }

  function linhaHTML(c) {
    const tipo = c.tipo || tipoDoDocumento(c.documento);
    const doc = `<span class="secundario"><span class="etiqueta etiqueta-tipo">${tipo === 'PF' ? 'PF' : 'PJ'}</span>${
      c.documento ? ` ${tipo === 'PF' ? 'CPF' : 'CNPJ'} ${realcar(c.documento, termo)}` : ''
    }</span>`;
    return `
      <tr data-id="${c.id}" class="${c.id === destacarId ? 'recem' : ''}" tabindex="0" aria-label="Editar ${esc(c.nome)}">
        <td class="col-principal">
          <div class="com-avatar">
            <span class="avatar tom-${tomAvatar(c.nome)}" aria-hidden="true">${esc(iniciais(c.nome))}</span>
            <div class="min-0">
              <span class="destaque">${realcar(c.nome, termo)}</span>
              ${doc}
              ${c.cidade ? `<span class="secundario cidade-compacta">${icone('map-pin', 'i-s')}${realcar(c.cidade, termo)}</span>` : ''}
            </div>
          </div>
        </td>
        <td class="col-cidade">${c.cidade ? realcar(c.cidade, termo) : '<span class="texto-fraco">—</span>'}</td>
        <td class="acoes-linha">
          <button type="button" class="btn btn-p btn-nova-os" data-acao="os" title="Abrir nova ordem de serviço para este cliente">${icone(
            'plus'
          )}<span>Nova OS</span></button>
          <button type="button" class="btn btn-fantasma btn-icone btn-p" data-acao="editar" title="Editar" aria-label="Editar ${esc(
            c.nome
          )}">${icone('pencil')}</button>
          <button type="button" class="btn btn-fantasma btn-icone btn-p btn-perigo" data-acao="excluir" title="Excluir" aria-label="Excluir ${esc(
            c.nome
          )}">${icone('trash-2')}</button>
        </td>
      </tr>`;
  }

  function desenhar() {
    desenharResumo();
    // Sem nenhum cliente cadastrado: só o convite para cadastrar.
    $('.barra-ferramentas', raiz).classList.toggle('oculto', !lista.length && !termo);
    if (!lista.length) {
      areaResultado.innerHTML = termo
        ? vazioHTML({
            icone: 'search',
            titulo: 'Nenhum cliente encontrado',
            texto: `Nada corresponde a “${termo}”. Confira a grafia ou cadastre um novo cliente.`,
            acao: `<div class="grupo-botoes"><button type="button" class="btn" data-limpar>${icone('x')}Limpar busca</button>
              <button type="button" class="btn btn-primario" data-novo-com-nome>${icone('user-plus')}Cadastrar “${esc(
                termo.length > 28 ? termo.slice(0, 28) + '…' : termo
              )}”</button></div>`,
          })
        : vazioHTML({
            icone: 'users',
            titulo: 'Nenhum cliente cadastrado ainda',
            texto:
              'Cadastre seus clientes para abrir ordens de serviço mais rápido. Para empresas, basta digitar o CNPJ.',
            acao: `<button type="button" class="btn btn-primario" data-novo>${icone('user-plus')}Cadastrar primeiro cliente</button>`,
          });
      return;
    }
    areaResultado.innerHTML = `
      <div class="tabela-envolve">
        <table class="tabela clicavel tabela-cartoes tabela-clientes">
          <thead>
            <tr>
              <th>Cliente</th>
              <th class="col-cidade">Cidade</th>
              <th class="acoes-linha"><span class="sr">Ações</span></th>
            </tr>
          </thead>
          <tbody>${lista.map(linhaHTML).join('')}</tbody>
        </table>
      </div>`;
    if (destacarId) {
      const tr = $(`tr[data-id="${destacarId}"]`, areaResultado);
      tr?.scrollIntoView({ block: 'nearest' });
      destacarId = null;
    }
  }

  // -------------------------------------------------------------------------
  // Cadastro (janela central)
  // -------------------------------------------------------------------------
  async function abrirFormulario(cliente = {}) {
    const editando = Boolean(cliente.id);
    const r = await abrirCadastroCliente(cliente, {
      permitirExcluir: true,
      cidades: [...cidades].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    });
    if (!ativo) return;
    if (r === 'excluir') return excluir(cliente);
    if (r && r.id) {
      toast(editando ? 'Alterações salvas.' : `Cliente “${r.nome}” cadastrado.`);
      destacarId = r.id;
      if (!editando && termo && !r.nome.toLowerCase().includes(termo.toLowerCase())) campoBusca.value = '';
      await carregar();
    }
  }

  async function excluir(c) {
    const ok = await confirmar({
      titulo: 'Excluir cliente',
      mensagem: `Excluir “${c.nome}”? As ordens de serviço já abertas para este cliente são mantidas, com o nome registrado nelas.`,
      confirmar: 'Excluir cliente',
      perigo: true,
    });
    if (!ok) return;
    try {
      await api.del(`/clientes/${c.id}`);
      toast('Cliente excluído.');
      await carregar();
    } catch (e) {
      erro(e);
    }
  }

  async function abrirPorId(id) {
    try {
      const c = await api.get(`/clientes/${id}`);
      abrirFormulario(c);
    } catch (e) {
      erro(e);
    }
  }

  // -------------------------------------------------------------------------
  // Eventos
  // -------------------------------------------------------------------------
  campoBusca.addEventListener('input', carregarDepois);
  campoBusca.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && campoBusca.value) {
      e.preventDefault();
      campoBusca.value = '';
      carregar();
    }
  });

  raiz.addEventListener('click', (e) => {
    if (e.target.closest('[data-novo]')) return abrirFormulario();
    if (e.target.closest('[data-novo-com-nome]')) return abrirFormulario({ nome: termo });
    if (e.target.closest('[data-recarregar]')) return carregar();
    if (e.target.closest('[data-limpar]')) {
      campoBusca.value = '';
      campoBusca.focus();
      return carregar();
    }
    const tr = e.target.closest('tbody tr[data-id]');
    if (!tr) return;
    const c = lista.find((x) => x.id === Number(tr.dataset.id));
    if (!c) return;
    const botao = e.target.closest('[data-acao]');
    const acao = botao?.dataset.acao || 'editar';
    if (!botao && (e.target.closest('a, button, input') || getSelection().toString())) return;
    if (acao === 'os') location.hash = `#/ordens/nova?cliente=${c.id}`;
    else if (acao === 'excluir') excluir(c);
    else abrirFormulario(c);
  });

  raiz.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.target.tagName !== 'TR') return;
    const c = lista.find((x) => x.id === Number(e.target.dataset.id));
    if (c) abrirFormulario(c);
  });

  hidratarIcones(el);
  await carregar();

  if (query.novo === '1') abrirFormulario();
  else if (query.editar) abrirPorId(Number(query.editar));
  else if (!('ontouchstart' in window)) campoBusca.focus({ preventScroll: true });

  return {
    desmontar() {
      ativo = false;
      carregarDepois.cancelar();
    },
  };
}
