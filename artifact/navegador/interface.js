// Ajustes de tela da versão de teste dentro do Claude.
//
// A página do Claude roda num quadro protegido: não baixa arquivos sozinha,
// não imprime, não abre janelas e não acessa outros sites. Aqui ficam as
// trocas que mantêm o sistema utilizável assim:
//   - PDF do orçamento: mostrado na tela (pdf.js) e salvo pelo "downloads" do Claude;
//   - checklist A4: aberto numa janela sobre o sistema, sem imprimir;
//   - WhatsApp e links externos: um botão com o link de verdade;
//   - imagens do papel timbrado: servidas a partir do banco do navegador;
//   - um selo "Versão de teste" com o que muda e como apagar os dados.

const SVG = {
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  externo: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
};
const icone = (n) =>
  `<svg class="i" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${SVG[n]}</svg>`;

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const ESTILO = `
.selo-teste{display:inline-flex;align-items:center;gap:6px;white-space:nowrap;flex:none;margin:6px 0 0;padding:3px 9px;border:1px solid var(--borda);border-radius:999px;background:var(--alerta-fundo);color:var(--alerta);font:600 12px/1.4 inherit;cursor:pointer}
.selo-teste .i{width:14px;height:14px}
.selo-teste:focus-visible{outline:none;box-shadow:var(--foco)}
.menu .selo-teste{margin:0 12px 10px}
.topo .selo-teste{margin:0 0 0 auto}
@media (max-width:1024px) and (min-width:769px){.menu .selo-teste{margin:0 0 12px;width:40px;height:32px;padding:0;justify-content:center}.menu .selo-teste span{display:none}}
.modal.teste-largo{width:min(1100px,calc(100vw - 32px));height:calc(100vh - 32px);max-height:none}
.modal.teste-largo .modal-corpo{flex:1;padding:0;overflow:hidden;display:flex}
.teste-quadro{flex:1;width:100%;height:100%;border:0;background:var(--fundo)}
.teste-pdf{overflow:auto;display:flex;flex-direction:column;align-items:center;gap:16px;padding:16px;background:var(--cinza-claro);min-height:320px}
.modal.teste-largo .teste-pdf{flex:1;min-width:0;align-self:stretch}
.modal-corpo>.teste-pdf{margin:-20px;max-height:70vh}
.teste-pdf canvas{background:#fff;box-shadow:var(--sombra-2);max-width:100%;height:auto}
.teste-pdf .teste-msg{margin:auto;color:var(--texto-suave);text-align:center}
.teste-lista{margin:8px 0 0;padding-left:20px;display:grid;gap:6px}
.teste-confirmar{margin-top:14px;padding:12px 14px;border:1px solid var(--perigo-borda);border-radius:var(--raio);background:var(--perigo-fundo);color:var(--perigo)}
`;

function criarJanela({ titulo, corpo, acoes = [], classe = '', atras = false }) {
  const fundo = document.createElement('div');
  fundo.className = 'modal-fundo teste-janela';
  fundo.innerHTML = `
    <div class="modal ${classe}" role="dialog" aria-modal="true" aria-label="${esc(titulo)}">
      <div class="modal-topo">
        <h3>${esc(titulo)}</h3>
        <button type="button" class="btn btn-fantasma btn-icone btn-p" data-fechar aria-label="Fechar">${icone('x')}</button>
      </div>
      <div class="modal-corpo"></div>
      ${acoes.length ? `<div class="modal-rodape">${acoes.join('')}</div>` : ''}
    </div>`;
  const areaCorpo = fundo.querySelector('.modal-corpo');
  if (typeof corpo === 'string') areaCorpo.innerHTML = corpo;
  else if (corpo) areaCorpo.appendChild(corpo);
  const anterior = document.activeElement;
  const fechar = () => {
    document.removeEventListener('keydown', tecla, true);
    fundo.remove();
    if (anterior && anterior.focus) anterior.focus();
  };
  const tecla = (e) => {
    if (e.key !== 'Escape') return;
    const janelas = document.querySelectorAll('.modal-fundo');
    if (janelas[janelas.length - 1] !== fundo) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    fechar();
  };
  document.addEventListener('keydown', tecla, true);
  fundo.addEventListener('click', (e) => {
    if (e.target === fundo) return fechar();
    const alvo = e.target.closest('[data-fechar]');
    // Um link que fecha a janela fecha depois de o navegador seguir o link.
    if (alvo) setTimeout(fechar, alvo.tagName === 'A' ? 60 : 0);
  });
  // "atras": abre por baixo de uma janela já aberta (ex.: o PDF baixado ao
  // enviar pelo WhatsApp fica atrás do botão que abre a conversa).
  const aberta = atras && document.querySelector('.teste-janela');
  if (aberta) aberta.before(fundo);
  else {
    document.body.appendChild(fundo);
    fundo.querySelector('[data-fechar]').focus();
  }
  return { fundo, corpo: areaCorpo, fechar };
}

