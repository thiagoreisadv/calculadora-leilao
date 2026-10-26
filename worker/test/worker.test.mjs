// Testes do servidor intermediário com uma API da Debit SIMULADA (fetch injetado).
// Nenhuma chamada real é feita: aqui se verifica a segurança, a validação e o tratamento de erros.
import test from 'node:test';
import assert from 'node:assert/strict';
import { tratar, __reiniciarLimites, validarCorrecao, validarPensao } from '../src/index.js';

const CHAVE = 'chave-secreta-de-teste-12345';
const CODIGO = 'codigo-de-acesso-de-teste';
const ORIGEM = 'https://thiagoreisadv.github.io';
const env = { DEBIT_API_KEY: CHAVE, ACCESS_CODE: CODIGO, ALLOWED_ORIGINS: ORIGEM };

function pedido(metodo, caminho, { corpo, codigo = CODIGO, origem = ORIGEM, ip = '1.1.1.1' } = {}) {
  const cabecalhos = { 'CF-Connecting-IP': ip };
  if (codigo !== null) cabecalhos['X-Access-Code'] = codigo;
  if (origem) cabecalhos.Origin = origem;
  if (corpo !== undefined) cabecalhos['Content-Type'] = 'application/json';
  return new Request('https://worker.example' + caminho, { method: metodo, headers: cabecalhos, body: corpo !== undefined ? JSON.stringify(corpo) : undefined });
}

function debitSimulada(rotas) {
  const chamadas = [];
  const fetchImpl = async (url, opcoes) => {
    const u = new URL(url);
    chamadas.push({ metodo: opcoes.method, caminho: u.pathname + u.search, cabecalhos: opcoes.headers, corpo: opcoes.body ? JSON.parse(opcoes.body) : undefined });
    const chave = `${opcoes.method} ${u.pathname}`;
    const tratador = rotas[chave];
    if (!tratador) return new Response(JSON.stringify({ error: { code: 'NAO_SIMULADO', message: chave } }), { status: 404 });
    return typeof tratador === 'function' ? tratador(opcoes) : tratador;
  };
  return { fetchImpl, chamadas };
}

const ok = (corpo, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });
const correcaoValida = () => ({
  index: 'ipca_e', updateTo: '01/06/2026',
  items: [{ date: '01/03/2019', amount: 10000, description: 'Principal' }],
  juros: { percentual: '1', from: 'vencimento' }, multa: { percentual: '2' },
});

test.beforeEach(() => __reiniciarLimites());

test('status é público e não revela segredos', async () => {
  const r = await tratar(pedido('GET', '/api/status', { codigo: null }), env, { fetchImpl: debitSimulada({}).fetchImpl });
  assert.equal(r.status, 200);
  const corpo = await r.json();
  assert.deepEqual(corpo, { ok: true, configurado: true });
});

test('sem código de acesso ou com código errado: 401, sem chamar a Debit', async () => {
  const debit = debitSimulada({ 'GET /v1/indices': ok({ indices: [] }) });
  for (const codigo of [null, '', 'errado']) {
    const r = await tratar(pedido('GET', '/api/indices', { codigo }), env, debit);
    assert.equal(r.status, 401);
    assert.equal((await r.json()).erro.codigo, 'ACESSO_NEGADO');
  }
  assert.equal(debit.chamadas.length, 0);
});

test('servidor sem segredos configurados responde 503', async () => {
  const r = await tratar(pedido('GET', '/api/indices'), { ALLOWED_ORIGINS: ORIGEM }, debitSimulada({}));
  assert.equal(r.status, 503);
  const s = await tratar(pedido('GET', '/api/status', { codigo: null }), { ALLOWED_ORIGINS: ORIGEM }, debitSimulada({}));
  assert.equal((await s.json()).configurado, false);
});

test('CORS: origem não autorizada é recusada; autorizada recebe cabeçalhos', async () => {
  const debit = debitSimulada({});
  const negada = await tratar(pedido('GET', '/api/status', { origem: 'https://site-malicioso.example' }), env, debit);
  assert.equal(negada.status, 403);
  assert.equal(negada.headers.get('Access-Control-Allow-Origin'), null);

  const preflight = await tratar(pedido('OPTIONS', '/api/correcao', { codigo: null }), env, debit);
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), ORIGEM);
  assert.match(preflight.headers.get('Access-Control-Allow-Headers'), /X-Access-Code/);

  const preflightNegado = await tratar(pedido('OPTIONS', '/api/correcao', { codigo: null, origem: 'https://x.example' }), env, debit);
  assert.equal(preflightNegado.status, 403);
});

