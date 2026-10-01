# Autenticação com Supabase

Última revisão do código e da documentação: 01/10/2026. Projeto com Expo SDK 57.

As confirmações manuais abaixo preservam o histórico já registrado; esta revisão não repete logins reais nem verifica os painéis do Supabase e do Google.

## Implementado

- Cadastro com nome, e-mail e senha e retorno da confirmação de e-mail.
- Login com senha, Google via OAuth no navegador e magic link com criação automática de conta (`shouldCreateUser: true`).
- Cliente com PKCE, persistência da sessão e renovação conforme o estado do app.
- AuthProvider, restauração de sessão, rotas protegidas, tela interna e logout.
- Callback `/auth/callback` que troca o código por uma sessão e trata falhas.
- Mensagens em português, bloqueio de operações simultâneas na tela de login e intervalo de 60 segundos para reenviar magic link.

O Google é o único provedor social implementado neste momento. O magic link já foi validado na web conforme o registro abaixo. O login Google na web também foi concluído com sucesso, conforme confirmação do usuário após as orientações para corrigir o retorno local e iniciar uma nova tentativa.

## Provedores sociais — última atividade registrada

A última atividade registrada foi a configuração e validação do **Google na web**. Após corrigir as orientações de retorno local e iniciar uma nova tentativa, o usuário confirmou “agora foi”. Esse resultado confirma o login real pelo Google na web; os valores finais dos painéis não foram inspecionados diretamente.

| Provedor | Implementação no app | Validação real registrada |
| --- | --- | --- |
| Google | Botão “Continuar com Google”, OAuth via Supabase e callback compartilhado. | Login na web concluído com sucesso. Android/iOS pendentes. |
| Outros provedores sociais | Não há botões nem fluxos implementados. | Não validados. |

A lista `socialProviders` em `src/lib/auth.ts` contém somente `google`, e a tela de login gera os botões a partir dela. Habilitar outro provedor no painel do Supabase, isoladamente, não adiciona esse provedor à interface. Login por senha e magic link são alternativas por e-mail, não provedores sociais.

### Resultado e problemas encontrados

1. A primeira tentativa retornou HTTP 400, `validation_failed`, com `Unsupported provider: provider is not enabled`.
2. Após configurar o Google no Supabase, o fluxo abriu a verificação de identidade do Google.
3. Uma tentativa retornou `bad_oauth_state` / `OAuth state has expired` para `localhost:3000`, onde houve conexão recusada. Essa tentativa não confirmou uma sessão. A demora na verificação foi apenas uma hipótese para a expiração.
4. A orientação foi ajustar a Site URL local para a origem do app (`http://localhost:8081` no teste), conferir `/auth/callback` em Redirect URLs e iniciar um novo login.
5. Depois de uma nova tentativa, o usuário confirmou o sucesso na web. A falha anterior fica como histórico, não como bloqueio atual do Google.

A configuração usa dois retornos distintos: o Google recebe o callback **do Supabase** (`https://SEU_PROJETO.supabase.co/auth/v1/callback`); o Supabase recebe o callback **do app** na lista de Redirect URLs (`http://localhost:8081/auth/callback` na web local ou `myapp://auth/callback` na build nativa). Client ID e Client Secret do Google ficam no provedor do Supabase; o app usa apenas a URL e a chave pública do Supabase.

