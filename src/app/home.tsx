import { useState } from "react";
import { router } from "expo-router";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/providers/auth-provider";
import { supabase } from "@/lib/supabase";

const actions = [
  { symbol: "≡", title: "Resumir", subtitle: "Vá direto ao essencial", color: "#EEEAFE", ink: "#7050CC", description: "Transforme documentos longos em resumos com os pontos mais importantes." },
  { symbol: "⌕", title: "Extrair dados", subtitle: "Encontre o que importa", color: "#E6F3EE", ink: "#2B8065", description: "Encontre datas, valores e informações importantes nos seus documentos." },
  { symbol: "✦", title: "Perguntar à IA", subtitle: "Converse com seus arquivos", color: "#FFF1E4", ink: "#AE6C2D", description: "Faça perguntas sobre um documento e encontre respostas baseadas no seu conteúdo." },
];

type Preview = { title: string; description: string };

function DocumentIllustration({ small = false }: { small?: boolean }) {
  return (
    <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.illustration, small && styles.smallIllustration]}>
      <View style={styles.paperBack} />
      <View style={styles.paper}>
        <View style={styles.paperHeading} />
        <View style={styles.paperLine} />
        <View style={styles.paperLine} />
        <View style={[styles.paperLine, { width: "55%" }]} />
        <View style={styles.paperHighlight}><View style={styles.highlightLine} /></View>
      </View>
      <View style={styles.sparkle}><Text style={styles.sparkleText}>✦</Text></View>
    </View>
  );
}

