// Gera o PDF do orçamento (A4) a partir de uma ordem de serviço, usando o
// papel timbrado da empresa (cabeçalho e rodapé da planilha original) ou,
// se desativado nas Configurações, um cabeçalho simples em texto.

const fs = require('fs');
const path = require('path');
const pdfmake = require('pdfmake');
const fontesRoboto = require('pdfmake/fonts/Roboto');

const PASTA_FONTES = path.resolve(path.dirname(fontesRoboto.Roboto.normal));

// ---------------------------------------------------------------------------
// Medidas (em pontos: 1 cm = 28,35 pt) e cores da marca
// ---------------------------------------------------------------------------

const CM = 72 / 2.54;
const PAGINA = { largura: 595.28, altura: 841.89 }; // A4
const MARGEM_LATERAL = 1.5 * CM;
const LARGURA_UTIL = PAGINA.largura - 2 * MARGEM_LATERAL;

// Mesmas margens da macro do Excel: o conteúdo começa logo abaixo do logotipo
// e termina acima da faixa do rodapé.
const MARGENS_TIMBRADO = [MARGEM_LATERAL, 4 * CM, MARGEM_LATERAL, 3.4 * CM];
const MARGENS_SIMPLES = [MARGEM_LATERAL, 3.3 * CM, MARGEM_LATERAL, 2.2 * CM];

const COR = {
  grafite: '#5A5B5D',
  verde: '#08A951',
  verdeEscuro: '#067A3B',
  cinzaClaro: '#EFF1F0',
  verdeClaro: '#F2F8F4',
  texto: '#454648',
  rotulo: '#7B7D80',
  suave: '#9A9C9F',
  borda: '#D9DDDA',
  linha: '#E7E9E8',
  branco: '#FFFFFF',
};

// ---------------------------------------------------------------------------
// Formatação (pt-BR)
// ---------------------------------------------------------------------------

const FMT_MOEDA = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const FMT_QTD = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const centavos = (v) => Math.round(num(v) * 100) / 100;
const moeda = (v) => FMT_MOEDA.format(centavos(v)).replace(/[\u00A0\u202F]/g, ' ');
const quantidade = (v) => FMT_QTD.format(num(v)).replace(/[\u00A0\u202F]/g, ' ');
const texto = (v) => (v === null || v === undefined ? '' : String(v).trim());
const doisDigitos = (n) => String(n).padStart(2, '0');

function lerData(valor) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto(valor));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

const dataBR = (d) => (d ? `${doisDigitos(d.getDate())}/${doisDigitos(d.getMonth() + 1)}/${d.getFullYear()}` : '');

function hoje() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function somarDias(data, dias) {
  const d = new Date(data.getTime());
  d.setDate(d.getDate() + dias);
  return d;
}

// Texto de célula. Palavras muito compridas (e-mails, códigos, links) não
// cabem na coluna e alargariam a tabela; nesses casos a quebra pode ocorrer
// em qualquer letra.
function celula(valor, extra = {}) {
  const t = texto(valor);
  const longa = t.split(/\s+/).some((palavra) => palavra.length > 28);
  return { text: t, ...(longa ? { wordBreak: 'break-all' } : {}), ...extra };
}

const plural = (n, um, varios) => `${quantidade(n)} ${num(n) === 1 ? um : varios}`;

// Junta valores não vazios, sem repetir.
function juntar(valores, separador, maximo = Infinity) {
  const vistos = new Set();
  const lista = [];
  for (const v of valores) {
    if (lista.length >= maximo) break;
    const t = texto(v);
    if (t && !vistos.has(t.toLowerCase())) {
      vistos.add(t.toLowerCase());
      lista.push(t);
    }
  }
  return lista.join(separador);
}

// ---------------------------------------------------------------------------
// Papel timbrado
// ---------------------------------------------------------------------------

// Lê o PNG como data URL (evita acesso a arquivos pelo pdfmake) e calcula a
// altura que ele ocupa quando esticado na largura total da página.
function carregarImagem(caminho) {
  if (!caminho) return null;
  try {
    const buf = fs.readFileSync(caminho);
    const ehPng = buf.length > 24 && buf.toString('ascii', 1, 4) === 'PNG';
    if (!ehPng) return null;
    const largura = buf.readUInt32BE(16);
    const altura = buf.readUInt32BE(20);
    if (!largura || !altura) return null;
    return {
      dataUrl: `data:image/png;base64,${buf.toString('base64')}`,
      altura: (PAGINA.largura * altura) / largura,
    };
  } catch {
    return null;
  }
}

