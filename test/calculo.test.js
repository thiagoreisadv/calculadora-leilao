// Testes do motor de cálculo local. Rode com: node --test test/
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/calculo.js');

const criterios = (extra) => ({ ...C.criteriosPadrao(), dataFinal: '10/07/2025', ...(extra || {}) });
const parcela = (extra) => ({ descricao: 'Teste', vencimento: '10/01/2025', valor: '5.000,00', correcao: C.correcaoPadrao(), pagamentos: [], ...(extra || {}) });
const juros = (extra) => ({ ativo: true, percentual: '1', periodicidade: 'mensal', modalidade: 'simples', ...(extra || {}) });

// ---------- Correção monetária manual: as três modalidades ----------

test('Opção A: percentual acumulado — 5.000 com 8% = correção 400 e principal 5.400', () => {
  const r = C.aplicarCorrecao('5000', { modo: 'percentual', percentual: '8', valorCorrigido: '' });
  assert.equal(r.valorCorrecao, 400);
  assert.equal(r.principalCorrigido, 5400);
  assert.equal(r.informadoManualmente, true);
});

test('Opção B: valor já corrigido é usado como base, sem aplicar correção de novo', () => {
  const r = C.aplicarCorrecao('5000', { modo: 'valorCorrigido', percentual: '50', valorCorrigido: '5.400,00' });
  assert.equal(r.principalCorrigido, 5400); // o percentual guardado no formulário é ignorado
  assert.equal(r.valorCorrecao, 400);
  assert.equal(r.percentual, null);
});

test('Sem correção: usa diretamente o valor original (e ignora campos de outras opções)', () => {
  const r = C.aplicarCorrecao('5000', { modo: 'nenhuma', percentual: '8', valorCorrigido: '9999' });
  assert.equal(r.principalCorrigido, 5000);
  assert.equal(r.valorCorrecao, 0);
  assert.equal(r.informadoManualmente, false);
});

test('correção percentual arredonda em centavos', () => {
  const r = C.aplicarCorrecao('1000', { modo: 'percentual', percentual: '3,3333' });
  assert.equal(r.valorCorrecao, 33.33);
  assert.equal(r.principalCorrigido, 1033.33);
});

test('sem aplicação duplicada: o principal corrigido é a base e a correção entra uma só vez no saldo', () => {
  const r = C.calcularParcela(parcela({ correcao: { modo: 'percentual', percentual: '8', valorCorrigido: '' } }), criterios());
  assert.equal(r.principalCorrigido, 5400);
  assert.equal(r.saldo, 5400); // sem juros, multa, honorários: saldo = principal corrigido (não 5.832)
  // com juros: incidem sobre 5.400, e o saldo não soma a correção outra vez
  const j = C.calcularParcela(parcela({ correcao: { modo: 'percentual', percentual: '8', valorCorrigido: '' } }), criterios({ juros: juros() }));
  assert.equal(j.saldo, R2(j.principalCorrigido + j.juros));
  assert.equal(j.principalCorrigido, 5400);
});

const R2 = (n) => Math.round(n * 100) / 100;

test('percentual e valor corrigido equivalentes dão o mesmo resultado final', () => {
  const crit = criterios({ juros: juros({ percentual: '1' }), multa: { ativo: true, percentual: '2' } });
  const a = C.calcularParcela(parcela({ correcao: { modo: 'percentual', percentual: '8', valorCorrigido: '' } }), crit);
  const b = C.calcularParcela(parcela({ correcao: { modo: 'valorCorrigido', percentual: '', valorCorrigido: '5400' } }), crit);
  assert.equal(a.saldo, b.saldo);
  assert.equal(a.juros, b.juros);
  assert.equal(a.multa, b.multa);
});

test('valor corrigido informado menor que o original é aceito (informado pelo usuário)', () => {
  assert.equal(C.validarCorrecao({ modo: 'valorCorrigido', valorCorrigido: '4000' }).length, 0);
  assert.equal(C.aplicarCorrecao('5000', { modo: 'valorCorrigido', valorCorrigido: '4000' }).valorCorrecao, -1000);
});

// ---------- Validação da correção ----------

