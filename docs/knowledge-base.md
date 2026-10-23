# Base de conhecimento (RAG)

## Estado e escopo

Visão registrada em 19/10/2026, em conversa com o usuário. **Nenhum código ainda.** A base começa pelas publicações de pediatria do **médico parceiro** e pode receber diretrizes de sociedades médicas.

| Passo | Estado atual |
| --- | --- |
| 1 — Levantamento das publicações | O médico parceiro já tem as referências e vai fornecê-las (19/10/2026). Falta saber quantidade, formato e direitos de uso (ver [Perguntas em aberto](#perguntas-em-aberto)). |
| 2 — Ingestão e curadoria | Proposta neste documento. |
| 3 — Armazenamento e busca | Proposta neste documento; provedor de vetores a escolher. |
| 4 — Uso 1 (análise do laudo) e uso 2 (consulta do médico) | Pendentes; dependem das [Considerações Clínicas](clinical-considerations.md). |
| 5 — Uso 3 (pacientes e responsáveis) | Futuro; depende da consulta regulatória e da opinião do médico parceiro. |

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

## Perguntas em aberto

- [ ] Quantas publicações o médico parceiro tem, e em que formato (PDF de revista, capítulo de livro)?
- [ ] São de acesso aberto, ou o médico tem os PDFs e os direitos de uso? Ele cedeu os direitos às revistas?
- [ ] Entram também diretrizes de sociedades (SBP, SBD, SBC) na mesma base?
- [ ] Qual fornecedor de vetores, com que limite de gasto?
- [ ] Como declarar que o médico parceiro é curador e também autor de parte da base?

## Decisões

- [x] As publicações do médico parceiro formam uma base de conhecimento consultada por busca (RAG), para apoiar a análise dos exames e, num passo futuro, as dúvidas de pacientes e responsáveis (19/10/2026).
- [x] Uma base só, com cada fonte, trecho e afirmação marcado por faixa de idade (em números) e sexo; o código filtra pela população do paciente e mostra as lacunas ao médico parceiro (19/10/2026).
- [x] O médico parceiro fornece as referências bibliográficas para a base (19/10/2026).
- [x] Provisório (23/10/2026): as considerações clínicas começam só com afirmações curadas de diretrizes oficiais, sem busca por vetores; as publicações do médico parceiro e o RAG entram depois ([clinical-considerations.md](clinical-considerations.md#decisões-provisórias-23102026)).