function carregarTimbrado(imagens) {
  const cabecalho = carregarImagem(imagens && imagens.cabecalho);
  const rodape = carregarImagem(imagens && imagens.rodape);
  return cabecalho && rodape ? { cabecalho, rodape } : null;
}

// ---------------------------------------------------------------------------
// Blocos reutilizáveis
// ---------------------------------------------------------------------------

const rotulo = (t, extra = {}) => ({ text: texto(t).toUpperCase(), style: 'rotulo', ...extra });

// Título de seção: texto verde em caixa alta com um fio fino abaixo.
function tituloSecao(t) {
  return {
    stack: [
      { text: t.toUpperCase(), style: 'tituloSecao' },
      {
        canvas: [{ type: 'line', x1: 0, y1: 0, x2: LARGURA_UTIL, y2: 0, lineWidth: 0.6, lineColor: COR.borda }],
        margin: [0, 3, 0, 0],
      },
    ],
    margin: [0, 0, 0, 7],
  };
}

// Pares rótulo/valor alinhados em duas colunas; linhas vazias são omitidas.
function listaInfo(pares, larguraRotulo = 60) {
  const linhas = pares
    .filter(([, valor]) => texto(valor))
    .map(([r, valor, estilo]) => [
      rotulo(r, { margin: [0, 2.3, 0, 0] }),
      celula(valor, estilo),
    ]);
  if (!linhas.length) return { text: '—', color: COR.suave };
  return {
    table: { widths: [larguraRotulo, '*'], body: linhas },
    layout: {
      defaultBorder: false,
      paddingLeft: () => 0,
      paddingRight: (i) => (i === 0 ? 6 : 0),
      paddingTop: (i) => (i === 0 ? 0 : 1.6),
      paddingBottom: (i, node) => (i === node.table.body.length - 1 ? 0 : 1.6),
    },
  };
}

// Uma ou duas caixas lado a lado, com a mesma altura (tabela com coluna de
// respiro). Caixas com textos longos podem continuar na página seguinte,
// repetindo o título.
function caixas(lista, { quebravel = false } = {}) {
  const itens = lista.filter(Boolean);
  if (!itens.length) return null;
  const SEM_BORDA = [false, false, false, false];
  const respiro = () => ({ text: '', border: SEM_BORDA });
  const cab = (c) => ({ text: c.titulo.toUpperCase(), style: 'tituloCaixa', fillColor: COR.cinzaClaro, border: [true, true, true, false] });
  const corpo = (c) => ({ stack: [c.conteudo], border: [true, false, true, true] });
  const dupla = itens.length === 2;
  const linhaCab = dupla ? [cab(itens[0]), respiro(), cab(itens[1])] : [cab(itens[0])];
  const linhaCorpo = dupla ? [corpo(itens[0]), respiro(), corpo(itens[1])] : [corpo(itens[0])];
  return {
    table: {
      widths: dupla ? ['*', 10, '*'] : ['*'],
      body: [linhaCab, linhaCorpo],
      ...(quebravel ? { headerRows: 1 } : { dontBreakRows: true }),
    },
    unbreakable: !quebravel,
    layout: {
      hLineWidth: () => 0.6,
      vLineWidth: () => 0.6,
      hLineColor: () => COR.borda,
      vLineColor: () => COR.borda,
      paddingLeft: (i) => (dupla && i === 1 ? 0 : 9),
      paddingRight: (i) => (dupla && i === 1 ? 0 : 9),
      paddingTop: (i) => (i === 0 ? 4.5 : 6),
      paddingBottom: (i) => (i === 0 ? 3.5 : 7),
    },
  };
}

