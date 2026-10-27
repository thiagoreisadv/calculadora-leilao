// Testes do gerador de planilhas .xlsx e da planilha de cálculo. Rode com: node --test test/
const test = require('node:test');
const assert = require('node:assert/strict');
const X = require('../js/xlsx.js');
globalThis.CentralXlsx = X;
const R = require('../js/regras.js');
globalThis.CentralRegras = R;
const C = require('../js/calculo.js');
globalThis.localStorage = { getItem: () => JSON.stringify({ advName: 'Advogado Teste', advOab: 'OAB/PR 1' }) };
require('../js/registro.js'); const Reg = globalThis.CentralRegistro;

// Leitor mínimo de ZIP "stored" para conferir a estrutura e os CRCs.
function lerZip(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let fim = bytes.length - 22;
  assert.equal(v.getUint32(fim, true), 0x06054b50);
  const total = v.getUint16(fim + 10, true);
  let pos = v.getUint32(fim + 16, true);
  const arquivos = {};
  for (let i = 0; i < total; i += 1) {
    assert.equal(v.getUint32(pos, true), 0x02014b50);
    const crc = v.getUint32(pos + 16, true), tam = v.getUint32(pos + 24, true);
    const nomeLen = v.getUint16(pos + 28, true), local = v.getUint32(pos + 42, true);
    const nome = Buffer.from(bytes.subarray(pos + 46, pos + 46 + nomeLen)).toString('utf8');
    assert.equal(v.getUint32(local, true), 0x04034b50);
    const nl = v.getUint16(local + 26, true), el = v.getUint16(local + 28, true);
    const dados = bytes.subarray(local + 30 + nl + el, local + 30 + nl + el + tam);
    assert.equal(X.crc32(dados), crc, `CRC de ${nome}`);
    arquivos[nome] = Buffer.from(dados).toString('utf8');
    pos += 46 + nomeLen;
  }
  return arquivos;
}

test('crc32 conhecido', () => {
  assert.equal(X.crc32(new TextEncoder().encode('123456789')), 0xCBF43926);
});

test('gera um pacote OOXML íntegro com as abas, estilos e células', () => {
  const bytes = X.gerar({ abas: [
    { nome: 'Cálculo', larguras: [10, 20], linhas: [[X.T('Título & <teste>', 'titulo')], [X.T('Item', 'cabecalho'), X.T('Valor', 'cabecalho')], [X.T('A'), X.N(10.5, 'moeda')], [X.T('B'), X.N(4.5, 'moeda')], [X.T('Total', 'rotulo'), X.F('SUM(B3:B4)', 15, 'totalMoeda')]] },
    { nome: 'Aba/inválida:nome', linhas: [[X.T('x')]] },
  ] });
  const z = lerZip(bytes);
  ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml'].forEach((n) => assert.ok(z[n], n));
  assert.match(z['xl/workbook.xml'], /name="Cálculo"/);
  assert.match(z['xl/workbook.xml'], /name="Aba inválida nome"/);
  const s1 = z['xl/worksheets/sheet1.xml'];
  assert.match(s1, /Título &amp; &lt;teste&gt;/);
  assert.match(s1, /<c r="B5" s="6"><f>SUM\(B3:B4\)<\/f><v>15<\/v><\/c>/);
  assert.match(s1, /<c r="B3" s="3"><v>10.5<\/v><\/c>/);
  assert.match(z['xl/styles.xml'], /numFmtId="164"/);
});

function entrada() {
  const crit = { ...C.criteriosPadrao(), dataFinal: '10/07/2025', juros: { ativo: true, percentual: '1', periodicidade: 'mensal', modalidade: 'simples' }, multa: { ativo: true, percentual: '2' }, honorarios: { ativo: true, modo: 'v', valor: '500' } };
  const parcelas = [
    { descricao: 'Aluguel 1', competencia: '01/2025', vencimento: '10/01/2025', valor: '5.000,00', correcao: { modo: 'percentual', percentual: '8' }, pagamentos: [{ data: '10/04/2025', valor: '1.000,00' }] },
    { descricao: 'Aluguel 2', vencimento: '10/02/2025', valor: '2000', correcao: { modo: 'valorCorrigido', valorCorrigido: '2200' }, pagamentos: [] },
  ];
  const resultados = parcelas.map((p) => C.calcularParcela(p, crit));
  const totais = C.consolidar(resultados, { honorariosFixos: C.honorariosFixos(crit), encargosNominais: 50 });
  return { tipo: 'contrato', titulo: 'Planilha de teste', subtitulo: 'Contrato X', identificacao: [['Credor', 'Fulano'], ['Devedor', '']], criterios: [['Juros', '1% a.m.']], parcelas: parcelas.map((p) => ({ descricao: p.descricao, competencia: p.competencia, vencimento: p.vencimento })), resultados, totais, dataFinal: crit.dataFinal, observacoes: 'obs', linhasExtras: [['Rito da prisão', 123.45]] };
}

test('planilha de cálculo: valores, fórmulas e totais coerentes com o motor', () => {
  const o = entrada();
  const wb = Reg.montarPlanilha(o);
  assert.deepEqual(wb.abas.map((a) => a.nome), ['Cálculo', 'Memória', 'Critérios']);
  const z = lerZip(X.gerar(wb));
  const s1 = z['xl/worksheets/sheet1.xml'];
  // linha da primeira parcela: correção por fórmula ROUND(D*E,2) e principal = D+F
  assert.match(s1, /<f>ROUND\(D\d+\*E\d+,2\)<\/f><v>400<\/v>/);
  assert.match(s1, /<f>D\d+\+F\d+<\/f><v>5400<\/v>/);
  // segunda parcela: valor informado (sem fórmula de percentual), principal 2.200
  assert.match(s1, /<f>D\d+\+F\d+<\/f><v>2200<\/v>/);
  // totais por SUM e saldo final = soma dos saldos + honorários fixos + encargos
  assert.match(s1, /<f>SUM\(H\d+:H\d+\)<\/f>/);
  const t = o.totais;
  assert.ok(new RegExp('<f>M[0-9]+[+]D[0-9]+[+]D[0-9]+</f><v>' + t.saldoFinal + '</v>').test(s1), 'saldo final em fórmula');
  assert.equal(t.saldoFinal, R.arredondar(t.saldo + 500 + 50));
  assert.match(s1, /Rito da prisão/);
  assert.doesNotMatch(s1, /não foi calculada por índice oficial/); // o aviso saiu da planilha; a memória de cálculo continua descrevendo o critério
  assert.doesNotMatch(z['xl/worksheets/sheet2.xml'], /manualmente|pelo usuário/);
  assert.match(z['xl/worksheets/sheet3.xml'], /Juros/);
});

test('saldo por linha em fórmula bate com o saldo do motor', () => {
  const o = entrada();
  o.resultados.forEach((r) => assert.equal(R.arredondar(r.principalCorrigido + r.juros + r.multa + r.honorarios - r.pagamentos + r.creditoNaoImputado), r.saldo));
});

test('nome do arquivo é seguro', () => {
  const { nome } = Reg.baixarPlanilha(entrada(), 'Débito: Fulano / 2025!');
  assert.equal(nome, 'Debito-Fulano-2025-planilha.xlsx');
});
