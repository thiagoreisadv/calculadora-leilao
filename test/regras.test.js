// Testes das regras locais. Rode com: node --test test/
// Atenção: as respostas usadas aqui são montagens sintéticas do esquema documentado em
// https://mcp.debit.com.br/v1/openapi.json (CorrectResult). Não são respostas reais da API.
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../js/regras.js');

const criteriosBase = () => ({
  modoCorrecao: 'indice', indice: '45', dataFinal: '01/06/2026',
  juros: { ativo: true, percentual: '1', a_partir: 'vencimento' },
  multa: { ativo: true, percentual: '2' },
  honorarios: { ativo: false }, selic: { ativo: false },
});

test('arredondar: meio afastado do zero e sem erro de ponto flutuante', () => {
  assert.equal(R.arredondar(1.005), 1.01);
  assert.equal(R.arredondar(2.675), 2.68);
  assert.equal(R.arredondar(-1.005), -1.01);
  assert.equal(R.arredondar(0.1 + 0.2), 0.3);
  assert.equal(R.arredondar('abc'), 0);
});

test('lerValor: formatos brasileiros e internacionais', () => {
  assert.equal(R.lerValor('1.234,56'), 1234.56);
  assert.equal(R.lerValor('R$ 1.234,56'), 1234.56);
  assert.equal(R.lerValor('1234,5'), 1234.5);
  assert.equal(R.lerValor('1234.56'), 1234.56);
  assert.equal(R.lerValor('1.234'), 1234);
  assert.equal(R.lerValor('-50,00'), -50);
  assert.equal(R.lerValor(12.5), 12.5);
  assert.ok(Number.isNaN(R.lerValor('')));
  assert.ok(Number.isNaN(R.lerValor('abc')));
  assert.ok(Number.isNaN(R.lerValor('1,2,3')));
});

test('lerData: recusa datas inexistentes', () => {
  assert.ok(R.lerData('29/02/2024'));
  assert.equal(R.lerData('29/02/2025'), null);
  assert.equal(R.lerData('31/04/2024'), null);
  assert.equal(R.lerData('01/13/2024'), null);
  assert.equal(R.lerData('2024-01-01'), null);
  assert.equal(R.isoParaBR('2024-03-05'), '05/03/2024');
  assert.equal(R.brParaISO('05/03/2024'), '2024-03-05');
  assert.equal(R.competenciaParaData('03/2024'), '01/03/2024');
  assert.equal(R.competenciaParaData('13/2024'), '');
});

test('adicionarMeses: preserva o dia e respeita fim de mês e virada de ano', () => {
  assert.equal(R.adicionarMeses('10/01/2025', 1), '10/02/2025');
  assert.equal(R.adicionarMeses('31/01/2025', 1), '28/02/2025');
  assert.equal(R.adicionarMeses('31/01/2024', 1), '29/02/2024');
  assert.equal(R.adicionarMeses('31/01/2025', 2), '31/03/2025');
  assert.equal(R.adicionarMeses('15/11/2025', 3), '15/02/2026');
  assert.equal(R.adicionarMeses('15/03/2025', -3), '15/12/2024');
  assert.equal(R.adicionarMeses('99/99/9999', 1), '');
});

test('validarCalculo: exige índice, data final e parcelas válidas', () => {
  const c = criteriosBase();
  const ok = [{ vencimento: '10/01/2025', valor: '1.000,00', pagamentos: [] }];
  assert.equal(R.validarCalculo(c, ok).length, 0);

  assert.ok(R.validarCalculo({ ...c, indice: '' }, ok).some((e) => e.campo === 'indice'));
  assert.ok(R.validarCalculo({ ...c, dataFinal: '31/02/2026' }, ok).some((e) => e.campo === 'dataFinal'));
  assert.ok(R.validarCalculo(c, []).some((e) => e.campo === 'parcelas'));
  assert.ok(R.validarCalculo(c, [{ vencimento: '', valor: '10' }]).some((e) => e.campo === 'vencimento'));
  assert.ok(R.validarCalculo(c, [{ vencimento: '10/01/2025', valor: '0' }]).some((e) => e.campo === 'valor'));
  assert.ok(R.validarCalculo(c, [{ vencimento: '10/01/2027', valor: '10' }]).some((e) => /posterior/.test(e.mensagem)));
});

