/*
 * Monta o "registro" de memória de cálculo (guardado no histórico e usado pelo demonstrativo).
 * Só organiza dados já calculados pela API e conferidos por CentralRegras: não calcula nada.
 */
(function (root) {
  'use strict';
  const R = root.CentralRegras;
  const m = (n) => R.formatarMoeda(n);
  const mOuTraco = (n) => (n === null || n === undefined ? '—' : R.formatarMoeda(n));

  function profissional() {
    try {
      const d = JSON.parse(root.localStorage.getItem('central_calc_imob_v14') || '{}');
      return { nome: d.advName || '', registro: d.advOab || '' };
    } catch (e) { return { nome: '', registro: '' }; }
  }

  function linhasPorParcela(resumos) {
    return resumos.map((p) => [
      String(p.indice + 1),
      p.competencia ? `${p.descricao} (${p.competencia})` : p.descricao,
      p.vencimento,
      m(p.original),
      p.pagamentos ? m(p.pagamentos) : '—',
      p.naoAtualizado ? 'Não atualizado' : mOuTraco(p.correcao),
      p.naoAtualizado ? 'Não atualizado' : mOuTraco(p.encargos),
      p.naoAtualizado ? 'Não atualizado' : mOuTraco(p.saldo),
    ]);
  }

  function montarAtualizacao(o) {
    const t = o.totais;
    const resumo = [
      ['Valor original', m(t.original)],
      ['Correção monetária', m(t.correcao)],
      ['Juros', m(t.juros)],
      ['Multa', m(t.multa)],
    ];
    if (t.honorarios !== 0) resumo.push(['Honorários', m(t.honorarios)]);
    if (t.encargosNominais !== 0) resumo.push(['Outros encargos (valores informados, sem atualização)', m(t.encargosNominais)]);
    resumo.push(['Pagamentos (valores nominais)', m(t.pagamentos)]);

    const rodape = ['', 'Totais', '', m(t.original), t.pagamentos ? m(t.pagamentos) : '—', m(t.correcao), '', m(t.saldo)];
    const memorias = (o.memorias || []).filter((x) => x.texto);
    return {
      tipo: o.tipo,
      titulo: o.titulo,
      subtitulo: o.subtitulo || '',
      geradoEm: new Date().toISOString(),
      dataReferencia: o.dataFinal,
      profissional: profissional(),
      identificacao: o.identificacao || [],
      criterios: o.criterios || [],
      resumo,
      total: { rotulo: 'Saldo final atualizado', valor: m(t.saldoComEncargos) },
      secoes: [{
        titulo: 'Detalhamento por parcela',
        colunas: ['Nº', 'Descrição', 'Vencimento', 'Valor original', 'Pagamentos', 'Correção monetária', 'Juros, multa e encargos', 'Saldo atualizado'],
        numericas: [3, 4, 5, 6, 7],
        linhas: linhasPorParcela(o.resumosParcelas),
        rodape,
      }],
      memorias,
      alertas: o.alertas || [],
      observacoes: o.observacoes || '',
      fonte: 'API da Debit (debit.com.br), acessada por meio de servidor intermediário seguro',
      calcIdDebit: o.calcIdDebit || null,
      totais: t,
    };
  }

  root.CentralRegistro = { montarAtualizacao, linhasPorParcela, profissional };
})(typeof self !== 'undefined' ? self : this);
