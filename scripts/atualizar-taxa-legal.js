/*
 * Atualiza dados/taxa-legal.json e dados/taxa-legal-oficial.json (taxa legal do art. 406 do Código Civil,
 * Resolução CMN 5.171/2024). Robô SEPARADO do de índices (scripts/atualizar-indices.js), que não é tocado por este.
 * Executado diariamente por .github/workflows/taxa-legal.yml; também pode ser rodado à mão: node scripts/atualizar-taxa-legal.js
 *
 * Fontes: Selic anualizada diária (BCB/SGS 1178), IPCA-15 mensal (IBGE/SIDRA, tabela 3065, variável 355) e as
 * taxas oficiais divulgadas pelo Banco Central (SGS 29543 taxa legal, 29541 fator Selic, 29542 fator IPCA).
 * A taxa de cada mês é calculada pela Resolução e conferida contra a oficial: se divergir mais de 0,000001,
 * o robô falha sem gravar nada. Quando existe valor oficial, ele prevalece (fonte "oficial").
 */
'use strict';
const fs = require('fs');
const path = require('path');
const K = require('../js/calculo.js');

const SGS = { SELIC_ANUAL: 1178, TAXA_LEGAL: 29543, FATOR_SELIC: 29541, FATOR_IPCA: 29542 };
const INICIO = '2024-07'; // primeiro mês anterior ao de referência (ago/2024, primeira taxa legal)
const TOLERANCIA = 0.000001;
const DIR = path.join(__dirname, '..', 'dados');
const ARQ_TAXA = path.join(DIR, 'taxa-legal.json');
const ARQ_OFICIAL = path.join(DIR, 'taxa-legal-oficial.json');

const proximoMes = (am) => {
  let a = Number(am.slice(0, 4)); let m = Number(am.slice(5, 7)) + 1;
  if (m > 12) { m = 1; a += 1; }
  return `${a}-${String(m).padStart(2, '0')}`;
};
const mesAnterior = (am) => {
  let a = Number(am.slice(0, 4)); let m = Number(am.slice(5, 7)) - 1;
  if (m < 1) { m = 12; a -= 1; }
  return `${a}-${String(m).padStart(2, '0')}`;
};

function partesHoje() {
  const f = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date());
  return { br: f, mes: `${f.slice(6)}-${f.slice(3, 5)}`, ano: Number(f.slice(6)) };
}

// [{ data: '02/07/2024', valor: '10.40' }] -> { '2024-07-02': 10.4 }
function converterDiaria(lista) {
  if (!Array.isArray(lista)) throw new Error('resposta inesperada do Banco Central');
  const out = {};
  lista.forEach((i) => {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(i && i.data));
    const v = Number(String((i && i.valor) ?? '').trim().replace(',', '.'));
    if (m && Number.isFinite(v)) out[`${m[3]}-${m[2]}-${m[1]}`] = v;
  });
  return out;
}

// [{ data: '01/08/2024', valor: '0.605306' }] -> { '2024-08': 0.605306 }
function converterMensal(lista) {
  if (!Array.isArray(lista)) throw new Error('resposta inesperada do Banco Central');
  const out = {};
  lista.forEach((i) => {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(i && i.data));
    const v = Number(String((i && i.valor) ?? '').trim().replace(',', '.'));
    if (m && Number.isFinite(v)) out[`${m[3]}-${m[2]}`] = v;
  });
  return out;
}

// Resposta do SIDRA (primeira linha é cabeçalho) -> { '2024-07': 0.3 }
function converterIpca15(lista) {
  if (!Array.isArray(lista)) throw new Error('resposta inesperada do IBGE');
  const out = {};
  lista.slice(1).forEach((i) => {
    const c = String(i && i.D3C);
    const v = Number(i && i.V);
    if (/^\d{6}$/.test(c) && Number.isFinite(v)) out[`${c.slice(0, 4)}-${c.slice(4)}`] = v;
  });
  return out;
}

// Selic diária por mês: { '2024-07': [10.4, ...] } na ordem das datas (dias úteis da própria série).
function agruparPorMes(diaria) {
  const out = {};
  Object.keys(diaria).sort().forEach((d) => { (out[d.slice(0, 7)] ||= []).push(diaria[d]); });
  return out;
}

/*
 * Monta a tabela { 'AAAA-MM': { taxa, fonte, fatorSelic, fatorIpca, diasUteis } } para os meses de referência de ago/2024
 * até mesAtual. O mês m usa a Selic e o IPCA-15 do mês m-1. Lança erro se a calculada divergir da oficial.
 */
