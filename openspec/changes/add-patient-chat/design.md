# Design

## Context

As funções de IA do projeto seguem um padrão: autenticação com `authenticate`, autorização e reserva por RPC com o token do usuário, chamada sem nova tentativa automática (`anthropicClient({retries: 0})`), validação da resposta em código e logs só com números. O código puro fica em `modules/<slug>/`, sem tipos do SDK, para rodar no Deno e nos testes em Node. `can_use_module` libera módulos em `testing` ou `active` para quem tem liberação ativa e aceitou os termos.

Três fatos limitam o desenho:

- O paciente não tem conta, então o teste usa uma conta de teste com o login atual.
- A KB e as perguntas ficam em `tests/fixtures/private/`, fora do git.
- O `.env` do app aponta para a nuvem, que guarda dados reais, e não existe projeto de teste separado.

## Goals / Non-Goals

**Goals:**

- Garantir por construção que nenhum texto da IA chegue à pessoa.
- Medir os guardrails com as 18 perguntas, gastando o mínimo.
- Manter a KB fictícia fora do git e da nuvem do Supabase.

**Non-Goals:**

- Preparar o uso real: acesso de paciente, consentimento e regras de LGPD ficam para depois da consulta regulatória.
- Otimizar custo com cache de prompt: a chamada já é barata e o ganho não justifica a complexidade nesta fase.
- Transmitir a resposta aos poucos: o texto já está pronto quando a classificação termina.

## Decisions

### A IA classifica e o código responde

A IA devolve só `{urgent: boolean, intent: "answer" | "not_in_kb" | "refer_doctor" | "decline", item: number | null}`. O código decide a resposta nesta ordem:

| Condição | Resultado (`outcome`) | Texto mostrado |
|---|---|---|
| Sinal da lista de urgência, em qualquer situação | `urgency` | Resposta fixa de urgência |
| Falha, recusa, corte ou JSON inválido | `unavailable` | Resposta fixa de falha |
| `urgent` verdadeiro | `urgency` | Resposta fixa de urgência |
| `intent = answer` e `item` existe na KB | `answer` | Texto literal do item, com a citação |
| `intent = answer` e `item` ausente ou inexistente | `not_in_kb` | Resposta fixa; o log registra `invalid_citation` |
| `intent = not_in_kb` | `not_in_kb` | Resposta fixa |
| `intent = refer_doctor` | `refer_doctor` | Resposta fixa |
| `intent = decline` | `decline` | Resposta fixa |

Separar `urgent` de `intent` faz a prioridade da urgência ser garantida pelo código, não só pelo prompt. Uma burla bem-sucedida também tem pouco efeito: no máximo, escolhe um tipo de resposta ou outro item, sem produzir texto livre.

*Alternativa:* a IA redigir a resposta e o código conferir. Foi descartada pelo usuário: custa mais, e uma paráfrase pode ser rejeitada ou passar com erro sutil.

### Lista de sinais de urgência em código

A urgência é acionada pela lista do código ou pela classificação da IA. A lista fica em `modules/patient-chat/urgency-signals.ts`, marcada como rascunho até a revisão do médico parceiro. Ela usa expressões, nunca palavras soltas, e compara sem diferenciar acentos e maiúsculas, nos primeiros 2000 caracteres da mensagem.

Rascunho inicial: falta de ar, dificuldade para respirar, não consegue respirar, se matar, suicídio, tirar a própria vida, convulsão, desmaiou, inconsciente, não acorda, engasgado, sangramento intenso, lábios roxos, intoxicação, overdose.

A lista só pode resultar em urgência. Ela nunca bloqueia nem recusa uma mensagem, e as demais respostas seguem a intenção classificada pela IA.

As duas verificações rodam sempre que a IA pode ser chamada, e a resposta informa quem detectou a urgência (`code`, `ai` ou `both`), para o relatório do teste de aceite. O app não mostra essa informação. Isso mede o Haiku também nas urgências.

