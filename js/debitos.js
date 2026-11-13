/*
 * Módulo: Atualização de Débitos (dívida única com pagamentos parciais).
 * A correção monetária vem do índice oficial (tabela do Banco Central) ou é informada pelo usuário
 * (percentual acumulado ou valor já corrigido);
 * juros, multa, honorários, pagamentos e saldo são calculados localmente por CentralCalculo.
 */
(() => {
  const { useState, useRef } = React;
  const UI = window.CentralUI;
  const B = window.CentralBlocos;
  const R = window.CentralRegras;
  const K = window.CentralCalculo;
  const { Pagina, Cartao, Botao, Alerta, CampoTexto, CampoMoeda, CampoData, Selecao, AreaTexto, Grade, Col, Calculador, AcoesPainel, Tabela } = UI;

  let sequencia = 0;
  const novoId = () => { sequencia += 1; return `d${Date.now().toString(36)}${sequencia}`; };

  const inicial = () => ({
    descricao: '', credor: '', devedor: '', principal: '', vencimento: '', dataInicial: '', observacoes: '',
    correcao: B.correcaoInicial(), pagamentos: [], encargos: [], criterios: K.criteriosPadrao(),
    modo: 'unica', parcelas: [], gerador: B.geradorInicial(), lote: B.loteInicial(),
  });

  function ListaPagamentos({ itens, onChange, erro }) {
    const alterar = (id, parte) => onChange(itens.map((p) => (p.id === id ? { ...p, ...parte } : p)));
    return (
      <div className="space-y-3">
        {itens.length === 0 && <p className="text-sm text-muted-foreground">Nenhum pagamento.</p>}
        {itens.map((p, i) => (
          <div key={p.id} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end p-3 rounded-[10px] border border-border section-open">
            <CampoData rotulo={`Data do pagamento ${i + 1}`} valor={p.data} onChange={(v) => alterar(p.id, { data: v })} />
            <CampoMoeda rotulo="Valor pago" valor={p.valor} onChange={(v) => alterar(p.id, { valor: v })} />
            <Botao variante="perigo" tamanho="sm" icone="lixeira" className="!h-[38px]" aria-label={`Remover pagamento ${i + 1}`} onClick={() => onChange(itens.filter((x) => x.id !== p.id))}>Remover</Botao>
          </div>
        ))}
        {erro && <p role="alert" className="text-[11.5px] text-destructive">{erro}</p>}
        <Botao tamanho="sm" icone="mais" onClick={() => onChange([...itens, { id: novoId(), data: '', valor: '' }])}>Adicionar pagamento</Botao>
      </div>
    );
  }

  function ListaEncargos({ itens, onChange }) {
    const alterar = (id, parte) => onChange(itens.map((p) => (p.id === id ? { ...p, ...parte } : p)));
    return (
      <div className="space-y-3">
        {itens.length === 0 && <p className="text-sm text-muted-foreground">Nenhum encargo.</p>}
        {itens.map((p, i) => (
          <div key={p.id} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end p-3 rounded-[10px] border border-border section-open">
            <CampoTexto rotulo={`Descrição do encargo ${i + 1}`} valor={p.desc} onChange={(v) => alterar(p.id, { desc: v })} maxLength={80} />
            <CampoMoeda rotulo="Valor" valor={p.valor} onChange={(v) => alterar(p.id, { valor: v })} />
            <Botao variante="perigo" tamanho="sm" icone="lixeira" className="!h-[38px]" aria-label={`Remover encargo ${i + 1}`} onClick={() => onChange(itens.filter((x) => x.id !== p.id))}>Remover</Botao>
          </div>
        ))}
        <Botao tamanho="sm" icone="mais" onClick={() => onChange([...itens, { id: novoId(), desc: '', valor: '' }])}>Adicionar encargo</Botao>
      </div>
    );
  }

  // Tabela de resumo da correção e dos componentes de uma parcela (usada nos módulos de parcelas).
  function linhaResultado(r) {
    return [R.formatarMoeda(r.original), B.textoCorrecao(r.correcao), R.formatarMoeda(r.principalCorrigido), R.formatarMoeda(r.juros), R.formatarMoeda(r.multa)];
  }

  function ModuloDebitos() {
    const [f, definirF, limpar] = UI.useRascunho('debitos2', inicial);
    const [errosForm, definirErros] = useState([]);
    const [resultado, definirResultado] = useState(null);
    const [aba, definirAba] = useState('divida');
    const topoResultado = useRef(null);

    const alterar = (parte) => { definirF({ ...f, ...parte }); definirResultado(null); };
    const erroCampo = (campo) => (errosForm.find((e) => e.campo === campo) || {}).mensagem;

    function montarParcela() {
      return {
        // Juros e correção contam do início da atualização (se informado); multa e mora, do vencimento real.
        descricao: f.descricao || 'Dívida', vencimento: f.dataInicial || f.vencimento, vencimentoMora: f.vencimento, valor: f.principal, correcao: f.correcao,
        pagamentos: f.pagamentos.map((p) => ({ data: p.data, valor: p.valor })),
      };
    }

    const varias = f.modo === 'varias';
    const M = window.CentralModulos;

    // Várias parcelas: mesmas regras do módulo de parcelas (gerador, colar tabela, correção e pagamentos por linha).
    const alterarParcela = (id, parte) => alterar({ parcelas: f.parcelas.map((y) => (y.id === id ? { ...y, ...parte } : y)) });
    function adicionarGeradas(itens) {
      const ini = f.parcelas.length;
      const novas = itens.map((it, i) => M.novaParcela({ descricao: `Parcela ${ini + i + 1}`, competencia: it.vencimento.slice(3), vencimento: it.vencimento, valor: it.valor, correcao: B.correcaoDoLote(f.lote) }));
      alterar({ parcelas: [...f.parcelas, ...novas] });
      UI.avisar(`${novas.length} parcelas adicionadas.`);
    }
    function adicionarParcela() {
      const ultima = f.parcelas[f.parcelas.length - 1];
      if (!ultima) { alterar({ parcelas: [M.novaParcela({ correcao: B.correcaoDoLote(f.lote) })] }); return; }
      const venc = R.dataEhValida(ultima.vencimento) ? R.adicionarMeses(ultima.vencimento, 1) : '';
      alterar({ parcelas: [...f.parcelas, M.novaParcela({ vencimento: venc, competencia: venc ? venc.slice(3) : '', valor: ultima.valor, correcao: { ...ultima.correcao } })] });
    }
    function aplicarATodas() {
      const parcelas = B.aplicarLote(f.parcelas, f.lote);
      if (parcelas) alterar({ parcelas });
    }

    function validar() {
      if (varias) {
        const erros = K.validarCalculo(f.criterios, f.parcelas, 'Parcela');
        f.encargos.forEach((e, i) => { if (e.valor && Number.isNaN(R.lerValor(e.valor))) erros.push({ campo: 'encargos', mensagem: `Encargo ${i + 1}: valor inválido.` }); });
        return erros;
      }
      const parcela = montarParcela();
      // Erros de data da parcela são reapresentados com mensagens próprias deste formulário.
      let erros = K.validarCalculo(f.criterios, [parcela], 'Dívida')
        .filter((e) => e.campo !== 'vencimento' || /posterior/.test(e.mensagem))
        .map((e) => ({ ...e, mensagem: e.mensagem.replace(/^Dívida 1(, )?/, '').replace(/^: /, '').replace(/^pagamento/, 'Pagamento').replace(/^./, (c) => c.toUpperCase()) }));
      if (!R.dataEhValida(f.vencimento)) erros = [{ campo: 'vencimentoOriginal', mensagem: 'Informe a data de vencimento da dívida (DD/MM/AAAA).' }, ...erros];
      if (f.dataInicial) {
        const di = R.lerData(f.dataInicial); const dv = R.lerData(f.vencimento);
        if (!di) erros.push({ campo: 'dataInicial', mensagem: 'Data inicial de atualização inválida (DD/MM/AAAA).' });
        else if (dv && di.ts < dv.ts) erros.push({ campo: 'dataInicial', mensagem: 'A data inicial de atualização não pode ser anterior ao vencimento.' });
        else if (R.lerData(f.criterios.dataFinal) && di.ts > R.lerData(f.criterios.dataFinal).ts) erros.push({ campo: 'dataInicial', mensagem: 'A data inicial de atualização não pode ser posterior à data final do cálculo.' });
      }
      if (f.criterios.vincendas === 'excluir' && R.dataEhValida(f.vencimento) && K.estaAVencer({ vencimento: f.vencimento }, f.criterios.dataFinal)) {
        erros.push({ campo: 'vencimentoOriginal', mensagem: 'A dívida vence depois da data final e o critério manda deixar parcelas a vencer fora do cálculo. Mude a data final ou escolha "Vencimento antecipado" nos critérios.' });
      }
      f.encargos.forEach((e, i) => { if (e.valor && Number.isNaN(R.lerValor(e.valor))) erros.push({ campo: 'encargos', mensagem: `Encargo ${i + 1}: valor inválido.` }); });
      return erros;
    }

    function calcular() {
      const erros = validar();
      definirErros(erros);
      if (erros.length) { UI.avisar('Corrija os campos destacados antes de calcular.', 'erro'); return; }
      if (varias) {
        const { calcular: lista, aVencer } = K.separarVincendas(f.parcelas, f.criterios);
        if (!lista.length) { definirErros([{ campo: 'parcelas', mensagem: 'Todas as parcelas vencem depois da data final e o critério as deixa fora do cálculo. Mude a data final ou escolha "Vencimento antecipado".' }]); return; }
        const calculadas = lista.map((y) => y.parcela);
        const resultados = calculadas.map((y) => K.calcularParcela(y, f.criterios));
        const totais = K.consolidar(resultados, { honorariosFixos: K.honorariosFixos(f.criterios), encargosNominais: K.outrosEncargosTotal(f.encargos) });
        definirResultado({ multi: true, resultados, totais, parcelas: calculadas.map((y) => ({ ...y })), aVencer: aVencer.map((y) => ({ ...y.parcela })), criteriosDescritos: B.descreverCriterios(f.criterios, calculadas) });
        if (window.innerWidth < 1024) setTimeout(() => topoResultado.current && topoResultado.current.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
        return;
      }
      const parcela = montarParcela();
      const r = K.calcularParcela(parcela, f.criterios);
      const totais = K.consolidar([r], { honorariosFixos: K.honorariosFixos(f.criterios), encargosNominais: K.outrosEncargosTotal(f.encargos) });
      definirResultado({ r, totais, parcela, criteriosDescritos: B.descreverCriterios(f.criterios, [parcela]) });
      // Em telas estreitas o resultado fica abaixo do formulário: leva o usuário até ele
      if (window.innerWidth < 1024) setTimeout(() => topoResultado.current && topoResultado.current.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    }

    function entrada() {
      const x = resultado;
      if (x.multi) {
        return {
          tipo: 'debito',
          titulo: 'Memória de cálculo — Atualização de débitos',
          subtitulo: f.descricao || 'Dívida em parcelas',
          identificacao: [['Descrição', f.descricao], ['Credor', f.credor], ['Devedor', f.devedor], ['Quantidade de parcelas', String(x.parcelas.length)]],
          criterios: x.criteriosDescritos,
          parcelas: x.parcelas.map((y, i) => ({ descricao: y.descricao || `Parcela ${i + 1}`, competencia: y.competencia, vencimento: y.vencimento })),
          resultados: x.resultados, totais: x.totais, dataFinal: f.criterios.dataFinal,
          observacoes: [f.observacoes, x.aVencer.length ? `Parcelas com vencimento posterior à data final, fora do cálculo: ${x.aVencer.map((y) => `${y.descricao || 'Parcela'} (${y.vencimento})`).join(', ')}.` : ''].filter(Boolean).join('\n'),
        };
      }
      return {
        tipo: 'debito',
        titulo: 'Memória de cálculo — Atualização de débito',
        subtitulo: f.descricao || 'Dívida',
        identificacao: [['Descrição', f.descricao], ['Credor', f.credor], ['Devedor', f.devedor], ['Vencimento', f.vencimento], ['Início da atualização', f.dataInicial || f.vencimento]],
        criterios: x.criteriosDescritos,
        parcelas: [{ descricao: x.parcela.descricao, vencimento: x.parcela.vencimento }],
        resultados: [x.r], totais: x.totais, dataFinal: f.criterios.dataFinal, observacoes: f.observacoes,
      };
    }

    function gerarMemoria() {
      B.guardarMemoria(window.CentralRegistro.montarCalculo(entrada()), true);
    }

    function gerarPlanilha() {
      B.gerarPlanilhaCalculo(entrada(), f.descricao || 'debito');
    }

    function gerarPdf() {
      B.gerarPdfCalculo(entrada(), f.descricao || 'debito');
    }

    const x = resultado;
    const subtitulo = (t) => <h3 className="text-[13px] font-medium text-foreground mb-3">{t}</h3>;

    const abas = [
      { id: 'divida', rotulo: 'Dívida', icone: 'debito', conteudo: (
        <Grade>
          <Col span={6}><Selecao rotulo="Lançamento" valor={f.modo || 'unica'} onChange={(v) => alterar({ modo: v })} opcoes={[{ valor: 'unica', rotulo: 'Uma dívida (com pagamentos parciais)' }, { valor: 'varias', rotulo: 'Várias parcelas na mesma planilha' }]} /></Col>
          <Col span={6}><CampoTexto rotulo="Descrição da dívida" valor={f.descricao} onChange={(v) => alterar({ descricao: v })} placeholder="Ex.: Nota promissória, mensalidade, indenização" /></Col>
          <Col span={3}><CampoTexto rotulo="Credor" valor={f.credor} onChange={(v) => alterar({ credor: v })} /></Col>
          <Col span={3}><CampoTexto rotulo="Devedor" valor={f.devedor} onChange={(v) => alterar({ devedor: v })} /></Col>
          {varias && (
            <Col span={6}>
              <div className="border-t border-border pt-4 space-y-4">
                <B.GeradorParcelas valor={f.gerador} onChange={(v) => alterar({ gerador: v })} onGerar={adicionarGeradas} />
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <B.CorrecaoLote valor={f.lote} onChange={(v) => definirF({ ...f, lote: v })} quantidade={f.parcelas.length} onAplicar={aplicarATodas} />
                  <B.ColarTabela onAdicionar={adicionarGeradas} />
                </div>
                {f.parcelas.length === 0 && <p className="text-[13px] text-muted-foreground">Nenhuma parcela incluída ainda.</p>}
                {f.parcelas.map((y, i) => (
                  <M.LinhaParcela key={y.id} parcela={y} indice={i} erros={errosForm} rotuloBase="Parcela" criterios={f.criterios}
                    onChange={(parte) => alterarParcela(y.id, parte)} onRemover={() => alterar({ parcelas: f.parcelas.filter((z) => z.id !== y.id) })} />
                ))}
                {erroCampo('parcelas') && <p role="alert" className="text-[11.5px] text-destructive">{erroCampo('parcelas')}</p>}
                <Botao icone="mais" onClick={adicionarParcela}>Adicionar parcela</Botao>
              </div>
            </Col>
          )}
          {!varias && (
            <>
              <Col span={2}><CampoMoeda rotulo="Valor principal original" obrigatorio valor={f.principal} onChange={(v) => alterar({ principal: v })} erro={erroCampo('valor')} /></Col>
              <Col span={2}><CampoData rotulo="Data de vencimento" obrigatorio valor={f.vencimento} onChange={(v) => alterar({ vencimento: v })} erro={erroCampo('vencimentoOriginal')} /></Col>
              <Col span={2}><CampoData rotulo="Início da atualização" valor={f.dataInicial} onChange={(v) => alterar({ dataInicial: v })} erro={erroCampo('dataInicial')} /></Col>
              <Col span={6}>
                <div className="border-t border-border pt-4">
                  <B.CorrecaoManual valor={f.correcao} onChange={(c) => alterar({ correcao: c })} valorOriginal={f.principal} vencimento={f.dataInicial || f.vencimento} dataFinal={f.criterios.dataFinal} erro={erroCampo('correcao')} />
                </div>
              </Col>
            </>
          )}
        </Grade>
      ) },
      { id: 'encargos', rotulo: 'Encargos e pagamentos', icone: 'percentual', conteudo: (
        <div className="space-y-6">
          <div>
            {subtitulo('Critérios de cálculo')}
            <B.CriteriosCalculo valor={f.criterios} onChange={(c) => alterar({ criterios: c })} erros={errosForm} />
          </div>
          {!varias && (
            <div className="border-t border-border pt-5">
              {subtitulo('Pagamentos parciais')}
              <ListaPagamentos itens={f.pagamentos} onChange={(v) => alterar({ pagamentos: v })} erro={erroCampo('pagamento')} />
            </div>
          )}
          <div className="border-t border-border pt-5">
            {subtitulo('Outros encargos')}
            <ListaEncargos itens={f.encargos} onChange={(v) => alterar({ encargos: v })} />
          </div>
          <div className="border-t border-border pt-5">
            <AreaTexto rotulo="Observações (aparecem no demonstrativo)" valor={f.observacoes} onChange={(v) => alterar({ observacoes: v })} />
          </div>
        </div>
      ) },
    ];

    const painel = (
      <B.PainelTotais totais={x && x.totais} mostrarHonorarios={f.criterios.honorarios.ativo}
        kpis={x && x.multi ? [{ l: 'Parcelas', v: String(x.resultados.length) }, { l: 'Principal corrigido', v: R.formatarMoeda(x.totais.principalCorrigido) }, { l: 'Pagamentos', v: x.totais.pagamentos ? `-${R.formatarMoeda(x.totais.pagamentos)}` : R.formatarMoeda(0) }] : undefined}
        topo={errosForm.length > 0 && (
          <Alerta tipo="erro" titulo="Revise os dados informados">
            <ul className="list-disc pl-5 space-y-0.5">{errosForm.map((e, i) => <li key={i}>{e.mensagem}</li>)}</ul>
          </Alerta>
        )}
        acoes={
          <AcoesPainel
            solido={{ rotulo: 'Atualizar débito', icone: 'atualizar', onClick: calcular }}
            principal={{ rotulo: 'Gerar planilha (PDF)', icone: 'pdf', onClick: gerarPdf, desabilitado: !x }}
            linha={[{ rotulo: 'Excel', icone: 'xls', onClick: gerarPlanilha, desabilitado: !x }, { rotulo: 'Salvar memória', icone: 'salvar', onClick: gerarMemoria, desabilitado: !x }]}
            onLimpar={() => { limpar(); definirResultado(null); definirErros([]); }} />
        } />
    );

    const detalhesVarias = x && x.multi && (
      <div ref={topoResultado}>
        <Cartao titulo="Detalhes do cálculo" descricao={`Calculado até ${f.criterios.dataFinal}, com a correção monetária escolhida em cada parcela.`} className="section-open print-hide">
          <div className="space-y-5">
            {x.aVencer.length > 0 && <Alerta tipo="aviso">Fora do cálculo por vencerem depois da data final ({f.criterios.dataFinal}): {x.aVencer.map((y) => `${y.descricao || 'Parcela'} (${y.vencimento})`).join(', ')}.</Alerta>}
            <Tabela legenda="Resultado por parcela" colunas={['Nº', 'Descrição', 'Vencimento', 'Valor original', 'Correção monetária', 'Principal corrigido', 'Juros', 'Multa', 'Pagamentos', 'Saldo']} numericas={[3, 4, 5, 6, 7, 8, 9]}
              linhas={x.resultados.map((y, i) => [i + 1, x.parcelas[i].descricao || `Parcela ${i + 1}`, x.parcelas[i].vencimento, R.formatarMoeda(y.original), B.textoCorrecao(y.correcao), R.formatarMoeda(y.principalCorrigido), R.formatarMoeda(y.juros), R.formatarMoeda(y.multa), y.pagamentos ? `-${R.formatarMoeda(y.pagamentos)}` : '—', R.formatarMoeda(y.saldo)])}
              rodape={['', 'Total', '', R.formatarMoeda(x.totais.original), R.formatarMoeda(x.totais.correcao), R.formatarMoeda(x.totais.principalCorrigido), R.formatarMoeda(x.totais.juros), R.formatarMoeda(x.totais.multa), x.totais.pagamentos ? `-${R.formatarMoeda(x.totais.pagamentos)}` : '—', R.formatarMoeda(x.totais.saldo)]} />
            <details className="rounded-[10px] border border-border p-4 group">
              <summary className="cursor-pointer text-[13px] text-foreground list-none flex items-center justify-between">
                Memória de cálculo por parcela <UI.Icone nome="chevron" className="w-4 h-4 transition-transform group-open:rotate-180" />
              </summary>
              <div className="mt-3 space-y-4">
                {x.resultados.map((y, i) => (
                  <div key={i}>
                    <div className="text-xs text-muted-foreground mb-1">{x.parcelas[i].descricao || `Parcela ${i + 1}`} — {x.parcelas[i].vencimento}</div>
                    <ol className="list-decimal pl-5 space-y-1 text-[13px] text-foreground">{y.memoria.map((l, k) => <li key={k}>{l}</li>)}</ol>
                  </div>
                ))}
              </div>
            </details>
          </div>
        </Cartao>
      </div>
    );

    const detalhes = x && x.multi ? detalhesVarias : x && (
      <div ref={topoResultado}>
        <Cartao titulo="Detalhes do cálculo" descricao={`Calculado até ${f.criterios.dataFinal}.`} className="section-open print-hide">
          <div className="space-y-5">
            <div className="rounded-[10px] border border-border p-4 text-[13px]">
              <div className="font-medium text-foreground mb-1">Correção monetária utilizada</div>
              {x.r.correcao.modo === 'percentual' && <p className="text-foreground">Percentual: <b>{R.formatarPercentual(x.r.correcao.percentual)}</b> · Valor da correção: <b>{R.formatarMoeda(x.r.correcao.valorCorrecao)}</b> · Principal corrigido: <b>{R.formatarMoeda(x.r.principalCorrigido)}</b></p>}
              {x.r.correcao.modo === 'valorCorrigido' && <p className="text-foreground">Principal corrigido: <b>{R.formatarMoeda(x.r.principalCorrigido)}</b> (diferença para o valor original: {R.formatarMoeda(x.r.correcao.valorCorrecao)}).</p>}
              {x.r.correcao.modo === 'indice' && <p className="text-foreground">{x.r.correcao.nomeIndice}: fator acumulado <b>{x.r.correcao.fator.toLocaleString('pt-BR', { minimumFractionDigits: 6, maximumFractionDigits: 6 })}</b> ({R.formatarPercentual(x.r.correcao.percentual)}) em {x.r.correcao.meses.length} mês(es) · Valor da correção: <b>{R.formatarMoeda(x.r.correcao.valorCorrecao)}</b> · Principal corrigido: <b>{R.formatarMoeda(x.r.principalCorrigido)}</b>{x.r.correcao.faltantes.length ? ` · sem índice divulgado para ${x.r.correcao.faltantes.map(K.nomeMes).join(', ')}` : ''}</p>}
              {x.r.correcao.modo === 'nenhuma' && <p className="text-foreground">Sem correção monetária: o valor original foi usado como principal.</p>}
            </div>
            <div>
              <h3 className="text-[13px] font-medium text-foreground mb-2">Memória de cálculo</h3>
              <ol className="list-decimal pl-5 space-y-1.5 text-[13px] text-foreground">{x.r.memoria.map((l, i) => <li key={i}>{l}</li>)}</ol>
            </div>
            <div>
              <h3 className="text-[13px] font-medium text-foreground mb-2">Critérios efetivamente utilizados</h3>
              <dl className="grid grid-cols-1 sm:grid-cols-[220px_1fr] gap-x-4 gap-y-1.5 text-[13px]">
                {x.criteriosDescritos.map(([k, v]) => <React.Fragment key={k}><dt className="text-muted-foreground">{k}</dt><dd className="text-foreground">{v}</dd></React.Fragment>)}
              </dl>
            </div>
          </div>
        </Cartao>
      </div>
    );

    return (
      <Pagina titulo="Atualização de débitos">
        <Calculador abas={abas} aba={aba} onAba={definirAba} painel={painel} detalhes={detalhes} />
      </Pagina>
    );
  }

  window.CentralModulos = Object.assign(window.CentralModulos || {}, { ModuloDebitos, ListaPagamentos, ListaEncargos, novoId, linhaResultado });
})();