test('validarCalculo: pagamentos fora do período e juros pela citação são recusados', () => {
  const c = criteriosBase();
  const parcela = { vencimento: '10/01/2025', valor: '1000', pagamentos: [{ data: '10/12/2024', valor: '100' }] };
  assert.ok(R.validarCalculo(c, [parcela]).some((e) => e.campo === 'pagamento'));
  const citacao = { ...c, juros: { ativo: true, percentual: '1', a_partir: 'citacao' } };
  assert.ok(R.validarCalculo(citacao, [{ vencimento: '10/01/2025', valor: '1000' }]).some((e) => e.campo === 'jurosAPartir'));
});

test('validarCalculo: honorários em percentual não passam de 100%', () => {
  const c = { ...criteriosBase(), honorarios: { ativo: true, modo: 'p', valor: '150' } };
  assert.ok(R.validarCalculo(c, [{ vencimento: '10/01/2025', valor: '1000' }]).some((e) => e.campo === 'honorarios'));
});

test('montarRequisicao: parcelas positivas, pagamentos negativos e só os critérios ativos', () => {
  const parcelas = [
    { descricao: 'Aluguel', vencimento: '10/01/2025', valor: '1.000,00', pagamentos: [{ data: '15/02/2025', valor: '300,00' }] },
    { descricao: '', vencimento: '10/02/2025', valor: '1000', pagamentos: [] },
  ];
  const { requisicao, origem } = R.montarRequisicao(criteriosBase(), parcelas);
  assert.equal(requisicao.index, '45');
  assert.equal(requisicao.table, undefined);
  assert.equal(requisicao.updateTo, '01/06/2026');
  assert.deepEqual(requisicao.items.map((i) => i.amount), [1000, -300, 1000]);
  assert.equal(requisicao.items[2].description, 'Parcela 2');
  // a descrição digitada pelo usuário não é enviada à API
  assert.ok(requisicao.items.every((i) => !/Aluguel/.test(i.description)));
  assert.equal(origem[0].rotulo, 'Aluguel');
  assert.deepEqual(requisicao.juros, { percentual: '1', from: 'vencimento' });
  assert.deepEqual(requisicao.multa, { percentual: '2' });
  assert.equal(requisicao.honorarios, undefined);
  assert.equal(requisicao.selic, undefined);
  assert.deepEqual(origem.map((o) => o.tipo), ['parcela', 'pagamento', 'parcela']);
});

test('montarRequisicao: tabela judicial usa "table" e nunca "index"; SELIC só quando ativa', () => {
  const c = { ...criteriosBase(), modoCorrecao: 'tabela', tabela: 23176, selic: { ativo: true, inicio: '01/12/2021', base: 'am', versao: '2' } };
  const { requisicao } = R.montarRequisicao(c, [{ vencimento: '10/01/2020', valor: '100', pagamentos: [] }]);
  assert.equal(requisicao.table, 23176);
  assert.equal(requisicao.index, undefined);
  assert.equal(requisicao.selic, true);
  assert.equal(requisicao.selicFrom, '01/12/2021');
  assert.equal(requisicao.selicBase, 'am');
  assert.equal(requisicao.selicVersion, 2);
});

test('assinaturaCriterios: critérios iguais agrupam, diferentes separam', () => {
  const a = criteriosBase();
  const b = criteriosBase();
  assert.equal(R.assinaturaCriterios(a), R.assinaturaCriterios(b));
  b.multa.percentual = '10';
  assert.notEqual(R.assinaturaCriterios(a), R.assinaturaCriterios(b));
});