*Alternativa:* responder na hora quando a lista encontra um sinal, sem chamar a IA. Foi descartada pelo usuário: economiza a chamada, mas o teste deixaria de medir o Haiku nas urgências.

### Textos fixos

São rascunhos para o teste. Precisam de revisão do médico parceiro antes de qualquer uso real.

| Resultado | Texto |
|---|---|
| `urgency` | Isso pode ser uma urgência. Procure atendimento agora: ligue 192 (SAMU) ou vá ao pronto-socorro mais próximo. Se houver risco de alguém tirar a própria vida, ligue também 188 (CVV), a qualquer hora. |
| `not_in_kb` | Não tenho essa informação. Converse com o médico. |
| `refer_doctor` | Não posso avaliar essa situação por aqui. Converse com o médico, que pode orientar você com segurança. |
| `decline` | Não posso ajudar com esse pedido. Posso responder a dúvidas gerais sobre saúde. |
| `unavailable` | Não consegui responder agora. Tente de novo em instantes. Se for urgência, ligue 192 (SAMU) ou vá ao pronto-socorro mais próximo. |

Uma recusa da IA pode acontecer justamente nas perguntas 11 e 18. Por isso `unavailable` inclui a orientação de urgência. Na pergunta 11, o teste de aceite conta isso como falha, porque a resposta esperada é outra. Na pergunta 18, a lista ainda dá a resposta de urgência, e o relatório mostra o alerta de que a IA não detectou.

### Pedido à IA

- **Modelo:** `claude-haiku-5-5`, escolhido pelo usuário, com esforço `low` e `max_tokens` de 2000, que dá folga para o raciocínio interno e o JSON. Não há nova reexecução automática em outro modelo se a IA recusar. O Haiku está aprovado só para este teste: antes de uso real, precisa de nova avaliação, com mais casos de urgência.
- **Formato:** `output_config.format` com o esquema pequeno acima, e validação em código mesmo assim. Se a API rejeitar o formato na primeira chamada paga, o caminho é o que `modules/lab-report` já usa: esquema no prompt e validação em código.
- **KB no prompt:** a KB inteira vai no `system`, marcada como dado, nunca como instrução. A pergunta vai sozinha em `messages`, também como dado.
- **Prompt sem as perguntas de teste:** o prompt descreve as categorias em termos gerais e não copia nenhuma das 18 perguntas. Caso contrário, a aprovação não mediria nada.
- **Conexão nova por chamada:** a função não reaproveita conexões com a API. Nas rodadas de 03 e 04/11/2026, uma conexão reaproveitada que já tinha caído fez perguntas falharem, e a regra de não tentar de novo não dava outra chance a elas.
- **Sem histórico:** cada pergunta é independente. Isso reduz o custo e o espaço para burlas em várias mensagens, e basta para os critérios de aceite.

### KB em tabela sem acesso pelo app

`patient_chat_kb_items(item, question, answer)` tem RLS ativo, sem política e sem `grant` para `authenticated`. Só o `service_role` lê, e a função só faz isso depois da autorização. `kb.ts` converte o arquivo privado em itens e rejeita um arquivo malformado.

*Alternativas:* colocar a KB na pasta da função a enviaria ao git, e colocá-la em uma migração a levaria à nuvem. Um segredo de ambiente é pouco prático e não tem versão. Foram descartadas.

### Autorização e limite no banco

`start_patient_chat()` roda com o token do usuário e, nesta ordem: exige login e `can_use_module('patient-chat')`, recusa se a KB estiver vazia, aplica `pg_advisory_xact_lock` por usuário, conta as linhas de 24 horas e cria a linha de uso. O limite provisório de 60 fica em `module_private.patient_chat_daily_limit()`. Depois da chamada, o servidor grava modelo e tokens nessa linha. As recusas usam os códigos `not_authenticated`, `module_not_available`, `kb_unavailable` e `chat_limit_reached`.

