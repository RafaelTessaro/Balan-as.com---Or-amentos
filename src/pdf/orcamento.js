// PROVISÓRIO: versão mínima para testes. Será substituída pelo gerador completo.
const pdfmake = require('pdfmake');
const fonts = require('pdfmake/fonts/Roboto');

pdfmake.setFonts(fonts);
pdfmake.setUrlAccessPolicy(() => false);

async function gerarOrcamentoPdf(ordem, cfg) {
  const doc = pdfmake.createPdf({
    pageSize: 'A4',
    content: [{ text: `Orçamento nº ${ordem.numero}`, fontSize: 18 }, { text: ordem.cliente_nome || '' }],
  });
  return doc.getBuffer();
}

module.exports = { gerarOrcamentoPdf };
