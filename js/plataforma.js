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
    { id: 'escritura', rotulo: 'Orçamento de escritura', icone: 'escritura' },
    { grupo: 'Cálculos jurídicos' },
    { id: 'debitos', rotulo: 'Atualização de débitos', icone: 'debito' },
    { id: 'pensao', rotulo: 'Pensão alimentícia', icone: 'pensao' },
    { id: 'aluguel', rotulo: 'Aluguéis e contratos', icone: 'contrato' },
    { id: 'acordo', rotulo: 'Acordos e parcelas', icone: 'acordo' },
    { id: 'planilha', rotulo: 'Planilha consolidada', icone: 'planilha' },
    { grupo: 'Documentos' },
    { id: 'memorias', rotulo: 'Memórias de cálculo', icone: 'memoria' },
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

  // Menu recolhido (64px, só ícones) ou expandido (240px). Sem escolha guardada, abre expandido em telas largas.
  const CHAVE_MENU = 'central_menu_expandido';
  function lerMenuExpandido() {
    try {
      const v = localStorage.getItem(CHAVE_MENU);
      if (v === '1') return true;
      if (v === '0') return false;
    } catch (e) { /* ignora */ }
    return window.innerWidth >= 1280;
  }

  // Lista de navegação. expandido=false mostra só os ícones (rótulo em title).
  function Menu({ atual, onEscolher, expandido = true }) {
    return (
      <nav aria-label="Navegação principal" className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-1.5 flex flex-col gap-0.5">
        {ITENS.map((item) => item.grupo ? (
          expandido
            ? <div key={item.grupo} className="text-[11px] tracking-[.06em] text-muted-foreground px-2.5 pt-3.5 pb-1.5 whitespace-nowrap">{item.grupo}</div>
            : <div key={item.grupo} className="h-3" aria-hidden="true" />
        ) : (
          <button key={item.id} type="button" onClick={() => onEscolher(item.id)} aria-current={atual === item.id ? 'page' : undefined} title={item.rotulo}
            className={`w-full h-[38px] flex items-center gap-3 px-[11px] rounded-lg text-[13.5px] text-left whitespace-nowrap transition-colors ${atual === item.id ? 'bg-primary/10 text-primary-text shadow-[inset_2px_0_0_rgb(var(--primary))]' : 'text-muted-foreground hover:bg-primary/10 hover:text-foreground'}`}>
            <Icone nome={item.icone} className="w-[19px] h-[19px]" />
            {expandido && <span className="truncate">{item.rotulo}</span>}
          </button>
        ))}
      </nav>
    );
  }

  function BotaoTema({ escuro, onAlternar, expandido = true }) {
    return (
      <div className="px-3 pt-2.5 pb-3.5">
        <button type="button" onClick={onAlternar} title="Alternar tema"
          className="w-full h-[38px] flex items-center gap-3 px-[11px] rounded-lg text-[13.5px] text-muted-foreground hover:bg-primary/10 hover:text-foreground whitespace-nowrap transition-colors">
          <Icone nome={escuro ? 'sol' : 'lua'} className="w-[19px] h-[19px]" />
          {expandido && <span>{escuro ? 'Tema claro' : 'Tema escuro'}</span>}
        </button>
      </div>
    );
  }

  // Logotipo: versão escura para o tema escuro, versão clara para o tema claro.
  function Logo({ className, escuro }) {
    return <img src={escuro ? 'img/logo-thiago-reis-fundo-escuro.svg' : 'img/logo-thiago-reis.svg'} alt="Thiago Reis, advogado" className={className} />;
  }

  function Plataforma({ AppLeiloes }) {
    const [modulo, definirModulo] = useState(moduloDoHash);
    const [parametros, definirParametros] = useState({});
    const [escuro, definirEscuro] = useState(lerEscuro);
    const [menuAberto, definirMenuAberto] = useState(false);
    const [menuExpandido, definirMenuExpandido] = useState(lerMenuExpandido);
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
    const alternarMenu = () => {
      const novo = !menuExpandido;
      definirMenuExpandido(novo);
      try { localStorage.setItem(CHAVE_MENU, novo ? '1' : '0'); } catch (e) { /* ignora */ }
    };
    const tituloAtual = (ITENS.find((i) => i.id === modulo) || {}).rotulo;

    let conteudo = null;
    if (modulo === 'painel') conteudo = <M.ModuloPainel />;
    else if (modulo === 'leiloes') conteudo = <AppLeiloes modo="leilao" dark={escuro} setDark={definirEscuro} />;
    else if (modulo === 'escritura') conteudo = <AppLeiloes modo="escritura" dark={escuro} setDark={definirEscuro} />;
    else if (modulo === 'debitos') conteudo = <M.ModuloDebitos />;
    else if (modulo === 'pensao') conteudo = <M.ModuloPensao />;
    else if (modulo === 'aluguel') conteudo = <M.ModuloParcelas preset="aluguel" />;
    else if (modulo === 'acordo') conteudo = <M.ModuloParcelas preset="acordo" />;
    else if (modulo === 'planilha') conteudo = <M.ModuloPlanilha />;
    else if (modulo === 'memorias') conteudo = <M.ModuloMemorias abrirId={parametros.id} />;

    return (
      <div className="app-shell min-h-screen lg:flex lg:h-screen lg:overflow-hidden bg-background text-foreground">
        <a href="#conteudo" onClick={(e) => { e.preventDefault(); principal.current && principal.current.focus(); }} className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[80] focus:px-3 focus:py-2 focus:rounded-lg focus:bg-card focus:text-foreground focus:border focus:border-border print-hide">Pular para o conteúdo</a>

        {/* Menu lateral recolhível (computadores e notebooks) */}
        <aside className={`hidden lg:flex flex-none flex-col bg-sidebar border-r border-border overflow-hidden transition-[width] duration-200 print-hide ${menuExpandido ? 'w-60' : 'w-16'}`}>
          <div className="h-16 flex-none flex items-center justify-between px-3 gap-2">
            {menuExpandido && <Logo escuro={escuro} className="h-[26px] w-auto min-w-0 ml-2.5" />}
            <button type="button" onClick={alternarMenu} aria-label={menuExpandido ? 'Recolher menu' : 'Expandir menu'} aria-expanded={menuExpandido}
              className="w-10 h-[38px] flex-none flex items-center justify-center rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-foreground transition-colors">
              <Icone nome="recolher" className="w-[19px] h-[19px]" />
            </button>
          </div>
          <Menu atual={modulo} onEscolher={ir} expandido={menuExpandido} />
          <BotaoTema escuro={escuro} onAlternar={alternarTema} expandido={menuExpandido} />
        </aside>

        {/* Barra superior e gaveta (tablets e celulares) */}
        <header className="lg:hidden sticky top-0 z-40 bg-sidebar border-b border-border px-4 h-14 flex items-center justify-between print-hide">
          <Logo escuro={escuro} className="h-6 w-auto" />
          <div className="flex items-center gap-1 min-w-0">
            <span className="hidden sm:inline text-[13px] truncate max-w-[40vw] text-muted-foreground mr-1">{tituloAtual}</span>
            <button type="button" onClick={() => definirMenuAberto(true)} aria-label="Abrir menu" aria-expanded={menuAberto} className="w-10 h-10 flex items-center justify-center rounded-lg text-foreground hover:bg-primary/10"><Icone nome="menu" /></button>
          </div>
        </header>
        {menuAberto && (
          <div className="lg:hidden fixed inset-0 z-[65] print-hide" role="presentation">
            <div className="absolute inset-0 bg-black/50" onClick={() => definirMenuAberto(false)} />
            <div role="dialog" aria-modal="true" aria-label="Menu" className="section-open absolute inset-y-0 right-0 w-72 max-w-[85vw] flex flex-col bg-sidebar border-l border-border">
              <div className="px-5 h-14 flex-none flex items-center justify-between border-b border-border">
                <Logo escuro={escuro} className="h-6 w-auto" />
                <button type="button" onClick={() => definirMenuAberto(false)} aria-label="Fechar menu" className="w-10 h-10 flex items-center justify-center rounded-lg text-foreground hover:bg-primary/10"><Icone nome="x" /></button>
              </div>
              <Menu atual={modulo} onEscolher={ir} expandido />
              <BotaoTema escuro={escuro} onAlternar={alternarTema} />
            </div>
          </div>
        )}

        <main id="conteudo" ref={principal} tabIndex={-1} className="app-main flex-1 min-w-0 lg:h-screen lg:overflow-hidden outline-none print:h-auto print:overflow-visible">
          <div key={modulo} className="section-open lg:h-full print:h-auto">{conteudo}</div>
        </main>

        <div className="fixed bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 z-[75] flex flex-col gap-2 items-center print-hide pointer-events-none" aria-live="polite">
          {avisos.map((a) => (
            <div key={a.id} role="status" className={`section-open pointer-events-auto max-w-[92vw] px-[18px] py-2.5 rounded-[10px] text-[13px] bg-card text-foreground border shadow-md flex items-center gap-2 ${a.tipo === 'erro' ? 'border-destructive' : 'border-primary'}`}>
              <Icone nome={a.tipo === 'erro' ? 'erro' : 'ok'} className={`w-4 h-4 ${a.tipo === 'erro' ? 'text-destructive' : 'text-primary-text'}`} /> {a.mensagem}
            </div>
          ))}
        </div>
      </div>
    );
  }

  window.CentralPlataforma = { Plataforma };
})();
