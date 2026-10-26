/*
 * Blocos reutilizados pelos módulos de cálculo: critérios de correção, avisos de conexão,
 * resumo consolidado, visualizador de documentos e ações do demonstrativo oficial da Debit.
 * Exportados em window.CentralBlocos.
 */
(() => {
  const { useState, useEffect, useRef } = React;
  const UI = window.CentralUI;
  const R = window.CentralRegras;
  const Api = window.CentralApi;
  const { Icone, Cartao, Botao, Alerta, CampoData, CampoPercentual, CampoMoeda, Selecao, Chave, Indicador, Carregando } = UI;

  function criteriosPadrao() {
    return {
      modoCorrecao: 'indice', indice: '', tabela: '', dataFinal: R.hojeBR(),
      juros: { ativo: false, percentual: '', a_partir: 'vencimento' },
      multa: { ativo: false, percentual: '' },
      honorarios: { ativo: false, modo: 'p', valor: '' },
      selic: { ativo: false, inicio: '', fim: '', base: 'am', versao: '2' },
    };
  }

  function rotuloIndice(c, catalogo) {
    if (c.modoCorrecao === 'tabela') {
      const t = ((catalogo && catalogo.tabelas) || []).find((x) => String(x.id) === String(c.tabela) || x.slug === c.tabela);
      return t ? `Tabela judicial: ${t.name}` : `Tabela judicial (id ${c.tabela})`;
    }
    const i = ((catalogo && catalogo.indices) || []).find((x) => String(x.slug || x.id) === String(c.indice));
    return i ? `Índice: ${i.name}` : `Índice: ${c.indice}`;
  }

  // Lista legível dos critérios, para a tela e para o demonstrativo.
  function descreverCriterios(c, catalogo) {
    const linhas = [['Correção monetária', rotuloIndice(c, catalogo)], ['Data final da atualização', c.dataFinal]];
    if (c.selic && c.selic.ativo) {
      linhas.push(['Selic (EC 113/2021)', `Aplicada${c.selic.inicio ? ` a partir de ${c.selic.inicio}` : ''}${c.selic.fim ? ` até ${c.selic.fim}` : ''}; base de incidência: ${{ a: 'valor atualizado', am: 'valor atualizado + multa', aj: 'valor atualizado + juros', ajm: 'valor atualizado + juros + multa' }[c.selic.base] || c.selic.base}`]);
    }
    if (c.juros && c.juros.ativo) {
      linhas.push(['Juros moratórios', `${R.formatarPercentual(R.lerValor(c.juros.percentual))} contados a partir do vencimento (modalidade e periodicidade conforme o motor de atualização da Debit; não configuráveis nesta tela)`]);
    } else {
      linhas.push(['Juros moratórios', 'Não aplicados']);
    }
    linhas.push(['Multa', c.multa && c.multa.ativo ? `${R.formatarPercentual(R.lerValor(c.multa.percentual))} (percentual informado pelo usuário)` : 'Não aplicada']);
    linhas.push(['Honorários', c.honorarios && c.honorarios.ativo
      ? (c.honorarios.modo === 'p' ? `${R.formatarPercentual(R.lerValor(c.honorarios.valor))} (percentual)` : `${R.formatarMoeda(R.lerValor(c.honorarios.valor))} (valor fixo)`)
      : 'Não aplicados']);
    linhas.push(['Responsabilidade pelos critérios', 'Definidos pelo usuário para o caso concreto; a ferramenta não valida sua adequação jurídica.']);
    return linhas;
  }

  // ---------- Avisos de conexão e de conta ----------
  function irParaConexao() { UI.navegar('conexao'); }

  function AvisoConexao() {
    const [, atualizar] = useState(0);
    useEffect(() => {
      const f = () => atualizar((n) => n + 1);
      window.addEventListener('central-conexao', f);
      return () => window.removeEventListener('central-conexao', f);
    }, []);
    if (Api.estaConfigurada()) return null;
    return (
      <Alerta tipo="aviso" titulo="Conexão com a Debit não configurada"
        acao={<Botao tamanho="sm" onClick={irParaConexao}>Configurar conexão</Botao>}>
        A atualização monetária usa a API da Debit por meio de um servidor intermediário seguro. Configure o endereço e o código de acesso para calcular. A calculadora de leilões continua funcionando sem isso.
      </Alerta>
    );
  }

  function AvisoConta() {
    const [assinante, definir] = useState(null);
    useEffect(() => {
      let ativo = true;
      if (Api.estaConfigurada()) {
        Api.conta({ tentativas: 0 }).then((c) => { if (ativo) definir(c.assinante_calculos); }).catch(() => {});
      }
      return () => { ativo = false; };
    }, []);
    if (assinante !== false) return null;
    return (
      <Alerta tipo="aviso" titulo="Conta Debit sem assinatura ativa">
        Nesta situação a Debit atualiza somente os últimos 2 anos. Parcelas mais antigas não recebem valor atualizado e aparecem marcadas como "não atualizado" — elas nunca entram no total como se tivessem sido calculadas.
      </Alerta>
    );
  }

  // ---------- Critérios de correção ----------
  function CriteriosCorrecao({ valor, onChange, erros = [], textoMulta = 'Multa (%)', notaMulta }) {
    const catalogo = UI.useCatalogo();
    const c = valor;
    const alterar = (parte) => onChange({ ...c, ...parte });
    const erro = (campo) => (erros.find((e) => e.campo === campo) || {}).mensagem;
    const configurada = Api.estaConfigurada();

    const grupos = [];
    if (catalogo.indices) {
      const perc = catalogo.indices.filter((i) => i.type !== 'moeda');
      const moeda = catalogo.indices.filter((i) => i.type === 'moeda');
      const opc = (i) => ({ valor: String(i.slug || i.id), rotulo: i.latestAvailable ? `${i.name} (até ${i.latestAvailable.slice(5, 7)}/${i.latestAvailable.slice(0, 4)})` : i.name });
      if (perc.length) grupos.push({ titulo: 'Índices de variação', opcoes: perc.map(opc) });
      if (moeda.length) grupos.push({ titulo: 'Moedas e valores', opcoes: moeda.map(opc) });
    }
    const opcoesTabela = (catalogo.tabelas || []).map((t) => ({ valor: String(t.id), rotulo: t.name }));

    return (
      <div className="space-y-5">
        {catalogo.erro && (
          <Alerta tipo="erro" titulo="Não foi possível carregar índices e tabelas" acao={<Botao tamanho="sm" onClick={catalogo.recarregar} icone="atualizar">Tentar novamente</Botao>}>
            {catalogo.erro}
          </Alerta>
        )}

        <fieldset>
          <legend className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Como corrigir o valor</legend>
          <div className="inline-flex rounded-lg border border-slate-300 dark:border-slate-600 p-1 bg-slate-50 dark:bg-slate-800">
            {[['indice', 'Índice econômico'], ['tabela', 'Tabela judicial']].map(([v, r]) => (
              <button key={v} type="button" aria-pressed={c.modoCorrecao === v} onClick={() => alterar({ modoCorrecao: v })}
                className={`px-3 h-9 text-sm font-semibold rounded-md ${c.modoCorrecao === v ? 'bg-navy-900 text-white dark:bg-emerald-600' : 'text-slate-600 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-white/10'}`}>{r}</button>
            ))}
          </div>
        </fieldset>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {c.modoCorrecao === 'indice' ? (
            <Selecao rotulo="Índice de correção" obrigatorio valor={c.indice} onChange={(v) => alterar({ indice: v })} grupos={grupos}
              placeholder={catalogo.carregando ? 'Carregando índices…' : configurada ? 'Selecione o índice' : 'Configure a conexão primeiro'}
              desabilitado={!configurada || !catalogo.indices} erro={erro('indice')}
              ajuda="Lista oferecida pela Debit. Escolha conforme o contrato, título ou decisão." />
          ) : (
            <Selecao rotulo="Tabela judicial" obrigatorio valor={c.tabela} onChange={(v) => alterar({ tabela: v })} opcoes={opcoesTabela}
              placeholder={catalogo.carregando ? 'Carregando tabelas…' : configurada ? 'Selecione a tabela' : 'Configure a conexão primeiro'}
              desabilitado={!configurada || !catalogo.tabelas} erro={erro('tabela')}
              ajuda="A tabela define o índice de cada mês e os juros aplicáveis." />
          )}
          <CampoData rotulo="Atualizar até" obrigatorio valor={c.dataFinal} onChange={(v) => alterar({ dataFinal: v })} erro={erro('dataFinal')} comHoje />
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 divide-y divide-slate-200 dark:divide-slate-700/60">
          <div className="p-4 space-y-3">
            <Chave rotulo="Juros moratórios" descricao="Aplique somente se houver previsão contratual, legal ou na decisão." marcado={c.juros.ativo} onChange={(v) => alterar({ juros: { ...c.juros, ativo: v } })} />
            {c.juros.ativo && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 section-open">
                <CampoPercentual rotulo="Percentual de juros" valor={c.juros.percentual} onChange={(v) => alterar({ juros: { ...c.juros, percentual: v } })} erro={erro('jurosPercentual')}
                  ajuda="Os juros contam a partir do vencimento. A modalidade (simples/compostos) e a periodicidade seguem o motor da Debit." />
              </div>
            )}
          </div>
          <div className="p-4 space-y-3">
            <Chave rotulo="Multa" descricao={notaMulta || 'Aplique somente se prevista no contrato, na lei ou na decisão.'} marcado={c.multa.ativo} onChange={(v) => alterar({ multa: { ...c.multa, ativo: v } })} />
            {c.multa.ativo && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 section-open">
                <CampoPercentual rotulo={textoMulta} valor={c.multa.percentual} onChange={(v) => alterar({ multa: { ...c.multa, percentual: v } })} erro={erro('multaPercentual')} />
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
                  ? <CampoPercentual rotulo="Percentual" valor={c.honorarios.valor} onChange={(v) => alterar({ honorarios: { ...c.honorarios, valor: v } })} erro={erro('honorarios')} />
                  : <CampoMoeda rotulo="Valor dos honorários" valor={c.honorarios.valor} onChange={(v) => alterar({ honorarios: { ...c.honorarios, valor: v } })} erro={erro('honorarios')} />}
              </div>
            )}
          </div>
          <details className="p-4 group">
            <summary className="cursor-pointer text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between list-none">
              Opções avançadas: Selic (EC 113/2021)
              <Icone nome="chevron" className="w-4 h-4 transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-4 space-y-3">
              <Chave rotulo="Aplicar a Selic" descricao="Substitui correção e juros no período indicado, conforme a metodologia da Debit." marcado={c.selic.ativo} onChange={(v) => alterar({ selic: { ...c.selic, ativo: v } })} />
              {c.selic.ativo && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 section-open">
                  <CampoData rotulo="Selic a partir de" valor={c.selic.inicio} onChange={(v) => alterar({ selic: { ...c.selic, inicio: v } })} erro={erro('selicInicio')} ajuda="Opcional." />
                  <CampoData rotulo="Selic até" valor={c.selic.fim} onChange={(v) => alterar({ selic: { ...c.selic, fim: v } })} erro={erro('selicFim')} ajuda="Opcional. Vazio = até a data final." />
                  <Selecao rotulo="Base de incidência" valor={c.selic.base} onChange={(v) => alterar({ selic: { ...c.selic, base: v } })}
                    opcoes={[{ valor: 'a', rotulo: 'Valor atualizado' }, { valor: 'am', rotulo: 'Valor atualizado + multa' }, { valor: 'aj', rotulo: 'Valor atualizado + juros' }, { valor: 'ajm', rotulo: 'Valor atualizado + juros + multa' }]} />
                  <Selecao rotulo="Contagem das datas" valor={c.selic.versao} onChange={(v) => alterar({ selic: { ...c.selic, versao: v } })}
                    opcoes={[{ valor: '2', rotulo: 'Por dia (proporcional)' }, { valor: '1', rotulo: 'Por mês inteiro' }]} />
                </div>
              )}
            </div>
          </details>
        </div>
      </div>
    );
  }

  // ---------- Resumo ----------
  function ResumoConsolidado({ totais, mostrarHonorarios }) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <Indicador rotulo="Valor original" valor={R.formatarMoeda(totais.original)} />
          <Indicador rotulo="Correção monetária" valor={R.formatarMoeda(totais.correcao)} />
          <Indicador rotulo="Juros" valor={R.formatarMoeda(totais.juros)} />
          <Indicador rotulo="Multa" valor={R.formatarMoeda(totais.multa)} />
          {(mostrarHonorarios || totais.honorarios !== 0) && <Indicador rotulo="Honorários" valor={R.formatarMoeda(totais.honorarios)} />}
          {totais.encargosNominais !== 0 && <Indicador rotulo="Outros encargos (nominais)" valor={R.formatarMoeda(totais.encargosNominais)} detalhe="Somados sem atualização" />}
          <Indicador rotulo="Pagamentos (nominais)" valor={R.formatarMoeda(totais.pagamentos)} />
        </div>
        <Indicador tom="destaque" rotulo="Saldo final atualizado" valor={R.formatarMoeda(totais.saldoComEncargos)}
          detalhe={totais.encargosNominais !== 0 ? `Inclui ${R.formatarMoeda(totais.encargosNominais)} de outros encargos informados` : 'Valor devolvido pela API da Debit'} />
        {totais.semDetalhe && <p className="text-xs text-slate-500 dark:text-slate-400">A API não detalhou todas as categorias nesta resposta; categorias ausentes aparecem como R$ 0,00 e não foram estimadas.</p>}
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
      <div className="fixed inset-0 z-[70] bg-slate-900/60 flex flex-col" role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="bg-navy-900 text-white px-4 py-3 flex flex-wrap items-center gap-2 justify-between">
          <div className="font-semibold text-sm truncate">{titulo}</div>
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

  // ---------- Demonstrativo oficial da Debit (cálculo salvo na conta) ----------
  const FORMATOS = {
    atualizacaoMonetaria: [['html', 'Visualizar'], ['pdf', 'PDF'], ['docx', 'Word']],
    pensaoAlimenticia: [['html', 'Visualizar'], ['pdf', 'PDF'], ['excel', 'Excel']],
  };

  function DemonstrativoOficial({ tipo, calcId, nomeBase }) {
    const [ocupado, definirOcupado] = useState('');
    const [erro, definirErro] = useState('');
    const [html, definirHtml] = useState(null);
    const [excluido, definirExcluido] = useState(false);

    async function obter(formato) {
      definirErro(''); definirOcupado(formato);
      try {
        const blob = await Api.exportar(tipo, calcId, formato);
        if (formato === 'html') definirHtml(await blob.text());
        else UI.baixarArquivo(UI.nomeArquivo(`${nomeBase || 'demonstrativo'}-debit`, formato === 'excel' ? 'xlsx' : formato), blob);
      } catch (e) { definirErro(Api.mensagemDeErro(e)); }
      definirOcupado('');
    }

    async function excluir() {
      definirErro(''); definirOcupado('excluir');
      try { await Api.excluir(tipo, calcId); definirExcluido(true); UI.avisar('Cálculo enviado para a lixeira da Debit.'); }
      catch (e) { definirErro(Api.mensagemDeErro(e)); }
      definirOcupado('');
    }

    if (excluido) return <Alerta tipo="info">Este cálculo foi enviado para a lixeira da sua conta Debit. O demonstrativo oficial não está mais disponível por aqui.</Alerta>;
    return (
      <div className="space-y-3">
        <Alerta tipo="info" titulo="Demonstrativo oficial da Debit">
          Este cálculo foi salvo na sua conta Debit (identificador {calcId}). Os documentos abaixo são gerados pela própria Debit.
        </Alerta>
        <div className="flex flex-wrap gap-2">
          {FORMATOS[tipo].map(([f, r]) => (
            <Botao key={f} tamanho="sm" icone={f === 'html' ? 'contrato' : 'baixar'} carregando={ocupado === f} onClick={() => obter(f)}>{r}</Botao>
          ))}
          <Botao tamanho="sm" variante="perigo" icone="lixeira" carregando={ocupado === 'excluir'} onClick={excluir}>Excluir da conta Debit</Botao>
        </div>
        {erro && <Alerta tipo="erro">{erro}</Alerta>}
        {html && <VisualizadorDocumento html={html} titulo="Demonstrativo oficial da Debit" nomeBase={`${nomeBase || 'demonstrativo'}-debit`} onFechar={() => definirHtml(null)} />}
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

  window.CentralBlocos = {
    criteriosPadrao, descreverCriterios, rotuloIndice, AvisoConexao, AvisoConta, CriteriosCorrecao,
    ResumoConsolidado, ListaAlertas, VisualizadorDocumento, DemonstrativoOficial, guardarMemoria, Carregando, Cartao,
  };
})();
