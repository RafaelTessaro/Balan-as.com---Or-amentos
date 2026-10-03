// Cadastro de cliente (janela central), usado na tela de Clientes e dentro da OS.
// Só o essencial para o checklist interno: tipo (PF/PJ), nome, CPF/CNPJ e cidade.
// Para CNPJ, o sistema consulta a Receita (via /api/cnpj) e preenche nome e cidade.

import { api } from './api.js';
import { $, esc, icone, abrirModal, erro, debounce } from './ui.js';
import { limparDocumento, mascaraCPF, mascaraCNPJ, validarCPF, validarCNPJ } from './documentos.js';

/** PF quando o documento tem 11 dígitos; caso contrário, PJ. */
export function tipoDoDocumento(doc) {
  return /^\d{11}$/.test(limparDocumento(doc)) ? 'PF' : 'PJ';
}

export function rotuloDocumento(c) {
  if (!c?.documento) return '';
  return `${(c.tipo || tipoDoDocumento(c.documento)) === 'PF' ? 'CPF' : 'CNPJ'} ${c.documento}`;
}

function formHTML(c, cidades) {
  const tipo = c.tipo || (c.documento ? tipoDoDocumento(c.documento) : 'PJ');
  return `
    <div class="form-cliente" data-tipo="${tipo}">
      <div class="campo">
        <span class="rotulo">Tipo de cliente</span>
        <div class="segmentado segmentado-largo" role="radiogroup" aria-label="Tipo de cliente">
          <button type="button" role="radio" data-tipo-cliente="PJ" aria-pressed="${tipo === 'PJ'}" aria-checked="${tipo === 'PJ'}">${icone('building-2', 'i-s')}Pessoa jurídica</button>
          <button type="button" role="radio" data-tipo-cliente="PF" aria-pressed="${tipo === 'PF'}" aria-checked="${tipo === 'PF'}">${icone('user', 'i-s')}Pessoa física</button>
        </div>
      </div>

      <div class="campo" data-campo="documento">
        <label for="cli-documento"><span data-rotulo-doc>${tipo === 'PF' ? 'CPF' : 'CNPJ'}</span> <span class="opcional">(opcional)</span></label>
        <div class="doc-linha">
          <input id="cli-documento" name="documento" autocomplete="off" spellcheck="false" value="${esc(c.documento || '')}"
            placeholder="${tipo === 'PF' ? '000.000.000-00' : '00.000.000/0000-00'}" />
          <button type="button" class="btn" data-consultar-cnpj ${tipo === 'PF' ? 'hidden' : ''}>${icone('search')}Consultar</button>
        </div>
        <div class="doc-status" aria-live="polite"></div>
      </div>

      <div class="campo" data-campo="nome">
        <label for="cli-nome"><span data-rotulo-nome>${tipo === 'PF' ? 'Nome' : 'Razão social / nome'}</span> <span class="obrigatorio" aria-hidden="true">*</span></label>
        <input id="cli-nome" name="nome" maxlength="160" autocomplete="off" value="${esc(c.nome || '')}"
          placeholder="${tipo === 'PF' ? 'Nome completo' : 'Preenchido pela consulta do CNPJ'}" />
        <div class="sugestoes-nome"></div>
      </div>

      <div class="campo" data-campo="cidade">
        <label for="cli-cidade">Cidade <span class="opcional">(opcional)</span></label>
        <input id="cli-cidade" name="cidade" maxlength="80" list="cli-cidades" autocomplete="off" value="${esc(c.cidade || '')}" placeholder="Ex.: Rio Claro - SP" />
        <datalist id="cli-cidades">${cidades.map((x) => `<option value="${esc(x)}"></option>`).join('')}</datalist>
      </div>
    </div>`;
}

function marcarErro(form, nome, msg) {
  const campo = $(`.campo[data-campo="${nome}"]`, form);
  if (!campo) return;
  campo.classList.add('erro');
  $('.msg-erro', campo)?.remove();
  const span = document.createElement('span');
  span.className = 'msg-erro';
  span.textContent = msg;
  campo.appendChild(span);
}

