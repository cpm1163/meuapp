# Autenticação com Supabase

## Implementado

- Cadastro com nome, e-mail e senha e retorno da confirmação de e-mail.
- Login com senha, Google via OAuth no navegador e magic link com criação automática de conta (`shouldCreateUser: true`).
- Cliente com PKCE, persistência da sessão e renovação conforme o estado do app.
- AuthProvider, restauração de sessão, rotas protegidas, tela interna e logout.
- Callback `/auth/callback` que troca o código por uma sessão e trata falhas.
- Mensagens em português, bloqueio de operações simultâneas na tela de login e intervalo de 60 segundos para reenviar magic link.

O Google é o único provedor social implementado neste momento. O magic link já foi validado na web conforme o registro abaixo. O login Google na web também foi concluído com sucesso, conforme confirmação do usuário após as orientações para corrigir o retorno local e iniciar uma nova tentativa.

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
2. Em Authentication > URL Configuration > Redirect URLs, conferir a inclusão de `http://localhost:8081/auth/callback`. Manter também `myapp://auth/callback` para a build nativa. O campo Site URL foi mantido em `http://localhost:3000` durante a configuração mostrada; ele não substitui a lista de Redirect URLs.
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

Executar `npx expo lint`, `npx tsc --noEmit` e `node --test tests/auth.test.cjs`.

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
- A configuração `lock: processLock` foi removida porque está descontinuada no Supabase instalado. Persistência, PKCE e renovação automática continuam configurados.
- OAuth nativo verifica o destino do callback antes de trocar o código. Cancelar/fechar o navegador termina a tentativa sem erro; falhas do navegador ou recusa do provedor são tratadas.

### Histórico: estado OAuth expirado

O usuário concluiu a verificação de identidade no Google, mas a captura do retorno mostra `localhost:3000/?error=invalid_request&error_code=bad_oauth_state&error_description=OAuth+state+has+expired`, seguido de conexão recusada. Isso não confirma uma sessão no Document AI. A demora durante a verificação é uma possível causa da expiração, não confirmada.

Em Authentication > URL Configuration no Supabase, ajustar Site URL para `http://localhost:8081` no ambiente local e conferir `http://localhost:8081/auth/callback` em Redirect URLs. A alteração do endereço não recupera a tentativa expirada: voltar ao app e iniciar um novo login no mesmo navegador, sem reutilizar a URL anterior. Manter o callback do Supabase cadastrado no Google Cloud.

### Login Google na web confirmado

Após as orientações de configuração do retorno local e uma nova tentativa, o usuário confirmou: “agora foi”. Login Google na web marcado como validado. Persistência após recarregar, cancelamento, conta recusada e login em development build continuam pendentes de confirmação específica.