function avisar(mensagem, tipo = 'sucesso') {
  const area = document.getElementById('toasts');
  if (!area) return;
  const el = document.createElement('div');
  el.className = `toast ${tipo}`;
  el.innerHTML = `${icone('info')}<div>${esc(mensagem)}</div>`;
  area.appendChild(el);
  const sair = () => el.remove();
  el.addEventListener('click', sair);
  setTimeout(sair, 5200);
}

// --- Capacidade "downloads" do Claude ---------------------------------------------
let downloads;
function usarDownloads() {
  if (downloads === undefined) {
    downloads =
      window.claude && typeof window.claude.use === 'function'
        ? window.claude.use('downloads').catch(() => null)
        : Promise.resolve(null);
  }
  return downloads;
}

// --- PDF na tela (pdf.js) -------------------------------------------------------
let pdfjs = null;
function carregarPdfJs() {
  if (!pdfjs) {
    pdfjs = new Promise((resolver, rejeitar) => {
      const s = document.createElement('script');
      s.src = new URL('teste/pdf.min.js', document.baseURI).href;
      s.onload = () => {
        const lib = window.pdfjsLib;
        if (!lib) return rejeitar(new Error('O visualizador de PDF não carregou.'));
        lib.GlobalWorkerOptions.workerSrc = new URL('teste/pdf.worker.min.js', document.baseURI).href;
        resolver(lib);
      };
      s.onerror = () => rejeitar(new Error('O visualizador de PDF não carregou.'));
      document.head.appendChild(s);
    });
    pdfjs.catch(() => (pdfjs = null));
  }
  return pdfjs;
}

async function desenharPdf(dados, alvo) {
  alvo.innerHTML = '<p class="teste-msg">Montando o PDF…</p>';
  try {
    const lib = await carregarPdfJs();
    const doc = await lib.getDocument({ data: dados.slice(0), isEvalSupported: false }).promise;
    alvo.innerHTML = '';
    const largura = Math.max(320, (alvo.clientWidth || 800) - 32);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    for (let n = 1; n <= doc.numPages; n++) {
      const pagina = await doc.getPage(n);
      const base = pagina.getViewport({ scale: 1 });
      const escala = Math.min(1.6, largura / base.width);
      const vp = pagina.getViewport({ scale: escala * dpr });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      canvas.style.width = `${Math.floor(vp.width / dpr)}px`;
      canvas.setAttribute('aria-label', `Página ${n} de ${doc.numPages}`);
      alvo.appendChild(canvas);
      await pagina.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    }
  } catch (e) {
    console.error(e);
    alvo.innerHTML = `<p class="teste-msg">Não foi possível mostrar o PDF: ${esc(e.message)}</p>`;
  }
}

async function salvarArquivo(teste, endereco) {
  let arq;
  try {
    arq = await teste.arquivoDaApi(endereco);
  } catch (e) {
    avisar(e.message, 'erro');
    return;
  }
  const d = await usarDownloads();
  if (d) {
    try {
      await d.save({ filename: arq.nome, data: new Blob([arq.dados], { type: arq.tipo }) });
      return;
    } catch (e) {
      if (e && e.code === 'declined') return;
      console.warn('downloads.save:', e);
    }
  }
  if (arq.tipo.includes('pdf')) return verPdf(teste, endereco, arq, { atras: true });
  avisar('Nesta visualização do Claude não é possível baixar arquivos. No sistema instalado no computador o download funciona.', 'info');
}