function respostaSintetica(req, fator) {
  const items = req.items.map((i) => {
    const corrected = Math.round(i.amount * fator * 100) / 100;
    return { date: i.date, amount: i.amount, corrected, total: corrected, memoria: 'fixture' };
  });
  const total = Math.round(items.reduce((s, i) => s + i.total, 0) * 100) / 100;
  return { total, correcaoMonetaria: 10, juros: 5, multa: 2, honorarios: 0, items, saved: false };
}

test('conferirResposta: resposta coerente gera linhas e resumo', () => {
  const { requisicao, origem } = R.montarRequisicao(criteriosBase(), [
    { vencimento: '10/01/2025', valor: '1000', pagamentos: [{ data: '15/02/2025', valor: '300' }] },
  ]);
  const r = R.conferirResposta(respostaSintetica(requisicao, 1.1), requisicao, origem);
  assert.equal(r.ok, true);
  assert.equal(r.incompleto, false);
  assert.equal(r.linhas.length, 2);
  assert.equal(r.linhas[0].correcao, 100);
  assert.equal(r.linhas[1].tipo, 'pagamento');
  assert.equal(r.resumo.total, 770);
  assert.equal(r.alertas.length, 0);
});

test('conferirResposta: item zerado pela API NÃO vira valor atualizado', () => {
  const { requisicao, origem } = R.montarRequisicao(criteriosBase(), [
    { vencimento: '10/01/2020', valor: '1000', pagamentos: [] },
    { vencimento: '10/01/2025', valor: '1000', pagamentos: [] },
  ]);
  const resp = respostaSintetica(requisicao, 1.1);
  resp.items[0].corrected = 0; resp.items[0].total = 0;
  resp.total = 1100;
  const r = R.conferirResposta(resp, requisicao, origem);
  assert.equal(r.ok, true);
  assert.equal(r.incompleto, true);
  assert.equal(r.linhas[0].naoAtualizado, true);
  assert.equal(r.linhas[0].corrigido, null);
  assert.ok(r.alertas.some((a) => a.tipo === 'erro' && a.parcela === 0));
});

test('conferirResposta: resposta que não bate com o enviado é recusada', () => {
  const { requisicao, origem } = R.montarRequisicao(criteriosBase(), [{ vencimento: '10/01/2025', valor: '1000', pagamentos: [] }]);
  assert.equal(R.conferirResposta(null, requisicao, origem).ok, false);
  assert.equal(R.conferirResposta({ items: [] }, requisicao, origem).ok, false);
  assert.equal(R.conferirResposta({ total: 1, items: [] }, requisicao, origem).ok, false);
  const errada = respostaSintetica(requisicao, 1);
  errada.items[0].date = '11/01/2025';
  const r = R.conferirResposta(errada, requisicao, origem);
  assert.equal(r.ok, true);
  assert.equal(r.linhas[0].naoAtualizado, true);
});

test('conferirResposta: total divergente da soma das linhas gera aviso, não erro', () => {
  const { requisicao, origem } = R.montarRequisicao(criteriosBase(), [{ vencimento: '10/01/2025', valor: '1000', pagamentos: [] }]);
  const resp = respostaSintetica(requisicao, 1.1);
  resp.total = 1200;
  const r = R.conferirResposta(resp, requisicao, origem);
  assert.equal(r.ok, true);
  assert.ok(r.alertas.some((a) => a.tipo === 'aviso'));
});

test('consolidar: soma várias chamadas e separa pagamentos', () => {
  const montar = (valor, pag) => {
    const { requisicao, origem } = R.montarRequisicao(criteriosBase(), [
      { vencimento: '10/01/2025', valor: String(valor), pagamentos: pag ? [{ data: '15/02/2025', valor: String(pag) }] : [] },
    ]);
    return R.conferirResposta(respostaSintetica(requisicao, 1.1), requisicao, origem);
  };
  const t = R.consolidar([montar(1000, 300), montar(500, 0)], 50);
  assert.equal(t.original, 1500);
  assert.equal(t.pagamentos, -300);
  assert.equal(t.saldo, 1320);
  assert.equal(t.encargosNominais, 50);
  assert.equal(t.saldoComEncargos, 1370);
});

