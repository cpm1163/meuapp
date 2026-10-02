# FASE 02 — Papéis e liberação de módulos

## Estado e escopo

Implementação iniciada em 02/10/2026. Pendências que não bloqueiam o banco foram tratadas com padrões: `expires_at` é opcional (vazio = vale até ser revogada), e a visibilidade de análises para leitores só se aplica na FASE 03.

Em 02/10/2026 esta fase passou a ser a FASE 02 e será feita **antes** da análise de exames ([compliance.md](compliance.md), agora FASE 03, pausada). As fases anteriores estão em [authentication.md](authentication.md) (FASE 0) e [grants.md](grants.md) (FASE 01).

| Passo | Estado atual |
| --- | --- |
| 1 — Modelo de negócio e papéis | Definidos pelo usuário em 02/10/2026 (ver abaixo). |
| 2 — Modelo de dados e RLS | Migração `20261002000100_modules.sql` aplicada no Supabase local e, depois de `--dry-run` que listou apenas ela, no **remoto** em 02/10/2026; `migration list` conferido. 45/45 asserções pgTAP aprovadas (`supabase/tests/modules_rls.test.sql`). |
| 3 — Operações do administrador | Propostas neste documento. |
| 4 — Interface | Implementada e validada no Android (Expo Go, Supabase remoto) em 02/10/2026. iOS pendente. |
| 5 — Validação | Banco: 45/45 asserções pgTAP. API: 9/9 testes de integração (`RUN_MODULE_INTEGRATION=1 node --test tests/modules.integration.test.cjs`) com contas reais A, B e C no Supabase local, em 02/10/2026. Interface: pendente. |

## Modelo de negócio

Definido pelo usuário em 02/10/2026:

1. O app oferece **módulos**. O primeiro é a análise de exames médicos (FASE 03).
2. Um `user` **contrata** um módulo, com pagamento combinado diretamente com o responsável pelo app, **fora do app**.
3. O `admin` **libera** o módulo para aquele `user`.
4. A partir da liberação, o `user` pode submeter exames à análise por IA.

Consequências:

