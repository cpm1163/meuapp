# Considerações Clínicas (nível B)

## Estado e escopo

Proposta iniciada em 19/10/2026, em conversa com o usuário. **Nenhum código ainda.** Em 23/10/2026 o usuário decidiu seguir sem esperar o **médico parceiro**, com as [decisões provisórias](#decisões-provisórias-23102026) mais seguras; se o resultado se afastar da prática clínica, realinhamos com ele. Para usuários externos, continua valendo a consulta regulatória ([compliance.md](compliance.md#regulação)).

| Passo | Estado atual |
| --- | --- |
| 1 — Tipos de conteúdo | Decisão provisória: só os tipos 1 e 2 (23/10/2026). |
| 2 — Bibliografia curada | Primeira versão em 23/10/2026, não validada por médico: 21 afirmações de 4 fontes (perfil lipídico SBP 2020 e SBC 2025, vitamina D pediátrica SBP 2024, hemoglobina OMS 2024), em [curated-statements.json](../modules/clinical-considerations/curated-statements.json), com trecho e página conferidos contra o PDF. O que ficou de fora e por quê está no próprio arquivo (`excluded`); as lacunas estão em [Pendências da bibliografia curada](#pendências-da-bibliografia-curada-23102026). |
| 3 — Formato da saída e conferência pelo código | Comparador feito em 23/10/2026: [compare.ts](../modules/clinical-considerations/compare.ts), com 11 testes em `tests/clinical-considerations.test.cjs`. Ele classifica o valor por afirmação curada, por idade, sexo, jejum e unidade, e devolve o motivo quando não pode classificar. A extração passou a codificar perfil lipídico e 25-OH-vitamina D (instruções `lab-report/3-instructions/3`, migração `20261023000100`). A extração também transcreve o jejum impresso por exame (`fasting_text`, `fasting_hours`); o código decide o estado (12 h ou mais = em jejum; "Sem jejum" = sem jejum; o resto, desconhecido). Falta: a IA escrever o texto e a conferência dos números. |
| 4 — Interface (tela e PDF) | Pendente. |
| 5 — Validação | Pendente. |
| 6 — Consulta regulatória | Pendente; necessária antes de usuários externos. |

Documentos relacionados: o relatório do exame (nível A) está em [exam-comparison.md](exam-comparison.md), os níveis de análise e a regulação em [compliance.md](compliance.md) (FASE 03), e a base de conhecimento com as publicações do médico parceiro em [knowledge-base.md](knowledge-base.md).

## Objetivo

Acrescentar ao relatório do exame uma seção **Considerações Clínicas**, seguida de **Referências Bibliográficas**. A ideia veio de um relatório de exemplo enviado por um médico (amostra privada em `tests/fixtures/private/`; contém identificação de paciente e não deve ser copiada). O exemplo serve só de modelo de formato.

Hoje o relatório só organiza o que está impresso no laudo:

- todos os parâmetros por exame, com valor e referência impressa;
- a situação de cada valor (dentro, acima, abaixo, conferir), calculada pelo código e mostrada em cores;
- as notas do laboratório e o cabeçalho (laboratório, data da coleta, idade e sexo).

A nova seção seria a **primeira parte do app que interpreta resultados**. Por isso ela é nível B.

## Como a seção apareceria

A seção ficaria no fim do relatório, na tela e no PDF enviado pelo WhatsApp, depois das tabelas por exame. Exemplo **fictício** de uma criança de 10 anos:

> **Considerações Clínicas**
>
> **Perfil lipídico.** Colesterol total de 210 mg/dL e LDL de 138 mg/dL. Pela diretriz pediátrica, os dois estão na faixa elevada [1].
>
> **Vitamina D.** 25-OH vitamina D de 26 ng/mL: normal pela referência do laudo e suficiente pela SBP (acima de 20) [2].
>
> **Referências impressas de adulto.** No laudo, LH e progesterona têm faixas para mulheres adultas, e não há linha para a idade da paciente.
>
> **Referências Bibliográficas**
>
> 1. Sociedade Brasileira de Pediatria. Dislipidemia na criança e no adolescente.
> 2. Sociedade Brasileira de Pediatria. Hipovitaminose D em pediatria.

Cada consideração tem um título, um texto curto, os valores do laudo que ela usa e o número das referências. A lista de referências traz só as citadas.

## O que as considerações podem dizer

Há quatro tipos de consideração possíveis. Cada tipo exige mais informação do que o anterior e traz mais risco. **A pergunta principal para o médico parceiro é quais tipos entram.**

| Tipo | Exemplo fictício | De onde vem a informação | Risco |
| --- | --- | --- | --- |
| 1. Agrupamento por tema | "IgE específica elevada para D1 e D2, IgE total de 580 UI/mL e eosinófilos de 7%" | Só do laudo | Baixo |
| 2. Divergência de referência | "Vitamina D normal pelo laudo, suficiente pela SBP e insuficiente pela Endocrine Society"; "a faixa impressa é de adulta" | Laudo e diretrizes | Médio |
| 3. Hipótese ou causa provável | "B12 e vitamina C elevadas, compatíveis com suplementação" | Suposição sobre o paciente | Alto |
| 4. Conduta sugerida | "Repetir o perfil lipídico em jejum e levantar o histórico familiar" | Decisão clínica | Mais alto |

No tipo 3, a IA tende a afirmar coisas que o laudo não permite saber, como estágio de Tanner, ausência de sinais clínicos de toxicidade ou uso de suplemento. Isso só se sabe pelo exame físico ou pela anamnese.

### O que o relatório de exemplo mostrou

O exemplo traz considerações dos quatro tipos e também alguns problemas típicos de texto livre gerado por IA:

- Eosinófilos de 6%, com faixa impressa de 4 a 8%, descritos como "no limite superior".
- "Eutireoidismo confirmado" a partir de um TSH isolado.
- "Tanner I" e "sem sinais clínicos de toxicidade", que não podem ser concluídos de um laudo.
- Diretriz da Endocrine Society citada pela versão de 2011, embora haja versão mais recente, com link para um site particular em vez da revista.
- "Consenso Global" citado no texto, mas ausente da bibliografia.

## Salvaguardas propostas

Mantém a abordagem híbrida da FASE 03: a IA produz o conteúdo, e o código confere antes de mostrar.

1. **Sem texto livre.** A IA devolve cada consideração em formato estruturado: título, tipo (1 a 4), parâmetros citados (pelo identificador da extração), texto e identificadores das fontes.
2. **Os valores são conferidos.** Todo número citado no texto precisa bater com o valor extraído do laudo. Se não bater, a consideração é descartada.
3. **Bibliografia curada.** As fontes vêm de uma lista mantida por nós, por módulo, validada por médico. A IA escolhe fontes dessa lista: não cria referência nem link.
4. **Tipos permitidos.** O código descarta as considerações de tipos que não foram liberados.
5. **Idade e sexo.** A IA recebe só idade e sexo, nunca nome ou CPF, como no PDF atual.
6. **Aviso.** A tela e o PDF dizem que a seção é apoio à interpretação do médico assistente, não laudo nem diagnóstico.

## Regulação

As considerações clínicas são **nível B**. Elas aproximam o app de software como dispositivo médico (ANVISA, RDC 657/2022). Pela decisão registrada em [compliance.md](compliance.md#níveis-de-análise), o nível B não é oferecido a usuários externos antes da consulta a um especialista em regulação sanitária.

Até lá, a proposta é construir as considerações num **módulo próprio em `testing`**, liberado só para a conta de teste. Os exemplos gerados servem para a avaliação do médico parceiro e para levar à consulta regulatória.

## Decisões provisórias (23/10/2026)

Tomadas sem o médico parceiro, sempre pela opção que menos arrisca uma afirmação errada. Cada uma responde a uma das [perguntas para o médico parceiro](#perguntas-para-o-médico-parceiro) e pode ser revista quando ele responder.

| Pergunta | Decisão provisória | Por que é a mais segura |
| --- | --- | --- |
| Tipos de consideração | Só **1 (agrupamento)** e **2 (divergência de referência)**. O código descarta os tipos 3 e 4. | Os dois usam só o laudo e fontes citadas; não supõem nada sobre o paciente nem decidem conduta. |
| Quem compara o valor com a diretriz | O **código**, com os cortes das afirmações curadas. A IA só escreve o texto a partir do resultado da comparação, e o código confere os números. | A comparação fica determinística e testável; a IA não "lê" o corte. |
| Bibliografia inicial | Só **diretrizes oficiais** de sociedades e organismos (SBP, SBC, SBD, OMS e equivalentes), na **versão mais recente**, com DOI ou link do próprio publicador. Cada afirmação traz o trecho exato e a página, marcada "não validada por médico" até a revisão. | Fontes de consenso, verificáveis, sem site particular nem versão superada (problemas do relatório de exemplo). |
| Sem afirmação curada para o caso | Não há consideração do tipo 2 para esse parâmetro. A IA não completa com conhecimento próprio. | Melhor uma lacuna visível do que uma faixa inventada. |
| Publicações do médico parceiro e busca (RAG) | Ficam para depois. O começo usa só as afirmações curadas, sem vetores. | Não depende do médico nem de mais um fornecedor e custo de vetores. |
| Laudo sem referência | A faixa da diretriz **não colore** o valor; aparece só no texto, com a fonte. As cores continuam seguindo só a referência impressa. | Mantém a regra do nível A e separa o que o laboratório disse do que a diretriz diz. |
| Por exame ou consolidado | **Por exame.** A consolidação entre laudos do paciente fica para depois. | Menos inferência sobre a evolução do paciente. |
| Ordem | **Ordem do laudo.** | Ordenar por gravidade já seria um julgamento clínico. |
| Quem vê | Módulo próprio em `testing`, só para a conta de teste. | Como decidido para o nível B. |

## Perguntas para o médico parceiro

- [ ] Quais tipos de consideração entram: 1 (agrupamento), 2 (divergência de referência), 3 (hipótese) e/ou 4 (conduta)?
- [ ] Os tipos 1 e 2 já entregam o valor principal para o médico, ou o valor está no tipo 4?
- [ ] Que diretrizes e fontes formam a bibliografia inicial (ex.: SBP, SBD, SBC, faixas pediátricas)? Quem valida a lista?
- [ ] Quando o laudo não traz referência, a referência da literatura pode ser usada para colorir o valor, ou só aparece como informação?
- [ ] As considerações devem ser por exame, ou consolidadas quando o médico compara vários laudos do mesmo paciente (FASE 04)?
- [ ] Em que ordem as considerações aparecem: por gravidade, por sistema ou na ordem do laudo?

### Pendências da bibliografia curada (23/10/2026)

Pontos da [primeira versão](../modules/clinical-considerations/curated-statements.json) que viraram lacuna, à espera do médico parceiro ou de nova leitura das fontes. Enquanto estiverem abertos, o comparador não classifica as lacunas dos itens 1 e 2 (devolve o motivo). Nos itens 3 e 4, ele usa a escolha provisória (0 a 18 anos; cortes da OMS ao nível do mar, para não gestantes), e a consideração terá de dizer isso.

- [ ] **Lipídios aos 20 anos.** A SBP vai de 2 a 19 anos e a SBC 2025 fala em "adultos > 20 anos". Quem tem 20 anos fica sem afirmação. Os 20 anos entram na faixa adulta?
- [ ] **Buracos nas faixas de vitamina D da AAP** (como reproduzidas pela SBP 2024): de 15 a < 16, de > 20 a < 21 e de > 100 a 150 ng/mL ficam sem classificação. Manter assim, ou arredondar o valor antes de comparar?
- [ ] **Faixa etária da vitamina D pediátrica.** A SBP 2024 não dá faixa numérica para "crianças e adolescentes"; adotamos 0 a 18 anos, como nas doses do mesmo documento. Confirmar.
- [ ] **Hemoglobina pela OMS.** Os cortes são ao nível do mar, sem ajuste para altitude nem tabagismo, e os femininos valem para não gestantes. Basta a consideração avisar isso, ou o corte da OMS não deve aparecer sem esses dados?
- [ ] **Jejum em crianças.** O comparador só considera "em jejum" com 12 h ou mais, como define a SBC 2025; a SBP 2020 não diz quantas horas. Laudo pediátrico com "Jejum: 8 horas" fica com jejum desconhecido e sem classificação de triglicérides, não-HDL e ApoB. Confirmar a definição para crianças.
- [ ] **Endocrine Society.** Ler o texto completo da diretriz de 2024 para confirmar que ela não define limiares de 25(OH)D (hoje confirmado só por fontes secundárias).
- [ ] **Vitamina D de adultos.** Ler o texto completo da SBEM/SBPC 2020 e curar as faixas.

## Decisões

- [x] A seção Considerações Clínicas é nível B e depende da avaliação do médico parceiro (19/10/2026).
- [x] Seguir sem esperar o médico parceiro, com as decisões provisórias mais seguras, e realinhar com ele se o resultado se afastar da prática (23/10/2026).
