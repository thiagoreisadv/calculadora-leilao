/*
 * Monta o "registro" de memória de cálculo (guardado no histórico e usado pelo demonstrativo).
 * Só organiza resultados já calculados pelo motor local (CentralCalculo): não calcula nada.
 */
(function (root) {
  'use strict';
  const R = root.CentralRegras;
  const m = (n) => R.formatarMoeda(n);

  function profissional() {
    try {
      const d = JSON.parse(root.localStorage.getItem('central_calc_imob_v14') || '{}');
      return { nome: d.advName || '', registro: d.advOab || '' };
    } catch (e) { return { nome: '', registro: '' }; }
  }

  function textoCorrecao(c) {
    if (c.modo === 'percentual') return `${R.formatarPercentual(c.percentual)} → ${m(c.valorCorrecao)}`;
    if (c.modo === 'valorCorrigido') return `Valor informado (${m(c.valorCorrecao)})`;
    return 'Sem correção';
  }

  /*
   * o = { tipo, titulo, subtitulo, identificacao, criterios, parcelas:[{descricao, competencia, vencimento}],
   *       resultados:[saída de calcularParcela], totais, dataFinal, alertas, observacoes, notasResumo }
   */
  function montarCalculo(o) {
    const t = o.totais;
    const comHonorarios = t.honorarios !== 0;
    const resumo = [
      ['Valor original', m(t.original)],
      ['Correção monetária (informada manualmente pelo usuário)', m(t.correcao)],
      ['Principal corrigido', m(t.principalCorrigido)],
      ['Juros', m(t.juros)],
      ['Multa', m(t.multa)],
    ];
    if (comHonorarios) resumo.push(['Honorários', m(t.honorarios)]);
    if (t.encargosNominais !== 0) resumo.push(['Outros encargos (valores informados, sem atualização)', m(t.encargosNominais)]);
    resumo.push(['Pagamentos', t.pagamentos ? `-${m(t.pagamentos)}` : m(0)]);
    if (t.creditoNaoImputado !== 0) resumo.push(['Excedente de pagamentos (não imputado)', m(t.creditoNaoImputado)]);

    const colunas = ['Nº', 'Descrição', 'Vencimento', 'Valor original', 'Correção monetária (informada)', 'Principal corrigido', 'Juros', 'Multa'];
    if (comHonorarios) colunas.push('Honorários');
    colunas.push('Pagamentos', 'Saldo atualizado');
    const linhas = o.resultados.map((r, i) => {
      const p = o.parcelas[i];
      const base = [String(i + 1), p.competencia ? `${p.descricao} (${p.competencia})` : p.descricao, p.vencimento, m(r.original), textoCorrecao(r.correcao), m(r.principalCorrigido), m(r.juros), m(r.multa)];
      if (comHonorarios) base.push(m(r.honorarios));
      base.push(r.pagamentos ? `-${m(r.pagamentos)}` : '—', m(r.saldo));
      return base;
    });
    const numericas = colunas.map((c, i) => (i >= 3 && i !== 4 ? i : -1)).filter((i) => i >= 0);
    const rodape = ['', 'Totais', '', m(t.original), m(t.correcao), m(t.principalCorrigido), m(t.juros), m(t.multa)];
    if (comHonorarios) rodape.push(m(t.honorarios - t.honorariosFixos));
    rodape.push(t.pagamentos ? `-${m(t.pagamentos)}` : '—', m(t.saldo));

    const secoes = [{ titulo: 'Detalhamento por parcela', colunas, numericas, linhas, rodape }];
    const notaTotal = [];
    if (t.honorariosFixos) notaTotal.push(`honorários de valor fixo (${m(t.honorariosFixos)})`);
    if (t.encargosNominais) notaTotal.push(`outros encargos informados (${m(t.encargosNominais)})`);

    return {
      tipo: o.tipo,
      titulo: o.titulo,
      subtitulo: o.subtitulo || '',
      geradoEm: new Date().toISOString(),
      dataReferencia: o.dataFinal,
      profissional: profissional(),
      identificacao: o.identificacao || [],
      criterios: o.criterios || [],
      resumo: resumo.concat(o.notasResumo || []),
      total: { rotulo: 'Saldo final atualizado', valor: m(t.saldoFinal) },
      secoes,
      memorias: o.resultados.map((r, i) => ({ rotulo: `${o.parcelas[i].descricao}${o.parcelas[i].competencia ? ` (${o.parcelas[i].competencia})` : ''} — vencimento ${o.parcelas[i].vencimento}`, texto: r.memoria.join('\n') })),
      alertas: o.alertas || [],
      observacoes: [o.observacoes, notaTotal.length ? `O saldo final inclui, além do total das parcelas: ${notaTotal.join(' e ')}.` : ''].filter(Boolean).join('\n'),
      fonte: 'Cálculo realizado localmente neste navegador, com a correção monetária e os critérios informados pelo usuário (nenhum índice ou API foi consultado)',
      totais: t,
    };
  }

  root.CentralRegistro = { montarCalculo, profissional, textoCorrecao };
})(typeof self !== 'undefined' ? self : this);
