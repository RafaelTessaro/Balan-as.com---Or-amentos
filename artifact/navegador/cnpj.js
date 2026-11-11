// Consulta de CNPJ na versão de teste: dentro do Claude a página não pode
// acessar outros sites (Receita, BrasilAPI), então a consulta avisa e o
// técnico preenche nome e cidade à mão. O resto do módulo é o original.

const original = require('../../src/cnpj.js');

async function consultarCNPJ() {
  throw Object.assign(
    new Error('A consulta de CNPJ não funciona na versão de teste dentro do Claude. Preencha o nome e a cidade à mão; no sistema instalado no computador a consulta funciona.'),
    { status: 503 }
  );
}

module.exports = { ...original, consultarCNPJ };
