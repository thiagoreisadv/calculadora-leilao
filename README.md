# Central de Cálculos de Leilões e Imóveis

Plataforma web de cálculos financeiros e jurídicos, publicada no GitHub Pages
(<https://thiagoreisadv.github.io/calculadora-leilao/>). Todo o cálculo é feito **no navegador**:
não há servidor, banco de dados nem consulta a APIs ou a índices econômicos.

## Módulos

| Módulo | O que faz |
| --- | --- |
| Calculadora de leilões | Custo de arrematação, lucro, ROI, escritura e RGI (imóveis, rural, veículos) |
| Atualização de débitos | Dívida única com correção monetária informada, juros, multa, honorários e pagamentos |
| Pensão alimentícia | Débito competência por competência (% do salário mínimo com o valor de cada mês preenchido sozinho, % de outra base, valor fixo ou manual), ritos do art. 528 do CPC e corte de prescrição informado |
| Aluguéis e contratos / Acordos e parcelas | Várias parcelas, cada uma com a sua correção, vencimento, valor e pagamentos |
| Planilha consolidada | Várias obrigações com total consolidado e exportação CSV |
| Memórias de cálculo | Demonstrativos guardados no navegador: ver, imprimir/salvar PDF, HTML, CSV e cópia JSON |

## Planilha de cálculo em todos os calculadores

Ao final de **cada** calculador (leilões, escritura, débitos, pensão, aluguéis/contratos, acordos e planilha consolidada) há o botão **Gerar planilha de cálculo**, que baixa um arquivo `.xlsx` com:

- aba **Cálculo**: valores numéricos e fórmulas do Excel (correção, principal corrigido, saldo, totais) para conferência e edição;
- aba **Memória**: o passo a passo de cada parcela;
- aba **Critérios**: os parâmetros utilizados.

Cada calculador oferece também **Gerar planilha de cálculo (PDF)**: um PDF real (não depende do diálogo de impressão) com identificação, critérios, discriminação dos valores, tabela por parcela, memória de cálculo e total.

As memórias guardadas em **Memórias de cálculo** também podem ter a planilha baixada de novo. O arquivo é gerado no navegador, sem bibliotecas (`js/xlsx.js`).

## Correção monetária

Em cada parcela o usuário escolhe uma das opções:

1. **Índice oficial** (padrão para parcelas novas): IPCA, INPC, IGP-M ou IPCA-E. O sistema acumula as variações mensais do mês do vencimento até o mês anterior ao da data final e mostra a correção enquanto você digita. Mês ainda não divulgado fica de fora e é apontado na memória de cálculo.
2. **Percentual** acumulado apurado pelo usuário, aplicado uma única vez.
3. **Valor já corrigido**, usado como base sem nova correção.
4. **Sem correção**.

### Tabela de índices

O site é estático, então os índices ficam em `dados/indices.json`. O robô `.github/workflows/indices.yml` roda todo dia, busca as séries no Banco Central (SGS: IPCA 433, INPC 188, IGP-M 189, IPCA-E 10764 e salário mínimo 1619) com `scripts/atualizar-indices.js`, grava o arquivo só quando algum valor muda e pede a publicação do GitHub Pages. Para atualizar na hora: GitHub > Actions > "Atualizar índices de correção" > Run workflow. Se a tabela não estiver disponível, o site avisa e pede o percentual manual.

### Preenchimento em lote

Nos geradores de parcelas (aluguéis, acordos, pensão) a correção escolhida já vai para as parcelas geradas, e **Aplicar a todas** troca a correção de todas de uma vez (também na planilha consolidada). "Adicionar parcela/competência" já traz o mês seguinte, o mesmo dia de vencimento, o mesmo valor e a mesma correção da última.

Na pensão em **% do salário mínimo**, cada competência recebe o salário mínimo vigente naquele mês (editável); o sistema tem uma tabela embutida desde 2005 e usa a série do Banco Central quando disponível. Ao informar a data de um pagamento, a competência abatida é sugerida pelo mês.

## Regras de cálculo

- **Juros**: taxa informada, ao mês ou ao ano, simples ou compostos, do vencimento até a data final, sobre o principal corrigido. Período = meses completos + dias restantes ÷ 30.
- **Multa**: só sobre o valor que estava em atraso no vencimento (principal corrigido − pagamentos feitos até o vencimento). Pagamento em dia afasta a multa.
- **Parcelas que vencem depois da data final** (escolha nos critérios):
  - *Vencimento antecipado* (padrão): entram na data final, sem juros (não há atraso) e com multa, se aplicada. Útil para acordo descumprido.
  - *Fora do cálculo*: são listadas à parte. É o padrão na pensão alimentícia, porque prestações ainda não vencidas não são exigíveis.
- **Honorários**: percentual sobre (principal corrigido + juros + multa − pagamentos) ou valor fixo, somado uma única vez.
- **Pagamentos**: abatidos do saldo final ou imputados em ordem cronológica primeiro nos juros e depois no principal (art. 354 do Código Civil). Pagamento antecipado é aceito. O que exceder principal e juros quita a multa; o resto aparece como excedente não imputado.
- **Atualização de débitos com "início da atualização"**: juros e correção contam dessa data; a multa considera o vencimento real.

## Arquitetura

```
index.html            Calculadora de leilões (React) + carregamento dos módulos
js/regras.js          Utilitários: valores, datas, arredondamento, CSV
js/calculo.js         Motor de cálculo local (correção por índice ou informada, juros, multa, honorários, pagamentos, ritos)
js/indices.js         Carrega dados/indices.json (tabela de índices) para o motor
js/icones.js          Ícones Phosphor embutidos (SVG)
scripts/atualizar-indices.js  Atualiza a tabela de índices a partir do Banco Central (usado pelo GitHub Actions)
js/historico.js       Histórico local (localStorage) com exportação/importação JSON
js/registro.js        Monta o registro da memória de cálculo e a planilha de cálculo
js/xlsx.js            Gerador de planilhas .xlsx sem dependências
js/pdf.js             Gerador de PDF sem dependências (tabelas, quebra de linha, paginação)
js/demonstrativo.js   Gera o HTML do demonstrativo (imprimível / salvar em PDF)
js/componentes.js     Componentes de interface compartilhados
js/blocos.js          Correção manual, critérios de cálculo, resumo, visualizador de documentos
js/debitos.js · parcelas.js · planilha.js · pensao.js · memorias.js · painel.js · plataforma.js
test/                 Testes automáticos
```

O site é estático e não precisa de build: os arquivos `js/*.js` são carregados direto pelo navegador, compatível com o GitHub Pages.

## Armazenamento e histórico

O GitHub Pages é hospedagem estática, sem banco de dados. Por isso:

- **Funciona localmente:** histórico de memórias de cálculo no `localStorage` do navegador, cópia de segurança em JSON (exportar/importar), rascunhos dos formulários durante a sessão da aba, "Casos" da calculadora de leilões.
- **Não existe:** sincronização entre dispositivos e backup automático. Se os dados do navegador forem apagados, o histórico some.
- Nenhum dado de cliente é enviado a serviços externos.

## Testes

```bash
node --test test/*.test.js
```

Cobrem as três modalidades de correção, a ausência de aplicação dupla, juros simples e compostos (ao mês e ao ano), multa, honorários, pagamentos nos dois modos de abatimento, validações, ritos do art. 528 e a garantia de que os arquivos de cálculo não fazem chamadas de rede.

Para ver o site localmente: `python -m http.server 8600` na pasta do projeto e abra <http://localhost:8600>.
