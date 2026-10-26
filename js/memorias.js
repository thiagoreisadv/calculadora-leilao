/*
 * Módulo: Memórias de Cálculo.
 * Consulta os demonstrativos gerados pelos módulos, com visualização, impressão (ou PDF pelo
 * navegador), exportação em HTML/CSV e cópia de segurança do histórico.
 * O histórico fica SOMENTE neste navegador.
 */
(() => {
  const { useState, useEffect, useRef } = React;
  const UI = window.CentralUI;
  const B = window.CentralBlocos;
  const R = window.CentralRegras;
  const H = window.CentralHistorico;
  const { Pagina, Cartao, Botao, Alerta, Selecao, Confirmacao, Icone } = UI;

  const NOMES = { debito: 'Atualização de débito', contrato: 'Aluguéis e contratos', acordo: 'Acordos e parcelas', pensao: 'Pensão alimentícia', planilha: 'Planilha consolidada' };
  const ICONES = { debito: 'debito', contrato: 'contrato', acordo: 'acordo', pensao: 'pensao', planilha: 'planilha' };

  function useHistorico() {
    const [lista, definir] = useState(() => H.listar());
    useEffect(() => {
      const f = () => definir(H.listar());
      window.addEventListener('central-historico', f);
      return () => window.removeEventListener('central-historico', f);
    }, []);
    return lista;
  }

  function dataCurta(iso) {
    try { return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); } catch (e) { return ''; }
  }

  function ModuloMemorias({ abrirId }) {
    const lista = useHistorico();
    const [filtro, definirFiltro] = useState('');
    const [selecionado, definirSelecionado] = useState(abrirId || null);
    const [visualizando, definirVisualizando] = useState(false);
    const [excluir, definirExcluir] = useState(null);
    const [limparTudo, definirLimparTudo] = useState(false);
    const [mensagem, definirMensagem] = useState(null);
    const entrada = useRef(null);

    useEffect(() => { if (abrirId) { definirSelecionado(abrirId); definirVisualizando(true); } }, [abrirId]);

    const visiveis = lista.filter((r) => !filtro || r.tipo === filtro);
    const atual = lista.find((r) => r.id === selecionado) || null;
    const html = atual ? window.CentralDemonstrativo.gerarHtml(atual) : '';

    function baixarCsv() {
      const s = atual.secoes && atual.secoes[0];
      if (!s) return;
      const csv = R.gerarCSV(s.colunas, s.linhas.concat(s.rodape ? [s.rodape] : []));
      UI.baixarArquivo(UI.nomeArquivo(atual.subtitulo || atual.titulo, 'csv'), csv, 'text/csv;charset=utf-8');
    }

    function exportarCopia() {
      UI.baixarArquivo(`central-calculos-copia-${new Date().toISOString().slice(0, 10)}.json`, H.exportarJSON(), 'application/json');
    }

    function importarCopia(e) {
      const arquivo = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!arquivo) return;
      if (arquivo.size > 20 * 1024 * 1024) { definirMensagem({ tipo: 'erro', texto: 'O arquivo é grande demais para ser uma cópia do histórico.' }); return; }
      const leitor = new FileReader();
      leitor.onload = () => {
        const r = H.importarJSON(String(leitor.result));
        definirMensagem(r.ok ? { tipo: 'sucesso', texto: `${r.importados} registro(s) importado(s); ${r.ignorados} já existiam ou eram inválidos.` } : { tipo: 'erro', texto: r.erro });
      };
      leitor.onerror = () => definirMensagem({ tipo: 'erro', texto: 'Não foi possível ler o arquivo.' });
      leitor.readAsText(arquivo);
    }

    return (
      <Pagina titulo="Memórias de cálculo" descricao="Consulte, imprima e exporte os demonstrativos dos seus cálculos, com os critérios utilizados.">
        <Alerta tipo="info" titulo="Guardado somente neste navegador">
          O histórico não é sincronizado, não vai para nenhum servidor e some se os dados do navegador forem apagados. Faça uma cópia de segurança para guardar seus demonstrativos com segurança.
          <div className="mt-3 flex flex-wrap gap-2">
            <Botao tamanho="sm" icone="baixar" onClick={exportarCopia} disabled={!lista.length}>Exportar cópia (JSON)</Botao>
            <Botao tamanho="sm" icone="mais" onClick={() => entrada.current && entrada.current.click()}>Importar cópia</Botao>
            <input ref={entrada} type="file" accept="application/json,.json" className="hidden" onChange={importarCopia} aria-label="Importar cópia do histórico" />
            <Botao tamanho="sm" variante="perigo" icone="lixeira" onClick={() => definirLimparTudo(true)} disabled={!lista.length}>Apagar tudo</Botao>
          </div>
        </Alerta>
        {mensagem && <Alerta tipo={mensagem.tipo}>{mensagem.texto}</Alerta>}

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-5">
          <Cartao titulo={`Cálculos guardados (${lista.length})`} acoes={null}>
            <div className="space-y-3">
              <Selecao rotulo="Filtrar por tipo" valor={filtro} onChange={definirFiltro} placeholder="Todos os tipos"
                opcoes={Object.entries(NOMES).map(([valor, rotulo]) => ({ valor, rotulo }))} />
              {visiveis.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400 py-4">{lista.length ? 'Nenhum cálculo deste tipo.' : 'Você ainda não gerou nenhuma memória de cálculo. Faça um cálculo e use "Gerar memória de cálculo".'}</p>}
              <ul className="space-y-2 max-h-[34rem] overflow-y-auto">
                {visiveis.map((r) => (
                  <li key={r.id}>
                    <button type="button" aria-pressed={r.id === selecionado} onClick={() => definirSelecionado(r.id)}
                      className={`w-full text-left p-3 rounded-xl border flex gap-3 items-start ${r.id === selecionado ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/25' : 'border-slate-200 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-white/5'}`}>
                      <Icone nome={ICONES[r.tipo] || 'memoria'} className="w-5 h-5 mt-0.5 text-navy-500 dark:text-emerald-400 flex-shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{r.subtitulo || r.titulo}</span>
                        <span className="block text-xs text-slate-500 dark:text-slate-400">{NOMES[r.tipo] || r.tipo} · {dataCurta(r.criadoEm)}</span>
                        {r.total && <span className="block text-sm font-bold text-emerald-700 dark:text-emerald-400 tabular-nums mt-0.5">{r.total.valor}</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </Cartao>

          <Cartao titulo={atual ? (atual.subtitulo || atual.titulo) : 'Demonstrativo'} descricao={atual ? `${NOMES[atual.tipo] || atual.tipo} · gerado em ${dataCurta(atual.criadoEm)}` : undefined}>
            {!atual ? <p className="text-sm text-slate-500 dark:text-slate-400">Selecione um cálculo da lista para ver o demonstrativo.</p> : (
              <div className="space-y-5">
                <B.ListaAlertas alertas={atual.alertas} />
                {atual.total && (
                  <div className="rounded-xl bg-navy-900 dark:bg-emerald-700 text-white p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-white/70">{atual.total.rotulo}</div>
                    <div className="text-2xl sm:text-3xl font-extrabold tabular-nums">{atual.total.valor}</div>
                    <div className="text-xs text-white/80 mt-1">Referência: {atual.dataReferencia}</div>
                  </div>
                )}
                <dl className="grid grid-cols-1 sm:grid-cols-[170px_1fr] gap-x-4 gap-y-1.5 text-sm">
                  {[...(atual.identificacao || []), ...(atual.criterios || []).slice(0, 4)].filter((p) => p[1]).map(([k, v]) => (
                    <React.Fragment key={k}><dt className="text-slate-500 dark:text-slate-400">{k}</dt><dd className="font-medium text-slate-800 dark:text-slate-100 break-words">{v}</dd></React.Fragment>
                  ))}
                </dl>
                <div className="flex flex-wrap gap-2">
                  <Botao variante="primario" icone="imprimir" onClick={() => definirVisualizando(true)}>Visualizar e imprimir</Botao>
                  {atual.planilha && <Botao variante="verde" icone="baixar" onClick={() => B.gerarPlanilhaCalculo(atual.planilha, atual.subtitulo || atual.titulo)}>Baixar planilha de cálculo (Excel)</Botao>}
                  <Botao variante="verde" icone="baixar" onClick={() => B.gerarPdfRegistro(atual)}>Baixar planilha de cálculo (PDF)</Botao>
                  <Botao icone="baixar" onClick={() => UI.baixarArquivo(UI.nomeArquivo(atual.subtitulo || atual.titulo, 'html'), html, 'text/html;charset=utf-8')}>Baixar HTML</Botao>
                  {atual.secoes && atual.secoes[0] && <Botao icone="baixar" onClick={baixarCsv}>Baixar CSV</Botao>}
                  <Botao variante="perigo" icone="lixeira" onClick={() => definirExcluir(atual)}>Excluir</Botao>
                </div>
              </div>
            )}
          </Cartao>
        </div>

        {visualizando && atual && <B.VisualizadorDocumento html={html} titulo={atual.titulo} nomeBase={atual.subtitulo || atual.titulo} onFechar={() => definirVisualizando(false)} />}
        <Confirmacao aberto={Boolean(excluir)} titulo="Excluir esta memória de cálculo?" perigo rotuloConfirmar="Excluir"
          mensagem="O demonstrativo será removido deste navegador. Se não houver cópia de segurança, não será possível recuperá-lo."
          onCancelar={() => definirExcluir(null)}
          onConfirmar={() => { const r = H.excluir(excluir.id); definirExcluir(null); if (selecionado === excluir.id) definirSelecionado(null); UI.avisar(r.ok ? 'Memória excluída.' : r.erro, r.ok ? 'sucesso' : 'erro'); }} />
        <Confirmacao aberto={limparTudo} titulo="Apagar todo o histórico?" perigo rotuloConfirmar="Apagar tudo"
          mensagem={`Serão removidas ${lista.length} memória(s) deste navegador. Exporte uma cópia antes, se quiser guardá-las.`}
          onCancelar={() => definirLimparTudo(false)}
          onConfirmar={() => { H.limpar(); definirLimparTudo(false); definirSelecionado(null); UI.avisar('Histórico apagado.'); }} />
      </Pagina>
    );
  }

  window.CentralModulos = Object.assign(window.CentralModulos || {}, { ModuloMemorias, useHistorico, NOMES_TIPOS: NOMES, ICONES_TIPOS: ICONES, dataCurta });
})();
