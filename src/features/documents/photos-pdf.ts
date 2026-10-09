import { File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Print from 'expo-print';
import { Platform } from 'react-native';
import { MAX_FILE_BYTES } from './service';

// Tested on Android on 2026-10-09: 3 photos made a legible 0.8 MB PDF (docs/compliance.md).
const MAX_SIDE = 2000;
const JPEG_QUALITY = 0.7;
export const MAX_PAGES = 20;
// A4 in points (72 per inch).
const PAGE = { width: 595, height: 842 };

export type Photo = Pick<ImagePicker.ImagePickerAsset, 'uri' | 'width' | 'height'>;
export type PhotosPdf = { name: string; bytes: ArrayBuffer; pages: number };

// On Android the photos come in the system picker's order; the model orders the pages (decided 2026-10-09).
export async function pickPhotos(limit: number): Promise<Photo[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: limit, orderedSelection: true, quality: 1,
  });
  return result.canceled ? [] : result.assets.slice(0, limit);
}

// Joins the photos of one report into a single PDF, so one report stays one document.
export async function photosToPdf(photos: Photo[]): Promise<PhotosPdf> {
  if (Platform.OS === 'web') throw new Error('Escolha as fotos pelo app no celular.');
  const pages: string[] = [];
  for (const photo of photos) pages.push(await shrinkToJpegBase64(photo));
  const bytes = await printPages(pages);
  if (bytes.byteLength > MAX_FILE_BYTES) throw new Error('Escolha menos fotos: o PDF passou de 10 MB.');
  return { name: `Laudo em fotos (${pages.length} pág.).pdf`, bytes, pages: pages.length };
}

// The pickers copy photos into our cache; only those copies are deleted, never the originals in the gallery.
export function discardPhotos(photos: Photo[]) {
  for (const photo of photos) if (photo.uri.startsWith(Paths.cache.uri)) deleteQuietly(photo.uri);
}

async function shrinkToJpegBase64(asset: Photo) {
  const context = ImageManipulator.manipulate(asset.uri);
  if (Math.max(asset.width, asset.height) > MAX_SIDE) {
    context.resize(asset.width >= asset.height ? { width: MAX_SIDE } : { height: MAX_SIDE });
  }
  const image = await context.renderAsync();
  try {
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY, base64: true });
    deleteQuietly(saved.uri);
    if (!saved.base64) throw new Error('Escolha outra foto: não foi possível preparar uma delas.');
    return saved.base64;
  } finally {
    image.release();
    context.release();
  }
}

async function printPages(pages: string[]) {
  // iOS cannot load local file URLs while printing HTML, so images are inlined as base64.
  const body = pages.map(page => `<div class="page"><img src="data:image/jpeg;base64,${page}" /></div>`).join('');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8" /><style>
    @page { size: ${PAGE.width}pt ${PAGE.height}pt; margin: 0; }
    html, body { margin: 0; padding: 0; }
    .page { width: ${PAGE.width}pt; height: ${PAGE.height}pt; display: flex; align-items: center; justify-content: center; page-break-after: always; overflow: hidden; }
    .page:last-child { page-break-after: auto; }
    img { max-width: 100%; max-height: 100%; object-fit: contain; }
  </style></head><body>${body}</body></html>`;
  const { uri } = await Print.printToFileAsync({ html, ...PAGE, margins: { top: 0, bottom: 0, left: 0, right: 0 } });
  try {
    // Same Expo Go workaround as picker.ts: FileSystem reads of this cache file are denied (expo/expo#21792); fetch reads it.
    return await (await fetch(uri)).arrayBuffer();
  } finally {
    // The PDF holds private health data; keep it only in memory until upload.
    deleteQuietly(uri);
  }
}

function deleteQuietly(uri: string) {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Cache cleanup is best effort.
  }
}
