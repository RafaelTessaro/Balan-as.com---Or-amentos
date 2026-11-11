// Monta a versão de teste do sistema que roda inteira dentro do Claude
// (Artifact): a mesma tela (public/) e o mesmo servidor (src/), com o
// servidor rodando no navegador.
//
// Uso:  npm run artifact      → dist/artifact/
//         pagina.html          conteúdo da página (publicado como a página do Artifact)
//         arquivos.json        { "caminho publicado": "arquivo de origem" } dos demais arquivos
//         ...                  css, js, fontes, imagens, checklist e o motor da versão de teste
//
// Requer as dependências de desenvolvimento (npm install).

const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const RAIZ = path.join(__dirname, '..');
const PUBLICO = path.join(RAIZ, 'public');
const NAVEGADOR = path.join(__dirname, 'navegador');
const SAIDA = path.join(RAIZ, 'dist', 'artifact');

// Arquivos da pasta public/ que não servem dentro do Claude.
const IGNORAR = new Set([
  'manifest.webmanifest',
  'img/icone.ico',
  'img/app-192.png',
  'img/app-512.png',
  'img/app-192-maskable.png',
  'img/app-512-maskable.png',
  'img/apple-touch-icon.png',
  'img/timbrado-cabecalho.png', // vão dentro do motor (src/imagens.js lê pelo fs virtual)
  'img/timbrado-rodape.png',
  'index.html', // vira pagina.html
]);

function listar(dir, base = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const rel = base ? `${base}/${d.name}` : d.name;
    return d.isDirectory() ? listar(path.join(dir, d.name), rel) : [rel];
  });
}

function trocar(texto, pares, arquivo) {
  for (const [de, para] of pares) {
    if (!texto.includes(de)) throw new Error(`${arquivo}: não achei "${de}" (o arquivo mudou; ajuste artifact/construir.js)`);
    texto = texto.split(de).join(para);
  }
  return texto;
}

