# FASE 01 — Documentos e permissões

## Estado e escopo

Implementação em andamento em 01/10/2026. O projeto Supabase atual foi autorizado pelo usuário e vinculado à CLI após login administrativo.

| Passo | Estado atual |
| --- | --- |
| 1 — Esquema e permissões | Definidos neste documento. |
| 2 — Migrações e RLS | Duas migrações revisadas e aplicadas no Supabase local completo; testes em andamento. |
| 3 — Isolamento | 42 asserções PostgreSQL em execução; integração HTTP preparada. |
| 4 — Storage | Bucket privado e políticas incluídos na migração local; testes de upload, revogação e exclusão pendentes. |
| 5 — Interface | Tela protegida `/documents` implementada com upload, listas e gerenciamento; checagem de tipos aprovada após regenerar as rotas. Lint aprovado. |

**Remoto:** vínculo e `db push --dry-run` concluídos. Nenhuma migração aplicada ao projeto remoto até esta atualização. A aplicação ocorrerá após a validação local.

Arquivos de implementação:

- `supabase/migrations/20261001000100_documents.sql`: tabelas, privilégios, RLS e operações autorizadas de criação/compartilhamento.
- `supabase/migrations/20261001000200_document_storage.sql`: bucket privado e ciclo de vida do arquivo.
- `supabase/tests/documents_rls.test.sql`: testes de permissões no PostgreSQL.
- `tests/documents.integration.test.cjs`: testes locais com Auth, API e Storage reais, protegidos contra execução em produção.
- `src/features/documents/`: serviço, seleção de arquivos e tela de documentos.
- `src/app/documents.tsx`: rota autenticada; home aponta para a biblioteca.

A FASE 0 — Autenticação está encerrada como etapa do projeto. O histórico e as validações específicas ainda pendentes permanecem em [authentication.md](authentication.md).

O Document AI será de uso individual, com compartilhamento de documentos específicos entre usuários cadastrados. Cada documento terá um único proprietário. Compartilhar concede acesso ao mesmo documento, sem duplicar o arquivo ou transferir sua propriedade.

Não haverá uma entidade de empresa/equipe ou `tenant_id` nesta primeira versão. O isolamento será baseado no proprietário e nos compartilhamentos ativos de cada documento. “Meus documentos” e “Compartilhados comigo” serão duas formas de listar os documentos autorizados.

## Modelo de dados proposto

As identidades serão as contas do Supabase Auth (`auth.users.id`). A autorização usará o identificador da conta, independentemente do método de login. E-mail não será chave de propriedade ou de permissão.

### `documents`

| Campo | Tipo proposto | Finalidade e restrição |
| --- | --- | --- |
| `id` | UUID | Chave primária do documento. |
| `owner_id` | UUID | Obrigatório; referência a `auth.users.id`. Definido a partir da identidade autenticada na criação e imutável pelo cliente. |
| `name` | Texto | Nome de exibição obrigatório e não vazio. Pode ser alterado pelo proprietário. |
| `storage_path` | Texto | Caminho único e obrigatório do arquivo no bucket privado; reservado na criação e imutável pelo cliente. Não armazena URL pública ou URL assinada. |
| `mime_type` | Texto, opcional | Tipo do arquivo; deve ser validado no fluxo de upload, sem confiar apenas no valor enviado pelo app. |
| `size_bytes` | Inteiro de 64 bits, opcional | Tamanho do arquivo em bytes; quando preenchido, não pode ser negativo. |
| `status` | Estado controlado | Inicialmente `pending_upload`; transições posteriores controladas pelo backend. |
| `created_at` | Data/hora com fuso | Gerada pelo banco na criação. |
| `updated_at` | Data/hora com fuso | Mantida pelo banco quando o registro é alterado. |

Estados implementados: `pending_upload`, `uploaded`, `processing`, `ready`, `failed` e `deleting`. Os estados de IA estão reservados para uma etapa futura. A criação do registro reserva a identidade e o caminho antes do envio do arquivo. A existência do registro não significa que o upload ou o processamento terminou. A etapa de upload detalhará confirmação, falhas e limpeza de arquivos ou registros incompletos.

A primeira versão permitirá alterar o nome de exibição, mas não substituir o arquivo original. Um novo arquivo será um novo documento. Campos técnicos, propriedade e estado não serão livremente editáveis pelo cliente.

### `document_shares`

| Campo | Tipo proposto | Finalidade e restrição |
| --- | --- | --- |
| `document_id` | UUID | Obrigatório; referência a `documents.id`. |
| `user_id` | UUID | Obrigatório; referência à conta cadastrada que recebeu acesso. |
| `permission` | Valor controlado | Somente `reader` nesta versão. |
| `created_at` | Data/hora com fuso | Gerada pelo banco quando o acesso é concedido. |

A chave primária será composta por (`document_id`, `user_id`), impedindo compartilhamentos duplicados. A existência da linha representa acesso ativo; revogar consiste em remover a linha. Uma nova concessão cria uma nova linha. Histórico de concessões e revogações fica fora desta etapa.