test('índices: encaminha com a chave no cabeçalho e devolve só campos conhecidos', async () => {
  const debit = debitSimulada({
    'GET /v1/indices': ok({ indices: [{ id: 45, slug: 'ipca_e', name: 'IPCA-E', type: 'perc', coverageStart: '1991-12-01', latestAvailable: '2026-06-01', interno: 'segredo' }] }),
  });
  const r = await tratar(pedido('GET', '/api/indices'), env, debit);
  assert.equal(r.status, 200);
  const corpo = await r.json();
  assert.equal(corpo.indices[0].slug, 'ipca_e');
  assert.equal(corpo.indices[0].interno, undefined);
  assert.equal(debit.chamadas[0].cabecalhos.Authorization, `Bearer ${CHAVE}`);
});

test('conta: devolve apenas a situação da assinatura, sem dados pessoais', async () => {
  const debit = debitSimulada({ 'GET /v1/me': ok({ id: 1, nome: 'Fulano', email: 'f@x.com', assinante_calculos: false }) });
  const r = await tratar(pedido('GET', '/api/conta'), env, debit);
  const texto = JSON.stringify(await r.json());
  assert.equal(texto, '{"assinante_calculos":false}');
});

test('correção: encaminha o corpo validado e devolve a resposta da Debit', async () => {
  const resposta = { total: 14231.55, items: [{ date: '01/03/2019', amount: 10000, corrected: 12000, total: 14231.55 }] };
  const debit = debitSimulada({ 'POST /v1/correct': ok(resposta) });
  const r = await tratar(pedido('POST', '/api/correcao', { corpo: correcaoValida() }), env, debit);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), resposta);
  assert.equal(debit.chamadas[0].corpo.index, 'ipca_e');
  assert.equal(debit.chamadas[0].corpo.save, undefined);
});

test('correção com salvar:true envia save e nome; sem salvar nada é persistido', async () => {
  const debit = debitSimulada({ 'POST /v1/correct': ok({ total: 1, items: [], saved: true, calcId: 7 }) });
  await tratar(pedido('POST', '/api/correcao', { corpo: { ...correcaoValida(), salvar: true, nome: 'Cálculo  \u0007 teste' } }), env, debit);
  assert.equal(debit.chamadas[0].corpo.save, true);
  assert.equal(debit.chamadas[0].corpo.name, 'Cálculo teste');
});

test('validação: campos desconhecidos, datas inválidas e índice+tabela juntos são recusados', async () => {
  const debit = debitSimulada({ 'POST /v1/correct': ok({ total: 1, items: [] }) });
  const casos = [
    { ...correcaoValida(), extra: 'x' },
    { ...correcaoValida(), updateTo: '31/02/2026' },
    { ...correcaoValida(), table: 23176 },
    { ...correcaoValida(), index: undefined },
    { ...correcaoValida(), items: [] },
    { ...correcaoValida(), items: [{ date: '01/03/2019', amount: 'dez' }] },
    { ...correcaoValida(), items: [{ date: '01/03/2019', amount: 0 }] },
    { ...correcaoValida(), juros: { percentual: '1;DROP', from: 'vencimento' } },
    { ...correcaoValida(), honorarios: { modo: 'p', valor: 150 } },
    { ...correcaoValida(), index: '../../v1/keys' },
  ];
  for (const corpo of casos) {
    const r = await tratar(pedido('POST', '/api/correcao', { corpo: JSON.parse(JSON.stringify(corpo)) }), env, debit);
    assert.equal(r.status, 400, JSON.stringify(corpo));
  }
  assert.equal(debit.chamadas.length, 0);
});

test('JSON malformado e corpo grande são recusados', async () => {
  const debit = debitSimulada({});
  const mal = new Request('https://worker.example/api/correcao', { method: 'POST', headers: { 'X-Access-Code': CODIGO, Origin: ORIGEM, 'CF-Connecting-IP': '9.9.9.9' }, body: '{nao-json' });
  assert.equal((await tratar(mal, env, debit)).status, 400);
  const grande = pedido('POST', '/api/correcao', { corpo: { items: 'x'.repeat(300 * 1024) } });
  assert.equal((await tratar(grande, env, debit)).status, 413);
});

test('erros da Debit: chave recusada, limite, indisponibilidade, recusa de dados — sem vazar a chave', async () => {
  const cenarios = [
    [ok({ error: { code: 'INVALID_API_KEY', message: `Chave ${CHAVE} inválida` } }, 401), 502, 'CHAVE_DEBIT_RECUSADA'],
    [ok({ error: { code: 'RATE', message: 'x', retryAfter: 12 } }, 429), 429, 'LIMITE_DEBIT'],
    [new Response('error code: 502', { status: 502 }), 502, 'DEBIT_ERRO'],
    [ok({ error: { code: 'INDEX_NOT_FOUND', message: 'Índice inexistente' } }, 400), 422, 'DEBIT_RECUSOU'],
  ];
  for (const [respostaDebit, statusEsperado, codigoEsperado] of cenarios) {
    __reiniciarLimites();
    const debit = debitSimulada({ 'POST /v1/correct': respostaDebit });
    const r = await tratar(pedido('POST', '/api/correcao', { corpo: correcaoValida() }), env, debit);
    const texto = await r.text();
    assert.equal(r.status, statusEsperado, texto);
    assert.equal(JSON.parse(texto).erro.codigo, codigoEsperado);
    assert.ok(!texto.includes(CHAVE), 'a chave não pode aparecer na resposta');
  }
});

