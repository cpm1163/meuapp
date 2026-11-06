# Base de conhecimento (RAG)

## Estado e escopo

Visão registrada em 19/10/2026, em conversa com o usuário. **Nenhum código ainda.** A base começa pelas publicações de pediatria do **médico parceiro** e pode receber diretrizes de sociedades médicas.

| Passo | Estado atual |
| --- | --- |
| 1 — Levantamento das publicações | O médico parceiro já tem as referências e vai fornecê-las (19/10/2026). Falta saber quantidade, formato e direitos de uso (ver [Perguntas em aberto](#perguntas-em-aberto)). |
| 2 — Ingestão e curadoria | Proposta neste documento. |
| 3 — Armazenamento e busca | Proposta neste documento; provedor de vetores a escolher. |
| 4 — Uso 1 (análise do laudo) e uso 2 (consulta do médico) | Pendentes; dependem das [Considerações Clínicas](clinical-considerations.md). |
| 5 — Uso 3 (pacientes e responsáveis) | Teste local com KB fictícia em andamento ([Chat de teste](#chat-de-teste-add-patient-chat)). O uso real é futuro e depende da consulta regulatória e da opinião do médico parceiro. |

Documentos relacionados: a seção de considerações clínicas e a bibliografia curada estão em [clinical-considerations.md](clinical-considerations.md), e os níveis de análise e a regulação em [compliance.md](compliance.md).

## Objetivo

Criar **uma base de conhecimento única**, formada por publicações científicas, que sirva de fonte de consulta para três usos. Nos três, a resposta se apoia só no que está na base e cita a fonte, com o trecho e a página.

| Uso | Quem pergunta | Como usa a base |
| --- | --- | --- |
| **1. Apoio à análise do laudo** | O app, automaticamente | A busca traz os trechos relevantes para os achados do laudo, e a IA escreve as considerações clínicas citando esses trechos. |
| **2. Consulta do médico** | O médico | Perguntas livres, por exemplo "o que os artigos dizem sobre ferritina em adolescentes?", respondidas com citações. |
| **3. Dúvidas de pacientes e responsáveis** | Leigo | Perguntas sobre saúde e exames, com respostas gerais e educativas. Passo futuro. |

## Regras comuns aos três usos

- **Só a base.** A IA responde com o que está nos trechos recuperados. Se a base não cobre a pergunta, diz isso e não completa com conhecimento próprio.
- **Citação verificável.** Cada afirmação traz o trecho exato e a página da fonte. O código confere se o trecho existe na fonte antes de mostrar a resposta.
- **Números vêm da curadoria.** Faixas, cortes e classificações usados para avaliar um valor vêm das **afirmações curadas** ([clinical-considerations.md](clinical-considerations.md)), não de texto gerado. A busca na base dá contexto; quem compara o valor com o corte é o código.
- **Fonte aprovada.** Só entra na base o que foi aprovado na curadoria.

## Base por idade e sexo

Definido com o usuário em 19/10/2026. Muitas faixas de referência dependem de idade, de sexo ou dos dois, e o laudo pode imprimir uma faixa de adulto para uma criança. Por isso a base considera a população de cada paciente:

- **Uma base só**, não bases separadas por idade ou sexo. Cada fonte, trecho e afirmação é **marcado pela população** a que se aplica, porque uma mesma diretriz costuma cobrir várias idades.
- **Idade em números**, de X a Y meses ou anos, e não em grupos fixos ("criança", "adulto"), porque os cortes mudam de exame para exame. Sexo: feminino, masculino ou ambos.
- **Filtro pelo código.** Na análise, só passam as afirmações e os trechos que se aplicam à idade e ao sexo do paciente. A idade e o sexo vêm do laudo ou, se faltarem, do cadastro do paciente.
- **Lacunas visíveis.** O app lista as combinações de exame, idade e sexo sem afirmação; por exemplo, "não há afirmação para ferritina em meninas de 12 anos". Assim o médico parceiro sabe onde falta fonte.
- **Sem idade ou sexo** (minoria dos casos), entram só as afirmações que valem para todos, e o relatório avisa que o dado não foi informado.
- **Puberdade.** O estágio puberal muda vários cortes, mas o laudo não o informa. O app usa só a idade, e as considerações dizem isso quando for relevante.

| Afirmação (exemplo ilustrativo) | Idade | Sexo |
| --- | --- | --- |
| LDL: elevado ≥130 mg/dL | 2 a 19 anos | Ambos |
| LDL: elevado ≥160 mg/dL | 20 anos ou mais | Ambos |
| Hemoglobina: corte da OMS | 5 a 11 anos | Ambos |

Os valores da tabela só ilustram o formato. Os valores reais vêm das fontes aprovadas na curadoria.

## Uso 3: pacientes e responsáveis

Este uso muda o produto e fica para depois dos usos 1 e 2:

- **Novo ator.** Hoje o médico é o único usuário, e o paciente é um cadastro sem login (decisão de 08/10/2026, [exam-comparison.md](exam-comparison.md)). Dar acesso ao paciente exige conta, login e regras de quem vê o quê.
- **Crianças.** Em pediatria, quem acessa são os responsáveis. A LGPD exige consentimento específico de pelo menos um dos pais ou responsável para tratar dados de crianças.
- **Leigo interpretando.** Uma pergunta como "o LDL do meu filho deu 145, é grave?" é aconselhamento médico. As respostas teriam de ser gerais, encaminhar ao médico e reconhecer sinais de urgência.
- **Regulação.** Precisa da consulta a especialista em regulação sanitária, como o nível B ([compliance.md](compliance.md#regulação)), e da opinião do médico parceiro.
- **Custo.** O uso por um público aberto é imprevisível. Precisa de limite por usuário e das travas de custo já usadas na análise ([compliance.md](compliance.md#travas-de-custo)).

## Arquitetura proposta

1. **Ingestão.** Cada publicação vira uma **fonte** com metadados: autores, título, revista, ano, versão, DOI ou link, e a população estudada (idade, sexo, país, número de participantes). O texto é dividido em **trechos** por seção, mantendo as tabelas inteiras e registrando a página de cada trecho.
2. **Curadoria.** A IA lê cada fonte uma vez e propõe afirmações (faixas, cortes, interferências), cada uma com o trecho exato e a página. O médico parceiro aprova ou corrige antes de a fonte e as afirmações entrarem na base.
3. **Armazenamento.** Os trechos e os vetores ficam no Supabase, com a extensão pgvector. Tabelas previstas: fontes, trechos (com vetor e página) e afirmações curadas. A base é conteúdo do app, igual para todos os usuários; não contém dados de pacientes.
4. **Busca.** A pergunta, ou os achados do laudo no uso 1, vira vetor. A busca retorna os trechos mais próximos, filtrados pela população quando houver idade e sexo do paciente.
5. **Resposta.** A IA recebe os trechos e responde citando-os, com o recurso de citações da API do Claude, que devolve o trecho citado e a página. O código confere as citações antes de mostrar.

### Provedor de vetores

A Anthropic não oferece o serviço que transforma texto em vetores (embeddings), então é preciso **mais um fornecedor**, a escolher. Pontos a avaliar:

- qualidade em português e em texto médico;
- custo, com limite de gasto e pré-pago, como na conta da Anthropic;
- o que o fornecedor recebe: nos usos 1 e 2, só os artigos e as consultas; no uso 3, as perguntas dos pacientes, que são dados de saúde, entram na política de privacidade e na LGPD.

### Alternativa considerada

Mandar os artigos inteiros em cada pedido, sem busca, foi descartado para a análise do laudo. Com 50 artigos, o pedido pode passar de 500 mil tokens, cerca de US$ 2 de entrada por análise no Opus 5.5, acima da trava mensal de US$ 10.

## Ordem de implementação

1. Levantar as publicações e os direitos de uso.
2. Construir a base: ingestão, curadoria e armazenamento.
3. Uso 1 e uso 2, só para o médico, em módulo `testing`.
4. Uso 3, depois da consulta regulatória e da opinião do médico parceiro, provavelmente como módulo próprio.

O passo 2 serve aos três usos.

## Implementação com OpenSpec

Este documento guarda a visão, as decisões e as perguntas em aberto. O comportamento exigido fica nas specs de `openspec/specs/`, criadas a cada mudança com `/opsx:propose`, `/opsx:apply` e `/opsx:archive`. Uma decisão só vira requisito quando entra em uma spec aprovada.

Mudanças previstas, nesta ordem. Os nomes são sugestões e podem mudar no `propose`.

| Mudança | Capacidade na spec | O que cobre | Antes do `propose` |
| --- | --- | --- | --- |
| `add-kb-sources` | `kb-sources` | Fontes, trechos e afirmações, curadoria, marcação por idade e sexo, acesso restrito | Quantidade e formato das publicações; diretrizes de sociedades na base ou não |
| `add-kb-search` | `kb-search` | Busca filtrada pela população e lacunas visíveis | Fornecedor de vetores e limite de gasto |
| `add-kb-doctor-answers` | `kb-answers` | Usos 1 e 2: respostas só com a base e citações conferidas | Direitos de uso; encaixe com as [Considerações Clínicas](clinical-considerations.md) |
| `add-patient-chat` | `patient-chat` | Uso 3: acesso do paciente ou responsável, limites de uso e sinais de urgência | Nada para o teste com a KB fictícia. Com pacientes reais: consulta regulatória, opinião do médico parceiro e modelo de venda |

Cada mudança deve ser pequena o bastante para ser testada e arquivada sozinha. Se uma delas crescer demais, dividir no `propose`.

## Chat de teste (`add-patient-chat`)

Teste dos guardrails do uso 3, com a KB fictícia e sem pacientes reais. **O resultado vale só para este teste e não libera uso real.** Uso real exige a consulta regulatória, a opinião do médico parceiro, a revisão dos textos fixos e da lista de sinais de urgência, e um conjunto novo de perguntas.

O comportamento exigido está na spec `patient-chat`. Em resumo: a IA só classifica a pergunta, e o código mostra uma resposta fixa ou o texto literal de um item, com a citação. A urgência é acionada pela lista de sinais do código ou pela IA, e a lista nunca bloqueia nem recusa uma mensagem.

- **Modelo:** o Claude Haiku 5.5 foi aprovado só para este teste. Antes de uso real, precisa de nova avaliação, com mais casos de urgência.
- **Função e KB no local, com exceção para a demonstração:** o teste de aceite roda só no local. Para a apresentação ao médico parceiro em 07/11/2026, a função e a KB fictícia vão para a nuvem, com o módulo liberado só para a conta do usuário (ver [Demonstração na nuvem](#demonstração-na-nuvem-06112026)).
- **Migração na nuvem:** a migração `20261103000100_patient_chat.sql` foi aplicada na nuvem em 04/11/2026, para a conferência visual. Fora dela e da demonstração, fica inerte: o módulo fica em `disabled`, e a KB carregada para a demonstração não é acessível pelo app. Desfazê-la exige uma nova migração.
- **Custo:** cada pergunta é uma chamada paga à API, mesmo com o Supabase local. Nenhuma chamada paga roda sem a confirmação do usuário.

### Como rodar localmente

1. Coloque a chave da API, do workspace `exames-ia`, em `supabase/functions/.env`, que fica fora do git: `ANTHROPIC_API_KEY=...`
2. Aplique a migração e carregue a KB: `npx supabase migration up --local` e `node tests/patient-chat.seed.cjs`.
3. Sirva a função: `bash tests/patient-chat-serve.sh`. Além de mostrar os logs na tela, o script os salva em `.logs/`, fora do git, com data e hora em cada linha e a carga da máquina a cada 5 s.
4. Confira sem custo o que seria enviado: `node tests/patient-chat.eval.cjs --dry-run`.
5. Teste de aceite pago: `node tests/patient-chat.eval.cjs --confirm-paid`, com `--only <n>` para uma pergunta. Antes de rodar, escreva a pergunta 11 em `pergunta.txt`, na raiz do projeto e fora do git; o texto não é impresso nem vai para os logs, e o arquivo pode ser apagado ao terminar. Cada pergunta e o texto recebido ficam em `resposta.txt`, também fora do git, para o usuário avaliar: a rodada completa reescreve o arquivo, e `--only` acrescenta a repetição. Ele contém o texto da pergunta 11; apague-o ao terminar. A rodada salva em `.logs/` o resultado e o tempo de cada pergunta, identificada só pelo número.

### Como apontar o celular para o local

No SDK 57, `.env.local` tem prioridade sobre `.env` e fica fora do git. Crie esse arquivo só durante o teste, com o IP do computador na rede local e a chave publicável mostrada por `npx supabase status`:

```
EXPO_PUBLIC_SUPABASE_URL=http://<IP do computador>:54321
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<chave publicável local>
```

Depois rode `npx expo start -c --lan` e entre com a conta de teste, criada pela carga local: `chat-teste@patient-chat.test`, senha `chat-teste-local-only`. Para voltar à nuvem, apague o `.env.local` e rode `npx expo start -c` de novo.

### Roteiro no celular

O chat tem duas entradas, para quem tem o módulo liberado e os termos aceitos: o menu do avatar ("Chat de teste") e o cartão do módulo em Meus módulos. A web não conta como validação.

**Conferência visual na nuvem, sem custo de IA e sem enviar pergunta.** Rode `npx expo start -c`, sem `.env.local`. O módulo precisa estar em `testing`; a função não está na nuvem. Em Administração, libere o módulo para a sua conta e, em Meus módulos, aceite os termos.

1. Volte à home, toque no avatar e confira "Chat de teste" entre "Meus módulos" e "Administração". Toque nele.
2. Confira o aviso de conteúdo fictício no topo e, no meio, o texto dizendo que cada pergunta é tratada sozinha.
3. Toque no campo: com o teclado aberto, o campo e o botão de envio continuam visíveis. Não envie pergunta nesta etapa.
4. Volte, abra Meus módulos e confira que "Abrir o chat de teste" leva à mesma tela.
5. Ao terminar, revogue a liberação e volte o módulo a `disabled`: em `testing`, qualquer médico logado vê o módulo e pode solicitá-lo.

**Conversa no local, com custo, só com a confirmação do usuário.** Aponte o celular para o local, como descrito acima. Cada pergunta é uma chamada paga; a função precisa estar rodando.

1. Envie perguntas de cada tipo. A pergunta aparece logo, com o indicador de espera, e a resposta vem no balão, com a fonte quando houver.
2. Envie outra pergunta e confira que a anterior e sua resposta saem da tela.
3. Numa resposta longa, role a conversa e confira que o aviso continua visível.
4. Pare a função e envie uma pergunta: a tela mostra a resposta fixa de falha, com a orientação de urgência.

Ao terminar, volte à nuvem como descrito acima.

### Demonstração na nuvem (06/11/2026)

O usuário decidiu apresentar o chat ao médico parceiro em 07/11/2026, no APK. A KB continua fictícia, o aviso fixo continua na tela e nenhum paciente real usa o chat. Cada passo que publica na nuvem ou gera custo só roda com o ok do usuário.

Travas de custo: limite de 60 perguntas por conta em 24 horas, módulo liberado só para a conta do usuário, limite de US$ 2 por mês no workspace `exames-ia` do Console e crédito pré-pago sem recarga automática. A função usa o segredo `ANTHROPIC_API_KEY` que já existe na nuvem, o mesmo da análise de documentos.

1. O usuário configura o limite de US$ 2 por mês no workspace `exames-ia`.
2. Publicar a função: `npx supabase functions deploy patient-chat`. Conferir com `npx supabase functions list`.
3. Conferir a carga sem alterar nada, com `node tests/patient-chat.cloud-kb.cjs --dry-run`, que mostra o projeto e o número de itens. Carregar com `node tests/patient-chat.cloud-kb.cjs --confirm-cloud`. O script só troca a KB: não cria conta, não libera o módulo e não muda o status.
4. Passar o módulo a `testing` por comando. Em Administração, o usuário libera o módulo para a própria conta e, em Meus módulos, aceita os termos.
5. No Expo Go ligado à nuvem (`npx expo start -c`, sem `.env.local`), enviar poucas perguntas, uma de cada tipo, e conferir a resposta, a fonte e o aviso.
6. Gerar o build preview do APK (`npx eas-cli@latest build --platform android --profile preview`), instalar e repetir uma pergunta.

**Para desfazer, depois da demonstração:** revogar a liberação em Administração e voltar o módulo a `disabled`. Por decisão do usuário, a KB fica na nuvem para leitura e conferência pelo painel do Supabase (tabela `patient_chat_kb_items`); o app não tem acesso a ela, e a função não a usa com o módulo `disabled`.

## Perguntas em aberto

- [ ] Quantas publicações o médico parceiro tem, e em que formato (PDF de revista, capítulo de livro)?
- [ ] São de acesso aberto, ou o médico tem os PDFs e os direitos de uso? Ele cedeu os direitos às revistas?
- [ ] Entram também diretrizes de sociedades (SBP, SBD, SBC) na mesma base?
- [ ] Qual fornecedor de vetores, com que limite de gasto?
- [ ] Como declarar que o médico parceiro é curador e também autor de parte da base?
- [ ] O uso 3 responde com trechos das publicações, como os usos 1 e 2, ou com fichas de pergunta e resposta aprovadas pelo médico? As fichas são mais simples e seguras para leigos e podem dispensar embeddings no começo (levantado em 03/11/2026).
- [ ] O uso 3 será um módulo vendido à parte, contratado pelo médico para os próprios pacientes, com limite mensal de perguntas? Ideia do usuário em 03/11/2026, ainda não decidida.

## Decisões

- [x] As publicações do médico parceiro formam uma base de conhecimento consultada por busca (RAG), para apoiar a análise dos exames e, num passo futuro, as dúvidas de pacientes e responsáveis (19/10/2026).
- [x] Uma base só, com cada fonte, trecho e afirmação marcado por faixa de idade (em números) e sexo; o código filtra pela população do paciente e mostra as lacunas ao médico parceiro (19/10/2026).
- [x] O médico parceiro fornece as referências bibliográficas para a base (19/10/2026).
- [x] Provisório (23/10/2026): as considerações clínicas começam só com afirmações curadas de diretrizes oficiais, sem busca por vetores; as publicações do médico parceiro e o RAG entram depois ([clinical-considerations.md](clinical-considerations.md#decisões-provisórias-23102026)).
- [x] Sem consulta regulatória nesta fase (03/11/2026): o chatbot pode ser construído e testado com a KB fictícia, sem pacientes reais. A consulta volta a ser avaliada antes de liberar o uso real.
- [x] Chat de teste (03/11/2026): só local, com a KB inteira no prompt, sem vetores; a IA classifica e o código mostra uma resposta fixa ou o texto literal do item; as 18 perguntas de teste são os critérios de aceite. O módulo nasce `disabled`, porque `requestable_modules` mostra módulos em `draft`.
- [x] Demonstração na nuvem (06/11/2026): a função e a KB fictícia vão para a nuvem para a apresentação de 07/11/2026 ao médico parceiro, com o módulo liberado só para a conta do usuário. Depois dela, o módulo volta a `disabled`, e a KB fica na nuvem para leitura e conferência.
