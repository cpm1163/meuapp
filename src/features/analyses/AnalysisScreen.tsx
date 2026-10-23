import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Dimensions, Keyboard, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Action, styles } from '@/features/modules/ui';
import { createDocumentService, type DocumentRecord } from '@/features/documents/service';
import { createPatientService, patientError } from '@/features/patients/service';
import { analysisError, createAnalysisService, failureText, type Analysis, type AnalysisSummary, type Grouping, type ModuleAccess, type Quota } from './service';
import { buildThemes, themeLines, THEMES_NOTE, type Theme } from '../../../modules/clinical-considerations/grouping';
import { DISCLAIMER, findingDetails, findingTitle, groupFindings, reasonText } from './findings-text';
import { buildReport, formatDate as formatPrinted, searchConsiderations, searchExams, sexAgeText, sexText, STATUS_COLORS, type ReportExam } from './report';
import type { ConsiderationsResult } from '../../../modules/clinical-considerations/considerations';
import { shareReportPdf } from './share-report';
import { CONSIDERATIONS_MODULE, considerationsFor } from './considerations';
import { CONSIDERATIONS_DISCLAIMER } from '../../../modules/clinical-considerations/considerations';

type Props = { documentId: string; accessToken: string };
// A batch usually ends within the hour. Checking costs no AI tokens (it only reads the batch status).
const POLL_MS = 30_000;
const HISTORY_STATUSES: Record<Analysis['status'], string> = { processing: 'em andamento', ready: 'pronta', failed: 'falhou' };
const formatDate = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

function formatElapsed(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  return minutes ? `${minutes} min ${total % 60} s` : `${total} s`;
}

// The batch API reports only "processing" or "ended": the steps say where the analysis is, never a made-up percentage.
const STEP_STATES = {
  done: { text: 'Concluído', color: '#2B8065', background: '#E3F4EE' },
  current: { text: 'Em andamento', color: '#55439F', background: '#EEEBFA' },
  pending: { text: 'Aguardando', color: '#68667D', background: '#F0EFF5' },
};