// Faixa de informações (rótulo em cima, valor embaixo) com fundo suave.
function faixaInfo(celulas, fundo) {
  const validas = celulas.filter((c) => texto(c.valor));
  if (!validas.length) return null;
  const larguras = validas.map((c, i) => (i === validas.length - 1 ? '*' : c.largura || '*'));
  return {
    table: {
      widths: larguras,
      body: [
        validas.map((c) => ({
          stack: [rotulo(c.rotulo), celula(c.valor, { margin: [0, 2, 0, 0], ...(c.estilo || {}) })],
        })),
      ],
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: (i, node) => (i === 0 || i === node.table.widths.length ? 0 : 1.5),
      vLineColor: () => COR.branco,
      fillColor: () => fundo,
      paddingLeft: () => 9,
      paddingRight: () => 9,
      paddingTop: () => 5.5,
      paddingBottom: () => 6.5,
    },
  };
}

// Tabela de serviços ou de peças, com título, cabeçalho repetido e subtotal.
function tabelaItens(titulo, itens, rotuloSubtotal, subtotal) {
  if (!itens.length) return null;
  const SEM_BORDA = [false, false, false, false];
  const cab = (t, alinhamento) => ({ text: t.toUpperCase(), style: 'cabecalhoTabela', alignment: alinhamento });
  const body = [
    [
      {
        text: [
          { text: titulo.toUpperCase() },
          { text: `   ${plural(itens.length, 'item', 'itens')}`, style: 'complementoSecao' },
        ],
        style: 'tituloSecao',
        colSpan: 4,
        border: SEM_BORDA,
        margin: [-6, 0, 0, 0],
      },
      {},
      {},
      {},
    ],
    [cab('Descrição', 'left'), cab('Qtd', 'right'), cab('Valor unit.', 'right'), cab('Total', 'right')],
  ];
  for (const it of itens) {
    const total = centavos(num(it.valor_unitario) * num(it.quantidade));
    body.push([
      celula(texto(it.descricao) || '—'),
      { text: quantidade(it.quantidade), alignment: 'right' },
      { text: moeda(it.valor_unitario), alignment: 'right', noWrap: true },
      { text: moeda(total), alignment: 'right', noWrap: true, color: COR.grafite, bold: true },
    ]);
  }
  body.push([
    { text: rotuloSubtotal, colSpan: 3, alignment: 'right', style: 'rotuloSubtotal' },
    {},
    {},
    { text: moeda(subtotal), alignment: 'right', noWrap: true, bold: true, color: COR.verdeEscuro },
  ]);
  const ultima = body.length - 1;
  return {
    table: {
      headerRows: 2,
      keepWithHeaderRows: 1,
      dontBreakRows: true,
      widths: ['*', 34, 72, 78],
      body,
    },
    layout: {
      hLineWidth: (i) => (i <= 2 ? 0 : 0.6),
      vLineWidth: () => 0,
      hLineColor: (i) => (i === ultima ? COR.borda : COR.linha),
      fillColor: (linha) => {
        if (linha === 1) return COR.grafite;
        if (linha === ultima) return COR.verdeClaro;
        return null;
      },
      paddingLeft: (i) => (i === 0 ? 8 : 4),
      paddingRight: (i) => (i === 3 ? 8 : 4),
      paddingTop: (i) => (i === 0 ? 0 : i === 1 ? 4.5 : 4.4),
      paddingBottom: (i) => (i === 0 ? 5 : i === 1 ? 4 : 4.4),
    },
    margin: [0, 0, 0, 10],
  };
}

function caixaTotais(totais, temServicos, temPecas) {
  const linhas = [];
  const linha = (r, valor, extra = {}) => [
    { text: r, style: 'rotuloTotais' },
    { text: valor, alignment: 'right', noWrap: true, ...extra },
  ];
  const mostrarServicos = temServicos || totais.servicos > 0;
  const mostrarPecas = temPecas || totais.pecas > 0;
  // Com uma só categoria e sem desconto, o detalhamento repetiria o total.
  const detalhar = totais.desconto > 0 || (mostrarServicos && mostrarPecas);
  if (detalhar && mostrarServicos) linhas.push(linha('Serviços', moeda(totais.servicos)));
  if (detalhar && mostrarPecas) linhas.push(linha('Peças', moeda(totais.pecas)));
  if (totais.desconto > 0) linhas.push(linha('Desconto', `- ${moeda(totais.desconto)}`, { color: COR.verdeEscuro }));
  linhas.push([
    { text: 'TOTAL', style: 'rotuloTotal', id: ID_TOTAIS },
    { text: moeda(totais.total), alignment: 'right', noWrap: true, style: 'valorTotal' },
  ]);
  const ultima = linhas.length - 1;
  return {
    columns: [
      { width: '*', text: '' },
      {
        width: 218,
        table: { widths: ['*', 'auto'], body: linhas },
        layout: {
          hLineWidth: (i) => (i > 0 && i < ultima ? 0.6 : 0),
          vLineWidth: () => 0,
          hLineColor: () => COR.linha,
          fillColor: (i) => (i === ultima ? COR.verde : null),
          paddingLeft: () => 10,
          paddingRight: () => 10,
          paddingTop: (i) => (i === ultima ? 6.5 : 3.6),
          paddingBottom: (i) => (i === ultima ? 6.5 : 3.6),
        },
      },
    ],
    unbreakable: true,
    margin: [0, 0, 0, 16],
  };
}

