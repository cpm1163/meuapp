# Autenticação com Supabase

## Implementado

- Cadastro com nome, e-mail e senha e retorno da confirmação de e-mail.
- Login com senha, Google via OAuth no navegador e magic link com criação automática de conta (`shouldCreateUser: true`).
- Cliente com PKCE, persistência da sessão e renovação conforme o estado do app.
- AuthProvider, restauração de sessão, rotas protegidas, tela interna e logout.
- Callback `/auth/callback` que troca o código por uma sessão e trata falhas.
- Mensagens em português, bloqueio de operações simultâneas na tela de login e intervalo de 60 segundos para reenviar magic link.

A implementação local foi mantida. O magic link já foi validado na web conforme o registro abaixo. A configuração e os testes do Google permanecem pendentes.

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
- [ ] Configurar e testar login com Google — próximo passo.
- [ ] Configurar SMTP para envio a usuários externos; o recebimento no endereço testado não valida a entrega para outros destinatários.
- [ ] Validar em development build no Android/iOS. O ambiente mobile usado até aqui é Expo Go.

### Como repetir o teste web

1. Executar `npm run web` no projeto e abrir `http://localhost:8081` (ajustar a porta se necessário).
2. Em Authentication > URL Configuration > Redirect URLs, conferir a inclusão de `http://localhost:8081/auth/callback`. Manter também `myapp://auth/callback` para a build nativa. O campo Site URL foi mantido em `http://localhost:3000` durante a configuração mostrada; ele não substitui a lista de Redirect URLs.
3. No app, selecionar “Entrar sem senha (magic link)”, informar o e-mail e solicitar o link.
4. Abrir o e-mail mais recente e clicar em Sign in no mesmo navegador, perfil e dispositivo usados na solicitação, sem alternar para uma janela anônima.
5. Confirmar o acesso a `/home` e a mensagem “Você está conectado”.
6. Recarregar a página para verificar se a sessão continua ativa — validação ainda pendente de confirmação.
7. Clicar em Sair e tentar acessar `http://localhost:8081/home`; o app deve voltar ao login. Este comportamento já foi confirmado.

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

## Comportamento por plataforma

No Android/iOS, `openAuthSessionAsync` abre o navegador de autenticação. Na web, o login navega na mesma aba. O Expo Router recebe `/auth/callback`; a troca de código é compartilhada para evitar processamento duplicado pelo Router e pelo navegador nativo.

O fluxo PKCE exige o verificador salvo onde o acesso começou. Solicitar e abrir o magic link no mesmo app/dispositivo; na web, usar o mesmo navegador e origem. Usar o link mais recente e evitar iniciar outro login antes de abri-lo. Links antigos, expirados, reutilizados ou abertos sem o verificador exigem um novo envio.

Para validar o scheme nativo, usar uma development build com `myapp` registrado. Expo Go não é o ambiente de validação deste OAuth. A confirmação de cadastro também usa o mesmo callback PKCE.

## Validação

Executar `npx expo lint`, `npx tsc --noEmit` e `node --test tests/auth.test.cjs`.

Além dos testes web confirmados acima, permanecem pendentes:

- Google: sucesso, cancelamento, conta recusada e provedor desabilitado.
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