function Step({ state, label, detail }: { state: 'done' | 'current' | 'pending'; label: string; detail?: string }) {
  const badge = STEP_STATES[state];
  return <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}
    accessibilityLabel={`${label}: ${badge.text}`}>
    <View style={{ width: 24, alignItems: 'center', paddingTop: 1 }}>
      {state === 'current' ? <ActivityIndicator size="small" color="#55439F" />
        : <Text style={{ fontSize: 16, color: state === 'done' ? '#2B8065' : '#B5B2C6' }}>{state === 'done' ? '✓' : '○'}</Text>}
    </View>
    <View style={{ flex: 1, gap: 2 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <Text style={[styles.subtitle, { fontWeight: state === 'current' ? '700' : '500', color: state === 'pending' ? '#8D8AA3' : '#24253D' }]}>{label}</Text>
        <Text style={{ fontSize: 12, fontWeight: '600', color: badge.color, backgroundColor: badge.background,
          paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' }}>{badge.text}</Text>
      </View>
      {!!detail && <Text style={styles.hint}>{detail}</Text>}
    </View>
  </View>;
}

export function AnalysisScreen({ documentId, accessToken }: Props) {
  const analyses = useMemo(() => createAnalysisService(accessToken), [accessToken]);
  const documents = useMemo(() => createDocumentService(accessToken), [accessToken]);
  const patients = useMemo(() => createPatientService(accessToken), [accessToken]);
  const [document, setDocument] = useState<DocumentRecord | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [history, setHistory] = useState<AnalysisSummary[]>([]);
  // An older analysis opened from the history; null shows the latest one.
  const [viewing, setViewing] = useState<Analysis | null>(null);
  const [access, setAccess] = useState<ModuleAccess | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmingSend, setConfirmingSend] = useState(false);
  const [openNotes, setOpenNotes] = useState<number[]>([]);
  const [query, setQuery] = useState('');
  // Android draws edge-to-edge, so the window is not resized for the keyboard: the search bar is lifted by hand to
  // where the keyboard starts. The SafeAreaView already pads the navigation bar, so that inset is discounted.
  const insets = useSafeAreaInsets();
  const [keyboardLift, setKeyboardLift] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', event => setKeyboardLift(
      Math.max(0, Dimensions.get('screen').height - event.endCoordinates.screenY - insets.bottom)));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardLift(0));
    return () => { show.remove(); hide.remove(); };
  }, [insets.bottom]);
  const [considerationsReady, setConsiderationsReady] = useState(false);
  // Keyed by analysis, so a grouping never shows on another analysis while the next one loads.
  const [groupingState, setGroupingState] = useState<{ analysisId: string; value: Grouping | null } | null>(null);
  const [groupingBusy, setGroupingBusy] = useState(false);
  const groupingStarted = useRef(new Set<string>());
  const scroll = useRef<ScrollView>(null);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [lastCheck, setLastCheck] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const mounted = useRef(true);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const fetchAll = useCallback(() => Promise.all([
    documents.get(documentId), analyses.latest(documentId), analyses.access(), analyses.quota(), analyses.history(documentId),
  ]), [analyses, documents, documentId]);
  const apply = useCallback(([doc, latest, moduleAccess, currentQuota, all]: Awaited<ReturnType<typeof fetchAll>>) => {
    setDocument(doc); setAnalysis(latest); setAccess(moduleAccess); setQuota(currentQuota); setHistory(all); setLoading(false);
  }, []);
  const load = useCallback(async () => {
    try {
      const result = await fetchAll();
      if (mounted.current) apply(result);
    } catch (e) {
      if (mounted.current) { setError(analysisError(e)); setLoading(false); }
    }
  }, [apply, fetchAll]);
  // Collects finished batches, then reloads. Collection errors are silent: the next check retries.
  // A successful check clears the error of a failed one (e.g. network still waking up after unlocking the phone).
  const check = useCallback(() => {
    setChecking(true);
    return analyses.collect().catch(() => null).then(fetchAll)
      .then(result => { if (mounted.current) { setError(''); apply(result); } })
      .catch(e => { if (mounted.current) setError(analysisError(e)); })
      .finally(() => { if (mounted.current) { setChecking(false); setLastCheck(Date.now()); } });
  }, [analyses, apply, fetchAll]);

  useEffect(() => {
    let active = true;
    fetchAll().then(result => { if (active) apply(result); })
      .catch(e => { if (active) { setError(analysisError(e)); setLoading(false); } });
    return () => { active = false; };
  }, [apply, fetchAll]);

  const processing = analysis?.status === 'processing';
  useEffect(() => {
    if (!processing) return;
    const first = setTimeout(() => { void check(); }, 0);
    const timer = setInterval(() => { void check(); }, POLL_MS);
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void check(); });
    return () => { clearTimeout(first); clearInterval(timer); listener.remove(); };
  }, [processing, check]);
  // Live clock for the elapsed time and the countdown to the next check.
  useEffect(() => {
    if (!processing) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [processing]);
  const elapsed = analysis && now ? now - new Date(analysis.created_at).getTime() : 0;
  const nextCheck = lastCheck && now ? Math.max(0, Math.ceil((lastCheck + POLL_MS - now) / 1000)) : null;

  async function start() {
    if (busy) return;
    setBusy(true); setError(''); setConfirming(false); setViewing(null);
    try { await analyses.start(documentId); }
    catch (e) { if (mounted.current) setError(analysisError(e)); }
    finally { if (mounted.current) { setBusy(false); await load(); } }
  }

  async function openPrevious(id: string) {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const previous = await analyses.get(id);
      if (mounted.current) setViewing(previous);
    } catch (e) { if (mounted.current) setError(analysisError(e)); }
    finally { if (mounted.current) setBusy(false); }
  }

  async function openOriginal() {
    if (!document || busy) return;
    setBusy(true);
    try { await Linking.openURL(await documents.open(document)); }
    catch (e) { if (mounted.current) setError(analysisError(e)); }
    finally { if (mounted.current) setBusy(false); }
  }

  const shown = viewing ?? analysis;
  const report = useMemo(() => shown?.status === 'ready' && shown.extraction
    ? buildReport(shown.extraction, shown.findings ?? [], document?.patient
      ? { sex: document.patient.sex, birthDate: document.patient.birth_date } : null)
    : null, [shown, document]);
  // Level B: only for accounts with the considerations module granted (testing). Any error hides the section.
  useEffect(() => {
    let active = true;
    analyses.moduleReady(CONSIDERATIONS_MODULE).then(ready => { if (active) setConsiderationsReady(ready); })
      .catch(() => { if (active) setConsiderationsReady(false); });
    return () => { active = false; };
  }, [analyses]);
  const considerations = useMemo(() => considerationsReady && report && shown?.extraction
    ? considerationsFor(shown.extraction, report, document?.patient?.birth_date ?? null) : null,
  [considerationsReady, report, shown, document]);
  // Type 1: the grouping by theme comes with the considerations, without a button. The first time a ready analysis is
  // opened the app asks the server for it; the server calls the AI at most once per analysis and keeps the result.
  const shownId = shown?.status === 'ready' ? shown.id : null;
  useEffect(() => {
    if (!considerationsReady || !shownId) return;
    let active = true;
    void (async () => {
      try {
        let current = await analyses.grouping(shownId);
        if (!current && !groupingStarted.current.has(shownId)) {
          groupingStarted.current.add(shownId);
          if (active) setGroupingBusy(true);
          await analyses.startGrouping(shownId).catch(() => null);
          current = await analyses.grouping(shownId);
        }
        if (active) setGroupingState({ analysisId: shownId, value: current });
      } catch { /* the type 2 considerations still show */ }
      finally { if (active) setGroupingBusy(false); }
    })();
    return () => { active = false; };
  }, [considerationsReady, shownId, analyses]);
  const grouping = groupingState && groupingState.analysisId === shownId ? groupingState.value : null;
  const themes = useMemo(() => report && grouping?.status === 'ready' && grouping.groups
    ? buildThemes(grouping.groups, report.exams.flatMap((exam, examIndex) => exam.rows.map((row, rowIndex) =>
      ({ id: `${examIndex}.${rowIndex}`, name: row.name, value: row.value, status: row.status })))) : null,
  [report, grouping]);
  const searching = !!report && query.trim().length > 0;
  const found = useMemo(() => report && searching ? searchExams(report.exams, query) : [], [report, searching, query]);
  // While typing, the matches are shown from the top of the screen, so they are never hidden further down.
  useEffect(() => { scroll.current?.scrollTo({ y: 0, animated: false }); }, [query]);
  const foundConsiderations = useMemo(() => considerations && searching ? searchConsiderations(considerations, query) : null,
    [considerations, searching, query]);
  const foundCount = found.reduce((total, item) => total + item.exam.rows.length, 0)
    + (foundConsiderations ? foundConsiderations.items.length + foundConsiderations.notCompared.length : 0);

  // Completes only the sex; the other fields are sent back as they are in the record.
  async function fillRecordSex(sex: 'female' | 'male') {
    const patientId = document?.patient_id;
    if (!patientId || busy) return;
    setBusy(true); setError('');
    try {
      const patient = await patients.get(patientId);
      if (!patient) throw new Error('missing');
      await patients.update(patientId, { displayName: patient.display_name, cpf: patient.cpf ?? '', birthDate: patient.birth_date, sex });
      const doc = await documents.get(documentId);
      if (mounted.current) setDocument(doc);
    } catch (e) { if (mounted.current) setError(patientError(e)); }
    finally { if (mounted.current) setBusy(false); }
  }

  async function sendReport() {
    if (!report || !shown || busy) return;
    setBusy(true); setError(''); setConfirmingSend(false);
    try { await shareReportPdf(report, (report.collectedAt || shown.created_at).slice(0, 10), considerations, themes); }
    catch (e) {
      if (mounted.current) setError(e instanceof Error && e.message.startsWith('Este aparelho') ? e.message
        : 'Não foi possível gerar ou enviar o PDF. Tente novamente.');
    }
    finally { if (mounted.current) setBusy(false); }
  }
  function renderConsiderations(section: ConsiderationsResult, sectionThemes: Theme[] | null) {
    return <View style={styles.card}>
      <Text style={styles.cardTitle}>Considerações clínicas</Text>
      <Text style={[styles.hint, { backgroundColor: '#F0EFF5', padding: 8, borderRadius: 8, overflow: 'hidden' }]}>{CONSIDERATIONS_DISCLAIMER}</Text>
      {groupingBusy && <Text style={styles.hint}>Agrupando por tema…</Text>}
      {!!sectionThemes && sectionThemes.length > 0 && <View style={{ gap: 4 }}>
        <Text style={[styles.subtitle, { fontWeight: '700' }]}>Por tema</Text>
        <Text style={styles.hint}>{THEMES_NOTE}</Text>
        {sectionThemes.map((theme, index) => <View key={index} style={{ gap: 2, paddingTop: 6 }}>
          <Text style={[styles.subtitle, { fontWeight: '600' }]}>{theme.title}</Text>
          {themeLines(theme).map(line => <Text key={line} style={styles.subtitle}>{line}</Text>)}
        </View>)}
      </View>}
      <Text style={[styles.subtitle, { fontWeight: '700', paddingTop: 8 }]}>Comparação com diretrizes</Text>
      {section.items.length === 0 && <Text style={styles.subtitle}>Nenhum parâmetro deste laudo tem diretriz selecionada para comparação.</Text>}
      {section.items.map((item, index) => <View key={index} style={{ gap: 2, paddingTop: 8, borderTopWidth: index ? 1 : 0, borderTopColor: '#EEEBFA' }}>
        <Text style={[styles.subtitle, { fontWeight: '600' }]}>{item.title}</Text>
        {item.lines.map((line, lineIndex) => <Text key={lineIndex} style={styles.subtitle}>{line.text} [{line.reference}]</Text>)}
        {item.caveats.map(caveat => <Text key={caveat} style={styles.hint}>{caveat}</Text>)}
      </View>)}
      {section.notCompared.length > 0 && <View style={{ gap: 2, paddingTop: 8 }}>
        <Text style={[styles.subtitle, { fontWeight: '600' }]}>Sem comparação</Text>
        {section.notCompared.map((item, index) => <Text key={index} style={styles.hint}>{item.title}: {item.reason}.</Text>)}
      </View>}
      {section.references.length > 0 && <View style={{ gap: 4, paddingTop: 8 }}>
        <Text style={[styles.subtitle, { fontWeight: '600' }]}>Referências bibliográficas</Text>
        {section.references.map(item => <Text key={item.number} style={styles.hint} accessibilityRole="link"
          onPress={() => void Linking.openURL(item.url)}>{item.number}. {item.text}</Text>)}
      </View>}
    </View>;
  }

  function renderExam(exam: ReportExam, examIndex: number) {
    return <View key={examIndex} style={styles.card}>
      <Text style={styles.cardTitle}>{exam.name}</Text>
      {!!exam.detail && <Text style={styles.hint}>{exam.detail}</Text>}
      {exam.rows.map((row, index) => <View key={index}
        style={{ gap: 2, paddingTop: 8, borderTopWidth: index ? 1 : 0, borderTopColor: '#EEEBFA' }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <Text style={[styles.subtitle, { fontWeight: '600', flexShrink: 1 }]}>{row.name}: {row.value}</Text>
          <Text style={{ fontSize: 12, fontWeight: '600', color: STATUS_COLORS[row.status].text,
            backgroundColor: STATUS_COLORS[row.status].background, paddingHorizontal: 8, paddingVertical: 2,
            borderRadius: 999, overflow: 'hidden' }}>{row.statusText}</Text>
        </View>
        {!!row.reference && <Text style={styles.hint}>Referência: {row.reference}{row.row ? ` (linha: ${row.row})` : ''}</Text>}
        {!!row.labFlag && <Text style={styles.hint}>Marcação do laboratório: {row.labFlag}</Text>}
        {!!row.previous && <Text style={styles.hint}>Anterior: {row.previous}</Text>}
      </View>)}
      {exam.notes.length > 0 && (openNotes.includes(examIndex)
        ? <>{exam.notes.map((note, index) => <Text key={index} style={styles.hint}>{note}</Text>)}
          <Action title="Ocultar notas do laboratório" onPress={() => setOpenNotes(openNotes.filter(item => item !== examIndex))} /></>
        : <Action title={`Notas do laboratório (${exam.notes.length})`} onPress={() => setOpenNotes([...openNotes, examIndex])} />)}
    </View>;
  }

  const canStart = access === 'ready' && document?.owner_id !== undefined && !processing
    && ['uploaded', 'ready', 'failed'].includes(document.status) && (quota?.remaining ?? 0) > 0;

  return <SafeAreaView style={styles.screen}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView ref={scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Action title="‹ Voltar" onPress={() => router.back()} />
        <Text style={styles.title}>Análise do laudo</Text>
        {!!document && <Text style={styles.subtitle}>Exame: {document.name}</Text>}
        {!!document?.patient && <Text style={styles.subtitle}>Paciente: {document.patient.display_name}</Text>}
        {!!document && <View style={styles.actions}>
          {!['pending_upload', 'deleting'].includes(document.status) &&
            <Action title="Abrir exame" disabled={busy} onPress={() => void openOriginal()} />}
          {/* Returns to the patient if it is already in the stack, otherwise replaces this screen with it. */}
          {!!document.patient_id && !!document.patient &&
            <Action title="Ver paciente" disabled={busy} onPress={() => router.dismissTo({ pathname: '/patient', params: { patientId: document.patient_id! } })} />}
        </View>}
        {!!error && <Text accessibilityRole="alert" style={styles.danger}>{error}</Text>}
      </View>

      {loading && <ActivityIndicator accessibilityLabel="Carregando análise" />}

      {!!viewing && <View style={styles.card}>
        <Text style={styles.cardTitle}>Análise anterior, de {formatDate(viewing.created_at)}</Text>
        <Text style={styles.hint}>A análise que vale é a mais recente.</Text>
        <Action title="Ver a mais recente" disabled={busy} onPress={() => setViewing(null)} />
      </View>}

      {!loading && access !== 'ready' && <View style={styles.card}>
        <Text style={styles.subtitle}>{access === 'terms_pending'
          ? 'Para pedir análises, aceite os termos do módulo de análise de exames.'
          : 'O módulo de análise de exames não está liberado para sua conta.'}</Text>
        <Action title="Ver meus módulos" onPress={() => router.push('/modules')} />
      </View>}

      {!loading && !viewing && processing && analysis && <View style={styles.card} accessibilityLiveRegion="polite">
        <Text style={styles.cardTitle}>Análise em andamento{elapsed ? ` · ${formatElapsed(elapsed)}` : ''}</Text>
        <Step state="done" label="Laudo enviado"
          detail={`às ${new Date(analysis.created_at).toLocaleTimeString('pt-BR')}`} />
        <Step state="current" label="Em leitura pela IA"
          detail="Na fila de processamento da Anthropic. A maioria termina em até 1 hora (no máximo 24 horas)." />
        <Step state="pending" label="Pontos de atenção gerados" detail="Conferidos por regras do app, sem interpretação clínica." />
        <Text style={styles.hint}>{checking ? 'Verificando…'
          : lastCheck ? `Verificado às ${new Date(lastCheck).toLocaleTimeString('pt-BR')}${nextCheck !== null ? ` · próxima verificação em ${nextCheck} s` : ''}`
          : 'Verificando…'}</Text>
        <Text style={styles.hint}>Você pode sair desta tela; o resultado fica guardado.</Text>
        <Action title={checking ? 'Verificando…' : 'Verificar agora'} disabled={busy || checking} onPress={() => void check()} />
      </View>}

      {!loading && shown?.status === 'failed' && <View style={styles.card}>
        <Text style={styles.cardTitle}>A análise não foi concluída</Text>
        <Text style={styles.subtitle}>{failureText(shown.failure_reason)}</Text>
      </View>}

      {!loading && searching && <>
        <Text style={styles.cardTitle} accessibilityLiveRegion="polite">{foundCount
          ? `${foundCount} ${foundCount === 1 ? 'resultado' : 'resultados'} para “${query.trim()}”`
          : `Nada encontrado para “${query.trim()}”`}</Text>
        {found.map(({ exam, index }) => renderExam(exam, index))}
        {!!foundConsiderations && renderConsiderations(foundConsiderations, foundConsiderations === considerations ? themes : null)}
      </>}

      {!loading && !searching && shown?.status === 'ready' && report && <>
        {report.recordMismatch.length > 0 && <View style={[styles.card, { backgroundColor: '#FDECEA' }]} accessibilityRole="alert">
          <Text style={[styles.cardTitle, { color: '#B42318' }]}>Confira se este exame é deste paciente</Text>
          {report.recordMismatch.map(line => <Text key={line} style={styles.subtitle}>{line}</Text>)}
          <Text style={styles.hint}>Se o vínculo estiver errado, troque o paciente em “Gerenciar”, na lista de documentos.</Text>
          {!!document?.patient_id && <Action title="Ver paciente" disabled={busy}
            onPress={() => router.dismissTo({ pathname: '/patient', params: { patientId: document.patient_id! } })} />}
        </View>}
        {!!document?.patient_id && (report.recordGaps.sex || report.recordGaps.age !== null) && <View style={styles.card}>
          <Text style={styles.cardTitle}>Completar o cadastro</Text>
          <Text style={styles.subtitle}>O laudo informa {[report.recordGaps.sex ? sexText(report.recordGaps.sex) : null,
            report.recordGaps.age !== null ? `${report.recordGaps.age} anos` : null].filter(Boolean).join(', ')}, e o cadastro do paciente não tem {
            [report.recordGaps.sex ? 'o sexo' : null, report.recordGaps.age !== null ? 'a data de nascimento' : null].filter(Boolean).join(' nem ')}.</Text>
          {!!report.recordGaps.sex && <Action title={`Usar ${sexText(report.recordGaps.sex)} no cadastro`} disabled={busy}
            onPress={() => void fillRecordSex(report.recordGaps.sex!)} />}
          {report.recordGaps.age !== null && <>
            <Text style={styles.hint}>A data de nascimento não vem do laudo: cadastre-a no paciente para o app conferir a idade nos próximos exames.</Text>
            <Action title="Ver paciente" disabled={busy}
              onPress={() => router.dismissTo({ pathname: '/patient', params: { patientId: document.patient_id! } })} />
          </>}
        </View>}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Relatório</Text>
          {!!report.laboratory && <Text style={styles.subtitle}>Laboratório: {report.laboratory}</Text>}
          <Text style={styles.subtitle}>Coleta: {report.collectedAt ? formatPrinted(report.collectedAt) : 'data não impressa'}</Text>
          <Text style={styles.subtitle}>Paciente: {sexAgeText(report)}{report.demographicsSource === 'record' ? ' (do cadastro)' : ''}</Text>
          <Text style={styles.hint}>{DISCLAIMER}</Text>
          {Platform.OS !== 'web' && (confirmingSend ? <>
            <Text style={styles.subtitle}>O PDF sai do app e não pode ser recolhido depois de enviado. Ele não traz nome nem CPF do paciente, só idade e sexo. Confira o destinatário.</Text>
            <View style={styles.actions}>
              <Action title="Gerar e enviar" disabled={busy} onPress={() => void sendReport()} />
              <Action title="Cancelar" disabled={busy} onPress={() => setConfirmingSend(false)} />
            </View>
          </> : <Action title={busy ? 'Aguarde…' : 'Enviar relatório (PDF)'} disabled={busy} onPress={() => setConfirmingSend(true)} />)}
        </View>

        <Text style={styles.cardTitle}>Pontos de atenção</Text>
        {report.highlights.length === 0 && <Text style={styles.empty}>Nenhum ponto de atenção encontrado.</Text>}
        {groupFindings(report.highlights).map(group => <View key={group.kind} style={styles.card}>
          <Text style={styles.cardTitle}>{group.title} ({group.items.length})</Text>
          {group.items.map((finding, index) => <View key={index} style={{ gap: 2, paddingTop: index ? 10 : 0 }}>
            <Text style={[styles.subtitle, { fontWeight: '600' }]}>{findingTitle(finding)}</Text>
            <Text style={styles.subtitle}>{reasonText(finding)}</Text>
            {findingDetails(finding).map(line => <Text key={line} style={styles.hint}>{line}</Text>)}
          </View>)}
        </View>)}

        <Text style={styles.cardTitle}>Resultados por exame</Text>
        {report.exams.map((exam, examIndex) => renderExam(exam, examIndex))}
        {!!considerations && renderConsiderations(considerations, themes)}
        {report.otherExams.length > 0 && <View style={styles.card}>
          <Text style={styles.cardTitle}>Não analisados</Text>
          <Text style={styles.subtitle}>{report.otherExams.join(' · ')}</Text>
        </View>}
      </>}

      {!loading && shown?.status === 'ready' && !report && <>
        <View style={styles.card}>
          <Text style={styles.subtitle}>{DISCLAIMER}</Text>
        </View>
        {(shown.findings ?? []).length === 0 && <Text style={styles.empty}>Nenhum ponto de atenção encontrado.</Text>}
        {groupFindings(shown.findings ?? []).map(group => <View key={group.kind} style={styles.card}>
          <Text style={styles.cardTitle}>{group.title} ({group.items.length})</Text>
          {group.items.map((finding, index) => <View key={index} style={{ gap: 2, paddingTop: index ? 10 : 0 }}>
            <Text style={[styles.subtitle, { fontWeight: '600' }]}>{findingTitle(finding)}</Text>
            <Text style={styles.subtitle}>{reasonText(finding)}</Text>
            {findingDetails(finding).map(line => <Text key={line} style={styles.hint}>{line}</Text>)}
          </View>)}
        </View>)}
      </>}

      {!loading && !searching && history.length > 1 && <View style={styles.card}>
        <Text style={styles.cardTitle}>Análises deste exame ({history.length})</Text>
        {history.map((item, index) => {
          const current = (viewing?.id ?? analysis?.id) === item.id;
          const label = `${formatDate(item.created_at)} · ${HISTORY_STATUSES[item.status]}${index === 0 ? ' · mais recente' : ''}`;
          return current ? <Text key={item.id} style={[styles.subtitle, { fontWeight: '600' }]}>{label} (aberta)</Text>
            : <Action key={item.id} title={label} disabled={busy}
              onPress={() => { if (index === 0) setViewing(null); else void openPrevious(item.id); }} />;
        })}
      </View>}

      {!loading && !searching && !viewing && access === 'ready' && !processing && <View style={styles.card}>
        {quota && <Text style={styles.hint}>{quota.remaining > 0
          ? `Restam ${quota.remaining} de ${quota.daily_limit} análises nas próximas 24 horas.`
          : `Limite diário atingido.${quota.next_available_at ? ` A próxima fica disponível em ${new Date(quota.next_available_at).toLocaleString('pt-BR')}.` : ''}`}</Text>}
        {confirming ? <>
          <Text style={styles.subtitle}>O laudo será enviado ao serviço de IA (Anthropic, processamento fora do Brasil) para transcrição. A análise conta no limite diário e pode levar até 1 hora.</Text>
          <View style={styles.actions}>
            <Action title="Confirmar análise" disabled={busy || !canStart} onPress={() => void start()} />
            <Action title="Cancelar" disabled={busy} onPress={() => setConfirming(false)} />
          </View>
        </> : <Action title={busy ? 'Aguarde…' : analysis ? 'Analisar novamente' : 'Analisar laudo'} disabled={busy || !canStart}
          onPress={() => setConfirming(true)} />}
      </View>}
    </ScrollView>
    {!loading && !!report && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16,
      paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#E4E1F0', backgroundColor: '#FFF', marginBottom: keyboardLift }}>
      <TextInput accessibilityLabel="Buscar parâmetro ou exame" placeholder="Buscar parâmetro ou exame" placeholderTextColor="#8D8AA3"
        value={query} onChangeText={setQuery} autoCorrect={false} autoCapitalize="none" returnKeyType="search"
        style={[styles.input, { flex: 1 }]} />
      {!!query && <Pressable accessibilityRole="button" accessibilityLabel="Limpar busca" onPress={() => setQuery('')}
        hitSlop={8} style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 18, color: '#55439F' }}>✕</Text>
      </Pressable>}
    </View>}
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