// Bloco de texto com rótulo (defeito, garantia, condições...).
function blocoTexto(titulo, conteudo, estilo) {
  const t = texto(conteudo);
  if (!t) return null;
  return {
    stack: [rotulo(titulo, { margin: [0, 0, 0, 2.5] }), celula(t, { style: estilo || 'paragrafo' })],
    unbreakable: t.length < 1200,
    margin: [0, 0, 0, 9],
  };
}

function blocoAceite(cfg) {
  const SEM_BORDA = [false, false, false, false];
  const LINHA = [false, false, false, true];
  const contato = juntar([cfg.empresa.whatsapp, cfg.empresa.telefone], ' / ');
  const assinatura = {
    table: {
      widths: ['*', 14, 92, 14, '*'],
      body: [
        [
          { text: ' ', border: LINHA, margin: [0, 22, 0, 0] },
          { text: '', border: SEM_BORDA },
          { text: '/            /', border: LINHA, alignment: 'center', color: COR.suave, margin: [0, 22, 0, 0] },
          { text: '', border: SEM_BORDA },
          { text: ' ', border: LINHA, margin: [0, 22, 0, 0] },
        ],
        [
          rotulo('Nome / Documento', { border: SEM_BORDA }),
          { text: '', border: SEM_BORDA },
          rotulo('Data', { border: SEM_BORDA, alignment: 'center' }),
          { text: '', border: SEM_BORDA },
          rotulo('Assinatura', { border: SEM_BORDA }),
        ],
      ],
    },
    layout: {
      hLineWidth: () => 0.7,
      vLineWidth: () => 0,
      hLineColor: () => COR.grafite,
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: (i) => (i === 1 ? 4 : 0),
      paddingBottom: () => 1,
    },
  };
  const conteudo = [
    { text: 'De acordo com o orçamento acima:', bold: true, color: COR.grafite },
    assinatura,
  ];
  if (contato || cfg.empresa.email) {
    const canais = [
      contato ? `pelo WhatsApp/telefone ${contato}` : '',
      cfg.empresa.email ? `pelo e-mail ${cfg.empresa.email}` : '',
    ].filter(Boolean);
    conteudo.push({
      text: `Se preferir, aprove ${canais.join(' ou ')}, informando o nº deste orçamento.`,
      style: 'notaPequena',
      margin: [0, 10, 0, 0],
    });
  }
  return {
    stack: [
      tituloSecao('Aprovação do orçamento'),
      {
        table: { widths: ['*'], body: [[{ stack: conteudo }]] },
        layout: {
          hLineWidth: () => 0.6,
          vLineWidth: () => 0.6,
          hLineColor: () => COR.borda,
          vLineColor: () => COR.borda,
          paddingLeft: () => 12,
          paddingRight: () => 12,
          paddingTop: () => 10,
          paddingBottom: () => 11,
        },
      },
    ],
    unbreakable: true,
    margin: [0, 6, 0, 0],
  };
}

// ---------------------------------------------------------------------------
// Cabeçalho e rodapé
// ---------------------------------------------------------------------------

function fundoTimbrado(timbrado) {
  return (pagina, tamanho) => [
    { image: 'cabecalho', width: tamanho.width, absolutePosition: { x: 0, y: 0 } },
    {
      image: 'rodape',
      width: tamanho.width,
      absolutePosition: { x: 0, y: tamanho.height - timbrado.rodape.altura },
    },
  ];
}

