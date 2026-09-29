# Passo a passo: validação de login e cadastro

Este roteiro acompanha a implementação na branch `dev03`, em React Native + TypeScript. Algumas etapas já foram realizadas; confira o progresso abaixo antes de continuar. Faça uma etapa por vez e teste antes de avançar.

## Escopo desta etapa: somente validação

Nesta atividade, você vai conferir os valores digitados e mostrar as mensagens de erro. Quando todos os campos forem válidos, mostre apenas uma mensagem de validação concluída.

**Não haverá gravação dos dados:** não implemente banco de dados, arquivos, armazenamento local, envio para API, criação de conta ou autenticação.

Os estados do React manterão os textos temporariamente na memória enquanto o formulário estiver em uso. Isso permite validar o que foi digitado; não significa salvar um cadastro. Não é necessário manter os valores depois que o formulário for desmontado ou o aplicativo for reiniciado.

Use estas mensagens ao concluir uma tentativa sem erros:

- Login: “Campos válidos. Nenhum login foi realizado.”
- Cadastro: “Campos válidos. Nenhum cadastro foi salvo.”

O objetivo está concluído quando os campos inválidos exibem seus erros e os campos válidos permitem mostrar essa confirmação. A gravação dos dados será uma atividade separada, caso seja solicitada depois.

## Progresso atual e próximo passo

Já implementado:

- `validateEmail` verifica preenchimento e formato básico do e-mail.
- `validateNewPassword` verifica preenchimento, tamanho, maiúscula, minúscula, número e símbolo.
- O login usa `validateEmail` e `validateNewPassword`, aplicando todos os critérios de senha ao tocar em Entrar.
- As duas funções de `validation.ts` usam exportações nomeadas: seus imports usam chaves.

Ainda pendente:

- Conectar os quatro campos e o botão da tela de cadastro às validações.
- Comparar senha e confirmação.
- Mostrar erros abaixo dos campos e a confirmação de validação na própria tela.
- Testar a interface no Android e no iOS.

**Próximo passo:** siga a seção 11.8 para conectar as funções ao cadastro, usando a seção 11.7 para criar os estados e a seção 11.6 para apresentar as mensagens. Não é necessário criar novamente as funções que já existem.

### Plataformas e ambiente de teste

O objetivo é funcionar no **iOS e no Android**. As regras de validação são compartilhadas em TypeScript. Diferenças de teclado, área segura, rolagem e apresentação de mensagens devem ser conferidas separadamente em cada plataforma, com os ajustes necessários quando aparecerem.

Você passou a testar pelo celular. Registre qual plataforma foi testada e deixe a outra pendente até conferir. O navegador também permite avançar na lógica. O login ainda apresenta os resultados por `Alert.alert`; não dependa desses alertas para ver o resultado na web. Priorize mensagens na própria tela, incluindo a confirmação quando os campos estiverem válidos.

Na conferência final de cada plataforma, verifique se o teclado cobre os campos ou o botão, se é possível rolar até as mensagens, se os textos maiores permanecem legíveis e se o conteúdo respeita as áreas reservadas pelo sistema. Não declare compatibilidade nativa apenas porque funcionou no navegador.

## Antes de começar: como usar este guia

Você fará as alterações no código. Este documento explica as decisões e a sequência, sem entregar as telas prontas. Os comandos de terminal são para executar no terminal do VS Code; os nomes de funções e variáveis são sugestões para você escrever nos arquivos indicados.

1. No terminal, execute `git branch --show-current`. A resposta deve ser `dev03`.
2. Execute `git status --short` para conhecer os arquivos que já estão alterados. `??` indica arquivos ainda não acompanhados pelo Git; você pode continuar sem executar `git add`. Não apague mudanças anteriores.
3. Abra `src/app/index.tsx` e `src/app/signup.tsx` lado a lado.
4. Faça primeiro a validação do login, que já possui estados e uma função ligada ao botão.
5. Somente depois de testar o login, avance para o cadastro.
6. Salve o arquivo a cada pequena mudança. Se surgir um erro, resolva-o antes de continuar.

