import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/Button";
import { useAuth } from "@/providers/auth-provider";
import { supabase } from "@/lib/supabase";

export default function Home() {
  const { session } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function signOut() {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch { setError("Não foi possível sair. Tente novamente."); }
    finally { setLoading(false); }
  }
  return <View style={styles.container}>
    <Text style={styles.title}>Você está conectado</Text>
    <Text>{session?.user.email}</Text>
    {!!error && <Text accessibilityRole="alert">{error}</Text>}
    <Button label={loading ? "Saindo..." : "Sair"} disabled={loading} onPress={signOut} />
  </View>;
}
const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 32, gap: 24 },
  title: { fontSize: 28, fontWeight: "700" },
});