function rodapeTimbrado(ordem, timbrado) {
  return (pagina, total, tamanho) => {
    if (total < 2) return null;
    // A área do rodapé começa na margem inferior; o texto fica na parte clara
    // da imagem, logo acima da faixa escura (que começa a ~36% da altura dela).
    const inicioArea = tamanho.height - MARGENS_TIMBRADO[3];
    const topoImagem = tamanho.height - timbrado.rodape.altura;
    const y = Math.max(0, topoImagem + timbrado.rodape.altura * 0.16 - inicioArea);
    return {
      text: `Orçamento nº ${texto(ordem.numero)}   •   Página ${pagina} de ${total}`,
      style: 'paginacao',
      margin: [MARGEM_LATERAL, y, MARGEM_LATERAL, 0],
    };
  };
}

function cabecalhoSimples(cfg) {
  const e = cfg.empresa || {};
  const contatos = [
    juntar([e.razaoSocial && e.razaoSocial !== e.nome ? e.razaoSocial : '', e.cnpj ? `CNPJ ${e.cnpj}` : ''], '  •  '),
    juntar([e.endereco, e.cidade], ' — '),
    juntar([e.telefone ? `Tel. ${e.telefone}` : '', e.whatsapp && e.whatsapp !== e.telefone ? `WhatsApp ${e.whatsapp}` : '']
      .concat([e.email, e.site]), '  •  '),
    texto(e.permissionaria),
  ].filter(Boolean);
  return () => ({
    stack: [
      {
        columns: [
          {
            width: '*',
            stack: [
              { text: texto(e.nome) || 'Orçamento', fontSize: 17, bold: true, color: COR.grafite, characterSpacing: 0.3 },
              e.subtitulo ? { text: texto(e.subtitulo), fontSize: 8.5, color: COR.verdeEscuro, margin: [0, 1, 0, 0] } : '',
            ],
          },
          {
            width: 'auto',
            stack: contatos.map((c) => ({ text: c, alignment: 'right', fontSize: 7.8, color: COR.texto, lineHeight: 1.25 })),
          },
        ],
        columnGap: 16,
      },
      {
        canvas: [{ type: 'line', x1: 0, y1: 0, x2: LARGURA_UTIL, y2: 0, lineWidth: 0.8, lineColor: COR.grafite }],
        margin: [0, 10, 0, 0],
      },
    ],
    margin: [MARGEM_LATERAL, 1.1 * CM, MARGEM_LATERAL, 0],
  });
}

function rodapeSimples(ordem, cfg) {
  const e = cfg.empresa || {};
  const linha = juntar([e.nome, e.cnpj ? `CNPJ ${e.cnpj}` : '', juntar([e.endereco, e.cidade], ', '), e.site], '  •  ');
  return (pagina, total) => ({
    stack: [
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: LARGURA_UTIL, y2: 0, lineWidth: 0.6, lineColor: COR.borda }] },
      {
        columns: [
          { width: '*', text: linha, style: 'paginacao' },
          total > 1
            ? { width: 'auto', text: `Orçamento nº ${texto(ordem.numero)}   •   Página ${pagina} de ${total}`, style: 'paginacao' }
            : { width: 'auto', text: '' },
        ],
        columnGap: 12,
        margin: [0, 6, 0, 0],
      },
    ],
    margin: [MARGEM_LATERAL, 0.75 * CM, MARGEM_LATERAL, 0],
  });
}

// ---------------------------------------------------------------------------
// Conteúdo
// ---------------------------------------------------------------------------

function calcularTotais(ordem, servicos, pecas) {
  const soma = (lista) => centavos(lista.reduce((s, it) => s + centavos(num(it.valor_unitario) * num(it.quantidade)), 0));
  const t = ordem.totais || {};
  const totalServicos = t.servicos !== undefined ? centavos(t.servicos) : soma(servicos);
  const totalPecas = t.pecas !== undefined ? centavos(t.pecas) : soma(pecas);
  const desconto = centavos(t.desconto !== undefined ? t.desconto : ordem.desconto);
  const total = t.total !== undefined ? centavos(t.total) : centavos(Math.max(0, totalServicos + totalPecas - desconto));
  return { servicos: totalServicos, pecas: totalPecas, desconto, total };
}

