# FASE 04 — Pacientes e comparação de exames

## Estado e escopo

Planejamento iniciado em 08/10/2026, em conversa com o usuário. Em 09/10/2026 o cadastro de pacientes foi adiantado como o módulo **Gestão por paciente** (ver [abaixo](#módulo-gestão-por-paciente)); a comparação ainda não tem código. A comparação depende da extração do módulo `lab-report` da FASE 03 ([compliance.md](compliance.md)) estar concluída.

| Passo | Estado atual |
| --- | --- |
| 1 — Atores e regras | Definidos pelo usuário em 08/10/2026 (ver abaixo). |
| 2 — Pendências | Decididas em 08/10/2026; o CRM fica para antes do lançamento. |
| 3 — Modelo de dados e RLS | `patients` e `documents.patient_id` em implementação (09/10/2026); o restante proposto neste documento. |
| 4 — Catálogo de analitos e unidades | Pendente. |
| 5 — Comparação | Regras propostas neste documento. |
| 6 — Interface | Pendente. |
| 7 — Validação | Pendente. |

As fases anteriores estão em [authentication.md](authentication.md) (FASE 0), [grants.md](grants.md) (FASE 01), [profiles.md](profiles.md) (FASE 02) e [compliance.md](compliance.md) (FASE 03). A comparação de laudos descritivos (ultrassom, anatomopatológico etc.) fica para a FASE 05 ([descriptive-report.md](descriptive-report.md)); esta fase trata só de laudos laboratoriais.

## Objetivo

Permitir que o médico compare os exames de um mesmo paciente ao longo do tempo: o laudo mais recente com os anteriores, **mesmo que tenham sido feitos em laboratórios diferentes**. O que importa é o resultado; o laboratório é contexto.

A comparação segue o **nível A** da FASE 03: o app organiza e calcula fatos sobre os números, sem dizer o que significam. Sem diagnóstico, hipótese ou conduta.

A FASE 03 já usa o histórico **impresso no próprio laudo**. Esta fase acrescenta a comparação **entre laudos diferentes enviados ao app**, que estava fora do escopo da FASE 03.

## Atores

Definidos pelo usuário em 08/10/2026:

```
Laboratório ──► Médico ◄── Paciente
```

| Ator | Papel | Usa o app? | Origem |
| --- | --- | --- | --- |
| **Médico(a)** | Centro do app: envia os laudos, organiza pacientes, compara e compartilha. | **Sim, é o único usuário.** | Conta própria. |
| **Paciente** | Pessoa a quem o laudo se refere. | Não. | Cadastro do médico. |
| **Laboratório** | Quem emitiu o laudo. | Não. | Nome extraído do laudo pela IA. |

O paciente é um **cadastro**, não um perfil nem uma conta. A decisão de 02/10/2026 "sem perfis de paciente ou profissional" ([profiles.md](profiles.md)) continua valendo nesse sentido. O que muda é que o `user` passa a ser entendido como médico (ver [Impacto nas fases anteriores](#impacto-nas-fases-anteriores)).

## Regras

1. **Quem envia os laudos é sempre o médico**, e ele é o dono deles.
2. **Todo laudo pertence a um paciente.** O app registra esse vínculo só para quem tem o módulo Gestão por paciente; sem ele, o médico envia e analisa documentos sem paciente (09/10/2026).
3. **Cada médico tem os seus pacientes.** Um médico nunca vê os cadastros de outro.
4. **A comparação é feita por paciente e por analito, independentemente do laboratório.** Exemplo: o hemograma de março no Lab A e o de setembro no Lab B entram na mesma linha do tempo.
5. **O laboratório é contexto, não condição.** Ele aparece junto de cada valor e não impede a comparação.
6. **Compartilhar é compartilhar um documento**, como na FASE 01. O médico B nunca recebe acesso ao app, aos pacientes ou aos laboratórios do médico A.
7. **O médico B vê exatamente o que o médico A escolher compartilhar** (ver [Compartilhamento](#compartilhamento)).
8. **O nível A continua valendo.** A IA só transcreve. Todo cálculo de comparação é feito por código, testado e auditável.

## Módulo Gestão por paciente

Decidido pelo usuário em 09/10/2026. Hoje o app guarda **os documentos e as análises**, sem registrar de qual paciente é cada um. A regra "todo laudo pertence a um paciente" continua valendo: o exame é sempre de alguém, o app só não registra de quem. A gestão por paciente é a camada que **registra esse vínculo**, para quem quiser organizar os exames. O médico que só quer a análise continua enviando e analisando sem cadastrar ninguém.

- **É um módulo adquirido**, liberado pelo admin como o `lab-report` (id `patient-records`, 30 dias, termos próprios). Não usa IA.
- **Sem a liberação** (nunca contratado ou vencido), o médico continua **vendo, corrigindo e excluindo** os cadastros que já tem, e pode **desvincular** documentos. Só não cadastra pacientes novos nem vincula documentos a pacientes. Assim ele nunca perde acesso aos próprios dados (LGPD).
- **Excluir paciente:** só quando não houver documentos vinculados a ele. O médico exclui ou desvincula os documentos antes. A exclusão em um passo, que apagaria também os arquivos no Storage, fica para depois.
- **Compartilhados comigo:** seção separada, sem paciente. O documento é do paciente de outro médico, que quem recebe não vê.
- **Lista de pacientes:** mais recente primeiro (pelo último documento vinculado, ou pelo cadastro se não houver documento), com busca por nome ou CPF.
- **CPF:** ver [`patients`](#patients).
- **A comparação de exames** (deste documento) só vale para documentos com paciente.

**Implementado em 09/10/2026:** migração `20261009000100_patient_records.sql` (tabela `patients`, `documents.patient_id`, funções de cadastro, vínculo e busca, módulo `patient-records` em `testing`), com 44 testes pgTAP (221 no total), aplicada no local e, depois de `--dry-run` que listou apenas ela, no **remoto** (`migration list` conferido). Telas: Pacientes, Paciente (dados e documentos), aba "Sem paciente" e vínculo em "Gerenciar". **Validado no Android (Expo Go) em 09/10/2026:** liberação e aceite do módulo, cadastro com CPF, envio vinculado, busca por nome e CPF, recusa ao excluir paciente com documento e exclusão depois de desvincular.

## Modelo de dados proposto

### `patients`

| Campo | Tipo proposto | Finalidade e restrição |
| --- | --- | --- |
| `id` | UUID | Chave primária. |
| `owner_id` | UUID | Médico dono do cadastro; referência a `auth.users.id`; imutável pelo cliente. |
| `display_name` | Texto | Nome ou identificador escolhido pelo médico. Obrigatório e não vazio. |
| `cpf` | Texto, opcional | Só os 11 dígitos, validados pelos dígitos verificadores. Único por médico. |
| `birth_date` | Data, opcional | Para escolher linhas de tabelas de referência por idade. |
| `sex` | Valor controlado, opcional | `female`, `male`. Para tabelas de referência por sexo. |
| `created_at`, `updated_at` | Data/hora com fuso | Mantidos pelo banco. |

Minimização (LGPD): **sem endereço ou contato**. Leitura e escrita apenas pelo dono; o admin não vê os cadastros. Só se exclui um paciente sem documentos vinculados (09/10/2026).

**CPF (decidido em 09/10/2026, revendo o "sem CPF" de 08/10/2026):** o motivo concreto é o risco principal desta fase, misturar os exames de duas pessoas (ex.: dois pacientes com o mesmo nome). O CPF é **opcional**, validado pelos dígitos verificadores, guardado só com números e **único por médico**, para o mesmo médico não cadastrar a mesma pessoa duas vezes. A busca por CPF exige o número completo, para não listar pacientes por pedaços do número.

### `documents` (alteração)

| Campo | Tipo proposto | Finalidade e restrição |
| --- | --- | --- |
| `patient_id` | UUID, opcional | Paciente do laudo; referência a `patients.id` do **mesmo dono**. Alterável pelo dono, para corrigir uma associação errada. Vazio para quem não usa a gestão por paciente. |

O campo é opcional (09/10/2026), então os documentos atuais ficam sem paciente. Isso substitui a decisão de 08/10/2026 de criar um paciente fictício "Teste" por dono.

Cadastros duplicados do mesmo paciente não são fundidos nesta fase: o médico troca o paciente de cada laudo e exclui o cadastro vazio.

### Laboratório

Não é um cadastro nesta fase. O nome e o registro do laboratório **já são extraídos** pela FASE 03 (`laboratory` em `extraction.schema.json`) e acompanham cada resultado como contexto. Se no futuro for preciso filtrar ou agrupar por laboratório, ele vira um cadastro.

### `analytes` (catálogo de analitos)

| Campo | Tipo proposto | Finalidade |
| --- | --- | --- |
| `code` | Texto | Identificador estável (ex.: `hemoglobin`, `glucose_fasting`). |
| `name` | Texto | Nome exibido. |
| `canonical_unit` | Texto | Unidade padrão usada na comparação. |
| `loinc` | Texto, opcional | Código LOINC, para padronização futura. |

Mantido por migração; leitura por usuários autenticados. Hoje a extração só tem `code` para os parâmetros do hemograma. Esta fase amplia esses códigos para os analitos do catálogo.

### `unit_conversions`

Tabela fixa de conversões por analito (ex.: glicose mg/dL ↔ mmol/L). **A conversão é sempre determinística, nunca feita pela IA.** Uma unidade sem conversão conhecida não é comparada: o valor aparece com o aviso "unidade diferente, não comparada".

### `lab_results`

Uma linha por analito por laudo, gerada pelo servidor a partir de uma análise `ready`.

| Campo | Tipo proposto | Finalidade |
| --- | --- | --- |
| `id` | UUID | Chave primária. |
| `analysis_id` | UUID | Análise de origem; os resultados são excluídos com ela. |
| `patient_id` | UUID | Paciente, copiado do documento. |
| `analyte_code` | Texto | Referência a `analytes.code`; nulo se o analito não está no catálogo. |
| `name_printed` | Texto | Nome como impresso. |
| `collected_at` | Data/hora | Data da coleta impressa no laudo, **não** a data do envio. |
| `value_number`, `value_text` | Número, texto | Como na extração. |
| `unit_printed` | Texto | Unidade impressa. |
| `value_canonical` | Número, opcional | Valor convertido para `canonical_unit`. |
| `reference` | JSON | Referência impressa, como na extração. |
| `laboratory_name` | Texto, opcional | Contexto. |
| `page` | Inteiro, opcional | Página de origem no laudo. |
| `confirmed_at` | Data/hora, opcional | Quando o médico conferiu os valores. Nulo enquanto pendente. |

**Confirmação pelo médico** (decidido em 08/10/2026): os resultados gerados pela IA ficam pendentes até o médico revisá-los. Só os resultados confirmados entram na linha do tempo e na comparação, para que um erro de transcrição não contamine o histórico. Na conferência, os valores que não foram encontrados na camada de texto do PDF aparecem em destaque ([compliance.md](compliance.md#conferência-com-a-camada-de-texto-do-pdf-proposta)). A correção de um valor antes da confirmação mantém o valor original extraído para auditoria (forma de armazenamento a definir na migração).

Escrita apenas pelo servidor (service role). Leitura pelo dono e, se compartilhado, conforme a [regra de compartilhamento](#compartilhamento).

## Comparação (nível A)

Calculada por código sobre `lab_results` do mesmo paciente e do mesmo `analyte_code`, em ordem de `collected_at`:

| Cálculo | Exemplo de formato |
| --- | --- |
| **Variação** | "Hemoglobina: 13,8 → 12,1 g/dL (−1,7; −12%)" |
| **Mudança de faixa** | "Estava dentro da referência; agora acima" |
| **Persistência** | "Fora da referência nos últimos 3 exames" |
| **Analito novo ou ausente** | "Dosado em 10/03; não consta no laudo atual" |
| **Linha do tempo** | Tabela e gráfico com todas as coletas do analito |
| **Comparabilidade** | "Laboratórios diferentes", "Faixas de referência diferentes", "Unidade diferente, não comparada" |

Cada valor mostra o laboratório, a data da coleta e a faixa de referência **do seu próprio laudo**.

**O que a comparação não faz:**

- Não define limiar de "mudança relevante", porque isso é julgamento clínico (mesma regra da FASE 03).
- Não interpreta tendências nem sugere causas.
- Não unifica faixas de referência de laboratórios diferentes.

## Conferência do paciente

**Risco principal desta fase:** associar um laudo ao paciente errado e misturar o histórico de duas pessoas.

Decidido em 08/10/2026: a IA extrai o nome impresso no laudo, o código compara com o paciente escolhido e **alerta** quando não bate ("o laudo parece ser de *Maria S.*, mas foi enviado para *João P.*"). O médico confirma ou troca o paciente e segue. O envio não é bloqueado, porque quem decide é o médico.

**Ajuste na minimização da FASE 03:** a extração continua **sem guardar o nome do paciente** ([compliance.md](compliance.md), Privacidade e LGPD). O nome é usado só para a conferência e descartado. Fica gravado apenas o resultado (`confere`, `não confere` ou `não encontrado`).

## Compartilhamento

O médico A compartilha **um documento** com o médico B, como na FASE 01, e escolhe o que vai junto:

| Item | O que B recebe | Decidido em 08/10/2026 |
| --- | --- | --- |
| **Laudo** | Arquivo original | Sempre incluído; é a base do compartilhamento. |
| **Análise** | Valores extraídos e pontos de atenção | Opcional; já existe (interruptor da FASE 03). |
| **Dados do paciente** | Nome, nascimento e sexo do cadastro de A | Opcional; desligado por padrão. |
| **Comparação** | Este laudo comparado com os anteriores do paciente | Opcional; desligado por padrão. |

Cuidados:

- **A comparação expõe outros laudos.** Ela mostra valores de documentos que A não compartilhou um a um. A tela precisa avisar: "inclui resultados de N exames anteriores (datas)".
- **Retrato do momento** (decidido em 08/10/2026): B vê a comparação como estava quando A compartilhou. Um laudo enviado depois não aparece para B sem novo compartilhamento.
- **Revogar retira tudo.** Desfazer o compartilhamento do laudo remove para B tudo o que veio junto, como já acontece com a análise.

## Impacto nas fases anteriores

- **[profiles.md](profiles.md):** "o `user` é quem contrata o módulo, seja qual for a sua profissão" passa a ser "o `user` é o médico". Continua sem perfil de paciente ou profissional. A verificação de CRM fica fora desta fase e precisa ser decidida antes de abrir o app para usuários externos.
- **[grants.md](grants.md):** o compartilhamento passa a ser de médico para médico, com itens escolhidos pelo dono.
- **[compliance.md](compliance.md):** a comparação entre laudos, antes fora do escopo, é tratada aqui. A extração precisa de: códigos de analito além do hemograma e, se aprovada, a conferência do nome do paciente.

## Privacidade e LGPD

- Os laudos e os cadastros de pacientes são **dados pessoais sensíveis** (art. 11 da LGPD).
- Com o médico como único usuário, o desenho proposto é: **médico como controlador**, app como operador, provedor de IA como suboperador. A base legal provável é a tutela da saúde por profissional de saúde (art. 11, II, "f"). **Confirmar com apoio jurídico.**
- Os termos do módulo precisam refletir o cadastro de pacientes e a comparação entre laudos.
- O médico precisa conseguir excluir um paciente e tudo o que se refere a ele. Nesta fase isso é feito em dois passos: excluir os documentos do paciente e depois o cadastro (09/10/2026).
- O `admin` continua sem acesso a pacientes, laudos, análises ou resultados.

## Regulação

A comparação proposta organiza números já presentes nos laudos, sem interpretação, e por isso fica no nível A. A recomendação da FASE 03 continua valendo: **consultar especialista em regulação sanitária antes de oferecer o app a usuários externos**. Isso pesa mais agora que o app é explicitamente uma ferramenta para médicos.

## Critérios de validação

Contas: **A** e **B** (médicos), mais requisições sem autenticação.

- A não vê pacientes de B, e vice-versa.
- A não consegue associar um laudo a um paciente de B.
- A não exclui um paciente que ainda tem documentos vinculados (09/10/2026).
- Dois laudos do mesmo paciente, de laboratórios diferentes, aparecem na mesma linha do tempo por analito.
- Unidades convertíveis são comparadas no valor convertido; unidades sem conversão não são comparadas e mostram o aviso.
- A ordem da linha do tempo segue a data da coleta, não a data do envio.
- B recebe apenas os itens que A escolheu compartilhar; revogar o laudo remove tudo para B.
- Testes com **laudos fictícios**, como na FASE 03. O laudo real continua só em `tests/fixtures/private/`.

## Sequência da FASE 04

1. ~~Revisar este documento e decidir as pendências.~~ Concluído em 08/10/2026.
2. Concluir a extração da FASE 03 (Edge Function `analyze-document`).
3. Migração: `patients`, `documents.patient_id`, `analytes`, `unit_conversions`, `lab_results`, RLS e testes pgTAP.
4. Catálogo inicial de analitos e conversões de unidade.
5. Geração de `lab_results` a partir das análises e regras de comparação, com testes.
6. Compartilhamento por itens.
7. Interface: pacientes, envio associado a paciente, linha do tempo e comparação.
8. Validação no Android; iOS quando possível.

## Decisões

- [x] Atores: médico, paciente e laboratório; o médico é o centro e o único usuário (08/10/2026).
- [x] Quem envia os laudos é sempre o médico, dono deles (08/10/2026).
- [x] O app precisa saber de qual paciente é cada laudo (08/10/2026).
- [x] Cada médico tem os seus cadastros; outro médico nunca os vê (08/10/2026).
- [x] Compartilhar é compartilhar um documento, nunca o uso do app (08/10/2026).
- [x] O médico B vê o que o médico A escolher compartilhar (08/10/2026).
- [x] A comparação cruza laboratórios; o que importa é o resultado (08/10/2026).
- [x] Comparação no nível A, sem diagnóstico (08/10/2026).
- [x] Conferência do nome do laudo: o nome é extraído só para a conferência e descartado; grava-se apenas o resultado (08/10/2026).
- [x] Nome do laudo diferente do paciente escolhido: alertar, sem bloquear (08/10/2026).
- [x] Verificação de CRM: fora desta fase; só o usuário de teste usa o app. Decidir antes de abrir para usuários externos (08/10/2026).
- [x] Itens do compartilhamento e seus padrões: como na tabela de [Compartilhamento](#compartilhamento) (08/10/2026).
- [x] Comparação compartilhada como retrato do momento (08/10/2026).
- [x] Os valores extraídos só entram no histórico depois de confirmados pelo médico (08/10/2026).
- [x] Cadastros duplicados: sem fusão nesta fase; o médico move os laudos para o cadastro certo e exclui o vazio (08/10/2026).
- [x] Laudos descritivos ficam para a FASE 05; esta fase compara só resultados laboratoriais (08/10/2026).
- [x] ~~Documentos de teste atuais: a migração cria um paciente fictício por dono e associa os documentos a ele (08/10/2026).~~ Substituída em 09/10/2026: o paciente é opcional e os documentos atuais ficam sem paciente.
- [x] Gestão por paciente é um módulo adquirido, liberado pelo admin; sem liberação, o médico vê, corrige, desvincula e exclui, mas não cria nem vincula (09/10/2026).
- [x] Excluir paciente só sem documentos vinculados (09/10/2026).
- [x] "Compartilhados comigo" separado, sem paciente (09/10/2026).
- [x] Lista de pacientes: mais recente primeiro, busca por nome ou CPF (09/10/2026).
- [x] CPF opcional, validado, único por médico, busca só pelo número completo (09/10/2026).