Somente o proprietário poderá conceder e revogar acessos. Não será permitido compartilhar com o próprio proprietário. O vínculo não poderá ser alterado para outro documento ou destinatário: será necessário revogar e conceder novamente.

O destinatário deverá ter conta cadastrada. A futura interface poderá usar e-mail para indicar o destinatário, mas a resolução da conta deverá ocorrer em operação autorizada no servidor, sem expor uma lista geral de usuários ou a tabela `auth.users`. Convites para pessoas sem conta ficam fora da primeira versão.

## Matriz de acesso

| Operação | Proprietário | Leitor autorizado | Outro usuário | Sem autenticação |
| --- | --- | --- | --- | --- |
| Criar documento próprio | Sim | Sim, como proprietário do novo documento | Sim, como proprietário do novo documento | Não |
| Listar e visualizar este documento | Sim | Sim | Não | Não |
| Abrir ou baixar o arquivo | Sim | Sim | Não | Não |
| Consultar este documento com IA, quando implementado | Sim | Sim | Não | Não |
| Alterar nome de exibição | Sim | Não | Não | Não |
| Excluir documento | Sim | Não | Não | Não |
| Conceder ou revogar compartilhamentos | Sim | Não | Não | Não |
| Listar todos os destinatários deste documento | Sim | Não | Não | Não |
| Consultar o próprio vínculo de compartilhamento | Não se aplica | Sim | Não | Não |
| Transferir propriedade ou substituir arquivo | Não nesta versão | Não | Não | Não |
| Alterar diretamente o estado de processamento | Não | Não | Não | Não |

“Leitor” é uma permissão sobre um documento específico, não um papel global da conta. Um usuário pode ser proprietário de um documento e leitor de outro.

Conversas e histórico de perguntas serão privados por usuário. Compartilhar um documento não compartilhará conversas existentes. O desenho dessas tabelas será feito na etapa de IA.

## Regras de integridade e autorização

1. Um documento pertence a exatamente uma conta existente. O cliente não poderá criar documentos em nome de outra pessoa nem alterar seu proprietário.
2. Um compartilhamento só poderá apontar para documento e destinatário existentes. A autorização para conceder acesso será verificada no banco; não dependerá de um `owner_id` informado pela interface.
3. Restrições de integridade e regras de autorização serão aplicadas no servidor/banco, inclusive a proibição de compartilhar com o próprio proprietário.
4. Excluir o registro de um documento removerá seus compartilhamentos por relação com exclusão em cascata. A remoção do arquivo do Storage exige uma operação própria e será detalhada na etapa de armazenamento; a cascata do banco não apaga arquivos.
5. Excluir uma conta destinatária removerá seus vínculos de compartilhamento. Para contas proprietárias, a proposta é impedir a remoção enquanto houver documentos e executar a limpeza por um fluxo explícito de exclusão de conta, a definir posteriormente.
6. A autorização de leitura será: usuário autenticado é proprietário **ou** possui vínculo ativo em `document_shares`. Não haverá acesso anônimo ou links públicos.
7. Revogar um vínculo bloqueará novas operações autorizadas por esse vínculo, inclusive consultas de IA. Downloads já realizados não podem ser recolhidos; URLs temporárias já emitidas podem permanecer utilizáveis até expirar.
8. Texto extraído, índices de busca e demais resultados derivados deverão respeitar a autorização do documento de origem. O conteúdo enviado ao modelo de IA deverá ser limitado aos documentos autorizados antes de montar o contexto.
9. Ao encerrar ou trocar de sessão, o app deverá limpar o estado e os caches privados da conta anterior.

## Diretrizes para o passo 2 — migração e RLS

As tabelas, os privilégios de operações (`GRANT`) e as políticas por linha (RLS, *Row Level Security*) deverão nascer na mesma migração. Privilégios definem quais operações um papel pode executar; políticas restringem os registros sobre os quais essas operações são permitidas. Restrições de campos também serão necessárias: permissão de atualizar uma linha não significa poder alterar todas as suas colunas.

A implementação deverá proteger leitura, criação, alteração e exclusão separadamente. Não basta adicionar um filtro na consulta do aplicativo. As verificações usarão a identidade autenticada, e as políticas entre documentos e compartilhamentos deverão evitar dependências recursivas.

Índices previstos: `documents.owner_id`, a chave composta de `document_shares` e um índice iniciado por `document_shares.user_id` para listar documentos recebidos.

Serviços administrativos de processamento exigirão autorização explícita, pois credenciais com capacidade de ignorar RLS não recebem automaticamente o isolamento do usuário. Essas credenciais ficarão exclusivamente no backend.

## Critérios de validação da implementação futura

Usar três contas: A (proprietário), B (leitor autorizado) e C (sem acesso), além de requisições sem autenticação.

