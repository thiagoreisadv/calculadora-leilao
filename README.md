# Central de Cálculos de Leilões e Imóveis

Plataforma web de cálculos financeiros e jurídicos, publicada no GitHub Pages
(<https://thiagoreisadv.github.io/calculadora-leilao/>). Todo o cálculo é feito **no navegador**:
não há servidor, banco de dados nem consulta a APIs ou a índices econômicos.

## Módulos

| Módulo | O que faz |
| --- | --- |
| Calculadora de leilões | Custo de arrematação, lucro, ROI, escritura e RGI (imóveis, rural, veículos) |
| Atualização de débitos | Dívida única com correção monetária informada, juros, multa, honorários e pagamentos |
| Pensão alimentícia | Débito competência por competência, ritos do art. 528 do CPC e corte de prescrição informado |
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

## Correção monetária (sempre informada pelo usuário)

O sistema **não** consulta índices nem calcula correção automática. Em cada parcela o usuário escolhe uma das opções:

1. **Informar percentual de correção** — o percentual acumulado do período. O sistema calcula a correção e a soma ao valor original **uma única vez**. Ex.: R$ 5.000,00 com 8% → correção de R$ 400,00 → principal corrigido de R$ 5.400,00.
2. **Informar valor já corrigido** — o principal corrigido apurado pelo usuário em outra ferramenta. É usado como base, **sem nova correção**.
3. **Sem correção monetária** — usa diretamente o valor original.

A partir do principal corrigido o sistema calcula os demais componentes:

- **Juros**: taxa informada, ao mês ou ao ano, simples ou compostos, do vencimento até a data final, sobre o principal corrigido. Período = meses completos + dias restantes ÷ 30.
- **Multa**: percentual sobre o principal corrigido, aplicada uma única vez.
- **Honorários**: percentual sobre (principal corrigido + juros + multa − pagamentos) ou valor fixo, somado uma única vez.
- **Pagamentos**: abatidos do saldo final, ou imputados em ordem cronológica primeiro nos juros e depois no principal (art. 354 do Código Civil), com juros recalculados sobre o principal restante — conforme a escolha do usuário.

A memória de cálculo mostra cada passo e declara que a correção foi **informada manualmente**.

## Arquitetura

```
index.html            Calculadora de leilões (React) + carregamento dos módulos
js/regras.js          Utilitários: valores, datas, arredondamento, CSV
js/calculo.js         Motor de cálculo local (correção informada, juros, multa, honorários, pagamentos, ritos)
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
node --test test/regras.test.js test/calculo.test.js test/xlsx.test.js test/pdf.test.js
```

Cobrem as três modalidades de correção, a ausência de aplicação dupla, juros simples e compostos (ao mês e ao ano), multa, honorários, pagamentos nos dois modos de abatimento, validações, ritos do art. 528 e a garantia de que os arquivos de cálculo não fazem chamadas de rede.

Para ver o site localmente: `python -m http.server 8600` na pasta do projeto e abra <http://localhost:8600>.
