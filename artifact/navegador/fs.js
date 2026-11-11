// Substitui o `fs` na versão de teste: arquivos guardados na memória.
// Começa com as imagens padrão do papel timbrado; o que o sistema grava em
// /dados (imagens personalizadas) também é salvo no navegador (entrada.js).

const { Buffer } = require('buffer');
const cabecalho = require('../../public/img/timbrado-cabecalho.png');
const rodape = require('../../public/img/timbrado-rodape.png');

const arquivos = new Map([
  ['/app/public/img/timbrado-cabecalho.png', Buffer.from(cabecalho)],
  ['/app/public/img/timbrado-rodape.png', Buffer.from(rodape)],
]);

// Avisado a cada gravação ou exclusão (para salvar no navegador).
let aoMudar = () => {};

function normalizar(p) {
  return String(p).replace(/\\/g, '/').replace(/\/+/g, '/');
}

function erroNaoExiste(p) {
  return Object.assign(new Error(`ENOENT: arquivo não encontrado: ${p}`), { code: 'ENOENT' });
}

module.exports = {
  existsSync: (p) => arquivos.has(normalizar(p)),
  mkdirSync: () => {},
  readFileSync(p, opcoes) {
    const dados = arquivos.get(normalizar(p));
    if (!dados) throw erroNaoExiste(p);
    const cod = typeof opcoes === 'string' ? opcoes : opcoes && opcoes.encoding;
    return cod ? dados.toString(cod) : Buffer.from(dados);
  },
  writeFileSync(p, dados) {
    const buf = typeof dados === 'string' ? Buffer.from(dados, 'utf8') : Buffer.from(dados);
    arquivos.set(normalizar(p), buf);
    aoMudar(normalizar(p), buf);
  },
  unlinkSync(p) {
    if (!arquivos.delete(normalizar(p))) throw erroNaoExiste(p);
    aoMudar(normalizar(p), null);
  },

  // Usados só pela versão de teste (entrada.js).
  __carregar(p, dados) {
    arquivos.set(normalizar(p), Buffer.from(dados));
  },
  __aoMudar(fn) {
    aoMudar = fn;
  },
  __lerTodos(prefixo) {
    return [...arquivos].filter(([p]) => p.startsWith(prefixo));
  },
};
