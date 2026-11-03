# Design

## Context

A seleção vive em `src/features/alerts/AlertsScreen.tsx`, misturada à tela. Os testes do projeto rodam em `node --test`, carregando módulos TypeScript transpilados e com o cliente Supabase falso; não há biblioteca para renderizar componentes. O banco é testado com pgTAP em `supabase/tests/alerts_rls.test.sql`, que já cobre a exclusão de um alerta e o isolamento entre médicos. `service.count()` já existe e `service.list()` limita a lista a `ALERT_PAGE_SIZE` (50).

## Goals / Non-Goals

**Goals:**

- Cobrir com testes automatizados as regras da seleção, sem depender de renderizar a tela.
- Mudar o mínimo necessário na tela.

**Non-Goals:**

- Adicionar biblioteca de testes de componentes.
- Automatizar o toque na tela; isso fica para o teste manual no celular.

## Decisions

### Extrair as regras da seleção para um módulo puro

Criar `src/features/alerts/selection.ts`, sem dependências, com as regras de marcar um, marcar ou desmarcar todos, retirar ids da seleção e montar o aviso de quantidade. A tela passa a usar essas funções.

*Alternativa:* adicionar React Native Testing Library. Foi descartada por trazer dependência nova para poucas regras, fora do padrão atual dos testes.

### Buscar o total junto com a lista

O carregamento da tela chama `service.list()` e `service.count()`. O aviso aparece só quando há alertas marcados e o total é maior que a quantidade carregada. Se a contagem falhar, a lista continua aparecendo e o aviso é omitido, porque ele é informativo.

*Alternativa:* usar a contagem devolvida pela própria consulta da lista. Foi descartada porque muda o retorno de `list()`, sem ganho relevante para este caso.

### Retirar da seleção só os ids excluídos

Depois de excluir com sucesso, a tela remove da seleção apenas os ids enviados. Na exclusão em lote a seleção fica vazia, e na individual os outros continuam marcados. Em caso de falha, a seleção não muda.

### Testar a exclusão em lote também no banco

Adicionar a `alerts_rls.test.sql` asserções de exclusão de vários ids de uma vez: os alertas do médico são excluídos, os de outro médico permanecem e os documentos continuam existindo.

## Risks / Trade-offs

- [A tela em si não tem teste automatizado] → O teste manual no celular cobre os toques, e as regras ficam nos testes do módulo puro.
- [Consulta extra a cada carregamento] → A contagem usa `head: true`, sem trazer linhas.
- [O total pode mudar entre as duas consultas] → O aviso é só informativo e se corrige no próximo carregamento.
