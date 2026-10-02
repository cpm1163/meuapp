import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createModuleService, formatDate, moduleError, type MyModule } from './service';
import { MODULE_CONTACT_DRAFT, MODULE_TERMS_DRAFT } from './terms';
import { Action, styles } from './ui';

type Props = { accessToken: string };
const moduleStatuses: Record<MyModule['module_status'], string> = {
  draft: 'Em preparação', testing: 'Em teste', active: 'Disponível', disabled: 'Desativado',
};

function accessLabel(item: MyModule) {
  if (!item.active) return item.expires_at && new Date(item.expires_at) <= new Date() ? 'Liberação vencida' : 'Liberação encerrada';
  return item.expires_at ? `Liberado até ${formatDate(item.expires_at)}` : 'Liberado';
}

export function ModulesScreen({ accessToken }: Props) {
  const service = useMemo(() => createModuleService(accessToken), [accessToken]);
  const [modules, setModules] = useState<MyModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [terms, setTerms] = useState<MyModule | null>(null);
  const mounted = useRef(true);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await service.myModules();
      if (mounted.current) setModules(rows);
    } catch (e) {
      if (mounted.current) { setModules([]); setError(moduleError(e)); }
    } finally { if (mounted.current) setLoading(false); }
  }, [service]);
  useEffect(() => {
    let active = true;
    void service.myModules().then(rows => { if (active) { setModules(rows); setLoading(false); } })
      .catch(e => { if (active) { setModules([]); setError(moduleError(e)); setLoading(false); } });
    return () => { active = false; };
  }, [service]);

  async function accept(item: MyModule) {
    if (busy) return;
    setBusy(true); setError('');
    try {
      await service.acceptTerms(item.module_id);
      if (mounted.current) setTerms(null);
    } catch (e) { if (mounted.current) setError(moduleError(e)); }
    finally { if (mounted.current) { setBusy(false); await refresh(); } }
  }

  const header = <View style={styles.header}>
    <Action title="‹ Voltar" onPress={() => router.back()} />
    <Text style={styles.title}>Meus módulos</Text>
    <Text style={styles.subtitle}>Recursos de análise liberados para a sua conta.</Text>
    {!!error && !terms && <Text accessibilityRole="alert" style={styles.danger}>{error}</Text>}
    <Action title="Atualizar lista" onPress={() => { setError(''); void refresh(); }} disabled={busy || loading} />
  </View>;

  return <SafeAreaView style={styles.screen}>
    <FlatList data={modules} keyExtractor={item => item.module_id} contentContainerStyle={styles.content}
      ListHeaderComponent={header}
      ListEmptyComponent={loading ? <ActivityIndicator accessibilityLabel="Carregando módulos" /> : <View style={styles.card}>
        <Text style={styles.cardTitle}>Nenhum módulo liberado</Text>
        <Text style={styles.subtitle}>{MODULE_CONTACT_DRAFT}</Text>
      </View>}
      renderItem={({ item }) => <View style={styles.card}>
        <Text style={styles.cardTitle}>{item.name}</Text>
        {!!item.description && <Text style={styles.subtitle}>{item.description}</Text>}
        <Text style={item.active ? styles.success : styles.danger}>{accessLabel(item)}</Text>
        <Text style={styles.hint}>Módulo: {moduleStatuses[item.module_status]} · liberado em {formatDate(item.granted_at)}</Text>
        {item.active && (item.terms_accepted
          ? <Text style={styles.hint}>Termos de uso aceitos (versão {item.terms_version}).</Text>
          : <Action title="Ler e aceitar os termos" disabled={busy} onPress={() => { setError(''); setTerms(item); }} />)}
        {item.active && item.module_status !== 'active' && <Text style={styles.hint}>A análise ficará disponível quando o módulo for ativado.</Text>}
      </View>} />

    <Modal visible={!!terms} transparent animationType="fade" onRequestClose={() => { if (!busy) setTerms(null); }}>
      <View style={styles.backdrop}><View accessibilityViewIsModal style={styles.modal}>
        <Text style={styles.cardTitle}>Termos de uso — {terms?.name}</Text>
        <Text style={styles.hint}>Versão {terms?.terms_version}</Text>
        <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ gap: 10 }}>
          {(MODULE_TERMS_DRAFT[terms?.module_id ?? ''] ?? ['Termos indisponíveis para este módulo.']).map(line =>
            <Text key={line} style={styles.subtitle}>{line}</Text>)}
        </ScrollView>
        {!!error && <Text accessibilityRole="alert" style={styles.danger}>{error}</Text>}
        <Action title={busy ? 'Aguarde…' : 'Li e aceito'} disabled={busy || !terms || !MODULE_TERMS_DRAFT[terms.module_id]} onPress={() => { if (terms) void accept(terms); }} />
        <Action title="Agora não" disabled={busy} onPress={() => setTerms(null)} />
      </View></View>
    </Modal>
  </SafeAreaView>;
}
