# Central de Cálculos de Leilões e Imóveis

Plataforma web de cálculos financeiros e jurídicos, publicada no GitHub Pages
(<https://thiagoreisadv.github.io/calculadora-leilao/>).

## Módulos

| Módulo | O que faz | Usa a API da Debit? |
| --- | --- | --- |
| Calculadora de leilões | Custo de arrematação, lucro, ROI, escritura e RGI (imóveis, rural, veículos) | Não |
| Atualização de débitos | Dívida única com correção, juros, multa, honorários e pagamentos parciais | Sim (`/v1/correct`) |
| Pensão alimentícia | Débito por competência, prescrição e ritos do art. 528 CPC | Sim (cálculo `pensaoAlimenticia`) |
| Aluguéis e contratos / Acordos e parcelas | Várias parcelas com vencimentos, valores e pagamentos próprios | Sim (`/v1/correct`) |
| Planilha consolidada | Várias obrigações, critérios por linha, total consolidado e CSV | Sim (`/v1/correct`, 1 chamada por linha) |
| Memórias de cálculo | Demonstrativos guardados no navegador: ver, imprimir, HTML, CSV, cópia JSON | Não |

A calculadora de leilões **não depende** da integração: continua funcionando mesmo sem conexão com a Debit.

## Arquitetura

```
index.html            Calculadora de leilões (React, inalterada em lógica) + carregamento dos módulos
js/regras.js          Regras locais testáveis: valores, datas, validação, montagem e conferência de respostas, totais, CSV
js/api.js             Cliente do servidor intermediário (única porta de saída para a Debit)
js/motor.js           Liga regras + API (agrupa, envia, confere, fila com limite de concorrência)
js/historico.js       Histórico local (localStorage) com exportação/importação JSON
js/registro.js        Monta o registro de memória de cálculo
js/demonstrativo.js   Gera o HTML do demonstrativo (imprimível / salvar em PDF)
js/componentes.js     Componentes de interface compartilhados
js/blocos.js          Critérios de correção, resumo, visualizador de documentos, demonstrativo oficial
js/debitos.js · parcelas.js · planilha.js · pensao.js · memorias.js · painel.js · conexao.js · plataforma.js
worker/               Servidor intermediário (Cloudflare Worker) que guarda a chave da Debit
test/ · worker/test/  Testes automáticos
```

O site continua estático (sem build): os arquivos `js/*.js` são carregados diretamente pelo navegador, o que é compatível com o GitHub Pages.

## Segurança

- A **chave da Debit nunca está no site nem no repositório.** Ela fica como segredo no Worker (`wrangler secret put DEBIT_API_KEY`).
- O site pede um **código de acesso** que o Worker confere; o código fica só no navegador (sessão da aba, ou `localStorage` se você marcar "lembrar").
- O Worker valida e restringe os campos, aceita apenas as origens autorizadas e não repassa mensagens internas.
- Nomes de credor, devedor e partes ficam **somente no navegador**; não vão à Debit.
- Detalhes e passo a passo em [`worker/README.md`](worker/README.md).

## Armazenamento e histórico

O GitHub Pages é hospedagem estática, sem banco de dados. Por isso:

- **Funciona localmente:** histórico de memórias de cálculo no `localStorage` do navegador, cópia de segurança em JSON (exportar/importar), rascunhos dos formulários durante a sessão da aba, "Casos" da calculadora de leilões.
- **Não existe:** sincronização entre dispositivos e backup automático. Se os dados do navegador forem apagados, o histórico some.
- **Se for necessário** histórico compartilhado ou em nuvem, é preciso uma infraestrutura adicional (por exemplo, banco no Cloudflare D1/KV com login). Isso não foi implementado para não enviar dados de clientes a serviços externos sem necessidade.

## Testes

```bash
node --test test/regras.test.js     # regras locais (valores, datas, validação, conferência, CSV)
cd worker && npm test               # Worker com Debit simulada
```

## Publicar

1. Publique o Worker e configure os segredos (veja `worker/README.md`).
2. Faça o merge das alterações na `main`: o GitHub Pages publica sozinho.
3. No site, abra **Conexão com a Debit**, informe o endereço do Worker e o código de acesso, e teste.
