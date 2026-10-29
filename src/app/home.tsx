import { useCallback, useEffect, useMemo, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/providers/auth-provider";
import { supabase } from "@/lib/supabase";
import { createDocumentService } from "@/features/documents/service";
import { createAlertService } from "@/features/alerts/service";
import { createModuleService } from "@/features/modules/service";
import { PatientForm } from "@/features/patients/PatientForm";
import { createPatientService } from "@/features/patients/service";
import { DoctorProfileForm } from "@/features/prescriptions/DoctorProfileForm";
import { createPrescriptionService, type DoctorProfile } from "@/features/prescriptions/service";
import { DevAccountSwitcher } from "@/features/dev/DevAccountSwitcher";

// Home (redesigned 29/10/2026): kept clean, with the patient at the center.
// Search and new patient, plus alerts for what needs the doctor's attention; everything else lives in the account menu.
export default function Home() {
  const { session } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [accountOpen, setAccountOpen] = useState(false);
  const [adminCheck, setAdminCheck] = useState<{ userId: string; value: boolean } | null>(null);
  const [patientsCheck, setPatientsCheck] = useState<{ userId: string; value: boolean; canCreate: boolean } | null>(null);
  const [alerts, setAlerts] = useState<{ userId: string; total: number; unread: number } | null>(null);
  const [inbox, setInbox] = useState<{ userId: string; own: number; shared: number } | null>(null);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  // undefined: closed; otherwise the form is open with the profile loaded (null when there is none yet).
  const [profile, setProfile] = useState<DoctorProfile | null | undefined>(undefined);
  const [profileBusy, setProfileBusy] = useState(false);
  const modules = useMemo(() => session ? createModuleService(session.access_token) : null, [session]);
  const patients = useMemo(() => session ? createPatientService(session.access_token) : null, [session]);
  const documents = useMemo(() => session ? createDocumentService(session.access_token) : null, [session]);
  const alertService = useMemo(() => session ? createAlertService(session.access_token) : null, [session]);
  const prescriptions = useMemo(() => session ? createPrescriptionService(session.access_token) : null, [session]);
  const userId = session?.user.id;

  // Display only: the admin entry is hidden for other accounts and the database rejects non-admins anyway.
  useEffect(() => {
    let active = true;
    if (modules && userId) void modules.isAdmin(userId).then(value => { if (active) setAdminCheck({ userId, value }); }).catch(() => {});
    // Shown to anyone who ever had the module, so an expired grant still reaches the existing records.
    if (patients && userId) void patients.moduleAccess().then(access => {
      if (active) setPatientsCheck({ userId, value: access.granted, canCreate: access.canUse });
    }).catch(() => {});
    return () => { active = false; };
  }, [modules, patients, userId]);
  // A result from a previous account never applies to the current one.
  const isAdmin = !!adminCheck && adminCheck.userId === userId && adminCheck.value;
  const patientsKnown = !!patientsCheck && patientsCheck.userId === userId;
  const hasPatients = patientsKnown && patientsCheck.value;
  const canCreatePatient = hasPatients && patientsCheck.canCreate;
  const alertState = alerts && alerts.userId === userId ? alerts : null;
  const inboxState = inbox && inbox.userId === userId ? inbox : null;
  // With the module the inbox holds the unassigned documents; without it, all of the doctor's documents.
  const inboxScope = hasPatients ? "unassigned" : "mine";

  // Reloads when coming back: linking a document or deleting alerts changes the list (alerts are kept by the database).
  useFocusEffect(useCallback(() => {
    let active = true;
    if (alertService && userId) void Promise.all([alertService.count(), alertService.count(true)]).then(([total, unread]) => {
      if (active) setAlerts({ userId, total, unread });
    }).catch(() => { if (active) setAlerts(null); });
    return () => { active = false; };
  }, [alertService, userId]));
  useFocusEffect(useCallback(() => {
    let active = true;
    if (documents && userId && patientsKnown) void Promise.all([documents.count(userId, inboxScope), documents.count(userId, "shared")]).then(([own, shared]) => {
      if (active) setInbox({ userId, own, shared });
    }).catch(() => { if (active) setInbox(null); });
    return () => { active = false; };
  }, [documents, userId, patientsKnown, inboxScope]));

  function inboxSummary() {
    if (!inboxState) return "Documentos sem paciente e compartilhados com você";
    const parts: string[] = [];
    if (inboxState.own) parts.push(hasPatients ? `${inboxState.own} ${inboxState.own === 1 ? "documento sem paciente" : "documentos sem paciente"}`
      : `${inboxState.own} ${inboxState.own === 1 ? "documento" : "documentos"}`);
    if (inboxState.shared) parts.push(`${inboxState.shared} ${inboxState.shared === 1 ? "compartilhado" : "compartilhados"} com você`);
    return parts.join(" · ") || (hasPatients ? "Nenhum documento pendente" : "Nenhum documento ainda");
  }

  function alertsSummary() {
    if (!alertState) return "O que precisa da sua atenção";
    if (!alertState.total) return "Nenhum alerta no momento";
    const total = `${alertState.total} ${alertState.total === 1 ? "alerta" : "alertas"}`;
    return alertState.unread ? `${total} · ${alertState.unread} ${alertState.unread === 1 ? "não lido" : "não lidos"}` : total;
  }

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

  function findPatient() {
    router.push({ pathname: "/patients", params: search.trim() ? { search: search.trim() } : {} });
  }

  function openMenuRoute(pathname: "/modules" | "/admin") {
    setAccountOpen(false);
    router.push(pathname);
  }

  async function openProfile() {
    if (!prescriptions || profileBusy) return;
    setProfileBusy(true); setError("");
    try { setProfile(await prescriptions.getProfile()); setAccountOpen(false); }
    catch { setError("Não foi possível abrir seus dados. Confira sua conexão e tente novamente."); }
    finally { setProfileBusy(false); }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.greeting} numberOfLines={1}>Olá{name ? `, ${name}` : ""}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Abrir minha conta" onPress={() => setAccountOpen(true)} style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}>
            <Text style={styles.avatarText}>{initial}</Text>
          </Pressable>
        </View>

        {hasPatients && <>
          <View style={styles.search}>
            <Text style={styles.searchIcon}>⌕</Text>
            <TextInput accessibilityLabel="Buscar paciente por nome ou CPF" placeholder="Buscar paciente" placeholderTextColor="#8A889C"
              value={search} onChangeText={setSearch} onSubmitEditing={findPatient} returnKeyType="search" autoCorrect={false}
              style={styles.searchInput} />
          </View>
          <Pressable accessibilityRole="button" onPress={() => router.push("/patients")} style={({ pressed }) => [styles.link, pressed && styles.pressed]}>
            <Text style={styles.linkText}>Ver todos os pacientes ›</Text>
          </Pressable>
          {canCreatePatient && <Pressable accessibilityRole="button" onPress={() => setCreating(true)} style={({ pressed }) => [styles.mainButton, pressed && styles.pressed]}>
            <Text style={styles.mainPlus}>+</Text><Text style={styles.mainLabel}>Novo paciente</Text>
          </Pressable>}
        </>}

        {/* Without the patients module the doctor still has documents, kept in the inbox. */}
        {patientsKnown && !hasPatients && <View style={styles.list}>
          <Row title="Ative o módulo de pacientes" subtitle="Organize documentos, anamnese e receitas por paciente" onPress={() => router.push("/modules")} />
        </View>}

        {/* Always visible: a deleted alert must not leave its document without a way in. */}
        {patientsKnown && <View style={styles.list}>
          <Row title="Caixa de entrada" subtitle={inboxSummary()} onPress={() => router.push({ pathname: "/documents", params: { scope: inboxScope } })} />
        </View>}

        <View style={styles.list}>
          <Row title="Alertas" subtitle={alertsSummary()} dot={alertState?.unread ? true : undefined} onPress={() => router.push("/alerts")} />
        </View>
      </ScrollView>

      {creating && patients && <PatientForm onClose={() => setCreating(false)} onSave={async input => {
        const patient = await patients.create(input);
        router.push({ pathname: "/patient", params: { patientId: patient.id } });
      }} />}
      {profile !== undefined && prescriptions && <DoctorProfileForm profile={profile} onClose={() => setProfile(undefined)}
        onSave={next => prescriptions.saveProfile(next)} />}

      <Modal visible={accountOpen} transparent animationType="fade" onRequestClose={() => setAccountOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View accessibilityViewIsModal style={styles.modalCard}>
            <Text style={styles.eyebrow}>MINHA CONTA</Text>
            <Text style={styles.modalDescription}>{session?.user.email}</Text>
            {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
            <MenuButton title={profileBusy ? "Abrindo…" : "Meus dados"} onPress={() => void openProfile()} disabled={profileBusy} />
            <MenuButton title="Meus módulos" onPress={() => openMenuRoute("/modules")} />
            {isAdmin && <MenuButton title="Administração" onPress={() => openMenuRoute("/admin")} />}
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: loading }} disabled={loading} onPress={signOut} style={({ pressed }) => [styles.signOutButton, pressed && styles.pressed]}><Text style={styles.signOutText}>{loading ? "Saindo…" : "Sair da conta"}</Text></Pressable>
            {!!userId && <DevAccountSwitcher currentUserId={userId} onDone={() => setAccountOpen(false)} />}
            <Pressable accessibilityRole="button" onPress={() => setAccountOpen(false)} style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}><Text style={styles.closeText}>Voltar para home</Text></Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// dot: alerts only; filled while unread.
function Row({ title, subtitle, onPress, dot }: { title: string; subtitle?: string; onPress: () => void; dot?: boolean }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
    {dot !== undefined && <View style={[styles.dot, !dot && styles.dotRead]} />}
    <View style={styles.rowCopy}><Text style={styles.rowTitle}>{title}</Text>{!!subtitle && <Text style={styles.rowSubtitle}>{subtitle}</Text>}</View>
    <Text style={styles.chevron}>›</Text>
  </Pressable>;
}

function MenuButton({ title, onPress, disabled = false }: { title: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.secondaryButton, (pressed || disabled) && styles.pressed]}><Text style={styles.secondaryText}>{title}</Text></Pressable>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F7F8FC" },
  content: { paddingHorizontal: 24, paddingTop: 18, paddingBottom: 28, width: "100%", maxWidth: 680, alignSelf: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 3, borderColor: "#FFFFFF", backgroundColor: "#E9E6F7", alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#6355A2", fontWeight: "700", fontSize: 16 },
  eyebrow: { fontSize: 10, fontWeight: "700", letterSpacing: 1.7, color: "#77758E" },
  greeting: { fontSize: 28, fontWeight: "700", letterSpacing: -1, color: "#24253D", flexShrink: 1 },
  search: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 24, paddingHorizontal: 14, borderRadius: 14, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#DAD6EA" },
  searchIcon: { fontSize: 22, color: "#7667DC" },
  searchInput: { flex: 1, minHeight: 52, fontSize: 16, color: "#24253D" },
  link: { minHeight: 44, justifyContent: "center", alignSelf: "flex-end" },
  linkText: { color: "#6D58CA", fontSize: 13, fontWeight: "600" },
  mainButton: { minHeight: 56, borderRadius: 14, backgroundColor: "#6251D5", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 10, marginTop: 4 },
  mainPlus: { color: "#FFFFFF", fontSize: 22 },
  mainLabel: { color: "#FFFFFF", fontSize: 14, fontWeight: "700", flexShrink: 1 },
  list: { borderRadius: 20, paddingHorizontal: 16, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#ECECF4", paddingVertical: 4, marginTop: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, paddingVertical: 10 },
  rowCopy: { flex: 1, gap: 3 },
  rowTitle: { fontSize: 15, fontWeight: "600", color: "#36364C" },
  rowSubtitle: { fontSize: 12, color: "#838295", lineHeight: 18 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#B42318" },
  dotRead: { backgroundColor: "#DAD6EA" },
  chevron: { fontSize: 24, color: "#AAA7BC" },
  pressed: { opacity: 0.7 },
  modalBackdrop: { flex: 1, backgroundColor: "#19152C88", alignItems: "center", justifyContent: "center", padding: 24 },
  modalCard: { backgroundColor: "#FFFFFF", padding: 26, borderRadius: 24, width: "100%", maxWidth: 420, gap: 16 },
  modalDescription: { fontSize: 15, lineHeight: 23, color: "#737084" },
  closeButton: { backgroundColor: "#6251D5", minHeight: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", padding: 12 },
  closeText: { color: "#FFFFFF", fontWeight: "600", fontSize: 14 },
  secondaryButton: { minHeight: 48, alignItems: "center", justifyContent: "center", backgroundColor: "#EEEBFA", borderRadius: 12 },
  secondaryText: { color: "#55439F", fontSize: 14, fontWeight: "600" },
  signOutButton: { minHeight: 48, alignItems: "center", justifyContent: "center", backgroundColor: "#FFF0F0", borderRadius: 12 },
  signOutText: { color: "#AC414B", fontSize: 14, fontWeight: "600" },
  error: { color: "#AC414B", fontSize: 13 },
});
