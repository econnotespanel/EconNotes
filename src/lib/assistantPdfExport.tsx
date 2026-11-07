import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { toast } from 'sonner';
import AcademicMarkdown from '@/components/AcademicMarkdown';
import lightLogoUrl from '@/assets/econnotes-brand-light.png';
import darkLogoUrl from '@/assets/econnotes-brand-dark.png';
import { APP_VERSION_LABEL } from '@/lib/version';
import { AssistantSolveMode } from '@/lib/assistantClient';

export interface AssistantPdfQuestionItem {
  questionText: string;
  answerMarkdown: string;
  images?: Array<{ name: string; previewUrl: string }>;
  documentName?: string;
}

export interface AssistantPdfExportPayload {
  title?: string;
  mode: AssistantSolveMode;
  studentName?: string;
  createdAt?: string;
  items: AssistantPdfQuestionItem[];
}

export interface ChatTurnLike {
  role: 'user' | 'assistant';
  content: string;
  images?: Array<{ name: string; previewUrl: string }>;
  documentName?: string;
}

const MODE_LABELS: Record<AssistantSolveMode, string> = {
  step_by_step: 'Adım Adım Soru Çözümü',
  check_solution: 'Çözüm Kontrolü & Hata Analizi',
  concept: 'Konu & Formül Anlatımı',
};

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function resolveAssetUrl(assetPath: string): string {
  if (!assetPath) return '';
  if (
    assetPath.startsWith('data:') ||
    assetPath.startsWith('http://') ||
    assetPath.startsWith('https://') ||
    assetPath.startsWith('blob:')
  ) {
    return assetPath;
  }
  try {
    if (typeof window !== 'undefined' && window.location?.origin) {
      return new URL(assetPath, window.location.origin).href;
    }
  } catch {
    // ignore URL resolution errors in non-browser test runners
  }
  return assetPath;
}

export function isExportableAssistantAnswer(content: string): boolean {
  const trimmed = (content || '').trim();
  if (!trimmed) return false;
  if (
    trimmed === 'Yanıt alınamadı.' ||
    trimmed.startsWith('Üzgünüm, şu anda yanıt oluşturulamadı') ||
    trimmed.startsWith('Bir hata oluştu')
  ) {
    return false;
  }
  return true;
}

/**
 * Extracts solved (user -> assistant) question pairs from the Academic Assistant chat history,
 * skipping the initial welcome greeting message at index 0 and transient error stubs.
 */
export function extractExportableQuestionPairs(
  messages: ChatTurnLike[],
  targetAssistantIndex?: number,
): AssistantPdfQuestionItem[] {
  if (!Array.isArray(messages) || messages.length < 2) return [];

  if (typeof targetAssistantIndex === 'number') {
    const assistantMsg = messages[targetAssistantIndex];
    if (
      !assistantMsg ||
      assistantMsg.role !== 'assistant' ||
      targetAssistantIndex <= 0 ||
      !isExportableAssistantAnswer(assistantMsg.content)
    ) {
      return [];
    }
    // Find nearest preceding user turn
    let userMsg: ChatTurnLike | undefined;
    for (let i = targetAssistantIndex - 1; i >= 0; i--) {
      if (messages[i]?.role === 'user') {
        userMsg = messages[i];
        break;
      }
    }
    if (!userMsg) return [];
    return [
      {
        questionText: userMsg.content,
        answerMarkdown: assistantMsg.content,
        images: userMsg.images,
        documentName: userMsg.documentName,
      },
    ];
  }

  const pairs: AssistantPdfQuestionItem[] = [];
  for (let i = 1; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role === 'assistant' && isExportableAssistantAnswer(msg.content)) {
      let prevUser: ChatTurnLike | undefined;
      for (let j = i - 1; j >= 0; j--) {
        if (messages[j]?.role === 'user') {
          prevUser = messages[j];
          break;
        }
      }
      if (prevUser) {
        pairs.push({
          questionText: prevUser.content,
          answerMarkdown: msg.content,
          images: prevUser.images,
          documentName: prevUser.documentName,
        });
      }
    }
  }
  return pairs;
}

function renderMarkdownWithVectorMath(markdown: string): string {
  return renderToStaticMarkup(<AcademicMarkdown content={markdown || ''} />);
}

/**
 * Builds a complete, publication-grade A4 HTML+MathML document styled with the official
 * EconNotes royal-blue theme, dark/light logos, subtle diagonal watermark, embedded question
 * images, and 100% vector MathML equations & Gauss-Jordan augmented matrices.
 */
