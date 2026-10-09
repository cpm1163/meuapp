import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Action, styles as ui } from '@/features/modules/ui';
import { PatientForm } from './PatientForm';
import { createPatientService, formatBirthDate, formatCpf, PATIENT_PAGE_SIZE, patientError, type PatientListItem } from './service';

type Props = { accessToken: string };

export function PatientsScreen({ accessToken }: Props) {
  const service = useMemo(() => createPatientService(accessToken), [accessToken]);
  const [patients, setPatients] = useState<PatientListItem[]>([]);
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState('');
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const [canCreate, setCanCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const request = useRef(0);

  const load = useCallback(async (term: string, offset = 0) => {
    const version = ++request.current;
    setLoading(true); setError('');
    try {
      const rows = await service.list(term, offset);
      if (version !== request.current) return;
      setPatients(previous => offset ? [...previous, ...rows.filter(row => !previous.some(old => old.id === row.id))] : rows);
      setHasMore(rows.length === PATIENT_PAGE_SIZE);
    } catch (e) { if (version === request.current) setError(patientError(e)); }
    finally { if (version === request.current) setLoading(false); }
  }, [service]);

  const appliedRef = useRef('');
  // Reloads when returning from a patient, whose documents or data may have changed.
  useFocusEffect(useCallback(() => {
    void load(appliedRef.current);
    void service.moduleAccess().then(access => setCanCreate(access.canUse)).catch(() => setCanCreate(false));
  }, [load, service]));

  function apply(term: string) { appliedRef.current = term; setApplied(term); void load(term); }
  function find() { apply(search); }

  const header = <View style={ui.header}>
    <Action title="‹ Voltar" onPress={() => router.back()} />
    <Text style={ui.title}>Pacientes</Text>
    <Text style={ui.subtitle}>Seus cadastros, visíveis só para você. Toque em um paciente para ver e enviar os documentos dele.</Text>
    {canCreate
      ? <Action title="+ Novo paciente" onPress={() => setCreating(true)} />
      : <Text style={ui.hint}>Para cadastrar pacientes, a gestão por paciente precisa estar liberada e com os termos aceitos em “Meus módulos”.</Text>}
    <TextInput accessibilityLabel="Buscar por nome ou CPF" placeholder="Buscar por nome ou CPF completo" value={search} onChangeText={setSearch}
      onSubmitEditing={find} returnKeyType="search" autoCorrect={false} style={ui.input} />
    <View style={ui.actions}>
      <Action title="Buscar" onPress={find} disabled={loading} />
      {!!applied && <Action title="Limpar busca" onPress={() => { setSearch(''); apply(''); }} disabled={loading} />}
    </View>
    {!!error && <Text accessibilityRole="alert" style={ui.danger}>{error}</Text>}
    <View style={ui.actions}>
      <Action title="Documentos sem paciente" onPress={() => router.push({ pathname: '/documents', params: { scope: 'unassigned' } })} />
      <Action title="Compartilhados comigo" onPress={() => router.push({ pathname: '/documents', params: { scope: 'shared' } })} />
    </View>
  </View>;

  return <SafeAreaView style={ui.screen}>
    <FlatList data={patients} keyExtractor={item => item.id} contentContainerStyle={ui.content} ListHeaderComponent={header}
      ListEmptyComponent={loading ? <ActivityIndicator accessibilityLabel="Carregando pacientes" /> : <Text style={ui.empty}>{applied ? 'Nenhum paciente encontrado.' : 'Nenhum paciente cadastrado.'}</Text>}
      ListFooterComponent={patients.length > 0 ? <View>{loading && <ActivityIndicator />}{hasMore && <Action title="Carregar mais" disabled={loading} onPress={() => void load(applied, patients.length)} />}</View> : null}
      renderItem={({ item }) => <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/patient', params: { patientId: item.id } })}
        style={({ pressed }) => [ui.card, pressed && ui.dim]}>
        <Text style={ui.cardTitle}>{item.display_name}</Text>
        <Text style={ui.hint}>{[formatCpf(item.cpf) && `CPF ${formatCpf(item.cpf)}`, item.birth_date && `Nasc. ${formatBirthDate(item.birth_date)}`,
          `${item.document_count} documento(s)`].filter(Boolean).join(' · ')}</Text>
      </Pressable>} />
    {creating && <PatientForm onClose={() => setCreating(false)} onSave={async input => {
      const patient = await service.create(input);
      router.push({ pathname: '/patient', params: { patientId: patient.id } });
    }} />}
  </SafeAreaView>;
}
