import { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Action, styles as ui } from '@/features/modules/ui';
import { createPatientChatService, type ChatReply } from './service';

// Test only: the person reads a fixed reply or the literal text of a KB item, never text written by the AI.
export function PatientChatScreen({ accessToken }: { accessToken: string }) {
  const service = useMemo(() => createPatientChatService(accessToken), [accessToken]);
  const [question, setQuestion] = useState('');
  const [asked, setAsked] = useState('');
  const [reply, setReply] = useState<ChatReply | null>(null);
  const [busy, setBusy] = useState(false);

  async function send() {
    const text = question.trim();
    if (!text || busy) return;
    setBusy(true); setReply(null); setAsked(text); setQuestion('');
    setReply(await service.ask(text));
    setBusy(false);
  }

  return <SafeAreaView style={ui.screen}>
    <ScrollView contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled">
      <View style={ui.header}>
        <Action title="‹ Voltar" onPress={() => router.back()} />
        <Text style={ui.title}>Chat de teste</Text>
        <Text accessibilityRole="alert" style={ui.danger}>FICTÍCIO – SOMENTE TESTE – NÃO USAR COM PACIENTES. As respostas contêm informações falsas de propósito.</Text>
      </View>
      <TextInput style={ui.input} multiline value={question} onChangeText={setQuestion} editable={!busy}
        placeholder="Escreva sua pergunta" accessibilityLabel="Pergunta" />
      <Action title={busy ? 'Aguarde…' : 'Enviar'} disabled={busy || !question.trim()} onPress={() => void send()} />
      {busy && <ActivityIndicator accessibilityLabel="Aguardando a resposta" />}
      {!!reply && <View style={ui.card}>
        <Text style={ui.hint}>{asked}</Text>
        <Text style={ui.cardTitle}>{reply.text}</Text>
        {reply.item !== null && <Text style={ui.hint}>Fonte: item {reply.item} da base de teste</Text>}
      </View>}
    </ScrollView>
  </SafeAreaView>;
}
