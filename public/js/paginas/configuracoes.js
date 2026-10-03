// Tela de configurações.
//
// Seções: Empresa, Orçamento (com papel timbrado), Checklist, Técnicos,
// Numeração, E-mail (SMTP), WhatsApp e Backup. Uma barra fixa "Salvar"
// grava de uma vez todas as seções alteradas (PUT /api/config apenas com as
// seções modificadas: listas são substituídas e objetos mesclados no servidor).
// As imagens do papel timbrado e o backup são ações imediatas.
//
// Atalho de rota: #/configuracoes?secao=email abre direto na seção.

import { api, obterConfig, definirConfig } from '../api.js';
import {
  $,
  $$,
  esc,
  hidratarIcones,
  debounce,
  moeda,
  dataHoraBR,
  mascaraTelefone,
  mascaraDocumento,
  toast,
  erro,
  confirmar,
  carregandoHTML,
  icone,
  definirTitulo,
  lerArquivo,
  lerTexto,
} from '../ui.js';

const SECOES = [
  {
    id: 'empresa',
    titulo: 'Empresa',
    icone: 'building-2',
    texto: 'Dados que aparecem no orçamento em PDF, no checklist impresso e nas mensagens enviadas aos clientes.',
  },
  {
    id: 'orcamento',
    titulo: 'Orçamento',
    icone: 'receipt',
    texto: 'Valores padrão das novas ordens, textos de garantia e condições, e o papel timbrado do PDF.',
  },
  {
    id: 'checklist',
    titulo: 'Checklist',
    icone: 'list-checks',
    texto: 'Itens verificados na entrada do equipamento, acessórios e tensões.',
  },
  {
    id: 'tecnicos',
    titulo: 'Técnicos',
    icone: 'hard-hat',
    texto: 'Quem executa os serviços. O técnico é escolhido em cada ordem de serviço.',
  },
  {
    id: 'numeracao',
    titulo: 'Numeração',
    icone: 'hash',
    texto: 'Número das ordens de serviço (OS).',
  },
  {
    id: 'email',
    titulo: 'E-mail',
    icone: 'mail',
    texto: 'Conta usada para enviar o orçamento em PDF direto pelo sistema.',
  },
  {
    id: 'whatsapp',
    titulo: 'WhatsApp',
    icone: 'message-circle',
    texto: 'Mensagem que acompanha o orçamento enviado pelo WhatsApp.',
  },
  {
    id: 'backup',
    titulo: 'Backup',
    icone: 'database',
    texto: 'Cópia de segurança de clientes, catálogo, ordens de serviço e configurações.',
  },
];

// Seções que correspondem a chaves da configuração (Backup não tem).
const CHAVES = ['empresa', 'orcamento', 'checklist', 'tecnicos', 'numeracao', 'email', 'whatsapp'];

const VARIAVEIS = [
  ['cliente', 'Nome do cliente'],
  ['numero', 'Número da OS'],
  ['equipamento', 'Equipamento'],
  ['total', 'Valor total do orçamento'],
  ['validade', 'Validade do orçamento, em dias'],
  ['empresa', 'Nome da empresa'],
  ['telefone', 'WhatsApp (ou telefone) da empresa'],
  ['tecnico', 'Técnico responsável pela OS'],
];

const IMAGENS = {
  cabecalho: {
    titulo: 'Cabeçalho',
    px: [1240, 1488],
    cm: '21 × 25,2 cm',
    texto: 'Topo da folha com logotipo e contatos. Pode ocupar quase toda a página, servindo de marca-d’água.',
  },
  rodape: {
    titulo: 'Rodapé',
    px: [1240, 174],
    cm: '21 × 2,94 cm',
    texto: 'Faixa no pé da folha, normalmente com CNPJ e endereço.',
  },
};

const EMAIL_OK = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------
const clonar = (v) => structuredClone(v);
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const obterCaminho = (obj, caminho) => caminho.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
function definirCaminho(obj, caminho, valor) {
  const ks = caminho.split('.');
  const ultima = ks.pop();
  const alvo = ks.reduce((o, k) => (o[k] ??= {}), obj);
  alvo[ultima] = valor;
}
const normalizar = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

function listaDeTexto(v) {
  return (Array.isArray(v) ? v : []).map((x) => String(x ?? '').trim()).filter(Boolean);
}

/** Copia as seções editáveis da configuração recebida do servidor. */
function extrair(cfg) {
  const o = {};
  for (const k of CHAVES) o[k] = clonar(cfg[k] ?? (k === 'tecnicos' ? [] : {}));
  o.orcamento.formasPagamento ||= [];
  for (const k of ['itens', 'acessorios', 'tensoesEntrada', 'tensoesSaida', 'itensSugeridos']) o.checklist[k] ||= [];
  o.tecnicos = (Array.isArray(o.tecnicos) ? o.tecnicos : []).map((t) => ({
    nome: t?.nome || '',
    documento: t?.documento || '',
  }));
  o.email.senha = '';
  return o;
}

