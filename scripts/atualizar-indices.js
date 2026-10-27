/*
 * Atualiza dados/indices.json com as variações mensais (%) dos índices de correção e o salário mínimo, a partir das séries
 * do Banco Central (SGS). Executado diariamente pelo GitHub Actions (.github/workflows/indices.yml);
 * também pode ser rodado à mão: node scripts/atualizar-indices.js
 *
 * Só grava o arquivo quando algum valor muda. Se uma série falhar, mantém os valores anteriores dela.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SERIES = {
  IPCA: { codigo: 433, nome: 'IPCA' },
  INPC: { codigo: 188, nome: 'INPC' },
  IGPM: { codigo: 189, nome: 'IGP-M' },
  IPCAE: { codigo: 10764, nome: 'IPCA-E' },
  // Valor em R$ (não é variação): base da pensão fixada em percentual do salário mínimo.
  SALARIO_MINIMO: { codigo: 1619, nome: 'Salário mínimo', tipo: 'valor' },
};
const ARQUIVO = path.join(__dirname, '..', 'dados', 'indices.json');
const INICIO = '01/07/1994'; // Plano Real

// [{ data: '01/01/2025', valor: '0.16' }] -> { '2025-01': 0.16 }
function converterSerie(lista) {
  if (!Array.isArray(lista)) throw new Error('resposta inesperada do Banco Central');
  const valores = {};
  lista.forEach((item) => {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(item && item.data));
    const texto = String(item && item.valor !== undefined && item.valor !== null ? item.valor : '').trim();
    const v = Number(texto.replace(',', '.'));
    if (m && texto !== '' && Number.isFinite(v)) valores[`${m[3]}-${m[2]}`] = v;
  });
  return valores;
}

// Conferência mínima para não gravar dados corrompidos.
function validarValores(chave, valores, tipo) {
  const meses = Object.keys(valores);
  if (meses.length < 12) throw new Error(`${chave}: poucos meses (${meses.length})`);
  const [min, max] = tipo === 'valor' ? [50, 100000] : [-30, 100];
  const fora = meses.filter((k) => valores[k] < min || valores[k] > max);
  if (fora.length) throw new Error(`${chave}: valores fora do esperado em ${fora.join(', ')}`);
}

function hojeBR() {
  const p = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date());
  return p;
}

async function baixar(codigo, tentativas = 3) {
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${codigo}/dados?formato=json&dataInicial=${INICIO}&dataFinal=${hojeBR()}`;
  let ultimoErro;
  for (let i = 1; i <= tentativas; i += 1) {
    try {
      const r = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'central-calculos/1.0 (GitHub Actions)' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      ultimoErro = e;
      await new Promise((ok) => setTimeout(ok, 2000 * i));
    }
  }
  throw ultimoErro;
}

async function main() {
  const anterior = fs.existsSync(ARQUIVO) ? JSON.parse(fs.readFileSync(ARQUIVO, 'utf8')) : { series: {} };
  const series = {};
  let falhas = 0;
  for (const [chave, s] of Object.entries(SERIES)) {
    try {
      const valores = converterSerie(await baixar(s.codigo));
      validarValores(chave, valores, s.tipo);
      series[chave] = { codigo: s.codigo, nome: s.nome, ...(s.tipo ? { tipo: s.tipo } : {}), valores };
      const meses = Object.keys(valores).sort();
      console.log(`${chave}: ${meses.length} meses, até ${meses[meses.length - 1]}`);
    } catch (e) {
      falhas += 1;
      console.error(`${chave}: falhou (${e.message}); mantendo os valores anteriores`);
      if (anterior.series && anterior.series[chave]) series[chave] = anterior.series[chave];
    }
  }
  if (falhas === Object.keys(SERIES).length) { console.error('Nenhuma série foi atualizada.'); process.exit(1); }
  if (JSON.stringify(series) === JSON.stringify(anterior.series || {})) { console.log('Sem mudanças nos índices.'); return; }
  const dados = { atualizadoEm: hojeBR(), fonte: 'Banco Central do Brasil — Sistema Gerenciador de Séries Temporais (SGS)', series };
  fs.writeFileSync(ARQUIVO, `${JSON.stringify(dados, null, 2)}\n`);
  console.log(`dados/indices.json atualizado em ${dados.atualizadoEm}.`);
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { SERIES, converterSerie, validarValores };