### O que existe hoje

| Arquivo | Responsabilidade atual | O que você fará |
| --- | --- | --- |
| `src/app/index.tsx` | Valida e-mail e todos os critérios de senha, usando alertas | Exibir os erros e a confirmação na própria tela |
| `src/app/signup.tsx` | Aparência da tela de cadastro | Guardar os valores digitados, validar e ligar o botão a uma função |
| `src/components/input.tsx` | Campo de texto reutilizável | Pode permanecer como está nesta etapa |
| `src/components/Button.tsx` | Botão reutilizável | Pode permanecer como está nesta etapa |
| `src/app/_layout.tsx` | Navegação das telas | Não precisa mudar para validar formulários |
| `src/utils/validation.ts` | Contém `validateEmail` e `validateNewPassword` | Reutilizar no cadastro e acrescentar a confirmação |

### Conceitos que você vai usar

- **String:** um valor de texto, como um nome, e-mail ou senha. Um texto sem nenhum caractere é uma string vazia.
- **Estado:** informação que o React guarda entre as atualizações da tela. No seu login, `email` guarda o texto e `setEmail` solicita sua atualização. `email` não é uma função.
- **Função:** um conjunto de instruções executado quando é chamado. `handleSignIn` é chamado ao tocar em “Entrar”.
- **Parâmetro:** informação que uma função recebe para trabalhar. Uma função de validação de e-mail recebe o e-mail digitado.
- **Retorno:** resultado que uma função entrega a quem a chamou. Neste guia, será uma mensagem de erro ou `null`.
- **`null`:** representa a ausência de um valor. Aqui, significa “nenhum erro”. Não é o texto `"null"`.
- **Objeto:** conjunto de valores identificados por nomes. Um objeto de erros pode ter as propriedades `email` e `password`, cada uma com sua mensagem ou `null`.
- **Condição:** uma pergunta feita pelo programa, como “a senha está vazia?”. O resultado decide qual caminho executar.
- **Renderização:** momento em que o React calcula o que a tela deve mostrar com os valores atuais.
- **Validação:** verifica se o dado atende a uma regra. Não comprova que a senha pertence a uma conta.

### Fluxo que você vai construir

```text
Usuário digita nos campos
        ↓
Os estados guardam os textos
        ↓
Usuário toca no botão
        ↓
A função do botão calcula os erros de todos os campos
        ↓
A tela recebe as mensagens atualizadas
        ↓
Existe algum erro?
   Sim → interromper a ação e permitir correção
   Não → mostrar que a validação passou
```

Não implemente todas as melhorias de uma vez. Seu primeiro objetivo é conseguir digitar um e-mail inválido, tocar em “Entrar” e ver a mensagem correta.

## 1. Defina as regras

Para este exercício, use estas regras:

| Campo | Login | Cadastro |
| --- | --- | --- |
| Nome | Não existe | Obrigatório; não pode conter apenas espaços |
| E-mail | Obrigatório e com formato válido | Mesma regra do login |
| Senha | Pelo menos 12 caracteres, uma maiúscula, uma minúscula, um número de 0 a 9 e um símbolo | Mesmas regras do login |
| Confirmar senha | Não existe | Obrigatório e exatamente igual à senha |

A regra escolhida para este projeto exige todos esses requisitos no login e no cadastro. Letras acentuadas são aceitas. Espaços são permitidos, mas não contam como símbolo; uma senha composta só por espaços é rejeitada. Cumprir os requisitos não garante, por si só, uma senha segura.

Por decisão deste exercício, o login também aplica os critérios completos de senha. Isso verifica as regras locais; não autentica nem grava dados.

## 2. Separe as regras reutilizáveis

O arquivo `src/utils/validation.ts` já foi criado. Mantenha esse arquivo fora de `src/app/`, que contém as rotas.

Planeje funções que recebam um texto e devolvam uma mensagem de erro ou uma indicação de que não há erro. Use o mesmo padrão de retorno em todas elas.