function medirImagem(src) {
  return new Promise((ok, falha) => {
    const img = new Image();
    img.onload = () => ok({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => falha(new Error('Não foi possível abrir a imagem.'));
    img.src = src;
  });
}

// ---------------------------------------------------------------------------
// Tela
// ---------------------------------------------------------------------------
export async function montar(el, { query = {} } = {}) {
  definirTitulo('Configurações');
  el.innerHTML = carregandoHTML('Carregando configurações…');

  let [cfg, ultimas] = await Promise.all([obterConfig(true), api.get('/ordens?limite=1').catch(() => [])]);
  const ultimoNumero = Number(ultimas?.[0]?.numero) || 0;

  let original = extrair(cfg);
  let estado = clonar(original);
  let secaoAtual = SECOES.some((s) => s.id === query.secao) ? query.secao : 'empresa';
  let versaoImagens = Date.now();
  let ignorarAlteracoes = false;
  let salvando = false;
  let ativo = true;
  const ultimoCampoVariaveis = {}; // grupo -> elemento que recebe as variáveis

  el.innerHTML = `
    <div class="tela-config">
      <div class="pagina-topo">
        <div>
          <h1>Configurações</h1>
          <p class="subtitulo">Dados da empresa, padrões do orçamento, checklist e envio por e-mail e WhatsApp.</p>
        </div>
      </div>
      <div class="config-layout">
        <nav class="config-nav" aria-label="Seções das configurações">
          ${SECOES.map(
            (s) => `
            <button type="button" class="config-nav-item" data-secao="${s.id}">
              ${icone(s.icone)}<span>${esc(s.titulo)}</span><i class="ponto-alterado" title="Alterações não salvas"></i>
            </button>`
          ).join('')}
        </nav>
        <div class="config-conteudo">
          <div class="config-secao" aria-live="polite"></div>
          <div class="barra-salvar oculto" role="region" aria-label="Alterações não salvas">
            <div class="barra-salvar-texto">${icone('circle-alert')}<span></span></div>
            <div class="grupo-botoes">
              <button type="button" class="btn btn-fantasma" data-descartar>Descartar</button>
              <button type="button" class="btn btn-primario" data-salvar>${icone('save')}<span>Salvar alterações</span></button>
            </div>
          </div>
        </div>
      </div>
    </div>`;

  const raiz = $('.tela-config', el);
  const areaSecao = $('.config-secao', raiz);
  const barra = $('.barra-salvar', raiz);

  // -------------------------------------------------------------------------
  // Peças de formulário
  // -------------------------------------------------------------------------
  function campo({
    caminho,
    rotulo,
    tipo = 'text',
    classe = '',
    dica = '',
    placeholder = '',
    obrigatorio = false,
    mascara = '',
    atributos = '',
    sufixo = '',
    grupo = '',
  }) {
    const id = `cfg-${caminho.replace(/\./g, '-')}`;
    const valor = obterCaminho(estado, caminho) ?? '';
    const entrada = `<input id="${id}" type="${tipo}" data-caminho="${caminho}"${mascara ? ` data-mascara="${mascara}"` : ''}${
      tipo === 'number' ? ' data-tipo="int"' : ''
    }${grupo ? ` data-grupo-variaveis="${grupo}"` : ''} value="${esc(valor)}" placeholder="${esc(placeholder)}" ${atributos} />`;
    return `
      <div class="campo ${classe}" data-campo="${caminho}">
        <label for="${id}">${esc(rotulo)}${obrigatorio ? ' <span class="obrigatorio" aria-hidden="true">*</span>' : ''}</label>
        ${sufixo ? `<div class="com-sufixo">${entrada}<span>${esc(sufixo)}</span></div>` : entrada}
        ${dica ? `<span class="dica">${dica}</span>` : ''}
      </div>`;
  }

  function areaTexto({ caminho, rotulo, linhas = 4, dica = '', classe = '', placeholder = '', grupo = '' }) {
    const id = `cfg-${caminho.replace(/\./g, '-')}`;
    return `
      <div class="campo ${classe}" data-campo="${caminho}">
        <label for="${id}">${esc(rotulo)}</label>
        <textarea id="${id}" rows="${linhas}" data-caminho="${caminho}"${
          grupo ? ` data-grupo-variaveis="${grupo}"` : ''
        } placeholder="${esc(placeholder)}">${esc(obterCaminho(estado, caminho) ?? '')}</textarea>
        ${dica ? `<span class="dica">${dica}</span>` : ''}
      </div>`;
  }

  function interruptor({ caminho, titulo, texto }) {
    return `
      <label class="opcao-linha">
        <span class="opcao-texto">
          <span class="opcao-titulo">${esc(titulo)}</span>
          <span class="opcao-desc">${texto}</span>
        </span>
        <span class="interruptor">
          <input type="checkbox" data-caminho="${caminho}" ${obterCaminho(estado, caminho) ? 'checked' : ''} />
          <span class="trilho"></span>
        </span>
      </label>`;
  }

  function cartao({ icone: ic = '', titulo, texto = '', corpo, rodape = '', acoes = '', classe = '' }) {
    return `
      <section class="cartao cartao-config ${classe}">
        <header class="cartao-topo">
          <div class="titulo">
            ${ic ? `<span class="icone-redondo">${icone(ic)}</span>` : ''}
            <div><h3>${esc(titulo)}</h3>${texto ? `<p>${texto}</p>` : ''}</div>
          </div>
          ${acoes ? `<div class="cartao-acoes">${acoes}</div>` : ''}
        </header>
        <div class="cartao-corpo">${corpo}</div>
        ${rodape ? `<footer class="cartao-rodape">${rodape}</footer>` : ''}
      </section>`;
  }

  function editorChips(caminho, { placeholder, rotulo }) {
    const itens = obterCaminho(estado, caminho) || [];
    return `
      <div class="editor-chips" data-lista="${caminho}" role="group" aria-label="${esc(rotulo)}">
        ${itens
          .map(
            (t, i) => `
          <span class="chip-item">
            <span>${esc(t)}</span>
            <button type="button" data-remover-chip="${i}" aria-label="Remover ${esc(t)}" title="Remover">${icone('x')}</button>
          </span>`
          )
          .join('')}
        <span class="chip-novo">
          <input type="text" data-novo-chip placeholder="${esc(placeholder)}" aria-label="${esc(`Adicionar em ${rotulo}`)}" maxlength="60" />
          <button type="button" class="btn btn-fantasma btn-p" data-adicionar-chip>${icone('plus')}Adicionar</button>
        </span>
      </div>`;
  }

  function variaveisHTML(grupo) {
    return `
      <div class="variaveis" data-variaveis="${grupo}">
        <span class="variaveis-rotulo">${icone('braces', 'i-s')}Inserir variável:</span>
        ${VARIAVEIS.map(
          ([v, d]) => `<button type="button" class="chip-variavel" data-variavel="${v}" title="${esc(d)}">{${v}}</button>`
        ).join('')}
      </div>`;
  }

  // -------------------------------------------------------------------------
  // Seções
  // -------------------------------------------------------------------------
  const SECAO_HTML = {
    empresa() {
      return (
        cartao({
          icone: 'building-2',
          titulo: 'Identificação',
          texto: 'Como a empresa aparece nos documentos.',
          corpo: `
            <div class="grade grade-2">
              ${campo({ caminho: 'empresa.nome', rotulo: 'Nome fantasia', obrigatorio: true, placeholder: 'BALANÇAS.COM' })}
              ${campo({ caminho: 'empresa.razaoSocial', rotulo: 'Razão social', placeholder: 'Nome registrado no CNPJ' })}
              ${campo({
                caminho: 'empresa.cnpj',
                rotulo: 'CNPJ',
                mascara: 'documento',
                placeholder: '00.000.000/0000-00',
                atributos: 'inputmode="numeric"',
              })}
              ${campo({
                caminho: 'empresa.permissionaria',
                rotulo: 'Nº de autorização (permissionária Inmetro)',
                placeholder: 'Nº fornecido pelo IPEM/Inmetro',
                dica: 'Autorização para reparo e manutenção de instrumentos de pesagem.',
              })}
            </div>`,
        }) +
        cartao({
          icone: 'map-pin',
          titulo: 'Endereço e contato',
          texto: 'O WhatsApp entra na variável {telefone} das mensagens.',
          corpo: `
            <div class="grade grade-2">
              ${campo({ caminho: 'empresa.endereco', rotulo: 'Endereço', classe: 'span-tudo', placeholder: 'Rua, número, bairro' })}
              ${campo({ caminho: 'empresa.cidade', rotulo: 'Cidade / UF', placeholder: 'Rio Claro - SP' })}
              ${campo({
                caminho: 'empresa.telefone',
                rotulo: 'Telefone',
                tipo: 'tel',
                mascara: 'telefone',
                placeholder: '(19) 3023-9050',
              })}
              ${campo({
                caminho: 'empresa.whatsapp',
                rotulo: 'WhatsApp',
                tipo: 'tel',
                mascara: 'telefone',
                placeholder: '(19) 99999-9999',
              })}
              ${campo({ caminho: 'empresa.email', rotulo: 'E-mail', tipo: 'email', placeholder: 'contato@empresa.com.br' })}
              ${campo({ caminho: 'empresa.site', rotulo: 'Site', placeholder: 'www.empresa.com.br', classe: 'span-tudo' })}
            </div>`,
        })
      );
    },

    orcamento() {
      return (
        cartao({
          icone: 'receipt',
          titulo: 'Padrões das novas ordens',
          texto: 'Preenchidos automaticamente em cada nova OS — podem ser ajustados na própria ordem.',
          corpo: `
            <div class="grade grade-2">
              ${campo({
                caminho: 'orcamento.validadeDias',
                rotulo: 'Validade do orçamento',
                tipo: 'number',
                sufixo: 'dias',
                atributos: 'min="1" max="365" step="1" inputmode="numeric"',
              })}
              ${campo({
                caminho: 'orcamento.prazoPadraoDias',
                rotulo: 'Prazo de conclusão',
                tipo: 'number',
                sufixo: 'dias',
                atributos: 'min="0" max="365" step="1" inputmode="numeric"',
                dica: 'Contados a partir da aprovação.',
              })}
              <div class="campo span-tudo">
                <span class="rotulo">Formas de pagamento aceitas</span>
                ${editorChips('orcamento.formasPagamento', { placeholder: 'Ex.: Boleto 30 dias', rotulo: 'Formas de pagamento' })}
                <span class="dica">Aparecem no orçamento. Pressione Enter para adicionar.</span>
              </div>
            </div>
            <div class="opcoes-lista">
              ${interruptor({
                caminho: 'orcamento.mostrarAceite',
                titulo: 'Mostrar campo de aceite do cliente',
                texto: 'Inclui no PDF um quadro para o cliente assinar e datar a aprovação do orçamento.',
              })}
            </div>`,
        }) +
        cartao({
          icone: 'file-text',
          titulo: 'Textos do orçamento',
          texto: 'Impressos no final do PDF.',
          corpo: `
            <div class="grade">
              ${areaTexto({ caminho: 'orcamento.garantia', rotulo: 'Garantia', linhas: 4 })}
              ${areaTexto({ caminho: 'orcamento.condicoes', rotulo: 'Condições gerais', linhas: 6 })}
            </div>`,
        }) +
        cartao({
          icone: 'image',
          titulo: 'Papel timbrado',
          texto: 'Imagens aplicadas ao fundo de cada página do PDF.',
          classe: 'cartao-timbrado',
          corpo: `
            <div class="opcoes-lista sem-borda">
              ${interruptor({
                caminho: 'orcamento.usarTimbrado',
                titulo: 'Usar papel timbrado no PDF',
                texto: 'Desligado, o orçamento sai em folha branca com um cabeçalho simples.',
              })}
            </div>
            <div class="timbrado" data-bloco="timbrado">${timbradoHTML()}</div>`,
        })
      );
    },

    checklist() {
      return (
        `<div class="aviso aviso-info">${icone('info')}<div>As alterações valem para as <b>novas</b> ordens de serviço. As ordens já abertas mantêm o checklist com que foram criadas.</div></div>` +
        cartao({
          icone: 'list-checks',
          titulo: 'Itens verificados',
          texto: 'Na ordem em que aparecem na tela e no checklist impresso.',
          acoes: `<span class="contador-itens" data-contador-itens></span>`,
          corpo: `<div data-bloco="itens">${itensHTML()}</div>`,
        }) +
        `<section class="cartao cartao-config cartao-sugestoes" data-bloco="sugestoes">${sugestoesHTML()}</section>` +
        cartao({
          icone: 'plug',
          titulo: 'Acessórios e tensões',
          texto: 'Opções marcadas na entrada do equipamento.',
          corpo: `
            <div class="grade">
              <div class="campo">
                <span class="rotulo">Acessórios recebidos</span>
                ${editorChips('checklist.acessorios', { placeholder: 'Ex.: Capa protetora', rotulo: 'Acessórios' })}
              </div>
              <div class="grade grade-2">
                <div class="campo">
                  <span class="rotulo">Tensões de entrada</span>
                  ${editorChips('checklist.tensoesEntrada', { placeholder: 'Ex.: 12 V', rotulo: 'Tensões de entrada' })}
                </div>
                <div class="campo">
                  <span class="rotulo">Tensões de saída</span>
                  ${editorChips('checklist.tensoesSaida', { placeholder: 'Ex.: 12 V', rotulo: 'Tensões de saída' })}
                </div>
              </div>
            </div>`,
        }) +
        cartao({
          icone: 'printer',
          titulo: 'Checklist impresso',
          corpo: campo({
            caminho: 'checklist.rodape',
            rotulo: 'Texto do rodapé',
            placeholder: 'Ex.: Checklist técnico de oficina • Revisão 1.0',
            dica: 'Aparece no pé da folha do checklist (também no checklist em branco).',
          }),
        })
      );
    },

    tecnicos() {
      return cartao({
        icone: 'hard-hat',
        titulo: 'Técnicos',
        texto: 'O documento do técnico aparece no checklist impresso (Portaria Inmetro 457/2021).',
        acoes: `<button type="button" class="btn btn-p" data-adicionar-tecnico>${icone('user-plus')}Adicionar técnico</button>`,
        corpo: `<div data-bloco="tecnicos">${tecnicosHTML()}</div>`,
      });
    },

    numeracao() {
      return cartao({
        icone: 'hash',
        titulo: 'Numeração das ordens de serviço',
        texto: 'Use para continuar a sequência do talão ou da planilha que você usava antes.',
        corpo: `
          <div class="grade grade-2">
            ${campo({
              caminho: 'numeracao.inicioOS',
              rotulo: 'Número inicial da OS',
              tipo: 'number',
              atributos: 'min="1" step="1" inputmode="numeric"',
              dica: 'A próxima OS usa o maior valor entre (último nº + 1) e este número inicial.',
            })}
            <div class="numeracao-previa" data-previa-numero></div>
          </div>`,
      });
    },

    email() {
      const configurado = Boolean(original.email.host && original.email.usuario);
      return (
        cartao({
          icone: 'mail',
          titulo: 'Servidor de envio (SMTP)',
          texto: 'Dados da conta de e-mail que envia os orçamentos.',
          acoes: configurado
            ? `<span class="selo selo-aprovada">${icone('circle-check')}Configurado</span>`
            : `<span class="selo">${icone('circle-dashed')}Não configurado</span>`,
          corpo: `
            <div class="grade grade-4">
              ${campo({
                caminho: 'email.host',
                rotulo: 'Servidor SMTP',
                classe: 'span-3',
                placeholder: 'smtp.gmail.com',
                atributos: 'autocomplete="off" spellcheck="false"',
              })}
              ${campo({ caminho: 'email.porta', rotulo: 'Porta', tipo: 'number', atributos: 'min="1" max="65535" inputmode="numeric"' })}
              <div class="span-tudo opcoes-lista sem-borda">
                ${interruptor({
                  caminho: 'email.seguro',
                  titulo: 'Conexão segura (SSL/TLS)',
                  texto: 'Ligue para a porta 465. Para a porta 587, deixe desligado (a conexão é protegida com STARTTLS).',
                })}
              </div>
              ${campo({
                caminho: 'email.usuario',
                rotulo: 'Usuário',
                classe: 'span-2',
                placeholder: 'seu.email@gmail.com',
                atributos: 'autocomplete="off" spellcheck="false"',
              })}
              <div class="campo span-2" data-campo="email.senha">
                <label for="cfg-email-senha">Senha</label>
                <div class="com-botao">
                  <input id="cfg-email-senha" type="password" data-caminho="email.senha" value="${esc(estado.email.senha)}"
                    placeholder="${original.email.senhaDefinida ? '•••••••• (mantida)' : 'Senha ou senha de app'}" autocomplete="new-password" />
                  <button type="button" class="btn btn-fantasma btn-icone btn-p" data-ver-senha aria-label="Mostrar senha" title="Mostrar senha">${icone(
                    'eye'
                  )}</button>
                </div>
                <span class="dica">${
                  original.email.senhaDefinida
                    ? 'Deixe em branco para manter a senha atual.'
                    : 'No Gmail, use uma senha de app (veja a ajuda abaixo).'
                }</span>
              </div>
              ${campo({ caminho: 'email.remetenteNome', rotulo: 'Nome do remetente', classe: 'span-2', placeholder: 'BALANÇAS.COM' })}
              ${campo({
                caminho: 'email.remetenteEmail',
                rotulo: 'E-mail do remetente',
                tipo: 'email',
                classe: 'span-2',
                placeholder: 'Igual ao usuário, se vazio',
              })}
              ${campo({
                caminho: 'email.copiaPara',
                rotulo: 'Enviar cópia para',
                tipo: 'email',
                classe: 'span-tudo',
                placeholder: 'recepcao@empresa.com.br',
                dica: 'Opcional. Recebe uma cópia (CC) de cada orçamento enviado.',
              })}
            </div>
            <details class="ajuda">
              <summary>${icone('circle-help')}<span>Como configurar Gmail ou Outlook/Hotmail</span>${icone('chevron-down', 'seta')}</summary>
              <div class="ajuda-corpo">
                <div class="ajuda-provedor">
                  <h4>Gmail</h4>
                  <ul>
                    <li>Servidor: <code>smtp.gmail.com</code></li>
                    <li>Porta <code>465</code> com SSL/TLS ligado (ou <code>587</code> com SSL/TLS desligado)</li>
                    <li>Usuário: o endereço Gmail completo</li>
                    <li>Senha: crie uma <b>senha de app</b> em <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener">myaccount.google.com/apppasswords</a> (exige verificação em duas etapas). A senha normal da conta não funciona.</li>
                  </ul>
                  <button type="button" class="btn btn-p" data-predefinicao="gmail">${icone('sparkles')}Preencher para Gmail</button>
                </div>
                <div class="ajuda-provedor">
                  <h4>Outlook / Hotmail</h4>
                  <ul>
                    <li>Servidor: <code>smtp-mail.outlook.com</code></li>
                    <li>Porta <code>587</code> com SSL/TLS desligado</li>
                    <li>Usuário e senha: os mesmos da conta Microsoft</li>
                  </ul>
                  <button type="button" class="btn btn-p" data-predefinicao="outlook">${icone('sparkles')}Preencher para Outlook</button>
                </div>
              </div>
            </details>`,
          rodape: `
            <div class="resultado-teste" data-resultado-teste></div>
            <button type="button" class="btn" data-testar-email>${icone('plug-zap')}<span>Testar conexão</span></button>`,
        }) +
        cartao({
          icone: 'send',
          titulo: 'Mensagem do e-mail',
          texto: 'As variáveis entre chaves são trocadas pelos dados de cada orçamento.',
          corpo: `
            <div class="modelo-mensagem">
              <div class="grade">
                ${campo({ caminho: 'email.assunto', rotulo: 'Assunto', grupo: 'email' })}
                ${areaTexto({ caminho: 'email.mensagem', rotulo: 'Mensagem', linhas: 9, grupo: 'email' })}
                ${variaveisHTML('email')}
              </div>
              <div class="previa">
                <span class="rotulo">${icone('eye', 'i-s')}Pré-visualização</span>
                <div class="previa-email" data-previa="email"></div>
              </div>
            </div>`,
        })
      );
    },

    whatsapp() {
      return (
        `<div class="aviso aviso-info">${icone('info')}<div>O WhatsApp não permite anexar arquivos por link. Ao enviar, o sistema <b>baixa o PDF</b> do orçamento e <b>abre o WhatsApp</b> com a mensagem abaixo já escrita — o técnico só precisa anexar o PDF na conversa antes de enviar.</div></div>` +
        cartao({
          icone: 'message-circle',
          titulo: 'Mensagem do WhatsApp',
          texto: 'As variáveis entre chaves são trocadas pelos dados de cada orçamento.',
          corpo: `
            <div class="modelo-mensagem">
              <div class="grade">
                ${areaTexto({ caminho: 'whatsapp.mensagem', rotulo: 'Mensagem', linhas: 8, grupo: 'whatsapp' })}
                ${variaveisHTML('whatsapp')}
                <span class="dica-mensagem">Dica: *texto* fica em <b>negrito</b> e _texto_ em <i>itálico</i> no WhatsApp.</span>
              </div>
              <div class="previa">
                <span class="rotulo">${icone('eye', 'i-s')}Pré-visualização</span>
                <div class="previa-whatsapp"><div class="balao" data-previa="whatsapp"></div></div>
              </div>
            </div>`,
        })
      );
    },

    backup() {
      return (
        cartao({
          icone: 'database',
          titulo: 'Cópia de segurança',
          texto: 'Inclui clientes, serviços, peças, ordens de serviço com histórico e configurações.',
          corpo: `
            <div class="acoes-backup">
              <div class="acao-backup">
                <span class="icone-redondo">${icone('hard-drive-download')}</span>
                <div class="acao-backup-texto">
                  <h4>Baixar backup</h4>
                  <p>Gera um arquivo <code>.json</code> com todos os dados. Guarde em um pendrive ou na nuvem.</p>
                </div>
                <a class="btn btn-primario" href="/api/backup" download>${icone('download')}Baixar backup (.json)</a>
              </div>
              <div class="acao-backup">
                <span class="icone-redondo perigo">${icone('archive-restore')}</span>
                <div class="acao-backup-texto">
                  <h4>Restaurar backup</h4>
                  <p>Substitui <b>todos</b> os dados atuais pelos do arquivo escolhido. Esta ação não pode ser desfeita.</p>
                </div>
                <button type="button" class="btn btn-perigo" data-restaurar-backup>${icone('upload')}Restaurar backup…</button>
                <input type="file" accept="application/json,.json" class="oculto" data-arquivo-backup />
              </div>
            </div>`,
        }) +
        `<div class="aviso">${icone('history')}<div><b>Cópias automáticas:</b> cada vez que o sistema é iniciado, uma cópia do banco de dados é salva na pasta <code>dados/backups</code> (as 20 mais recentes são mantidas). O arquivo .json inclui também as imagens personalizadas do papel timbrado.</div></div>`
      );
    },
  };

  // --- Blocos que se redesenham sozinhos -----------------------------------
  function timbradoHTML() {
    const pers = cfg.imagens || {};
    const usar = Boolean(estado.orcamento.usarTimbrado);
    const src = (n) => `/timbrado/${n}.png?v=${versaoImagens}`;
    return `
      <figure class="folha-a4${usar ? '' : ' desligada'}" aria-label="Pré-visualização de uma página do orçamento">
        <div class="folha">
          <img class="folha-cabecalho" src="${src('cabecalho')}" alt="Cabeçalho atual" />
          <div class="folha-conteudo" aria-hidden="true">
            <i style="width:46%"></i><i style="width:78%"></i><i style="width:64%"></i>
            <b></b><i style="width:82%"></i><i style="width:70%"></i><i style="width:76%"></i><i style="width:40%"></i>
            <b class="baixo"></b><i style="width:58%"></i><i style="width:72%"></i>
          </div>
          <img class="folha-rodape" src="${src('rodape')}" alt="Rodapé atual" />
        </div>
        <figcaption>${usar ? 'Folha A4 com o papel timbrado' : 'Papel timbrado desligado'}</figcaption>
      </figure>
      <div class="timbrado-itens">
        ${Object.entries(IMAGENS)
          .map(([nome, info]) => {
            const personalizado = Boolean(pers[`${nome}Personalizado`]);
            return `
            <div class="timbrado-item">
              <div class="miniatura miniatura-${nome}"><img src="${src(nome)}" alt="" /></div>
              <div class="timbrado-info">
                <div class="linha">
                  <h4>${esc(info.titulo)}</h4>
                  <span class="etiqueta${personalizado ? ' etiqueta-verde' : ''}">${personalizado ? 'Personalizado' : 'Padrão'}</span>
                </div>
                <p>${esc(info.texto)}</p>
                <p class="medidas">${icone('image', 'i-s')}PNG · ${info.px[0]} × ${info.px[1]} px (${esc(info.cm)})</p>
                <div class="grupo-botoes">
                  <button type="button" class="btn btn-p" data-trocar-imagem="${nome}">${icone('image-up')}Trocar imagem</button>
                  ${
                    personalizado
                      ? `<button type="button" class="btn btn-fantasma btn-p" data-restaurar-imagem="${nome}">${icone(
                          'rotate-ccw'
                        )}Restaurar padrão</button>`
                      : ''
                  }
                </div>
                <input type="file" accept="image/png,.png" class="oculto" data-arquivo-imagem="${nome}" />
              </div>
            </div>`;
          })
          .join('')}
      </div>`;
  }

  function itensHTML() {
    const itens = estado.checklist.itens;
    return `
      ${
        itens.length
          ? `<ol class="lista-itens">
          ${itens
            .map(
              (t, i) => `
            <li class="item-checklist" data-i="${i}">
              <span class="item-num">${i + 1}</span>
              <input class="entrada" data-item-checklist="${i}" value="${esc(t)}" aria-label="Item ${i + 1}" maxlength="140" />
              <span class="item-acoes">
                <button type="button" class="btn btn-fantasma btn-icone btn-p" data-mover-item="${i}" data-direcao="-1" aria-label="Mover para cima" title="Mover para cima" ${
                  i === 0 ? 'disabled' : ''
                }>${icone('chevron-up')}</button>
                <button type="button" class="btn btn-fantasma btn-icone btn-p" data-mover-item="${i}" data-direcao="1" aria-label="Mover para baixo" title="Mover para baixo" ${
                  i === itens.length - 1 ? 'disabled' : ''
                }>${icone('chevron-down')}</button>
                <button type="button" class="btn btn-fantasma btn-icone btn-p btn-perigo" data-remover-item="${i}" aria-label="Remover item ${
                  i + 1
                }" title="Remover">${icone('trash-2')}</button>
              </span>
            </li>`
            )
            .join('')}
        </ol>`
          : `<div class="lista-vazia">${icone('list-checks')}<span>Nenhum item no checklist. Adicione abaixo ou use as sugestões.</span></div>`
      }
      <div class="item-novo">
        <span class="item-num">${icone('plus', 'i-s')}</span>
        <input class="entrada" data-novo-item placeholder="Novo item. Ex.: Teste de carga da bateria (30 min)" aria-label="Novo item do checklist" maxlength="140" />
        <button type="button" class="btn" data-adicionar-item>Adicionar</button>
      </div>`;
  }

  function sugestoesFaltando() {
    const atuais = new Set(estado.checklist.itens.map(normalizar));
    return (estado.checklist.itensSugeridos || [])
      .map((texto, i) => ({ texto, i }))
      .filter((s) => !atuais.has(normalizar(s.texto)));
  }

  function sugestoesHTML() {
    const faltam = sugestoesFaltando();
    return `
      <header class="cartao-topo">
        <div class="titulo">
          <span class="icone-redondo dourado">${icone('sparkles')}</span>
          <div>
            <h3>Sugestões (Portaria Inmetro 157/2022)</h3>
            <p>Verificações recomendadas para instrumentos de pesagem. Adicione as que fazem parte da sua rotina.</p>
          </div>
        </div>
        ${
          faltam.length > 1
            ? `<div class="cartao-acoes"><button type="button" class="btn btn-p" data-adicionar-todas>${icone('list-plus')}Adicionar todas</button></div>`
            : ''
        }
      </header>
      <div class="cartao-corpo">
        ${
          faltam.length
            ? `<ul class="lista-sugestoes">${faltam
                .map(
                  (s) => `
              <li>
                <span>${esc(s.texto)}</span>
                <button type="button" class="btn btn-fantasma btn-p" data-sugestao="${s.i}">${icone('plus')}Adicionar</button>
              </li>`
                )
                .join('')}</ul>`
            : `<p class="sugestoes-ok">${icone('circle-check')}Todas as sugestões já estão no checklist.</p>`
        }
      </div>`;
  }

  function tecnicosHTML() {
    const lista = estado.tecnicos;
    if (!lista.length) {
      return `
        <div class="lista-vazia grande">
          ${icone('hard-hat', 'i-g')}
          <div>
            <b>Nenhum técnico cadastrado</b>
            <span>Cadastre quem executa os serviços para escolher na ordem de serviço.</span>
          </div>
          <button type="button" class="btn btn-primario" data-adicionar-tecnico>${icone('user-plus')}Adicionar técnico</button>
        </div>`;
    }
    return `
      <div class="lista-tecnicos">
        <div class="tecnico-linha cabecalho" aria-hidden="true">
          <span></span><span>Nome completo</span><span>Documento de identidade (RG ou CPF)</span><span></span>
        </div>
        ${lista
          .map(
            (t, i) => `
          <div class="tecnico-linha" data-i="${i}">
            <span class="avatar-tecnico" aria-hidden="true">${icone('user', 'i-s')}</span>
            <div class="campo" data-campo="tecnicos.${i}.nome">
              <label class="sr" for="cfg-tec-${i}-nome">Nome do técnico ${i + 1}</label>
              <input id="cfg-tec-${i}-nome" data-tecnico="nome" data-i="${i}" value="${esc(t.nome)}" placeholder="Nome completo" maxlength="100" />
            </div>
            <div class="campo" data-campo="tecnicos.${i}.documento">
              <label class="sr" for="cfg-tec-${i}-doc">Documento do técnico ${i + 1}</label>
              <input id="cfg-tec-${i}-doc" data-tecnico="documento" data-i="${i}" value="${esc(t.documento)}" placeholder="RG ou CPF" maxlength="40" />
            </div>
            <button type="button" class="btn btn-fantasma btn-icone btn-p btn-perigo" data-remover-tecnico="${i}" aria-label="Remover técnico ${
              i + 1
            }" title="Remover">${icone('trash-2')}</button>
          </div>`
          )
          .join('')}
      </div>`;
  }

  const BLOCOS = { itens: itensHTML, sugestoes: sugestoesHTML, tecnicos: tecnicosHTML, timbrado: timbradoHTML };
  function redesenharBloco(nome) {
    const alvo = $(`[data-bloco="${nome}"]`, areaSecao);
    if (alvo) alvo.innerHTML = BLOCOS[nome]();
    if (nome === 'itens') atualizarContadorItens();
  }

  function atualizarContadorItens() {
    const c = $('[data-contador-itens]', areaSecao);
    if (c) {
      const n = estado.checklist.itens.length;
      c.textContent = `${n} ${n === 1 ? 'item' : 'itens'}`;
    }
  }

  // -------------------------------------------------------------------------
  // Pré-visualizações
  // -------------------------------------------------------------------------
  function proximoNumero() {
    const inicio = Number(estado.numeracao.inicioOS) || 1;
    return Math.max(ultimoNumero + 1, inicio);
  }

  function preencherExemplo(modelo) {
    const vars = {
      cliente: 'Supermercado Bom Preço',
      numero: String(proximoNumero()),
      equipamento: 'Balança Toledo Prix 4 Uno',
      total: moeda(470),
      validade: String(estado.orcamento.validadeDias || 10),
      empresa: estado.empresa.nome || 'Empresa',
      telefone: estado.empresa.whatsapp || estado.empresa.telefone || '',
      tecnico: estado.tecnicos.find((t) => t.nome.trim())?.nome || 'Carlos Silva',
    };
    return esc(modelo || '').replace(/\{(\w+)\}/g, (m, k) =>
      k in vars
        ? `<mark class="var-ok">${esc(vars[k])}</mark>`
        : `<mark class="var-erro" title="Variável desconhecida">${m}</mark>`
    );
  }

  function formatarWhatsapp(html) {
    return html
      .replace(/(^|[\s>])\*([^*\n<]+)\*(?=[\s<.,!?]|$)/g, '$1<b>$2</b>')
      .replace(/(^|[\s>])_([^_\n<]+)_(?=[\s<.,!?]|$)/g, '$1<i>$2</i>');
  }

  function atualizarPrevias() {
    const email = $('[data-previa="email"]', areaSecao);
    if (email) {
      email.innerHTML = `
        <div class="previa-linha"><span>Para</span><b>compras@bompreco.com.br</b></div>
        <div class="previa-linha"><span>Assunto</span><b>${preencherExemplo(estado.email.assunto)}</b></div>
        <div class="previa-corpo">${preencherExemplo(estado.email.mensagem)}</div>
        <div class="previa-anexo">${icone('file-text', 'i-s')}Orcamento ${proximoNumero()} - Supermercado Bom Preco.pdf</div>`;
    }
    const wpp = $('[data-previa="whatsapp"]', areaSecao);
    if (wpp) {
      wpp.innerHTML = `${formatarWhatsapp(preencherExemplo(estado.whatsapp.mensagem))}<span class="hora">09:41</span>`;
    }
    const num = $('[data-previa-numero]', areaSecao);
    if (num) {
      num.innerHTML = `
        <div class="numero-cartao">
          <span class="rotulo">Próxima OS</span>
          <strong>nº ${proximoNumero()}</strong>
          <span class="texto-p texto-suave">${
            ultimoNumero ? `Última OS cadastrada: nº ${ultimoNumero}` : 'Ainda não há ordens de serviço cadastradas.'
          }</span>
        </div>`;
    }
    const folha = $('.folha-a4', areaSecao);
    if (folha) {
      const usar = Boolean(estado.orcamento.usarTimbrado);
      folha.classList.toggle('desligada', !usar);
      $('figcaption', folha).textContent = usar ? 'Folha A4 com o papel timbrado' : 'Papel timbrado desligado';
    }
  }

  // -------------------------------------------------------------------------
  // Navegação entre seções
  // -------------------------------------------------------------------------
  function ajustarAltura(ta) {
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight + 2, 420)}px`;
  }

  function desenharSecao({ rolar = false } = {}) {
    const s = SECOES.find((x) => x.id === secaoAtual);
    areaSecao.innerHTML = `
      <header class="secao-cabecalho">
        <h2>${esc(s.titulo)}</h2>
        <p>${esc(s.texto)}</p>
      </header>
      <div class="pilha">${SECAO_HTML[secaoAtual]()}</div>`;
    hidratarIcones(areaSecao);
    $$('textarea[data-caminho]', areaSecao).forEach(ajustarAltura);
    $$('.config-nav-item', raiz).forEach((b) => {
      const sel = b.dataset.secao === secaoAtual;
      b.classList.toggle('ativo', sel);
      if (sel) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    $('.config-nav-item.ativo', raiz)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    atualizarContadorItens();
    atualizarPrevias();
    if (rolar) {
      const topo = $('.config-layout', raiz).getBoundingClientRect().top + window.scrollY - 76;
      if (window.scrollY > topo) window.scrollTo({ top: Math.max(0, topo) });
    }
  }

  // -------------------------------------------------------------------------
  // Alterações não salvas
  // -------------------------------------------------------------------------
  const secoesAlteradas = () => CHAVES.filter((k) => !igual(estado[k], original[k]));
  const temAlteracoes = () => !ignorarAlteracoes && secoesAlteradas().length > 0;

  function atualizarSujo() {
    const alteradas = secoesAlteradas();
    $$('.config-nav-item', raiz).forEach((b) => b.classList.toggle('alterado', alteradas.includes(b.dataset.secao)));
    barra.classList.toggle('oculto', !alteradas.length);
    if (alteradas.length) {
      const titulos = alteradas.map((k) => SECOES.find((s) => s.id === k).titulo);
      const nomes = titulos.map((t) => `<b>${esc(t)}</b>`);
      const lista =
        nomes.length > 3
          ? `<b>${nomes.length} seções</b>`
          : nomes.length > 1
            ? `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`
            : nomes[0];
      const texto = $('.barra-salvar-texto span', barra);
      texto.innerHTML = `Alterações não salvas em ${lista}`;
      texto.title = titulos.join(', ');
    }
  }

  // -------------------------------------------------------------------------
  // Validação e gravação
  // -------------------------------------------------------------------------
  function validar() {
    const erros = [];
    const e = (secao, caminho, msg) => erros.push({ secao, caminho, msg });
    const inteiro = (v) => v !== '' && v != null && Number.isInteger(Number(v));

    if (!String(estado.empresa.nome || '').trim()) e('empresa', 'empresa.nome', 'Informe o nome da empresa.');
    const cnpj = String(estado.empresa.cnpj || '').replace(/\D/g, '');
    if (cnpj && cnpj.length !== 14) e('empresa', 'empresa.cnpj', 'O CNPJ deve ter 14 dígitos.');
    if (estado.empresa.email && !EMAIL_OK.test(estado.empresa.email.trim()))
      e('empresa', 'empresa.email', 'E-mail inválido.');

    const val = estado.orcamento.validadeDias;
    if (!inteiro(val) || val < 1 || val > 365) e('orcamento', 'orcamento.validadeDias', 'Use um número de 1 a 365.');
    const prazo = estado.orcamento.prazoPadraoDias;
    if (!inteiro(prazo) || prazo < 0 || prazo > 365)
      e('orcamento', 'orcamento.prazoPadraoDias', 'Use um número de 0 a 365.');

    if (!listaDeTexto(estado.checklist.itens).length)
      toastPendente = 'O checklist precisa de pelo menos um item.';

    estado.tecnicos.forEach((t, i) => {
      if (!t.nome.trim() && t.documento.trim()) e('tecnicos', `tecnicos.${i}.nome`, 'Informe o nome do técnico.');
    });

    const inicio = estado.numeracao.inicioOS;
    if (!inteiro(inicio) || inicio < 1) e('numeracao', 'numeracao.inicioOS', 'Use um número inteiro a partir de 1.');

    const em = estado.email;
    if (em.host || em.usuario) {
      if (!inteiro(em.porta) || em.porta < 1 || em.porta > 65535) e('email', 'email.porta', 'Porta inválida.');
    }
    if (em.remetenteEmail && !EMAIL_OK.test(em.remetenteEmail.trim()))
      e('email', 'email.remetenteEmail', 'E-mail inválido.');
    if (em.copiaPara) {
      const invalido = em.copiaPara
        .split(/[,;]/)
        .map((x) => x.trim())
        .filter(Boolean)
        .some((x) => !EMAIL_OK.test(x));
      if (invalido) e('email', 'email.copiaPara', 'E-mail inválido. Separe vários com vírgula.');
    }
    return erros;
  }
  let toastPendente = '';

  function limparErro(c) {
    c.classList.remove('erro');
    $('.msg-erro', c)?.remove();
  }

  function marcarErros(erros) {
    $$('.campo.erro', areaSecao).forEach(limparErro);
    let primeiro = null;
    for (const { caminho, msg } of erros) {
      const c = $(`.campo[data-campo="${caminho}"]`, areaSecao);
      if (!c) continue;
      c.classList.add('erro');
      const span = document.createElement('span');
      span.className = 'msg-erro';
      span.textContent = msg;
      const dica = $(':scope > .dica', c);
      if (dica) dica.before(span);
      else c.appendChild(span);
      primeiro ||= c;
    }
    if (primeiro) {
      $('input, textarea', primeiro)?.focus({ preventScroll: true });
      primeiro.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  function preparar(k) {
    const v = clonar(estado[k]);
    const aparar = (o) => {
      for (const c of Object.keys(o)) if (typeof o[c] === 'string') o[c] = o[c].trim();
    };
    if (k === 'empresa' || k === 'whatsapp') aparar(v);
    if (k === 'orcamento') {
      aparar(v);
      v.validadeDias = Number(v.validadeDias);
      v.prazoPadraoDias = Number(v.prazoPadraoDias);
      v.formasPagamento = listaDeTexto(v.formasPagamento);
    }
    if (k === 'checklist') {
      for (const c of ['itens', 'acessorios', 'tensoesEntrada', 'tensoesSaida']) v[c] = listaDeTexto(v[c]);
      v.rodape = String(v.rodape || '').trim();
    }
    if (k === 'tecnicos') {
      return v
        .map((t) => ({ nome: t.nome.trim(), documento: t.documento.trim() }))
        .filter((t) => t.nome || t.documento);
    }
    if (k === 'numeracao') v.inicioOS = Number(v.inicioOS);
    if (k === 'email') {
      const senha = v.senha;
      aparar(v);
      v.senha = senha; // senha não é aparada
      v.porta = Number(v.porta) || 587;
      v.seguro = Boolean(v.seguro);
      delete v.senhaDefinida;
      if (!v.senha) delete v.senha;
    }
    return v;
  }

  async function salvar() {
    if (salvando) return;
    const alteradas = secoesAlteradas();
    if (!alteradas.length) return;
    toastPendente = '';
    const erros = validar().filter((x) => alteradas.includes(x.secao));
    if (toastPendente && alteradas.includes('checklist')) {
      if (secaoAtual !== 'checklist') {
        secaoAtual = 'checklist';
        desenharSecao({ rolar: true });
      }
      toast(toastPendente, 'erro');
      return;
    }
    if (erros.length) {
      const alvo = erros.find((x) => x.secao === secaoAtual)?.secao || erros[0].secao;
      if (alvo !== secaoAtual) {
        secaoAtual = alvo;
        desenharSecao({ rolar: true });
      }
      marcarErros(erros.filter((x) => x.secao === alvo));
      toast('Corrija os campos destacados antes de salvar.', 'erro');
      return;
    }

    const corpo = {};
    for (const k of alteradas) corpo[k] = preparar(k);
    salvando = true;
    const botao = $('[data-salvar]', barra);
    botao.disabled = true;
    $('span', botao).textContent = 'Salvando…';
    try {
      const r = await api.put('/config', corpo);
      if (!ativo) return;
      cfg = r;
      definirConfig(r);
      original = extrair(r);
      estado = clonar(original);
      desenharSecao();
      atualizarSujo();
      toast('Configurações salvas');
    } catch (e) {
      erro(e);
    } finally {
      salvando = false;
      botao.disabled = false;
      $('span', botao).textContent = 'Salvar alterações';
    }
  }

  async function descartar() {
    const ok = await confirmar({
      titulo: 'Descartar alterações',
      mensagem: 'As alterações feitas desde o último salvamento serão perdidas.',
      confirmar: 'Descartar',
      perigo: true,
    });
    if (!ok) return;
    estado = clonar(original);
    desenharSecao();
    atualizarSujo();
  }

  // -------------------------------------------------------------------------
  // Ações imediatas: imagens, e-mail de teste, backup
  // -------------------------------------------------------------------------
  async function trocarImagem(nome, arquivo) {
    if (!arquivo) return;
    const info = IMAGENS[nome];
    if (!/png$/i.test(arquivo.type) && !/\.png$/i.test(arquivo.name)) {
      toast('Escolha uma imagem no formato PNG.', 'erro');
      return;
    }
    if (arquivo.size > 15 * 1024 * 1024) {
      toast('Imagem muito grande. O limite é 15 MB.', 'erro');
      return;
    }
    try {
      let dataUrl = await lerArquivo(arquivo);
      const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
      if (!base64.startsWith('iVBORw0KGgo')) {
        toast('O arquivo escolhido não é um PNG válido.', 'erro');
        return;
      }
      dataUrl = `data:image/png;base64,${base64}`;
      const { w, h } = await medirImagem(dataUrl);
      const [ew, eh] = info.px;
      const desvio = Math.abs(w / h - ew / eh) / (ew / eh);
      const avisos = [];
      if (desvio > 0.03) avisos.push(`a proporção é diferente da recomendada (${ew} × ${eh} px), então ela pode ficar esticada no PDF`);
      if (w < ew * 0.6) avisos.push('a resolução é baixa e a impressão pode sair borrada');
      if (avisos.length) {
        const ok = await confirmar({
          titulo: `Usar esta imagem como ${info.titulo.toLowerCase()}?`,
          mensagem: `A imagem tem ${w} × ${h} px: ${avisos.join(' e ')}. Deseja usar mesmo assim?`,
          confirmar: 'Usar mesmo assim',
        });
        if (!ok) return;
      }
      const botao = $(`[data-trocar-imagem="${nome}"]`, areaSecao);
      if (botao) {
        botao.disabled = true;
        botao.innerHTML = `${icone('loader-circle', 'girando')}Enviando…`;
      }
      const r = await api.put(`/config/imagens/${nome}`, { dataUrl });
      cfg.imagens = r.imagens;
      definirConfig(r);
      versaoImagens = Date.now();
      redesenharBloco('timbrado');
      toast(`${info.titulo} do papel timbrado atualizado.`);
    } catch (e) {
      erro(e);
      redesenharBloco('timbrado');
    }
  }

  async function restaurarImagem(nome) {
    const info = IMAGENS[nome];
    const ok = await confirmar({
      titulo: `Restaurar ${info.titulo.toLowerCase()} padrão`,
      mensagem: `A imagem personalizada do ${info.titulo.toLowerCase()} será apagada e o sistema volta a usar a imagem original.`,
      confirmar: 'Restaurar padrão',
    });
    if (!ok) return;
    try {
      const r = await api.del(`/config/imagens/${nome}`);
      cfg.imagens = r.imagens;
      definirConfig(r);
      versaoImagens = Date.now();
      redesenharBloco('timbrado');
      toast(`${info.titulo} padrão restaurado.`);
    } catch (e) {
      erro(e);
    }
  }

  async function testarEmail(botao) {
    const resultado = $('[data-resultado-teste]', areaSecao);
    const em = preparar('email');
    if (!em.host || !em.usuario) {
      const erros = [];
      if (!em.host) erros.push({ caminho: 'email.host', msg: 'Informe o servidor SMTP.' });
      if (!em.usuario) erros.push({ caminho: 'email.usuario', msg: 'Informe o usuário.' });
      marcarErros(erros);
      return;
    }
    if (!em.senha && !original.email.senhaDefinida) {
      marcarErros([{ caminho: 'email.senha', msg: 'Informe a senha.' }]);
      return;
    }
    const corpo = {
      host: em.host,
      porta: em.porta,
      seguro: em.seguro,
      usuario: em.usuario,
      remetenteNome: em.remetenteNome,
      remetenteEmail: em.remetenteEmail,
    };
    if (em.senha) corpo.senha = em.senha;
    botao.disabled = true;
    const htmlOriginal = botao.innerHTML;
    botao.innerHTML = `${icone('loader-circle', 'girando')}<span>Testando…</span>`;
    resultado.innerHTML = '';
    try {
      await api.post('/config/email/testar', corpo);
      if (!ativo) return;
      resultado.innerHTML = `<span class="verde">${icone('circle-check', 'i-s')}Conexão funcionando${
        temAlteracoes() ? ' — lembre-se de salvar' : ''
      }</span>`;
      toast('Conexão com o servidor de e-mail funcionando.');
    } catch (e) {
      if (!ativo) return;
      const msg = String(e.message || '');
      let explicacao = msg;
      if (/ENOTFOUND|EDNS|getaddrinfo/i.test(msg)) {
        explicacao = 'Servidor SMTP não encontrado. Confira o endereço do servidor e a conexão com a internet.';
      } else if (/ETIMEDOUT|timeout|ECONNREFUSED/i.test(msg)) {
        explicacao = 'O servidor não respondeu. Confira a porta e a opção de conexão segura (465 com SSL ligado, 587 desligado).';
      } else if (/wrong version number|ssl3_get_record|tls/i.test(msg)) {
        explicacao = 'Conexão segura incompatível com a porta. Use 465 com SSL/TLS ligado ou 587 com SSL/TLS desligado.';
      }
      resultado.innerHTML = `<span class="vermelho" title="${esc(msg)}">${icone('circle-alert', 'i-s')}Falhou</span>`;
      toast(explicacao, 'erro');
    } finally {
      botao.disabled = false;
      botao.innerHTML = htmlOriginal;
    }
  }

  async function restaurarBackup(arquivo) {
    if (!arquivo) return;
    let dados;
    try {
      dados = JSON.parse(await lerTexto(arquivo));
    } catch {
      toast('Arquivo inválido: escolha um backup .json gerado pelo sistema.', 'erro');
      return;
    }
    if (dados?.sistema !== 'balancas-orcamentos') {
      toast('Este arquivo não é um backup do sistema BALANÇAS.COM.', 'erro');
      return;
    }
    const n = (k) => (Array.isArray(dados[k]) ? dados[k].length : 0);
    const ok = await confirmar({
      titulo: 'Restaurar backup?',
      mensagem: `Backup de ${dados.gerado_em ? dataHoraBR(dados.gerado_em) : 'data desconhecida'} com ${n('ordens')} ordens de serviço, ${n(
        'clientes'
      )} clientes, ${n('servicos')} serviços e ${n('pecas')} peças. TODOS os dados atuais serão substituídos e isso não pode ser desfeito. Se tiver dúvida, baixe antes um backup dos dados atuais.`,
      confirmar: 'Substituir todos os dados',
      perigo: true,
    });
    if (!ok) return;
    try {
      await api.post('/backup/restaurar', dados);
      ignorarAlteracoes = true;
      toast('Backup restaurado. Recarregando o sistema…');
      setTimeout(() => location.reload(), 1200);
    } catch (e) {
      erro(e);
    }
  }

  // -------------------------------------------------------------------------
  // Listas editáveis
  // -------------------------------------------------------------------------
  function adicionarChip(editor) {
    const input = $('[data-novo-chip]', editor);
    const texto = input.value.trim().replace(/\s+/g, ' ');
    if (!texto) {
      input.focus();
      return;
    }
    const caminho = editor.dataset.lista;
    const lista = obterCaminho(estado, caminho);
    if (lista.some((x) => normalizar(x) === normalizar(texto))) {
      toast(`“${texto}” já está na lista.`, 'info');
      input.select();
      return;
    }
    lista.push(texto);
    redesenharEditor(caminho);
  }

  function redesenharEditor(caminho, foco = true) {
    const editor = $(`.editor-chips[data-lista="${caminho}"]`, areaSecao);
    const rotulo = editor.getAttribute('aria-label');
    const placeholder = $('[data-novo-chip]', editor).placeholder;
    editor.outerHTML = editorChips(caminho, { placeholder, rotulo });
    if (foco) $(`.editor-chips[data-lista="${caminho}"] [data-novo-chip]`, areaSecao)?.focus();
    atualizarSujo();
  }

  function adicionarItem(texto) {
    const t = String(texto || '').trim().replace(/\s+/g, ' ');
    if (!t) return false;
    if (estado.checklist.itens.some((x) => normalizar(x) === normalizar(t))) {
      toast('Este item já está no checklist.', 'info');
      return false;
    }
    estado.checklist.itens.push(t);
    return true;
  }

  // -------------------------------------------------------------------------
  // Eventos
  // -------------------------------------------------------------------------
  const redesenharSugestoes = debounce(() => redesenharBloco('sugestoes'), 300);

  raiz.addEventListener('input', (e) => {
    const t = e.target;
    if (t.matches('[data-caminho]')) {
      let v;
      if (t.type === 'checkbox') v = t.checked;
      else {
        if (t.dataset.mascara === 'telefone') t.value = mascaraTelefone(t.value);
        else if (t.dataset.mascara === 'documento') t.value = mascaraDocumento(t.value);
        v = t.value;
        if (t.dataset.tipo === 'int') v = t.value === '' ? '' : Number(t.value);
      }
      definirCaminho(estado, t.dataset.caminho, v);
      if (t.tagName === 'TEXTAREA') ajustarAltura(t);
    } else if (t.matches('[data-item-checklist]')) {
      estado.checklist.itens[Number(t.dataset.itemChecklist)] = t.value;
      redesenharSugestoes();
    } else if (t.matches('[data-tecnico]')) {
      estado.tecnicos[Number(t.dataset.i)][t.dataset.tecnico] = t.value;
    } else {
      return;
    }
    const c = t.closest('.campo.erro');
    if (c) limparErro(c);
    atualizarSujo();
    atualizarPrevias();
  });

  raiz.addEventListener('focusin', (e) => {
    const g = e.target.dataset?.grupoVariaveis;
    if (g) ultimoCampoVariaveis[g] = e.target;
  });

  // Variáveis: mousedown para não tirar o foco do campo de texto.
  raiz.addEventListener('mousedown', (e) => {
    if (e.target.closest('[data-variavel]')) e.preventDefault();
  });

  raiz.addEventListener('keydown', (e) => {
    const t = e.target;
    if (e.key === 'Enter' && t.matches('[data-novo-chip]')) {
      e.preventDefault();
      adicionarChip(t.closest('.editor-chips'));
    } else if (e.key === 'Enter' && t.matches('[data-novo-item]')) {
      e.preventDefault();
      if (adicionarItem(t.value)) {
        redesenharBloco('itens');
        redesenharBloco('sugestoes');
        atualizarSujo();
        $('[data-novo-item]', areaSecao)?.focus();
      }
    } else if (e.key === 'Enter' && t.matches('[data-item-checklist], [data-tecnico]')) {
      e.preventDefault();
    }
  });

  raiz.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('[data-arquivo-imagem]')) {
      trocarImagem(t.dataset.arquivoImagem, t.files[0]);
      t.value = '';
    } else if (t.matches('[data-arquivo-backup]')) {
      restaurarBackup(t.files[0]);
      t.value = '';
    }
  });

  raiz.addEventListener('click', (e) => {
    const alvo = (sel) => e.target.closest(sel);
    let b;

    if ((b = alvo('.config-nav-item'))) {
      if (b.dataset.secao !== secaoAtual) {
        secaoAtual = b.dataset.secao;
        desenharSecao({ rolar: true });
      }
      return;
    }
    if (alvo('[data-salvar]')) return salvar();
    if (alvo('[data-descartar]')) return descartar();

    // Listas em "chips"
    if ((b = alvo('[data-remover-chip]'))) {
      const editor = b.closest('.editor-chips');
      obterCaminho(estado, editor.dataset.lista).splice(Number(b.dataset.removerChip), 1);
      return redesenharEditor(editor.dataset.lista);
    }
    if ((b = alvo('[data-adicionar-chip]'))) return adicionarChip(b.closest('.editor-chips'));
    if ((b = alvo('.editor-chips')) && !alvo('button, input')) {
      $('[data-novo-chip]', b)?.focus();
      return;
    }

    // Checklist
    if ((b = alvo('[data-mover-item]'))) {
      const i = Number(b.dataset.moverItem);
      const j = i + Number(b.dataset.direcao);
      const itens = estado.checklist.itens;
      if (j < 0 || j >= itens.length) return;
      [itens[i], itens[j]] = [itens[j], itens[i]];
      redesenharBloco('itens');
      atualizarSujo();
      const li = $(`.item-checklist[data-i="${j}"]`, areaSecao);
      li?.classList.add('movido');
      const mesmo = $(`[data-mover-item="${j}"][data-direcao="${b.dataset.direcao}"]`, areaSecao);
      (mesmo && !mesmo.disabled ? mesmo : $(`[data-item-checklist="${j}"]`, areaSecao))?.focus();
      return;
    }
    if ((b = alvo('[data-remover-item]'))) {
      estado.checklist.itens.splice(Number(b.dataset.removerItem), 1);
      redesenharBloco('itens');
      redesenharBloco('sugestoes');
      atualizarSujo();
      return;
    }
    if (alvo('[data-adicionar-item]')) {
      const input = $('[data-novo-item]', areaSecao);
      if (adicionarItem(input.value)) {
        redesenharBloco('itens');
        redesenharBloco('sugestoes');
        atualizarSujo();
      }
      $('[data-novo-item]', areaSecao)?.focus();
      return;
    }
    if ((b = alvo('[data-sugestao]'))) {
      const texto = estado.checklist.itensSugeridos[Number(b.dataset.sugestao)];
      if (adicionarItem(texto)) {
        redesenharBloco('itens');
        redesenharBloco('sugestoes');
        atualizarSujo();
        toast('Item adicionado ao final do checklist.', 'info', 2200);
      }
      return;
    }
    if (alvo('[data-adicionar-todas]')) {
      const faltam = sugestoesFaltando();
      faltam.forEach((s) => adicionarItem(s.texto));
      redesenharBloco('itens');
      redesenharBloco('sugestoes');
      atualizarSujo();
      toast(`${faltam.length} itens adicionados ao checklist.`, 'info', 2200);
      return;
    }

    // Técnicos
    if (alvo('[data-adicionar-tecnico]')) {
      estado.tecnicos.push({ nome: '', documento: '' });
      redesenharBloco('tecnicos');
      atualizarSujo();
      $(`[data-tecnico="nome"][data-i="${estado.tecnicos.length - 1}"]`, areaSecao)?.focus();
      return;
    }
    if ((b = alvo('[data-remover-tecnico]'))) {
      estado.tecnicos.splice(Number(b.dataset.removerTecnico), 1);
      redesenharBloco('tecnicos');
      atualizarSujo();
      atualizarPrevias();
      return;
    }

    // Variáveis das mensagens
    if ((b = alvo('[data-variavel]'))) {
      const grupo = b.closest('[data-variaveis]').dataset.variaveis;
      let campoAlvo = ultimoCampoVariaveis[grupo];
      if (!campoAlvo || !areaSecao.contains(campoAlvo)) {
        campoAlvo = $(`textarea[data-grupo-variaveis="${grupo}"]`, areaSecao);
      }
      if (!campoAlvo) return;
      const texto = `{${b.dataset.variavel}}`;
      const ini = campoAlvo.selectionStart ?? campoAlvo.value.length;
      const fim = campoAlvo.selectionEnd ?? ini;
      campoAlvo.focus();
      campoAlvo.setRangeText(texto, ini, fim, 'end');
      campoAlvo.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }

    // E-mail
    if ((b = alvo('[data-ver-senha]'))) {
      const input = $('#cfg-email-senha', areaSecao);
      const mostrar = input.type === 'password';
      input.type = mostrar ? 'text' : 'password';
      b.innerHTML = icone(mostrar ? 'eye-off' : 'eye');
      b.setAttribute('aria-label', mostrar ? 'Ocultar senha' : 'Mostrar senha');
      b.title = b.getAttribute('aria-label');
      return;
    }
    if ((b = alvo('[data-predefinicao]'))) {
      const p =
        b.dataset.predefinicao === 'gmail'
          ? { host: 'smtp.gmail.com', porta: 465, seguro: true }
          : { host: 'smtp-mail.outlook.com', porta: 587, seguro: false };
      Object.assign(estado.email, p);
      if (!estado.email.remetenteEmail && estado.email.usuario) estado.email.remetenteEmail = estado.email.usuario;
      desenharSecao();
      atualizarSujo();
      toast('Servidor, porta e conexão preenchidos. Agora informe usuário e senha.', 'info');
      $('#cfg-email-usuario', areaSecao)?.focus();
      return;
    }
    if ((b = alvo('[data-testar-email]'))) return testarEmail(b);

    // Imagens e backup
    if ((b = alvo('[data-trocar-imagem]'))) {
      $(`[data-arquivo-imagem="${b.dataset.trocarImagem}"]`, areaSecao)?.click();
      return;
    }
    if ((b = alvo('[data-restaurar-imagem]'))) return restaurarImagem(b.dataset.restaurarImagem);
    if (alvo('[data-restaurar-backup]')) {
      $('[data-arquivo-backup]', areaSecao)?.click();
      return;
    }
  });

  // Ctrl+S / Cmd+S salva.
  const atalhos = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      if (!document.querySelector('.modal-fundo')) salvar();
    }
  };
  document.addEventListener('keydown', atalhos);

  desenharSecao();
  atualizarSujo();

  return {
    temAlteracoes,
    async sair() {
      if (!temAlteracoes()) return true;
      const t = secoesAlteradas().map((k) => SECOES.find((s) => s.id === k).titulo);
      const lista = t.length > 1 ? `${t.slice(0, -1).join(', ')} e ${t[t.length - 1]}` : t[0];
      return confirmar({
        titulo: 'Sair sem salvar?',
        mensagem: `Há alterações não salvas em ${lista}. Se sair agora, elas serão perdidas.`,
        confirmar: 'Sair sem salvar',
        cancelar: 'Continuar editando',
        perigo: true,
      });
    },
    desmontar() {
      ativo = false;
      document.removeEventListener('keydown', atalhos);
      redesenharSugestoes.cancelar();
    },
  };
}
