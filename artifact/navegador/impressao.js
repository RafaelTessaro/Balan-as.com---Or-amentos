// Página do checklist A4 dentro da versão de teste: ela abre num quadro sobre
// o sistema e usa o banco da página principal. Dentro do Claude não há como
// imprimir, então o botão Imprimir dá lugar a um aviso.
(function () {
  var teste = null;
  try {
    teste = window.parent !== window ? window.parent.__teste : null;
  } catch (e) {
    teste = null;
  }
  if (teste) {
    var original = window.fetch.bind(window);
    window.fetch = function (entrada, opcoes) {
      return typeof entrada === 'string' && /^\/api\//.test(entrada) ? teste.fetch(entrada, opcoes) : original(entrada, opcoes);
    };
    window.close = function () {
      if (teste.fecharChecklist) teste.fecharChecklist();
    };
  }
  window.print = function () {};
  document.addEventListener('DOMContentLoaded', function () {
    var info = document.querySelector('.barra-info span');
    if (info) info.textContent = 'Na versão de teste dentro do Claude a impressão não funciona: aqui você confere como a folha A4 fica.';
    var imprimir = document.getElementById('btn-imprimir');
    if (imprimir) imprimir.style.display = 'none';
  });
})();
