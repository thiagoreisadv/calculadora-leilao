/*
 * Componentes de interface compartilhados pelos módulos (JSX compilado pelo Babel no navegador).
 * Tudo é exportado em window.CentralUI.
 */
(() => {
  const { useState, useEffect, useRef, useCallback } = React;
  const R = window.CentralRegras;

  // ---------- Ícones (traço único, 24x24) ----------
  const CAMINHOS = {
    painel: <><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></>,
    leilao: <><path d="M14 13l-8.5 8.5a2.1 2.1 0 0 1-3-3L11 10" /><path d="M16 16l6-6" /><path d="M8 8l6-6" /><path d="M9 7l8 8" /><path d="M21 11l-8-8" /></>,
    debito: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 8h10" /><path d="M7 12h4" /><path d="M7 16h4" /><path d="M15 12h2" /><path d="M15 16h2" /></>,
    pensao: <><path d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.5-7 10-7 10z" /></>,
    contrato: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M9 13h6" /><path d="M9 17h6" /></>,
    acordo: <><path d="M11 17l2 2a1 1 0 0 0 3-3" /><path d="M14 14l2.5 2.5a1 1 0 0 0 3-3L16 10" /><path d="M3 11l3-3 4 1 4-2 4 3" /><path d="M5 13l4 4" /></>,
    planilha: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /><path d="M3 15h18" /><path d="M9 3v18" /><path d="M15 3v18" /></>,
    memoria: <><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /><path d="M12 7v5l3 2" /></>,
    sol: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
    lua: <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" />,
    mais: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
    lixeira: <><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M6 6l1 14h10l1-14" /><path d="M10 11v5M14 11v5" /></>,
    baixar: <><path d="M12 3v12" /><path d="M7 11l5 5 5-5" /><path d="M4 20h16" /></>,
    imprimir: <><path d="M6 9V2h12v7" /><path d="M6 18H4v-7h16v7h-2" /><rect x="6" y="14" width="12" height="8" /></>,
    ok: <><circle cx="12" cy="12" r="9" /><path d="M8 12.5l3 3 5-6" /></>,
    aviso: <><path d="M12 3l10 18H2z" /><path d="M12 10v5" /><path d="M12 18h.01" /></>,
    erro: <><circle cx="12" cy="12" r="9" /><path d="M15 9l-6 6M9 9l6 6" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" /></>,
    atualizar: <><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" /></>,
    seta: <path d="M5 12h14M13 6l6 6-6 6" />,
    chevron: <path d="M6 9l6 6 6-6" />,
    editar: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>,
    menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
    x: <path d="M6 6l12 12M18 6L6 18" />,
  };

  function Icone({ nome, className = 'w-5 h-5' }) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true" focusable="false">
        {CAMINHOS[nome] || null}
      </svg>
    );
  }

  // ---------- Estrutura ----------
  function Pagina({ titulo, descricao, acoes, children }) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-navy-900 dark:text-white">{titulo}</h1>
            {descricao && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-2xl">{descricao}</p>}
          </div>
          {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
        </div>
        <div className="space-y-5">{children}</div>
      </div>
    );
  }

  function Cartao({ titulo, descricao, acoes, children, className = '' }) {
    return (
      <section className={`bg-white dark:bg-[#14243A] rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-card ${className}`}>
        {(titulo || acoes) && (
          <div className="flex items-start justify-between gap-3 px-4 sm:px-6 pt-4 sm:pt-5">
            <div className="min-w-0">
              {titulo && <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">{titulo}</h2>}
              {descricao && <p className="mt-0.5 text-xs sm:text-sm text-slate-500 dark:text-slate-400">{descricao}</p>}
            </div>
            {acoes && <div className="flex gap-2 flex-shrink-0">{acoes}</div>}
          </div>
        )}
        <div className="px-4 sm:px-6 py-4 sm:py-5">{children}</div>
      </section>
    );
  }

  // ---------- Botões e alertas ----------
  const VARIANTES = {
    primario: 'bg-navy-900 text-white hover:bg-navy-700 dark:bg-emerald-600 dark:hover:bg-emerald-500 dark:text-white shadow-sm',
    verde: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm',
    secundario: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 dark:bg-white/5 dark:text-slate-200 dark:border-slate-600 dark:hover:bg-white/10',
    perigo: 'bg-white text-red-600 border border-red-200 hover:bg-red-50 dark:bg-transparent dark:text-red-400 dark:border-red-900/60 dark:hover:bg-red-950/30',
    fantasma: 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10',
  };

  function Botao({ variante = 'secundario', carregando = false, icone, children, className = '', tamanho = 'md', ...resto }) {
    const dim = tamanho === 'sm' ? 'px-3 h-9 text-xs' : 'px-4 h-11 text-sm';
    return (
      <button type="button" {...resto} disabled={resto.disabled || carregando}
        className={`inline-flex items-center justify-center gap-2 rounded-lg font-semibold disabled:opacity-60 disabled:cursor-not-allowed ${dim} ${VARIANTES[variante]} ${className}`}>
        {carregando ? <Carregando pequeno /> : icone ? <Icone nome={icone} className="w-4 h-4" /> : null}
        {children}
      </button>
    );
  }

  function Carregando({ pequeno }) {
    return (
      <span role="status" aria-label="Carregando" className={`inline-block rounded-full border-2 border-current border-t-transparent animate-spin ${pequeno ? 'w-4 h-4' : 'w-6 h-6'}`} />
    );
  }

  const ESTILO_ALERTA = {
    erro: ['bg-red-50 border-red-200 text-red-800 dark:bg-red-950/30 dark:border-red-900/50 dark:text-red-200', 'erro'],
    aviso: ['bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/30 dark:border-amber-900/50 dark:text-amber-200', 'aviso'],
    sucesso: ['bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/25 dark:border-emerald-900/50 dark:text-emerald-200', 'ok'],
    info: ['bg-slate-50 border-slate-200 text-slate-700 dark:bg-white/5 dark:border-slate-700 dark:text-slate-200', 'info'],
  };

  function Alerta({ tipo = 'info', titulo, children, acao }) {
    const [classes, icone] = ESTILO_ALERTA[tipo];
    return (
      <div role={tipo === 'erro' ? 'alert' : 'status'} className={`flex gap-3 p-3 sm:p-4 rounded-xl border text-sm ${classes}`}>
        <Icone nome={icone} className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          {titulo && <div className="font-semibold">{titulo}</div>}
          <div className={titulo ? 'mt-0.5' : ''}>{children}</div>
          {acao && <div className="mt-2">{acao}</div>}
        </div>
      </div>
    );
  }

  // ---------- Campos de formulário ----------
  const CLASSE_ENTRADA = 'block w-full h-11 px-3 text-sm font-medium rounded-lg border bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 disabled:bg-slate-100 disabled:text-slate-500 dark:disabled:bg-slate-900';

  function Campo({ rotulo, ajuda, erro, obrigatorio, id, children, className = '' }) {
    return (
      <div className={className}>
        <label htmlFor={id} className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
          {rotulo}{obrigatorio && <span className="text-red-600" aria-hidden="true"> *</span>}
        </label>
        {children}
        {erro ? <p id={id ? `${id}-erro` : undefined} role="alert" className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">{erro}</p>
          : ajuda ? <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{ajuda}</p> : null}
      </div>
    );
  }

  let contador = 0;
  function useId(prefixo) {
    const ref = useRef(null);
    if (ref.current === null) { contador += 1; ref.current = `${prefixo}-${contador}`; }
    return ref.current;
  }

  const bordaEntrada = (erro) => (erro ? 'border-red-400 dark:border-red-500' : 'border-slate-300 dark:border-slate-600');

  function CampoTexto({ rotulo, valor, onChange, erro, ajuda, obrigatorio, placeholder, maxLength = 160, className, tipo = 'text', ...resto }) {
    const id = useId('txt');
    return (
      <Campo rotulo={rotulo} id={id} erro={erro} ajuda={ajuda} obrigatorio={obrigatorio} className={className}>
        <input id={id} type={tipo} value={valor || ''} maxLength={maxLength} placeholder={placeholder}
          aria-invalid={Boolean(erro)} aria-describedby={erro ? `${id}-erro` : undefined}
          onChange={(e) => onChange(e.target.value)} className={`${CLASSE_ENTRADA} ${bordaEntrada(erro)}`} {...resto} />
      </Campo>
    );
  }

  // Valor monetário em reais: aceita digitação livre e formata ao sair do campo.
  function CampoMoeda({ rotulo, valor, onChange, erro, ajuda, obrigatorio, placeholder = '0,00', className }) {
    const id = useId('moeda');
    const sair = () => {
      const n = R.lerValor(valor);
      if (!Number.isNaN(n) && valor !== '') onChange(n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    };
    return (
      <Campo rotulo={rotulo} id={id} erro={erro} ajuda={ajuda} obrigatorio={obrigatorio} className={className}>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400 pointer-events-none">R$</span>
          <input id={id} type="text" inputMode="decimal" value={valor || ''} placeholder={placeholder} maxLength={18}
            aria-invalid={Boolean(erro)} aria-describedby={erro ? `${id}-erro` : undefined}
            onChange={(e) => onChange(e.target.value.replace(/[^\d.,-]/g, ''))} onBlur={sair}
            className={`${CLASSE_ENTRADA} pl-10 tabular-nums ${bordaEntrada(erro)}`} />
        </div>
      </Campo>
    );
  }

  function CampoPercentual({ rotulo, valor, onChange, erro, ajuda, obrigatorio, placeholder = '0', className }) {
    const id = useId('pct');
    return (
      <Campo rotulo={rotulo} id={id} erro={erro} ajuda={ajuda} obrigatorio={obrigatorio} className={className}>
        <div className="relative">
          <input id={id} type="text" inputMode="decimal" value={valor || ''} placeholder={placeholder} maxLength={9}
            aria-invalid={Boolean(erro)} aria-describedby={erro ? `${id}-erro` : undefined}
            onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ''))}
            className={`${CLASSE_ENTRADA} pr-9 tabular-nums ${bordaEntrada(erro)}`} />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400 pointer-events-none">%</span>
        </div>
      </Campo>
    );
  }

  // Data no padrão brasileiro com máscara DD/MM/AAAA.
  function mascararData(texto) {
    const d = String(texto).replace(/\D/g, '').slice(0, 8);
    if (d.length <= 2) return d;
    if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
    return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
  }

  function CampoData({ rotulo, valor, onChange, erro, ajuda, obrigatorio, className, comHoje }) {
    const id = useId('data');
    const preenchida = (valor || '').length === 10;
    const invalida = preenchida && !R.dataEhValida(valor);
    const mensagem = erro || (invalida ? 'Data inexistente. Use DD/MM/AAAA.' : '');
    return (
      <Campo rotulo={rotulo} id={id} erro={mensagem} ajuda={ajuda} obrigatorio={obrigatorio} className={className}>
        <div className="flex gap-2">
          <input id={id} type="text" inputMode="numeric" value={valor || ''} placeholder="DD/MM/AAAA" maxLength={10}
            aria-invalid={Boolean(mensagem)} aria-describedby={mensagem ? `${id}-erro` : undefined}
            onChange={(e) => onChange(mascararData(e.target.value))}
            className={`${CLASSE_ENTRADA} tabular-nums ${bordaEntrada(mensagem)}`} />
          {comHoje && <Botao tamanho="sm" className="!h-11 flex-shrink-0" onClick={() => onChange(R.hojeBR())}>Hoje</Botao>}
        </div>
      </Campo>
    );
  }

  function CampoCompetencia({ rotulo, valor, onChange, erro, className }) {
    const id = useId('comp');
    const mascara = (t) => { const d = String(t).replace(/\D/g, '').slice(0, 6); return d.length <= 2 ? d : `${d.slice(0, 2)}/${d.slice(2)}`; };
    return (
      <Campo rotulo={rotulo} id={id} erro={erro} className={className}>
        <input id={id} type="text" inputMode="numeric" value={valor || ''} placeholder="MM/AAAA" maxLength={7}
          aria-invalid={Boolean(erro)} onChange={(e) => onChange(mascara(e.target.value))}
          className={`${CLASSE_ENTRADA} tabular-nums ${bordaEntrada(erro)}`} />
      </Campo>
    );
  }

  function Selecao({ rotulo, valor, onChange, opcoes, erro, ajuda, obrigatorio, className, placeholder, desabilitado, grupos }) {
    const id = useId('sel');
    return (
      <Campo rotulo={rotulo} id={id} erro={erro} ajuda={ajuda} obrigatorio={obrigatorio} className={className}>
        <select id={id} value={valor === undefined || valor === null ? '' : valor} disabled={desabilitado}
          aria-invalid={Boolean(erro)} onChange={(e) => onChange(e.target.value)}
          className={`${CLASSE_ENTRADA} ${bordaEntrada(erro)}`}>
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {grupos ? grupos.map((g) => (
            <optgroup key={g.titulo} label={g.titulo}>{g.opcoes.map((o) => <option key={o.valor} value={o.valor} disabled={o.desabilitada}>{o.rotulo}</option>)}</optgroup>
          )) : (opcoes || []).map((o) => <option key={o.valor} value={o.valor} disabled={o.desabilitada}>{o.rotulo}</option>)}
        </select>
      </Campo>
    );
  }

  function Chave({ rotulo, descricao, marcado, onChange, desabilitado }) {
    const id = useId('chv');
    return (
      <label htmlFor={id} className={`flex items-start gap-3 ${desabilitado ? 'opacity-60' : 'cursor-pointer'}`}>
        <input id={id} type="checkbox" role="switch" checked={marcado} disabled={desabilitado} onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 w-5 h-5 rounded border-slate-300 text-emerald-600 accent-emerald-600" />
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-slate-700 dark:text-slate-200">{rotulo}</span>
          {descricao && <span className="block text-xs text-slate-500 dark:text-slate-400">{descricao}</span>}
        </span>
      </label>
    );
  }

  // ---------- Indicadores e tabelas ----------
  const TOM = {
    neutro: 'bg-slate-50 border-slate-200 dark:bg-white/5 dark:border-slate-700',
    positivo: 'bg-emerald-50/70 border-emerald-200 dark:bg-emerald-950/25 dark:border-emerald-900/50',
    destaque: 'bg-navy-900 border-navy-900 text-white dark:bg-emerald-700 dark:border-emerald-600',
    alerta: 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/50',
  };

  function Indicador({ rotulo, valor, detalhe, tom = 'neutro', className = '' }) {
    const escuro = tom === 'destaque';
    return (
      <div className={`rounded-xl border p-4 ${TOM[tom]} ${className}`}>
        <div className={`text-[11px] font-semibold uppercase tracking-wide ${escuro ? 'text-white/70' : 'text-slate-500 dark:text-slate-400'}`}>{rotulo}</div>
        <div key={valor} className={`value-update mt-1 font-extrabold tabular-nums ${escuro ? 'text-2xl sm:text-3xl text-white' : 'text-lg sm:text-xl text-slate-900 dark:text-white'}`}>{valor}</div>
        {detalhe && <div className={`mt-1 text-[11px] font-medium ${escuro ? 'text-white/80' : 'text-slate-500 dark:text-slate-400'}`}>{detalhe}</div>}
      </div>
    );
  }

  function Tabela({ colunas, linhas, numericas = [], rodape, vazio = 'Nenhum item.', legenda }) {
    const nums = new Set(numericas);
    return (
      <div className="overflow-x-auto -mx-4 sm:mx-0 rounded-lg border border-slate-200 dark:border-slate-700/60">
        <table className="w-full text-sm">
          {legenda && <caption className="sr-only">{legenda}</caption>}
          <thead className="bg-slate-50 dark:bg-white/5">
            <tr>{colunas.map((c, i) => <th key={c} scope="col" className={`px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 whitespace-nowrap ${nums.has(i) ? 'text-right' : 'text-left'}`}>{c}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
            {linhas.length === 0 ? (
              <tr><td colSpan={colunas.length} className="px-3 py-6 text-center text-slate-500">{vazio}</td></tr>
            ) : linhas.map((l, i) => (
              <tr key={i} className="hover:bg-slate-50/60 dark:hover:bg-white/5">
                {l.map((c, j) => <td key={j} className={`px-3 py-2.5 align-top ${nums.has(j) ? 'text-right tabular-nums whitespace-nowrap' : ''} text-slate-700 dark:text-slate-200`}>{c}</td>)}
              </tr>
            ))}
          </tbody>
          {rodape && (
            <tfoot className="bg-slate-50 dark:bg-white/5 font-bold">
              <tr>{rodape.map((c, j) => <td key={j} className={`px-3 py-2.5 text-slate-900 dark:text-white ${nums.has(j) ? 'text-right tabular-nums whitespace-nowrap' : ''}`}>{c}</td>)}</tr>
            </tfoot>
          )}
        </table>
      </div>
    );
  }

  // ---------- Confirmação ----------
  function Confirmacao({ aberto, titulo, mensagem, rotuloConfirmar = 'Confirmar', perigo, onConfirmar, onCancelar }) {
    const botao = useRef(null);
    useEffect(() => {
      if (!aberto) return undefined;
      if (botao.current) botao.current.focus();
      const tecla = (e) => { if (e.key === 'Escape') onCancelar(); };
      window.addEventListener('keydown', tecla);
      return () => window.removeEventListener('keydown', tecla);
    }, [aberto]);
    if (!aberto) return null;
    return (
      <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 bg-slate-900/50" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancelar(); }}>
        <div role="alertdialog" aria-modal="true" aria-labelledby="dlg-titulo" className="section-open w-full max-w-md rounded-2xl bg-white dark:bg-[#14243A] border border-slate-200 dark:border-slate-700 shadow-card p-5">
          <h2 id="dlg-titulo" className="text-base font-bold text-slate-900 dark:text-white">{titulo}</h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{mensagem}</p>
          <div className="mt-5 flex justify-end gap-2">
            <Botao onClick={onCancelar}>Cancelar</Botao>
            <button ref={botao} type="button" onClick={onConfirmar}
              className={`inline-flex items-center justify-center rounded-lg px-4 h-11 text-sm font-semibold text-white ${perigo ? 'bg-red-600 hover:bg-red-700' : 'bg-navy-900 hover:bg-navy-700'}`}>{rotuloConfirmar}</button>
          </div>
        </div>
      </div>
    );
  }

  // ---------- Avisos globais ----------
  function avisar(mensagem, tipo = 'sucesso') {
    window.dispatchEvent(new CustomEvent('central-aviso', { detail: { mensagem, tipo } }));
  }

  function navegar(modulo, parametros) {
    window.dispatchEvent(new CustomEvent('central-navegar', { detail: { modulo, ...(parametros || {}) } }));
  }

  // ---------- Download local ----------
  function baixarArquivo(nome, conteudo, tipo) {
    const blob = conteudo instanceof Blob ? conteudo : new Blob([conteudo], { type: tipo });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nome; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function nomeArquivo(base, extensao) {
    const limpo = String(base || 'calculo').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'calculo';
    return `${limpo}.${extensao}`;
  }

  // Guarda o rascunho de um formulário na sessão da aba, para não perder o preenchimento ao navegar
  // entre módulos nem quando a API falha. Não é histórico: some ao fechar a aba.
  function useRascunho(chave, inicial) {
    const [valor, definir] = useState(() => {
      try {
        const salvo = sessionStorage.getItem(`central_rascunho_${chave}`);
        return salvo ? { ...inicial(), ...JSON.parse(salvo) } : inicial();
      } catch (e) { return inicial(); }
    });
    useEffect(() => {
      const t = setTimeout(() => {
        try { sessionStorage.setItem(`central_rascunho_${chave}`, JSON.stringify(valor)); } catch (e) { /* ignora */ }
      }, 300);
      return () => clearTimeout(t);
    }, [valor]);
    const limpar = () => { try { sessionStorage.removeItem(`central_rascunho_${chave}`); } catch (e) { /* ignora */ } definir(inicial()); };
    return [valor, definir, limpar];
  }

  // Identificação do profissional (a mesma da calculadora de leilões).
  function identidade() {
    try {
      const dados = JSON.parse(localStorage.getItem('central_calc_imob_v14') || '{}');
      return { nome: dados.advName || '', registro: dados.advOab || '' };
    } catch (e) { return { nome: '', registro: '' }; }
  }

  window.CentralUI = {
    Icone, Pagina, Cartao, Botao, Carregando, Alerta, Campo, CampoTexto, CampoMoeda, CampoPercentual, CampoData, CampoCompetencia,
    Selecao, Chave, Indicador, Tabela, Confirmacao, avisar, navegar, baixarArquivo, nomeArquivo, identidade, mascararData, useRascunho,
  };
})();