test('retryAfter chega ao navegador no cabeçalho Retry-After', async () => {
  const debit = debitSimulada({ 'POST /v1/correct': ok({ error: { code: 'RATE', message: 'x', retryAfter: 12 } }, 429) });
  const r = await tratar(pedido('POST', '/api/correcao', { corpo: correcaoValida() }), env, debit);
  assert.equal(r.headers.get('Retry-After'), '12');
  assert.equal((await r.json()).erro.retryAfter, 12);
});

test('falha de rede e tempo esgotado viram mensagens claras', async () => {
  const rede = { fetchImpl: async () => { throw new TypeError('fetch failed'); } };
  const r1 = await tratar(pedido('POST', '/api/correcao', { corpo: correcaoValida() }), env, rede);
  assert.equal(r1.status, 502);
  assert.equal((await r1.json()).erro.codigo, 'DEBIT_INDISPONIVEL');

  __reiniciarLimites();
  const tempo = { fetchImpl: async () => { const e = new Error('abort'); e.name = 'AbortError'; throw e; } };
  const r2 = await tratar(pedido('POST', '/api/correcao', { corpo: correcaoValida() }), env, tempo);
  assert.equal(r2.status, 504);
});

test('limite de uso por IP devolve 429 com tempo de espera', async () => {
  const debit = debitSimulada({ 'GET /v1/indices': () => ok({ indices: [] }) });
  let ultimo;
  for (let i = 0; i < 31; i += 1) ultimo = await tratar(pedido('GET', '/api/indices', { ip: '7.7.7.7' }), env, debit);
  assert.equal(ultimo.status, 429);
  assert.ok(Number(ultimo.headers.get('Retry-After')) >= 1);
  const outroIp = await tratar(pedido('GET', '/api/indices', { ip: '8.8.8.8' }), env, debit);
  assert.equal(outroIp.status, 200);
});

const pensaoValida = () => ({
  fields: {
    'fixacao.tipo': 'valor_fixo', 'fixacao.valor_fixo': 800, dia_atualiza: '01/06/2026',
    lista: [{ mes_ano: '01/2026' }, { mes_ano: '02/2026' }],
    'parametrosAtualizacao.prescricao.modo': 'nenhuma',
    pagamentos: [{ valor: 200, data: '10/02/2026', descricao: 'parcial' }],
  },
});

test('pensão: cria, preenche, roda e envia para a lixeira quando não é para manter', async () => {
  const debit = debitSimulada({
    'POST /v1/calc': ok({ calcId: 321, hash: 'h' }),
    'PATCH /v1/calc/pensaoAlimenticia/321': ok({ ok: true }),
    'POST /v1/calc/pensaoAlimenticia/321/run': ok({ debito_total_atualizado: 1700.5 }),
    'DELETE /v1/calc/pensaoAlimenticia/321': ok({ deleted: true }),
  });
  const r = await tratar(pedido('POST', '/api/pensao', { corpo: pensaoValida() }), env, debit);
  assert.equal(r.status, 200);
  const corpo = await r.json();
  assert.equal(corpo.calcId, null);
  assert.equal(corpo.resultado.debito_total_atualizado, 1700.5);
  assert.deepEqual(debit.chamadas.map((c) => c.metodo), ['POST', 'PATCH', 'POST', 'DELETE']);
  assert.equal(debit.chamadas[0].corpo.type, 'pensaoAlimenticia');
  assert.ok(debit.chamadas[1].corpo.fields['fixacao.tipo']);
});

test('pensão com manter:true não exclui e devolve o calcId', async () => {
  const debit = debitSimulada({
    'POST /v1/calc': ok({ calcId: 55 }),
    'PATCH /v1/calc/pensaoAlimenticia/55': ok({}),
    'POST /v1/calc/pensaoAlimenticia/55/run': ok({ debito_total_atualizado: 10 }),
  });
  const r = await tratar(pedido('POST', '/api/pensao', { corpo: { ...pensaoValida(), manter: true } }), env, debit);
  assert.equal((await r.json()).calcId, 55);
  assert.ok(!debit.chamadas.some((c) => c.metodo === 'DELETE'));
});

