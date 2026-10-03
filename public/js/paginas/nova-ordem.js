// Abre uma nova ordem de serviço (opcionalmente já com o cliente escolhido)
// e leva direto para o editor.

import { api } from '../api.js';
import { navegar } from '../app.js';
import { carregandoHTML } from '../ui.js';

export async function montar(el, { query }) {
  el.innerHTML = carregandoHTML('Abrindo nova ordem de serviço…');
  const dados = {};
  if (query.cliente) {
    try {
      const c = await api.get(`/clientes/${Number(query.cliente)}`);
      Object.assign(dados, {
        cliente_id: c.id,
        cliente_nome: c.nome,
        cliente_telefone: c.whatsapp || c.telefone || '',
        cliente_email: c.email || '',
        cliente_documento: c.documento || '',
      });
    } catch {
      /* segue sem cliente */
    }
  }
  const nova = await api.post('/ordens', dados);
  window.dispatchEvent(new Event('ordens-alteradas'));
  navegar(`/ordens/${nova.id}?nova=1`, { substituir: true });
}
