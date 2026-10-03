// Comunicação com o servidor local.

async function requisicao(metodo, url, corpo) {
  const opcoes = { method: metodo, headers: {} };
  if (corpo !== undefined) {
    opcoes.headers['Content-Type'] = 'application/json';
    opcoes.body = JSON.stringify(corpo);
  }
  let resp;
  try {
    resp = await fetch(`/api${url}`, opcoes);
  } catch {
    throw new Error('Sem conexão com o sistema. Verifique se a janela do servidor está aberta.');
  }
  const tipo = resp.headers.get('content-type') || '';
  const dados = tipo.includes('application/json') ? await resp.json() : await resp.text();
  if (!resp.ok) {
    const msg = (dados && dados.erro) || `Erro ${resp.status}`;
    throw Object.assign(new Error(msg), { status: resp.status });
  }
  return dados;
}

export const api = {
  get: (url) => requisicao('GET', url),
  post: (url, corpo = {}) => requisicao('POST', url, corpo),
  put: (url, corpo = {}) => requisicao('PUT', url, corpo),
  del: (url) => requisicao('DELETE', url),
};

// Configuração em cache (recarregada após salvar em Configurações).
let configCache = null;
export async function obterConfig(forcar = false) {
  if (!configCache || forcar) configCache = await api.get('/config');
  return configCache;
}
export function definirConfig(cfg) {
  configCache = cfg;
}
