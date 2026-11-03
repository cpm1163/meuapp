# Tasks

## 1. Regras de seleção

- [x] 1.1 Criar `src/features/alerts/selection.ts` com as regras de marcar um, marcar ou desmarcar todos, retirar ids e montar o aviso "X de Y marcados"; verificar com a tarefa 1.2
- [x] 1.2 Criar `tests/alerts.test.cjs`, incluí-lo no script `test` do `package.json` e cobrir as regras e os cenários de aviso da spec; verificar com `npm test`

## 2. Tela de Alertas

- [x] 2.1 Fazer `AlertsScreen.tsx` usar `selection.ts`, sem mudar o comportamento já existente; verificar com `npm test` e `npx tsc --noEmit`
- [x] 2.2 Preservar os outros alertas marcados ao excluir um único alerta, mantendo a seleção em caso de falha; verificar com os testes de retirada de ids e o roteiro da tarefa 4.1
- [x] 2.3 Buscar o total na carga da tela e mostrar o aviso quando houver mais alertas do que os carregados, sem bloquear a lista se a contagem falhar; verificar com os testes de aviso e o roteiro da tarefa 4.1

## 3. Serviço, banco e documentação

- [x] 3.1 Testar em `tests/alerts.test.cjs` que `service.remove` envia os ids informados, não chama o banco com lista vazia e propaga o erro; verificar com `npm test`
- [x] 3.2 Adicionar a `supabase/tests/alerts_rls.test.sql` a exclusão de vários alertas de uma vez, cobrindo alertas de outro médico e documentos preservados, e atualizar o `plan`; verificar com `npm run test:db`
- [x] 3.3 Registrar em `docs/alerts.md` o limite de 50 alertas carregados, o aviso e a preservação da seleção; verificar relendo o trecho contra a spec

## 4. Verificação integrada

- [x] 4.1 Rodar `npx expo lint` e `npx tsc --noEmit` e preparar o roteiro de teste manual com os cenários da spec; verificar pelos comandos sem erro e pelo roteiro entregue
- [x] 4.2 O usuário executa o roteiro no celular, incluindo "Marcar todos" → "Excluir selecionados"; verificar pela confirmação dele, já que a web não conta como validação

## Workflow follow-up

- Depois da aprovação do teste no celular, arquivar a mudança com `/opsx:archive`.
- Os commits ficam com o usuário.
