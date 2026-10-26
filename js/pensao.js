/*
 * Módulo: Pensão alimentícia.
 * Cada competência (mês) é uma parcela com o seu vencimento, valor devido, correção monetária
 * informada manualmente e pagamentos. Juros, multa e saldo são calculados localmente
 * (CentralCalculo), tal como a divisão entre os ritos da prisão e da expropriação (art. 528 do CPC).
 * Nenhum índice ou API é consultado; a prescrição é aplicada apenas a partir da data de corte
 * informada pelo usuário.
 */
(() => {
  const { useState, useRef } = React;
  const UI = window.CentralUI;
  const B = window.CentralBlocos;
  const R = window.CentralRegras;
  const K = window.CentralCalculo;
  const { Pagina, Cartao, Botao, Alerta, CampoTexto, CampoMoeda, CampoPercentual, CampoData, CampoCompetencia, Selecao, Indicador, Tabela } = UI;

  let sequencia = 0;
  const novoId = () => { sequencia += 1; return `n${Date.now().toString(36)}${sequencia}`; };

  const TIPOS_FIXACAO = [
    { valor: 'valor_fixo', rotulo: 'Valor fixo mensal' },
    { valor: 'percentual', rotulo: 'Percentual sobre uma base informada em cada mês' },
    { valor: 'manual', rotulo: 'Informar o valor devido de cada competência' },
  ];

  const inicial = () => ({
    descricao: '', alimentante: '', alimentando: '', observacoes: '',
    fixacao: { tipo: '', valorFixo: '', percentual: '', baseDescricao: 'Salário mínimo' },
    gerador: { de: '', ate: '', dia: '' }, competencias: [],
    criterios: K.criteriosPadrao(), ajuizamento: '', corte: '', pagamentos: [],
  });

  const novaCompetencia = (extra) => ({ id: novoId(), mes_ano: '', vencimento: '', base: '', valor: '', correcao: K.correcaoPadrao(), ...(extra || {}) });

  function valorDevido(f, c) {
    if (f.fixacao.tipo === 'valor_fixo') return R.arredondar(R.lerValor(f.fixacao.valorFixo));
    if (f.fixacao.tipo === 'percentual') return R.arredondar(R.lerValor(f.fixacao.percentual) / 100 * R.lerValor(c.base));
    if (f.fixacao.tipo === 'manual') return R.arredondar(R.lerValor(c.valor));
    return NaN;
  }

  function competenciasEmOrdem(lista) {
    return lista.slice().sort((a, b) => (a.mes_ano.slice(3) + a.mes_ano.slice(0, 2)).localeCompare(b.mes_ano.slice(3) + b.mes_ano.slice(0, 2)));
  }

  function LinhaCompetencia({ c, indice, f, onChange, onRemover, erros }) {
    const [corrigir, definirCorrigir] = useState(c.correcao.modo !== 'nenhuma');
    const erro = (campo) => (erros.find((e) => e.linha === indice && e.campo === campo) || {}).mensagem;
    const devido = valorDevido(f, c);
    const prescrita = f.corte && R.dataEhValida(f.corte) && R.dataEhValida(c.vencimento) && R.lerData(c.vencimento).ts < R.lerData(f.corte).ts;
    const rotuloCorr = { percentual: `Correção: ${c.correcao.percentual || '—'}%`, valorCorrigido: 'Valor corrigido informado', nenhuma: 'Sem correção' }[c.correcao.modo];
    return (
      <div className={`p-3 sm:p-4 ${prescrita ? 'opacity-60' : ''}`}>
        <div className="grid grid-cols-1 sm:grid-cols-[7rem_9rem_1fr_auto] gap-3 items-end">
          <CampoCompetencia rotulo="Competência" valor={c.mes_ano} onChange={(v) => onChange({ mes_ano: v })} erro={erro('competencia')} />
          <CampoData rotulo="Vencimento" obrigatorio valor={c.vencimento} onChange={(v) => onChange({ vencimento: v })} erro={erro('vencimento')} />
          {f.fixacao.tipo === 'percentual' && <CampoMoeda rotulo={`${f.fixacao.baseDescricao || 'Base'} do mês`} valor={c.base} onChange={(v) => onChange({ base: v })} erro={erro('base')} />}
          {f.fixacao.tipo === 'manual' && <CampoMoeda rotulo="Valor devido" valor={c.valor} onChange={(v) => onChange({ valor: v })} erro={erro('valor')} />}
          {f.fixacao.tipo === 'valor_fixo' && <div className="text-sm font-semibold text-slate-600 dark:text-slate-300 pb-3">Valor devido: {Number.isNaN(devido) ? '—' : R.formatarMoeda(devido)}</div>}
          <div className="flex gap-1">
            <Botao tamanho="sm" variante="fantasma" aria-expanded={corrigir} onClick={() => definirCorrigir(!corrigir)}>{rotuloCorr}</Botao>
            <Botao variante="perigo" tamanho="sm" icone="lixeira" aria-label={`Remover competência ${indice + 1}`} onClick={onRemover} />
          </div>
        </div>
        {f.fixacao.tipo === 'percentual' && !Number.isNaN(devido) && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Valor devido: {R.formatarMoeda(devido)}</p>}
        {prescrita && <p className="mt-1 text-xs font-semibold text-amber-700 dark:text-amber-400">Anterior à data de corte da prescrição: não entra no cálculo.</p>}
        {corrigir && (
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/50 section-open">
            <B.CorrecaoManual compacto valor={c.correcao} onChange={(x) => onChange({ correcao: x })} valorOriginal={Number.isNaN(devido) ? '' : String(devido)} erro={erro('correcao')} titulo="Correção monetária desta competência" />
          </div>
        )}
      </div>
    );
  }

  function ModuloPensao() {
    const [f, definirF, limpar] = UI.useRascunho('pensao2', inicial);
    const [errosForm, definirErros] = useState([]);
    const [resultado, definirResultado] = useState(null);
    const topo = useRef(null);

    const alterar = (parte) => { definirF({ ...f, ...parte }); definirResultado(null); };
    const alterarFixacao = (parte) => alterar({ fixacao: { ...f.fixacao, ...parte } });
    const alterarComp = (id, parte) => alterar({ competencias: f.competencias.map((x) => (x.id === id ? { ...x, ...parte } : x)) });
    const erroCampo = (campo) => (errosForm.find((x) => x.campo === campo) || {}).mensagem;

    function gerarCompetencias() {
      const g = f.gerador;
      const dia = Number.parseInt(g.dia, 10);
      const ini = R.competenciaParaData(g.de);
      const fim = R.competenciaParaData(g.ate);
      if (!(dia >= 1 && dia <= 31)) { UI.avisar('Informe o dia de vencimento de cada mês (1 a 31).', 'erro'); return; }
      if (!ini || !fim || R.lerData(fim).ts < R.lerData(ini).ts) { UI.avisar('Informe o período no formato MM/AAAA, do mês inicial ao final.', 'erro'); return; }
      const lista = [];
      for (let i = 0; i < 600; i += 1) {
        const d = R.adicionarMeses(ini, i);
        if (R.lerData(d).ts > R.lerData(fim).ts) break;
        const comp = d.slice(3);
        // Se o dia não existe no mês (ex.: 31 em fevereiro), usa o último dia do mês.
        const ultimo = new Date(Date.UTC(Number(comp.slice(3)), Number(comp.slice(0, 2)), 0)).getUTCDate();
        lista.push(novaCompetencia({ mes_ano: comp, vencimento: `${String(Math.min(dia, ultimo)).padStart(2, '0')}/${comp}` }));
      }
      const existentes = new Set(f.competencias.map((c) => c.mes_ano));
      const novas = lista.filter((c) => !existentes.has(c.mes_ano));
      if (f.competencias.length + novas.length > R.LIMITE_PARCELAS) { UI.avisar(`O limite é de ${R.LIMITE_PARCELAS} competências por cálculo.`, 'erro'); return; }
      alterar({ competencias: competenciasEmOrdem([...f.competencias, ...novas]) });
      UI.avisar(`${novas.length} competência(s) adicionada(s).`);
    }

    function validar() {
      const erros = [];
      const e = (campo, mensagem, linha) => erros.push({ campo, mensagem, linha });
      if (!f.fixacao.tipo) e('tipo', 'Selecione como a pensão foi fixada.');
      if (f.fixacao.tipo === 'valor_fixo' && !(R.lerValor(f.fixacao.valorFixo) > 0)) e('valorFixo', 'Informe o valor fixo mensal.');
      if (f.fixacao.tipo === 'percentual' && !(R.lerValor(f.fixacao.percentual) > 0 && R.lerValor(f.fixacao.percentual) <= 100)) e('percentual', 'Informe o percentual da pensão (entre 0 e 100).');
      if (f.corte && !R.dataEhValida(f.corte)) e('corte', 'Data de corte da prescrição inválida (DD/MM/AAAA).');
      if (f.ajuizamento && !R.dataEhValida(f.ajuizamento)) e('ajuizamento', 'Data de ajuizamento inválida (DD/MM/AAAA).');
      if (!f.competencias.length) e('competencias', 'Inclua ao menos uma competência (mês devido).');
      f.competencias.forEach((c, i) => {
        if (!/^(0[1-9]|1[0-2])\/\d{4}$/.test(c.mes_ano)) e('competencia', `Competência ${i + 1}: use MM/AAAA.`, i);
        if (f.fixacao.tipo === 'percentual' && !(R.lerValor(c.base) > 0)) e('base', `Competência ${i + 1}: informe a base do percentual.`, i);
        if (f.fixacao.tipo === 'manual' && !(R.lerValor(c.valor) > 0)) e('valor', `Competência ${i + 1}: informe o valor devido.`, i);
      });
      f.pagamentos.forEach((p, i) => {
        if (!p.destino || !f.competencias.some((c) => c.id === p.destino)) e('pagamento', `Pagamento ${i + 1}: escolha a competência que ele abate.`);
      });
      if (erros.length) return erros;
      const { parcelas } = montarParcelas();
      return erros.concat(K.validarCalculo(f.criterios, parcelas.map((x) => x.parcela), 'Competência').map((x) => {
        const origem = x.linha !== undefined ? parcelas[x.linha] : null;
        return origem ? { ...x, linha: origem.indiceOriginal } : x;
      }));
    }

    // Competências anteriores à data de corte (informada pelo usuário) ficam fora do cálculo.
    function montarParcelas() {
      const corte = R.dataEhValida(f.corte) ? R.lerData(f.corte).ts : null;
      const parcelas = [];
      const prescritas = [];
      f.competencias.forEach((c, i) => {
        const venc = R.lerData(c.vencimento);
        if (corte !== null && venc && venc.ts < corte) { prescritas.push(c); return; }
        parcelas.push({
          indiceOriginal: i, id: c.id,
          parcela: {
            descricao: `Competência ${c.mes_ano}`, competencia: c.mes_ano, vencimento: c.vencimento, valor: String(valorDevido(f, c)), correcao: c.correcao,
            pagamentos: f.pagamentos.filter((p) => p.destino === c.id).map((p) => ({ data: p.data, valor: p.valor })),
          },
        });
      });
      return { parcelas, prescritas };
    }

    function calcular() {
      const erros = validar();
      definirErros(erros);
      if (erros.length) { UI.avisar('Corrija os campos destacados antes de calcular.', 'erro'); return; }
      const { parcelas, prescritas } = montarParcelas();
      if (!parcelas.length) { definirErros([{ campo: 'competencias', mensagem: 'Todas as competências são anteriores à data de corte da prescrição; não há o que calcular.' }]); return; }
      const lista = parcelas.map((x) => x.parcela);
      const resultados = lista.map((x) => K.calcularParcela(x, f.criterios));
      const totais = K.consolidar(resultados, { honorariosFixos: K.honorariosFixos(f.criterios) });
      const ritos = K.particionarRitos(resultados.map((r, i) => ({ indice: i, vencimento: lista[i].vencimento, saldo: r.saldo })), f.ajuizamento, f.criterios.dataFinal);
      definirResultado({ lista, resultados, totais, ritos, prescritas, criteriosDescritos: criteriosDescritos() });
      setTimeout(() => topo.current && topo.current.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    }

    function criteriosDescritos() {
      const t = TIPOS_FIXACAO.find((x) => x.valor === f.fixacao.tipo);
      const lista = [['Fixação da pensão', t ? t.rotulo : f.fixacao.tipo]];
      if (f.fixacao.tipo === 'valor_fixo') lista.push(['Valor fixo mensal', R.formatarMoeda(R.lerValor(f.fixacao.valorFixo))]);
      if (f.fixacao.tipo === 'percentual') lista.push(['Percentual fixado', `${R.formatarPercentual(R.lerValor(f.fixacao.percentual))} sobre: ${f.fixacao.baseDescricao || 'base informada em cada mês'}`]);
      lista.push(['Prescrição', f.corte ? `Competências com vencimento anterior a ${f.corte} (data de corte informada pelo usuário) foram excluídas` : 'Nenhuma competência excluída por prescrição']);
      lista.push(['Ajuizamento da execução', f.ajuizamento || 'Não informado']);
      return lista.concat(B.descreverCriterios(f.criterios));
    }

    function entrada() {
      const x = resultado;
      const m = R.formatarMoeda;
      const notas = [['Subtotal — rito da prisão (art. 528, §§ 3º e 7º, CPC)', m(x.ritos.prisao.total)], ['Subtotal — rito da expropriação (art. 528, § 8º, CPC)', m(x.ritos.expropriacao.total)]];
      const obs = [f.observacoes, x.ritos.nota, x.prescritas.length ? `Competências excluídas por prescrição (data de corte ${f.corte}): ${x.prescritas.map((c) => c.mes_ano).join(', ')}.` : ''].filter(Boolean).join('\n');
      return {
        tipo: 'pensao',
        titulo: 'Memória de cálculo — Pensão alimentícia',
        subtitulo: f.descricao || 'Débito de pensão alimentícia',
        identificacao: [['Descrição', f.descricao], ['Alimentante', f.alimentante], ['Alimentando', f.alimentando], ['Competências calculadas', String(x.lista.length)]],
        criterios: x.criteriosDescritos,
        parcelas: x.lista.map((p) => ({ descricao: `Competência ${p.competencia}`, vencimento: p.vencimento })),
        resultados: x.resultados, totais: x.totais, dataFinal: f.criterios.dataFinal, observacoes: obs, notasResumo: notas,
        linhasExtras: [['Subtotal — rito da prisão (art. 528, §§ 3º e 7º, CPC)', x.ritos.prisao.total], ['Subtotal — rito da expropriação (art. 528, § 8º, CPC)', x.ritos.expropriacao.total]],
      };
    }

    function gerarMemoria() {
      B.guardarMemoria(window.CentralRegistro.montarCalculo(entrada()), true);
    }

    function gerarPlanilha() {
      B.gerarPlanilhaCalculo(entrada(), f.descricao || 'pensao');
    }

    function gerarPdf() {
      B.gerarPdfCalculo(entrada(), f.descricao || 'pensao');
    }

    const x = resultado;
    const m = R.formatarMoeda;
    return (
      <Pagina titulo="Pensão alimentícia" descricao="Calcule o débito de parcelas vencidas de pensão, competência por competência, com a correção monetária que você informar.">
        <Cartao titulo="1. Identificação" descricao="Nomes e descrições ficam apenas neste navegador e aparecem no demonstrativo.">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <CampoTexto rotulo="Descrição" valor={f.descricao} onChange={(v) => alterar({ descricao: v })} className="sm:col-span-2" placeholder="Ex.: Execução de alimentos — processo nº" />
            <CampoTexto rotulo="Alimentante (devedor)" valor={f.alimentante} onChange={(v) => alterar({ alimentante: v })} />
            <CampoTexto rotulo="Alimentando (credor)" valor={f.alimentando} onChange={(v) => alterar({ alimentando: v })} />
          </div>
        </Cartao>

        <Cartao titulo="2. Fixação da pensão">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Selecao rotulo="Como foi fixada" obrigatorio valor={f.fixacao.tipo} onChange={(v) => alterarFixacao({ tipo: v })} opcoes={TIPOS_FIXACAO} placeholder="Selecione" erro={erroCampo('tipo')} className="sm:col-span-2" />
            {f.fixacao.tipo === 'valor_fixo' && <CampoMoeda rotulo="Valor fixo mensal" obrigatorio valor={f.fixacao.valorFixo} onChange={(v) => alterarFixacao({ valorFixo: v })} erro={erroCampo('valorFixo')} />}
            {f.fixacao.tipo === 'percentual' && (
              <>
                <CampoPercentual rotulo="Percentual fixado" obrigatorio valor={f.fixacao.percentual} onChange={(v) => alterarFixacao({ percentual: v })} erro={erroCampo('percentual')} />
                <CampoTexto rotulo="Base do percentual" valor={f.fixacao.baseDescricao} onChange={(v) => alterarFixacao({ baseDescricao: v })} maxLength={60} ajuda="Ex.: Salário mínimo, rendimento líquido. Você informará o valor da base em cada mês." />
              </>
            )}
          </div>
        </Cartao>

        <Cartao titulo="3. Competências devidas" descricao="Informe os meses devidos e o dia de vencimento. Cada mês é calculado individualmente, com sua própria correção monetária.">
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_8rem_auto] gap-3 items-end">
              <CampoCompetencia rotulo="Do mês" valor={f.gerador.de} onChange={(v) => alterar({ gerador: { ...f.gerador, de: v } })} />
              <CampoCompetencia rotulo="Até o mês" valor={f.gerador.ate} onChange={(v) => alterar({ gerador: { ...f.gerador, ate: v } })} />
              <CampoTexto rotulo="Dia do vencimento" valor={f.gerador.dia} onChange={(v) => alterar({ gerador: { ...f.gerador, dia: v.replace(/\D/g, '').slice(0, 2) } })} inputMode="numeric" maxLength={2} />
              <Botao variante="primario" icone="mais" className="!h-11" onClick={gerarCompetencias}>Gerar meses</Botao>
            </div>
            {f.competencias.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">Nenhuma competência incluída.</p>}
            {f.competencias.length > 0 && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 divide-y divide-slate-100 dark:divide-slate-700/50 max-h-[32rem] overflow-y-auto">
                {f.competencias.map((c, i) => (
                  <LinhaCompetencia key={c.id} c={c} indice={i} f={f} erros={errosForm} onChange={(parte) => alterarComp(c.id, parte)} onRemover={() => alterar({ competencias: f.competencias.filter((y) => y.id !== c.id), pagamentos: f.pagamentos.filter((p) => p.destino !== c.id) })} />
                ))}
              </div>
            )}
            {erroCampo('competencias') && <p role="alert" className="text-xs font-medium text-red-600">{erroCampo('competencias')}</p>}
            <Botao tamanho="sm" icone="mais" onClick={() => alterar({ competencias: [...f.competencias, novaCompetencia()] })}>Adicionar competência avulsa</Botao>
          </div>
        </Cartao>

        <Cartao titulo="4. Pagamentos realizados" descricao="Cada pagamento abate a competência que você indicar. Nenhuma imputação automática é feita entre competências.">
          <div className="space-y-3">
            {f.pagamentos.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">Nenhum pagamento informado.</p>}
            {f.pagamentos.map((p, i) => (
              <div key={p.id} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1.4fr_auto] gap-3 items-end p-3 rounded-xl border border-slate-200 dark:border-slate-700/60 section-open">
                <CampoData rotulo={`Data do pagamento ${i + 1}`} valor={p.data} onChange={(v) => alterar({ pagamentos: f.pagamentos.map((y) => (y.id === p.id ? { ...y, data: v } : y)) })} />
                <CampoMoeda rotulo="Valor pago" valor={p.valor} onChange={(v) => alterar({ pagamentos: f.pagamentos.map((y) => (y.id === p.id ? { ...y, valor: v } : y)) })} />
                <Selecao rotulo="Competência abatida" valor={p.destino} placeholder="Selecione" onChange={(v) => alterar({ pagamentos: f.pagamentos.map((y) => (y.id === p.id ? { ...y, destino: v } : y)) })}
                  opcoes={f.competencias.map((c) => ({ valor: c.id, rotulo: c.mes_ano || '(sem competência)' }))} />
                <Botao variante="perigo" tamanho="sm" icone="lixeira" className="!h-11" aria-label={`Remover pagamento ${i + 1}`} onClick={() => alterar({ pagamentos: f.pagamentos.filter((y) => y.id !== p.id) })}>Remover</Botao>
              </div>
            ))}
            {erroCampo('pagamento') && <p role="alert" className="text-xs font-medium text-red-600">{erroCampo('pagamento')}</p>}
            <Botao tamanho="sm" icone="mais" onClick={() => alterar({ pagamentos: [...f.pagamentos, { id: novoId(), data: '', valor: '', destino: '' }] })}>Adicionar pagamento</Botao>
          </div>
        </Cartao>

        <Cartao titulo="5. Critérios de cálculo" descricao="Juros, multa e abatimento seguem o que você escolher. Nada é aplicado automaticamente.">
          <div className="space-y-5">
            <B.CriteriosCalculo valor={f.criterios} onChange={(c) => alterar({ criterios: c })} erros={errosForm} rotuloData="Atualizar até (data-base)" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <CampoData rotulo="Ajuizamento da execução" valor={f.ajuizamento} onChange={(v) => alterar({ ajuizamento: v })} erro={erroCampo('ajuizamento')} ajuda="Opcional. Define o corte entre o rito da prisão e o da expropriação (art. 528 do CPC)." />
              <CampoData rotulo="Data de corte da prescrição" valor={f.corte} onChange={(v) => alterar({ corte: v })} erro={erroCampo('corte')} ajuda="Opcional. Competências com vencimento anterior a esta data ficam fora do cálculo. Para filho menor sob poder familiar, a prescrição não corre: deixe em branco." />
            </div>
          </div>
        </Cartao>

        <Cartao titulo="6. Observações">
          <label htmlFor="obs-pensao" className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Observações (aparecem no demonstrativo)</label>
          <textarea id="obs-pensao" rows={3} maxLength={1000} value={f.observacoes} onChange={(e) => alterar({ observacoes: e.target.value })}
            className="block w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white" />
        </Cartao>

        {errosForm.length > 0 && (
          <Alerta tipo="erro" titulo="Revise os dados informados">
            <ul className="list-disc pl-5 space-y-0.5">{errosForm.slice(0, 8).map((e, i) => <li key={i}>{e.mensagem}</li>)}{errosForm.length > 8 && <li>… e mais {errosForm.length - 8} ajustes.</li>}</ul>
          </Alerta>
        )}

        <div className="sticky bottom-3 z-20 flex flex-wrap gap-2 p-3 rounded-2xl bg-white/95 dark:bg-[#14243A]/95 border border-slate-200 dark:border-slate-700/60 shadow-card backdrop-blur">
          <Botao variante="verde" icone="atualizar" onClick={calcular} className="flex-1 sm:flex-none sm:min-w-[240px]">Calcular pensão</Botao>
          <Botao onClick={() => { limpar(); definirResultado(null); definirErros([]); }}>Limpar tudo</Botao>
        </div>

        <div ref={topo} />
        {x && (
          <Cartao titulo="Resultado do cálculo" descricao={`Calculado até ${f.criterios.dataFinal} com a correção monetária informada em cada competência.`} className="section-open">
            <div className="space-y-5">
              <B.ResumoConsolidado totais={x.totais} mostrarHonorarios={f.criterios.honorarios.ativo} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Indicador rotulo="Rito da prisão (art. 528, §§ 3º e 7º, CPC)" valor={m(x.ritos.prisao.total)} detalhe={`${x.ritos.prisao.indices.length} competência(s)`} />
                <Indicador rotulo="Rito da expropriação (art. 528, § 8º, CPC)" valor={m(x.ritos.expropriacao.total)} detalhe={`${x.ritos.expropriacao.indices.length} competência(s)`} />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">{x.ritos.nota}</p>
              {x.prescritas.length > 0 && <Alerta tipo="aviso">Competências fora do cálculo por serem anteriores à data de corte da prescrição ({f.corte}): {x.prescritas.map((c) => c.mes_ano).join(', ')}.</Alerta>}
              <Tabela legenda="Resultado por competência" colunas={['Competência', 'Vencimento', 'Valor devido', 'Correção informada', 'Principal corrigido', 'Juros', 'Multa', 'Pagamentos', 'Saldo']} numericas={[2, 3, 4, 5, 6, 7, 8]}
                linhas={x.resultados.map((r, i) => [x.lista[i].competencia, x.lista[i].vencimento, m(r.original), B.textoCorrecao(r.correcao), m(r.principalCorrigido), m(r.juros), m(r.multa), r.pagamentos ? `-${m(r.pagamentos)}` : '—', m(r.saldo)])}
                rodape={['Total', '', m(x.totais.original), m(x.totais.correcao), m(x.totais.principalCorrigido), m(x.totais.juros), m(x.totais.multa), x.totais.pagamentos ? `-${m(x.totais.pagamentos)}` : '—', m(x.totais.saldo)]} />
              <details className="rounded-xl border border-slate-200 dark:border-slate-700/60 p-4 group">
                <summary className="cursor-pointer text-sm font-semibold text-slate-700 dark:text-slate-200 list-none flex items-center justify-between">
                  Memória de cálculo por competência <UI.Icone nome="chevron" className="w-4 h-4 transition-transform group-open:rotate-180" />
                </summary>
                <div className="mt-3 space-y-4">
                  {x.resultados.map((r, i) => (
                    <div key={i}>
                      <div className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Competência {x.lista[i].competencia} — vencimento {x.lista[i].vencimento}</div>
                      <ol className="list-decimal pl-5 space-y-1 text-sm text-slate-700 dark:text-slate-200">{r.memoria.map((l, k) => <li key={k}>{l}</li>)}</ol>
                    </div>
                  ))}
                </div>
              </details>
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

  window.CentralModulos = Object.assign(window.CentralModulos || {}, { ModuloPensao });
})();