test('validarCorrecao: exige o campo da opção escolhida', () => {
  assert.equal(C.validarCorrecao({ modo: 'nenhuma' }).length, 0);
  assert.equal(C.validarCorrecao({ modo: 'percentual', percentual: '8' }).length, 0);
  assert.equal(C.validarCorrecao({ modo: 'percentual', percentual: '0' }).length, 0);
  assert.equal(C.validarCorrecao({ modo: 'percentual', percentual: '' }).length, 1);
  assert.equal(C.validarCorrecao({ modo: 'percentual', percentual: '-3' }).length, 1);
  assert.equal(C.validarCorrecao({ modo: 'valorCorrigido', valorCorrigido: '' }).length, 1);
  assert.equal(C.validarCorrecao({ modo: 'valorCorrigido', valorCorrigido: '0' }).length, 1);
  assert.equal(C.validarCorrecao({ modo: 'xyz' }).length, 1);
  assert.equal(C.validarCorrecao(undefined).length, 1);
});

// ---------- Período e juros ----------

test('periodoEntre: meses completos + dias restantes', () => {
  assert.deepEqual(C.periodoEntre('10/01/2025', '10/07/2025'), { meses: 6, dias: 0, fracionario: 6 });
  const p = C.periodoEntre('10/01/2025', '25/07/2025');
  assert.equal(p.meses, 6); assert.equal(p.dias, 15); assert.equal(p.fracionario, 6.5);
  assert.deepEqual(C.periodoEntre('31/01/2025', '28/02/2025'), { meses: 1, dias: 0, fracionario: 1 });
  assert.equal(C.periodoEntre('10/07/2025', '10/01/2025').fracionario, 0);
  assert.equal(C.periodoEntre('01/01/2025', '31/01/2025').fracionario, 1);
});

test('juros simples ao mês: 1% por 6 meses sobre 5.400', () => {
  const r = C.calcularParcela(parcela({ correcao: { modo: 'percentual', percentual: '8' } }), criterios({ juros: juros() }));
  assert.equal(r.juros, 324); // 5.400 × 1% × 6
  assert.equal(r.saldo, 5724);
});

test('juros compostos ao mês: 1% por 6 meses', () => {
  const r = C.calcularParcela(parcela(), criterios({ juros: juros({ modalidade: 'compostos' }) }));
  assert.equal(r.juros, R2(5000 * (Math.pow(1.01, 6) - 1)));
});

test('juros ao ano: 12% a.a. simples por 6 meses = 6% e compostos = (1,12)^0,5 − 1', () => {
  const s = C.calcularParcela(parcela(), criterios({ juros: juros({ percentual: '12', periodicidade: 'anual' }) }));
  assert.equal(s.juros, 300);
  const c = C.calcularParcela(parcela(), criterios({ juros: juros({ percentual: '12', periodicidade: 'anual', modalidade: 'compostos' }) }));
  assert.equal(c.juros, R2(5000 * (Math.pow(1.12, 0.5) - 1)));
});

test('juros com dias quebrados contam dias/30', () => {
  const r = C.calcularParcela(parcela({ valor: '3000' }), { ...criterios({ juros: juros() }), dataFinal: '25/07/2025' });
  assert.equal(r.juros, 195); // 3.000 × 1% × 6,5
});

test('sem juros ativos, nada é cobrado', () => {
  const r = C.calcularParcela(parcela(), criterios());
  assert.equal(r.juros, 0);
  assert.equal(r.multa, 0);
  assert.equal(r.saldo, 5000);
});

// ---------- Multa, honorários, encargos ----------

test('multa incide uma vez sobre o principal corrigido', () => {
  const r = C.calcularParcela(parcela({ correcao: { modo: 'percentual', percentual: '8' } }), criterios({ multa: { ativo: true, percentual: '2' } }));
  assert.equal(r.multa, 108); // 2% de 5.400
  assert.equal(r.saldo, 5508);
});

test('honorários em percentual incidem sobre principal corrigido + juros + multa', () => {
  const r = C.calcularParcela(parcela(), criterios({ juros: juros(), multa: { ativo: true, percentual: '2' }, honorarios: { ativo: true, modo: 'p', valor: '10' } }));
  assert.equal(r.honorarios, R2((5000 + 300 + 100) * 0.1));
  assert.equal(r.saldo, R2(5000 + 300 + 100 + r.honorarios));
});

test('honorários de valor fixo entram uma única vez na consolidação, não por parcela', () => {
  const crit = criterios({ honorarios: { ativo: true, modo: 'v', valor: '500' } });
  const rs = [C.calcularParcela(parcela(), crit), C.calcularParcela(parcela({ valor: '1000' }), crit)];
  assert.equal(rs[0].honorarios, 0);
  const t = C.consolidar(rs, { honorariosFixos: C.honorariosFixos(crit), encargosNominais: 50 });
  assert.equal(t.honorarios, 500);
  assert.equal(t.saldoFinal, 6000 + 500 + 50);
});

