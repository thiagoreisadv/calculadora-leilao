/*
 * Módulo: Conexão com a Debit.
 * Configura o endereço do servidor intermediário e o código de acesso, e testa a conexão.
 * A chave da Debit NUNCA é digitada aqui: ela fica apenas no servidor intermediário.
 */
(() => {
  const { useState } = React;
  const UI = window.CentralUI;
  const Api = window.CentralApi;
  const { Pagina, Cartao, Botao, Alerta, CampoTexto, Chave, Icone } = UI;

  function Passo({ ok, pendente, titulo, detalhe }) {
    const nome = pendente ? 'info' : ok ? 'ok' : 'erro';
    const cor = pendente ? 'text-slate-400' : ok ? 'text-emerald-600' : 'text-red-600';
    return (
      <li className="flex gap-3 items-start">
        <Icone nome={nome} className={`w-5 h-5 mt-0.5 flex-shrink-0 ${cor}`} />
        <div className="min-w-0"><div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{titulo}</div>{detalhe && <div className="text-xs text-slate-500 dark:text-slate-400 break-words">{detalhe}</div>}</div>
      </li>
    );
  }

  function ModuloConexao() {
    const atual = Api.obterConexao();
    const [base, definirBase] = useState(atual.base);
    const [codigo, definirCodigo] = useState('');
    const [lembrar, definirLembrar] = useState(atual.lembrado);
    const [mostrar, definirMostrar] = useState(false);
    const [testando, definirTestando] = useState(false);
    const [passos, definirPassos] = useState(null);
    const [salvo, definirSalvo] = useState(false);

    const erroBase = base && !Api.baseValida(base) ? 'Use um endereço que comece com https:// (ou http://localhost para testes).' : '';

    function salvar() {
      if (erroBase) return;
      const ok = Api.salvarConexao({ base, codigo: codigo || atual.codigo, lembrar });
      definirSalvo(ok);
      definirCodigo('');
      if (ok) { UI.avisar('Conexão salva neste navegador.'); window.dispatchEvent(new CustomEvent('central-conexao')); }
      else UI.avisar('Não foi possível salvar (armazenamento do navegador bloqueado).', 'erro');
    }

    async function testar() {
      salvar();
      definirTestando(true); definirPassos([{ chave: 'a', pendente: true, titulo: 'Contatando o servidor intermediário…' }]);
      const lista = [];
      try {
        const s = await Api.status();
        lista.push({ chave: 'a', ok: true, titulo: 'Servidor intermediário respondeu', detalhe: s.configurado ? 'Configurado com chave da Debit e código de acesso.' : undefined });
        if (!s.configurado) {
          lista.push({ chave: 'b', ok: false, titulo: 'Servidor sem segredos configurados', detalhe: 'Configure DEBIT_API_KEY e ACCESS_CODE no servidor (veja worker/README.md).' });
        } else {
          try {
            const i = await Api.indices({ tentativas: 0 });
            lista.push({ chave: 'b', ok: true, titulo: 'Código de acesso aceito e chave da Debit válida', detalhe: `${(i.indices || []).length} índices disponíveis.` });
            const t = await Api.tabelas({ tentativas: 0 }).catch(() => null);
            if (t) lista.push({ chave: 't', ok: true, titulo: 'Tabelas judiciais disponíveis', detalhe: `${(t.tabelas || []).length} tabelas.` });
            const c = await Api.conta({ tentativas: 0 }).catch(() => null);
            if (c) lista.push({ chave: 'c', ok: true, titulo: c.assinante_calculos ? 'Conta Debit com assinatura ativa' : 'Conta Debit sem assinatura ativa', detalhe: c.assinante_calculos ? 'Sem limite de período retroativo.' : 'Cálculos limitados aos últimos 2 anos pela Debit.' });
            UI.carregarCatalogo(true);
          } catch (e) { lista.push({ chave: 'b', ok: false, titulo: 'Falha na autenticação ou na Debit', detalhe: Api.mensagemDeErro(e) }); }
        }
      } catch (e) { lista.push({ chave: 'a', ok: false, titulo: 'Não foi possível usar o servidor intermediário', detalhe: Api.mensagemDeErro(e) }); }
      definirPassos(lista); definirTestando(false);
    }

    return (
      <Pagina titulo="Conexão com a Debit" descricao="Configure o acesso seguro à API da Debit usada na atualização monetária.">
        <Alerta tipo="info" titulo="Como a segurança funciona">
          O site fica no GitHub Pages e é público, por isso a chave da Debit nunca é colocada aqui. Ela fica guardada como segredo em um servidor intermediário (Cloudflare Worker), que só aceita pedidos deste site com o seu código de acesso e só encaminha as operações necessárias.
        </Alerta>

        <Cartao titulo="Servidor intermediário">
          <div className="space-y-4 max-w-xl">
            <CampoTexto rotulo="Endereço do servidor" valor={base} onChange={(v) => { definirBase(v); definirSalvo(false); }} placeholder="https://central-calculos-debit.seu-usuario.workers.dev" erro={erroBase} maxLength={200}
              ajuda="Informado ao publicar o servidor (veja worker/README.md no repositório)." tipo="url" />
            <div>
              <CampoTexto rotulo="Código de acesso" valor={codigo} onChange={definirCodigo} tipo={mostrar ? 'text' : 'password'} maxLength={120} autoComplete="off"
                placeholder={atual.codigo ? '•••••••• (já informado nesta sessão)' : 'Código definido ao configurar o servidor'}
                ajuda="Nunca é gravado no repositório. Fica apenas neste navegador." />
              <div className="mt-2"><Chave rotulo="Mostrar o código digitado" marcado={mostrar} onChange={definirMostrar} /></div>
            </div>
            <Chave rotulo="Lembrar o código neste navegador" descricao="Desmarcado: o código vale só enquanto esta aba estiver aberta. Marque apenas em um computador seu e protegido." marcado={lembrar} onChange={definirLembrar} />
            <div className="flex flex-wrap gap-2">
              <Botao variante="primario" onClick={salvar} disabled={Boolean(erroBase) || !base}>Salvar</Botao>
              <Botao variante="verde" icone="atualizar" carregando={testando} onClick={testar} disabled={Boolean(erroBase) || !base}>Salvar e testar conexão</Botao>
              {atual.codigo && <Botao variante="perigo" onClick={() => { Api.limparCodigo(); definirSalvo(false); definirCodigo(''); window.dispatchEvent(new CustomEvent('central-conexao')); UI.avisar('Código de acesso removido deste navegador.'); }}>Remover código</Botao>}
            </div>
            {salvo && <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Configuração salva.</p>}
          </div>
        </Cartao>

        {passos && (
          <Cartao titulo="Resultado do teste">
            <ul className="space-y-3">{passos.map((p) => <Passo key={p.chave} ok={p.ok} pendente={p.pendente} titulo={p.titulo} detalhe={p.detalhe} />)}</ul>
          </Cartao>
        )}

        <Cartao titulo="Ainda não tem o servidor?">
          <ol className="list-decimal pl-5 space-y-1.5 text-sm text-slate-700 dark:text-slate-300">
            <li>Crie uma conta gratuita na Cloudflare e instale o Node.js.</li>
            <li>Na pasta <code className="px-1 rounded bg-slate-100 dark:bg-white/10">worker</code> do projeto, rode <code className="px-1 rounded bg-slate-100 dark:bg-white/10">npx wrangler login</code> e <code className="px-1 rounded bg-slate-100 dark:bg-white/10">npx wrangler deploy</code>.</li>
            <li>Cadastre os dois segredos com <code className="px-1 rounded bg-slate-100 dark:bg-white/10">npx wrangler secret put DEBIT_API_KEY</code> (chave criada no painel da Debit, menu API) e <code className="px-1 rounded bg-slate-100 dark:bg-white/10">npx wrangler secret put ACCESS_CODE</code> (um código que você inventa).</li>
            <li>Copie o endereço gerado para o campo acima e teste a conexão.</li>
          </ol>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Passo a passo completo, custos e segurança em <a className="underline" href="https://github.com/thiagoreisadv/calculadora-leilao/tree/main/worker" target="_blank" rel="noopener noreferrer">worker/README.md</a>.</p>
        </Cartao>
      </Pagina>
    );
  }

  window.CentralModulos = Object.assign(window.CentralModulos || {}, { ModuloConexao });
})();