- Validação de e-mail: usada nas duas telas.
- Validação de senha: já usada no login e a conectar ao cadastro. O nome da função continua `validateNewPassword`.
- Confirmação de senha: comparação exata entre os dois valores.

Essas funções devem apenas validar dados. Exibir mensagens e atualizar a tela fica por conta dos componentes.

## 3. Valide o formato do e-mail

1. Remova espaços apenas do início e do fim do e-mail.
2. Confira se o resultado está vazio. Se estiver, retorne “Informe seu e-mail.”.
3. Para uma checagem simples deste exercício, exija texto antes de um único `@`, um domínio com ponto e texto depois do ponto, sem espaços internos.
4. Se o formato falhar, retorne “Informe um e-mail válido, como nome@dominio.com.”.
5. Reutilize essa mesma regra no login e no cadastro.

Essa checagem é simplificada: não cobre todos os endereços permitidos pelos padrões de e-mail. Formato válido também não confirma que a caixa existe ou pertence ao usuário; isso exige uma confirmação enviada por e-mail futuramente.

## 4. Valide os critérios de senha

A função `validateNewPassword` já aplica as verificações nesta ordem:

| Ordem | Verificação | Mensagem quando falha |
| --- | --- | --- |
| 1 | Vazia ou só espaços | Informe uma senha. |
| 2 | Menos de 12 caracteres | Use pelo menos 12 caracteres. |
| 3 | Falta maiúscula | Inclua pelo menos uma letra maiúscula. |
| 4 | Falta minúscula | Inclua pelo menos uma letra minúscula. |
| 5 | Falta número de 0 a 9 | Inclua pelo menos um número de 0 a 9. |
| 6 | Falta pontuação ou símbolo | Inclua pelo menos um símbolo, como !, @ ou #. |

Cada `return` encerra a função. Por isso, ela retorna somente o primeiro requisito não atendido. Se todas as verificações passarem, retorna `null`.

A confirmação será uma verificação separada: se estiver vazia, mostre “Confirme sua senha.”; se for diferente da senha original, mostre “As senhas não coincidem.”. Compare também espaços e diferenças entre maiúsculas e minúsculas.

Não remova espaços nem transforme a senha em minúsculas. Consultar `trim()` para detectar apenas espaços não altera a senha original. A implementação usa `password.length`, que conta unidades UTF-16; emojis e caracteres combinados podem ocupar mais de uma unidade. Para testar o limite nesta etapa, use os exemplos simples deste guia.

## 5. Aplique ao login

Arquivo: `src/app/index.tsx`.

1. Aproveite os estados `email` e `password` que já existem.
2. Planeje um estado para guardar os erros de cada campo.
3. Dentro de `handleSignIn`, substitua a mensagem genérica de campos vazios por validações individuais.
4. Valide o e-mail com a função compartilhada.
5. Para a senha, chame `validateNewPassword(password)` e use a mensagem retornada.
6. Calcule todos os erros em uma variável local e, depois, atualize o estado da tela.
7. Se essa variável contiver algum erro, encerre a função antes da mensagem de sucesso.
8. Se os campos estiverem válidos, use uma mensagem como “Campos válidos. Nenhum login foi realizado.”.

Não leia o estado de erros imediatamente após atualizá-lo para decidir se pode continuar: a atualização do estado só será refletida em uma renderização posterior. Tome essa decisão usando os erros que acabou de calcular.

## 6. Aplique ao cadastro

Arquivo: `src/app/signup.tsx`.

1. Crie estados para nome, e-mail, senha e confirmação de senha.
2. Conecte cada campo ao seu estado, seguindo o exemplo de atualização de texto da tela de login.
3. Mantenha o valor exibido em cada campo sincronizado com o respectivo estado.
4. Crie um estado para os erros dos quatro campos.
5. Crie uma função `handleSignUp` e associe-a ao botão “Cadastrar”.
6. Nessa função, valide nome, e-mail, nova senha e confirmação.
7. Atualize as mensagens e interrompa o fluxo se houver erros.
8. Sem erros, mostre “Campos válidos. Nenhum cadastro foi salvo.”.

