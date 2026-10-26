/*
 * Motor de cálculo local da Central de Cálculos.
 *
 * A correção monetária NÃO é calculada aqui nem por nenhuma API: o usuário informa o percentual
 * acumulado do período OU o valor do principal já corrigido (ou escolhe não corrigir). A partir
 * desse principal, o motor calcula juros, multa, honorários, abatimento de pagamentos e saldo.
 * Sem chamadas de rede. Funciona no navegador (window.CentralCalculo) e no Node (testes).
 *
 * Regras (todas reproduzidas na memória de cálculo):
 *  - Principal corrigido = valor original + correção informada (percentual) | valor corrigido informado | valor original.
 *    A correção é aplicada uma única vez; juros e multa incidem sobre o principal corrigido.
 *  - Juros: taxa informada, ao mês ou ao ano, simples ou compostos, do vencimento até a data final.
 *    Período = meses completos + dias restantes / 30.
 *  - Multa: percentual sobre o principal corrigido, aplicada uma única vez.
 *  - Honorários: percentual sobre (principal corrigido + juros + multa − pagamentos) ou valor fixo (uma vez).
 *  - Pagamentos: "final" abate do saldo final sem recalcular juros; "art354" imputa em ordem cronológica,
 *    primeiro nos juros acumulados e depois no principal (juros recalculados sobre o principal restante).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./regras.js'));
  else root.CentralCalculo = factory(root.CentralRegras);
})(typeof self !== 'undefined' ? self : this, function (R) {
  'use strict';

  const DIA_MS = 86400000;
  const MODOS_CORRECAO = ['nenhuma', 'percentual', 'valorCorrigido'];
  const m = R.formatarMoeda;
  const pct = (v) => R.formatarPercentual(v);
  const num = (v, casas) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

  // ---------- Modelos padrão ----------

  function correcaoPadrao() {
    return { modo: 'nenhuma', percentual: '', valorCorrigido: '' };
  }

  function criteriosPadrao() {
    return {
      dataFinal: R.hojeBR(),
      juros: { ativo: false, percentual: '', periodicidade: 'mensal', modalidade: 'simples' },
      multa: { ativo: false, percentual: '' },
      honorarios: { ativo: false, modo: 'p', valor: '' },
      imputacao: 'final',
    };
  }

  // ---------- Correção monetária informada manualmente ----------

  // Devolve o principal corrigido. A correção é aplicada AQUI, uma única vez; as demais etapas
  // recebem apenas "principalCorrigido" e nunca reaplicam o percentual.
  function aplicarCorrecao(valorOriginal, correcao) {
    const original = R.arredondar(R.lerValor(valorOriginal));
    const c = correcao || correcaoPadrao();
    if (c.modo === 'percentual') {
      const p = R.lerValor(c.percentual);
      const valorCorrecao = R.arredondar(original * p / 100);
      return { modo: 'percentual', original, percentual: p, valorCorrecao, principalCorrigido: R.arredondar(original + valorCorrecao), informadoManualmente: true };
    }
    if (c.modo === 'valorCorrigido') {
      const corrigido = R.arredondar(R.lerValor(c.valorCorrigido));
      return { modo: 'valorCorrigido', original, percentual: null, valorCorrecao: R.arredondar(corrigido - original), principalCorrigido: corrigido, informadoManualmente: true };
    }
    return { modo: 'nenhuma', original, percentual: null, valorCorrecao: 0, principalCorrigido: original, informadoManualmente: false };
  }

  // ---------- Período e juros ----------

  // Meses completos a partir de "inicio" + dias restantes (contados como dias/30).
  function periodoEntre(inicio, fim) {
    const a = R.lerData(inicio);
    const b = R.lerData(fim);
    if (!a || !b || b.ts <= a.ts) return { meses: 0, dias: 0, fracionario: 0 };
    let meses = (b.ano - a.ano) * 12 + (b.mes - a.mes);
    let ref = R.lerData(R.adicionarMeses(inicio, meses));
    while (ref.ts > b.ts) { meses -= 1; ref = R.lerData(R.adicionarMeses(inicio, meses)); }
    const dias = Math.round((b.ts - ref.ts) / DIA_MS);
    return { meses, dias, fracionario: meses + dias / 30 };
  }

  // Fator acumulado de juros (decimal) para "meses" (pode ser fracionário).
  function acumuladoJuros(config, meses) {
    const i = R.lerValor(config.percentual) / 100;
    const anual = config.periodicidade === 'anual';
    if (config.modalidade === 'compostos') return Math.pow(1 + i, anual ? meses / 12 : meses) - 1;
    return anual ? i * meses / 12 : i * meses;
  }

  function descricaoTaxa(config) {
    return `${pct(R.lerValor(config.percentual))} ${config.periodicidade === 'anual' ? 'ao ano' : 'ao mês'}, ${config.modalidade === 'compostos' ? 'compostos (capitalizados)' : 'simples'}`;
  }

  function apurarJuros({ principal, config, inicio, fim, pagamentos, imputacao }) {
    const periodo = periodoEntre(inicio, fim);
    const textoPeriodo = `${periodo.meses} mês(es) e ${periodo.dias} dia(s) = ${num(periodo.fracionario, 4)} meses`;
    if (imputacao !== 'art354' || !pagamentos.length) {
      const valor = principal * acumuladoJuros(config, periodo.fracionario);
      return { valor, credito: 0, periodo, passos: [`Juros de ${descricaoTaxa(config)}, de ${inicio} a ${fim} (${textoPeriodo}), sobre ${m(principal)} = ${m(R.arredondar(valor))}.`] };
    }
    const composto = config.modalidade === 'compostos';
    const ordenados = pagamentos.slice().sort((x, y) => (R.lerData(x.data).ts - R.lerData(y.data).ts));
    const passos = [`Juros de ${descricaoTaxa(config)}, de ${inicio} a ${fim} (${textoPeriodo}), com imputação dos pagamentos em ordem cronológica (art. 354 do Código Civil: primeiro nos juros, depois no principal):`];
    let marco = inicio;
    let principalRestante = principal;
    let jurosPendentes = 0;
    let base = principal;
    let total = 0;
    let credito = 0;
    ordenados.forEach((pg) => {
      const dataEfetiva = R.lerData(pg.data).ts < R.lerData(marco).ts ? marco : pg.data;
      const per = periodoEntre(marco, dataEfetiva);
      if (composto) {
        const acr = base * acumuladoJuros(config, per.fracionario);
        base += acr; total += acr;
        base -= pg.valor;
        if (base < 0) { credito += -base; base = 0; }
        passos.push(`Até ${dataEfetiva}: juros de ${m(R.arredondar(acr))}; pagamento de ${m(pg.valor)} abate o saldo capitalizado.`);
      } else {
        const acr = principalRestante * acumuladoJuros(config, per.fracionario);
        jurosPendentes += acr; total += acr;
        const paraJuros = Math.min(pg.valor, jurosPendentes);
        jurosPendentes -= paraJuros;
        const resto = pg.valor - paraJuros;
        const paraPrincipal = Math.min(resto, principalRestante);
        principalRestante -= paraPrincipal;
        credito += resto - paraPrincipal;
        passos.push(`Até ${dataEfetiva}: juros de ${m(R.arredondar(acr))}; pagamento de ${m(pg.valor)} quita ${m(R.arredondar(paraJuros))} de juros e ${m(R.arredondar(paraPrincipal))} do principal.`);
      }
      marco = dataEfetiva;
    });
    const perFinal = periodoEntre(marco, fim);
    if (composto) total += base * acumuladoJuros(config, perFinal.fracionario);
    else total += principalRestante * acumuladoJuros(config, perFinal.fracionario);
    passos.push(`Juros totais apurados no período: ${m(R.arredondar(total))}.`);
    return { valor: total, credito, periodo, passos };
  }

  // ---------- Validação ----------

  function validarCorrecao(correcao, rotulo, linha) {
    const erros = [];
    const c = correcao || {};
    const pre = rotulo ? `${rotulo}: ` : '';
    const e = (mensagem) => erros.push({ campo: 'correcao', linha, mensagem: pre + mensagem });
    if (!MODOS_CORRECAO.includes(c.modo)) { e('escolha como informar a correção monetária.'); return erros; }
    if (c.modo === 'percentual') {
      const p = R.lerValor(c.percentual);
      if (!(p >= 0)) e('informe o percentual de correção monetária (zero ou maior).');
      else if (p > 100000) e('percentual de correção fora do limite razoável.');
    }
    if (c.modo === 'valorCorrigido' && !(R.lerValor(c.valorCorrigido) > 0)) e('informe o valor já corrigido (maior que zero).');
    return erros;
  }

  function validarCriterios(c) {
    const erros = [];
    if (!c) return [{ campo: 'criterios', mensagem: 'Critérios de cálculo não informados.' }];
    if (!R.dataEhValida(c.dataFinal)) erros.push({ campo: 'dataFinal', mensagem: 'Informe a data final do cálculo no formato DD/MM/AAAA.' });
    if (c.juros && c.juros.ativo) {
      if (!(R.lerValor(c.juros.percentual) >= 0)) erros.push({ campo: 'jurosPercentual', mensagem: 'Informe a taxa de juros (zero ou maior).' });
      if (!['mensal', 'anual'].includes(c.juros.periodicidade)) erros.push({ campo: 'jurosPeriodicidade', mensagem: 'Escolha se a taxa de juros é ao mês ou ao ano.' });
      if (!['simples', 'compostos'].includes(c.juros.modalidade)) erros.push({ campo: 'jurosModalidade', mensagem: 'Escolha a modalidade dos juros (simples ou compostos).' });
    }
    if (c.multa && c.multa.ativo) {
      const p = R.lerValor(c.multa.percentual);
      if (!(p >= 0 && p <= 100)) erros.push({ campo: 'multaPercentual', mensagem: 'Informe o percentual da multa (de 0 a 100).' });
    }
    if (c.honorarios && c.honorarios.ativo) {
      const v = R.lerValor(c.honorarios.valor);
      if (!(v > 0)) erros.push({ campo: 'honorarios', mensagem: 'Informe o valor ou percentual dos honorários.' });
      else if (c.honorarios.modo === 'p' && v > 100) erros.push({ campo: 'honorarios', mensagem: 'Honorários em percentual não podem passar de 100%.' });
    }
    if (!['final', 'art354'].includes(c.imputacao)) erros.push({ campo: 'imputacao', mensagem: 'Escolha como os pagamentos serão abatidos.' });
    return erros;
  }

  function validarParcela(p, indice, dataFinal, rotuloBase) {
    const erros = [];
    const rotulo = `${rotuloBase || 'Parcela'} ${indice + 1}`;
    const venc = R.lerData(p.vencimento);
    if (!venc) erros.push({ campo: 'vencimento', linha: indice, mensagem: `${rotulo}: informe o vencimento no formato DD/MM/AAAA.` });
    if (!(R.lerValor(p.valor) > 0)) erros.push({ campo: 'valor', linha: indice, mensagem: `${rotulo}: informe um valor original maior que zero.` });
    const fim = R.lerData(dataFinal);
    if (venc && fim && venc.ts > fim.ts) erros.push({ campo: 'vencimento', linha: indice, mensagem: `${rotulo}: o vencimento é posterior à data final do cálculo.` });
    validarCorrecao(p.correcao, rotulo, indice).forEach((x) => erros.push(x));
    if (p.jurosPct !== undefined && p.jurosPct !== '' && !(R.lerValor(p.jurosPct) >= 0)) erros.push({ campo: 'jurosPct', linha: indice, mensagem: `${rotulo}: taxa de juros própria inválida.` });
    if (p.multaPct !== undefined && p.multaPct !== '' && !(R.lerValor(p.multaPct) >= 0 && R.lerValor(p.multaPct) <= 100)) erros.push({ campo: 'multaPct', linha: indice, mensagem: `${rotulo}: percentual de multa próprio inválido.` });
    (p.pagamentos || []).forEach((pg, k) => {
      const dp = R.lerData(pg.data);
      const vp = R.lerValor(pg.valor);
      if (!dp) erros.push({ campo: 'pagamento', linha: indice, mensagem: `${rotulo}, pagamento ${k + 1}: data inválida (DD/MM/AAAA).` });
      if (!(vp > 0)) erros.push({ campo: 'pagamento', linha: indice, mensagem: `${rotulo}, pagamento ${k + 1}: informe um valor maior que zero.` });
      if (dp && venc && dp.ts < venc.ts) erros.push({ campo: 'pagamento', linha: indice, mensagem: `${rotulo}, pagamento ${k + 1}: a data é anterior ao vencimento.` });
      if (dp && fim && dp.ts > fim.ts) erros.push({ campo: 'pagamento', linha: indice, mensagem: `${rotulo}, pagamento ${k + 1}: a data é posterior à data final do cálculo.` });
    });
    return erros;
  }

  function validarCalculo(criterios, parcelas, rotuloBase) {
    let erros = validarCriterios(criterios);
    if (!parcelas || parcelas.length === 0) erros.push({ campo: 'parcelas', mensagem: 'Inclua ao menos uma parcela ou dívida.' });
    else if (parcelas.length > R.LIMITE_PARCELAS) erros.push({ campo: 'parcelas', mensagem: `O limite é de ${R.LIMITE_PARCELAS} parcelas por cálculo.` });
    else parcelas.forEach((p, i) => { erros = erros.concat(validarParcela(p, i, criterios && criterios.dataFinal, rotuloBase)); });
    return erros;
  }

  // ---------- Cálculo de uma parcela ----------

  // Critérios efetivos da parcela: padrão do cálculo + taxa de juros/multa próprias (opcionais).
  function criteriosDaParcela(parcela, criterios) {
    const c = JSON.parse(JSON.stringify(criterios));
    if (parcela.jurosPct !== undefined && parcela.jurosPct !== '') {
      c.juros = { ...c.juros, ativo: R.lerValor(parcela.jurosPct) > 0, percentual: parcela.jurosPct };
    }
    if (parcela.multaPct !== undefined && parcela.multaPct !== '') {
      c.multa = { ...c.multa, ativo: R.lerValor(parcela.multaPct) > 0, percentual: parcela.multaPct };
    }
    return c;
  }

  function honorariosFixos(criterios) {
    return criterios.honorarios && criterios.honorarios.ativo && criterios.honorarios.modo === 'v'
      ? R.arredondar(R.lerValor(criterios.honorarios.valor)) : 0;
  }

  function calcularParcela(parcela, criteriosGerais) {
    const c = criteriosDaParcela(parcela, criteriosGerais);
    const correcao = aplicarCorrecao(parcela.valor, parcela.correcao);
    const principal = correcao.principalCorrigido;
    const inicio = parcela.vencimento;
    const fim = c.dataFinal;
    const pagamentos = (parcela.pagamentos || []).map((p) => ({ data: p.data, valor: R.arredondar(R.lerValor(p.valor)) }));
    const somaPagamentos = R.arredondar(pagamentos.reduce((s, p) => s + p.valor, 0));
    const periodo = periodoEntre(inicio, fim);

    let juros = 0;
    let credito = 0;
    let passosJuros = [];
    if (c.juros && c.juros.ativo) {
      const r = apurarJuros({ principal, config: c.juros, inicio, fim, pagamentos, imputacao: c.imputacao });
      juros = R.arredondar(r.valor);
      credito = R.arredondar(r.credito);
      passosJuros = r.passos;
      if (c.imputacao !== 'art354') credito = R.arredondar(Math.max(0, somaPagamentos - (principal + juros)));
    } else {
      credito = R.arredondar(Math.max(0, somaPagamentos - principal));
      passosJuros = ['Juros: não aplicados.'];
    }
    const multaPct = c.multa && c.multa.ativo ? R.lerValor(c.multa.percentual) : 0;
    const multa = c.multa && c.multa.ativo ? R.arredondar(principal * multaPct / 100) : 0;
    const saldoPrincipalJuros = R.arredondar(principal + juros - somaPagamentos + credito);
    const honorarios = c.honorarios && c.honorarios.ativo && c.honorarios.modo === 'p'
      ? R.arredondar((saldoPrincipalJuros + multa) * R.lerValor(c.honorarios.valor) / 100) : 0;
    const saldo = R.arredondar(saldoPrincipalJuros + multa + honorarios);

    const memoria = [`Valor original: ${m(correcao.original)} (vencimento em ${inicio}).`];
    if (correcao.modo === 'percentual') {
      memoria.push(`Correção monetária informada manualmente pelo usuário: ${pct(correcao.percentual)} acumulado sobre ${m(correcao.original)} = ${m(correcao.valorCorrecao)}. Não foi calculada por índice oficial nem por consulta automática.`);
    } else if (correcao.modo === 'valorCorrigido') {
      memoria.push(`Principal corrigido informado manualmente pelo usuário: ${m(correcao.principalCorrigido)} (diferença de ${m(correcao.valorCorrecao)} em relação ao valor original). Valor utilizado como está, sem nova aplicação de correção.`);
    } else {
      memoria.push('Correção monetária: não aplicada; o valor original foi utilizado diretamente como principal.');
    }
    memoria.push(`Principal corrigido (base de cálculo dos juros e da multa): ${m(principal)}.`);
    passosJuros.forEach((p) => memoria.push(p));
    memoria.push(multa ? `Multa de ${pct(multaPct)} sobre o principal corrigido ${m(principal)} = ${m(multa)} (aplicada uma única vez).` : 'Multa: não aplicada.');
    if (pagamentos.length) {
      memoria.push(`Pagamentos informados: ${pagamentos.map((p) => `${m(p.valor)} em ${p.data}`).join('; ')} (total ${m(somaPagamentos)}). ${c.imputacao === 'art354' && c.juros && c.juros.ativo ? 'Imputados primeiro nos juros e depois no principal, em ordem cronológica.' : 'Abatidos do saldo final de principal e juros, sem recalcular os juros.'}${credito ? ` Há ${m(credito)} de pagamento excedente, não imputado.` : ''}`);
    }
    if (honorarios) memoria.push(`Honorários de ${pct(R.lerValor(c.honorarios.valor))} sobre ${m(R.arredondar(saldoPrincipalJuros + multa))} (principal corrigido + juros + multa − pagamentos) = ${m(honorarios)}.`);
    memoria.push(`Saldo atualizado = ${m(principal)} (principal corrigido) + ${m(juros)} (juros) + ${m(multa)} (multa) + ${m(honorarios)} (honorários) − ${m(somaPagamentos)} (pagamentos)${credito ? ` + ${m(credito)} (excedente não imputado)` : ''} = ${m(saldo)}.`);

    return {
      original: correcao.original, correcao, principalCorrigido: principal,
      juros, periodo, multa, multaPct, honorarios, pagamentos: somaPagamentos, creditoNaoImputado: credito,
      saldoPrincipalJuros, saldo, memoria,
    };
  }

  // ---------- Consolidação ----------

  function consolidar(resultados, opcoes) {
    const o = opcoes || {};
    const t = { original: 0, correcao: 0, principalCorrigido: 0, juros: 0, multa: 0, honorarios: 0, pagamentos: 0, creditoNaoImputado: 0, saldo: 0 };
    resultados.forEach((r) => {
      t.original += r.original; t.correcao += r.correcao.valorCorrecao; t.principalCorrigido += r.principalCorrigido;
      t.juros += r.juros; t.multa += r.multa; t.honorarios += r.honorarios; t.pagamentos += r.pagamentos;
      t.creditoNaoImputado += r.creditoNaoImputado; t.saldo += r.saldo;
    });
    t.honorariosFixos = R.arredondar(o.honorariosFixos || 0);
    t.encargosNominais = R.arredondar(o.encargosNominais || 0);
    t.honorarios += t.honorariosFixos;
    Object.keys(t).forEach((k) => { t[k] = R.arredondar(t[k]); });
    t.saldoFinal = R.arredondar(t.saldo + t.honorariosFixos + t.encargosNominais);
    return t;
  }

  function outrosEncargosTotal(lista) {
    return R.arredondar((lista || []).reduce((s, e) => s + (R.lerValor(e.valor) || 0), 0));
  }

  // ---------- Pensão alimentícia: ritos do art. 528 do CPC (Súmula 309 do STJ) ----------

  // Rito da prisão: as 3 prestações vencidas antes do ajuizamento + todas as vencidas depois dele.
  // Rito da expropriação: as demais. Sem data de ajuizamento: as 3 últimas vencidas antes da data-base.
  function particionarRitos(itens, ajuizamento, dataBase) {
    const base = R.lerData(dataBase);
    const vencidas = itens.filter((i) => !i.prescrita && R.lerData(i.vencimento) && R.lerData(i.vencimento).ts <= base.ts)
      .sort((a, b) => R.lerData(a.vencimento).ts - R.lerData(b.vencimento).ts);
    const ajuiz = R.lerData(ajuizamento);
    let prisao;
    let criterio;
    if (ajuiz && ajuiz.ts <= base.ts) {
      const antes = vencidas.filter((i) => R.lerData(i.vencimento).ts < ajuiz.ts);
      const depois = vencidas.filter((i) => R.lerData(i.vencimento).ts >= ajuiz.ts);
      prisao = antes.slice(-3).concat(depois);
      criterio = 'ajuizamento';
    } else {
      prisao = vencidas.slice(-3);
      criterio = 'data_base';
    }
    const idsPrisao = new Set(prisao.map((i) => i.indice));
    const expropriacao = vencidas.filter((i) => !idsPrisao.has(i.indice));
    const soma = (lista) => R.arredondar(lista.reduce((s, i) => s + i.saldo, 0));
    return {
      criterio,
      prisao: { indices: prisao.map((i) => i.indice), total: soma(prisao) },
      expropriacao: { indices: expropriacao.map((i) => i.indice), total: soma(expropriacao) },
      nota: criterio === 'ajuizamento' ? 'Rito da prisão: 3 prestações vencidas antes do ajuizamento e todas as vencidas depois dele.' : 'Data de ajuizamento não informada: rito da prisão calculado com as 3 últimas prestações vencidas antes da data-base.',
    };
  }

  return {
    MODOS_CORRECAO, correcaoPadrao, criteriosPadrao, aplicarCorrecao, periodoEntre, acumuladoJuros, apurarJuros,
    validarCorrecao, validarCriterios, validarParcela, validarCalculo, criteriosDaParcela, honorariosFixos,
    calcularParcela, consolidar, outrosEncargosTotal, particionarRitos,
  };
});
