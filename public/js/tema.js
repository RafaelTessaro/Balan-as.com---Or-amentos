// Tema da interface: claro, escuro ou igual ao sistema (Windows).
// A preferência fica salva neste navegador. O <head> do index.html aplica o
// tema antes de desenhar a página, para não piscar.

const CHAVE = 'tema';
const consulta = window.matchMedia('(prefers-color-scheme: dark)');

export const TEMAS = [
  { id: 'claro', rotulo: 'Claro', icone: 'sun' },
  { id: 'escuro', rotulo: 'Escuro', icone: 'moon' },
  { id: 'sistema', rotulo: 'Igual ao Windows', icone: 'monitor' },
];

export function preferenciaTema() {
  try {
    const t = localStorage.getItem(CHAVE);
    return TEMAS.some((x) => x.id === t) ? t : 'sistema';
  } catch {
    return 'sistema';
  }
}

function resolver(pref) {
  return pref === 'escuro' || (pref === 'sistema' && consulta.matches) ? 'escuro' : 'claro';
}

export function aplicarTema(pref = preferenciaTema()) {
  const raiz = document.documentElement;
  raiz.dataset.tema = resolver(pref);
  raiz.dataset.temaPreferido = pref;
  // Cor da barra de título da janela do aplicativo (Edge/Chrome em modo app).
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = raiz.dataset.tema === 'escuro' ? '#131615' : '#f3f5f4';
  window.dispatchEvent(new CustomEvent('tema-alterado', { detail: { preferido: pref, tema: raiz.dataset.tema } }));
}

export function definirTema(pref) {
  try {
    localStorage.setItem(CHAVE, pref);
  } catch {
    /* navegador sem armazenamento: vale só nesta sessão */
  }
  aplicarTema(pref);
}

// Acompanha a troca de tema do Windows quando a opção é "Igual ao Windows".
consulta.addEventListener('change', () => {
  if (preferenciaTema() === 'sistema') aplicarTema('sistema');
});
