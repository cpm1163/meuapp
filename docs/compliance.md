# FASE 03 — Pontos de atenção em laudos laboratoriais

## Estado e escopo

Planejamento iniciado em 02/10/2026. Nenhum código escrito. Este documento deve ser revisado e aprovado antes da implementação.

**Pausada em 02/10/2026:** a fase de perfis ([profiles.md](profiles.md)) passou a ser a FASE 02 e será feita antes. Esta fase, antes numerada como FASE 02, passou a ser a FASE 03. Tudo o que foi decidido aqui continua valendo.

| Passo | Estado atual |
| --- | --- |
| 1 — Escopo e critérios | Escopo revisto e aprovado pelo usuário em 02/10/2026: laudo laboratorial completo, pontos de atenção para o médico, sem interpretação clínica. |
| 2 — Amostras | PDF de laudo completo recebido e analisado em 02/10/2026 (ver [Amostra 1](#amostra-1--laudo-completo-em-pdf)). Foto pendente. |
| 3 — Modelo de dados e RLS | Proposto neste documento, incluindo o catálogo de módulos. |
| 4 — Função de análise | Proposta neste documento. Modelo de IA decidido. |
| 5 — Pontos de atenção | Propostos neste documento; tolerâncias a calibrar com as amostras. |
| 6 — Interface | Pendente. |

As fases anteriores estão em [authentication.md](authentication.md) (FASE 0), [grants.md](grants.md) (FASE 01) e [profiles.md](profiles.md) (FASE 02).

**Histórico do escopo:** o planejamento começou restrito ao hemograma. Em 02/10/2026, depois da análise da primeira amostra, o escopo foi ampliado para o laudo completo, com foco no médico. As verificações específicas do hemograma foram mantidas como complemento.

## Objetivo

Ser uma **rede de segurança para o médico**: num laudo longo, lido com pouco tempo, um ponto importante pode passar despercebido. O app entrega uma lista completa e conferível do que merece atenção no laudo, com a página de origem de cada item.

O app **não diz o que um achado significa**. Ele garante que nada ficou para trás; quem decide a relevância clínica é o médico.

Motivos observados na amostra real:

- O laudo tem dezenas de páginas e exames.
- O laboratório destaca (ícone e cor) apenas exames com faixa de referência simples. Exames cuja referência é uma tabela (por categoria de risco ou por idade e sexo) aparecem **sem marcação**, e o médico precisa ler a tabela de cada um.
- O histórico de resultados anteriores aparece espalhado, exame por exame, ao longo do laudo.

### Público

- **Quem usa é o `user` que contratou o módulo** ([profiles.md](profiles.md)): ele carrega o laudo, pede a análise e vê o resultado. Pode compartilhar o documento com outros `user`s pela FASE 01.
- O resultado é pensado para apoiar quem lê o laudo, normalmente um médico, mas o app não exige perfil profissional nesta fase.

O texto da tela de resultado é escrito para o médico, com linguagem técnica e sem explicações leigas.

### Níveis de análise

| Nível | O que é | Exemplo de formato | Nesta fase |
| --- | --- | --- | --- |
| **A — Achados objetivos** | Organizar o que já está no laudo: valores fora da referência, mudanças em relação ao histórico impresso, notas do laboratório, itens não verificáveis. | "Exame X acima da referência do laboratório (pág. 9)" | **Sim** |
| **B — Interpretação clínica** | A IA atribui significado: hipóteses, riscos, condutas. | "Sugere a condição Y", "considerar investigar Z" | **Não** |

O nível B aproxima o app de software como dispositivo médico (ANVISA, RDC 657/2022), o que pode exigir regularização. Ele só será considerado depois de consulta a especialista em regulação sanitária (ver [Regulação](#regulação)).

### Fora do escopo desta fase

- Interpretação clínica, diagnóstico, hipóteses ou sugestão de conduta (nível B).
- Comparação entre laudos diferentes enviados ao app. Nesta fase, o histórico usado é somente o impresso no próprio laudo.
- Laudos de imagem (raio-X, ultrassom, tomografia) e outros documentos que não sejam laudo laboratorial.
- Conversa livre com a IA sobre o laudo.

## Visão de produto: módulos de análise como skills

Decidido em 02/10/2026 como direção de produto:

- Cada tipo de análise é um **módulo** oferecido ao profissional que usa o app, conforme a especialidade (ex.: pontos de atenção em laudo laboratorial para o clínico; consistência de hemograma para o hematologista; futuros módulos para outras especialidades).
- Tecnicamente, cada módulo é uma **skill personalizada do Claude** (Agent Skills), criada pela API de Skills da Anthropic, com identificador (`skill_id`) e **versões**. A função de análise escolhe a skill pelo `kind` da análise.
- **O laudo laboratorial (nível A) é o primeiro módulo.** O catálogo, a ativação por profissional e a cobrança ficam para depois que este módulo estiver validado com médicos.
- A avaliação regulatória é feita **módulo a módulo**: módulos de nível A primeiro; módulos de nível B dependem da consulta regulatória.

### Abordagem híbrida (proposta)

| Parte do módulo | Onde fica | Motivo |
| --- | --- | --- |
| Conhecimento de leitura: instruções (`SKILL.md`), esquema JSON, tipos de referência, formato numérico brasileiro, exemplos | **Skill** | É o que muda de módulo para módulo; ganha com o versionamento. |
| Regras que geram os pontos de atenção | **Servidor (nosso código)** | Parte crítica da rede de segurança: precisa ser exata, testada no nosso conjunto de testes e auditável, sem depender de o modelo decidir executar um script. |
| Validação da saída | **Servidor** | Toda saída é validada contra o esquema antes de gerar pontos de atenção. |

**`SKILL.md` básico (definido pelo usuário em 02/10/2026):** contém as informações necessárias para o agente executar as tarefas do módulo e gerar os resultados no formato definido. O servidor continua validando a saída e gerando os pontos de atenção.

### Requisitos e pontos a confirmar

Conforme a documentação da API consultada em 02/10/2026:

- Skills na API de mensagens exigem a ferramenta de **execução de código** (contêiner na Anthropic), pelo caminho beta da API com o cabeçalho `code-execution-2025-08-25`.
- Disponível na API direta da Anthropic; não disponível pelo Amazon Bedrock nem pelo Google Vertex AI.
- A confirmar: se a saída estruturada (JSON fixo) funciona junto com a execução de código; custo e tempo de resposta adicionais do contêiner; política de retenção de dados do contêiner e dos arquivos gerados.

### Teste comparativo: com skill × sem skill

Com a amostra 1 como gabarito, rodar a extração (1) com instruções e saída estruturada na própria chamada e (2) com a skill do módulo. Comparar acerto campo a campo, custo e tempo de resposta. Se a skill não piorar nenhum dos três, ela vira o padrão dos módulos; caso contrário, o conhecimento do módulo fica versionado no repositório e é enviado na própria chamada.

### Ciclo de vida de um módulo (FASE 03)

O primeiro módulo já nasce no formato definitivo, para servir de base aos próximos:

1. **Fonte no repositório:** cada módulo tem uma pasta própria (proposta: `modules/<slug>/`, ex.: `modules/lab-report/`) com `SKILL.md`, esquema JSON, regras de referência e exemplos. O repositório é a fonte da verdade; a skill na Anthropic é uma cópia publicada a partir dele.
2. **Testes próprios:** cada módulo tem gabarito e testes automatizados. Só é publicado se passar.
3. **Publicação com versão fixa:** a produção usa uma versão específica da skill, registrada no catálogo, nunca "a mais recente". Mudanças só chegam à produção depois dos testes, e é possível voltar à versão anterior.
4. **Rastreabilidade:** cada análise grava o módulo, a versão do módulo e o modelo de IA que a produziram.

Nesta fase, publicar ou trocar a versão de um módulo é feito pelo desenvolvedor, por script ou migração, sem tela de gestão.

### Gestão de módulos (FASE 02)

Papéis (`user` e `admin`), catálogo de módulos e liberação de módulos pelo `admin` (contratação fora do app) estão em [profiles.md](profiles.md) e são entregues na FASE 02.

## Fluxo proposto

1. O proprietário abre um documento com estado `uploaded` e toca em "Analisar laudo".
2. O app confere se o módulo está liberado para o `user` e se ele aceitou a versão vigente dos termos (FASE 02). Sem isso, a análise não é enviada.
3. O app chama a função de análise no servidor com o identificador do documento. O app nunca chama a IA diretamente e não possui a chave do provedor.
4. A função confere a autorização, marca o documento como `processing`, baixa o arquivo do bucket privado e o envia à IA.
5. A IA devolve **somente a extração**, em formato JSON fixo (saída estruturada), sem opinião.
6. A função valida o JSON, gera os pontos de atenção **em código** e grava o resultado.
7. O documento passa a `ready` (análise concluída) ou `failed` (erro). Proprietário e leitores autorizados veem o resultado.

Divisão de responsabilidades: a IA **lê e transcreve**; o código **compara e aponta**. Comparações ficam em código determinístico e testável. As verificações de consistência também detectam erros de leitura da IA.

## Extração

A IA recebe o laudo inteiro (PDF ou imagem) e devolve:

### Identificação do laudo

| Campo | Observação |
| --- | --- |
| `is_lab_report` | Se o documento é um laudo laboratorial. Se `false`, a análise termina como "documento não reconhecido". |
| `legibility` | `ok`, `partial` ou `unreadable`. Foto ilegível encerra a análise pedindo nova foto. |
| `laboratory` | Nome do laboratório e registro, se impresso. |
| `patient_sex`, `patient_age` | Como impressos no cabeçalho; usados apenas para escolher a linha de tabelas de referência por sexo e idade. |
| `collected_at` | Data e hora da coleta/recebimento. |
| `generated_at` | Data de geração do laudo, se impressa. |
| `executed_exams` | Lista de exames declarada pelo próprio laudo (ex.: "Local de execução do(s) exame(s)"), se houver. |

Nome, documento e demais identificadores da pessoa examinada **não são extraídos**: não são necessários para os pontos de atenção.

### Exames e parâmetros

Para cada exame:

| Campo | Observação |
| --- | --- |
| `exam_name` | Nome como impresso (ex.: "Hemograma com Contagem de Plaquetas"). |
| `pages` | Páginas onde o exame aparece. |
| `material`, `method` | Como impressos. |
| `signed_by`, `responsible` | Lista de responsáveis com registro profissional e data/hora da assinatura. |
| `lab_notes` | Notas técnicas específicas do exame (ex.: liberado por automação, mudança de unidade, cálculo prejudicado em certas condições). **Não** inclui referências bibliográficas. |
| `parameters` | Lista de parâmetros (abaixo). |

Para cada parâmetro:

| Campo | Observação |
| --- | --- |
| `name` | Como impresso. |
| `value` | Número normalizado ou texto qualitativo (ex.: "Ausente", "Negativo"). |
| `unit` | Como impressa. |
| `value_kind` | `numeric` ou `qualitative`. |
| `reference` | Ver tipos de referência abaixo. |
| `lab_flag` | Marcação do próprio laboratório: `within`, `below`, `above` ou `none` (sem marcação). |
| `history` | Resultados anteriores impressos no laudo: data e valor. |
| `page` | Página do resultado. |

**Tipos de referência:**

| Tipo | Exemplo de formato | Como o código trata |
| --- | --- | --- |
| `range` | "4,50 a 5,50" | Compara direto. |
| `upper_limit` | "Inferior a 4,00" | Compara direto. |
| `lower_limit` | "Superior a 90" | Compara direto. |
| `table_by_demographics` | Faixas por sexo e idade | Escolhe a linha pelo sexo e idade do cabeçalho; se não houver correspondência única, marca "conferir no laudo". |
| `table_by_clinical_category` | Metas por categoria de risco | **Não escolhe a linha**: a categoria do paciente é decisão clínica. Mostra o valor e a tabela para o médico conferir. |
| `qualitative` | "Ausente", "Negativo" | Compara texto normalizado. |
| `none` | "Não estabelecido" | Apenas lista o valor. |

A IA transcreve a tabela de referência inteira (`reference_text` e linhas estruturadas); não escolhe linha nem classifica o valor.

**Formato numérico:** laudos brasileiros usam ponto para milhar e vírgula para decimal ("10.810" = 10810). A IA devolve os números normalizados e também o texto original (`value_text`), para conferência.

## Pontos de atenção

O código gera os itens abaixo. Cada item indica exame, parâmetro, página e a regra que o gerou.

1. **Fora da referência:** valor numérico ou qualitativo fora da referência impressa, para os tipos que o código consegue comparar com segurança. Inclui exames **sem marcação do laboratório**.
2. **Conferir tabela:** valor cuja referência depende de categoria clínica ou de tabela sem correspondência única. Mostra o valor e a tabela transcrita.
3. **Mudança desde o exame anterior:** usando o histórico impresso, aponta valores que **entraram ou saíram da faixa de referência** desde o resultado anterior, e mostra o valor anterior com a data em todos os itens já listados. Não há limiar percentual de "mudança relevante", porque esse limiar seria julgamento clínico.
4. **Notas do laboratório:** ressalvas técnicas específicas de cada exame.
5. **Divergência com o laboratório:** quando a marcação do laboratório (`lab_flag`) difere da comparação feita em código. Indica possível erro de leitura e pede conferência no laudo.
6. **Não verificável:** parâmetro ilegível, unidade não reconhecida ou referência que o código não sabe tratar.
7. **Completude da leitura:** compara os exames extraídos com `executed_exams`. Exame declarado no laudo e não extraído gera alerta de leitura incompleta.
8. **Consistência do hemograma** (quando houver hemograma): ver abaixo.

Ordem na tela: fora da referência, conferir tabela, mudanças, divergências e não verificáveis, notas. Itens sem nenhum ponto de atenção não aparecem na lista principal, mas o médico pode expandir a lista completa de exames lidos.

### Consistência do hemograma

| Verificação | Fórmula (unidades usuais) | Tolerância |
| --- | --- | --- |
| VCM | VCM (fL) ≈ Ht (%) ÷ Hm (10⁶/µL) × 10 | a calibrar (amostra 1: 0,02%) |
| HCM | HCM (pg) ≈ Hb (g/dL) ÷ Hm (10⁶/µL) × 10 | a calibrar (amostra 1: 0,10%) |
| CHCM | CHCM (g/dL) ≈ Hb (g/dL) ÷ Ht (%) × 100 | a calibrar (amostra 1: 0,15%) |
| Diferencial | soma dos percentuais ≈ 100% (neutrófilos contados uma vez) | ±2 pontos percentuais |
| Absolutos | absoluto ≈ % × leucócitos totais ÷ 100, para cada tipo | percentual a calibrar **e** piso fixo (ex.: ±1 unidade), por causa do arredondamento de valores pequenos |

Inconsistência gera alerta de possível erro de leitura ou de impressão, com recomendação de conferir o laudo original.

## Apresentação

- Tela de resultado voltada ao médico, em uma rolagem curta, agrupada pelos tipos de ponto de atenção.
- Cada item: exame, parâmetro, valor com unidade, referência, valor anterior com data (quando houver) e página do laudo.
- Botão para abrir o laudo original.
- Aviso fixo: "Lista gerada automaticamente a partir do laudo, sem interpretação clínica. Confira sempre o laudo original."
- Validação no Android pelo Expo Go; iOS quando houver aparelho.

## Modelo de dados proposto

### `document_analyses`

| Campo | Tipo proposto | Finalidade e restrição |
| --- | --- | --- |
| `id` | UUID | Chave primária. |
| `document_id` | UUID | Referência a `documents.id`, com exclusão em cascata. |
| `requested_by` | UUID | Conta que pediu a análise (o proprietário). |
| `module_id` | Texto | Referência a `analysis_modules.id`. Somente `lab-report` nesta fase. |
| `module_version` | Texto | Versão do módulo (skill) usada nesta análise. |
| `status` | Estado controlado | `processing`, `completed`, `failed`. |
| `model` | Texto | Modelo de IA usado, para rastreabilidade. |
| `extraction` | JSON | Saída da IA, já validada contra o esquema. |
| `findings` | JSON | Pontos de atenção gerados em código. |
| `error_code` | Texto, opcional | Motivo da falha (ilegível, não é laudo, erro do provedor). Sem conteúdo do documento. |
| `created_at`, `completed_at` | Data/hora com fuso | Gerados pelo servidor. |

Uma nova análise do mesmo documento cria uma nova linha; o app mostra a mais recente. O cliente não insere nem altera linhas diretamente: tudo passa pela função de análise.

### Catálogo, liberação e aceite de termos

O catálogo `analysis_modules`, as liberações `module_grants` e o aceite de termos por módulo são criados na FASE 02 ([profiles.md](profiles.md)). Esta fase apenas os usa:

- preenche `skill_id` e `active_version` do módulo `lab-report` e o muda para `active` quando estiver validado;
- a função de análise recusa o pedido se o módulo não estiver `active`, se o `user` não tiver liberação ativa ou se não houver aceite da versão vigente dos termos.

O aceite de termos do módulo substitui a tabela `ai_consents` prevista na versão anterior deste plano.

## Matriz de acesso

| Operação | Proprietário com módulo ativo | Proprietário sem módulo | Leitor autorizado | Outro usuário | Sem autenticação |
| --- | --- | --- | --- | --- | --- |
| Pedir análise | Sim | Não | Não | Não | Não |
| Ver resultado da análise | Sim | Sim | **Sim** (decidido em 02/10/2026; manter mesmo sem módulo depende da decisão em [profiles.md](profiles.md)) | Não | Não |
| Excluir análise | Via exclusão do documento | Via exclusão do documento | Não | Não | Não |

Somente o proprietário com o módulo liberado pede análise, porque isso envolve o contrato do módulo e o envio do documento a terceiro. Revogar o compartilhamento bloqueia também o acesso do leitor às análises. Excluir o documento remove suas análises.

## Função de análise (servidor)

Proposta: uma Supabase Edge Function `analyze-document`.

1. Valida o token do usuário e o consentimento vigente.
2. Confere que o usuário é o proprietário e que o documento está em `uploaded`, `ready` ou `failed`.
3. Impede duas análises simultâneas do mesmo documento.
4. Baixa o arquivo do bucket privado com credencial de servidor. Essa credencial ignora RLS, então a autorização dos passos 1 e 2 é obrigatória antes do download.
5. Envia o laudo inteiro à IA com instrução de extração e esquema JSON fixo. Laudos longos geram saída grande: usar streaming e limite de saída alto.
6. Valida a resposta contra o esquema. Resposta inválida, truncada ou recusa do modelo resulta em `failed`, sem gravar extração parcial.
7. Gera os pontos de atenção e grava `document_analyses`.
8. Atualiza o estado do documento.

A chave do provedor de IA fica nos secrets do Supabase, nunca no app nem no repositório. Os logs registram identificadores, tempos, tokens consumidos e códigos de erro, nunca o conteúdo do laudo.

### Modelo de IA

**Decidido em 02/10/2026: Claude Opus 5.5** (`claude-opus-5-5`), da Anthropic, para a versão inicial.

- Lê PDF e imagem diretamente, sem OCR separado, e suporta saída estruturada (JSON fixo). O limite de 10 MB por arquivo fica abaixo do limite da API (32 MB por requisição).
- Motivo: o risco principal da fase é transcrever com exatidão dezenas de valores, inclusive de fotos de celular. O modelo mais capaz reduz esse risco.
- Preço de tabela em 02/10/2026: US$ 4 por milhão de tokens de entrada e US$ 20 por milhão de saída. Com o laudo completo, a entrada e a saída crescem com o número de páginas e de exames; a estimativa grosseira é de algumas dezenas de centavos de dólar por laudo de ~26 páginas. O custo real será medido com a amostra 1.
- O modelo fica configurado somente na função do servidor e é gravado em `document_analyses.model`. Trocar de modelo não exige nova versão do app.

**Redução de custo depois (teste comparativo):** com a amostra 1 como gabarito, rodar o mesmo laudo (PDF e foto) no Claude Sonnet 5.5 (US$ 2 / US$ 10) e no Claude Haiku 4.5 (US$ 1 / US$ 5), conferindo campo a campo. Um modelo mais barato só substitui o Opus 5.5 se acertar todos os campos nos dois formatos. Modelos de outros provedores (Gemini, GPT) podem entrar no mesmo teste se houver interesse.

**Avaliado e não adotado nesta fase: Jev (TypeSafe AI).** Modelo voltado a decisões tipadas em software (escolha, nota e sim/não, com probabilidade e confiança). Não entra nesta fase porque, pela documentação consultada em 02/10/2026, não aceita imagem nem PDF, e as comparações desta fase são regras exatas resolvidas em código. A documentação também não informa retenção de dados, LGPD nem região. Candidato para fases futuras com decisões sem regra exata e em grande volume sobre dados já extraídos (ex.: encaminhar análise para revisão humana, classificar tipo de documento).

## Privacidade e LGPD

Laudos laboratoriais são **dado pessoal sensível** (dado de saúde, art. 5º, II, e art. 11 da LGPD).

- **Aceite dos termos do módulo** (FASE 02): o termo informa que o **laudo completo** é enviado a um provedor de IA externo para extração dos dados, que o resultado pode ser visto pelas pessoas com quem o documento for compartilhado, que o resultado não é diagnóstico e que o `user` responde pela base legal para tratar dados de saúde de terceiros que carregar.
- **Provedor:** pendente verificar e registrar aqui a política de retenção de dados da API escolhida e se os dados enviados são usados para treinamento.
- **Minimização:** a extração não inclui nome, documento e demais identificadores do paciente; apenas sexo e idade, necessários para tabelas de referência.
- **Política de privacidade do app:** precisa mencionar o envio ao provedor de IA antes de qualquer usuário externo usar a função.

## Regulação

- O nível A (achados objetivos) organiza informação já presente no laudo, sem interpretação, e foi escolhido para reduzir o risco regulatório.
- Mesmo assim, por ser um app de saúde voltado a médicos, **recomenda-se consulta a especialista em regulação sanitária antes de oferecer a função a usuários externos**, para confirmar o enquadramento.
- O nível B (interpretação clínica) depende dessa consulta e de eventual regularização na ANVISA.

## Amostras de teste

O usuário forneceu o próprio laudo, sem anonimização. Por conter dado de saúde identificado:

- Os arquivos originais **não são commitados**. Ficam em `tests/fixtures/private/`, já incluída no `.gitignore`.
- Os testes automatizados usarão JSON de extração (gabarito) com os campos de identificação removidos ou substituídos. Esses arquivos podem ser commitados.
- Casos adicionais podem ser criados alterando o JSON (ex.: um VCM inconsistente, um exame faltando, uma marcação divergente), sem novos laudos reais.

## Amostra 1 — laudo completo em PDF

Recebida em 02/10/2026: PDF de laboratório de grande rede, 1,4 MB, **26 páginas**, com camada de texto. Valores e dados pessoais não são reproduzidos aqui.

### O que o laudo real mostrou

1. **Dezenas de exames num só documento**, cada um com cabeçalho, resultado, referência, histórico, notas e assinaturas. O hemograma ocupa a página 1 e parte da página 2.
2. **Exames com referência em tabela não recebem marcação do laboratório.** São justamente os que o médico precisa conferir manualmente; motivo central do objetivo desta fase.
3. **Histórico impresso** para a maioria dos exames (data e resultado anteriores).
4. **Lista de exames executados** na última página ("Local de execução"), útil para a verificação de completude da leitura.
5. **Neutrófilos sem subdivisão** (sem bastonetes e segmentados), com nota de diferencial liberado por automação.
6. **Formato numérico brasileiro** ("10.810 /µL" = 10810).
7. **Referência dupla na série branca:** faixa em % e faixa absoluta.
8. **Vários responsáveis:** quem assinou eletronicamente, o responsável técnico da seção e o responsável geral do laboratório.
9. **Datas distintas:** coleta/recebimento, assinatura e geração do PDF.
10. **Resultados qualitativos** no exame de urina ("Ausente", "Negativo") e referências do tipo "não estabelecido na literatura".

### Contas do hemograma conferidas com os valores impressos

| Verificação | Desvio entre o calculado e o impresso |
| --- | --- |
| VCM | 0,02% |
| HCM | 0,10% |
| CHCM | 0,15% |
| Soma do diferencial | 100,0% exatos |
| Absolutos (5 tipos) | até 0,04%, exceto basófilos: 0,56% (arredondamento de valor pequeno) |

## Critérios de validação

- A amostra 1 é extraída com todos os exames listados em "Local de execução" e todos os parâmetros impressos, conferidos campo a campo com o gabarito.
- Todo valor marcado pelo laboratório como fora da referência aparece como ponto de atenção.
- Exames com referência em tabela clínica aparecem como "conferir tabela", sem que o app escolha a categoria.
- Valores que entraram ou saíram da faixa desde o resultado anterior impresso aparecem como mudança.
- As contas do hemograma fecham dentro das tolerâncias.
- A foto da página do hemograma produz os mesmos valores do PDF para aquela página.
- Um documento que não é laudo laboratorial termina como "documento não reconhecido", sem extração inventada.
- Uma foto ilegível termina pedindo nova foto.
- JSON com exame faltando, marcação divergente ou VCM alterado gera o alerta correspondente (teste automatizado, sem IA).
- B (leitor) vê o resultado mas não consegue pedir análise; C e requisições sem autenticação não acessam análises.
- Revogar o compartilhamento remove o acesso de B às análises; excluir o documento remove as análises.
- Sem liberação ativa do módulo ou sem aceite da versão vigente dos termos, a função recusa a análise.
- A chave do provedor não aparece no bundle do app nem nos logs.
- O resultado não contém interpretação clínica (revisão manual do texto gerado).

## Sequência da FASE 03

1. Revisar e aprovar este documento; decidir as pendências.
2. Receber a foto; montar o gabarito JSON da amostra 1 sem dados pessoais.
3. Migração: `document_analyses`, privilégios, RLS e testes pgTAP. Catálogo, liberações e aceite de termos já existem desde a FASE 02.
4. Pasta `modules/lab-report/` com a primeira versão da skill (instruções, esquema e exemplos) e script de publicação com versão fixa.
5. Geração dos pontos de atenção em código, com testes automatizados a partir do gabarito.
6. Função de análise com o Claude Opus 5.5; testar com as amostras e medir o custo real por laudo.
7. Teste comparativo com skill × sem skill (ver [Visão de produto](#visão-de-produto-módulos-de-análise-como-skills)); decidir o formato padrão dos módulos.
8. Interface: consentimento, botão, progresso e tela de resultado para o médico.
9. Validação no Android com o checklist acima; iOS quando possível.
10. Teste comparativo com Claude Sonnet 5.5 e Claude Haiku 4.5 para reduzir custo.

## Decisões

- [x] Escopo: laudo laboratorial completo, nível A, voltado ao médico (02/10/2026).
- [x] Leitor autorizado vê o resultado da análise (02/10/2026).
- [x] Modelo de IA: Claude Opus 5.5 na versão inicial (02/10/2026). Teste comparativo com modelos mais baratos depois que a análise estiver funcionando.
- [x] Direção de produto: módulos de análise oferecidos por profissional, implementados como skills do Claude; laudo laboratorial é o primeiro módulo (02/10/2026).
- [x] Ciclo de vida dos módulos (fonte no repositório, testes, versão fixa, rastreabilidade) ; catálogo, liberação de módulos e administração na FASE 02, ver [profiles.md](profiles.md) (02/10/2026).
- [ ] Abordagem híbrida (conhecimento na skill, regras no servidor): confirmar após o teste comparativo com skill × sem skill.
- [ ] Consulta a especialista em regulação sanitária antes de usuários externos.
- [ ] Política de retenção do provedor de IA, a verificar e registrar.
- [ ] Texto do termo de consentimento.
- [ ] Tolerâncias das verificações de consistência do hemograma: percentual e piso fixo.
