import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView } from 'expo-camera';
import type { Photo } from './photos-pdf';

type Props = { count: number; max: number; onPhoto: (photo: Photo) => void; onDone: () => void };

// In-app camera: the system camera app lets Android kill our activity and lose the photos (docs/compliance.md).
// Rendered only while open, because only one camera preview may be active at a time.
export function DocumentCamera({ count, max, onPhoto, onDone }: Props) {
  const camera = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const [taking, setTaking] = useState(false);
  const [error, setError] = useState('');

  async function shoot() {
    if (!camera.current || !ready || taking) return;
    setTaking(true); setError('');
    try {
      const picture = await camera.current.takePictureAsync({ quality: 0.9 });
      onPhoto({ uri: picture.uri, width: picture.width, height: picture.height });
    } catch {
      setError('Não foi possível tirar a foto. Tente novamente.');
    } finally { setTaking(false); }
  }

  return <View style={styles.screen}>
    <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" onCameraReady={() => setReady(true)}
      onMountError={() => setError('Não foi possível abrir a câmera.')} />
    <View style={styles.top}>
      <Text style={styles.text}>{count} de até {max} páginas</Text>
      <Text style={styles.hint}>Enquadre uma página inteira por foto, com boa luz.</Text>
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    </View>
    <View style={styles.bottom}>
      <View style={styles.side} />
      <Pressable accessibilityRole="button" accessibilityLabel="Tirar foto da página" accessibilityState={{ disabled: !ready || taking }}
        disabled={!ready || taking} onPress={() => void shoot()} style={({ pressed }) => [styles.shutter, (pressed || !ready || taking) && styles.dim]}>
        <View style={styles.shutterInner} />
      </Pressable>
      <Pressable accessibilityRole="button" disabled={taking} onPress={onDone} style={[styles.side, styles.done]}>
        <Text style={styles.text}>Concluir</Text>
      </Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  screen: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000' },
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingTop: 48, paddingHorizontal: 20, paddingBottom: 12, gap: 4, backgroundColor: '#0008' },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingBottom: 40, paddingTop: 20, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#0008' },
  text: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  hint: { color: '#FFFD', fontSize: 13 },
  error: { color: '#FFB4AB', fontSize: 14 },
  side: { width: 96, minHeight: 48, justifyContent: 'center' },
  done: { alignItems: 'flex-end' },
  shutter: { width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: '#FFF', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#FFF' },
  dim: { opacity: 0.5 },
});