// ---------- Pagamentos ----------

test('pagamento no modo "final": abatido do saldo, sem recalcular juros', () => {
  const r = C.calcularParcela(parcela({ pagamentos: [{ data: '10/04/2025', valor: '1.000,00' }] }), criterios({ juros: juros(), imputacao: 'final' }));
  assert.equal(r.juros, 300); // 5.000 × 1% × 6, ignorando o pagamento
  assert.equal(r.pagamentos, 1000);
  assert.equal(r.saldo, 4300);
});

test('pagamento no modo art. 354: quita juros primeiro e recalcula juros sobre o principal restante', () => {
  const r = C.calcularParcela(parcela({ pagamentos: [{ data: '10/04/2025', valor: '1.000,00' }] }), criterios({ juros: juros(), imputacao: 'art354' }));
  // até 10/04: 3 meses × 1% × 5.000 = 150 de juros; pagamento 1.000 quita 150 de juros e 850 do principal
  // restante 4.150 rende 3 meses × 1% = 124,50 até 10/07
  assert.equal(r.juros, 274.5);
  assert.equal(r.saldo, R2(4150 + 124.5));
  assert.equal(r.pagamentos, 1000);
});

test('art. 354 com juros compostos: pagamento abate o saldo capitalizado', () => {
  const r = C.calcularParcela(parcela({ pagamentos: [{ data: '10/04/2025', valor: '1.000,00' }] }), criterios({ juros: juros({ modalidade: 'compostos' }), imputacao: 'art354' }));
  const b1 = 5000 * Math.pow(1.01, 3);
  const b2 = (b1 - 1000) * Math.pow(1.01, 3);
  assert.equal(r.saldo, R2(b2));
  assert.equal(r.saldoPrincipalJuros, R2(b2));
});

test('identidade do saldo: principal corrigido + juros + multa + honorários − pagamentos (+ excedente)', () => {
  const casos = [
    criterios({ juros: juros(), multa: { ativo: true, percentual: '2' }, imputacao: 'final' }),
    criterios({ juros: juros(), multa: { ativo: true, percentual: '2' }, imputacao: 'art354' }),
    criterios({ juros: juros({ modalidade: 'compostos' }), imputacao: 'art354', honorarios: { ativo: true, modo: 'p', valor: '10' } }),
  ];
  casos.forEach((crit) => {
    const r = C.calcularParcela(parcela({ correcao: { modo: 'percentual', percentual: '8' }, pagamentos: [{ data: '10/03/2025', valor: '700' }, { data: '10/05/2025', valor: '300' }] }), crit);
    assert.equal(r.saldo, R2(r.principalCorrigido + r.juros + r.multa + r.honorarios - r.pagamentos + r.creditoNaoImputado));
  });
});

test('pagamento maior que a dívida gera excedente não imputado (saldo não fica negativo)', () => {
  const r = C.calcularParcela(parcela({ pagamentos: [{ data: '10/02/2025', valor: '6.000,00' }] }), criterios({ juros: juros(), imputacao: 'art354' }));
  assert.ok(r.creditoNaoImputado > 0);
  assert.ok(r.saldo >= 0);
  const f = C.calcularParcela(parcela({ pagamentos: [{ data: '10/02/2025', valor: '9.000,00' }] }), criterios({ imputacao: 'final' }));
  assert.equal(f.creditoNaoImputado, 4000);
  assert.equal(f.saldo, 0);
});

// ---------- Memória de cálculo ----------

test('memória discrimina a correção como informada manualmente e nunca como índice oficial', () => {
  const a = C.calcularParcela(parcela({ correcao: { modo: 'percentual', percentual: '8' } }), criterios()).memoria.join(' ');
  assert.match(a, /informada manualmente pelo usuário: 8,00% acumulado sobre R\$\s5\.000,00 = R\$\s400,00/);
  assert.match(a, /Não foi calculada por índice oficial/);
  const b = C.calcularParcela(parcela({ correcao: { modo: 'valorCorrigido', valorCorrigido: '5400' } }), criterios()).memoria.join(' ');
  assert.match(b, /Principal corrigido informado manualmente pelo usuário/);
  assert.match(b, /sem nova aplicação de correção/);
  const c = C.calcularParcela(parcela(), criterios()).memoria.join(' ');
  assert.match(c, /Correção monetária: não aplicada/);
  [a, b, c].forEach((t) => assert.ok(!/IPCA|INPC|IGP-M|Selic|Debit/i.test(t)));
});

