# Servidor intermediário (Cloudflare Worker)

O site da Central de Cálculos fica no **GitHub Pages**, que é público: qualquer pessoa pode ler o HTML
e o JavaScript. Por isso a chave da API da Debit **nunca** pode ficar no site. Este Worker guarda a chave
como segredo e é o único ponto que fala com a Debit.

```
Navegador (GitHub Pages)  ──►  Worker (este projeto)  ──►  API da Debit
   código de acesso            chave da Debit (segredo)
```

## O que o Worker faz (e não faz)

- Só encaminha as operações abaixo, com os campos validados. **Não é um proxy aberto.**
- Exige o **código de acesso** (`X-Access-Code`) em todas as rotas, exceto `GET /api/status`.
- Aceita chamadas apenas das origens listadas em `ALLOWED_ORIGINS` (CORS).
- Limita 30 solicitações por minuto por IP (em memória, por instância). Para um teto global, veja "Limites".
- Não registra corpos de requisição nem respostas. Nomes das partes (credor, devedor, alimentante etc.) e descrições digitadas **não são enviados** à Debit: vão apenas datas, valores e critérios de cálculo.
- Nunca devolve a chave nem detalhes internos nas mensagens de erro.

| Rota | O que faz | Endpoint da Debit |
| --- | --- | --- |
| `GET /api/status` | Informa se o servidor está configurado (público) | — |
| `GET /api/indices` | Índices econômicos disponíveis | `GET /v1/indices` |
| `GET /api/tabelas` | Tabelas judiciais disponíveis | `GET /v1/tables` |
| `GET /api/conta` | Só se a conta tem assinatura (`assinante_calculos`) | `GET /v1/me` |
| `POST /api/correcao` | Atualização monetária (sem salvar na conta, salvo `salvar: true`) | `POST /v1/correct` |
| `POST /api/pensao` | Pensão alimentícia: cria, preenche, roda e (por padrão) exclui o cálculo | `POST /v1/calc`, `PATCH`, `run`, `DELETE` |
| `GET /api/exportar/{tipo}/{id}?formato=` | PDF/HTML/Word/Excel oficiais da Debit | `GET /v1/calc/{tipo}/{id}/export` |
| `DELETE /api/calculo/{tipo}/{id}` | Envia o cálculo para a lixeira da Debit | `DELETE /v1/calc/{tipo}/{id}` |

Tipos permitidos: `atualizacaoMonetaria` e `pensaoAlimenticia`. Rotas de chaves, login e extração por IA da Debit **não** são expostas.

## Passo a passo para publicar

Pré-requisitos: conta gratuita na [Cloudflare](https://dash.cloudflare.com/sign-up), [Node.js](https://nodejs.org) 18+ e uma chave da Debit.

1. **Crie a chave da Debit**: entre em `app.debit.com.br`, menu **API**, e crie uma chave. (A API da Debit não emite mais chaves por conta própria; é só pelo painel.)
2. No terminal, dentro da pasta `worker`:
   ```bash
   npx wrangler login
   npx wrangler deploy
   ```
   Ao final, o Wrangler mostra o endereço, algo como `https://central-calculos-debit.SEU-USUARIO.workers.dev`.
3. **Cadastre os segredos** (o Wrangler pede o valor no terminal; ele não fica em arquivo nenhum):
   ```bash
   npx wrangler secret put DEBIT_API_KEY
   npx wrangler secret put ACCESS_CODE
   ```
   - `DEBIT_API_KEY`: a chave criada no passo 1.
   - `ACCESS_CODE`: um código que você inventa (use 16 caracteres ou mais). É o que você digitará no site.
4. **Confira `ALLOWED_ORIGINS`** em `wrangler.toml`. O padrão é `https://thiagoreisadv.github.io`. Se o site usar outro endereço, ajuste e rode `npx wrangler deploy` de novo.
5. No site, abra **Conexão com a Debit**, informe o endereço do Worker e o código de acesso e clique em **Salvar e testar conexão**.
   (Opcional: para não digitar o endereço em cada navegador, coloque-o em `js/config.js`, campo `apiBase`. O endereço não é segredo.)

## Custos

- **Cloudflare Workers**: o plano gratuito comporta 100.000 requisições por dia, muito acima do uso esperado. Confira os valores atuais em cloudflare.com/plans.
- **Debit**: a página da API da Debit (www.debit.com.br/api) informa que os planos de uso são tratados diretamente com o suporte deles (o e-mail de contato está nessa página). Sem assinatura ativa, a Debit atualiza apenas os **últimos 2 anos**; parcelas mais antigas voltam sem valor e o site as marca como "não atualizado". A chave é criada no painel da Debit; confirme com eles o que o seu plano inclui e se há cobrança por uso da API.

## Limites

- A Debit limita a **60 operações por minuto** e **300 por hora** por usuário. O site pausa automaticamente quando recebe esse aviso (429) e tenta de novo.
- O limite de 30/min por IP deste Worker é por instância. Se quiser um teto global, crie uma regra de *Rate limiting* no painel da Cloudflare para a rota do Worker.
- O Worker só aceita origens autorizadas, mas quem tiver o código de acesso e falsificar a origem (por exemplo, usando `curl`) ainda poderia chamá-lo. **Por isso o código de acesso precisa ser forte e secreto.** Se suspeitar de vazamento, troque-o com `npx wrangler secret put ACCESS_CODE`; para revogar a chave da Debit, apague-a no painel da Debit.

## Testes

```bash
cd worker
npm test            # testes do Worker com uma Debit simulada
```

Os testes verificam: acesso negado sem código, CORS, validação de campos (recusa campos desconhecidos, datas inválidas, índice e tabela juntos), tradução dos erros da Debit (chave recusada, limite de uso, indisponibilidade, tempo esgotado) **sem vazar a chave**, e o fluxo da pensão (inclusive a limpeza quando algo falha no meio).

### Testar a interface localmente (dados simulados)

```bash
node worker/dev-mock.mjs        # API da Debit SIMULADA em http://localhost:8787 (código: dev-codigo)
python -m http.server 8600      # site em http://localhost:8600
```

Em **Conexão com a Debit**, use `http://localhost:8787` e o código `dev-codigo`. Os valores devolvidos são fictícios e servem só para testar a interface; **não são cálculos reais**.

## Testes com a API real

Os testes automáticos usam uma Debit simulada porque não é possível chamar a API real sem a sua chave. Depois de publicar, faça o roteiro em **Conexão com a Debit → Salvar e testar conexão** e execute um cálculo conhecido para conferir o resultado com o demonstrativo da Debit.
