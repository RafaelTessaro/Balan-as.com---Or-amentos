// Identidade na versão de teste: não há porta, rede nem pasta de dados; os
// dados ficam guardados neste navegador.

const VERSAO = require('../../package.json').version;

function identidade() {
  return {
    app: 'balancas-orcamentos',
    nome: 'Orçamentos BALANÇAS.COM',
    versao: VERSAO,
    teste: true,
    porta: null,
    pasta: 'Neste navegador (versão de teste dentro do Claude)',
    enderecos: [],
    redes: [],
  };
}

module.exports = { identidade, VERSAO };
