import { useCallback, useEffect, useMemo, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/providers/auth-provider";
import { supabase } from "@/lib/supabase";
import { createModuleService } from "@/features/modules/service";
import { PatientForm } from "@/features/patients/PatientForm";
import { createPatientService, type PatientListItem } from "@/features/patients/service";
import { DoctorProfileForm } from "@/features/prescriptions/DoctorProfileForm";
import { createPrescriptionService, formatPrescriptionDate, type DoctorProfile } from "@/features/prescriptions/service";
import { DevAccountSwitcher } from "@/features/dev/DevAccountSwitcher";

const RECENT_PATIENTS = 5;

// Home (redesigned 28/10/2026): the doctor reaches the patient of the moment in one or two taps.
// Search, new patient and recent patients for accounts with the patients module; documents for everyone.
export default function Home() {
  const { session } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [accountOpen, setAccountOpen] = useState(false);
  const [adminCheck, setAdminCheck] = useState<{ userId: string; value: boolean } | null>(null);
  const [patientsCheck, setPatientsCheck] = useState<{ userId: string; value: boolean; canCreate: boolean } | null>(null);
  const [recent, setRecent] = useState<{ userId: string; rows: PatientListItem[] } | null>(null);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  // undefined: closed; otherwise the form is open with the profile loaded (null when there is none yet).
  const [profile, setProfile] = useState<DoctorProfile | null | undefined>(undefined);
  const [profileBusy, setProfileBusy] = useState(false);
  const modules = useMemo(() => session ? createModuleService(session.access_token) : null, [session]);
  const patients = useMemo(() => session ? createPatientService(session.access_token) : null, [session]);
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
  const hasPatients = !!patientsCheck && patientsCheck.userId === userId && patientsCheck.value;
  const canCreatePatient = hasPatients && !!patientsCheck?.canCreate;
  const recentRows = recent && recent.userId === userId ? recent.rows : null;

  // Reloads when coming back from a patient, whose activity may have changed.
  useFocusEffect(useCallback(() => {
    let active = true;
    if (hasPatients && patients && userId) void patients.list().then(rows => {
      if (active) setRecent({ userId, rows: rows.slice(0, RECENT_PATIENTS) });
    }).catch(() => { if (active) setRecent({ userId, rows: [] }); });
    return () => { active = false; };
  }, [hasPatients, patients, userId]));

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

  async function openProfile() {
    if (!prescriptions || profileBusy) return;
    setProfileBusy(true); setError(""); setAccountOpen(false);
    try { setProfile(await prescriptions.getProfile()); }
    catch { setError("Não foi possível abrir seus dados. Confira sua conexão e tente novamente."); }
    finally { setProfileBusy(false); }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.greeting} numberOfLines={1}>Olá{name ? `, ${name}` : ""}</Text>
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

        {hasPatients && <View style={styles.search}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput accessibilityLabel="Buscar paciente por nome ou CPF" placeholder="Buscar paciente" placeholderTextColor="#8A889C"
            value={search} onChangeText={setSearch} onSubmitEditing={findPatient} returnKeyType="search" autoCorrect={false}
            style={styles.searchInput} />
        </View>}

        <View style={styles.mainActions}>
          {canCreatePatient && <Pressable accessibilityRole="button" onPress={() => setCreating(true)} style={({ pressed }) => [styles.mainButton, pressed && styles.pressed]}>
            <Text style={styles.mainPlus}>+</Text><Text style={styles.mainLabel}>Novo paciente</Text>
          </Pressable>}
          <Pressable accessibilityRole="button" onPress={() => router.push("/documents")}
            style={({ pressed }) => [styles.mainButton, !canCreatePatient && styles.mainButtonOnly, pressed && styles.pressed]}>
            <Text style={styles.mainPlus}>+</Text><Text style={styles.mainLabel}>Adicionar documento</Text>
          </Pressable>
        </View>

        {hasPatients && <>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>Pacientes recentes</Text>
            <Pressable accessibilityRole="button" onPress={() => router.push("/patients")} style={({ pressed }) => [styles.link, pressed && styles.pressed]}>
              <Text style={styles.linkText}>Ver todos ›</Text>
            </Pressable>
          </View>
          <View style={styles.list}>
            {recentRows === null ? <ActivityIndicator accessibilityLabel="Carregando pacientes recentes" style={styles.listEmpty} />
              : recentRows.length === 0 ? <Text style={styles.listEmptyText}>Nenhum paciente cadastrado ainda.</Text>
              : recentRows.map(patient => <Pressable key={patient.id} accessibilityRole="button"
                onPress={() => router.push({ pathname: "/patient", params: { patientId: patient.id } })} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
                <Text style={styles.rowTitle} numberOfLines={1}>{patient.display_name}</Text>
                <Text style={styles.rowHint}>{formatPrescriptionDate(patient.last_activity_at)}</Text>
                <Text style={styles.chevron}>›</Text>
              </Pressable>)}
          </View>
        </>}

        <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Atalhos</Text></View>
        <View style={styles.list}>
          <Shortcut title="Todos os documentos" subtitle="De todos os pacientes, sem paciente e compartilhados" onPress={() => router.push("/documents")} />
          <Shortcut title="Meus dados" subtitle="CRM, telefone, endereço e o que sai na receita" onPress={() => void openProfile()} busy={profileBusy} />
          <Shortcut title="Meus módulos" subtitle="Recursos liberados para você" onPress={() => router.push("/modules")} />
          {isAdmin && <Shortcut title="Administração" subtitle="Liberar módulos para contas" onPress={() => router.push("/admin")} />}
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
            <Pressable accessibilityRole="button" onPress={() => void openProfile()} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}><Text style={styles.secondaryText}>Meus dados</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: loading }} disabled={loading} onPress={signOut} style={({ pressed }) => [styles.signOutButton, pressed && styles.pressed]}><Text style={styles.signOutText}>{loading ? "Saindo…" : "Sair da conta"}</Text></Pressable>
            {!!userId && <DevAccountSwitcher currentUserId={userId} onDone={() => setAccountOpen(false)} />}
            <Pressable accessibilityRole="button" onPress={() => setAccountOpen(false)} style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}><Text style={styles.closeText}>Voltar para home</Text></Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Shortcut({ title, subtitle, onPress, busy = false }: { title: string; subtitle: string; onPress: () => void; busy?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ busy }} disabled={busy} onPress={onPress} style={({ pressed }) => [styles.row, (pressed || busy) && styles.pressed]}>
    <View style={styles.rowCopy}><Text style={styles.rowTitle}>{title}</Text><Text style={styles.rowSubtitle}>{subtitle}</Text></View>
    <Text style={styles.chevron}>›</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F7F8FC" },
  content: { paddingHorizontal: 24, paddingTop: 18, paddingBottom: 28, width: "100%", maxWidth: 680, alignSelf: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerSignOut: { minHeight: 44, minWidth: 48, paddingHorizontal: 10, paddingVertical: 10, borderRadius: 12, backgroundColor: "#EEEBFA", alignItems: "center", justifyContent: "center" },
  headerSignOutText: { color: "#6452B4", fontSize: 13, fontWeight: "600" },
  headerError: { marginTop: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 3, borderColor: "#FFFFFF", backgroundColor: "#E9E6F7", alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#6355A2", fontWeight: "700", fontSize: 16 },
  eyebrow: { fontSize: 10, fontWeight: "700", letterSpacing: 1.7, color: "#77758E" },
  greeting: { fontSize: 28, fontWeight: "700", letterSpacing: -1, color: "#24253D", flexShrink: 1 },
  search: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 24, paddingHorizontal: 14, borderRadius: 14, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#DAD6EA" },
  searchIcon: { fontSize: 22, color: "#7667DC" },
  searchInput: { flex: 1, minHeight: 52, fontSize: 16, color: "#24253D" },
  mainActions: { flexDirection: "row", gap: 10, marginTop: 14 },
  mainButton: { flex: 1, minHeight: 56, borderRadius: 14, backgroundColor: "#6251D5", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 10 },
  mainButtonOnly: { minHeight: 64 },
  mainPlus: { color: "#FFFFFF", fontSize: 22 },
  mainLabel: { color: "#FFFFFF", fontSize: 14, fontWeight: "700", flexShrink: 1 },
  sectionHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 28, marginBottom: 12, gap: 12 },
  sectionTitle: { color: "#2F3047", fontSize: 18, fontWeight: "700", letterSpacing: -0.4, flexShrink: 1 },
  link: { minHeight: 44, justifyContent: "center" },
  linkText: { color: "#6D58CA", fontSize: 13, fontWeight: "600" },
  list: { borderRadius: 20, paddingHorizontal: 16, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#ECECF4", paddingVertical: 4 },
  listEmpty: { paddingVertical: 20 },
  listEmptyText: { paddingVertical: 20, textAlign: "center", color: "#858297", fontSize: 13 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, paddingVertical: 10 },
  rowCopy: { flex: 1, gap: 3 },
  rowTitle: { flex: 1, fontSize: 15, fontWeight: "600", color: "#36364C" },
  rowSubtitle: { fontSize: 12, color: "#838295", lineHeight: 18 },
  rowHint: { fontSize: 12, color: "#838295" },
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
