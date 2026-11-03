# Tasks

## 1. Regras puras

- [x] 1.1 Criar `modules/patient-chat/kb.ts`, que converte o arquivo da KB em itens e rejeita arquivo malformado; verificar em `tests/patient-chat.test.cjs`, com texto sintético no teste, sem copiar o arquivo privado
- [x] 1.2 Criar `modules/patient-chat/decision.ts` com os textos fixos e a tabela de decisão do design, incluindo o sinal da lista antes da falha, urgência acima de tudo, citação inexistente e classificação inválida; verificar com testes de cada linha da tabela em `tests/patient-chat.test.cjs`
- [x] 1.3 Criar `modules/patient-chat/request.ts` com modelo, esforço, `max_tokens`, esquema e prompt, sem nenhuma das 18 perguntas; verificar com testes do pedido montado, incluindo que a pergunta vai só em `messages`
- [x] 1.4 Criar `modules/patient-chat/urgency-signals.ts`, com a lista marcada como rascunho; verificar com testes sem custo de sinal, ausência de sinal, acentos e maiúsculas, e de que a lista só pode resultar em urgência, nunca em recusa
- [x] 1.5 Incluir `tests/patient-chat.test.cjs` no script `test` do `package.json`; verificar com `npm test`

## 2. Banco

- [x] 2.1 Criar a migração com o módulo `disabled`, `patient_chat_kb_items`, `patient_chat_usage`, o limite e `start_patient_chat`, sem dados da KB; verificar aplicando no local com `npx supabase migration up --local`
- [x] 2.2 Criar `supabase/tests/patient_chat_rls.test.sql` cobrindo KB inacessível ao app, sem login, sem módulo, módulo `disabled` que não aparece nem pode ser solicitado, sem termos, KB vazia, limite de 60 e uso restrito ao próprio usuário; verificar com `npx supabase test db --local`

## 3. Edge Function

- [x] 3.1 Criar `supabase/functions/patient-chat/` (`index.ts`, `deno.json`) seguindo o padrão das outras funções: valida a pergunta, autoriza pela RPC, chama a IA sem nova tentativa, usa `urgency-signals.ts` e `decision.ts` na ordem do design, informa quem detectou a urgência, grava os tokens e registra logs sem o texto; verificar subindo a função com `npx supabase functions serve patient-chat`, já que o `deno` não está instalado neste ambiente, e com uma revisão por `grep` de que nenhum log inclui a pergunta
- [x] 3.2 Verificar a função local sem custo: chamar sem login, sem módulo e com pergunta inválida, confirmando as recusas sem chegar à IA, com a chave da API ausente no ambiente; e confirmar sem custo que um sinal da lista com pergunta longa demais dá urgência. O caso de limite atingido com sinal fica coberto pelos testes de `decision.ts`

## 4. Carga e teste de aceite

- [x] 4.1 Criar `tests/patient-chat.seed.cjs`, com recusa a endereço não local, carga da KB, conta de teste, módulo em `testing`, liberação e termos; verificar rodando no local, conferindo 53 itens, o módulo em `testing` e testando que um endereço remoto é recusado sem alterar dados
- [x] 4.2 Criar `tests/patient-chat.eval.cjs` com os resultados esperados, `--confirm-paid`, `--only`, `--dry-run`, recusa a endereço não local e pergunta 11 por variável; verificar sem custo que ele termina sem chamar a IA quando falta a confirmação ou o endereço é remoto
- [x] 4.3 Criar a função que extrai só o texto de cada pergunta e incluí-la em `tests/patient-chat.test.cjs`; verificar sem custo, com texto sintético, que anotações entre parênteses, títulos e instruções não saem no envio e que o corpo enviado só tem a pergunta
- [x] 4.4 Rodar `--dry-run` com os arquivos privados; verificar sem custo que as perguntas 5 a 9 saem sem anotação, que a pergunta 11 não é enviada nem impressa, e que a lista não dispara nas 53 perguntas da KB

## 5. Tela

- [x] 5.1 Conferir a versão do Expo em `package.json` e a documentação correspondente de variáveis de ambiente, e definir como o celular aponta para o local; verificar registrando no roteiro o arquivo e os valores a usar, sem chaves
- [x] 5.2 Criar `src/features/patient-chat/` (serviço e tela) e `src/app/patient-chat.tsx`, com aviso fixo, envio único e resposta fixa de falha em erro de conexão; verificar com testes do serviço e `npx tsc --noEmit`
- [x] 5.3 Adicionar os termos em rascunho do módulo em `terms.ts` e a entrada no cartão do módulo em `ModulesScreen`, sem mudar a home e sem o aviso de "análise" neste módulo; verificar com `npx expo lint` e `npx tsc --noEmit`

## 6. Documentação

- [x] 6.1 Atualizar `docs/knowledge-base.md` com o estado do teste, as decisões de 03/11/2026, como rodar localmente, o aviso de que o resultado não libera uso real, o de que o Haiku foi aprovado só para este teste, e o de que a migração pode chegar à nuvem no próximo `db push`, inerte, com o módulo `disabled` e sem dados da KB; verificar seguindo os comandos do documento na tarefa 7.1

## 7. Verificação integrada

- [x] 7.1 Rodar `npm test`, `npx supabase test db --local`, `npx expo lint` e `npx tsc --noEmit`; verificar pelos comandos sem erro
- [x] 7.2 Com a confirmação do usuário para o custo, rodar uma pergunta com `--only 5`; verificar pelo resultado esperado (item 51) e comparar os tokens com a estimativa antes de seguir
- [ ] 7.3 Com nova confirmação do usuário, e com a pergunta 11 escrita por ele na hora, rodar as 18 perguntas; verificar pelo relatório aprovado, que mostra quem detectou cada urgência. Se alguma falhar, ou se só a lista detectar uma urgência, parar e levar o resultado ao usuário
- [x] 7.4 Preparar o roteiro do celular: apontar para o local, entrar pela tela Módulos, enviar perguntas de cada tipo, testar falha de conexão e voltar à nuvem, com o aviso de que a migração pode chegar à nuvem no próximo `db push`, inerte, com o módulo `disabled` e sem dados da KB; verificar pelo roteiro entregue
- [ ] 7.5 O usuário executa o roteiro no celular; verificar pela confirmação dele, já que a web não conta como validação

## Workflow follow-up

- Depois da aprovação do teste no celular, arquivar a mudança com `/opsx:archive`.
- Os commits ficam com o usuário.
- Publicar na nuvem ou usar com pacientes reais exige nova mudança, depois da consulta regulatória e da opinião do médico parceiro.
