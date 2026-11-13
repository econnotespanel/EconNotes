import { APP_VERSION_LABEL } from '@/lib/version';

export interface LectureSummaryReport {
  title: string;
  course?: string;
  generatedAt?: string;
  overview: string;
  keyPoints: string[];
  sections: Array<{
    heading: string;
    pageRange?: string;
    content: string;
    takeaways?: string[];
    deepResearchNote?: string;
    commonPitfalls?: string[];
  }>;
  teacherEmphasis?: Array<{ point: string; whyImportant: string; examProbability?: string }>;
  comparativeMatrix?: {
    title: string;
    columns: string[];
    rows: string[][];
  };
  deepResearchTopics?: Array<{
    topic: string;
    literatureContext: string;
    realWorldApplication?: string;
  }>;
  keyTerms?: Array<{ term: string; definition: string; formula?: string }>;
  studyChecklist?: string[];
  transcriptExcerpt?: string;
  metadata?: {
    durationSeconds?: number;
    chunkCount?: number;
    capturedAt?: string;
    model?: string;
    sourceMode?: string;
    deepResearch?: boolean;
  };
}

function escapeHtml(text: string): string {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatInlineMarkdownHtml(raw: string): string {
  let escaped = escapeHtml(raw);
  escaped = escaped.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  escaped = escaped.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  escaped = escaped.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  return escaped;
}

function renderMarkdownBlockToHtml(markdown: string): string {
  const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
  const html: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // Markdown table block
    if (trimmed.startsWith('|') && i + 1 < lines.length && lines[i + 1].trim().startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i].trim());
        i++;
      }
      const parseRow = (row: string) =>
        row
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((cell) => cell.trim());

      const headers = parseRow(tableLines[0]);
      const bodyRows = tableLines.slice(2).map(parseRow);
      html.push(
        `<table><thead><tr>${headers
          .map((h) => `<th>${formatInlineMarkdownHtml(h)}</th>`)
          .join('')}</tr></thead><tbody>${bodyRows
          .map((r) => `<tr>${r.map((c) => `<td>${formatInlineMarkdownHtml(c)}</td>`).join('')}</tr>`)
          .join('')}</tbody></table>`,
      );
      continue;
    }

    // Headings
    const hMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (hMatch) {
      const level = Math.min(4, Math.max(2, hMatch[1].length + 1));
      html.push(`<h${level}>${formatInlineMarkdownHtml(hMatch[2])}</h${level}>`);
      i++;
      continue;
    }

    // Unordered list
    if (/^[-•*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-•*]\s+/.test(lines[i].trim())) {
        items.push(`<li>${formatInlineMarkdownHtml(lines[i].trim().replace(/^[-•*]\s+/, ''))}</li>`);
        i++;
      }
      html.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(formatInlineMarkdownHtml(lines[i].trim().replace(/^>\s?/, '')));
        i++;
      }
      html.push(`<blockquote>${quoteLines.join('<br/>')}</blockquote>`);
      continue;
    }

    // Paragraph
    const paraLines: string[] = [formatInlineMarkdownHtml(trimmed)];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,4}\s+|[-•*]\s+|\||>)/.test(lines[i].trim())
    ) {
      paraLines.push(formatInlineMarkdownHtml(lines[i].trim()));
      i++;
    }
    html.push(`<p>${paraLines.join(' ')}</p>`);
  }

  return html.join('\n');
}

