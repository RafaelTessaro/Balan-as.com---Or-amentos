// Gera public/js/icones.js com os ícones Lucide (licença ISC) usados no sistema.
// Uso: node scripts/gerar-icones.js   (requer `npm install` com devDependencies)
const fs = require('fs');
const path = require('path');

const NOMES = `
layout-dashboard clipboard-list users wrench package settings plus search x check
chevron-right chevron-down chevron-left chevron-up trash-2 pencil printer file-text file-down download
send mail message-circle copy save circle-check circle-x clock thumbs-up hand truck info
triangle-alert loader-circle eye minus user calendar hash scale zap cpu list-checks receipt menu
panel-left upload rotate-ccw database phone map-pin building-2 image external-link ellipsis
arrow-left filter refresh-cw square-check sparkles circle-help clipboard-check badge-check banknote
percent tag history plug battery keyboard monitor wifi file-check circle-alert circle-dashed sun moon sun-moon
list-plus package-plus user-plus grip-vertical arrow-right shield-check stamp
eye-off hard-hat plug-zap archive-restore hard-drive-download id-card arrow-up arrow-down braces lock at-sign image-up
network tablet-smartphone folder-open
`.trim().split(/\s+/);

const dir = path.join(__dirname, '..', 'node_modules', 'lucide-static', 'icons');
const saida = {};
for (const nome of NOMES) {
  const svg = fs.readFileSync(path.join(dir, `${nome}.svg`), 'utf8');
  const corpo = svg
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .replace(/\s*\n\s*/g, '')
    .trim();
  saida[nome] = corpo;
}

const js = `// Gerado por scripts/gerar-icones.js — ícones Lucide (https://lucide.dev, licença ISC).
export const ICONES = ${JSON.stringify(saida, null, 0).replace(/","/g, '",\n  "')};

export function icone(nome, classe = '') {
  const corpo = ICONES[nome] || ICONES['circle-help'];
  return \`<svg class="i\${classe ? ' ' + classe : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">\${corpo}</svg>\`;
}
`;
fs.writeFileSync(path.join(__dirname, '..', 'public', 'js', 'icones.js'), js);
console.log(`${NOMES.length} ícones gerados em public/js/icones.js`);
