/*
 * Motor de atualização: liga as regras locais (CentralRegras) ao cliente da API (CentralApi).
 * Não calcula correção, juros nem multa: monta o pedido, envia à Debit via servidor intermediário
 * e confere a resposta. Se algo não conferir, o resultado é marcado como incompleto — nunca
 * preenchido com estimativas.
 */
(function (root) {
  'use strict';
  const R = root.CentralRegras;
  const Api = root.CentralApi;

  // Atualiza um conjunto de parcelas que compartilham os mesmos critérios (uma chamada à API).
  async function atualizarGrupo(criterios, parcelas, opcoes) {
    const op = opcoes || {};
    const erros = R.validarCalculo(criterios, parcelas);
    if (erros.length) {
      const e = new Api.ErroApi('validacao', erros[0].mensagem);
      e.lista = erros;
      throw e;
    }
    const { requisicao, origem } = R.montarRequisicao(criterios, parcelas);
    const corpo = { ...requisicao };
    if (op.salvar) { corpo.salvar = true; corpo.nome = op.nome || 'Central de Cálculos'; }
    const resposta = await Api.correcao(corpo, { sinal: op.sinal, aoEsperar: op.aoEsperar });
    const conferencia = R.conferirResposta(resposta, requisicao, origem);
    if (!conferencia.ok) {
      const e = new Api.ErroApi('debit', conferencia.erro);
      throw e;
    }
    conferencia.requisicao = requisicao;
    conferencia.salvo = Boolean(resposta.saved && resposta.calcId);
    conferencia.calcId = conferencia.salvo ? resposta.calcId : null;
    return conferencia;
  }

  // Executa tarefas assíncronas com no máximo `limite` em paralelo, respeitando cancelamento.
  async function executarFila(tarefas, opcoes) {
    const op = opcoes || {};
    const limite = op.limite || 2;
    const resultados = new Array(tarefas.length);
    let proxima = 0;
    let concluidas = 0;
    async function trabalhador() {
      while (proxima < tarefas.length) {
        if (op.sinal && op.sinal.aborted) return;
        const i = proxima;
        proxima += 1;
        try {
          resultados[i] = { ok: true, valor: await tarefas[i]() };
        } catch (e) {
          resultados[i] = { ok: false, erro: e };
          // Credencial recusada ou conexão ausente: continuar só geraria o mesmo erro em todas as linhas.
          if (e && ['acesso', 'naoConfigurado', 'semCodigo'].includes(e.tipo)) proxima = tarefas.length;
        }
        concluidas += 1;
        if (op.aoProgredir) op.aoProgredir(concluidas, tarefas.length);
      }
    }
    await Promise.all(Array.from({ length: Math.min(limite, tarefas.length) }, trabalhador));
    return resultados;
  }

  root.CentralMotor = { atualizarGrupo, executarFila };
})(typeof self !== 'undefined' ? self : this);
