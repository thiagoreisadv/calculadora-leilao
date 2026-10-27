/*
 * Módulo: Planilha consolidada de débitos.
 * Várias obrigações numa só tela, cada uma com a sua correção monetária (índice oficial ou informada)
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
  const { Pagina, Cartao, Botao, Alerta, CampoTexto, CampoMoeda, CampoData, CampoCompetencia, CampoPercentual, AreaTexto, Grade, Col, Calculador, AcoesPainel, Tabela } = UI;

  let sequencia = 0;
  const novoId = () => { sequencia += 1; return `l${Date.now().toString(36)}${sequencia}`; };

  const inicial = () => ({ titulo: '', credor: '', devedor: '', observacoes: '', linhas: [], criterios: K.criteriosPadrao() });

  const novaLinha = () => ({ id: novoId(), descricao: '', competencia: '', vencimento: '', valor: '', outros: '', correcao: B.correcaoInicial(), jurosPct: '', multaPct: '', pagamentos: [] });


  function LinhaEditavel({ linha, indice, onChange, onRemover, erros, criterios }) {
    const [pagamentos, definirPagamentos] = useState(linha.pagamentos.length > 0);
    const [correcao, definirCorrecao] = useState(['percentual', 'valorCorrigido'].includes(linha.correcao.modo));
    const aVencer = R.dataEhValida(linha.vencimento) && K.estaAVencer(linha, criterios.dataFinal);
    const [proprios, definirProprios] = useState(linha.jurosPct !== '' || linha.multaPct !== '');
    const erro = (campo) => (erros.find((e) => e.linha === indice && e.campo === campo) || {}).mensagem;
    return (
      <div className="rounded-[10px] border border-border p-3 sm:p-4 section-open">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[12.5px] text-muted-foreground">Linha {indice + 1}</span>
          <div className="flex flex-wrap gap-1 justify-end">
            <Botao tamanho="sm" variante="fantasma" aria-expanded={correcao} onClick={() => definirCorrecao(!correcao)}>{B.rotuloCorrecao(linha.correcao)}</Botao>
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
        {aVencer && <p className="mt-2 text-[11.5px] text-warning">Vence depois da data final: {criterios.vincendas === 'excluir' ? 'fica fora do cálculo.' : 'entra com vencimento antecipado (sem juros; com multa, se houver).'}</p>}
        {correcao && (
          <div className="mt-4 pt-4 border-t border-border section-open">
            <B.CorrecaoManual compacto valor={linha.correcao} onChange={(c) => onChange({ correcao: c })} valorOriginal={linha.valor} vencimento={linha.vencimento} dataFinal={criterios.dataFinal} erro={erro('correcao')} titulo="Correção monetária desta linha" />
          </div>
        )}
        {proprios && (
          <div className="mt-4 pt-4 border-t border-border grid grid-cols-1 sm:grid-cols-2 gap-3 section-open">
            <CampoPercentual rotulo="Taxa de juros desta linha" valor={linha.jurosPct} onChange={(v) => onChange({ jurosPct: v })} placeholder="padrão" ajuda="Vazio usa o padrão da planilha; 0 desliga os juros. Periodicidade e modalidade seguem o padrão." erro={erro('jurosPct')} />
            <CampoPercentual rotulo="Multa desta linha" valor={linha.multaPct} onChange={(v) => onChange({ multaPct: v })} placeholder="padrão" ajuda="Vazio usa o padrão; 0 desliga a multa." erro={erro('multaPct')} />
          </div>
        )}
        {pagamentos && (
          <div className="mt-4 pt-4 border-t border-border section-open">
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
    const [aba, definirAba] = useState('obrigacoes');
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
      const { calcular: lista, aVencer } = K.separarVincendas(f.linhas, f.criterios);
      if (!lista.length) { definirErros([{ campo: 'parcelas', mensagem: 'Todas as linhas vencem depois da data final e o critério as deixa fora do cálculo. Mude a data final ou escolha "Vencimento antecipado".' }]); return; }
      const linhas = lista.map((x) => x.parcela);
      const resultados = linhas.map((l) => K.calcularParcela(l, f.criterios));
      const outros = linhas.map((l) => R.arredondar(R.lerValor(l.outros) || 0));
      const totais = K.consolidar(resultados, { honorariosFixos: K.honorariosFixos(f.criterios), encargosNominais: outros.reduce((s, v) => s + v, 0) });
      definirRes({ resultados, outros, totais, linhas: linhas.map((l) => ({ ...l })), aVencer: aVencer.map((x) => ({ ...x.parcela })) });
      if (window.innerWidth < 1024) setTimeout(() => topo.current && topo.current.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    }

    const m = R.formatarMoeda;
    function celulas(i) {
      const x = res.resultados[i]; const l = res.linhas[i]; const o = res.outros[i];
      return [i + 1, l.descricao || '—', l.competencia || '—', l.vencimento, m(x.original), `${m(x.correcao.valorCorrecao)}${x.correcao.modo === 'percentual' ? ` (${R.formatarPercentual(x.correcao.percentual)})` : x.correcao.modo === 'indice' ? ` (${x.correcao.nomeIndice} ${R.formatarPercentual(x.correcao.percentual)})` : x.correcao.modo === 'valorCorrigido' ? ' (informado)' : ''}`, m(x.juros), m(x.multa), o ? m(o) : '—', x.pagamentos ? `-${m(x.pagamentos)}` : '—', m(x.saldo + o)];
    }

    function exportarCsv() {
      const linhas = res.resultados.map((x, i) => {
        const l = res.linhas[i]; const o = res.outros[i];
        return [i + 1, l.descricao, l.competencia, l.vencimento, R.numeroCSV(x.original), R.numeroCSV(x.correcao.valorCorrecao), R.numeroCSV(x.principalCorrigido), R.numeroCSV(x.juros), R.numeroCSV(x.multa), R.numeroCSV(x.honorarios), R.numeroCSV(o), R.numeroCSV(-x.pagamentos), R.numeroCSV(x.saldo + o)];
      });
      const t = res.totais;
      linhas.push(['', 'TOTAL', '', '', R.numeroCSV(t.original), R.numeroCSV(t.correcao), R.numeroCSV(t.principalCorrigido), R.numeroCSV(t.juros), R.numeroCSV(t.multa), R.numeroCSV(t.honorarios), R.numeroCSV(t.encargosNominais), R.numeroCSV(-t.pagamentos), R.numeroCSV(t.saldoFinal)]);
      const csv = R.gerarCSV(['Número', 'Descrição', 'Competência', 'Vencimento', 'Valor original', 'Correção monetária', 'Principal corrigido', 'Juros', 'Multa', 'Honorários', 'Outros encargos', 'Pagamentos', 'Saldo atualizado'], linhas);
      UI.baixarArquivo(UI.nomeArquivo(f.titulo || 'planilha-debitos', 'csv'), csv, 'text/csv;charset=utf-8');
    }

    function entrada() {
      const t = res.totais;
      return {
        tipo: 'planilha',
        titulo: 'Memória de cálculo — Planilha consolidada de débitos',
        subtitulo: f.titulo || 'Planilha de débitos',
        identificacao: [['Título', f.titulo], ['Credor', f.credor], ['Devedor', f.devedor], ['Linhas', String(res.linhas.length)]],
        criterios: B.descreverCriterios(f.criterios, res.linhas),
        parcelas: res.linhas.map((l, i) => ({ descricao: l.descricao || `Linha ${i + 1}`, competencia: l.competencia, vencimento: l.vencimento })),
        resultados: res.resultados, totais: t, dataFinal: f.criterios.dataFinal,
        observacoes: [f.observacoes, res.aVencer.length ? `Linhas com vencimento posterior à data final, fora do cálculo: ${res.aVencer.map((l) => `${l.descricao || 'linha'} (${l.vencimento})`).join(', ')}.` : ''].filter(Boolean).join('\n'),
      };
    }

    function gerarMemoria() {
      B.guardarMemoria(window.CentralRegistro.montarCalculo(entrada()), true);
    }

    function gerarPlanilha() {
      B.gerarPlanilhaCalculo(entrada(), f.titulo || 'planilha-debitos');
    }

    function gerarPdf() {
      B.gerarPdfCalculo(entrada(), f.titulo || 'planilha-debitos');
    }

    const abas = [
      { id: 'obrigacoes', rotulo: 'Obrigações', icone: 'planilha', conteudo: (
        <div className="space-y-4">
          <Grade>
            <Col span={2}><CampoTexto rotulo="Título da planilha" valor={f.titulo} onChange={(v) => alterar({ titulo: v })} placeholder="Ex.: Débitos do contrato 123" /></Col>
            <Col span={2}><CampoTexto rotulo="Credor" valor={f.credor} onChange={(v) => alterar({ credor: v })} /></Col>
            <Col span={2}><CampoTexto rotulo="Devedor" valor={f.devedor} onChange={(v) => alterar({ devedor: v })} /></Col>
          </Grade>
          <div className="border-t border-border pt-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-[13px] font-medium text-foreground">Obrigações</h3>
                <p className="mt-1 text-[12px] text-muted-foreground">{f.linhas.length} linha(s), máximo de {R.LIMITE_PARCELAS}. A correção monetária (índice ou valor informado) é escolhida em cada linha.</p>
              </div>
              <Botao tamanho="sm" variante="primario" icone="mais" onClick={() => alterar({ linhas: [...f.linhas, novaLinha()] })}>Adicionar obrigação</Botao>
            </div>
            {f.linhas.length === 0 && <p className="text-[13px] text-muted-foreground">Nenhuma linha. Clique em "Adicionar obrigação" para começar.</p>}
            {f.linhas.map((l, i) => (
              <LinhaEditavel key={l.id} linha={l} indice={i} erros={errosForm} criterios={f.criterios}
                onChange={(parte) => alterarLinha(l.id, parte)} onRemover={() => alterar({ linhas: f.linhas.filter((x) => x.id !== l.id) })} />
            ))}
            {f.linhas.length > 0 && <Botao icone="mais" onClick={() => alterar({ linhas: [...f.linhas, novaLinha()] })}>Adicionar obrigação</Botao>}
          </div>
        </div>
      ) },
      { id: 'criterios', rotulo: 'Critérios', icone: 'percentual', conteudo: (
        <div className="space-y-6">
          <div>
            <h3 className="text-[13px] font-medium text-foreground mb-1">Critérios padrão</h3>
            <p className="mb-3 text-[12px] text-muted-foreground">Aplicados a todas as linhas, exceto onde a linha tiver taxa de juros ou multa próprias.</p>
            <B.CriteriosCalculo valor={f.criterios} onChange={(c) => alterar({ criterios: c })} erros={errosForm.filter((e) => e.linha === undefined)} />
          </div>
          <div className="border-t border-border pt-5">
            <AreaTexto rotulo="Observações (aparecem no demonstrativo)" valor={f.observacoes} onChange={(v) => alterar({ observacoes: v })} />
          </div>
        </div>
      ) },
    ];

    const painel = (
      <B.PainelTotais totais={res && res.totais} mostrarHonorarios={f.criterios.honorarios.ativo} rotulo="Total consolidado" vazio="Inclua as obrigações e clique em Calcular planilha."
        kpis={res ? [{ l: 'Obrigações', v: String(res.linhas.length) }, { l: 'Principal somado', v: m(res.totais.original) }, { l: 'Pagamentos', v: res.totais.pagamentos ? `-${m(res.totais.pagamentos)}` : m(0) }] : undefined}
        topo={errosForm.length > 0 && (
          <Alerta tipo="erro" titulo="Revise os dados informados">
            <ul className="list-disc pl-5 space-y-0.5">{errosForm.slice(0, 8).map((e, i) => <li key={i}>{e.mensagem}</li>)}{errosForm.length > 8 && <li>… e mais {errosForm.length - 8} ajustes.</li>}</ul>
          </Alerta>
        )}
        acoes={
          <AcoesPainel
            solido={{ rotulo: 'Calcular planilha', icone: 'atualizar', onClick: calcular, desabilitado: !f.linhas.length }}
            principal={{ rotulo: 'Exportar CSV', icone: 'csv', onClick: exportarCsv, desabilitado: !res }}
            linha={[{ rotulo: 'Excel', icone: 'xls', onClick: gerarPlanilha, desabilitado: !res }, { rotulo: 'Mais', icone: 'baixar', desabilitado: !res, menu: [
              { rotulo: 'Planilha de cálculo (PDF)', onClick: gerarPdf },
              { rotulo: 'Salvar memória de cálculo', onClick: gerarMemoria },
            ] }]}
            onLimpar={() => { limpar(); definirRes(null); definirErros([]); }} />
        } />
    );

    const detalhes = res && (
      <div ref={topo}>
        <Cartao titulo="Detalhes da planilha" descricao={`Calculado até ${f.criterios.dataFinal}, com a correção monetária escolhida em cada linha.`} className="section-open print-hide">
          <div className="space-y-3">
            {res.aVencer.length > 0 && <Alerta tipo="aviso">Fora do cálculo por vencerem depois da data final ({f.criterios.dataFinal}): {res.aVencer.map((l) => `${l.descricao || 'linha'} (${l.vencimento})`).join(', ')}.</Alerta>}
            <Tabela legenda="Planilha consolidada" colunas={['Nº', 'Descrição', 'Competência', 'Vencimento', 'Valor original', 'Correção monetária', 'Juros', 'Multa', 'Outros encargos', 'Pagamentos', 'Saldo atualizado']} numericas={[4, 5, 6, 7, 8, 9, 10]}
              linhas={res.resultados.map((_, i) => celulas(i))}
              rodape={['', 'Totais', '', '', m(res.totais.original), m(res.totais.correcao), m(res.totais.juros), m(res.totais.multa), m(res.totais.encargosNominais), res.totais.pagamentos ? `-${m(res.totais.pagamentos)}` : '—', m(res.totais.saldoFinal)]} />
            <p className="text-xs text-muted-foreground">O saldo de cada linha inclui honorários em percentual, quando aplicados. Honorários de valor fixo entram uma única vez no total.</p>
          </div>
        </Cartao>
      </div>
    );

    return (
      <Pagina titulo="Planilha consolidada" descricao="Várias obrigações com total consolidado." nota="Cálculo local no navegador">
        <Calculador abas={abas} aba={aba} onAba={definirAba} painel={painel} detalhes={detalhes} textoRodape="o resultado aparece ao clicar em Calcular planilha" />
      </Pagina>
    );
  }

  window.CentralModulos = Object.assign(window.CentralModulos || {}, { ModuloPlanilha });
})();
