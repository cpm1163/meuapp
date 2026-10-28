# Development build (Android e iOS)

## Estado e escopo

Planejamento iniciado em 03/10/2026. Feito em 03/10/2026: conta Expo, nome neutro `exames-ia` em `app.json` e projeto criado e ligado na Expo (`@cpm1163-apps/exames-ia`, `projectId` em `app.json`, por `eas init`). Falta o restante do [plano](#plano) a partir do `expo-dev-client`.

**Mudança em 23/10/2026:** por decisão do usuário, a primeira build é **preview** (APK com o JavaScript embutido, funciona sem o computador), não development. Feito em 23/10/2026: `eas.json` só com o perfil `preview` (distribuição interna, APK, ambiente `preview`); `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` criadas no ambiente `preview` do EAS (plaintext, Supabase remoto); dependências alinhadas com `npx expo install --fix` (`expo-doctor` 21/21); chave de assinatura Android gerada e guardada pelo EAS; primeira build Android preview enviada. Consequências: cada mudança de tela exige nova build (ou EAS Update, a avaliar); sem `__DEV__`, a troca rápida de conta não aparece. O `expo-dev-client` fica para quando precisarmos iterar no celular. **Build adiada** por decisão do usuário (03/10/2026): seguir com a FASE 03 e fazer uma única build quando o módulo de captura de fotos estiver escolhido.

Até aqui o app foi validado no **Expo Go**, que só inclui os módulos nativos que vêm com ele. O development build é a versão do app com o próprio código nativo e as ferramentas de desenvolvimento (`expo-dev-client`). A partir dele, o celular continua carregando o JavaScript do `npx expo start`, como no Expo Go. Ele é necessário para:

- **Login Google no celular**, hoje bloqueado no Expo Go ([authentication.md](authentication.md)). O retorno `examesia://auth/callback` só funciona num app instalado com o scheme `examesia`.
- **Câmera e fotos de laudos na FASE 03** ([compliance.md](compliance.md)), além de qualquer outra biblioteca com código nativo.
- Testar **identificador, ícone, permissões e configuração nativa** de verdade, sem depender da configuração do Expo Go.

Referências (SDK 57): [introdução](https://docs.expo.dev/develop/development-builds/introduction/), [eas.json](https://docs.expo.dev/build/eas-json/), [distribuição interna](https://docs.expo.dev/build/internal-distribution/), [variáveis de ambiente no EAS](https://docs.expo.dev/eas/environment-variables/).

**Segunda build preview Android (27/10/2026):** com a FASE 05 parte 06 (anamnese, leitura em partes com conferência, abas da análise), para o usuário apresentar ao médico parceiro no próprio Android (o médico usa iPhone; iOS fica para depois). Build `9a57512a-20e4-444a-a2cb-f7ba20f5d4b4`, `expo-doctor` 21/21; ficou mais de 30 minutos na fila gratuita do EAS antes de terminar.

## Como vai funcionar

- A build é feita **na nuvem pelo EAS** (`npx eas-cli@latest build`). Não é preciso Android Studio nem Xcode. No iOS, isso dispensa um Mac.
- As pastas `ios/` e `android/` continuam sendo geradas (CNG); toda configuração nativa fica em `app.json` e em config plugins.
- A build **só precisa ser refeita** quando entra uma biblioteca nativa ou quando muda a configuração nativa (identificador, scheme, permissões, plugins). Mudanças em telas e lógica chegam pelo servidor de desenvolvimento, sem nova build.

## Pré-requisitos

| Item | Android | iOS | Situação |
| --- | --- | --- | --- |
| Conta Expo (expo.dev) | Sim | Sim | Criada em 03/10/2026: usuário `cpm1163`, organização `cpm1163-apps` (dona do projeto), verificação em duas etapas ativa. |
| Identificador do app (`android.package` / `ios.bundleIdentifier`) | Sim | Sim | `com.cpm1163.examesia` (03/10/2026). **Não muda depois de publicar na loja.** |
| Conta Apple Developer paga (US$ 99/ano) | Não | **Sim**, para instalar em iPhone | A confirmar |
| Registrar o iPhone (UDID) com `eas device:create` | Não | Sim; até 100 aparelhos por ano; registrar outro exige nova build | Pendente (iPhone em conserto) |
| Modo de desenvolvedor ativado no aparelho | Instalar APK fora da loja | Ajustes > Privacidade e Segurança | No primeiro uso |

**O arquivo `.env` não vai para a nuvem** (ele está no `.gitignore`). `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` precisam ser criadas como variáveis do EAS no ambiente `development`, com visibilidade `plaintext`, porque são públicas (vão dentro do app). Nenhuma chave secreta entra no app.

## Plano

1. **Decisões** (ver [Decisões](#decisões)): identificador, conta Expo e conta Apple.
2. **Configuração no repositório:**
   - `npx expo install expo-dev-client`.
   - `app.json`: `ios.bundleIdentifier` e `android.package`.
   - `eas.json` com os perfis `development` (dev client, distribuição interna), `preview` (interna, sem ferramentas de desenvolvimento) e `production`, cada um ligado ao ambiente de variáveis do EAS com o mesmo nome.
   - `npx eas-cli@latest init` para ligar o projeto à conta Expo (grava o `projectId` em `app.json`).
   - Lint, tipos e `npx expo-doctor`.
3. **Variáveis no EAS:** criar as duas `EXPO_PUBLIC_*` no ambiente `development`, apontando para o Supabase remoto (o local não é acessível pelo celular).
4. **Android primeiro:** `npx eas-cli@latest build --platform android --profile development` gera um APK, que é instalado pelo link ou QR code do EAS. Na primeira build, o EAS gera e guarda a chave de assinatura Android.
5. **Validar no Android** com o [checklist](#validação).
6. **iOS**, quando o iPhone voltar e houver conta Apple: `eas device:create`, depois a build com `--platform ios --profile development`; as credenciais (certificado e perfil ad hoc) são geradas pelo EAS. Ativar o modo de desenvolvedor e validar.
7. **Rotina daqui em diante:** desenvolver com `npx expo start` no development build. O Expo Go deixa de ser o ambiente de validação.

### Incluir já a captura de fotos da FASE 03?

Cada biblioteca nativa nova exige outra build (cerca de 10 a 20 minutos na fila gratuita do EAS, mais a reinstalação). A FASE 03 vai precisar fotografar laudos. **Proposta:** escolher o módulo de captura agora (a confirmar na documentação do SDK 57, por exemplo `expo-image-picker`, que abre a câmera e a galeria do sistema) e já incluí-lo nesta primeira build, com as mensagens de permissão em português configuradas pelo plugin em `app.json`.

## Validação

Android (Supabase remoto; primeira build em 23/10/2026 é preview, instalada após liberar o bloqueio do Play Protect para app de desenvolvedor desconhecido):

- [x] Preview (23/10/2026): o app abre sem o computador, ligado ao Supabase remoto.
- [ ] Login por senha e magic link funcionam (o link do e-mail abre o app pelo `examesia://auth/callback`).
- [x] Login Google: abre o navegador, volta ao app e fica logado; cancelar volta à tela de login (23/10/2026).
- [x] A sessão continua depois de fechar e abrir o app (23/10/2026).
- [ ] Documentos: carregar, abrir, compartilhar e excluir (FASE 01).
- [ ] Módulos: checklist de 03/10/2026 em [profiles.md](profiles.md).
- [ ] A troca rápida de conta continua aparecendo (o app está em `__DEV__`).
- [x] Câmera: a permissão aparece; tirar a foto e escolher da galeria funcionam. A galeria não pede permissão (seletor de fotos do Android) (23/10/2026).

iOS: o mesmo checklist, quando possível.

## Decisões

- [x] Nome neutro `exames-ia` (03/10/2026); `myapp` era provisório e não vai para produção. Slug `exames-ia`; identificador `com.cpm1163.examesia` nas duas plataformas (o Android não aceita hífen); scheme `examesia`; nome exibido provisório "Exames IA", que pode mudar a qualquer momento. O `project_id` do Supabase local continua `myapp`, porque só nomeia os containers locais.
- [x] Conta Expo: usuário `cpm1163`; projeto na organização `cpm1163-apps` (03/10/2026).
- [x] `examesia://auth/callback` cadastrado nas Redirect URLs do Supabase remoto; `myapp://auth/callback` removido (03/10/2026).
- [ ] Conta Apple Developer: contratar agora ou só quando o iPhone voltar.
- [x] Incluir o módulo de captura de fotos nesta primeira build: `expo-image-picker` e `expo-camera` já estão em `app.json` (23/10/2026).
- [x] Primeira build é preview, não development (23/10/2026).
