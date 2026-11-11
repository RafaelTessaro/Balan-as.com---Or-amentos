// Substitui o Express na versão de teste: as rotas de src/api.js são
// registradas aqui e atendidas dentro do próprio navegador, sem rede.
// Só o que src/api.js usa: Router().get/post/put/delete/use, req.params/query/
// body e res.status/json/send/setHeader/sendStatus.

function compilar(caminho) {
  const nomes = [];
  const fonte = caminho
    .split('/')
    .map((parte) => {
      if (parte.startsWith(':')) {
        nomes.push(parte.slice(1));
        return '([^/]+)';
      }
      return parte.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return { re: new RegExp(`^${fonte}/?$`), nomes };
}

function criarResposta(resolver) {
  const res = {
    statusCode: 200,
    headers: {},
    terminado: false,
    status(c) {
      res.statusCode = c;
      return res;
    },
    setHeader(nome, v) {
      res.headers[String(nome).toLowerCase()] = String(v);
      return res;
    },
    getHeader(nome) {
      return res.headers[String(nome).toLowerCase()];
    },
    json(dados) {
      if (!res.headers['content-type']) res.headers['content-type'] = 'application/json; charset=utf-8';
      return res.end(JSON.stringify(dados === undefined ? null : dados));
    },
    send(corpo) {
      if (corpo !== null && typeof corpo === 'object' && !(corpo instanceof Uint8Array)) return res.json(corpo);
      if (typeof corpo === 'string' && !res.headers['content-type']) res.headers['content-type'] = 'text/html; charset=utf-8';
      return res.end(corpo);
    },
    sendStatus(c) {
      res.statusCode = c;
      return res.end(String(c));
    },
    end(corpo) {
      if (res.terminado) return res;
      res.terminado = true;
      resolver({ status: res.statusCode, headers: res.headers, corpo: corpo ?? null });
      return res;
    },
  };
  return res;
}

function Router() {
  const camadas = [];
  const registrar = (metodo) => (caminho, ...fns) => {
    camadas.push({ metodo, ...compilar(caminho), fns });
    return router;
  };
  const router = {
    get: registrar('GET'),
    post: registrar('POST'),
    put: registrar('PUT'),
    delete: registrar('DELETE'),
    patch: registrar('PATCH'),
    use(...fns) {
      for (const fn of fns) camadas.push({ metodo: '*', fns: [fn], erro: fn.length === 4 });
      return router;
    },

    // Atende um pedido. Devolve { status, headers, corpo }.
    atender({ metodo, caminho, query = {}, body }) {
      return new Promise((resolver) => {
        const res = criarResposta(resolver);
        const req = { method: metodo, path: caminho, url: caminho, params: {}, query, body, headers: {}, socket: { localPort: 0 } };
        const fila = [];
        for (const c of camadas) {
          if (c.metodo === '*') {
            for (const fn of c.fns) fila.push({ fn, erro: c.erro });
            continue;
          }
          if (c.metodo !== metodo) continue;
          const m = c.re.exec(caminho);
          if (!m) continue;
          const params = {};
          c.nomes.forEach((n, i) => (params[n] = decodeURIComponent(m[i + 1])));
          for (const fn of c.fns) fila.push({ fn, erro: false, params });
        }
        let i = 0;
        const proximo = (erro) => {
          if (res.terminado) return;
          while (i < fila.length) {
            const camada = fila[i++];
            if (Boolean(erro) !== camada.erro) continue;
            if (camada.params) req.params = camada.params;
            try {
              const r = erro ? camada.fn(erro, req, res, proximo) : camada.fn(req, res, proximo);
              if (r && typeof r.catch === 'function') r.catch(proximo);
            } catch (e) {
              proximo(e);
            }
            return;
          }
          if (erro) {
            console.error(erro);
            res.status(500).json({ erro: erro.message || 'Erro inesperado.' });
          } else {
            res.status(404).json({ erro: 'Rota não encontrada.' });
          }
        };
        proximo();
      });
    },
  };
  return router;
}

function express() {
  throw new Error('Na versão de teste só o Router do Express existe.');
}
express.Router = Router;

module.exports = express;
