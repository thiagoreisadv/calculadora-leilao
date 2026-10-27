/*
 * Gera o demonstrativo (memória de cálculo) em HTML pronto para visualizar, imprimir ou salvar
 * como PDF pelo navegador. Recebe um "registro" já formatado pelos módulos:
 *
 *  {
 *    titulo, subtitulo, geradoEm (ISO), dataReferencia (DD/MM/AAAA),
 *    profissional: { nome, registro },
 *    identificacao: [['Credor', '...'], ['Devedor', '...']],
 *    criterios: [['Índice', 'IPCA-E'], ...],
 *    resumo: [['Valor original', 'R$ ...'], ...],
 *    total: { rotulo, valor },
 *    secoes: [{ titulo, colunas: [...], linhas: [[...]], rodape?: [...] }],
 *    memorias: [{ rotulo, texto }],      // passo a passo do cálculo de cada parcela
 *    alertas: [{ tipo, mensagem }],
 *    observacoes: '...',
 *    fonte: '...'
 *  }
 *
 * Todo texto vindo do usuário é escapado: o documento não executa conteúdo externo.
 */
(function (root) {
  'use strict';
  const esc = (s) => root.CentralRegras.escaparHtml(s);

  const ESTILO = `
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body { font-family: Inter, "Segoe UI", system-ui, sans-serif; color: #1E293B; margin: 0; padding: 28px; font-size: 12.5px; line-height: 1.5; background: #fff; }
    .doc { max-width: 820px; margin: 0 auto; }
    header { border-bottom: 3px solid #14243A; padding-bottom: 12px; margin-bottom: 18px; display: flex; justify-content: space-between; gap: 16px; align-items: flex-end; }
    h1 { font-size: 20px; margin: 0; color: #14243A; letter-spacing: -0.01em; }
    .sub { color: #64748B; font-size: 12px; margin-top: 2px; }
    .prof { text-align: right; font-size: 11.5px; color: #475569; }
    h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .05em; color: #14243A; margin: 20px 0 8px; border-bottom: 1px solid #E2E8F0; padding-bottom: 4px; }
    dl { display: grid; grid-template-columns: 170px 1fr; gap: 4px 12px; margin: 0; }
    dt { color: #64748B; } dd { margin: 0; font-weight: 600; word-break: break-word; }
    table { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 11.5px; }
    th, td { border-bottom: 1px solid #E2E8F0; padding: 6px 7px; text-align: left; vertical-align: top; }
    th { background: #F4F7FB; color: #334155; font-size: 10.5px; text-transform: uppercase; letter-spacing: .03em; }
    td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    tfoot td { font-weight: 700; background: #F8FAFC; }
    .total { margin-top: 18px; padding: 14px 16px; border: 2px solid #14243A; border-radius: 10px; display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
    .total .r { font-weight: 700; color: #14243A; }
    .total .v { font-size: 22px; font-weight: 800; color: #0B6F55; font-variant-numeric: tabular-nums; }
    .alerta { margin: 8px 0; padding: 8px 10px; border-radius: 6px; font-size: 11.5px; border: 1px solid; }
    .alerta.erro { background: #FEF2F2; border-color: #FCA5A5; color: #991B1B; }
    .alerta.aviso { background: #FFFBEB; border-color: #FCD34D; color: #92400E; }
    .memoria { border-left: 3px solid #29496B; padding: 4px 10px; margin: 6px 0; color: #334155; white-space: pre-wrap; }
    .memoria b { color: #14243A; }
    .aviso-legal { margin-top: 22px; font-size: 10.5px; color: #64748B; border-top: 1px solid #E2E8F0; padding-top: 8px; }
    @page { size: A4; margin: 14mm; }
    @media print { body { padding: 0; } .doc { max-width: none; } tr { page-break-inside: avoid; } h2 { page-break-after: avoid; } .total, .alerta { page-break-inside: avoid; } }
  `;

  function dl(pares) {
    const validos = (pares || []).filter((p) => p && p[1] !== undefined && p[1] !== null && String(p[1]).trim() !== '');
    if (!validos.length) return '';
    return `<dl>${validos.map((p) => `<dt>${esc(p[0])}</dt><dd>${esc(p[1])}</dd>`).join('')}</dl>`;
  }

  function tabela(secao) {
    const numericas = new Set(secao.numericas || []);
    const cab = secao.colunas.map((c, i) => `<th${numericas.has(i) ? ' class="n"' : ''}>${esc(c)}</th>`).join('');
    const corpo = secao.linhas.map((l) => `<tr>${l.map((c, i) => `<td${numericas.has(i) ? ' class="n"' : ''}>${esc(c)}</td>`).join('')}</tr>`).join('');
    const rod = secao.rodape ? `<tfoot><tr>${secao.rodape.map((c, i) => `<td${numericas.has(i) ? ' class="n"' : ''}>${esc(c)}</td>`).join('')}</tr></tfoot>` : '';
    return `<h2>${esc(secao.titulo)}</h2><table><thead><tr>${cab}</tr></thead><tbody>${corpo}</tbody>${rod}</table>`;
  }

  function gerarHtml(reg) {
    const gerado = reg.geradoEm ? new Date(reg.geradoEm) : new Date();
    const dataGeracao = gerado.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    const prof = reg.profissional && reg.profissional.nome
      ? `<div class="prof"><b>${esc(reg.profissional.nome)}</b>${reg.profissional.registro ? `<br>${esc(reg.profissional.registro)}` : ''}</div>` : '';
    const alertas = (reg.alertas || []).map((a) => `<div class="alerta ${a.tipo === 'erro' ? 'erro' : 'aviso'}">${esc(a.mensagem)}</div>`).join('');
    const memorias = (reg.memorias || []).filter((m) => m && m.texto)
      .map((m) => `<div class="memoria"><b>${esc(m.rotulo)}:</b> ${esc(m.texto)}</div>`).join('');
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(reg.titulo)}</title><style>${ESTILO}</style></head><body><div class="doc">
<header><div><h1>${esc(reg.titulo)}</h1><div class="sub">${esc(reg.subtitulo || '')}</div></div>${prof}</header>
${alertas}
<h2>Identificação</h2>${dl([...(reg.identificacao || []), ['Data de referência do cálculo', reg.dataReferencia], ['Gerado em', dataGeracao]])}
${reg.criterios && reg.criterios.length ? `<h2>Critérios de cálculo utilizados</h2>${dl(reg.criterios)}` : ''}
${reg.resumo && reg.resumo.length ? `<h2>Discriminação dos valores</h2>${dl(reg.resumo)}` : ''}
${reg.total ? `<div class="total"><span class="r">${esc(reg.total.rotulo)}</span><span class="v">${esc(reg.total.valor)}</span></div>` : ''}
${(reg.secoes || []).map(tabela).join('')}
${memorias ? `<h2>Memória de cálculo</h2>${memorias}` : ''}
${reg.observacoes ? `<h2>Observações</h2><div class="memoria">${esc(reg.observacoes)}</div>` : ''}
${reg.fonte ? `<div class="aviso-legal">${esc(reg.fonte)}.</div>` : ''}</body></html>`;
  }

  root.CentralDemonstrativo = { gerarHtml };
})(typeof self !== 'undefined' ? self : this);
