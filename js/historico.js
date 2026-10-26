/*
 * Histórico de cálculos guardado SOMENTE neste navegador (localStorage).
 *
 * Limites que o usuário precisa conhecer (a tela de Memórias de Cálculo os exibe):
 *  - não sincroniza entre computadores ou celulares;
 *  - some se os dados do navegador forem limpos;
 *  - não é um backup. Use "Exportar cópia (JSON)" para guardar uma cópia por conta própria.
 */
(function (root) {
  'use strict';
  const CHAVE = 'central_historico_v1';
  const MAXIMO = 200;

  function ler() {
    try {
      const lista = JSON.parse(root.localStorage.getItem(CHAVE) || '[]');
      return Array.isArray(lista) ? lista : [];
    } catch (e) { return []; }
  }

  function gravar(lista) {
    try {
      root.localStorage.setItem(CHAVE, JSON.stringify(lista));
      root.dispatchEvent(new CustomEvent('central-historico'));
      return { ok: true };
    } catch (e) {
      return { ok: false, erro: 'Não foi possível guardar no navegador (armazenamento cheio ou bloqueado). Exporte uma cópia e apague registros antigos.' };
    }
  }

  function novoId() {
    return (root.crypto && root.crypto.randomUUID) ? root.crypto.randomUUID() : `h${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  }

  const Historico = {
    listar() { return ler().sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm))); },
    obter(id) { return ler().find((r) => r.id === id) || null; },
    salvar(registro) {
      const lista = ler();
      const id = registro.id || novoId();
      const item = { ...registro, id, criadoEm: registro.criadoEm || new Date().toISOString() };
      const sem = lista.filter((r) => r.id !== id);
      sem.push(item);
      sem.sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)));
      const resultado = gravar(sem.slice(0, MAXIMO));
      return { ...resultado, id };
    },
    excluir(id) { return gravar(ler().filter((r) => r.id !== id)); },
    limpar() { return gravar([]); },
    exportarJSON() {
      return JSON.stringify({ formato: 'central-calculos-historico', versao: 1, exportadoEm: new Date().toISOString(), registros: ler() }, null, 2);
    },
    importarJSON(texto) {
      let dados;
      try { dados = JSON.parse(texto); } catch (e) { return { ok: false, erro: 'O arquivo não é um JSON válido.' }; }
      if (!dados || dados.formato !== 'central-calculos-historico' || !Array.isArray(dados.registros)) {
        return { ok: false, erro: 'Este arquivo não é uma cópia do histórico da Central de Cálculos.' };
      }
      const validos = dados.registros.filter((r) => r && typeof r.id === 'string' && typeof r.tipo === 'string' && typeof r.titulo === 'string');
      const atuais = ler();
      const ids = new Set(atuais.map((r) => r.id));
      const novos = validos.filter((r) => !ids.has(r.id));
      const resultado = gravar(atuais.concat(novos).slice(-MAXIMO));
      return { ...resultado, importados: novos.length, ignorados: dados.registros.length - novos.length };
    },
  };

  root.CentralHistorico = Historico;
})(typeof self !== 'undefined' ? self : this);
