// Gera PDFs de exemplo do orçamento para conferência visual.
//
// Uso:
//   node scripts/testar-pdf.js [ordem.json] [config.json] [pasta-de-saida]
//
// Sem argumentos, usa uma ordem e uma configuração fictícias embutidas e grava
// os arquivos na pasta temporária do sistema. São gerados:
//   a) exemplo.pdf          - a ordem como está
//   b) longo.pdf            - ~25 serviços e ~25 peças (várias páginas)
//   c) sem-timbrado.pdf     - cabeçalho em texto (usarTimbrado = false)
//   d) minimo.pdf           - só o nome do cliente e um serviço
//   e) textos-longos.pdf    - textos e nomes compridos, sem bloco de aceite

const fs = require('fs');
const os = require('os');
const path = require('path');
const { gerarOrcamentoPdf } = require('../src/pdf/orcamento');
const configPadrao = require('../src/config-padrao');

const RAIZ = path.join(__dirname, '..');
const IMAGENS = {
  cabecalho: path.join(RAIZ, 'public', 'img', 'timbrado-cabecalho.png'),
  rodape: path.join(RAIZ, 'public', 'img', 'timbrado-rodape.png'),
};

const ORDEM_PADRAO = {
  numero: 1,
  status: 'em_analise',
  cliente_nome: 'Supermercado Bom Preço Ltda',
  cliente_telefone: '(19) 99876-5432',
  cliente_email: 'compras@bompreco.com.br',
  cliente_documento: '12.345.678/0001-90',
  cliente: { nome: 'Supermercado Bom Preço Ltda', endereco: 'Av. 1, 1200 - Centro', cidade: 'Rio Claro - SP' },
  data_entrada: new Date().toISOString().slice(0, 10),
  tecnico: 'Carlos Andrade',
  equipamento: 'Toledo Prix 5 Plus 15 kg',
  numero_serie: 'PX5-2219874',
  pam: 'Portaria Inmetro 236/2014',
  capacidade: '15 kg / 5 g',
  tensao_entrada: '220 V',
  tensao_saida: '220 V',
  acessorios: ['Prato', 'Fonte/cabo'],
  acessorios_outros: '',
  defeito_relatado: 'Etiqueta sai em branco e o peso oscila.',
  servico_executado: 'Substituição do cabeçote térmico e recalibração.',
  observacoes: 'Recomendado instalar estabilizador.',
  itens: [
    { tipo: 'servico', descricao: 'Limpeza, Regulagem, Ajuste de Peso e Lacração', valor_unitario: 190, quantidade: 1 },
    { tipo: 'peca', descricao: 'Cabeçote Térmico Toledo', valor_unitario: 980, quantidade: 1 },
  ],
  totais: { servicos: 190, pecas: 980, subtotal: 1170, desconto: 0, total: 1170 },
  validade_dias: 10,
  prazo_conclusao: '',
  formas_pagamento: configPadrao.orcamento.formasPagamento,
  condicoes: configPadrao.orcamento.condicoes,
  garantia: configPadrao.orcamento.garantia,
};

function lerJson(arquivo, padrao) {
  if (!arquivo) return JSON.parse(JSON.stringify(padrao));
  return JSON.parse(fs.readFileSync(path.resolve(arquivo), 'utf8'));
}

function recalcular(ordem) {
  const soma = (tipo) =>
    Math.round(
      ordem.itens
        .filter((it) => (tipo === 'peca' ? it.tipo === 'peca' : it.tipo !== 'peca'))
        .reduce((s, it) => s + Math.round(it.valor_unitario * it.quantidade * 100), 0)
    ) / 100;
  const servicos = soma('servico');
  const pecas = soma('peca');
  const desconto = Number(ordem.totais?.desconto ?? ordem.desconto ?? 0) || 0;
  const subtotal = Math.round((servicos + pecas) * 100) / 100;
  ordem.totais = { servicos, pecas, subtotal, desconto, total: Math.max(0, Math.round((subtotal - desconto) * 100) / 100) };
  return ordem;
}

