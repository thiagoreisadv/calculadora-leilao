/*
 * Utilitários locais da Central de Cálculos: leitura e formatação de valores e datas,
 * arredondamento e exportação CSV. Não há nenhuma chamada de rede neste arquivo.
 * Funciona no navegador (window.CentralRegras) e no Node (testes).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CentralRegras = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const LIMITE_PARCELAS = 200;

  // ---------- Valores monetários ----------

  // Arredondamento comercial (meio afastado do zero), sem os erros de ponto flutuante de toFixed.
  function arredondar(valor) {
    const n = Number(valor);
    if (!Number.isFinite(n)) return 0;
    const sinal = n < 0 ? -1 : 1;
    return sinal * Number(Math.round(Number(Math.abs(n) + 'e2')) + 'e-2');
  }

  // Lê "1.234,56", "1234,56", "1234.56" ou número. Devolve NaN quando não é um valor válido.
  function lerValor(entrada) {
    if (typeof entrada === 'number') return Number.isFinite(entrada) ? entrada : NaN;
    if (entrada === null || entrada === undefined) return NaN;
    let s = String(entrada).trim().replace(/^R\$\s*/i, '').replace(/\s/g, '');
    if (s === '') return NaN;
    let negativo = false;
    if (s.startsWith('-')) { negativo = true; s = s.slice(1); }
    if (!/^[\d.,]+$/.test(s)) return NaN;
    if (s.includes(',')) {
      if ((s.match(/,/g) || []).length > 1) return NaN;
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
      s = s.replace(/\./g, '');
    } else if ((s.match(/\./g) || []).length > 1) {
      return NaN;
    }
    const n = Number(s);
    return Number.isFinite(n) ? (negativo ? -n : n) : NaN;
  }

  // ---------- Máscara de digitação de valores (R$) ----------

  // Formata enquanto o usuário digita: "1234567,8" -> "1.234.567,8". A vírgula é opcional
  // e aceita até 2 casas; os pontos de milhar são sempre recolocados pela máscara.
  function formatarDigitacaoMoeda(texto) {
    const s = String(texto === null || texto === undefined ? '' : texto).replace(/[^\d,]/g, '');
    const i = s.indexOf(',');
    let inteiro = (i === -1 ? s : s.slice(0, i)).replace(/^0+(?=\d)/, '');
    const decimal = i === -1 ? null : s.slice(i + 1).replace(/,/g, '').slice(0, 2);
    if (inteiro === '' && decimal !== null) inteiro = '0';
    inteiro = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return decimal === null ? inteiro : `${inteiro},${decimal}`;
  }

  const significativos = (t) => String(t || '').replace(/[^\d,]/g, '');

  // Aplica a máscara a uma edição do campo sem tirar o cursor do lugar.
  // anterior: texto antes da tecla; bruto/cursor: valor e posição do cursor depois dela;
  // tipo/dado: inputType e data do evento de entrada (InputEvent).
  // O cursor é recolocado contando os dígitos (e a vírgula) que ficaram à sua direita,
  // pois a pontuação inserida pela máscara não muda essa contagem.
  function editarDigitacaoMoeda(anterior, bruto, cursor, tipo, dado) {
    let texto = String(bruto || '');
    let pos = Math.max(0, Math.min(cursor === null || cursor === undefined ? texto.length : cursor, texto.length));
    // Ponto do teclado numérico (layout americano) vira vírgula decimal
    if (dado === '.' && texto[pos - 1] === '.') texto = `${texto.slice(0, pos - 1)},${texto.slice(pos)}`;
    // Apagar um ponto de milhar apaga o dígito vizinho; sem isso a máscara o recoloca e o cursor "trava"
    if (significativos(texto) === significativos(anterior)) {
      if (tipo === 'deleteContentBackward' && pos > 0) { texto = texto.slice(0, pos - 1) + texto.slice(pos); pos -= 1; }
      else if (tipo === 'deleteContentForward') texto = texto.slice(0, pos) + texto.slice(pos + 1);
    }
    const aDireita = significativos(texto.slice(pos)).length;
    const valor = formatarDigitacaoMoeda(texto);
    let p = valor.length;
    for (let n = 0; p > 0 && n < aDireita;) { p -= 1; if (/[\d,]/.test(valor[p])) n += 1; }
    return { valor, cursor: p };
  }

  // Valor numérico já gravado -> texto do campo ("1500" -> "1.500,00"); vazio quando não há valor.
  function textoCampoMoeda(valor) {
    if (valor === '' || valor === null || valor === undefined) return '';
    const n = lerValor(valor);
    if (Number.isNaN(n)) return '';
    return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatarMoeda(valor) {
    const n = Number(valor);
    return (Number.isFinite(n) ? n : 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function formatarPercentual(valor, casas) {
    const n = Number(valor);
    const c = casas === undefined ? 2 : casas;
    return (Number.isFinite(n) ? n : 0).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c }) + '%';
  }

  // ---------- Datas (DD/MM/AAAA) ----------

  function lerData(texto) {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(texto || '').trim());
    if (!m) return null;
    const d = Number(m[1]), mes = Number(m[2]), a = Number(m[3]);
    const dt = new Date(Date.UTC(a, mes - 1, d));
    if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== mes - 1 || dt.getUTCDate() !== d) return null;
    return { dia: d, mes, ano: a, ts: dt.getTime() };
  }

  function dataEhValida(texto) { return lerData(texto) !== null; }

  function isoParaBR(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
  }

  function brParaISO(br) {
    const d = lerData(br);
    if (!d) return '';
    return `${String(d.ano).padStart(4, '0')}-${String(d.mes).padStart(2, '0')}-${String(d.dia).padStart(2, '0')}`;
  }

  function hojeBR() {
    const h = new Date();
    return `${String(h.getDate()).padStart(2, '0')}/${String(h.getMonth() + 1).padStart(2, '0')}/${h.getFullYear()}`;
  }

  // Soma meses a uma data DD/MM/AAAA; se o dia não existir no mês de destino, usa o último dia do mês.
  function adicionarMeses(dataBR, n) {
    const d = lerData(dataBR);
    if (!d) return '';
    const total = d.ano * 12 + (d.mes - 1) + n;
    const ano = Math.floor(total / 12);
    const mes = ((total % 12) + 12) % 12;
    const ultimo = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
    const dia = Math.min(d.dia, ultimo);
    return `${String(dia).padStart(2, '0')}/${String(mes + 1).padStart(2, '0')}/${ano}`;
  }

  // Aceita "MM/AAAA" e devolve "01/MM/AAAA".
  function competenciaParaData(comp) {
    const m = /^(\d{2})\/(\d{4})$/.exec(String(comp || '').trim());
    if (!m) return '';
    const mes = Number(m[1]);
    if (mes < 1 || mes > 12) return '';
    return `01/${m[1]}/${m[2]}`;
  }

  // ---------- CSV (padrão brasileiro: ; como separador, vírgula decimal, BOM para o Excel) ----------

  function celulaCSV(v) {
    let s = v === null || v === undefined ? '' : String(v);
    // Evita que o Excel trate texto como fórmula (injeção de fórmulas em planilhas).
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s = "'" + s;
    if (/[";\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function numeroCSV(n) {
    if (n === null || n === undefined || !Number.isFinite(Number(n))) return '';
    return Number(n).toFixed(2).replace('.', ',');
  }

  function gerarCSV(cabecalho, linhas) {
    const corpo = [cabecalho].concat(linhas).map((l) => l.map(celulaCSV).join(';')).join('\r\n');
    return '﻿' + corpo + '\r\n';
  }

  function escaparHtml(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  return {
    LIMITE_PARCELAS, arredondar, lerValor, formatarMoeda, formatarPercentual,
    formatarDigitacaoMoeda, editarDigitacaoMoeda, textoCampoMoeda,
    lerData, dataEhValida, isoParaBR, brParaISO, hojeBR, adicionarMeses, competenciaParaData,
    celulaCSV, numeroCSV, gerarCSV, escaparHtml,
  };
});
