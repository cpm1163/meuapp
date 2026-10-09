import { useEffect, useRef, useState } from 'react';
import { FlatList, Image, Modal, StyleSheet, Text, View } from 'react-native';
import { useCameraPermissions } from 'expo-camera';
import { Action, styles as ui } from '@/features/modules/ui';
import { DocumentCamera } from './DocumentCamera';
import { discardPhotos, MAX_PAGES, pickPhotos, type Photo } from './photos-pdf';

type Props = { busy: boolean; sendError: string; onClose: () => void; onSend: (photos: Photo[]) => Promise<boolean> };

// Collects the photos of one report; they become a single PDF document when sent.
// Mounted only while open, so leaving it always discards the cached photos.
export function PhotoCapture({ busy, sendError, onClose, onSend }: Props) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [error, setError] = useState('');
  const [capturing, setCapturing] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const current = useRef<Photo[]>([]);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; discardPhotos(current.current); current.current = []; };
  }, []);

  function update(next: Photo[]) {
    current.current = next;
    setPhotos(next);
  }

  function add(added: Photo[]) {
    if (!mounted.current) { discardPhotos(added); return; }
    const room = MAX_PAGES - current.current.length;
    discardPhotos(added.slice(room));
    update([...current.current, ...added.slice(0, room)]);
    if (current.current.length >= MAX_PAGES) setCameraOpen(false);
  }

  async function capture(task: () => Promise<void>) {
    if (capturing) return;
    setCapturing(true); setError('');
    try { await task(); }
    catch (e) { if (mounted.current) setError(e instanceof Error && /^(Permita|Escolha)/.test(e.message) ? e.message : 'Não foi possível usar a câmera ou a galeria. Tente novamente.'); }
    finally { if (mounted.current) setCapturing(false); }
  }

  const shoot = () => capture(async () => {
    const granted = permission?.granted || (await requestPermission()).granted;
    if (!granted) throw new Error('Permita o uso da câmera nas configurações do celular para fotografar o laudo.');
    if (mounted.current) setCameraOpen(true);
  });
  const choose = () => capture(async () => add(await pickPhotos(MAX_PAGES - current.current.length)));

  function remove(uri: string) {
    discardPhotos(current.current.filter(photo => photo.uri === uri));
    update(current.current.filter(photo => photo.uri !== uri));
  }

  async function send() {
    const sent = await onSend(current.current);
    if (sent && mounted.current) onClose();
  }

  const locked = busy || capturing;
  const full = photos.length >= MAX_PAGES;
  return <Modal visible transparent animationType="fade" statusBarTranslucent
    onRequestClose={() => { if (cameraOpen) setCameraOpen(false); else if (!locked) onClose(); }}>
    <View style={ui.backdrop}><View accessibilityViewIsModal style={ui.modal}>
      <Text style={ui.cardTitle}>Fotos do laudo</Text>
      <Text style={ui.hint}>Fotografe todas as páginas de um mesmo laudo, em qualquer ordem. Elas são enviadas juntas, como um único documento em PDF. Até {MAX_PAGES} fotos.</Text>
      <View style={ui.actions}>
        <Action title="Fotografar páginas" onPress={() => void shoot()} disabled={locked || full} />
        <Action title="Escolher da galeria" onPress={() => void choose()} disabled={locked || full} />
      </View>
      <Text style={ui.hint}>Na câmera, tire uma foto por página e toque em “Concluir” ao terminar.</Text>
      {!!(error || sendError) && <Text accessibilityRole="alert" style={ui.danger}>{error || sendError}</Text>}
      <FlatList data={photos} keyExtractor={item => item.uri} numColumns={3} style={styles.grid} columnWrapperStyle={styles.row}
        ListEmptyComponent={<Text style={ui.empty}>Nenhuma foto ainda.</Text>}
        renderItem={({ item, index }) => <View style={styles.thumb}>
          <Image source={{ uri: item.uri }} style={styles.image} resizeMode="cover" accessibilityLabel={`Foto ${index + 1}`} />
          <Action title="Remover" danger disabled={locked} onPress={() => remove(item.uri)} />
        </View>} />
      <Action title={busy ? 'Enviando…' : `Enviar ${photos.length} foto(s) como um documento`} onPress={() => void send()} disabled={locked || !photos.length} />
      <Action title="Cancelar" onPress={onClose} disabled={locked} />
    </View></View>
    {cameraOpen && <DocumentCamera count={photos.length} max={MAX_PAGES} onPhoto={photo => add([photo])} onDone={() => setCameraOpen(false)} />}
  </Modal>;
}

const styles = StyleSheet.create({
  grid: { flexGrow: 0, maxHeight: 360 },
  row: { gap: 8 },
  thumb: { width: '31%', gap: 4, marginBottom: 8 },
  image: { width: '100%', aspectRatio: 3 / 4, borderRadius: 8, backgroundColor: '#EEEBFA' },
});
