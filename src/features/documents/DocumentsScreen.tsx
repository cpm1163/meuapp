import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, AppState, FlatList, Linking, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createPatientService, patientError, type PatientListItem } from '@/features/patients/service';
import { createDocumentService, documentError, PAGE_SIZE, type DocumentRecord, type DocumentScope, type DocumentShare } from './service';
import { pickDocument } from './picker';
import { PhotoCapture } from './PhotoCapture';
import { photosToPdf, type Photo } from './photos-pdf';

// With patientId, the screen lists and uploads that patient's documents and `header` replaces the title.
type Props = { userId: string; accessToken: string; initialScope?: DocumentScope; patientId?: string; header?: ReactNode };
const scopeTitles: Record<Exclude<DocumentScope, 'patient'>, string> = { mine: 'Meus documentos', unassigned: 'Sem paciente', shared: 'Compartilhados comigo' };
const emptyTexts: Record<DocumentScope, string> = {
  mine: 'Você ainda não adicionou documentos.', unassigned: 'Nenhum documento sem paciente.',
  shared: 'Nenhum documento compartilhado com você.', patient: 'Nenhum documento deste paciente ainda.',
};
const statuses: Record<DocumentRecord['status'], string> = {
  pending_upload: 'Envio pendente', uploaded: 'Arquivo disponível', processing: 'Processando',
  ready: 'Pronto', failed: 'Processamento falhou', deleting: 'Exclusão pendente',
};

function Action({ title, onPress, disabled = false, danger = false }: { title: string; onPress: () => void; disabled?: boolean; danger?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.button, (pressed || disabled) && styles.dim]}>
    <Text style={[styles.buttonText, danger && styles.danger]}>{title}</Text>
  </Pressable>;
}