test('resumirPorParcela: junta parcela e pagamentos e não soma parcialmente', () => {
  const parcelas = [
    { descricao: 'A', vencimento: '10/01/2025', valor: '1000', pagamentos: [{ data: '15/02/2025', valor: '300' }] },
    { descricao: 'B', vencimento: '10/01/2020', valor: '500', pagamentos: [] },
  ];
  const { requisicao, origem } = R.montarRequisicao(criteriosBase(), parcelas);
  const resp = respostaSintetica(requisicao, 1.1);
  resp.items[2].corrected = 0; resp.items[2].total = 0;
  const conf = R.conferirResposta(resp, requisicao, origem);
  const r = R.resumirPorParcela(parcelas, conf.linhas);
  assert.equal(r[0].original, 1000);
  assert.equal(r[0].pagamentos, -300);
  assert.equal(r[0].correcao, 100);
  assert.equal(r[0].saldo, 770);
  assert.equal(r[0].naoAtualizado, false);
  assert.equal(r[1].saldo, null);
  assert.equal(r[1].naoAtualizado, true);
  assert.equal(r[1].correcao, null);
});

test('outrosEncargosTotal soma apenas valores válidos', () => {
  assert.equal(R.outrosEncargosTotal([{ valor: '10,50' }, { valor: 'x' }, { valor: '4,5' }]), 15);
});

test('leitura genérica: acha a tabela de competências sem inventar colunas', () => {
  const resposta = {
    debito_total_atualizado: 1700.5, prescricao_modo: 'nenhuma', nada: null,
    detalhes: { competencias: [{ mes_ano: '01/2026', valor_devido: 800, ids: [1, 2], pago: 0 }, { mes_ano: '02/2026', valor_devido: 800, ids: [3], pago: 200 }] },
  };
  const t = R.extrairTabelaGenerica(resposta);
  assert.equal(t.caminho, 'detalhes.competencias');
  assert.deepEqual(t.colunas, ['mes_ano', 'valor_devido', 'pago']);
  assert.deepEqual(t.linhas[1], ['02/2026', 800, 200]);
  assert.equal(R.extrairTabelaGenerica({ items: [{ a: 1 }] }), null);
  assert.equal(R.extrairTabelaGenerica({}), null);

  const campos = R.achatarCampos(resposta);
  assert.ok(campos.some(([k, v]) => k === 'debito_total_atualizado' && v === 1700.5));
  assert.ok(!campos.some(([k]) => k.includes('competencias')));
  assert.equal(R.rotuloCampo('debito_total_atualizado'), 'Débito total atualizado');
  assert.equal(R.rotuloCampo('valor_devido'), 'Valor devido');
  assert.match(R.formatarCampoApi('valor_devido', 800), /800,00/);
  assert.equal(R.formatarCampoApi('quantidade', 3), '3');
  assert.equal(R.formatarCampoApi('x', null), '—');
  assert.equal(R.formatarCampoApi('x', true), 'Sim');
});

test('CSV: separador ;, vírgula decimal, BOM e proteção contra fórmulas', () => {
  const csv = R.gerarCSV(['A', 'B'], [['x;y', R.numeroCSV(1234.5)], ['=1+1', 'ok'], ['-5', 'ok']]);
  assert.ok(csv.startsWith('﻿'));
  const linhas = csv.slice(1).trim().split('\r\n');
  assert.equal(linhas[0], 'A;B');
  assert.equal(linhas[1], '"x;y";1234,50');
  assert.equal(linhas[2], "'=1+1;ok");
  assert.equal(linhas[3], '-5;ok');
});

test('escaparHtml neutraliza marcação', () => {
  assert.equal(R.escaparHtml('<img src=x onerror="a">'), '&lt;img src=x onerror=&quot;a&quot;&gt;');
});

test('formatarMoeda e formatarPercentual no padrão brasileiro', () => {
  assert.match(R.formatarMoeda(1234.5), /1\.234,50/);
  assert.match(R.formatarPercentual(12.3456), /12,35%/);
});
