import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { addAnotherAccount, devAccountSwitcherEnabled, forgetAccount, listSavedAccounts, switchToAccount, type SavedAccount } from './account-switcher';

type Props = { currentUserId: string; onDone: () => void };

// Rendered only in development builds (__DEV__). See account-switcher.ts.
export function DevAccountSwitcher({ currentUserId, onDone }: Props) {
  const [accounts, setAccounts] = useState<SavedAccount[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void listSavedAccounts().then(rows => { if (active) setAccounts(rows); }).catch(() => {});
    return () => { active = false; };
  }, [currentUserId]);

  if (!devAccountSwitcherEnabled) return null;

  async function run(task: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError('');
    try { await task(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível trocar de conta.'); setAccounts(await listSavedAccounts()); }
    finally { setBusy(false); }
  }

  const others = accounts.filter(account => account.userId !== currentUserId);
  return <View style={styles.box}>
    <Text style={styles.title}>TROCAR CONTA (DESENVOLVIMENTO)</Text>
    <Text style={styles.hint}>Visível só no app de desenvolvimento. Contas que já entraram neste aparelho.</Text>
    {others.length === 0 && <Text style={styles.hint}>Nenhuma outra conta salva. Use “Adicionar outra conta”.</Text>}
    {others.map(account => <View key={account.userId} style={styles.row}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Entrar como ${account.email}`} disabled={busy}
        onPress={() => void run(async () => { await switchToAccount(account.userId); onDone(); })}
        style={({ pressed }) => [styles.button, styles.grow, (pressed || busy) && styles.dim]}>
        <Text style={styles.buttonText} numberOfLines={1}>Entrar como {account.email}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Remover ${account.email} da lista`} disabled={busy}
        onPress={() => void run(async () => { await forgetAccount(account.userId); setAccounts(await listSavedAccounts()); })}
        style={({ pressed }) => [styles.button, (pressed || busy) && styles.dim]}>
        <Text style={styles.remove}>Remover</Text>
      </Pressable>
    </View>)}
    <Pressable accessibilityRole="button" disabled={busy} onPress={() => void run(async () => { await addAnotherAccount(); onDone(); })}
      style={({ pressed }) => [styles.button, (pressed || busy) && styles.dim]}>
      <Text style={styles.buttonText}>+ Adicionar outra conta</Text>
    </Pressable>
    {!!error && <Text accessibilityRole="alert" style={styles.remove}>{error}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderStyle: 'dashed', borderColor: '#C9A227', backgroundColor: '#FFFBEA', borderRadius: 12, padding: 12, gap: 8 },
  title: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, color: '#7A5D00' },
  hint: { fontSize: 12, color: '#6B5B2A', lineHeight: 18 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  grow: { flex: 1 },
  button: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E7D9A3', justifyContent: 'center' },
  buttonText: { fontSize: 13, fontWeight: '600', color: '#55439F' },
  remove: { fontSize: 13, fontWeight: '600', color: '#B42318' },
  dim: { opacity: 0.5 },
});
