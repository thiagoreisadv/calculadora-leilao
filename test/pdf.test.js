// Testes do gerador de PDF e do PDF do cálculo. Rode com: node --test test/
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.CentralXlsx = require('../js/xlsx.js');
globalThis.CentralRegras = require('../js/regras.js');
const P = require('../js/pdf.js');
globalThis.CentralPdf = P;
const C = require('../js/calculo.js');
globalThis.localStorage = { getItem: () => JSON.stringify({ advName: 'Advogado Teste', advOab: 'OAB/PR 1' }) };
require('../js/registro.js');
const Reg = globalThis.CentralRegistro;

const texto = (bytes) => Buffer.from(bytes).toString('latin1');

// Confere que o xref aponta para os "N 0 obj" certos e que o arquivo fecha com %%EOF.
function validarEstrutura(bytes) {
  const t = texto(bytes);
  assert.ok(t.startsWith('%PDF-1.4'));
  assert.ok(t.trimEnd().endsWith('%%EOF'));
  const inicio = Number(/startxref\n(\d+)\n%%EOF/.exec(t)[1]);
  assert.ok(t.slice(inicio).startsWith('xref'));
  const m = /xref\n0 (\d+)\n/.exec(t.slice(inicio));
  const n = Number(m[1]);
  const entradas = [...t.slice(inicio).matchAll(/(\d{10}) (\d{5}) ([nf]) \n/g)];
  assert.equal(entradas.length, n);
  entradas.slice(1).forEach((e, i) => {
    const off = Number(e[1]);
    assert.ok(t.slice(off).startsWith(`${i + 1} 0 obj`), `objeto ${i + 1} no offset ${off}`);
  });
  // /Length de cada stream confere com o conteúdo
  [...t.matchAll(/\/Length (\d+) >>\nstream\n/g)].forEach((s) => {
    const ini = s.index + s[0].length;
    assert.equal(t.slice(ini + Number(s[1]), ini + Number(s[1]) + 10), '\nendstream');
  });
  return t;
}

test('quebra de texto respeita a largura e corta palavras longas', () => {
  const linhas = P.quebrar('uma frase um pouco longa para quebrar em varias linhas dentro da caixa', 100, 9, false);
  assert.ok(linhas.length > 2);
  linhas.forEach((l) => assert.ok(P.largura(l, 9, false) <= 100.5));
  const longa = P.quebrar('Supercalifragilisticexpialidocious-sem-espacos', 60, 9, false);
  longa.forEach((l) => assert.ok(P.largura(l, 9, false) <= 60.5));
  assert.equal(P.quebrar('a\nb', 100, 9, false).length, 2);
});

test('acentos e símbolos viram WinAnsi sem quebrar o arquivo', () => {
  assert.equal(P.hex('ção'), 'e7e36f');
  assert.equal(P.hex('—'), '97');
  assert.equal(P.hex('−'), '2d'); // sinal de menos Unicode vira hífen
  assert.equal(P.hex('→'), '2d3e');
});

test('documento simples: estrutura válida, várias páginas e cabeçalho de tabela repetido', () => {
  const doc = P.criar({ orientacao: 'retrato', titulo: 'Teste', rodape: 'rodapé' });
  doc.titulo('Título'); doc.par('Rótulo', 'Valor'); doc.secao('Seção');
  const linhas = Array.from({ length: 120 }, (_, i) => [`Item ${i + 1}`, `R$ ${i},00`]);
  doc.tabela({ colunas: [{ titulo: 'Item', peso: 3 }, { titulo: 'Valor', peso: 1, alinhar: 'd' }], linhas, rodape: ['Total', 'R$ 0,00'] });
  const bytes = doc.gerar();
  const t = validarEstrutura(bytes);
  const paginas = Number(/\/Count (\d+)/.exec(t)[1]);
  assert.ok(paginas >= 3);
  assert.match(t, new RegExp(`${P.hex(`Página ${paginas} de ${paginas}`)}`));
  // o cabeçalho "Item" é redesenhado em cada página
  assert.ok((t.match(new RegExp(`<${P.hex('Item')}> Tj`, 'g')) || []).length >= paginas);
});

function entrada() {
  const crit = { ...C.criteriosPadrao(), dataFinal: '10/07/2025', juros: { ativo: true, percentual: '1', periodicidade: 'mensal', modalidade: 'simples' }, multa: { ativo: true, percentual: '2' } };
  const parcelas = [
    { descricao: 'Aluguel 1', competencia: '01/2025', vencimento: '10/01/2025', valor: '5.000,00', correcao: { modo: 'percentual', percentual: '8' }, pagamentos: [{ data: '10/04/2025', valor: '1.000,00' }] },
    { descricao: 'Aluguel 2', vencimento: '10/02/2025', valor: '2000', correcao: { modo: 'valorCorrigido', valorCorrigido: '2200' }, pagamentos: [] },
  ];
  const resultados = parcelas.map((p) => C.calcularParcela(p, crit));
  const totais = C.consolidar(resultados, { honorariosFixos: 0, encargosNominais: 50 });
  return { tipo: 'contrato', titulo: 'Memória de cálculo — Teste', subtitulo: 'Contrato X', identificacao: [['Credor', 'Fulano de Tal'], ['Devedor', 'Ciclano']], criterios: [['Juros', '1,00% ao mês, simples']], parcelas: parcelas.map((p) => ({ descricao: p.descricao, competencia: p.competencia, vencimento: p.vencimento })), resultados, totais, dataFinal: crit.dataFinal, observacoes: 'Observação importante.' };
}

