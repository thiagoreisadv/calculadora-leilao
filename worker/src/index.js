/*
 * Servidor intermediário (Cloudflare Worker) entre o site e a API da Debit.
 *
 * Por que existe: o site fica no GitHub Pages (público). A chave da Debit só pode viver aqui,
 * em variável secreta do Worker — nunca no HTML, no JavaScript do site ou no repositório.
 *
 * Segredos (configure com `wrangler secret put`):
 *   DEBIT_API_KEY  chave criada no painel da Debit (app.debit.com.br/menu/api)
 *   ACCESS_CODE    código de acesso que o usuário digita no site para usar este servidor
 * Variáveis (wrangler.toml):
 *   ALLOWED_ORIGINS  origens autorizadas a chamar o servidor, separadas por vírgula
 *   DEBIT_BASE       (opcional) base da API; padrão https://mcp.debit.com.br
 *
 * O servidor só encaminha as operações abaixo, com campos validados. Não é um proxy aberto.
 */

const PADRAO_BASE = 'https://mcp.debit.com.br';
const PADRAO_ORIGENS = 'https://thiagoreisadv.github.io';
const TIPOS_CALCULO = ['atualizacaoMonetaria', 'pensaoAlimenticia'];
const FORMATOS_EXPORTACAO = { html: 'text/html; charset=utf-8', pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
const EXTENSOES = { html: 'html', pdf: 'pdf', docx: 'docx', excel: 'xlsx' };
const TAMANHO_MAXIMO_CORPO = 200 * 1024;
const TEMPO_LIMITE_MS = 25000;
const JANELA_LIMITE_MS = 60000;
const MAXIMO_POR_JANELA = 30;
const MAXIMO_PARCELAS = 200;

class ErroHttp extends Error {
  constructor(status, codigo, mensagem, extra) {
    super(mensagem);
    this.status = status;
    this.codigo = codigo;
    this.extra = extra || {};
  }
}

// ---------- Limite de uso (em memória, por instância do Worker) ----------
// Observação: cada instância tem a sua contagem. Para um teto global, adicione uma regra de
// rate limiting no painel da Cloudflare (ver worker/README.md).
const contagens = new Map();

function verificarLimite(chave, agora) {
  const registro = contagens.get(chave) || { inicio: agora, total: 0 };
  if (agora - registro.inicio >= JANELA_LIMITE_MS) {
    registro.inicio = agora;
    registro.total = 0;
  }
  registro.total += 1;
  contagens.set(chave, registro);
  if (contagens.size > 5000) {
    for (const [k, v] of contagens) if (agora - v.inicio >= JANELA_LIMITE_MS) contagens.delete(k);
  }
  if (registro.total > MAXIMO_POR_JANELA) {
    const restante = Math.max(1, Math.ceil((JANELA_LIMITE_MS - (agora - registro.inicio)) / 1000));
    throw new ErroHttp(429, 'LIMITE_DE_USO', 'Muitas solicitações em pouco tempo. Aguarde e tente novamente.', { retryAfter: restante });
  }
}

export function __reiniciarLimites() { contagens.clear(); }

// ---------- Utilidades ----------

function origensPermitidas(env) {
  return String(env.ALLOWED_ORIGINS || PADRAO_ORIGENS).split(',').map((s) => s.trim()).filter(Boolean);
}

function cabecalhosCors(request, env) {
  const origem = request.headers.get('Origin');
  const h = { Vary: 'Origin' };
  if (origem && origensPermitidas(env).includes(origem)) {
    h['Access-Control-Allow-Origin'] = origem;
    h['Access-Control-Allow-Headers'] = 'Content-Type, X-Access-Code';
    h['Access-Control-Allow-Methods'] = 'GET, POST, DELETE, OPTIONS';
    h['Access-Control-Max-Age'] = '600';
    h['Access-Control-Expose-Headers'] = 'Content-Disposition, Retry-After';
  }
  return h;
}

function json(corpo, status, extra) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...(extra || {}) },
  });
}

async function hashTexto(texto) {
  const dados = new TextEncoder().encode(String(texto));
  return new Uint8Array(await crypto.subtle.digest('SHA-256', dados));
}

