import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { prescriptionHtml } from './prescription-html';
import type { Prescription } from './service';

// The prescription is printed again from its saved data each time; no PDF is stored (docs/prescriptions.md).
// A4 in points (72 per inch), as in share-report.ts.
const PAGE = { width: 595, height: 842 };
const PREFIX = 'Receita-';

/** Prints the prescription and opens the share sheet (print, WhatsApp, e-mail). */
export async function sharePrescriptionPdf(prescription: Prescription) {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Este aparelho não permite compartilhar arquivos.');
  // The share sheet may still be reading the previous file when shareAsync returns, so it is removed only here.
  clearPrevious();
  const { uri } = await Print.printToFileAsync({ html: prescriptionHtml(prescription), ...PAGE });
  let target = uri;
  try {
    // A readable name instead of the random one from expo-print; read with fetch because Expo Go denies
    // FileSystem reads of the print output (expo/expo#21792), as in share-report.ts.
    const bytes = new Uint8Array(await (await fetch(uri)).arrayBuffer());
    const named = new File(Paths.cache, `${PREFIX}${prescription.created_at.slice(0, 10)}.pdf`);
    named.create({ overwrite: true });
    named.write(bytes);
    target = named.uri;
    deleteQuietly(uri);
  } catch { /* share the printed file under its random name */ }
  await Sharing.shareAsync(target, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Enviar receita' });
}

/** Opens the system print window with the prescription in A4 (the default of expo-print is US Letter). */
export async function printPrescription(prescription: Prescription) {
  // iOS rejects when the doctor closes the print window without printing; that is not an error to show.
  await Print.printAsync({ html: prescriptionHtml(prescription), ...PAGE }).catch(() => {});
}

function clearPrevious() {
  try {
    for (const item of Paths.cache.list()) {
      if (item instanceof File && decodeURIComponent(item.uri).includes(`/${PREFIX}`)) item.delete();
    }
  } catch { /* nothing to clear */ }
}

function deleteQuietly(uri: string) {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch { /* already gone */ }
}
