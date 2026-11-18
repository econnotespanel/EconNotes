// EconNotes Video Stüdyosu — Gemini NotebookLM "Videolu Özet" Kalitesinde
// Editoryal İllüstrasyon, Nedensellik Hikayeleştirmesi ve Çok-Modlu Görsel Sahne Motoru.
//
// Özellikler:
// 1. NotebookLM "Videolu Özet" Editoryal Tuvali (Sıcak krem kareli defter zemini,
//    neo-brütalist sarı/mavi/mint geometrik kenar şekilleri, serif ana başlık,
//    sarı ofset gölgeli ve sarı raptiyeli beyaz ana sahne kartı).
// 2. Konu Duyarlı Vektörel İllüstrasyon Motoru (Tarım & Kıtlık, Feodalizm & Kale,
//    Sanayi & Ticaret, Merkez Bankası & Emisyon, Arz-Talep Eğrisi, Kamu Maliyesi,
//    Hukuk & Kurumlar, Veri & Analitik).
// 3. 7 Farklı Görsel Diyagram Türü ('visual', 'curve', 'chart', 'table', 'shapes',
//    'scenario', 'timeline', 'comparison') için sıfır metin taşmalı, yüksek kontrastlı çizim.

import type { StudioScene, DiagramNode, Speaker, VisualTheme, DiagramType } from './sceneModel';
import type { Viseme } from './speechEngine';
import { drawStudioPresentersAndDesk } from './drawPresenters';

export const STAGE_W = 1920;
export const STAGE_H = 1080;

export interface StageFrame {
  scene: StudioScene;
  sceneIndex: number;
  sceneCount: number;
  /** Sahne içi ilerleme 0..1 */
  progress: number;
  /** Tüm ders ilerlemesi 0..1 */
  overall: number;
  /** Sahne başlangıcından bu yana geçen süre (sn) */
  sceneTime: number;
  sentenceIndex: number;
  charInSentence: number;
  /** O anki cümlenin aktif konuşmacısı */
  activeSpeaker?: Speaker;
  playing: boolean;
  /** Oynatma başlamadan önceki kapak görünümü */
  poster: boolean;
  now: number;
  courseLabel: string;
  showSubtitles: boolean;
  viseme: Viseme;
  mouthOpen: number;
  inBreathPause: boolean;
  layoutMode?: 'standard' | 'whiteboard' | 'focus';
  subtitleSize?: 'sm' | 'md' | 'lg' | 'xl';
}

interface Area {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Point {
  x: number;
  y: number;
}

const FONT_SANS = 'Inter, "Segoe UI", system-ui, -apple-system, sans-serif';
const FONT_SERIF = 'Georgia, "Playfair Display", "Times New Roman", serif';
const FONT_MONO = '"JetBrains Mono", "Fira Code", Consolas, monospace';

const INK = '#1e293b';
const INK_DARK = '#0f172a';
const INK_MUTED = '#475569';
const PAPER_BG = '#fbfaf5';
const PAPER_GRID = 'rgba(30, 41, 59, 0.055)';
const ACCENT_YELLOW = '#fde047';
const ACCENT_AMBER = '#facc15';
const ACCENT_PASTEL_YELLOW = '#fef08a';
const ACCENT_BLUE = '#3b82f6';
const ACCENT_SKY = '#bae6fd';
const ACCENT_MINT = '#bbf7d0';
const ACCENT_ROSE = '#fecdd3';

const TYPE_LABEL: Record<string, string> = {
  visual: 'GÖRSEL SENTEZ & NEDENSELLİK',
  shapes: 'MEKANİZMA & DÖNGÜSEL AKIŞ',
  table: 'KARŞILAŞTIRMALI AKADEMİK MATRİS',
  chart: 'ANALİTİK ETKİ & AĞIRLIK GRAFİĞİ',
  curve: 'EKONOMİK DENGE & EĞRİ ANALİZİ',
  scenario: 'UYGULAMALI VAKA & SÜREÇ ADIMLARI',
  timeline: 'TARİHSEL DÖNÜŞÜM & ZAMAN AKIŞI',
  comparison: 'İKİLİ KAVRAMSAL KIYASLAMA',
  structure: 'KURUMSAL MİMARİ',
  network: 'KAVRAM İLİŞKİ AĞI',
};

export function getBoardLayout(layoutMode?: 'standard' | 'whiteboard' | 'focus') {
  if (layoutMode === 'whiteboard') {
    return {
      board: { x: 140, y: 170, w: 1640, h: 760 },
      sub: { x: 180, y: 942, w: 1560, h: 112 },
    };
  }
  if (layoutMode === 'focus') {
    return {
      board: { x: 340, y: 72, w: 1240, h: 728 },
      sub: { x: 364, y: 828, w: 1192, h: 170 },
    };
  }
  // 'standard' -> NotebookLM "Videolu Özet" Tam Sahne Editoryal Kart Düzeni
  return {
    board: { x: 210, y: 192, w: 1500, h: 748 },
    sub: { x: 240, y: 954, w: 1440, h: 104 },
  };
}

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t), 3);

function rr(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number | number[],
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r as any);
}

function font(weight: number, size: number, family = FONT_SANS) {
  return `${weight} ${size}px ${family}`;
}

export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = (text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = words[i];
      if (lines.length === maxLines) {
        let last = lines[maxLines - 1];
        while (ctx.measureText(`${last}…`).width > maxWidth && last.length > 1) {
          last = last.slice(0, -1);
        }
        lines[maxLines - 1] = `${last.trimEnd()}…`;
        return lines;
      }
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines.map((l) => {
    if (ctx.measureText(l).width <= maxWidth) return l;
    let cut = l;
    while (ctx.measureText(`${cut}…`).width > maxWidth && cut.length > 1) {
      cut = cut.slice(0, -1);
    }
    return `${cut}…`;
  });
}

function drawLines(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  x: number,
  y: number,
  lineH: number,
) {
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineH));
}

function appearAmount(i: number, n: number, progress: number, poster = false) {
  if (poster) return 1;
  const start = 0.02 + (i / Math.max(1, n)) * 0.58;
  return Math.max(0.28, easeOut((progress - start) / 0.14));
}

function activeIndex(n: number, progress: number) {
  let idx = 0;
  for (let i = 0; i < n; i++) {
    if (progress >= (i / Math.max(1, n)) * 0.78) idx = i;
  }
  return idx;
}

/**
 * Düğüm etiketini ve alt metnini NotebookLM tarzı "Neden → Sonuç" (Kavram → İşlev)
 * formül etiketine dönüştürür (Örn: "Kıtlık → Tarım", "Miri Arazi → Hür Köylü").
 */
function buildCausalFormulaBadge(node: DiagramNode, idx: number): string {
  const lbl = (node.label || `Aşama ${idx + 1}`).replace(/^\d+\s*·\s*/, '').trim();
  if (lbl.includes('→') || lbl.includes('->')) return lbl;

  const badgeClean = (node.badge || '').replace(/^\d+\s*·\s*/, '').trim();
  const sub = (node.subtext || '').trim();

  // Alt metinden anahtar sonuç/eylem kelimesini çıkar
  const arrowMatch = sub.match(/([A-ZÇĞİÖŞÜa-zçğıöşü\s]{3,22})\s*(?:→|->|yol açar|doğurur|sağlar|oluşturur)/i);
  if (arrowMatch?.[1]) {
    const tail = arrowMatch[1].trim().split(/\s+/).slice(-2).join(' ');
    if (tail && tail.toLocaleLowerCase('tr-TR') !== lbl.toLocaleLowerCase('tr-TR')) {
      return `${lbl} → ${tail}`;
    }
  }

  if (
    badgeClean &&
    !/^(temel\s+ilke|kavram|olası\s+soru|ana\s+eksen|bölüm)/i.test(badgeClean) &&
    badgeClean.toLocaleLowerCase('tr-TR') !== lbl.toLocaleLowerCase('tr-TR')
  ) {
    return `${badgeClean} → ${lbl}`;
  }

  const subWords = sub
    .replace(/[.,;:!?()]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !/^(olan|olarak|için|gibi|üzerinden|kapsamında|birlikte)$/i.test(w));

  if (subWords.length >= 2) {
    const outcome = subWords.slice(0, 2).join(' ');
    if (outcome.toLocaleLowerCase('tr-TR') !== lbl.toLocaleLowerCase('tr-TR')) {
      return `${lbl} → ${outcome.charAt(0).toLocaleUpperCase('tr-TR') + outcome.slice(1)}`;
    }
  }

  return lbl;
}

