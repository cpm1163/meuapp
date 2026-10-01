import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';
import { DOCUMENT_TYPES, MAX_FILE_BYTES } from './service';

export async function pickDocument() {
  const result = await DocumentPicker.getDocumentAsync({
    type: DOCUMENT_TYPES, multiple: false, copyToCacheDirectory: true, base64: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  const nativeFile = Platform.OS !== 'web' ? new File(asset.uri) : null;
  try {
    const size = asset.file?.size ?? nativeFile?.size ?? asset.size;
    if (!size || size > MAX_FILE_BYTES) throw new Error('Escolha um arquivo de até 10 MB que não esteja vazio.');
    // On Android, Expo Go denies FileSystem reads of the picker's cache copy (expo/expo#21792); fetch reads it directly.
    const bytes = asset.file ? await asset.file.arrayBuffer() : await (await fetch(asset.uri)).arrayBuffer();
    return { name: asset.name, bytes };
  } finally {
    // The picker copied this file into our cache. Do not retain private content after reading it.
    if (nativeFile?.exists) nativeFile.delete();
  }
}
