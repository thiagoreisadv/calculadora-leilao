/*
 * Módulo: Aluguéis, contratos, acordos e parcelas vencidas.
 * Várias parcelas, cada uma com vencimento, valor e pagamentos próprios; os critérios de
 * atualização (índice, juros, multa) são comuns e enviados à API da Debit numa única chamada.
 */
(() => {
  const { useState, useRef } = React;
  const UI = window.CentralUI;
  const B = window.CentralBlocos;
  const R = window.CentralRegras;
  const Api = window.CentralApi;
  const Motor = window.CentralMotor;
  const M = window.CentralModulos;
  const { Pagina, Cartao, Botao, Alerta, CampoTexto, CampoMoeda, CampoData, Tabela } = UI;

  const PRESETS = {
    aluguel: {
      chave: 'aluguel', titulo: 'Aluguéis e contratos',
      descricao: 'Atualize aluguéis atrasados e obrigações contratuais. Cada parcela tem seu vencimento, valor e pagamentos.',
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

  const inicial = () => ({
    descricao: '', credor: '', devedor: '', observacoes: '', parcelas: [], encargos: [],
    criterios: B.criteriosPadrao(), gerador: { quantidade: '12', primeiro: '', valor: '', base: '' },
  });

  function LinhaParcela({ parcela, indice, onChange, onRemover, erros, rotuloBase }) {
    const [aberto, definirAberto] = useState(parcela.pagamentos.length > 0);
    const erro = (campo) => (erros.find((e) => e.linha === indice && e.campo === campo) || {}).mensagem;
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 p-3 sm:p-4 section-open">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{rotuloBase} {indice + 1}</span>
          <div className="flex gap-1">
            <Botao tamanho="sm" variante="fantasma" onClick={() => definirAberto(!aberto)} aria-expanded={aberto}>
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
        {aberto && (
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700/50 section-open">
            <M.ListaPagamentos itens={parcela.pagamentos} onChange={(v) => onChange({ pagamentos: v })} erro={erro('pagamento')} />
          </div>
        )}
      </div>
    );
  }

  function ModuloParcelas({ preset }) {
    const p = PRESETS[preset];
    const [f, definirF, limpar] = UI.useRascunho(`parcelas_${p.chave}`, inicial);
    const catalogo = UI.useCatalogo();
    const [errosForm, definirErros] = useState([]);
    const [carregando, definirCarregando] = useState(false);
    const [erroApi, definirErroApi] = useState(null);
    const [espera, definirEspera] = useState(0);
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
        return { id: novoId(), descricao: `${g.base || p.parcela} ${i + 1}/${qtd}`, competencia: venc.slice(3), vencimento: venc, valor: g.valor, pagamentos: [] };
      });
      alterar({ parcelas: [...f.parcelas, ...novas] });
      UI.avisar(`${qtd} parcelas adicionadas.`);
    }

    function validar() {
      const erros = R.validarCalculo(f.criterios, f.parcelas);
      f.encargos.forEach((e, i) => { if (e.valor && Number.isNaN(R.lerValor(e.valor))) erros.push({ campo: 'encargos', mensagem: `Encargo ${i + 1}: valor inválido.` }); });
      return erros;
    }

    async function atualizar() {
      definirErroApi(null);
      const erros = validar();
      definirErros(erros);
      if (erros.length) { UI.avisar('Corrija os campos destacados antes de calcular.', 'erro'); return; }
      definirCarregando(true); definirEspera(0); definirResultado(null);
      try {
        const conferencia = await Motor.atualizarGrupo(f.criterios, f.parcelas, { aoEsperar: definirEspera });
        const resumos = R.resumirPorParcela(f.parcelas, conferencia.linhas);
        const totais = R.consolidar([conferencia], R.outrosEncargosTotal(f.encargos));
        definirResultado({ conferencia, resumos, totais, criteriosDescritos: B.descreverCriterios(f.criterios, catalogo) });
        setTimeout(() => topo.current && topo.current.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
      } catch (e) { definirErroApi(e); }
      definirCarregando(false); definirEspera(0);
    }

    function gerarMemoria() {
      const r = resultado;
      const registro = window.CentralRegistro.montarAtualizacao({
        tipo: p.tipoMemoria,
        titulo: `Memória de cálculo — ${p.titulo}`,
        subtitulo: f.descricao || p.titulo,
        identificacao: [['Descrição', f.descricao], [p.credor, f.credor], [p.devedor, f.devedor], ['Quantidade de parcelas', String(f.parcelas.length)]],
        criterios: r.criteriosDescritos, totais: r.totais, resumosParcelas: r.resumos, dataFinal: f.criterios.dataFinal,
        alertas: r.conferencia.alertas, observacoes: f.observacoes,
        memorias: r.conferencia.linhas.filter((l) => l.tipo === 'parcela').map((l) => ({ rotulo: `${l.descricao} (${l.data})`, texto: l.memoria })),
      });
      B.guardarMemoria(registro, true);
    }

    function exportarCsv() {
      const r = resultado;
      const linhas = r.resumos.map((x) => [x.indice + 1, x.descricao, x.competencia, x.vencimento, R.numeroCSV(x.original), R.numeroCSV(x.pagamentos), R.numeroCSV(x.correcao), R.numeroCSV(x.encargos), R.numeroCSV(x.saldo)]);
      const csv = R.gerarCSV(['Nº', 'Descrição', 'Competência', 'Vencimento', 'Valor original', 'Pagamentos', 'Correção monetária', 'Juros, multa e encargos', 'Saldo atualizado'], linhas);
      UI.baixarArquivo(UI.nomeArquivo(f.descricao || p.titulo, 'csv'), csv, 'text/csv;charset=utf-8');
    }

    const r = resultado;
    return (
      <Pagina titulo={p.titulo} descricao={p.descricao}>
        <B.AvisoConexao />
        <B.AvisoConta />

        <Cartao titulo="1. Identificação" descricao="Nomes e descrições ficam apenas neste navegador e aparecem no demonstrativo. Não são enviados à Debit.">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <CampoTexto rotulo="Descrição" valor={f.descricao} onChange={(v) => alterar({ descricao: v })} className="sm:col-span-2" placeholder="Ex.: Contrato de locação, imóvel da Rua X" />
            <CampoTexto rotulo={p.credor} valor={f.credor} onChange={(v) => alterar({ credor: v })} />
            <CampoTexto rotulo={p.devedor} valor={f.devedor} onChange={(v) => alterar({ devedor: v })} />
          </div>
        </Cartao>

        <Cartao titulo="2. Parcelas" descricao="Inclua cada parcela vencida. Você pode gerar uma sequência mensal e depois ajustar cada uma.">
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

            {f.parcelas.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">Nenhuma parcela incluída ainda.</p>}
            {f.parcelas.map((x, i) => (
              <LinhaParcela key={x.id} parcela={x} indice={i} erros={errosForm} rotuloBase={p.parcela}
                onChange={(parte) => alterarParcela(x.id, parte)} onRemover={() => alterar({ parcelas: f.parcelas.filter((y) => y.id !== x.id) })} />
            ))}
            {errosForm.some((e) => e.campo === 'parcelas') && <p role="alert" className="text-xs font-medium text-red-600">{errosForm.find((e) => e.campo === 'parcelas').mensagem}</p>}
            <Botao icone="mais" onClick={() => alterar({ parcelas: [...f.parcelas, { id: novoId(), descricao: '', competencia: '', vencimento: '', valor: '', pagamentos: [] }] })}>Adicionar parcela</Botao>
          </div>
        </Cartao>

        <Cartao titulo="3. Critérios de cálculo" descricao="Valem para todas as parcelas desta atualização.">
          <B.CriteriosCorrecao valor={f.criterios} onChange={(c) => alterar({ criterios: c })} erros={errosForm} textoMulta={p.textoMulta} notaMulta={p.notaMulta} />
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
        {erroApi && (
          <Alerta tipo="erro" titulo={erroApi.tipo === 'limite' ? 'Limite de uso atingido' : 'Não foi possível atualizar as parcelas'}
            acao={erroApi.podeTentarNovamente ? <Botao tamanho="sm" icone="atualizar" onClick={atualizar}>Tentar novamente</Botao> : (['naoConfigurado', 'semCodigo', 'acesso'].includes(erroApi.tipo)) ? <Botao tamanho="sm" onClick={() => UI.navegar('conexao')}>Abrir configuração da conexão</Botao> : null}>
            {Api.mensagemDeErro(erroApi)} Seus dados foram mantidos e nenhum valor foi calculado.
          </Alerta>
        )}

        <div className="sticky bottom-3 z-20 flex flex-wrap gap-2 p-3 rounded-2xl bg-white/95 dark:bg-[#14243A]/95 border border-slate-200 dark:border-slate-700/60 shadow-card backdrop-blur">
          <Botao variante="verde" icone="atualizar" carregando={carregando} onClick={atualizar} className="flex-1 sm:flex-none sm:min-w-[240px]">
            {carregando ? (espera ? `Aguardando limite de uso (${espera}s)…` : 'Calculando com a Debit…') : `Atualizar ${f.parcelas.length || ''} parcela${f.parcelas.length === 1 ? '' : 's'}`.replace('  ', ' ')}
          </Botao>
          <Botao onClick={() => { limpar(); definirResultado(null); definirErros([]); definirErroApi(null); }}>Limpar tudo</Botao>
        </div>

        <div ref={topo} />
        {r && (
          <Cartao titulo="Resultado da atualização" descricao={`Atualizado até ${f.criterios.dataFinal} pela API da Debit. ${r.criteriosDescritos[0][1]}.`} className="section-open">
            <div className="space-y-5">
              {r.conferencia.incompleto && <Alerta tipo="erro" titulo="Resultado incompleto">Algumas parcelas não receberam valor atualizado da API. O total abaixo reflete apenas o devolvido pela API para o conjunto enviado; confira os alertas antes de usar.</Alerta>}
              <B.ResumoConsolidado totais={r.totais} mostrarHonorarios={f.criterios.honorarios.ativo} />
              <B.ListaAlertas alertas={r.conferencia.alertas} />
              <Tabela legenda="Resultado por parcela" colunas={['Nº', 'Descrição', 'Vencimento', 'Valor original', 'Pagamentos', 'Correção', 'Juros, multa e encargos', 'Saldo']} numericas={[3, 4, 5, 6, 7]}
                linhas={r.resumos.map((x) => [x.indice + 1, x.descricao, x.vencimento, R.formatarMoeda(x.original), x.pagamentos ? R.formatarMoeda(x.pagamentos) : '—',
                  x.naoAtualizado ? 'Não atualizado' : R.formatarMoeda(x.correcao), x.naoAtualizado ? 'Não atualizado' : R.formatarMoeda(x.encargos), x.naoAtualizado ? 'Não atualizado' : R.formatarMoeda(x.saldo)])} />
              <p className="text-xs text-slate-500 dark:text-slate-400">A API informa juros e multa apenas no total; por parcela, a coluna "Juros, multa e encargos" é a diferença entre o total devolvido e o valor corrigido.</p>
              <div className="flex flex-wrap gap-2">
                <Botao variante="primario" icone="memoria" onClick={gerarMemoria} disabled={r.conferencia.incompleto}>Gerar memória de cálculo</Botao>
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
