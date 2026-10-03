// Configuração inicial do sistema. Os valores vieram da planilha
// "Checklist_Tecnico_Orcamento_revisado.xlsm" e podem ser alterados
// pela tela de Configurações.

const ITENS_CHECKLIST = [
  'Liga e inicializa normalmente',
  'Pesagem correta / dentro da tolerância',
  'Peso estabilizado, sem oscilações',
  'Displays do operador e do cliente',
  'Teclado e teclas de função',
  'Bateria segura carga e recarrega',
  'Impressão, avanço e parada da etiqueta',
  'Comunicação serial / USB / rede / sistema',
  'Cadastro de produtos e chamada por PLU',
  'Venda de produto e venda de diversos',
  'Carcaça, prato, cabos, conectores e pés',
  'Teste em 220 V (quando aplicável)',
];

module.exports = {
  empresa: {
    nome: 'BALANÇAS.COM',
    razaoSocial: '',
    permissionaria: '',
    subtitulo: 'Equipamentos e Sistemas',
    cnpj: '12.403.843/0001-18',
    endereco: 'R. Treze, 650 - Consolação',
    cidade: 'Rio Claro - SP',
    telefone: '(19) 3023-9050',
    whatsapp: '(19) 3023-9050',
    email: 'recepcao@balancass.com',
    site: 'balancass.com',
  },
  orcamento: {
    validadeDias: 10,
    prazoPadraoDias: 5,
    formasPagamento: ['Dinheiro', 'Pix', 'Cartão de Crédito', 'Cartão de Débito'],
    garantia:
      'Garantia de 90 (noventa) dias para os serviços executados e as peças substituídas, contados da entrega do equipamento (CDC, art. 26, II). A garantia não cobre mau uso, quedas, contato com líquidos, descargas elétricas, violação de lacres ou intervenção de terceiros.',
    condicoes:
      'O serviço só será executado após a aprovação expressa deste orçamento. Serviços ou peças adicionais identificados durante a manutenção serão orçados à parte e dependem de nova aprovação. Peças novas e originais ou equivalentes à especificação do fabricante; as peças substituídas ficam à disposição do cliente. Após o reparo, o equipamento está sujeito à verificação do IPEM; taxas do órgão não estão incluídas. Documento sem valor fiscal.',
    mostrarAceite: true,
    usarTimbrado: true,
  },
  checklist: {
    itens: ITENS_CHECKLIST,
    acessorios: ['Prato', 'Fonte/cabo', 'Bateria', 'Bobina/etiquetas'],
    tensoesEntrada: ['110 V', 'Bivolt', '220 V', 'Não identificada'],
    tensoesSaida: ['110 V', 'Bivolt', '220 V'],
    rodape: 'Checklist técnico de oficina • Revisão 1.0 • Documento interno',
    // Itens opcionais (Portaria Inmetro 157/2022) que podem ser adicionados ao checklist pela tela de Configurações.
    itensSugeridos: [
      'Identificação conferida (nº de série, PAM e plaqueta legível)',
      'Lacres e selo do IPEM íntegros na entrada',
      'Nivelamento (bolha) e pés niveladores',
      'Retorno ao zero e função tara',
      'Excentricidade (≈ 1/3 da capacidade nos cantos)',
      'Repetibilidade (3 pesagens com ≈ 50% da capacidade)',
      'Pesagem com pesos-padrão (mínimo, 50% e máximo)',
      'Etiqueta: preço × peso = total e código de barras lido no PDV',
    ],
  },
  // Lista de técnicos: [{ nome, documento }] — o documento aparece na OS impressa (Portaria Inmetro 457/2021).
  tecnicos: [],
  numeracao: {
    inicioOS: 1,
  },
  email: {
    host: '',
    porta: 587,
    seguro: false,
    usuario: '',
    senha: '',
    remetenteNome: 'BALANÇAS.COM',
    remetenteEmail: '',
    copiaPara: '',
    assunto: 'Orçamento nº {numero} - {empresa}',
    mensagem:
      'Olá, {cliente}!\n\nSegue em anexo o orçamento nº {numero} referente ao equipamento {equipamento}, no valor total de {total}.\n\nO orçamento é válido por {validade} dias. Para aprovar, basta responder este e-mail ou falar conosco pelo WhatsApp {telefone}.\n\nAtenciosamente,\n{empresa}',
  },
  whatsapp: {
    mensagem:
      'Olá, {cliente}! Aqui é da {empresa}. Segue o orçamento nº {numero} do equipamento {equipamento}, no valor total de {total}. O orçamento é válido por {validade} dias. Qualquer dúvida estamos à disposição!',
  },
};
