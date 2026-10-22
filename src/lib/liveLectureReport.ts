import logoUrl from '@/assets/econnotes-brand-light.png';
import { toast } from 'sonner';

interface SummarySection {
  heading: string;
  content: string;
  takeaway?: string;
}

interface ExamLikelihoodItem {
  topic: string;
  reason: string;
  likelihood: 'yüksek' | 'orta' | 'düşük';
  studyPriority?: 'öncelikli' | 'normal' | 'pekiştirme';
}

export interface LectureSummaryReport {
  title: string;
  course?: string | null;
  createdAt?: string | null;
  overview?: string;
  keyPoints?: string[];
  sections?: SummarySection[];
  instructorEmphasis?: string[];
  examLikelihood?: ExamLikelihoodItem[];
  transcript?: string;
}

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const markdownToHtml = (value: string) =>
  escapeHtml(value)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br />');

const buildHtml = (report: LectureSummaryReport) => {
  const keyPoints = (report.keyPoints || [])
    .map((point) => `<li>${markdownToHtml(point)}</li>`)
    .join('');
  const sections = (report.sections || [])
    .map((section) => `
      <section class="section">
        <h2>${escapeHtml(section.heading)}</h2>
        <div>${markdownToHtml(section.content)}</div>
        ${section.takeaway ? `<p class="takeaway"><strong>Çıkarım:</strong> ${markdownToHtml(section.takeaway)}</p>` : ''}
      </section>
    `)
    .join('');
  const instructorEmphasis = (report.instructorEmphasis || [])
    .map((item) => `<li>${markdownToHtml(item)}</li>`)
    .join('');
  const examLikelihood = (report.examLikelihood || [])
    .map((item) => `
      <li>
        <strong>${escapeHtml(item.topic)}</strong>
        <span class="likelihood ${item.likelihood === 'yüksek' ? 'high' : item.likelihood === 'orta' ? 'medium' : 'low'}">${escapeHtml(item.likelihood)}</span>
        <br />${markdownToHtml(item.reason)}
        ${item.studyPriority ? `<br /><em>Çalışma önceliği: ${escapeHtml(item.studyPriority)}</em>` : ''}
      </li>
    `)
    .join('');

  return `<!doctype html>
<html lang="tr">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(report.title)} - EconNotes Özeti</title>
    <style>
      @page { size: A4; margin: 18mm 15mm; }
      * { box-sizing: border-box; }
      body { color: #0f172a; font-family: Arial, sans-serif; font-size: 11.5pt; line-height: 1.6; margin: 0; padding-top: 64px; }
      .header { align-items: center; background: #fff; border-bottom: 2px solid #2563eb; display: flex; gap: 16px; justify-content: space-between; left: 0; padding: 0 0 12px; position: fixed; right: 0; top: 0; z-index: 1; }
      .logo { height: 38px; max-width: 180px; object-fit: contain; object-position: left center; }
      .meta { color: #475569; font-size: 10pt; text-align: right; }
      h1 { color: #1e3a8a; font-size: 20pt; margin: 0 0 14px; }
      h2 { color: #1e40af; font-size: 14pt; margin: 0 0 8px; }
      .overview, .section, .points { border: 1px solid #dbeafe; border-radius: 10px; margin-bottom: 14px; padding: 13px 15px; page-break-inside: avoid; }
      .overview { background: #eff6ff; }
      .label { color: #64748b; font-size: 9pt; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
      .points ul { margin: 6px 0 0; padding-left: 20px; }
      .points li { margin: 3px 0; }
      .takeaway { background: #f8fafc; border-left: 3px solid #2563eb; margin: 10px 0 0; padding: 7px 10px; }
      .category { border: 1px solid #dbeafe; border-radius: 10px; margin-bottom: 14px; padding: 13px 15px; page-break-inside: avoid; }
      .category h2 { margin-bottom: 6px; }
      .category ul { margin: 6px 0 0; padding-left: 20px; }
      .category li { margin: 5px 0; }
      .likelihood { border-radius: 999px; display: inline-block; font-size: 9pt; margin-left: 8px; padding: 1px 8px; text-transform: capitalize; }
      .likelihood.high { background: #dcfce7; color: #166534; }
      .likelihood.medium { background: #fef3c7; color: #92400e; }
      .likelihood.low { background: #e2e8f0; color: #475569; }
      .transcript { border-top: 1px solid #cbd5e1; color: #475569; font-size: 9.5pt; margin-top: 20px; padding-top: 10px; }
      .footer { border-top: 1px solid #e2e8f0; color: #64748b; font-size: 9pt; margin-top: 20px; padding-top: 8px; }
    </style>
  </head>
  <body>
    <header class="header">
      <img class="logo" src="${logoUrl}" alt="EconNotes" />
      <div class="meta">${escapeHtml(report.course || 'Ders özeti')}<br />${escapeHtml(report.createdAt || new Date().toLocaleDateString('tr-TR'))}</div>
    </header>
    <h1>${escapeHtml(report.title)}</h1>
    <div class="overview"><div class="label">Genel bakış</div><p>${markdownToHtml(report.overview || '')}</p></div>
    ${keyPoints ? `<div class="points"><h2>Anahtar noktalar</h2><ul>${keyPoints}</ul></div>` : ''}
    ${instructorEmphasis ? `<div class="category"><h2>Hocanın vurguladıkları</h2><ul>${instructorEmphasis}</ul></div>` : ''}
    ${examLikelihood ? `<div class="category"><h2>Sınav önceliği</h2><ul>${examLikelihood}</ul></div>` : ''}
    ${sections}
    ${report.transcript ? `<div class="transcript"><div class="label">Ders dökümü</div><p>${markdownToHtml(report.transcript)}</p></div>` : ''}
    <div class="footer">Bu özet EconNotes tarafından yapay zeka destekli olarak oluşturulmuştur.</div>
  </body>
</html>`;
};

export const downloadLectureSummaryPdf = (report: LectureSummaryReport) => {
  const popup = window.open('', '_blank', 'width=900,height=1000');
  if (!popup) {
    toast.error('PDF penceresi açılamadı. Tarayıcı pop-up iznini açıp tekrar deneyin.');
    return;
  }

  popup.document.open();
  popup.document.write(buildHtml(report));
  popup.document.close();
  popup.focus();
  window.setTimeout(() => popup.print(), 400);
};

export const downloadLectureSummary = (report: LectureSummaryReport) => {
  const blob = new Blob([buildHtml(report)], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const safeTitle = report.title.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-').trim() || 'econnotes-ders-ozeti';
  anchor.href = url;
  anchor.download = `${safeTitle}.html`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast.success('Ders özeti cihazınıza indirildi.');
};
