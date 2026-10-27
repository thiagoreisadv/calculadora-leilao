/*
 * Módulo: Aluguéis, contratos, acordos e parcelas vencidas.
 * Várias parcelas, cada uma com vencimento, valor, correção monetária (índice oficial ou informada) e
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
  const { Pagina, Cartao, Botao, Alerta, CampoTexto, CampoMoeda, CampoData, CampoPercentual, Selecao, AreaTexto, Grade, Col, Calculador, AcoesPainel, Tabela } = UI;

  const PRESETS = {
    aluguel: {
      chave: 'aluguel', titulo: 'Aluguéis e contratos',
      descricao: 'Atualize aluguéis atrasados e obrigações contratuais. Cada parcela tem seu vencimento, valor, correção e pagamentos.',
      subtitulo: 'Várias parcelas com encargos e pagamentos.',
      credor: 'Locador / credor', devedor: 'Locatário / devedor', parcela: 'Aluguel',
      notaMulta: 'Aplique a multa somente se estiver prevista no contrato de locação e no percentual ali fixado.',
      textoMulta: 'Multa contratual por atraso (%)', tipoMemoria: 'contrato',
    },
    acordo: {
      chave: 'acordo', titulo: 'Acordos e parcelas vencidas',
      descricao: 'Atualize parcelas vencidas de acordos extrajudiciais, parcelamentos e obrigações financeiras em geral.',
      subtitulo: 'Parcelamentos e obrigações em geral.',
      credor: 'Credor', devedor: 'Devedor', parcela: 'Parcela',
      notaMulta: 'Aplique a multa somente se estiver prevista no acordo, no contrato ou na decisão.',
      textoMulta: 'Multa prevista (%)', tipoMemoria: 'acordo',
    },
  };

  let sequencia = 0;
  const novoId = () => { sequencia += 1; return `p${Date.now().toString(36)}${sequencia}`; };

  const novaParcela = (extra) => ({ id: novoId(), descricao: '', competencia: '', vencimento: '', valor: '', correcao: B.correcaoInicial(), pagamentos: [], ...(extra || {}) });

  const inicial = () => ({
    descricao: '', credor: '', devedor: '', observacoes: '', parcelas: [], encargos: [],
    criterios: K.criteriosPadrao(), gerador: { quantidade: '12', primeiro: '', valor: '' }, aplicarPercentual: '',
  });


  function LinhaParcela({ parcela, indice, onChange, onRemover, erros, rotuloBase, criterios }) {
    const [pagamentos, definirPagamentos] = useState(parcela.pagamentos.length > 0);
    // Abre a correção quando ela depende de dado digitado (percentual ou valor corrigido)
    const [correcao, definirCorrecao] = useState(['percentual', 'valorCorrigido'].includes(parcela.correcao.modo));
    const aVencer = R.dataEhValida(parcela.vencimento) && K.estaAVencer(parcela, criterios.dataFinal);
    const erro = (campo) => (erros.find((e) => e.linha === indice && e.campo === campo) || {}).mensagem;
    return (
      <div className="rounded-[10px] border border-border p-3 sm:p-4 section-open">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[12.5px] text-muted-foreground">{rotuloBase} {indice + 1}</span>
          <div className="flex flex-wrap gap-1 justify-end">
            <Botao tamanho="sm" variante="fantasma" onClick={() => definirCorrecao(!correcao)} aria-expanded={correcao}>{B.rotuloCorrecao(parcela.correcao)}</Botao>
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
        {aVencer && <p className="mt-2 text-[11.5px] text-warning">Vence depois da data final: {criterios.vincendas === 'excluir' ? 'fica fora do cálculo.' : 'entra com vencimento antecipado (sem juros; com multa, se houver).'}</p>}
        {correcao && (
          <div className="mt-4 pt-4 border-t border-border section-open">
            <B.CorrecaoManual compacto valor={parcela.correcao} onChange={(c) => onChange({ correcao: c })} valorOriginal={parcela.valor} vencimento={parcela.vencimento} dataFinal={criterios.dataFinal} erro={erro('correcao')} titulo={`Correção monetária desta ${rotuloBase.toLowerCase()}`} />
          </div>
        )}
        {pagamentos && (
          <div className="mt-4 pt-4 border-t border-border section-open">
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
    const [aba, definirAba] = useState('obrigacao');
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

    function aplicarMesmoIndice() {
      if (!f.parcelas.length) { UI.avisar('Inclua parcelas antes de aplicar a correção.', 'erro'); return; }
      const indice = f.aplicarIndice || 'IPCA';
      alterar({ parcelas: f.parcelas.map((x) => ({ ...x, correcao: { ...K.correcaoPadrao(), modo: 'indice', indice } })) });
      UI.avisar(`${K.INDICES[indice].nome} aplicado a todas as parcelas.`);
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
      const { calcular: lista, aVencer } = K.separarVincendas(f.parcelas, f.criterios);
      if (!lista.length) { definirErros([{ campo: 'parcelas', mensagem: 'Todas as parcelas vencem depois da data final e o critério as deixa fora do cálculo. Mude a data final ou escolha "Vencimento antecipado".' }]); return; }
      const calculadas = lista.map((x) => x.parcela);
      const resultados = calculadas.map((x) => K.calcularParcela(x, f.criterios));
      const totais = K.consolidar(resultados, { honorariosFixos: K.honorariosFixos(f.criterios), encargosNominais: K.outrosEncargosTotal(f.encargos) });
      definirResultado({ resultados, totais, parcelas: calculadas.map((x) => ({ ...x })), aVencer: aVencer.map((x) => ({ ...x.parcela })), criteriosDescritos: B.descreverCriterios(f.criterios, calculadas) });
      if (window.innerWidth < 1024) setTimeout(() => topo.current && topo.current.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    }

    function entrada() {
      const r = resultado;
      return {
        tipo: p.tipoMemoria,
        titulo: `Memória de cálculo — ${p.titulo}`,
        subtitulo: f.descricao || p.titulo,
        identificacao: [['Descrição', f.descricao], [p.credor, f.credor], [p.devedor, f.devedor], ['Quantidade de parcelas', String(r.parcelas.length)]],
        criterios: r.criteriosDescritos,
        parcelas: r.parcelas.map((x, i) => ({ descricao: x.descricao || `${p.parcela} ${i + 1}`, competencia: x.competencia, vencimento: x.vencimento })),
        resultados: r.resultados, totais: r.totais, dataFinal: f.criterios.dataFinal,
        observacoes: [f.observacoes, r.aVencer.length ? `Parcelas com vencimento posterior à data final, fora do cálculo: ${r.aVencer.map((x) => `${x.descricao || p.parcela} (${x.vencimento})`).join(', ')}.` : ''].filter(Boolean).join('\n'),
      };
    }

    function gerarMemoria() {
      B.guardarMemoria(window.CentralRegistro.montarCalculo(entrada()), true);
    }

    function gerarPlanilha() {
      B.gerarPlanilhaCalculo(entrada(), f.descricao || p.titulo);
    }

    function gerarPdf() {
      B.gerarPdfCalculo(entrada(), f.descricao || p.titulo);
    }

    function exportarCsv() {
      const r = resultado;
      const linhas = r.resultados.map((x, i) => [i + 1, r.parcelas[i].descricao, r.parcelas[i].competencia, r.parcelas[i].vencimento, R.numeroCSV(x.original), R.numeroCSV(x.correcao.valorCorrecao), R.numeroCSV(x.principalCorrigido), R.numeroCSV(x.juros), R.numeroCSV(x.multa), R.numeroCSV(x.honorarios), R.numeroCSV(-x.pagamentos), R.numeroCSV(x.saldo)]);
      const csv = R.gerarCSV(['Nº', 'Descrição', 'Competência', 'Vencimento', 'Valor original', 'Correção monetária', 'Principal corrigido', 'Juros', 'Multa', 'Honorários', 'Pagamentos', 'Saldo atualizado'], linhas);
      UI.baixarArquivo(UI.nomeArquivo(f.descricao || p.titulo, 'csv'), csv, 'text/csv;charset=utf-8');
    }

    const r = resultado;
    const subtitulo = (t) => <h3 className="text-[13px] font-medium text-foreground mb-3">{t}</h3>;

    const abas = [
      { id: 'obrigacao', rotulo: 'Obrigação', icone: 'arquivo', conteudo: (
        <div className="space-y-6">
          <Grade>
            <Col span={6}><CampoTexto rotulo="Descrição" valor={f.descricao} onChange={(v) => alterar({ descricao: v })} placeholder="Ex.: Contrato de locação, imóvel da Rua X" /></Col>
            <Col span={3}><CampoTexto rotulo={p.credor} valor={f.credor} onChange={(v) => alterar({ credor: v })} /></Col>
            <Col span={3}><CampoTexto rotulo={p.devedor} valor={f.devedor} onChange={(v) => alterar({ devedor: v })} /></Col>
          </Grade>
          <div className="border-t border-border pt-5 space-y-4">
            <div>
              <h3 className="text-[13px] font-medium text-foreground">Parcelas</h3>
            </div>
            <details className="rounded-[10px] border border-dashed border-border p-4 group">
              <summary className="cursor-pointer text-[13px] text-foreground list-none flex items-center justify-between">
                Gerar parcelas mensais <UI.Icone nome="chevron" className="w-4 h-4 transition-transform group-open:rotate-180" />
              </summary>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                <CampoTexto rotulo="Quantidade" valor={f.gerador.quantidade} onChange={(v) => alterar({ gerador: { ...f.gerador, quantidade: v.replace(/\D/g, '') } })} inputMode="numeric" maxLength={3} />
                <CampoData rotulo="Primeiro vencimento" valor={f.gerador.primeiro} onChange={(v) => alterar({ gerador: { ...f.gerador, primeiro: v } })} />
                <CampoMoeda rotulo="Valor de cada parcela" valor={f.gerador.valor} onChange={(v) => alterar({ gerador: { ...f.gerador, valor: v } })} />
                <Botao variante="solido" icone="mais" onClick={gerar}>Gerar</Botao>
              </div>
            </details>

            {f.parcelas.length > 1 && (
              <div className="rounded-[10px] border border-border p-4 grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr_auto] gap-3 items-end">
                <Selecao rotulo="Mesmo índice em todas" valor={f.aplicarIndice || 'IPCA'} onChange={(v) => definirF({ ...f, aplicarIndice: v })}
                  opcoes={Object.entries(K.INDICES).map(([valor, x]) => ({ valor, rotulo: x.nome }))} />
                <Botao onClick={aplicarMesmoIndice}>Aplicar</Botao>
                <CampoPercentual rotulo="Mesmo percentual em todas" valor={f.aplicarPercentual} onChange={(v) => definirF({ ...f, aplicarPercentual: v })} />
                <Botao onClick={aplicarMesmoPercentual}>Aplicar</Botao>
              </div>
            )}

            {f.parcelas.length === 0 && <p className="text-[13px] text-muted-foreground">Nenhuma parcela incluída ainda.</p>}
            {f.parcelas.map((x, i) => (
              <LinhaParcela key={x.id} parcela={x} indice={i} erros={errosForm} rotuloBase={p.parcela} criterios={f.criterios}
                onChange={(parte) => alterarParcela(x.id, parte)} onRemover={() => alterar({ parcelas: f.parcelas.filter((y) => y.id !== x.id) })} />
            ))}
            {errosForm.some((e) => e.campo === 'parcelas') && <p role="alert" className="text-[11.5px] text-destructive">{errosForm.find((e) => e.campo === 'parcelas').mensagem}</p>}
            <Botao icone="mais" onClick={() => alterar({ parcelas: [...f.parcelas, novaParcela()] })}>Adicionar parcela</Botao>
          </div>
        </div>
      ) },
      { id: 'encargos', rotulo: 'Encargos e pagamentos', icone: 'percentual', conteudo: (
        <div className="space-y-6">
          <div>
            {subtitulo('Critérios de cálculo')}
            <B.CriteriosCalculo valor={f.criterios} onChange={(c) => alterar({ criterios: c })} erros={errosForm} textoMulta={p.textoMulta} notaMulta={p.notaMulta} />
          </div>
          <div className="border-t border-border pt-5">
            {subtitulo('Encargos adicionais')}
            <M.ListaEncargos itens={f.encargos} onChange={(v) => alterar({ encargos: v })} />
          </div>
          <div className="border-t border-border pt-5">
            <AreaTexto rotulo="Observações (aparecem no demonstrativo)" valor={f.observacoes} onChange={(v) => alterar({ observacoes: v })} />
          </div>
        </div>
      ) },
    ];

    const rotuloCalcular = `Atualizar ${f.parcelas.length || ''} parcela${f.parcelas.length === 1 ? '' : 's'}`.replace('  ', ' ');
    const painel = (
      <B.PainelTotais totais={r && r.totais} mostrarHonorarios={f.criterios.honorarios.ativo}
        kpis={r ? [{ l: 'Parcelas', v: String(r.resultados.length) }, { l: 'Principal corrigido', v: R.formatarMoeda(r.totais.principalCorrigido) }, { l: 'Pagamentos', v: r.totais.pagamentos ? `-${R.formatarMoeda(r.totais.pagamentos)}` : R.formatarMoeda(0) }] : undefined}
        topo={errosForm.length > 0 && (
          <Alerta tipo="erro" titulo="Revise os dados informados">
            <ul className="list-disc pl-5 space-y-0.5">{errosForm.slice(0, 8).map((e, i) => <li key={i}>{e.mensagem}</li>)}{errosForm.length > 8 && <li>… e mais {errosForm.length - 8} ajustes.</li>}</ul>
          </Alerta>
        )}
        acoes={
          <AcoesPainel
            solido={{ rotulo: rotuloCalcular, icone: 'atualizar', onClick: calcular }}
            principal={{ rotulo: 'Gerar planilha (PDF)', icone: 'pdf', onClick: gerarPdf, desabilitado: !r }}
            linha={[{ rotulo: 'Excel', icone: 'xls', onClick: gerarPlanilha, desabilitado: !r }, { rotulo: 'Salvar memória', icone: 'salvar', onClick: gerarMemoria, desabilitado: !r }]}
            onLimpar={() => { limpar(); definirResultado(null); definirErros([]); }} />
        } />
    );

    const detalhes = r && (
      <div ref={topo}>
        <Cartao titulo="Detalhes do cálculo" descricao={`Calculado até ${f.criterios.dataFinal}, com a correção monetária escolhida em cada parcela.`} acoes={<Botao tamanho="sm" icone="csv" onClick={exportarCsv}>Exportar CSV</Botao>} className="section-open print-hide">
          <div className="space-y-5">
            {r.aVencer.length > 0 && <Alerta tipo="aviso">Fora do cálculo por vencerem depois da data final ({f.criterios.dataFinal}): {r.aVencer.map((x) => `${x.descricao || p.parcela} (${x.vencimento})`).join(', ')}.</Alerta>}
            <Tabela legenda="Resultado por parcela" colunas={['Nº', 'Descrição', 'Vencimento', 'Valor original', 'Correção monetária', 'Principal corrigido', 'Juros', 'Multa', 'Pagamentos', 'Saldo']} numericas={[3, 4, 5, 6, 7, 8, 9]}
              linhas={r.resultados.map((x, i) => [i + 1, r.parcelas[i].descricao || `${p.parcela} ${i + 1}`, r.parcelas[i].vencimento, R.formatarMoeda(x.original), B.textoCorrecao(x.correcao), R.formatarMoeda(x.principalCorrigido), R.formatarMoeda(x.juros), R.formatarMoeda(x.multa), x.pagamentos ? `-${R.formatarMoeda(x.pagamentos)}` : '—', R.formatarMoeda(x.saldo)])} />
            <details className="rounded-[10px] border border-border p-4 group">
              <summary className="cursor-pointer text-[13px] text-foreground list-none flex items-center justify-between">
                Memória de cálculo por parcela <UI.Icone nome="chevron" className="w-4 h-4 transition-transform group-open:rotate-180" />
              </summary>
              <div className="mt-3 space-y-4">
                {r.resultados.map((x, i) => (
                  <div key={i}>
                    <div className="text-xs text-muted-foreground mb-1">{r.parcelas[i].descricao || `${p.parcela} ${i + 1}`} — {r.parcelas[i].vencimento}</div>
                    <ol className="list-decimal pl-5 space-y-1 text-[13px] text-foreground">{x.memoria.map((l, k) => <li key={k}>{l}</li>)}</ol>
                  </div>
                ))}
              </div>
            </details>
          </div>
        </Cartao>
      </div>
    );

    return (
      <Pagina titulo={p.titulo}>
        <Calculador abas={abas} aba={aba} onAba={definirAba} painel={painel} detalhes={detalhes} />
      </Pagina>
    );
  }

  window.CentralModulos = Object.assign(window.CentralModulos || {}, { ModuloParcelas, PRESETS });
})();