export function DocumentsScreen({ userId, accessToken, initialScope, patientId, header: patientHeader }: Props) {
  const service = useMemo(() => createDocumentService(accessToken), [accessToken]);
  const patients = useMemo(() => createPatientService(accessToken), [accessToken]);
  const [scope, setScope] = useState<DocumentScope>(patientId ? 'patient' : initialScope ?? 'mine');
  const [patientAccess, setPatientAccess] = useState({ granted: false, canUse: false });
  const [patientSearch, setPatientSearch] = useState('');
  const [patientResults, setPatientResults] = useState<PatientListItem[] | null>(null);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<DocumentRecord | null>(null);
  const [shares, setShares] = useState<DocumentShare[]>([]);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const mounted = useRef(true);
  const operation = useRef(false);
  const request = useRef(0);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const refresh = useCallback(async () => {
    const version = ++request.current;
    setLoading(true);
    try {
      const rows = await service.list(userId, scope, 0, patientId);
      if (!mounted.current || version !== request.current) return;
      setDocuments(rows); setHasMore(rows.length === PAGE_SIZE);
    } catch (e) {
      if (mounted.current && version === request.current) { setDocuments([]); setHasMore(false); setError(documentError(e)); }
    } finally { if (mounted.current && version === request.current) setLoading(false); }
  }, [patientId, scope, service, userId]);

  useEffect(() => {
    let active = true;
    const version = ++request.current;
    void service.list(userId, scope, 0, patientId).then(rows => {
      if (active && mounted.current && version === request.current) {
        setDocuments(rows); setHasMore(rows.length === PAGE_SIZE); setLoading(false);
      }
    }).catch(e => {
      if (active && mounted.current && version === request.current) {
        setDocuments([]); setHasMore(false); setError(documentError(e)); setLoading(false);
      }
    });
    const listener = AppState.addEventListener('change', state => {
      if (state === 'active') { setSelected(null); setShares([]); void refresh(); }
    });
    return () => { active = false; listener.remove(); };
  }, [refresh, service, userId, scope, patientId]);

  // Display only: the database decides who may link documents to patients.
  useEffect(() => {
    void patients.moduleAccess().then(access => { if (mounted.current) setPatientAccess(access); }).catch(() => {});
  }, [patients]);

  async function run(task: () => Promise<void>) {
    if (operation.current) return;
    operation.current = true; setBusy(true); setError(''); setNotice('');
    try { await task(); }
    catch (e) { if (mounted.current) setError(documentError(e)); }
    finally {
      operation.current = false;
      if (mounted.current) { setBusy(false); await refresh(); }
    }
  }

  function upload() {
    // Invoke the picker synchronously from the press for browser user activation.
    void run(async () => {
      const file = await pickDocument();
      if (!file || !mounted.current) return;
      await service.upload(file.name, file.bytes, patientId);
      if (mounted.current) setNotice('Documento enviado. Toque em “Análise” para pedir a análise do laudo.');
    });
  }

  // One report photographed in several pages becomes one PDF document (docs/compliance.md, "Laudo em várias páginas").
  async function sendPhotos(photos: Photo[]) {
    let sent = false;
    await run(async () => {
      const pdf = await photosToPdf(photos);
      await service.upload(pdf.name, pdf.bytes, patientId);
      sent = true;
      if (mounted.current) setNotice(`Laudo enviado como um documento de ${pdf.pages} página(s). Toque em “Análise” para pedir a análise.`);
    });
    return sent;
  }

  async function loadMore() {
    if (loading || busy || !hasMore) return;
    const version = ++request.current;
    setLoading(true);
    try {
      const rows = await service.list(userId, scope, documents.length, patientId);
      if (!mounted.current || version !== request.current) return;
      setDocuments(previous => [...previous, ...rows.filter(row => !previous.some(old => old.id === row.id))]);
      setHasMore(rows.length === PAGE_SIZE);
    } catch (e) { if (mounted.current && version === request.current) setError(documentError(e)); }
    finally { if (mounted.current && version === request.current) setLoading(false); }
  }

  function manage(document: DocumentRecord) {
    setSelected(document); setName(document.name); setEmail(''); setShares([]); setConfirmDelete(false);
    setPatientSearch(''); setPatientResults(null);
    void run(async () => {
      const rows = await service.shares(document.id);
      if (mounted.current) setShares(rows);
    });
  }

  function findPatients() {
    void run(async () => {
      try {
        const rows = await patients.list(patientSearch);
        if (mounted.current) setPatientResults(rows.slice(0, 5));
      } catch (e) { if (mounted.current) setError(patientError(e)); }
    });
  }

  // Linking needs the module; unlinking is always allowed (docs/exam-comparison.md).
  function linkPatient(patient: { id: string; display_name: string } | null) {
    void run(async () => {
      if (!selected) return;
      try { await patients.setDocumentPatient(selected.id, patient?.id ?? null); }
      catch (e) { if (mounted.current) setError(patientError(e)); return; }
      if (mounted.current) {
        setSelected({ ...selected, patient_id: patient?.id ?? null, patient: patient ? { display_name: patient.display_name } : null });
        setPatientResults(null); setPatientSearch('');
      }
    });
  }

  const tabs: Exclude<DocumentScope, 'patient'>[] = patientAccess.granted ? ['mine', 'unassigned', 'shared'] : ['mine', 'shared'];
  const header = <View style={styles.header}>
    {patientHeader ?? <>
      <Action title="‹ Voltar" onPress={() => router.back()} />
      <Text style={styles.title}>Seus documentos</Text>
      <Text style={styles.subtitle}>Arquivos privados, compartilhados com quem você escolher.</Text>
    </>}
    <Action title={busy ? 'Aguarde…' : '+ Adicionar documento'} onPress={upload} disabled={busy} />
    <Text style={styles.hint}>PDF, PNG ou JPEG · até 10 MB</Text>
    {Platform.OS !== 'web' && <Action title="+ Fotografar laudo" onPress={() => { setError(''); setNotice(''); setCapturing(true); }} disabled={busy} />}
    {!patientId && <View style={styles.tabs}>
      {tabs.map(value => <Pressable key={value} accessibilityRole="tab"
        accessibilityState={{ selected: scope === value, disabled: busy }} disabled={busy} onPress={() => { if (scope !== value) { setDocuments([]); setLoading(true); setError(''); setNotice(''); setScope(value); } }}
        style={[styles.tab, scope === value && styles.activeTab]}><Text style={styles.buttonText}>{scopeTitles[value]}</Text></Pressable>)}
    </View>}
    {!!error && <Text accessibilityRole="alert" style={styles.danger}>{error}</Text>}
    {!!notice && <Text accessibilityLiveRegion="polite" style={styles.subtitle}>{notice}</Text>}
    <Action title="Atualizar lista" onPress={() => { setError(''); void refresh(); }} disabled={busy || loading} />
  </View>;

  return <SafeAreaView style={styles.screen}>
    <FlatList data={documents} keyExtractor={item => item.id} contentContainerStyle={styles.content}
      ListHeaderComponent={header}
      ListEmptyComponent={loading ? <ActivityIndicator accessibilityLabel="Carregando documentos" /> : <Text style={styles.empty}>{emptyTexts[scope]}</Text>}
      ListFooterComponent={documents.length > 0 ? <View>{loading && <ActivityIndicator />}{hasMore && <Action title="Carregar mais" disabled={loading || busy} onPress={() => void loadMore()} />}</View> : null}
      renderItem={({ item }) => <View style={styles.card}>
        <Text style={styles.documentName}>{item.name}</Text>
        {!patientId && !!item.patient && <Text style={styles.hint}>Paciente: {item.patient.display_name}</Text>}
        <Text style={styles.hint}>{statuses[item.status]}{item.size_bytes ? ` · ${(item.size_bytes / 1024 / 1024).toFixed(1)} MB` : ''}</Text>
        <View style={styles.actions}>
          {!['pending_upload', 'deleting'].includes(item.status) && <Action title="Abrir arquivo" disabled={busy} onPress={() => void run(async () => {
            const url = await service.open(item);
            if (mounted.current) await Linking.openURL(url);
          })} />}
          {item.owner_id === userId && ['uploaded', 'processing', 'ready', 'failed'].includes(item.status) &&
            <Action title="Análise" disabled={busy} onPress={() => router.push({ pathname: '/analysis', params: { documentId: item.id } })} />}
          {item.owner_id === userId && <Action title="Gerenciar" disabled={busy} onPress={() => manage(item)} />}
          {item.owner_id !== userId && <Text style={styles.hint}>Acesso de leitura</Text>}
        </View>
      </View>} />

    {capturing && <PhotoCapture busy={busy} sendError={error} onSend={sendPhotos} onClose={() => setCapturing(false)} />}

    <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => { if (!busy) setSelected(null); }}>
      <View style={styles.backdrop}><View accessibilityViewIsModal style={styles.modal}>
        <FlatList data={shares} keyExtractor={item => item.user_id}
          ListHeaderComponent={<View style={styles.modalHeader}>
            <Text style={styles.documentName}>{selected?.name}</Text>
            {!!error && <Text accessibilityRole="alert" style={styles.danger}>{error}</Text>}
            {selected?.status === 'pending_upload' && <Action title="Concluir envio" disabled={busy} onPress={() => void run(async () => {
              await service.complete(selected.id); if (mounted.current) setSelected(null);
            })} />}
            {selected?.status !== 'deleting' && <>
              <TextInput accessibilityLabel="Nome do documento" value={name} onChangeText={setName} maxLength={255} editable={!busy} style={styles.input} />
              <Action title="Salvar nome" disabled={busy || !name.trim()} onPress={() => void run(async () => {
                if (!selected) return; await service.rename(selected.id, name); if (mounted.current) setSelected(null);
              })} />
            </>}
            {selected && selected.status !== 'deleting' && (patientAccess.granted || !!selected.patient_id) && <>
              <Text style={styles.documentName}>Paciente</Text>
              <Text style={styles.subtitle}>{selected.patient ? selected.patient.display_name : 'Sem paciente'}</Text>
              {!!selected.patient_id && <Action title="Desvincular do paciente" disabled={busy} onPress={() => linkPatient(null)} />}
              {patientAccess.canUse && <>
                <TextInput accessibilityLabel="Buscar paciente por nome ou CPF" placeholder="Trocar paciente: nome ou CPF completo" value={patientSearch}
                  onChangeText={setPatientSearch} onSubmitEditing={findPatients} returnKeyType="search" autoCorrect={false} editable={!busy} style={styles.input} />
                <Action title="Buscar paciente" disabled={busy} onPress={findPatients} />
                {patientResults?.length === 0 && <Text style={styles.hint}>Nenhum paciente encontrado. Cadastre-o em “Pacientes”.</Text>}
                {patientResults?.filter(patient => patient.id !== selected.patient_id).map(patient =>
                  <Action key={patient.id} title={`Vincular a ${patient.display_name}`} disabled={busy} onPress={() => linkPatient(patient)} />)}
              </>}
            </>}
            {selected && !['pending_upload','deleting'].includes(selected.status) && <>
              <Text style={styles.documentName}>Compartilhar para leitura</Text>
              <TextInput accessibilityLabel="E-mail da pessoa cadastrada" placeholder="E-mail de uma pessoa cadastrada" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} value={email} onChangeText={setEmail} editable={!busy} style={styles.input} />
              <Action title="Conceder acesso" disabled={busy || !email.trim()} onPress={() => void run(async () => {
                await service.share(selected.id, email);
                const rows = await service.shares(selected.id);
                if (mounted.current) { setShares(rows); setEmail(''); }
              })} />
              <Text style={styles.hint}>Pessoas com acesso</Text>
            </>}
          </View>}
          renderItem={({ item }) => <View style={styles.shareRow}><Text style={styles.subtitle}>{item.email}</Text><Action title="Revogar acesso" danger disabled={busy} onPress={() => void run(async () => {
            if (!selected) return; await service.revoke(selected.id, item.user_id);
            const rows = await service.shares(selected.id); if (mounted.current) setShares(rows);
          })} /></View>}
          ListFooterComponent={<View style={styles.modalHeader}>
            {confirmDelete && <Text style={styles.danger}>Excluir o arquivo e revogar todos os acessos? Esta ação não pode ser desfeita.</Text>}
            <Action title={confirmDelete ? 'Confirmar exclusão' : selected?.status === 'deleting' ? 'Tentar exclusão novamente' : 'Excluir documento'} danger disabled={busy} onPress={() => {
              if (!confirmDelete) { setConfirmDelete(true); return; }
              void run(async () => { if (!selected) return; await service.remove(selected.id); if (mounted.current) setSelected(null); });
            }} />
            <Action title="Fechar" disabled={busy} onPress={() => setSelected(null)} />
          </View>} />
      </View></View>
    </Modal>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F8FC' },
  content: { padding: 24, width: '100%', maxWidth: 720, alignSelf: 'center', gap: 12, paddingBottom: 48 },
  header: { gap: 12, marginBottom: 12 },
  title: { fontSize: 28, fontWeight: '700', color: '#24253D' },
  subtitle: { fontSize: 14, color: '#55546D', lineHeight: 22 },
  hint: { fontSize: 12, color: '#68667D', lineHeight: 19 },
  tabs: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 12 },
  tab: { minHeight: 48, padding: 12, borderRadius: 12, backgroundColor: '#FFF', justifyContent: 'center' },
  activeTab: { backgroundColor: '#E5DFFB', borderWidth: 1, borderColor: '#7965C8' },
  button: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 10, backgroundColor: '#EEEBFA', justifyContent: 'center' },
  buttonText: { fontSize: 14, fontWeight: '600', color: '#55439F' },
  danger: { color: '#B42318', lineHeight: 21 },
  dim: { opacity: 0.5 },
  card: { backgroundColor: '#FFF', borderRadius: 16, padding: 18, gap: 10 },
  documentName: { fontSize: 17, fontWeight: '600', color: '#24253D' },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  empty: { paddingVertical: 32, color: '#68667D', textAlign: 'center', fontSize: 15 },
  backdrop: { flex: 1, backgroundColor: '#24253D88', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modal: { width: '100%', maxWidth: 560, maxHeight: '90%', backgroundColor: '#FFF', padding: 20, borderRadius: 20 },
  modalHeader: { gap: 12 },
  input: { borderWidth: 1, borderColor: '#C8C4DB', borderRadius: 10, padding: 12, minHeight: 48, color: '#24253D' },
  shareRow: { paddingVertical: 12, gap: 6 },
});