function montarTabela({ selicDiaria, ipca15, oficial, mesAtual }) {
  const porMes = agruparPorMes(selicDiaria);
  const taxas = {};
  const divergencias = [];
  for (let m = proximoMes(INICIO); m <= mesAtual; m = proximoMes(m)) {
    const ant = mesAnterior(m);
    const of = oficial.taxaLegal[m];
    let calc = null;
    if (porMes[ant] && ipca15[ant] !== undefined) calc = K.taxaLegalCalculada(porMes[ant], ipca15[ant]);
    if (calc && of !== undefined) {
      const dt = Math.abs(calc.taxa - of);
      const fs_ = oficial.fatorSelic[m]; const fi = oficial.fatorIpca[m];
      if (dt > TOLERANCIA || (fs_ !== undefined && Math.abs(calc.fatorSelic - fs_) > 1e-8) || (fi !== undefined && Math.abs(calc.fatorIpca - fi) > 1e-4)) {
        divergencias.push(`${m}: calculada ${calc.taxa.toFixed(6)} x oficial ${of.toFixed(6)}`);
      }
    }
    if (of !== undefined) taxas[m] = { taxa: of, fonte: 'oficial', ...(calc ? { fatorSelic: calc.fatorSelic, fatorIpca: calc.fatorIpca, diasUteis: calc.diasUteis } : {}) };
    else if (calc) taxas[m] = { taxa: calc.taxa, fonte: 'calculada', fatorSelic: calc.fatorSelic, fatorIpca: calc.fatorIpca, diasUteis: calc.diasUteis };
  }
  if (divergencias.length) throw new Error(`taxa legal calculada diverge da oficial: ${divergencias.join('; ')}`);
  return taxas;
}

async function baixar(url, tentativas = 3) {
  let ultimo;
  for (let i = 1; i <= tentativas; i += 1) {
    try {
      const r = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'central-calculos/1.0 (GitHub Actions)' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      ultimo = e;
      await new Promise((ok) => setTimeout(ok, 2000 * i));
    }
  }
  throw ultimo;
}

const sgs = (codigo, ini, fim) => baixar(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${codigo}/dados?formato=json&dataInicial=${ini}&dataFinal=${fim}`);

async function main() {
  const hoje = partesHoje();
  // A API do SGS limita a consulta de séries diárias: busca por janelas anuais.
  let selicBruta = {};
  for (let a = 2024; a <= hoje.ano; a += 1) {
    const ini = a === 2024 ? '01/07/2024' : `01/01/${a}`;
    const fim = a === hoje.ano ? hoje.br : `31/12/${a}`;
    selicBruta = { ...selicBruta, ...converterDiaria(await sgs(SGS.SELIC_ANUAL, ini, fim)) };
  }
  if (Object.keys(selicBruta).length < 100) throw new Error('Selic diária com poucos dias');
  const ipca15 = converterIpca15(await baixar(`https://apisidra.ibge.gov.br/values/t/3065/n1/all/v/355/p/${INICIO.replace('-', '')}-${hoje.mes.replace('-', '')}`));
  if (Object.keys(ipca15).length < 12) throw new Error('IPCA-15 com poucos meses');
  const oficial = {
    taxaLegal: converterMensal(await sgs(SGS.TAXA_LEGAL, '01/08/2024', hoje.br)),
    fatorSelic: converterMensal(await sgs(SGS.FATOR_SELIC, '01/08/2024', hoje.br)),
    fatorIpca: converterMensal(await sgs(SGS.FATOR_IPCA, '01/08/2024', hoje.br)),
  };
  const taxas = montarTabela({ selicDiaria: selicBruta, ipca15, oficial, mesAtual: hoje.mes });

  const anterior = fs.existsSync(ARQ_TAXA) ? JSON.parse(fs.readFileSync(ARQ_TAXA, 'utf8')) : {};
  const anteriorOficial = fs.existsSync(ARQ_OFICIAL) ? JSON.parse(fs.readFileSync(ARQ_OFICIAL, 'utf8')) : {};
  const novo = { selicDiaria: selicBruta, ipca15, taxas };
  const novoOficial = { taxas: oficial.taxaLegal };
  const mudou = JSON.stringify({ selicDiaria: anterior.selicDiaria, ipca15: anterior.ipca15, taxas: anterior.taxas }) !== JSON.stringify(novo)
    || JSON.stringify(anteriorOficial.taxas) !== JSON.stringify(novoOficial.taxas);
  if (!mudou) { console.log('Sem mudanças na taxa legal.'); return; }

  fs.writeFileSync(ARQ_TAXA, `${JSON.stringify({
    atualizadoEm: hoje.br,
    fonte: 'Banco Central do Brasil (Selic, SGS 1178; taxa legal oficial, SGS 29543), IBGE (IPCA-15, SIDRA 3065) e Resolução CMN 5.171/2024',
    selicDiaria: selicBruta,
    ipca15,
    taxas,
  }, null, 1)}\n`);
  fs.writeFileSync(ARQ_OFICIAL, `${JSON.stringify({
    atualizadoEm: hoje.br,
    fonte: 'Banco Central do Brasil — taxa legal divulgada (SGS 29543)',
    taxas: oficial.taxaLegal,
  }, null, 1)}\n`);
  const meses = Object.keys(taxas);
  console.log(`dados/taxa-legal.json atualizado em ${hoje.br}: ${meses.length} meses, até ${meses[meses.length - 1]}.`);
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { SGS, converterDiaria, converterMensal, converterIpca15, agruparPorMes, montarTabela, proximoMes, mesAnterior };