O nome deve aceitar acentos, espaços, hífens e apóstrofos. Neste exercício, basta exigir que não esteja vazio após desconsiderar espaços nas extremidades.

## 7. Mostre os erros na tela

Comece exibindo um texto abaixo de cada campo, nas próprias telas. Você pode manter `src/components/input.tsx` como está nesta primeira etapa.

- Mostre a mensagem somente quando houver erro naquele campo.
- Use uma mensagem textual; não dependa somente de cor.
- Mostre a orientação “Use pelo menos 12 caracteres, com maiúscula, minúscula, número e símbolo” junto à senha das duas telas antes do envio.
- Inicialmente, valide ao tocar em “Entrar” ou “Cadastrar”.
- A cada nova tentativa, substitua todos os erros pelos resultados atuais, removendo mensagens de campos corrigidos.
- Preserve os textos digitados quando houver erro.

Depois que isso funcionar, você pode melhorar a experiência removendo o erro do campo quando o usuário começar a corrigi-lo ou validando ao sair dele.

## 8. Teste manualmente

Os resultados de mensagens por campo descritos abaixo correspondem à interface que você ainda vai implementar. O login atual apresenta um alerta por vez; o cadastro ainda não executa as validações.

| Cenário | Resultado esperado |
| --- | --- |
| Login com os dois campos vazios | Erros de e-mail e senha; nenhuma mensagem de sucesso |
| E-mail `ana` | Erro de formato |
| E-mail `ana@` | Erro de formato |
| E-mail `ana exemplo@dominio.com` | Erro de formato |
| E-mail `ana@@dominio.com` | Erro de formato |
| E-mail `ana@dominio.com` | Aceito pela validação de formato |
| E-mail ` ana@dominio.com ` | Validado após remover espaços das extremidades |
| Login com e-mail válido e senha `abc` | Erro de tamanho mínimo |
| Login com e-mail válido e senha `Abcdefghij1!` | Campos válidos; nenhum login realizado |
| Cadastro com nome composto apenas por espaços | Erro no nome |
| Cadastro com senha de 11 caracteres | Erro de tamanho |
| Cadastro com senha `abcdefghijkl` | Erro por falta de maiúscula (primeiro requisito ausente) |
| Cadastro com senha `ABCDEFGHIJ1!` | Erro por falta de minúscula |
| Cadastro com senha `Abcdefghijk!` | Erro por falta de número |
| Cadastro com senha `Abcdefghijk1` | Erro por falta de símbolo |
| Cadastro com senha `Abcdefghij1 ` | Espaço não substitui o símbolo; rejeitar |
| Cadastro com senha `Abcdefghij1!` e confirmação igual | Aceito pelas regras do exercício |
| Cadastro com senha `Ábcdefghij1!` e confirmação igual | Aceito; maiúscula acentuada é reconhecida |
| Cadastro com senha composta por 12 espaços | Erro de preenchimento |
| Confirmação vazia | Erro solicitando confirmação |
| Confirmação diferente, inclusive em maiúsculas ou espaços | Erro de divergência |
| Corrigir os campos e enviar novamente | Erros antigos desaparecem |
| Enviar com teclado aberto ou em tela pequena | Campos, botão e mensagens continuam acessíveis |

Teste as duas telas no Android e no iOS quando tiver acesso a esses ambientes.

## 9. Verifique o projeto

Após implementar, execute na raiz:

```bash
npx tsc --noEmit
npx expo lint
```

Este projeto usa npm e Expo SDK 57. Na revisão anterior, faltavam as dependências e a configuração do ESLint: o comando de lint tentou configurá-las automaticamente. Se isso ocorrer, revise as alterações em `package.json`, no arquivo de lock e na configuração criada antes de incluí-las no commit.

## 10. Confira o que foi concluído