- A cria um documento próprio e não consegue atribuí-lo a B na criação ou em uma atualização.
- Antes do compartilhamento, B e C não conseguem listar ou consultar o documento, mesmo conhecendo seu identificador.
- A concede leitura a B; B passa a consultar o documento, mas não consegue alterá-lo, excluí-lo, compartilhar novamente ou listar outros destinatários.
- C não consegue conceder acesso a si mesmo, e B não consegue ampliar sua permissão.
- Compartilhamentos duplicados, com o proprietário ou com referências inexistentes são rejeitados.
- A revoga B; novas consultas de B ao documento deixam de retornar seu conteúdo.
- Excluir um documento remove seus vínculos de compartilhamento.
- Requisições sem autenticação não acessam documentos nem compartilhamentos.
- Os testes exercitam as regras diretamente pela API ou pelo banco sob os papéis apropriados, sem depender dos bloqueios da interface.

A abertura do arquivo, a revogação no Storage e o isolamento das consultas de IA serão testados quando essas camadas forem implementadas. Os testes foram escritos e estão em execução/revisão. Os resultados serão registrados abaixo conforme forem confirmados.

## Resultados de validação (atualizados durante a execução)

- `npx expo lint`: aprovado.
- `npx tsc --noEmit`: aprovado.
- `node --test tests/auth.test.cjs tests/documents.test.cjs`: 14 testes aprovados, incluindo os 11 testes de autenticação existentes.
- Ambiente local completo recriado com PostgreSQL 17.11 e Storage 1.79.28, usando imagens em cache. As duas migrações foram aplicadas. A suíte de 42 asserções PostgreSQL e a análise de funções SQL estão em execução; a integração HTTP vem em seguida.
- Aplicação remota: ainda pendente; apenas `--dry-run` executado.

## Decisões da implementação em andamento

- Primeira versão aceita PDF, PNG e JPEG, até 10 MB por arquivo. O seletor verifica tamanho e assinatura básica; o Storage restringe tamanho e MIME. Isso não representa inspeção de malware nem validação completa do conteúdo no servidor. O processamento futuro deverá validar e interpretar arquivos em ambiente apropriado.
- `create_document` reserva UUID, proprietário e caminho no servidor. O cliente não tem permissão de inserção direta ou alteração de proprietário, caminho, tamanho e estado.
- `complete_document_upload` confere existência, tamanho e MIME nos metadados do Storage antes de marcar `uploaded`.
- Envio interrompido mantém uma reserva visível ao proprietário. Ele pode concluir a confirmação se o arquivo chegou, ou excluir a reserva e enviar novamente.
- Exclusão ocorre em três etapas: `begin_document_delete` marca `deleting` e revoga os compartilhamentos; a API do Storage remove o arquivo; `finish_document_delete` só remove o registro quando o objeto não existe mais. Falhas permitem tentar novamente; não há limpeza automática agendada nesta versão.
- Compartilhamento e consulta dos e-mails dos destinatários ocorrem por RPCs que verificam a propriedade. Não existe diretório público de usuários. A concessão continua limitada a contas existentes.
- A tela tem listas paginadas de 20 itens, renomeação, compartilhamento, revogação e confirmação de exclusão. Arquivos abrem por URL assinada com validade de 60 segundos; URLs já emitidas não são invalidadas instantaneamente por revogação.
- Cada serviço do app fica vinculado ao token que iniciou a operação; troca de conta recria a tela e limpa seu estado. A cópia temporária do seletor nativo é removida após a leitura. Arquivos exportados para outros aplicativos ficam fora desse controle.
- Foram instalados `expo-document-picker` e `expo-file-system` via `expo install`, compatíveis com SDK 57. A validação em Android/iOS ainda está pendente.

## Como repetir a validação local

O ambiente local é descartável e separado do projeto remoto. Os testes de integração criam três contas locais e removem os próprios dados ao terminar.

```bash
npx supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor,realtime,postgres-meta
npx supabase db push --local
npx supabase test db
RUN_DOCUMENT_INTEGRATION=1 node --test tests/documents.integration.test.cjs
npm test
npx expo lint
npx tsc --noEmit
```

`supabase db reset --local` recria somente o ambiente local e apaga seus dados de desenvolvimento. Não usar reset remoto. O teste HTTP obtém as credenciais da instância local pela CLI e rejeita URLs que não sejam localhost/127.0.0.1.

## Sequência da FASE 01

1. Definir esquema, matriz de permissões e restrições — descritos neste documento.
2. Criar migração com tabelas, privilégios, RLS e testes de isolamento.
3. Validar proprietário, leitor, usuário sem acesso e revogação.
4. Configurar Storage privado com autorização equivalente e ciclo de vida dos arquivos.
5. Implementar upload e listagens “Meus documentos” e “Compartilhados comigo”.

## Referências

- [Supabase — Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase — controle de acesso do Storage](https://supabase.com/docs/guides/storage/security/access-control)


parou aqui!!!
