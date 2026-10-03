import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
import { supabase } from "./supabase";

export const socialProviders = [
  { id: "google", label: "Google" },
] as const;
export type SocialProvider = (typeof socialProviders)[number]["id"];

export function getAuthRedirectUrl() {
  return Platform.OS === "web"
    ? new URL("/auth/callback", window.location.origin).toString()
    : Linking.createURL("auth/callback", { scheme: "examesia" });
}

// Router and the native browser can deliver the same callback concurrently.
let lastExchange: { code: string; promise: Promise<void> } | undefined;
export function clearAuthCallbackState() {
  lastExchange = undefined;
}

export function exchangeAuthCode(code: string): Promise<void> {
  if (lastExchange?.code === code) return lastExchange.promise;
  const promise = (async () => {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    if (!data.session) throw new Error("missing_session");
  })();
  lastExchange = { code, promise };
  return promise;
}

export async function signInWithSocialProvider(provider: SocialProvider) {
  if (Platform.OS !== "web" && Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    throw Object.assign(new Error("expo_go_oauth"), { code: "expo_go_oauth" });
  }
  const redirectTo = getAuthRedirectUrl();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data.url) throw new Error("missing_oauth_url");
  if (Platform.OS === "web") {
    window.location.assign(data.url);
    return;
  }
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type === "cancel" || result.type === "dismiss") return;
  if (result.type !== "success") throw new Error("oauth_browser_failed");
  const url = new URL(result.url);
  const expected = new URL(redirectTo);
  if (url.protocol !== expected.protocol || url.host !== expected.host || url.pathname !== expected.pathname) {
    throw new Error("invalid_callback_url");
  }
  if (url.searchParams.has("error") || url.searchParams.has("error_description")) {
    throw Object.assign(new Error("oauth_failed"), { code: "oauth_failed" });
  }
  const code = url.searchParams.get("code");
  if (!code) throw new Error("missing_code");
  await exchangeAuthCode(code);
}

export async function sendMagicLink(email: string) {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: getAuthRedirectUrl(), shouldCreateUser: true },
  });
  if (error) throw error;
}

export function authErrorMessage(error: unknown) {
  const code = error && typeof error === "object" && "code" in error
    ? String(error.code) : "";
  const messages: Record<string, string> = {
    expo_go_oauth: "O login com Google não está disponível no Expo Go. Use a versão web ou uma build de desenvolvimento do app.",
    oauth_failed: "O provedor não autorizou o acesso. Inicie o login novamente.",
    invalid_credentials: "E-mail ou senha incorretos.",
    email_not_confirmed: "Confirme seu e-mail antes de entrar.",
    otp_expired: "Este link expirou ou já foi utilizado. Solicite um novo link.",
    flow_state_expired: "O acesso expirou. Inicie o login novamente.",
    flow_state_not_found: "Solicite um novo link e abra no mesmo dispositivo e navegador em que iniciou o acesso.",
    bad_code_verifier: "Abra o link no mesmo dispositivo e navegador em que iniciou o acesso, ou solicite um novo link.",
    validation_failed: "Não foi possível validar o acesso. Solicite um novo link.",
    provider_disabled: "Este provedor ainda não está disponível.",
    signup_disabled: "O cadastro de novas contas está desabilitado.",
    over_email_send_rate_limit: "Aguarde antes de solicitar outro e-mail.",
    over_request_rate_limit: "Muitas tentativas. Aguarde e tente novamente.",
  };
  return messages[code] ?? "Não foi possível concluir o acesso. Verifique sua conexão e tente novamente.";
}