function limparErros(form) {
  form.querySelectorAll('.campo.erro').forEach((c) => {
    c.classList.remove('erro');
    $('.msg-erro', c)?.remove();
  });
}

function validar(form) {
  limparErros(form);
  const tipo = $('.form-cliente', form).dataset.tipo;
  const dados = {
    tipo,
    nome: form.elements.nome.value.trim(),
    documento: form.elements.documento.value.trim(),
    cidade: form.elements.cidade.value.trim(),
  };
  let primeiro = null;
  if (dados.documento) {
    const ok = tipo === 'PF' ? validarCPF(dados.documento) : validarCNPJ(dados.documento);
    if (!ok) {
      marcarErro(form, 'documento', tipo === 'PF' ? 'CPF inválido. Confira os números.' : 'CNPJ inválido. Confira os caracteres.');
      primeiro = 'documento';
    }
  }
  if (!dados.nome) {
    marcarErro(form, 'nome', tipo === 'PF' ? 'Informe o nome do cliente.' : 'Informe a razão social ou o nome.');
    primeiro ||= 'nome';
  }
  if (primeiro) {
    form.elements[primeiro].focus();
    return null;
  }
  return dados;
}

function ligar(form) {
  const raiz = $('.form-cliente', form);
  const doc = form.elements.documento;
  const nome = form.elements.nome;
  const cidade = form.elements.cidade;
  const status = $('.doc-status', form);
  const sugestoes = $('.sugestoes-nome', form);
  const botaoConsultar = $('[data-consultar-cnpj]', form);
  let ultimaConsulta = '';
  let nomeAutomatico = !nome.value; // nome ainda não digitado pelo usuário
  let cidadeAutomatica = !cidade.value;

  const mascarar = () => {
    const tipo = raiz.dataset.tipo;
    const fim = doc.selectionStart === doc.value.length;
    doc.value = tipo === 'PF' ? mascaraCPF(doc.value) : mascaraCNPJ(doc.value);
    if (fim) doc.setSelectionRange(doc.value.length, doc.value.length);
  };

  const definirTipo = (tipo) => {
    raiz.dataset.tipo = tipo;
    form.querySelectorAll('[data-tipo-cliente]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.tipoCliente === tipo));
      b.setAttribute('aria-checked', String(b.dataset.tipoCliente === tipo));
    });
    $('[data-rotulo-doc]', form).textContent = tipo === 'PF' ? 'CPF' : 'CNPJ';
    $('[data-rotulo-nome]', form).textContent = tipo === 'PF' ? 'Nome' : 'Razão social / nome';
    doc.placeholder = tipo === 'PF' ? '000.000.000-00' : '00.000.000/0000-00';
    nome.placeholder = tipo === 'PF' ? 'Nome completo' : 'Preenchido pela consulta do CNPJ';
    botaoConsultar.hidden = tipo === 'PF';
    status.innerHTML = '';
    sugestoes.innerHTML = '';
    limparErros(form);
    mascarar();
  };

  const aplicarNome = (valor) => {
    nome.value = valor;
    nomeAutomatico = true;
    sugestoes.innerHTML = '';
  };

  async function consultar() {
    const cnpj = limparDocumento(doc.value);
    if (!validarCNPJ(cnpj)) {
      limparErros(form);
      marcarErro(form, 'documento', 'Digite um CNPJ válido para consultar.');
      doc.focus();
      return;
    }
    if (cnpj === ultimaConsulta) return;
    ultimaConsulta = cnpj;
    limparErros(form);
    botaoConsultar.disabled = true;
    status.className = 'doc-status';
    status.innerHTML = `${icone('loader-circle', 'girando i-s')}Consultando a Receita Federal…`;
    try {
      const r = await api.get(`/cnpj/${cnpj}`);
      if (limparDocumento(doc.value) !== cnpj) return; // CNPJ mudou durante a consulta
      const ativa = !r.situacao || /ativa/i.test(r.situacao);
      status.className = `doc-status ${ativa ? 'ok' : 'alerta'}`;
      status.innerHTML = `${icone(ativa ? 'circle-check' : 'triangle-alert', 'i-s')}${
        ativa ? 'Encontrado na Receita Federal' : `Situação na Receita: ${esc(r.situacao)}`
      }`;
      if (nomeAutomatico || !nome.value.trim()) aplicarNome(r.razao_social);
      if (cidadeAutomatica || !cidade.value.trim()) {
        cidade.value = r.cidade;
        cidadeAutomatica = true;
      }
      const opcoes = [r.razao_social, r.nome_fantasia].filter((x) => x && x !== nome.value);
      sugestoes.innerHTML = opcoes.length
        ? `<span class="texto-suave texto-xp">Usar:</span>${opcoes
            .map((x) => `<button type="button" class="chip chip-p" data-usar-nome="${esc(x)}">${esc(x)}</button>`)
            .join('')}`
        : '';
    } catch (e) {
      ultimaConsulta = '';
      status.className = `doc-status ${e.status === 404 || e.status === 400 ? 'erro' : 'alerta'}`;
      status.innerHTML = `${icone('circle-alert', 'i-s')}${esc(e.message)}`;
    } finally {
      botaoConsultar.disabled = false;
    }
  }

  const consultarAoDigitar = debounce(() => {
    if (raiz.dataset.tipo === 'PJ' && validarCNPJ(doc.value)) consultar();
  }, 350);

  doc.addEventListener('input', () => {
    mascarar();
    $('.campo[data-campo="documento"]', form).classList.remove('erro');
    $('.campo[data-campo="documento"] .msg-erro', form)?.remove();
    consultarAoDigitar();
  });
  doc.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && raiz.dataset.tipo === 'PJ') {
      e.preventDefault();
      consultar();
    }
  });
  nome.addEventListener('input', () => {
    nomeAutomatico = false;
    $('.campo[data-campo="nome"]', form).classList.remove('erro');
    $('.campo[data-campo="nome"] .msg-erro', form)?.remove();
  });
  cidade.addEventListener('input', () => (cidadeAutomatica = false));
  botaoConsultar.addEventListener('click', consultar);
  form.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tipo-cliente]');
    if (t) definirTipo(t.dataset.tipoCliente);
    const usar = e.target.closest('[data-usar-nome]');
    if (usar) aplicarNome(usar.dataset.usarNome);
  });
  if (doc.value) mascarar();
}