// Comparação em tempo constante do código de acesso.
async function codigoConfere(informado, esperado) {
  if (!esperado) return false;
  const a = await hashTexto(informado || '');
  const b = await hashTexto(esperado);
  let diferenca = 0;
  for (let i = 0; i < a.length; i += 1) diferenca |= a[i] ^ b[i];
  return diferenca === 0;
}

function dataValida(s) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s || ''));
  if (!m) return false;
  const d = Number(m[1]), mes = Number(m[2]), a = Number(m[3]);
  const dt = new Date(Date.UTC(a, mes - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === mes - 1 && dt.getUTCDate() === d && a >= 1900 && a <= 2100;
}

const ehNumero = (v) => typeof v === 'number' && Number.isFinite(v);
const ehTextoNumerico = (v) => typeof v === 'string' && /^\d{1,6}(\.\d{1,6})?$/.test(v);
const ehIdentificador = (v) => (Number.isInteger(v) && v > 0 && v < 1e9) || (typeof v === 'string' && /^[a-z0-9_-]{1,64}$/i.test(v));

function apenasChaves(obj, permitidas, contexto) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new ErroHttp(400, 'CORPO_INVALIDO', `${contexto}: formato inválido.`);
  for (const k of Object.keys(obj)) {
    if (!permitidas.includes(k)) throw new ErroHttp(400, 'CAMPO_NAO_PERMITIDO', `${contexto}: o campo "${k}" não é aceito.`);
  }
}

