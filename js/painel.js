/*
 * Módulo: Painel inicial — resumo da plataforma, atalhos e últimos cálculos.
 */
(() => {
  const UI = window.CentralUI;
  const M = window.CentralModulos;
  const { Pagina, Cartao, Botao, Icone, Indicador } = UI;

  const ATALHOS = [
    { modulo: 'leiloes', icone: 'leilao', titulo: 'Calculadora de leilões', texto: 'Custo total de arrematação, lucro e ROI para imóveis, terrenos e veículos.' },
    { modulo: 'debitos', icone: 'debito', titulo: 'Atualização de débitos', texto: 'Correção monetária, juros, multa e pagamentos parciais de uma dívida.' },
    { modulo: 'pensao', icone: 'pensao', titulo: 'Pensão alimentícia', texto: 'Débito de parcelas vencidas, competência por competência.' },
    { modulo: 'aluguel', icone: 'contrato', titulo: 'Aluguéis e contratos', texto: 'Aluguéis atrasados e obrigações contratuais com várias parcelas.' },
    { modulo: 'acordo', icone: 'acordo', titulo: 'Acordos e parcelas vencidas', texto: 'Acordos extrajudiciais, parcelamentos e obrigações em geral.' },
    { modulo: 'planilha', icone: 'planilha', titulo: 'Planilha consolidada', texto: 'Várias obrigações numa tela, com total consolidado e CSV.' },
  ];

  function ModuloPainel() {
    const historico = M.useHistorico();
    const ultimo = historico[0];
    return (
      <Pagina titulo="Central de Cálculos de Leilões e Imóveis" descricao="Cálculos financeiros e jurídicos em um só lugar: arrematação de bens, atualização de débitos, pensão alimentícia e contratos.">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Indicador rotulo="Memórias de cálculo" valor={String(historico.length)} detalhe="Guardadas neste navegador" />
          <Indicador rotulo="Último cálculo" valor={ultimo ? (ultimo.total ? ultimo.total.valor : '—') : '—'} detalhe={ultimo ? `${M.NOMES_TIPOS[ultimo.tipo] || ultimo.tipo} · ${M.dataCurta(ultimo.criadoEm)}` : 'Nenhum ainda'} />
          <Indicador rotulo="Correção monetária" valor="Informada por você" detalhe="Percentual acumulado ou valor já corrigido, sem índices automáticos" />
        </div>

        <Cartao titulo="Iniciar um cálculo">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {ATALHOS.map((a) => (
              <button key={a.modulo} type="button" onClick={() => UI.navegar(a.modulo)}
                className="text-left p-4 rounded-xl border border-slate-200 dark:border-slate-700/60 hover:border-emerald-500 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20 group">
                <span className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100"><Icone nome={a.icone} className="w-5 h-5 text-navy-500 dark:text-emerald-400" />{a.titulo}</span>
                <span className="block mt-1.5 text-xs text-slate-500 dark:text-slate-400">{a.texto}</span>
                <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">Iniciar <Icone nome="seta" className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" /></span>
              </button>
            ))}
          </div>
        </Cartao>

        <Cartao titulo="Últimos cálculos" acoes={historico.length > 0 ? <Botao tamanho="sm" onClick={() => UI.navegar('memorias')}>Ver todos</Botao> : null}>
          {historico.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Seus demonstrativos aparecerão aqui depois que você gerar a primeira memória de cálculo. Eles ficam apenas neste navegador.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {historico.slice(0, 5).map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => UI.navegar('memorias', { id: r.id })} className="w-full flex items-center justify-between gap-3 py-3 text-left hover:bg-slate-50 dark:hover:bg-white/5 px-2 rounded-lg">
                    <span className="min-w-0"><span className="block text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{r.subtitulo || r.titulo}</span><span className="block text-xs text-slate-500 dark:text-slate-400">{M.NOMES_TIPOS[r.tipo] || r.tipo} · {M.dataCurta(r.criadoEm)}</span></span>
                    {r.total && <span className="text-sm font-bold tabular-nums text-emerald-700 dark:text-emerald-400 whitespace-nowrap">{r.total.valor}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      </Pagina>
    );
  }

  window.CentralModulos = Object.assign(window.CentralModulos || {}, { ModuloPainel });
})();