async function verPdf(teste, endereco, pronto, { atras = false } = {}) {
  const area = document.createElement('div');
  area.className = 'teste-pdf';
  const j = criarJanela({
    titulo: 'Orçamento em PDF',
    corpo: area,
    classe: 'teste-largo',
    atras,
    acoes: [
      '<button type="button" class="btn btn-fantasma" data-fechar>Fechar</button>',
      `<button type="button" class="btn btn-primario" data-baixar>${icone('download')}Baixar PDF</button>`,
    ],
  });
  j.fundo.querySelector('[data-baixar]').addEventListener('click', () => salvarArquivo(teste, endereco));
  try {
    const arq = pronto || (await teste.arquivoDaApi(endereco));
    await desenharPdf(arq.dados, area);
  } catch (e) {
    area.innerHTML = `<p class="teste-msg">${esc(e.message)}</p>`;
  }
}

// --- Checklist A4 -----------------------------------------------------------------
function abrirChecklist(href) {
  const consulta = href.includes('?') ? href.slice(href.indexOf('?')) : '';
  const quadro = document.createElement('iframe');
  quadro.className = 'teste-quadro';
  quadro.title = 'Checklist em A4';
  quadro.src = new URL(`imprimir/checklist.html${consulta}`, document.baseURI).href;
  const j = criarJanela({ titulo: 'Checklist em A4', corpo: quadro, classe: 'teste-largo' });
  window.__teste.fecharChecklist = j.fechar;
}

// --- Links para outros sites (WhatsApp) ----------------------------------------------
function abrirLinkExterno(url) {
  let rotulo = 'Abrir em nova aba';
  let texto = 'Dentro do Claude o sistema não abre outras janelas sozinho. Use o botão abaixo para abrir o link.';
  if (/^https:\/\/(wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)\//.test(url)) {
    rotulo = 'Abrir conversa no WhatsApp';
    texto =
      'Dentro do Claude o sistema não abre o WhatsApp sozinho. Use o botão abaixo para abrir a conversa com a mensagem pronta. Se o botão não abrir nada, a visualização do Claude bloqueou o link: no sistema instalado no computador ele abre normalmente.';
  }
  criarJanela({
    titulo: 'Abrir link',
    corpo: `<p>${esc(texto)}</p>`,
    acoes: [
      '<button type="button" class="btn btn-fantasma" data-fechar>Fechar</button>',
      `<a class="btn btn-primario" href="${esc(url)}" target="_blank" rel="noopener noreferrer" data-fechar>${icone('externo')}${esc(rotulo)}</a>`,
    ],
  });
}

// --- Selo "Versão de teste" ----------------------------------------------------------
function explicarVersaoDeTeste(teste) {
  const j = criarJanela({
    titulo: 'Versão de teste dentro do Claude',
    corpo: `
      <p>Este é o mesmo sistema, rodando inteiro neste navegador para você testar. O que você cadastrar fica guardado só aqui${
        teste.semArmazenamento ? ' <b>enquanto esta página estiver aberta</b> (o navegador não permitiu guardar os dados)' : ''
      }.</p>
      <p style="margin-top:12px"><b>Diferenças em relação ao sistema instalado no computador:</b></p>
      <ul class="teste-lista">
        <li>A consulta de CNPJ e o envio por e-mail não funcionam: aqui a página não pode acessar outros sites.</li>
        <li>O orçamento em PDF aparece na tela; para salvar, use <b>Baixar PDF</b> e confirme no Claude.</li>
        <li>O checklist A4 aparece na tela, mas não imprime.</li>
        <li>O WhatsApp abre por um botão, e isso pode ser bloqueado em algumas visualizações do Claude.</li>
      </ul>
      <div class="teste-confirmar oculto" data-confirmacao>Apagar <b>todos</b> os dados de teste deste navegador (clientes, OS, catálogo e configurações)? O sistema volta ao estado inicial.</div>`,
    acoes: [
      '<button type="button" class="btn btn-perigo a-esquerda" data-apagar>Apagar dados de teste</button>',
      '<button type="button" class="btn btn-primario" data-fechar>Entendi</button>',
    ],
  });
  const botao = j.fundo.querySelector('[data-apagar]');
  botao.addEventListener('click', () => {
    const conf = j.fundo.querySelector('[data-confirmacao]');
    if (conf.classList.contains('oculto')) {
      conf.classList.remove('oculto');
      botao.textContent = 'Sim, apagar tudo';
      return;
    }
    botao.disabled = true;
    teste.apagarDadosDeTeste();
  });
}

