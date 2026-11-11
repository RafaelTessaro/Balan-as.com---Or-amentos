// pdfmake na versão de teste: a versão para navegador da mesma biblioteca,
// com as fontes Roboto embutidas. Mantém a interface usada pelo servidor
// (setFonts, setUrlAccessPolicy, setLocalAccessPolicy, createPdf).

const pdfMake = require('pdfmake/build/pdfmake.js');
const vfs = require('pdfmake/build/vfs_fonts.js');

pdfMake.addVirtualFileSystem(vfs);

module.exports = {
  setFonts: (fontes) => pdfMake.setFonts(fontes),
  setUrlAccessPolicy: (fn) => (pdfMake.setUrlAccessPolicy ? pdfMake.setUrlAccessPolicy(fn) : undefined),
  setLocalAccessPolicy: () => {},
  createPdf: (doc) => pdfMake.createPdf(doc),
};
