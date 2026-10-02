import { Pressable, StyleSheet, Text } from 'react-native';

export function Action({ title, onPress, disabled = false, danger = false }: { title: string; onPress: () => void; disabled?: boolean; danger?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.button, (pressed || disabled) && styles.dim]}>
    <Text style={[styles.buttonText, danger && styles.danger]}>{title}</Text>
  </Pressable>;
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F8FC' },
  content: { padding: 24, width: '100%', maxWidth: 720, alignSelf: 'center', gap: 12, paddingBottom: 48 },
  header: { gap: 12, marginBottom: 12 },
  title: { fontSize: 28, fontWeight: '700', color: '#24253D' },
  subtitle: { fontSize: 14, color: '#55546D', lineHeight: 22 },
  hint: { fontSize: 12, color: '#68667D', lineHeight: 19 },
  button: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 10, backgroundColor: '#EEEBFA', justifyContent: 'center' },
  buttonText: { fontSize: 14, fontWeight: '600', color: '#55439F' },
  danger: { color: '#B42318', lineHeight: 21 },
  success: { color: '#2B8065', fontWeight: '600' },
  dim: { opacity: 0.5 },
  card: { backgroundColor: '#FFF', borderRadius: 16, padding: 18, gap: 10 },
  cardTitle: { fontSize: 17, fontWeight: '600', color: '#24253D' },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  empty: { paddingVertical: 32, color: '#68667D', textAlign: 'center', fontSize: 15 },
  backdrop: { flex: 1, backgroundColor: '#24253D88', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modal: { width: '100%', maxWidth: 560, maxHeight: '90%', backgroundColor: '#FFF', padding: 20, borderRadius: 20, gap: 12 },
  input: { borderWidth: 1, borderColor: '#C8C4DB', borderRadius: 10, padding: 12, minHeight: 48, color: '#24253D', backgroundColor: '#FFF' },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#DAD6EA', justifyContent: 'center' },
  activeChip: { backgroundColor: '#E5DFFB', borderColor: '#7965C8' },
});