function colocarSelos(teste) {
  const criar = () => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'selo-teste';
    b.innerHTML = `${icone('info')}<span>Versão de teste</span>`;
    b.title = 'O que muda na versão de teste dentro do Claude';
    b.addEventListener('click', () => explicarVersaoDeTeste(teste));
    return b;
  };
  const marca = document.querySelector('.menu .marca');
  if (marca && !document.querySelector('.menu .selo-teste')) marca.insertAdjacentElement('afterend', criar());
  const topo = document.getElementById('topo');
  if (topo && !topo.querySelector('.selo-teste')) topo.appendChild(criar());
}

// --- Instalação ---------------------------------------------------------------------
function instalarInterface(teste) {
  const estilo = document.createElement('style');
  estilo.textContent = ESTILO;
  document.head.appendChild(estilo);

  // Cliques em links para a API (PDF, backup) e para o checklist.
  document.addEventListener(
    'click',
    (e) => {
      const a = e.target.closest && e.target.closest('a[href]');
      if (!a) return;
      const href = a.getAttribute('href');
      if (href.startsWith('/imprimir/')) {
        e.preventDefault();
        abrirChecklist(href);
      } else if (href.startsWith('/api/')) {
        e.preventDefault();
        const baixar = a.hasAttribute('download') || /[?&]baixar=1/.test(href);
        if (/orcamento\.pdf/.test(href) && !baixar) verPdf(teste, href);
        else salvarArquivo(teste, href);
      }
    },
    true
  );

  // window.open (WhatsApp) não funciona dentro do Claude: mostra o link.
  window.open = (url) => {
    if (url && /^https?:\/\//.test(String(url))) abrirLinkExterno(String(url));
    return null;
  };

  // Pré-visualização do PDF (iframe para a API) e imagens do papel timbrado.
  const trocar = (no) => {
    if (no.nodeType !== 1) return;
    const quadros = no.matches('iframe[src^="/api/"]') ? [no] : no.querySelectorAll('iframe[src^="/api/"]');
    for (const q of quadros) {
      const area = document.createElement('div');
      area.className = `${q.className} teste-pdf`;
      const endereco = q.getAttribute('src');
      q.replaceWith(area);
      teste.arquivoDaApi(endereco).then(
        (arq) => desenharPdf(arq.dados, area),
        (e) => (area.innerHTML = `<p class="teste-msg">${esc(e.message)}</p>`)
      );
    }
    const imgs = no.matches('img[src^="/timbrado/"]') ? [no] : no.querySelectorAll('img[src^="/timbrado/"]');
    for (const img of imgs) trocarImagem(img);
  };
  const trocarImagem = (img) => {
    const m = /^\/timbrado\/([a-z]+)\.png/.exec(img.getAttribute('src') || '');
    if (!m) return;
    img.removeAttribute('src');
    teste.urlImagemTimbrado(m[1]).then((url) => url && (img.src = url));
  };
  new MutationObserver((mudancas) => {
    for (const m of mudancas) {
      if (m.type === 'attributes') {
        if (m.target.matches('img[src^="/timbrado/"]')) trocarImagem(m.target);
      } else m.addedNodes.forEach(trocar);
    }
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => colocarSelos(teste));
  else colocarSelos(teste);

  teste.pronto.catch((e) =>
    criarJanela({
      titulo: 'A versão de teste não abriu',
      corpo: `<p>${esc(e.message)}</p><p style="margin-top:8px">Recarregue a página. Se continuar, avise o Claude na conversa.</p>`,
    })
  );
}

module.exports = { instalarInterface };
