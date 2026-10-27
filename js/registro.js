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
      planilha: o,
    };
  }


  // ---------- Planilha de cálculo (.xlsx) ----------
  // Monta a planilha a partir dos mesmos dados numéricos do cálculo. As colunas de correção, principal
  // corrigido, saldo e os totais são fórmulas do Excel (com o valor já calculado guardado), para que o
  // usuário possa conferir e editar; juros, multa e honorários vão como valores calculados pelo sistema.
  function montarPlanilha(o) {
    const X = root.CentralXlsx;
    const { T, N, F } = X;
    const t = o.totais;
    const prof = profissional();
    const geradoEm = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    const linhas = [];
    linhas.push([T(o.titulo, 'titulo')]);
    if (o.subtitulo) linhas.push([T(o.subtitulo, 'rotulo')]);
    linhas.push([T('Data de referência do cálculo:', 'rotulo'), T(o.dataFinal)]);
    linhas.push([T('Gerado em:', 'rotulo'), T(geradoEm)]);
    if (prof.nome) linhas.push([T('Profissional:', 'rotulo'), T(`${prof.nome}${prof.registro ? ` — ${prof.registro}` : ''}`)]);
    (o.identificacao || []).filter((p) => p[1] && String(p[1]).trim()).forEach((p) => linhas.push([T(`${p[0]}:`, 'rotulo'), T(p[1])]));
    linhas.push([]);
    const cab = ['Nº', 'Descrição', 'Vencimento', 'Valor original', 'Correção informada (%)', 'Correção monetária (R$)', 'Principal corrigido', 'Juros', 'Multa', 'Honorários', 'Pagamentos', 'Excedente de pagamentos (não imputado)', 'Saldo atualizado'];
    linhas.push(cab.map((c) => T(c, 'cabecalho')));
    const primeira = linhas.length + 1;
    o.resultados.forEach((r, i) => {
      const n = linhas.length + 1;
      const p = o.parcelas[i];
      const c = r.correcao;
      linhas.push([
        N(i + 1),
        T(p.competencia ? `${p.descricao} (${p.competencia})` : p.descricao),
        T(p.vencimento),
        N(r.original, 'moeda'),
        c.modo === 'percentual' ? N(c.percentual / 100, 'percentual') : T(c.modo === 'valorCorrigido' ? 'valor informado' : '—'),
        c.modo === 'percentual' ? F(`ROUND(D${n}*E${n},2)`, c.valorCorrecao, 'moeda') : N(c.valorCorrecao, 'moeda'),
        F(`D${n}+F${n}`, r.principalCorrigido, 'moeda'),
        N(r.juros, 'moeda'), N(r.multa, 'moeda'), N(r.honorarios, 'moeda'), N(r.pagamentos, 'moeda'), N(r.creditoNaoImputado, 'moeda'),
        F(`G${n}+H${n}+I${n}+J${n}-K${n}+L${n}`, r.saldo, 'moeda'),
      ]);
    });
    const ultima = linhas.length;
    const soma = (col, v) => F(`SUM(${col}${primeira}:${col}${ultima})`, v, 'totalMoeda');
    const linhaTotal = linhas.length + 1;
    linhas.push([T('', 'totalTexto'), T('Totais', 'totalTexto'), T('', 'totalTexto'), soma('D', t.original), T('', 'totalTexto'), soma('F', t.correcao), soma('G', t.principalCorrigido), soma('H', t.juros), soma('I', t.multa), soma('J', t.honorarios - (t.honorariosFixos || 0)), soma('K', t.pagamentos), soma('L', t.creditoNaoImputado), soma('M', t.saldo)]);
    linhas.push([]);
    let refExtras = [];
    if (t.honorariosFixos) { linhas.push([T('', 'padrao'), T('Honorários de valor fixo (somados uma única vez)', 'rotulo'), T(''), N(t.honorariosFixos, 'moeda')]); refExtras.push(`D${linhas.length}`); }
    if (t.encargosNominais) { linhas.push([T(''), T('Outros encargos (valores informados, sem atualização)', 'rotulo'), T(''), N(t.encargosNominais, 'moeda')]); refExtras.push(`D${linhas.length}`); }
    linhas.push([T(''), T('SALDO FINAL ATUALIZADO', 'rotulo'), T(''), F(['M' + linhaTotal].concat(refExtras).join('+'), t.saldoFinal, 'destaque')]);
    if ((o.linhasExtras || []).length) { linhas.push([]); (o.linhasExtras || []).forEach((e) => linhas.push([T(''), T(e[0], 'rotulo'), T(''), N(e[1], 'moeda')])); }
    linhas.push([]);
    linhas.push([T('A correção monetária foi informada manualmente pelo usuário (percentual acumulado ou valor já corrigido) e aplicada uma única vez; não foi calculada por índice oficial nem por consulta automática.', 'nota')]);
    linhas.push([T('Saldo atualizado = principal corrigido + juros + multa + honorários − pagamentos + excedente não imputado. Veja a aba "Memória" para o passo a passo e a aba "Critérios" para os parâmetros.', 'nota')]);

    const memoria = [[T('Parcela', 'cabecalho'), T('Passo', 'cabecalho'), T('Descrição do cálculo', 'cabecalho')]];
    o.resultados.forEach((r, i) => {
      const p = o.parcelas[i];
      r.memoria.forEach((m, k) => memoria.push([T(`${i + 1} — ${p.descricao}${p.competencia ? ` (${p.competencia})` : ''}`, 'texto'), N(k + 1), T(m, 'texto')]));
    });

    const criterios = [[T('Critério', 'cabecalho'), T('Descrição', 'cabecalho')]];
    (o.criterios || []).forEach((c) => criterios.push([T(c[0], 'rotulo'), T(c[1], 'texto')]));
    if (o.observacoes) criterios.push([T('Observações', 'rotulo'), T(o.observacoes, 'texto')]);

    return { abas: [
      { nome: 'Cálculo', larguras: [6, 34, 13, 16, 14, 16, 16, 14, 14, 14, 14, 18, 18], linhas },
      { nome: 'Memória', larguras: [34, 8, 110], linhas: memoria },
      { nome: 'Critérios', larguras: [34, 110], linhas: criterios },
    ] };
  }


  // Montador simples para planilhas de poucas colunas (calculadoras de leilão e escritura):
  // coluna A de recuo, B rótulo, C valor, D observação. Devolve o número da linha de cada item,
  // para que totais e resultados possam ser fórmulas do Excel.
  function montador() {
    const { T, N, F } = root.CentralXlsx;
    const linhas = [];
    const api = {
      linhas,
      titulo(t) { linhas.push([T(t, 'titulo')]); },
      par(k, v) { if (v !== undefined && v !== null && String(v).trim() !== '') linhas.push([T(''), T(`${k}:`, 'rotulo'), T(v)]); },
      vazio() { linhas.push([]); },
      secao(t) { linhas.push([T(''), T(t, 'cabecalho'), T('Valor', 'cabecalho'), T('Observação', 'cabecalho')]); },
      item(rotulo, valor, estilo, obs) { linhas.push([T(''), T(rotulo), N(valor, estilo || 'moeda'), T(obs || '')]); return linhas.length; },
      texto(rotulo, valor, obs) { linhas.push([T(''), T(rotulo), T(valor), T(obs || '')]); return linhas.length; },
      formula(rotulo, f, cache, estilo, obs) { linhas.push([T(''), T(rotulo, 'rotulo'), F(f, cache, estilo || 'totalMoeda'), T(obs || '')]); return linhas.length; },
      nota(t) { linhas.push([T(''), T(t, 'nota')]); },
    };
    return api;
  }

  function cabecalhoPlanilha(m, titulo, pares, dataRef) {
    const prof = profissional();
    m.titulo(titulo);
    m.par('Data de referência', dataRef || new Date().toLocaleDateString('pt-BR'));
    m.par('Gerado em', new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }));
    if (prof.nome) m.par('Profissional', `${prof.nome}${prof.registro ? ` — ${prof.registro}` : ''}`);
    (pares || []).forEach((p) => m.par(p[0], p[1]));
    m.vazio();
  }

  // Baixa a planilha de uma calculadora que não usa o modelo por parcelas (leilão, escritura).
  function baixarPlanilhaSimples(montadorLinhas, abaNome, criterios, nomeBase) {
    const X = root.CentralXlsx;
    const abas = [{ nome: abaNome, larguras: [3, 52, 20, 46], linhas: montadorLinhas }];
    if (criterios && criterios.length) {
      abas.push({ nome: 'Critérios', larguras: [40, 100], linhas: [[X.T('Critério', 'cabecalho'), X.T('Descrição', 'cabecalho')]].concat(criterios.map((c) => [X.T(c[0], 'rotulo'), X.T(c[1], 'texto')])) });
    }
    const nome = `${String(nomeBase || 'calculo').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'calculo'}-planilha.xlsx`;
    return { bytes: X.gerar({ abas }), nome };
  }


  // ---------- PDF ----------
  const dataHora = () => new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

  // PDF do demonstrativo completo a partir de um registro (saída de montarCalculo).
  function pdfDeRegistro(reg) {
    const doc = root.CentralPdf.criar({ orientacao: 'paisagem', titulo: reg.titulo, rodape: `${reg.titulo} — gerado em ${dataHora()}` });
    doc.titulo(reg.titulo);
    if (reg.subtitulo) doc.subtitulo(reg.subtitulo);
    (reg.alertas || []).forEach((a) => doc.alerta(a.mensagem));
    doc.secao('Identificação');
    const prof = reg.profissional && reg.profissional.nome ? `${reg.profissional.nome}${reg.profissional.registro ? ` — ${reg.profissional.registro}` : ''}` : '';
    [...(reg.identificacao || []), ['Data de referência do cálculo', reg.dataReferencia], ['Gerado em', dataHora()], ['Profissional', prof]]
      .filter((p) => p[1] && String(p[1]).trim()).forEach((p) => doc.par(p[0], p[1]));
    if (reg.criterios && reg.criterios.length) { doc.secao('Critérios de cálculo utilizados'); reg.criterios.forEach((p) => doc.par(p[0], p[1])); }
    if (reg.resumo && reg.resumo.length) { doc.secao('Discriminação dos valores'); reg.resumo.forEach((p) => doc.par(p[0], p[1])); }
    if (reg.total) doc.destaque(reg.total.rotulo, reg.total.valor);
    (reg.secoes || []).forEach((sec) => {
      doc.secao(sec.titulo);
      const nums = new Set(sec.numericas || []);
      doc.tabela({
        colunas: sec.colunas.map((c, i) => ({ titulo: c, peso: i === 0 ? 0.5 : (/^Descri/.test(c) ? 2.2 : (/Vencimento|Compet/.test(c) ? 1.1 : 1.3)), alinhar: nums.has(i) ? 'd' : 'e' })),
        linhas: sec.linhas, rodape: sec.rodape,
      });
    });
    const memorias = (reg.memorias || []).filter((x) => x.texto);
    if (memorias.length) {
      doc.secao('Memória de cálculo');
      memorias.forEach((x) => { doc.paragrafo(x.rotulo, { cor: '0.078 0.141 0.227' }); doc.lista(String(x.texto).split('\n')); doc.espaco(4); });
    }
    if (reg.observacoes) { doc.secao('Observações'); doc.paragrafo(reg.observacoes); }
    doc.espaco(8);
    doc.paragrafo(`Fonte dos dados: ${reg.fonte || ''}.`, { tam: 7.5, cor: '0.392 0.455 0.545' });
    return doc.gerar();
  }

  // PDF das calculadoras de leilão e escritura, a partir das linhas do montador de planilha.
  function pdfDeLinhasSimples(linhas, criterios, titulo) {
    const R = root.CentralRegras;
    const doc = root.CentralPdf.criar({ orientacao: 'retrato', titulo: titulo || 'Cálculo', rodape: `${titulo || 'Cálculo'} — gerado em ${dataHora()}` });
    let tabela = null;
    const fechar = () => {
      if (tabela && tabela.linhas.length) doc.tabela({ colunas: [{ titulo: tabela.titulo, peso: 3 }, { titulo: 'Valor', peso: 1.4, alinhar: 'd' }, { titulo: 'Observação', peso: 2.6 }], linhas: tabela.linhas });
      tabela = null;
    };
    const formatar = (c) => {
      if (c.tipo === 't') return c.v;
      if (c.s === 'percentual') return R.formatarPercentual(c.v * 100);
      if (['moeda', 'totalMoeda', 'destaque'].includes(c.s)) return R.formatarMoeda(c.v);
      return String(c.v).replace('.', ',');
    };
    let cabecalho = true;
    linhas.forEach((l) => {
      const [a, b, c, d] = l;
      if (!l.length) return;
      if (a && a.s === 'titulo') { doc.titulo(a.v); return; }
      if (b && b.s === 'cabecalho') { fechar(); cabecalho = false; doc.espaco(6); tabela = { titulo: b.v, linhas: [] }; return; }
      // As notas de aviso ficam só na planilha Excel; o PDF traz apenas os valores
      if ((b && b.s === 'nota') || (a && a.s === 'nota')) { fechar(); return; }
      if (cabecalho && b && c && c.tipo === 't') { doc.par(b.v.replace(/:$/, ''), c.v); return; }
      if (!tabela || !b || !c) return;
      const total = ['totalMoeda', 'destaque'].includes(c.s);
      tabela.linhas.push({ celulas: [b.v, formatar(c), d && d.v ? d.v : ''], estilo: total ? 'total' : 'normal' });
    });
    fechar();
    if (criterios && criterios.length) { doc.secao('Critérios'); criterios.forEach((p) => doc.par(p[0], p[1])); }
    return doc.gerar();
  }

  function nomeSeguro(base, sufixo, ext) {
    return `${String(base || 'calculo').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'calculo'}-${sufixo}.${ext}`;
  }

  function baixarPdf(o, nomeBase) {
    return { bytes: pdfDeRegistro(montarCalculo(o)), nome: nomeSeguro(nomeBase, 'calculo', 'pdf') };
  }
  function baixarPdfRegistro(reg, nomeBase) {
    return { bytes: pdfDeRegistro(reg), nome: nomeSeguro(nomeBase || reg.titulo, 'calculo', 'pdf') };
  }
  function baixarPdfSimples(linhas, criterios, titulo, nomeBase) {
    return { bytes: pdfDeLinhasSimples(linhas, criterios, titulo), nome: nomeSeguro(nomeBase || titulo, 'calculo', 'pdf') };
  }

  function baixarPlanilha(o, nomeBase) {
    const bytes = root.CentralXlsx.gerar(montarPlanilha(o));
    return { bytes, nome: `${String(nomeBase || 'calculo').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'calculo'}-planilha.xlsx` };
  }

  root.CentralRegistro = { montarCalculo, montarPlanilha, baixarPlanilha, pdfDeRegistro, baixarPdf, baixarPdfRegistro, baixarPdfSimples, montador, cabecalhoPlanilha, baixarPlanilhaSimples, profissional, textoCorrecao };
})(typeof self !== 'undefined' ? self : globalThis);
