import { toast } from 'sonner';

export interface ReportQuestion {
  question: string;
  options?: string[];
  correctIndex: number;
  picked?: number | null;
  solution?: string;
  optionAnalysis?: string[];
  topic?: string;
}

export interface ReportPayload {
  title: string;
  subject: string;
  topic?: string | null;
  difficulty?: string | null;
  examGroup?: string | null;
  score: number;
  total: number;
  date: string;
  userName?: string;
  questions: ReportQuestion[];
  weakTopics?: { topic: string; wrong: number; total: number }[];
}

const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const letter = (i: number) => String.fromCharCode(65 + i);

const diffLabel = (d?: string | null) =>
  d === 'easy' ? 'Kolay' : d === 'hard' ? 'Zor' : d === 'medium' ? 'Orta' : (d || '-');

function buildHtml(p: ReportPayload) {
  const pct = p.total ? Math.round((p.score / p.total) * 100) : 0;

  const questions = p.questions
    .map((q, i) => {
      const isWrong = q.picked != null && q.picked !== q.correctIndex;
      const isBlank = q.picked == null;
      const stateLabel = isBlank ? 'Boş' : isWrong ? 'Yanlış' : 'Doğru';
      const stateClass = isBlank ? 'blank' : isWrong ? 'wrong' : 'right';

      const options = (q.options || [])
        .map((opt, oi) => {
          const cls = oi === q.correctIndex ? 'opt correct' : oi === q.picked ? 'opt picked' : 'opt';
          const tag =
            oi === q.correctIndex ? ' &nbsp;<b>[Doğru cevap]</b>' : oi === q.picked ? ' &nbsp;<b>[Senin cevabın]</b>' : '';
          return `<div class="${cls}"><span class="ltr">${letter(oi)})</span> ${esc(opt)}${tag}</div>`;
        })
        .join('');

      const analysis = (q.optionAnalysis || [])
        .map((a, ai) => `<li><b>${letter(ai)})</b> ${esc(a)}</li>`)
        .join('');

      return `
      <section class="q">
        <div class="qhead">
          <h3>${i + 1}. ${esc(q.question)}</h3>
          <span class="pill ${stateClass}">${stateLabel}</span>
        </div>
        ${q.topic ? `<div class="topic">Konu: ${esc(q.topic)}</div>` : ''}
        <div class="opts">${options}</div>
        ${q.solution ? `<div class="sol"><span class="sollabel">Tam çözüm</span><p>${esc(q.solution)}</p></div>` : ''}
        ${analysis ? `<div class="sol alt"><span class="sollabel">Şık analizi</span><ul>${analysis}</ul></div>` : ''}
      </section>`;
    })
    .join('');

  const weak = (p.weakTopics || []).length
    ? `<div class="weak">
        <h2>Tekrar etmen gereken konular</h2>
        <ul>
          ${(p.weakTopics || [])
            .map(
              (w) =>
                `<li><b>${esc(w.topic)}</b> — ${w.wrong}/${w.total} yanlış (${Math.round(
                  (w.wrong / Math.max(w.total, 1)) * 100,
                )}% hata oranı)</li>`,
            )
            .join('')}
        </ul>
      </div>`
    : '';

  return `<!doctype html>
<html lang="tr"><head><meta charset="utf-8" />
<title>${esc(p.title)} - EconNotes KPSS Sonuç Raporu</title>
<style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color:#0f172a; margin:0; font-size:11.5px; line-height:1.55; }
  h1 { font-size:20px; margin:0 0 4px; }
  h2 { font-size:14px; margin:0 0 8px; }
  h3 { font-size:12.5px; margin:0; font-weight:700; }
  .brand { display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2px solid #1e40af; padding-bottom:10px; margin-bottom:14px; }
  .brand small { color:#475569; }
  .meta { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:14px; }
  .chip { border:1px solid #cbd5e1; border-radius:999px; padding:2px 9px; font-size:10.5px; color:#334155; }
  .scorebox { border:1px solid #1e40af; background:#eff6ff; border-radius:10px; padding:12px 14px; margin-bottom:16px; }
  .scorebox .big { font-size:22px; font-weight:800; color:#1e40af; }
  .weak { border:1px solid #f59e0b; background:#fffbeb; border-radius:10px; padding:12px 14px; margin-bottom:16px; }
  .weak ul { margin:0; padding-left:18px; }
  .q { border:1px solid #e2e8f0; border-radius:10px; padding:11px 13px; margin-bottom:10px; page-break-inside:avoid; }
  .qhead { display:flex; justify-content:space-between; gap:10px; align-items:flex-start; }
  .pill { font-size:9.5px; font-weight:700; padding:2px 8px; border-radius:999px; white-space:nowrap; }
  .pill.right { background:#dcfce7; color:#166534; }
  .pill.wrong { background:#fee2e2; color:#991b1b; }
  .pill.blank { background:#e2e8f0; color:#475569; }
  .topic { font-size:10px; color:#64748b; margin-top:3px; }
  .opts { margin-top:7px; }
  .opt { padding:3px 7px; border-radius:6px; border:1px solid transparent; }
  .opt.correct { background:#f0fdf4; border-color:#86efac; }
  .opt.picked { background:#fef2f2; border-color:#fca5a5; }
  .ltr { font-weight:700; color:#475569; }
  .sol { margin-top:8px; background:#f8fafc; border-left:3px solid #1e40af; padding:7px 10px; border-radius:0 8px 8px 0; }
  .sol.alt { border-left-color:#7c3aed; }
  .sol p { margin:3px 0 0; white-space:pre-wrap; }
  .sol ul { margin:4px 0 0; padding-left:18px; }
  .sollabel { font-size:9.5px; text-transform:uppercase; letter-spacing:.08em; font-weight:700; color:#1e40af; }
  .foot { margin-top:16px; border-top:1px solid #e2e8f0; padding-top:8px; font-size:9.5px; color:#64748b; }
</style></head>
<body>
  <div class="brand">
    <div><h1>EconNotes · KPSS Sonuç Raporu</h1><small>${esc(p.title)}</small></div>
    <small>${esc(p.date)}</small>
  </div>
  <div class="meta">
    <span class="chip">Ders: ${esc(p.subject)}</span>
    ${p.topic ? `<span class="chip">Konu: ${esc(p.topic)}</span>` : ''}
    <span class="chip">Zorluk: ${esc(diffLabel(p.difficulty))}</span>
    ${p.examGroup ? `<span class="chip">${esc(p.examGroup)}</span>` : ''}
    ${p.userName ? `<span class="chip">${esc(p.userName)}</span>` : ''}
  </div>
  <div class="scorebox">
    <div class="big">${p.score} / ${p.total} doğru · %${pct}</div>
    <div>Yanlış: ${p.questions.filter((q) => q.picked != null && q.picked !== q.correctIndex).length} · Boş: ${p.questions.filter((q) => q.picked == null).length}</div>
  </div>
  ${weak}
  <h2>Soru bazlı çözümler</h2>
  ${questions}
  <div class="foot">Bu rapor EconNotes KPSS Çalışma Merkezi tarafından üretildi. İçerik yapay zeka desteklidir; resmi ÖSYM kaynaklarıyla doğrulayınız.</div>
</body></html>`;
}

/** Opens the browser print dialog with a styled report (Save as PDF). Unicode/Turkish safe. */
export function downloadKpssReport(payload: ReportPayload) {
  const html = buildHtml(payload);
  const win = window.open('', '_blank', 'width=900,height=1000');
  if (!win) {
    toast.error('Tarayıcı yeni sekmeyi engelledi. Pop-up iznini açıp tekrar dene.');
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => {
    win.print();
  }, 400);
  toast.success('Rapor hazır. Yazdırma ekranından "PDF olarak kaydet" seç.');
}
