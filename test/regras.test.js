// Testes dos utilitários locais. Rode com: node --test test/
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../js/regras.js');

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

test('não há chamadas de rede nos arquivos de cálculo', () => {
  const fs = require('node:fs');
  for (const arquivo of ['../js/regras.js', '../js/calculo.js']) {
    const texto = fs.readFileSync(require('node:path').join(__dirname, arquivo), 'utf8');
    assert.ok(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/.test(texto), `${arquivo} não pode acessar a rede`);
  }
});