test('PDF do cálculo traz identificação, correção manual, tabela, memória e total', () => {
  const { bytes, nome } = Reg.baixarPdf(entrada(), 'Débito: Fulano');
  assert.equal(nome, 'Debito-Fulano-calculo.pdf');
  const t = validarEstrutura(bytes);
  const tem = (s) => assert.ok(t.includes(`<${P.hex(s)}> Tj`) || t.includes(P.hex(s)), s);
  tem('Memória de cálculo — Teste');
  tem('Fulano de Tal');
  tem('Saldo final atualizado');
  tem('DETALHAMENTO POR PARCELA');
  tem('MEMÓRIA DE CÁLCULO');
  tem('Aluguel 1 (01/2025)');
  tem('Observação importante.');
  assert.ok(t.includes(P.hex('Correção monetária (informada)')) || t.includes(P.hex('Correção')), 'coluna de correção informada');
});

test('PDF das calculadoras simples (leilão/escritura) a partir das linhas da planilha', () => {
  const m = Reg.montador();
  Reg.cabecalhoPlanilha(m, 'Planilha de cálculo — Teste', [['Cliente', 'Maria']]);
  m.secao('Custos');
  const a = m.item('Lance', 1000);
  m.item('Comissão', 50, 'moeda', '5% sobre o lance');
  m.formula('TOTAL', `SUM(C${a}:C${m.linhas.length})`, 1050, 'destaque');
  m.vazio(); m.secao('Resultado');
  m.formula('ROI', 'C9/C10', 0.1645, 'percentual');
  m.nota('Nota final.');
  const { bytes, nome } = Reg.baixarPdfSimples(m.linhas, [['Modo', 'Teste']], 'Análise Teste', 'Análise Teste');
  assert.equal(nome, 'Analise-Teste-calculo.pdf');
  const t = validarEstrutura(bytes);
  [P.hex('Maria'), P.hex('Lance'), P.hex('5% sobre o lance'), P.hex('TOTAL')].forEach((h) => assert.ok(t.includes(h), h));
  // Notas de aviso ficam só na planilha Excel; o PDF traz apenas os valores
  assert.ok(!t.includes(P.hex('Nota final.')));
  assert.ok(t.includes(P.hex(globalThis.CentralRegras.formatarMoeda(1050))));
  assert.ok(t.includes(P.hex('16,45%')));
});

test('PDF do demonstrativo não traz avisos (análise do caso, preenchimento manual, fonte sem índice)', () => {
  const t = validarEstrutura(Reg.baixarPdf(entrada(), 'Débito').bytes);
  ['não substitui', 'manualmente', 'pelo usuário', 'Fonte dos dados'].forEach((x) => assert.ok(!t.includes(P.hex(x)), x));
});

test('correção por índice: Excel com percentual e fórmula, PDF com a fonte do Banco Central', () => {
  C.definirIndices({ atualizadoEm: '10/07/2025', series: { IPCA: { codigo: 433, valores: { '2025-01': 0.16, '2025-02': 1.31, '2025-03': 0.56, '2025-04': 0.43, '2025-05': 0.26, '2025-06': 0.24 } } } });
  const crit = { ...C.criteriosPadrao(), dataFinal: '10/07/2025' };
  const parcelas = [{ descricao: 'Aluguel', vencimento: '10/01/2025', valor: '1000', correcao: { modo: 'indice', indice: 'IPCA' }, pagamentos: [] }];
  const resultados = parcelas.map((x) => C.calcularParcela(x, crit));
  const o = { tipo: 'contrato', titulo: 'Memória — índice', parcelas: [{ descricao: 'Aluguel', vencimento: '10/01/2025' }], resultados, totais: C.consolidar(resultados), dataFinal: crit.dataFinal, criterios: [] };
  const reg = Reg.montarCalculo(o);
  assert.match(reg.fonte, /Banco Central/);
  assert.ok(reg.resumo.some((l) => /Correção monetária/.test(l[0])));
  const t = validarEstrutura(Reg.pdfDeRegistro(reg));
  assert.ok(t.includes(P.hex('IPCA')));
  const plan = Reg.montarPlanilha(o);
  assert.ok(JSON.stringify(plan).includes('ROUND('), 'correção por índice usa a mesma fórmula da planilha');
  C.definirIndices(null);
});
