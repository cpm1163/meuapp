import { useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Action, styles as ui } from '@/features/modules/ui';
import { createPatientChatService, type ChatReply } from './service';

// Test only: the person reads a fixed reply or the literal text of a KB item, never text written by the AI.
// Only the last exchange is shown: each question stands alone, and a history would suggest the chat remembers.
export function PatientChatScreen({ accessToken }: { accessToken: string }) {
  const service = useMemo(() => createPatientChatService(accessToken), [accessToken]);
  const [question, setQuestion] = useState('');
  const [asked, setAsked] = useState('');
  const [reply, setReply] = useState<ChatReply | null>(null);
  const [busy, setBusy] = useState(false);
  const canSend = !busy && !!question.trim();

  async function send() {
    const text = question.trim();
    if (!text || busy) return;
    setBusy(true); setReply(null); setAsked(text); setQuestion('');
    setReply(await service.ask(text));
    setBusy(false);
  }

  return <SafeAreaView style={ui.screen}>
    <KeyboardAvoidingView behavior="padding" style={styles.fill}>
      {/* Outside the scroll area, so the warning stays visible over a long reply. */}
      <View style={styles.top}>
        <View style={styles.titleRow}>
          <Action title="‹ Voltar" onPress={() => router.back()} />
          <Text style={styles.title}>Chat de teste</Text>
        </View>
        <Text accessibilityRole="alert" style={styles.warning}>FICTÍCIO – SOMENTE TESTE – NÃO USAR COM PACIENTES. As respostas contêm informações falsas de propósito.</Text>
      </View>

      <ScrollView style={styles.fill} contentContainerStyle={styles.conversation} keyboardShouldPersistTaps="handled">
        {!asked && <Text style={ui.empty}>Escreva uma pergunta para começar. Cada pergunta é tratada sozinha: o chat não lembra das anteriores.</Text>}
        {!!asked && <View style={[styles.bubble, styles.asked]}><Text style={styles.bubbleText}>{asked}</Text></View>}
        {busy && <ActivityIndicator style={styles.waiting} accessibilityLabel="Aguardando a resposta" />}
        {!!reply && <View style={[styles.bubble, styles.reply]}>
          <Text style={styles.bubbleText}>{reply.text}</Text>
          {reply.item !== null && <Text style={ui.hint}>Fonte: item {reply.item} da base de teste</Text>}
        </View>}
      </ScrollView>

      <View style={styles.composer}>
        <TextInput style={[ui.input, styles.field]} multiline value={question} onChangeText={setQuestion} editable={!busy}
          placeholder="Escreva sua pergunta" placeholderTextColor="#68667D" accessibilityLabel="Pergunta" />
        <Pressable accessibilityRole="button" accessibilityLabel="Enviar" accessibilityState={{ disabled: !canSend }} disabled={!canSend}
          onPress={() => void send()} style={({ pressed }) => [styles.send, (pressed || !canSend) && ui.dim]}>
          <Text style={styles.sendText}>➤</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const column = { width: '100%', maxWidth: 720, alignSelf: 'center' } as const;

const styles = StyleSheet.create({
  fill: { flex: 1 },
  top: { ...column, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, gap: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { flex: 1, fontSize: 20, fontWeight: '700', color: '#24253D' },
  warning: { backgroundColor: '#FDECEA', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, color: '#B42318', fontSize: 13, fontWeight: '600', lineHeight: 19 },
  conversation: { ...column, flexGrow: 1, padding: 16, gap: 12 },
  bubble: { maxWidth: '85%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, gap: 6 },
  asked: { alignSelf: 'flex-end', backgroundColor: '#E5DFFB' },
  reply: { alignSelf: 'flex-start', backgroundColor: '#FFF' },
  bubbleText: { fontSize: 15, lineHeight: 22, color: '#24253D' },
  waiting: { alignSelf: 'flex-start', marginLeft: 8 },
  composer: { ...column, flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  field: { flex: 1, maxHeight: 120 },
  send: { width: 48, height: 48, borderRadius: 10, backgroundColor: '#55439F', alignItems: 'center', justifyContent: 'center' },
  sendText: { fontSize: 18, color: '#FFF' },
});
