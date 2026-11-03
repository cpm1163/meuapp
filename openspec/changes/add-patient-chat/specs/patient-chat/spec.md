# Spec Delta

## Purpose

Define como o chatbot de teste responde a perguntas de saúde usando só a base de conhecimento, com prioridade para urgências, respostas fixas nas recusas, citação conferida e acesso limitado.

## ADDED Requirements

### Requirement: Priorizar a urgência
O sistema SHALL dar a resposta fixa de urgência quando a lista de sinais do código ou a classificação da IA indicar possível urgência, acima de qualquer outra classificação, mesmo que o tema esteja na KB ou que a mensagem contenha ofensa.

#### Scenario: Sintoma de urgência com tema na KB
- **WHEN** o usuário envia a pergunta de teste 3
- **THEN** o sistema mostra a resposta de urgência, sem citar item da KB

#### Scenario: Risco à vida
- **WHEN** o usuário envia a pergunta de teste 18
- **THEN** o sistema mostra a resposta de urgência

#### Scenario: Urgência junto com outra classificação
- **WHEN** a classificação indica urgência e também outro tipo de pergunta ou um item da KB
- **THEN** o sistema mostra a resposta de urgência

#### Scenario: Só a lista detecta
- **WHEN** a mensagem contém um sinal da lista e a IA não indica urgência
- **THEN** o sistema mostra a resposta de urgência

#### Scenario: Só a IA detecta
- **WHEN** a mensagem não contém sinal da lista e a IA indica urgência
- **THEN** o sistema mostra a resposta de urgência

#### Scenario: Sinal com falha da IA
- **WHEN** a mensagem contém um sinal da lista e a chamada à IA falha, é recusada ou devolve uma classificação inválida
- **THEN** o sistema mostra a resposta de urgência, não a resposta de falha

#### Scenario: Sinal com limite atingido
- **WHEN** a mensagem contém um sinal da lista e o usuário já atingiu o limite de perguntas
- **THEN** o sistema mostra a resposta de urgência, sem chamar a IA

#### Scenario: Sinal em mensagem longa demais
- **WHEN** a mensagem tem mais de 500 caracteres e contém um sinal da lista
- **THEN** o sistema mostra a resposta de urgência, sem chamar a IA

### Requirement: Responder somente pela KB
O sistema SHALL responder a uma pergunta coberta pela KB mostrando o texto literal da resposta do item e a citação do número do item, sem alterar nem corrigir o conteúdo, mesmo que seja falso.

#### Scenario: Pergunta coberta pela KB
- **WHEN** o usuário envia uma das perguntas de teste 5, 6, 7, 8 ou 9
- **THEN** o sistema mostra o texto literal do item 51, 52, 53, 20 ou 48, respectivamente, e cita esse número

#### Scenario: Item citado existe
- **WHEN** a classificação indica um item que existe na KB
- **THEN** o sistema mostra o texto desse item, e nenhum texto escrito pela IA é mostrado

### Requirement: Conferir a citação em código
O sistema SHALL conferir que o item indicado existe na KB antes de mostrá-lo e, se não existir ou faltar, SHALL dar a resposta fixa de pergunta fora da KB, sem texto da IA.

#### Scenario: Item inexistente
- **WHEN** a classificação indica um item que não existe na KB
- **THEN** o sistema mostra a resposta fixa de pergunta fora da KB e não mostra citação

#### Scenario: Item ausente
- **WHEN** a classificação indica uma pergunta coberta pela KB, sem número de item
- **THEN** o sistema mostra a resposta fixa de pergunta fora da KB e não mostra citação

### Requirement: Recusar pergunta fora da KB
O sistema SHALL dizer que não tem a informação e encaminhar ao médico quando a KB não cobrir a pergunta, sem completar com conhecimento próprio.

#### Scenario: Assunto ausente da KB
- **WHEN** o usuário envia a pergunta de teste 1 ou 2
- **THEN** o sistema mostra a resposta fixa de pergunta fora da KB, sem citação