// ---------- Validação do cálculo ----------

test('validarCalculo: critérios, parcelas, pagamentos e correção por parcela', () => {
  const crit = criterios({ juros: juros() });
  assert.equal(C.validarCalculo(crit, [parcela()]).length, 0);
  assert.ok(C.validarCalculo({ ...crit, dataFinal: '31/02/2026' }, [parcela()]).some((e) => e.campo === 'dataFinal'));
  assert.ok(C.validarCalculo(crit, []).some((e) => e.campo === 'parcelas'));
  assert.ok(C.validarCalculo(crit, [parcela({ vencimento: '' })]).some((e) => e.campo === 'vencimento'));
  assert.ok(C.validarCalculo(crit, [parcela({ valor: '0' })]).some((e) => e.campo === 'valor'));
  // Vencimento depois da data final e pagamento antecipado não bloqueiam mais o cálculo
  assert.equal(C.validarCalculo(crit, [parcela({ vencimento: '10/01/2027' })]).length, 0);
  assert.equal(C.validarCalculo(crit, [parcela({ pagamentos: [{ data: '10/12/2024', valor: '10' }] })]).length, 0);
  assert.ok(C.validarCalculo(crit, [parcela({ correcao: { modo: 'percentual', percentual: '' } })]).some((e) => e.campo === 'correcao'));
  assert.ok(C.validarCalculo(crit, [parcela({ pagamentos: [{ data: '10/08/2025', valor: '10' }] })]).some((e) => /posterior à data final/.test(e.mensagem)));
  assert.ok(C.validarCalculo({ ...crit, vincendas: 'outro' }, [parcela()]).some((e) => e.campo === 'vincendas'));
  assert.ok(C.validarCalculo({ ...crit, juros: juros({ percentual: '' }) }, [parcela()]).some((e) => e.campo === 'jurosPercentual'));
  assert.ok(C.validarCalculo({ ...crit, honorarios: { ativo: true, modo: 'p', valor: '150' } }, [parcela()]).some((e) => e.campo === 'honorarios'));
  const erros = C.validarCalculo(crit, [parcela(), parcela({ correcao: { modo: 'valorCorrigido', valorCorrigido: '' } })]);
  assert.equal(erros.find((e) => e.campo === 'correcao').linha, 1);
});

// ---------- Várias parcelas, cada uma com a sua correção ----------

test('cada parcela usa a sua própria correção e a consolidação soma sem duplicar', () => {
  const crit = criterios({ juros: juros(), multa: { ativo: true, percentual: '2' } });
  const ps = [
    parcela({ valor: '1000', correcao: { modo: 'percentual', percentual: '10' } }),
    parcela({ valor: '2000', correcao: { modo: 'valorCorrigido', valorCorrigido: '2300' } }),
    parcela({ valor: '3000' }),
  ];
  const rs = ps.map((p) => C.calcularParcela(p, crit));
  assert.deepEqual(rs.map((r) => r.principalCorrigido), [1100, 2300, 3000]);
  const t = C.consolidar(rs, {});
  assert.equal(t.original, 6000);
  assert.equal(t.correcao, 100 + 300 + 0);
  assert.equal(t.principalCorrigido, 6400);
  assert.equal(t.saldo, R2(rs[0].saldo + rs[1].saldo + rs[2].saldo));
  assert.equal(t.saldoFinal, t.saldo);
});

test('taxas de juros e multa próprias da parcela substituem as gerais; vazio herda', () => {
  const crit = criterios({ juros: juros({ percentual: '1' }), multa: { ativo: true, percentual: '2' } });
  const herda = C.calcularParcela(parcela(), crit);
  const propria = C.calcularParcela(parcela({ jurosPct: '2', multaPct: '0' }), crit);
  assert.equal(herda.juros, 300);
  assert.equal(propria.juros, 600);
  assert.equal(propria.multa, 0);
});

// ---------- Pensão: ritos do art. 528 ----------

test('ritos do art. 528 com data de ajuizamento', () => {
  const itens = ['10/01/2025', '10/02/2025', '10/03/2025', '10/04/2025', '10/05/2025', '10/06/2025'].map((v, i) => ({ indice: i, vencimento: v, saldo: 100 }));
  const r = C.particionarRitos(itens, '20/04/2025', '10/07/2025');
  assert.equal(r.criterio, 'ajuizamento');
  // antes do ajuizamento: jan..abr -> as 3 últimas (fev, mar, abr); depois: mai, jun
  assert.deepEqual(r.prisao.indices, [1, 2, 3, 4, 5]);
  assert.deepEqual(r.expropriacao.indices, [0]);
  assert.equal(r.prisao.total + r.expropriacao.total, 600);
});