- [ ] Nenhum dado é enviado ou gravado; os valores ficam apenas no estado temporário do formulário.
- [ ] Login valida preenchimento e formato do e-mail, além de todos os critérios da senha.
- [ ] Cadastro valida todos os campos e a confirmação de senha.
- [ ] As regras compartilhadas ficam fora das telas.
- [ ] Os erros aparecem junto aos campos e são atualizados ao reenviar.
- [ ] Nenhum fluxo prossegue quando há erros.
- [ ] Senhas não são alteradas nem escritas no console.
- [ ] Mensagens não afirmam que houve autenticação ou criação de conta.
- [ ] Casos manuais, TypeScript e lint foram verificados.

Quando houver um servidor, ele também precisará validar os dados. A validação da tela melhora a experiência, mas não autentica usuários nem cria contas por si só.

## 11. Oficina guiada: como transformar as etapas em alterações

Use esta seção junto às etapas anteriores. Ela detalha onde trabalhar e o que observar, sem fornecer uma implementação pronta para copiar.

### 11.1. Crie o arquivo de validações (etapa já realizada)

O arquivo já existe: mantenha-o. As instruções abaixo ficam como referência.

No explorador de arquivos do VS Code:

1. Expanda a pasta `src`.
2. Crie dentro dela uma pasta chamada `utils`, se ainda não existir.
3. Dentro de `utils`, crie `validation.ts`.
4. Confira o caminho completo: `src/utils/validation.ts`.

A extensão `.ts` é suficiente porque esse arquivo terá lógica TypeScript, sem elementos visuais. As telas usam `.tsx` porque também descrevem a interface.

Escolha este contrato para as funções: **receber texto e retornar uma string com o erro ou `null` quando o valor for válido**. Não misture retorno de texto, verdadeiro/falso e `null`, pois isso dificulta o uso nas telas.

| Nome sugerido | O que recebe | Quando retorna erro |
| --- | --- | --- |
| `validateEmail` | E-mail | Vazio ou fora do formato escolhido |
| `validateNewPassword` | Nova senha | Vazia, só espaços, curta ou sem algum requisito de composição |
| `validatePasswordConfirmation` | Senha e confirmação | Confirmação vazia ou diferente |

Declare o tipo dos parâmetros como texto. No TypeScript, o tipo do retorno será a união entre texto e `null`, escrita como `string | null`. O símbolo de barra vertical significa “um tipo ou o outro”.

As duas funções existentes usam `export function`, sem `default`. Portanto, importe `validateEmail` e `validateNewPassword` com chaves nas duas telas. O alias `@/` já está configurado neste projeto para apontar para `src/`; portanto, o módulo será identificado como `@/utils/validation`, sem a extensão.

**Como conferir:** salve o arquivo e verifique a aba “Problemas” do VS Code. Se uma função importada não for encontrada, confira seu nome, a exportação e o caminho do arquivo.

### 11.2. Monte a função de e-mail em pequenas decisões

A ordem importa: um e-mail vazio deve gerar uma mensagem de preenchimento, não uma mensagem de formato.

1. Receba o texto original.
2. Crie uma variável local com o resultado de `trim()`. Esse método devolve um novo texto sem espaços nas extremidades; não remove espaços internos.
3. Se esse texto estiver vazio, retorne a mensagem de campo obrigatório.
4. Caso contrário, verifique o formato.
5. Se o formato falhar, retorne a mensagem de e-mail inválido.
6. Se nenhuma verificação falhar, retorne `null`.

A implementação atual utiliza uma expressão regular, isto é, um padrão para verificar o texto. O método `test()` responde se o texto corresponde a esse padrão. O operador `!` inverte o resultado para entrar na condição de erro quando não houver correspondência.

O padrão atual exige conteúdo antes do `@`, um domínio com ponto e conteúdo depois dele, sem espaços. É uma checagem básica, não uma validação completa dos padrões de e-mail. Por exemplo, ainda pode aceitar pontos consecutivos em um domínio; esse refinamento não foi implementado nesta etapa.

**Como conferir:** texto vazio, `ana` e `ana@@empresa.com` devem falhar; `ana@empresa.com.br` deve passar.