// Endereços que começam com "/" apontam para a raiz do servidor; no Artifact
// os arquivos ficam ao lado da página, então viram relativos.
function ajustarArquivo(rel, texto) {
  if (rel.endsWith('.css')) return texto.replace(/url\((['"]?)\/fonts\//g, `url($1${rel.includes('/') ? '../' : ''}fonts/`);
  if (rel === 'imprimir/checklist.html') {
    return trocar(
      texto,
      [
        ['<link rel="icon" href="/img/logo-simbolo.png" />', ''],
        ['href="/fonts/', 'href="../fonts/'],
        ['href="/imprimir/checklist.css"', 'href="checklist.css"'],
        ['<script type="module" src="/imprimir/checklist.js"></script>', '<script src="../teste/impressao.js"></script>\n    <script type="module" src="checklist.js"></script>'],
      ],
      rel
    );
  }
  if (rel === 'imprimir/checklist.js') {
    return trocar(
      texto,
      [
        ["from '/js/api.js'", "from '../js/api.js'"],
        ["from '/js/ui.js'", "from '../js/ui.js'"],
        ['src="/img/', 'src="../img/'],
      ],
      rel
    );
  }
  return texto;
}

// index.html → conteúdo da página do Artifact. O Claude envolve o arquivo com
// <!doctype>, <head> (charset e viewport) e <body>; então ficam só o título,
// os estilos, os scripts e o conteúdo do <body>.
function montarPagina() {
  const html = fs.readFileSync(path.join(PUBLICO, 'index.html'), 'utf8');
  const tema = /<script>\s*\/\/ Aplica o tema[\s\S]*?<\/script>/.exec(html);
  const corpo = /<body>([\s\S]*)<\/body>/.exec(html);
  if (!tema || !corpo) throw new Error('index.html mudou: ajuste montarPagina() em artifact/construir.js');
  const conteudo = trocar(
    corpo[1],
    [
      ['src="/img/', 'src="img/'],
      ['<script type="module" src="/js/app.js"></script>', ''],
    ],
    'index.html'
  ).trim();
  return `<title>Orçamentos BALANÇAS.COM</title>
<meta name="theme-color" content="#f3f5f4" />
${tema[0].trim()}
<link rel="stylesheet" href="css/app.css" />
<link rel="stylesheet" href="css/telas.css" />
<link rel="stylesheet" href="css/cadastros.css" />
<script src="teste/sql-asm.js"></script>
<script src="teste/sistema.js"></script>
${conteudo}
<script type="module" src="js/app.js"></script>
`;
}

// Troca, no código do servidor, o que depende do computador.
const trocasDoServidor = {
  name: 'trocas-do-servidor',
  setup(build) {
    const para = (arquivo) => ({ path: path.join(NAVEGADOR, arquivo) });
    build.onResolve({ filter: /^node:sqlite$/ }, () => para('sqlite.js'));
    build.onResolve({ filter: /^express$/ }, () => para('express.js'));
    build.onResolve({ filter: /^fs$/ }, () => para('fs.js'));
    build.onResolve({ filter: /^path$/ }, () => ({ path: require.resolve('path-browserify') }));
    build.onResolve({ filter: /^nodemailer$/ }, () => para('nodemailer.js'));
    build.onResolve({ filter: /^pdfmake$/ }, () => para('pdfmake.js'));
    build.onResolve({ filter: /^pdfmake\/fonts\/Roboto$/ }, () => para('roboto.js'));
    // Dentro de src/: a consulta de CNPJ e a identidade (porta, rede, pasta).
    build.onResolve({ filter: /^\.\/(cnpj|instancia)$/ }, (a) =>
      a.importer.startsWith(path.join(RAIZ, 'src') + path.sep) && path.dirname(a.importer) === path.join(RAIZ, 'src')
        ? para(`${a.path.slice(2)}.js`)
        : undefined
    );
  },
};

async function principal() {
  fs.rmSync(SAIDA, { recursive: true, force: true });
  fs.mkdirSync(path.join(SAIDA, 'teste'), { recursive: true });
  const arquivos = {};
  const publicar = (rel, origem) => (arquivos[rel] = path.relative(RAIZ, origem));

  for (const rel of listar(PUBLICO)) {
    if (IGNORAR.has(rel)) continue;
    const origem = path.join(PUBLICO, rel);
    const destino = path.join(SAIDA, rel);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    if (/\.(css|js|html)$/.test(rel)) fs.writeFileSync(destino, ajustarArquivo(rel, fs.readFileSync(origem, 'utf8')));
    else fs.copyFileSync(origem, destino);
    publicar(rel, destino);
  }

  fs.writeFileSync(path.join(SAIDA, 'pagina.html'), montarPagina());

  await esbuild.build({
    entryPoints: [path.join(NAVEGADOR, 'entrada.js')],
    outfile: path.join(SAIDA, 'teste', 'sistema.js'),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
    minify: true,
    legalComments: 'eof',
    loader: { '.png': 'binary' },
    inject: [path.join(NAVEGADOR, 'processo.js')],
    define: { __dirname: '"/app/src"', global: 'globalThis' },
    plugins: [trocasDoServidor],
    logLevel: 'warning',
  });
  publicar('teste/sistema.js', path.join(SAIDA, 'teste', 'sistema.js'));

  const copiar = (origem, rel) => {
    fs.copyFileSync(origem, path.join(SAIDA, rel));
    publicar(rel, path.join(SAIDA, rel));
  };
  copiar(path.join(NAVEGADOR, 'impressao.js'), 'teste/impressao.js');
  copiar(require.resolve('sql.js/dist/sql-asm.js'), 'teste/sql-asm.js');
  copiar(require.resolve('pdfjs-dist/build/pdf.min.js'), 'teste/pdf.min.js');
  copiar(require.resolve('pdfjs-dist/build/pdf.worker.min.js'), 'teste/pdf.worker.min.js');

  fs.writeFileSync(path.join(SAIDA, 'arquivos.json'), `${JSON.stringify(arquivos, null, 2)}\n`);
  const total = Object.values(arquivos).reduce((s, f) => s + fs.statSync(path.join(RAIZ, f)).size, 0);
  console.log(`Versão de teste em ${path.relative(RAIZ, SAIDA)}: pagina.html + ${Object.keys(arquivos).length} arquivos (${(total / 1048576).toFixed(1)} MB)`);
}

principal().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
