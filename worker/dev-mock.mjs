// SERVIDOR DE DESENVOLVIMENTO — apenas para testar a interface localmente.
// Executa o servidor intermediário real (src/index.js) contra uma API da Debit SIMULADA.
// Os valores devolvidos são fictícios e NÃO representam cálculos reais. Nunca publique este arquivo
// como se fosse a integração: em produção, o Worker (src/index.js) fala com a API real da Debit.
//
// Uso: node worker/dev-mock.mjs   (escuta em http://localhost:8787)
// Código de acesso de teste: dev-codigo
import http from 'node:http';
import { tratar } from './src/index.js';

const PORTA = 8787;
const env = { DEBIT_API_KEY: 'chave-simulada-apenas-dev', ACCESS_CODE: 'dev-codigo', ALLOWED_ORIGINS: 'http://localhost:8600,http://127.0.0.1:8600', DEBIT_BASE: 'https://debit.simulada.invalid' };

const json = (corpo, status = 200, cab = {}) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json', ...cab } });
const meses = (de, ate) => {
  const [d1, m1, a1] = de.split('/').map(Number); const [d2, m2, a2] = ate.split('/').map(Number);
  return Math.max(0, (a2 - a1) * 12 + (m2 - m1));
};
const calculos = new Map();
let proximoId = 1000;
let contadorCorrecao = 0;

function simularCorrecao(req) {
  const fator = (m) => 1 + 0.004 * m;
  const juros = req.juros ? Number(req.juros.percentual) / 100 : 0;
  const multa = req.multa ? Number(req.multa.percentual) / 100 : 0;
  const items = req.items.map((it) => {
    const m = meses(it.date, req.updateTo);
    const corrected = Math.round(it.amount * fator(m) * 100) / 100;
    const comEncargos = corrected + Math.round(Math.abs(it.amount) * juros * m * (it.amount < 0 ? -1 : 1) * 100) / 100 + (it.amount > 0 ? Math.round(it.amount * multa * 100) / 100 : 0);
    const foraDaJanela = /FORA_JANELA/.test(it.description || '') || Number(it.date.slice(6)) < 2020; // simula conta sem assinatura
    return { date: it.date, amount: it.amount, corrected: foraDaJanela ? 0 : corrected, total: foraDaJanela ? 0 : Math.round(comEncargos * 100) / 100, memoria: foraDaJanela ? '' : `[SIMULADO] ${m} meses de correção a 0,4% ao mês; juros ${juros * 100}% ao mês; multa ${multa * 100}%.` };
  });
  const soma = (f) => Math.round(items.reduce((s, i) => s + f(i), 0) * 100) / 100;
  return {
    total: soma((i) => i.total),
    correcaoMonetaria: soma((i) => i.corrected - i.amount),
    juros: soma((i) => (i.total - i.corrected) * (juros ? 1 : 0)),
    multa: soma(() => 0),
    honorarios: 0,
    items, saved: Boolean(req.save), ...(req.save ? { calcId: ++proximoId, hash: 'simulado' } : {}),
  };
}

