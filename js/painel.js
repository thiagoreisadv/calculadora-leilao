/*
 * Módulo: Painel inicial — resumo da plataforma, atalhos e últimos cálculos.
 */
(() => {
  const UI = window.CentralUI;
  const M = window.CentralModulos;
  const { Pagina, Botao, Icone, Indicador } = UI;

  const ATALHOS = [
    { modulo: 'leiloes', icone: 'leilao', titulo: 'Calculadora de leilões', texto: 'Custo total, lucro e ROI para imóveis e veículos.' },
    { modulo: 'escritura', icone: 'escritura', titulo: 'Orçamento de escritura', texto: 'ITBI, escritura, Funrejus e registro do imóvel.' },
    { modulo: 'debitos', icone: 'debito', titulo: 'Atualização de débitos', texto: 'Juros, multa e pagamentos de uma dívida.' },
    { modulo: 'pensao', icone: 'pensao', titulo: 'Pensão alimentícia', texto: 'Parcelas vencidas, competência por competência.' },
    { modulo: 'aluguel', icone: 'contrato', titulo: 'Aluguéis e contratos', texto: 'Aluguéis atrasados e obrigações contratuais.' },
    { modulo: 'acordo', icone: 'acordo', titulo: 'Acordos e parcelas', texto: 'Parcelamentos e obrigações em geral.' },
    { modulo: 'planilha', icone: 'planilha', titulo: 'Planilha consolidada', texto: 'Várias obrigações, total consolidado e CSV.' },
  ];

  function ModuloPainel() {
    const historico = M.useHistorico();
    const ultimo = historico[0];
    return (
      <Pagina titulo="Central de Cálculos" descricao="Arrematação, débitos, pensão e contratos em um só lugar.">
        <div className="max-w-[1080px]">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Indicador rotulo="Memórias de cálculo" valor={String(historico.length)} detalhe="Guardadas neste navegador" />
            <Indicador rotulo="Último cálculo" valor={ultimo ? (ultimo.total ? ultimo.total.valor : '—') : '—'} detalhe={ultimo ? `${M.NOMES_TIPOS[ultimo.tipo] || ultimo.tipo} · ${M.dataCurta(ultimo.criadoEm)}` : 'Nenhum ainda'} />
            <Indicador rotulo="Correção monetária" valor="Informada por você" detalhe="Percentual acumulado ou valor já corrigido" />
          </div>

          <h2 className="text-base font-medium text-foreground mt-[30px] mb-2.5">Iniciar um cálculo</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 md:gap-x-10">
            {ATALHOS.map((a) => (
              <button key={a.modulo} type="button" onClick={() => UI.navegar(a.modulo)}
                className="flex items-center gap-3.5 px-2 py-3.5 border-b border-border text-left hover:bg-primary/10 transition-colors">
                <Icone nome={a.icone} className="w-[22px] h-[22px] text-primary" />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-foreground">{a.titulo}</span>
                  <span className="block text-[12.5px] text-muted-foreground mt-0.5">{a.texto}</span>
                </span>
                <Icone nome="seta" className="w-4 h-4 text-muted-foreground" />
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between mt-[30px] mb-2.5">
            <h2 className="text-base font-medium text-foreground">Últimos cálculos</h2>
            {historico.length > 0 && <Botao tamanho="sm" onClick={() => UI.navegar('memorias')}>Ver todos</Botao>}
          </div>
          {historico.length === 0 ? (
            <p className="text-[13px] text-muted-foreground max-w-[560px]">Seus demonstrativos aparecerão aqui depois que você gerar a primeira memória de cálculo. Eles ficam apenas neste navegador.</p>
          ) : (
            <div>
              {historico.slice(0, 5).map((r) => (
                <button key={r.id} type="button" onClick={() => UI.navegar('memorias', { id: r.id })}
                  className="w-full flex items-center justify-between gap-3 px-2 py-[11px] border-b border-border text-left text-[13.5px] hover:bg-primary/10 transition-colors">
                  <span className="min-w-0 truncate text-foreground">{r.subtitulo || r.titulo} <span className="text-muted-foreground">· {M.NOMES_TIPOS[r.tipo] || r.tipo} · {M.dataCurta(r.criadoEm)}</span></span>
                  {r.total && <span className="flex-none tabular-nums text-primary-text">{r.total.valor}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </Pagina>
    );
  }

  window.CentralModulos = Object.assign(window.CentralModulos || {}, { ModuloPainel });
})();
