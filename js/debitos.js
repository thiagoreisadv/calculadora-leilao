/*
 * Módulo: Atualização de Débitos (dívida única com pagamentos parciais).
 * A correção, os juros e a multa vêm da API da Debit; este módulo só coleta os dados,
 * valida, envia, confere a resposta e organiza o resultado.
 */
(() => {
  const { useState, useRef } = React;
  const UI = window.CentralUI;
  const B = window.CentralBlocos;
  const R = window.CentralRegras;
  const Api = window.CentralApi;
  const Motor = window.CentralMotor;
  const { Pagina, Cartao, Botao, Alerta, CampoTexto, CampoMoeda, CampoData, Chave, Tabela } = UI;

  let sequencia = 0;
  const novoId = () => { sequencia += 1; return `d${Date.now().toString(36)}${sequencia}`; };

  const inicial = () => ({
    descricao: '', credor: '', devedor: '', principal: '', vencimento: '', dataInicial: '', observacoes: '',
    pagamentos: [], encargos: [], criterios: B.criteriosPadrao(), emitirOficial: false,
  });

  function ListaPagamentos({ itens, onChange, erro }) {
    const alterar = (id, parte) => onChange(itens.map((p) => (p.id === id ? { ...p, ...parte } : p)));
    return (
      <div className="space-y-3">
        {itens.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">Nenhum pagamento informado. Inclua pagamentos parciais para abatê-los do saldo.</p>}
        {itens.map((p, i) => (
          <div key={p.id} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end p-3 rounded-xl border border-slate-200 dark:border-slate-700/60 section-open">
            <CampoData rotulo={`Data do pagamento ${i + 1}`} valor={p.data} onChange={(v) => alterar(p.id, { data: v })} />
            <CampoMoeda rotulo="Valor pago" valor={p.valor} onChange={(v) => alterar(p.id, { valor: v })} />
            <Botao variante="perigo" tamanho="sm" icone="lixeira" className="!h-11" aria-label={`Remover pagamento ${i + 1}`} onClick={() => onChange(itens.filter((x) => x.id !== p.id))}>Remover</Botao>
          </div>
        ))}
        {erro && <p role="alert" className="text-xs font-medium text-red-600">{erro}</p>}
        <Botao tamanho="sm" icone="mais" onClick={() => onChange([...itens, { id: novoId(), data: '', valor: '' }])}>Adicionar pagamento</Botao>
      </div>
    );
  }

  function ListaEncargos({ itens, onChange }) {
    const alterar = (id, parte) => onChange(itens.map((p) => (p.id === id ? { ...p, ...parte } : p)));
    return (
      <div className="space-y-3">
        {itens.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">Nenhum encargo adicional. Use este campo para custas ou despesas cujo valor já seja conhecido; eles são somados sem atualização monetária.</p>}
        {itens.map((p, i) => (
          <div key={p.id} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end p-3 rounded-xl border border-slate-200 dark:border-slate-700/60 section-open">
            <CampoTexto rotulo={`Descrição do encargo ${i + 1}`} valor={p.desc} onChange={(v) => alterar(p.id, { desc: v })} maxLength={80} />
            <CampoMoeda rotulo="Valor" valor={p.valor} onChange={(v) => alterar(p.id, { valor: v })} />
            <Botao variante="perigo" tamanho="sm" icone="lixeira" className="!h-11" aria-label={`Remover encargo ${i + 1}`} onClick={() => onChange(itens.filter((x) => x.id !== p.id))}>Remover</Botao>
          </div>
        ))}
        <Botao tamanho="sm" icone="mais" onClick={() => onChange([...itens, { id: novoId(), desc: '', valor: '' }])}>Adicionar encargo</Botao>
      </div>
    );
  }

  function ModuloDebitos() {
    const [f, definirF, limpar] = UI.useRascunho('debitos', inicial);
    const catalogo = UI.useCatalogo();
    const [errosForm, definirErros] = useState([]);
    const [carregando, definirCarregando] = useState(false);
    const [erroApi, definirErroApi] = useState(null);
    const [espera, definirEspera] = useState(0);
    const [resultado, definirResultado] = useState(null);
    const topoResultado = useRef(null);

    const alterar = (parte) => { definirF({ ...f, ...parte }); definirResultado(null); };
    const erroCampo = (campo) => (errosForm.find((e) => e.campo === campo) || {}).mensagem;

    function montarParcela() {
      const base = f.dataInicial || f.vencimento;
      return {
        descricao: f.descricao || 'Dívida', vencimento: base, valor: f.principal,
        pagamentos: f.pagamentos.map((p) => ({ data: p.data, valor: p.valor })),
      };
    }

    function validar() {
      const parcela = montarParcela();
      // Erros de data da parcela são reapresentados com mensagens próprias deste formulário.
      let erros = R.validarCalculo(f.criterios, [parcela]).filter((e) => e.campo !== 'vencimento' || /posterior/.test(e.mensagem)).map((e) => ({ ...e, mensagem: e.mensagem.replace(/^Parcela 1(, )?/, '').replace(/^: /, '').replace(/^pagamento/, 'Pagamento').replace(/^./, (c) => c.toUpperCase()) }));
      if (!R.dataEhValida(f.vencimento)) erros = [{ campo: 'vencimentoOriginal', mensagem: 'Informe a data de vencimento da dívida (DD/MM/AAAA).' }, ...erros];
      if (f.dataInicial) {
        const di = R.lerData(f.dataInicial); const dv = R.lerData(f.vencimento);
        if (!di) erros.push({ campo: 'dataInicial', mensagem: 'Data inicial de atualização inválida (DD/MM/AAAA).' });
        else if (dv && di.ts < dv.ts) erros.push({ campo: 'dataInicial', mensagem: 'A data inicial de atualização não pode ser anterior ao vencimento.' });
      }
      f.encargos.forEach((e, i) => { if (e.valor && Number.isNaN(R.lerValor(e.valor))) erros.push({ campo: 'encargos', mensagem: `Encargo ${i + 1}: valor inválido.` }); });
      return erros;
    }

    async function atualizar() {
      definirErroApi(null);
      const erros = validar();
      definirErros(erros);
      if (erros.length) { UI.avisar('Corrija os campos destacados antes de calcular.', 'erro'); return; }
      definirCarregando(true); definirEspera(0); definirResultado(null);
      const parcela = montarParcela();
      try {
        const conferencia = await Motor.atualizarGrupo(f.criterios, [parcela], {
          salvar: f.emitirOficial, nome: 'Central de Cálculos — atualização de débito', aoEsperar: definirEspera,
        });
        const resumos = R.resumirPorParcela([parcela], conferencia.linhas);
        const encargos = R.outrosEncargosTotal(f.encargos);
        const totais = R.consolidar([conferencia], encargos);
        definirResultado({ conferencia, resumos, totais, parcela, criteriosDescritos: B.descreverCriterios(f.criterios, catalogo), geradoEm: new Date().toISOString() });
        setTimeout(() => topoResultado.current && topoResultado.current.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
      } catch (e) {
        definirErroApi(e);
      }
      definirCarregando(false); definirEspera(0);
    }

    function gerarMemoria() {
      const r = resultado;
      const registro = window.CentralRegistro.montarAtualizacao({
        tipo: 'debito',
        titulo: 'Memória de cálculo — Atualização de débito',
        subtitulo: f.descricao || 'Dívida',
        identificacao: [['Descrição', f.descricao], ['Credor', f.credor], ['Devedor', f.devedor], ['Vencimento', f.vencimento], ['Início da atualização', f.dataInicial || f.vencimento]],
        criterios: r.criteriosDescritos,
        totais: r.totais,
        resumosParcelas: r.resumos,
        dataFinal: f.criterios.dataFinal,
        alertas: r.conferencia.alertas,
        observacoes: f.observacoes,
        memorias: r.conferencia.linhas.filter((l) => l.tipo === 'parcela').map((l) => ({ rotulo: l.descricao, texto: l.memoria })),
        calcIdDebit: r.conferencia.calcId,
      });
      registro.encargos = f.encargos.filter((e) => e.valor).map((e) => ({ desc: e.desc, valor: e.valor }));
      B.guardarMemoria(registro, true);
    }

    const r = resultado;
    return (
      <Pagina titulo="Atualização de débitos" descricao="Atualize uma dívida com correção monetária, juros, multa e pagamentos parciais usando a API da Debit.">
        <B.AvisoConexao />
        <B.AvisoConta />

        <Cartao titulo="1. Identificação" descricao="Nomes e descrições ficam apenas neste navegador e aparecem no demonstrativo. Não são enviados à Debit.">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <CampoTexto rotulo="Descrição da dívida" valor={f.descricao} onChange={(v) => alterar({ descricao: v })} placeholder="Ex.: Nota promissória, mensalidade, indenização" className="sm:col-span-2" />
            <CampoTexto rotulo="Credor" valor={f.credor} onChange={(v) => alterar({ credor: v })} />
            <CampoTexto rotulo="Devedor" valor={f.devedor} onChange={(v) => alterar({ devedor: v })} />
          </div>
        </Cartao>

        <Cartao titulo="2. Valor e datas">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <CampoMoeda rotulo="Valor principal" obrigatorio valor={f.principal} onChange={(v) => alterar({ principal: v })} erro={erroCampo('valor')} />
            <CampoData rotulo="Data de vencimento" obrigatorio valor={f.vencimento} onChange={(v) => alterar({ vencimento: v })} erro={erroCampo('vencimentoOriginal')} />
            <CampoData rotulo="Data inicial da atualização" valor={f.dataInicial} onChange={(v) => alterar({ dataInicial: v })} erro={erroCampo('dataInicial')}
              ajuda="Opcional. Se vazia, a correção e os juros contam a partir do vencimento. Preencha apenas se o título ou a decisão fixar outro termo inicial." />
          </div>
        </Cartao>

        <Cartao titulo="3. Pagamentos parciais" descricao="Cada pagamento é abatido pela API conforme o critério padrão da Debit (abate principal e juros proporcionalmente).">
          <ListaPagamentos itens={f.pagamentos} onChange={(v) => alterar({ pagamentos: v })} erro={erroCampo('pagamento')} />
        </Cartao>

        <Cartao titulo="4. Critérios de cálculo" descricao="Escolha os critérios conforme o contrato, o título judicial ou a decisão. Nada é aplicado automaticamente.">
          <B.CriteriosCorrecao valor={f.criterios} onChange={(c) => alterar({ criterios: c })} erros={errosForm} />
        </Cartao>

        <Cartao titulo="5. Outros encargos e observações">
          <div className="space-y-5">
            <ListaEncargos itens={f.encargos} onChange={(v) => alterar({ encargos: v })} />
            <div>
              <label htmlFor="obs-debito" className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Observações (aparecem no demonstrativo)</label>
              <textarea id="obs-debito" rows={3} maxLength={1000} value={f.observacoes} onChange={(e) => alterar({ observacoes: e.target.value })}
                className="block w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white" />
            </div>
            <Chave rotulo="Emitir demonstrativo oficial da Debit" descricao="Salva este cálculo na sua conta Debit (aparece no painel do site deles) para gerar PDF/Word oficiais. Sem isso, nada é guardado na Debit." marcado={f.emitirOficial} onChange={(v) => alterar({ emitirOficial: v })} />
          </div>
        </Cartao>

        {errosForm.length > 0 && (
          <Alerta tipo="erro" titulo="Revise os dados informados">
            <ul className="list-disc pl-5 space-y-0.5">{errosForm.map((e, i) => <li key={i}>{e.mensagem}</li>)}</ul>
          </Alerta>
        )}
        {erroApi && (
          <Alerta tipo="erro" titulo={erroApi.tipo === 'limite' ? 'Limite de uso atingido' : 'Não foi possível atualizar o débito'}
            acao={erroApi.podeTentarNovamente ? <Botao tamanho="sm" icone="atualizar" onClick={atualizar}>Tentar novamente</Botao> : (erroApi.tipo === 'naoConfigurado' || erroApi.tipo === 'semCodigo' || erroApi.tipo === 'acesso') ? <Botao tamanho="sm" onClick={() => UI.navegar('conexao')}>Abrir configuração da conexão</Botao> : null}>
            {Api.mensagemDeErro(erroApi)} Seus dados foram mantidos e nenhum valor foi calculado.
          </Alerta>
        )}

        <div className="sticky bottom-3 z-20 flex flex-wrap gap-2 p-3 rounded-2xl bg-white/95 dark:bg-[#14243A]/95 border border-slate-200 dark:border-slate-700/60 shadow-card backdrop-blur">
          <Botao variante="verde" icone="atualizar" carregando={carregando} onClick={atualizar} className="flex-1 sm:flex-none sm:min-w-[220px]">
            {carregando ? (espera ? `Aguardando limite de uso (${espera}s)…` : 'Calculando com a Debit…') : 'Atualizar débito'}
          </Botao>
          <Botao onClick={() => { limpar(); definirResultado(null); definirErros([]); definirErroApi(null); }}>Limpar tudo</Botao>
        </div>

        <div ref={topoResultado} />
        {r && (
          <Cartao titulo="Resultado da atualização" descricao={`Atualizado até ${f.criterios.dataFinal} pela API da Debit. ${r.criteriosDescritos[0][1]}.`} className="section-open">
            <div className="space-y-5">
              {r.conferencia.incompleto
                ? <Alerta tipo="erro" titulo="Resultado incompleto">A API não devolveu o valor atualizado da dívida. Nenhum total foi calculado e a memória de cálculo não pode ser gerada.</Alerta>
                : <B.ResumoConsolidado totais={r.totais} mostrarHonorarios={f.criterios.honorarios.ativo} />}
              <B.ListaAlertas alertas={r.conferencia.alertas} />
              <Tabela legenda="Detalhamento da dívida e pagamentos" colunas={['Item', 'Data', 'Valor', 'Valor corrigido', 'Juros, multa e encargos', 'Total']} numericas={[2, 3, 4, 5]}
                linhas={r.conferencia.linhas.map((l) => [l.tipo === 'parcela' ? l.descricao : l.descricao, l.data, R.formatarMoeda(l.original),
                  l.naoAtualizado ? 'Não atualizado' : R.formatarMoeda(l.corrigido), l.naoAtualizado ? 'Não atualizado' : R.formatarMoeda(l.encargosItem), l.naoAtualizado ? 'Não atualizado' : R.formatarMoeda(l.totalItem)])} />
              <div>
                <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-2">Critérios efetivamente utilizados</h3>
                <dl className="grid grid-cols-1 sm:grid-cols-[220px_1fr] gap-x-4 gap-y-1.5 text-sm">
                  {r.criteriosDescritos.map(([k, v]) => <React.Fragment key={k}><dt className="text-slate-500 dark:text-slate-400">{k}</dt><dd className="font-medium text-slate-800 dark:text-slate-100">{v}</dd></React.Fragment>)}
                </dl>
              </div>
              <div className="flex flex-wrap gap-2">
                <Botao variante="primario" icone="memoria" disabled={r.conferencia.incompleto} onClick={gerarMemoria}>Gerar memória de cálculo</Botao>
              </div>
              {r.conferencia.calcId && <B.DemonstrativoOficial tipo="atualizacaoMonetaria" calcId={r.conferencia.calcId} nomeBase={f.descricao || 'debito'} />}
            </div>
          </Cartao>
        )}
      </Pagina>
    );
  }

  window.CentralModulos = Object.assign(window.CentralModulos || {}, { ModuloDebitos, ListaPagamentos, ListaEncargos, novoId });
})();
