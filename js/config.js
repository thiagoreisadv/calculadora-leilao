/*
 * Configuração pública do site (nada aqui é segredo).
 *
 * apiBase: endereço do servidor intermediário seguro (Cloudflare Worker, pasta /worker) que guarda
 * a chave da Debit. Depois de publicar o Worker, coloque o endereço aqui, por exemplo:
 *   apiBase: 'https://central-calculos-debit.SEU-USUARIO.workers.dev'
 * Também é possível informar o endereço na tela "Conexão com a Debit", sem editar este arquivo.
 *
 * NUNCA coloque aqui a chave da Debit nem o código de acesso.
 */
window.CENTRAL_CONFIG = {
  apiBase: '',
};
