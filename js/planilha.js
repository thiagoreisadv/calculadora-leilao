/*
 * Módulo: Planilha consolidada de débitos.
 * Várias obrigações numa só tela, cada uma com critérios próprios opcionais. Cada linha é atualizada
 * numa chamada própria à API da Debit (a API não oferece cálculo em lote com critérios diferentes),
 * com no máximo duas chamadas simultâneas, pausa automática quando o limite de uso é atingido e
 * possibilidade de cancelar. Resultado de linha alterada depois do cálculo é marcado como desatualizado.
 */
(() => {
  const { useState, useRef, useMemo } = React;
  const UI = window.CentralUI;
  const B = window.CentralBlocos;
  const R = window.CentralRegras;
  const Api = window.CentralApi;
  const Motor = window.CentralMotor;
  const M = window.CentralModulos;
  const { Pagina, Cartao, Botao, Alerta, CampoTexto, CampoMoeda, CampoData, CampoCompetencia, CampoPercentual, Selecao, Tabela } = UI;

  let sequencia = 0;
  const novoId = () => { sequencia += 1; return `l${Date.now().toString(36)}${sequencia}`; };

  const inicial = () => ({
    titulo: '', credor: '', devedor: '', observacoes: '', linhas: [], criterios: B.criteriosPadrao(),
  });

  const novaLinha = () => ({ id: novoId(), descricao: '', competencia: '', vencimento: '', valor: '', outros: '', indice: '', jurosPct: '', multaPct: '', pagamentos: [] });

  // Critérios efetivos da linha: padrão da planilha + substituições opcionais da própria linha.
  function criteriosDaLinha(linha, global) {
    const c = JSON.parse(JSON.stringify(global));
    if (linha.indice) { c.modoCorrecao = 'indice'; c.indice = linha.indice; }
    if (linha.jurosPct !== '') { const v = R.lerValor(linha.jurosPct); c.juros = { ...c.juros, ativo: v > 0, percentual: linha.jurosPct }; }
    if (linha.multaPct !== '') { const v = R.lerValor(linha.multaPct); c.multa = { ...c.multa, ativo: v > 0, percentual: linha.multaPct }; }
    return c;
  }

  const assinatura = (linha, global) => JSON.stringify([linha.vencimento, linha.valor, linha.outros, linha.pagamentos.map((p) => [p.data, p.valor]), criteriosDaLinha(linha, global)]);

  function LinhaEditavel({ linha, indice, onChange, onRemover, erros, grupos, catalogoPronto }) {
    const [pagamentos, definirPagamentos] = useState(linha.pagamentos.length > 0);
    const [proprios, definirProprios] = useState(Boolean(linha.indice || linha.jurosPct !== '' || linha.multaPct !== ''));
    const erro = (campo) => (erros.find((e) => e.linha === indice && e.campo === campo) || {}).mensagem;
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 p-3 sm:p-4 section-open">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Linha {indice + 1}</span>
          <div className="flex flex-wrap gap-1 justify-end">
            <Botao tamanho="sm" variante="fantasma" aria-expanded={pagamentos} onClick={() => definirPagamentos(!pagamentos)}>Pagamentos{linha.pagamentos.length ? ` (${linha.pagamentos.length})` : ''}</Botao>
            <Botao tamanho="sm" variante="fantasma" aria-expanded={proprios} onClick={() => definirProprios(!proprios)}>Critérios próprios{(linha.indice || linha.jurosPct !== '' || linha.multaPct !== '') ? ' •' : ''}</Botao>
            <Botao tamanho="sm" variante="perigo" icone="lixeira" aria-label={`Remover linha ${indice + 1}`} onClick={onRemover} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <CampoTexto rotulo="Descrição" valor={linha.descricao} onChange={(v) => onChange({ descricao: v })} maxLength={80} className="lg:col-span-2" />
          <CampoCompetencia rotulo="Competência" valor={linha.competencia} onChange={(v) => onChange({ competencia: v })} />
          <CampoData rotulo="Vencimento" obrigatorio valor={linha.vencimento} onChange={(v) => onChange({ vencimento: v })} erro={erro('vencimento')} />
          <CampoMoeda rotulo="Valor original" obrigatorio valor={linha.valor} onChange={(v) => onChange({ valor: v })} erro={erro('valor')} />
          <CampoMoeda rotulo="Outros encargos (nominais)" valor={linha.outros} onChange={(v) => onChange({ outros: v })} className="lg:col-span-2" ajuda="Somados sem atualização, se houver fundamento." />
        </div>
        {proprios && (
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700/50 grid grid-cols-1 sm:grid-cols-3 gap-3 section-open">
            <Selecao rotulo="Índice desta linha" valor={linha.indice} onChange={(v) => onChange({ indice: v })} grupos={grupos} placeholder="Usar o padrão da planilha" desabilitado={!catalogoPronto} />
            <CampoPercentual rotulo="Juros desta linha" valor={linha.jurosPct} onChange={(v) => onChange({ jurosPct: v })} placeholder="padrão" ajuda="Vazio usa o padrão; 0 desliga os juros." />
            <CampoPercentual rotulo="Multa desta linha" valor={linha.multaPct} onChange={(v) => onChange({ multaPct: v })} placeholder="padrão" ajuda="Vazio usa o padrão; 0 desliga a multa." />
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
    const [f, definirF, limpar] = UI.useRascunho('planilha', inicial);
    const catalogo = UI.useCatalogo();
    const [errosForm, definirErros] = useState([]);
    const [res, definirRes] = useState({}); // id -> { estado, dados, erro, assinatura }
    const [progresso, definirProgresso] = useState(null);
    const [erroGeral, definirErroGeral] = useState(null);
    const [espera, definirEspera] = useState(0);
    const controle = useRef(null);
    const topo = useRef(null);

    const alterar = (parte) => definirF({ ...f, ...parte });
    const alterarLinha = (id, parte) => alterar({ linhas: f.linhas.map((l) => (l.id === id ? { ...l, ...parte } : l)) });

    const grupos = useMemo(() => {
      const lista = catalogo.indices || [];
      return [{ titulo: 'Índices', opcoes: lista.map((i) => ({ valor: String(i.slug || i.id), rotulo: i.name })) }];
    }, [catalogo.indices]);

    function validar() {
      const erros = R.validarCalculo(f.criterios, f.linhas);
      f.linhas.forEach((l, i) => {
        if (l.outros && Number.isNaN(R.lerValor(l.outros))) erros.push({ campo: 'outros', linha: i, mensagem: `Linha ${i + 1}: valor de outros encargos inválido.` });
        if (l.competencia && !/^(0[1-9]|1[0-2])\/\d{4}$/.test(l.competencia)) erros.push({ campo: 'competencia', linha: i, mensagem: `Linha ${i + 1}: competência deve ser MM/AAAA.` });
        // Cada linha pode usar índice próprio; sem índice global nem próprio não há como corrigir.
        if (f.criterios.modoCorrecao === 'indice' && !f.criterios.indice && !l.indice) erros.push({ campo: 'indice', linha: i, mensagem: `Linha ${i + 1}: selecione o índice (padrão ou próprio).` });
      });
      // Remove duplicatas do erro de índice global quando todas as linhas têm índice próprio.
      return erros.filter((e) => !(e.campo === 'indice' && e.linha === undefined && f.linhas.length && f.linhas.every((l) => l.indice)));
    }

    async function executar(somenteComErro) {
      definirErroGeral(null);
      const erros = validar();
      definirErros(erros);
      if (erros.length) { UI.avisar('Corrija os campos destacados antes de calcular.', 'erro'); return; }
      const alvo = f.linhas.filter((l) => {
        const atual = res[l.id];
        if (somenteComErro) return !atual || atual.estado !== 'ok' || atual.assinatura !== assinatura(l, f.criterios);
        return true;
      });
      if (!alvo.length) { UI.avisar('Todas as linhas já estão atualizadas.', 'info'); return; }
      controle.current = new AbortController();
      definirProgresso({ feito: 0, total: alvo.length });
      const tarefas = alvo.map((l) => async () => {
        const c = criteriosDaLinha(l, f.criterios);
        const parcela = { descricao: l.descricao || 'Obrigação', vencimento: l.vencimento, valor: l.valor, pagamentos: l.pagamentos.map((p) => ({ data: p.data, valor: p.valor })) };
        return Motor.atualizarGrupo(c, [parcela], { sinal: controle.current.signal, aoEsperar: definirEspera });
      });
      const resultados = await Motor.executarFila(tarefas, {
        limite: 2, sinal: controle.current.signal,
        aoProgredir: (feito, total) => { definirProgresso({ feito, total }); definirEspera(0); },
      });
      const novo = { ...res };
      let falhaGeral = null;
      resultados.forEach((r, i) => {
        const l = alvo[i];
        if (!r) return; // cancelado antes de executar
        if (r.ok && !r.valor.incompleto) novo[l.id] = { estado: 'ok', dados: r.valor, assinatura: assinatura(l, f.criterios) };
        else if (r.ok) novo[l.id] = { estado: 'erro', erro: r.valor.alertas.map((a) => a.mensagem).join(' ') || 'A API não devolveu valor atualizado.', assinatura: assinatura(l, f.criterios) };
        else {
          novo[l.id] = { estado: 'erro', erro: Api.mensagemDeErro(r.erro), assinatura: assinatura(l, f.criterios), tipo: r.erro && r.erro.tipo };
          if (r.erro && ['acesso', 'naoConfigurado', 'semCodigo'].includes(r.erro.tipo)) falhaGeral = r.erro;
        }
      });
      definirRes(novo);
      definirErroGeral(falhaGeral);
      definirProgresso(null); definirEspera(0);
      controle.current = null;
      setTimeout(() => topo.current && topo.current.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    }

    function cancelar() { if (controle.current) controle.current.abort(); }

    // Resumo por linha, considerando só resultados em dia com os dados atuais.
    const linhasResumo = f.linhas.map((l, i) => {
      const atual = res[l.id];
      const emDia = atual && atual.assinatura === assinatura(l, f.criterios);
      const original = R.lerValor(l.valor);
      const outros = R.lerValor(l.outros) || 0;
      const pagamentosNom = R.arredondar((l.pagamentos || []).reduce((s, p) => s + (R.lerValor(p.valor) || 0), 0)) * -1;
      let estado = 'pendente';
      if (atual && !emDia) estado = 'desatualizado';
      else if (atual && atual.estado === 'erro') estado = 'erro';
      else if (atual && atual.estado === 'ok') estado = 'ok';
      const s = estado === 'ok' ? atual.dados.resumo : null;
      return {
        indice: i, linha: l, estado, erro: atual && atual.erro,
        original: Number.isNaN(original) ? 0 : original, outros, pagamentos: pagamentosNom,
        correcao: s ? s.correcaoMonetaria : null, juros: s ? s.juros : null, multa: s ? s.multa : null, honorarios: s ? s.honorarios : null,
        saldo: s ? R.arredondar(s.total + outros) : null,
        memoria: s ? atual.dados.linhas.find((x) => x.tipo === 'parcela').memoria : '',
      };
    });

    const prontas = linhasResumo.filter((x) => x.estado === 'ok');
    const pendentes = linhasResumo.filter((x) => x.estado !== 'ok');
    const soma = (campo) => R.arredondar(prontas.reduce((s, x) => s + (x[campo] || 0), 0));
    const totais = {
      original: soma('original'), correcao: soma('correcao'), juros: soma('juros'), multa: soma('multa'), honorarios: soma('honorarios'),
      outros: soma('outros'), pagamentos: soma('pagamentos'), saldo: soma('saldo'),
    };
    const rotuloEstado = { ok: 'Atualizado', erro: 'Erro', desatualizado: 'Alterada — recalcular', pendente: 'Não calculada' };

    function celulas(x) {
      const ok = x.estado === 'ok';
      const v = (n) => (ok ? (n === null ? '—' : R.formatarMoeda(n)) : '—');
      return [x.indice + 1, x.linha.descricao || '—', x.linha.competencia || '—', x.linha.vencimento || '—', R.formatarMoeda(x.original), v(x.correcao), v(x.juros), v(x.multa), x.outros ? R.formatarMoeda(x.outros) : '—', x.pagamentos ? R.formatarMoeda(x.pagamentos) : '—', ok ? R.formatarMoeda(x.saldo) : rotuloEstado[x.estado]];
    }

    function exportarCsv() {
      const linhas = linhasResumo.map((x) => {
        const ok = x.estado === 'ok';
        return [x.indice + 1, x.linha.descricao, x.linha.competencia, x.linha.vencimento, R.numeroCSV(x.original), ok ? R.numeroCSV(x.correcao) : '', ok ? R.numeroCSV(x.juros) : '', ok ? R.numeroCSV(x.multa) : '', R.numeroCSV(x.outros), R.numeroCSV(x.pagamentos), ok ? R.numeroCSV(x.saldo) : '', rotuloEstado[x.estado]];
      });
      linhas.push(['', 'TOTAL (somente linhas atualizadas)', '', '', R.numeroCSV(totais.original), R.numeroCSV(totais.correcao), R.numeroCSV(totais.juros), R.numeroCSV(totais.multa), R.numeroCSV(totais.outros), R.numeroCSV(totais.pagamentos), R.numeroCSV(totais.saldo), '']);
      const csv = R.gerarCSV(['Número', 'Descrição', 'Competência', 'Vencimento', 'Valor original', 'Correção monetária', 'Juros', 'Multa', 'Outros encargos', 'Pagamentos', 'Saldo atualizado', 'Situação'], linhas);
      UI.baixarArquivo(UI.nomeArquivo(f.titulo || 'planilha-debitos', 'csv'), csv, 'text/csv;charset=utf-8');
    }

    function gerarMemoria() {
      const m = R.formatarMoeda;
      const t = totais;
      const registro = {
        tipo: 'planilha',
        titulo: 'Memória de cálculo — Planilha consolidada de débitos',
        subtitulo: f.titulo || 'Planilha de débitos',
        geradoEm: new Date().toISOString(),
        dataReferencia: f.criterios.dataFinal,
        profissional: window.CentralRegistro.profissional(),
        identificacao: [['Título', f.titulo], ['Credor', f.credor], ['Devedor', f.devedor], ['Linhas atualizadas', `${prontas.length} de ${linhasResumo.length}`]],
        criterios: B.descreverCriterios(f.criterios, catalogo).concat(linhasResumo.filter((x) => x.linha.indice || x.linha.jurosPct !== '' || x.linha.multaPct !== '').map((x) => [`Critérios próprios — linha ${x.indice + 1}`, B.descreverCriterios(criteriosDaLinha(x.linha, f.criterios), catalogo).slice(0, 4).map((p) => `${p[0]}: ${p[1]}`).join(' | ')])),
        resumo: [['Valor original', m(t.original)], ['Correção monetária', m(t.correcao)], ['Juros', m(t.juros)], ['Multa', m(t.multa)], ...(t.honorarios ? [['Honorários', m(t.honorarios)]] : []), ['Outros encargos (valores informados, sem atualização)', m(t.outros)], ['Pagamentos (valores nominais)', m(t.pagamentos)]],
        total: { rotulo: 'Saldo consolidado atualizado', valor: m(t.saldo) },
        secoes: [{
          titulo: 'Planilha de débitos', colunas: ['Nº', 'Descrição', 'Competência', 'Vencimento', 'Valor original', 'Correção', 'Juros', 'Multa', 'Outros encargos', 'Pagamentos', 'Saldo atualizado'],
          numericas: [4, 5, 6, 7, 8, 9, 10], linhas: linhasResumo.map(celulas),
          rodape: ['', 'Totais', '', '', m(t.original), m(t.correcao), m(t.juros), m(t.multa), m(t.outros), m(t.pagamentos), m(t.saldo)],
        }],
        memorias: prontas.map((x) => ({ rotulo: `Linha ${x.indice + 1} — ${x.linha.descricao || 'Obrigação'}`, texto: x.memoria })),
        alertas: pendentes.length ? [{ tipo: 'aviso', mensagem: `${pendentes.length} linha(s) sem valor atualizado não entraram nos totais.` }] : [],
        observacoes: f.observacoes,
        fonte: 'API da Debit (debit.com.br), acessada por meio de servidor intermediário seguro',
        totais: t,
      };
      B.guardarMemoria(registro, true);
    }

    const carregando = Boolean(progresso);
    const temResultado = Object.keys(res).length > 0;
    return (
      <Pagina titulo="Planilha consolidada de débitos" descricao="Gerencie várias obrigações numa única tela, informe pagamentos, defina critérios por linha e veja o total consolidado.">
        <B.AvisoConexao />
        <B.AvisoConta />

        <Cartao titulo="1. Identificação" descricao="Nomes e descrições ficam apenas neste navegador e aparecem no demonstrativo. Não são enviados à Debit.">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <CampoTexto rotulo="Título da planilha" valor={f.titulo} onChange={(v) => alterar({ titulo: v })} placeholder="Ex.: Débitos do contrato 123" />
            <CampoTexto rotulo="Credor" valor={f.credor} onChange={(v) => alterar({ credor: v })} />
            <CampoTexto rotulo="Devedor" valor={f.devedor} onChange={(v) => alterar({ devedor: v })} />
          </div>
        </Cartao>

        <Cartao titulo="2. Critérios padrão" descricao="Aplicados a todas as linhas, exceto onde a linha tiver critérios próprios.">
          <B.CriteriosCorrecao valor={f.criterios} onChange={(c) => alterar({ criterios: c })} erros={errosForm.filter((e) => e.linha === undefined)} />
        </Cartao>

        <Cartao titulo="3. Obrigações" descricao={`${f.linhas.length} linha(s). Máximo de ${R.LIMITE_PARCELAS}.`}
          acoes={<Botao tamanho="sm" icone="mais" onClick={() => alterar({ linhas: [...f.linhas, novaLinha()] })}>Adicionar linha</Botao>}>
          <div className="space-y-4">
            {f.linhas.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">Nenhuma linha. Clique em "Adicionar linha" para começar.</p>}
            {f.linhas.map((l, i) => (
              <LinhaEditavel key={l.id} linha={l} indice={i} erros={errosForm} grupos={grupos} catalogoPronto={Boolean(catalogo.indices)}
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
        {erroGeral && (
          <Alerta tipo="erro" titulo="Atualização interrompida" acao={<Botao tamanho="sm" onClick={() => UI.navegar('conexao')}>Abrir configuração da conexão</Botao>}>{Api.mensagemDeErro(erroGeral)}</Alerta>
        )}

        <div className="sticky bottom-3 z-20 p-3 rounded-2xl bg-white/95 dark:bg-[#14243A]/95 border border-slate-200 dark:border-slate-700/60 shadow-card backdrop-blur space-y-2">
          {progresso && (
            <div aria-live="polite">
              <div className="flex justify-between text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                <span>{espera ? `Aguardando o limite de uso da Debit (${espera}s)…` : 'Atualizando com a Debit…'}</span><span>{progresso.feito}/{progresso.total}</span>
              </div>
              <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden"><div className="h-full bg-emerald-600 transition-all" style={{ width: `${(progresso.feito / progresso.total) * 100}%` }} /></div>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Botao variante="verde" icone="atualizar" carregando={carregando} disabled={!f.linhas.length} onClick={() => executar(false)} className="flex-1 sm:flex-none sm:min-w-[220px]">Atualizar tudo</Botao>
            {temResultado && pendentes.length > 0 && !carregando && <Botao icone="atualizar" onClick={() => executar(true)}>Recalcular pendentes ({pendentes.length})</Botao>}
            {carregando && <Botao variante="perigo" onClick={cancelar}>Cancelar</Botao>}
            <Botao disabled={carregando} onClick={() => { limpar(); definirRes({}); definirErros([]); }}>Limpar tudo</Botao>
          </div>
        </div>

        <div ref={topo} />
        {temResultado && (
          <Cartao titulo="Resultado consolidado" descricao={`Atualizado até ${f.criterios.dataFinal}. Totais consideram apenas as linhas atualizadas e em dia com os dados atuais.`} className="section-open">
            <div className="space-y-5">
              {pendentes.length > 0 && <Alerta tipo="aviso" titulo={`${pendentes.length} linha(s) fora do total`}>Linhas com erro, alteradas depois do cálculo ou ainda não calculadas não entram nos totais. Use "Recalcular pendentes" após corrigir.</Alerta>}
              <B.ResumoConsolidado totais={{ original: totais.original, correcao: totais.correcao, juros: totais.juros, multa: totais.multa, honorarios: totais.honorarios, pagamentos: totais.pagamentos, encargosNominais: totais.outros, saldoComEncargos: totais.saldo, semDetalhe: false }} mostrarHonorarios={f.criterios.honorarios.ativo} />
              <Tabela legenda="Planilha consolidada" colunas={['Nº', 'Descrição', 'Competência', 'Vencimento', 'Valor original', 'Correção', 'Juros', 'Multa', 'Outros encargos', 'Pagamentos', 'Saldo atualizado']} numericas={[4, 5, 6, 7, 8, 9, 10]}
                linhas={linhasResumo.map(celulas)} rodape={['', 'Totais', '', '', R.formatarMoeda(totais.original), R.formatarMoeda(totais.correcao), R.formatarMoeda(totais.juros), R.formatarMoeda(totais.multa), R.formatarMoeda(totais.outros), R.formatarMoeda(totais.pagamentos), R.formatarMoeda(totais.saldo)]} />
              {linhasResumo.filter((x) => x.estado === 'erro').map((x) => <Alerta key={x.linha.id} tipo="erro" titulo={`Linha ${x.indice + 1} não atualizada`}>{x.erro}</Alerta>)}
              <div className="flex flex-wrap gap-2">
                <Botao variante="primario" icone="memoria" disabled={!prontas.length} onClick={gerarMemoria}>Gerar memória de cálculo</Botao>
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
