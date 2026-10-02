import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { validateEmail } from '@/utils/validation';
import { createModuleService, formatDate, moduleError, type CatalogModule, type FoundUser, type ModuleGrant } from './service';
import { Action, styles } from './ui';

type Props = { userId: string; accessToken: string };

function grantLabel(grant: ModuleGrant) {
  if (grant.active) return grant.expires_at ? `Ativa até ${formatDate(grant.expires_at)}` : 'Ativa';
  if (grant.revoked_at) return `Revogada em ${formatDate(grant.revoked_at)}`;
  return 'Vencida';
}

export function AdminScreen({ userId, accessToken }: Props) {
  const service = useMemo(() => createModuleService(accessToken), [accessToken]);
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [catalog, setCatalog] = useState<CatalogModule[]>([]);
  const [email, setEmail] = useState('');
  const [found, setFound] = useState<FoundUser | null>(null);
  const [searched, setSearched] = useState(false);
  const [grants, setGrants] = useState<ModuleGrant[]>([]);
  const [moduleId, setModuleId] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    void (async () => {
      try {
        const isAdmin = await service.isAdmin(userId);
        if (!mounted.current) return;
        setAdmin(isAdmin);
        if (isAdmin) {
          const rows = await service.catalog();
          if (mounted.current) { setCatalog(rows); setModuleId(rows.find(row => row.status !== 'disabled')?.id ?? ''); }
        }
      } catch (e) { if (mounted.current) { setAdmin(false); setError(moduleError(e)); } }
    })();
    return () => { mounted.current = false; };
  }, [service, userId]);

  async function run(task: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try { await task(); }
    catch (e) { if (mounted.current) setError(moduleError(e)); }
    finally { if (mounted.current) setBusy(false); }
  }

  async function reloadGrants(target: FoundUser) {
    const rows = await service.grantsFor(target.user_id);
    if (mounted.current) setGrants(rows);
  }

  function search() {
    const invalid = validateEmail(email);
    if (invalid) { setError(invalid); return; }
    void run(async () => {
      const user = await service.findUser(email);
      if (!mounted.current) return;
      setFound(user); setSearched(true); setGrants([]); setNote(''); setConfirmRevoke(null);
      if (user) await reloadGrants(user);
    });
  }

  if (admin === null) return <SafeAreaView style={styles.screen}><View style={styles.content}><ActivityIndicator accessibilityLabel="Verificando acesso" /></View></SafeAreaView>;
  if (!admin) return <SafeAreaView style={styles.screen}><View style={styles.content}>
    <Action title="‹ Voltar" onPress={() => router.back()} />
    <Text style={styles.title}>Acesso restrito</Text>
    <Text style={styles.subtitle}>Esta área é exclusiva para administradores.</Text>
    {!!error && <Text accessibilityRole="alert" style={styles.danger}>{error}</Text>}
  </View></SafeAreaView>;

  const hasActive = grants.some(grant => grant.active && grant.module_id === moduleId);
  return <SafeAreaView style={styles.screen}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Action title="‹ Voltar" onPress={() => router.back()} />
        <Text style={styles.title}>Administração</Text>
        <Text style={styles.subtitle}>Liberação de módulos contratados. Os documentos das contas não ficam visíveis aqui.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Buscar conta</Text>
        <TextInput accessibilityLabel="E-mail da conta" placeholder="E-mail exato da conta" keyboardType="email-address" autoCapitalize="none" autoCorrect={false}
          value={email} onChangeText={text => { setEmail(text); setSearched(false); setFound(null); setGrants([]); }} editable={!busy} onSubmitEditing={search} style={styles.input} />
        <Action title={busy ? 'Aguarde…' : 'Buscar'} disabled={busy || !email.trim()} onPress={search} />
        {searched && !found && <Text style={styles.hint}>Nenhuma conta encontrada com este e-mail.</Text>}
      </View>

      {!!error && <Text accessibilityRole="alert" style={styles.danger}>{error}</Text>}
      {!!notice && <Text accessibilityLiveRegion="polite" style={styles.success}>{notice}</Text>}

      {found && <View style={styles.card}>
        <Text style={styles.cardTitle}>{found.email}</Text>
        <Text style={styles.hint}>Liberações</Text>
        {grants.length === 0 && <Text style={styles.subtitle}>Nenhum módulo liberado para esta conta.</Text>}
        {grants.map(grant => <View key={grant.grant_id} style={{ gap: 6, paddingVertical: 6 }}>
          <Text style={styles.subtitle}>{catalog.find(row => row.id === grant.module_id)?.name ?? grant.module_id}</Text>
          <Text style={grant.active ? styles.success : styles.hint}>{grantLabel(grant)} · liberado em {formatDate(grant.granted_at)}</Text>
          {!!grant.note && <Text style={styles.hint}>Nota: {grant.note}</Text>}
          {grant.active && confirmRevoke !== grant.grant_id && <Action title="Revogar liberação" danger disabled={busy} onPress={() => { setError(''); setNotice(''); setConfirmRevoke(grant.grant_id); }} />}
          {grant.active && confirmRevoke === grant.grant_id && <>
            <Text accessibilityRole="alert" style={styles.danger}>Revogar o acesso de {found.email} a este módulo? A conta deixa de poder fazer novas análises. O histórico é mantido.</Text>
            <View style={styles.actions}>
              <Action title={busy ? 'Aguarde…' : 'Confirmar revogação'} danger disabled={busy} onPress={() => void run(async () => {
                await service.revoke(grant.grant_id);
                if (mounted.current) { setConfirmRevoke(null); setNotice('Liberação revogada.'); }
                await reloadGrants(found);
              })} />
              <Action title="Cancelar" disabled={busy} onPress={() => setConfirmRevoke(null)} />
            </View>
          </>}
        </View>)}

        <Text style={styles.cardTitle}>Liberar módulo</Text>
        <View style={styles.chips}>
          {catalog.filter(row => row.status !== 'disabled').map(row => <Pressable key={row.id} accessibilityRole="radio"
            accessibilityState={{ selected: moduleId === row.id, disabled: busy }} disabled={busy} onPress={() => setModuleId(row.id)}
            style={[styles.chip, moduleId === row.id && styles.activeChip]}><Text style={styles.buttonText}>{row.name}</Text></Pressable>)}
        </View>
        <TextInput accessibilityLabel="Nota interna da contratação" placeholder="Nota interna (opcional, sem dados de pagamento)" value={note} onChangeText={setNote}
          maxLength={500} editable={!busy} style={styles.input} />
        {hasActive
          ? <Text style={styles.hint}>Esta conta já tem este módulo ativo.</Text>
          : <Action title={busy ? 'Aguarde…' : 'Liberar módulo'} disabled={busy || !moduleId} onPress={() => void run(async () => {
            await service.grant(found.user_id, moduleId, note);
            if (mounted.current) { setNote(''); setNotice('Módulo liberado.'); }
            await reloadGrants(found);
          })} />}
      </View>}
    </ScrollView>
  </SafeAreaView>;
}
