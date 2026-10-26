/*
 * Gerador de planilhas .xlsx sem dependências (Open XML + ZIP sem compressão).
 * Usado para a "planilha de cálculo" que todo calculador gera ao final do resultado.
 * Funciona no navegador (window.CentralXlsx) e no Node (testes).
 *
 * Uso:
 *   const X = CentralXlsx;
 *   const bytes = X.gerar({ abas: [{ nome: 'Cálculo', larguras: [6, 30, 16], linhas: [
 *     [X.T('Título', 'titulo')],
 *     [X.T('Item', 'cabecalho'), X.T('Valor', 'cabecalho')],
 *     [X.T('A'), X.N(10, 'moeda')],
 *     [X.T('Total', 'rotulo'), X.F('SUM(B3:B3)', 10, 'totalMoeda')],
 *   ] }] });
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CentralXlsx = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Estilos disponíveis (índice em cellXfs).
  const ESTILOS = { padrao: 0, titulo: 1, cabecalho: 2, moeda: 3, percentual: 4, texto: 5, totalMoeda: 6, totalTexto: 7, rotulo: 8, destaque: 9, nota: 10, numero: 11 };

  const T = (texto, estilo) => ({ tipo: 't', v: texto === null || texto === undefined ? '' : String(texto), s: estilo || 'padrao' });
  const N = (numero, estilo) => ({ tipo: 'n', v: Number(numero), s: estilo || 'padrao' });
  const F = (formula, cache, estilo) => ({ tipo: 'f', f: String(formula).replace(/^=/, ''), v: Number(cache), s: estilo || 'padrao' });

  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
      // remove caracteres de controle inválidos em XML 1.0
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  }

  function letraColuna(i) {
    let n = i + 1; let s = '';
    while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
    return s;
  }

  function nomeAba(nome, usados) {
    let n = String(nome || 'Planilha').replace(/[\[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Planilha';
    let base = n; let k = 2;
    while (usados.has(n.toLowerCase())) { n = `${base.slice(0, 28)} ${k}`; k += 1; }
    usados.add(n.toLowerCase());
    return n;
  }

  function celulaXml(c, ref) {
    const cel = typeof c === 'number' ? N(c) : (typeof c === 'string' ? T(c) : c);
    if (cel === null || cel === undefined) return '';
    const s = ESTILOS[cel.s] !== undefined ? ESTILOS[cel.s] : 0;
    // Valores em reais são gravados com centavos (sem ruído de ponto flutuante).
    if (['moeda', 'totalMoeda', 'destaque'].includes(cel.s) && Number.isFinite(cel.v)) cel.v = Math.round(cel.v * 100) / 100;
    if (cel.tipo === 'n') return Number.isFinite(cel.v) ? `<c r="${ref}" s="${s}"><v>${cel.v}</v></c>` : `<c r="${ref}" s="${s}"/>`;
    if (cel.tipo === 'f') return `<c r="${ref}" s="${s}"><f>${esc(cel.f)}</f>${Number.isFinite(cel.v) ? `<v>${cel.v}</v>` : ''}</c>`;
    if (cel.v === '') return `<c r="${ref}" s="${s}"/>`;
    return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${esc(cel.v)}</t></is></c>`;
  }

  function abaXml(aba) {
    const linhas = aba.linhas.map((linha, i) => {
      const celulas = linha.map((c, j) => celulaXml(c, `${letraColuna(j)}${i + 1}`)).join('');
      return `<row r="${i + 1}">${celulas}</row>`;
    }).join('');
    const cols = (aba.larguras || []).map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + '<sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/>'
      + (cols ? `<cols>${cols}</cols>` : '')
      + `<sheetData>${linhas}</sheetData>`
      + '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>'
      + '<pageSetup paperSize="9" orientation="landscape" fitToHeight="0"/>'
      + '</worksheet>';
  }

  function estilosXml() {
    const borda = '<border><left/><right/><top style="thin"><color rgb="FF14243A"/></top><bottom/><diagonal/></border>';
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + '<numFmts count="2"><numFmt numFmtId="164" formatCode="&quot;R$&quot;\\ #,##0.00;\\-&quot;R$&quot;\\ #,##0.00"/><numFmt numFmtId="165" formatCode="0.00%"/></numFmts>'
      + '<fonts count="6">'
      + '<font><sz val="11"/><name val="Calibri"/></font>'
      + '<font><b/><sz val="14"/><color rgb="FF14243A"/><name val="Calibri"/></font>'
      + '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>'
      + '<font><b/><sz val="11"/><name val="Calibri"/></font>'
      + '<font><i/><sz val="10"/><color rgb="FF64748B"/><name val="Calibri"/></font>'
      + '<font><b/><sz val="12"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>'
      + '</fonts>'
      + '<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
      + '<fill><patternFill patternType="solid"><fgColor rgb="FF14243A"/><bgColor indexed="64"/></patternFill></fill>'
      + '<fill><patternFill patternType="solid"><fgColor rgb="FF0F8B68"/><bgColor indexed="64"/></patternFill></fill></fills>'
      + `<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>${borda}</borders>`
      + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
      + '<cellXfs count="12">'
      + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'                                                                   // 0 padrão
      + '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>'                                                     // 1 título
      + '<xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' // 2 cabeçalho
      + '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'                                           // 3 moeda
      + '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'                                           // 4 percentual
      + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>'     // 5 texto com quebra
      + '<xf numFmtId="164" fontId="3" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>'             // 6 total moeda
      + '<xf numFmtId="0" fontId="3" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>'                                     // 7 total texto
      + '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>'                                                     // 8 rótulo
      + '<xf numFmtId="164" fontId="5" fillId="3" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1"/>'              // 9 destaque
      + '<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>'                                                     // 10 nota
      + '<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'                                             // 11 número
      + '</cellXfs>'
      + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
      + '</styleSheet>';
  }

  // ---------- ZIP (método "stored", sem compressão) ----------

  let tabelaCrc = null;
  function crc32(bytes) {
    if (!tabelaCrc) {
      tabelaCrc = new Uint32Array(256);
      for (let n = 0; n < 256; n += 1) {
        let c = n;
        for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        tabelaCrc[n] = c >>> 0;
      }
    }
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i += 1) c = tabelaCrc[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function zip(arquivos) {
    const enc = new TextEncoder();
    const agora = new Date();
    const hora = (agora.getHours() << 11) | (agora.getMinutes() << 5) | (agora.getSeconds() >> 1);
    const data = ((agora.getFullYear() - 1980) << 9) | ((agora.getMonth() + 1) << 5) | agora.getDate();
    const partes = [];
    const central = [];
    let deslocamento = 0;
    arquivos.forEach((a) => {
      const nome = enc.encode(a.nome);
      const dados = typeof a.conteudo === 'string' ? enc.encode(a.conteudo) : a.conteudo;
      const crc = crc32(dados);
      const local = new Uint8Array(30 + nome.length);
      const v = new DataView(local.buffer);
      v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x0800, true); v.setUint16(8, 0, true);
      v.setUint16(10, hora, true); v.setUint16(12, data, true); v.setUint32(14, crc, true);
      v.setUint32(18, dados.length, true); v.setUint32(22, dados.length, true); v.setUint16(26, nome.length, true); v.setUint16(28, 0, true);
      local.set(nome, 30);
      partes.push(local, dados);
      const cd = new Uint8Array(46 + nome.length);
      const c = new DataView(cd.buffer);
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
      c.setUint16(12, hora, true); c.setUint16(14, data, true); c.setUint32(16, crc, true);
      c.setUint32(20, dados.length, true); c.setUint32(24, dados.length, true); c.setUint16(28, nome.length, true);
      c.setUint32(42, deslocamento, true);
      cd.set(nome, 46);
      central.push(cd);
      deslocamento += local.length + dados.length;
    });
    const tamanhoCentral = central.reduce((s, x) => s + x.length, 0);
    const fim = new Uint8Array(22);
    const f = new DataView(fim.buffer);
    f.setUint32(0, 0x06054b50, true); f.setUint16(8, arquivos.length, true); f.setUint16(10, arquivos.length, true);
    f.setUint32(12, tamanhoCentral, true); f.setUint32(16, deslocamento, true);
    const todos = partes.concat(central, [fim]);
    const total = todos.reduce((s, x) => s + x.length, 0);
    const saida = new Uint8Array(total);
    let pos = 0;
    todos.forEach((x) => { saida.set(x, pos); pos += x.length; });
    return saida;
  }

  // ---------- Montagem do arquivo ----------

  function gerar(pasta) {
    const usados = new Set();
    const abas = pasta.abas.map((a) => ({ ...a, nome: nomeAba(a.nome, usados) }));
    const arquivos = [
      { nome: '[Content_Types].xml', conteudo: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        + abas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') + '</Types>' },
      { nome: '_rels/.rels', conteudo: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { nome: 'xl/workbook.xml', conteudo: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
        + abas.map((a, i) => `<sheet name="${esc(a.nome)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>' },
      { nome: 'xl/_rels/workbook.xml.rels', conteudo: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + abas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
        + `<Relationship Id="rId${abas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
      { nome: 'xl/styles.xml', conteudo: estilosXml() },
    ].concat(abas.map((a, i) => ({ nome: `xl/worksheets/sheet${i + 1}.xml`, conteudo: abaXml(a) })));
    return zip(arquivos);
  }

  return { gerar, T, N, F, ESTILOS, letraColuna, crc32 };
});
