/*
 * Módulo: Atualização de Débitos (dívida única com pagamentos parciais).
 * A correção monetária é informada manualmente (percentual acumulado ou valor já corrigido);
 * juros, multa, honorários, pagamentos e saldo são calculados localmente por CentralCalculo.
 */
(() => {
  const { useState, useRef } = React;
  const UI = window.CentralUI;
  const B = window.CentralBlocos;
  const R = window.CentralRegras;
  const K = window.CentralCalculo;
  const { Pagina, Cartao, Botao, Alerta, CampoTexto, CampoMoeda, CampoData, Tabela } = UI;

  let sequencia = 0;
  const novoId = () => { sequencia += 1; return `d${Date.now().toString(36)}${sequencia}`; };

  const inicial = () => ({
    descricao: '', credor: '', devedor: '', principal: '', vencimento: '', dataInicial: '', observacoes: '',
    correcao: K.correcaoPadrao(), pagamentos: [], encargos: [], criterios: K.criteriosPadrao(),
  });

  function ListaPagamentos({ itens, onChange, erro }) {
    const alterar = (id, parte) => onChange(itens.map((p) => (p.id === id ? { ...p, ...parte } : p)));
    return (
      <div className="space-y-3">
        {itens.length === 0 && <p className="text-sm text-muted-foreground">Nenhum pagamento informado. Inclua pagamentos parciais para abatê-los do saldo.</p>}
        {itens.map((p, i) => (
          <div key={p.id} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end p-3 rounded-xl border border-border section-open">
            <CampoData rotulo={`Data do pagamento ${i + 1}`} valor={p.data} onChange={(v) => alterar(p.id, { data: v })} />
            <CampoMoeda rotulo="Valor pago" valor={p.valor} onChange={(v) => alterar(p.id, { valor: v })} />
            <Botao variante="perigo" tamanho="sm" icone="lixeira" className="!h-10" aria-label={`Remover pagamento ${i + 1}`} onClick={() => onChange(itens.filter((x) => x.id !== p.id))}>Remover</Botao>
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
        {itens.length === 0 && <p className="text-sm text-muted-foreground">Nenhum encargo adicional. Use este campo para custas ou despesas cujo valor já seja conhecido; eles são somados sem atualização monetária.</p>}
        {itens.map((p, i) => (
          <div key={p.id} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end p-3 rounded-xl border border-border section-open">
            <CampoTexto rotulo={`Descrição do encargo ${i + 1}`} valor={p.desc} onChange={(v) => alterar(p.id, { desc: v })} maxLength={80} />
            <CampoMoeda rotulo="Valor" valor={p.valor} onChange={(v) => alterar(p.id, { valor: v })} />
            <Botao variante="perigo" tamanho="sm" icone="lixeira" className="!h-10" aria-label={`Remover encargo ${i + 1}`} onClick={() => onChange(itens.filter((x) => x.id !== p.id))}>Remover</Botao>
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
    const topoResultado = useRef(null);

    const alterar = (parte) => { definirF({ ...f, ...parte }); definirResultado(null); };
    const erroCampo = (campo) => (errosForm.find((e) => e.campo === campo) || {}).mensagem;

    function montarParcela() {
      return {
        descricao: f.descricao || 'Dívida', vencimento: f.dataInicial || f.vencimento, valor: f.principal, correcao: f.correcao,
        pagamentos: f.pagamentos.map((p) => ({ data: p.data, valor: p.valor })),
      };
    }

    function validar() {
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
      }
      f.encargos.forEach((e, i) => { if (e.valor && Number.isNaN(R.lerValor(e.valor))) erros.push({ campo: 'encargos', mensagem: `Encargo ${i + 1}: valor inválido.` }); });
      return erros;
    }

    function calcular() {
      const erros = validar();
      definirErros(erros);
      if (erros.length) { UI.avisar('Corrija os campos destacados antes de calcular.', 'erro'); return; }
      const parcela = montarParcela();
      const r = K.calcularParcela(parcela, f.criterios);
      const totais = K.consolidar([r], { honorariosFixos: K.honorariosFixos(f.criterios), encargosNominais: K.outrosEncargosTotal(f.encargos) });
      definirResultado({ r, totais, parcela, criteriosDescritos: B.descreverCriterios(f.criterios) });
      setTimeout(() => topoResultado.current && topoResultado.current.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    }

    function entrada() {
      const x = resultado;
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
    return (
      <Pagina titulo="Atualização de débitos" descricao="Atualize uma dívida com a correção monetária que você informar, mais juros, multa, honorários e pagamentos parciais.">
        <Cartao titulo="1. Identificação" descricao="Nomes e descrições ficam apenas neste navegador e aparecem no demonstrativo.">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <CampoTexto rotulo="Descrição da dívida" valor={f.descricao} onChange={(v) => alterar({ descricao: v })} placeholder="Ex.: Nota promissória, mensalidade, indenização" className="sm:col-span-2" />
            <CampoTexto rotulo="Credor" valor={f.credor} onChange={(v) => alterar({ credor: v })} />
            <CampoTexto rotulo="Devedor" valor={f.devedor} onChange={(v) => alterar({ devedor: v })} />
          </div>
        </Cartao>

        <Cartao titulo="2. Valor e datas">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <CampoMoeda rotulo="Valor principal original" obrigatorio valor={f.principal} onChange={(v) => alterar({ principal: v })} erro={erroCampo('valor')} />
            <CampoData rotulo="Data de vencimento" obrigatorio valor={f.vencimento} onChange={(v) => alterar({ vencimento: v })} erro={erroCampo('vencimentoOriginal')} />
            <CampoData rotulo="Data inicial da atualização" valor={f.dataInicial} onChange={(v) => alterar({ dataInicial: v })} erro={erroCampo('dataInicial')}
              ajuda="Opcional. Se vazia, os juros contam a partir do vencimento. Preencha apenas se o título ou a decisão fixar outro termo inicial." />
          </div>
        </Cartao>

        <Cartao titulo="3. Correção monetária" descricao="A correção não é calculada pelo sistema: informe o percentual acumulado do período ou o valor já corrigido, apurados por você em outra ferramenta.">
          <B.CorrecaoManual valor={f.correcao} onChange={(c) => alterar({ correcao: c })} valorOriginal={f.principal} erro={erroCampo('correcao')} />
        </Cartao>

        <Cartao titulo="4. Pagamentos parciais" descricao="Informe os pagamentos já feitos; a forma de abatimento é escolhida nos critérios de cálculo.">
          <ListaPagamentos itens={f.pagamentos} onChange={(v) => alterar({ pagamentos: v })} erro={erroCampo('pagamento')} />
        </Cartao>

        <Cartao titulo="5. Critérios de cálculo" descricao="Escolha conforme o contrato, o título judicial ou a decisão. Nada é aplicado automaticamente.">
          <B.CriteriosCalculo valor={f.criterios} onChange={(c) => alterar({ criterios: c })} erros={errosForm} />
        </Cartao>

        <Cartao titulo="6. Outros encargos e observações">
          <div className="space-y-5">
            <ListaEncargos itens={f.encargos} onChange={(v) => alterar({ encargos: v })} />
            <div>
              <label htmlFor="obs-debito" className="block text-sm font-semibold text-foreground mb-1.5">Observações (aparecem no demonstrativo)</label>
              <textarea id="obs-debito" rows={3} maxLength={1000} value={f.observacoes} onChange={(e) => alterar({ observacoes: e.target.value })}
                className="block w-full px-3 py-2 text-sm rounded-lg border border-input bg-white dark:bg-slate-800 text-foreground" />
            </div>
          </div>
        </Cartao>

        {errosForm.length > 0 && (
          <Alerta tipo="erro" titulo="Revise os dados informados">
            <ul className="list-disc pl-5 space-y-0.5">{errosForm.map((e, i) => <li key={i}>{e.mensagem}</li>)}</ul>
          </Alerta>
        )}

        <div className="sticky bottom-3 z-20 flex flex-wrap gap-2 p-3 rounded-xl bg-card/95 border border-border shadow-card backdrop-blur">
          <Botao variante="verde" icone="atualizar" onClick={calcular} className="flex-1 sm:flex-none sm:min-w-[220px]">Atualizar débito</Botao>
          <Botao onClick={() => { limpar(); definirResultado(null); definirErros([]); }}>Limpar tudo</Botao>
        </div>

        <div ref={topoResultado} />
        {x && (
          <Cartao titulo="Resultado da atualização" descricao={`Calculado até ${f.criterios.dataFinal} com a correção monetária informada por você.`} className="section-open">
            <div className="space-y-5">
              <B.ResumoConsolidado totais={x.totais} mostrarHonorarios={f.criterios.honorarios.ativo} />
              <div className="rounded-xl border border-border p-4 text-sm">
                <div className="font-bold text-foreground mb-1">Correção monetária utilizada</div>
                {x.r.correcao.modo === 'percentual' && <p className="text-foreground">Percentual informado: <b>{R.formatarPercentual(x.r.correcao.percentual)}</b> · Valor da correção: <b>{R.formatarMoeda(x.r.correcao.valorCorrecao)}</b> · Principal corrigido: <b>{R.formatarMoeda(x.r.principalCorrigido)}</b></p>}
                {x.r.correcao.modo === 'valorCorrigido' && <p className="text-foreground">Principal corrigido <b>informado manualmente</b>: <b>{R.formatarMoeda(x.r.principalCorrigido)}</b> (diferença para o valor original: {R.formatarMoeda(x.r.correcao.valorCorrecao)}). Nenhuma correção adicional foi aplicada.</p>}
                {x.r.correcao.modo === 'nenhuma' && <p className="text-foreground">Sem correção monetária: o valor original foi usado como principal.</p>}
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground mb-2">Memória de cálculo</h3>
                <ol className="list-decimal pl-5 space-y-1.5 text-sm text-foreground">{x.r.memoria.map((l, i) => <li key={i}>{l}</li>)}</ol>
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground mb-2">Critérios efetivamente utilizados</h3>
                <dl className="grid grid-cols-1 sm:grid-cols-[220px_1fr] gap-x-4 gap-y-1.5 text-sm">
                  {x.criteriosDescritos.map(([k, v]) => <React.Fragment key={k}><dt className="text-muted-foreground">{k}</dt><dd className="font-medium text-foreground">{v}</dd></React.Fragment>)}
                </dl>
              </div>
              <div className="flex flex-wrap gap-2">
                <Botao variante="verde" icone="baixar" onClick={gerarPlanilha}>Gerar planilha de cálculo (Excel)</Botao>
                <Botao variante="verde" icone="baixar" onClick={gerarPdf}>Gerar planilha de cálculo (PDF)</Botao>
                <Botao variante="primario" icone="memoria" onClick={gerarMemoria}>Gerar memória de cálculo</Botao>
              </div>
            </div>
          </Cartao>
        )}
      </Pagina>
    );
  }

  window.CentralModulos = Object.assign(window.CentralModulos || {}, { ModuloDebitos, ListaPagamentos, ListaEncargos, novoId, linhaResultado });
})();
