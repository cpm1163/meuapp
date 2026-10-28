import { formatPrescriptionDate, type Prescription } from './service';

const escape = (text: string) => text.replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] as string);
const lines = (text: string) => escape(text).replace(/\n/g, '<br/>');

/** HTML for expo-print: header of the doctor, patient, numbered items, notes, date and the line for the signature.
 * Everything is escaped: all texts are typed by the doctor. */
export function prescriptionHtml(prescription: Prescription): string {
  const doctor = prescription.prescriber;
  const crm = `CRM ${doctor.crm}/${doctor.crm_uf}`;
  const qualification = [doctor.specialty, doctor.rqe && `RQE ${doctor.rqe}`].filter(Boolean).join(' · ');
  const contact = [doctor.address, doctor.phone, doctor.email].filter(Boolean).join(' · ');
  const items = prescription.items.map((item, index) => `<li><div class="med"><b>${index + 1}. ${escape(item.medication)}</b>${
    item.quantity ? `<span>${escape(item.quantity)}</span>` : ''}</div><div>${lines(item.dosage)}</div></li>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8" /><style>
    @page { margin: 40pt; }
    body { font-family: -apple-system, Roboto, Helvetica, Arial, sans-serif; font-size: 11pt; color: #24253D; }
    header { text-align: center; border-bottom: 1px solid #C8C4DB; padding-bottom: 10pt; }
    header h1 { font-size: 15pt; margin: 0 0 3pt; }
    .muted { color: #55546D; font-size: 9.5pt; margin: 2pt 0; }
    h2 { font-size: 12pt; letter-spacing: 2pt; text-align: center; margin: 18pt 0 12pt; }
    ol { list-style: none; padding: 0; }
    li { margin-bottom: 12pt; }
    .med { display: flex; justify-content: space-between; gap: 12pt; border-bottom: 1px dotted #C8C4DB; margin-bottom: 3pt; }
    .notes { margin-top: 16pt; }
    .sign { margin-top: 60pt; text-align: center; }
    .line { border-top: 1px solid #24253D; width: 60%; margin: 0 auto 4pt; }
  </style></head><body>
    <header><h1>${escape(doctor.full_name)}</h1><p class="muted">${escape(crm)}${qualification ? ` · ${escape(qualification)}` : ''}</p>${
      contact ? `<p class="muted">${escape(contact)}</p>` : ''}</header>
    <h2>RECEITUÁRIO</h2>
    <p><b>Paciente:</b> ${escape(prescription.patient_name)}</p>
    <ol>${items}</ol>
    ${prescription.notes ? `<div class="notes"><b>Observações:</b><br/>${lines(prescription.notes)}</div>` : ''}
    <p>Data: ${escape(formatPrescriptionDate(prescription.created_at))}</p>
    <div class="sign"><div class="line"></div>${escape(doctor.full_name)}<br/><span class="muted">${escape(crm)}</span></div>
  </body></html>`;
}
