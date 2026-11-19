// EconNotes Akademik Video Stüdyosu — Yüksek Okunabilirlikli Sunum Sahnesi (1920x1080)
// Tüm üniversite fakülteleri için net tipografi, konu dışı karikatür/uydurma grafik olmadan
// doğrudan ders notuna sadık, masaüstü ve mobilde rahatça okunabilir editoryal slayt motoru.

import type { DiagramNode, Speaker, StudioScene, VisualTheme } from './sceneModel';
import type { Viseme } from './speechEngine';

export const STAGE_W = 1920;
export const STAGE_H = 1080;

export type StageLayoutMode = 'standard' | 'whiteboard' | 'focus';

export interface StageFrame {
  scene: StudioScene;
  sceneIndex: number;
  sceneCount: number;
  progress: number;
  overall: number;
  sceneTime: number;
  sentenceIndex: number;
  charInSentence: number;
  activeSpeaker: Speaker;
  playing: boolean;
  poster: boolean;
  now: number;
  courseLabel: string;
  showSubtitles: boolean;
  viseme: Viseme;
  mouthOpen: number;
  inBreathPause: boolean;
  layoutMode: StageLayoutMode;
  subtitleSize?: 'sm' | 'md' | 'lg';
}

interface Area {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ThemePalette {
  accent: string;
  accentSoft: string;
  accentSoftDark: string;
  secondary: string;
  badgeText: string;
  label: string;
}

const FONT_STACK = "'Inter', 'Plus Jakarta Sans', 'Segoe UI', system-ui, -apple-system, sans-serif";

const CARD_ACCENTS = ['#2563eb', '#0891b2', '#7c3aed', '#059669', '#d97706', '#e11d48'];

const THEME_PALETTES: Record<VisualTheme, ThemePalette> = {
  economics: {
    accent: '#2563eb',
    accentSoft: '#eff6ff',
    accentSoftDark: 'rgba(37, 99, 235, 0.18)',
    secondary: '#059669',
    badgeText: '#1d4ed8',
    label: 'İktisat & Finans',
  },
  history: {
    accent: '#b45309',
    accentSoft: '#fffbeb',
    accentSoftDark: 'rgba(217, 119, 6, 0.18)',
    secondary: '#78350f',
    badgeText: '#92400e',
    label: 'Tarih & Medeniyet',
  },
  law: {
    accent: '#4338ca',
    accentSoft: '#eef2ff',
    accentSoftDark: 'rgba(79, 70, 229, 0.18)',
    secondary: '#0f766e',
    badgeText: '#3730a3',
    label: 'Hukuk Bilimleri',
  },
  politics: {
    accent: '#0369a1',
    accentSoft: '#f0f9ff',
    accentSoftDark: 'rgba(2, 132, 199, 0.18)',
    secondary: '#7c3aed',
    badgeText: '#075985',
    label: 'Siyaset & Uluslararası İlişkiler',
  },
  medicine: {
    accent: '#e11d48',
    accentSoft: '#fff1f2',
    accentSoftDark: 'rgba(225, 29, 72, 0.18)',
    secondary: '#0d9488',
    badgeText: '#be123c',
    label: 'Tıp & Sağlık Bilimleri',
  },
  engineering: {
    accent: '#0891b2',
    accentSoft: '#ecfeff',
    accentSoftDark: 'rgba(8, 145, 178, 0.18)',
    secondary: '#4f46e5',
    badgeText: '#0e7490',
    label: 'Mühendislik & Teknoloji',
  },
  education: {
    accent: '#7c3aed',
    accentSoft: '#f5f3ff',
    accentSoftDark: 'rgba(124, 58, 237, 0.18)',
    secondary: '#d97706',
    badgeText: '#6d28d9',
    label: 'Eğitim Bilimleri',
  },
  sports: {
    accent: '#ea580c',
    accentSoft: '#fff7ed',
    accentSoftDark: 'rgba(234, 88, 12, 0.18)',
    secondary: '#059669',
    badgeText: '#c2410c',
    label: 'Spor Bilimleri',
  },
  agriculture: {
    accent: '#15803d',
    accentSoft: '#f0fdf4',
    accentSoftDark: 'rgba(21, 128, 61, 0.18)',
    secondary: '#ca8a04',
    badgeText: '#166534',
    label: 'Ziraat & Tarım Bilimleri',
  },
  science: {
    accent: '#0284c7',
    accentSoft: '#f0f9ff',
    accentSoftDark: 'rgba(2, 132, 199, 0.18)',
    secondary: '#7c3aed',
    badgeText: '#0369a1',
    label: 'Fen & Temel Bilimler',
  },
  society: {
    accent: '#4f46e5',
    accentSoft: '#eef2ff',
    accentSoftDark: 'rgba(79, 70, 229, 0.18)',
    secondary: '#0891b2',
    badgeText: '#4338ca',
    label: 'Sosyal & Beşeri Bilimler',
  },
};

const DIAGRAM_LABEL_TR: Record<string, string> = {
  visual: 'Temel Kavramlar',
  shapes: 'Yapısal İlişkiler',
  table: 'Özet Karşılaştırma Tablosu',
  chart: 'Öncelik ve Etki Analizi',
  curve: 'Denge ve İlişki Analizi',
  scenario: 'Vaka ve Süreç Akışı',
  timeline: 'Adım Adım Akış',
  comparison: 'Karşılaştırmalı Ayrım',
  structure: 'Temel Bileşenler',
  network: 'Kavram Bağlantıları',
};

function font(weight: number, size: number): string {
  return `${weight} ${size}px ${FONT_STACK}`;
}

function clamp(v: number, lo = 0, hi = 1): number {
  return Math.max(lo, Math.min(hi, v));
}

function rr(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number | number[],
): void {
  const radii = Array.isArray(r) ? r : [r, r, r, r];
  const [tl, tr, br, bl] = radii.map((rad) => Math.max(0, Math.min(rad, w / 2, h / 2)));
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + tr);
  ctx.lineTo(x + w, y + h - br);
  ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
  ctx.lineTo(x + bl, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - bl);
  ctx.lineTo(x, y + tl);
  ctx.quadraticCurveTo(x, y, x + tl, y);
  ctx.closePath();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines = 4,
): string[] {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const words = clean.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      if (current) {
        lines.push(current);
        if (lines.length >= maxLines) {
          // Son satırda kalan kelimeler varsa temizce üç nokta ile kısalt
          const last = lines[maxLines - 1];
          let trimmed = last;
          while (trimmed.length > 8 && ctx.measureText(`${trimmed}…`).width > maxWidth) {
            trimmed = trimmed.slice(0, -1).trimEnd();
          }
          lines[maxLines - 1] = `${trimmed}…`;
          return lines;
        }
      }
      // Tek kelime satırdan uzunsa güvenli kes
      if (ctx.measureText(word).width > maxWidth) {
        let piece = word;
        while (piece.length > 6 && ctx.measureText(`${piece}…`).width > maxWidth) {
          piece = piece.slice(0, -1);
        }
        current = piece;
      } else {
        current = word;
      }
    }
  }

  if (current && lines.length < maxLines) {
    lines.push(current);
  }
  return lines;
}

