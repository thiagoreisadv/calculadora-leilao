/*
 * Módulo: Aluguéis, contratos, acordos e parcelas vencidas.
 * Várias parcelas, cada uma com vencimento, valor, correção monetária informada manualmente e
 * pagamentos próprios. Juros, multa e honorários seguem os critérios comuns; tudo é calculado
 * localmente por CentralCalculo.
 */
(() => {
  const { useState, useRef } = React;
  const UI = window.CentralUI;
  const B = window.CentralBlocos;
  const R = window.CentralRegras;
  const K = window.CentralCalculo;
  const M = window.CentralModulos;
  const { Pagina, Cartao, Botao, Alerta, CampoTexto, CampoMoeda, CampoData, CampoPercentual, Tabela } = UI;

  const PRESETS = {
    aluguel: {
      chave: 'aluguel', titulo: 'Aluguéis e contratos',
      descricao: 'Atualize aluguéis atrasados e obrigações contratuais. Cada parcela tem seu vencimento, valor, correção e pagamentos.',
      credor: 'Locador / credor', devedor: 'Locatário / devedor', parcela: 'Aluguel',
      notaMulta: 'Aplique a multa somente se estiver prevista no contrato de locação e no percentual ali fixado.',
      textoMulta: 'Multa contratual por atraso (%)', tipoMemoria: 'contrato',
    },
    acordo: {
      chave: 'acordo', titulo: 'Acordos e parcelas vencidas',
      descricao: 'Atualize parcelas vencidas de acordos extrajudiciais, parcelamentos e obrigações financeiras em geral.',
      credor: 'Credor', devedor: 'Devedor', parcela: 'Parcela',
      notaMulta: 'Aplique a multa somente se estiver prevista no acordo, no contrato ou na decisão.',
      textoMulta: 'Multa prevista (%)', tipoMemoria: 'acordo',
    },
  };

  let sequencia = 0;
  const novoId = () => { sequencia += 1; return `p${Date.now().toString(36)}${sequencia}`; };

  const novaParcela = (extra) => ({ id: novoId(), descricao: '', competencia: '', vencimento: '', valor: '', correcao: K.correcaoPadrao(), pagamentos: [], ...(extra || {}) });

  const inicial = () => ({
    descricao: '', credor: '', devedor: '', observacoes: '', parcelas: [], encargos: [],
    criterios: K.criteriosPadrao(), gerador: { quantidade: '12', primeiro: '', valor: '' }, aplicarPercentual: '',
  });

  const rotuloModo = (c) => ({ percentual: `Correção: ${c.percentual || '—'}%`, valorCorrigido: 'Valor corrigido informado', nenhuma: 'Sem correção' }[c.modo] || 'Sem correção');

  function LinhaParcela({ parcela, indice, onChange, onRemover, erros, rotuloBase }) {
    const [pagamentos, definirPagamentos] = useState(parcela.pagamentos.length > 0);
    const [correcao, definirCorrecao] = useState(parcela.correcao.modo !== 'nenhuma');
    const erro = (campo) => (erros.find((e) => e.linha === indice && e.campo === campo) || {}).mensagem;
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 p-3 sm:p-4 section-open">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{rotuloBase} {indice + 1}</span>
          <div className="flex flex-wrap gap-1 justify-end">
            <Botao tamanho="sm" variante="fantasma" onClick={() => definirCorrecao(!correcao)} aria-expanded={correcao}>{rotuloModo(parcela.correcao)}</Botao>
            <Botao tamanho="sm" variante="fantasma" onClick={() => definirPagamentos(!pagamentos)} aria-expanded={pagamentos}>
              Pagamentos{parcela.pagamentos.length ? ` (${parcela.pagamentos.length})` : ''}
            </Botao>
            <Botao tamanho="sm" variante="perigo" icone="lixeira" aria-label={`Remover ${rotuloBase.toLowerCase()} ${indice + 1}`} onClick={onRemover} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <CampoTexto rotulo="Descrição" valor={parcela.descricao} onChange={(v) => onChange({ descricao: v })} maxLength={80} />
          <CampoData rotulo="Vencimento" obrigatorio valor={parcela.vencimento} onChange={(v) => onChange({ vencimento: v, competencia: v.length === 10 ? v.slice(3) : '' })} erro={erro('vencimento')} />
          <CampoMoeda rotulo="Valor original" obrigatorio valor={parcela.valor} onChange={(v) => onChange({ valor: v })} erro={erro('valor')} />
        </div>
        {correcao && (
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700/50 section-open">
            <B.CorrecaoManual compacto valor={parcela.correcao} onChange={(c) => onChange({ correcao: c })} valorOriginal={parcela.valor} erro={erro('correcao')} titulo={`Correção monetária desta ${rotuloBase.toLowerCase()}`} />
          </div>
        )}
        {pagamentos && (
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700/50 section-open">
            <M.ListaPagamentos itens={parcela.pagamentos} onChange={(v) => onChange({ pagamentos: v })} erro={erro('pagamento')} />
          </div>
        )}
      </div>
    );
  }

  function ModuloParcelas({ preset }) {
    const p = PRESETS[preset];
    const [f, definirF, limpar] = UI.useRascunho(`parcelas2_${p.chave}`, inicial);
    const [errosForm, definirErros] = useState([]);
    const [resultado, definirResultado] = useState(null);
    const topo = useRef(null);

    const alterar = (parte) => { definirF({ ...f, ...parte }); definirResultado(null); };
    const alterarParcela = (id, parte) => alterar({ parcelas: f.parcelas.map((x) => (x.id === id ? { ...x, ...parte } : x)) });

    function gerar() {
      const g = f.gerador;
      const qtd = Number.parseInt(g.quantidade, 10);
      const erros = [];
      if (!(qtd >= 1 && qtd <= 120)) erros.push('Informe a quantidade de parcelas (1 a 120).');
      if (!R.dataEhValida(g.primeiro)) erros.push('Informe o primeiro vencimento (DD/MM/AAAA).');
      if (!(R.lerValor(g.valor) > 0)) erros.push('Informe o valor de cada parcela.');
      if (qtd + f.parcelas.length > R.LIMITE_PARCELAS) erros.push(`O limite é de ${R.LIMITE_PARCELAS} parcelas.`);
      if (erros.length) { UI.avisar(erros[0], 'erro'); return; }
      const novas = Array.from({ length: qtd }, (_, i) => {
        const venc = R.adicionarMeses(g.primeiro, i);
        return novaParcela({ descricao: `${p.parcela} ${i + 1}/${qtd}`, competencia: venc.slice(3), vencimento: venc, valor: g.valor });
      });
      alterar({ parcelas: [...f.parcelas, ...novas] });
      UI.avisar(`${qtd} parcelas adicionadas.`);
    }

    function aplicarMesmoPercentual() {
      if (!(R.lerValor(f.aplicarPercentual) >= 0)) { UI.avisar('Informe o percentual de correção para aplicar às parcelas.', 'erro'); return; }
      if (!f.parcelas.length) { UI.avisar('Inclua parcelas antes de aplicar a correção.', 'erro'); return; }
      alterar({ parcelas: f.parcelas.map((x) => ({ ...x, correcao: { modo: 'percentual', percentual: f.aplicarPercentual, valorCorrigido: '' } })) });
      UI.avisar('Percentual aplicado a todas as parcelas. Você ainda pode ajustar cada uma.');
    }

    function validar() {
      const erros = K.validarCalculo(f.criterios, f.parcelas, p.parcela);
      f.encargos.forEach((e, i) => { if (e.valor && Number.isNaN(R.lerValor(e.valor))) erros.push({ campo: 'encargos', mensagem: `Encargo ${i + 1}: valor inválido.` }); });
      return erros;
    }

    function calcular() {
      const erros = validar();
      definirErros(erros);
      if (erros.length) { UI.avisar('Corrija os campos destacados antes de calcular.', 'erro'); return; }
      const resultados = f.parcelas.map((x) => K.calcularParcela(x, f.criterios));
      const totais = K.consolidar(resultados, { honorariosFixos: K.honorariosFixos(f.criterios), encargosNominais: K.outrosEncargosTotal(f.encargos) });
      definirResultado({ resultados, totais, parcelas: f.parcelas.map((x) => ({ ...x })), criteriosDescritos: B.descreverCriterios(f.criterios) });
      setTimeout(() => topo.current && topo.current.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    }

    function gerarMemoria() {
      const r = resultado;
      const registro = window.CentralRegistro.montarCalculo({
        tipo: p.tipoMemoria,
        titulo: `Memória de cálculo — ${p.titulo}`,
        subtitulo: f.descricao || p.titulo,
        identificacao: [['Descrição', f.descricao], [p.credor, f.credor], [p.devedor, f.devedor], ['Quantidade de parcelas', String(f.parcelas.length)]],
        criterios: r.criteriosDescritos,
        parcelas: r.parcelas.map((x, i) => ({ descricao: x.descricao || `${p.parcela} ${i + 1}`, competencia: x.competencia, vencimento: x.vencimento })),
        resultados: r.resultados, totais: r.totais, dataFinal: f.criterios.dataFinal, observacoes: f.observacoes,
      });
      B.guardarMemoria(registro, true);
    }

    function exportarCsv() {
      const r = resultado;
      const linhas = r.resultados.map((x, i) => [i + 1, r.parcelas[i].descricao, r.parcelas[i].competencia, r.parcelas[i].vencimento, R.numeroCSV(x.original), R.numeroCSV(x.correcao.valorCorrecao), R.numeroCSV(x.principalCorrigido), R.numeroCSV(x.juros), R.numeroCSV(x.multa), R.numeroCSV(x.honorarios), R.numeroCSV(-x.pagamentos), R.numeroCSV(x.saldo)]);
      const csv = R.gerarCSV(['Nº', 'Descrição', 'Competência', 'Vencimento', 'Valor original', 'Correção monetária (informada)', 'Principal corrigido', 'Juros', 'Multa', 'Honorários', 'Pagamentos', 'Saldo atualizado'], linhas);
      UI.baixarArquivo(UI.nomeArquivo(f.descricao || p.titulo, 'csv'), csv, 'text/csv;charset=utf-8');
    }

    const r = resultado;
    return (
      <Pagina titulo={p.titulo} descricao={p.descricao}>
        <Cartao titulo="1. Identificação" descricao="Nomes e descrições ficam apenas neste navegador e aparecem no demonstrativo.">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <CampoTexto rotulo="Descrição" valor={f.descricao} onChange={(v) => alterar({ descricao: v })} className="sm:col-span-2" placeholder="Ex.: Contrato de locação, imóvel da Rua X" />
            <CampoTexto rotulo={p.credor} valor={f.credor} onChange={(v) => alterar({ credor: v })} />
            <CampoTexto rotulo={p.devedor} valor={f.devedor} onChange={(v) => alterar({ devedor: v })} />
          </div>
        </Cartao>

        <Cartao titulo="2. Parcelas" descricao="Inclua cada parcela vencida e informe, em cada uma, a correção monetária (percentual acumulado ou valor já corrigido).">
          <div className="space-y-4">
            <details className="rounded-xl border border-dashed border-slate-300 dark:border-slate-600 p-4 group">
              <summary className="cursor-pointer text-sm font-semibold text-slate-700 dark:text-slate-200 list-none flex items-center justify-between">
                Gerar parcelas mensais <UI.Icone nome="chevron" className="w-4 h-4 transition-transform group-open:rotate-180" />
              </summary>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                <CampoTexto rotulo="Quantidade" valor={f.gerador.quantidade} onChange={(v) => alterar({ gerador: { ...f.gerador, quantidade: v.replace(/\D/g, '') } })} inputMode="numeric" maxLength={3} />
                <CampoData rotulo="Primeiro vencimento" valor={f.gerador.primeiro} onChange={(v) => alterar({ gerador: { ...f.gerador, primeiro: v } })} />
                <CampoMoeda rotulo="Valor de cada parcela" valor={f.gerador.valor} onChange={(v) => alterar({ gerador: { ...f.gerador, valor: v } })} />
                <Botao variante="primario" icone="mais" onClick={gerar}>Gerar</Botao>
              </div>
            </details>

            {f.parcelas.length > 1 && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 p-4 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
                <CampoPercentual rotulo="Aplicar o mesmo percentual de correção a todas as parcelas" valor={f.aplicarPercentual} onChange={(v) => definirF({ ...f, aplicarPercentual: v })} ajuda="Atalho: substitui a correção de cada parcela; depois você pode ajustar uma a uma." />
                <Botao onClick={aplicarMesmoPercentual} className="!h-11">Aplicar a todas</Botao>
              </div>
            )}

            {f.parcelas.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">Nenhuma parcela incluída ainda.</p>}
            {f.parcelas.map((x, i) => (
              <LinhaParcela key={x.id} parcela={x} indice={i} erros={errosForm} rotuloBase={p.parcela}
                onChange={(parte) => alterarParcela(x.id, parte)} onRemover={() => alterar({ parcelas: f.parcelas.filter((y) => y.id !== x.id) })} />
            ))}
            {errosForm.some((e) => e.campo === 'parcelas') && <p role="alert" className="text-xs font-medium text-red-600">{errosForm.find((e) => e.campo === 'parcelas').mensagem}</p>}
            <Botao icone="mais" onClick={() => alterar({ parcelas: [...f.parcelas, novaParcela()] })}>Adicionar parcela</Botao>
          </div>
        </Cartao>

        <Cartao titulo="3. Critérios de cálculo" descricao="Valem para todas as parcelas desta atualização.">
          <B.CriteriosCalculo valor={f.criterios} onChange={(c) => alterar({ criterios: c })} erros={errosForm} textoMulta={p.textoMulta} notaMulta={p.notaMulta} />
        </Cartao>

        <Cartao titulo="4. Encargos adicionais e observações" descricao="Encargos informados aqui são somados ao final, sem atualização monetária, e só devem ser usados se houver previsão contratual ou fundamento jurídico.">
          <div className="space-y-5">
            <M.ListaEncargos itens={f.encargos} onChange={(v) => alterar({ encargos: v })} />
            <div>
              <label htmlFor={`obs-${p.chave}`} className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Observações (aparecem no demonstrativo)</label>
              <textarea id={`obs-${p.chave}`} rows={3} maxLength={1000} value={f.observacoes} onChange={(e) => alterar({ observacoes: e.target.value })}
                className="block w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white" />
            </div>
          </div>
        </Cartao>

        {errosForm.length > 0 && (
          <Alerta tipo="erro" titulo="Revise os dados informados">
            <ul className="list-disc pl-5 space-y-0.5">{errosForm.slice(0, 8).map((e, i) => <li key={i}>{e.mensagem}</li>)}{errosForm.length > 8 && <li>… e mais {errosForm.length - 8} ajustes.</li>}</ul>
          </Alerta>
        )}

        <div className="sticky bottom-3 z-20 flex flex-wrap gap-2 p-3 rounded-2xl bg-white/95 dark:bg-[#14243A]/95 border border-slate-200 dark:border-slate-700/60 shadow-card backdrop-blur">
          <Botao variante="verde" icone="atualizar" onClick={calcular} className="flex-1 sm:flex-none sm:min-w-[240px]">
            {`Atualizar ${f.parcelas.length || ''} parcela${f.parcelas.length === 1 ? '' : 's'}`.replace('  ', ' ')}
          </Botao>
          <Botao onClick={() => { limpar(); definirResultado(null); definirErros([]); }}>Limpar tudo</Botao>
        </div>

        <div ref={topo} />
        {r && (
          <Cartao titulo="Resultado da atualização" descricao={`Calculado até ${f.criterios.dataFinal} com a correção monetária informada por parcela.`} className="section-open">
            <div className="space-y-5">
              <B.ResumoConsolidado totais={r.totais} mostrarHonorarios={f.criterios.honorarios.ativo} />
              <Tabela legenda="Resultado por parcela" colunas={['Nº', 'Descrição', 'Vencimento', 'Valor original', 'Correção informada', 'Principal corrigido', 'Juros', 'Multa', 'Pagamentos', 'Saldo']} numericas={[3, 4, 5, 6, 7, 8, 9]}
                linhas={r.resultados.map((x, i) => [i + 1, r.parcelas[i].descricao || `${p.parcela} ${i + 1}`, r.parcelas[i].vencimento, R.formatarMoeda(x.original), B.textoCorrecao(x.correcao), R.formatarMoeda(x.principalCorrigido), R.formatarMoeda(x.juros), R.formatarMoeda(x.multa), x.pagamentos ? `-${R.formatarMoeda(x.pagamentos)}` : '—', R.formatarMoeda(x.saldo)])} />
              <details className="rounded-xl border border-slate-200 dark:border-slate-700/60 p-4 group">
                <summary className="cursor-pointer text-sm font-semibold text-slate-700 dark:text-slate-200 list-none flex items-center justify-between">
                  Memória de cálculo por parcela <UI.Icone nome="chevron" className="w-4 h-4 transition-transform group-open:rotate-180" />
                </summary>
                <div className="mt-3 space-y-4">
                  {r.resultados.map((x, i) => (
                    <div key={i}>
                      <div className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">{r.parcelas[i].descricao || `${p.parcela} ${i + 1}`} — {r.parcelas[i].vencimento}</div>
                      <ol className="list-decimal pl-5 space-y-1 text-sm text-slate-700 dark:text-slate-200">{x.memoria.map((l, k) => <li key={k}>{l}</li>)}</ol>
                    </div>
                  ))}
                </div>
              </details>
              <div className="flex flex-wrap gap-2">
                <Botao variante="primario" icone="memoria" onClick={gerarMemoria}>Gerar memória de cálculo</Botao>
                <Botao icone="baixar" onClick={exportarCsv}>Exportar CSV</Botao>
              </div>
            </div>
          </Cartao>
        )}
      </Pagina>
    );
  }

  window.CentralModulos = Object.assign(window.CentralModulos || {}, { ModuloParcelas, PRESETS });
})();