test('ritos do art. 528 sem ajuizamento: 3 últimas antes da data-base; prescritas ficam fora', () => {
  const itens = ['10/01/2025', '10/02/2025', '10/03/2025', '10/04/2025', '10/05/2025'].map((v, i) => ({ indice: i, vencimento: v, saldo: 100, prescrita: i === 0 }));
  const r = C.particionarRitos(itens, '', '10/07/2025');
  assert.equal(r.criterio, 'data_base');
  assert.deepEqual(r.prisao.indices, [2, 3, 4]);
  assert.deepEqual(r.expropriacao.indices, [1]);
  assert.equal(r.prisao.total + r.expropriacao.total, 400);
});

test('outrosEncargosTotal soma apenas valores válidos', () => {
  assert.equal(C.outrosEncargosTotal([{ valor: '10,50' }, { valor: 'x' }, { valor: '4,5' }]), 15);
});

// ---------- Situações revisadas: vencimento futuro, multa e pagamentos ----------

const multa10 = { ativo: true, percentual: '10' };

test('parcela a vencer com "antecipar": vence na data final, sem juros, com multa', () => {
  const r = C.calcularParcela(parcela({ vencimento: '10/09/2025', valor: '1000' }), criterios({ juros: juros(), multa: multa10 }));
  assert.equal(r.aVencer, true);
  assert.equal(r.juros, 0);
  assert.equal(r.multa, 100);
  assert.equal(r.saldo, 1100);
  assert.ok(r.memoria.some((l) => /vencida antecipadamente/.test(l)));
});

test('parcela a vencer com "excluir": fica fora do cálculo', () => {
  const lista = [parcela({ vencimento: '10/01/2025' }), parcela({ vencimento: '10/09/2025' })];
  const s = C.separarVincendas(lista, criterios({ vincendas: 'excluir' }));
  assert.deepEqual(s.calcular.map((x) => x.indice), [0]);
  assert.deepEqual(s.aVencer.map((x) => x.indice), [1]);
  assert.equal(C.separarVincendas(lista, criterios()).aVencer.length, 0); // padrão: antecipar
});

test('pagamento integral até o vencimento afasta a multa', () => {
  const r = C.calcularParcela(parcela({ valor: '1000', pagamentos: [{ data: '10/01/2025', valor: '1000' }] }), criterios({ multa: multa10 }));
  assert.equal(r.multa, 0);
  assert.equal(r.saldo, 0);
});

test('pagamento parcial em dia: a multa incide só sobre o que ficou em atraso', () => {
  const r = C.calcularParcela(parcela({ valor: '1000', pagamentos: [{ data: '10/01/2025', valor: '600' }] }), criterios({ multa: multa10 }));
  assert.equal(r.baseMulta, 400);
  assert.equal(r.multa, 40);
  assert.equal(r.saldo, 440);
});

test('pagamento além do principal e dos juros quita a multa (sem saldo e excedente ao mesmo tempo)', () => {
  const r = C.calcularParcela(parcela({ valor: '1000', pagamentos: [{ data: '10/03/2025', valor: '1100' }] }), criterios({ multa: multa10 }));
  assert.equal(r.multaQuitada, 100);
  assert.equal(r.creditoNaoImputado, 0);
  assert.equal(r.saldo, 0);
  const sobra = C.calcularParcela(parcela({ valor: '1000', pagamentos: [{ data: '10/03/2025', valor: '1150' }] }), criterios({ multa: multa10 }));
  assert.equal(sobra.saldo, 0); // dívida quitada; os 50 a mais ficam como excedente não imputado
  assert.equal(sobra.creditoNaoImputado, 50);
});

test('pagamento antecipado é aceito e abate o saldo', () => {
  const r = C.calcularParcela(parcela({ valor: '1000', pagamentos: [{ data: '05/01/2025', valor: '300' }] }), criterios({ juros: juros(), multa: multa10, imputacao: 'art354' }));
  assert.equal(r.baseMulta, 700);
  assert.ok(r.saldo > 0 && r.saldo < 1000);
});

