import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { reportHtml, type Report } from './report';

// The report PDF leaves the app through the system share sheet (e.g. WhatsApp), decided 16/10/2026.
// A4 in points (72 per inch), as in photos-pdf.ts.
const PAGE = { width: 595, height: 842 };
const PREFIX = 'Relatorio-exame-';

/** Prints the report and opens the share sheet. `fileDate` (AAAA-MM-DD) names the file the recipient sees. */
export async function shareReportPdf(report: Report, fileDate: string) {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Este aparelho não permite compartilhar arquivos.');
  // The share sheet may still be reading the previous file when shareAsync returns, so it is removed only here.
  clearPreviousReports();
  const { uri } = await Print.printToFileAsync({ html: reportHtml(report, new Date()), ...PAGE });
  let target = uri;
  try {
    // A readable name instead of the random one from expo-print. Expo Go denies FileSystem reads of the print
    // output (expo/expo#21792), so it is read with fetch, as in photos-pdf.ts.
    const bytes = new Uint8Array(await (await fetch(uri)).arrayBuffer());
    const named = new File(Paths.cache, `${PREFIX}${fileDate || 'sem-data'}.pdf`);
    named.create({ overwrite: true });
    named.write(bytes);
    target = named.uri;
    deleteQuietly(uri);
  } catch { /* share the printed file under its random name */ }
  await Sharing.shareAsync(target, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Enviar relatório' });
}

function clearPreviousReports() {
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
