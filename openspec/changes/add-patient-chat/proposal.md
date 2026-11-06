# Proposal

## Why

O uso 3 da base de conhecimento, as dúvidas de pacientes e responsáveis, é o de maior risco: um leigo pode descrever uma urgência, pedir avaliação do próprio caso ou tentar burlar as regras. Antes de qualquer decisão sobre uso real, é preciso saber se os guardrails funcionam, e isso pode ser medido sem pacientes reais, com a KB fictícia e as 18 perguntas de teste (decisão de 03/11/2026 em `docs/knowledge-base.md`).

## What Changes

- Criar um chatbot de perguntas e respostas, sem histórico: cada pergunta é tratada sozinha e não fica gravada.
- A IA classifica a pergunta e indica o número do item da KB, com a KB inteira no prompt e sem vetores. Ela não escreve o texto mostrado ao usuário.
- O código monta a resposta: o texto literal do item conferido, com a citação, ou uma resposta fixa.
- A urgência tem prioridade sobre qualquer outra classificação e é acionada por uma lista de sinais no código, rascunho até a revisão do médico parceiro, ou pela classificação da IA. A lista nunca bloqueia nem recusa uma mensagem. Falhas da IA também mostram a orientação de urgência.
- Criar uma Edge Function como único acesso à KB, com login, módulo em teste e limite de 60 perguntas por usuário em 24 horas.
- Criar uma tela de chat em estilo de conversa, aberta pelo menu da conta e pela tela Módulos, com o aviso fixo de que o conteúdo é fictício.
- Criar um script que roda as 18 perguntas e mostra o resultado de cada uma. Só roda contra o Supabase local e com confirmação explícita de custo, e envia à IA só o texto de cada pergunta.
- As 18 perguntas de `tests/fixtures/private/kb/perguntas_teste.md` são os critérios de aceite. A pergunta 11 é escrita só na hora do teste.
- Modelo: Claude Haiku 5.5, escolhido pelo usuário; as 18 perguntas mostram se ele serve para este teste. O uso real exige nova avaliação, com mais casos de urgência.
- Demonstração na nuvem (decisão do usuário em 06/11/2026): a função e a KB fictícia vão para a nuvem para a apresentação de 07/11/2026 ao médico parceiro, com o módulo liberado só para a conta do usuário. O aviso fixo, o limite de 60 perguntas e a KB fictícia continuam; nenhum paciente real usa o chat.

Fora do escopo: pacientes reais, login de paciente ou responsável, consulta regulatória, vetores, a KB real, histórico de conversa, liberação do chat para outros usuários e venda do módulo.

## Capabilities

### New Capabilities

- `patient-chat`: como o chatbot recebe uma pergunta, escolhe o tipo de resposta, cita a KB e limita o acesso e o uso.

### Modified Capabilities

Nenhuma.

## Impact

- **Banco:** nova migração com o módulo `disabled`, a tabela da KB sem acesso pelo app, o registro de uso e a função que autoriza e limita. Para a conferência visual de 04/11/2026, ela também é aplicada na nuvem, e o módulo fica em `testing` só durante a conferência; fora disso, fica inerte, em `disabled`. A KB não entra em migração; um script local a carrega do arquivo privado. Para a demonstração de 07/11/2026, um script próprio, com confirmação explícita, carrega a KB na nuvem; ela fica lá depois da demonstração, para leitura e conferência pelo painel do Supabase, sem acesso pelo app.
- **Edge Functions:** nova `patient-chat`, servida localmente para o teste de aceite e publicada na nuvem para a demonstração de 07/11/2026, com o segredo `ANTHROPIC_API_KEY` que já existe lá.
- **Código:** novo `modules/patient-chat/`, nova `src/features/patient-chat/`, nova rota `src/app/patient-chat.tsx`, e ajustes em `src/features/modules/ModulesScreen.tsx`, `terms.ts` e `src/app/home.tsx`. O conteúdo da home não muda; só o menu da conta ganha uma entrada.
- **Testes:** novos testes sem custo em `tests/patient-chat.test.cjs` e `supabase/tests/patient_chat_rls.test.sql`, além do script pago de aceite, fora do `npm test`.
- **Documentação:** `docs/knowledge-base.md`.
- **Custo:** cada pergunta é uma chamada paga à API da Anthropic, mesmo com o Supabase local. Pela estimativa, ainda não medida, cada rodada das 18 custa menos de US$ 0,02. Nenhuma chamada paga roda sem confirmação do usuário. Na demonstração, as travas são o limite de 60 perguntas por conta em 24 horas, o limite de US$ 2 por mês no workspace `exames-ia` e o crédito pré-pago sem recarga automática.
- **Dependências:** nenhuma no app. A função usa o mesmo SDK da Anthropic das outras funções. O app muda só em JavaScript, mas a demonstração exige um build preview novo, porque o APK instalado não recebe código novo.
