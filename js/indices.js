/*
 * Carrega a tabela de índices de correção (dados/indices.json) e entrega ao motor de cálculo.
 * A tabela é gerada pelo robô do GitHub (scripts/atualizar-indices.js) a partir das séries do Banco Central.
 * Estado em window.CentralIndicesEstado; o evento "central-indices" avisa a interface quando muda.
 */
(function (root) {
  'use strict';
  const estado = { status: 'carregando', atualizadoEm: null, erro: null };
  root.CentralIndicesEstado = estado;
  const avisar = () => root.dispatchEvent(new CustomEvent('central-indices', { detail: { ...estado } }));

  fetch('dados/indices.json', { cache: 'no-cache' })
    .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then((dados) => {
      const temSeries = dados && dados.series && Object.keys(dados.series).length > 0;
      if (temSeries) root.CentralCalculo.definirIndices(dados);
      estado.status = temSeries ? 'ok' : 'vazio';
      estado.atualizadoEm = dados ? dados.atualizadoEm : null;
      avisar();
    })
    .catch((e) => { estado.status = 'erro'; estado.erro = String(e && e.message ? e.message : e); avisar(); });
})(window);
