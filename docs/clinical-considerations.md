# Considerações Clínicas (nível B)

## Estado e escopo

Proposta iniciada em 19/10/2026, em conversa com o usuário. **Nenhum código ainda.** Em 23/10/2026 o usuário decidiu seguir sem esperar o **médico parceiro**, com as [decisões provisórias](#decisões-provisórias-23102026) mais seguras; se o resultado se afastar da prática clínica, realinhamos com ele. Para usuários externos, continua valendo a consulta regulatória ([compliance.md](compliance.md#regulação)).

| Passo | Estado atual |
| --- | --- |
| 1 — Tipos de conteúdo | Decisão provisória: só os tipos 1 e 2 (23/10/2026). Tipo 2 feito no app; tipo 1 feito em 23/10/2026 (ver [Tipo 1](#tipo-1--agrupamento-por-tema-23102026)). |
| 2 — Bibliografia curada | Primeira versão em 23/10/2026, não validada por médico: 21 afirmações de 4 fontes (perfil lipídico SBP 2020 e SBC 2025, vitamina D pediátrica SBP 2024, hemoglobina OMS 2024), em [curated-statements.json](../modules/clinical-considerations/curated-statements.json), com trecho e página conferidos contra o PDF. O que ficou de fora e por quê está no próprio arquivo (`excluded`); as lacunas estão em [Pendências da bibliografia curada](#pendências-da-bibliografia-curada-23102026). |
| 3 — Formato da saída e conferência pelo código | Comparador feito em 23/10/2026: [compare.ts](../modules/clinical-considerations/compare.ts), com 11 testes em `tests/clinical-considerations.test.cjs`. Ele classifica o valor por afirmação curada, por idade, sexo, jejum e unidade, e devolve o motivo quando não pode classificar. A extração passou a codificar perfil lipídico e 25-OH-vitamina D (instruções `lab-report/3-instructions/3`, migração `20261023000100`). A extração também transcreve o jejum impresso por exame (`fasting_text`, `fasting_hours`); o código decide o estado (12 h ou mais = em jejum; "Sem jejum" = sem jejum; o resto, desconhecido). Publicado no remoto em 23/10/2026: migração aplicada com `db push --linked` (conferida em `migration list`) e funções `analyze-document` e `collect-analyses` publicadas juntas. Validado com a amostra 1 no Android em 23/10/2026: os 6 parâmetros lipídicos e a 25-OH-vitamina D vieram com o código certo, VLDL ficou sem código, e o jejum ficou vazio, corretamente, porque o laudo imprime as referências com e sem jejum mas não o jejum da coleta. Comparador sobre a extração real (homem, 63 anos): colesterol total acima do valor referencial (SBC 2025), HDL desejável, hemoglobina no corte da OMS ou acima; LDL, não-HDL e vitamina D sem afirmação; triglicérides sem classificação (jejum desconhecido). Falta: a IA escrever o texto e a conferência dos números. |
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

## Expectativa do usuário (23/10/2026, fim do dia) — retomar daqui

Conversa de alinhamento depois do teste do tipo 1. **O formato atual (frases montadas pelo código, com cara de tabela) não é o esperado.** O que o usuário espera das considerações:

1. **Texto corrido, escrito pela IA**, como um médico escreveria: "o colesterol total e o LDL estão elevados", e não a lista de valores, que já está nas tabelas.
2. **A constatação segue a referência impressa no próprio laudo** para o sexo e a idade do paciente (a mesma classificação do nível A, que dá as cores).
3. **Depois da constatação, o enquadramento que a literatura dá ao achado**: em que categoria o valor cai e que grau de comprometimento ele representa (ex.: HbA1c de 5,7% no limite inferior da faixa de risco aumentado para diabetes da SBD; LDL de 185 perto do corte de 190 mg/dL da SBC 2025). Não é hipótese sobre o paciente nem conduta.
4. **Números podem aparecer como apoio**, mas o que importa é o que eles significam.

Consequências combinadas:

- A IA escreve; **o código confere cada afirmação**: a situação dita (alto, baixo, dentro) tem de bater com a classificação do código, e os números e fontes têm de bater com o laudo e com a bibliografia curada. Frase que não bate é descartada.
- **O enquadramento da literatura só pode vir da bibliografia curada**, com trecho e página. A qualidade das considerações passa a depender dela: **ampliar a bibliografia, sobretudo para adultos** (SBD para glicemia e HbA1c, SBEM/SBPC para vitamina D, categorias da SBC, gravidade da anemia da OMS etc.), vira a tarefa principal.
- Isso se aproxima de diagnóstico (enquadramento clínico): em teste com a conta do usuário, sim; para outros médicos, só depois da consulta regulatória e, de preferência, do médico parceiro.
- O que já existe continua como base: comparador, bibliografia curada, conferência pelo código e o agrupamento por tema (que pode virar a estrutura dos parágrafos). Muda a última camada: o texto passa a ser da IA, conferido pelo código.

Próximos passos ao retomar: (1) desenhar o formato da saída da IA (parágrafo por tema, com as afirmações marcadas para a conferência); (2) ampliar a bibliografia curada para os temas de adultos da amostra 1; (3) implementar e testar com a amostra 1. Ainda falta ver o primeiro agrupamento por tema rodar com dados reais (função `group-analysis` publicada em 23/10/2026, não exercitada).

## Leitura do estado do paciente, como rascunho do médico (26/10/2026)

Decidido pelo usuário em 26/10/2026. As considerações passam a ser uma **análise sucinta do estado do paciente a partir dos resultados** (interpretação clínica, nível B completo), sob quatro condições:

1. **Só para o médico**, nunca para o paciente.
2. **É um rascunho**: o médico lê, pode corrigir e assume o texto.
3. **Tudo com fonte**: cada afirmação apoiada na bibliografia curada e conferida pelo código.
4. **Só na conta de teste** até a consulta regulatória e a avaliação do médico parceiro.

Conduta e prescrição continuam fora.

Fluxo do rascunho:

- **A IA gera uma vez** e o texto aparece marcado "Rascunho — não revisado". Frases que o código não confere saem do texto. **Não há "gerar de novo"**: o foco é a edição pelo médico.
- **O médico pode editar o texto livremente e apagar frases**, se achar necessário. Editar é opcional.
- **O PDF só leva as considerações depois do toque em "Aprovar"**, com ou sem edição. Sem aprovação, o PDF sai só com os pontos de atenção e as tabelas.
- A aprovação registra que o médico leu e assumiu o texto ("Revisado pelo médico em <data>"). O app guarda a versão original da IA e a aprovada, para auditoria.

### Significado, não constatação (26/10/2026)

Decidido pelo usuário em 26/10/2026, **mudando o item 3 de 23/10** (que excluía hipóteses). Constatar ("LDL elevado", "insulina elevada") não basta: as considerações dizem **o que o conjunto dos resultados significa**, **sem repetir números** (já estão nas tabelas). Exemplo aprovado pelo usuário:

> A hemoglobina glicada na faixa de risco aumentado, junto com a insulina elevada, é compatível com resistência à insulina, situação que a SBD associa a maior risco de progressão para diabetes tipo 2 [1]. Somada ao LDL elevado, compõe um perfil de risco cardiometabólico aumentado [2]. A discreta elevação de leucócitos, isolada, tem pouco significado clínico e costuma acompanhar processos inflamatórios ou alérgicos transitórios [3]. A filtração renal levemente reduzida corresponde à categoria G2 do KDIGO, que só caracteriza doença renal crônica se persistir por mais de 3 meses ou vier com outro marcador de lesão renal [4].

Regras para as hipóteses:

- **Todo significado vem da bibliografia curada**, com trecho e página; a IA não infere significado sem fonte.
- **Linguagem de hipótese**: "compatível com", "associado a", nunca "o paciente tem".
- **O código confere as premissas** de cada frase (ex.: "insulina elevada" exige insulina acima da referência).
- **Continuam fora**: conduta, exames a pedir e tratamento.
- Valem as quatro condições acima (só médico, rascunho aprovado, fonte em tudo, só a conta de teste).

Consequência: a bibliografia curada precisa trazer, além das faixas, **o significado dos conjuntos** (ex.: quando glicada e insulina elevadas indicam resistência à insulina; categorias G do KDIGO; leucocitose isolada). O exemplo acima é ilustrativo: cada significado só entra com trecho e página verificados na fonte.

### Formato da saída: o código escolhe o que pode ser dito, a IA escreve (26/10/2026)

Aprovado pelo usuário em 26/10/2026.

1. **Fichas de significado na bibliografia curada**, além das faixas: premissas (ex.: glicada na faixa de risco aumentado + insulina acima da referência), texto-base do significado, fonte, página e trecho.
2. **O código seleciona as fichas aplicáveis**: só as que têm todas as premissas confirmadas pelos resultados vão para a IA.
3. **A IA escreve o texto corrido**, um parágrafo por tema, usando só essas fichas, e indica a ficha que apoia cada frase.
4. **O código confere cada frase** e descarta a que: não indica ficha aplicável; tem números; fala de exame fora das premissas; diz "elevado/reduzido" em desacordo com a classificação; traz conduta (solicitar, tratar, iniciar, recomenda-se…). As referências [n] são postas pelo código a partir das fichas.
5. O resultado vira o **rascunho** que o médico edita e aprova.

**Resultado alterado sem ficha: análise da IA, separada e declarada.** O texto tem duas partes, nunca misturadas:

- **Com base na bibliografia curada**: o texto principal, com referências verificadas.
- **Análise da IA, sem fonte verificada**: bloco à parte, com outra cor e o aviso "Os achados abaixo não têm significado na bibliografia selecionada pelo app. O texto foi escrito pela IA com base em conhecimento geral e não foi conferido em diretriz."

Travas do bloco da IA: **não cita referências** (risco de referência inventada); o código confere premissas, ausência de números e de conduta; linguagem de hipótese ("pode estar associado a…"); **cada uso é registrado como candidato a ficha**, para orientar a ampliação da bibliografia. O bloco pode ser desligado sozinho se a consulta regulatória pedir.

**Temas sem diretriz formal (hemograma), decidido em 26/10/2026: os dois.** Revisões publicadas (ex.: StatPearls, JAAPA 2026 sobre leucocitose) podem sustentar fichas, identificadas como revisão e não diretriz; o que nem a revisão sustentar vai para o bloco da IA.

Fontes da amostra 1 em `tests/fixtures/private/bibliografia/` (fora do git), baixadas em 26/10/2026: KDIGO 2024 (CKD, Kidney Int 105(4S)), SBC 2025 (dislipidemias) e o capítulo público "Diagnóstico de diabetes mellitus" da Diretriz SBD (revisão de 09/07/2024, DOI 10.29327/5412848.2024-1; o PDF completo da edição 2025 é protegido). Para HOMA-IR, a revisão Geloneze e Tambascia, Arq Bras Endocrinol Metab 2006 (corte 2,71 do estudo BRAMS, p. 211).

Primeiras fichas em [curated-meanings.json](../modules/clinical-considerations/curated-meanings.json) (rascunho de 26/10/2026, não validado por médico): HbA1c na faixa de pré-diabetes (SBD), HOMA-IR acima de 2,71 e associação com aterosclerose (revisão), G2 com A1 sem critério de DRC (KDIGO, p. S137), colesterol total acima do referencial (SBC, p. 14). Hemograma, pela revisão Riley e Rupert, Am Fam Physician 2015: leucócitos acima da referência sem atingir a definição usual de leucocitose em adultos, leucocitose reativa, eosinofilia pela contagem absoluta e linfócitos reduzidos só no percentual. Sem ficha na amostra 1, indo para o bloco da IA: insulina isolada, LDL e não-HDL (alvo depende do risco). Neutrofilia (> 7.700/µL) e causas alérgicas de eosinofilia leve vieram de StatPearls, "Leukocytosis" (Mank e Killeen, atualizado em 15/06/2026), salvo pelo usuário no navegador porque o NCBI bloqueia download automático (captcha). Os códigos hba1c, homa_ir, egfr e urine_acr ainda precisam entrar na extração.

## Implementação do rascunho (26/10/2026, branch dev20)

Decidido pelo usuário em 26/10/2026: o texto novo **substitui** as seções "Por tema" e "Comparação com diretrizes" no app e no PDF (o código dos tipos 1 e 2 fica no repositório até a validação); o rascunho é gerado por **botão** ("Gerar considerações"), uma vez por análise. Com isso, abrir uma análise deixou de chamar a IA do agrupamento por tema.

**Restrição de custo (26/10/2026): nenhum custo extra.** Nada que gere cobrança (chamada de IA, reanálise, build EAS) acontece sem confirmação explícita do usuário. Tudo abaixo foi feito e testado localmente, com dados fictícios e respostas simuladas da IA.

Feito em código:

- Extração: códigos `fasting_glucose`, `hba1c`, `insulin`, `homa_ir`, `egfr` e `urine_acr` ([instructions.ts](../modules/lab-report/instructions.ts), versão `lab-report/3-instructions/4`; migração `20261026000100`).
- Seleção das fichas: [meanings.ts](../modules/clinical-considerations/meanings.ts) (premissas por faixa na unidade da ficha ou por situação contra a referência impressa; idade e sexo do laudo, completados pelo cadastro). Números são proibidos no texto, exceto nomes de categoria (G2, A1, tipo 2).
- Escrita e conferência: [writing.ts](../modules/clinical-considerations/writing.ts). A IA recebe idade, sexo, nomes, situação e fichas, nunca valores. Frases descartadas: sem ficha válida, com números, conduta ou certeza sobre o paciente, "elevado/reduzido" sem parâmetro daquele lado; no bloco sem fonte, também citação de diretriz ou sociedade e parâmetro fora da lista sem ficha.
- Servidor: tabela `analysis_considerations` (rascunho original da IA, texto aprovado e data; migração `20261026000200`) e função `write-considerations` (reserva no banco, uma chamada, sem retentativa, fallback do servidor em recusa). Conferida com `deno check`.
- App: seção com o botão, o rascunho marcado "Rascunho — não revisado", o bloco da IA em amarelo-areia, **Editar** (texto livre) e **Aprovar**; o PDF leva só o texto aprovado, com "Revisado pelo médico em <data>" e as referências.

Falta, e só com confirmação do usuário: publicar as duas migrações e as funções `analyze-document`, `collect-analyses` e `write-considerations` (sem custo no plano gratuito do Supabase) e o teste real (1 reanálise da amostra 1 + 1 chamada das considerações, pagos com o saldo pré-pago da API).

### Primeiro teste real (27/10/2026)

Amostra 1, extração já com Haiku 5.5 (chamada direta, ver [compliance.md](compliance.md)). Considerações no Opus 5.5: **15 s**, 3 mil tokens de entrada e 1,5 mil de saída (cerca de US$ 0,04). A conferência descartou 1 frase.

- **Funcionou:** 4 temas com fonte (metabolismo glicêmico, função renal, perfil lipídico, hemograma), sem números além das categorias G2 e A1, tom equilibrado; bloco sem fonte só para LDL e não-HDL (dependem da categoria de risco).
- **Cobertura:** dos 12 pontos de atenção (10 fora da referência e 2 de conferência em tabela), 11 aparecem. **Falta a insulina** (valor isolado): só aparece indiretamente pelo HOMA-IR. Hipótese: era a frase descartada; o texto descartado não é guardado, então não dá para confirmar.

**Pendências a corrigir:**

1. **Todo ponto de atenção deve aparecer** nas considerações, com ficha ou no bloco sem fonte. Proposta: o código confere a cobertura depois da escrita e, se faltar um parâmetro, o lista ao médico ("Sem consideração: Insulina").
2. **Guardar o motivo do descarte** (não o texto inteiro, se não for necessário) para diagnosticar casos como o da insulina.
3. **Redação:** "Pode ser útil avaliar as alterações dos leucócitos pela contagem absoluta…" soa como conduta; "…acima da referência **indicam** aumento das frações aterogênicas" (bloco sem fonte) é afirmativo demais ("correspondem a" seria mais neutro). Avaliar ajuste nas fichas ou nas regras de conferência.
4. **Extensão:** o hemograma ficou com 8 frases, contra 2 a 5 nos outros temas.
5. **Origem dos dados:** a extração veio do Haiku; conferir contra os gabaritos da amostra 1 (`tests/fixtures/private/`) antes de avaliar a escolha das fichas.
6. **Unidade repetida (extração do Haiku):** o PDF mostra "261 mg/dL mg/dL", "5,7 % %", "8 µL µL", "2,13 mg/g de Creatinina mg/g de Creatinina": o valor transcrito já traz a unidade. **Corrigido em 27/10/2026** no app e no PDF: `valueWithUnit` ([findings-text.ts](../src/features/analyses/findings-text.ts)) não repete a unidade quando o valor já termina com ela; vale também para análises antigas.
7. **Linha espúria no hemograma:** "Leucócitos 100 % %, sem referência" (o total do diferencial lido como parâmetro). **Corrigido em 27/10/2026:** valor e referência iguais a 100 % saem das tabelas (`isDifferentialTotal` em [report.ts](../src/features/analyses/report.ts)).

**PDF (27/10/2026): aprovado no teste.** Traz só o texto aprovado, "Revisado pelo médico em 27/10/2026", as referências numeradas batendo com o texto e o bloco "Análise da IA, sem fonte verificada" separado. Aprovação sem edição também funcionou.

## Tipo 1 — agrupamento por tema (23/10/2026)

Decidido pelo usuário em 23/10/2026, depois de comparar com o relatório de exemplo: **a IA só agrupa, o código escreve**, e o agrupamento vem **automaticamente** com as considerações, sem botão.

- **O que a IA recebe:** só id, nome do exame, nome do parâmetro e unidade. Nenhum valor, referência, idade, sexo ou identificação. Ela devolve temas (título e ids), em saída estruturada (`output_config.format`).
- **O que o código confere** (`modules/clinical-considerations/grouping.ts`): ids existentes e sem repetição; título de até 60 caracteres e sem palavras de diagnóstico, causa, risco, resultado ou conduta. Tema com título recusado e parâmetros deixados de fora vão para "Outros exames".
- **O que o código escreve:** em cada tema, os parâmetros fora da referência impressa (valor e situação), os que estão dentro e os sem comparação automática, pela mesma classificação do relatório (nível A).
- **Quando:** o app pede o agrupamento ao abrir uma análise pronta de quem tem o módulo de considerações. A função `group-analysis` autoriza pelo banco (`start_analysis_grouping`: dono, análise pronta, módulo liberado), faz **uma chamada síncrona** (Opus 5.5, esforço baixo, sem nova tentativa automática, com fallback do servidor em caso de recusa) e grava o resultado (`analysis_groupings`, migração `20261023000300`, 16 testes pgTAP). **No máximo uma chamada por análise**: falha não é repetida automaticamente; só uma tentativa abandonada em andamento (mais de 15 minutos) pode recomeçar.
- **Custo:** a entrada é só a lista de nomes (poucos milhares de tokens), por análise aberta uma vez. Os tokens ficam na própria linha do agrupamento e no log. Pendência: eles somem se a análise for excluída, ao contrário de `analysis_usage`.

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
