// Consulta de CNPJ em APIs públicas e gratuitas, com alternativas caso uma
// esteja fora do ar ou limite o uso. Devolve só o que o cadastro usa:
// razão social, nome fantasia e cidade ("Município - UF").

const TEMPO_LIMITE = 8000;
const cache = new Map();

function limpar(v) {
  return String(v || '')
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '');
}

// Mesmo algoritmo de public/js/documentos.js (aceita o CNPJ alfanumérico).
function validarCNPJ(v) {
  const c = limpar(v);
  if (!/^[0-9A-Z]{12}\d{2}$/.test(c) || /^(.)\1{13}$/.test(c)) return false;
  const dv = (n) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let soma = 0;
    for (let i = 0; i < n; i++) soma += (c.charCodeAt(i) - 48) * pesos[i];
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(c[12]) && dv(13) === Number(c[13]);
}

const MINUSCULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', "d'"]);

// "RIO CLARO" → "Rio Claro"; "SAO JOAO DA BOA VISTA" → "Sao Joao da Boa Vista"
function tituloCidade(t) {
  return String(t || '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((p, i) => (i > 0 && MINUSCULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(' ');
}

const cidade = (municipio, uf) => [tituloCidade(municipio), String(uf || '').toUpperCase()].filter(Boolean).join(' - ');

async function obterJson(url) {
  const r = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'BalancasOrcamentos/1.0' },
    signal: AbortSignal.timeout(TEMPO_LIMITE),
  });
  if (r.status === 404) return { naoEncontrado: true };
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

const FONTES = [
  {
    nome: 'BrasilAPI',
    url: (c) => `https://brasilapi.com.br/api/cnpj/v1/${c}`,
    ler: (d) => ({
      razao_social: d.razao_social,
      nome_fantasia: d.nome_fantasia,
      cidade: cidade(d.municipio, d.uf),
      situacao: d.descricao_situacao_cadastral,
    }),
  },
  {
    nome: 'CNPJá',
    url: (c) => `https://open.cnpja.com/office/${c}`,
    ler: (d) => ({
      razao_social: d.company?.name,
      nome_fantasia: d.alias,
      cidade: cidade(d.address?.city, d.address?.state),
      situacao: d.status?.text,
    }),
  },
  {
    nome: 'Minha Receita',
    url: (c) => `https://minhareceita.org/${c}`,
    ler: (d) => ({
      razao_social: d.razao_social,
      nome_fantasia: d.nome_fantasia,
      cidade: cidade(d.municipio, d.uf),
      situacao: d.descricao_situacao_cadastral,
    }),
  },
  {
    nome: 'ReceitaWS',
    url: (c) => `https://receitaws.com.br/v1/cnpj/${c}`,
    ler: (d) =>
      d.status === 'ERROR'
        ? { naoEncontrado: true }
        : { razao_social: d.nome, nome_fantasia: d.fantasia, cidade: cidade(d.municipio, d.uf), situacao: d.situacao },
  },
];

async function consultarCNPJ(valor) {
  const cnpj = limpar(valor);
  if (!validarCNPJ(cnpj)) {
    throw Object.assign(new Error('CNPJ inválido. Confira os números digitados.'), { status: 400 });
  }
  if (cache.has(cnpj)) return cache.get(cnpj);

  let naoEncontrado = 0;
  const falhas = [];
  for (const fonte of FONTES) {
    try {
      const bruto = await obterJson(fonte.url(cnpj));
      const d = bruto.naoEncontrado ? bruto : fonte.ler(bruto);
      if (d.naoEncontrado || !d.razao_social) {
        naoEncontrado++;
        continue;
      }
      const r = {
        cnpj,
        razao_social: String(d.razao_social).trim(),
        nome_fantasia: String(d.nome_fantasia || '').trim(),
        cidade: d.cidade || '',
        situacao: String(d.situacao || '').trim(),
        fonte: fonte.nome,
      };
      cache.set(cnpj, r);
      return r;
    } catch (e) {
      falhas.push(`${fonte.nome}: ${e.message}`);
    }
  }
  if (naoEncontrado && !falhas.length) {
    throw Object.assign(new Error('CNPJ não encontrado na Receita Federal.'), { status: 404 });
  }
  console.warn('Consulta de CNPJ falhou:', falhas.join(' | '));
  throw Object.assign(
    new Error('Não foi possível consultar o CNPJ agora (verifique a internet). Preencha o nome e a cidade manualmente.'),
    { status: 502 }
  );
}

module.exports = { consultarCNPJ, validarCNPJ, tituloCidade };
