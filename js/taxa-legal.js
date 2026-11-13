/*
 * Carrega a tabela da taxa legal (dados/taxa-legal.json) e entrega ao motor de cálculo.
 * A tabela é gerada pelo segundo robô do GitHub (scripts/atualizar-taxa-legal.js), separado do robô de índices.
 * Estado em window.CentralTaxaLegalEstado; o evento "central-taxa-legal" avisa a interface quando muda.
 */
(function (root) {
  'use strict';
  const estado = { status: 'carregando', atualizadoEm: null, erro: null };
  root.CentralTaxaLegalEstado = estado;
  const avisar = () => root.dispatchEvent(new CustomEvent('central-taxa-legal', { detail: { ...estado } }));

  fetch('dados/taxa-legal.json', { cache: 'no-cache' })
    .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then((dados) => {
      const ok = dados && dados.taxas && Object.keys(dados.taxas).length > 0;
      if (ok) root.CentralCalculo.definirTaxaLegal(dados);
      estado.status = ok ? 'ok' : 'vazio';
      estado.atualizadoEm = dados ? dados.atualizadoEm : null;
      avisar();
    })
    .catch((e) => { estado.status = 'erro'; estado.erro = String(e && e.message ? e.message : e); avisar(); });
})(window);
