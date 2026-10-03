// Imagens do papel timbrado. O padrão vem da planilha original; o usuário
// pode trocar pela tela de Configurações (os arquivos ficam em ./dados).

const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./db');

const PADRAO = {
  cabecalho: path.join(__dirname, '..', 'public', 'img', 'timbrado-cabecalho.png'),
  rodape: path.join(__dirname, '..', 'public', 'img', 'timbrado-rodape.png'),
};

const personalizado = (nome) => path.join(DATA_DIR, `timbrado-${nome}.png`);

function caminho(nome) {
  if (!PADRAO[nome]) return null;
  const p = personalizado(nome);
  return fs.existsSync(p) ? p : PADRAO[nome];
}

function ehPersonalizado(nome) {
  return Boolean(PADRAO[nome]) && fs.existsSync(personalizado(nome));
}

function salvar(nome, dataUrl) {
  if (!PADRAO[nome]) throw Object.assign(new Error('Imagem desconhecida.'), { status: 400 });
  const m = /^data:image\/png;base64,(.+)$/.exec(String(dataUrl || ''));
  if (!m) throw Object.assign(new Error('Envie uma imagem PNG.'), { status: 400 });
  fs.writeFileSync(personalizado(nome), Buffer.from(m[1], 'base64'));
}

function restaurar(nome) {
  if (ehPersonalizado(nome)) fs.unlinkSync(personalizado(nome));
}

// Para o backup em JSON: imagens personalizadas como data URL (ou null).
function exportar() {
  const out = {};
  for (const nome of Object.keys(PADRAO)) {
    out[nome] = ehPersonalizado(nome)
      ? `data:image/png;base64,${fs.readFileSync(personalizado(nome)).toString('base64')}`
      : null;
  }
  return out;
}

function importar(imagens) {
  for (const nome of Object.keys(PADRAO)) {
    if (!imagens || !(nome in imagens)) continue;
    if (imagens[nome]) salvar(nome, imagens[nome]);
    else restaurar(nome);
  }
}

module.exports = { caminho, ehPersonalizado, salvar, restaurar, exportar, importar };
