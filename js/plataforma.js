/*
 * Estrutura da plataforma: menu lateral (desktop) / menu em gaveta (celular), navegação entre módulos,
 * modo escuro e avisos. A calculadora de leilões existente é montada, sem alterações de lógica,
 * como um dos módulos.
 */
(() => {
  const { useState, useEffect, useRef, useCallback } = React;
  const UI = window.CentralUI;
  const M = window.CentralModulos;
  const { Icone } = UI;

  const ITENS = [
    { id: 'painel', rotulo: 'Painel inicial', icone: 'painel' },
    { id: 'leiloes', rotulo: 'Calculadora de leilões', icone: 'leilao' },
    { grupo: 'Cálculos jurídicos' },
    { id: 'debitos', rotulo: 'Atualização de débitos', icone: 'debito' },
    { id: 'pensao', rotulo: 'Pensão alimentícia', icone: 'pensao' },
    { id: 'aluguel', rotulo: 'Aluguéis e contratos', icone: 'contrato' },
    { id: 'acordo', rotulo: 'Acordos e parcelas', icone: 'acordo' },
    { id: 'planilha', rotulo: 'Planilha consolidada', icone: 'planilha' },
    { grupo: 'Documentos' },
    { id: 'memorias', rotulo: 'Memórias de cálculo', icone: 'memoria' },
    { grupo: 'Sistema' },
    { id: 'conexao', rotulo: 'Conexão com a Debit', icone: 'conexao' },
  ];
  const VALIDOS = ITENS.filter((i) => i.id).map((i) => i.id);

  function moduloDoHash() {
    const m = /^#\/([a-z]+)/.exec(window.location.hash || '');
    return m && VALIDOS.includes(m[1]) ? m[1] : 'painel';
  }

  function lerEscuro() {
    try {
      const salvo = JSON.parse(localStorage.getItem('central_calc_imob_v14') || '{}');
      if (typeof salvo.darkMode === 'boolean') return salvo.darkMode;
    } catch (e) { /* ignora */ }
    return Boolean(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  function Menu({ atual, onEscolher, escuro, onAlternarTema }) {
    return (
      <nav aria-label="Navegação principal" className="flex-1 overflow-y-auto px-3 py-4">
        {ITENS.map((item, i) => item.grupo ? (
          <div key={item.grupo} className={`px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 ${i === 0 ? '' : 'mt-5'} mb-1.5`}>{item.grupo}</div>
        ) : (
          <button key={item.id} type="button" onClick={() => onEscolher(item.id)} aria-current={atual === item.id ? 'page' : undefined}
            className={`w-full flex items-center gap-3 px-3 h-10 rounded-lg text-sm font-semibold text-left mb-0.5 ${atual === item.id ? 'bg-white/12 text-white shadow-[inset_3px_0_0_#10B981]' : 'text-slate-300 hover:bg-white/8 hover:text-white'}`}>
            <Icone nome={item.icone} className="w-[18px] h-[18px] flex-shrink-0" /> <span className="truncate">{item.rotulo}</span>
          </button>
        ))}
        <div className="mt-6 pt-4 border-t border-white/10 px-1">
          <button type="button" onClick={onAlternarTema} className="w-full flex items-center gap-3 px-2 h-10 rounded-lg text-sm font-semibold text-slate-300 hover:bg-white/8 hover:text-white">
            <Icone nome={escuro ? 'sol' : 'lua'} className="w-[18px] h-[18px]" /> {escuro ? 'Tema claro' : 'Tema escuro'}
          </button>
        </div>
      </nav>
    );
  }

  function Logo({ className }) {
    return <img src="img/logo-thiago-reis-fundo-escuro.svg" alt="Thiago Reis, advogado" className={className} />;
  }

  function Plataforma({ AppLeiloes }) {
    const [modulo, definirModulo] = useState(moduloDoHash);
    const [parametros, definirParametros] = useState({});
    const [escuro, definirEscuro] = useState(lerEscuro);
    const [menuAberto, definirMenuAberto] = useState(false);
    const [avisos, definirAvisos] = useState([]);
    const principal = useRef(null);

    useEffect(() => {
      document.documentElement.classList.toggle('dark', escuro);
      try {
        const salvo = JSON.parse(localStorage.getItem('central_calc_imob_v14') || '{}');
        salvo.darkMode = escuro;
        localStorage.setItem('central_calc_imob_v14', JSON.stringify(salvo));
      } catch (e) { /* ignora */ }
    }, [escuro]);

    const ir = useCallback((id, extra) => {
      if (!VALIDOS.includes(id)) return;
      definirModulo(id); definirParametros(extra || {}); definirMenuAberto(false);
      if (window.location.hash !== `#/${id}`) window.history.pushState(null, '', `#/${id}`);
      window.scrollTo(0, 0);
      setTimeout(() => principal.current && principal.current.focus({ preventScroll: true }), 0);
    }, []);

    useEffect(() => {
      const navegar = (e) => ir(e.detail.modulo, { id: e.detail.id });
      const aviso = (e) => {
        const id = `${Date.now()}${Math.random()}`;
        definirAvisos((l) => [...l.slice(-3), { id, ...e.detail }]);
        setTimeout(() => definirAvisos((l) => l.filter((a) => a.id !== id)), 3800);
      };
      const hash = () => { definirModulo(moduloDoHash()); definirParametros({}); };
      window.addEventListener('central-navegar', navegar);
      window.addEventListener('central-aviso', aviso);
      window.addEventListener('popstate', hash);
      return () => { window.removeEventListener('central-navegar', navegar); window.removeEventListener('central-aviso', aviso); window.removeEventListener('popstate', hash); };
    }, [ir]);

    useEffect(() => {
      if (!menuAberto) return undefined;
      const tecla = (e) => { if (e.key === 'Escape') definirMenuAberto(false); };
      window.addEventListener('keydown', tecla);
      return () => window.removeEventListener('keydown', tecla);
    }, [menuAberto]);

    const alternarTema = () => definirEscuro(!escuro);
    const tituloAtual = (ITENS.find((i) => i.id === modulo) || {}).rotulo;

    let conteudo = null;
    if (modulo === 'painel') conteudo = <M.ModuloPainel />;
    else if (modulo === 'leiloes') conteudo = <AppLeiloes dark={escuro} setDark={definirEscuro} />;
    else if (modulo === 'debitos') conteudo = <M.ModuloDebitos />;
    else if (modulo === 'pensao') conteudo = <M.ModuloPensao />;
    else if (modulo === 'aluguel') conteudo = <M.ModuloParcelas preset="aluguel" />;
    else if (modulo === 'acordo') conteudo = <M.ModuloParcelas preset="acordo" />;
    else if (modulo === 'planilha') conteudo = <M.ModuloPlanilha />;
    else if (modulo === 'memorias') conteudo = <M.ModuloMemorias abrirId={parametros.id} />;
    else if (modulo === 'conexao') conteudo = <M.ModuloConexao />;

    return (
      <div className="min-h-screen">
        <a href="#conteudo" onClick={(e) => { e.preventDefault(); principal.current && principal.current.focus(); }} className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[80] focus:px-3 focus:py-2 focus:rounded-lg focus:bg-white focus:text-navy-900 print-hide">Pular para o conteúdo</a>

        {/* Menu lateral (computadores e notebooks) */}
        <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 flex-col bg-navy-900 dark:bg-[#0B1424] z-40 print-hide">
          <div className="px-5 h-[72px] flex items-center border-b border-white/10"><Logo className="h-8 w-auto" /></div>
          <Menu atual={modulo} onEscolher={ir} escuro={escuro} onAlternarTema={alternarTema} />
        </aside>

        {/* Barra superior e gaveta (tablets e celulares) */}
        <header className="lg:hidden sticky top-0 z-40 bg-navy-900 dark:bg-[#0B1424] text-white px-4 h-14 flex items-center justify-between print-hide">
          <Logo className="h-6 w-auto" />
          <div className="flex items-center gap-1 min-w-0">
            <span className="hidden sm:inline text-sm font-semibold truncate max-w-[40vw] text-slate-200 mr-1">{tituloAtual}</span>
            <button type="button" onClick={() => definirMenuAberto(true)} aria-label="Abrir menu" aria-expanded={menuAberto} className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-white/10"><Icone nome="menu" /></button>
          </div>
        </header>
        {menuAberto && (
          <div className="lg:hidden fixed inset-0 z-[65] print-hide" role="presentation">
            <div className="absolute inset-0 bg-slate-900/60" onClick={() => definirMenuAberto(false)} />
            <div role="dialog" aria-modal="true" aria-label="Menu" className="section-open absolute inset-y-0 right-0 w-72 max-w-[85vw] flex flex-col bg-navy-900 dark:bg-[#0B1424] text-white">
              <div className="px-5 h-14 flex items-center justify-between border-b border-white/10">
                <Logo className="h-6 w-auto" />
                <button type="button" onClick={() => definirMenuAberto(false)} aria-label="Fechar menu" className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-white/10"><Icone nome="x" /></button>
              </div>
              <Menu atual={modulo} onEscolher={ir} escuro={escuro} onAlternarTema={alternarTema} />
            </div>
          </div>
        )}

        <main id="conteudo" ref={principal} tabIndex={-1} className="lg:pl-64 print:pl-0 outline-none">
          <div key={modulo} className="section-open">{conteudo}</div>
        </main>

        <div className="fixed bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 z-[75] flex flex-col gap-2 items-center print-hide pointer-events-none" aria-live="polite">
          {avisos.map((a) => (
            <div key={a.id} role="status" className={`section-open pointer-events-auto max-w-[92vw] px-4 py-2.5 rounded-lg text-sm font-semibold shadow-card text-white flex items-center gap-2 ${a.tipo === 'erro' ? 'bg-red-600' : a.tipo === 'info' ? 'bg-slate-700' : 'bg-navy-900 dark:bg-emerald-600'}`}>
              <Icone nome={a.tipo === 'erro' ? 'erro' : 'ok'} className="w-4 h-4 flex-shrink-0" /> {a.mensagem}
            </div>
          ))}
        </div>
      </div>
    );
  }

  window.CentralPlataforma = { Plataforma };
})();
