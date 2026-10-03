// Preenche os modelos de mensagem ({cliente}, {numero}, ...) usados no
// e-mail e no WhatsApp, e monta o nome do arquivo PDF.

const moeda = (v) =>
  (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/ /g, ' ');

function variaveis(ordem, cfg) {
  return {
    cliente: ordem.cliente_nome || 'cliente',
    numero: String(ordem.numero),
    equipamento: ordem.equipamento || 'informado',
    total: moeda(ordem.totais.total),
    validade: String(ordem.validade_dias),
    empresa: cfg.empresa.nome,
    telefone: cfg.empresa.whatsapp || cfg.empresa.telefone,
    tecnico: ordem.tecnico || '',
  };
}

function preencher(modelo, ordem, cfg) {
  const vars = variaveis(ordem, cfg);
  return String(modelo || '').replace(/\{(\w+)\}/g, (m, chave) => (chave in vars ? vars[chave] : m));
}

function nomeArquivoPdf(ordem) {
  const cliente = (ordem.cliente_nome || 'Cliente')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  return `Orcamento ${ordem.numero} - ${cliente}.pdf`;
}

// Converte um telefone brasileiro para o formato do link wa.me (55 + DDD + número).
function telefoneWhatsapp(tel) {
  let d = String(tel || '').replace(/\D/g, '');
  if (!d) return '';
  d = d.replace(/^0+/, '');
  if (d.length === 10 || d.length === 11) d = '55' + d;
  return d;
}

module.exports = { moeda, preencher, nomeArquivoPdf, telefoneWhatsapp };
