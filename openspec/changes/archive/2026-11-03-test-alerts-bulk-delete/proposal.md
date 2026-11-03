# Proposal

## Why

A seleção e a exclusão em lote da tela de Alertas foram implementadas em 29/10/2026, mas ainda não foram testadas no celular e não têm teste automatizado da seleção. A leitura do código mostrou dois problemas: com mais de 50 alertas, "Marcar todos" marca só os 50 carregados sem avisar, e excluir um único alerta apaga a seleção feita nos outros.

## What Changes

- Registrar em spec o comportamento de marcar, desmarcar e excluir alertas, que hoje só está descrito em `docs/alerts.md`.
- Avisar quantos alertas estão marcados em relação ao total quando houver mais alertas do que os carregados na tela (por exemplo, "50 de 120 marcados").
- Preservar os outros alertas marcados quando o médico excluir um único alerta.
- Adicionar testes automatizados da seleção, do serviço de alertas e da exclusão em lote no banco.
- Fazer o teste manual pendente no celular.

Fora do escopo: excluir alertas que não foram carregados, paginar a lista, novos tipos de alerta e a ficha do paciente, que tem teste pendente próprio.

## Capabilities

### New Capabilities

- `alert-deletion`: como o médico seleciona e exclui alertas na tela de Alertas, sem afetar os documentos.

### Modified Capabilities

Nenhuma; ainda não há specs no projeto.

## Impact

- **App:** `src/features/alerts/AlertsScreen.tsx` e um novo módulo de seleção em `src/features/alerts/`.
- **Testes:** novo `tests/alerts.test.cjs`, incluído no script `test` do `package.json`, e novas asserções em `supabase/tests/alerts_rls.test.sql`.
- **Documentação:** `docs/alerts.md`.
- **Sem impacto:** migrações, Edge Functions, dependências e código nativo. Não há chamadas à IA nem custo de nuvem; o teste no celular não exige novo build, porque a mudança é só em JavaScript.
