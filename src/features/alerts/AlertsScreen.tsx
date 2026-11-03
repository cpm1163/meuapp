import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Action, styles as ui } from '@/features/modules/ui';
import { formatPrescriptionDate } from '@/features/prescriptions/service';
import { isAllSelected, keepLoaded, selectionNotice, toggleAll, toggleOne, withoutIds } from './selection';
import { alertError, alertTarget, alertTitles, createAlertService, type AlertRecord } from './service';

// The doctor views, deletes one alert or selects several (or all) to delete. Deleting never touches the document.
export function AlertsScreen({ accessToken }: { accessToken: string }) {
  const service = useMemo(() => createAlertService(accessToken), [accessToken]);
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const request = useRef(0);

  const load = useCallback(async () => {
    const version = ++request.current;
    setLoading(true);
    try {
      // The total only feeds a notice, so failing to count must not block the list.
      const [rows, count] = await Promise.all([service.list(), service.count().catch(() => null)]);
      if (version !== request.current) return;
      setAlerts(rows);
      setTotal(count);
      setSelected(previous => keepLoaded(previous, rows.map(row => row.id)));
    } catch (e) { if (version === request.current) setError(alertError(e)); }
    finally { if (version === request.current) setLoading(false); }
  }, [service]);
  // Reloads when returning from the inbox, where linking a document resolves its alert.
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function remove(ids: string[]) {
    setBusy(true); setError(''); setConfirmDelete(false);
    try { await service.remove(ids); setSelected(previous => withoutIds(previous, ids)); }
    catch (e) { setError(alertError(e)); }
    finally { setBusy(false); await load(); }
  }

  function view(alert: AlertRecord) {
    if (!alert.read_at) void service.markRead(alert.id).catch(() => {});
    router.push(alertTarget(alert));
  }

  function toggle(id: string) {
    setConfirmDelete(false);
    setSelected(previous => toggleOne(previous, id));
  }

  const loadedIds = alerts.map(alert => alert.id);
  const allSelected = isAllSelected(selected, loadedIds);
  const notice = selectionNotice(selected.size, alerts.length, total);
  const header = <View style={ui.header}>
    <Action title="‹ Voltar" onPress={() => router.back()} />
    <Text style={ui.title}>Alertas</Text>
    <Text style={ui.subtitle}>O que precisa da sua atenção. Um alerta some sozinho quando a pendência é resolvida.</Text>
    {alerts.length > 0 && <View style={ui.actions}>
      <Action title={allSelected ? 'Desmarcar todos' : 'Marcar todos'} disabled={busy}
        onPress={() => { setConfirmDelete(false); setSelected(previous => toggleAll(previous, loadedIds)); }} />
      {selected.size > 0 && <Action title={confirmDelete ? `Confirmar exclusão de ${selected.size}` : `Excluir selecionados (${selected.size})`} danger disabled={busy}
        onPress={() => { if (confirmDelete) void remove([...selected]); else setConfirmDelete(true); }} />}
      {confirmDelete && <Action title="Não excluir" disabled={busy} onPress={() => setConfirmDelete(false)} />}
    </View>}
    {!!notice && <Text style={ui.hint}>{notice}</Text>}
    {confirmDelete && <Text style={ui.hint}>Só os alertas são excluídos. Os documentos continuam na Caixa de entrada.</Text>}
    {!!error && <Text accessibilityRole="alert" style={ui.danger}>{error}</Text>}
  </View>;

  return <SafeAreaView style={ui.screen}>
    <FlatList data={alerts} keyExtractor={item => item.id} contentContainerStyle={ui.content}
      ListHeaderComponent={header}
      ListEmptyComponent={loading ? <ActivityIndicator accessibilityLabel="Carregando alertas" /> : <Text style={ui.empty}>Nenhum alerta no momento.</Text>}
      renderItem={({ item }) => {
        const checked = selected.has(item.id);
        return <View style={ui.card}>
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked, disabled: busy }} disabled={busy} onPress={() => toggle(item.id)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 }}>
            <Text style={[ui.buttonText, { fontSize: 22 }]}>{checked ? '☑' : '☐'}</Text>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={ui.cardTitle}>{!item.read_at ? '● ' : ''}{alertTitles[item.kind]}</Text>
              <Text style={ui.subtitle} numberOfLines={1}>{item.document?.name ?? 'Documento'}</Text>
              <Text style={ui.hint}>{formatPrescriptionDate(item.created_at)}</Text>
            </View>
          </Pressable>
          <View style={ui.actions}>
            <Action title="Visualizar" disabled={busy} onPress={() => view(item)} />
            <Action title="Excluir" danger disabled={busy} onPress={() => void remove([item.id])} />
          </View>
        </View>;
      }} />
  </SafeAreaView>;
}
