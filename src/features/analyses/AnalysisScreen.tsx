import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Action, styles } from '@/features/modules/ui';
import { createDocumentService, type DocumentRecord } from '@/features/documents/service';
import { analysisError, createAnalysisService, failureText, type Analysis, type ModuleAccess, type Quota } from './service';
import { DISCLAIMER, findingDetails, findingTitle, groupFindings, reasonText } from './findings-text';

type Props = { documentId: string; accessToken: string };
// A batch usually ends within the hour. Checking costs no AI tokens (it only reads the batch status).
const POLL_MS = 30_000;

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
  const [document, setDocument] = useState<DocumentRecord | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [access, setAccess] = useState<ModuleAccess | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [lastCheck, setLastCheck] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const mounted = useRef(true);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const fetchAll = useCallback(() => Promise.all([
    documents.get(documentId), analyses.latest(documentId), analyses.access(), analyses.quota(),
  ]), [analyses, documents, documentId]);
  const apply = useCallback(([doc, latest, moduleAccess, currentQuota]: Awaited<ReturnType<typeof fetchAll>>) => {
    setDocument(doc); setAnalysis(latest); setAccess(moduleAccess); setQuota(currentQuota); setLoading(false);
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
  const check = useCallback(() => {
    setChecking(true);
    return analyses.collect().catch(() => null).then(fetchAll)
      .then(result => { if (mounted.current) apply(result); })
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
    setBusy(true); setError(''); setConfirming(false);
    try { await analyses.start(documentId); }
    catch (e) { if (mounted.current) setError(analysisError(e)); }
    finally { if (mounted.current) { setBusy(false); await load(); } }
  }

  async function openOriginal() {
    if (!document || busy) return;
    setBusy(true);
    try { await Linking.openURL(await documents.open(document)); }
    catch (e) { if (mounted.current) setError(analysisError(e)); }
    finally { if (mounted.current) setBusy(false); }
  }

  const canStart = access === 'ready' && document?.owner_id !== undefined && !processing
    && ['uploaded', 'ready', 'failed'].includes(document.status) && (quota?.remaining ?? 0) > 0;

  return <SafeAreaView style={styles.screen}>
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Action title="‹ Voltar" onPress={() => router.back()} />
        <Text style={styles.title}>Análise do laudo</Text>
        {!!document && <Text style={styles.subtitle}>{document.name}</Text>}
        {!!error && <Text accessibilityRole="alert" style={styles.danger}>{error}</Text>}
      </View>

      {loading && <ActivityIndicator accessibilityLabel="Carregando análise" />}

      {!loading && access !== 'ready' && <View style={styles.card}>
        <Text style={styles.subtitle}>{access === 'terms_pending'
          ? 'Para pedir análises, aceite os termos do módulo de análise de exames.'
          : 'O módulo de análise de exames não está liberado para sua conta.'}</Text>
        <Action title="Ver meus módulos" onPress={() => router.push('/modules')} />
      </View>}

      {!loading && processing && analysis && <View style={styles.card} accessibilityLiveRegion="polite">
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

      {!loading && analysis?.status === 'failed' && <View style={styles.card}>
        <Text style={styles.cardTitle}>A análise não foi concluída</Text>
        <Text style={styles.subtitle}>{failureText(analysis.failure_reason)}</Text>
      </View>}

      {!loading && analysis?.status === 'ready' && <>
        <View style={styles.card}>
          <Text style={styles.subtitle}>{DISCLAIMER}</Text>
          <Action title="Abrir laudo original" disabled={busy} onPress={() => void openOriginal()} />
        </View>
        {(analysis.findings ?? []).length === 0 && <Text style={styles.empty}>Nenhum ponto de atenção encontrado.</Text>}
        {groupFindings(analysis.findings ?? []).map(group => <View key={group.kind} style={styles.card}>
          <Text style={styles.cardTitle}>{group.title} ({group.items.length})</Text>
          {group.items.map((finding, index) => <View key={index} style={{ gap: 2, paddingTop: index ? 10 : 0 }}>
            <Text style={[styles.subtitle, { fontWeight: '600' }]}>{findingTitle(finding)}</Text>
            <Text style={styles.subtitle}>{reasonText(finding)}</Text>
            {findingDetails(finding).map(line => <Text key={line} style={styles.hint}>{line}</Text>)}
          </View>)}
        </View>)}
      </>}

      {!loading && access === 'ready' && !processing && <View style={styles.card}>
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
  </SafeAreaView>;
}
