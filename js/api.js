/*
 * Cliente do servidor intermediário. É a única camada do site que fala com a API da Debit,
 * e sempre por meio do Worker: o navegador nunca vê a chave da Debit.
 */
(function (root) {
  'use strict';

  const CHAVE_BASE = 'central_api_base_v1';
  const CHAVE_CODIGO = 'central_api_codigo_v1';
  const TEMPO_LIMITE_MS = 45000;
  const ESPERA_MAXIMA_S = 65;

  class ErroApi extends Error {
    constructor(tipo, mensagem, extra) {
      super(mensagem);
      this.name = 'ErroApi';
      this.tipo = tipo; // naoConfigurado | semCodigo | acesso | rede | tempo | limite | debit | validacao | cancelado | servidor
      this.codigo = (extra && extra.codigo) || null;
      this.status = (extra && extra.status) || null;
      this.retryAfter = (extra && extra.retryAfter) || null;
    }
    get podeTentarNovamente() { return ['rede', 'tempo', 'limite', 'servidor'].includes(this.tipo); }
  }

  function guardado(armazenamento, chave) {
    try { return root[armazenamento].getItem(chave) || ''; } catch (e) { return ''; }
  }

  function obterConexao() {
    const base = (guardado('localStorage', CHAVE_BASE) || (root.CENTRAL_CONFIG && root.CENTRAL_CONFIG.apiBase) || '').replace(/\/+$/, '');
    const codigoSessao = guardado('sessionStorage', CHAVE_CODIGO);
    const codigoLocal = guardado('localStorage', CHAVE_CODIGO);
    return { base, codigo: codigoSessao || codigoLocal, lembrado: !codigoSessao && Boolean(codigoLocal) };
  }

  function baseValida(base) {
    try {
      const u = new URL(base);
      const local = ['localhost', '127.0.0.1'].includes(u.hostname);
      return (u.protocol === 'https:' || (local && u.protocol === 'http:')) && !u.username && !u.password;
    } catch (e) { return false; }
  }

  function salvarConexao({ base, codigo, lembrar }) {
    try {
      const limpa = String(base || '').trim().replace(/\/+$/, '');
      if (limpa) root.localStorage.setItem(CHAVE_BASE, limpa); else root.localStorage.removeItem(CHAVE_BASE);
      root.sessionStorage.removeItem(CHAVE_CODIGO);
      root.localStorage.removeItem(CHAVE_CODIGO);
      if (codigo) (lembrar ? root.localStorage : root.sessionStorage).setItem(CHAVE_CODIGO, codigo);
      return true;
    } catch (e) { return false; }
  }

  function limparCodigo() {
    try { root.sessionStorage.removeItem(CHAVE_CODIGO); root.localStorage.removeItem(CHAVE_CODIGO); } catch (e) { /* ignora */ }
  }

  const dormir = (ms, sinal) => new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    if (sinal) sinal.addEventListener('abort', () => { clearTimeout(t); reject(new ErroApi('cancelado', 'Operação cancelada.')); }, { once: true });
  });

  async function enviar(metodo, caminho, corpo, opcoes) {
    const op = opcoes || {};
    const { base, codigo } = obterConexao();
    if (!base) throw new ErroApi('naoConfigurado', 'A conexão com a Debit ainda não foi configurada. Informe o endereço do servidor intermediário na tela "Conexão com a Debit".');
    if (!baseValida(base)) throw new ErroApi('naoConfigurado', 'O endereço do servidor intermediário é inválido. Use um endereço https://.');
    if (!codigo && !op.semCodigo) throw new ErroApi('semCodigo', 'Informe o código de acesso na tela "Conexão com a Debit".');

    const tentativas = op.tentativas === undefined ? 2 : op.tentativas;
    for (let tentativa = 0; ; tentativa += 1) {
      const controle = new AbortController();
      const temporizador = setTimeout(() => controle.abort('tempo'), TEMPO_LIMITE_MS);
      if (op.sinal) {
        if (op.sinal.aborted) { clearTimeout(temporizador); throw new ErroApi('cancelado', 'Operação cancelada.'); }
        op.sinal.addEventListener('abort', () => controle.abort('cancelado'), { once: true });
      }
      let resposta;
      try {
        resposta = await fetch(base + caminho, {
          method: metodo,
          headers: { Accept: op.aceitarBlob ? '*/*' : 'application/json', ...(codigo ? { 'X-Access-Code': codigo } : {}), ...(corpo !== undefined ? { 'Content-Type': 'application/json' } : {}) },
          body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
          signal: controle.signal,
          cache: 'no-store',
          credentials: 'omit',
        });
      } catch (e) {
        clearTimeout(temporizador);
        if (controle.signal.reason === 'cancelado') throw new ErroApi('cancelado', 'Operação cancelada.');
        if (controle.signal.reason === 'tempo') throw new ErroApi('tempo', 'O servidor demorou demais para responder. Seus dados foram mantidos; tente novamente.');
        throw new ErroApi('rede', 'Não foi possível conectar ao servidor intermediário. Verifique sua internet e o endereço configurado.');
      }
      clearTimeout(temporizador);

      if (resposta.ok) {
        if (op.aceitarBlob) return resposta.blob();
        try { return await resposta.json(); } catch (e) { throw new ErroApi('servidor', 'O servidor devolveu uma resposta ilegível.'); }
      }

      let envelope = null;
      try { envelope = (await resposta.json()).erro || null; } catch (e) { envelope = null; }
      const mensagem = (envelope && envelope.mensagem) || 'Falha na comunicação com o servidor.';
      const codigoErro = envelope && envelope.codigo;
      const retryAfter = (envelope && envelope.retryAfter) || Number(resposta.headers.get('Retry-After')) || null;

      if (resposta.status === 429 && tentativa < tentativas && retryAfter && retryAfter <= ESPERA_MAXIMA_S) {
        if (op.aoEsperar) op.aoEsperar(retryAfter);
        await dormir((retryAfter + 1) * 1000, op.sinal);
        continue;
      }
      if (resposta.status === 429) throw new ErroApi('limite', mensagem, { codigo: codigoErro, status: 429, retryAfter });
      if (resposta.status === 401) throw new ErroApi('acesso', mensagem, { codigo: codigoErro, status: 401 });
      if (resposta.status === 400 || resposta.status === 413) throw new ErroApi('validacao', mensagem, { codigo: codigoErro, status: resposta.status });
      if (resposta.status === 422) throw new ErroApi('debit', mensagem, { codigo: codigoErro, status: 422 });
      throw new ErroApi('servidor', mensagem, { codigo: codigoErro, status: resposta.status });
    }
  }

  const Api = {
    ErroApi,
    obterConexao, salvarConexao, limparCodigo, baseValida,
    estaConfigurada() { const c = obterConexao(); return Boolean(c.base && c.codigo); },
    status() { return enviar('GET', '/api/status', undefined, { semCodigo: true, tentativas: 0 }); },
    indices(op) { return enviar('GET', '/api/indices', undefined, op); },
    tabelas(op) { return enviar('GET', '/api/tabelas', undefined, op); },
    conta(op) { return enviar('GET', '/api/conta', undefined, op); },
    correcao(corpo, op) { return enviar('POST', '/api/correcao', corpo, op); },
    pensao(corpo, op) { return enviar('POST', '/api/pensao', corpo, op); },
    exportar(tipo, id, formato, op) { return enviar('GET', `/api/exportar/${encodeURIComponent(tipo)}/${encodeURIComponent(id)}?formato=${encodeURIComponent(formato)}`, undefined, { ...(op || {}), aceitarBlob: true }); },
    excluir(tipo, id, op) { return enviar('DELETE', `/api/calculo/${encodeURIComponent(tipo)}/${encodeURIComponent(id)}`, undefined, op); },
  };

  // Mensagem curta e compreensível para exibir ao usuário.
  Api.mensagemDeErro = function (e) {
    if (e instanceof ErroApi) return e.message;
    return 'Ocorreu um erro inesperado. Seus dados foram mantidos; tente novamente.';
  };

  root.CentralApi = Api;
})(typeof self !== 'undefined' ? self : this);
