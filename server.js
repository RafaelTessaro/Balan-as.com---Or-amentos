// BALANÇAS.COM — Checklist técnico, ordens de serviço e orçamentos.
// Inicie com:  npm start   (ou dê dois cliques em iniciar.bat no Windows)

process.removeAllListeners('warning'); // oculta o aviso "SQLite is experimental"

const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');

const { db, DATA_DIR } = require('./src/db');
const api = require('./src/api');
const imagens = require('./src/imagens');
const instancia = require('./src/instancia');
const { abrirJanela } = require('./src/janela');

const HOST = process.env.HOST || '0.0.0.0';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '25mb' }));

app.use('/api', api);

// Imagens do papel timbrado (padrão ou personalizadas).
app.get('/timbrado/:nome.png', (req, res) => {
  const p = imagens.caminho(req.params.nome);
  if (!p) return res.sendStatus(404);
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(p);
});

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

// Qualquer outra rota abre a aplicação (navegação por #/rotas).
app.use((req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ---------------------------------------------------------------------------
// Backup automático do banco a cada inicialização (mantém os 20 mais recentes).
// ---------------------------------------------------------------------------
function backupAutomatico() {
  try {
    const dir = path.join(DATA_DIR, 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const carimbo = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const destino = path.join(dir, `balancas-${carimbo}.db`);
    db.exec(`VACUUM INTO '${destino.replace(/'/g, "''")}'`);
    // Só mexe nas cópias deste sistema (a pasta pode ter arquivos de outros programas).
    const antigos = fs
      .readdirSync(dir)
      .filter((f) => /^balancas-.*\.db$/.test(f))
      .sort()
      .reverse()
      .slice(20);
    for (const f of antigos) fs.unlinkSync(path.join(dir, f));
  } catch (e) {
    console.warn('Não foi possível criar o backup automático:', e.message);
  }
}

function abrir(url) {
  if (process.env.NAO_ABRIR_NAVEGADOR) return;
  const modo = process.env.JANELA || instancia.lerPreferencias(DATA_DIR).janela;
  abrirJanela(url, { modo }).catch(() => {});
}

// Encerra depois de abrir a janela (o navegador é aberto em segundo plano).
function sair(codigo) {
  setTimeout(() => process.exit(codigo), 1500);
}

process.on('SIGINT', () => process.exit(0));

async function principal() {
  const servidor = http.createServer(app);
  const r = await instancia.iniciarServidor(servidor, {
    host: HOST,
    pastaDados: DATA_DIR,
    portaAmbiente: Number(process.env.PORT) || 0,
  });
  const local = `http://localhost:${r.porta}`;

  if (r.situacao === 'ja-aberto') {
    console.log(`\n  O sistema já está aberto em ${local}. Abrindo a janela...\n`);
    abrir(local);
    return sair(0);
  }
  if (r.situacao === 'outra-copia') {
    console.log('');
    console.log(`  ATENÇÃO: outra cópia deste sistema já está aberta na porta ${r.porta},`);
    console.log('  usando os dados de outra pasta:');
    console.log(`     ${r.pasta}`);
    console.log('');
    console.log('  Para não misturar dois bancos de dados, esta cópia não foi aberta.');
    console.log('  Feche a janela preta da outra cópia e abra esta de novo,');
    console.log('  ou use sempre a mesma pasta do sistema.');
    console.log('');
    return sair(1);
  }
  if (r.situacao === 'porta-fixa-ocupada') {
    console.log(`\n  A porta ${r.porta} (variável PORT) está em uso por outro programa. Escolha outra porta.\n`);
    return sair(1);
  }
  if (r.situacao === 'sem-porta') {
    console.log(`\n  Não foi possível encontrar uma porta livre a partir da ${r.porta}.\n`);
    return sair(1);
  }

  backupAutomatico();
  // Título da janela preta no Windows.
  if (process.platform === 'win32') process.title = `${instancia.NOME_APP} - porta ${r.porta} - não feche esta janela`;

  console.log('');
  console.log('  BALANÇAS.COM — Checklist e Orçamentos');
  console.log('  ---------------------------------------');
  console.log(`  Neste computador:  ${local}`);
  for (const ip of instancia.enderecosRede()) console.log(`  Na rede local:     http://${ip}:${r.porta}`);
  console.log(`  Dados salvos em:   ${DATA_DIR}`);
  if (r.mudou) {
    console.log('');
    console.log(`  A porta ${r.ocupada} está sendo usada por outro programa.`);
    console.log(`  Este sistema passou a usar a porta ${r.porta} (fica gravada para as próximas vezes).`);
  }
  console.log('');
  console.log('  Deixe esta janela aberta (pode minimizar) enquanto usa o sistema.');
  console.log('  Para encerrar, feche esta janela ou pressione Ctrl+C.');
  console.log('');
  abrir(local);
}

principal().catch((e) => {
  console.error('\n  Não foi possível iniciar o sistema:', e.message, '\n');
  sair(1);
});