async function debitSimulada(url, opcoes) {
  const u = new URL(url);
  const caminho = u.pathname;
  const metodo = opcoes.method;
  const corpo = opcoes.body ? JSON.parse(opcoes.body) : undefined;
  if (opcoes.headers.Authorization !== 'Bearer chave-simulada-apenas-dev') return json({ error: { code: 'INVALID_API_KEY', message: 'x' } }, 401);
  if (metodo === 'GET' && caminho === '/v1/indices') return json({ indices: [
    { id: 45, slug: 'ipca_e', name: 'IPCA-E (IBGE)', type: 'perc', coverageStart: '1991-12-01', latestAvailable: '2026-06-01' },
    { id: 2, slug: 'inpc', name: 'INPC (IBGE)', type: 'perc', coverageStart: '1979-12-01', latestAvailable: '2026-06-01' },
    { id: 14, slug: 'igpm', name: 'IGP-M (FGV)', type: 'perc', coverageStart: '1989-06-01', latestAvailable: '2026-06-01' },
    { id: 23, slug: 'selic', name: 'Selic', type: 'perc', coverageStart: '1986-06-01', latestAvailable: '2026-06-01' },
    { id: 90, slug: 'dolar', name: 'Dólar (PTAX)', type: 'moeda', coverageStart: '1994-07-01', latestAvailable: '2026-06-01' },
  ] });
  if (metodo === 'GET' && caminho === '/v1/tables') return json({ tables: [{ id: 23176, slug: 'cjf-acoes-condenatorias', name: 'CJF — Ações condenatórias em geral (SIMULADA)' }] });
  if (metodo === 'GET' && caminho === '/v1/me') return json({ id: 1, nome: 'Conta de teste', email: 'teste@exemplo.invalid', assinante_calculos: false });
  if (metodo === 'POST' && caminho === '/v1/correct') {
    contadorCorrecao += 1;
    if (corpo.updateTo.endsWith('/2099')) return json({ error: { code: 'RATE_LIMIT', message: 'Limite', retryAfter: 2 } }, 429);
    if (corpo.updateTo.endsWith('/2098')) return new Response('error code: 502', { status: 502 });
    return json(simularCorrecao(corpo));
  }
  if (metodo === 'POST' && caminho === '/v1/calc') { const id = ++proximoId; calculos.set(id, { campos: null }); return json({ calcId: id, hash: 'simulado' }); }
  let m = /^\/v1\/calc\/(\w+)\/(\d+)$/.exec(caminho);
  if (m && metodo === 'PATCH') { calculos.get(Number(m[2])).campos = corpo.fields; return json({ ok: true }); }
  if (m && metodo === 'DELETE') { calculos.delete(Number(m[2])); return json({ deleted: true }); }
  m = /^\/v1\/calc\/(\w+)\/(\d+)\/run$/.exec(caminho);
  if (m && metodo === 'POST') {
    const c = calculos.get(Number(m[2]));
    if (!c || !c.campos) return json({ error: { code: 'NO_FIELDS', message: 'sem campos' } }, 400);
    const lista = c.campos.lista;
    const valor = c.campos['fixacao.valor_fixo'] || 1000;
    const pagos = (c.campos.pagamentos || []).reduce((s, p) => s + p.valor, 0);
    const competencias = lista.map((x) => ({ mes_ano: x.mes_ano, valor_devido: valor, valor_pago: 0, saldo_atualizado: Math.round(valor * 1.05 * 100) / 100 }));
    return json({ aviso_simulacao: 'DADOS SIMULADOS PARA TESTE DA INTERFACE', debito_total_atualizado: Math.round((competencias.length * valor * 1.05 - pagos) * 100) / 100, prescricao_modo: c.campos['parametrosAtualizacao.prescricao.modo'], prescricao_data_corte: null, subtotal_528_caput: Math.round(valor * 3 * 1.05 * 100) / 100, competencias });
  }
  m = /^\/v1\/calc\/(\w+)\/(\d+)\/export$/.exec(caminho);
  if (m && metodo === 'GET') {
    const formato = u.searchParams.get('format');
    if (formato === 'html') return new Response('<!doctype html><html><body><h1>Demonstrativo SIMULADO</h1><p>Dados de teste.</p><script>document.title="x"</script></body></html>', { status: 200, headers: { 'Content-Type': 'text/html' } });
    return new Response('%PDF-1.4 simulado', { status: 200, headers: { 'Content-Type': 'application/pdf' } });
  }
  return json({ error: { code: 'NAO_SIMULADO', message: `${metodo} ${caminho}` } }, 404);
}

http.createServer(async (req, res) => {
  const partes = [];
  for await (const p of req) partes.push(p);
  const corpo = partes.length ? Buffer.concat(partes) : undefined;
  const request = new Request(`http://localhost:${PORTA}${req.url}`, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : corpo });
  const resposta = await tratar(request, env, { fetchImpl: debitSimulada });
  res.writeHead(resposta.status, Object.fromEntries(resposta.headers));
  res.end(Buffer.from(await resposta.arrayBuffer()));
}).listen(PORTA, () => console.log(`Mock de desenvolvimento em http://localhost:${PORTA} (código de acesso: dev-codigo). DADOS SIMULADOS.`));
