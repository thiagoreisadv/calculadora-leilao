// Testes do script que atualiza a tabela de índices (sem rede). Rode com: node --test test/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const S = require('../scripts/atualizar-indices.js');

test('converterSerie: formato do Banco Central vira mapa AAAA-MM -> variação', () => {
  const v = S.converterSerie([{ data: '01/01/2025', valor: '0.16' }, { data: '01/02/2025', valor: '1.31' }, { data: 'x', valor: '1' }, { data: '01/03/2025', valor: '' }]);
  assert.deepEqual(v, { '2025-01': 0.16, '2025-02': 1.31 }); // mês com valor vazio fica de fora (não divulgado)
  assert.throws(() => S.converterSerie({ erro: 'x' }));
});

test('validarValores: recusa séries curtas ou com valores absurdos', () => {
  const ok = {}; for (let i = 1; i <= 12; i += 1) ok[`2024-${String(i).padStart(2, '0')}`] = 0.4;
  assert.doesNotThrow(() => S.validarValores('IPCA', ok));
  assert.throws(() => S.validarValores('IPCA', { '2024-01': 0.4 }));
  assert.throws(() => S.validarValores('IPCA', { ...ok, '2024-06': 250 }));
});

test('séries configuradas: IPCA 433, INPC 188, IGP-M 189, IPCA-E 10764 (iguais às do motor)', () => {
  const C = require('../js/calculo.js');
  assert.deepEqual(Object.fromEntries(Object.entries(S.SERIES).map(([k, s]) => [k, s.codigo])), { IPCA: 433, INPC: 188, IGPM: 189, IPCAE: 10764 });
  Object.keys(S.SERIES).forEach((k) => assert.equal(C.INDICES[k].codigo, S.SERIES[k].codigo));
});

test('dados/indices.json existe e tem o formato esperado', () => {
  const d = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'dados', 'indices.json'), 'utf8'));
  assert.ok('atualizadoEm' in d && typeof d.series === 'object');
});
