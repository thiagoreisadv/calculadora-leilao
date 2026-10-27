/*
 * Componentes de interface compartilhados pelos módulos (JSX compilado pelo Babel no navegador).
 * Tudo é exportado em window.CentralUI.
 */
(() => {
  const { useState, useEffect, useRef, useCallback } = React;
  const R = window.CentralRegras;

  // ---------- Ícones (Phosphor regular, embutidos em js/icones.js) ----------
  function Icone({ nome, className = 'w-5 h-5' }) {
    const interno = (window.CentralIcones || {})[nome] || '';
    return (
      <svg viewBox="0 0 256 256" fill="currentColor" className={`flex-shrink-0 ${className}`} aria-hidden="true" focusable="false" dangerouslySetInnerHTML={{ __html: interno }} />
    );
  }

  // ---------- Estrutura ----------
  // Cabeçalho (título + subtítulo + nota à direita) e corpo rolável. No computador a página ocupa a altura
  // da janela e só o corpo rola; no celular a página inteira rola.
  function Pagina({ titulo, descricao, acoes, nota, children }) {
    return (
      <div className="flex flex-col lg:h-full min-h-0 print:block print:h-auto">
        <header className="flex-none px-4 sm:px-8 pt-5 sm:pt-[22px] flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 sm:gap-4 print-hide">
          <div className="min-w-0">
            <h1 className="text-2xl font-medium tracking-[-0.02em] text-foreground mb-1">{titulo}</h1>
            {descricao && <p className="text-[13px] text-muted-foreground">{descricao}</p>}
          </div>
          {(acoes || nota) && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:justify-end">
              {nota && <span className="text-xs text-muted-foreground">{nota}</span>}
              {acoes}
            </div>
          )}
        </header>
        <div className="app-body flex-1 min-h-0 lg:overflow-auto px-4 sm:px-8 pt-5 pb-6 space-y-5 print:p-0">{children}</div>
      </div>
    );
  }

  function Cartao({ titulo, descricao, acoes, children, className = '' }) {
    return (
      <section className={`bg-card text-card-foreground rounded-[14px] border border-border ${className}`}>
        {(titulo || acoes) && (
          <div className="flex items-start justify-between gap-3 px-4 sm:px-6 pt-4 sm:pt-5">
            <div className="min-w-0">
              {titulo && <h2 className="text-[15px] font-medium text-foreground">{titulo}</h2>}
              {descricao && <p className="mt-1 text-[13px] text-muted-foreground">{descricao}</p>}
            </div>
            {acoes && <div className="flex gap-2 flex-shrink-0">{acoes}</div>}
          </div>
        )}
        <div className="px-4 sm:px-6 py-4 sm:py-5">{children}</div>
      </section>
    );
  }

  // Bloco recolhível para campos opcionais.
  function Revelar({ titulo, aberto, onAlternar, children }) {
    return (
      <div className="border-t border-border pt-3">
        <button type="button" onClick={onAlternar} aria-expanded={aberto}
          className="inline-flex items-center gap-1.5 text-[13px] text-primary-text hover:underline underline-offset-4">
          <Icone nome="chevron" className={`w-3.5 h-3.5 transition-transform ${aberto ? 'rotate-180' : ''}`} /> {titulo}
        </button>
        {aberto && <div className="mt-4 space-y-4 section-open">{children}</div>}
      </div>
    );
  }

  // Controle segmentado (escolha única entre poucas opções): trilho --field, ativo em acento.
  function Segmentado({ opcoes, valor, onChange, rotulo, className = '', cheio }) {
    return (
      <div role="radiogroup" aria-label={rotulo} className={`flex gap-[3px] p-[3px] rounded-[9px] bg-field border border-border ${cheio ? 'w-full' : 'w-fit max-w-full'} ${className}`}>
        {opcoes.map((o) => (
          <button key={o.valor} type="button" role="radio" aria-checked={valor === o.valor} onClick={() => onChange(o.valor)}
            className={`${cheio ? 'flex-1' : 'flex-auto'} min-w-0 h-[30px] px-3 rounded-[7px] inline-flex items-center justify-center gap-1.5 text-[12.5px] whitespace-nowrap overflow-hidden text-ellipsis transition-colors ${valor === o.valor ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-primary/10'}`}>
            {o.icone && <Icone nome={o.icone} className="w-4 h-4" />}{o.rotulo}
          </button>
        ))}
      </div>
    );
  }

  // ---------- Botões e alertas ----------
  const BASE_BOTAO = 'inline-flex shrink-0 items-center justify-center gap-2 rounded-lg whitespace-nowrap overflow-hidden text-ellipsis transition-colors disabled:pointer-events-none disabled:opacity-50';
  const VARIANTES = {
    // contorno de acento (ação principal), sólido de acento (calcular), secundário com borda, perigo e fantasma
    primario: 'border border-primary bg-transparent text-primary-text hover:bg-primary/15',
    verde: 'border border-primary bg-transparent text-primary-text hover:bg-primary/15',
    solido: 'border border-primary bg-primary text-primary-foreground hover:bg-primary/90',
    secundario: 'border border-border bg-transparent text-foreground hover:bg-primary/10',
    perigo: 'border border-destructive/40 bg-transparent text-destructive hover:bg-destructive/10',
    fantasma: 'text-muted-foreground hover:bg-primary/10 hover:text-foreground',
  };

  function Botao({ variante = 'secundario', carregando = false, icone, children, className = '', tamanho = 'md', ...resto }) {
    const dim = tamanho === 'sm' ? 'px-3 h-8 text-[13px]' : 'px-4 h-[38px] text-[13.5px]';
    return (
      <button type="button" {...resto} disabled={resto.disabled || carregando}
        className={`${BASE_BOTAO} ${dim} ${VARIANTES[variante]} ${className}`}>
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
    erro: ['bg-destructive/10 border-destructive/30 text-destructive', 'erro'],
    aviso: ['bg-warning/10 border-warning/30 text-warning', 'aviso'],
    sucesso: ['bg-success/10 border-success/30 text-success', 'ok'],
    info: ['bg-field border-border text-foreground', 'info'],
  };

  function Alerta({ tipo = 'info', titulo, children, acao }) {
    const [classes, icone] = ESTILO_ALERTA[tipo];
    return (
      <div role={tipo === 'erro' ? 'alert' : 'status'} className={`flex gap-3 px-4 py-3 rounded-[10px] border text-[13px] ${classes}`}>
        <Icone nome={icone} className="w-[18px] h-[18px] mt-0.5" />
        <div className="min-w-0 flex-1">
          {titulo && <div className="font-medium">{titulo}</div>}
          <div className={titulo ? 'mt-0.5' : ''}>{children}</div>
          {acao && <div className="mt-2">{acao}</div>}
        </div>
      </div>
    );
  }

  // ---------- Campos de formulário ----------
  // Altura 38, raio 8, borda --border, fundo --field, números tabulares, foco com borda de acento + anel de 3px.
  const CLASSE_ENTRADA = 'block w-full h-[38px] min-w-0 px-[11px] text-base md:text-[13.5px] rounded-lg border border-border bg-field text-foreground transition-[border-color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-65 aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/20';

  function Campo({ rotulo, ajuda, erro, obrigatorio, id, children, className = '' }) {
    return (
      <div className={className}>
        <label htmlFor={id} className="block text-[12.5px] text-muted-foreground mb-1.5">
          {rotulo}{obrigatorio && <span className="text-destructive" aria-hidden="true"> *</span>}
        </label>
        {children}
        {erro ? <p id={id ? `${id}-erro` : undefined} role="alert" className="mt-1.5 text-[11.5px] text-destructive">{erro}</p>
          : ajuda ? <p className="mt-1.5 text-[11.5px] text-muted-foreground">{ajuda}</p> : null}
      </div>
    );
  }

  let contador = 0;
  function useId(prefixo) {
    const ref = useRef(null);
    if (ref.current === null) { contador += 1; ref.current = `${prefixo}-${contador}`; }
    return ref.current;
  }

  const bordaEntrada = (erro) => (erro ? 'border-destructive' : '');

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

  // Entrada de valor em reais com máscara ao digitar ("350000" -> "350.000"), sem mover o cursor.
  // Trabalha com o texto do campo; ao sair, completa as casas decimais ("1.500" -> "1.500,00").
  function EntradaMoeda({ valor, onChange, className = '', placeholder = '0,00', ...resto }) {
    const ref = useRef(null);
    const cursor = useRef(null);
    const texto = valor === null || valor === undefined ? '' : String(valor);

    // Recoloca o cursor depois que o React grava o valor formatado
    React.useLayoutEffect(() => {
      if (cursor.current !== null && ref.current && ref.current === document.activeElement) {
        ref.current.setSelectionRange(cursor.current, cursor.current);
      }
      cursor.current = null;
    });

    const digitar = (e) => {
      const { inputType, data } = e.nativeEvent || {};
      const r = R.editarDigitacaoMoeda(texto, e.target.value, e.target.selectionStart, inputType, data);
      cursor.current = r.cursor;
      onChange(r.valor);
    };
    const sair = () => { if (texto !== '') onChange(R.textoCampoMoeda(texto)); };

    return (
      <div className="relative">
        <span className="absolute left-[11px] top-1/2 -translate-y-1/2 text-[12.5px] text-muted-foreground pointer-events-none">R$</span>
        <input ref={ref} type="text" inputMode="decimal" autoComplete="off" value={texto} placeholder={placeholder} maxLength={20}
          onChange={digitar} onBlur={sair} {...resto}
          className={`${CLASSE_ENTRADA} pl-8 tabular-nums ${className}`} />
      </div>
    );
  }

  function CampoMoeda({ rotulo, valor, onChange, erro, ajuda, obrigatorio, placeholder = '0,00', className }) {
    const id = useId('moeda');
    return (
      <Campo rotulo={rotulo} id={id} erro={erro} ajuda={ajuda} obrigatorio={obrigatorio} className={className}>
        <EntradaMoeda id={id} valor={valor} onChange={onChange} placeholder={placeholder}
          aria-invalid={Boolean(erro)} aria-describedby={erro ? `${id}-erro` : undefined}
          className={bordaEntrada(erro)} />
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
            className={`${CLASSE_ENTRADA} pr-8 tabular-nums ${bordaEntrada(erro)}`} />
          <span className="absolute right-[11px] top-1/2 -translate-y-1/2 text-[12.5px] text-muted-foreground pointer-events-none">%</span>
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
          {comHoje && <Botao className="flex-shrink-0" onClick={() => onChange(R.hojeBR())}>Hoje</Botao>}
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
          className="mt-0.5 w-[18px] h-[18px] rounded accent-primary" />
        <span className="min-w-0">
          <span className="block text-[13.5px] text-foreground">{rotulo}</span>
          {descricao && <span className="block text-xs text-muted-foreground">{descricao}</span>}
        </span>
      </label>
    );
  }

  // Área de texto no mesmo padrão dos campos.
  function AreaTexto({ rotulo, valor, onChange, linhas = 3, maxLength = 1000, className }) {
    const id = useId('area');
    return (
      <Campo rotulo={rotulo} id={id} className={className}>
        <textarea id={id} rows={linhas} maxLength={maxLength} value={valor} onChange={(e) => onChange(e.target.value)}
          className={`${CLASSE_ENTRADA} h-auto py-2 leading-relaxed`} />
      </Campo>
    );
  }

  // ---------- Indicadores e tabelas ----------
  const TOM = {
    neutro: 'bg-card border-border',
    positivo: 'bg-success/10 border-success/30',
    destaque: 'bg-primary/10 border-primary/40',
    alerta: 'bg-warning/10 border-warning/30',
  };

  function Indicador({ rotulo, valor, detalhe, tom = 'neutro', className = '' }) {
    return (
      <div className={`rounded-xl border px-[18px] py-4 ${TOM[tom]} ${className}`}>
        <div className="text-xs text-muted-foreground">{rotulo}</div>
        <div key={valor} className={`value-update mt-1.5 font-medium tracking-[-0.01em] tabular-nums text-foreground ${tom === 'destaque' ? 'text-2xl' : 'text-[22px]'}`}>{valor}</div>
        {detalhe && <div className="mt-1 text-xs text-muted-foreground">{detalhe}</div>}
      </div>
    );
  }

  function Tabela({ colunas, linhas, numericas = [], rodape, vazio = 'Nenhum item.', legenda }) {
    const nums = new Set(numericas);
    return (
      <div className="overflow-x-auto rounded-[10px] border border-border">
        <table className="w-full text-[13px]">
          {legenda && <caption className="sr-only">{legenda}</caption>}
          <thead className="bg-field">
            <tr>{colunas.map((c, i) => <th key={c} scope="col" className={`px-3 py-2.5 text-xs font-normal text-muted-foreground whitespace-nowrap ${nums.has(i) ? 'text-right' : 'text-left'}`}>{c}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-border">
            {linhas.length === 0 ? (
              <tr><td colSpan={colunas.length} className="px-3 py-6 text-center text-muted-foreground">{vazio}</td></tr>
            ) : linhas.map((l, i) => (
              <tr key={i} className="hover:bg-primary/5">
                {l.map((c, j) => <td key={j} className={`px-3 py-2.5 align-top ${nums.has(j) ? 'text-right tabular-nums whitespace-nowrap' : ''} text-foreground`}>{c}</td>)}
              </tr>
            ))}
          </tbody>
          {rodape && (
            <tfoot className="bg-field font-medium border-t border-border">
              <tr>{rodape.map((c, j) => <td key={j} className={`px-3 py-2.5 text-foreground ${nums.has(j) ? 'text-right tabular-nums whitespace-nowrap' : ''}`}>{c}</td>)}</tr>
            </tfoot>
          )}
        </table>
      </div>
    );
  }

  // Grade de 6 colunas do formulário (campos ocupam 2 colunas; textos longos 3 a 6; em telas pequenas, 1 coluna)
  const SPANS = { 1: 'sm:col-span-1', 2: 'sm:col-span-2', 3: 'sm:col-span-3', 4: 'sm:col-span-4', 6: 'sm:col-span-6' };
  function Grade({ children, className = '' }) {
    return <div className={`grid grid-cols-1 sm:grid-cols-6 gap-x-4 gap-y-[18px] content-start ${className}`}>{children}</div>;
  }
  function Col({ span = 2, children, className = '' }) {
    return <div className={`min-w-0 ${SPANS[span]} ${className}`}>{children}</div>;
  }

  // ---------- Calculador: formulário em abas + painel de resultado ----------
  // Rampa de cores da barra de composição e dos marcadores do painel de resultado.
  const RAMPA = ['#9184d9', '#b5abfc', '#796cbf', '#d2cefd', '#5d5294', '#9397ab', '#595d6c'];
  const TOM_TEXTO = { bom: 'text-success', ruim: 'text-destructive', aviso: 'text-warning' };
  const ICONE_STATUS = { bom: 'ok', ruim: 'erro', aviso: 'aviso' };

  // Card do formulário (abas + corpo que rola + rodapé com "Próxima") ao lado do painel de resultado.
  // abas: [{ id, rotulo, icone, conteudo }]; painel e detalhes são nós React.
  function Calculador({ abas, aba, onAba, painel, detalhes, textoRodape = 'o resultado se atualiza a cada digitação' }) {
    const i = Math.max(0, abas.findIndex((a) => a.id === aba));
    const atual = abas[i];
    const ultima = i === abas.length - 1;
    const refPainel = useRef(null);
    const proxima = () => {
      if (!ultima) { onAba(abas[i + 1].id); return; }
      if (refPainel.current) refPainel.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    return (
      <>
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_372px] gap-5 lg:gap-6 lg:h-[calc(100vh-140px)] lg:min-h-[540px] print-hide">
          <section className="min-w-0 min-h-0 bg-card border border-border rounded-[14px] flex flex-col overflow-hidden">
            <div role="tablist" aria-label="Etapas do formulário" className="flex-none flex gap-1 px-3 sm:px-5 border-b border-border overflow-x-auto">
              {abas.map((a) => (
                <button key={a.id} type="button" role="tab" id={`aba-${a.id}`} aria-selected={a.id === atual.id} aria-controls={`painel-${a.id}`} onClick={() => onAba(a.id)}
                  className={`flex-none h-[46px] px-3.5 flex items-center gap-2 text-[13.5px] whitespace-nowrap transition-colors ${a.id === atual.id ? 'text-primary-text shadow-[inset_0_-2px_0_rgb(var(--primary))]' : 'text-muted-foreground hover:text-foreground'}`}>
                  {a.icone && <Icone nome={a.icone} className="w-[17px] h-[17px]" />}{a.rotulo}
                </button>
              ))}
            </div>
            <div role="tabpanel" id={`painel-${atual.id}`} aria-labelledby={`aba-${atual.id}`} key={atual.id} className="flex-1 min-h-0 lg:overflow-auto px-4 sm:px-6 py-5 sm:py-[22px] section-open">
              {atual.conteudo}
            </div>
            <div className="flex-none flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-t border-border">
              <span className="text-[12.5px] text-muted-foreground min-w-0 truncate">Etapa {i + 1} de {abas.length}</span>
              <Botao onClick={proxima} className="flex-none !h-9 !text-[13px]" variante="primario">
                {ultima ? 'Ver resultado' : `Próxima: ${abas[i + 1].rotulo}`} <Icone nome="seta" className="w-4 h-4" />
              </Botao>
            </div>
          </section>
          <div ref={refPainel} className="min-w-0 min-h-0 flex flex-col scroll-mt-4">{painel}</div>
        </div>
        {detalhes}
      </>
    );
  }

  // Painel de resultado: valor principal, status, barra de composição, indicadores, linhas e ações.
  // linhas: [{ l, v, n, neg, skip }]  n = valor numérico (define a barra); skip = não entra na barra.
  function PainelResultado({ rotulo, valor, tomValor, status, kpis, linhas = [], topo, acoes, children }) {
    const total = linhas.reduce((s, x) => s + (x.skip ? 0 : Math.abs(x.n || 0)), 0) || 1;
    const comCor = linhas.map((x, i) => ({ ...x, cor: x.skip ? 'transparent' : RAMPA[i % RAMPA.length] }));
    const barra = comCor.filter((x) => !x.skip && x.n > 0);
    return (
      <aside aria-label="Resultado" className="flex-1 min-h-0 lg:overflow-auto bg-card border border-border rounded-[14px] p-[22px] flex flex-col">
        <div className="text-[12.5px] text-muted-foreground">{rotulo}</div>
        <div key={valor} className={`value-update text-[34px] leading-tight font-medium tracking-[-0.025em] tabular-nums mt-1.5 mb-2 break-words ${tomValor === 'ruim' ? 'text-destructive' : 'text-foreground'}`}>{valor}</div>
        {status && (
          <div className={`text-[12.5px] flex gap-1.5 items-center ${TOM_TEXTO[status.tom]}`}><Icone nome={ICONE_STATUS[status.tom]} className="w-4 h-4" />{status.texto}</div>
        )}
        {topo && <div className="mt-4 space-y-2">{topo}</div>}
        {barra.length > 0 && (
          <div className="flex h-1.5 rounded-[3px] overflow-hidden gap-0.5 mt-[18px] mb-1.5" aria-hidden="true">
            {barra.map((x, i) => <div key={i} style={{ width: `${(x.n / total) * 100}%`, background: x.cor, minWidth: 2 }} />)}
          </div>
        )}
        {kpis && kpis.length > 0 && (
          <div className="flex flex-wrap justify-between gap-x-4 gap-y-2 mt-3.5 mb-1.5">
            {kpis.map((k) => (
              <div key={k.l}>
                <div className="text-[11.5px] text-muted-foreground">{k.l}</div>
                <div className={`text-[15px] mt-[3px] tabular-nums whitespace-nowrap ${k.tom ? TOM_TEXTO[k.tom] : 'text-foreground'}`}>{k.v}</div>
              </div>
            ))}
          </div>
        )}
        {comCor.length > 0 && (
          <div className="mt-3">
            {comCor.map((x, i) => (
              <div key={`${x.l}-${i}`} className="flex justify-between gap-2.5 py-2 border-b border-border text-[13px]">
                <span className="text-muted-foreground flex items-center gap-2 min-w-0"><span className="w-[7px] h-[7px] rounded-sm flex-none" style={{ background: x.cor }} /><span className="truncate">{x.l}</span></span>
                <span className={`tabular-nums flex-none ${x.neg ? 'text-destructive' : 'text-foreground'}`}>{x.v}</span>
              </div>
            ))}
          </div>
        )}
        {children}
        {acoes && <div className="mt-auto pt-[18px] flex flex-col gap-2">{acoes}</div>}
      </aside>
    );
  }

  // Ações do painel: ação principal (contorno), linha com dois botões (um pode abrir menu) e "Limpar".
  function AcoesPainel({ solido, principal, linha = [], onLimpar, rotuloLimpar = 'Limpar campos' }) {
    const [aberto, setAberto] = useState(null);
    const ref = useRef(null);
    useEffect(() => {
      if (aberto === null) return undefined;
      const fora = (e) => { if (ref.current && !ref.current.contains(e.target)) setAberto(null); };
      const tecla = (e) => { if (e.key === 'Escape') setAberto(null); };
      document.addEventListener('mousedown', fora);
      window.addEventListener('keydown', tecla);
      return () => { document.removeEventListener('mousedown', fora); window.removeEventListener('keydown', tecla); };
    }, [aberto]);
    return (
      <div ref={ref} className="flex flex-col gap-2 print-hide">
        {solido && <Botao variante="solido" icone={solido.icone} onClick={solido.onClick} disabled={solido.desabilitado} className="w-full">{solido.rotulo}</Botao>}
        {principal && <Botao variante="primario" icone={principal.icone} onClick={principal.onClick} disabled={principal.desabilitado} className="w-full">{principal.rotulo}</Botao>}
        {linha.length > 0 && (
          <div className={`grid gap-2 ${linha.length === 2 ? 'grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]' : 'grid-cols-1'}`}>
            {linha.map((b, i) => (
              <div key={b.rotulo} className="relative min-w-0">
                <Botao onClick={b.menu ? () => setAberto(aberto === i ? null : i) : b.onClick} disabled={b.desabilitado} icone={b.icone} className="w-full !px-2.5"
                  aria-haspopup={b.menu ? 'menu' : undefined} aria-expanded={b.menu ? aberto === i : undefined}>
                  {b.rotulo}{b.menu && <Icone nome="chevron" className={`w-3.5 h-3.5 transition-transform ${aberto === i ? 'rotate-180' : ''}`} />}
                </Botao>
                {b.menu && aberto === i && (
                  <div role="menu" className="absolute bottom-full right-0 left-auto mb-2 z-20 min-w-[240px] py-1 rounded-[10px] border border-border bg-card shadow-md section-open">
                    {b.menu.map((item) => (
                      <button key={item.rotulo} type="button" role="menuitem" onClick={() => { setAberto(null); item.onClick(); }}
                        className="w-full text-left px-4 py-2.5 text-[13px] text-foreground hover:bg-primary/10">
                        <span>{item.rotulo}</span>
                        {item.detalhe && <span className="block text-xs text-muted-foreground">{item.detalhe}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {onLimpar && <Botao variante="fantasma" onClick={onLimpar} className="w-full !h-8">{rotuloLimpar}</Botao>}
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
      <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 bg-black/50" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancelar(); }}>
        <div role="alertdialog" aria-modal="true" aria-labelledby="dlg-titulo" className="section-open w-full max-w-md rounded-[14px] bg-card border border-border shadow-md p-5">
          <h2 id="dlg-titulo" className="text-base font-medium text-foreground">{titulo}</h2>
          <p className="mt-2 text-[13px] text-muted-foreground">{mensagem}</p>
          <div className="mt-5 flex justify-end gap-2">
            <Botao onClick={onCancelar}>Cancelar</Botao>
            <button ref={botao} type="button" onClick={onConfirmar}
              className={`inline-flex items-center justify-center rounded-lg px-4 h-[38px] text-[13.5px] ${perigo ? 'bg-destructive text-background' : 'bg-primary text-primary-foreground'} hover:opacity-90`}>{rotuloConfirmar}</button>
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
    Icone, Pagina, Cartao, Revelar, Segmentado, Botao, Carregando, Alerta, Campo, CampoTexto, EntradaMoeda, CampoMoeda, CampoPercentual, CampoData, CampoCompetencia,
    CLASSE_ENTRADA, Selecao, Chave, AreaTexto, Indicador, Tabela, Grade, Col, Calculador, PainelResultado, AcoesPainel, RAMPA, Confirmacao, avisar, navegar, baixarArquivo, nomeArquivo, identidade, mascararData, useRascunho,
  };
})();