A contagem usa a tabela própria `patient_chat_usage`, porque `analysis_usage` entra no limite diário de análises, e o chat consumiria a cota de laudos. Tamanho e conteúdo da pergunta são validados antes da RPC, sem contar no limite.

A ordem na função é: exigir login, verificar a lista de sinais, validar a pergunta, chamar a RPC, chamar a IA e decidir. Com sinal da lista, uma pergunta inválida ou um `chat_limit_reached` resultam em urgência, sem chamar a IA e sem contar no limite, porque a resposta é fixa e não tem custo. As recusas de login, módulo e KB vazia continuam valendo.

### Só local, com o módulo `disabled` na migração

A função e a KB ficam só no local, mas as migrações ficam na mesma pasta usada pelo `db push`. Esta migração pode chegar à nuvem no próximo envio, inerte: com o módulo `disabled` e sem dados da KB. O aviso fica em `docs/knowledge-base.md` e no roteiro.

O status é `disabled`, não `draft`. `can_use_module` não libera nenhum dos dois, mas `requestable_modules` e `request_module` só excluem `disabled`: em `draft`, qualquer médico logado veria o módulo na tela Módulos e poderia solicitá-lo. Em `disabled`, ele só aparece no catálogo do administrador.

*Alternativa:* manter `draft` e retirá-lo dessas duas funções. Foi descartada porque muda uma regra de todos os módulos, fora do escopo.

### Exceção: conferência visual na nuvem

Em 04/11/2026, com o app em desenvolvimento, o usuário decidiu conferir a navegação e a tela do chat ligado à nuvem. Entram só a migração, o status `testing` durante a conferência, a liberação para a conta dele e o aceite dos termos. A função e a KB continuam só no local, e nenhuma pergunta é enviada. Uma pergunta enviada por engano recebe a resposta fixa de falha, sem chamar a IA, porque a função não existe na nuvem.

Por pedido do usuário, o botão de envio fica desativado em código até a retomada da conversa, para não haver envio por engano. O campo continua editável, para conferir o teclado.

A tela de Administração libera o módulo, mas não muda o status, então o status muda por comando. Ao terminar, a liberação é revogada e o módulo volta a `disabled`.

`tests/patient-chat.seed.cjs` é o único que passa o módulo a `testing`. Ele aceita só `localhost` ou `127.0.0.1` e, nesse ambiente, carrega a KB, cria a conta de teste, libera o módulo e aceita os termos. O comando `npx supabase functions serve patient-chat --env-file supabase/functions/.env` lê a chave da API de um arquivo já ignorado pelo git.

No celular, o app precisa do endereço do computador na rede local e da chave local. Antes de implementar, conferir na documentação da versão do Expo se `.env.local` tem prioridade sobre `.env`. Se tiver, o `.env` não muda, e voltar à nuvem é só apagar um arquivo.

### Tela

`src/app/patient-chat.tsx` e `src/features/patient-chat/` seguem o padrão de `alerts`. A tela tem três áreas: o aviso de conteúdo fictício fixo no topo, os balões no meio, que são a única parte que rola, e o campo com o botão de envio fixos embaixo, acompanhando o teclado. O envio fica desativado enquanto há pedido em andamento, e nenhuma pergunta é enviada sem o toque do usuário. O campo não limita o tamanho do texto, porque uma mensagem longa com sinal de urgência precisa chegar à função.

A tela mostra só a última pergunta e resposta, com a citação. Um histórico daria a impressão de que o bot lembra das anteriores, e cada pergunta é independente. Antes da primeira pergunta, um texto fixo explica isso.

As entradas são o menu da conta e a ação no cartão do módulo em `ModulesScreen`, usando a mesma condição: módulo ativo e termos aceitos. O menu fica fora da home visível, então respeita a decisão de 29/10/2026 de não criar atalho novo. A home refaz a consulta ao receber o foco, ignora resultado de outra conta e, em caso de falha, esconde a entrada. O aviso atual para módulos em teste ("A análise ficará disponível…") não vale para este módulo e deixa de aparecer nele.

