// Catálogo de serviços e de peças (mesma tela, conforme params.tipo).
//
// Regra herdada da planilha: serviços com o mesmo nome e valores diferentes
// (ex.: "Limpeza, Regulagem…" R$ 190 e "Valor reduzido" R$ 140) são itens
// separados — a descrição serve para diferenciá-los.
// Para peças, a data da última atualização do preço fica visível e preços
// com mais de 90 dias recebem um alerta discreto.

import { api } from '../api.js';
import {
  $,
  $$,
  esc,
  realcar,
  hidratarIcones,
  debounce,
  moeda,
  numeroBR,
  lerNumero,
  dataBR,
  tempoRelativo,
  toast,
  erro,
  abrirModal,
  confirmar,
  carregandoHTML,
  vazioHTML,
  icone,
  definirTitulo,
} from '../ui.js';

const DIAS_DESATUALIZADO = 90;

const TIPOS = {
  servicos: {
    titulo: 'Serviços',
    subtitulo: 'Mão de obra cobrada nos orçamentos. Os serviços ativos aparecem na busca ao montar um orçamento.',
    um: 'serviço',
    varios: 'serviços',
    icone: 'wrench',
    novo: 'Novo serviço',
    o: 'o',
    busca: 'Buscar serviço por nome ou descrição',
    coluna: 'Serviço',
    colunaValor: 'Valor',
    exemplo: 'Ex.: Limpeza, Regulagem, Ajuste de Peso e Lacração',
  },
  pecas: {
    titulo: 'Peças',
    subtitulo: 'Peças de reposição e preços unitários. Mantenha os valores em dia para orçar sem surpresas.',
    um: 'peça',
    varios: 'peças',
    icone: 'package',
    novo: 'Nova peça',
    o: 'a',
    busca: 'Buscar peça por nome ou código',
    coluna: 'Peça',
    colunaValor: 'Valor unitário',
    exemplo: 'Ex.: Cabeçote Térmico Toledo',
  },
};

const FILTROS = [
  { id: 'todos', rotulo: 'Todos' },
  { id: 'ativos', rotulo: 'Ativos' },
  { id: 'inativos', rotulo: 'Inativos' },
];

const normalizar = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const diasDesde = (iso) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : 0);

function lerPreferencia(chave, padrao) {
  try {
    return localStorage.getItem(chave) || padrao;
  } catch {
    return padrao;
  }
}
function gravarPreferencia(chave, valor) {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    /* sem armazenamento local */
  }
}