function blocoDocumento(ordem, emissao, validade) {
  const dias = num(ordem.validade_dias);
  const textoValidade = validade
    ? `Válido até ${dataBR(validade)} (${plural(dias, 'dia', 'dias')})`
    : '';
  return [
    {
      columns: [
        { width: '*', text: 'ORÇAMENTO', style: 'titulo' },
        {
          width: 'auto',
          text: [{ text: 'Nº ', style: 'numeroPrefixo' }, { text: texto(ordem.numero), style: 'numero' }],
          margin: [0, 3.7, 0, 0],
        },
      ],
      margin: [0, 1, 0, 5],
    },
    {
      canvas: [
        { type: 'rect', x: 0, y: 0, w: LARGURA_UTIL, h: 0.6, color: COR.borda },
        { type: 'rect', x: 0, y: -0.7, w: 56, h: 2, color: COR.verde },
      ],
      margin: [0, 0, 0, 8],
    },
    Object.assign(
      faixaInfo(
        [
          { rotulo: 'Emissão', valor: dataBR(emissao), largura: 84 },
          { rotulo: 'Validade', valor: textoValidade, largura: 172 },
          { rotulo: 'OS nº', valor: texto(ordem.numero), largura: 62 },
          { rotulo: 'Técnico', valor: texto(ordem.tecnico) },
        ],
        COR.cinzaClaro
      ) || { text: '' },
      { margin: [0, 0, 0, 11] }
    ),
  ];
}

function blocoClienteEquipamento(ordem) {
  const c = ordem.cliente || null;
  const cliente = listaInfo([
    ['Nome', ordem.cliente_nome || (c && c.nome), { bold: true, color: COR.grafite }],
    ['CPF/CNPJ', ordem.cliente_documento || (c && c.documento)],
    ['Telefone', juntar([ordem.cliente_telefone, c && c.telefone, c && c.whatsapp], ' / ', 2)],
    ['E-mail', ordem.cliente_email || (c && c.email)],
    ['Endereço', c && c.endereco],
    ['Cidade', c && c.cidade],
  ]);

  const entrada = texto(ordem.tensao_entrada);
  const saida = texto(ordem.tensao_saida);
  let tensao = entrada || saida;
  if (entrada && saida && entrada.toLowerCase() !== saida.toLowerCase()) {
    tensao = `Entrada ${entrada} • Saída ${saida}`;
  }
  const acessorios = juntar([...(Array.isArray(ordem.acessorios) ? ordem.acessorios : []), ordem.acessorios_outros], ', ');
  const equipamento = listaInfo(
    [
      ['Equipamento', ordem.equipamento, { bold: true, color: COR.grafite }],
      ['Nº de série', ordem.numero_serie],
      ['Capacidade', ordem.capacidade],
      ['Tensão', tensao],
      ['PAM', ordem.pam],
      ['Acessórios', acessorios],
    ],
    64
  );

  const temEquipamento = [ordem.equipamento, ordem.numero_serie, ordem.capacidade, tensao, ordem.pam, acessorios].some((v) => texto(v));
  const bloco = caixas([
    { titulo: 'Cliente', conteudo: cliente },
    temEquipamento ? { titulo: 'Equipamento', conteudo: equipamento } : null,
  ]);
  return bloco ? Object.assign(bloco, { margin: [0, 0, 0, 10] }) : null;
}

// Defeito e serviço executado: lado a lado quando curtos; empilhados (em
// largura total, podendo continuar na página seguinte) quando longos.
function blocoDiagnostico(ordem) {
  const defeito = texto(ordem.defeito_relatado);
  const servico = texto(ordem.servico_executado);
  const lista = [
    defeito ? { titulo: 'Defeito relatado', conteudo: celula(defeito, { style: 'paragrafo' }) } : null,
    servico ? { titulo: 'Serviço executado / diagnóstico', conteudo: celula(servico, { style: 'paragrafo' }) } : null,
  ].filter(Boolean);
  if (!lista.length) return null;
  const longos = Math.max(defeito.length, servico.length) > 420;
  if (!longos) return Object.assign(caixas(lista), { margin: [0, 0, 0, 13] });
  return lista.map((c, i) =>
    Object.assign(caixas([c], { quebravel: texto(c.conteudo.text).length > 900 }), {
      margin: [0, 0, 0, i === lista.length - 1 ? 13 : 8],
    })
  );
}