### Teste de aceite separado do `npm test`

`tests/patient-chat.eval.cjs` chama a função local com a conta de teste, uma pergunta de cada vez.

- **Dados:** lê os textos do arquivo privado e tem a tabela de resultados esperados por número. O arquivo inteiro nunca é enviado à IA.
- **Pergunta 11:** vem da variável `PATIENT_CHAT_Q11`, não é gravada nem impressa e, sem ela, a rodada fica incompleta.
- **Limpeza do texto:** uma função testável extrai só o texto de cada pergunta, sem as anotações finais entre parênteses, títulos e instruções. O corpo enviado contém só a pergunta.
- **Execução:** `--confirm-paid` é obrigatório para chamar a IA, e `--only <n>` roda uma pergunta. `--dry-run` mostra o que seria enviado, sem chamar a IA e sem a pergunta 11, e confere que a lista de sinais não dispara nas perguntas da KB.
- **Resultado:** traz o `outcome` e o item de cada pergunta, quem detectou cada urgência, o total de tokens e o custo medido. Se só a lista detectar uma urgência, a pergunta passa com alerta visível.

Os testes do `npm test` usam um cliente falso, sem custo.

## Risks / Trade-offs

- [Haiku classifica mal as perguntas difíceis, de 14 a 18] → As 18 perguntas medem isso. Se falhar, primeiro ajustar o prompt sem citar as perguntas; trocar de modelo é decisão do usuário.
- [Aprovação do Haiku ser lida como definitiva] → Ela vale só para este teste. O uso real exige nova avaliação, com mais casos de urgência.
- [Lista dispara em pergunta informativa, como "O que é convulsão?"] → A lista erra de propósito para o lado seguro; a revisão do médico parceiro ajusta as expressões.
- [Lista não cobre todas as formas de escrever uma urgência] → Ela não substitui a IA: qualquer uma das duas aciona a resposta, e a lista segue como rascunho.
- [Aprovar nas 18 não prova segurança geral] → Registrar em `docs/knowledge-base.md` que o resultado vale só para este teste e não libera uso real.
- [Ajustar o prompt até passar nas 18 pode mascarar falhas] → Cada ajuste continua em termos gerais; antes de um uso real será preciso um conjunto de perguntas novas.
- [Item errado, porém existente] → O código só confere a existência do item, não a relação com a pergunta. As perguntas 8 e 9 têm temas próximos para medir isso.
- [Texto de urgência sem revisão médica] → O ambiente é só de teste, os textos ficam marcados como rascunho e a revisão é condição para uso real.
- [Migração na nuvem] → Ela só adiciona o módulo, tabelas vazias e funções. Fora da conferência, o módulo `disabled` e a ausência de dados da KB a tornam inerte. Uma publicação em massa das funções também não abriria o acesso. O aviso fica em `docs/knowledge-base.md` e no roteiro.
- [Módulo em `testing` aparece para outros médicos] → Durante a conferência, qualquer médico logado vê o módulo em Meus módulos e pode solicitá-lo. O módulo volta a `disabled` ao terminar.
- [Esquecer o app apontando para o local] → Usar arquivo separado e, no roteiro, a etapa de voltar à nuvem.
- [Chave da API na máquina local] → O arquivo fica fora do git. O crédito pré-pago e o limite mensal continuam como trava final, e a chave deve ser do workspace `exames-ia`.

## Migration Plan

1. Aplicar a migração no local, com `npx supabase migration up --local`, e na nuvem só para a conferência visual, com a confirmação do usuário.
2. Rodar a carga local e servir a função.
3. Com a confirmação do usuário, rodar uma pergunta e, depois, as 18.
4. Para desfazer: remover a função e o código e, na nuvem, revogar a liberação e voltar o módulo a `disabled`. Remover a migração da nuvem exige uma nova migração.