### 11.3. Monte a função de nova senha

Esta função já foi ampliada. Leia cada verificação no arquivo e compare com a ordem da seção 4.

As expressões usadas significam:

| Expressão | O que procura |
| --- | --- |
| `password.trim() === ""` | Texto vazio ou composto só por espaços |
| `password.length < 12` | Tamanho abaixo do mínimo |
| `/\p{Lu}/u` | Uma letra maiúscula, inclusive acentuada |
| `/\p{Ll}/u` | Uma letra minúscula, inclusive acentuada |
| `/[0-9]/` | Um dígito entre 0 e 9 |
| `/[\p{P}\p{S}]/u` | Pontuação ou símbolo, sem contar espaços |

O `u` ativa o modo Unicode da expressão regular. Unicode é o padrão usado para representar caracteres de diferentes idiomas. `Lu` representa letras maiúsculas; `Ll`, minúsculas; `P`, pontuação; e `S`, símbolos. A categoria de símbolos é ampla e pode incluir emojis, não apenas `!`, `@` e `#`.

Em cada checagem, `test(password)` busca pelo menos uma ocorrência. Se não encontrar, `!` torna a condição verdadeira e a função retorna a mensagem do requisito ausente.

Consultar uma versão com `trim()` para detectar uma senha composta só por espaços é diferente de substituir a senha por essa versão. O valor original deve continuar intacto.

| Texto de teste | Tamanho | Resultado no cadastro |
| --- | --- | --- |
| `Abcdefghi1!` | 11 | Rejeitar pelo tamanho |
| `Abcdefghij1!` | 12 | Aceitar |
| `Abcdefghijk1!` | 13 | Aceitar |
| `abcdefghijkl` | 12 | Rejeitar pela falta de maiúscula antes de verificar os demais requisitos |

Esses textos são apenas dados de teste, não sugestões de senha para uma conta real. Uma função correta no arquivo não torna o botão funcional automaticamente: é preciso chamá-la no fluxo do cadastro.

### 11.4. Prepare os erros do login

Dentro da função do componente `Index`, perto dos estados existentes, planeje um novo estado chamado `errors`, atualizado por `setErrors`.

Ele terá duas propriedades:

| Propriedade | Valor inicial | Possível valor após enviar |
| --- | --- | --- |
| `email` | `null` | “Informe um e-mail válido, como nome@dominio.com.” |
| `password` | `null` | “Informe uma senha.” |

Dê a cada propriedade o tipo `string | null`. Se o TypeScript conhecer apenas o valor inicial `null`, ele pode não aceitar uma string posteriormente sem uma declaração de tipo adequada. Você pode criar um tipo chamado `LoginErrors` para descrever esse objeto.

Os estados devem ficar no corpo do componente, antes de seu retorno visual. Não coloque `useState` dentro de `handleSignIn`, de uma condição ou de um laço.

**Como conferir:** ao abrir a tela, nenhum erro deve aparecer antes da primeira tentativa de envio.

### 11.5. Reorganize `handleSignIn`

Encontre `handleSignIn`, que já valida o e-mail e os critérios completos da senha e apresenta os resultados por alertas. Preserve o botão que já chama essa função.

Dentro da função, pense nesta sequência:

1. Crie uma variável local chamada `nextErrors`.
2. A propriedade de e-mail recebe o retorno de `validateEmail`.
3. A propriedade de senha recebe o retorno de `validateNewPassword(password)`: uma mensagem de erro ou `null`.
4. Entregue esse objeto completo para `setErrors`.
5. Consulte `nextErrors`: se alguma mensagem existir, encerre a função com `return`.
6. Somente depois dessa condição, mostre a mensagem de validação concluída.

**Por que `nextErrors`?** O estado `errors` pertence à renderização atual. Pedir sua atualização não troca imediatamente o valor que a função está enxergando. Já `nextErrors` contém os resultados calculados agora, então é a referência correta para decidir se deve interromper o envio.

