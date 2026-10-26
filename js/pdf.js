/*
 * Gerador de PDF sem dependências (PDF 1.4, fontes padrão Helvetica, codificação WinAnsi).
 * Usado para baixar a planilha de cálculo em PDF: texto, tabelas com quebra de linha e paginação,
 * cabeçalho de tabela repetido e rodapé numerado. Funciona no navegador (window.CentralPdf) e no Node.
 *
 *   const doc = CentralPdf.criar({ orientacao: 'paisagem', titulo: 'Meu cálculo', rodape: 'Gerado em ...' });
 *   doc.titulo('Título'); doc.par('Credor', 'Fulano');
 *   doc.tabela({ colunas: [{ titulo: 'Item', peso: 3 }, { titulo: 'Valor', peso: 1, alinhar: 'd' }], linhas: [['A', 'R$ 1,00']], rodape: ['Total', 'R$ 1,00'] });
 *   const bytes = doc.gerar();   // Uint8Array
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CentralPdf = factory();
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  // Larguras (1/1000 em) dos caracteres ASCII 32..126 em Helvetica e Helvetica-Bold.
  const LARG = [
    [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
      1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
      333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584],
    [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
      975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
      333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584],
  ];

  // Caracteres fora do ASCII que existem em WinAnsi (cp1252) e substituições para os que não existem.
  const ESPECIAIS = { '—': 0x97, '–': 0x96, '•': 0x95, '“': 0x93, '”': 0x94, '‘': 0x91, '’': 0x92, '…': 0x85, '€': 0x80 };
  const SUBST = { '−': '-', '→': '->', '≥': '>=', '≤': '<=', '≠': '!=', '✓': 'OK' };

  function codigo(ch) {
    const c = ch.charCodeAt(0);
    if (ESPECIAIS[ch] !== undefined) return ESPECIAIS[ch];
    if (c >= 32 && c <= 126) return c;
    if (c >= 160 && c <= 255) return c;
    return 63; // '?'
  }

  function preparar(texto) {
    let s = String(texto === null || texto === undefined ? '' : texto);
    Object.keys(SUBST).forEach((k) => { if (k.length === 1 && k.charCodeAt(0) > 126) s = s.split(k).join(SUBST[k]); });
    return s.replace(/[\r\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  }

  function larguraCaractere(ch, negrito) {
    const c = ch.charCodeAt(0);
    if (c >= 32 && c <= 126) return LARG[negrito ? 1 : 0][c - 32];
    if (ESPECIAIS[ch] === 0x97) return 1000;
    if (ESPECIAIS[ch] === 0x96) return 556;
    if (ESPECIAIS[ch] === 0x95) return 350;
    if (c === 160) return 278;
    // letras acentuadas têm a largura da letra-base
    const base = ch.normalize('NFD')[0];
    if (base && base !== ch && base.charCodeAt(0) < 127) return LARG[negrito ? 1 : 0][base.charCodeAt(0) - 32];
    return 556;
  }

  function largura(texto, tam, negrito) {
    let t = 0;
    for (const ch of preparar(texto)) t += larguraCaractere(ch, negrito);
    return (t * tam) / 1000;
  }

  function hex(texto) {
    let h = '';
    for (const ch of preparar(texto)) h += codigo(ch).toString(16).padStart(2, '0');
    return h;
  }

  // Quebra o texto em linhas que caibam em "max" pontos.
  function quebrar(texto, max, tam, negrito) {
    const linhas = [];
    String(texto === null || texto === undefined ? '' : texto).split('\n').forEach((paragrafo) => {
      const palavras = preparar(paragrafo).split(/ +/);
      let atual = '';
      palavras.forEach((palavra) => {
        let p = palavra;
        while (largura(p, tam, negrito) > max && p.length > 1) { // palavra maior que a coluna: corta
          let n = p.length - 1;
          while (n > 1 && largura(p.slice(0, n), tam, negrito) > max) n -= 1;
          if (atual) { linhas.push(atual); atual = ''; }
          linhas.push(p.slice(0, n));
          p = p.slice(n);
        }
        const tentativa = atual ? `${atual} ${p}` : p;
        if (!atual || largura(tentativa, tam, negrito) <= max) atual = tentativa;
        else { linhas.push(atual); atual = p; }
      });
      linhas.push(atual);
    });
    return linhas;
  }

  const COR = { navy: '0.078 0.141 0.227', cinza: '0.392 0.455 0.545', texto: '0.118 0.161 0.231', branco: '1 1 1', verde: '0.059 0.545 0.408', borda: '0.886 0.910 0.941', fundo: '0.957 0.969 0.984', vermelho: '0.725 0.110 0.110' };

  function criar(opcoes) {
    const op = opcoes || {};
    const paisagem = op.orientacao !== 'retrato';
    const W = paisagem ? 841.89 : 595.28;
    const H = paisagem ? 595.28 : 841.89;
    const M = 36;
    const util = W - 2 * M;
    const paginas = [];
    let cont = null;
    let y = 0;

    function nova() { cont = []; paginas.push(cont); y = H - M; }
    function garantir(h) { if (!cont || y - h < M + 22) nova(); }
    function texto(x, yb, str, tam, negrito, cor, alinhar, larguraCaixa) {
      let px = x;
      if (alinhar === 'd') px = x + larguraCaixa - largura(str, tam, negrito);
      else if (alinhar === 'c') px = x + (larguraCaixa - largura(str, tam, negrito)) / 2;
      cont.push(`BT /F${negrito ? 2 : 1} ${tam} Tf ${cor || COR.texto} rg ${px.toFixed(2)} ${yb.toFixed(2)} Td <${hex(str)}> Tj ET`);
    }
    function retangulo(x, yb, w, h, cor) { cont.push(`${cor} rg ${x.toFixed(2)} ${yb.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`); }
    function linha(x1, y1, x2, y2, cor, esp) { cont.push(`${cor} RG ${esp || 0.5} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`); }

    const api = {
      titulo(t) { garantir(30); texto(M, y - 16, t, 16, true, COR.navy); y -= 22; linha(M, y - 2, M + util, y - 2, COR.navy, 1.5); y -= 10; },
      subtitulo(t) { const ls = quebrar(t, util, 10, false); garantir(ls.length * 13 + 4); ls.forEach((l) => { texto(M, y - 10, l, 10, false, COR.cinza); y -= 13; }); y -= 4; },
      espaco(h) { y -= h; },
      secao(t) { garantir(34); y -= 8; texto(M, y - 10, t.toUpperCase(), 10, true, COR.navy); y -= 14; linha(M, y, M + util, y, COR.borda, 0.8); y -= 6; },
      par(rotulo, valor) {
        const colR = Math.min(270, util * 0.36);
        const lr = quebrar(rotulo, colR - 10, 9, false);
        const ls = quebrar(valor, util - colR - 8, 9, true);
        const n = Math.max(lr.length, ls.length);
        garantir(n * 12 + 2);
        lr.forEach((l, i) => texto(M, y - 9 - i * 12, l, 9, false, COR.cinza));
        ls.forEach((l, i) => texto(M + colR, y - 9 - i * 12, l, 9, true, COR.texto));
        y -= n * 12 + 2;
      },
      paragrafo(t, o) {
        const tam = (o && o.tam) || 9; const ent = tam + 3;
        const ls = quebrar(t, util, tam, false);
        ls.forEach((l) => { garantir(ent); texto(M, y - tam, l, tam, false, (o && o.cor) || COR.texto); y -= ent; });
        y -= 2;
      },
      lista(itens, o) {
        const tam = (o && o.tam) || 9; const ent = tam + 3;
        itens.forEach((it, i) => {
          const ls = quebrar(it, util - 22, tam, false);
          garantir(ent);
          texto(M, y - tam, `${i + 1}.`, tam, true, COR.cinza);
          ls.forEach((l, k) => { if (k > 0) garantir(ent); texto(M + 22, y - tam, l, tam, false, COR.texto); y -= ent; });
        });
        y -= 2;
      },
      destaque(rotulo, valor) {
        garantir(40); y -= 6;
        retangulo(M, y - 30, util, 30, COR.navy);
        texto(M + 12, y - 19, rotulo, 11, true, COR.branco);
        texto(M, y - 20, valor, 15, true, COR.branco, 'd', util - 12);
        y -= 36;
      },
      alerta(t) {
        const ls = quebrar(t, util - 16, 9, true);
        garantir(ls.length * 12 + 12);
        retangulo(M, y - ls.length * 12 - 8, util, ls.length * 12 + 8, '1 0.984 0.922');
        ls.forEach((l, i) => texto(M + 8, y - 12 - i * 12, l, 9, true, '0.573 0.251 0.055'));
        y -= ls.length * 12 + 14;
      },
      tabela(t) {
        const tam = t.tam || 8; const ent = tam + 2.6; const pad = 4;
        const pesos = t.colunas.map((c) => c.peso || 1);
        const somaPesos = pesos.reduce((s, p) => s + p, 0);
        const larg = pesos.map((p) => (util * p) / somaPesos);
        const posX = []; larg.reduce((x, w, i) => { posX[i] = x; return x + w; }, M);
        const cab = t.colunas.map((c, i) => quebrar(c.titulo, larg[i] - 2 * pad, tam, true));
        const alturaCab = Math.max(...cab.map((l) => l.length)) * ent + 2 * pad;
        function desenharCab() {
          garantir(alturaCab + ent * 2 + 2 * pad);
          retangulo(M, y - alturaCab, util, alturaCab, COR.navy);
          cab.forEach((ls, i) => ls.forEach((l, k) => texto(posX[i] + pad, y - pad - tam - k * ent + 1, l, tam, true, COR.branco, t.colunas[i].alinhar, larg[i] - 2 * pad)));
          y -= alturaCab;
        }
        function desenharLinha(celulas, estilo) {
          const quebradas = celulas.map((c, i) => quebrar(c, larg[i] - 2 * pad, tam, estilo === 'total'));
          const altura = Math.max(...quebradas.map((l) => l.length)) * ent + 2 * pad;
          if (y - altura < M + 22) { nova(); desenharCab(); }
          if (estilo === 'total') retangulo(M, y - altura, util, altura, COR.fundo);
          quebradas.forEach((ls, i) => ls.forEach((l, k) => texto(posX[i] + pad, y - pad - tam - k * ent + 1, l, tam, estilo === 'total', COR.texto, t.colunas[i].alinhar, larg[i] - 2 * pad)));
          y -= altura;
          linha(M, y, M + util, y, COR.borda, 0.5);
        }
        const alturaDe = (celulas, estilo) => Math.max(...celulas.map((c, i) => quebrar(c, larg[i] - 2 * pad, tam, estilo === 'total').length)) * ent + 2 * pad;
        desenharCab();
        t.linhas.forEach((l, idx) => {
          const celulas = Array.isArray(l) ? l : l.celulas;
          const estilo = Array.isArray(l) ? 'normal' : (l.estilo || 'normal');
          // a última linha de dados não fica separada do rodapé de totais
          if (t.rodape && idx === t.linhas.length - 1 && y - (alturaDe(celulas, estilo) + alturaDe(t.rodape, 'total')) < M + 22) { nova(); desenharCab(); }
          desenharLinha(celulas, estilo);
        });
        if (t.rodape) desenharLinha(t.rodape, 'total');
        y -= 8;
      },
      gerar() {
        if (!paginas.length) nova();
        const total = paginas.length;
        paginas.forEach((p, i) => {
          cont = p;
          const dataTexto = op.rodape || '';
          if (dataTexto) texto(M, 20, dataTexto, 7.5, false, COR.cinza);
          texto(W - M - 100, 20, `Página ${i + 1} de ${total}`, 7.5, false, COR.cinza, 'd', 100);
        });
        return montar(paginas, W, H, op.titulo || 'Documento');
      },
    };
    return api;
  }

  function montar(paginas, W, H, titulo) {
    const objetos = [];
    const add = (s) => { objetos.push(s); return objetos.length; };
    add('<< /Type /Catalog /Pages 2 0 R >>');
    add(`<< /Type /Pages /Kids [${paginas.map((_, i) => `${5 + i * 2} 0 R`).join(' ')}] /Count ${paginas.length} >>`);
    add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    paginas.forEach((p, i) => {
      const conteudo = p.join('\n');
      add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W.toFixed(2)} ${H.toFixed(2)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + i * 2} 0 R >>`);
      add(`<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`);
    });
    const info = add(`<< /Title <FEFF${Array.from(preparar(titulo)).map((c) => c.charCodeAt(0).toString(16).padStart(4, '0')).join('')}> /Producer (Central de Calculos) >>`);
    let saida = '%PDF-1.4\n';
    const offsets = [];
    objetos.forEach((o, i) => { offsets.push(saida.length); saida += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = saida.length;
    saida += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
    saida += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    const bytes = new Uint8Array(saida.length);
    for (let i = 0; i < saida.length; i += 1) bytes[i] = saida.charCodeAt(i) & 0xFF;
    return bytes;
  }

  return { criar, largura, quebrar, hex };
});
