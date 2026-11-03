# Spec Delta

## Purpose

Define como o médico seleciona e exclui alertas na tela de Alertas, garantindo que a exclusão atinja só os alertas escolhidos e nunca os documentos.

## ADDED Requirements

### Requirement: Marcar e desmarcar todos os alertas carregados
O sistema SHALL oferecer uma ação que marca todos os alertas carregados na tela e, quando todos já estiverem marcados, os desmarca.

#### Scenario: Marcar todos
- **WHEN** o médico toca em "Marcar todos"
- **THEN** todos os alertas carregados ficam marcados e a ação passa a se chamar "Desmarcar todos"

#### Scenario: Desmarcar todos
- **WHEN** todos os alertas carregados estão marcados e o médico toca em "Desmarcar todos"
- **THEN** nenhum alerta fica marcado e a ação de excluir selecionados deixa de aparecer

#### Scenario: Lista vazia
- **WHEN** não há alertas
- **THEN** a ação "Marcar todos" não aparece

### Requirement: Marcar alertas individualmente
O sistema SHALL permitir marcar e desmarcar cada alerta separadamente, mostrando quantos estão selecionados na ação de excluir.

#### Scenario: Marcar um alerta
- **WHEN** o médico marca um alerta
- **THEN** a ação "Excluir selecionados (1)" aparece

#### Scenario: Completar a seleção um a um
- **WHEN** o médico marca individualmente todos os alertas carregados
- **THEN** a ação passa a se chamar "Desmarcar todos"

### Requirement: Avisar quando há mais alertas do que os carregados
O sistema SHALL mostrar quantos alertas estão marcados em relação ao total quando houver alertas marcados e o total for maior que a quantidade carregada na tela.

#### Scenario: Mais alertas do que os carregados
- **WHEN** o médico tem 120 alertas, a tela carregou 50 e ele toca em "Marcar todos"
- **THEN** a tela mostra "50 de 120 marcados"

#### Scenario: Todos os alertas carregados
- **WHEN** o médico tem 30 alertas, todos carregados, e marca algum deles
- **THEN** o aviso não aparece

#### Scenario: Próximos alertas depois da exclusão
- **WHEN** o médico exclui os 50 alertas marcados de um total de 120
- **THEN** a tela carrega os próximos alertas, sem nenhum marcado

### Requirement: Confirmar a exclusão em lote
O sistema SHALL exigir uma segunda confirmação antes de excluir alertas selecionados e informar que os documentos não serão excluídos.

#### Scenario: Primeiro toque não exclui
- **WHEN** o médico toca em "Excluir selecionados"
- **THEN** nada é excluído, a ação passa a se chamar "Confirmar exclusão" com a quantidade, e a tela informa que os documentos continuam na Caixa de entrada

#### Scenario: Cancelar a confirmação
- **WHEN** o médico toca em "Não excluir"
- **THEN** nada é excluído e a seleção é mantida

#### Scenario: Alterar a seleção durante a confirmação
- **WHEN** o médico marca ou desmarca um alerta durante a confirmação
- **THEN** a confirmação é cancelada e nada é excluído

### Requirement: Excluir apenas os alertas selecionados
O sistema SHALL excluir somente os alertas selecionados que pertencem ao médico, sem alterar nenhum documento.

#### Scenario: Exclusão confirmada
- **WHEN** o médico confirma a exclusão de dois alertas e um terceiro não está marcado
- **THEN** os dois alertas são excluídos, o terceiro permanece e a seleção fica vazia

#### Scenario: Documentos preservados
- **WHEN** alertas são excluídos
- **THEN** os documentos ligados a eles continuam existindo

#### Scenario: Alerta de outro médico
- **WHEN** um médico tenta excluir alertas de outro médico
- **THEN** nenhum alerta do outro médico é excluído

#### Scenario: Falha na exclusão
- **WHEN** a exclusão falha
- **THEN** a tela mostra uma mensagem de erro e a seleção é mantida

### Requirement: Excluir um único alerta preservando a seleção
O sistema SHALL excluir imediatamente o alerta cujo botão "Excluir" foi tocado, mantendo marcados os demais alertas selecionados.

#### Scenario: Excluir outro alerta com seleção ativa
- **WHEN** dois alertas estão marcados e o médico toca em "Excluir" em um terceiro
- **THEN** só o terceiro é excluído e os dois continuam marcados

#### Scenario: Excluir um alerta marcado
- **WHEN** dois alertas estão marcados e o médico toca em "Excluir" em um deles
- **THEN** esse alerta é excluído e o outro continua marcado

### Requirement: Retirar da seleção os alertas que não existem mais
O sistema SHALL retirar da seleção, ao recarregar a lista, os alertas que deixaram de existir.

#### Scenario: Pendência resolvida
- **WHEN** um alerta marcado some porque a pendência foi resolvida e a lista é recarregada
- **THEN** ele sai da seleção e a contagem de selecionados diminui
