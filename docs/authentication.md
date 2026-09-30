# Autenticação com Supabase

## Objetivo

Implementar autenticação no aplicativo Expo SDK 57 com Supabase Auth, utilizando o mesmo cliente e a mesma gestão de sessão para:

- E-mail e senha.
- Magic link enviado por e-mail.
- Provedores sociais, a definir (por exemplo, Google e Apple).

Este documento registra o plano de implementação. Os itens pendentes não representam funcionalidades já disponíveis.

## Estado atual

- [x] Organização e projeto criados no Supabase, conforme informado durante a configuração.
- [x] Variáveis preenchidas no `.env`, conforme informado pelo desenvolvedor.
- [x] `.env` incluído no `.gitignore`.
- [x] Dependências instaladas: `@supabase/supabase-js`, `@react-native-async-storage/async-storage` e `react-native-url-polyfill`.
- [x] Cliente básico criado em `src/lib/supabase.ts`, com validação das variáveis de ambiente.
- [x] Telas de login e cadastro com validação local dos campos.
- [ ] Persistência e renovação da sessão configuradas para dispositivos móveis.
- [ ] Telas conectadas ao Supabase Auth.
- [ ] Gestão centralizada da sessão e rotas protegidas.
- [ ] Magic link e provedores sociais implementados.

## Organização proposta

| Arquivo ou pasta | Responsabilidade |
| --- | --- |
| `src/lib/supabase.ts` | Criar e exportar o cliente compartilhado do Supabase. |
| `src/providers/auth-provider.tsx` (a criar) | Disponibilizar sessão, usuário e estado de carregamento; acompanhar mudanças de autenticação. |
| `src/app/_layout.tsx` | Integrar o provider e controlar o acesso às rotas com Expo Router. |
| `src/app/index.tsx` | Tela de login existente. |
| `src/app/signup.tsx` | Tela de cadastro existente. |
| `src/app/` | Futuras telas internas e rota de retorno da autenticação. |
| `src/utils/validation.ts` | Validações dos formulários. |

O cliente fica em `lib` porque configura uma biblioteca externa. Funções auxiliares permanecem em `utils`. Providers, hooks e outros arquivos que não sejam rotas devem ficar fora de `src/app`.

## Variáveis de ambiente

O `.env`, na raiz do projeto, utiliza estes nomes:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Os valores não devem ser copiados para este documento. Variáveis com prefixo `EXPO_PUBLIC_` são incorporadas ao aplicativo e não são segredos. A publishable key é destinada ao cliente; nunca colocar uma secret key, `service_role` ou senha do banco no app.

## Etapas de implementação

### 1. Completar o cliente

- Importar o polyfill de URL antes de inicializar o cliente.
- Manter a validação das variáveis de ambiente.
- Configurar o armazenamento da sessão no dispositivo com AsyncStorage, considerando separadamente a execução web.
- Habilitar persistência e renovação automática da sessão.
- Controlar a renovação conforme o aplicativo entra em primeiro ou segundo plano.
- Registrar os listeners uma única vez e remover assinaturas quando seu responsável for desmontado.

O AsyncStorage persiste dados, mas não é armazenamento criptografado. Não salvar a senha do usuário; a sessão é gerenciada pelo SDK.

### 2. Conectar e-mail e senha

- Cadastro: utilizar `supabase.auth.signUp`, enviando o nome como metadado.
- Login: utilizar `supabase.auth.signInWithPassword`.
- Exibir carregamento, impedir envios repetidos e tratar erros em português.
- No login, exigir senha preenchida sem reaplicar regras de criação de senha.
- No cadastro, validar a senha e sua confirmação e alinhar os critérios com o Supabase.
- Se a confirmação de e-mail estiver habilitada, orientar a pessoa a confirmar o endereço quando o cadastro não retornar uma sessão.

A confirmação de cadastro e o magic link de login são fluxos distintos.

### 3. Centralizar a sessão e proteger as telas