**Por que substituir o objeto inteiro?** Imagine que o e-mail estava errado e a senha vazia. Ao corrigir somente o e-mail e enviar de novo, o novo objeto terá `email` igual a `null` e a mensagem da senha. Assim, o erro antigo do e-mail desaparece.

Não deixe o alerta antigo de sucesso antes dessa verificação, pois isso permitiria mostrar sucesso mesmo com erros.

### 11.6. Exiba uma mensagem por campo

No trecho visual do login, localize o campo com o texto “E-mail”. Logo depois dele, coloque a exibição condicional da mensagem de erro do e-mail, usando um elemento de texto. Repita a ideia depois do campo de senha.

“Condicional” significa: se a mensagem existir, o texto aparece; se o valor for `null`, nada é exibido naquele lugar.

Para começar, deixe esses textos nas telas. Seu componente `Input` atual não oferece uma propriedade própria para exibir erros: passar uma propriedade chamada `error` sem modificar o componente não cria automaticamente uma mensagem.

Adicione um estilo de mensagem no `StyleSheet` da tela. Escolha uma cor legível sobre o fundo claro e permita que a mensagem ocupe mais de uma linha. Não defina uma altura fixa pequena que possa cortar o texto.

Como o formulário já possui espaçamento entre os elementos, confira visualmente se a mensagem ficou próxima do campo correto. Se necessário, agrupe campo e mensagem em um contêiner próprio.

**Como conferir:** envie tudo vazio. As duas mensagens devem aparecer simultaneamente. Corrija só o e-mail e envie novamente: apenas o erro da senha deve permanecer.

### 11.7. Entenda a ligação entre campo e estado

Um campo conectado ao estado tem dois sentidos de comunicação:

- O valor do estado determina o texto exibido pelo campo, pela propriedade `value`.
- Ao digitar, o campo entrega o novo texto à função indicada em `onChangeText`, que atualiza o estado.

No login, `onChangeText` já atualiza `email` e `password`. Acrescente a ligação do valor exibido a esses mesmos estados ao implementar o formulário controlado.

Na tela de cadastro, crie essa ligação para os quatro campos:

| Campo | Estado sugerido | Função de atualização sugerida |
| --- | --- | --- |
| Nome | `name` | `setName` |
| E-mail | `email` | `setEmail` |
| Senha | `password` | `setPassword` |
| Confirmar senha | `confirmPassword` | `setConfirmPassword` |

Cada estado começa com um texto vazio. Tenha atenção especial à confirmação: ela deve ter seu próprio estado. Se os dois campos de senha usarem o mesmo estado, você não conseguirá comparar duas entradas independentes.

### 11.8. Construa a ação do cadastro

Em `signup.tsx`, você precisará importar `useState` para guardar os valores e as funções nomeadas `validateEmail` e `validateNewPassword` de `@/utils/validation`. Mostre também a confirmação de validação na própria tela, para poder testá-la no navegador.

1. Declare os quatro estados de texto no corpo do componente `SignUp`.
2. Declare o estado de erros com quatro propriedades, todas começando em `null` e aceitando texto ou `null`.
3. Crie `handleSignUp` dentro do componente e antes do retorno visual.
4. Calcule os erros de nome, e-mail, nova senha e confirmação em um objeto local.
5. Para o nome, verifique se está vazio após desconsiderar espaços das extremidades.
6. Para e-mail, chame `validateEmail(email)`; para a nova senha, chame `validateNewPassword(password)`. Guarde cada retorno na propriedade correspondente do objeto de erros.
7. Para confirmação, confira primeiro o preenchimento e depois a igualdade exata com a senha.
8. Atualize o estado de erros com o objeto inteiro.
9. Se houver qualquer erro, encerre a função.
10. Se não houver, mostre somente a mensagem de validação concluída.
11. Associe `handleSignUp` ao `onPress` do botão de cadastro, seguindo a estrutura do botão de login.
12. Exiba o erro correspondente abaixo de cada campo.

Ao associar o botão, forneça a função para ser chamada no toque. Não execute a função durante a construção da tela: colocar uma chamada imediata no lugar da referência pode fazer a validação disparar assim que a tela abre.