export function buildLectureSummaryHtml(report: LectureSummaryReport): string {
  const dateStr = report.generatedAt || new Date().toLocaleString('tr-TR');
  const durMin = report.metadata?.durationSeconds
    ? Math.max(1, Math.round(report.metadata.durationSeconds / 60))
    : null;

  const metaParts = [
    report.course ? `Ders: ${escapeHtml(report.course)}` : null,
    `Tarih: ${escapeHtml(dateStr)}`,
    durMin ? `Kayıt Süresi: ~${durMin} dk` : null,
    report.metadata?.deepResearch ? 'Mod: Derin Akademik Araştırma' : null,
  ].filter(Boolean);

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(report.title)} — EconNotes Ders Raporu</title>
  <style>
    :root { --bg: #ffffff; --fg: #121826; --muted: #5a6578; --accent: #1d4ed8; --border: #e2e8f0; --soft: #f8fafc; --research-bg: #eef2ff; --research-border: #6366f1; --warn-bg: #fff7ed; --warn-border: #f97316; }
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; color: var(--fg); background: var(--bg); line-height: 1.72; max-width: 900px; margin: 40px auto; padding: 0 28px; }
    header { border-bottom: 2px solid var(--accent); padding-bottom: 18px; margin-bottom: 26px; }
    .brand { font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--accent); font-weight: 700; }
    h1 { font-size: 27px; margin: 8px 0 8px; line-height: 1.25; }
    .meta { color: var(--muted); font-size: 13px; display: flex; flex-wrap: wrap; gap: 14px; }
    h2 { font-size: 18px; margin-top: 28px; padding-bottom: 6px; border-bottom: 1px solid var(--border); color: var(--accent); }
    h3 { font-size: 15px; margin-top: 16px; margin-bottom: 6px; color: #0f172a; }
    h4 { font-size: 14px; margin-top: 14px; margin-bottom: 4px; color: #1e293b; }
    .card { background: var(--soft); border: 1px solid var(--border); border-radius: 10px; padding: 18px 20px; margin: 16px 0; }
    .section { border-left: 3px solid var(--accent); padding-left: 16px; margin: 22px 0; }
    .section-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
    .page-tag { font-size: 11px; background: var(--soft); border: 1px solid var(--border); border-radius: 99px; padding: 2px 9px; color: var(--muted); }
    .research-box { background: var(--research-bg); border-left: 3px solid var(--research-border); padding: 12px 14px; border-radius: 8px; margin-top: 12px; font-size: 14px; }
    .pitfall-box { background: var(--warn-bg); border-left: 3px solid var(--warn-border); padding: 10px 14px; border-radius: 8px; margin-top: 10px; font-size: 13.5px; }
    .takeaways { margin-top: 10px; padding: 10px 14px; background: var(--soft); border-radius: 8px; }
    .term-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
    .term-card { border: 1px solid var(--border); border-radius: 8px; padding: 12px 14px; }
    .term-name { font-weight: 700; color: var(--fg); margin-bottom: 4px; }
    .exam-item { border: 1px solid #fecaca; background: #fef2f2; border-radius: 8px; padding: 11px 14px; margin: 8px 0; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13.5px; }
    th, td { border: 1px solid var(--border); padding: 8px 10px; text-align: left; vertical-align: top; }
    th { background: var(--soft); font-weight: 600; }
    blockquote { margin: 10px 0; padding: 8px 14px; border-left: 3px solid #cbd5e1; color: #334155; background: #f8fafc; }
    code { font-family: ui-monospace, monospace; background: #f1f5f9; padding: 1px 5px; border-radius: 4px; font-size: 0.9em; }
    ul { padding-left: 20px; margin: 8px 0; }
    li { margin: 4px 0; }
    footer { margin-top: 40px; padding-top: 14px; border-top: 1px solid var(--border); font-size: 12px; color: var(--muted); text-align: center; }
    @media print { body { margin: 16px auto; } .section, .card { break-inside: avoid; } }
  </style>
</head>
<body>
  <header>
    <div class="brand">EconNotes Çalışma Stüdyosu • Akademik Ders & Araştırma Raporu (${escapeHtml(APP_VERSION_LABEL)})</div>
    <h1>${escapeHtml(report.title)}</h1>
    <div class="meta">${metaParts.map((m) => `<span>${m}</span>`).join('')}</div>
  </header>

  <section class="card">
    <h2 style="margin-top:0; border:none;">Yönetici Özeti</h2>
    ${renderMarkdownBlockToHtml(report.overview)}
  </section>

  ${
    report.keyPoints?.length
      ? `<h2>Temel Çıkarımlar</h2>
  <ul>${report.keyPoints.map((kp) => `<li>${formatInlineMarkdownHtml(kp)}</li>`).join('')}</ul>`
      : ''
  }

  ${
    report.comparativeMatrix?.columns?.length && report.comparativeMatrix?.rows?.length
      ? `<h2>${escapeHtml(report.comparativeMatrix.title || 'Karşılaştırma Matrisi')}</h2>
  <table>
    <thead><tr>${report.comparativeMatrix.columns.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>
    <tbody>${report.comparativeMatrix.rows
      .map((r) => `<tr>${r.map((cell) => `<td>${formatInlineMarkdownHtml(cell)}</td>`).join('')}</tr>`)
      .join('')}</tbody>
  </table>`
      : ''
  }

  <h2>Bölüm Bölüm Derin Ders Analizi</h2>
  ${report.sections
    .map(
      (sec) => `
    <div class="section">
      <div class="section-head">
        <h3 style="margin-top:0; color:#1d4ed8;">${escapeHtml(sec.heading)}</h3>
        ${sec.pageRange ? `<span class="page-tag">${escapeHtml(sec.pageRange)}</span>` : ''}
      </div>
      ${renderMarkdownBlockToHtml(sec.content)}
      ${
        sec.deepResearchNote
          ? `<div class="research-box"><strong>Derin Akademik Araştırma:</strong> ${renderMarkdownBlockToHtml(
              sec.deepResearchNote,
            )}</div>`
          : ''
      }
      ${
        sec.commonPitfalls?.length
          ? `<div class="pitfall-box"><strong>Sık Yapılan Kavram Hataları:</strong><ul>${sec.commonPitfalls
              .map((p) => `<li>${formatInlineMarkdownHtml(p)}</li>`)
              .join('')}</ul></div>`
          : ''
      }
      ${
        sec.takeaways?.length
          ? `<div class="takeaways"><strong>Öne Çıkan Çıkarımlar:</strong><ul>${sec.takeaways
              .map((t) => `<li>${formatInlineMarkdownHtml(t)}</li>`)
              .join('')}</ul></div>`
          : ''
      }
    </div>`,
    )
    .join('')}

  ${
    report.deepResearchTopics?.length
      ? `<h2>İleri Okuma & Literatür Bağlamı</h2>
  ${report.deepResearchTopics
    .map(
      (d) => `<div class="card">
      <strong>${escapeHtml(d.topic)}</strong>
      <p>${formatInlineMarkdownHtml(d.literatureContext)}</p>
      ${d.realWorldApplication ? `<p><em>Uygulama / Türkiye Bağlamı:</em> ${formatInlineMarkdownHtml(d.realWorldApplication)}</p>` : ''}
    </div>`,
    )
    .join('')}`
      : ''
  }

  ${
    report.teacherEmphasis?.length
      ? `<h2>Sınav Odaklı Kritik Noktalar</h2>
  ${report.teacherEmphasis
    .map(
      (e) => `<div class="exam-item"><strong>${escapeHtml(e.point)}</strong>${
        e.examProbability ? ` <em>(${escapeHtml(e.examProbability)})</em>` : ''
      }<br/><span>${formatInlineMarkdownHtml(e.whyImportant)}</span></div>`,
    )
    .join('')}`
      : ''
  }

  ${
    report.keyTerms?.length
      ? `<h2>Kavram & Formül Sözlüğü</h2>
  <div class="term-grid">
    ${report.keyTerms
      .map(
        (kt) => `<div class="term-card">
          <div class="term-name">${escapeHtml(kt.term)}</div>
          <div>${formatInlineMarkdownHtml(kt.definition)}</div>
          ${kt.formula ? `<p><code>${escapeHtml(kt.formula)}</code></p>` : ''}
        </div>`,
      )
      .join('')}
  </div>`
      : ''
  }

  ${
    report.studyChecklist?.length
      ? `<h2>Hakimiyet Kontrol Listesi</h2>
  <ul>${report.studyChecklist.map((c) => `<li>&#9744; ${formatInlineMarkdownHtml(c)}</li>`).join('')}</ul>`
      : ''
  }

  ${
    report.transcriptExcerpt
      ? `<h2>Kaynak / Transkript Kesiti</h2>
  <div class="card" style="white-space: pre-wrap; font-size: 13px;">${escapeHtml(report.transcriptExcerpt)}</div>`
      : ''
  }

  <footer>EconNotes Çalışma Stüdyosu tarafından akademik düzenlemeyle oluşturulmuştur.</footer>
</body>
</html>`;
}

export function downloadLectureSummary(report: LectureSummaryReport) {
  const html = buildLectureSummaryHtml(report);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const safeName = (report.title || 'ders-raporu')
    .toLowerCase()
    .replace(/[^a-z0-9çğıöşü_-]+/gi, '-')
    .replace(/^-|-$/g, '');
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName || 'ders-raporu'}-econnotes.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadLectureSummaryPdf(report: LectureSummaryReport) {
  const html = buildLectureSummaryHtml(report);
  const popup = window.open('', '_blank', 'width=960,height=780');
  if (!popup) {
    downloadLectureSummary(report);
    return;
  }
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  popup.focus();
  setTimeout(() => {
    try {
      popup.print();
    } catch {
      // ignore print errors in headless environments
    }
  }, 450);
}