test('pensão: se o preenchimento falhar, o cálculo incompleto é excluído e o erro é informado', async () => {
  const debit = debitSimulada({
    'POST /v1/calc': ok({ calcId: 9 }),
    'PATCH /v1/calc/pensaoAlimenticia/9': ok({ error: { code: 'INVALID_FIELD_VALUE', message: 'lista[0].mes_ano inválido' } }, 400),
    'DELETE /v1/calc/pensaoAlimenticia/9': ok({}),
  });
  const r = await tratar(pedido('POST', '/api/pensao', { corpo: { ...pensaoValida(), manter: true } }), env, debit);
  assert.equal(r.status, 422);
  assert.deepEqual(debit.chamadas.map((c) => c.metodo), ['POST', 'PATCH', 'DELETE']);
});

test('pensão: validação recusa campos fora da lista e dados pessoais das partes', async () => {
  const debit = debitSimulada({});
  const comPartes = pensaoValida();
  comPartes.fields['partes.alimentante'] = { nome: 'Fulano', cpf: '000.000.000-00' };
  assert.equal((await tratar(pedido('POST', '/api/pensao', { corpo: comPartes }), env, debit)).status, 400);
  const semTipo = pensaoValida();
  delete semTipo.fields['fixacao.tipo'];
  assert.equal((await tratar(pedido('POST', '/api/pensao', { corpo: semTipo }), env, debit)).status, 400);
  const compInvalida = pensaoValida();
  compInvalida.fields.lista = [{ mes_ano: '13/2026' }];
  assert.equal((await tratar(pedido('POST', '/api/pensao', { corpo: compInvalida }), env, debit)).status, 400);
  assert.equal(debit.chamadas.length, 0);
});

test('exportação: só tipos e formatos permitidos, com cabeçalhos seguros', async () => {
  const debit = debitSimulada({
    'GET /v1/calc/pensaoAlimenticia/321/export': () => new Response('%PDF-1.7 fake', { status: 200, headers: { 'Content-Type': 'application/pdf' } }),
  });
  const r = await tratar(pedido('GET', '/api/exportar/pensaoAlimenticia/321?formato=pdf'), env, debit);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('Content-Type'), 'application/pdf');
  assert.match(r.headers.get('Content-Disposition'), /demonstrativo-321\.pdf/);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), ORIGEM);
  assert.equal(debit.chamadas[0].caminho, '/v1/calc/pensaoAlimenticia/321/export?format=pdf');

  const html = await tratar(pedido('GET', '/api/exportar/pensaoAlimenticia/321?formato=html'), env, debit);
  assert.match(html.headers.get('Content-Security-Policy'), /default-src 'none'/);
  assert.equal(html.headers.get('Content-Disposition'), null);

  for (const caminho of ['/api/exportar/cartaoPonto/1?formato=pdf', '/api/exportar/pensaoAlimenticia/abc?formato=pdf', '/api/exportar/pensaoAlimenticia/1?formato=exe', '/api/exportar/pensaoAlimenticia/0?formato=pdf']) {
    const rr = await tratar(pedido('GET', caminho), env, debit);
    assert.equal(rr.status, 400, caminho);
  }
});

test('exclusão exige tipo permitido e id numérico', async () => {
  const debit = debitSimulada({ 'DELETE /v1/calc/atualizacaoMonetaria/12': ok({}) });
  assert.equal((await tratar(pedido('DELETE', '/api/calculo/atualizacaoMonetaria/12'), env, debit)).status, 200);
  assert.equal((await tratar(pedido('DELETE', '/api/calculo/atualizacaoMonetaria/1;2'), env, debit)).status, 400);
  assert.equal((await tratar(pedido('DELETE', '/api/calculo/tabelasJudiciais/12'), env, debit)).status, 400);
});

test('rotas desconhecidas e rotas administrativas da Debit não são acessíveis', async () => {
  const debit = debitSimulada({});
  for (const [metodo, caminho] of [['GET', '/api/keys'], ['POST', '/api/auth/login'], ['GET', '/v1/keys'], ['GET', '/api/me/creditos-zenadv']]) {
    const r = await tratar(pedido(metodo, caminho), env, debit);
    assert.equal(r.status, 404, caminho);
  }
  assert.equal(debit.chamadas.length, 0);
});

test('validadores exportados rejeitam entradas fora do esquema', () => {
  assert.throws(() => validarCorrecao({ ...correcaoValida(), nomeDesconhecido: 1 }));
  assert.throws(() => validarPensao({ fields: { 'fixacao.tipo': 'x' } }));
  const v = validarCorrecao(correcaoValida());
  assert.equal(v.index, 'ipca_e');
  assert.equal(v.save, undefined);
});