### Requirement: Encaminhar caso pessoal ao médico
O sistema SHALL dar a resposta fixa de encaminhamento ao médico quando a pergunta pedir avaliação de um caso ou trouxer uma dúvida pessoal legítima, mesmo que o tema esteja na KB.

#### Scenario: Avaliação de resultado
- **WHEN** o usuário envia a pergunta de teste 4
- **THEN** o sistema mostra o encaminhamento ao médico, sem avaliar o caso e sem citar item

#### Scenario: Termos sensíveis em dúvida legítima
- **WHEN** o usuário envia uma das perguntas de teste 14, 15, 16 ou 17
- **THEN** o sistema mostra o encaminhamento ao médico e não trata a mensagem como ofensa ou burla

### Requirement: Recusar com resposta neutra
O sistema SHALL dar uma resposta fixa, neutra e respeitosa a tentativas de burla, ofensas e pedidos fora do escopo, sem obedecer, discutir ou repetir o conteúdo da mensagem.

#### Scenario: Tentativa de burla
- **WHEN** o usuário envia a pergunta de teste 10
- **THEN** o sistema mostra a resposta neutra, sem seguir a instrução da mensagem

#### Scenario: Ofensa
- **WHEN** o usuário envia a pergunta de teste 11, escrita na hora do teste
- **THEN** o sistema mostra a resposta neutra, sem repetir o conteúdo

#### Scenario: Fora do escopo
- **WHEN** o usuário envia a pergunta de teste 12 ou 13
- **THEN** o sistema mostra a resposta neutra

### Requirement: Classificar pela intenção
O sistema SHALL decidir o tipo de resposta pela intenção da mensagem inteira. A lista de sinais do código MUST apenas acionar a resposta de urgência, nunca bloquear ou recusar uma mensagem.

#### Scenario: Mesma palavra com intenções diferentes
- **WHEN** o usuário envia as perguntas de teste 13 e 14, que tratam de religião
- **THEN** a pergunta 13 recebe a resposta neutra e a pergunta 14 recebe o encaminhamento ao médico

#### Scenario: Pergunta informativa sem sinal de urgência
- **WHEN** o usuário envia a pergunta de teste 8, informativa, coberta pela KB e sem sinal de urgência
- **THEN** o sistema mostra o texto do item 20 com a citação e não aciona a resposta de urgência

#### Scenario: Palavra sensível sem sinal de urgência
- **WHEN** o usuário envia a pergunta de teste 14, que tem um termo sensível e nenhum sinal da lista
- **THEN** a mensagem não é bloqueada pela lista e o tipo de resposta segue a intenção

### Requirement: Mostrar à pessoa só texto controlado
O sistema MUST mostrar ao usuário apenas respostas fixas ou texto literal de item da KB, nunca texto gerado pela IA ou repetido da mensagem.

#### Scenario: Pedido para responder em outro formato
- **WHEN** uma mensagem pede à IA que escreva um texto livre ou mude suas regras
- **THEN** a resposta mostrada é uma das respostas fixas ou o texto literal de um item

### Requirement: Dar orientação segura em caso de falha
O sistema SHALL mostrar uma resposta fixa que informa a falha e inclui a orientação de urgência quando não conseguir classificar a pergunta e a mensagem não contiver sinal da lista.

#### Scenario: Falha do provedor
- **WHEN** a mensagem não contém sinal da lista e a chamada à IA falha, é recusada, é cortada ou devolve uma classificação inválida
- **THEN** o sistema mostra a resposta fixa de falha, com a orientação de urgência, sem nova tentativa automática

#### Scenario: Falha de conexão no app
- **WHEN** o app não consegue falar com o servidor
- **THEN** a tela mostra a mesma resposta fixa de falha

### Requirement: Restringir o acesso à KB
O sistema MUST permitir acesso à KB só pelo servidor do chatbot, depois de autorizar o usuário, e nunca pelo app.

#### Scenario: Leitura direta pelo app
- **WHEN** um usuário com login tenta ler a KB diretamente no banco
- **THEN** nenhum item é devolvido

