// Tela de clientes: lista com busca instantânea e cadastro em painel lateral.
//
// Atalhos de rota aceitos: #/clientes?novo=1 (abre o cadastro) e
// #/clientes?editar=<id> (abre a edição do cliente).

import { api } from '../api.js';
import {
  $,
  $$,
  esc,
  realcar,
  hidratarIcones,
  debounce,
  dataBR,
  tempoRelativo,
  mascaraTelefone,
  mascaraDocumento,
  toast,
  erro,
  abrirModal,
  confirmar,
  carregandoHTML,
  vazioHTML,
  icone,
  definirTitulo,
} from '../ui.js';

const CAMPOS = ['nome', 'documento', 'telefone', 'whatsapp', 'email', 'endereco', 'cidade', 'observacoes'];
const EMAIL_OK = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const digitos = (v) => String(v || '').replace(/\D/g, '');

function tipoDocumento(doc) {
  const n = digitos(doc).length;
  if (n === 11) return 'CPF';
  if (n === 14) return 'CNPJ';
  return 'Doc.';
}

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
          <p class="subtitulo">Cadastre uma vez e use em todas as ordens de serviço, orçamentos e envios.</p>
        </div>
        <div class="acoes">
          <button type="button" class="btn btn-primario" data-novo data-icone="user-plus"><span>Novo cliente</span></button>
        </div>
      </div>

      <section class="cartao cartao-lista">
        <div class="barra-ferramentas">
          <label class="busca">
            <span data-icone="search"></span>
            <input class="entrada" type="search" name="q" placeholder="Buscar por nome, CPF/CNPJ, telefone, e-mail ou cidade"
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
      areaResumo.innerHTML = `<b>${lista.length}</b> ${lista.length === 1 ? 'encontrado' : 'encontrados'}${
        totalGeral != null ? ` <span class="texto-fraco">de ${totalGeral}</span>` : ''
      }`;
    } else {
      areaResumo.innerHTML = `<b>${lista.length}</b> ${lista.length === 1 ? 'cliente' : 'clientes'}`;
    }
  }

  function contatoHTML(c) {
    const partes = [];
    const tel = c.telefone;
    const wpp = c.whatsapp;
    if (tel) {
      const mesmo = wpp && digitos(wpp) === digitos(tel);
      partes.push(
        `<span class="contato-item">${icone(mesmo ? 'message-circle' : 'phone', 'i-s')}<span>${realcar(tel, termo)}</span>${
          mesmo ? '<span class="sr"> (WhatsApp)</span>' : ''
        }</span>`
      );
    }
    if (wpp && (!tel || digitos(wpp) !== digitos(tel))) {
      partes.push(
        `<span class="contato-item">${icone('message-circle', 'i-s')}<span>${realcar(wpp, termo)}</span><span class="sr"> (WhatsApp)</span></span>`
      );
    }
    if (c.email) {
      partes.push(`<span class="contato-item suave">${icone('mail', 'i-s')}<span class="quebra">${realcar(c.email, termo)}</span></span>`);
    }
    return partes.length ? `<div class="contatos">${partes.join('')}</div>` : '<span class="texto-fraco">—</span>';
  }

  function linhaHTML(c) {
    const doc = c.documento
      ? `<span class="secundario">${tipoDocumento(c.documento)} ${realcar(c.documento, termo)}</span>`
      : '';
    return `
      <tr data-id="${c.id}" class="${c.id === destacarId ? 'recem' : ''}" tabindex="0" aria-label="Editar ${esc(c.nome)}">
        <td class="col-principal">
          <div class="com-avatar">
            <span class="avatar tom-${tomAvatar(c.nome)}" aria-hidden="true">${esc(iniciais(c.nome))}</span>
            <div class="min-0">
              <span class="destaque">${realcar(c.nome, termo)}</span>
              ${doc}
            </div>
          </div>
        </td>
        <td class="col-contato">${contatoHTML(c)}</td>
        <td class="col-cidade">${
          c.cidade ? realcar(c.cidade, termo) : '<span class="texto-fraco">—</span>'
        }${c.endereco ? `<span class="secundario corta" title="${esc(c.endereco)}">${esc(c.endereco)}</span>` : ''}</td>
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
              'Cadastre seus clientes para abrir ordens de serviço mais rápido e enviar orçamentos por e-mail ou WhatsApp com um clique.',
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
              <th>Contato</th>
              <th>Cidade</th>
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
  // Formulário (painel lateral)
  // -------------------------------------------------------------------------
  function campoHTML({ nome, rotulo, valor = '', tipo = 'text', classe = '', dica = '', atributos = '', obrigatorio = false }) {
    return `
      <div class="campo ${classe}" data-campo="${nome}">
        <label for="cli-${nome}">${esc(rotulo)}${obrigatorio ? ' <span class="obrigatorio" aria-hidden="true">*</span>' : ''}</label>
        <input id="cli-${nome}" name="${nome}" type="${tipo}" value="${esc(valor)}" ${atributos} />
        ${dica ? `<span class="dica">${dica}</span>` : ''}
      </div>`;
  }

  function formHTML(c) {
    const listaCidades = [...cidades].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return `
      <div class="form-cadastro">
        <fieldset class="form-secao">
          <legend>${icone('id-card', 'i-s')}Identificação</legend>
          <div class="grade grade-2">
            ${campoHTML({
              nome: 'nome',
              rotulo: 'Nome ou razão social',
              valor: c.nome,
              classe: 'span-tudo',
              obrigatorio: true,
              atributos: 'maxlength="160" autocomplete="off" placeholder="Ex.: Supermercado Bom Preço Ltda."',
            })}
            ${campoHTML({
              nome: 'documento',
              rotulo: 'CPF ou CNPJ',
              valor: c.documento,
              atributos: 'inputmode="numeric" autocomplete="off" placeholder="000.000.000-00"',
            })}
            ${campoHTML({
              nome: 'cidade',
              rotulo: 'Cidade',
              valor: c.cidade,
              atributos: 'list="cli-lista-cidades" maxlength="80" placeholder="Ex.: Rio Claro - SP"',
            })}
          </div>
          <datalist id="cli-lista-cidades">${listaCidades.map((x) => `<option value="${esc(x)}"></option>`).join('')}</datalist>
        </fieldset>

        <fieldset class="form-secao">
          <legend>${icone('phone', 'i-s')}Contato</legend>
          <div class="grade grade-2">
            ${campoHTML({
              nome: 'telefone',
              rotulo: 'Telefone',
              valor: c.telefone,
              tipo: 'tel',
              atributos: 'inputmode="tel" placeholder="(19) 3023-9050"',
            })}
            ${campoHTML({
              nome: 'whatsapp',
              rotulo: 'WhatsApp',
              valor: c.whatsapp,
              tipo: 'tel',
              atributos: 'inputmode="tel" placeholder="(19) 99999-9999"',
              dica: '<button type="button" class="link-dica" data-copiar-telefone>Mesmo número do telefone</button>',
            })}
            ${campoHTML({
              nome: 'email',
              rotulo: 'E-mail',
              valor: c.email,
              tipo: 'email',
              classe: 'span-tudo',
              atributos: 'inputmode="email" autocomplete="off" placeholder="compras@empresa.com.br"',
              dica: 'Usado para enviar o orçamento em PDF.',
            })}
          </div>
        </fieldset>

        <fieldset class="form-secao">
          <legend>${icone('map-pin', 'i-s')}Endereço e observações</legend>
          <div class="grade">
            ${campoHTML({
              nome: 'endereco',
              rotulo: 'Endereço',
              valor: c.endereco,
              atributos: 'maxlength="200" placeholder="Rua, número, bairro"',
            })}
            <div class="campo" data-campo="observacoes">
              <label for="cli-observacoes">Observações</label>
              <textarea id="cli-observacoes" name="observacoes" rows="3" placeholder="Ex.: falar com Sr. João; retirar no período da tarde">${esc(
                c.observacoes || ''
              )}</textarea>
            </div>
          </div>
        </fieldset>

        ${
          c.id
            ? `<p class="form-rodape-info">${icone('history', 'i-s')}Cadastrado em ${esc(dataBR(c.criado_em))}${
                c.atualizado_em && c.atualizado_em !== c.criado_em
                  ? ` · alterado ${esc(tempoRelativo(c.atualizado_em))}`
                  : ''
              }</p>`
            : ''
        }
      </div>`;
  }

  function lerFormulario(form) {
    const d = {};
    for (const k of CAMPOS) d[k] = String(form.elements[k]?.value ?? '').trim();
    return d;
  }

  function limparErro(campo) {
    campo.classList.remove('erro');
    $('.msg-erro', campo)?.remove();
    $('input, textarea', campo)?.removeAttribute('aria-invalid');
  }

  function marcarErro(form, nome, msg) {
    const campo = $(`.campo[data-campo="${nome}"]`, form);
    if (!campo) return;
    limparErro(campo);
    campo.classList.add('erro');
    const entrada = $('input, textarea', campo);
    entrada?.setAttribute('aria-invalid', 'true');
    const dica = $('.dica', campo);
    const span = document.createElement('span');
    span.className = 'msg-erro';
    span.textContent = msg;
    if (dica) dica.before(span);
    else campo.appendChild(span);
  }

  function validar(form) {
    $$('.campo.erro', form).forEach(limparErro);
    const d = lerFormulario(form);
    const erros = {};
    if (!d.nome) erros.nome = 'Informe o nome do cliente.';
    else if (d.nome.length < 2) erros.nome = 'Nome muito curto.';
    const doc = digitos(d.documento);
    if (doc && doc.length !== 11 && doc.length !== 14) erros.documento = 'O CPF tem 11 dígitos e o CNPJ, 14.';
    for (const k of ['telefone', 'whatsapp']) {
      const n = digitos(d[k]).length;
      if (n && n < 10) erros[k] = 'Inclua o DDD. Ex.: (19) 99999-9999';
    }
    if (d.email && !EMAIL_OK.test(d.email)) erros.email = 'E-mail inválido. Ex.: nome@empresa.com.br';
    const chaves = Object.keys(erros);
    for (const k of chaves) marcarErro(form, k, erros[k]);
    if (chaves.length) {
      form.elements[chaves[0]]?.focus();
      return null;
    }
    return d;
  }

  function ligarFormulario(form) {
    const mascaras = { documento: mascaraDocumento, telefone: mascaraTelefone, whatsapp: mascaraTelefone };
    for (const [nome, fn] of Object.entries(mascaras)) {
      const input = form.elements[nome];
      if (input.value) input.value = fn(input.value);
      input.addEventListener('input', () => {
        const fim = input.selectionStart === input.value.length;
        input.value = fn(input.value);
        if (fim) input.setSelectionRange(input.value.length, input.value.length);
      });
    }
    form.addEventListener('input', (e) => {
      const campo = e.target.closest('.campo.erro');
      if (campo) limparErro(campo);
    });
    $('[data-copiar-telefone]', form)?.addEventListener('click', () => {
      const tel = form.elements.telefone.value;
      if (!digitos(tel)) {
        form.elements.telefone.focus();
        return;
      }
      form.elements.whatsapp.value = tel;
      form.elements.whatsapp.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  async function abrirFormulario(cliente = {}) {
    const editando = Boolean(cliente.id);
    const m = abrirModal({
      titulo: editando ? 'Editar cliente' : 'Novo cliente',
      painel: true,
      tamanho: 'painel-cadastro',
      corpo: formHTML(cliente),
      acoes: [
        ...(editando
          ? [{ texto: 'Excluir', classe: 'btn-fantasma btn-perigo a-esquerda', icone: 'trash-2', valor: 'excluir' }]
          : []),
        { texto: 'Cancelar', classe: 'btn-fantasma', valor: null },
        {
          texto: editando ? 'Salvar alterações' : 'Cadastrar cliente',
          classe: 'btn-primario',
          icone: 'check',
          tipo: 'submit',
          aoClicar: async ({ form }) => {
            const dados = validar(form);
            if (!dados) return false;
            const botao = $('button[type=submit]', form);
            botao.disabled = true;
            try {
              return editando ? await api.put(`/clientes/${cliente.id}`, dados) : await api.post('/clientes', dados);
            } catch (e) {
              erro(e);
              botao.disabled = false;
              return false;
            }
          },
        },
      ],
    });
    ligarFormulario(m.el);
    if (cliente.nome && !editando) {
      // Veio da busca: posiciona o cursor no fim do nome.
      const n = m.el.elements.nome;
      setTimeout(() => n.setSelectionRange(n.value.length, n.value.length), 40);
    }

    const r = await m.resultado;
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
      mensagem: `Excluir “${c.nome}”? As ordens de serviço já abertas para este cliente são mantidas, com o nome e o contato registrados nelas.`,
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
      // Fecha painéis desta tela que tenham ficado abertos.
      $$('.modal.painel-cadastro').forEach((m) => m.closest('.modal-fundo')?.remove());
    },
  };
}
