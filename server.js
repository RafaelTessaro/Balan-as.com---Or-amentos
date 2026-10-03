// BALANÇAS.COM — Checklist técnico, ordens de serviço e orçamentos.
// Inicie com:  npm start   (ou dê dois cliques em iniciar.bat no Windows)

process.removeAllListeners('warning'); // oculta o aviso "SQLite is experimental"

const os = require('os');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const express = require('express');

const { db, DATA_DIR } = require('./src/db');
const api = require('./src/api');
const imagens = require('./src/imagens');

const PORTA = Number(process.env.PORT) || 3000;
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
    const antigos = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.db'))
      .sort()
      .reverse()
      .slice(20);
    for (const f of antigos) fs.unlinkSync(path.join(dir, f));
  } catch (e) {
    console.warn('Não foi possível criar o backup automático:', e.message);
  }
}

function enderecosRede() {
  const lista = [];
  for (const ifs of Object.values(os.networkInterfaces())) {
    for (const i of ifs || []) {
      if (i.family === 'IPv4' && !i.internal) lista.push(i.address);
    }
  }
  return lista;
}

function abrirNavegador(url) {
  if (process.env.NAO_ABRIR_NAVEGADOR) return;
  const cmd =
    process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd, () => {});
}

backupAutomatico();

const servidor = app.listen(PORTA, HOST, () => {
  const local = `http://localhost:${PORTA}`;
  console.log('');
  console.log('  BALANÇAS.COM — Checklist e Orçamentos');
  console.log('  ---------------------------------------');
  console.log(`  Neste computador:  ${local}`);
  for (const ip of enderecosRede()) console.log(`  Na rede local:     http://${ip}:${PORTA}`);
  console.log(`  Dados salvos em:   ${DATA_DIR}`);
  console.log('');
  console.log('  Deixe esta janela aberta enquanto usa o sistema.');
  console.log('  Para encerrar, feche a janela ou pressione Ctrl+C.');
  console.log('');
  abrirNavegador(local);
});

servidor.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.log(`\n  O sistema já está aberto em http://localhost:${PORTA}\n`);
    abrirNavegador(`http://localhost:${PORTA}`);
    setTimeout(() => process.exit(0), 1500);
  } else {
    throw e;
  }
});