function blocoCondicoes(ordem, validade) {
  const prazo = lerData(ordem.prazo_conclusao);
  const formas = Array.isArray(ordem.formas_pagamento) ? juntar(ordem.formas_pagamento, ' • ') : texto(ordem.formas_pagamento);
  const dias = num(ordem.validade_dias);
  const faixa = faixaInfo(
    [
      { rotulo: 'Prazo estimado de conclusão', valor: dataBR(prazo), estilo: { bold: true, color: COR.grafite } },
      {
        rotulo: 'Validade do orçamento',
        valor: validade ? `${plural(dias, 'dia', 'dias')} (até ${dataBR(validade)})` : '',
      },
      { rotulo: 'Formas de pagamento', valor: formas },
    ],
    COR.verdeClaro
  );

  const corpo = [
    blocoTexto('Garantia', ordem.garantia),
    blocoTexto('Observações e recomendações', ordem.observacoes),
    blocoTexto('Condições gerais', ordem.condicoes, 'letraMiuda'),
  ].filter(Boolean);

  if (!faixa && !corpo.length) return [];
  const abertura = { stack: [tituloSecao('Condições comerciais')], unbreakable: true };
  if (faixa) abertura.stack.push(Object.assign(faixa, { margin: [0, 0, 0, 10] }));
  else if (corpo.length) abertura.stack.push(corpo.shift());
  return [abertura, ...corpo];
}

function montarConteudo(ordem, cfg) {
  const itens = (Array.isArray(ordem.itens) ? ordem.itens : [])
    .map((it, i) => ({ it, i }))
    .sort((a, b) => num(a.it.posicao ?? a.i) - num(b.it.posicao ?? b.i) || a.i - b.i)
    .map((x) => x.it);
  const servicos = itens.filter((it) => it.tipo !== 'peca');
  const pecas = itens.filter((it) => it.tipo === 'peca');
  const totais = calcularTotais(ordem, servicos, pecas);

  const emissao = hoje();
  const dias = num(ordem.validade_dias);
  const validade = dias > 0 ? somarDias(emissao, dias) : null;

  const tabelas = [
    tabelaItens('Serviços', servicos, 'Subtotal de serviços', totais.servicos),
    tabelaItens('Peças', pecas, 'Subtotal de peças', totais.pecas),
  ].filter(Boolean);
  if (tabelas.length) tabelas[tabelas.length - 1].id = ID_ULTIMA_TABELA;
  const conteudo = [
    ...blocoDocumento(ordem, emissao, validade),
    blocoClienteEquipamento(ordem),
    ...[].concat(blocoDiagnostico(ordem) || []),
    ...tabelas,
  ];
  if (!servicos.length && !pecas.length) {
    conteudo.push({ text: 'Nenhum serviço ou peça lançado neste orçamento.', style: 'notaPequena', margin: [0, 0, 0, 8] });
  }
  conteudo.push(caixaTotais(totais, servicos.length > 0, pecas.length > 0));
  conteudo.push(...blocoCondicoes(ordem, validade));
  if (!cfg.orcamento || cfg.orcamento.mostrarAceite !== false) conteudo.push(blocoAceite(cfg));
  return conteudo.filter(Boolean);
}

const ID_ULTIMA_TABELA = 'ultima-tabela-itens';
const ID_TOTAIS = 'quadro-totais';

// Evita que o quadro de totais fique sozinho no alto de uma página, separado
// da tabela de itens: se a última tabela é curta e coube inteira na página
// anterior, ela passa para a página seguinte junto com os totais. (O id fica
// no texto "TOTAL" porque a posição de um bloco inquebrável é a de antes de
// ele ser empurrado para a página seguinte.)
function quebraAntes(no, contexto) {
  if (no.id !== ID_ULTIMA_TABELA || no.pageNumbers.length !== 1) return false;
  if (!no.table || no.table.body.length > 14) return false;
  if (!no.startPosition || no.startPosition.verticalRatio < 0.1) return false;
  return contexto.getNodesOnNextPage().some((n) => n.id === ID_TOTAIS);
}

