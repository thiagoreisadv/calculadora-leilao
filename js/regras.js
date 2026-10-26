/*
 * Regras de cálculo locais da Central de Cálculos.
 *
 * Este arquivo NÃO calcula correção monetária, juros ou multa: isso é feito pela API da Debit.
 * Aqui ficam apenas regras determinísticas e testáveis: leitura e formatação de valores e datas,
 * validação dos formulários, montagem das requisições enviadas à API, conferência das respostas,
 * totalização e exportação CSV. Funciona no navegador (window.CentralRegras) e no Node (testes).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CentralRegras = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

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

  // Converte "AAAA-MM-DD" (input type=date) em "DD/MM/AAAA".
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

  // Aceita "MM/AAAA" e devolve "01/MM/AAAA" (competência mensal usada como vencimento padrão).
  function competenciaParaData(comp) {
    const m = /^(\d{2})\/(\d{4})$/.exec(String(comp || '').trim());
    if (!m) return '';
    const mes = Number(m[1]);
    if (mes < 1 || mes > 12) return '';
    return `01/${m[1]}/${m[2]}`;
  }

  // ---------- Validação ----------

  const LIMITE_PARCELAS = 200;

  function validarCriterios(c) {
    const erros = [];
    if (!c) return [{ campo: 'criterios', mensagem: 'Critérios de cálculo não informados.' }];
    if (c.modoCorrecao === 'tabela') {
      if (!c.tabela) erros.push({ campo: 'tabela', mensagem: 'Selecione a tabela judicial de correção.' });
    } else if (!c.indice) {
      erros.push({ campo: 'indice', mensagem: 'Selecione o índice de correção monetária.' });
    }
    if (!dataEhValida(c.dataFinal)) {
      erros.push({ campo: 'dataFinal', mensagem: 'Informe a data final da atualização no formato DD/MM/AAAA.' });
    }
    if (c.juros && c.juros.ativo) {
      const p = lerValor(c.juros.percentual);
      if (!(p >= 0)) erros.push({ campo: 'jurosPercentual', mensagem: 'Informe o percentual de juros (zero ou maior).' });
      if (c.juros.a_partir === 'citacao') {
        // A API de atalho não recebe a data da citação: sem ela os juros partiriam do vencimento sem aviso.
        erros.push({ campo: 'jurosAPartir', mensagem: 'Juros contados a partir da citação ainda não são suportados nesta tela. Use o vencimento.' });
      }
    }
    if (c.multa && c.multa.ativo) {
      const p = lerValor(c.multa.percentual);
      if (!(p >= 0)) erros.push({ campo: 'multaPercentual', mensagem: 'Informe o percentual da multa (zero ou maior).' });
    }
    if (c.honorarios && c.honorarios.ativo) {
      const v = lerValor(c.honorarios.valor);
      if (!(v > 0)) erros.push({ campo: 'honorarios', mensagem: 'Informe o valor ou percentual dos honorários.' });
      if (c.honorarios.modo === 'p' && v > 100) erros.push({ campo: 'honorarios', mensagem: 'Honorários em percentual não podem passar de 100%.' });
    }
    if (c.selic && c.selic.ativo && c.selic.inicio && !dataEhValida(c.selic.inicio)) {
      erros.push({ campo: 'selicInicio', mensagem: 'Data inicial da Selic inválida (DD/MM/AAAA).' });
    }
    if (c.selic && c.selic.ativo && c.selic.fim && !dataEhValida(c.selic.fim)) {
      erros.push({ campo: 'selicFim', mensagem: 'Data final da Selic inválida (DD/MM/AAAA).' });
    }
    return erros;
  }

  function validarParcela(p, indice, dataFinal) {
    const erros = [];
    const rotulo = `Parcela ${indice + 1}`;
    const venc = lerData(p.vencimento);
    if (!venc) erros.push({ campo: 'vencimento', linha: indice, mensagem: `${rotulo}: informe o vencimento no formato DD/MM/AAAA.` });
    const valor = lerValor(p.valor);
    if (!(valor > 0)) erros.push({ campo: 'valor', linha: indice, mensagem: `${rotulo}: informe um valor original maior que zero.` });
    const fim = lerData(dataFinal);
    if (venc && fim && venc.ts > fim.ts) {
      erros.push({ campo: 'vencimento', linha: indice, mensagem: `${rotulo}: o vencimento é posterior à data final da atualização.` });
    }
    (p.pagamentos || []).forEach((pg, k) => {
      const dp = lerData(pg.data);
      const vp = lerValor(pg.valor);
      if (!dp) erros.push({ campo: 'pagamento', linha: indice, mensagem: `${rotulo}, pagamento ${k + 1}: data inválida (DD/MM/AAAA).` });
      if (!(vp > 0)) erros.push({ campo: 'pagamento', linha: indice, mensagem: `${rotulo}, pagamento ${k + 1}: informe um valor maior que zero.` });
      if (dp && venc && dp.ts < venc.ts) erros.push({ campo: 'pagamento', linha: indice, mensagem: `${rotulo}, pagamento ${k + 1}: a data é anterior ao vencimento.` });
      if (dp && fim && dp.ts > fim.ts) erros.push({ campo: 'pagamento', linha: indice, mensagem: `${rotulo}, pagamento ${k + 1}: a data é posterior à data final da atualização.` });
    });
    return erros;
  }

  function validarCalculo(criterios, parcelas) {
    let erros = validarCriterios(criterios);
    if (!parcelas || parcelas.length === 0) {
      erros.push({ campo: 'parcelas', mensagem: 'Inclua ao menos uma parcela ou dívida.' });
    } else if (parcelas.length > LIMITE_PARCELAS) {
      erros.push({ campo: 'parcelas', mensagem: `O limite é de ${LIMITE_PARCELAS} parcelas por cálculo.` });
    } else {
      parcelas.forEach((p, i) => { erros = erros.concat(validarParcela(p, i, criterios && criterios.dataFinal)); });
    }
    return erros;
  }

  // ---------- Montagem da requisição para /v1/correct (via servidor intermediário) ----------

  // Duas parcelas só podem ir na mesma chamada se usarem exatamente os mesmos critérios.
  function assinaturaCriterios(c) {
    return JSON.stringify([
      c.modoCorrecao === 'tabela' ? ['t', String(c.tabela)] : ['i', String(c.indice)],
      c.dataFinal,
      c.juros && c.juros.ativo ? [lerValor(c.juros.percentual), c.juros.a_partir || 'vencimento'] : null,
      c.multa && c.multa.ativo ? lerValor(c.multa.percentual) : null,
      c.honorarios && c.honorarios.ativo ? [c.honorarios.modo, lerValor(c.honorarios.valor)] : null,
      c.selic && c.selic.ativo ? [c.selic.inicio || '', c.selic.fim || '', c.selic.base || '', c.selic.versao || 1] : null,
    ]);
  }

  // Monta a lista de itens: cada parcela vira um item positivo e cada pagamento um item NEGATIVO,
  // que é a convenção documentada pela API para pagamento. Guarda a origem para reconciliar a resposta.
  function montarItens(parcelas) {
    const itens = [];
    const origem = [];
    // Privacidade: a descrição digitada pelo usuário NÃO é enviada à API; ela só aparece nas telas e
    // nos demonstrativos locais (campo "rotulo"). À Debit vão apenas datas, valores e critérios.
    parcelas.forEach((p, i) => {
      itens.push({ date: p.vencimento, amount: arredondar(lerValor(p.valor)), description: `Parcela ${i + 1}` });
      origem.push({ parcela: i, tipo: 'parcela', rotulo: p.descricao || `Parcela ${i + 1}` });
      (p.pagamentos || []).forEach((pg, k) => {
        itens.push({ date: pg.data, amount: -arredondar(lerValor(pg.valor)), description: `Pagamento ${k + 1} da parcela ${i + 1}` });
        origem.push({ parcela: i, tipo: 'pagamento', ordem: k, rotulo: `Pagamento ${k + 1} (parcela ${i + 1})` });
      });
    });
    return { itens, origem };
  }

  function montarRequisicao(criterios, parcelas) {
    const { itens, origem } = montarItens(parcelas);
    const req = { updateTo: criterios.dataFinal, items: itens };
    if (criterios.modoCorrecao === 'tabela') req.table = criterios.tabela;
    else req.index = criterios.indice;
    if (criterios.juros && criterios.juros.ativo) {
      req.juros = { percentual: String(lerValor(criterios.juros.percentual)), from: criterios.juros.a_partir || 'vencimento' };
    }
    if (criterios.multa && criterios.multa.ativo) {
      req.multa = { percentual: String(lerValor(criterios.multa.percentual)) };
    }
    if (criterios.honorarios && criterios.honorarios.ativo) {
      req.honorarios = { modo: criterios.honorarios.modo === 'v' ? 'v' : 'p', valor: lerValor(criterios.honorarios.valor) };
    }
    if (criterios.selic && criterios.selic.ativo) {
      req.selic = true;
      if (criterios.selic.inicio) req.selicFrom = criterios.selic.inicio;
      if (criterios.selic.fim) req.selicUntil = criterios.selic.fim;
      if (criterios.selic.base) req.selicBase = criterios.selic.base;
      if (criterios.selic.versao) req.selicVersion = Number(criterios.selic.versao);
    }
    return { requisicao: req, origem };
  }

  // ---------- Conferência da resposta ----------

  function numero(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  /*
   * Confere a resposta da API contra o que foi enviado. Nunca preenche valores: se algo não veio
   * ou não confere, o item é marcado como "não atualizado" e entra na lista de alertas.
   */
  function conferirResposta(resposta, requisicao, origem) {
    const alertas = [];
    if (!resposta || typeof resposta !== 'object') {
      return { ok: false, erro: 'A resposta da API veio vazia ou em formato inesperado.', alertas };
    }
    const total = numero(resposta.total);
    if (total === null) {
      return { ok: false, erro: 'A resposta da API não trouxe o total atualizado.', alertas };
    }
    const itensResp = Array.isArray(resposta.items) ? resposta.items : null;
    if (!itensResp || itensResp.length !== requisicao.items.length) {
      return { ok: false, erro: 'A resposta da API não corresponde às parcelas enviadas. Nenhum valor foi aplicado.', alertas };
    }
    const linhas = itensResp.map((it, i) => {
      const enviado = requisicao.items[i];
      const ref = origem[i];
      const mesmoItem = it && it.date === enviado.date && Math.abs(numero(it.amount) - enviado.amount) < 0.005;
      const corrigido = it ? numero(it.corrected) : null;
      const totalItem = it ? numero(it.total) : null;
      const semDados = !mesmoItem || corrigido === null || totalItem === null;
      // A API devolve corrected = 0 quando o item fica fora da janela do plano gratuito (2 anos)
      // ou quando o motor não conseguiu corrigir. Isso não pode virar "valor atualizado".
      const zerado = enviado.amount !== 0 && corrigido === 0 && totalItem === 0;
      const naoAtualizado = semDados || zerado;
      if (naoAtualizado && ref.tipo === 'parcela') {
        alertas.push({
          tipo: 'erro',
          parcela: ref.parcela,
          mensagem: `Parcela ${ref.parcela + 1} (${enviado.date}): a API não devolveu valor atualizado. Isso ocorre, por exemplo, quando a data está fora da janela de 2 anos de contas sem assinatura Debit. O valor não foi incluído no total.`,
        });
      }
      return {
        indice: i,
        parcela: ref.parcela,
        tipo: ref.tipo,
        data: enviado.date,
        descricao: ref.rotulo || enviado.description,
        original: enviado.amount,
        corrigido: naoAtualizado ? null : corrigido,
        correcao: naoAtualizado ? null : arredondar(corrigido - enviado.amount),
        totalItem: naoAtualizado ? null : totalItem,
        encargosItem: naoAtualizado ? null : arredondar(totalItem - corrigido),
        memoria: it && typeof it.memoria === 'string' ? it.memoria : '',
        naoAtualizado,
      };
    });
    const somaItens = arredondar(linhas.reduce((s, l) => s + (l.totalItem || 0), 0));
    const diferenca = arredondar(total - somaItens);
    if (Math.abs(diferenca) > 0.05) {
      alertas.push({
        tipo: 'aviso',
        mensagem: `O total devolvido pela API (${formatarMoeda(total)}) difere da soma das linhas (${formatarMoeda(somaItens)}) em ${formatarMoeda(diferenca)}. Essa diferença pode ser de honorários ou encargos calculados sobre o total; confira o demonstrativo.`,
      });
    }
    const resumo = {
      total: arredondar(total),
      correcaoMonetaria: numero(resposta.correcaoMonetaria),
      juros: numero(resposta.juros),
      multa: numero(resposta.multa),
      honorarios: numero(resposta.honorarios),
      somaItens,
    };
    const incompleto = linhas.some((l) => l.naoAtualizado && l.tipo === 'parcela');
    return { ok: true, incompleto, resumo, linhas, alertas, calcId: resposta.calcId || null };
  }

  // Agrupa as linhas devolvidas pela API (parcelas e pagamentos) de volta por parcela do usuário.
  // O saldo da parcela é a soma dos totais devolvidos para ela e para os seus pagamentos; se a API
  // não atualizou algum desses itens, o saldo fica nulo em vez de uma soma parcial.
  function resumirPorParcela(parcelas, linhas) {
    return parcelas.map((p, i) => {
      const doItem = linhas.filter((l) => l.parcela === i);
      const principal = doItem.find((l) => l.tipo === 'parcela');
      const pagos = doItem.filter((l) => l.tipo === 'pagamento');
      const incompleto = doItem.some((l) => l.naoAtualizado);
      const principalOk = principal && !principal.naoAtualizado;
      return {
        indice: i,
        descricao: p.descricao || `Parcela ${i + 1}`,
        competencia: p.competencia || '',
        vencimento: p.vencimento,
        original: principal ? principal.original : arredondar(lerValor(p.valor)),
        pagamentos: arredondar(pagos.reduce((s, l) => s + l.original, 0)),
        correcao: principalOk ? principal.correcao : null,
        encargos: principalOk ? principal.encargosItem : null,
        saldo: incompleto || !principal ? null : arredondar(doItem.reduce((s, l) => s + (l.totalItem || 0), 0)),
        naoAtualizado: incompleto || !principal,
        memoria: principal ? principal.memoria : '',
      };
    });
  }

  // ---------- Totalização ----------

  function outrosEncargosTotal(lista) {
    return arredondar((lista || []).reduce((s, e) => s + (Number(lerValor(e.valor)) || 0), 0));
  }

  // Consolida os resultados individuais (um por chamada) em totais por categoria.
  function consolidar(resultados, encargosNominais) {
    const t = { original: 0, correcao: 0, juros: 0, multa: 0, honorarios: 0, pagamentos: 0, encargosNominais: 0, saldo: 0, semDetalhe: false };
    resultados.forEach((r) => {
      if (!r || !r.ok) return;
      r.linhas.forEach((l) => {
        if (l.tipo === 'parcela') t.original += l.original;
        if (l.tipo === 'pagamento') t.pagamentos += l.original; // negativo
      });
      t.saldo += r.resumo.total;
      [['correcao', 'correcaoMonetaria'], ['juros', 'juros'], ['multa', 'multa'], ['honorarios', 'honorarios']].forEach(([dest, orig]) => {
        if (r.resumo[orig] === null) t.semDetalhe = true;
        else t[dest] += r.resumo[orig];
      });
    });
    t.encargosNominais = arredondar(encargosNominais || 0);
    t.saldoComEncargos = t.saldo + t.encargosNominais;
    ['original', 'correcao', 'juros', 'multa', 'honorarios', 'pagamentos', 'saldo', 'saldoComEncargos'].forEach((k) => { t[k] = arredondar(t[k]); });
    return t;
  }

  // ---------- Leitura genérica de respostas cujo formato depende do tipo de cálculo ----------
  // Não atribui significado aos campos: mostra o que a API devolveu, com os nomes devolvidos.

  const ROTULOS_CONHECIDOS = {
    debito_total_atualizado: 'Débito total atualizado',
    subtotal_528_caput: 'Subtotal — rito da prisão (art. 528, §§ 3º e 7º, CPC)',
    subtotal_528_p8: 'Subtotal — rito da expropriação (art. 528, § 8º, CPC)',
    prescricao_modo: 'Modo de prescrição aplicado',
    prescricao_data_corte: 'Data de corte da prescrição',
    rito_prisao_criterio: 'Critério do rito da prisão',
    rito_prisao_marco: 'Marco do rito da prisão',
    rito_prisao_nota: 'Observação do rito da prisão',
  };

  function rotuloCampo(chave) {
    if (ROTULOS_CONHECIDOS[chave]) return ROTULOS_CONHECIDOS[chave];
    const t = String(chave).replace(/[_.]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  function formatarCampoApi(chave, valor) {
    if (valor === null || valor === undefined || valor === '') return '—';
    if (typeof valor === 'boolean') return valor ? 'Sim' : 'Não';
    if (typeof valor === 'number') {
      return /valor|saldo|juro|multa|correc|total|pago|pagamento|debito|subtotal|honor|salario|principal|devido/i.test(chave)
        ? formatarMoeda(valor) : String(valor).replace('.', ',');
    }
    return String(valor);
  }

  // Campos simples (texto, número, booleano) da resposta, com até 2 níveis de profundidade.
  function achatarCampos(obj) {
    const saida = [];
    const visitar = (valor, prefixo, nivel) => {
      if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return;
      Object.keys(valor).forEach((k) => {
        const v = valor[k];
        const chave = prefixo ? `${prefixo}.${k}` : k;
        if (v !== null && typeof v === 'object') { if (nivel < 2) visitar(v, chave, nivel + 1); return; }
        saida.push([chave, v]);
      });
    };
    visitar(obj, '', 1);
    return saida;
  }

  // Procura na resposta a lista de parcelas/competências (array de objetos com campo de competência).
  function extrairTabelaGenerica(obj) {
    const candidatos = [];
    const visitar = (valor, caminho, profundidade) => {
      if (profundidade > 3 || !valor || typeof valor !== 'object') return;
      if (Array.isArray(valor)) {
        if (valor.length && valor.every((x) => x && typeof x === 'object' && !Array.isArray(x))) candidatos.push({ caminho, linhas: valor });
        return;
      }
      Object.keys(valor).forEach((k) => visitar(valor[k], caminho ? `${caminho}.${k}` : k, profundidade + 1));
    };
    visitar(obj, '', 0);
    const achado = candidatos.find((c) => Object.keys(c.linhas[0]).some((k) => /mes_ano|compet|vencimento/i.test(k)));
    if (!achado) return null;
    const simples = (v) => ['string', 'number', 'boolean'].includes(typeof v);
    const colunas = Object.keys(achado.linhas[0]).filter((k) => simples(achado.linhas[0][k])).slice(0, 12);
    if (!colunas.length) return null;
    return {
      caminho: achado.caminho,
      colunas,
      linhas: achado.linhas.map((l) => colunas.map((c) => l[c])),
    };
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
    arredondar, lerValor, formatarMoeda, formatarPercentual,
    lerData, dataEhValida, isoParaBR, brParaISO, hojeBR, competenciaParaData, adicionarMeses,
    LIMITE_PARCELAS, validarCriterios, validarParcela, validarCalculo,
    assinaturaCriterios, montarItens, montarRequisicao, conferirResposta, resumirPorParcela,
    outrosEncargosTotal, consolidar, rotuloCampo, formatarCampoApi, achatarCampos, extrairTabelaGenerica, celulaCSV, numeroCSV, gerarCSV, escaparHtml,
  };
});
