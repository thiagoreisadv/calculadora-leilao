/*
 * Módulo: Planilha consolidada de débitos.
 * Várias obrigações numa só tela, cada uma com a sua correção monetária informada manualmente
 * (percentual acumulado ou valor já corrigido), pagamentos e, opcionalmente, taxa de juros e multa
 * próprias. Todo o cálculo é local (CentralCalculo); nenhuma API é consultada.
 */
(() => {
  const { useState, useRef } = React;
  const UI = window.CentralUI;
  const B = window.CentralBlocos;
  const R = window.CentralRegras;
  const K = window.CentralCalculo;
  const M = window.CentralModulos;
  const { Pagina, Cartao, Botao, Alerta, CampoTexto, CampoMoeda, CampoData, CampoCompetencia, CampoPercentual, Tabela } = UI;

  let sequencia = 0;
  const novoId = () => { sequencia += 1; return `l${Date.now().toString(36)}${sequencia}`; };

  const inicial = () => ({ titulo: '', credor: '', devedor: '', observacoes: '', linhas: [], criterios: K.criteriosPadrao() });

  const novaLinha = () => ({ id: novoId(), descricao: '', competencia: '', vencimento: '', valor: '', outros: '', correcao: K.correcaoPadrao(), jurosPct: '', multaPct: '', pagamentos: [] });

  const rotuloModo = (c) => ({ percentual: `Correção: ${c.percentual || '—'}%`, valorCorrigido: 'Valor corrigido informado', nenhuma: 'Sem correção' }[c.modo] || 'Sem correção');

  function LinhaEditavel({ linha, indice, onChange, onRemover, erros }) {
    const [pagamentos, definirPagamentos] = useState(linha.pagamentos.length > 0);
    const [correcao, definirCorrecao] = useState(linha.correcao.modo !== 'nenhuma');
    const [proprios, definirProprios] = useState(linha.jurosPct !== '' || linha.multaPct !== '');
    const erro = (campo) => (erros.find((e) => e.linha === indice && e.campo === campo) || {}).mensagem;
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 p-3 sm:p-4 section-open">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Linha {indice + 1}</span>
          <div className="flex flex-wrap gap-1 justify-end">
            <Botao tamanho="sm" variante="fantasma" aria-expanded={correcao} onClick={() => definirCorrecao(!correcao)}>{rotuloModo(linha.correcao)}</Botao>
            <Botao tamanho="sm" variante="fantasma" aria-expanded={pagamentos} onClick={() => definirPagamentos(!pagamentos)}>Pagamentos{linha.pagamentos.length ? ` (${linha.pagamentos.length})` : ''}</Botao>
            <Botao tamanho="sm" variante="fantasma" aria-expanded={proprios} onClick={() => definirProprios(!proprios)}>Juros e multa próprios{(linha.jurosPct !== '' || linha.multaPct !== '') ? ' •' : ''}</Botao>
            <Botao tamanho="sm" variante="perigo" icone="lixeira" aria-label={`Remover linha ${indice + 1}`} onClick={onRemover} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <CampoTexto rotulo="Descrição" valor={linha.descricao} onChange={(v) => onChange({ descricao: v })} maxLength={80} className="lg:col-span-2" />
          <CampoCompetencia rotulo="Competência" valor={linha.competencia} onChange={(v) => onChange({ competencia: v })} erro={erro('competencia')} />
          <CampoData rotulo="Vencimento" obrigatorio valor={linha.vencimento} onChange={(v) => onChange({ vencimento: v })} erro={erro('vencimento')} />
          <CampoMoeda rotulo="Valor original" obrigatorio valor={linha.valor} onChange={(v) => onChange({ valor: v })} erro={erro('valor')} />
          <CampoMoeda rotulo="Outros encargos (nominais)" valor={linha.outros} onChange={(v) => onChange({ outros: v })} className="lg:col-span-2" ajuda="Somados sem atualização, se houver fundamento." erro={erro('outros')} />
        </div>
        {correcao && (
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700/50 section-open">
            <B.CorrecaoManual compacto valor={linha.correcao} onChange={(c) => onChange({ correcao: c })} valorOriginal={linha.valor} erro={erro('correcao')} titulo="Correção monetária desta linha" />
          </div>
        )}
        {proprios && (
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700/50 grid grid-cols-1 sm:grid-cols-2 gap-3 section-open">
            <CampoPercentual rotulo="Taxa de juros desta linha" valor={linha.jurosPct} onChange={(v) => onChange({ jurosPct: v })} placeholder="padrão" ajuda="Vazio usa o padrão da planilha; 0 desliga os juros. Periodicidade e modalidade seguem o padrão." erro={erro('jurosPct')} />
            <CampoPercentual rotulo="Multa desta linha" valor={linha.multaPct} onChange={(v) => onChange({ multaPct: v })} placeholder="padrão" ajuda="Vazio usa o padrão; 0 desliga a multa." erro={erro('multaPct')} />
          </div>
        )}
        {pagamentos && (
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700/50 section-open">
            <M.ListaPagamentos itens={linha.pagamentos} onChange={(v) => onChange({ pagamentos: v })} erro={erro('pagamento')} />
          </div>
        )}
      </div>
    );
  }

  function ModuloPlanilha() {
    const [f, definirF, limpar] = UI.useRascunho('planilha2', inicial);
    const [errosForm, definirErros] = useState([]);
    const [res, definirRes] = useState(null);
    const topo = useRef(null);

    const alterar = (parte) => { definirF({ ...f, ...parte }); definirRes(null); };
    const alterarLinha = (id, parte) => alterar({ linhas: f.linhas.map((l) => (l.id === id ? { ...l, ...parte } : l)) });

    function validar() {
      const erros = K.validarCalculo(f.criterios, f.linhas, 'Linha');
      f.linhas.forEach((l, i) => {
        if (l.outros && Number.isNaN(R.lerValor(l.outros))) erros.push({ campo: 'outros', linha: i, mensagem: `Linha ${i + 1}: valor de outros encargos inválido.` });
        if (l.competencia && !/^(0[1-9]|1[0-2])\/\d{4}$/.test(l.competencia)) erros.push({ campo: 'competencia', linha: i, mensagem: `Linha ${i + 1}: competência deve ser MM/AAAA.` });
      });
      return erros;
    }

    function calcular() {
      const erros = validar();
      definirErros(erros);
      if (erros.length) { UI.avisar('Corrija os campos destacados antes de calcular.', 'erro'); return; }
      const resultados = f.linhas.map((l) => K.calcularParcela(l, f.criterios));
      const outros = f.linhas.map((l) => R.arredondar(R.lerValor(l.outros) || 0));
      const totais = K.consolidar(resultados, { honorariosFixos: K.honorariosFixos(f.criterios), encargosNominais: outros.reduce((s, v) => s + v, 0) });
      definirRes({ resultados, outros, totais, linhas: f.linhas.map((l) => ({ ...l })) });
      setTimeout(() => topo.current && topo.current.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    }

    const m = R.formatarMoeda;
    function celulas(i) {
      const x = res.resultados[i]; const l = res.linhas[i]; const o = res.outros[i];
      return [i + 1, l.descricao || '—', l.competencia || '—', l.vencimento, m(x.original), `${m(x.correcao.valorCorrecao)}${x.correcao.modo === 'percentual' ? ` (${R.formatarPercentual(x.correcao.percentual)})` : x.correcao.modo === 'valorCorrigido' ? ' (informado)' : ''}`, m(x.juros), m(x.multa), o ? m(o) : '—', x.pagamentos ? `-${m(x.pagamentos)}` : '—', m(x.saldo + o)];
    }

    function exportarCsv() {
      const linhas = res.resultados.map((x, i) => {
        const l = res.linhas[i]; const o = res.outros[i];
        return [i + 1, l.descricao, l.competencia, l.vencimento, R.numeroCSV(x.original), R.numeroCSV(x.correcao.valorCorrecao), R.numeroCSV(x.principalCorrigido), R.numeroCSV(x.juros), R.numeroCSV(x.multa), R.numeroCSV(x.honorarios), R.numeroCSV(o), R.numeroCSV(-x.pagamentos), R.numeroCSV(x.saldo + o)];
      });
      const t = res.totais;
      linhas.push(['', 'TOTAL', '', '', R.numeroCSV(t.original), R.numeroCSV(t.correcao), R.numeroCSV(t.principalCorrigido), R.numeroCSV(t.juros), R.numeroCSV(t.multa), R.numeroCSV(t.honorarios), R.numeroCSV(t.encargosNominais), R.numeroCSV(-t.pagamentos), R.numeroCSV(t.saldoFinal)]);
      const csv = R.gerarCSV(['Número', 'Descrição', 'Competência', 'Vencimento', 'Valor original', 'Correção monetária (informada)', 'Principal corrigido', 'Juros', 'Multa', 'Honorários', 'Outros encargos', 'Pagamentos', 'Saldo atualizado'], linhas);
      UI.baixarArquivo(UI.nomeArquivo(f.titulo || 'planilha-debitos', 'csv'), csv, 'text/csv;charset=utf-8');
    }

    function entrada() {
      const t = res.totais;
      return {
        tipo: 'planilha',
        titulo: 'Memória de cálculo — Planilha consolidada de débitos',
        subtitulo: f.titulo || 'Planilha de débitos',
        identificacao: [['Título', f.titulo], ['Credor', f.credor], ['Devedor', f.devedor], ['Linhas', String(res.linhas.length)]],
        criterios: B.descreverCriterios(f.criterios),
        parcelas: res.linhas.map((l, i) => ({ descricao: l.descricao || `Linha ${i + 1}`, competencia: l.competencia, vencimento: l.vencimento })),
        resultados: res.resultados, totais: t, dataFinal: f.criterios.dataFinal, observacoes: f.observacoes,
      };
    }

    function gerarMemoria() {
      B.guardarMemoria(window.CentralRegistro.montarCalculo(entrada()), true);
    }

    function gerarPlanilha() {
      B.gerarPlanilhaCalculo(entrada(), f.titulo || 'planilha-debitos');
    }

    return (
      <Pagina titulo="Planilha consolidada de débitos" descricao="Gerencie várias obrigações numa única tela, informe a correção monetária e os pagamentos de cada uma e veja o total consolidado.">
        <Cartao titulo="1. Identificação" descricao="Nomes e descrições ficam apenas neste navegador e aparecem no demonstrativo.">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <CampoTexto rotulo="Título da planilha" valor={f.titulo} onChange={(v) => alterar({ titulo: v })} placeholder="Ex.: Débitos do contrato 123" />
            <CampoTexto rotulo="Credor" valor={f.credor} onChange={(v) => alterar({ credor: v })} />
            <CampoTexto rotulo="Devedor" valor={f.devedor} onChange={(v) => alterar({ devedor: v })} />
          </div>
        </Cartao>

        <Cartao titulo="2. Critérios padrão" descricao="Aplicados a todas as linhas, exceto onde a linha tiver taxa de juros ou multa próprias.">
          <B.CriteriosCalculo valor={f.criterios} onChange={(c) => alterar({ criterios: c })} erros={errosForm.filter((e) => e.linha === undefined)} />
        </Cartao>

        <Cartao titulo="3. Obrigações" descricao={`${f.linhas.length} linha(s). Máximo de ${R.LIMITE_PARCELAS}. A correção monetária é informada em cada linha.`}
          acoes={<Botao tamanho="sm" icone="mais" onClick={() => alterar({ linhas: [...f.linhas, novaLinha()] })}>Adicionar linha</Botao>}>
          <div className="space-y-4">
            {f.linhas.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">Nenhuma linha. Clique em "Adicionar linha" para começar.</p>}
            {f.linhas.map((l, i) => (
              <LinhaEditavel key={l.id} linha={l} indice={i} erros={errosForm}
                onChange={(parte) => alterarLinha(l.id, parte)} onRemover={() => alterar({ linhas: f.linhas.filter((x) => x.id !== l.id) })} />
            ))}
            {f.linhas.length > 0 && <Botao icone="mais" onClick={() => alterar({ linhas: [...f.linhas, novaLinha()] })}>Adicionar linha</Botao>}
            <div>
              <label htmlFor="obs-planilha" className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Observações (aparecem no demonstrativo)</label>
              <textarea id="obs-planilha" rows={3} maxLength={1000} value={f.observacoes} onChange={(e) => alterar({ observacoes: e.target.value })}
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
          <Botao variante="verde" icone="atualizar" disabled={!f.linhas.length} onClick={calcular} className="flex-1 sm:flex-none sm:min-w-[220px]">Calcular planilha</Botao>
          <Botao onClick={() => { limpar(); definirRes(null); definirErros([]); }}>Limpar tudo</Botao>
        </div>

        <div ref={topo} />
        {res && (
          <Cartao titulo="Resultado consolidado" descricao={`Calculado até ${f.criterios.dataFinal} com a correção monetária informada em cada linha. Alterar qualquer dado limpa este resultado: calcule novamente.`} className="section-open">
            <div className="space-y-5">
              <B.ResumoConsolidado totais={res.totais} mostrarHonorarios={f.criterios.honorarios.ativo} />
              <Tabela legenda="Planilha consolidada" colunas={['Nº', 'Descrição', 'Competência', 'Vencimento', 'Valor original', 'Correção monetária', 'Juros', 'Multa', 'Outros encargos', 'Pagamentos', 'Saldo atualizado']} numericas={[4, 5, 6, 7, 8, 9, 10]}
                linhas={res.resultados.map((_, i) => celulas(i))}
                rodape={['', 'Totais', '', '', m(res.totais.original), m(res.totais.correcao), m(res.totais.juros), m(res.totais.multa), m(res.totais.encargosNominais), res.totais.pagamentos ? `-${m(res.totais.pagamentos)}` : '—', m(res.totais.saldoFinal)]} />
              <p className="text-xs text-slate-500 dark:text-slate-400">O saldo de cada linha inclui honorários em percentual, quando aplicados. Honorários de valor fixo entram uma única vez no total.</p>
              <div className="flex flex-wrap gap-2">
                <Botao variante="verde" icone="baixar" onClick={gerarPlanilha}>Gerar planilha de cálculo</Botao>
                <Botao variante="primario" icone="memoria" onClick={gerarMemoria}>Gerar memória de cálculo</Botao>
                <Botao icone="baixar" onClick={exportarCsv}>Exportar CSV</Botao>
              </div>
            </div>
          </Cartao>
        )}
      </Pagina>
    );
  }

  window.CentralModulos = Object.assign(window.CentralModulos || {}, { ModuloPlanilha });
})();