export default function Home() {
  const { session } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const rawName = session?.user.user_metadata?.full_name;
  const name = typeof rawName === "string" ? rawName.trim().split(/\s+/)[0] : "";
  const initial = (name || session?.user.email || "D").charAt(0).toUpperCase();

  async function signOut() {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch {
      setError("Não foi possível sair. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  function showImport() {
    router.push("/documents");
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.brand}>
            <View style={styles.logo}><Text style={styles.logoText}>✦</Text></View>
            <Text style={styles.brandText}>Document <Text style={styles.brandAccent}>AI</Text></Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable accessibilityRole="button" accessibilityLabel="Abrir minha conta" onPress={() => setAccountOpen(true)} style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}>
              <Text style={styles.avatarText}>{initial}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={loading ? "Saindo da conta" : "Sair da conta"}
              accessibilityState={{ disabled: loading, busy: loading }}
              disabled={loading}
              onPress={signOut}
              style={({ pressed }) => [styles.headerSignOut, (pressed || loading) && styles.pressed]}
            >
              <Text style={styles.headerSignOutText}>{loading ? "Saindo…" : "Sair"}</Text>
            </Pressable>
          </View>
        </View>
        {!!error && !accountOpen && <Text accessibilityRole="alert" style={[styles.error, styles.headerError]}>{error}</Text>}

        <View style={styles.intro}>
          <Text style={styles.eyebrow}>SEU ESPAÇO DE CLAREZA</Text>
          <Text style={styles.greeting}>Olá{name ? `, ${name}` : ""} <Text style={styles.wave}>✦</Text></Text>
          <Text style={styles.subtitle}>Menos leitura. Mais descobertas.</Text>
        </View>

        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.aiBadge}><Text style={styles.aiBadgeText}>✦  INTELIGÊNCIA ARTIFICIAL</Text></View>
            <View style={styles.heroDot} />
          </View>
          <View style={styles.heroBody}>
            <View style={styles.heroCopy}>
              <Text style={styles.heroTitle}>Seus documentos.{"\n"}Novas possibilidades.</Text>
              <Text style={styles.heroDescription}>Transforme informação em respostas que fazem sentido.</Text>
            </View>
            <DocumentIllustration />
          </View>
          <Pressable accessibilityRole="button" onPress={showImport} style={({ pressed }) => [styles.importButton, pressed && styles.pressed]}>
            <Text style={styles.importPlus}>+</Text>
            <Text style={styles.importLabel}>Adicionar documento</Text>
            <Text style={styles.importArrow}>↗</Text>
          </Pressable>
          <Text style={styles.heroFootnote}>O primeiro passo para simplificar sua rotina</Text>
        </View>

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>O que vamos descobrir?</Text>
          <Text style={styles.sectionHint}>COM IA</Text>
        </View>
        <View style={styles.actionList}>
          {actions.map((action) => (
            <Pressable key={action.title} accessibilityRole="button" onPress={() => setPreview(action)} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
              <View style={[styles.actionIcon, { backgroundColor: action.color }]}><Text style={[styles.actionSymbol, { color: action.ink }]}>{action.symbol}</Text></View>
              <View style={styles.actionCopy}><Text style={styles.actionTitle}>{action.title}</Text><Text style={styles.actionSubtitle}>{action.subtitle}</Text></View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Seus documentos</Text>
        </View>
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}><Text style={styles.emptyIconText}>≡</Text></View>
          <Text style={styles.emptyTitle}>Sua biblioteca privada</Text>
          <Text style={styles.emptyDescription}>Acesse seus arquivos e os documentos compartilhados com você.</Text>
          <Pressable accessibilityRole="button" onPress={showImport} style={({ pressed }) => [styles.emptyButton, pressed && styles.pressed]}><Text style={styles.emptyButtonText}>Abrir meus documentos  ↗</Text></Pressable>
        </View>
        <View style={styles.footer}><View style={styles.footerDot} /><Text style={styles.footerText}>Mais espaço para suas ideias.</Text></View>
      </ScrollView>

      <Modal visible={!!preview || accountOpen} transparent animationType="fade" onRequestClose={() => { setPreview(null); setAccountOpen(false); }}>
        <View style={styles.modalBackdrop}>
          <View accessibilityViewIsModal style={styles.modalCard}>
            <Text style={styles.eyebrow}>{accountOpen ? "MINHA CONTA" : "EM BREVE"}</Text>
            <Text style={styles.modalTitle}>{accountOpen ? "Seu espaço no Document AI" : preview?.title}</Text>
            <Text style={styles.modalDescription}>{accountOpen ? session?.user.email : preview?.description}</Text>
            {!accountOpen && <Text style={styles.availability}>Esta funcionalidade estará disponível em uma próxima versão.</Text>}
            {accountOpen && <>
              {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
              <Pressable accessibilityRole="button" accessibilityState={{ disabled: loading }} disabled={loading} onPress={signOut} style={({ pressed }) => [styles.signOutButton, pressed && styles.pressed]}><Text style={styles.signOutText}>{loading ? "Saindo…" : "Sair da conta"}</Text></Pressable>
            </>}
            <Pressable accessibilityRole="button" onPress={() => { setPreview(null); setAccountOpen(false); }} style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}><Text style={styles.closeText}>{accountOpen ? "Voltar para home" : "Entendi"}</Text></Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F7F8FC" },
  content: { paddingHorizontal: 24, paddingTop: 18, paddingBottom: 28, width: "100%", maxWidth: 680, alignSelf: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerSignOut: { minHeight: 44, minWidth: 48, paddingHorizontal: 10, paddingVertical: 10, borderRadius: 12, backgroundColor: "#EEEBFA", alignItems: "center", justifyContent: "center" },
  headerSignOutText: { color: "#6452B4", fontSize: 13, fontWeight: "600" },
  headerError: { marginTop: 12 },
  brand: { flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 1 },
  logo: { width: 36, height: 40, borderRadius: 12, backgroundColor: "#6455DC", alignItems: "center", justifyContent: "center" },
  logoText: { fontSize: 27, color: "#FFFFFF" },
  brandText: { fontSize: 21, fontWeight: "700", letterSpacing: -0.7, color: "#24253D", flexShrink: 1 },
  brandAccent: { color: "#7667DC" },
  avatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 3, borderColor: "#FFFFFF", backgroundColor: "#E9E6F7", alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#6355A2", fontWeight: "700", fontSize: 16 },
  intro: { marginTop: 34, marginBottom: 24, gap: 8 },
  eyebrow: { fontSize: 10, fontWeight: "700", letterSpacing: 1.7, color: "#77758E" },
  greeting: { fontSize: 34, fontWeight: "700", letterSpacing: -1.2, color: "#24253D" },
  wave: { color: "#8B79DF", fontSize: 28 },
  subtitle: { fontSize: 15, color: "#76758A", lineHeight: 23 },
  hero: { backgroundColor: "#6251D5", borderRadius: 26, padding: 22, overflow: "hidden" },
  heroTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  aiBadge: { borderRadius: 20, backgroundColor: "#7868DD", paddingHorizontal: 10, paddingVertical: 7 },
  aiBadgeText: { color: "#FFFFFF", fontSize: 9, fontWeight: "700", letterSpacing: 1 },
  heroDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#C0F2CE" },
  heroBody: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 23, marginBottom: 22 },
  heroCopy: { flex: 1, minWidth: 170, gap: 12 },
  heroTitle: { fontSize: 25, lineHeight: 32, fontWeight: "700", letterSpacing: -0.8, color: "#FFFFFF" },
  heroDescription: { fontSize: 13, lineHeight: 21, color: "#E4DFFD", maxWidth: 255 },
  illustration: { width: 85, height: 114, alignItems: "center", justifyContent: "center", marginRight: 2 },
  smallIllustration: { transform: [{ scale: 0.7 }] },
  paperBack: { position: "absolute", width: 66, height: 88, borderRadius: 10, backgroundColor: "#9586EA", transform: [{ rotate: "17deg" }], top: 8, right: 0 },
  paper: { width: 67, height: 89, padding: 12, borderRadius: 9, backgroundColor: "#F5F2FF", transform: [{ rotate: "-9deg" }], gap: 6 },
  paperHeading: { width: 20, height: 7, backgroundColor: "#A397DB", borderRadius: 2, marginBottom: 3 },
  paperLine: { height: 3, width: "100%", borderRadius: 2, backgroundColor: "#D1CAE9" },
  paperHighlight: { padding: 5, backgroundColor: "#E5DFF9", borderRadius: 4, marginTop: 3 },
  highlightLine: { height: 3, backgroundColor: "#AA99DF", borderRadius: 2 },
  sparkle: { position: "absolute", bottom: 0, right: 0, width: 35, height: 35, borderRadius: 12, backgroundColor: "#D6F3BC", alignItems: "center", justifyContent: "center", transform: [{ rotate: "8deg" }] },
  sparkleText: { fontSize: 26, color: "#4F6750" },
  importButton: { backgroundColor: "#FFFFFF", borderRadius: 14, minHeight: 52, flexDirection: "row", gap: 10, alignItems: "center", paddingHorizontal: 16, paddingVertical: 12 },
  importPlus: { color: "#6551D0", fontSize: 24 },
  importLabel: { color: "#5846C0", fontSize: 14, fontWeight: "700", flex: 1 },
  importArrow: { color: "#6551D0", fontSize: 22 },
  heroFootnote: { color: "#E0DAFC", fontSize: 10, textAlign: "center", marginTop: 12, lineHeight: 16 },
  sectionHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 30, marginBottom: 15, gap: 12 },
  sectionTitle: { color: "#2F3047", fontSize: 18, fontWeight: "700", letterSpacing: -0.4, flexShrink: 1 },
  sectionHint: { color: "#8574C4", fontSize: 9, fontWeight: "700", letterSpacing: 1.2 },
  actionList: { borderRadius: 20, paddingHorizontal: 16, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#ECECF4", gap: 2, paddingVertical: 6 },
  action: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 13 },
  actionIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  actionSymbol: { fontSize: 28 },
  actionCopy: { flex: 1, gap: 4 },
  actionTitle: { fontSize: 14, fontWeight: "600", color: "#36364C" },
  actionSubtitle: { fontSize: 12, color: "#838295", lineHeight: 18 },
  chevron: { fontSize: 24, color: "#AAA7BC" },
  count: { backgroundColor: "#EDEBF5", borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  countText: { color: "#7D7697", fontSize: 11, fontWeight: "600" },
  emptyState: { borderWidth: 1, borderStyle: "dashed", borderColor: "#DAD7E9", borderRadius: 20, padding: 24, alignItems: "center", backgroundColor: "#FAFAFD" },
  emptyIcon: { width: 45, height: 49, backgroundColor: "#EFEDF8", borderRadius: 13, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  emptyIconText: { fontSize: 30, color: "#A49AC9" },
  emptyTitle: { fontSize: 15, fontWeight: "600", color: "#515064", textAlign: "center" },
  emptyDescription: { fontSize: 12, lineHeight: 20, textAlign: "center", color: "#858297", maxWidth: 260, marginTop: 8 },
  emptyButton: { minHeight: 44, justifyContent: "center", marginTop: 8 },
  emptyButtonText: { color: "#6D58CA", fontSize: 12, fontWeight: "600", textAlign: "center" },
  footer: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 7, marginTop: 24 },
  footerDot: { width: 4, height: 4, backgroundColor: "#9C91C2", borderRadius: 2 },
  footerText: { fontSize: 10, color: "#9791A9" },
  pressed: { opacity: 0.7 },
  modalBackdrop: { flex: 1, backgroundColor: "#19152C88", alignItems: "center", justifyContent: "center", padding: 24 },
  modalCard: { backgroundColor: "#FFFFFF", padding: 26, borderRadius: 24, width: "100%", maxWidth: 420, gap: 16 },
  modalTitle: { fontSize: 24, lineHeight: 31, fontWeight: "700", color: "#2F3047" },
  modalDescription: { fontSize: 15, lineHeight: 23, color: "#737084" },
  availability: { fontSize: 12, lineHeight: 19, color: "#898397" },
  closeButton: { backgroundColor: "#6251D5", minHeight: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", padding: 12 },
  closeText: { color: "#FFFFFF", fontWeight: "600", fontSize: 14 },
  signOutButton: { minHeight: 48, alignItems: "center", justifyContent: "center", backgroundColor: "#FFF0F0", borderRadius: 12 },
  signOutText: { color: "#AC414B", fontSize: 14, fontWeight: "600" },
  error: { color: "#AC414B", fontSize: 13 },
});