**Como conferir:** entre no cadastro sem tocar em nada. Não deve aparecer alerta nem mensagem de erro. Toque em “Cadastrar”: agora os quatro erros de preenchimento devem aparecer.

### 11.9. Teste a recuperação após um erro

Não basta testar apenas a primeira tentativa. Execute esta sequência completa:

1. Abra o cadastro e envie todos os campos vazios.
2. Confira as quatro mensagens de preenchimento.
3. Digite `Ana Silva` no nome e `ana@empresa.com` no e-mail.
4. Digite `Abcdefghi1!` (11 caracteres) na senha e na confirmação.
5. Envie novamente. Deve restar apenas o erro de tamanho da senha.
6. Acrescente `j` somente na senha, resultando em `Abcdefghi1!j` (12 caracteres), e envie.
7. O erro de tamanho deve desaparecer, mas a confirmação deve indicar divergência.
8. Acrescente `j` também na confirmação e envie.
9. Todas as mensagens de erro devem desaparecer, e a validação deve passar.

Na primeira versão, as mensagens só serão recalculadas ao tocar no botão. Portanto, continuar vendo a mensagem enquanto digita não é necessariamente um defeito; é o comportamento definido para esta etapa.

Repita os testes retirando uma maiúscula, uma minúscula, um número ou um símbolo de cada vez, mantendo o tamanho mínimo para isolar cada regra. Ao corrigir uma senha, ajuste também a confirmação.

### 11.10. Resolva problemas comuns

| Sintoma | O que conferir |
| --- | --- |
| O botão não mostra resultado no navegador | Se o resultado depende apenas de alertas; apresente mensagens na tela e confira se o botão está ligado à função |
| A validação aparece ao abrir a tela | Se a função foi chamada imediatamente em vez de ser passada ao botão |
| O erro aparece no campo errado | Se cada texto lê a propriedade correta do objeto de erros |
| Um erro permanece mesmo após corrigir e reenviar | Se o objeto inteiro é recalculado, incluindo `null` nos campos válidos |
| A mensagem de sucesso aparece apesar dos erros | Se a função verifica o objeto local e usa `return` antes do sucesso |
| A confirmação sempre coincide | Se senha e confirmação foram ligadas por engano ao mesmo estado |
| Não é possível digitar no campo | Se `value` e a função de atualização estão ligados ao mesmo estado |
| TypeScript diz que uma string não pode ser atribuída a `null` | Se as propriedades dos erros aceitam `string | null` |
| A função importada não foi encontrada | Se foi exportada, se o nome coincide e se o caminho está correto |
| A mensagem fica cortada | Se há altura fixa no texto ou no contêiner que o envolve |

### 11.11. Execute as verificações e leia os resultados

Abra o terminal na raiz do projeto, a pasta que contém `package.json`.

1. Execute `npx tsc --noEmit`.
2. Se o comando terminar sem mensagens de erro, a verificação de tipos passou. Isso não significa que todos os comportamentos foram testados.
3. Se houver erros, leia primeiro o caminho do arquivo e a linha indicados. Corrija o primeiro problema e execute novamente; um erro pode provocar outros em sequência.
4. Execute `npx expo lint`. O lint procura problemas de código e de padrões, mas precisa de suas dependências e configuração.
5. Se o lint não puder executar porque o ESLint está ausente, registre isso como pendência; não considere o lint aprovado.
6. Execute `npm start` para iniciar o projeto e abra o aplicativo no ambiente de desenvolvimento que você já utiliza.
7. Faça os testes manuais das etapas 8 e 11.9. O terminal sem erros não substitui esses testes.
8. Execute `git diff` e revise suas alterações antes de fazer o commit. Para arquivos novos ainda não adicionados ao Git, confira também seu conteúdo pelo explorador.

Você concluiu esta atividade quando consegue explicar o caminho de um dado: ele sai do campo, entra no estado, passa pela função de validação e produz uma mensagem na tela ou permite continuar.
