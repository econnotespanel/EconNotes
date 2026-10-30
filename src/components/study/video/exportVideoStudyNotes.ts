import { APP_VERSION_LABEL } from '@/lib/version';
import type { DiagramType, StudioContent, StudioScene } from './sceneModel';

const DIAGRAM_TYPE_LABELS: Record<DiagramType, string> = {
  visual: 'Görsel & İllüstrasyon',
  shapes: 'Şekiller & Döngü',
  table: 'Karşılaştırma Tablosu',
  chart: 'Analitik Grafik',
  curve: 'Analitik Grafik',
  scenario: 'Vaka Senaryosu',
  timeline: 'Zaman Akışı',
  comparison: 'İkili Kıyaslama',
  structure: 'Kurumsal Yapı',
  network: 'Kavram Ağı',
};

export interface VideoUserNoteItem {
  id: string;
  sceneIndex: number;
  timeLabel: string;
  text: string;
}

export interface VideoStudyNotesExportInput {
  studio: StudioContent;
  courseName?: string;
  userNotes?: VideoUserNoteItem[];
}

function escapeHtml(text: string): string {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDurationTr(totalSec: number): string {
  const mins = Math.max(1, Math.round(totalSec / 60));
  return `${mins} dk Akademik Video Ders`;
}

/** Sohbet geçiş cümlelerini ayıklayıp yalnızca saf akademik bilgi cümlelerini bırakır. */
const CONVERSATIONAL_FILLER_RE =
  /^(?:EconNotes akademik stüdyosuna hoş geldiniz|Çok (?:kritik|yerinde|doğru|isabetli)|Tam (?:burada|isabet)|Peki (?:Deniz|bu ilk ivme)|Deniz,\s*(?:öğrencilerin|konunun|bir konuyu|tam burada)|Şimdi (?:tüm bu|bu büyük resmi|bu kavramların|ders sonundaki)|Adım adım ilerleyelim|İşte konuyu bu dört adımlı|Görsel mimariden karşılaştırma|Kesinlikle[.;\s]|Elbette Barış|Memnuniyetle Deniz|Hemen netleştirelim)/i;

function extractCleanSceneSummary(scene: StudioScene): string[] {
  const bullets: string[] = [];
  const seen = new Set<string>();

  const pushClean = (raw: string) => {
    const cleaned = raw.replace(/\*\*|__|`/g, '').replace(/\s+/g, ' ').trim();
    if (!cleaned || cleaned.length < 14) return;
    if (CONVERSATIONAL_FILLER_RE.test(cleaned)) return;
    if (cleaned.endsWith('?')) return;
    const sig = cleaned.toLocaleLowerCase('tr-TR').slice(0, 48);
    if (seen.has(sig)) return;
    seen.add(sig);
    bullets.push(cleaned);
  };

  scene.keyTakeaways.forEach(pushClean);

  if (bullets.length < 3) {
    scene.sentences.forEach(sent => {
      if (bullets.length >= 4) return;
      pushClean(sent);
    });
  }

  return bullets.slice(0, 5);
}

function sanitizeFileSlug(title: string): string {
  const map: Record<string, string> = {
    ç: 'c', Ç: 'C', ğ: 'g', Ğ: 'G', ı: 'i', İ: 'I',
    ö: 'o', Ö: 'O', ş: 's', Ş: 'S', ü: 'u', Ü: 'U',
  };
  const ascii = title
    .replace(/[çÇğĞıİöÖşŞüÜ]/g, ch => map[ch] || ch)
    .replace(/[^a-zA-Z0-9\s_-]+/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 64);
  return ascii || 'Video_Ders_Notu';
}

export function buildVideoStudyNotesHtml({
  studio,
  courseName,
  userNotes = [],
}: VideoStudyNotesExportInput): string {
  const dateStr = new Date().toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const cleanCourse = (courseName || 'Akademik Çalışma Stüdyosu').trim();
  const letters = ['A', 'B', 'C', 'D', 'E'];

  const keyFactsHtml =
    studio.keyFacts.length > 0
      ? `
    <section class="section-block">
      <div class="section-header">
        <span class="section-num">01</span>
        <div>
          <h2>Sınav Öncesi Kritik Hap Bilgiler</h2>
          <p class="section-sub">Dersin bütününü birbirine bağlayan temel ilkeler ve ayırt edici noktalar</p>
        </div>
      </div>
      <div class="facts-grid">
        ${studio.keyFacts
          .map(
            (fact, idx) => `
          <div class="fact-card">
            <span class="fact-index">${String(idx + 1).padStart(2, '0')}</span>
            <p>${escapeHtml(fact)}</p>
          </div>`,
          )
          .join('')}
      </div>
    </section>`
      : '';

  const chaptersHtml = studio.scenes
    .map((sc, idx) => {
      const bullets = extractCleanSceneSummary(sc);
      const termsRow =
        sc.keyTerms.length > 0
          ? `<div class="term-chips">
              ${sc.keyTerms
                .slice(0, 5)
                .map(kt => `<span class="term-chip">${escapeHtml(kt.term)}</span>`)
                .join('')}
            </div>`
          : '';
      const examTipBox = sc.examTip
        ? `<div class="exam-callout">
            <div class="exam-callout-label">HOCA SINAV VURGUSU</div>
            <p>${escapeHtml(sc.examTip)}</p>
          </div>`
        : '';

      return `
      <article class="chapter-card">
        <div class="chapter-top">
          <div class="chapter-title-wrap">
            <span class="chapter-badge">BÖLÜM ${String(idx + 1).padStart(2, '0')}</span>
            <h3>${escapeHtml(sc.title)}</h3>
          </div>
          <span class="diagram-pill">${escapeHtml(DIAGRAM_TYPE_LABELS[sc.diagram.type] || 'Akademik Analiz')}</span>
        </div>
        ${termsRow}
        ${
          bullets.length > 0
            ? `<ul class="clean-list">
                ${bullets.map(b => `<li>${escapeHtml(b)}</li>`).join('')}
              </ul>`
            : ''
        }
        ${examTipBox}
      </article>`;
    })
    .join('');

  const matchingHtml =
    studio.matchingPairs.length > 0
      ? `
    <section class="section-block">
      <div class="section-header">
        <span class="section-num">03</span>
        <div>
          <h2>Kavram Eşleştirme &amp; Akademik Sözlük</h2>
          <p class="section-sub">Sınavlarda tanım ve kavram eşleştirmelerinde mutlaka bilinmesi gereken terimler</p>
        </div>
      </div>
      <table class="glossary-table">
        <thead>
          <tr>
            <th style="width: 30%;">Temel Kavram</th>
            <th>Eksiksiz Akademik Tanım ve İşlev</th>
          </tr>
        </thead>
        <tbody>
          ${studio.matchingPairs
            .map(
              pair => `
            <tr>
              <td class="term-cell">${escapeHtml(pair.term)}</td>
              <td>${escapeHtml(pair.definition)}</td>
            </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    </section>`
      : '';

  const questionsHtml =
    studio.examQuestions.length > 0
      ? `
    <section class="section-block">
      <div class="section-header">
        <span class="section-num">04</span>
        <div>
          <h2>Hocanın Sorabileceği Çözümlü Sınav Soruları</h2>
          <p class="section-sub">Üst barda yer alan butonla cevap anahtarını gizleyip kendinizi test edebilirsiniz</p>
        </div>
      </div>
      <div class="questions-list">
        ${studio.examQuestions
          .map((q, qIdx) => {
            const correctLetter = letters[q.correctIndex] || 'A';
            return `
          <div class="question-card">
            <div class="question-head">
              <span class="q-badge">SORU ${qIdx + 1}</span>
              <p class="q-stem">${escapeHtml(q.question)}</p>
            </div>
            <div class="options-grid">
              ${q.options
                .map((opt, oIdx) => {
                  const isCorrect = oIdx === q.correctIndex;
                  return `
                <div class="option-row ${isCorrect ? 'is-correct' : ''}">
                  <span class="opt-letter">${letters[oIdx] || String(oIdx + 1)}</span>
                  <span class="opt-text">${escapeHtml(opt)}</span>
                </div>`;
                })
                .join('')}
            </div>
            <div class="answer-box">
              <strong>Doğru Yanıt (${correctLetter}) &amp; Hoca Çözümü:</strong>
              <span>${escapeHtml(q.explanation)}</span>
            </div>
          </div>`;
          })
          .join('')}
      </div>
    </section>`
      : '';

  const personalNotesHtml =
    userNotes.length > 0
      ? `
    <section class="section-block">
      <div class="section-header">
        <span class="section-num">05</span>
        <div>
          <h2>Kişisel Zaman Damgalı Çalışma Notlarım</h2>
          <p class="section-sub">Video ders sırasında aldığınız özel notlar</p>
        </div>
      </div>
      <div class="personal-notes">
        ${userNotes
          .map(
            n => `
          <div class="personal-note-item">
            <span class="note-time">${escapeHtml(n.timeLabel)} · Bölüm ${n.sceneIndex + 1}</span>
            <p>${escapeHtml(n.text)}</p>
          </div>`,
          )
          .join('')}
      </div>
    </section>`
      : '';

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(studio.title)} — EconNotes Ders Notu</title>
  <style>
    @page { size: A4; margin: 14mm 15mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f1f5f9;
      color: #0f172a;
      line-height: 1.65;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .toolbar {
      position: sticky;
      top: 0;
      z-index: 30;
      background: rgba(15, 23, 42, 0.96);
      backdrop-filter: blur(10px);
      border-bottom: 1px solid rgba(148, 163, 184, 0.2);
      padding: 12px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      color: #f8fafc;
    }
    .toolbar-brand {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 700;
      font-size: 14px;
      letter-spacing: -0.01em;
    }
    .toolbar-actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .btn {
      appearance: none;
      border: 1px solid rgba(148, 163, 184, 0.32);
      background: rgba(30, 41, 59, 0.9);
      color: #f8fafc;
      font-size: 12.5px;
      font-weight: 600;
      padding: 8px 14px;
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .btn:hover { background: rgba(51, 65, 85, 0.95); }
    .btn-primary {
      background: linear-gradient(135deg, #0ea5e9, #2563eb);
      border-color: transparent;
      box-shadow: 0 4px 14px rgba(37, 99, 235, 0.32);
    }
    .btn-primary:hover { filter: brightness(1.07); }
    .page-sheet {
      max-width: 900px;
      margin: 28px auto 48px;
      background: #ffffff;
      border-radius: 20px;
      box-shadow: 0 20px 50px rgba(15, 23, 42, 0.08);
      border: 1px solid #e2e8f0;
      overflow: hidden;
    }
    .hero {
      background: linear-gradient(135deg, #090f1f 0%, #0f1f3d 58%, #162c54 100%);
      color: #f8fafc;
      padding: 34px 38px 30px;
      position: relative;
    }
    .hero-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 18px;
    }
    .logo-lockup {
      display: inline-flex;
      align-items: center;
      gap: 10px;
    }
    .course-pill {
      display: inline-block;
      padding: 5px 12px;
      border-radius: 999px;
      background: rgba(56, 189, 248, 0.16);
      border: 1px solid rgba(56, 189, 248, 0.35);
      color: #7dd3fc;
      font-size: 11.5px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .hero h1 {
      margin: 0 0 12px;
      font-size: 26px;
      line-height: 1.28;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: #ffffff;
    }
    .hero-outline {
      margin: 0;
      font-size: 14px;
      line-height: 1.7;
      color: #cbd5e1;
    }
    .meta-strip {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 20px;
      padding-top: 16px;
      border-top: 1px solid rgba(148, 163, 184, 0.2);
      font-size: 12px;
      color: #e2e8f0;
    }
    .meta-chip {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.12);
      padding: 4px 11px;
      border-radius: 8px;
      font-weight: 600;
    }
    .content-body {
      padding: 32px 38px 38px;
    }
    .section-block {
      margin-bottom: 34px;
    }
    .section-header {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 16px;
      padding-bottom: 10px;
      border-bottom: 2px solid #f1f5f9;
    }
    .section-num {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 32px;
      height: 32px;
      border-radius: 9px;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      color: #1d4ed8;
      font-weight: 800;
      font-size: 12.5px;
      margin-top: 2px;
    }
    .section-header h2 {
      margin: 0;
      font-size: 18px;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: -0.01em;
    }
    .section-sub {
      margin: 2px 0 0;
      font-size: 12.5px;
      color: #64748b;
    }
    .facts-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }
    .fact-card {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 13px 15px;
      border-radius: 12px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      break-inside: avoid;
    }
    .fact-index {
      font-size: 11px;
      font-weight: 800;
      color: #0284c7;
      background: #e0f2fe;
      padding: 2px 7px;
      border-radius: 6px;
      margin-top: 2px;
      flex-shrink: 0;
    }
    .fact-card p {
      margin: 0;
      font-size: 13.2px;
      color: #1e293b;
    }
    .chapter-card {
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      padding: 18px 20px;
      margin-bottom: 14px;
      background: #ffffff;
      break-inside: avoid;
    }
    .chapter-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 10px;
    }
    .chapter-title-wrap {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .chapter-badge {
      font-size: 10.5px;
      font-weight: 800;
      letter-spacing: 0.06em;
      color: #2563eb;
    }
    .chapter-top h3 {
      margin: 0;
      font-size: 15.5px;
      font-weight: 700;
      color: #0f172a;
    }
    .diagram-pill {
      flex-shrink: 0;
      font-size: 11px;
      font-weight: 600;
      color: #475569;
      background: #f1f5f9;
      border: 1px solid #e2e8f0;
      padding: 3px 10px;
      border-radius: 999px;
    }
    .term-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 10px;
    }
    .term-chip {
      font-size: 11.5px;
      font-weight: 600;
      color: #0369a1;
      background: #f0f9ff;
      border: 1px solid #bae6fd;
      padding: 2px 9px;
      border-radius: 999px;
    }
    .clean-list {
      margin: 8px 0 0;
      padding-left: 18px;
    }
    .clean-list li {
      margin-bottom: 6px;
      font-size: 13.5px;
      color: #334155;
    }
    .exam-callout {
      margin-top: 12px;
      padding: 11px 14px;
      border-radius: 10px;
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-left: 4px solid #f59e0b;
    }
    .exam-callout-label {
      font-size: 10.5px;
      font-weight: 800;
      letter-spacing: 0.05em;
      color: #b45309;
      margin-bottom: 3px;
    }
    .exam-callout p {
      margin: 0;
      font-size: 13px;
      color: #78350f;
      font-weight: 500;
    }
    .glossary-table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      overflow: hidden;
      font-size: 13.5px;
    }
    .glossary-table th {
      background: #f8fafc;
      color: #0f172a;
      font-weight: 700;
      text-align: left;
      padding: 11px 14px;
      border-bottom: 2px solid #e2e8f0;
    }
    .glossary-table td {
      padding: 11px 14px;
      border-bottom: 1px solid #e2e8f0;
      vertical-align: top;
      color: #334155;
    }
    .glossary-table tr:last-child td { border-bottom: none; }
    .term-cell {
      font-weight: 700;
      color: #0f172a !important;
      background: #fcfdff;
    }
    .question-card {
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      padding: 16px 18px;
      margin-bottom: 14px;
      background: #ffffff;
      break-inside: avoid;
    }
    .question-head {
      margin-bottom: 12px;
    }
    .q-badge {
      display: inline-block;
      font-size: 10.5px;
      font-weight: 800;
      letter-spacing: 0.05em;
      color: #6d28d9;
      background: #f5f3ff;
      border: 1px solid #ddd6fe;
      padding: 2px 8px;
      border-radius: 6px;
      margin-bottom: 6px;
    }
    .q-stem {
      margin: 0;
      font-size: 14.2px;
      font-weight: 700;
      color: #0f172a;
      line-height: 1.55;
    }
    .options-grid {
      display: flex;
      flex-direction: column;
      gap: 7px;
    }
    .option-row {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 9px 12px;
      border-radius: 10px;
      border: 1px solid #e2e8f0;
      background: #f8fafc;
      font-size: 13.3px;
      color: #1e293b;
    }
    body:not(.hide-answers) .option-row.is-correct {
      background: #ecfdf5;
      border-color: #6ee7b7;
      color: #064e3b;
      font-weight: 600;
    }
    .opt-letter {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 24px;
      height: 24px;
      border-radius: 999px;
      background: #e2e8f0;
      color: #334155;
      font-weight: 700;
      font-size: 12px;
      flex-shrink: 0;
    }
    body:not(.hide-answers) .option-row.is-correct .opt-letter {
      background: #10b981;
      color: #ffffff;
    }
    .opt-text {
      line-height: 1.5;
      word-break: break-word;
    }
    .answer-box {
      margin-top: 11px;
      padding: 10px 13px;
      border-radius: 10px;
      background: #f0f9ff;
      border: 1px solid #bae6fd;
      font-size: 12.8px;
      color: #0c4a6e;
    }
    body.hide-answers .answer-box {
      display: none;
    }
    .personal-notes {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .personal-note-item {
      padding: 10px 14px;
      border-radius: 10px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      break-inside: avoid;
    }
    .note-time {
      font-size: 11px;
      font-weight: 700;
      color: #0284c7;
    }
    .personal-note-item p {
      margin: 4px 0 0;
      font-size: 13.3px;
      color: #1e293b;
    }
    .doc-footer {
      padding: 18px 38px;
      background: #f8fafc;
      border-top: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11.5px;
      color: #64748b;
    }
    @media (max-width: 680px) {
      .facts-grid { grid-template-columns: 1fr; }
      .hero, .content-body { padding: 22px 20px; }
      .doc-footer { padding: 14px 20px; flex-direction: column; gap: 6px; }
    }
    @media print {
      body { background: #ffffff; }
      .toolbar { display: none !important; }
      .page-sheet {
        max-width: 100%;
        margin: 0;
        border: none;
        border-radius: 0;
        box-shadow: none;
      }
      .hero { border-radius: 12px; margin-bottom: 12px; }
      .content-body { padding: 14px 4px; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <div class="toolbar-brand">
      <svg width="26" height="26" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="36" height="36" rx="9" fill="#0EA5E9"/>
        <path d="M10 11H25V14.2H13.8V16.6H23.2V19.6H13.8V22.2H25.4V25.4H10V11Z" fill="white"/>
        <circle cx="27.5" cy="9.5" r="2.5" fill="#FDE047"/>
      </svg>
      <span>EconNotes Akademik Ders Notu &amp; Sınav Rehberi</span>
    </div>
    <div class="toolbar-actions">
      <button type="button" class="btn" onclick="document.body.classList.toggle('hide-answers')">
        Cevap Anahtarını Göster / Gizle
      </button>
      <button type="button" class="btn btn-primary" onclick="window.print()">
        PDF Olarak Kaydet / Yazdır
      </button>
    </div>
  </div>

  <main class="page-sheet">
    <header class="hero">
      <div class="hero-top">
        <div class="logo-lockup">
          <svg width="32" height="32" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="36" height="36" rx="9" fill="rgba(255,255,255,0.14)"/>
            <path d="M10 11H25V14.2H13.8V16.6H23.2V19.6H13.8V22.2H25.4V25.4H10V11Z" fill="white"/>
            <circle cx="27.5" cy="9.5" r="2.5" fill="#38BDF8"/>
          </svg>
          <span style="font-size: 18px; font-weight: 800; letter-spacing: -0.02em; color: #ffffff;">EconNotes</span>
        </div>
        <span class="course-pill">${escapeHtml(cleanCourse)}</span>
      </div>
      <h1>${escapeHtml(studio.title)}</h1>
      ${studio.outline ? `<p class="hero-outline">${escapeHtml(studio.outline)}</p>` : ''}
      <div class="meta-strip">
        <span class="meta-chip">${studio.scenes.length} Akademik Bölüm</span>
        <span class="meta-chip">${escapeHtml(formatDurationTr(studio.totalDurationSec))}</span>
        <span class="meta-chip">${studio.matchingPairs.length} Temel Kavram</span>
        <span class="meta-chip">${studio.examQuestions.length} Sınav Odak Sorusu</span>
        <span class="meta-chip">${escapeHtml(dateStr)}</span>
      </div>
    </header>

    <div class="content-body">
      ${keyFactsHtml}

      <section class="section-block">
        <div class="section-header">
          <span class="section-num">02</span>
          <div>
            <h2>Bölüm Bölüm Konu Özeti &amp; Hoca Vurguları</h2>
            <p class="section-sub">Sohbet tekrarlarından arındırılmış, doğrudan sınava hazırlayan yapılandırılmış ders özeti</p>
          </div>
        </div>
        ${chaptersHtml}
      </section>

      ${matchingHtml}
      ${questionsHtml}
      ${personalNotesHtml}
    </div>

    <footer class="doc-footer">
      <span>EconNotes Çalışma Stüdyosu · Yapılandırılmış Akademik Ders Notu</span>
      <span>${escapeHtml(APP_VERSION_LABEL)} · ${escapeHtml(dateStr)}</span>
    </footer>
  </main>
</body>
</html>`;
}

export function downloadVideoStudyNotes(input: VideoStudyNotesExportInput): void {
  const html = buildVideoStudyNotesHtml(input);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `EconNotes_${sanitizeFileSlug(input.studio.title)}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function printVideoStudyNotesPdf(input: VideoStudyNotesExportInput): boolean {
  const html = buildVideoStudyNotesHtml(input);
  const win = window.open('', '_blank', 'width=980,height=860');
  if (!win) {
    downloadVideoStudyNotes(input);
    return false;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  window.setTimeout(() => {
    try {
      win.print();
    } catch {
      // Kullanıcı belgedeki üst bardan da yazdırabilir
    }
  }, 350);
  return true;
}
