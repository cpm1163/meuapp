import { Stack } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { AuthProvider, useAuth } from "@/providers/auth-provider";

function Routes() {
  const { session, loading } = useAuth();
  if (loading) return <View style={{ flex: 1, justifyContent: "center" }}><ActivityIndicator accessibilityLabel="Restaurando sessão" /></View>;
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="index" />
        <Stack.Screen name="signup" />
      </Stack.Protected>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="home" />
        <Stack.Screen name="documents" />
        <Stack.Screen name="patients" />
        <Stack.Screen name="patient" />
        <Stack.Screen name="modules" />
        <Stack.Screen name="admin" />
        <Stack.Screen name="analysis" />
      </Stack.Protected>
      <Stack.Screen name="auth/callback" />
    </Stack>
  );
}

export default function Layout() {
  return <AuthProvider><Routes /></AuthProvider>;
}