// ============================================================================
// 1. NOTEBOOKLM EDİTORYAL ARKA PLAN VE GEOMETRİK ÇERÇEVE SÜSLEMELERİ
// ============================================================================
function drawNotebookEditorialCanvas(
  ctx: CanvasRenderingContext2D,
  f: StageFrame,
  darkBoard = false,
) {
  if (darkBoard) {
    const bg = ctx.createLinearGradient(0, 0, 0, STAGE_H);
    bg.addColorStop(0, '#0f172a');
    bg.addColorStop(1, '#090d16');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, STAGE_W, STAGE_H);

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.06)';
    ctx.lineWidth = 1;
    const step = 40;
    for (let x = 0; x < STAGE_W; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, STAGE_H);
      ctx.stroke();
    }
    for (let y = 0; y < STAGE_H; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(STAGE_W, y);
      ctx.stroke();
    }
    return;
  }

  // Sıcak krem kareli defter/mimari kağıt arka planı (NotebookLM Videolu Özet stili)
  const bg = ctx.createLinearGradient(0, 0, 0, STAGE_H);
  bg.addColorStop(0, PAPER_BG);
  bg.addColorStop(1, '#f4f0e4');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, STAGE_W, STAGE_H);

  // İnce kareli ızgara çizgileri
  ctx.strokeStyle = PAPER_GRID;
  ctx.lineWidth = 1;
  const gridStep = 38;
  for (let x = 0; x < STAGE_W; x += gridStep) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, STAGE_H);
    ctx.stroke();
  }
  for (let y = 0; y < STAGE_H; y += gridStep) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(STAGE_W, y);
    ctx.stroke();
  }

  // NotebookLM tarzı kenar geometrik şekilleri (Neo-brutalist pastel bloklar + koyu mürekkep kontur)
  const drift = Math.sin(f.now / 2800 + f.sceneIndex) * 4;

  ctx.save();
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = INK;

  // Üst-sol sıcak sarı kapsül blok
  rr(ctx, 210, -26 + drift * 0.5, 290, 74, 22);
  ctx.fillStyle = '#fde68a';
  ctx.fill();
  ctx.stroke();

  // Sol kenar sarı yarım kapsül + daire + dikey beyaz sütun
  rr(ctx, -45, 360 - drift, 108, 120, 26);
  ctx.fillStyle = ACCENT_AMBER;
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(98, 430 + drift * 0.6, 46, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.stroke();

  rr(ctx, -24, 492, 134, 520, [0, 32, 32, 0]);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.stroke();

  // Sağ kenar sarı gölgeli yönlendirme kartı (→)
  const rx = STAGE_W - 122;
  const ry = 178 + drift;
  rr(ctx, rx + 8, ry + 10, 140, 330, [24, 0, 0, 24]);
  ctx.fillStyle = ACCENT_AMBER;
  ctx.fill();
  ctx.stroke();

  rr(ctx, rx, ry, 140, 330, [24, 0, 0, 24]);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.stroke();

  // Sağ kart içindeki ok (→)
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.6;
  const arrowY = ry + 165;
  ctx.beginPath();
  ctx.moveTo(rx + 36, arrowY);
  ctx.lineTo(rx + 68, arrowY);
  ctx.moveTo(rx + 56, arrowY - 10);
  ctx.lineTo(rx + 68, arrowY);
  ctx.lineTo(rx + 56, arrowY + 10);
  ctx.stroke();

  // Sağ-alt sarı silindirik rozet sütunu
  const cy = 670 - drift * 0.5;
  rr(ctx, STAGE_W - 138, cy, 160, 340, [36, 0, 0, 36]);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(STAGE_W - 72, cy + 48, 52, 0, Math.PI * 2);
  ctx.fillStyle = '#fde68a';
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

// ============================================================================
// 2. KONU DUYARLI EDİTORYAL İLLÜSTRASYON MOTORU (NotebookLM Görsel Hikayeleştirme)
// ============================================================================
type IllustrationArchetype =
  | 'agriculture'
  | 'feudalism_state'
  | 'industry_trade'
  | 'central_bank'
  | 'market_curve'
  | 'fiscal_welfare'
  | 'law_institution'
  | 'analytics_science';

function detectIllustrationArchetype(
  node: DiagramNode,
  theme: VisualTheme,
  index: number,
): IllustrationArchetype {
  const text = `${node.label} ${node.subtext} ${node.badge || ''}`.toLocaleLowerCase('tr-TR');

  if (/(tarım|toprak|miri|köylü|ziraat|kıtlık|üretim|hasat|rekolte|çiftçi|kırsal)/.test(text)) {
    return 'agriculture';
  }
  if (/(merkez bank|emisyon|banknot|para arz|likidite|rezerv|karşılık|faiz|enflasyon|kur)/.test(text)) {
    return 'central_bank';
  }
  if (/(arz|talep|denge|fiyat|piyasa|rekabet|esneklik|maliyet|tüketici|fayda)/.test(text)) {
    return 'market_curve';
  }
  if (/(sanayi|endüstri|ticaret|kervansaray|ihracat|ithalat|küresel|teknoloji|fabrika|liman|gümrük)/.test(text)) {
    return 'industry_trade';
  }
  if (/(maliye|vergi|bütçe|vakıf|hazine|harcama|sosyal|kamu|gelir)/.test(text)) {
    return 'fiscal_welfare';
  }
  if (/(hukuk|anayasa|kanun|mülkiyet|mahkeme|adalet|yaptırım|sözleşme|hak)/.test(text)) {
    return 'law_institution';
  }
  if (/(feodal|ikta|tımar|devlet|imparatorluk|selçuklu|osmanlı|bizans|merkezi|otorite|kale|çöküş)/.test(text)) {
    return 'feudalism_state';
  }
  if (/(veri|istatistik|ekonometri|grafik|oran|endeks|katsayı|büyüme)/.test(text)) {
    return 'analytics_science';
  }

  const byTheme: Record<VisualTheme, IllustrationArchetype[]> = {
    history: ['agriculture', 'feudalism_state', 'industry_trade', 'fiscal_welfare'],
    economics: ['central_bank', 'market_curve', 'industry_trade', 'fiscal_welfare'],
    law: ['law_institution', 'feudalism_state', 'fiscal_welfare', 'analytics_science'],
    science: ['analytics_science', 'industry_trade', 'market_curve', 'central_bank'],
    society: ['agriculture', 'feudalism_state', 'law_institution', 'industry_trade'],
  };
  const list = byTheme[theme] || byTheme.economics;
  return list[index % list.length];
}

/**
 * Her sahne düğümü için NotebookLM'in "10.000 Yıllık Devrim" videosundaki gibi
 * suluboya pastel arka plan + ince mürekkep çizimli zengin sahne illüstrasyonu çizer.
 */
function drawEditorialSceneIllustration(
  ctx: CanvasRenderingContext2D,
  box: Area,
  archetype: IllustrationArchetype,
  isActive: boolean,
  now: number,
) {
  ctx.save();
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;

  // Suluboya (watercolor) organik arka plan halesi
  const washColors: Record<IllustrationArchetype, [string, string]> = {
    agriculture: ['rgba(254, 240, 138, 0.55)', 'rgba(187, 247, 208, 0.48)'],
    feudalism_state: ['rgba(226, 232, 240, 0.65)', 'rgba(254, 215, 170, 0.45)'],
    industry_trade: ['rgba(186, 230, 253, 0.50)', 'rgba(226, 232, 240, 0.55)'],
    central_bank: ['rgba(186, 230, 253, 0.58)', 'rgba(254, 240, 138, 0.45)'],
    market_curve: ['rgba(187, 247, 208, 0.48)', 'rgba(186, 230, 253, 0.48)'],
    fiscal_welfare: ['rgba(254, 240, 138, 0.52)', 'rgba(199, 210, 254, 0.48)'],
    law_institution: ['rgba(254, 215, 170, 0.48)', 'rgba(226, 232, 240, 0.55)'],
    analytics_science: ['rgba(199, 210, 254, 0.50)', 'rgba(187, 247, 208, 0.45)'],
  };
  const [w1, w2] = washColors[archetype];

  ctx.beginPath();
  ctx.ellipse(cx - 24, cy - 8, box.w * 0.38, box.h * 0.36, -0.12, 0, Math.PI * 2);
  ctx.fillStyle = w1;
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(cx + 28, cy + 12, box.w * 0.34, box.h * 0.32, 0.18, 0, Math.PI * 2);
  ctx.fillStyle = w2;
  ctx.fill();

  if (isActive) {
    ctx.strokeStyle = ACCENT_BLUE;
    ctx.lineWidth = 1.6;
    ctx.setLineDash([5, 5]);
    rr(ctx, box.x + 8, box.y + 6, box.w - 16, box.h - 12, 16);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const horizonY = box.y + box.h * 0.72;

  if (archetype === 'agriculture') {
    // Güneş ve ışınları
    const sunX = cx - 18;
    const sunY = box.y + box.h * 0.28;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 18, 0, Math.PI * 2);
    ctx.fillStyle = '#fde047';
    ctx.fill();
    ctx.stroke();

    for (let a = 0; a < 8; a++) {
      const ang = (a * Math.PI) / 4 + (now / 9000);
      ctx.beginPath();
      ctx.moveTo(sunX + Math.cos(ang) * 23, sunY + Math.sin(ang) * 23);
      ctx.lineTo(sunX + Math.cos(ang) * 31, sunY + Math.sin(ang) * 31);
      ctx.stroke();
    }

    // Ufuk çizgisi ve perspektif tarla sürüm çizgileri
    ctx.beginPath();
    ctx.moveTo(box.x + 28, horizonY);
    ctx.lineTo(box.x + box.w - 28, horizonY);
    ctx.stroke();

    for (let i = -3; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(cx + i * 18, horizonY);
      ctx.lineTo(cx + i * 42, box.y + box.h - 14);
      ctx.strokeStyle = 'rgba(30, 41, 59, 0.55)';
      ctx.stroke();
    }
    ctx.strokeStyle = INK;

    // Ekin filizleri
    for (let i = -2; i <= 2; i++) {
      const px = cx + i * 34;
      const py = horizonY + 18;
      ctx.beginPath();
      ctx.moveTo(px, py + 12);
      ctx.lineTo(px, py - 6);
      ctx.moveTo(px, py + 4);
      ctx.lineTo(px - 6, py - 2);
      ctx.moveTo(px, py + 2);
      ctx.lineTo(px + 6, py - 4);
      ctx.strokeStyle = '#15803d';
      ctx.stroke();
    }
    ctx.strokeStyle = INK;

    // Çiftçi figürleri (sol ve sağ)
    const drawFarmer = (fx: number, fy: number) => {
      ctx.beginPath();
      ctx.arc(fx, fy - 26, 6.5, 0, Math.PI * 2);
      ctx.fillStyle = '#fed7aa';
      ctx.fill();
      ctx.stroke();
      // Şapka
      ctx.beginPath();
      ctx.moveTo(fx - 11, fy - 30);
      ctx.lineTo(fx + 11, fy - 30);
      ctx.stroke();
      // Gövde
      rr(ctx, fx - 7, fy - 19, 14, 18, 4);
      ctx.fillStyle = '#60a5fa';
      ctx.fill();
      ctx.stroke();
      // Çapa / Orak aracı
      ctx.beginPath();
      ctx.moveTo(fx + 8, fy - 14);
      ctx.lineTo(fx + 20, fy + 8);
      ctx.stroke();
    };
    drawFarmer(cx - 58, horizonY + 4);
    drawFarmer(cx + 56, horizonY + 4);
  } else if (archetype === 'feudalism_state') {
    // Ortaçağ / İmparatorluk kalesi, kuleler, surlar ve kasaba
    const baseW = Math.min(200, box.w * 0.68);
    const leftX = cx - baseW / 2;

    // Arka tepe
    ctx.beginPath();
    ctx.moveTo(leftX - 16, horizonY + 12);
    ctx.quadraticCurveTo(cx, box.y + 28, leftX + baseW + 16, horizonY + 12);
    ctx.fillStyle = 'rgba(187, 247, 208, 0.45)';
    ctx.fill();

    // Merkez burç kulesi
    rr(ctx, cx - 22, box.y + 34, 44, horizonY - (box.y + 34), 3);
    ctx.fillStyle = '#e2e8f0';
    ctx.fill();
    ctx.stroke();

    // Kule külahı ve bayrak
    ctx.beginPath();
    ctx.moveTo(cx - 26, box.y + 34);
    ctx.lineTo(cx, box.y + 12);
    ctx.lineTo(cx + 26, box.y + 34);
    ctx.closePath();
    ctx.fillStyle = '#f59e0b';
    ctx.fill();
    ctx.stroke();

    // Yan kuleler
    [-58, 34].forEach((dx) => {
      rr(ctx, cx + dx, box.y + 56, 26, horizonY - (box.y + 56), 2);
      ctx.fillStyle = '#f1f5f9';
      ctx.fill();
      ctx.stroke();
    });

    // Ön sur duvarı ve kemerli kapı
    rr(ctx, cx - 64, horizonY - 38, 128, 38, 3);
    ctx.fillStyle = '#f8fafc';
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, horizonY, 14, Math.PI, 0);
    ctx.fillStyle = '#334155';
    ctx.fill();
    ctx.stroke();

    // Zemin çizgisi
    ctx.beginPath();
    ctx.moveTo(box.x + 26, horizonY);
    ctx.lineTo(box.x + box.w - 26, horizonY);
    ctx.stroke();
  } else if (archetype === 'industry_trade') {
    // Sanayi bacaları, duman, çarklar ve küresel ticaret küresi
    const fx = cx - 72;
    // Fabrika gövdesi
    rr(ctx, fx, horizonY - 46, 86, 46, 3);
    ctx.fillStyle = '#e2e8f0';
    ctx.fill();
    ctx.stroke();

    // Bacalar ve duman halkaları
    [fx + 14, fx + 38].forEach((bx, bi) => {
      rr(ctx, bx, horizonY - 82 + bi * 8, 14, 36 - bi * 8, 2);
      ctx.fillStyle = '#cbd5e1';
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(bx + 14, horizonY - 92, 9, 0, Math.PI * 2);
      ctx.arc(bx + 26, horizonY - 98, 12, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.fill();
      ctx.stroke();
    });

    // Küresel ticaret küresi (sağ üst)
    const gx = cx + 48;
    const gy = box.y + box.h * 0.36;
    const gr = 26;
    ctx.beginPath();
    ctx.arc(gx, gy, gr, 0, Math.PI * 2);
    ctx.fillStyle = '#e0f2fe';
    ctx.fill();
    ctx.stroke();
    // Enlem/boylam çizgileri
    ctx.beginPath();
    ctx.ellipse(gx, gy, gr * 0.48, gr, 0, 0, Math.PI * 2);
    ctx.moveTo(gx - gr, gy);
    ctx.lineTo(gx + gr, gy);
    ctx.stroke();

    // Ticaret konteynerleri / sandıklar
    rr(ctx, cx + 22, horizonY - 28, 34, 28, 3);
    ctx.fillStyle = '#fde047';
    ctx.fill();
    ctx.stroke();
    rr(ctx, cx + 60, horizonY - 22, 28, 22, 3);
    ctx.fillStyle = '#93c5fd';
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(box.x + 24, horizonY);
    ctx.lineTo(box.x + box.w - 24, horizonY);
    ctx.stroke();
  } else if (archetype === 'central_bank') {
    // Merkez Bankası sütunlu cephe + faiz ve emisyon akışı
    const bw = 116;
    const bx = cx - bw / 2;
    const topY = box.y + 44;

    // Üçgen alınlık (Pediment)
    ctx.beginPath();
    ctx.moveTo(bx - 10, topY);
    ctx.lineTo(cx, topY - 26);
    ctx.lineTo(bx + bw + 10, topY);
    ctx.closePath();
    ctx.fillStyle = '#fde68a';
    ctx.fill();
    ctx.stroke();

    // Sütunlar
    for (let i = 0; i < 4; i++) {
      const colX = bx + 12 + i * 28;
      rr(ctx, colX, topY + 6, 12, horizonY - topY - 14, 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.stroke();
    }

    // Taban merdiveni
    rr(ctx, bx - 8, horizonY - 8, bw + 16, 10, 3);
    ctx.fillStyle = '#cbd5e1';
    ctx.fill();
    ctx.stroke();

    // Sol ve sağda banknot/likidite rozetleri
    rr(ctx, cx - 94, topY + 18, 28, 18, 4);
    ctx.fillStyle = '#bbf7d0';
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx + 80, topY + 28, 14, 0, Math.PI * 2);
    ctx.fillStyle = '#bae6fd';
    ctx.fill();
    ctx.stroke();
    ctx.font = font(800, 13);
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('₺', cx + 80, topY + 29);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  } else if (archetype === 'market_curve') {
    // Arz (S) ve Talep (D) kesişim grafiği illüstrasyonu
    const gx = cx - 64;
    const gy = box.y + 26;
    const gw = 128;
    const gh = horizonY - gy;

    // Eksenler
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    ctx.lineTo(gx, gy + gh);
    ctx.lineTo(gx + gw, gy + gh);
    ctx.stroke();

    // Talep eğrisi (negatif eğimli)
    ctx.beginPath();
    ctx.moveTo(gx + 14, gy + 14);
    ctx.quadraticCurveTo(gx + gw * 0.45, gy + gh * 0.55, gx + gw - 10, gy + gh - 12);
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 2.6;
    ctx.stroke();

    // Arz eğrisi (pozitif eğimli)
    ctx.beginPath();
    ctx.moveTo(gx + 14, gy + gh - 14);
    ctx.quadraticCurveTo(gx + gw * 0.45, gy + gh * 0.55, gx + gw - 10, gy + 14);
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 2.6;
    ctx.stroke();

    // Denge noktası E*
    const ex = gx + gw * 0.48;
    const ey = gy + gh * 0.52;
    ctx.beginPath();
    ctx.arc(ex, ey, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#facc15';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.stroke();
  } else if (archetype === 'law_institution') {
    // Adalet terazisi ve kurumsal sütun
    ctx.beginPath();
    ctx.moveTo(cx, box.y + 24);
    ctx.lineTo(cx, horizonY);
    ctx.moveTo(cx - 48, box.y + 44);
    ctx.lineTo(cx + 48, box.y + 44);
    ctx.moveTo(cx - 26, horizonY);
    ctx.lineTo(cx + 26, horizonY);
    ctx.stroke();

    // Terazi kefeleri
    [-48, 48].forEach((dx) => {
      ctx.beginPath();
      ctx.moveTo(cx + dx, box.y + 44);
      ctx.lineTo(cx + dx - 14, box.y + 74);
      ctx.moveTo(cx + dx, box.y + 44);
      ctx.lineTo(cx + dx + 14, box.y + 74);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx + dx, box.y + 74, 16, 0, Math.PI);
      ctx.fillStyle = '#fde047';
      ctx.fill();
      ctx.stroke();
    });
  } else {
    // fiscal_welfare & analytics_science: Yükselen sütunlar + trend eğrisi
    const bw = 20;
    const gap = 12;
    const startX = cx - ((bw + gap) * 4 - gap) / 2;
    const heights = [34, 54, 46, 76];
    const colors = ['#bae6fd', '#fde047', '#bbf7d0', '#60a5fa'];

    heights.forEach((h, i) => {
      const bx = startX + i * (bw + gap);
      const by = horizonY - h;
      rr(ctx, bx, by, bw, h, [4, 4, 0, 0]);
      ctx.fillStyle = colors[i % colors.length];
      ctx.fill();
      ctx.stroke();
    });

    ctx.beginPath();
    ctx.moveTo(box.x + 28, horizonY);
    ctx.lineTo(box.x + box.w - 28, horizonY);
    ctx.stroke();
  }

  ctx.restore();
}

// ============================================================================
// 3. DİYAGRAM ÇİZİCİLER (7 FARKLI NOTEBOOKLM EDİTORYAL ŞEMA TİPİ)
// ============================================================================

/**
 * 3.1 'visual' / 'timeline' / 'scenario':
 * Kullanıcının paylaştığı NotebookLM "10.000 Yıllık Devrim" ekran görüntüsündeki
 * İllüstrasyon + Yatay İlerleme Çizgisi + "Neden → Sonuç" Etiketi + Açıklama Kartı düzeni.
 */
function drawIllustratedProgressionStage(
  ctx: CanvasRenderingContext2D,
  a: Area,
  f: StageFrame,
  nodes: DiagramNode[],
  reveal: number,
  darkBoard: boolean,
): Point {
  const items = nodes.slice(0, 4);
  const n = Math.max(1, items.length);
  const act = activeIndex(n, reveal);
  const gap = 28;
  const colW = (a.w - gap * (n - 1)) / n;

  const trackY = a.y + a.h * 0.49;
  let target: Point = { x: a.x + a.w / 2, y: trackY };

  // Yatay süreklilik/zaman rayı (NotebookLM mavi ilerleme çubuğu)
  const trackLeft = a.x + 24;
  const trackRight = a.x + a.w - 24;
  const trackW = trackRight - trackLeft;

  ctx.save();
  rr(ctx, trackLeft, trackY - 5, trackW, 10, 5);
  ctx.fillStyle = darkBoard ? 'rgba(148, 163, 184, 0.22)' : '#cbd5e1';
  ctx.fill();

  const fillW = Math.max(24, trackW * clamp(f.progress || 0.35));
  rr(ctx, trackLeft, trackY - 5, fillW, 10, 5);
  ctx.fillStyle = ACCENT_BLUE;
  ctx.fill();

  // Mavi ilerleme dairesi (scrubber)
  const knobX = trackLeft + fillW;
  ctx.beginPath();
  ctx.arc(knobX, trackY, 16, 0, Math.PI * 2);
  ctx.fillStyle = '#3b82f6';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.restore();

  items.forEach((nd, i) => {
    const t = appearAmount(i, n, reveal, f.poster);
    const cx = a.x + i * (colW + gap);
    const isAct = i === act;

    ctx.save();
    ctx.globalAlpha = t;

    // 1) Üst İllüstrasyon Kutusu
    const illusArea: Area = {
      x: cx + 6,
      y: a.y + 4,
      w: colW - 12,
      h: trackY - a.y - 24,
    };
    const archetype = detectIllustrationArchetype(nd, f.scene.diagram.visualTheme, i);
    drawEditorialSceneIllustration(ctx, illusArea, archetype, isAct, f.now);

    // Sütunlar arası bağlantı oku (→)
    if (i < n - 1) {
      const ax = cx + colW + gap / 2;
      const ay = illusArea.y + illusArea.h * 0.52;
      ctx.strokeStyle = darkBoard ? '#94a3b8' : INK;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ax - 9, ay);
      ctx.lineTo(ax + 9, ay);
      ctx.moveTo(ax + 3, ay - 6);
      ctx.lineTo(ax + 9, ay);
      ctx.lineTo(ax + 3, ay + 6);
      ctx.stroke();
    }

    // 2) NotebookLM tarzı "Neden → Sonuç" (Formula) Etiket Kutusu
    const formulaText = buildCausalFormulaBadge(nd, i);
    const pillY = trackY + 22;
    const pillH = 44;

    // Kutu gölgesi
    if (isAct) {
      rr(ctx, cx + 10, pillY + 4, colW - 12, pillH, 8);
      ctx.fillStyle = ACCENT_AMBER;
      ctx.fill();
    }

    rr(ctx, cx + 6, pillY, colW - 12, pillH, 8);
    ctx.fillStyle = isAct
      ? ACCENT_PASTEL_YELLOW
      : darkBoard
      ? '#1e293b'
      : '#e2e8f0';
    ctx.fill();
    ctx.lineWidth = isAct ? 2.2 : 1.6;
    ctx.strokeStyle = darkBoard ? '#64748b' : INK;
    ctx.stroke();

    ctx.font = font(700, 15.5);
    ctx.fillStyle = darkBoard && !isAct ? '#f8fafc' : INK_DARK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const shortFormula = wrapText(ctx, formulaText, colW - 30, 1)[0] || formulaText;
    ctx.fillText(shortFormula, cx + colW / 2, pillY + pillH / 2 + 0.5);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    // 3) Alt Açıklama ve Sınav Özeti Kartı
    const descY = pillY + pillH + 16;
    const descH = a.y + a.h - descY - 6;

    rr(ctx, cx + 6, descY, colW - 12, descH, 14);
    ctx.fillStyle = darkBoard
      ? isAct
        ? 'rgba(30, 58, 138, 0.45)'
        : 'rgba(15, 23, 42, 0.75)'
      : isAct
      ? '#fffbeb'
      : '#f8fafc';
    ctx.fill();
    ctx.lineWidth = isAct ? 2 : 1.3;
    ctx.strokeStyle = isAct ? ACCENT_BLUE : darkBoard ? 'rgba(148,163,184,0.25)' : '#cbd5e1';
    ctx.stroke();

    // Numara ve başlık satırı
    ctx.font = font(800, 15.5);
    ctx.fillStyle = isAct ? '#1d4ed8' : darkBoard ? '#38bdf8' : INK_DARK;
    const cleanHead = wrapText(ctx, `${i + 1}. ${nd.label}`, colW - 36, 1)[0] || nd.label;
    ctx.fillText(cleanHead, cx + 20, descY + 28);

    // Açıklama metni
    ctx.font = font(500, 14.5);
    ctx.fillStyle = darkBoard ? '#e2e8f0' : '#334155';
    const maxDescLines = Math.max(2, Math.min(5, Math.floor((descH - 48) / 22)));
    const lines = wrapText(ctx, nd.subtext || nd.label, colW - 36, maxDescLines);
    drawLines(ctx, lines, cx + 20, descY + 54, 21.5);

    if (isAct) {
      target = { x: cx + colW / 2, y: pillY + pillH / 2 };
    }
    ctx.restore();
  });

  return target;
}