function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
): number {
  const lines = wrapText(ctx, text, maxWidth, maxLines);
  lines.forEach((line, idx) => {
    ctx.fillText(line, x, y + idx * lineHeight);
  });
  return lines.length * lineHeight;
}

function getActiveCardIndex(count: number, progress: number): number {
  if (count <= 1) return 0;
  return Math.min(count - 1, Math.floor(clamp(progress, 0, 0.999) * count));
}

function formatSecLabel(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function sanitizeCardCopy(text: string): string {
  return (text || '')
    .replace(/\*\*|__|`/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasGenuineNumericValues(nodes: DiagramNode[], narration: string): boolean {
  const numericInNarration = /%\s*\d|\d+\s*%|\b\d+([.,]\d+)?\s*(milyar|milyon|bin|kat|puan|tl|usd|mg|ml|kg|km|hz|watt|volt)\b/i.test(
    narration,
  );
  const vals = nodes.map((n) => n.value).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const hasExplicitVariety = vals.length >= 2 && new Set(vals).size >= 2;
  return numericInNarration && hasExplicitVariety;
}

// ============================================================================
// ÜST BAR, BAŞLIK VE CANLI KONUŞMACI GÖSTERGESİ
// ============================================================================

function drawTopBar(
  ctx: CanvasRenderingContext2D,
  f: StageFrame,
  palette: ThemePalette,
  dark: boolean,
): void {
  const barH = 82;
  ctx.save();
  ctx.fillStyle = dark ? '#080e1d' : '#ffffff';
  ctx.fillRect(0, 0, STAGE_W, barH);

  // Alt ince ayırıcı çizgi
  ctx.fillStyle = dark ? 'rgba(148, 163, 184, 0.16)' : '#e2e8f0';
  ctx.fillRect(0, barH - 1.5, STAGE_W, 1.5);

  // Sol: Ders & Alan Rozeti
  const courseText = (f.courseLabel || palette.label).slice(0, 34);
  ctx.font = font(700, 20);
  const courseW = Math.min(460, ctx.measureText(courseText).width + 44);
  rr(ctx, 56, 20, courseW, 42, 21);
  ctx.fillStyle = dark ? palette.accentSoftDark : palette.accentSoft;
  ctx.fill();
  ctx.strokeStyle = dark ? `${palette.accent}66` : `${palette.accent}33`;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = dark ? '#f8fafc' : palette.badgeText;
  ctx.textBaseline = 'middle';
  ctx.fillText(courseText, 78, 41);

  // Bölüm Sayacı + Slayt Tipi
  const chapterBadge = `BÖLÜM ${f.sceneIndex + 1} / ${f.sceneCount}  ·  ${
    DIAGRAM_LABEL_TR[f.scene.diagram.type] || 'Ders Özeti'
  }`;
  ctx.font = font(600, 19);
  ctx.fillStyle = dark ? '#94a3b8' : '#475569';
  ctx.fillText(chapterBadge, 56 + courseW + 22, 41);

  // Sağ: Aktif Konuşmacı Hapı + Canlı Ses Dalgası
  const isDeniz = f.activeSpeaker === 'Deniz';
  const spkLabel = isDeniz ? 'Dr. Deniz · Anlatıcı' : 'Barış · Soru & Özet';
  const spkColor = isDeniz ? '#0ea5e9' : '#f59e0b';
  ctx.font = font(700, 19);
  const spkW = ctx.measureText(spkLabel).width + 92;
  const spkX = STAGE_W - 56 - spkW;

  rr(ctx, spkX, 19, spkW, 44, 22);
  ctx.fillStyle = dark ? 'rgba(15, 23, 42, 0.95)' : '#f8fafc';
  ctx.fill();
  ctx.strokeStyle = f.playing ? spkColor : dark ? 'rgba(148, 163, 184, 0.25)' : '#cbd5e1';
  ctx.lineWidth = f.playing ? 2.2 : 1.5;
  ctx.stroke();

  // Canlı ses dalgası çubukları
  const waveBaseX = spkX + 20;
  for (let i = 0; i < 4; i++) {
    const activeWave = f.playing && !f.inBreathPause;
    const amp = activeWave
      ? 6 + Math.abs(Math.sin(f.now / 160 + i * 1.15)) * (10 + f.mouthOpen * 10)
      : 5;
    rr(ctx, waveBaseX + i * 7, 41 - amp / 2, 4.5, amp, 2);
    ctx.fillStyle = spkColor;
    ctx.fill();
  }

  ctx.fillStyle = dark ? '#f8fafc' : '#0f172a';
  ctx.fillText(spkLabel, waveBaseX + 38, 41);

  // Süre göstergesi
  const timeText = formatSecLabel(f.sceneTime);
  ctx.font = font(600, 18);
  ctx.fillStyle = dark ? '#94a3b8' : '#64748b';
  const timeW = ctx.measureText(timeText).width;
  ctx.fillText(timeText, spkX - timeW - 24, 41);

  ctx.restore();
}

function drawSlideHeader(
  ctx: CanvasRenderingContext2D,
  f: StageFrame,
  palette: ThemePalette,
  dark: boolean,
): number {
  const titleText = sanitizeCardCopy(f.scene.title || f.scene.diagram.title || 'Ders Bölümü');
  const titleSize = titleText.length > 56 ? 34 : 42;

  ctx.save();
  ctx.font = font(800, titleSize);
  ctx.fillStyle = dark ? '#f8fafc' : '#0f172a';
  ctx.textBaseline = 'top';
  const usedH = drawWrappedText(ctx, titleText, 60, 102, STAGE_W - 120, titleSize + 10, 2);

  // Alt vurgu çizgisi
  const accentY = 102 + usedH + 8;
  rr(ctx, 60, accentY, 110, 5, 3);
  ctx.fillStyle = palette.accent;
  ctx.fill();

  rr(ctx, 178, accentY + 1, 240, 3, 2);
  ctx.fillStyle = dark ? 'rgba(148, 163, 184, 0.22)' : '#e2e8f0';
  ctx.fill();
  ctx.restore();

  return accentY + 22;
}

// ============================================================================
// YÜKSEK OKUNABİLİRLİKLİ DİYAGRAM DÜZENLERİ
// ============================================================================

/**
 * 1) Akademik Kavram Kartları ('visual', 'shapes', 'structure', 'network')
 * 2-3 kart yan yana geniş kolonlar, 4 kart ise ferah 2x2 ızgara — 26px başlık + 22px gövde!
 */
function drawConceptCardsStage(
  ctx: CanvasRenderingContext2D,
  area: Area,
  nodes: DiagramNode[],
  activeIdx: number,
  palette: ThemePalette,
  dark: boolean,
): void {
  const items = nodes.slice(0, 4);
  if (items.length === 0) return;

  const isGrid2x2 = items.length === 4;
  const cols = isGrid2x2 ? 2 : items.length;
  const rows = isGrid2x2 ? 2 : 1;
  const gapX = 28;
  const gapY = 24;
  const cardW = (area.w - gapX * (cols - 1)) / cols;
  const cardH = isGrid2x2 ? (area.h - gapY) / rows : Math.min(area.h, 490);
  const startY = isGrid2x2 ? area.y : area.y + Math.max(0, (area.h - cardH) / 2);

  items.forEach((nd, i) => {
    const col = isGrid2x2 ? i % 2 : i;
    const row = isGrid2x2 ? Math.floor(i / 2) : 0;
    const x = area.x + col * (cardW + gapX);
    const y = startY + row * (cardH + gapY);
    const isAct = i === activeIdx;
    const accent = i === 0 ? palette.accent : CARD_ACCENTS[i % CARD_ACCENTS.length];

    ctx.save();
    // Kart gövdesi
    rr(ctx, x, y, cardW, cardH, 22);
    ctx.fillStyle = dark ? (isAct ? '#172542' : '#111b31') : isAct ? '#ffffff' : '#ffffff';
    ctx.shadowColor = dark ? 'rgba(0,0,0,0.4)' : isAct ? 'rgba(37, 99, 235, 0.16)' : 'rgba(15, 23, 42, 0.07)';
    ctx.shadowBlur = isAct ? 28 : 14;
    ctx.shadowOffsetY = isAct ? 8 : 4;
    ctx.fill();
    ctx.shadowColor = 'transparent';

    ctx.lineWidth = isAct ? 3 : 1.5;
    ctx.strokeStyle = isAct ? accent : dark ? 'rgba(148, 163, 184, 0.22)' : '#dbe3ee';
    ctx.stroke();

    // Üst renkli vurgu şeridi
    rr(ctx, x + 1, y + 1, cardW - 2, 10, [22, 22, 0, 0]);
    ctx.fillStyle = accent;
    ctx.fill();

    // Numara + Kategori Rozeti
    const padX = 28;
    const badgeY = y + 30;
    const numStr = `0${i + 1}`;
    rr(ctx, x + padX, badgeY, 44, 34, 10);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.font = font(800, 18);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(numStr, x + padX + 22, badgeY + 18);
    ctx.textAlign = 'left';

    const badgeText = sanitizeCardCopy(nd.badge || 'TEMEL NOKTA').toLocaleUpperCase('tr-TR').slice(0, 26);
    ctx.font = font(700, 16);
    ctx.fillStyle = dark ? '#93c5fd' : accent;
    ctx.fillText(badgeText, x + padX + 56, badgeY + 18);

    // Başlık (26px-28px Bold!)
    const titleSize = isGrid2x2 ? 26 : items.length <= 2 ? 30 : 27;
    ctx.font = font(800, titleSize);
    ctx.fillStyle = dark ? '#f8fafc' : '#0f172a';
    ctx.textBaseline = 'top';
    const titleY = badgeY + 50;
    const titleH = drawWrappedText(
      ctx,
      sanitizeCardCopy(nd.label),
      x + padX,
      titleY,
      cardW - padX * 2,
      titleSize + 8,
      2,
    );

    // Ayırıcı ince çizgi
    const divY = titleY + titleH + 10;
    ctx.fillStyle = dark ? 'rgba(148, 163, 184, 0.18)' : '#e2e8f0';
    ctx.fillRect(x + padX, divY, cardW - padX * 2, 1.5);

    // Açıklama Metni (21px-24px Okunaklı!)
    const bodySize = isGrid2x2 ? 21 : items.length <= 2 ? 25 : 22;
    const bodyLineH = bodySize + 10;
    const availBodyH = y + cardH - (divY + 18) - 20;
    const maxBodyLines = Math.max(2, Math.floor(availBodyH / bodyLineH));
    ctx.font = font(500, bodySize);
    ctx.fillStyle = dark ? '#cbd5e1' : '#334155';
    drawWrappedText(
      ctx,
      sanitizeCardCopy(nd.subtext),
      x + padX,
      divY + 18,
      cardW - padX * 2,
      bodyLineH,
      maxBodyLines,
    );

    ctx.restore();
  });
}

/**
 * 2) Adım Adım Akış ve Senaryo ('timeline', 'scenario')
 * Üstte net numaralı akış çizgisi ve oklar, altta ferah okunabilir kartlar.
 */
function drawStepFlowStage(
  ctx: CanvasRenderingContext2D,
  area: Area,
  nodes: DiagramNode[],
  activeIdx: number,
  palette: ThemePalette,
  dark: boolean,
): void {
  const items = nodes.slice(0, 4);
  if (items.length === 0) return;

  const n = items.length;
  const gap = 26;
  const colW = (area.w - gap * (n - 1)) / n;
  const lineY = area.y + 42;

  ctx.save();
  // Yatay bağlantı çizgisi
  if (n > 1) {
    const firstCenter = area.x + colW / 2;
    const lastCenter = area.x + (n - 1) * (colW + gap) + colW / 2;
    ctx.strokeStyle = dark ? 'rgba(148, 163, 184, 0.25)' : '#cbd5e1';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(firstCenter, lineY);
    ctx.lineTo(lastCenter, lineY);
    ctx.stroke();

    const activeCenter = area.x + activeIdx * (colW + gap) + colW / 2;
    ctx.strokeStyle = palette.accent;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(firstCenter, lineY);
    ctx.lineTo(activeCenter, lineY);
    ctx.stroke();
  }

  items.forEach((nd, i) => {
    const x = area.x + i * (colW + gap);
    const cx = x + colW / 2;
    const isAct = i === activeIdx;
    const reached = i <= activeIdx;
    const accent = i === 0 ? palette.accent : CARD_ACCENTS[i % CARD_ACCENTS.length];

    // Adım Dairesi
    ctx.beginPath();
    ctx.arc(cx, lineY, isAct ? 30 : 25, 0, Math.PI * 2);
    ctx.fillStyle = reached ? accent : dark ? '#1e293b' : '#ffffff';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = reached ? accent : dark ? '#475569' : '#94a3b8';
    ctx.stroke();

    ctx.font = font(800, 22);
    ctx.fillStyle = reached ? '#ffffff' : dark ? '#cbd5e1' : '#334155';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), cx, lineY + 1);
    ctx.textAlign = 'left';

    // Kart
    const cardY = lineY + 50;
    const cardH = Math.min(460, area.y + area.h - cardY);
    rr(ctx, x, cardY, colW, cardH, 20);
    ctx.fillStyle = dark ? (isAct ? '#172542' : '#111b31') : '#ffffff';
    ctx.shadowColor = dark ? 'rgba(0,0,0,0.35)' : 'rgba(15, 23, 42, 0.08)';
    ctx.shadowBlur = isAct ? 24 : 12;
    ctx.shadowOffsetY = 5;
    ctx.fill();
    ctx.shadowColor = 'transparent';

    ctx.lineWidth = isAct ? 3 : 1.5;
    ctx.strokeStyle = isAct ? accent : dark ? 'rgba(148, 163, 184, 0.22)' : '#dbe3ee';
    ctx.stroke();

    const padX = 24;
    ctx.font = font(700, 16);
    ctx.fillStyle = dark ? '#93c5fd' : accent;
    ctx.textBaseline = 'top';
    ctx.fillText(`AŞAMA ${i + 1}`, x + padX, cardY + 22);

    const titleSize = n >= 4 ? 23 : 26;
    ctx.font = font(800, titleSize);
    ctx.fillStyle = dark ? '#f8fafc' : '#0f172a';
    const titleH = drawWrappedText(
      ctx,
      sanitizeCardCopy(nd.label),
      x + padX,
      cardY + 48,
      colW - padX * 2,
      titleSize + 7,
      2,
    );

    const bodyY = cardY + 48 + titleH + 16;
    const bodySize = n >= 4 ? 19.5 : 22;
    const lineH = bodySize + 10;
    const maxLines = Math.max(3, Math.floor((cardY + cardH - bodyY - 20) / lineH));
    ctx.font = font(500, bodySize);
    ctx.fillStyle = dark ? '#cbd5e1' : '#334155';
    drawWrappedText(ctx, sanitizeCardCopy(nd.subtext), x + padX, bodyY, colW - padX * 2, lineH, maxLines);
  });

  ctx.restore();
}

/**
 * 3) Karşılaştırma ve Ayrım Kartları ('comparison')
 */
function drawComparisonStage(
  ctx: CanvasRenderingContext2D,
  area: Area,
  nodes: DiagramNode[],
  activeIdx: number,
  palette: ThemePalette,
  dark: boolean,
): void {
  const items = nodes.slice(0, 3);
  if (items.length === 0) return;

  const n = items.length;
  const gap = 34;
  const colW = (area.w - gap * (n - 1)) / n;
  const cardH = Math.min(area.h, 510);
  const startY = area.y + Math.max(0, (area.h - cardH) / 2);
  const headerColors = [palette.accent, palette.secondary, '#7c3aed'];

  items.forEach((nd, i) => {
    const x = area.x + i * (colW + gap);
    const isAct = i === activeIdx;
    const headBg = headerColors[i % headerColors.length];

    ctx.save();
    rr(ctx, x, startY, colW, cardH, 22);
    ctx.fillStyle = dark ? '#111b31' : '#ffffff';
    ctx.shadowColor = dark ? 'rgba(0,0,0,0.4)' : 'rgba(15, 23, 42, 0.08)';
    ctx.shadowBlur = isAct ? 26 : 14;
    ctx.shadowOffsetY = 6;
    ctx.fill();
    ctx.shadowColor = 'transparent';

    ctx.lineWidth = isAct ? 3 : 1.5;
    ctx.strokeStyle = isAct ? headBg : dark ? 'rgba(148, 163, 184, 0.22)' : '#dbe3ee';
    ctx.stroke();

    // Renkli Üst Başlık Bandı
    const headerH = 112;
    rr(ctx, x, startY, colW, headerH, [22, 22, 0, 0]);
    ctx.fillStyle = headBg;
    ctx.fill();

    ctx.font = font(700, 16);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.textBaseline = 'top';
    ctx.fillText(sanitizeCardCopy(nd.badge || `BOYUT ${i + 1}`).toLocaleUpperCase('tr-TR').slice(0, 28), x + 28, startY + 20);

    ctx.font = font(800, n === 2 ? 29 : 25);
    ctx.fillStyle = '#ffffff';
    drawWrappedText(ctx, sanitizeCardCopy(nd.label), x + 28, startY + 46, colW - 56, 34, 2);

    // Gövde İçeriği
    const bodyY = startY + headerH + 28;
    const bodySize = n === 2 ? 24 : 21.5;
    const lineH = bodySize + 12;
    const maxLines = Math.max(3, Math.floor((startY + cardH - bodyY - 26) / lineH));
    ctx.font = font(500, bodySize);
    ctx.fillStyle = dark ? '#e2e8f0' : '#1e293b';
    drawWrappedText(ctx, sanitizeCardCopy(nd.subtext), x + 28, bodyY, colW - 56, lineH, maxLines);

    ctx.restore();
  });

  // 2 sütunlu karşılaştırmada ortada şık AYRIM rozeti
  if (n === 2) {
    const midX = area.x + colW + gap / 2;
    const midY = startY + 56;
    ctx.save();
    ctx.beginPath();
    ctx.arc(midX, midY, 28, 0, Math.PI * 2);
    ctx.fillStyle = dark ? '#0f172a' : '#ffffff';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = palette.accent;
    ctx.stroke();
    ctx.font = font(800, 18);
    ctx.fillStyle = dark ? '#f8fafc' : palette.accent;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('VS', midX, midY + 1);
    ctx.restore();
  }
}

/**
 * 4) Ferah Akademik Özet Tablosu ('table')
 */
function drawTableStage(
  ctx: CanvasRenderingContext2D,
  area: Area,
  nodes: DiagramNode[],
  activeIdx: number,
  palette: ThemePalette,
  dark: boolean,
): void {
  const rows = nodes.slice(0, 4);
  if (rows.length === 0) return;

  const headerH = 66;
  const rowH = Math.min(126, Math.floor((area.h - headerH - 12) / rows.length));
  const totalH = headerH + rowH * rows.length;
  const startY = area.y + Math.max(0, (area.h - totalH) / 2);

  const col1W = Math.round(area.w * 0.27);
  const col2W = Math.round(area.w * 0.55);
  const col3W = area.w - col1W - col2W;

  ctx.save();
  rr(ctx, area.x, startY, area.w, totalH, 20);
  ctx.fillStyle = dark ? '#111b31' : '#ffffff';
  ctx.shadowColor = dark ? 'rgba(0,0,0,0.38)' : 'rgba(15, 23, 42, 0.08)';
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 6;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = dark ? 'rgba(148, 163, 184, 0.24)' : '#cbd5e1';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Tablo Başlık Satırı
  rr(ctx, area.x, startY, area.w, headerH, [20, 20, 0, 0]);
  ctx.fillStyle = dark ? '#1e293b' : '#0f172a';
  ctx.fill();

  ctx.font = font(700, 21);
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.fillText('KAVRAM / UNSUR', area.x + 28, startY + headerH / 2);
  ctx.fillText('AÇIKLAMA VE İŞLEYİŞ', area.x + col1W + 24, startY + headerH / 2);
  ctx.fillText('ODAK', area.x + col1W + col2W + 24, startY + headerH / 2);

  // Satırlar
  rows.forEach((nd, i) => {
    const ry = startY + headerH + i * rowH;
    const isAct = i === activeIdx;

    if (isAct) {
      ctx.fillStyle = dark ? palette.accentSoftDark : palette.accentSoft;
      ctx.fillRect(area.x + 2, ry, area.w - 4, rowH);
      ctx.fillStyle = palette.accent;
      ctx.fillRect(area.x + 2, ry, 6, rowH);
    } else if (i % 2 === 1) {
      ctx.fillStyle = dark ? 'rgba(255,255,255,0.025)' : '#f8fafc';
      ctx.fillRect(area.x + 2, ry, area.w - 4, rowH);
    }

    // Satır ayırıcı
    ctx.fillStyle = dark ? 'rgba(148, 163, 184, 0.15)' : '#e2e8f0';
    ctx.fillRect(area.x, ry, area.w, 1);

    // Sütun 1: Kavram
    ctx.font = font(800, 22);
    ctx.fillStyle = dark ? '#f8fafc' : '#0f172a';
    ctx.textBaseline = 'top';
    drawWrappedText(ctx, sanitizeCardCopy(nd.label), area.x + 28, ry + 22, col1W - 44, 29, 3);

    // Sütun 2: Açıklama
    ctx.font = font(500, 20.5);
    ctx.fillStyle = dark ? '#cbd5e1' : '#334155';
    drawWrappedText(
      ctx,
      sanitizeCardCopy(nd.subtext),
      area.x + col1W + 24,
      ry + 20,
      col2W - 44,
      29,
      Math.max(2, Math.floor((rowH - 28) / 29)),
    );

    // Sütun 3: Odak Rozeti
    const tag = sanitizeCardCopy(nd.badge || `Madde ${i + 1}`).slice(0, 20);
    ctx.font = font(700, 17);
    const tagW = Math.min(col3W - 36, ctx.measureText(tag).width + 26);
    rr(ctx, area.x + col1W + col2W + 20, ry + Math.round((rowH - 38) / 2), tagW, 38, 19);
    ctx.fillStyle = dark ? 'rgba(56, 189, 248, 0.14)' : '#eff6ff';
    ctx.fill();
    ctx.fillStyle = dark ? '#7dd3fc' : palette.badgeText;
    ctx.textBaseline = 'middle';
    ctx.fillText(tag, area.x + col1W + col2W + 33, ry + rowH / 2 + 1);
  });

  ctx.restore();
}

/**
 * 5) İktisat Denge Eğrisi — YALNIZCA visualTheme === 'economics' iken çizilir!
 * Diğer tüm fakülteler (Tıp, Mühendislik, Spor, Eğitim, Ziraat vb.) için temiz adım/ilişki kartları gösterilir.
 */
function drawEconomicsCurveStage(
  ctx: CanvasRenderingContext2D,
  area: Area,
  nodes: DiagramNode[],
  activeIdx: number,
  palette: ThemePalette,
  dark: boolean,
): void {
  const leftW = Math.round(area.w * 0.44);
  const gap = 34;
  const rightX = area.x + leftW + gap;
  const rightW = area.w - leftW - gap;
  const stageH = Math.min(area.h, 520);
  const startY = area.y + Math.max(0, (area.h - stageH) / 2);

  // Sol: Temiz, yüksek okunabilirlikli Arz/Talep veya Ms/Md Denge Grafiği
  ctx.save();
  rr(ctx, area.x, startY, leftW, stageH, 22);
  ctx.fillStyle = dark ? '#111b31' : '#ffffff';
  ctx.strokeStyle = dark ? 'rgba(148, 163, 184, 0.24)' : '#cbd5e1';
  ctx.lineWidth = 1.5;
  ctx.fill();
  ctx.stroke();

  const gx = area.x + 92;
  const gy = startY + 56;
  const gw = leftW - 144;
  const gh = stageH - 134;

  // Hafif ızgara
  ctx.strokeStyle = dark ? 'rgba(148, 163, 184, 0.1)' : '#f1f5f9';
  ctx.lineWidth = 1;
  for (let i = 1; i <= 4; i++) {
    const yy = gy + (gh / 5) * i;
    ctx.beginPath();
    ctx.moveTo(gx, yy);
    ctx.lineTo(gx + gw, yy);
    ctx.stroke();
  }

  // Eksenler
  ctx.strokeStyle = dark ? '#e2e8f0' : '#0f172a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(gx, gy);
  ctx.lineTo(gx, gy + gh);
  ctx.lineTo(gx + gw, gy + gh);
  ctx.stroke();

  // Eksen Etiketleri (Büyük ve net!)
  ctx.font = font(700, 20);
  ctx.fillStyle = dark ? '#cbd5e1' : '#334155';
  ctx.textBaseline = 'middle';
  ctx.fillText('Fiyat / Faiz (P, i)', gx - 16, gy - 24);
  ctx.textAlign = 'right';
  ctx.fillText('Miktar / Hasıla (Q, Y)', gx + gw, gy + gh + 36);
  ctx.textAlign = 'left';

  // Talep Eğrisi (D / Md)
  ctx.strokeStyle = '#2563eb';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(gx + 34, gy + 30);
  ctx.quadraticCurveTo(gx + gw * 0.48, gy + gh * 0.56, gx + gw - 26, gy + gh - 30);
  ctx.stroke();
  ctx.font = font(800, 21);
  ctx.fillStyle = '#2563eb';
  ctx.fillText('D / Md', gx + gw - 90, gy + gh - 52);

  // Arz Eğrisi (S / Ms)
  ctx.strokeStyle = '#059669';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(gx + 34, gy + gh - 34);
  ctx.quadraticCurveTo(gx + gw * 0.5, gy + gh * 0.48, gx + gw - 26, gy + 30);
  ctx.stroke();
  ctx.fillStyle = '#059669';
  ctx.fillText('S / Ms', gx + gw - 88, gy + 24);

  // Denge Noktası E*
  const ex = gx + gw * 0.5;
  const ey = gy + gh * 0.5;
  ctx.setLineDash([7, 7]);
  ctx.strokeStyle = dark ? '#94a3b8' : '#64748b';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(gx, ey);
  ctx.lineTo(ex, ey);
  ctx.lineTo(ex, gy + gh);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.beginPath();
  ctx.arc(ex, ey, 12, 0, Math.PI * 2);
  ctx.fillStyle = '#f59e0b';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  ctx.font = font(800, 22);
  ctx.fillStyle = dark ? '#fde68a' : '#b45309';
  ctx.fillText('E* (Denge)', ex + 18, ey - 10);
  ctx.restore();

  // Sağ: İlişkili 3 Okunabilir Açıklama Kartı
  const items = nodes.slice(0, 3);
  const rowGap = 18;
  const rowH = Math.floor((stageH - rowGap * Math.max(0, items.length - 1)) / Math.max(1, items.length));

  items.forEach((nd, i) => {
    const ry = startY + i * (rowH + rowGap);
    const isAct = i === activeIdx;
    const accent = i === 0 ? palette.accent : CARD_ACCENTS[i % CARD_ACCENTS.length];

    ctx.save();
    rr(ctx, rightX, ry, rightW, rowH, 18);
    ctx.fillStyle = dark ? (isAct ? '#172542' : '#111b31') : '#ffffff';
    ctx.lineWidth = isAct ? 3 : 1.5;
    ctx.strokeStyle = isAct ? accent : dark ? 'rgba(148, 163, 184, 0.22)' : '#dbe3ee';
    ctx.fill();
    ctx.stroke();

    rr(ctx, rightX, ry, 8, rowH, [18, 0, 0, 18]);
    ctx.fillStyle = accent;
    ctx.fill();

    ctx.font = font(800, 24);
    ctx.fillStyle = dark ? '#f8fafc' : '#0f172a';
    ctx.textBaseline = 'top';
    ctx.fillText(sanitizeCardCopy(nd.label).slice(0, 46), rightX + 28, ry + 18);

    ctx.font = font(500, 20.5);
    ctx.fillStyle = dark ? '#cbd5e1' : '#334155';
    drawWrappedText(
      ctx,
      sanitizeCardCopy(nd.subtext),
      rightX + 28,
      ry + 54,
      rightW - 52,
      28,
      Math.max(2, Math.floor((rowH - 66) / 28)),
    );
    ctx.restore();
  });
}

/**
 * 6) Yatay Analitik Çubuk Grafik ('chart') — Yalnızca gerçek sayısal verili ders notlarında çizilir,
 * aksi halde uydurma yüzde göstermek yerine net kavram kartları gösterir!
 */
function drawAnalyticalChartStage(
  ctx: CanvasRenderingContext2D,
  area: Area,
  nodes: DiagramNode[],
  narration: string,
  activeIdx: number,
  palette: ThemePalette,
  dark: boolean,
): void {
  if (!hasGenuineNumericValues(nodes, narration)) {
    drawConceptCardsStage(ctx, area, nodes, activeIdx, palette, dark);
    return;
  }

  const items = nodes.slice(0, 4);
  const rowGap = 20;
  const rowH = Math.min(120, Math.floor((area.h - rowGap * Math.max(0, items.length - 1)) / Math.max(1, items.length)));
  const totalH = items.length * rowH + Math.max(0, items.length - 1) * rowGap;
  const startY = area.y + Math.max(0, (area.h - totalH) / 2);

  items.forEach((nd, i) => {
    const ry = startY + i * (rowH + rowGap);
    const isAct = i === activeIdx;
    const val = Math.max(15, Math.min(100, Math.round(nd.value ?? 75)));
    const accent = i === 0 ? palette.accent : CARD_ACCENTS[i % CARD_ACCENTS.length];

    ctx.save();
    rr(ctx, area.x, ry, area.w, rowH, 18);
    ctx.fillStyle = dark ? (isAct ? '#172542' : '#111b31') : '#ffffff';
    ctx.lineWidth = isAct ? 3 : 1.5;
    ctx.strokeStyle = isAct ? accent : dark ? 'rgba(148, 163, 184, 0.22)' : '#dbe3ee';
    ctx.fill();
    ctx.stroke();

    ctx.font = font(800, 23);
    ctx.fillStyle = dark ? '#f8fafc' : '#0f172a';
    ctx.textBaseline = 'top';
    ctx.fillText(sanitizeCardCopy(nd.label).slice(0, 46), area.x + 28, ry + 16);

    ctx.font = font(500, 19.5);
    ctx.fillStyle = dark ? '#cbd5e1' : '#475569';
    drawWrappedText(ctx, sanitizeCardCopy(nd.subtext), area.x + 28, ry + 50, area.w * 0.56, 26, 2);

    // Sağ tarafta temiz ölçek çubuğu
    const barX = area.x + area.w * 0.62;
    const barW = area.w * 0.34;
    const barY = ry + Math.round(rowH / 2) - 12;

    rr(ctx, barX, barY, barW, 24, 12);
    ctx.fillStyle = dark ? 'rgba(148, 163, 184, 0.16)' : '#e2e8f0';
    ctx.fill();

    rr(ctx, barX, barY, Math.max(24, (barW * val) / 100), 24, 12);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.restore();
  });
}

// ============================================================================
// SINAV NOTU BANDI + BÜYÜK OKUNABİLİR ALTYAZI + POSTER KAPLAMASI
// ============================================================================

function drawExamTipBanner(
  ctx: CanvasRenderingContext2D,
  examTip: string,
  y: number,
  dark: boolean,
): void {
  const clean = sanitizeCardCopy(examTip);
  if (!clean) return;

  const h = 76;
  ctx.save();
  rr(ctx, 60, y, STAGE_W - 120, h, 16);
  ctx.fillStyle = dark ? 'rgba(245, 158, 11, 0.14)' : '#fffbeb';
  ctx.fill();
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = dark ? 'rgba(251, 191, 36, 0.45)' : '#fcd34d';
  ctx.stroke();

  // Rozet
  rr(ctx, 78, y + 18, 148, 40, 10);
  ctx.fillStyle = '#f59e0b';
  ctx.fill();
  ctx.font = font(800, 16);
  ctx.fillStyle = '#0f172a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('SINAV NOTU', 78 + 74, y + 39);
  ctx.textAlign = 'left';

  ctx.font = font(600, 21);
  ctx.fillStyle = dark ? '#fef3c7' : '#78350f';
  ctx.textBaseline = 'top';
  drawWrappedText(ctx, clean, 246, y + 15, STAGE_W - 332, 26, 2);
  ctx.restore();
}

function drawSubtitleBar(ctx: CanvasRenderingContext2D, f: StageFrame): void {
  if (!f.showSubtitles) return;
  const sentence = sanitizeCardCopy(f.scene.sentences[f.sentenceIndex] || f.scene.sentences[0] || '');
  if (!sentence) return;

  const fontSize = f.subtitleSize === 'lg' ? 34 : f.subtitleSize === 'sm' ? 24 : 29;
  const lineH = fontSize + 10;
  const isDeniz = f.activeSpeaker === 'Deniz';
  const spkName = isDeniz ? 'Dr. Deniz' : 'Barış';
  const spkColor = isDeniz ? '#38bdf8' : '#fbbf24';

  const boxH = 122;
  const boxY = STAGE_H - boxH - 28;
  const boxX = 60;
  const boxW = STAGE_W - 120;

  ctx.save();
  rr(ctx, boxX, boxY, boxW, boxH, 20);
  ctx.fillStyle = 'rgba(7, 13, 27, 0.93)';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 6;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 2;
  ctx.strokeStyle = isDeniz ? 'rgba(56, 189, 248, 0.45)' : 'rgba(251, 191, 36, 0.45)';
  ctx.stroke();

  // Konuşmacı Etiketi
  ctx.font = font(800, 19);
  const chipW = ctx.measureText(spkName).width + 32;
  rr(ctx, boxX + 24, boxY + 20, chipW, 34, 10);
  ctx.fillStyle = isDeniz ? 'rgba(56, 189, 248, 0.2)' : 'rgba(251, 191, 36, 0.2)';
  ctx.fill();
  ctx.fillStyle = spkColor;
  ctx.textBaseline = 'middle';
  ctx.fillText(spkName, boxX + 40, boxY + 38);

  // Altyazı Metni
  ctx.font = font(600, fontSize);
  ctx.fillStyle = '#f8fafc';
  ctx.textBaseline = 'top';
  drawWrappedText(
    ctx,
    sentence,
    boxX + 24 + chipW + 22,
    boxY + 22,
    boxW - chipW - 72,
    lineH,
    2,
  );
  ctx.restore();
}

function drawOverallProgressBar(
  ctx: CanvasRenderingContext2D,
  overall: number,
  palette: ThemePalette,
  dark: boolean,
): void {
  const barH = 10;
  const y = STAGE_H - barH;
  ctx.save();
  ctx.fillStyle = dark ? '#1e293b' : '#e2e8f0';
  ctx.fillRect(0, y, STAGE_W, barH);
  ctx.fillStyle = palette.accent;
  ctx.fillRect(0, y, Math.round(STAGE_W * clamp(overall)), barH);
  ctx.restore();
}

// ============================================================================
// ANA RENDER FONKSİYONU
// ============================================================================

export function renderStage(ctx: CanvasRenderingContext2D, f: StageFrame): void {
  const dark = f.layoutMode === 'whiteboard' || f.layoutMode === 'focus';
  const palette = THEME_PALETTES[f.scene.diagram.visualTheme] || THEME_PALETTES.society;

  // 1) Temiz Arka Plan
  ctx.save();
  const bg = ctx.createLinearGradient(0, 0, 0, STAGE_H);
  if (dark) {
    bg.addColorStop(0, '#091122');
    bg.addColorStop(1, '#0f172a');
  } else {
    bg.addColorStop(0, '#f8fafc');
    bg.addColorStop(1, '#f1f5f9');
  }
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, STAGE_W, STAGE_H);
  ctx.restore();

  // 2) Üst Bilgi Çubuğu ve Bölüm Başlığı
  drawTopBar(ctx, f, palette, dark);
  const contentTop = drawSlideHeader(ctx, f, palette, dark);

  // 3) Dinamik Alan Hesabı (Altyazı ve Sınav Notu ile sıfır çakışma!)
  const hasTip = Boolean(sanitizeCardCopy(f.scene.examTip));
  const subtitleReserve = f.showSubtitles ? 162 : 24;
  const tipReserve = hasTip ? 92 : 0;
  const contentBottom = STAGE_H - subtitleReserve - tipReserve - 16;

  const stageArea: Area = {
    x: 60,
    y: contentTop,
    w: STAGE_W - 120,
    h: Math.max(300, contentBottom - contentTop),
  };

  const nodes = f.scene.diagram.nodes || [];
  const activeIdx = getActiveCardIndex(Math.min(4, Math.max(1, nodes.length)), f.progress);
  const diagramType = f.scene.diagram.type;

  // 4) Konuya ve Fakülteye Uygun Okunabilir Diyagram Çizimi
  if (diagramType === 'table') {
    drawTableStage(ctx, stageArea, nodes, activeIdx, palette, dark);
  } else if (diagramType === 'comparison') {
    drawComparisonStage(ctx, stageArea, nodes, activeIdx, palette, dark);
  } else if (diagramType === 'timeline' || diagramType === 'scenario') {
    drawStepFlowStage(ctx, stageArea, nodes, activeIdx, palette, dark);
  } else if (diagramType === 'curve') {
    if (f.scene.diagram.visualTheme === 'economics') {
      drawEconomicsCurveStage(ctx, stageArea, nodes, activeIdx, palette, dark);
    } else {
      drawStepFlowStage(ctx, stageArea, nodes, activeIdx, palette, dark);
    }
  } else if (diagramType === 'chart') {
    drawAnalyticalChartStage(ctx, stageArea, nodes, f.scene.narration, activeIdx, palette, dark);
  } else {
    drawConceptCardsStage(ctx, stageArea, nodes, activeIdx, palette, dark);
  }

  // 5) Sınav Notu Bandı (Altyazının hemen üstünde, sıfır çakışma)
  if (hasTip) {
    const tipY = STAGE_H - subtitleReserve - 88;
    drawExamTipBanner(ctx, f.scene.examTip, tipY, dark);
  }

  // 6) Büyük Okunaklı Altyazı Bandı
  drawSubtitleBar(ctx, f);

  // 7) Genel İlerleme Çubuğu
  drawOverallProgressBar(ctx, f.overall, palette, dark);
}