export function buildAssistantPdfHtml(payload: AssistantPdfExportPayload): string {
  const resolvedLightLogo = resolveAssetUrl(lightLogoUrl);
  const resolvedDarkLogo = resolveAssetUrl(darkLogoUrl);
  const baseHref =
    typeof window !== 'undefined' && window.location?.origin ? `${window.location.origin}/` : '';

  const formattedDate =
    payload.createdAt ||
    new Date().toLocaleString('tr-TR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const modeLabel = MODE_LABELS[payload.mode] || MODE_LABELS.step_by_step;
  const isMulti = payload.items.length > 1;
  const docTitle =
    payload.title?.trim() ||
    (isMulti
      ? `EconNotes Akademik Asistan — ${payload.items.length} Soruluk Çözüm Kitapçığı`
      : 'EconNotes Akademik Asistan — Soru ve Adım Adım Çözüm Raporu');

  const itemsHtml = payload.items
    .map((item, idx) => {
      const questionRendered = renderMarkdownWithVectorMath(item.questionText);
      const answerRendered = renderMarkdownWithVectorMath(item.answerMarkdown);

      const imagesGalleryHtml =
        item.images && item.images.length > 0
          ? `<div class="question-images">
              ${item.images
                .map(
                  (img) => `
                <figure class="question-figure">
                  <img src="${escapeHtml(resolveAssetUrl(img.previewUrl))}" alt="${escapeHtml(img.name)}" />
                  <figcaption>${escapeHtml(img.name)}</figcaption>
                </figure>`,
                )
                .join('')}
            </div>`
          : '';

      const docBadgeHtml = item.documentName
        ? `<div class="doc-attachment-badge">📄 Ekli Ders Notu / Belge: <strong>${escapeHtml(item.documentName)}</strong></div>`
        : '';

      return `
      <article class="qa-section ${idx > 0 ? 'qa-page-gap' : ''}">
        <div class="qa-number-bar">
          <span class="qa-badge">${isMulti ? `SORU ${idx + 1} / ${payload.items.length}` : 'SORU & AKADEMİK ÇÖZÜM'}</span>
          <span class="qa-mode-tag">${escapeHtml(modeLabel)}</span>
        </div>

        <div class="question-card">
          <div class="card-kicker">📌 ÖĞRENCİNİN SORUSU</div>
          ${docBadgeHtml}
          ${imagesGalleryHtml}
          <div class="question-body">${questionRendered}</div>
        </div>

        <div class="solution-card">
          <div class="card-kicker solution-kicker">✍️ ECONNOTES ADIM ADIM ÇÖZÜMÜ</div>
          <div class="pdf-solution">${answerRendered}</div>
        </div>
      </article>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  ${baseHref ? `<base href="${escapeHtml(baseHref)}" />` : ''}
  <title>${escapeHtml(docTitle)}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 13mm 13mm 15mm 13mm;
    }

    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }

    html, body {
      margin: 0;
      padding: 0;
      background: #eef3fb;
      color: #0f172a;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 10.6pt;
      line-height: 1.62;
    }

    /* Interactive Preview Toolbar (hidden when saving/printing to PDF) */
    .preview-toolbar {
      position: sticky;
      top: 0;
      z-index: 50;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 22px;
      background: linear-gradient(115deg, #07152e 0%, #003791 60%, #0066c4 100%);
      color: #ffffff;
      box-shadow: 0 6px 24px rgba(0, 35, 95, 0.28);
      border-bottom: 1px solid rgba(255, 255, 255, 0.16);
    }

    .toolbar-left {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .toolbar-logo {
      height: 30px;
      width: auto;
      object-fit: contain;
    }

    .toolbar-hint {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.88);
    }

    .toolbar-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .btn-print {
      appearance: none;
      border: 1px solid rgba(255, 255, 255, 0.35);
      background: #ffffff;
      color: #003791;
      font-weight: 700;
      font-size: 13px;
      padding: 8px 16px;
      border-radius: 999px;
      cursor: pointer;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
    }

    .btn-print:hover {
      background: #f0f7ff;
    }

    .btn-close {
      appearance: none;
      border: 1px solid rgba(255, 255, 255, 0.28);
      background: rgba(255, 255, 255, 0.1);
      color: #ffffff;
      font-weight: 600;
      font-size: 12.5px;
      padding: 8px 13px;
      border-radius: 999px;
      cursor: pointer;
    }

    .btn-close:hover {
      background: rgba(255, 255, 255, 0.2);
    }

    /* A4 Sheet Container */
    .sheet-container {
      position: relative;
      max-width: 210mm;
      margin: 20px auto 36px;
      background: #ffffff;
      border-radius: 18px;
      padding: 22px 24px 26px;
      box-shadow: 0 16px 48px rgba(15, 23, 42, 0.1);
      overflow: hidden;
    }

    /* Subtle Diagonal EconNotes Brand Watermark */
    .watermark-layer {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .watermark-layer img {
      width: 340px;
      max-width: 62%;
      opacity: 0.042;
      transform: rotate(-24deg);
      object-fit: contain;
    }

    .content-layer {
      position: relative;
      z-index: 1;
    }

    /* Official EconNotes Royal-Blue Brand Header */
    .brand-banner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
      padding: 18px 22px;
      border-radius: 14px;
      background: linear-gradient(115deg, #002b73 0%, #0045a5 54%, #0070d1 100%);
      color: #ffffff;
      margin-bottom: 18px;
      border: 1px solid #003791;
    }

    .brand-left {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .brand-logo {
      height: 36px;
      max-width: 200px;
      object-fit: contain;
      object-position: left center;
    }

    .brand-subtitle {
      font-size: 9.5pt;
      font-weight: 600;
      letter-spacing: 0.04em;
      color: rgba(255, 255, 255, 0.9);
    }

    .brand-meta-box {
      background: rgba(255, 255, 255, 0.12);
      border: 1px solid rgba(255, 255, 255, 0.24);
      border-radius: 11px;
      padding: 9px 14px;
      text-align: right;
      font-size: 8.8pt;
      line-height: 1.48;
      color: #f8fafc;
      min-width: 195px;
    }

    .brand-meta-box strong {
      color: #ffffff;
      font-weight: 700;
    }

    /* Question & Solution Sections */
    .qa-section {
      margin-bottom: 22px;
    }

    .qa-page-gap {
      padding-top: 14px;
      border-top: 2px dashed #cbd5e1;
    }

    .qa-number-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 9px;
    }

    .qa-badge {
      display: inline-block;
      background: #003791;
      color: #ffffff;
      font-size: 8.5pt;
      font-weight: 800;
      letter-spacing: 0.07em;
      padding: 3px 11px;
      border-radius: 999px;
    }

    .qa-mode-tag {
      display: inline-block;
      background: #eff6ff;
      color: #0045a5;
      border: 1px solid #bfdbfe;
      font-size: 8.5pt;
      font-weight: 600;
      padding: 2.5px 10px;
      border-radius: 999px;
    }

    .question-card {
      background: #f4f8ff;
      border: 1.5px solid #bfdbfe;
      border-left: 5px solid #0045a5;
      border-radius: 12px;
      padding: 13px 16px;
      margin-bottom: 13px;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .card-kicker {
      font-size: 8.5pt;
      font-weight: 800;
      letter-spacing: 0.07em;
      text-transform: uppercase;
      color: #003791;
      margin-bottom: 7px;
    }

    .solution-kicker {
      color: #0058b8;
      padding-bottom: 6px;
      border-bottom: 1px solid #dbeafe;
      margin-bottom: 10px;
    }

    .doc-attachment-badge {
      display: inline-block;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 4px 10px;
      font-size: 9pt;
      color: #1e293b;
      margin-bottom: 8px;
    }

    .question-images {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin: 6px 0 10px;
    }

    .question-figure {
      margin: 0;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      padding: 8px;
      max-width: 100%;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .question-figure img {
      display: block;
      max-width: 100%;
      max-height: 310px;
      width: auto;
      height: auto;
      object-fit: contain;
      border-radius: 6px;
      margin: 0 auto;
    }

    .question-figure figcaption {
      margin-top: 4px;
      font-size: 8pt;
      color: #64748b;
      text-align: center;
    }

    .question-body {
      color: #0f172a;
      font-weight: 500;
    }

    .solution-card {
      background: #ffffff;
      border: 1.5px solid #dbeafe;
      border-radius: 12px;
      padding: 15px 18px;
    }

    /* Typography & Vector MathML inside Solution */
    .academic-markdown p {
      margin: 6px 0;
    }

    .academic-markdown h2,
    .academic-markdown h3 {
      color: #003791;
      font-size: 12pt;
      font-weight: 800;
      margin: 14px 0 6px;
      padding-bottom: 4px;
      border-bottom: 1px solid #e2e8f0;
      break-after: avoid;
      page-break-after: avoid;
    }

    .academic-markdown h4,
    .academic-markdown h5 {
      color: #1e3a8a;
      font-size: 10.8pt;
      font-weight: 700;
      margin: 11px 0 5px;
      break-after: avoid;
      page-break-after: avoid;
    }

    .academic-markdown ul,
    .academic-markdown ol {
      margin: 6px 0;
      padding-left: 20px;
    }

    .academic-markdown li {
      margin: 3.5px 0;
    }

    .academic-markdown strong {
      color: #0f172a;
      font-weight: 700;
    }

    .academic-markdown hr {
      border: 0;
      border-top: 1px solid #e2e8f0;
      margin: 12px 0;
    }

    .academic-blockquote {
      margin: 9px 0;
      padding: 8px 13px;
      border-left: 4px solid #0070d1;
      background: #eff6ff;
      border-radius: 0 9px 9px 0;
      color: #0f172a;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .academic-display-math {
      margin: 9px 0;
      padding: 10px 14px;
      background: #f8fbff;
      border: 1px solid #dbeafe;
      border-radius: 10px;
      text-align: center;
      overflow-x: auto;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .academic-inline-math {
      display: inline-block;
      vertical-align: middle;
      margin: 0 1px;
    }

    .academic-inline-code {
      background: #f1f5f9;
      border: 1px solid #e2e8f0;
      border-radius: 5px;
      padding: 1px 5px;
      font-family: 'Consolas', 'SFMono-Regular', Menlo, monospace;
      font-size: 0.88em;
      color: #0f172a;
    }

    .academic-code-block {
      margin: 10px 0;
      border-radius: 10px;
      border: 1px solid #1e293b;
      background: #0f172a;
      color: #f8fafc;
      overflow: hidden;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .academic-code-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 5px 12px;
      background: #1e293b;
      color: #cbd5e1;
      font-size: 8.5pt;
      font-family: monospace;
      text-transform: uppercase;
    }

    .academic-copy-btn {
      display: none !important;
    }

    .academic-code-block pre {
      margin: 0;
      padding: 10px 12px;
      font-size: 9pt;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
      color: #f8fafc;
    }

    .academic-table-wrap {
      margin: 10px 0;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      overflow: hidden;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .academic-table-wrap table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9.6pt;
    }

    .academic-table-wrap th {
      background: #eff6ff;
      color: #003791;
      font-weight: 700;
      padding: 7px 10px;
      border-bottom: 1.5px solid #bfdbfe;
    }

    .academic-table-wrap td {
      padding: 6px 10px;
      border-bottom: 1px solid #e2e8f0;
    }

    .academic-table-wrap tr:nth-child(even) td {
      background: #f8fafc;
    }

    /* Native Vector MathML Rules */
    math.academic-math-block {
      font-size: 1.08em;
      line-height: 1.65;
    }

    math.academic-math-inline {
      font-size: 1.02em;
    }

    math .math-boxed {
      padding: 0.24em 0.6em;
      border: 1.8px solid #0058b8;
      border-radius: 7px;
      background: #eff6ff;
      color: #002b73;
      font-weight: 700;
    }

    math .math-bold {
      font-weight: 700;
    }

    math .math-italic {
      font-style: italic;
    }

    math mtd.math-cell {
      padding: 0.16em 0.42em;
      text-align: center;
    }

    math mtd.math-cell-left {
      text-align: left;
    }

    math mtd.math-cell-divider-right {
      border-right: 1.5px solid #334155;
      padding-right: 0.68em;
    }

    math mtd.math-cell-divider-left {
      padding-left: 0.68em;
    }

    /* Official Branded Footer */
    .report-footer {
      margin-top: 20px;
      padding-top: 11px;
      border-top: 1.5px solid #dbeafe;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      font-size: 8.5pt;
      color: #475569;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .footer-left {
      display: flex;
      align-items: center;
      gap: 9px;
    }

    .footer-logo {
      height: 20px;
      width: auto;
      object-fit: contain;
    }

    @media print {
      html, body {
        background: #ffffff !important;
      }
      .no-print {
        display: none !important;
      }
      .sheet-container {
        max-width: 100%;
        margin: 0;
        padding: 0;
        border-radius: 0;
        box-shadow: none;
      }
    }
  </style>
</head>
<body>
  <div class="preview-toolbar no-print">
    <div class="toolbar-left">
      <img class="toolbar-logo" src="${escapeHtml(resolvedDarkLogo)}" alt="EconNotes" />
      <span class="toolbar-hint">
        Yazdırma penceresinde <strong>"PDF olarak kaydet" (Save as PDF)</strong> seçeneğiyle tam vektörel kalitede indirebilirsiniz.
      </span>
    </div>
    <div class="toolbar-actions">
      <button type="button" class="btn-print" onclick="window.print()">🖨️ PDF Olarak Kaydet / Yazdır</button>
      <button type="button" class="btn-close" onclick="window.close()">✕ Kapat</button>
    </div>
  </div>

  <div class="sheet-container">
    <div class="watermark-layer" aria-hidden="true">
      <img src="${escapeHtml(resolvedLightLogo)}" alt="" />
    </div>

    <div class="content-layer">
      <header class="brand-banner">
        <div class="brand-left">
          <img class="brand-logo" src="${escapeHtml(resolvedDarkLogo)}" alt="EconNotes" />
          <div class="brand-subtitle">AKADEMİK ASİSTAN · MATEMATİK &amp; MÜHENDİSLİK ÇÖZÜM RAPORU</div>
        </div>
        <div class="brand-meta-box">
          ${payload.studentName ? `<div>Öğrenci: <strong>${escapeHtml(payload.studentName)}</strong></div>` : ''}
          <div>Mod: <strong>${escapeHtml(modeLabel)}</strong></div>
          <div>Kapsam: <strong>${payload.items.length} Soru &amp; Tam Çözüm</strong></div>
          <div>Tarih: <strong>${escapeHtml(formattedDate)}</strong></div>
        </div>
      </header>

      ${itemsHtml}

      <footer class="report-footer">
        <div class="footer-left">
          <img class="footer-logo" src="${escapeHtml(resolvedLightLogo)}" alt="EconNotes" />
          <span><strong>EconNotes Akademik Asistan</strong> · econnotes.online · Üniversite Çalışma Merkezi</span>
        </div>
        <div>${escapeHtml(APP_VERSION_LABEL)}</div>
      </footer>
    </div>
  </div>

  <script>
    (function () {
      var printed = false;
      function waitForImages() {
        var imgs = Array.prototype.slice.call(document.images || []);
        return Promise.all(
          imgs.map(function (img) {
            if (img.complete) return Promise.resolve();
            return new Promise(function (resolve) {
              var timer = setTimeout(resolve, 2500);
              function done() {
                clearTimeout(timer);
                resolve();
              }
              img.onload = done;
              img.onerror = done;
            });
          })
        );
      }
      function triggerAutoPrint() {
        if (printed) return;
        printed = true;
        waitForImages().then(function () {
          setTimeout(function () {
            window.focus();
            window.print();
          }, 220);
        });
      }
      if (document.readyState === 'complete') {
        triggerAutoPrint();
      } else {
        window.addEventListener('load', triggerAutoPrint);
        setTimeout(triggerAutoPrint, 900);
      }
    })();
  </script>
</body>
</html>`;
}

/**
 * Exports one or multiple Academic Assistant question-solution pairs as a full-quality
 * EconNotes-branded A4 PDF. Uses synchronous popup opening (never blocked on user click)
 * with an automatic offscreen iframe print fallback if popups are restricted.
 */
export function exportAssistantQuestionsToPdf(payload: AssistantPdfExportPayload): void {
  if (!payload.items || payload.items.length === 0) {
    toast.warning('Dışa aktarılacak çözülmüş bir soru bulunamadı.');
    return;
  }

  // Open window synchronously inside click gesture so mobile/desktop browsers never block it
  const popup = typeof window !== 'undefined' ? window.open('', '_blank', 'width=980,height=1040') : null;
  const html = buildAssistantPdfHtml(payload);

  if (popup) {
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
    toast.success('EconNotes PDF raporu hazırlandı. "PDF olarak kaydet" ile indirebilirsiniz.');
    return;
  }

  // Fallback: print via hidden iframe when running inside strict popup-blocking WebViews
  if (typeof document !== 'undefined') {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.setAttribute('aria-hidden', 'true');
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (doc && iframe.contentWindow) {
      doc.open();
      doc.write(
        html.replace(
          'window.print();',
          '/* handled by parent */',
        ),
      );
      doc.close();

      const triggerPrint = () => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          toast.success('EconNotes PDF yazdırma ekranı açıldı.');
        } catch {
          toast.error('PDF penceresi açılamadı. Tarayıcı pop-up iznini kontrol edin.');
        } finally {
          window.setTimeout(() => {
            iframe.remove();
          }, 60_000);
        }
      };

      window.setTimeout(triggerPrint, 500);
      return;
    }
    iframe.remove();
  }

  toast.error('PDF penceresi açılamadı. Tarayıcı pop-up iznini açıp tekrar deneyin.');
}
