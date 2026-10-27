/*
 * Blocos reutilizados pelos módulos de cálculo: correção monetária manual, critérios de cálculo,
 * resumo consolidado, visualizador de documentos e guarda da memória de cálculo.
 * Exportados em window.CentralBlocos.
 */
(() => {
  const { useRef, useEffect, useState } = React;
  const UI = window.CentralUI;
  const R = window.CentralRegras;
  const K = window.CentralCalculo;
  const { Icone, Botao, Alerta, CampoData, CampoPercentual, CampoMoeda, Selecao, Chave, Indicador, Segmentado, PainelResultado } = UI;

  // ---------- Descrição dos critérios (tela e demonstrativo) ----------
  // parcelas (opcional): lista com a correção escolhida em cada uma, para descrever a origem da correção.
  function descreverCriterios(c, parcelas) {
    const linhas = [['Data final do cálculo', c.dataFinal]];
    const modos = (parcelas || []).map((p) => p.correcao || {});
    const indices = [...new Set(modos.filter((x) => x.modo === 'indice').map((x) => (K.INDICES[x.indice] || K.INDICES.IPCA).nome))];
    const manual = modos.some((x) => x.modo === 'percentual' || x.modo === 'valorCorrigido');
    if (indices.length) {
      const tabela = K.indicesCarregados();
      linhas.push(['Correção monetária', `${indices.join(', ')}: variações mensais do mês do vencimento até o mês anterior ao da data final, acumuladas (tabela do Banco Central do Brasil${tabela && tabela.atualizadoEm ? `, atualizada em ${tabela.atualizadoEm}` : ''})${manual ? '; nas demais parcelas, percentual ou valor corrigido informado pelo usuário' : ''}`]);
    } else {
      linhas.push(['Correção monetária', 'Informada manualmente pelo usuário (percentual acumulado ou valor já corrigido, por parcela); não calculada por índice oficial nem por consulta automática']);
    }
    if (c.juros && c.juros.ativo) {
      linhas.push(['Juros moratórios', `${R.formatarPercentual(R.lerValor(c.juros.percentual))} ${c.juros.periodicidade === 'anual' ? 'ao ano' : 'ao mês'}, ${c.juros.modalidade === 'compostos' ? 'compostos (capitalizados)' : 'simples'}, do vencimento até a data final, sobre o principal corrigido; período = meses completos + dias restantes ÷ 30`]);
    } else {
      linhas.push(['Juros moratórios', 'Não aplicados']);
    }
    linhas.push(['Multa', c.multa && c.multa.ativo ? `${R.formatarPercentual(R.lerValor(c.multa.percentual))} sobre o principal corrigido, aplicada uma única vez` : 'Não aplicada']);
    linhas.push(['Honorários', c.honorarios && c.honorarios.ativo
      ? (c.honorarios.modo === 'p' ? `${R.formatarPercentual(R.lerValor(c.honorarios.valor))} sobre principal corrigido + juros + multa − pagamentos` : `${R.formatarMoeda(R.lerValor(c.honorarios.valor))} (valor fixo, uma única vez)`)
      : 'Não aplicados']);
    linhas.push(['Abatimento de pagamentos', c.imputacao === 'art354' ? 'Imputação cronológica: primeiro nos juros e depois no principal (art. 354 do Código Civil), com juros recalculados sobre o principal restante' : 'Abatidos do saldo final de principal e juros, sem recalcular os juros']);
    linhas.push(['Multa e mora', 'Multa só sobre o valor em atraso no vencimento (pagamento em dia afasta a multa); pagamento além do principal e dos juros quita a multa']);
    linhas.push(['Parcelas a vencer na data final', c.vincendas === 'excluir' ? 'Ficam fora do cálculo e são listadas à parte' : 'Tratadas como vencidas antecipadamente na data final: sem juros, com multa (se aplicada)']);
    linhas.push(['Responsabilidade pelos critérios', 'Definidos pelo usuário para o caso concreto; a ferramenta não valida sua adequação jurídica.']);
    return linhas;
  }

  // ---------- Tabela de índices: estado de carregamento (js/indices.js) ----------
  function useIndices() {
    const [estado, definir] = useState(() => ({ ...(window.CentralIndicesEstado || { status: 'carregando' }) }));
    useEffect(() => {
      const f = (e) => definir({ ...e.detail });
      window.addEventListener('central-indices', f);
      if (window.CentralIndicesEstado) definir({ ...window.CentralIndicesEstado });
      return () => window.removeEventListener('central-indices', f);
    }, []);
    return estado;
  }

  // Correção sugerida para parcelas novas: índice oficial (IPCA). O motor continua com "sem correção" como padrão.
  const correcaoInicial = () => ({ ...K.correcaoPadrao(), modo: 'indice', indice: 'IPCA' });

  // Rótulo curto da correção escolhida (botões das linhas de parcelas)
  function rotuloCorrecao(c) {
    if (!c) return 'Sem correção';
    if (c.modo === 'indice') return `Correção: ${(K.INDICES[c.indice] || K.INDICES.IPCA).nome}`;
    if (c.modo === 'percentual') return `Correção: ${c.percentual || '—'}%`;
    if (c.modo === 'valorCorrigido') return 'Valor corrigido informado';
    return 'Sem correção';
  }

  // ---------- Correção monetária ----------
  const OPCOES_CORRECAO = [
    ['indice', 'Índice oficial'],
    ['percentual', 'Percentual'],
    ['valorCorrigido', 'Valor já corrigido'],
    ['nenhuma', 'Sem correção'],
  ];
  const OPCOES_INDICE = Object.entries(K.INDICES).map(([valor, x]) => ({ valor, rotulo: x.descricao }));

  // vencimento e dataFinal permitem a prévia da correção por índice enquanto o usuário digita.
  function CorrecaoManual({ valor, onChange, valorOriginal, vencimento, dataFinal, erro, titulo = 'Correção monetária', compacto }) {
    const c = valor || K.correcaoPadrao();
    const alterar = (parte) => onChange({ ...c, ...parte });
    const indices = useIndices();
    const original = R.lerValor(valorOriginal);
    let previa = null;
    let avisoIndice = null;
    if (c.modo === 'indice') {
      if (indices.status === 'carregando') avisoIndice = 'Carregando índices…';
      else if (indices.status !== 'ok') avisoIndice = 'Tabela de índices indisponível: use Percentual.';
      else {
        const chave = K.INDICES[c.indice] ? c.indice : 'IPCA';
        const ultimo = K.ultimoMesIndice(chave);
        avisoIndice = `Atualizado em ${indices.atualizadoEm || '—'}${ultimo ? ` · último: ${K.nomeMes(ultimo)}` : ''}`;
        if (original > 0 && R.dataEhValida(vencimento) && R.dataEhValida(dataFinal)) {
          const r = K.aplicarCorrecao(original, { ...c, indice: chave }, { inicio: vencimento, fim: dataFinal });
          if (!r.meses.length && !r.faltantes.length) previa = 'Sem meses a corrigir.';
          else {
            const periodo = r.meses.length ? `${K.nomeMes(r.meses[0].mes)} a ${K.nomeMes(r.meses[r.meses.length - 1].mes)}` : '—';
            previa = `${r.nomeIndice} acumulado ${R.formatarPercentual(r.percentual)} (${periodo}) · Correção: ${R.formatarMoeda(r.valorCorrecao)} · Principal corrigido: ${R.formatarMoeda(r.principalCorrigido)}${r.faltantes.length ? ` · sem índice divulgado para ${r.faltantes.map(K.nomeMes).join(', ')}` : ''}`;
          }
        }
      }
    } else if (original > 0) {
      if (c.modo === 'percentual' && R.lerValor(c.percentual) >= 0) {
        const r = K.aplicarCorrecao(original, c);
        previa = `Correção: ${R.formatarMoeda(r.valorCorrecao)} · Principal corrigido: ${R.formatarMoeda(r.principalCorrigido)}`;
      } else if (c.modo === 'valorCorrigido' && R.lerValor(c.valorCorrigido) > 0) {
        const r = K.aplicarCorrecao(original, c);
        previa = `Diferença: ${R.formatarMoeda(r.valorCorrecao)}`;
      } else if (c.modo === 'nenhuma') {
        previa = null;
      }
    }
    return (
      <fieldset className="space-y-3">
        <legend className="text-[12.5px] text-muted-foreground mb-1.5">{titulo}</legend>
        <Segmentado rotulo={titulo} valor={c.modo} onChange={(v) => alterar({ modo: v, indice: c.indice || 'IPCA' })} cheio={!compacto}
          opcoes={OPCOES_CORRECAO.map(([valor, rotulo]) => ({ valor, rotulo }))} />
        {c.modo === 'indice' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 section-open">
            <Selecao rotulo="Índice" valor={K.INDICES[c.indice] ? c.indice : 'IPCA'} onChange={(v) => alterar({ indice: v })} opcoes={OPCOES_INDICE} erro={erro} />
            {avisoIndice && <p className={`text-[11.5px] sm:pt-[26px] ${indices.status === 'ok' || indices.status === 'carregando' ? 'text-muted-foreground' : 'text-warning'}`}>{avisoIndice}</p>}
          </div>
        )}
        {c.modo === 'percentual' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 section-open">
            <CampoPercentual rotulo="Correção monetária acumulada do período" obrigatorio valor={c.percentual} onChange={(v) => alterar({ percentual: v })} erro={erro} />
          </div>
        )}
        {c.modo === 'valorCorrigido' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 section-open">
            <CampoMoeda rotulo="Valor principal já corrigido" obrigatorio valor={c.valorCorrigido} onChange={(v) => alterar({ valorCorrigido: v })} erro={erro} />
          </div>
        )}
        {previa && <p className="text-xs text-muted-foreground" aria-live="polite">{previa}</p>}
      </fieldset>
    );
  }

  // ---------- Critérios de cálculo (juros, multa, honorários, pagamentos) ----------
  // ---------- Correção em lote: usada pelos geradores de parcelas e por "Aplicar a todas" ----------
  const OPCOES_LOTE = [
    ...Object.entries(K.INDICES).map(([valor, x]) => ({ valor, rotulo: x.nome })),
    { valor: 'percentual', rotulo: 'Percentual' },
    { valor: 'nenhuma', rotulo: 'Sem correção' },
  ];
  const loteInicial = () => ({ opcao: 'IPCA', percentual: '' });

  function correcaoDoLote(lote) {
    const l = lote || loteInicial();
    if (K.INDICES[l.opcao]) return { ...K.correcaoPadrao(), modo: 'indice', indice: l.opcao };
    if (l.opcao === 'percentual') return { ...K.correcaoPadrao(), modo: 'percentual', percentual: l.percentual };
    return K.correcaoPadrao();
  }

  // Aplica a correção do lote a todos os itens; devolve null (e avisa) quando falta dado.
  function aplicarLote(itens, lote) {
    const l = lote || loteInicial();
    if (!itens.length) { UI.avisar('Inclua as parcelas antes.', 'erro'); return null; }
    if (l.opcao === 'percentual' && !(R.lerValor(l.percentual) >= 0)) { UI.avisar('Informe o percentual.', 'erro'); return null; }
    const correcao = correcaoDoLote(l);
    UI.avisar(`${rotuloCorrecao(correcao)} em ${itens.length} item(ns).`);
    return itens.map((x) => ({ ...x, correcao: { ...correcao } }));
  }

  function CorrecaoLote({ valor, onChange, quantidade = 0, onAplicar, rotulo = 'Correção' }) {
    const l = valor || loteInicial();
    return (
      <div className="flex flex-wrap items-end gap-3">
        <Selecao className="w-40" rotulo={rotulo} valor={l.opcao} onChange={(v) => onChange({ ...l, opcao: v })} opcoes={OPCOES_LOTE} />
        {l.opcao === 'percentual' && <CampoPercentual className="w-32" rotulo="Acumulado" valor={l.percentual} onChange={(v) => onChange({ ...l, percentual: v })} />}
        {onAplicar && quantidade > 0 && <Botao onClick={onAplicar}>Aplicar a todas ({quantidade})</Botao>}
      </div>
    );
  }

  function CriteriosCalculo({ valor, onChange, erros = [], textoMulta = 'Multa (%)', notaMulta, rotuloData = 'Atualizar até' }) {
    const c = valor;
    const alterar = (parte) => onChange({ ...c, ...parte });
    const erro = (campo) => (erros.find((e) => e.campo === campo) || {}).mensagem;
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <CampoData rotulo={rotuloData} obrigatorio valor={c.dataFinal} onChange={(v) => alterar({ dataFinal: v })} erro={erro('dataFinal')} comHoje />
          <Selecao rotulo="Abatimento dos pagamentos" valor={c.imputacao} onChange={(v) => alterar({ imputacao: v })} erro={erro('imputacao')}
            opcoes={[{ valor: 'final', rotulo: 'Abater do saldo final' }, { valor: 'art354', rotulo: 'Imputar em juros e depois principal (art. 354 CC)' }]} />
          <Selecao rotulo="Parcelas que vencem depois da data final" valor={c.vincendas || 'antecipar'} onChange={(v) => alterar({ vincendas: v })} erro={erro('vincendas')} className="sm:col-span-2"
            opcoes={[{ valor: 'antecipar', rotulo: 'Vencimento antecipado (sem juros, com multa)' }, { valor: 'excluir', rotulo: 'Fora do cálculo' }]} />
        </div>
        <div className="rounded-[10px] border border-border divide-y divide-border">
          <div className="p-4 space-y-3">
            <Chave rotulo="Juros moratórios" marcado={c.juros.ativo} onChange={(v) => alterar({ juros: { ...c.juros, ativo: v } })} />
            {c.juros.ativo && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 section-open">
                <CampoPercentual rotulo="Taxa de juros" valor={c.juros.percentual} onChange={(v) => alterar({ juros: { ...c.juros, percentual: v } })} erro={erro('jurosPercentual')} />
                <Selecao rotulo="Taxa" valor={c.juros.periodicidade} onChange={(v) => alterar({ juros: { ...c.juros, periodicidade: v } })} opcoes={[{ valor: 'mensal', rotulo: 'Ao mês' }, { valor: 'anual', rotulo: 'Ao ano' }]} erro={erro('jurosPeriodicidade')} />
                <Selecao rotulo="Modalidade" valor={c.juros.modalidade} onChange={(v) => alterar({ juros: { ...c.juros, modalidade: v } })} opcoes={[{ valor: 'simples', rotulo: 'Juros simples' }, { valor: 'compostos', rotulo: 'Juros compostos' }]} erro={erro('jurosModalidade')} />
              </div>
            )}
          </div>
          <div className="p-4 space-y-3">
            <Chave rotulo="Multa" marcado={c.multa.ativo} onChange={(v) => alterar({ multa: { ...c.multa, ativo: v } })} />
            {c.multa.ativo && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 section-open">
                <CampoPercentual rotulo={textoMulta} valor={c.multa.percentual} onChange={(v) => alterar({ multa: { ...c.multa, percentual: v } })} erro={erro('multaPercentual')} />
              </div>
            )}
          </div>
          <div className="p-4 space-y-3">
            <Chave rotulo="Honorários" marcado={c.honorarios.ativo} onChange={(v) => alterar({ honorarios: { ...c.honorarios, ativo: v } })} />
            {c.honorarios.ativo && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 section-open">
                <Selecao rotulo="Forma" valor={c.honorarios.modo} onChange={(v) => alterar({ honorarios: { ...c.honorarios, modo: v, valor: '' } })}
                  opcoes={[{ valor: 'p', rotulo: 'Percentual' }, { valor: 'v', rotulo: 'Valor fixo (R$)' }]} />
                {c.honorarios.modo === 'p'
                  ? <CampoPercentual rotulo="Percentual" valor={c.honorarios.valor} onChange={(v) => alterar({ honorarios: { ...c.honorarios, valor: v } })} erro={erro('honorarios')} />
                  : <CampoMoeda rotulo="Valor dos honorários" valor={c.honorarios.valor} onChange={(v) => alterar({ honorarios: { ...c.honorarios, valor: v } })} erro={erro('honorarios')} />}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---------- Painel de resultado dos módulos jurídicos ----------
  // totais = saída de consolidar(); sem totais (ainda não calculado) o painel mostra o estado vazio.
  function PainelTotais({ totais, mostrarHonorarios, rotulo = 'Saldo final atualizado', vazio, topo, acoes, kpis, children }) {
    const m = R.formatarMoeda;
    const t = totais;
    const linhas = !t ? [] : [
      { l: 'Valor original', v: m(t.original), n: t.original },
      { l: 'Correção monetária', v: m(t.correcao), n: t.correcao },
      { l: 'Juros', v: m(t.juros), n: t.juros },
      { l: 'Multa', v: m(t.multa), n: t.multa },
      (mostrarHonorarios || t.honorarios !== 0) && { l: 'Honorários', v: m(t.honorarios), n: t.honorarios },
      t.encargosNominais !== 0 && { l: 'Outros encargos', v: m(t.encargosNominais), n: t.encargosNominais },
      { l: '(−) Pagamentos', v: t.pagamentos ? `-${m(t.pagamentos)}` : m(0), n: t.pagamentos, skip: true, neg: t.pagamentos > 0 },
      t.creditoNaoImputado !== 0 && { l: 'Excedente de pagamentos', v: m(t.creditoNaoImputado), n: t.creditoNaoImputado, skip: true },
    ].filter(Boolean);
    const encargos = t && t.original ? R.formatarPercentual(((t.saldoFinal + t.pagamentos - t.original) / t.original) * 100, 1) : '—';
    return (
      <PainelResultado rotulo={rotulo} valor={t ? m(t.saldoFinal) : '—'} topo={topo} acoes={acoes} linhas={linhas}
        kpis={t ? (kpis || [{ l: 'Principal corrigido', v: m(t.principalCorrigido) }, { l: 'Encargos', v: encargos }, { l: 'Pagamentos', v: t.pagamentos ? `-${m(t.pagamentos)}` : m(0) }]) : []}>
        {children}
      </PainelResultado>
    );
  }

  // ---------- Resumo ----------
  function ResumoConsolidado({ totais, mostrarHonorarios }) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <Indicador rotulo="Valor original" valor={R.formatarMoeda(totais.original)} />
          <Indicador rotulo="Correção monetária (informada)" valor={R.formatarMoeda(totais.correcao)} />
          <Indicador rotulo="Principal corrigido" valor={R.formatarMoeda(totais.principalCorrigido)} />
          <Indicador rotulo="Juros" valor={R.formatarMoeda(totais.juros)} />
          <Indicador rotulo="Multa" valor={R.formatarMoeda(totais.multa)} />
          {(mostrarHonorarios || totais.honorarios !== 0) && <Indicador rotulo="Honorários" valor={R.formatarMoeda(totais.honorarios)} />}
          {totais.encargosNominais !== 0 && <Indicador rotulo="Outros encargos (nominais)" valor={R.formatarMoeda(totais.encargosNominais)} detalhe="Somados sem atualização" />}
          <Indicador rotulo="Pagamentos" valor={totais.pagamentos ? `-${R.formatarMoeda(totais.pagamentos)}` : R.formatarMoeda(0)} />
          {totais.creditoNaoImputado !== 0 && <Indicador tom="alerta" rotulo="Excedente de pagamentos" valor={R.formatarMoeda(totais.creditoNaoImputado)} detalhe="Não imputado ao saldo" />}
        </div>
        <Indicador tom="destaque" rotulo="Saldo final atualizado" valor={R.formatarMoeda(totais.saldoFinal)}
          detalhe="Principal corrigido + juros + multa + honorários + outros encargos − pagamentos" />
      </div>
    );
  }

  function ListaAlertas({ alertas }) {
    if (!alertas || !alertas.length) return null;
    return (
      <div className="space-y-2">
        {alertas.map((a, i) => <Alerta key={i} tipo={a.tipo === 'erro' ? 'erro' : 'aviso'}>{a.mensagem}</Alerta>)}
      </div>
    );
  }

  // Descrição curta da correção de uma parcela, para tabelas.
  function textoCorrecao(correcao) {
    if (correcao.modo === 'percentual') return `${R.formatarPercentual(correcao.percentual)} → ${R.formatarMoeda(correcao.valorCorrecao)}`;
    if (correcao.modo === 'valorCorrigido') return `Valor informado (${R.formatarMoeda(correcao.valorCorrecao)})`;
    if (correcao.modo === 'indice') return `${correcao.nomeIndice} ${R.formatarPercentual(correcao.percentual)} → ${R.formatarMoeda(correcao.valorCorrecao)}${correcao.faltantes && correcao.faltantes.length ? ' (parcial)' : ''}`;
    return 'Sem correção';
  }

  // ---------- Visualizador de documento (iframe isolado: sem scripts) ----------
  function VisualizadorDocumento({ html, titulo, nomeBase, onFechar }) {
    const quadro = useRef(null);
    useEffect(() => {
      const tecla = (e) => { if (e.key === 'Escape') onFechar(); };
      window.addEventListener('keydown', tecla);
      document.body.style.overflow = 'hidden';
      return () => { window.removeEventListener('keydown', tecla); document.body.style.overflow = ''; };
    }, []);
    const imprimir = () => { if (quadro.current && quadro.current.contentWindow) { quadro.current.contentWindow.focus(); quadro.current.contentWindow.print(); } };
    return (
      <div className="fixed inset-0 z-[70] bg-black/60 flex flex-col" role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="bg-card text-foreground border-b border-border px-4 py-3 flex flex-wrap items-center gap-2 justify-between">
          <div className="text-[13.5px] font-medium truncate">{titulo}</div>
          <div className="flex gap-2">
            <Botao tamanho="sm" variante="verde" icone="imprimir" onClick={imprimir}>Imprimir / Salvar PDF</Botao>
            <Botao tamanho="sm" icone="baixar" onClick={() => UI.baixarArquivo(UI.nomeArquivo(nomeBase || titulo, 'html'), html, 'text/html;charset=utf-8')}>Baixar HTML</Botao>
            <Botao tamanho="sm" onClick={onFechar} icone="x">Fechar</Botao>
          </div>
        </div>
        <iframe ref={quadro} title={titulo} srcDoc={html} sandbox="allow-same-origin allow-modals" className="flex-1 w-full bg-white" />
      </div>
    );
  }

  // Salva (ou atualiza) um registro no histórico local e abre a memória de cálculo.
  function guardarMemoria(registro, abrir) {
    const r = window.CentralHistorico.salvar(registro);
    if (!r.ok) { UI.avisar(r.erro, 'erro'); return null; }
    UI.avisar('Memória de cálculo guardada neste navegador.');
    if (abrir) UI.navegar('memorias', { id: r.id });
    return r.id;
  }

  // Gera e baixa a planilha de cálculo (.xlsx) do resultado atual. Toda calculadora oferece esta ação.
  function gerarPlanilhaCalculo(entrada, nomeBase) {
    try {
      const { bytes, nome } = window.CentralRegistro.baixarPlanilha(entrada, nomeBase);
      UI.baixarArquivo(nome, bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      UI.avisar('Planilha de cálculo gerada.');
    } catch (e) {
      UI.avisar('Não foi possível gerar a planilha de cálculo.', 'erro');
    }
  }

  // Gera e baixa o PDF da planilha de cálculo do resultado atual.
  function gerarPdfCalculo(entrada, nomeBase) {
    try {
      const { bytes, nome } = window.CentralRegistro.baixarPdf(entrada, nomeBase);
      UI.baixarArquivo(nome, bytes, 'application/pdf');
      UI.avisar('PDF da planilha de cálculo gerado.');
    } catch (e) {
      UI.avisar('Não foi possível gerar o PDF.', 'erro');
    }
  }

  function gerarPdfRegistro(registro) {
    try {
      const { bytes, nome } = window.CentralRegistro.baixarPdfRegistro(registro, registro.subtitulo || registro.titulo);
      UI.baixarArquivo(nome, bytes, 'application/pdf');
      UI.avisar('PDF gerado.');
    } catch (e) {
      UI.avisar('Não foi possível gerar o PDF.', 'erro');
    }
  }

  window.CentralBlocos = {
    descreverCriterios, useIndices, correcaoInicial, rotuloCorrecao, CorrecaoManual, CorrecaoLote, loteInicial, correcaoDoLote, aplicarLote, CriteriosCalculo, PainelTotais, ResumoConsolidado, ListaAlertas,
    textoCorrecao, VisualizadorDocumento, guardarMemoria, gerarPlanilhaCalculo, gerarPdfCalculo, gerarPdfRegistro,
  };
})();