/**
 * 3.2 'curve': Ekonomik Denge & Eğri Analizi (Sol: Editoryal Arz-Talep/Para Piyasası Grafiği, Sağ: Açıklama Kartları)
 */
function drawEditorialCurveStage(
  ctx: CanvasRenderingContext2D,
  a: Area,
  f: StageFrame,
  nodes: DiagramNode[],
  reveal: number,
  darkBoard: boolean,
): Point {
  const items = nodes.slice(0, 4);
  const act = activeIndex(items.length, reveal);
  const leftW = Math.floor(a.w * 0.50);
  const rightX = a.x + leftW + 30;
  const rightW = a.w - leftW - 30;

  // Sol Grafik Çerçevesi
  const gx = a.x + 12;
  const gy = a.y + 8;
  const gw = leftW - 12;
  const gh = a.h - 16;

  rr(ctx, gx + 6, gy + 6, gw, gh, 16);
  ctx.fillStyle = darkBoard ? 'rgba(0,0,0,0.4)' : '#e2e8f0';
  ctx.fill();

  rr(ctx, gx, gy, gw, gh, 16);
  ctx.fillStyle = darkBoard ? '#0f172a' : '#ffffff';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = darkBoard ? '#475569' : INK;
  ctx.stroke();

  // Koordinat eksenleri
  const ox = gx + 66;
  const oy = gy + gh - 56;
  const axW = gw - 104;
  const axH = gh - 108;

  ctx.strokeStyle = darkBoard ? 'rgba(148,163,184,0.12)' : 'rgba(30,41,59,0.08)';
  ctx.lineWidth = 1;
  for (let i = 1; i <= 4; i++) {
    const ly = oy - (axH * i) / 4;
    ctx.beginPath();
    ctx.moveTo(ox, ly);
    ctx.lineTo(ox + axW, ly);
    ctx.stroke();
  }

  ctx.strokeStyle = darkBoard ? '#e2e8f0' : INK;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(ox, oy - axH);
  ctx.lineTo(ox, oy);
  ctx.lineTo(ox + axW, oy);
  ctx.stroke();

  // Eksen etiketleri
  ctx.font = font(700, 13.5);
  ctx.fillStyle = darkBoard ? '#cbd5e1' : INK_MUTED;
  ctx.fillText('Fiyat / Faiz (P, i)', ox - 18, oy - axH - 12);
  ctx.textAlign = 'right';
  ctx.fillText('Miktar / Hasıla (Q, Y)', ox + axW, oy + 32);
  ctx.textAlign = 'left';

  // Talep / Md Eğrisi (Mavi)
  ctx.beginPath();
  ctx.moveTo(ox + 28, oy - axH + 28);
  ctx.quadraticCurveTo(ox + axW * 0.45, oy - axH * 0.45, ox + axW - 22, oy - 26);
  ctx.strokeStyle = '#2563eb';
  ctx.lineWidth = 3.5;
  ctx.stroke();
  ctx.font = font(800, 15);
  ctx.fillStyle = '#2563eb';
  ctx.fillText('D / Md', ox + axW - 62, oy - 36);

  // Arz / Ms Eğrisi (Mercan Kırmızı)
  ctx.beginPath();
  ctx.moveTo(ox + 28, oy - 28);
  ctx.quadraticCurveTo(ox + axW * 0.45, oy - axH * 0.45, ox + axW - 22, oy - axH + 28);
  ctx.strokeStyle = '#e11d48';
  ctx.lineWidth = 3.5;
  ctx.stroke();
  ctx.fillStyle = '#e11d48';
  ctx.fillText('S / Ms', ox + axW - 62, oy - axH + 22);

  // Denge Noktası E*
  const eqX = ox + axW * 0.465;
  const eqY = oy - axH * 0.475;

  ctx.setLineDash([6, 6]);
  ctx.strokeStyle = darkBoard ? '#94a3b8' : '#64748b';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(ox, eqY);
  ctx.lineTo(eqX, eqY);
  ctx.lineTo(eqX, oy);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.beginPath();
  ctx.arc(eqX, eqY, 9, 0, Math.PI * 2);
  ctx.fillStyle = ACCENT_AMBER;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = INK;
  ctx.stroke();

  rr(ctx, eqX + 14, eqY - 18, 96, 30, 8);
  ctx.fillStyle = ACCENT_PASTEL_YELLOW;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.font = font(800, 13.5);
  ctx.fillStyle = INK_DARK;
  ctx.fillText('Denge (E*)', eqX + 24, eqY + 2);

  // Sağ Sütun: Kavram ve Mekanizma Kartları
  const cardGap = 14;
  const cardH = (gh - cardGap * Math.max(0, items.length - 1)) / Math.max(1, items.length);
  let target: Point = { x: eqX, y: eqY };

  items.forEach((nd, i) => {
    const cy = gy + i * (cardH + cardGap);
    const isAct = i === act;

    if (isAct) {
      rr(ctx, rightX + 6, cy + 5, rightW - 8, cardH, 14);
      ctx.fillStyle = ACCENT_AMBER;
      ctx.fill();
      target = { x: rightX + rightW / 2, y: cy + cardH / 2 };
    }

    rr(ctx, rightX, cy, rightW - 8, cardH, 14);
    ctx.fillStyle = darkBoard
      ? isAct
        ? '#1e293b'
        : '#0f172a'
      : isAct
      ? '#fffbeb'
      : '#ffffff';
    ctx.fill();
    ctx.lineWidth = isAct ? 2.2 : 1.5;
    ctx.strokeStyle = isAct ? INK : darkBoard ? '#334155' : '#cbd5e1';
    ctx.stroke();

    // Başlık ve formül rozeti
    const badgeTxt = buildCausalFormulaBadge(nd, i);
    ctx.font = font(800, 16);
    ctx.fillStyle = isAct ? '#1d4ed8' : darkBoard ? '#f8fafc' : INK_DARK;
    ctx.fillText(wrapText(ctx, badgeTxt, rightW - 44, 1)[0] || badgeTxt, rightX + 18, cy + 28);

    ctx.font = font(500, 14.5);
    ctx.fillStyle = darkBoard ? '#cbd5e1' : '#334155';
    const maxLines = Math.max(1, Math.min(3, Math.floor((cardH - 42) / 21)));
    const lines = wrapText(ctx, nd.subtext || nd.label, rightW - 44, maxLines);
    drawLines(ctx, lines, rightX + 18, cy + 52, 21);
  });

  return target;
}