export async function montar(el, { params = {} } = {}) {
  const tipo = params.tipo === 'pecas' ? 'pecas' : 'servicos';
  const T = TIPOS[tipo];
  const ehPeca = tipo === 'pecas';
  definirTitulo(T.titulo);

  const chaveFiltro = `catalogo-filtro-${tipo}`;
  let filtro = lerPreferencia(chaveFiltro, 'todos');
  if (!FILTROS.some((f) => f.id === filtro)) filtro = 'todos';

  let termo = '';
  let lista = []; // resultado da busca (todos os status)
  let consulta = 0;
  let destacarId = null;
  let ativo = true;

  el.innerHTML = `
    <div class="tela-cadastro">
      <div class="pagina-topo">
        <div>
          <div class="migalha">${icone(T.icone, 'i-s')}Catálogo</div>
          <h1>${esc(T.titulo)}</h1>
          <p class="subtitulo">${esc(T.subtitulo)}</p>
        </div>
        <div class="acoes">
          <button type="button" class="btn btn-primario" data-novo data-icone="plus"><span>${esc(T.novo)}</span></button>
        </div>
      </div>

      <section class="cartao cartao-lista">
        <div class="barra-ferramentas">
          <label class="busca">
            <span data-icone="search"></span>
            <input class="entrada" type="search" name="q" placeholder="${esc(T.busca)}" aria-label="${esc(T.busca)}" autocomplete="off" />
          </label>
          <div class="chips" role="group" aria-label="Filtrar por situação"></div>
          <div class="resumo-lista" aria-live="polite"></div>
        </div>
        <div class="resultado">${carregandoHTML()}</div>
      </section>
    </div>`;

  const raiz = $('.tela-cadastro', el);
  const campoBusca = $('input[name=q]', raiz);
  const areaChips = $('.chips', raiz);
  const areaResumo = $('.resumo-lista', raiz);
  const areaResultado = $('.resultado', raiz);

  const visiveis = () =>
    lista.filter((x) => (filtro === 'ativos' ? x.ativo : filtro === 'inativos' ? !x.ativo : true));
  const desatualizado = (x) => ehPeca && diasDesde(x.atualizado_em) > DIAS_DESATUALIZADO;

  // -------------------------------------------------------------------------
  // Carregamento e desenho
  // -------------------------------------------------------------------------
  async function carregar() {
    const n = ++consulta;
    const q = campoBusca.value.trim();
    try {
      const r = await api.get(`/${tipo}${q ? `?q=${encodeURIComponent(q)}` : ''}`);
      if (n !== consulta || !ativo) return;
      termo = q;
      lista = r;
      desenhar();
    } catch (e) {
      if (n !== consulta || !ativo) return;
      erro(e);
      areaResultado.innerHTML = vazioHTML({
        icone: 'circle-alert',
        titulo: `Não foi possível carregar ${T.o}s ${T.varios}`,
        texto: e.message,
        acao: `<button type="button" class="btn" data-recarregar>${icone('refresh-cw')}Tentar novamente</button>`,
      });
    }
  }
  const carregarDepois = debounce(carregar, 250);

  function desenharChips() {
    const contagem = {
      todos: lista.length,
      ativos: lista.filter((x) => x.ativo).length,
      inativos: lista.filter((x) => !x.ativo).length,
    };
    areaChips.innerHTML = FILTROS.map(
      (f) =>
        `<button type="button" class="chip" data-filtro="${f.id}" aria-pressed="${f.id === filtro}">${f.rotulo}<span class="n">${
          contagem[f.id]
        }</span></button>`
    ).join('');
  }

  function desenharResumo(itens) {
    if (!itens.length) {
      areaResumo.innerHTML = '';
      return;
    }
    const media = itens.reduce((s, x) => s + (Number(x.valor) || 0), 0) / itens.length;
    const partes = [`<span><b>${itens.length}</b> ${itens.length === 1 ? T.um : T.varios}</span>`];
    partes.push(`<span>valor médio <b>${moeda(media)}</b></span>`);
    const velhos = itens.filter(desatualizado).length;
    if (velhos) {
      partes.push(
        `<span class="resumo-alerta" title="Preço sem atualização há mais de ${DIAS_DESATUALIZADO} dias">${icone(
          'clock',
          'i-s'
        )}${velhos} sem atualizar há +${DIAS_DESATUALIZADO} dias</span>`
      );
    }
    areaResumo.innerHTML = partes.join('<span class="ponto" aria-hidden="true">•</span>');
  }

  function celulaData(x) {
    const dias = diasDesde(x.atualizado_em);
    const velho = desatualizado(x);
    return `
      <td class="col-data">
        <span class="data-atualizacao${velho ? ' velha' : ''}" title="${esc(
          `Última alteração: ${dataBR(x.atualizado_em)} (${tempoRelativo(x.atualizado_em)})`
        )}">${esc(dataBR(x.atualizado_em))}</span>
        ${
          velho
            ? `<span class="etiqueta etiqueta-alerta" title="Preço sem atualização há ${dias} dias — confira com o fornecedor">${icone(
                'clock',
                'i-s'
              )}Preço desatualizado?</span>`
            : `<span class="secundario">${esc(tempoRelativo(x.atualizado_em))}</span>`
        }
      </td>`;
  }

  function linhaHTML(x) {
    const sub = ehPeca
      ? x.codigo
        ? `<span class="secundario">Cód. ${realcar(x.codigo, termo)}</span>`
        : ''
      : x.descricao
        ? `<span class="secundario">${realcar(x.descricao, termo)}</span>`
        : '';
    return `
      <tr data-id="${x.id}" class="${x.ativo ? '' : 'inativo'}${x.id === destacarId ? ' recem' : ''}" tabindex="0">
        <td class="col-principal">
          <span class="destaque">${realcar(x.nome, termo)}</span>
          ${sub}
        </td>
        <td class="valor col-valor">
          <button type="button" class="preco-rapido" data-acao="preco" title="Alterar o valor">
            <span>${moeda(x.valor)}</span>${icone('pencil', 'i-s')}
          </button>
        </td>
        ${ehPeca ? celulaData(x) : ''}
        <td class="col-status">${
          x.ativo
            ? '<span class="etiqueta etiqueta-verde">Ativo</span>'
            : '<span class="etiqueta">Inativo</span>'
        }</td>
        <td class="acoes-linha">
          <button type="button" class="btn btn-fantasma btn-icone btn-p" data-acao="editar" title="Editar" aria-label="Editar ${esc(
            x.nome
          )}">${icone('pencil')}</button>
          <button type="button" class="btn btn-fantasma btn-icone btn-p" data-acao="duplicar" title="Duplicar" aria-label="Duplicar ${esc(
            x.nome
          )}">${icone('copy')}</button>
          <button type="button" class="btn btn-fantasma btn-icone btn-p btn-perigo" data-acao="excluir" title="Excluir" aria-label="Excluir ${esc(
            x.nome
          )}">${icone('trash-2')}</button>
        </td>
      </tr>`;
  }

  function desenhar() {
    desenharChips();
    const itens = visiveis();
    desenharResumo(itens);

    if (!itens.length) {
      let html;
      if (!lista.length && !termo) {
        html = vazioHTML({
          icone: T.icone,
          titulo: `Nenhum${ehPeca ? 'a' : ''} ${T.um} cadastrad${T.o}`,
          texto: ehPeca
            ? 'Cadastre as peças que você costuma trocar para incluí-las no orçamento com o preço certo.'
            : 'Cadastre os serviços que você executa para montar orçamentos com poucos cliques.',
          acao: `<button type="button" class="btn btn-primario" data-novo>${icone('plus')}${esc(T.novo)}</button>`,
        });
      } else if (!lista.length) {
        html = vazioHTML({
          icone: 'search',
          titulo: `Nenhum${ehPeca ? 'a' : ''} ${T.um} encontrad${T.o}`,
          texto: `Nada corresponde a “${termo}”.`,
          acao: `<div class="grupo-botoes"><button type="button" class="btn" data-limpar>${icone('x')}Limpar busca</button>
            <button type="button" class="btn btn-primario" data-novo-com-nome>${icone('plus')}Cadastrar “${esc(
              termo.length > 28 ? termo.slice(0, 28) + '…' : termo
            )}”</button></div>`,
        });
      } else {
        html = vazioHTML({
          icone: 'filter',
          titulo: filtro === 'ativos' ? `Nenhum${ehPeca ? 'a' : ''} ${T.um} ativ${T.o}` : `Nenhum${ehPeca ? 'a' : ''} ${T.um} inativ${T.o}`,
          texto:
            filtro === 'inativos'
              ? `Itens desativados não aparecem na busca do orçamento, mas continuam guardados aqui.`
              : `Todos ${T.o}s ${T.varios} desta lista estão desativad${T.o}s.`,
          acao: `<button type="button" class="btn" data-filtro="todos">Ver todos</button>`,
        });
      }
      areaResultado.innerHTML = html;
      return;
    }

    areaResultado.innerHTML = `
      <div class="tabela-envolve">
        <table class="tabela clicavel tabela-cartoes tabela-catalogo${ehPeca ? ' com-data' : ''}">
          <thead>
            <tr>
              <th>${esc(T.coluna)}</th>
              <th class="valor">${esc(T.colunaValor)}</th>
              ${ehPeca ? '<th>Última atualização</th>' : ''}
              <th>Situação</th>
              <th class="acoes-linha"><span class="sr">Ações</span></th>
            </tr>
          </thead>
          <tbody>${itens.map(linhaHTML).join('')}</tbody>
        </table>
      </div>`;
    if (destacarId) {
      $(`tr[data-id="${destacarId}"]`, areaResultado)?.scrollIntoView({ block: 'nearest' });
      destacarId = null;
    }
  }

  // -------------------------------------------------------------------------
  // Edição rápida do valor (direto na tabela)
  // -------------------------------------------------------------------------
  function editarPreco(tr, item) {
    const celula = $('.col-valor', tr);
    if ($('input', celula)) return;
    celula.innerHTML = `
      <div class="preco-edicao entrada-prefixo">
        <span>R$</span>
        <input class="entrada entrada-valor" inputmode="decimal" value="${esc(numeroBR(item.valor))}" aria-label="Novo valor de ${esc(
          item.nome
        )}" />
      </div>`;
    const input = $('input', celula);
    input.focus();
    input.select();
    let concluido = false;

    const restaurar = () => {
      if (concluido) return;
      concluido = true;
      desenhar();
    };
    const gravar = async () => {
      if (concluido) return;
      const texto = input.value.trim();
      const valor = Math.round(lerNumero(texto) * 100) / 100;
      if (!texto || valor < 0) {
        input.classList.add('erro');
        input.focus();
        toast('Informe um valor válido, por exemplo 1.234,56.', 'erro');
        return;
      }
      concluido = true;
      if (valor === Number(item.valor)) return desenhar();
      input.disabled = true;
      try {
        const r = await api.put(`/${tipo}/${item.id}`, { valor });
        Object.assign(item, r);
        destacarId = item.id;
        toast(`Valor de “${item.nome}” atualizado para ${moeda(r.valor)}.`);
      } catch (e) {
        erro(e);
      }
      desenhar();
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        gravar();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        restaurar();
      }
    });
    input.addEventListener('blur', () => setTimeout(gravar, 0));
    input.addEventListener('click', (e) => e.stopPropagation());
  }

  // -------------------------------------------------------------------------
  // Formulário em painel lateral
  // -------------------------------------------------------------------------
  function formHTML(x, { duplicando }) {
    const valorTexto = x.valor === undefined || x.valor === '' ? '' : numeroBR(x.valor);
    return `
      <div class="form-cadastro">
        ${
          duplicando
            ? `<div class="aviso aviso-info">${icone('copy')}<div>${
                ehPeca
                  ? 'Cópia de uma peça existente. Ajuste o nome, o código e o valor antes de salvar.'
                  : 'Cópia de um serviço existente. Use a <b>descrição</b> para diferenciar as variações (ex.: “Valor reduzido”) e ajuste o valor.'
              }</div></div>`
            : ''
        }
        <div class="grade grade-2">
          <div class="campo span-tudo" data-campo="nome">
            <label for="cat-nome">Nome <span class="obrigatorio" aria-hidden="true">*</span></label>
            <input id="cat-nome" name="nome" value="${esc(x.nome || '')}" maxlength="160" autocomplete="off" placeholder="${esc(
              T.exemplo
            )}" />
            <div class="aviso-nome" aria-live="polite"></div>
          </div>
          ${
            ehPeca
              ? `<div class="campo" data-campo="codigo">
                  <label for="cat-codigo">Código <span class="opcional">(opcional)</span></label>
                  <input id="cat-codigo" name="codigo" value="${esc(x.codigo || '')}" maxlength="60" autocomplete="off" placeholder="Ref. do fabricante" />
                </div>`
              : `<div class="campo span-tudo" data-campo="descricao">
                  <label for="cat-descricao">Descrição / variação <span class="opcional">(opcional)</span></label>
                  <input id="cat-descricao" name="descricao" value="${esc(x.descricao || '')}" maxlength="160" autocomplete="off" placeholder="Ex.: Valor reduzido" />
                  <span class="dica">Aparece abaixo do nome. Útil quando o mesmo serviço tem mais de um preço.</span>
                </div>`
          }
          <div class="campo" data-campo="valor">
            <label for="cat-valor">${ehPeca ? 'Valor unitário' : 'Valor'} <span class="obrigatorio" aria-hidden="true">*</span></label>
            <div class="entrada-prefixo">
              <span>R$</span>
              <input id="cat-valor" name="valor" class="entrada-valor" inputmode="decimal" autocomplete="off" value="${esc(
                valorTexto
              )}" placeholder="0,00" />
            </div>
          </div>
          <div class="campo span-tudo">
            <label class="interruptor caixa-interruptor">
              <input type="checkbox" name="ativo" ${x.ativo === 0 || x.ativo === false ? '' : 'checked'} />
              <span class="trilho"></span>
              <span>
                <span class="negrito">Ativo</span>
                <span class="dica bloco">Itens ativos aparecem na busca ao montar orçamentos. Desative em vez de excluir para manter o histórico.</span>
              </span>
            </label>
          </div>
        </div>
        ${
          x.id && !duplicando
            ? `<p class="form-rodape-info">${icone('history', 'i-s')}Cadastrad${T.o} em ${esc(dataBR(x.criado_em))} · última alteração em ${esc(
                dataBR(x.atualizado_em)
              )} (${esc(tempoRelativo(x.atualizado_em))})</p>`
            : ''
        }
      </div>`;
  }

  function limparErro(campo) {
    campo.classList.remove('erro');
    $('.msg-erro', campo)?.remove();
  }
  function marcarErro(form, nome, msg) {
    const campo = $(`.campo[data-campo="${nome}"]`, form);
    if (!campo) return;
    limparErro(campo);
    campo.classList.add('erro');
    const span = document.createElement('span');
    span.className = 'msg-erro';
    span.textContent = msg;
    const depois = $('.dica', campo);
    if (depois) depois.before(span);
    else campo.appendChild(span);
  }

  function validar(form) {
    $$('.campo.erro', form).forEach(limparErro);
    const nome = form.elements.nome.value.trim();
    const textoValor = form.elements.valor.value.trim();
    const valor = Math.round(lerNumero(textoValor) * 100) / 100;
    let primeiro = null;
    if (!nome) {
      marcarErro(form, 'nome', `Informe o nome d${T.o} ${T.um}.`);
      primeiro ||= 'nome';
    }
    if (!textoValor || !/\d/.test(textoValor)) {
      marcarErro(form, 'valor', 'Informe o valor. Ex.: 1.234,56');
      primeiro ||= 'valor';
    } else if (valor < 0) {
      marcarErro(form, 'valor', 'O valor não pode ser negativo.');
      primeiro ||= 'valor';
    }
    if (primeiro) {
      form.elements[primeiro].focus();
      return null;
    }
    const dados = { nome, valor, ativo: form.elements.ativo.checked };
    if (ehPeca) dados.codigo = form.elements.codigo.value.trim();
    else dados.descricao = form.elements.descricao.value.trim();
    return dados;
  }

  async function abrirFormulario(item = {}, { duplicando = false } = {}) {
    const editando = Boolean(item.id) && !duplicando;
    let todos = [];
    try {
      todos = await api.get(`/${tipo}`);
    } catch {
      /* sem verificação de nomes repetidos */
    }
    if (!ativo) return;

    const titulo = editando
      ? `Editar ${T.um}`
      : duplicando
        ? `Duplicar ${T.um}`
        : T.novo;
    const m = abrirModal({
      titulo,
      painel: true,
      tamanho: 'painel-cadastro',
      corpo: formHTML(item, { duplicando }),
      acoes: [
        ...(editando
          ? [{ texto: 'Excluir', classe: 'btn-fantasma btn-perigo a-esquerda', icone: 'trash-2', valor: 'excluir' }]
          : []),
        { texto: 'Cancelar', classe: 'btn-fantasma', valor: null },
        {
          texto: editando ? 'Salvar alterações' : `Cadastrar ${T.um}`,
          classe: 'btn-primario',
          icone: 'check',
          tipo: 'submit',
          aoClicar: async ({ form }) => {
            const dados = validar(form);
            if (!dados) return false;
            const botao = $('button[type=submit]', form);
            botao.disabled = true;
            try {
              return editando ? await api.put(`/${tipo}/${item.id}`, dados) : await api.post(`/${tipo}`, dados);
            } catch (e) {
              erro(e);
              botao.disabled = false;
              return false;
            }
          },
        },
      ],
    });

    const form = m.el;
    const inputValor = form.elements.valor;
    const inputNome = form.elements.nome;
    const avisoNome = $('.aviso-nome', form);

    inputValor.addEventListener('blur', () => {
      const t = inputValor.value.trim();
      if (t && /\d/.test(t)) inputValor.value = numeroBR(lerNumero(t));
    });
    inputValor.addEventListener('focus', () => setTimeout(() => inputValor.select(), 0));
    form.addEventListener('input', (e) => {
      const campo = e.target.closest('.campo.erro');
      if (campo) limparErro(campo);
    });

    const verificarNome = () => {
      const n = normalizar(inputNome.value);
      const iguais = n ? todos.filter((x) => normalizar(x.nome) === n && (!editando || x.id !== item.id)) : [];
      if (!iguais.length) {
        avisoNome.innerHTML = '';
        return;
      }
      const precos = iguais
        .map((x) => `${moeda(x.valor)}${x.descricao ? ` (${esc(x.descricao)})` : ''}`)
        .join(', ');
      avisoNome.innerHTML = ehPeca
        ? `<div class="aviso aviso-alerta">${icone('triangle-alert')}<div>Já existe uma peça com este nome por ${precos}. Confira para não cadastrar em duplicidade.</div></div>`
        : `<div class="aviso aviso-info">${icone('info')}<div>Já existe “${esc(
            iguais[0].nome
          )}” por ${precos}. Serviços com o mesmo nome e valores diferentes ficam como itens separados — use a descrição para diferenciá-los.</div></div>`;
    };
    inputNome.addEventListener('input', debounce(verificarNome, 200));
    verificarNome();

    if (duplicando) {
      setTimeout(() => {
        if (ehPeca) inputNome.select();
        else form.elements.descricao.focus();
      }, 40);
    } else if (item.nome && !editando) {
      setTimeout(() => inputValor.focus(), 40);
    }

    const r = await m.resultado;
    if (!ativo) return;
    if (r === 'excluir') return excluir(item);
    if (r && r.id) {
      if (editando) toast('Alterações salvas.');
      else toast(`${ehPeca ? 'Peça' : 'Serviço'} “${r.nome}” cadastrad${T.o}.`);
      destacarId = r.id;
      if ((filtro === 'ativos' && !r.ativo) || (filtro === 'inativos' && r.ativo)) {
        filtro = 'todos';
        gravarPreferencia(chaveFiltro, filtro);
      }
      if (!editando && termo && !normalizar(r.nome).includes(normalizar(termo))) campoBusca.value = '';
      await carregar();
    }
  }

  async function excluir(x) {
    const ok = await confirmar({
      titulo: `Excluir ${T.um}`,
      mensagem: `Excluir “${x.nome}”${x.descricao ? ` (${x.descricao})` : ''}? Orçamentos já feitos não mudam. Se quiser apenas tirá-l${T.o} da busca, desative em vez de excluir.`,
      confirmar: 'Excluir',
      perigo: true,
    });
    if (!ok) return;
    try {
      await api.del(`/${tipo}/${x.id}`);
      toast(`${ehPeca ? 'Peça' : 'Serviço'} excluíd${T.o}.`);
      await carregar();
    } catch (e) {
      erro(e);
    }
  }

  function duplicar(x) {
    const copia = { ...x, id: undefined };
    if (!ehPeca) copia.descricao = '';
    abrirFormulario(copia, { duplicando: true });
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
    const chip = e.target.closest('[data-filtro]');
    if (chip) {
      filtro = chip.dataset.filtro;
      gravarPreferencia(chaveFiltro, filtro);
      desenhar();
      return;
    }
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
    const item = lista.find((x) => x.id === Number(tr.dataset.id));
    if (!item) return;
    const botao = e.target.closest('[data-acao]');
    if (!botao && (e.target.closest('a, button, input') || getSelection().toString())) return;
    const acao = botao?.dataset.acao || 'editar';
    if (acao === 'preco') editarPreco(tr, item);
    else if (acao === 'duplicar') duplicar(item);
    else if (acao === 'excluir') excluir(item);
    else abrirFormulario(item);
  });

  raiz.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.target.tagName !== 'TR') return;
    const item = lista.find((x) => x.id === Number(e.target.dataset.id));
    if (item) abrirFormulario(item);
  });

  hidratarIcones(el);
  await carregar();
  if (!('ontouchstart' in window)) campoBusca.focus({ preventScroll: true });

  return {
    desmontar() {
      ativo = false;
      carregarDepois.cancelar();
      $$('.modal.painel-cadastro').forEach((m) => m.closest('.modal-fundo')?.remove());
    },
  };
}