- Criar um AuthProvider que restaure a sessão inicial e acompanhe `onAuthStateChange`.
- Aguardar a conclusão do carregamento inicial antes de decidir a navegação.
- Disponibilizar as telas internas somente com uma sessão autenticada, utilizando as rotas protegidas do Expo Router.
- Criar uma tela interna inicial com botão Sair.
- Implementar logout com `supabase.auth.signOut` e tratar possíveis falhas.

Proteção de rotas controla a interface. A autorização de acesso aos dados deve ser aplicada no servidor, com permissões e políticas RLS.

### 4. Implementar magic link

- Criar a opção de entrar informando apenas o e-mail.
- Enviar o link com `supabase.auth.signInWithOtp`.
- Definir se esse fluxo poderá criar contas automaticamente; configurar `shouldCreateUser` conforme essa decisão.
- Definir o endereço de retorno ao app e cadastrá-lo entre as URLs permitidas no Supabase.
- Implementar a rota que recebe o retorno e estabelece a sessão de acordo com o fluxo escolhido.
- Tratar links expirados, inválidos ou já utilizados, além do reenvio.

O recebimento do link não significa que a sessão já foi estabelecida. O retorno ao aplicativo precisa ser processado. Planejar testes em development build com o endereço de retorno real do app.

### 5. Adicionar provedores sociais

- Escolher os provedores que serão oferecidos.
- Configurar o aplicativo e as credenciais no painel de cada provedor.
- Habilitar e configurar os provedores no Supabase.
- Distinguir o callback do Supabase cadastrado no provedor do endereço que devolve o usuário ao aplicativo.
- Escolher o fluxo adequado para cada plataforma: OAuth pelo navegador ou integração nativa compatível.
- Adicionar os botões e tratar sucesso, cancelamento e falha.

Credenciais secretas dos provedores ficam na configuração apropriada do serviço, nunca em variáveis públicas do app.

### 6. Completar recuperação e autorização

- Implementar solicitação de recuperação de senha e tela para definir uma nova senha.
- Configurar e testar os retornos de confirmação de e-mail e recuperação de senha.
- Antes de disponibilizar o app ao público, configurar o envio de e-mails e conferir os limites do serviço.
- Para cada tabela de dados da aplicação, definir permissões e políticas RLS específicas.
- Não criar uma tabela própria para armazenar senhas: Supabase Auth gerencia as credenciais.

Ativar RLS automaticamente nas tabelas novas não cria políticas de acesso. As permissões e as políticas precisam ser configuradas conforme os dados que cada usuário pode acessar.

## Validação

Após a implementação de cada etapa, executar lint e TypeScript conforme as instruções do projeto. O ESLint ainda precisa ser configurado; não considerar lint aprovado enquanto essa configuração estiver pendente.

Validar os fluxos relevantes em dispositivo ou emulador:

- Cadastro com confirmação de e-mail e login com credenciais válidas e inválidas.
- Mensagens de erro e prevenção de envio duplicado.
- Restauração da sessão ao fechar e reabrir o app.
- Renovação da sessão ao alternar entre primeiro e segundo plano.
- Logout e bloqueio de acesso às telas internas após sair.
- Retorno por link com o app aberto e fechado.
- Magic link válido, expirado e reutilizado.
- Login social concluído, cancelado e com falha.
- Recuperação de senha.
- Impossibilidade de um usuário acessar dados privados de outro pelas APIs.

## Referências oficiais

- [Supabase Auth com React Native](https://supabase.com/docs/guides/auth/quickstarts/react-native)
- [Variáveis de ambiente no Expo](https://docs.expo.dev/guides/environment-variables/)
- [Autenticação no Expo Router](https://docs.expo.dev/router/advanced/authentication/)
- [Magic link e OTP](https://supabase.com/docs/guides/auth/auth-email-passwordless)
- [Deep links no Supabase Auth](https://supabase.com/docs/guides/auth/native-mobile-deep-linking)
- [Login social](https://supabase.com/docs/guides/auth/social-login)
- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