/**
 * Abre o cadastro/edição de cliente numa janela central.
 * Resolve com o cliente salvo, com 'excluir' (se permitido) ou undefined (cancelado).
 */
export async function abrirCadastroCliente(cliente = {}, { textoSalvar, permitirExcluir = false, cidades = [] } = {}) {
  const editando = Boolean(cliente.id);
  const m = abrirModal({
    titulo: editando ? 'Editar cliente' : 'Novo cliente',
    tamanho: 'pequeno',
    corpo: formHTML(cliente, cidades),
    acoes: [
      ...(editando && permitirExcluir
        ? [{ texto: 'Excluir', classe: 'btn-fantasma btn-perigo a-esquerda', icone: 'trash-2', valor: 'excluir' }]
        : []),
      { texto: 'Cancelar', classe: 'btn-fantasma' },
      {
        texto: textoSalvar || (editando ? 'Salvar alterações' : 'Cadastrar cliente'),
        classe: 'btn-primario',
        icone: 'check',
        tipo: 'submit',
        aoClicar: async ({ form }) => {
          const dados = validar(form);
          if (!dados) return false;
          const botao = form.querySelector('button[type=submit]');
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
    aoAbrir: ({ form }) => {
      ligar(form);
      // Novo cliente: começa pelo documento (a consulta preenche o resto).
      const primeiro = editando ? form.elements.nome : form.elements.documento;
      setTimeout(() => primeiro.focus(), 40);
    },
  });
  return m.resultado;
}
