// Guarda o banco e os arquivos da versão de teste no próprio navegador
// (IndexedDB). Se o navegador não permitir, tudo funciona só na memória e
// some ao fechar a página.

const NOME = 'balancas-orcamentos-teste';
const LOJA = 'arquivos';

let conexao = null;
export let disponivel = true;

function abrir() {
  if (conexao) return conexao;
  conexao = new Promise((resolver, rejeitar) => {
    let pedido;
    try {
      pedido = indexedDB.open(NOME, 1);
    } catch (e) {
      rejeitar(e);
      return;
    }
    pedido.onupgradeneeded = () => pedido.result.createObjectStore(LOJA);
    pedido.onsuccess = () => resolver(pedido.result);
    pedido.onerror = () => rejeitar(pedido.error);
    pedido.onblocked = () => rejeitar(new Error('IndexedDB bloqueado'));
  }).catch((e) => {
    disponivel = false;
    console.warn('Armazenamento do navegador indisponível:', e);
    return null;
  });
  return conexao;
}

async function transacao(modo, fn) {
  const banco = await abrir();
  if (!banco) return undefined;
  return new Promise((resolver, rejeitar) => {
    const t = banco.transaction(LOJA, modo);
    const r = fn(t.objectStore(LOJA));
    t.oncomplete = () => resolver(r && 'result' in r ? r.result : undefined);
    t.onerror = () => rejeitar(t.error);
    t.onabort = () => rejeitar(t.error);
  }).catch((e) => {
    console.warn('Falha ao usar o armazenamento do navegador:', e);
    return undefined;
  });
}

export const ler = (chave) => transacao('readonly', (loja) => loja.get(chave));
export const gravar = (chave, valor) => transacao('readwrite', (loja) => loja.put(valor, chave));
export const apagar = (chave) => transacao('readwrite', (loja) => loja.delete(chave));
export const limparTudo = () => transacao('readwrite', (loja) => loja.clear());

export async function lerComPrefixo(prefixo) {
  const banco = await abrir();
  if (!banco) return [];
  return new Promise((resolver) => {
    const saida = [];
    const t = banco.transaction(LOJA, 'readonly');
    const pedido = t.objectStore(LOJA).openCursor();
    pedido.onsuccess = () => {
      const c = pedido.result;
      if (!c) return;
      if (String(c.key).startsWith(prefixo)) saida.push([String(c.key), c.value]);
      c.continue();
    };
    t.oncomplete = () => resolver(saida);
    t.onerror = () => resolver(saida);
  });
}