function ordemLonga(base) {
  const o = JSON.parse(JSON.stringify(base));
  const servicos = [
    'Limpeza, regulagem, ajuste de peso e lacração',
    'Formatação e atualização de firmware',
    'Calibração com pesos-padrão rastreáveis (mínimo, 50% e máximo)',
    'Ensaio de excentricidade e repetibilidade',
    'Configuração de comunicação serial com o PDV',
    'Cadastro de produtos e teclas PLU',
    'Troca de célula de carga (mão de obra)',
    'Revisão da placa principal com ressoldagem de conectores e componentes oxidados',
    'Ajuste de nivelamento e substituição de pés niveladores',
    'Visita técnica no local',
  ];
  const pecas = [
    'Cabeçote térmico Toledo Prix 5',
    'Bobina de etiquetas 40x40 mm',
    'Célula de carga 30 kg',
    'Teclado membrana Prix 5 Plus preto',
    'Fonte de alimentação bivolt 12 V',
    'Display LCD do operador',
    'Cabo serial DB9',
    'Pé nivelador',
    'Placa principal recondicionada',
    'Bateria selada 6 V 4,5 Ah',
  ];
  o.itens = [];
  for (let i = 0; i < 25; i++) {
    o.itens.push({
      tipo: 'servico',
      descricao: `${servicos[i % servicos.length]}${i >= servicos.length ? ` (equipamento ${Math.floor(i / servicos.length) + 1})` : ''}`,
      valor_unitario: 60 + ((i * 37) % 300) + (i % 3 === 0 ? 0.5 : 0),
      quantidade: i % 7 === 0 ? 1.5 : 1 + (i % 3),
    });
  }
  for (let i = 0; i < 25; i++) {
    o.itens.push({
      tipo: 'peca',
      descricao: pecas[i % pecas.length],
      valor_unitario: 18.5 + ((i * 113) % 1500),
      quantidade: 1 + (i % 4),
    });
  }
  o.totais = { ...(o.totais || {}), desconto: 150 };
  o.observacoes = `${o.observacoes || ''} Equipamentos com histórico de oxidação: manter longe da câmara fria e utilizar estabilizador de tensão em todas as balanças do setor de frios.`.trim();
  return recalcular(o);
}

function ordemMinima(base) {
  const o = {
    numero: 42,
    cliente_nome: 'José da Silva',
    cliente: null,
    itens: [{ tipo: 'servico', descricao: 'Limpeza e regulagem', valor_unitario: 150, quantidade: 1 }],
    totais: { servicos: 150, pecas: 0, subtotal: 150, desconto: 0, total: 150 },
    validade_dias: base.validade_dias || 10,
  };
  return o;
}

function ordemTextosLongos(base) {
  const o = JSON.parse(JSON.stringify(base));
  const frase =
    'Na inspeção inicial foram encontrados sinais de oxidação na placa principal, mau contato no conector da célula de carga e desgaste acentuado no cabeçote de impressão. ';
  o.cliente_nome = 'Associação Comercial e Industrial dos Supermercadistas Independentes do Interior Paulista';
  o.cliente_email = 'departamento.de.compras.e.manutencao@associacaosupermercadistasinterior.com.br';
  o.tecnico = '';
  o.tensao_entrada = '110 V';
  o.tensao_saida = '220 V';
  o.defeito_relatado = frase.repeat(3).trim();
  o.servico_executado = frase.repeat(9).trim();
  o.observacoes = frase.repeat(4).trim();
  o.itens = [
    { tipo: 'servico', descricao: 'Mão de obra de reparo eletrônico com substituição de componentes SMD e ressoldagem geral da placa principal', valor_unitario: 350, quantidade: 1 },
    { tipo: 'servico', descricao: 'Calibração', valor_unitario: 120, quantidade: 1 },
    { tipo: 'servico', descricao: 'Lacração', valor_unitario: 80, quantidade: 1 },
    { tipo: 'peca', descricao: 'Cabeçote térmico', valor_unitario: 980, quantidade: 1 },
    { tipo: 'peca', descricao: 'Conector', valor_unitario: 12.9, quantidade: 2.5 },
  ];
  o.totais = { desconto: 0 };
  return recalcular(o);
}

async function main() {
  const [arqOrdem, arqConfig, pastaSaida] = process.argv.slice(2);
  const ordem = lerJson(arqOrdem, ORDEM_PADRAO);
  const cfg = lerJson(arqConfig, configPadrao);
  const saida = path.resolve(pastaSaida || path.join(os.tmpdir(), 'balancas-pdf-teste'));
  fs.mkdirSync(saida, { recursive: true });

  const semTimbrado = JSON.parse(JSON.stringify(cfg));
  semTimbrado.orcamento = { ...(semTimbrado.orcamento || {}), usarTimbrado: false };

  const semAceite = JSON.parse(JSON.stringify(cfg));
  semAceite.orcamento = { ...(semAceite.orcamento || {}), mostrarAceite: false };

  const casos = [
    ['exemplo.pdf', ordem, cfg],
    ['longo.pdf', ordemLonga(ordem), cfg],
    ['sem-timbrado.pdf', ordem, semTimbrado],
    ['minimo.pdf', ordemMinima(ordem), cfg],
    ['textos-longos.pdf', ordemTextosLongos(ordem), semAceite],
  ];

  for (const [nome, o, c] of casos) {
    const inicio = Date.now();
    const buf = await gerarOrcamentoPdf(o, c, IMAGENS);
    const destino = path.join(saida, nome);
    fs.writeFileSync(destino, Buffer.from(buf));
    console.log(`${destino}  (${Math.round(buf.length / 1024)} KB, ${Date.now() - inicio} ms)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
