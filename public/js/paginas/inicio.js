// Painel inicial: indicadores, andamento das OS e atalhos.

import { api } from '../api.js';
import { navegar } from '../app.js';
import {
  esc,
  icone,
  moeda,
  tempoRelativo,
  seloStatus,
  STATUS_ROTULO,
  definirTitulo,
  vazioHTML,
} from '../ui.js';

const COR_PONTO = {
  em_analise: 'var(--info)',
  aguardando_aprovacao: '#d08700',
  aprovada: 'var(--verde)',
  aguardando_peca: 'var(--roxo)',
  concluida: 'var(--verde-escuro)',
  entregue: 'var(--cinza-marca)',
  recusada: 'var(--perigo)',
};

function saudacao() {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

export async function montar(el) {
  definirTitulo('Início');
  const r = await api.get('/resumo');
  const p = r.porStatus;
  const andamento = p.em_analise + p.aprovada + p.aguardando_peca;
  const dataLonga = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const hojeTexto = dataLonga.charAt(0).toUpperCase() + dataLonga.slice(1);
  const mes = new Date().toLocaleDateString('pt-BR', { month: 'long' });

  const indicador = (ic, rotulo, valor, rodape, cor = '') => `
    <div class="cartao indicador">
      <div class="rotulo-ind"><span class="icone-redondo" ${cor}>${icone(ic)}</span>${esc(rotulo)}</div>
      <div class="valor-ind">${valor}</div>
      <div class="rodape-ind">${rodape}</div>
    </div>`;

  const recentes = r.recentes.length
    ? `<div class="tabela-envolve"><table class="tabela clicavel lista-ordens">
        <thead><tr><th>Nº</th><th>Cliente / equipamento</th><th>Situação</th><th class="valor">Total</th></tr></thead>
        <tbody>${r.recentes
          .map(
            (o) => `<tr data-id="${o.id}">
              <td class="num-os">${o.numero_os ? esc(o.numero_os) : '<span class="texto-fraco" title="Nº da OS ainda não informado">—</span>'}</td>
              <td><span class="destaque">${esc(o.cliente_nome || 'Cliente não informado')}</span><span class="secundario">${esc(
                o.equipamento || '—'
              )} · ${esc(tempoRelativo(o.atualizado_em))}</span></td>
              <td>${seloStatus(o.status)}</td>
              <td class="valor destaque">${moeda(o.total)}</td>
            </tr>`
          )
          .join('')}</tbody></table></div>`
    : vazioHTML({
        icone: 'clipboard-list',
        titulo: 'Nenhuma ordem de serviço ainda',
        texto: 'Comece abrindo uma OS quando a balança chegar na oficina.',
        acao: `<a class="btn btn-primario" href="#/ordens/nova">${icone('plus')}Abrir primeira OS</a>`,
      });

  const passos = [
    ['Checklist de entrada', 'Identifique a balança, os acessórios e marque C, NC ou N/A.'],
    ['Serviços e peças', 'Busque no catálogo ou cadastre na hora, com quantidade e valor.'],
    ['Orçamento em PDF', 'O sistema monta o orçamento no papel timbrado da empresa.'],
    ['Envio ao cliente', 'Mande por WhatsApp ou e-mail e acompanhe a aprovação.'],
  ];

  el.innerHTML = `
    <div class="saudacao">
      <div>
        <h1>${saudacao()}!</h1>
        <p class="data-hoje">${esc(hojeTexto)}</p>
      </div>
      <div class="grupo-botoes">
        <a class="btn" href="/imprimir/checklist?branco=1" target="_blank" rel="noopener">${icone('printer')}Checklist em branco</a>
        <a class="btn btn-primario btn-g" href="#/ordens/nova">${icone('plus')}Nova ordem de serviço</a>
      </div>
    </div>

    <div class="indicadores">
      ${indicador('wrench', 'Em andamento', andamento, 'em análise, aprovadas ou aguardando peça')}
      ${indicador('clock', 'Aguardando aprovação', p.aguardando_aprovacao, 'orçamentos enviados sem resposta', 'style="background:var(--alerta-fundo);color:var(--alerta)"')}
      ${indicador('receipt', `Orçado em ${mes}`, moeda(r.orcadoMes), `${r.abertasMes} ${r.abertasMes === 1 ? 'OS aberta' : 'OS abertas'} no mês`)}
      ${indicador('badge-check', `Aprovado em ${mes}`, moeda(r.aprovadoMes), 'aprovadas, em execução ou entregues')}
    </div>

    <div class="cartao" style="margin-top:20px">
      <div class="cartao-topo"><div class="titulo"><h3>Andamento das ordens de serviço</h3></div><a href="#/ordens" class="btn btn-fantasma btn-p">Ver todas${icone('arrow-right', 'i-s')}</a></div>
      <div class="fluxo">
        ${Object.entries(STATUS_ROTULO)
          .map(
            ([s]) =>
              `<a href="#/ordens?status=${s}" class="${p[s] ? '' : 'zero'}"><span class="n">${p[s]}</span><span class="rotulo-fluxo"><span class="ponto" style="background:${COR_PONTO[s]}"></span>${esc(STATUS_ROTULO[s])}</span></a>`
          )
          .join('')}
      </div>
    </div>

    <div class="painel-grade">
      <div class="cartao">
        <div class="cartao-topo"><div class="titulo"><h3>Últimas ordens de serviço</h3></div></div>
        <div id="recentes">${recentes}</div>
      </div>
      <div class="pilha">
        <div class="acoes-rapidas">
          <a class="acao-rapida" href="#/ordens/nova"><span class="icone-redondo">${icone('clipboard-list')}</span><span><strong>Nova OS</strong><small>Checklist de entrada da balança</small></span>${icone('chevron-right')}</a>
          <a class="acao-rapida" href="#/pecas"><span class="icone-redondo">${icone('package')}</span><span><strong>Catálogo de peças</strong><small>Preços e datas de atualização</small></span>${icone('chevron-right')}</a>
          <a class="acao-rapida" href="#/servicos"><span class="icone-redondo">${icone('wrench')}</span><span><strong>Catálogo de serviços</strong><small>Valores padrão de mão de obra</small></span>${icone('chevron-right')}</a>
          <a class="acao-rapida" href="#/clientes"><span class="icone-redondo">${icone('users')}</span><span><strong>Clientes</strong><small>Contatos para envio do orçamento</small></span>${icone('chevron-right')}</a>
        </div>
      </div>
    </div>

    ${
      r.totalOrdens < 3
        ? `<div class="cartao" style="margin-top:20px"><div class="cartao-topo"><div class="titulo"><h3>Como funciona</h3></div></div>
            <div class="cartao-corpo passos-como">${passos
              .map(
                ([t, d], i) =>
                  `<div class="passo-como"><span class="passo">${i + 1}</span><div><strong>${esc(t)}</strong><p>${esc(d)}</p></div></div>`
              )
              .join('')}</div></div>`
        : ''
    }`;

  el.addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (tr) navegar(`/ordens/${tr.dataset.id}`);
  });
  return {};
}
