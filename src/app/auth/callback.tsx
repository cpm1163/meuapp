import { useEffect, useState } from "react";
import { Link, Redirect, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { exchangeAuthCode } from "@/lib/auth";
import { useAuth } from "@/providers/auth-provider";

function CallbackError({ message }: { message: string }) {
  return <View style={styles.container}>
    <Text accessibilityRole="alert">{message}</Text>
    <Link href="/" replace>Voltar ao início</Link>
  </View>;
}

function ExchangeCode({ code }: { code: string }) {
  const { session } = useAuth();
  const [failed, setFailed] = useState(false);
  const [complete, setComplete] = useState(false);
  useEffect(() => {
    let active = true;
    void exchangeAuthCode(code).then(() => {
      if (active) setComplete(true);
    }).catch(() => {
      if (active) setFailed(true);
    });
    return () => { active = false; };
  }, [code]);

  if (failed) return <CallbackError message="Não foi possível validar o link. Ele pode ter expirado ou já ter sido usado. Solicite um novo link e abra no mesmo dispositivo e navegador em que iniciou o acesso." />;
  if (complete && session) return <Redirect href="/home" />;
  return <View style={styles.container}><ActivityIndicator /><Text>Concluindo seu acesso...</Text></View>;
}

export default function AuthCallback() {
  const { code, error, error_description } = useLocalSearchParams<{
    code?: string; error?: string; error_description?: string;
  }>();
  if (error || error_description || !code || typeof code !== "string") {
    return <CallbackError message="Este link é inválido, expirou ou o acesso foi cancelado. Volte e inicie o login novamente." />;
  }
  return <ExchangeCode key={code} code={code} />;
}

const styles = StyleSheet.create({ container: { flex: 1, justifyContent: "center", padding: 32, gap: 24 } });