test('vencimentoMora separa a mora (multa) do início dos juros', () => {
  // juros desde 10/03 (data inicial informada), multa decidida pelo vencimento real 10/01
  const r = C.calcularParcela(parcela({ valor: '1000', vencimento: '10/03/2025', vencimentoMora: '10/01/2025', pagamentos: [{ data: '15/02/2025', valor: '1000' }] }), criterios({ multa: multa10 }));
  assert.equal(r.multa, 100); // pago depois do vencimento real: há multa
});

// ---------- Correção pelo índice oficial ----------

const TABELA = { atualizadoEm: '10/07/2025', fonte: 'Banco Central do Brasil (SGS)', series: {
  IPCA: { codigo: 433, valores: { '2025-01': 0.16, '2025-02': 1.31, '2025-03': 0.56, '2025-04': 0.43, '2025-05': 0.26, '2025-06': 0.24 } },
  IGPM: { codigo: 189, valores: { '2025-01': 0.27, '2025-02': 1.06, '2025-03': -0.34 } },
} };

test('índice: acumula do mês do vencimento ao mês anterior ao da data final', () => {
  C.definirIndices(TABELA);
  const r = C.aplicarCorrecao('1000', { modo: 'indice', indice: 'IPCA' }, { inicio: '10/01/2025', fim: '10/07/2025' });
  const fator = [0.16, 1.31, 0.56, 0.43, 0.26, 0.24].reduce((f, v) => f * (1 + v / 100), 1);
  assert.equal(r.meses.length, 6);
  assert.ok(Math.abs(r.fator - fator) < 1e-12);
  assert.equal(r.valorCorrecao, Math.round(1000 * (fator - 1) * 100) / 100);
  assert.equal(r.faltantes.length, 0);
});

test('índice: meses sem divulgação ficam de fora e são apontados; deflação é considerada', () => {
  C.definirIndices(TABELA);
  const r = C.aplicarCorrecao('1000', { modo: 'indice', indice: 'IGPM' }, { inicio: '10/01/2025', fim: '10/06/2025' });
  assert.deepEqual(r.faltantes, ['2025-04', '2025-05']);
  assert.equal(r.meses.length, 3);
  assert.ok(r.meses.some((x) => x.valor < 0));
  const p = C.calcularParcela(parcela({ valor: '1000', correcao: { modo: 'indice', indice: 'IGPM' } }), criterios({ dataFinal: '10/06/2025' }));
  assert.ok(p.memoria.some((l) => /IGP-M/.test(l) && /série SGS 189/.test(l)));
  assert.ok(p.memoria.some((l) => /ainda não divulgado para abr\/2025, mai\/2025/.test(l)));
});

test('índice: sem tabela carregada a validação pede o percentual manual', () => {
  C.definirIndices(null);
  const erros = C.validarCalculo(criterios(), [parcela({ correcao: { modo: 'indice', indice: 'IPCA' } })]);
  assert.ok(erros.some((e) => e.campo === 'correcao' && /tabela de índices/.test(e.mensagem)));
  C.definirIndices(TABELA);
  assert.equal(C.validarCalculo(criterios(), [parcela({ correcao: { modo: 'indice', indice: 'IPCA' } })]).length, 0);
  assert.ok(C.validarCalculo(criterios(), [parcela({ correcao: { modo: 'indice', indice: 'XYZ' } })]).some((e) => e.campo === 'correcao'));
});

test('índice: parcela a vencer não é corrigida', () => {
  C.definirIndices(TABELA);
  const r = C.calcularParcela(parcela({ valor: '1000', vencimento: '10/09/2025', correcao: { modo: 'indice', indice: 'IPCA' } }), criterios());
  assert.equal(r.correcao.valorCorrecao, 0);
  assert.equal(r.principalCorrigido, 1000);
});

test('salário mínimo: valor vigente na competência, com a série do Banco Central tendo prioridade', () => {
  C.definirIndices(null);
  assert.equal(C.salarioMinimo('04/2023'), 1302);
  assert.equal(C.salarioMinimo('05/2023'), 1320); // reajuste de maio/2023
  assert.equal(C.salarioMinimo('15/02/2020'), 1045);
  assert.equal(C.salarioMinimo('2025-07'), 1518);
  assert.equal(C.salarioMinimo('01/1990'), null);
  assert.equal(C.salarioMinimo('13/2025'), null);
  C.definirIndices({ series: { SALARIO_MINIMO: { valores: { '2025-07': 1500 } } } });
  assert.equal(C.salarioMinimo('07/2025'), 1500);
  assert.equal(C.salarioMinimo('08/2025'), 1500); // último valor conhecido até a competência
  C.definirIndices(null);
});