function textoCurto(v, max) {
  return String(v === undefined || v === null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

// ---------- Validação das operações ----------

export function validarCorrecao(corpo) {
  apenasChaves(corpo, ['index', 'table', 'updateTo', 'items', 'juros', 'multa', 'honorarios', 'selic', 'selicFrom', 'selicUntil', 'selicBase', 'selicVersion', 'salvar', 'nome'], 'Correção');
  if (!dataValida(corpo.updateTo)) throw new ErroHttp(400, 'DATA_INVALIDA', 'Data final inválida. Use DD/MM/AAAA.');
  const temIndice = corpo.index !== undefined && corpo.index !== null && corpo.index !== '';
  const temTabela = corpo.table !== undefined && corpo.table !== null && corpo.table !== '';
  if (temIndice === temTabela) throw new ErroHttp(400, 'CORRECAO_INVALIDA', 'Informe o índice OU a tabela judicial, nunca os dois.');
  if (temIndice && !ehIdentificador(corpo.index)) throw new ErroHttp(400, 'INDICE_INVALIDO', 'Índice inválido.');
  if (temTabela && !ehIdentificador(corpo.table)) throw new ErroHttp(400, 'TABELA_INVALIDA', 'Tabela judicial inválida.');
  if (!Array.isArray(corpo.items) || corpo.items.length < 1 || corpo.items.length > MAXIMO_PARCELAS * 3) {
    throw new ErroHttp(400, 'ITENS_INVALIDOS', 'Informe entre 1 e 600 itens (parcelas e pagamentos).');
  }
  const items = corpo.items.map((it, i) => {
    apenasChaves(it, ['date', 'amount', 'description', 'custas'], `Item ${i + 1}`);
    if (!dataValida(it.date)) throw new ErroHttp(400, 'DATA_INVALIDA', `Item ${i + 1}: data inválida. Use DD/MM/AAAA.`);
    if (!ehNumero(it.amount) || it.amount === 0 || Math.abs(it.amount) > 1e12) throw new ErroHttp(400, 'VALOR_INVALIDO', `Item ${i + 1}: valor inválido.`);
    const saida = { date: it.date, amount: it.amount };
    if (it.description !== undefined) saida.description = textoCurto(it.description, 120);
    if (it.custas !== undefined) saida.custas = it.custas === true;
    return saida;
  });
  const saida = { updateTo: corpo.updateTo, items };
  if (temIndice) saida.index = corpo.index; else saida.table = corpo.table;
  if (corpo.juros !== undefined) {
    apenasChaves(corpo.juros, ['percentual', 'from'], 'Juros');
    if (!ehTextoNumerico(String(corpo.juros.percentual))) throw new ErroHttp(400, 'JUROS_INVALIDOS', 'Percentual de juros inválido.');
    if (corpo.juros.from !== undefined && !['vencimento', 'citacao'].includes(corpo.juros.from)) throw new ErroHttp(400, 'JUROS_INVALIDOS', 'Início dos juros inválido.');
    saida.juros = { percentual: String(corpo.juros.percentual), ...(corpo.juros.from ? { from: corpo.juros.from } : {}) };
  }
  if (corpo.multa !== undefined) {
    apenasChaves(corpo.multa, ['percentual'], 'Multa');
    if (!ehTextoNumerico(String(corpo.multa.percentual))) throw new ErroHttp(400, 'MULTA_INVALIDA', 'Percentual de multa inválido.');
    saida.multa = { percentual: String(corpo.multa.percentual) };
  }
  if (corpo.honorarios !== undefined) {
    apenasChaves(corpo.honorarios, ['modo', 'valor'], 'Honorários');
    if (!['p', 'v'].includes(corpo.honorarios.modo)) throw new ErroHttp(400, 'HONORARIOS_INVALIDOS', 'Modo de honorários inválido.');
    if (!ehNumero(corpo.honorarios.valor) || corpo.honorarios.valor <= 0 || corpo.honorarios.valor > 1e12) throw new ErroHttp(400, 'HONORARIOS_INVALIDOS', 'Valor de honorários inválido.');
    if (corpo.honorarios.modo === 'p' && corpo.honorarios.valor > 100) throw new ErroHttp(400, 'HONORARIOS_INVALIDOS', 'Honorários em percentual não podem passar de 100%.');
    saida.honorarios = { modo: corpo.honorarios.modo, valor: corpo.honorarios.valor };
  }
  if (corpo.selic !== undefined) {
    if (typeof corpo.selic !== 'boolean') throw new ErroHttp(400, 'SELIC_INVALIDA', 'Opção Selic inválida.');
    saida.selic = corpo.selic;
    if (corpo.selicFrom !== undefined) { if (!dataValida(corpo.selicFrom)) throw new ErroHttp(400, 'DATA_INVALIDA', 'Data inicial da Selic inválida.'); saida.selicFrom = corpo.selicFrom; }
    if (corpo.selicUntil !== undefined) { if (!dataValida(corpo.selicUntil)) throw new ErroHttp(400, 'DATA_INVALIDA', 'Data final da Selic inválida.'); saida.selicUntil = corpo.selicUntil; }
    if (corpo.selicBase !== undefined) { if (!['a', 'am', 'aj', 'ajm'].includes(corpo.selicBase)) throw new ErroHttp(400, 'SELIC_INVALIDA', 'Base da Selic inválida.'); saida.selicBase = corpo.selicBase; }
    if (corpo.selicVersion !== undefined) { if (![1, 2].includes(corpo.selicVersion)) throw new ErroHttp(400, 'SELIC_INVALIDA', 'Versão da Selic inválida.'); saida.selicVersion = corpo.selicVersion; }
  }
  const salvar = corpo.salvar === true;
  if (salvar) {
    saida.save = true;
    saida.name = textoCurto(corpo.nome || 'Central de Cálculos', 80) || 'Central de Cálculos';
  }
  return saida;
}

const ENUM_FIXACAO = ['percentual_sm', 'valor_fixo', 'percentual_liquido', 'percentual_bruto', 'mista'];

export function validarPensao(corpo) {
  apenasChaves(corpo, ['fields', 'manter', 'nome'], 'Pensão');
  const f = corpo.fields;
  const permitidos = [
    'fixacao.tipo', 'fixacao.percentual', 'fixacao.valor_fixo', 'fixacao.data_inicio_vigencia', 'dia_atualiza', 'lista',
    'parametrosAtualizacao.indice_correcao', 'parametrosAtualizacao.juros.percentual', 'parametrosAtualizacao.juros.a_partir',
    'parametrosAtualizacao.prescricao.modo', 'processo.data_ajuizamento_execucao',
    'parametrosAtualizacao.imputacao.modo', 'parametrosAtualizacao.imputacao.metodologia', 'parametrosAtualizacao.imputacao.art354',
    'pagamentos',
  ];
  apenasChaves(f, permitidos, 'Campos da pensão');
  if (!ENUM_FIXACAO.includes(f['fixacao.tipo'])) throw new ErroHttp(400, 'FIXACAO_INVALIDA', 'Tipo de fixação inválido.');
  if (!dataValida(f.dia_atualiza)) throw new ErroHttp(400, 'DATA_INVALIDA', 'Data de atualização inválida. Use DD/MM/AAAA.');
  if (!Array.isArray(f.lista) || f.lista.length < 1 || f.lista.length > MAXIMO_PARCELAS) throw new ErroHttp(400, 'COMPETENCIAS_INVALIDAS', `Informe entre 1 e ${MAXIMO_PARCELAS} competências.`);
  const lista = f.lista.map((c, i) => {
    apenasChaves(c, ['mes_ano', 'salario_base'], `Competência ${i + 1}`);
    if (!/^(0[1-9]|1[0-2])\/\d{4}$/.test(String(c.mes_ano || ''))) throw new ErroHttp(400, 'COMPETENCIA_INVALIDA', `Competência ${i + 1}: use MM/AAAA.`);
    const saida = { mes_ano: c.mes_ano };
    if (c.salario_base !== undefined) {
      if (!ehNumero(c.salario_base) || c.salario_base <= 0 || c.salario_base > 1e9) throw new ErroHttp(400, 'VALOR_INVALIDO', `Competência ${i + 1}: salário base inválido.`);
      saida.salario_base = c.salario_base;
    }
    return saida;
  });
  const campos = { 'fixacao.tipo': f['fixacao.tipo'], dia_atualiza: f.dia_atualiza, lista };
  const numeros = ['fixacao.percentual', 'fixacao.valor_fixo', 'parametrosAtualizacao.juros.percentual'];
  for (const k of numeros) {
    if (f[k] !== undefined) {
      if (!ehNumero(f[k]) || f[k] < 0 || f[k] > 1e9) throw new ErroHttp(400, 'VALOR_INVALIDO', `Campo ${k} inválido.`);
      campos[k] = f[k];
    }
  }
  for (const k of ['fixacao.data_inicio_vigencia']) {
    if (f[k] !== undefined) { if (!dataValida(f[k])) throw new ErroHttp(400, 'DATA_INVALIDA', `Campo ${k} inválido.`); campos[k] = f[k]; }
  }
  if (f['processo.data_ajuizamento_execucao'] !== undefined) {
    if (f['processo.data_ajuizamento_execucao'] !== null && !dataValida(f['processo.data_ajuizamento_execucao'])) throw new ErroHttp(400, 'DATA_INVALIDA', 'Data de ajuizamento inválida.');
    campos['processo.data_ajuizamento_execucao'] = f['processo.data_ajuizamento_execucao'];
  }
  if (f['parametrosAtualizacao.indice_correcao'] !== undefined) {
    if (!Number.isInteger(f['parametrosAtualizacao.indice_correcao']) || f['parametrosAtualizacao.indice_correcao'] <= 0) throw new ErroHttp(400, 'INDICE_INVALIDO', 'Índice de correção inválido.');
    campos['parametrosAtualizacao.indice_correcao'] = f['parametrosAtualizacao.indice_correcao'];
  }
  const enums = {
    'parametrosAtualizacao.juros.a_partir': ['vencimento', 'citacao'],
    'parametrosAtualizacao.prescricao.modo': ['bienal', 'quinquenal', 'nenhuma'],
    'parametrosAtualizacao.imputacao.modo': ['retroativa', 'prospectiva', 'competencia'],
    'parametrosAtualizacao.imputacao.metodologia': ['decorrer', 'final'],
  };
  for (const [k, valores] of Object.entries(enums)) {
    if (f[k] !== undefined) { if (!valores.includes(f[k])) throw new ErroHttp(400, 'VALOR_INVALIDO', `Campo ${k} inválido.`); campos[k] = f[k]; }
  }
  if (f['parametrosAtualizacao.imputacao.art354'] !== undefined) {
    if (typeof f['parametrosAtualizacao.imputacao.art354'] !== 'boolean') throw new ErroHttp(400, 'VALOR_INVALIDO', 'Campo art354 inválido.');
    campos['parametrosAtualizacao.imputacao.art354'] = f['parametrosAtualizacao.imputacao.art354'];
  }
  if (f.pagamentos !== undefined) {
    if (!Array.isArray(f.pagamentos) || f.pagamentos.length > 600) throw new ErroHttp(400, 'PAGAMENTOS_INVALIDOS', 'Lista de pagamentos inválida.');
    campos.pagamentos = f.pagamentos.map((p, i) => {
      apenasChaves(p, ['competencia_id', 'tipo', 'valor', 'data', 'descricao'], `Pagamento ${i + 1}`);
      if (!ehNumero(p.valor) || p.valor <= 0 || p.valor > 1e12) throw new ErroHttp(400, 'VALOR_INVALIDO', `Pagamento ${i + 1}: o valor deve ser positivo.`);
      if (!dataValida(p.data)) throw new ErroHttp(400, 'DATA_INVALIDA', `Pagamento ${i + 1}: data inválida.`);
      const saida = { valor: p.valor, data: p.data };
      if (p.competencia_id !== undefined) saida.competencia_id = typeof p.competencia_id === 'number' ? p.competencia_id : textoCurto(p.competencia_id, 40);
      if (p.tipo !== undefined) saida.tipo = textoCurto(p.tipo, 40);
      if (p.descricao !== undefined) saida.descricao = textoCurto(p.descricao, 120);
      return saida;
    });
  }
  return { fields: campos, manter: corpo.manter === true, nome: textoCurto(corpo.nome || 'Central de Cálculos', 80) || 'Central de Cálculos' };
}

// ---------- Chamadas à Debit ----------

async function chamarDebit(env, deps, metodo, caminho, corpo, opcoes) {
  const base = String(env.DEBIT_BASE || PADRAO_BASE).replace(/\/+$/, '');
  const controle = new AbortController();
  const temporizador = setTimeout(() => controle.abort(), TEMPO_LIMITE_MS);
  let resposta;
  try {
    resposta = await deps.fetchImpl(base + caminho, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${env.DEBIT_API_KEY}`,
        Accept: (opcoes && opcoes.aceitar) || 'application/json',
        ...(corpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
      signal: controle.signal,
    });
  } catch (e) {
    clearTimeout(temporizador);
    if (e && e.name === 'AbortError') throw new ErroHttp(504, 'DEBIT_DEMOROU', 'A API da Debit demorou demais para responder. Tente novamente.');
    throw new ErroHttp(502, 'DEBIT_INDISPONIVEL', 'Não foi possível conectar à API da Debit. Tente novamente em instantes.');
  }
  clearTimeout(temporizador);
  if (opcoes && opcoes.bruto && resposta.ok) return resposta;
  let dados = null;
  const texto = await resposta.text();
  try { dados = texto ? JSON.parse(texto) : null; } catch (e) { dados = null; }
  if (!resposta.ok) throw traduzirErroDebit(resposta.status, dados, resposta.headers);
  return dados;
}

// Converte o erro da Debit em um erro nosso, sem repassar nada que possa expor credenciais.
function traduzirErroDebit(status, dados, cabecalhos) {
  const erro = (dados && dados.error) || {};
  const codigoDebit = textoCurto(erro.code, 60);
  const msgDebit = textoCurto(erro.message, 300);
  if (status === 401 || (status === 403 && ['INVALID_API_KEY', 'NOT_ALLOWED'].includes(codigoDebit))) {
    return new ErroHttp(502, 'CHAVE_DEBIT_RECUSADA', 'A chave da Debit configurada no servidor foi recusada ou está inativa. Verifique a chave no painel da Debit.');
  }
  if (status === 403) return new ErroHttp(502, 'SEM_PERMISSAO_DEBIT', 'A chave da Debit não tem permissão para esta operação.', { codigoDebit });
  if (status === 429) {
    const espera = Number(erro.retryAfter) || Number(cabecalhos && cabecalhos.get && cabecalhos.get('retry-after')) || 30;
    return new ErroHttp(429, 'LIMITE_DEBIT', 'A Debit atingiu o limite de uso (60 operações por minuto). Aguarde e tente novamente.', { retryAfter: Math.min(Math.max(1, Math.ceil(espera)), 3600) });
  }
  if (status >= 500) return new ErroHttp(502, 'DEBIT_ERRO', 'A API da Debit está com problemas no momento. Tente novamente mais tarde.');
  return new ErroHttp(422, 'DEBIT_RECUSOU', msgDebit || 'A API da Debit recusou a solicitação.', { codigoDebit });
}

// ---------- Rotas ----------

async function rotaIndices(env, deps) {
  const dados = await chamarDebit(env, deps, 'GET', '/v1/indices');
  const lista = Array.isArray(dados && dados.indices) ? dados.indices : [];
  return {
    indices: lista.map((i) => ({
      id: i.id, slug: i.slug || null, name: i.name, type: i.type,
      coverageStart: i.coverageStart || null, latestAvailable: i.latestAvailable || null,
    })),
  };
}

async function rotaTabelas(env, deps) {
  const dados = await chamarDebit(env, deps, 'GET', '/v1/tables');
  const lista = Array.isArray(dados && dados.tables) ? dados.tables : (Array.isArray(dados) ? dados : []);
  return { tabelas: lista.map((t) => ({ id: t.id, slug: t.slug || null, name: t.name })) };
}

async function rotaConta(env, deps) {
  const dados = await chamarDebit(env, deps, 'GET', '/v1/me');
  // Só o necessário: nunca devolve nome, e-mail ou dados da conta.
  return { assinante_calculos: dados ? dados.assinante_calculos === true : null };
}

async function rotaCorrecao(env, deps, corpo) {
  const req = validarCorrecao(corpo);
  return chamarDebit(env, deps, 'POST', '/v1/correct', req);
}

async function rotaPensao(env, deps, corpo) {
  const { fields, manter, nome } = validarPensao(corpo);
  const criado = await chamarDebit(env, deps, 'POST', '/v1/calc', { type: 'pensaoAlimenticia', name: nome });
  const calcId = criado && Number(criado.calcId);
  if (!Number.isInteger(calcId) || calcId <= 0) throw new ErroHttp(502, 'DEBIT_RESPOSTA_INVALIDA', 'A Debit não devolveu o identificador do cálculo.');
  let concluido = false;
  try {
    await chamarDebit(env, deps, 'PATCH', `/v1/calc/pensaoAlimenticia/${calcId}`, { fields });
    const resultado = await chamarDebit(env, deps, 'POST', `/v1/calc/pensaoAlimenticia/${calcId}/run`, {});
    concluido = true;
    return { calcId: manter ? calcId : null, mantido: manter, resultado };
  } finally {
    // Sem "manter", ou se algo falhou no meio, o cálculo é enviado para a lixeira da Debit
    // para não deixar cálculo incompleto ou temporário na conta do usuário.
    if (!manter || !concluido) {
      try { await chamarDebit(env, deps, 'DELETE', `/v1/calc/pensaoAlimenticia/${calcId}`); } catch (ignorado) { /* melhor esforço */ }
    }
  }
}

function validarTipoEId(tipo, id) {
  if (!TIPOS_CALCULO.includes(tipo)) throw new ErroHttp(400, 'TIPO_INVALIDO', 'Tipo de cálculo não permitido.');
  const n = Number(id);
  if (!/^\d{1,12}$/.test(String(id)) || !Number.isInteger(n) || n <= 0) throw new ErroHttp(400, 'ID_INVALIDO', 'Identificador de cálculo inválido.');
  return n;
}

async function rotaExportar(env, deps, tipo, id, formato) {
  const n = validarTipoEId(tipo, id);
  if (!Object.prototype.hasOwnProperty.call(FORMATOS_EXPORTACAO, formato)) throw new ErroHttp(400, 'FORMATO_INVALIDO', 'Formato de exportação inválido.');
  const resposta = await chamarDebit(env, deps, 'GET', `/v1/calc/${tipo}/${n}/export?format=${formato}`, undefined, { bruto: true, aceitar: '*/*' });
  const cabecalhos = {
    'Content-Type': FORMATOS_EXPORTACAO[formato],
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data: https:; font-src data: https:",
  };
  if (formato !== 'html') cabecalhos['Content-Disposition'] = `attachment; filename="demonstrativo-${n}.${EXTENSOES[formato]}"`;
  return new Response(resposta.body, { status: 200, headers: cabecalhos });
}

async function rotaExcluir(env, deps, tipo, id) {
  const n = validarTipoEId(tipo, id);
  await chamarDebit(env, deps, 'DELETE', `/v1/calc/${tipo}/${n}`);
  return { excluido: true };
}

async function lerCorpoJson(request) {
  const tamanho = Number(request.headers.get('Content-Length') || 0);
  if (tamanho > TAMANHO_MAXIMO_CORPO) throw new ErroHttp(413, 'CORPO_GRANDE', 'Solicitação grande demais.');
  const texto = await request.text();
  if (texto.length > TAMANHO_MAXIMO_CORPO) throw new ErroHttp(413, 'CORPO_GRANDE', 'Solicitação grande demais.');
  try { return JSON.parse(texto); } catch (e) { throw new ErroHttp(400, 'JSON_INVALIDO', 'O corpo da solicitação não é um JSON válido.'); }
}

// ---------- Entrada ----------

export async function tratar(request, env, deps) {
  const dep = { fetchImpl: (deps && deps.fetchImpl) || fetch, agora: (deps && deps.agora) || Date.now };
  const cors = cabecalhosCors(request, env);
  const url = new URL(request.url);
  const rota = url.pathname.replace(/\/+$/, '') || '/';
  const comOrigem = request.headers.get('Origin');

  try {
    if (request.method === 'OPTIONS') {
      if (!cors['Access-Control-Allow-Origin']) throw new ErroHttp(403, 'ORIGEM_NAO_PERMITIDA', 'Origem não autorizada.');
      return new Response(null, { status: 204, headers: cors });
    }
    if (comOrigem && !cors['Access-Control-Allow-Origin']) throw new ErroHttp(403, 'ORIGEM_NAO_PERMITIDA', 'Origem não autorizada.');

    const ip = request.headers.get('CF-Connecting-IP') || 'desconhecido';
    verificarLimite(ip, dep.agora());

    if (rota === '/api/status' && request.method === 'GET') {
      return json({ ok: true, configurado: Boolean(env.DEBIT_API_KEY && env.ACCESS_CODE) }, 200, cors);
    }
    if (!rota.startsWith('/api/')) throw new ErroHttp(404, 'NAO_ENCONTRADO', 'Rota não encontrada.');
    if (!env.DEBIT_API_KEY || !env.ACCESS_CODE) throw new ErroHttp(503, 'NAO_CONFIGURADO', 'O servidor intermediário ainda não foi configurado (chave da Debit ou código de acesso ausente).');
    if (!(await codigoConfere(request.headers.get('X-Access-Code'), env.ACCESS_CODE))) {
      throw new ErroHttp(401, 'ACESSO_NEGADO', 'Código de acesso inválido.');
    }

    const partes = rota.split('/').filter(Boolean); // ['api', ...]
    const metodo = request.method;
    let resposta;
    if (metodo === 'GET' && rota === '/api/indices') resposta = json(await rotaIndices(env, dep), 200, cors);
    else if (metodo === 'GET' && rota === '/api/tabelas') resposta = json(await rotaTabelas(env, dep), 200, cors);
    else if (metodo === 'GET' && rota === '/api/conta') resposta = json(await rotaConta(env, dep), 200, cors);
    else if (metodo === 'POST' && rota === '/api/correcao') resposta = json(await rotaCorrecao(env, dep, await lerCorpoJson(request)), 200, cors);
    else if (metodo === 'POST' && rota === '/api/pensao') resposta = json(await rotaPensao(env, dep, await lerCorpoJson(request)), 200, cors);
    else if (metodo === 'GET' && partes[1] === 'exportar' && partes.length === 4) {
      const r = await rotaExportar(env, dep, partes[2], partes[3], url.searchParams.get('formato') || 'html');
      Object.entries(cors).forEach(([k, v]) => r.headers.set(k, v));
      resposta = r;
    } else if (metodo === 'DELETE' && partes[1] === 'calculo' && partes.length === 4) resposta = json(await rotaExcluir(env, dep, partes[2], partes[3]), 200, cors);
    else throw new ErroHttp(404, 'NAO_ENCONTRADO', 'Rota não encontrada.');
    return resposta;
  } catch (e) {
    if (e instanceof ErroHttp) {
      const extra = { ...cors };
      if (e.extra.retryAfter) extra['Retry-After'] = String(e.extra.retryAfter);
      return json({ erro: { codigo: e.codigo, mensagem: e.message, ...e.extra } }, e.status, extra);
    }
    console.error('erro_inesperado', e && e.name);
    return json({ erro: { codigo: 'ERRO_INTERNO', mensagem: 'Erro inesperado no servidor intermediário.' } }, 500, cors);
  }
}

export default {
  async fetch(request, env) {
    return tratar(request, env);
  },
};