const ESTILOS = {
  titulo: { fontSize: 21, bold: true, color: COR.grafite, characterSpacing: 1.4 },
  numeroPrefixo: { fontSize: 12, color: COR.rotulo },
  numero: { fontSize: 17, bold: true, color: COR.verdeEscuro },
  rotulo: { fontSize: 7, bold: true, color: COR.rotulo, characterSpacing: 0.45 },
  tituloSecao: { fontSize: 8.5, bold: true, color: COR.verdeEscuro, characterSpacing: 0.6 },
  complementoSecao: { fontSize: 7.5, bold: false, color: COR.suave, characterSpacing: 0.2 },
  tituloCaixa: { fontSize: 7.5, bold: true, color: COR.grafite, characterSpacing: 0.5 },
  cabecalhoTabela: { fontSize: 7, bold: true, color: COR.branco, characterSpacing: 0.45 },
  rotuloSubtotal: { fontSize: 8, bold: true, color: COR.verdeEscuro, margin: [0, 1.4, 0, 0] },
  rotuloTotais: { fontSize: 8.5, color: COR.rotulo, margin: [0, 0.9, 0, 0] },
  rotuloTotal: { fontSize: 9.5, bold: true, color: COR.branco, characterSpacing: 0.6, margin: [0, 4.2, 0, 0] },
  valorTotal: { fontSize: 14, bold: true, color: COR.branco },
  paragrafo: { fontSize: 9.5, lineHeight: 1.25 },
  letraMiuda: { fontSize: 7.6, color: COR.rotulo, lineHeight: 1.3, alignment: 'justify' },
  notaPequena: { fontSize: 7.8, color: COR.rotulo, italics: true },
  paginacao: { fontSize: 7, color: COR.rotulo, characterSpacing: 0.2 },
};

// ---------------------------------------------------------------------------
// Função principal
// ---------------------------------------------------------------------------

async function gerarOrcamentoPdf(ordem, cfg, imagens) {
  cfg = { ...(cfg || {}), empresa: (cfg && cfg.empresa) || {} };
  const usarTimbrado = !cfg.orcamento || cfg.orcamento.usarTimbrado !== false;
  const timbrado = usarTimbrado ? carregarTimbrado(imagens) : null;

  const cliente = texto(ordem.cliente_nome || (ordem.cliente && ordem.cliente.nome));
  const docDefinition = {
    pageSize: 'A4',
    pageMargins: timbrado ? MARGENS_TIMBRADO : MARGENS_SIMPLES,
    info: {
      title: `Orçamento nº ${texto(ordem.numero)}${cliente ? ` - ${cliente}` : ''}`,
      author: texto(cfg.empresa.nome),
      subject: 'Orçamento de serviços',
      creator: texto(cfg.empresa.nome) || 'Sistema de orçamentos',
    },
    language: 'pt-BR',
    defaultStyle: { font: 'Roboto', fontSize: 9.5, color: COR.texto, lineHeight: 1.15 },
    styles: ESTILOS,
    content: montarConteudo(ordem, cfg),
    pageBreakBefore: quebraAntes,
  };

  if (timbrado) {
    docDefinition.images = { cabecalho: timbrado.cabecalho.dataUrl, rodape: timbrado.rodape.dataUrl };
    docDefinition.background = fundoTimbrado(timbrado);
    docDefinition.footer = rodapeTimbrado(ordem, timbrado);
  } else {
    docDefinition.header = cabecalhoSimples(cfg);
    docDefinition.footer = rodapeSimples(ordem, cfg);
  }

  // O pdfmake é um objeto único no processo: as políticas são definidas
  // imediatamente antes de criar o documento (a criação as captura na hora).
  const permitidos = new Set(
    [imagens && imagens.cabecalho, imagens && imagens.rodape].filter(Boolean).map((p) => path.resolve(p))
  );
  pdfmake.setFonts(fontesRoboto);
  pdfmake.setUrlAccessPolicy(() => false);
  pdfmake.setLocalAccessPolicy((p) => {
    const abs = path.resolve(String(p));
    return abs.startsWith(PASTA_FONTES + path.sep) || permitidos.has(abs);
  });
  return pdfmake.createPdf(docDefinition).getBuffer();
}

module.exports = { gerarOrcamentoPdf };