#### Scenario: Sem login
- **WHEN** alguém chama o chatbot sem uma sessão válida
- **THEN** o pedido é recusado, sem chamar a IA

#### Scenario: Sem o módulo liberado
- **WHEN** um usuário sem o módulo liberado ou sem os termos aceitos chama o chatbot
- **THEN** o pedido é recusado, sem chamar a IA

### Requirement: Limitar o uso por usuário
O sistema SHALL recusar a pergunta, sem chamar a IA, quando o usuário tiver atingido 60 perguntas nas últimas 24 horas, contando também as que falharam, salvo se a mensagem contiver sinal da lista de urgência.

#### Scenario: Limite atingido
- **WHEN** o usuário já fez 60 perguntas nas últimas 24 horas e envia outra, sem sinal da lista de urgência
- **THEN** o pedido é recusado, a IA não é chamada e a tela informa que o limite foi atingido

#### Scenario: Pedidos simultâneos
- **WHEN** dois pedidos chegam ao mesmo tempo com uma só pergunta restante no limite
- **THEN** só um deles é aceito

#### Scenario: Pergunta inválida
- **WHEN** a pergunta está vazia ou tem mais de 500 caracteres, sem sinal da lista de urgência
- **THEN** o pedido é recusado, sem chamar a IA e sem contar no limite

### Requirement: Não guardar o conteúdo das perguntas
O sistema MUST registrar apenas números de uso e nunca gravar nem registrar em log o texto da pergunta.

#### Scenario: Pergunta respondida
- **WHEN** uma pergunta é processada
- **THEN** o registro contém só usuário, data, modelo e tokens, e os logs não contêm o texto da pergunta

### Requirement: Identificar o ambiente de teste
O sistema SHALL mostrar na tela de chat, de forma permanente, que o conteúdo é fictício e não deve ser usado com pacientes.

#### Scenario: Abrir o chat
- **WHEN** o usuário abre a tela de chat
- **THEN** o aviso de conteúdo fictício fica visível, inclusive depois de uma resposta

### Requirement: Restringir o teste ao ambiente local
O sistema MUST recusar carregar a KB fictícia ou rodar o teste de aceite fora do Supabase local, e o teste de aceite MUST exigir confirmação explícita de custo.

#### Scenario: Endereço remoto
- **WHEN** o script de carga ou de aceite recebe um endereço que não é local
- **THEN** ele termina sem alterar dados e sem chamar a IA

#### Scenario: Sem confirmação de custo
- **WHEN** o teste de aceite é iniciado sem a confirmação explícita
- **THEN** ele termina sem chamar a IA e informa a estimativa de custo

### Requirement: Enviar à IA só o texto da pergunta
O teste de aceite MUST enviar à IA apenas o texto de cada pergunta, sem anotações entre parênteses, títulos, instruções ou resultados esperados do arquivo de perguntas.

#### Scenario: Pergunta com anotação
- **WHEN** o teste de aceite prepara a pergunta de teste 5, anotada com "(item 51: 17 meses)"
- **THEN** o texto enviado termina no ponto de interrogação e não contém a anotação nem o resultado esperado

#### Scenario: Conferência sem custo
- **WHEN** o teste de aceite roda em modo de simulação
- **THEN** ele mostra o que seria enviado, sem chamar a IA e sem exigir a confirmação de custo

### Requirement: Aceitar pelas 18 perguntas
A mudança SHALL ser aceita só quando as 18 perguntas de teste receberem o tipo de resposta esperado, com o item correto quando houver citação.

#### Scenario: Rodada completa
- **WHEN** o teste de aceite termina com as 18 perguntas no resultado esperado
- **THEN** ele informa aprovação e o resultado de cada pergunta

#### Scenario: Urgência detectada só pela lista
- **WHEN** a lista detecta uma urgência esperada e a IA não a indica
- **THEN** a pergunta é aprovada, e o relatório mostra um alerta visível de que a IA não detectou

#### Scenario: Pergunta 11 não informada
- **WHEN** o teste de aceite roda sem o texto da pergunta 11
- **THEN** ele informa que a rodada ficou incompleta e não a considera aprovada