/**
 * 3.3 'table': Karşılaştırmalı Akademik Matris (NotebookLM Editoryal Tablo)
 */
function drawEditorialTableStage(
  ctx: CanvasRenderingContext2D,
  a: Area,
  nodes: DiagramNode[],
  reveal: number,
  darkBoard: boolean,
): Point {
  const items = nodes.slice(0, 4);
  const act = activeIndex(items.length, reveal);
  const tx = a.x + 10;
  const ty = a.y + 8;
  const tw = a.w - 20;
  const th = a.h - 16;

  rr(ctx, tx, ty, tw, th, 16);
  ctx.fillStyle = darkBoard ? '#0f172a' : '#ffffff';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = darkBoard ? '#475569' : INK;
  ctx.stroke();

  const headerH = 54;
  rr(ctx, tx, ty, tw, headerH, [16, 16, 0, 0]);
  ctx.fillStyle = darkBoard ? '#1e293b' : '#fde68a';
  ctx.fill();
  ctx.stroke();

  const col1W = Math.floor(tw * 0.26);
  const col2W = Math.floor(tw * 0.22);

  ctx.font = font(800, 15);
  ctx.fillStyle = darkBoard ? '#f8fafc' : INK_DARK;
  ctx.fillText('KAVRAM / İLKE', tx + 22, ty + 33);
  ctx.fillText('NEDEN → SONUÇ BAĞI', tx + col1W + 18, ty + 33);
  ctx.fillText('AKADEMİK AÇIKLAMA & SINAV AYRIMI', tx + col1W + col2W + 18, ty + 33);

  const rowH = (th - headerH) / Math.max(1, items.length);
  let target: Point = { x: tx + tw / 2, y: ty + th / 2 };

  items.forEach((nd, i) => {
    const ry = ty + headerH + i * rowH;
    const isAct = i === act;

    if (isAct) {
      ctx.fillStyle = darkBoard ? 'rgba(37, 99, 235, 0.22)' : '#fef9c3';
      ctx.fillRect(tx + 2, ry + 1, tw - 4, rowH - 2);
      target = { x: tx + tw / 2, y: ry + rowH / 2 };
    } else if (i % 2 === 1) {
      ctx.fillStyle = darkBoard ? 'rgba(255,255,255,0.02)' : '#f8fafc';
      ctx.fillRect(tx + 2, ry + 1, tw - 4, rowH - 2);
    }

    if (i > 0) {
      ctx.beginPath();
      ctx.moveTo(tx, ry);
      ctx.lineTo(tx + tw, ry);
      ctx.strokeStyle = darkBoard ? '#334155' : '#cbd5e1';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    // Sütun 1: Kavram
    ctx.font = font(800, 16);
    ctx.fillStyle = isAct ? '#1d4ed8' : darkBoard ? '#f8fafc' : INK_DARK;
    const lblLines = wrapText(ctx, nd.label, col1W - 36, 2);
    drawLines(ctx, lblLines, tx + 22, ry + 34, 21);

    // Sütun 2: Formül Rozeti
    const formula = buildCausalFormulaBadge(nd, i);
    const pillW = Math.min(col2W - 28, ctx.measureText(formula).width + 26);
    rr(ctx, tx + col1W + 16, ry + 20, pillW, 32, 8);
    ctx.fillStyle = isAct ? ACCENT_AMBER : darkBoard ? '#1e293b' : '#e2e8f0';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.font = font(700, 13);
    ctx.fillStyle = darkBoard && !isAct ? '#e2e8f0' : INK_DARK;
    ctx.fillText(
      wrapText(ctx, formula, pillW - 16, 1)[0] || formula,
      tx + col1W + 24,
      ry + 41,
    );

    // Sütun 3: Tam Açıklama
    ctx.font = font(500, 15);
    ctx.fillStyle = darkBoard ? '#e2e8f0' : '#334155';
    const descW = tw - col1W - col2W - 42;
    const descLines = wrapText(ctx, nd.subtext || nd.label, descW, 3);
    drawLines(ctx, descLines, tx + col1W + col2W + 18, ry + 34, 22);
  });

  return target;
}

/**
 * 3.4 'chart': Analitik Etki Hiyerarşisi Sütun & Eğilim Grafiği
 */
function drawEditorialChartStage(
  ctx: CanvasRenderingContext2D,
  a: Area,
  nodes: DiagramNode[],
  reveal: number,
  darkBoard: boolean,
): Point {
  const items = nodes.slice(0, 4);
  const act = activeIndex(items.length, reveal);
  const n = Math.max(1, items.length);
  const gap = 28;
  const colW = (a.w - gap * (n - 1)) / n;
  const chartBottom = a.y + a.h * 0.56;
  const maxBarH = a.h * 0.42;

  const barColors = [ACCENT_AMBER, '#60a5fa', '#34d399', '#c084fc'];
  let target: Point = { x: a.x + a.w / 2, y: chartBottom };

  // Taban çizgisi
  ctx.strokeStyle = darkBoard ? '#64748b' : INK;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(a.x + 12, chartBottom);
  ctx.lineTo(a.x + a.w - 12, chartBottom);
  ctx.stroke();

  items.forEach((nd, i) => {
    const cx = a.x + i * (colW + gap);
    const val = clamp((nd.value ?? 88 - i * 8) / 100, 0.35, 0.96);
    const bh = maxBarH * val;
    const bx = cx + colW * 0.22;
    const bw = colW * 0.56;
    const by = chartBottom - bh;
    const isAct = i === act;

    // Sütun gölgesi
    rr(ctx, bx + 6, by + 6, bw, bh, [12, 12, 0, 0]);
    ctx.fillStyle = 'rgba(30, 41, 59, 0.18)';
    ctx.fill();

    // Sütun
    rr(ctx, bx, by, bw, bh, [12, 12, 0, 0]);
    ctx.fillStyle = barColors[i % barColors.length];
    ctx.fill();
    ctx.lineWidth = isAct ? 2.6 : 1.8;
    ctx.strokeStyle = INK;
    ctx.stroke();

    // Yüzde etiketi
    ctx.font = font(800, 17);
    ctx.fillStyle = darkBoard ? '#f8fafc' : INK_DARK;
    ctx.textAlign = 'center';
    ctx.fillText(`%${Math.round(val * 100)}`, bx + bw / 2, by - 10);
    ctx.textAlign = 'left';

    // Alt açıklama kartı
    const cardY = chartBottom + 18;
    const cardH = a.y + a.h - cardY - 6;
    rr(ctx, cx + 4, cardY, colW - 8, cardH, 14);
    ctx.fillStyle = darkBoard
      ? isAct
        ? '#1e293b'
        : '#0f172a'
      : isAct
      ? '#fef9c3'
      : '#f8fafc';
    ctx.fill();
    ctx.lineWidth = isAct ? 2.2 : 1.4;
    ctx.strokeStyle = isAct ? INK : '#cbd5e1';
    ctx.stroke();

    ctx.font = font(800, 15.5);
    ctx.fillStyle = darkBoard ? '#f8fafc' : INK_DARK;
    ctx.fillText(wrapText(ctx, nd.label, colW - 32, 1)[0] || nd.label, cx + 16, cardY + 28);

    ctx.font = font(500, 14);
    ctx.fillStyle = darkBoard ? '#cbd5e1' : '#334155';
    const lines = wrapText(ctx, nd.subtext || nd.label, colW - 32, 4);
    drawLines(ctx, lines, cx + 16, cardY + 52, 20.5);

    if (isAct) {
      target = { x: bx + bw / 2, y: by + bh / 2 };
    }
  });

  return target;
}

/**
 * 3.5 'comparison': İkili Kavramsal Kıyaslama Matrisi
 */
function drawEditorialComparisonStage(
  ctx: CanvasRenderingContext2D,
  a: Area,
  nodes: DiagramNode[],
  reveal: number,
  darkBoard: boolean,
): Point {
  const act = activeIndex(nodes.length, reveal);
  const gap = 46;
  const colW = (a.w - gap) / 2;
  const split = Math.ceil(nodes.length / 2);
  const cols = [nodes.slice(0, split), nodes.slice(split)];
  const headerFills = ['#fde68a', '#bae6fd'];

  let target: Point = { x: a.x + a.w / 2, y: a.y + a.h / 2 };

  cols.forEach((items, ci) => {
    if (!items.length) return;
    const cx = a.x + ci * (colW + gap);

    rr(ctx, cx + 6, a.y + 6, colW, a.h - 8, 18);
    ctx.fillStyle = ci === 0 ? ACCENT_AMBER : '#60a5fa';
    ctx.fill();

    rr(ctx, cx, a.y, colW, a.h - 8, 18);
    ctx.fillStyle = darkBoard ? '#0f172a' : '#ffffff';
    ctx.fill();
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = INK;
    ctx.stroke();

    rr(ctx, cx, a.y, colW, 54, [18, 18, 0, 0]);
    ctx.fillStyle = headerFills[ci];
    ctx.fill();
    ctx.stroke();

    ctx.font = font(800, 18);
    ctx.fillStyle = INK_DARK;
    ctx.fillText(
      wrapText(ctx, items[0].label || `Boyut ${ci + 1}`, colW - 44, 1)[0] || '',
      cx + 22,
      a.y + 34,
    );

    let iy = a.y + 72;
    const rowH = (a.h - 96) / Math.max(1, items.length);

    items.forEach((it, ii) => {
      const globalIdx = ci === 0 ? ii : split + ii;
      const isAct = globalIdx === act;
      const bh = rowH - 12;

      rr(ctx, cx + 16, iy, colW - 32, bh, 12);
      ctx.fillStyle = darkBoard
        ? isAct
          ? '#1e293b'
          : '#090d16'
        : isAct
        ? '#fef9c3'
        : '#f8fafc';
      ctx.fill();
      ctx.lineWidth = isAct ? 2 : 1.3;
      ctx.strokeStyle = isAct ? INK : '#cbd5e1';
      ctx.stroke();

      ctx.font = font(800, 15.5);
      ctx.fillStyle = isAct ? '#1d4ed8' : darkBoard ? '#f8fafc' : INK_DARK;
      const formula = buildCausalFormulaBadge(it, globalIdx);
      ctx.fillText(wrapText(ctx, formula, colW - 60, 1)[0] || formula, cx + 30, iy + 28);

      ctx.font = font(500, 14.5);
      ctx.fillStyle = darkBoard ? '#cbd5e1' : '#334155';
      const lines = wrapText(ctx, it.subtext || it.label, colW - 60, 3);
      drawLines(ctx, lines, cx + 30, iy + 52, 21);

      if (isAct) {
        target = { x: cx + colW / 2, y: iy + bh / 2 };
      }
      iy += rowH;
    });
  });

  // Merkez VS rozeti
  const vx = a.x + a.w / 2;
  const vy = a.y + a.h / 2;
  ctx.beginPath();
  ctx.arc(vx, vy, 22, 0, Math.PI * 2);
  ctx.fillStyle = ACCENT_AMBER;
  ctx.fill();
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = INK;
  ctx.stroke();

  ctx.font = font(800, 14);
  ctx.fillStyle = INK_DARK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('VS', vx, vy + 1);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  return target;
}

// ============================================================================
// 4. ANA SAHNE KARTI VE ALTYAZI BANDI
// ============================================================================
function drawSmartBoard(ctx: CanvasRenderingContext2D, f: StageFrame, darkBoard: boolean): Point {
  const sc = f.scene;
  const d = sc.diagram;
  const { x, y, w, h } = getBoardLayout(f.layoutMode).board;

  // 1) Sahne üstü büyük editoryal başlık (NotebookLM "10.000 Yıllık Devrim" serif başlığı)
  if (f.layoutMode !== 'focus') {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Küçük bölüm üst etiketi
    const pillLabel = `BÖLÜM ${String(f.sceneIndex + 1).padStart(2, '0')} / ${String(
      f.sceneCount,
    ).padStart(2, '0')}  ·  ${TYPE_LABEL[d.type] || 'VİDEOLU ÖZET'}`;
    ctx.font = font(700, 13);
    const pw = ctx.measureText(pillLabel).width + 32;
    rr(ctx, STAGE_W / 2 - pw / 2, 30, pw, 30, 15);
    ctx.fillStyle = darkBoard ? '#1e293b' : '#fef08a';
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = darkBoard ? '#475569' : INK;
    ctx.stroke();
    ctx.fillStyle = darkBoard ? '#f8fafc' : INK_DARK;
    ctx.fillText(pillLabel, STAGE_W / 2, 45.5);

    // Ana Serif Başlık
    ctx.font = font(700, 50, FONT_SERIF);
    ctx.fillStyle = darkBoard ? '#f8fafc' : INK_DARK;
    const headLine = wrapText(ctx, sc.title || d.title, 1340, 1)[0] || sc.title;
    ctx.fillText(headLine, STAGE_W / 2, 118);

    // Alt özet / anahtar tez satırı
    const subThesis = sc.examTip || d.metric || sc.keyTakeaways?.[0] || '';
    if (subThesis) {
      ctx.font = font(500, 16.5, FONT_SANS);
      ctx.fillStyle = darkBoard ? '#94a3b8' : INK_MUTED;
      const subLine = wrapText(ctx, subThesis, 1280, 1)[0] || '';
      ctx.fillText(subLine, STAGE_W / 2, 162);
    }
    ctx.restore();
  }

  // 2) NotebookLM Sarı Ofset Gölgeli Ana Beyaz Sahne Kartı
  ctx.save();
  rr(ctx, x + 12, y + 12, w, h, 22);
  ctx.fillStyle = darkBoard ? 'rgba(59, 130, 246, 0.25)' : ACCENT_AMBER;
  ctx.fill();
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = darkBoard ? '#475569' : INK;
  ctx.stroke();

  rr(ctx, x, y, w, h, 22);
  ctx.fillStyle = darkBoard ? '#0b1120' : '#ffffff';
  ctx.fill();
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = darkBoard ? '#475569' : INK;
  ctx.stroke();

  // Sol-üst imza sarı raptiye noktası (NotebookLM kart ikonu)
  ctx.beginPath();
  ctx.arc(x + 32, y + 32, 9.5, 0, Math.PI * 2);
  ctx.fillStyle = ACCENT_AMBER;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK;
  ctx.stroke();

  // Sağ-üst aktif anlatıcı ve ders rozeti
  const activeSpk =
    f.activeSpeaker || sc.sentenceSpeakers?.[f.sentenceIndex] || sc.speaker;
  const spkLabel =
    activeSpk === 'Deniz' ? '🎙️ Dr. Deniz · Akademik Sentez' : '🎙️ Barış · Analitik Soru & Bağlam';
  ctx.font = font(700, 13);
  const sw = ctx.measureText(spkLabel).width + 28;
  rr(ctx, x + w - sw - 24, y + 18, sw, 30, 15);
  ctx.fillStyle = activeSpk === 'Deniz' ? '#e0f2fe' : '#fef3c7';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = INK_DARK;
  ctx.fillText(spkLabel, x + w - sw - 10, y + 37.5);
  ctx.restore();

  // 3) Kart İçi Diyagram Çizim Alanı
  const contentArea: Area = {
    x: x + 32,
    y: y + 60,
    w: w - 64,
    h: h - 132,
  };

  const nodes =
    d.nodes && d.nodes.length > 0
      ? d.nodes
      : [{ label: sc.title, subtext: sc.narration, badge: 'Anahtar Kavram', value: 85 }];
  const reveal = f.poster ? 1 : clamp(f.progress);

  let focusPoint: Point;
  switch (d.type) {
    case 'curve':
      focusPoint = drawEditorialCurveStage(ctx, contentArea, f, nodes, reveal, darkBoard);
      break;
    case 'table':
      focusPoint = drawEditorialTableStage(ctx, contentArea, nodes, reveal, darkBoard);
      break;
    case 'chart':
      focusPoint = drawEditorialChartStage(ctx, contentArea, nodes, reveal, darkBoard);
      break;
    case 'comparison':
      focusPoint = drawEditorialComparisonStage(ctx, contentArea, nodes, reveal, darkBoard);
      break;
    case 'visual':
    case 'timeline':
    case 'scenario':
    case 'shapes':
    case 'structure':
    case 'network':
    default:
      focusPoint = drawIllustratedProgressionStage(ctx, contentArea, f, nodes, reveal, darkBoard);
      break;
  }

  // 4) Kart Altı "Sınav & Kavram Notu" Şeridi
  const footerY = y + h - 58;
  rr(ctx, x + 32, footerY, w - 64, 42, 10);
  ctx.fillStyle = darkBoard ? '#1e293b' : '#f1f5f9';
  ctx.fill();
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = darkBoard ? '#334155' : '#cbd5e1';
  ctx.stroke();

  const currentSentence = sc.sentences[f.sentenceIndex] || sc.examTip || sc.narration;
  ctx.font = font(700, 13.5);
  ctx.fillStyle = '#2563eb';
  ctx.fillText('CANLI ANLATIM:', x + 48, footerY + 26);

  ctx.font = font(600, 14);
  ctx.fillStyle = darkBoard ? '#f8fafc' : INK_DARK;
  const line = wrapText(ctx, currentSentence, w - 230, 1)[0] || '';
  ctx.fillText(line, x + 172, footerY + 26);

  return focusPoint;
}

function drawEditorialSubtitles(
  ctx: CanvasRenderingContext2D,
  f: StageFrame,
  activeSpeaker: Speaker,
) {
  const sc = f.scene;
  const { x, y, w, h } = getBoardLayout(f.layoutMode).sub;

  ctx.save();
  rr(ctx, x + 6, y + 6, w, h, 16);
  ctx.fillStyle = ACCENT_AMBER;
  ctx.fill();

  rr(ctx, x, y, w, h, 16);
  ctx.fillStyle = '#0f172a';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK;
  ctx.stroke();

  const spkTitle = activeSpeaker === 'Deniz' ? 'DR. DENİZ' : 'BARIŞ';
  ctx.font = font(800, 13);
  ctx.fillStyle = ACCENT_YELLOW;
  ctx.fillText(spkTitle, x + 24, y + 28);

  const sentence = sc.sentences[f.sentenceIndex] || sc.narration;
  const subFontSize =
    f.subtitleSize === 'sm' ? 19 : f.subtitleSize === 'lg' ? 25 : f.subtitleSize === 'xl' ? 28 : 22;
  ctx.font = font(600, subFontSize);
  ctx.fillStyle = '#ffffff';
  const lines = wrapText(ctx, sentence, w - 48, 2);
  drawLines(ctx, lines, x + 24, y + 58, subFontSize + 8);
  ctx.restore();
}

export function renderStage(ctx: CanvasRenderingContext2D, f: StageFrame) {
  ctx.save();
  const darkBoard = f.layoutMode === 'whiteboard' || f.layoutMode === 'focus';

  drawNotebookEditorialCanvas(ctx, f, darkBoard);

  const activeSpeaker: Speaker =
    f.activeSpeaker || f.scene.sentenceSpeakers?.[f.sentenceIndex] || f.scene.speaker;

  const target = drawSmartBoard(ctx, f, darkBoard);

  if (f.layoutMode === 'focus') {
    const denizSpeaks = f.playing && activeSpeaker === 'Deniz';
    const barisSpeaks = f.playing && activeSpeaker === 'Barış';
    drawStudioPresentersAndDesk(
      {
        ctx,
        now: f.now,
        denizSpeaking: denizSpeaks,
        barisSpeaking: barisSpeaks,
        viseme: f.viseme,
        mouthOpen: f.mouthOpen,
        inBreathPause: f.inBreathPause,
        boardFocusX: target.x,
        boardFocusY: target.y,
      },
      STAGE_W,
      STAGE_H,
    );
  }

  if (f.showSubtitles) {
    drawEditorialSubtitles(ctx, f, activeSpeaker);
  }

  ctx.restore();
}
