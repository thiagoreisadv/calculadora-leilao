/*
 * Módulo: Pensão alimentícia.
 * Usa o cálculo específico "pensaoAlimenticia" da API da Debit (competências, pagamentos,
 * prescrição e ritos do art. 528 do CPC). Os campos enviados são exatamente os documentados;
 * o resultado é exibido com os nomes que a API devolve, sem reinterpretação.
 */
(() => {
  const { useState, useRef } = React;
  const UI = window.CentralUI;
  const B = window.CentralBlocos;
  const R = window.CentralRegras;
  const Api = window.CentralApi;
  const { Pagina, Cartao, Botao, Alerta, CampoTexto, CampoMoeda, CampoPercentual, CampoData, CampoCompetencia, Selecao, Chave, Indicador, Tabela } = UI;

  let sequencia = 0;
  const novoId = () => { sequencia += 1; return `n${Date.now().toString(36)}${sequencia}`; };

  const TIPOS_FIXACAO = [
    { valor: 'percentual_sm', rotulo: 'Percentual do salário mínimo' },
    { valor: 'valor_fixo', rotulo: 'Valor fixo mensal' },
    { valor: 'percentual_liquido', rotulo: 'Percentual dos rendimentos líquidos' },
    { valor: 'percentual_bruto', rotulo: 'Percentual dos rendimentos brutos' },
    { valor: 'mista', rotulo: 'Fixação mista' },
  ];

  const precisaPercentual = (t) => ['percentual_sm', 'percentual_liquido', 'percentual_bruto', 'mista'].includes(t);
  const precisaValorFixo = (t) => ['valor_fixo', 'mista'].includes(t);
  const precisaSalario = (t) => ['percentual_liquido', 'percentual_bruto'].includes(t);

  const inicial = () => ({
    descricao: '', alimentante: '', alimentando: '', observacoes: '',
    fixacao: { tipo: '', percentual: '', valorFixo: '', inicioVigencia: '' },
    dataBase: R.hojeBR(), gerador: { de: '', ate: '' }, competencias: [],
    indice: '', jurosAtivo: false, jurosPct: '', prescricao: '', ajuizamento: '', imputacao: '',
    pagamentos: [], manter: false,
  });

  function proximasCompetencias(de, ate) {
    const ini = R.competenciaParaData(de); const fim = R.competenciaParaData(ate);
    if (!ini || !fim) return null;
    const lista = [];
    for (let i = 0; i < 600; i += 1) {
      const d = R.adicionarMeses(ini, i);
      const comp = d.slice(3);
      lista.push(comp);
      if (comp === ate) return lista;
      if (R.lerData(d).ts > R.lerData(fim).ts) return null;
    }
    return null;
  }

  function construirCampos(f) {
    const campos = {
      'fixacao.tipo': f.fixacao.tipo,
      dia_atualiza: f.dataBase,
      lista: f.competencias.map((c) => ({ mes_ano: c.mes_ano, ...(precisaSalario(f.fixacao.tipo) && c.salario ? { salario_base: R.lerValor(c.salario) } : {}) })),
      'parametrosAtualizacao.prescricao.modo': f.prescricao,
    };
    if (precisaPercentual(f.fixacao.tipo) && f.fixacao.percentual) campos['fixacao.percentual'] = R.lerValor(f.fixacao.percentual);
    if (precisaValorFixo(f.fixacao.tipo) && f.fixacao.valorFixo) campos['fixacao.valor_fixo'] = R.lerValor(f.fixacao.valorFixo);
    if (f.fixacao.inicioVigencia) campos['fixacao.data_inicio_vigencia'] = f.fixacao.inicioVigencia;
    if (f.indice) campos['parametrosAtualizacao.indice_correcao'] = Number(f.indice);
    if (f.jurosAtivo) { campos['parametrosAtualizacao.juros.percentual'] = R.lerValor(f.jurosPct); campos['parametrosAtualizacao.juros.a_partir'] = 'vencimento'; }
    if (f.ajuizamento) campos['processo.data_ajuizamento_execucao'] = f.ajuizamento;
    if (f.imputacao) campos['parametrosAtualizacao.imputacao.modo'] = f.imputacao;
    if (f.pagamentos.length) campos.pagamentos = f.pagamentos.map((p) => ({ valor: R.lerValor(p.valor), data: p.data, ...(p.desc ? { descricao: p.desc } : {}) }));
    return campos;
  }

  function validar(f) {
    const erros = [];
    const e = (campo, mensagem) => erros.push({ campo, mensagem });
    if (!f.fixacao.tipo) e('tipo', 'Selecione como a pensão foi fixada.');
    if (precisaPercentual(f.fixacao.tipo)) {
      const p = R.lerValor(f.fixacao.percentual);
      if (!(p > 0 && p <= 100)) e('percentual', 'Informe o percentual da pensão (entre 0 e 100).');
    }
    if (precisaValorFixo(f.fixacao.tipo) && !(R.lerValor(f.fixacao.valorFixo) > 0)) e('valorFixo', 'Informe o valor fixo mensal.');
    if (f.fixacao.inicioVigencia && !R.dataEhValida(f.fixacao.inicioVigencia)) e('inicioVigencia', 'Data inválida (DD/MM/AAAA).');
    if (!R.dataEhValida(f.dataBase)) e('dataBase', 'Informe a data de atualização (DD/MM/AAAA).');
    if (!f.competencias.length) e('competencias', 'Inclua ao menos uma competência (mês devido).');
    if (f.competencias.length > R.LIMITE_PARCELAS) e('competencias', `O limite é de ${R.LIMITE_PARCELAS} competências por cálculo.`);
    f.competencias.forEach((c, i) => {
      if (!/^(0[1-9]|1[0-2])\/\d{4}$/.test(c.mes_ano)) e('competencia', `Competência ${i + 1}: use MM/AAAA.`);
      if (precisaSalario(f.fixacao.tipo) && !(R.lerValor(c.salario) > 0)) e('salario', `Competência ${i + 1} (${c.mes_ano || '—'}): informe o rendimento usado como base.`);
    });
    if (f.jurosAtivo && !(R.lerValor(f.jurosPct) >= 0)) e('jurosPct', 'Informe o percentual de juros.');
    if (!f.prescricao) e('prescricao', 'Escolha explicitamente o critério de prescrição. Para alimentando menor sob poder familiar, a lei afasta a prescrição.');
    if (f.ajuizamento && !R.dataEhValida(f.ajuizamento)) e('ajuizamento', 'Data inválida (DD/MM/AAAA).');
    f.pagamentos.forEach((p, i) => {
      if (!R.dataEhValida(p.data)) e('pagamento', `Pagamento ${i + 1}: data inválida.`);
      if (!(R.lerValor(p.valor) > 0)) e('pagamento', `Pagamento ${i + 1}: informe um valor maior que zero.`);
    });
    return erros;
  }

  function ModuloPensao() {
    const [f, definirF, limpar] = UI.useRascunho('pensao', inicial);
    const catalogo = UI.useCatalogo();
    const [errosForm, definirErros] = useState([]);
    const [carregando, definirCarregando] = useState(false);
    const [erroApi, definirErroApi] = useState(null);
    const [espera, definirEspera] = useState(0);
    const [resultado, definirResultado] = useState(null);
    const topo = useRef(null);

    const alterar = (parte) => { definirF({ ...f, ...parte }); definirResultado(null); };
    const alterarFixacao = (parte) => alterar({ fixacao: { ...f.fixacao, ...parte } });
    const erroCampo = (campo) => (errosForm.find((x) => x.campo === campo) || {}).mensagem;

    function gerarCompetencias() {
      const lista = proximasCompetencias(f.gerador.de, f.gerador.ate);
      if (!lista) { UI.avisar('Informe o período no formato MM/AAAA, do mês inicial ao final.', 'erro'); return; }
      const existentes = new Set(f.competencias.map((c) => c.mes_ano));
      const novas = lista.filter((c) => !existentes.has(c)).map((c) => ({ id: novoId(), mes_ano: c, salario: '' }));
      alterar({ competencias: [...f.competencias, ...novas].sort((a, b) => (a.mes_ano.slice(3) + a.mes_ano.slice(0, 2)).localeCompare(b.mes_ano.slice(3) + b.mes_ano.slice(0, 2))) });
      UI.avisar(`${novas.length} competência(s) adicionada(s).`);
    }

    async function calcular() {
      definirErroApi(null);
      const erros = validar(f);
      definirErros(erros);
      if (erros.length) { UI.avisar('Corrija os campos destacados antes de calcular.', 'erro'); return; }
      definirCarregando(true); definirEspera(0); definirResultado(null);
      try {
        const resposta = await Api.pensao({ fields: construirCampos(f), manter: f.manter, nome: 'Central de Cálculos — pensão alimentícia' }, { aoEsperar: definirEspera });
        const dados = resposta && resposta.resultado;
        if (!dados || typeof dados !== 'object') throw new Api.ErroApi('debit', 'A API da Debit não devolveu o resultado do cálculo.');
        definirResultado({
          dados, calcId: resposta.calcId,
          total: typeof dados.debito_total_atualizado === 'number' ? dados.debito_total_atualizado : null,
          tabela: R.extrairTabelaGenerica(dados), campos: R.achatarCampos(dados),
        });
        setTimeout(() => topo.current && topo.current.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
      } catch (e) { definirErroApi(e); }
      definirCarregando(false); definirEspera(0);
    }

    function criteriosDescritos() {
      const t = TIPOS_FIXACAO.find((x) => x.valor === f.fixacao.tipo);
      const idx = (catalogo.indices || []).find((i) => String(i.id) === String(f.indice));
      const lista = [['Fixação da pensão', t ? t.rotulo : f.fixacao.tipo]];
      if (f.fixacao.percentual && precisaPercentual(f.fixacao.tipo)) lista.push(['Percentual fixado', R.formatarPercentual(R.lerValor(f.fixacao.percentual))]);
      if (f.fixacao.valorFixo && precisaValorFixo(f.fixacao.tipo)) lista.push(['Valor fixo mensal', R.formatarMoeda(R.lerValor(f.fixacao.valorFixo))]);
      if (f.fixacao.inicioVigencia) lista.push(['Início de vigência da fixação', f.fixacao.inicioVigencia]);
      lista.push(['Data de atualização (data-base)', f.dataBase]);
      lista.push(['Índice de correção', idx ? idx.name : (f.indice ? `id ${f.indice}` : 'Padrão da Debit para pensão alimentícia')]);
      lista.push(['Juros', f.jurosAtivo ? `${R.formatarPercentual(R.lerValor(f.jurosPct))} a partir do vencimento (conforme motor da Debit)` : 'Conforme padrão da Debit para pensão alimentícia']);
      lista.push(['Prescrição', { bienal: 'Bienal (art. 206, § 2º, CC)', quinquenal: 'Quinquenal', nenhuma: 'Não aplicada (arts. 197, II, e 198, I, CC)' }[f.prescricao]]);
      if (f.ajuizamento) lista.push(['Ajuizamento da execução', f.ajuizamento]);
      lista.push(['Imputação dos pagamentos', f.imputacao ? { retroativa: 'Retroativa (parcelas vencidas mais antigas)', prospectiva: 'Prospectiva' }[f.imputacao] : 'Padrão da Debit']);
      lista.push(['Responsabilidade pelos critérios', 'Definidos pelo usuário para o caso concreto; a ferramenta não valida sua adequação jurídica.']);
      return lista;
    }

    function gerarMemoria() {
      const r = resultado;
      const m = R.formatarMoeda;
      const resumo = r.campos
        .filter(([k, v]) => typeof v !== 'object' && v !== null && /debito_total|subtotal|prescricao|rito_prisao/i.test(k))
        .map(([k, v]) => [R.rotuloCampo(k), R.formatarCampoApi(k, v)]);
      const registro = {
        tipo: 'pensao',
        titulo: 'Memória de cálculo — Pensão alimentícia',
        subtitulo: f.descricao || 'Débito de pensão alimentícia',
        geradoEm: new Date().toISOString(),
        dataReferencia: f.dataBase,
        profissional: window.CentralRegistro.profissional(),
        identificacao: [['Descrição', f.descricao], ['Alimentante', f.alimentante], ['Alimentando', f.alimentando], ['Competências informadas', String(f.competencias.length)]],
        criterios: criteriosDescritos(),
        resumo,
        total: r.total !== null ? { rotulo: 'Débito total atualizado', valor: m(r.total) } : null,
        secoes: r.tabela ? [{ titulo: 'Competências (campos conforme retornados pela API)', colunas: r.tabela.colunas.map(R.rotuloCampo), linhas: r.tabela.linhas.map((l) => l.map((v, i) => R.formatarCampoApi(r.tabela.colunas[i], v))), numericas: r.tabela.colunas.map((c, i) => (typeof r.tabela.linhas[0][i] === 'number' ? i : -1)).filter((i) => i >= 0) }] : [],
        memorias: [],
        alertas: r.total === null ? [{ tipo: 'aviso', mensagem: 'A API não devolveu o campo de total (debito_total_atualizado); confira o demonstrativo oficial.' }] : [],
        observacoes: f.observacoes,
        fonte: 'API da Debit (debit.com.br), cálculo específico de pensão alimentícia, acessada por meio de servidor intermediário seguro',
        calcIdDebit: r.calcId || null,
        tipoOficial: 'pensaoAlimenticia',
      };
      B.guardarMemoria(registro, true);
    }

    const r = resultado;
    const opcoesIndice = (catalogo.indices || []).filter((i) => i.type !== 'moeda').map((i) => ({ valor: String(i.id), rotulo: i.name }));
    return (
      <Pagina titulo="Pensão alimentícia" descricao="Calcule o débito de parcelas vencidas de pensão com o motor específico da Debit, tratando cada competência individualmente.">
        <B.AvisoConexao />
        <B.AvisoConta />

        <Cartao titulo="1. Identificação" descricao="Nomes e descrições ficam apenas neste navegador e aparecem no demonstrativo. Não são enviados à Debit.">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <CampoTexto rotulo="Descrição" valor={f.descricao} onChange={(v) => alterar({ descricao: v })} className="sm:col-span-2" placeholder="Ex.: Execução de alimentos — processo nº" />
            <CampoTexto rotulo="Alimentante (devedor)" valor={f.alimentante} onChange={(v) => alterar({ alimentante: v })} />
            <CampoTexto rotulo="Alimentando (credor)" valor={f.alimentando} onChange={(v) => alterar({ alimentando: v })} />
          </div>
        </Cartao>

        <Cartao titulo="2. Fixação da pensão">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Selecao rotulo="Como foi fixada" obrigatorio valor={f.fixacao.tipo} onChange={(v) => alterarFixacao({ tipo: v })} opcoes={TIPOS_FIXACAO} placeholder="Selecione" erro={erroCampo('tipo')} className="sm:col-span-2" />
            {precisaPercentual(f.fixacao.tipo) && <CampoPercentual rotulo="Percentual fixado" obrigatorio valor={f.fixacao.percentual} onChange={(v) => alterarFixacao({ percentual: v })} erro={erroCampo('percentual')} />}
            {precisaValorFixo(f.fixacao.tipo) && <CampoMoeda rotulo="Valor fixo mensal" obrigatorio valor={f.fixacao.valorFixo} onChange={(v) => alterarFixacao({ valorFixo: v })} erro={erroCampo('valorFixo')} />}
            <CampoData rotulo="Início de vigência da fixação" valor={f.fixacao.inicioVigencia} onChange={(v) => alterarFixacao({ inicioVigencia: v })} erro={erroCampo('inicioVigencia')} ajuda="Opcional." />
          </div>
        </Cartao>

        <Cartao titulo="3. Competências devidas" descricao="Informe os meses em que a pensão era devida. Cada mês é calculado individualmente, com seu vencimento.">
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
              <CampoCompetencia rotulo="Do mês" valor={f.gerador.de} onChange={(v) => alterar({ gerador: { ...f.gerador, de: v } })} />
              <CampoCompetencia rotulo="Até o mês" valor={f.gerador.ate} onChange={(v) => alterar({ gerador: { ...f.gerador, ate: v } })} />
              <Botao variante="primario" icone="mais" className="!h-11" onClick={gerarCompetencias}>Gerar meses</Botao>
            </div>
            {f.competencias.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">Nenhuma competência incluída.</p>}
            {f.competencias.length > 0 && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 divide-y divide-slate-100 dark:divide-slate-700/50 max-h-96 overflow-y-auto">
                {f.competencias.map((c, i) => (
                  <div key={c.id} className="grid grid-cols-[1fr_auto] sm:grid-cols-[8rem_1fr_auto] gap-3 items-end p-3">
                    <CampoCompetencia rotulo="Competência" valor={c.mes_ano} onChange={(v) => alterar({ competencias: f.competencias.map((x) => (x.id === c.id ? { ...x, mes_ano: v } : x)) })} />
                    {precisaSalario(f.fixacao.tipo)
                      ? <CampoMoeda rotulo="Rendimento base do mês" valor={c.salario} onChange={(v) => alterar({ competencias: f.competencias.map((x) => (x.id === c.id ? { ...x, salario: v } : x)) })} className="col-span-2 sm:col-span-1 order-last sm:order-none" />
                      : <div className="hidden sm:block" />}
                    <Botao variante="perigo" tamanho="sm" icone="lixeira" className="!h-11" aria-label={`Remover competência ${i + 1}`} onClick={() => alterar({ competencias: f.competencias.filter((x) => x.id !== c.id) })} />
                  </div>
                ))}
              </div>
            )}
            {erroCampo('competencias') && <p role="alert" className="text-xs font-medium text-red-600">{erroCampo('competencias')}</p>}
            <Botao tamanho="sm" icone="mais" onClick={() => alterar({ competencias: [...f.competencias, { id: novoId(), mes_ano: '', salario: '' }] })}>Adicionar competência avulsa</Botao>
          </div>
        </Cartao>

        <Cartao titulo="4. Pagamentos realizados" descricao="Pagamentos parciais ou totais já feitos. A destinação segue a regra de imputação escolhida abaixo.">
          <M2_ListaPagamentos itens={f.pagamentos} onChange={(v) => alterar({ pagamentos: v })} erro={erroCampo('pagamento')} />
        </Cartao>

        <Cartao titulo="5. Critérios de atualização" descricao="Escolha conforme a decisão ou o caso concreto. Os itens sem escolha usam o padrão do motor de pensão da Debit.">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <CampoData rotulo="Atualizar até (data-base)" obrigatorio valor={f.dataBase} onChange={(v) => alterar({ dataBase: v })} erro={erroCampo('dataBase')} comHoje />
            <Selecao rotulo="Índice de correção" valor={f.indice} onChange={(v) => alterar({ indice: v })} opcoes={opcoesIndice}
              placeholder={catalogo.carregando ? 'Carregando índices…' : 'Padrão da Debit'} desabilitado={!catalogo.indices} ajuda="Deixe no padrão se a decisão não indicar um índice." />
            <Selecao rotulo="Prescrição" obrigatorio valor={f.prescricao} onChange={(v) => alterar({ prescricao: v })} erro={erroCampo('prescricao')} placeholder="Selecione"
              opcoes={[{ valor: 'nenhuma', rotulo: 'Não aplicar (alimentando menor sob poder familiar ou incapaz)' }, { valor: 'bienal', rotulo: 'Bienal (2 anos)' }, { valor: 'quinquenal', rotulo: 'Quinquenal (5 anos)' }]}
              ajuda="A Debit usa prescrição bienal por padrão, o que reduz o total para filho menor. Por isso a escolha é obrigatória." />
            <CampoData rotulo="Ajuizamento da execução" valor={f.ajuizamento} onChange={(v) => alterar({ ajuizamento: v })} erro={erroCampo('ajuizamento')} ajuda="Opcional. Define o corte entre o rito da prisão e o da expropriação (art. 528 do CPC)." />
            <Selecao rotulo="Imputação dos pagamentos" valor={f.imputacao} onChange={(v) => alterar({ imputacao: v })} placeholder="Padrão da Debit"
              opcoes={[{ valor: 'retroativa', rotulo: 'Retroativa (quita as parcelas vencidas mais antigas)' }, { valor: 'prospectiva', rotulo: 'Prospectiva' }]} />
            <div className="sm:col-span-2 space-y-3">
              <Chave rotulo="Informar juros" descricao="Se desligado, vale o padrão da Debit para pensão alimentícia." marcado={f.jurosAtivo} onChange={(v) => alterar({ jurosAtivo: v })} />
              {f.jurosAtivo && <div className="max-w-xs section-open"><CampoPercentual rotulo="Percentual de juros" valor={f.jurosPct} onChange={(v) => alterar({ jurosPct: v })} erro={erroCampo('jurosPct')} /></div>}
            </div>
          </div>
        </Cartao>

        <Cartao titulo="6. Observações e demonstrativo oficial">
          <div className="space-y-5">
            <div>
              <label htmlFor="obs-pensao" className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Observações (aparecem no demonstrativo)</label>
              <textarea id="obs-pensao" rows={3} maxLength={1000} value={f.observacoes} onChange={(e) => alterar({ observacoes: e.target.value })}
                className="block w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white" />
            </div>
            <Chave rotulo="Emitir demonstrativo oficial da Debit" descricao="Mantém este cálculo na sua conta Debit para gerar PDF e Excel oficiais. Sem isso, o cálculo é feito e enviado para a lixeira da Debit logo em seguida." marcado={f.manter} onChange={(v) => alterar({ manter: v })} />
          </div>
        </Cartao>

        {errosForm.length > 0 && (
          <Alerta tipo="erro" titulo="Revise os dados informados">
            <ul className="list-disc pl-5 space-y-0.5">{errosForm.slice(0, 8).map((x, i) => <li key={i}>{x.mensagem}</li>)}{errosForm.length > 8 && <li>… e mais {errosForm.length - 8} ajustes.</li>}</ul>
          </Alerta>
        )}
        {erroApi && (
          <Alerta tipo="erro" titulo={erroApi.tipo === 'limite' ? 'Limite de uso atingido' : 'Não foi possível calcular a pensão'}
            acao={erroApi.podeTentarNovamente ? <Botao tamanho="sm" icone="atualizar" onClick={calcular}>Tentar novamente</Botao> : (['naoConfigurado', 'semCodigo', 'acesso'].includes(erroApi.tipo)) ? <Botao tamanho="sm" onClick={() => UI.navegar('conexao')}>Abrir configuração da conexão</Botao> : null}>
            {Api.mensagemDeErro(erroApi)} Seus dados foram mantidos e nenhum valor foi calculado.
          </Alerta>
        )}

        <div className="sticky bottom-3 z-20 flex flex-wrap gap-2 p-3 rounded-2xl bg-white/95 dark:bg-[#14243A]/95 border border-slate-200 dark:border-slate-700/60 shadow-card backdrop-blur">
          <Botao variante="verde" icone="atualizar" carregando={carregando} onClick={calcular} className="flex-1 sm:flex-none sm:min-w-[240px]">
            {carregando ? (espera ? `Aguardando limite de uso (${espera}s)…` : 'Calculando com a Debit…') : 'Calcular pensão'}
          </Botao>
          <Botao onClick={() => { limpar(); definirResultado(null); definirErros([]); definirErroApi(null); }}>Limpar tudo</Botao>
        </div>

        <div ref={topo} />
        {r && (
          <Cartao titulo="Resultado do cálculo" descricao={`Calculado pela API da Debit com data-base em ${f.dataBase}.`} className="section-open">
            <div className="space-y-5">
              {r.total !== null
                ? <Indicador tom="destaque" rotulo="Débito total atualizado" valor={R.formatarMoeda(r.total)} detalhe="Valor devolvido pela API da Debit" />
                : <Alerta tipo="aviso" titulo="Total não identificado">A API não devolveu o campo debito_total_atualizado. Confira os dados retornados abaixo ou o demonstrativo oficial.</Alerta>}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {r.campos.filter(([k]) => /^(subtotal_528|prescricao_|rito_prisao_)/.test(k)).map(([k, v]) => (
                  <Indicador key={k} rotulo={R.rotuloCampo(k)} valor={R.formatarCampoApi(k, v)} />
                ))}
              </div>
              {r.tabela
                ? <Tabela legenda="Competências retornadas pela API" colunas={r.tabela.colunas.map(R.rotuloCampo)} numericas={r.tabela.colunas.map((c, i) => (typeof r.tabela.linhas[0][i] === 'number' ? i : -1)).filter((i) => i >= 0)}
                    linhas={r.tabela.linhas.map((l) => l.map((v, i) => R.formatarCampoApi(r.tabela.colunas[i], v)))} />
                : <Alerta tipo="info">A resposta da API não trouxe uma lista de competências em formato reconhecível. Os dados completos estão abaixo e o demonstrativo oficial traz a tabela mês a mês.</Alerta>}
              <details className="rounded-xl border border-slate-200 dark:border-slate-700/60 p-4 group">
                <summary className="cursor-pointer text-sm font-semibold text-slate-700 dark:text-slate-200 list-none flex items-center justify-between">
                  Dados retornados pela API (conferência) <UI.Icone nome="chevron" className="w-4 h-4 transition-transform group-open:rotate-180" />
                </summary>
                <dl className="mt-3 grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-6 gap-y-1.5 text-sm">
                  {r.campos.map(([k, v]) => <React.Fragment key={k}><dt className="text-slate-500 dark:text-slate-400 break-words">{R.rotuloCampo(k)}</dt><dd className="font-medium text-slate-800 dark:text-slate-100 break-words">{R.formatarCampoApi(k, v)}</dd></React.Fragment>)}
                </dl>
              </details>
              <div>
                <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-2">Critérios efetivamente utilizados</h3>
                <dl className="grid grid-cols-1 sm:grid-cols-[220px_1fr] gap-x-4 gap-y-1.5 text-sm">
                  {criteriosDescritos().map(([k, v]) => <React.Fragment key={k}><dt className="text-slate-500 dark:text-slate-400">{k}</dt><dd className="font-medium text-slate-800 dark:text-slate-100">{v}</dd></React.Fragment>)}
                </dl>
              </div>
              <div className="flex flex-wrap gap-2"><Botao variante="primario" icone="memoria" onClick={gerarMemoria}>Gerar memória de cálculo</Botao></div>
              {r.calcId && <B.DemonstrativoOficial tipo="pensaoAlimenticia" calcId={r.calcId} nomeBase={f.descricao || 'pensao'} />}
            </div>
          </Cartao>
        )}
      </Pagina>
    );
  }

  // A lista de pagamentos é a mesma do módulo de débitos.
  function M2_ListaPagamentos(props) { return React.createElement(window.CentralModulos.ListaPagamentos, props); }

  window.CentralModulos = Object.assign(window.CentralModulos || {}, { ModuloPensao });
})();