- **Não há perfil de paciente nem de profissional.** O `user` é quem contrata o módulo, seja qual for a sua profissão.
- **Verificação de registro profissional (CRM etc.) não é necessária nesta fase.**
- **O app não processa pagamentos.** A liberação registra apenas que houve contratação, sem dados financeiros.
- **O dono do documento é o `user`** que o carregou, como já é hoje. O compartilhamento continua entre `user`s ([grants.md](grants.md)).
- **O aceite dos termos de uso da IA faz parte da contratação do módulo** (ver [Aceite de termos](#aceite-de-termos-do-módulo)).

## Papéis

| Papel | Quem | O que permite |
| --- | --- | --- |
| `user` | Toda conta do app | Carregar, gerenciar e compartilhar documentos (FASE 01). Usar os módulos liberados para ele. |
| `admin` | O responsável pelo app e quem ele autorizar | Gerenciar o catálogo de módulos; liberar e revogar módulos para `user`s. |

Um `admin` também é `user`: pode ter os próprios documentos e módulos liberados.

## Regras

1. **O papel `admin` fica em tabela própria e só é concedido pelo servidor** (migração ou credencial administrativa). Nenhum cliente consegue atribuir papel a si mesmo ou a outra conta.
2. **Só `admin` libera ou revoga módulos.** O `user` não consegue criar, alterar ou ampliar a própria liberação.
3. **Ser `admin` não dá acesso a documentos de ninguém.** O `admin` gerencia liberações, não lê documentos, arquivos ou análises de outros `user`s. O acesso a documentos continua vindo exclusivamente dos grants da FASE 01.
4. **Pedir análise exige liberação ativa do módulo** e aceite vigente dos termos daquele módulo, verificados no servidor.
5. **Revogar a liberação bloqueia novas análises.** Análises já concluídas continuam visíveis a quem tem acesso ao documento.
6. **Ver o resultado de uma análise não exige o módulo**: um `user` que recebeu o documento por compartilhamento vê as análises dele, mesmo sem ter contratado o módulo (proposta, ver [Decisões](#decisões)). Pedir novas análises exige o módulo.
7. **A busca de contas pelo `admin`** (para liberar um módulo) usa operação autorizada no servidor, por e-mail exato, sem expor lista geral de usuários a quem não é `admin`.

## Modelo de dados proposto

### `app_admins`

| Campo | Tipo proposto | Finalidade e restrição |
| --- | --- | --- |
| `user_id` | UUID | Chave primária; referência a `auth.users.id`. |
| `created_at` | Data/hora com fuso | Gerada pelo banco. |
| `created_by` | Texto | Origem da concessão (ex.: migração, operador). |

Sem inserção, alteração ou exclusão pelo cliente. Leitura apenas da própria linha, para o app saber se mostra a área de administração.

### `analysis_modules` (catálogo)

Movida da FASE 03 para esta fase, porque a liberação depende dela.

| Campo | Tipo proposto | Finalidade e restrição |
| --- | --- | --- |
| `id` | Texto | Identificador estável (ex.: `lab-report`). |
| `name` | Texto | Nome exibido (ex.: "Análise de exames laboratoriais"). |
| `description` | Texto | Descrição curta para o `user`. |
| `level` | Valor controlado | `A` (achados objetivos) ou `B` (interpretação clínica). |
| `skill_id` | Texto, opcional | Skill do Claude correspondente, definida na FASE 03. |
| `active_version` | Texto, opcional | Versão em produção, definida na FASE 03. |
| `terms_version` | Texto | Versão vigente dos termos de uso do módulo. |
| `status` | Valor controlado | `draft`, `testing`, `active`, `disabled`. |
| `updated_at` | Data/hora com fuso | Mantida pelo banco. |

Leitura por usuários autenticados. Escrita apenas por `admin` ou migração. Nesta fase o módulo `lab-report` é criado pela migração com estado `draft`: pode ser liberado e testado, mas a análise em si só existe a partir da FASE 03.

### `module_grants` (liberações)

| Campo | Tipo proposto | Finalidade e restrição |
| --- | --- | --- |
| `id` | UUID | Chave primária. |
| `user_id` | UUID | `user` que recebeu o módulo. |
| `module_id` | Texto | Referência a `analysis_modules.id`. |
| `granted_by` | UUID | `admin` que liberou. |
| `granted_at` | Data/hora com fuso | Gerada pelo banco. |
| `expires_at` | Data/hora com fuso, opcional | Fim da liberação, se a contratação tiver prazo (ver [Decisões](#decisões)). |
| `revoked_at`, `revoked_by` | Opcionais | Preenchidos na revogação. |
| `note` | Texto, opcional | Referência interna da contratação. **Sem dados de pagamento.** |

Uma liberação está **ativa** quando não foi revogada e não expirou. No máximo uma liberação ativa por `user` e módulo. Revogar preenche os campos de revogação em vez de apagar a linha, preservando o histórico. O `user` lê apenas as próprias liberações; `admin` lê e altera todas.

### Aceite de termos do módulo

Substitui a tabela `ai_consents` prevista no plano da FASE 03.

| Campo | Tipo proposto | Finalidade |
| --- | --- | --- |
| `user_id` | UUID | Quem aceitou. |
| `module_id` | Texto | Módulo. |
| `terms_version` | Texto | Versão aceita. |
| `accepted_at` | Data/hora com fuso | Momento do aceite. |

O aceite é pedido no primeiro uso depois da liberação e de novo sempre que `terms_version` mudar. O texto dos termos do módulo de exames inclui: envio do documento a provedor de IA externo, ausência de interpretação clínica e **responsabilidade do `user` pela base legal para tratar dados de saúde de terceiros** (ver [Privacidade](#privacidade-e-lgpd)).

## Matriz de acesso

| Operação | `admin` | `user` com módulo ativo | `user` sem módulo | Sem autenticação |
| --- | --- | --- | --- | --- |
| Ver catálogo de módulos | Sim | Sim | Sim | Não |
| Criar ou alterar módulo do catálogo | Sim | Não | Não | Não |
| Liberar ou revogar módulo para um `user` | Sim | Não | Não | Não |
| Ver as próprias liberações | Sim | Sim | Sim | Não |
| Ver liberações de outros `user`s | Sim | Não | Não | Não |
| Aceitar termos do módulo | Se tiver o módulo | Sim | Não | Não |
| Pedir análise (FASE 03) | Se tiver o módulo | Sim | Não | Não |
| Ver análise de documento a que tem acesso | Pelos grants | Pelos grants | Pelos grants (proposta) | Não |
| Ler documentos de outros `user`s | **Não**, salvo compartilhamento | Pelos grants | Pelos grants | Não |
| Tornar-se ou tornar alguém `admin` | Não (só servidor) | Não | Não | Não |

## Operações do administrador

Executadas por funções no banco que verificam se quem chama está em `app_admins`:

- **Buscar conta por e-mail exato**, retornando apenas identificador e e-mail.
- **Liberar módulo** para uma conta, com prazo e nota opcionais.
- **Revogar liberação.**
- **Listar liberações**, com filtros por módulo e situação.
- **Alterar situação de um módulo** do catálogo (`draft`, `testing`, `active`, `disabled`).

## Implementação no banco

Funções expostas ao app (todas verificam o papel no servidor):

| Função | Quem pode chamar | O que faz |
| --- | --- | --- |
| `admin_find_user(search_email)` | `admin` | Busca conta por e-mail exato. |
| `admin_grant_module(user_id, module_id, expires_at, note)` | `admin` | Libera módulo; fecha antes uma liberação vencida e não revogada. |
| `admin_revoke_module_grant(grant_id)` | `admin` | Revoga, preservando o histórico. |
| `admin_list_module_grants(filter_module_id)` | `admin` | Lista liberações com e-mail e situação. |
| `admin_set_module_status(module_id, status)` | `admin` | Muda a situação do módulo no catálogo. |
| `accept_module_terms(module_id)` | `user` com liberação ativa | Registra o aceite da versão vigente dos termos. |
| `my_modules()` | `user` | Módulos liberados para o próprio `user`, com situação e aceite. |

Função interna para a FASE 03: `module_private.can_use_module(module_id)`, verdadeira só com módulo `active`, liberação ativa e aceite da versão vigente dos termos.

Visibilidade do catálogo: o `user` vê módulos `active` e os que já foram liberados para ele; o `admin` vê todos.

## Interface

- **Área de administração** no app, visível apenas para `admin`: buscar conta por e-mail, ver as liberações dela, liberar e revogar módulos.
- **Tela "Meus módulos"** para o `user`: módulos liberados, prazo (se houver) e situação. Módulos não contratados aparecem com a orientação de contato para contratação.
- **Aceite de termos** no primeiro uso do módulo; o uso em si (análise) chega na FASE 03.
- Validação no Android pelo Expo Go; iOS quando houver aparelho.

### Implementação da interface

Implementada em 02/10/2026; lint e tipos aprovados:

- `src/features/modules/service.ts`: chamadas ao banco, ligadas ao token da sessão que iniciou a operação.
- `src/features/modules/ModulesScreen.tsx` (rota `/modules`): "Meus módulos" e aceite de termos.
- `src/features/modules/AdminScreen.tsx` (rota `/admin`): busca por e-mail, liberações, liberar e revogar. A tela confere o papel apenas para exibição; o banco recusa operações de quem não é `admin`.
- `src/features/modules/terms.ts`: **texto provisório** dos termos e do contato de contratação, marcado como rascunho.
- Home: seção "Módulos" com "Meus módulos" para todos e "Administração" apenas para `admin`.

### Troca rápida de conta (somente desenvolvimento)

Adicionada em 02/10/2026 a pedido do usuário, para agilizar os testes com várias contas (`src/features/dev/`):

- Aparece na janela "Minha conta" **apenas em `__DEV__`** (app rodando pelo servidor de desenvolvimento). Não existe em builds de produção.
- Guarda no aparelho a sessão de cada conta que entrou, no mesmo armazenamento local que o Supabase já usa para a sessão atual. **Nenhuma senha é guardada.**
- "Adicionar outra conta" encerra a sessão só no aparelho (não no servidor), para que a conta continue disponível na lista. "Sair da conta" continua encerrando a sessão no servidor e retira a conta da lista.
- Se a sessão salva expirar, a conta sai da lista e é preciso entrar com ela de novo.

### Validação no Android (Expo Go, Supabase remoto)

Contas: **A** (`admin`) e **B** (`user`).

- [x] B: a home mostra "Meus módulos" e **não** mostra "Administração". **Aprovado em 02/10/2026.**
- [ ] B: "Meus módulos" vazio, com a orientação de contato.
- [ ] B: abrir `/admin` diretamente mostra "Acesso restrito". Não testado no Expo Go (sem forma simples de digitar a rota); a recusa no banco está coberta pelos testes pgTAP e de integração.
- [x] A: a home mostra "Administração". **Aprovado em 02/10/2026.**
- [x] A: buscar o e-mail de B encontra a conta; um e-mail inexistente não encontra nada. **Aprovado em 02/10/2026.**
- [x] A: liberar "Análise de exames laboratoriais" para B; a liberação aparece como ativa. **Aprovado em 02/10/2026** (sem nota); conferido no remoto: liberação aberta, sem prazo, registrada pelo `admin`.
- [x] A: tentar liberar de novo não é possível. **Aprovado em 02/10/2026**: a tela mostra "Esta conta já tem este módulo ativo" (o banco também recusa, coberto pelos testes).
- [x] B: "Meus módulos" mostra o módulo liberado, "Em preparação", e o botão para ler e aceitar os termos. **Aprovado em 02/10/2026.**
- [x] B: aceitar os termos; o cartão passa a mostrar os termos aceitos e a versão. **Aprovado em 02/10/2026**; aceite da versão `2026-10-02-draft` conferido no remoto.
- [x] A: revogar a liberação de B. **Aprovado em 02/10/2026.** Pedido do usuário atendido em seguida: a revogação passou a exigir confirmação (validar).
- [x] B: depois de atualizar, o módulo aparece como "Liberação encerrada". **Aprovado em 02/10/2026.**
- [x] Logout de A e login de B no mesmo aparelho não mostram a área de administração. **Aprovado em 02/10/2026** nas trocas de conta do teste.
- [x] A: "Revogar liberação" pede confirmação; "Cancelar" mantém a liberação. **Aprovado em 02/10/2026.**
- [x] A: liberar de novo o módulo para B depois da revogação. **Aprovado em 02/10/2026**; B fica com o módulo ativo para a FASE 03.

iOS: pendente.

## Privacidade e LGPD

- Com este modelo, o `user` pode carregar exames **de outras pessoas** (por exemplo, pacientes). Dados de saúde são dados pessoais sensíveis (art. 11 da LGPD).
- É preciso definir com apoio jurídico o papel do app (controlador ou operador), o do `user` e o do provedor de IA, e o que os termos do módulo devem exigir do `user`.
- O app não armazena dados de pagamento.
- O `admin` não tem acesso aos documentos dos `user`s (regra 3).

## Critérios de validação

Contas: **A** (`admin`), **B** (`user` com o módulo liberado), **C** (`user` sem o módulo), mais requisições sem autenticação.

- B e C não conseguem se inserir em `app_admins` nem liberar módulos para si ou para outros.
- A libera o módulo para B; B vê a liberação; C não vê a liberação de B.
- A não consegue ler documentos de B que não foram compartilhados com A.
- B não consegue alterar a própria liberação (prazo, revogação, módulo).
- Liberação duplicada ativa para o mesmo `user` e módulo é rejeitada.
- A revoga a liberação de B; B deixa de ter o módulo ativo; o histórico permanece.
- Liberação com prazo vencido deixa de valer sem ação manual.
- Uma mudança de `terms_version` exige novo aceite de B.
- Busca de conta por e-mail funciona para A e é recusada para B e C.
- Requisições sem autenticação não acessam catálogo, liberações nem aceites.
- Testes pgTAP e de integração cobrem as regras acima diretamente no banco e pela API, sem depender da interface.

## Sequência da FASE 02

1. Revisar e aprovar este documento; decidir as pendências.
2. Migração: `app_admins`, `analysis_modules` (com `lab-report` em `draft`), `module_grants`, aceite de termos, funções do administrador, privilégios, RLS e testes pgTAP.
3. Conceder o papel `admin` à conta do responsável pelo app, por migração ou operação no servidor. **Concluído em 02/10/2026:** conta A (`carlos.mahet@gmail.com`) inserida em `app_admins` no remoto via `supabase db query --linked`. Estado conferido: 1 admin, módulo `lab-report` em `draft`, nenhuma liberação.
4. Testes de integração com as contas A, B e C. **Concluído em 02/10/2026.**
5. Interface: área de administração, "Meus módulos" e aceite de termos.
6. Validação no Android; iOS quando possível.

## Decisões

- [x] Modelo de negócio: módulos contratados fora do app e liberados pelo `admin` (02/10/2026).
- [x] Sem perfis de paciente ou profissional; o `user` é quem contrata o módulo (02/10/2026).
- [x] Sem verificação de registro profissional nesta fase (02/10/2026).
- [x] Papel `admin` em tabela própria, concedido somente pelo servidor (02/10/2026).
- [x] Aceite dos termos de uso da IA faz parte da contratação do módulo (02/10/2026).
- [ ] A liberação tem prazo (ex.: mensal, anual) ou vale até ser revogada?
- [ ] Quem recebe um documento compartilhado vê as análises dele mesmo sem ter o módulo? (proposta: sim)
- [ ] Texto dos termos do módulo de exames, com apoio jurídico sobre dados de saúde de terceiros.
- [ ] Contato exibido para contratação de módulos.