Próximas validações específicas do Google: persistência após recarregar, cancelamento, recusa de acesso e login em development build Android/iOS. O app bloqueia esse OAuth no Expo Go. O passo a passo está em [Configurar Google](#configurar-google).

## Mapa da implementação

| Arquivo | Responsabilidade |
| --- | --- |
| [`src/lib/supabase.ts`](../src/lib/supabase.ts) | Cliente, variáveis de ambiente, PKCE e persistência da sessão. |
| [`src/lib/auth.ts`](../src/lib/auth.ts) | URL de retorno, OAuth Google, magic link, troca de código e mensagens de erro. |
| [`src/providers/auth-provider.tsx`](../src/providers/auth-provider.tsx) | Restauração, eventos de sessão e renovação no app nativo. |
| [`src/app/_layout.tsx`](../src/app/_layout.tsx) | Proteção das telas conforme a sessão. |
| [`src/app/index.tsx`](../src/app/index.tsx) | Login por senha, Google e envio de magic link. |
| [`src/app/signup.tsx`](../src/app/signup.tsx) | Cadastro e orientação para confirmação de e-mail. |
| [`src/app/auth/callback.tsx`](../src/app/auth/callback.tsx) | Validação do retorno e conclusão do acesso. |
| [`src/app/home.tsx`](../src/app/home.tsx) | Home autenticada, conta e logout. |
| [`tests/auth.test.cjs`](../tests/auth.test.cjs) | Testes do serviço com navegador e Supabase simulados. |

### Sessão e proteção de telas

O cliente exige `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; sem elas, a inicialização lança um erro. Usa `flowType: "pkce"`, `persistSession: true`, `autoRefreshToken: true` e `detectSessionInUrl: false`. No nativo, fornece AsyncStorage; na web, não fornece armazenamento customizado.

O provider assina `onAuthStateChange` e consulta `getSession`. Se um evento já chegou, o resultado inicial não sobrescreve a sessão recebida. Enquanto a restauração está em andamento, o layout mostra “Restaurando sessão”. No nativo, a renovação é iniciada quando o app está ativo e interrompida nos demais estados.

As telas `/` e `/signup` ficam disponíveis sem sessão; `/home` exige sessão. O callback permanece acessível nos dois estados. Ele rejeita retorno com erro ou sem código e só redireciona para `/home` depois que a troca termina e o provider recebe a sessão. A última troca é compartilhada por código para evitar processamento duplicado; o evento `SIGNED_OUT` limpa esse estado.

### Cadastro e envio de links

O cadastro envia o nome em `user_metadata.name`, remove espaços nas extremidades do e-mail e usa o mesmo callback dos demais fluxos. Quando o Supabase retorna uma sessão, informa sucesso; quando não retorna, orienta a confirmar o e-mail. As regras dos campos estão em [Validação dos formulários](validacao-formularios.md).

O intervalo de 60 segundos começa após um envio de magic link bem-sucedido e fica no estado da tela: não é persistido ao recarregar. O bloqueio de operações simultâneas também é local à tela de login.

## Configuração e testes confirmados

- [x] Email provider habilitado em Authentication > Sign In / Providers.
- [x] Allow new users to sign up ativado.
- [x] Confirm email mantido ativado.
- [x] `myapp://auth/callback` cadastrado em Redirect URLs para a futura build instalada.
- [x] Retorno web para `http://localhost:8081/auth/callback` funcionando no teste local.
- [x] E-mail de magic link recebido no endereço utilizado no teste.
- [x] Login concluído no Chrome, chegando a `/home` com a mensagem “Você está conectado”.
- [x] Logout pelo botão Sair e bloqueio de acesso direto à `/home` após sair, confirmados pelo usuário.
- [ ] Persistência da sessão após recarregar a página: ainda sem confirmação explícita do teste.
- [x] O fluxo passou a abrir a verificação de identidade no Google após a configuração do provedor.
- [x] Login real com Google na web concluído com sucesso, confirmado pelo usuário após nova tentativa. Os valores finais do painel não foram inspecionados diretamente.
- [ ] Configurar SMTP para envio a usuários externos; o recebimento no endereço testado não valida a entrega para outros destinatários.
- [ ] Validar em development build no Android/iOS. O ambiente mobile usado até aqui é Expo Go.

### Como repetir o teste web

1. Executar `npm run web` no projeto e abrir `http://localhost:8081` (ajustar a porta se necessário).
2. Em Authentication > URL Configuration > Redirect URLs, conferir a inclusão de `http://localhost:8081/auth/callback`. Manter também `myapp://auth/callback` para a build nativa. Para esse ambiente local, configurar Site URL como `http://localhost:8081` (ou a origem efetivamente utilizada). O valor antigo `http://localhost:3000` pertence ao histórico da falha de retorno; Site URL não substitui a lista de Redirect URLs.
3. No app, selecionar “Entrar sem senha (magic link)”, informar o e-mail e solicitar o link.
4. Abrir o e-mail mais recente e clicar em Sign in no mesmo navegador, perfil e dispositivo usados na solicitação, sem alternar para uma janela anônima.
5. Confirmar o acesso a `/home`, agora com a interface Document AI.
6. Recarregar a página para verificar se a sessão continua ativa — validação ainda pendente de confirmação.
7. Selecionar “Sair” no cabeçalho da home e tentar acessar `http://localhost:8081/home`; o app deve voltar ao login. Este comportamento já foi confirmado.

### Falha observada durante o teste

Uma tentativa chegou ao callback, mas exibiu “Não foi possível validar o link”. As capturas mostravam o app anteriormente no Edge e o link aberto no Chrome. A troca de navegador foi apontada como causa provável, pois o verificador PKCE fica salvo no navegador que iniciou o acesso. Depois de solicitar um novo link e concluir o fluxo no Chrome, o login funcionou.

O endereço `myapp://auth/callback` identifica o retorno para uma build instalada com o scheme `myapp`. Para o teste realizado no navegador, o retorno usado foi `http://localhost:8081/auth/callback`.

## Configurar Supabase

Manter no `.env` somente `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Nunca colocar client secret do Google ou service role no app.

Em Authentication > URL Configuration:

- Adicionar `myapp://auth/callback` em Redirect URLs para a build nativa.
- Adicionar `http://localhost:8081/auth/callback` para web local (ajustar à porta utilizada).
- Adicionar `https://SEU_DOMINIO/auth/callback` para web publicada e definir a Site URL real.
- Se alterar o scheme em `app.json`, atualizar `getAuthRedirectUrl` e gerar uma nova build.

Em Authentication > Providers, habilitar Email e Google. Permitir novos cadastros para que o magic link possa criar contas.

Nos templates de Magic Link e Confirm signup, manter o link `{{ .ConfirmationURL }}`. Ele verifica o e-mail no Supabase e redireciona para o callback com `code`. Um template que envia apenas OTP numérico não atende à interface implementada.

Configurar SMTP e conferir os limites de envio antes de testar com usuários externos. A espera local de 60 segundos não substitui os limites do servidor.

## Configurar Google

1. Configurar projeto, tela de consentimento e usuários de teste no Google Auth Platform.
2. Criar um cliente OAuth do tipo Web application, pois o login passa pelo Supabase no navegador.
3. Em Authorized redirect URIs do Google, cadastrar o callback exibido pelo Supabase: `https://SEU_PROJETO.supabase.co/auth/v1/callback` (ou o domínio customizado correspondente).
4. Salvar Client ID e Client Secret no provedor Google do Supabase e habilitá-lo.

O callback cadastrado no Google é do Supabase. O endereço `myapp://auth/callback` fica na lista de redirects do Supabase e devolve o usuário ao app. Nenhum segredo do Google precisa estar no `.env` do aplicativo.

### Validar o Google na web

1. Concluir a configuração acima e adicionar a conta em Audience > Test users no Google Auth Platform quando o projeto estiver em modo de teste para público externo.
2. Executar `npm run web` e conferir a origem exibida pelo Expo. Cadastrar essa origem com `/auth/callback` em Redirect URLs no Supabase.
3. Sair da sessão atual pelo botão “Sair” no cabeçalho da home e clicar em “Continuar com Google”.
4. Selecionar a conta e autorizar o acesso. Confirmar o retorno à home Document AI.
5. Recarregar a página e conferir a persistência. Clicar em “Sair” no cabeçalho e conferir que `/home` volta ao login.
6. Repetir cancelando o acesso; a tela deve permitir uma nova tentativa sem criar uma sessão.

Diagnóstico:

- `redirect_uri_mismatch`: conferir no Google o callback **do Supabase**, copiado do painel do provedor. Não cadastrar `myapp://auth/callback` no Google.
- Acesso bloqueado em modo de teste: conferir os usuários de teste e a audiência configurada no Google.
- Retorno à URL errada: conferir Redirect URLs no Supabase e a origem/porta do app.
- Provedor desabilitado: habilitar Google no Supabase e salvar as credenciais.
- Expo Go: o app informa que o login Google requer web ou development build, antes de iniciar uma requisição OAuth.

O teste inicial retornou HTTP 400, `validation_failed`, com `Unsupported provider: provider is not enabled`. Após configurar o provedor, houve uma tentativa com estado OAuth expirado. Em uma nova tentativa, o usuário confirmou o sucesso do login Google na web. Essa confirmação é manual; os testes automatizados usam serviços simulados e não validam credenciais externas.

## Comportamento por plataforma

No Android/iOS, `openAuthSessionAsync` abre o navegador de autenticação. Na web, o login navega na mesma aba. O Expo Router recebe `/auth/callback`; a troca de código é compartilhada para evitar processamento duplicado pelo Router e pelo navegador nativo.

O fluxo PKCE exige o verificador salvo onde o acesso começou. Solicitar e abrir o magic link no mesmo app/dispositivo; na web, usar o mesmo navegador e origem. Usar o link mais recente e evitar iniciar outro login antes de abri-lo. Links antigos, expirados, reutilizados ou abertos sem o verificador exigem um novo envio.

Para validar o scheme nativo, usar uma development build com `myapp` registrado. Expo Go não é o ambiente de validação deste OAuth. A confirmação de cadastro também usa o mesmo callback PKCE.

## Validação

Executar na raiz do projeto:

```bash
npx expo lint
npx tsc --noEmit
node --test tests/auth.test.cjs
```

A suíte atual tem 11 testes do serviço: parâmetros do magic link, troca duplicada e limpeza do estado, código rejeitado, sucesso/cancelamento/fechamento do navegador nativo, retorno com erro ou sem código, navegação web, bloqueio no Expo Go, destino inesperado, provedor desabilitado e falha do navegador. Ela não testa a interface, a persistência real, a entrega de e-mails ou a configuração externa.

Além dos testes web confirmados acima, permanecem pendentes:

- Google: validar cancelamento e conta recusada no fluxo real. Sucesso na web e falha por provedor desabilitado já foram observados; sucesso nativo permanece pendente.
- Magic link: validar separadamente conta existente e criação de conta, reenvio e links expirados/reutilizados. O teste concluído não distinguiu se a conta era nova ou existente.
- Retorno com app aberto e fechado; confirmar acesso à tela interna.
- Cadastro com confirmação de e-mail; login por senha válido/inválido.
- Persistência após recarregar a web; reabrir o app nativo, alternar segundo plano e verificar logout/proteção das telas em Android/iOS.

Proteção de rotas controla a interface; configurar permissões/RLS para os dados do aplicativo. Recuperação de senha permanece pendente e não tem tela implementada.

## Referências

- [Expo SDK 57 WebBrowser](https://docs.expo.dev/versions/v57.0.0/sdk/webbrowser/)
- [Autenticação no Expo Router](https://docs.expo.dev/router/advanced/authentication/)
- [Supabase com React Native](https://supabase.com/docs/guides/auth/quickstarts/react-native)
- [Fluxo PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow)
- [Magic link](https://supabase.com/docs/guides/auth/auth-email-passwordless)
- [Configuração Google](https://supabase.com/docs/guides/auth/social-login/auth-google)

## Atualização da home e da sessão

- A tela `/home` agora apresenta o Document AI, com saudação, cartão principal e atalhos de IA. O visual foi aprovado pelo usuário.
- Documentos exibem estado vazio. Importação, resumo, extração e perguntas ainda são apresentações com aviso “Em breve”; não há processamento ou armazenamento de documentos implementado.
- O cabeçalho tem um botão “Sair” visível, com estado “Saindo…” e bloqueio durante a operação. Falhas aparecem na própria home. O avatar também abre a conta com e-mail e ação “Sair da conta”.
- O cliente atual não define `lock: processLock`. Persistência, PKCE e renovação automática continuam configurados.
- OAuth nativo verifica o destino do callback antes de trocar o código. Cancelar/fechar o navegador termina a tentativa sem erro; falhas do navegador ou recusa do provedor são tratadas.

### Histórico: estado OAuth expirado

O usuário concluiu a verificação de identidade no Google, mas a captura do retorno mostra `localhost:3000/?error=invalid_request&error_code=bad_oauth_state&error_description=OAuth+state+has+expired`, seguido de conexão recusada. Isso não confirma uma sessão no Document AI. A demora durante a verificação é uma possível causa da expiração, não confirmada.

Em Authentication > URL Configuration no Supabase, ajustar Site URL para `http://localhost:8081` no ambiente local e conferir `http://localhost:8081/auth/callback` em Redirect URLs. A alteração do endereço não recupera a tentativa expirada: voltar ao app e iniciar um novo login no mesmo navegador, sem reutilizar a URL anterior. Manter o callback do Supabase cadastrado no Google Cloud.

### Login Google na web confirmado

Após as orientações de configuração do retorno local e uma nova tentativa, o usuário confirmou: “agora foi”. Login Google na web marcado como validado. Persistência após recarregar, cancelamento, conta recusada e login em development build continuam pendentes de confirmação específica.
