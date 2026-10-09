# FASE 03 — Pontos de atenção em laudos laboratoriais

## Estado e escopo

Planejamento iniciado em 02/10/2026. Implementação iniciada em 05/10/2026: tabela de análises (local e remoto) e esquema + pontos de atenção do módulo `lab-report`. O módulo continua em `draft` no remoto.

**Onde retomar (08/10/2026):** passo 6 da [sequência](#sequência-da-fase-03), a Edge Function `analyze-document` com o `SKILL.md` e o teste com o gabarito real, começando pelas [travas de custo](#travas-de-custo). **A chave da API está resolvida** (ver [Conta e chave da API](#conta-e-chave-da-api)).

**Pausada em 02/10/2026:** a fase de perfis ([profiles.md](profiles.md)) passou a ser a FASE 02 e será feita antes. Esta fase, antes numerada como FASE 02, passou a ser a FASE 03. Tudo o que foi decidido aqui continua valendo.

| Passo | Estado atual |
| --- | --- |
| 1 — Escopo e critérios | Escopo revisto e aprovado pelo usuário em 02/10/2026: laudo laboratorial completo, pontos de atenção para o médico, sem interpretação clínica. |
| 2 — Amostras | PDF de laudo completo recebido e analisado em 02/10/2026 (ver [Amostra 1](#amostra-1--laudo-completo-em-pdf)). Foto pendente. |
| 3 — Modelo de dados e RLS | Migração `20261005000100_document_analyses.sql` aplicada no Supabase local e, depois de `--dry-run` que listou apenas ela, no **remoto** em 05/10/2026; `migration list` conferido. 45/45 asserções pgTAP (`supabase/tests/analyses_rls.test.sql`), 148/148 no total. |
| 4 — Função de análise | Proposta neste documento. Modelo de IA decidido. |
| 5 — Pontos de atenção | Implementados em `modules/lab-report/findings.ts` em 05/10/2026, com esquema de extração (`extraction.schema.json`) e testes sobre laudo fictício (`tests/lab-report.test.cjs`). Tolerâncias do hemograma provisórias, a calibrar. Esquema `lab-report/2` (laudo misto) em 08/10/2026, com 19 testes. |
| 6 — Interface | Primeira versão em 08/10/2026: botão "Análise" no documento, tela `src/app/analysis.tsx` com confirmação de envio, limite diário restante, espera pelo lote (verificação a cada minuto) e resultado agrupado por tipo de ponto de atenção, com o aviso fixo e o botão para abrir o laudo original. Textos em `src/features/analyses/findings-text.ts`, com 4 testes. Módulo `lab-report` em `testing` no remoto desde 08/10/2026 (migração `20261008000300`). Falta validar no Android com o laudo real. |

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
- Laudos descritivos (ultrassom, raio-X, tomografia, anatomopatológico etc.). Ficam para a FASE 05 ([descriptive-report.md](descriptive-report.md)); num laudo misto, esta fase só os lista (ver [Ajuste por laudo misto](#ajuste-por-laudo-misto)).
- Conversa livre com a IA sobre o laudo.

## Visão de produto: módulos de análise como skills

Decidido em 02/10/2026 como direção de produto:

- Cada tipo de análise é um **módulo** oferecido ao profissional que usa o app, conforme a especialidade (ex.: pontos de atenção em laudo laboratorial para o clínico; consistência de hemograma para o hematologista; futuros módulos para outras especialidades).
- Tecnicamente, cada módulo é uma **skill personalizada do Claude** (Agent Skills), criada pela API de Skills da Anthropic, com identificador (`skill_id`) e **versões**. A função de análise escolhe a skill pelo `kind` da análise.
- **O laudo laboratorial (nível A) é o primeiro módulo.** O catálogo, a liberação por `user` e a solicitação de módulos já existem desde a FASE 02 ([profiles.md](profiles.md)); a contratação e o pagamento ficam fora do app.
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
7. O documento passa a `ready` (análise concluída) ou `failed` (erro). Só o proprietário vê o resultado, salvo se ele decidir compartilhar a análise.

Divisão de responsabilidades: a IA **lê e transcreve**; o código **compara e aponta**. Comparações ficam em código determinístico e testável. As verificações de consistência também detectam erros de leitura da IA.

## Extração

A IA recebe o laudo inteiro (PDF ou imagem) e devolve:

### Identificação do laudo

| Campo | Observação |
| --- | --- |
| `has_lab_exams` | Se o documento tem ao menos um exame laboratorial. Se `false`, a análise termina com `no_lab_exams` ("nenhum exame laboratorial encontrado"), e o documento continua guardado. Até `lab-report/1` era `is_lab_report`. |
| `other_exams` | Exames não laboratoriais do mesmo documento (laudo misto): nome, tipo (`descriptive` ou `other`) e páginas, sem transcrição. Ver [Ajuste por laudo misto](#ajuste-por-laudo-misto). |
| `legibility` | `ok`, `partial` ou `unreadable`. Foto ilegível encerra a análise pedindo nova foto. |
| `laboratory` | Nome do laboratório e registro, se impresso. |
| `patient_sex`, `patient_age` | Como impressos no cabeçalho; usados apenas para escolher a linha de tabelas de referência por sexo e idade. |
| `collected_at` | Data e hora da coleta/recebimento. |
| `generated_at` | Data de geração do laudo, se impressa. |
| `executed_exams` | Lista de exames declarada pelo próprio laudo (ex.: "Local de execução do(s) exame(s)"), se houver. |

Nome, documento e demais identificadores da pessoa examinada **não são extraídos**: não são necessários para os pontos de atenção.

### Ajuste por laudo misto

Decidido em 08/10/2026: é comum um mesmo PDF trazer exames laboratoriais e descritivos (ex.: hemograma e ultrassom no mesmo arquivo baixado do laboratório). A classificação passa a ser **por exame**. Implementado em 08/10/2026 no esquema `lab-report/2`:

- `is_lab_report` foi substituído por `has_lab_exams`: "o documento tem ao menos um exame laboratorial". Se `false`, a análise termina com `no_lab_exams`, e o documento continua guardado. Um documento ilegível termina com `unreadable`, que é verificado antes.
- Novo campo `other_exams[]`: `{ exam_name, kind, pages }`, com `kind` igual a `descriptive` ou `other`. Esses exames são listados, mas não transcritos.
- Cada exame de `other_exams` gera o ponto de atenção `not_analyzed` (`descriptive_exam` ou `other_exam`), com a página. A interface mostra "análise ainda não disponível para este tipo".
- Um exame declarado em `executed_exams` e listado em `other_exams` não gera alerta de leitura incompleta. Se não estiver em nenhuma das duas listas, o alerta continua.
- Testes com laudo misto fictício em `tests/lab-report.test.cjs`.

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

Implementação: `modules/lab-report/` contém o esquema de extração (`extraction.schema.json`, só com as palavras-chave aceitas pela saída estruturada), o verificador do esquema (`schema-check.ts`) e as regras (`findings.ts`). Os dois arquivos `.ts` não têm dependências, para rodar iguais na Edge Function e nos testes. Cada ponto de atenção é gravado como dado (`kind`, `reason`, exame, parâmetro, página, valor, referência, marcação do laboratório, valor anterior); o texto em português é montado na tela.

Complementos ao esquema decididos na implementação: `code` identifica os parâmetros do hemograma (percentual e absoluto do diferencial são parâmetros separados); a referência traz `low_inclusive`/`high_inclusive` ("inferior a 4,00" exclui o 4,00); `/mm³` e `/µL` são tratados como a mesma unidade; se o código não consegue comparar mas o laboratório marcou o valor, a marcação vira ponto de atenção (`flagged_by_lab`).

O código gera os itens abaixo. Cada item indica exame, parâmetro, página e a regra que o gerou.

1. **Fora da referência:** valor numérico ou qualitativo fora da referência impressa, para os tipos que o código consegue comparar com segurança. Inclui exames **sem marcação do laboratório**.
2. **Conferir tabela:** valor cuja referência depende de categoria clínica ou de tabela sem correspondência única. Mostra o valor e a tabela transcrita.
3. **Mudança desde o exame anterior:** usando o histórico impresso, aponta valores que **entraram ou saíram da faixa de referência** desde o resultado anterior, e mostra o valor anterior com a data em todos os itens já listados. Não há limiar percentual de "mudança relevante", porque esse limiar seria julgamento clínico.
4. **Notas do laboratório:** ressalvas técnicas específicas de cada exame.
5. **Divergência com o laboratório:** quando a marcação do laboratório (`lab_flag`) difere da comparação feita em código. Indica possível erro de leitura e pede conferência no laudo.
6. **Não verificável:** parâmetro ilegível, unidade não reconhecida ou referência que o código não sabe tratar.
7. **Completude da leitura:** compara os exames extraídos com `executed_exams`. Exame declarado no laudo e não extraído gera alerta de leitura incompleta.
8. **Não analisado:** exame não laboratorial do mesmo documento (laudo misto), listado em `other_exams`. Ver [Ajuste por laudo misto](#ajuste-por-laudo-misto).
9. **Consistência do hemograma** (quando houver hemograma): ver abaixo.

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
- Validação no Android em development build ([dev-build.md](dev-build.md)), feita uma única vez, quando a captura de fotos estiver pronta; iOS quando houver aparelho.

## Modelo de dados

### `document_analyses`

Implementado em `supabase/migrations/20261005000100_document_analyses.sql`.

| Campo | Tipo proposto | Finalidade e restrição |
| --- | --- | --- |
| `id` | UUID | Chave primária. |
| `document_id` | UUID | Referência a `documents.id`, com exclusão em cascata. |
| `requested_by` | UUID | Conta que pediu a análise (o proprietário). |
| `module_id` | Texto | Referência a `analysis_modules.id`. Somente `lab-report` nesta fase. |
| `module_version` | Texto | Versão do módulo (skill) usada nesta análise (`analysis_modules.active_version` no momento do pedido). |
| `terms_version` | Texto | Versão dos termos aceita quando a análise foi pedida. |
| `status` | Estado controlado | `processing`, `ready`, `failed`. No máximo uma análise `processing` por documento. |
| `model` | Texto | Modelo de IA usado, para rastreabilidade. |
| `extraction` | JSON (objeto) | Saída da IA, já validada contra o esquema. Só em `ready`. |
| `findings` | JSON (lista) | Pontos de atenção gerados em código. Só em `ready`. |
| `failure_reason` | Texto, opcional | Código da falha, obrigatório em `failed` (ex.: `unreadable`, `not_lab_report`, `provider_error`, `timeout`). Sem conteúdo do documento. |
| `shared_at` | Data/hora, opcional | Preenchido quando o proprietário compartilha a análise; só em `ready`. |
| `created_at`, `completed_at` | Data/hora com fuso | Gerados pelo servidor. |

Uma nova análise do mesmo documento cria uma nova linha; o app mostra a mais recente. O cliente não insere nem altera linhas diretamente. As escritas passam por estas funções:

| Função | Quem chama | O que faz |
| --- | --- | --- |
| `start_document_analysis(document_id, module_id)` | Função de análise, **com o token do usuário** | Confere `can_use_module`, a propriedade e o estado do documento; recusa se já houver análise em andamento (`analysis_in_progress`); cria a linha `processing` e marca o documento como `processing`. Uma análise parada há mais de 15 minutos é encerrada como `timeout` e não bloqueia a nova. |
| `complete_document_analysis(analysis_id, extraction, findings, model)` | Só o servidor (`service_role`) | Grava o resultado e marca o documento como `ready`. |
| `fail_document_analysis(analysis_id, reason, model)` | Só o servidor (`service_role`) | Grava a falha e marca o documento como `failed`. |
| `set_analysis_shared(analysis_id, shared)` | App, pelo proprietário | Compartilha ou deixa de compartilhar uma análise `ready`. |

Se o proprietário começar a excluir o documento durante a análise, o documento continua em `deleting`; a conclusão não o devolve a `ready`.

**Compartilhamento (decidido em 05/10/2026):** um único botão "Compartilhar esta análise" na tela de resultado. A análise compartilhada fica visível para quem já lê o documento pela FASE 01; não há lista separada de pessoas. Deixar de compartilhar, ou revogar o compartilhamento do documento, remove o acesso.

### Catálogo, liberação e aceite de termos

O catálogo `analysis_modules`, as liberações `module_grants` e o aceite de termos por módulo são criados na FASE 02 ([profiles.md](profiles.md)). Esta fase apenas os usa:

- preenche `skill_id` e `active_version` do módulo `lab-report` e o muda para `active` quando estiver validado;
- a função de análise recusa o pedido se o módulo não estiver em `testing` ou `active` (decidido em 05/10/2026: `testing` libera a análise para quem tem liberação, para testar antes de abrir a todos), se o `user` não tiver liberação ativa ou se não houver aceite da versão vigente dos termos.

O aceite de termos do módulo substitui a tabela `ai_consents` prevista na versão anterior deste plano.

## Matriz de acesso

| Operação | Proprietário com módulo ativo | Proprietário sem módulo | Leitor autorizado | Outro usuário | Sem autenticação |
| --- | --- | --- | --- | --- | --- |
| Pedir análise | Sim | Não | Não | Não | Não |
| Ver resultado da análise | Sim | Sim | **Só se o proprietário compartilhar a análise** (decidido em 03/10/2026, ver [profiles.md](profiles.md)) | Não | Não |
| Excluir análise | Via exclusão do documento | Via exclusão do documento | Não | Não | Não |

Somente o proprietário com o módulo liberado pede análise, porque isso envolve o contrato do módulo e o envio do documento a terceiro. Compartilhar o documento **não** compartilha as análises: a análise é de quem a pediu, e compartilhá-la é uma decisão separada do proprietário (botão único por análise, ver [`document_analyses`](#document_analyses)). Revogar o compartilhamento bloqueia também o acesso do leitor às análises que tiverem sido compartilhadas. Excluir o documento remove suas análises.

## Função de análise (servidor)

**Implementada em 08/10/2026, em lote** (Message Batches API da Anthropic). Uma Edge Function para em **150 s** no plano gratuito do Supabase, e a resposta de um laudo longo leva minutos. Por isso a análise foi dividida em duas funções (decidido pelo usuário em 08/10/2026). O lote também custa **50% menos**. Em troca, o resultado não sai na hora: a maioria dos lotes termina em até 1 hora, e o máximo é 24 horas.

**`analyze-document`** (`supabase/functions/analyze-document/`), chamada pelo app com o identificador do documento:

1. Valida a sessão do usuário no servidor de autenticação.
2. Chama `start_document_analysis` **com o token do usuário**. No banco, essa função confere módulo, liberação, termos, propriedade, estado do documento e o [limite diário](#travas-de-custo), e impede duas análises simultâneas.
3. Se o passo 2 recusar, devolve o motivo ao app (ex.: `module_not_available`, `analysis_in_progress`, `daily_limit_reached` com a data da próxima vaga) e para, sem baixar o arquivo.
4. Confere que a versão das instruções gravada no catálogo (`analysis_modules.active_version`) é a mesma do código (`INSTRUCTIONS_VERSION`). Se não for, a análise falha com `module_version_mismatch`, sem chamar a IA.
5. Baixa o arquivo do bucket privado com credencial de servidor. Essa credencial ignora RLS, então a autorização dos passos 1 e 2 é obrigatória antes do download.
6. Cria um lote com um único pedido: instruções (`modules/lab-report/instructions.ts`) com o esquema JSON fixo no texto (sem saída estruturada, ver o segundo teste real abaixo), arquivo, `max_tokens` fixo e esforço `medium`. A criação do lote **nunca é repetida automaticamente**, para não cobrar a mesma análise duas vezes.
7. Grava o identificador do lote (`set_analysis_batch`) e responde `202` na hora. Se não conseguir gravar, cancela o lote e marca a análise como falha.

**`collect-analyses`** (`supabase/functions/collect-analyses/`), chamada pelo app enquanto houver análise em processamento:

1. Busca, com o token do usuário, as análises dele em `processing` que já têm lote, até 5 por chamada.
2. Para cada lote terminado, baixa o resultado e o interpreta em código (`modules/lab-report/request.ts`). Recusa do modelo, resposta cortada, JSON inválido ou fora do esquema terminam em `failed`, sem gravar extração parcial.
3. Gera os pontos de atenção e chama `complete_document_analysis` (ou `fail_document_analysis`). As duas atualizam também o estado do documento.
4. **Apaga o lote na Anthropic**, para a extração não ficar guardada no provedor. Os resultados de um lote ficariam disponíveis por 29 dias.

Uma análise sem lote é considerada abandonada depois de 15 minutos; com lote, depois de 25 horas (`module_private.batch_timeout()`).

O modelo reserva automático para recusas (`fallbacks`) não funciona em lote: uma recusa vira falha `model_refusal`.

A chave do provedor de IA fica nos secrets do Supabase, nunca no app nem no repositório. Os logs registram identificadores, tempos, tokens consumidos e códigos de erro, nunca o conteúdo do laudo.

**Testado em 08/10/2026:**
- Migração `20261008000200_analysis_batches.sql` com 11 testes pgTAP (177 no total), aplicada no local e, depois de `--dry-run` que listou apenas ela, no **remoto** (`migration list` conferido).
- Regras de pedido e resposta com 3 testes novos em Node (22 no `tests/lab-report.test.cjs`).
- As duas funções rodaram no Supabase local, sem chave da Anthropic: sessão inválida recusada, pedido inválido recusado, autorização no banco, conferência de versão, download do arquivo, falha registrada como `provider_error` e contada no limite diário. A chamada real à IA ainda não foi testada.
- Funções publicadas no remoto em 08/10/2026 (`ACTIVE`, SDK `@anthropic-ai/sdk@0.132.0`); chamada sem login recusada com `401`.
- **Primeiro teste real (08/10/2026, foto JPEG de 1,8 MB):** o lote foi criado e terminou em ~5 minutos, mas a análise falhou com `provider_error`. Causa provável: o esquema tinha 21 campos anuláveis, e a saída estruturada aceita no máximo 16. Correção no esquema `lab-report/3` (instruções `lab-report/3-instructions/1`): textos ausentes viram string vazia e só números continuam anuláveis (13 campos). Um teste automatizado trava o limite. A migração `20261008000400_analysis_failure_detail.sql` (local e remoto) grava em `failure_detail` o tipo e a mensagem do erro do provedor, nunca o conteúdo do laudo. Falhas por pedido inválido passam a `provider_invalid_request`.
- **Segundo teste real (08/10/2026):** falhou com `provider_invalid_request`, detalhe "The compiled grammar is too large". A saída estruturada não comporta este esquema, mesmo dentro do limite de 16 campos anuláveis. **Decisão:** a saída estruturada deixa de ser usada. O esquema vai junto das instruções (`systemPrompt` em `request.ts`, instruções `lab-report/3-instructions/2`, migração `20261008000500`), e a resposta continua validada inteira contra o esquema no servidor. Um JSON fora do formato termina em `invalid_output`, sem gravar nada. Os textos ausentes continuam como string vazia.

- **Terceiro teste real (08/10/2026, foto de um laudo de ultrassom):** terminou corretamente como `no_lab_exams` depois de ~20 minutos. O modelo reconheceu que o documento não tem exames laboratoriais e não inventou valores.

### Laudo em várias páginas

**Decidido pelo usuário em 08/10/2026:** uma análise corresponde a **um toque no botão**, não importa quantas páginas o laudo tenha. O **modelo** põe as páginas em ordem; o app não exige ordem do usuário.

Como cada documento tem um único arquivo, e a análise, o compartilhamento (FASE 01) e o limite diário funcionam por documento, um laudo fotografado em várias páginas vira **um único PDF montado no aparelho** antes do envio (decidido em 09/10/2026). Banco e Edge Functions não mudam.

- `src/features/documents/photos-pdf.ts`: o usuário escolhe várias fotos; cada uma é reduzida para no máximo **2000 px** no lado maior e salva em JPEG com qualidade **0.7** (`expo-image-manipulator`), e as fotos viram um PDF A4, uma por página (`expo-print`). No iOS o HTML de impressão não carrega arquivos locais, por isso as imagens entram em base64.
- **Câmera dentro do app** (`expo-camera`, `src/features/documents/DocumentCamera.tsx`): o usuário tira uma foto por página, sem sair do app, e toca em "Concluir". A câmera do sistema (`expo-image-picker`) foi testada em 09/10/2026 e descartada: no Android, enquanto ela fica aberta, o sistema pode encerrar o app para liberar memória, e a foto e as anteriores se perdem.
- As fotos da galeria vêm do seletor do sistema (`expo-image-picker`), que funcionou no teste.
- As cópias das fotos e o PDF são apagados do cache do aparelho logo depois de lidos. As fotos originais da galeria não são tocadas.
- O PDF passa pelas mesmas regras de qualquer documento (até 10 MB) e é enviado como um documento normal.
- **Ordem das páginas no PDF:** a opção que devolve as fotos na ordem em que foram tocadas (`orderedSelection`) só existe no iOS; no Android, as fotos chegam na ordem do seletor do sistema. **Decidido pelo usuário em 09/10/2026: não reordenar**, porque o modelo põe as páginas em ordem.

**Testado em 09/10/2026 no Android (Expo Go):** 3 fotos de um laudo viraram um PDF de **0,8 MB** (~270 KB por página), com o texto miúdo legível e as páginas inteiras, mas fora da ordem em que foram escolhidas (ver acima). No mesmo dia, o fluxo completo funcionou no Android: fotos tiradas em sequência com a câmera dentro do app, miniaturas, remoção de uma foto e envio como um único PDF. Com esses valores, os 10 MB comportam ~35 páginas; o app limita a 20 fotos por envio. No Expo Go, ler o PDF gerado pelo `FileSystem` é bloqueado (expo/expo#21792); o app o lê com `fetch`, como já fazia no seletor de arquivos.

### Conta e chave da API

Configurado pelo usuário em 08/10/2026 no Console da Anthropic (platform.claude.com), uma conta separada da assinatura do Claude, com cobrança por uso:

- **Crédito pré-pago de US$ 10, com recarga automática desativada.** Quando o saldo acaba, as chamadas param, sem gerar dívida. O limite da organização mostrado no painel (US$ 200 mil por mês) é só o teto do nível da conta.
- **Workspace `exames-ia`**, separado do Default, com **limite de gasto de US$ 10 por mês**. O Default não aceita limite; a chave antiga que existia nele foi removida.
- **Geografia:** dados em repouso nos EUA (a única opção disponível; não pode ser mudada depois). Inferência `global`, com preço normal; a opção `us` custa 1,1 vez mais. Isso é transferência internacional de dados, a avaliar junto com o jurídico (ver [Privacidade e LGPD](#privacidade-e-lgpd)).
- **Chave `exames-ia-supabase`:** vinculada ao usuário, restrita ao workspace `exames-ia`, sem acesso à Admin API. **Expira em 08/01/2027, às 16:00 (horário de Brasília).**
- A chave está só nos secrets do Supabase (`ANTHROPIC_API_KEY`), gravada pelo usuário no próprio terminal, sem passar pela conversa nem pelo repositório. Conferido por `supabase secrets list` (só o nome).

**Troca da chave** (antes da expiração, ou se ela vazar):

1. No Console, workspace `exames-ia`, criar uma chave nova.
2. No terminal: `read -rs ANTHROPIC_API_KEY`, colar a chave; `npx supabase secrets set ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY"`; `unset ANTHROPIC_API_KEY`.
3. Excluir a chave antiga no Console.

Se a chave expirar sem troca, as análises falham com erro do provedor, sem cobrança.

### Travas de custo

Decidido em 08/10/2026. A API de IA cobra só por uso, sem custo com o app parado, mas cada análise custa dinheiro. As travas abaixo dão um teto de gasto mesmo com erro no app ou uso indevido:

- **Limite diário de análises por usuário.** Implementado em 08/10/2026 na migração `20261008000100_analysis_daily_limit.sql`, aplicada no Supabase local e, depois de `--dry-run` que listou apenas ela, no **remoto** (`migration list` conferido), com 18 testes pgTAP (`supabase/tests/analyses_daily_limit.test.sql`; 166 no total).
  - `start_document_analysis` conta as análises que o usuário iniciou nas últimas 24 horas, **inclusive as que falharam**, porque elas também foram cobradas.
  - Ao atingir o limite, recusa com `daily_limit_reached` (código `54000`) antes de criar a análise, baixar o arquivo e chamar a IA. O `detail` do erro traz, em UTC, quando a análise mais antiga sai da janela.
  - Um bloqueio por usuário durante o início da análise impede que dois pedidos simultâneos, em documentos diferentes, passem juntos pela contagem.
  - Valor provisório: **10 por 24 horas**, em `module_private.daily_analysis_limit()` e `module_private.daily_analysis_window()`. Mudar o valor exige uma migração pequena.
  - `get_analysis_quota()` devolve ao app o limite, quantas foram usadas, quantas restam e quando a próxima fica disponível.
- **Uma análise por vez por documento:** já existe.
- **Teto por chamada:** `max_tokens` fixo e arquivo de no máximo 10 MB.
- **Sem nova tentativa automática.** Se a chamada falhar, a análise termina em `failed` e só recomeça se o médico pedir. As novas tentativas automáticas da SDK ficam desligadas ou limitadas a uma.
- **Crédito pré-pago no Console da Anthropic, sem recarga automática**, e com limite mensal de gasto. Isso fica fora do código, mas é a trava final: sem saldo, as chamadas param, sem gerar dívida.
- **Registro de consumo:** os tokens de cada análise ficam gravados no log, como já previsto, para comparar o custo real com a estimativa.

### Conferência com a camada de texto do PDF (proposta)

Proposta registrada em 08/10/2026. Os laboratórios agora disponibilizam o laudo digital para download, e os PDFs recebidos até aqui têm camada de texto. Isso permite uma conferência automática da transcrição da IA, que a foto de papel não permite.

Entre os passos 6 e 7, o código extrai o texto de cada página do PDF e procura nele o que a IA transcreveu:

- `value_text` de cada parâmetro, na página indicada em `page`;
- o nome do parâmetro (`name`) e o texto da referência (`reference.text`), na mesma página.

A comparação ignora diferenças de espaços e quebras de linha. Cada parâmetro recebe um destes resultados:

| Resultado | Significado | O que o app faz |
| --- | --- | --- |
| `found` | O valor transcrito está no texto da página. | Nada. |
| `not_found` | O valor transcrito não aparece na página. | Ponto de atenção do tipo "conferir transcrição", com a página, para o médico olhar o original. |
| `no_text_layer` | Foto, ou PDF escaneado sem texto. | Nada; a conferência não se aplica. |

Cuidados:

- **Avisa, não bloqueia.** A camada de texto pode quebrar tabelas de forma inesperada. Um `not_found` é um aviso para conferir, não uma prova de erro.
- **Só confere presença.** Achar o valor na página não garante que ele pertence àquele parâmetro. As verificações de consistência continuam necessárias.
- **Privacidade:** a camada de texto inclui nome e documento do paciente. Ela é processada só em memória na Edge Function e nunca é gravada nem registrada em log.
- **Biblioteca:** a extração de texto de PDF precisa rodar no runtime da Edge Function (Deno). A escolha da biblioteca fica para a implementação, depois de verificar a compatibilidade.

O mesmo mecanismo serve para a FASE 05, em que os trechos de cada estrutura são copiados literalmente do laudo ([descriptive-report.md](descriptive-report.md)). Na FASE 04, os parâmetros `not_found` aparecem em destaque quando o médico confere os valores antes de eles entrarem no histórico ([exam-comparison.md](exam-comparison.md)).

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

- **Aceite dos termos do módulo** (FASE 02): o termo informa que o **laudo completo** é enviado a um provedor de IA externo para extração dos dados, que o resultado fica visível apenas para o `user`, que decide se o compartilha, que o resultado não é diagnóstico e que o `user` responde pela base legal para tratar dados de saúde de terceiros que carregar.
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
- O **gabarito real** (JSON de extração da amostra 1, conferido campo a campo) também fica em `tests/fixtures/private/` e **não é commitado**, mesmo sem os campos de identificação: os valores continuam sendo resultados reais do usuário, que é o autor dos commits (decidido em 05/10/2026). Ele serve para avaliar a extração da IA e o teste comparativo de modelos.
- Os testes automatizados do repositório usam **laudos fictícios** em JSON, montados à mão com as mesmas situações do real (referência em tabela, histórico, formato brasileiro, hemograma).
- Casos adicionais podem ser criados alterando o JSON fictício (ex.: um VCM inconsistente, um exame faltando, uma marcação divergente), sem novos laudos reais.

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
- B (leitor do documento) não vê a análise até o proprietário compartilhá-la e não consegue pedir análise; C e requisições sem autenticação não acessam análises.
- Revogar o compartilhamento remove o acesso de B às análises; excluir o documento remove as análises.
- Sem liberação ativa do módulo ou sem aceite da versão vigente dos termos, a função recusa a análise.
- A chave do provedor não aparece no bundle do app nem nos logs.
- O resultado não contém interpretação clínica (revisão manual do texto gerado).

## Sequência da FASE 03

1. Revisar e aprovar este documento; decidir as pendências.
2. Receber a foto; montar o gabarito JSON da amostra 1 sem dados pessoais.
3. ~~Migração: `document_analyses`, privilégios, RLS e testes pgTAP.~~ Aplicado no local e no remoto em 05/10/2026.
4. Pasta `modules/lab-report/` com a primeira versão da skill (instruções, esquema e exemplos) e script de publicação com versão fixa. **Esquema feito em 05/10/2026**; `SKILL.md` e publicação ficam para junto da função de análise (passo 6), quando der para testar as instruções com a IA.
5. ~~Geração dos pontos de atenção em código, com testes automatizados.~~ Feito em 05/10/2026, com laudo fictício (`tests/fixtures/lab-report/fictitious-report.json`); o gabarito real fica para avaliar a extração da IA.
6. Função de análise com o Claude Opus 5.5; testar com as amostras e medir o custo real por laudo. Antes da primeira chamada real: o limite diário de análises no banco e as demais [travas de custo](#travas-de-custo).
7. Teste comparativo com skill × sem skill (ver [Visão de produto](#visão-de-produto-módulos-de-análise-como-skills)); decidir o formato padrão dos módulos.
8. Interface: consentimento, botão, progresso e tela de resultado para o médico.
9. Validação no Android com o checklist acima; iOS quando possível.
10. Teste comparativo com Claude Sonnet 5.5 e Claude Haiku 4.5 para reduzir custo.

## Decisões

- [x] Escopo: laudo laboratorial completo, nível A, voltado ao médico (02/10/2026).
- [x] ~~Leitor autorizado vê o resultado da análise (02/10/2026).~~ Substituída em 03/10/2026: a análise é só de quem a pediu; compartilhá-la é decisão do proprietário ([profiles.md](profiles.md)).
- [x] Modelo de IA: Claude Opus 5.5 na versão inicial (02/10/2026). Teste comparativo com modelos mais baratos depois que a análise estiver funcionando.
- [x] Direção de produto: módulos de análise oferecidos por profissional, implementados como skills do Claude; laudo laboratorial é o primeiro módulo (02/10/2026).
- [x] Ciclo de vida dos módulos (fonte no repositório, testes, versão fixa, rastreabilidade) ; catálogo, liberação de módulos e administração na FASE 02, ver [profiles.md](profiles.md) (02/10/2026).
- [ ] Abordagem híbrida (conhecimento na skill, regras no servidor): confirmar após o teste comparativo com skill × sem skill.
- [ ] Consulta a especialista em regulação sanitária antes de usuários externos.
- [ ] Política de retenção do provedor de IA, a verificar e registrar.
- [x] Texto do termo: o provisório da FASE 02 continua valendo por enquanto (03/10/2026); revisão jurídica antes de usuários externos.
- [ ] Tolerâncias das verificações de consistência do hemograma: percentual e piso fixo. **Provisórias desde 05/10/2026** (`HEMOGRAM_TOLERANCES`): índices 1%; soma do diferencial ±2 pontos; absolutos 2% ou 0,1% dos leucócitos, o que for maior. Calibrar com mais amostras.
- [x] Compartilhamento da análise: botão "Compartilhar esta análise" na tela de resultado; a análise fica visível para quem já tem acesso ao documento pela FASE 01, e desfazer remove esse acesso. Sem lista separada de pessoas (05/10/2026).
- [x] Travas de custo: limite diário de análises por usuário (provisório: 10 por 24 horas, contando as falhas), sem nova tentativa automática, crédito pré-pago sem recarga automática ([detalhes](#travas-de-custo), 08/10/2026).
- [ ] Conferência da transcrição com a camada de texto do PDF ([proposta](#conferência-com-a-camada-de-texto-do-pdf-proposta), 08/10/2026).
- [x] Módulo em `testing`: libera a análise para quem tem liberação do módulo, como em `active`, para testar com a conta B antes de abrir a todos (05/10/2026).
