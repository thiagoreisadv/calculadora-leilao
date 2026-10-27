/*
 * Blocos reutilizados pelos módulos de cálculo: correção monetária manual, critérios de cálculo,
 * resumo consolidado, visualizador de documentos e guarda da memória de cálculo.
 * Exportados em window.CentralBlocos.
 */
(() => {
  const { useRef, useEffect } = React;
  const UI = window.CentralUI;
  const R = window.CentralRegras;
  const K = window.CentralCalculo;
  const { Icone, Botao, Alerta, CampoData, CampoPercentual, CampoMoeda, Selecao, Chave, Indicador, Segmentado, PainelResultado } = UI;

  // ---------- Descrição dos critérios (tela e demonstrativo) ----------
  function descreverCriterios(c) {
    const linhas = [['Data final do cálculo', c.dataFinal]];
    linhas.push(['Correção monetária', 'Informada manualmente pelo usuário (percentual acumulado ou valor já corrigido, por parcela); não calculada por índice oficial nem por consulta automática']);
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
    linhas.push(['Responsabilidade pelos critérios', 'Definidos pelo usuário para o caso concreto; a ferramenta não valida sua adequação jurídica.']);
    return linhas;
  }

  // ---------- Correção monetária informada manualmente ----------
  const OPCOES_CORRECAO = [
    ['percentual', 'Percentual de correção'],
    ['valorCorrigido', 'Valor já corrigido'],
    ['nenhuma', 'Sem correção'],
  ];

  function CorrecaoManual({ valor, onChange, valorOriginal, erro, titulo = 'Correção monetária', compacto }) {
    const c = valor || K.correcaoPadrao();
    const alterar = (parte) => onChange({ ...c, ...parte });
    const original = R.lerValor(valorOriginal);
    let previa = null;
    if (original > 0) {
      if (c.modo === 'percentual' && R.lerValor(c.percentual) >= 0) {
        const r = K.aplicarCorrecao(original, c);
        previa = `Correção: ${R.formatarMoeda(r.valorCorrecao)} · Principal corrigido: ${R.formatarMoeda(r.principalCorrigido)}`;
      } else if (c.modo === 'valorCorrigido' && R.lerValor(c.valorCorrigido) > 0) {
        const r = K.aplicarCorrecao(original, c);
        previa = `Valor informado manualmente · Diferença para o valor original: ${R.formatarMoeda(r.valorCorrecao)}`;
      } else if (c.modo === 'nenhuma') {
        previa = `O valor original (${R.formatarMoeda(original)}) será usado diretamente.`;
      }
    }
    return (
      <fieldset className="space-y-3">
        <legend className="text-[12.5px] text-muted-foreground mb-1.5">{titulo}</legend>
        <Segmentado rotulo={titulo} valor={c.modo} onChange={(v) => alterar({ modo: v })} cheio={!compacto}
          opcoes={OPCOES_CORRECAO.map(([valor, rotulo]) => ({ valor, rotulo }))} />
        {c.modo === 'percentual' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 section-open">
            <CampoPercentual rotulo="Correção monetária acumulada do período" obrigatorio valor={c.percentual} onChange={(v) => alterar({ percentual: v })} erro={erro}
              ajuda="Percentual total que você apurou em outra ferramenta. O sistema soma a correção ao valor original uma única vez." />
          </div>
        )}
        {c.modo === 'valorCorrigido' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 section-open">
            <CampoMoeda rotulo="Valor principal já corrigido" obrigatorio valor={c.valorCorrigido} onChange={(v) => alterar({ valorCorrigido: v })} erro={erro}
              ajuda="Usado como base dos juros e da multa, sem aplicar nova correção." />
          </div>
        )}
        {previa && <p className="text-xs text-muted-foreground" aria-live="polite">{previa}</p>}
      </fieldset>
    );
  }

  // ---------- Critérios de cálculo (juros, multa, honorários, pagamentos) ----------
  function CriteriosCalculo({ valor, onChange, erros = [], textoMulta = 'Multa (%)', notaMulta, rotuloData = 'Atualizar até' }) {
    const c = valor;
    const alterar = (parte) => onChange({ ...c, ...parte });
    const erro = (campo) => (erros.find((e) => e.campo === campo) || {}).mensagem;
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <CampoData rotulo={rotuloData} obrigatorio valor={c.dataFinal} onChange={(v) => alterar({ dataFinal: v })} erro={erro('dataFinal')} comHoje />
          <Selecao rotulo="Abatimento dos pagamentos" valor={c.imputacao} onChange={(v) => alterar({ imputacao: v })} erro={erro('imputacao')}
            opcoes={[{ valor: 'final', rotulo: 'Abater do saldo final' }, { valor: 'art354', rotulo: 'Imputar em juros e depois principal (art. 354 CC)' }]}
            ajuda="Só faz diferença quando há pagamentos informados." />
        </div>
        <div className="rounded-[10px] border border-border divide-y divide-border">
          <div className="p-4 space-y-3">
            <Chave rotulo="Juros moratórios" descricao="Aplique somente se houver previsão contratual, legal ou na decisão." marcado={c.juros.ativo} onChange={(v) => alterar({ juros: { ...c.juros, ativo: v } })} />
            {c.juros.ativo && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 section-open">
                <CampoPercentual rotulo="Taxa de juros" valor={c.juros.percentual} onChange={(v) => alterar({ juros: { ...c.juros, percentual: v } })} erro={erro('jurosPercentual')} />
                <Selecao rotulo="Taxa" valor={c.juros.periodicidade} onChange={(v) => alterar({ juros: { ...c.juros, periodicidade: v } })} opcoes={[{ valor: 'mensal', rotulo: 'Ao mês' }, { valor: 'anual', rotulo: 'Ao ano' }]} erro={erro('jurosPeriodicidade')} />
                <Selecao rotulo="Modalidade" valor={c.juros.modalidade} onChange={(v) => alterar({ juros: { ...c.juros, modalidade: v } })} opcoes={[{ valor: 'simples', rotulo: 'Juros simples' }, { valor: 'compostos', rotulo: 'Juros compostos' }]} erro={erro('jurosModalidade')} />
                <p className="sm:col-span-3 text-xs text-muted-foreground">Os juros contam do vencimento até a data final, sobre o principal corrigido. Período = meses completos + dias restantes ÷ 30. Não escolha juros compostos sem previsão que o autorize.</p>
              </div>
            )}
          </div>
          <div className="p-4 space-y-3">
            <Chave rotulo="Multa" descricao={notaMulta || 'Aplique somente se prevista no contrato, na lei ou na decisão.'} marcado={c.multa.ativo} onChange={(v) => alterar({ multa: { ...c.multa, ativo: v } })} />
            {c.multa.ativo && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 section-open">
                <CampoPercentual rotulo={textoMulta} valor={c.multa.percentual} onChange={(v) => alterar({ multa: { ...c.multa, percentual: v } })} erro={erro('multaPercentual')} ajuda="Incide uma única vez sobre o principal corrigido." />
              </div>
            )}
          </div>
          <div className="p-4 space-y-3">
            <Chave rotulo="Honorários" descricao="Percentual ou valor fixo, conforme fixado." marcado={c.honorarios.ativo} onChange={(v) => alterar({ honorarios: { ...c.honorarios, ativo: v } })} />
            {c.honorarios.ativo && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 section-open">
                <Selecao rotulo="Forma" valor={c.honorarios.modo} onChange={(v) => alterar({ honorarios: { ...c.honorarios, modo: v, valor: '' } })}
                  opcoes={[{ valor: 'p', rotulo: 'Percentual' }, { valor: 'v', rotulo: 'Valor fixo (R$)' }]} />
                {c.honorarios.modo === 'p'
                  ? <CampoPercentual rotulo="Percentual" valor={c.honorarios.valor} onChange={(v) => alterar({ honorarios: { ...c.honorarios, valor: v } })} erro={erro('honorarios')} ajuda="Sobre principal corrigido + juros + multa − pagamentos." />
                  : <CampoMoeda rotulo="Valor dos honorários" valor={c.honorarios.valor} onChange={(v) => alterar({ honorarios: { ...c.honorarios, valor: v } })} erro={erro('honorarios')} ajuda="Somado uma única vez ao total." />}
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
      { l: 'Correção informada', v: m(t.correcao), n: t.correcao },
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
        {!t && <p className="mt-4 text-[12.5px] text-muted-foreground">{vazio || 'Preencha os dados e use "Calcular". O resultado aparece aqui.'}</p>}
        {t && <p className="mt-4 text-[11.5px] text-muted-foreground">Principal corrigido + juros + multa + honorários + outros encargos − pagamentos. Alterar qualquer dado limpa o resultado: calcule novamente.</p>}
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
    descreverCriterios, CorrecaoManual, CriteriosCalculo, PainelTotais, ResumoConsolidado, ListaAlertas,
    textoCorrecao, VisualizadorDocumento, guardarMemoria, gerarPlanilhaCalculo, gerarPdfCalculo, gerarPdfRegistro,
  };
})();
