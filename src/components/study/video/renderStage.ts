// EconNotes Video Stüdyosu — Sinematik Sahne ve Çok-Modlu Akıllı Tahta Çizim Motoru
// Görseller (İllüstrasyonlar), Şekiller, Tablolar, Grafikler, Senaryolar, Zaman Akışı ve Kıyaslama
// şemalarını tam ekran interaktif stüdyo sahnesinde 60 FPS yüksek netlikte üretir.

import type { StudioScene, DiagramNode, Speaker, VisualTheme } from './sceneModel';
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

const FONT = 'Inter, "Segoe UI", system-ui, -apple-system, sans-serif';

const PALETTE: [string, string][] = [
  ['#22d3ee', '#3b82f6'],
  ['#a78bfa', '#7c3aed'],
  ['#34d399', '#059669'],
  ['#fbbf24', '#f97316'],
  ['#f472b6', '#e11d48'],
  ['#60a5fa', '#6366f1'],
];

const SPEAKER_COLOR: Record<Speaker, string> = {
  Deniz: '#22d3ee',
  Barış: '#c084fc',
};

const TYPE_LABEL: Record<string, string> = {
  visual: 'GÖRSEL & İLLÜSTRASYON ANALİZİ',
  shapes: 'ŞEKİLLER & DÖNGÜSEL MEKANİZMA',
  table: 'AKADEMİK KARŞILAŞTIRMA TABLOSU',
  chart: 'ANALİTİK GRAFİK & ETKİ EĞRİSİ',
  curve: 'EKONOMİK EĞRİ & PİYASA DENGESİ',
  scenario: 'VAKA & SENARYO SİMÜLASYONU',
  timeline: 'TARİHSEL & SÜREÇSEL AKIŞ',
  comparison: 'İKİLİ KARŞILAŞTIRMA MATRİSİ',
  structure: 'KURUMSAL & KAVRAMSAL YAPI',
  network: 'KAVRAM İLİŞKİ MODELİ',
};

export function getBoardLayout(layoutMode?: 'standard' | 'whiteboard' | 'focus') {
  if (layoutMode === 'whiteboard') {
    return {
      board: { x: 96, y: 56, w: 1728, h: 756 },
      sub: { x: 96, y: 832, w: 1728, h: 168 },
    };
  }
  if (layoutMode === 'focus') {
    return {
      board: { x: 96, y: 56, w: 1728, h: 940 },
      sub: { x: 96, y: 840, w: 1728, h: 160 },
    };
  }
  return {
    board: { x: 340, y: 72, w: 1240, h: 728 },
    sub: { x: 364, y: 828, w: 1192, h: 170 },
  };
}

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t), 3);
const easeOutBack = (t: number) => {
  const c1 = 1.45;
  const c3 = c1 + 1;
  const x = clamp(t);
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number | number[]) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r as any);
}

function font(weight: number, size: number) {
  return `${weight} ${size}px ${FONT}`;
}

export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = (text || '').split(' ').filter(Boolean);
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
  return lines.map(l => {
    if (ctx.measureText(l).width <= maxWidth) return l;
    let cut = l;
    while (ctx.measureText(`${cut}…`).width > maxWidth && cut.length > 1) {
      cut = cut.slice(0, -1);
    }
    return `${cut}…`;
  });
}

function drawLines(ctx: CanvasRenderingContext2D, lines: string[], x: number, y: number, lineH: number) {
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineH));
}

function appearAmount(i: number, n: number, progress: number) {
  const start = 0.03 + (i / Math.max(1, n)) * 0.66;
  return easeOut((progress - start) / 0.11);
}

function activeIndex(n: number, progress: number) {
  let idx = 0;
  for (let i = 0; i < n; i++) {
    if (progress >= 0.03 + (i / Math.max(1, n)) * 0.66) idx = i;
  }
  return idx;
}

// ---------------------------------------------------------------- Stüdyo Arka Planı
function drawBroadcastStudioBackground(ctx: CanvasRenderingContext2D, now: number, energy = 0) {
  const bg = ctx.createLinearGradient(0, 0, 0, STAGE_H);
  bg.addColorStop(0, '#080e1c');
  bg.addColorStop(0.55, '#050813');
  bg.addColorStop(1, '#02040a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, STAGE_W, STAGE_H);

  // Akustik ahşap/kompozit duvar panelleri
  ctx.fillStyle = 'rgba(148, 163, 184, 0.018)';
  for (let x = 24; x < STAGE_W; x += 36) {
    ctx.fillRect(x, 0, 10, STAGE_H - 130);
  }

  // Yumuşak stüdyo tavan spot ışıkları
  const spots = [
    { x: 240, y: -60, r: 680, c: '34, 211, 238', a: 0.10 },
    { x: STAGE_W / 2, y: -120, r: 840, c: '59, 130, 246', a: 0.09 },
    { x: STAGE_W - 240, y: -60, r: 680, c: '168, 85, 247', a: 0.10 },
  ];
  spots.forEach((s, i) => {
    const ox = s.x + Math.sin(now / 6500 + i * 2) * 35;
    const rg = ctx.createRadialGradient(ox, s.y, 0, ox, s.y + 260, s.r);
    rg.addColorStop(0, `rgba(${s.c}, ${s.a})`);
    rg.addColorStop(1, `rgba(${s.c}, 0)`);
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, STAGE_W, STAGE_H);
  });

  const horizonGrad = ctx.createLinearGradient(0, 0, STAGE_W, 0);
  horizonGrad.addColorStop(0, 'rgba(34, 211, 238, 0)');
  horizonGrad.addColorStop(0.25, 'rgba(34, 211, 238, 0.13)');
  horizonGrad.addColorStop(0.75, 'rgba(168, 85, 247, 0.13)');
  horizonGrad.addColorStop(1, 'rgba(168, 85, 247, 0)');
  ctx.fillStyle = horizonGrad;
  ctx.fillRect(0, 816, STAGE_W, 1.5);

  // Sahnede derinlik hissi veren yavaş hareketli parçacıklar ve konuşma enerjisine
  // çok hafif tepki veren yayın ışığı; içerik okunabilirliğini kapatmayacak kadar düşük kontrastlıdır.
  ctx.save();
  for (let i = 0; i < 28; i++) {
    const phase = i * 1.73;
    const x = ((i * 271 + now * (0.008 + (i % 3) * 0.002)) % (STAGE_W + 80)) - 40;
    const y = 110 + ((i * 97 + Math.sin(now / 2400 + phase) * 36) % 680);
    const radius = 1.2 + (i % 4) * 0.55;
    const alpha = 0.045 + energy * 0.035;
    ctx.fillStyle = i % 2 ? `rgba(34, 211, 238, ${alpha})` : `rgba(168, 85, 247, ${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  const sweepX = ((now / 8) % (STAGE_W + 700)) - 350;
  const sweep = ctx.createLinearGradient(sweepX - 220, 0, sweepX + 220, 0);
  sweep.addColorStop(0, 'rgba(255,255,255,0)');
  sweep.addColorStop(0.5, `rgba(125, 211, 252, ${0.025 + energy * 0.025})`);
  sweep.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sweep;
  ctx.fillRect(0, 80, STAGE_W, 700);
  ctx.restore();

  const vignette = ctx.createRadialGradient(STAGE_W / 2, STAGE_H * 0.42, 320, STAGE_W / 2, STAGE_H * 0.42, 1120);
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.3)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, STAGE_W, STAGE_H);
}

// ---------------------------------------------------------------- Üst Yayın Bilgisi (Sade ve Sinematik HUD)
function drawBroadcastHud(ctx: CanvasRenderingContext2D, f: StageFrame) {
  // Üst ince ilerleme şeridi
  ctx.fillStyle = 'rgba(148, 163, 184, 0.12)';
  ctx.fillRect(0, 0, STAGE_W, 4);
  const pg = ctx.createLinearGradient(0, 0, STAGE_W, 0);
  pg.addColorStop(0, '#22d3ee');
  pg.addColorStop(0.5, '#3b82f6');
  pg.addColorStop(1, '#a855f7');
  ctx.fillStyle = pg;
  ctx.fillRect(0, 0, STAGE_W * clamp(f.overall), 4);

  // Sağ üst bölüm göstergesi (Sol üstte sayfa başlığında zaten logo olduğu için canvas sol üstü sade bırakılır)
  const chLabel = `BÖLÜM ${String(f.sceneIndex + 1).padStart(2, '0')} / ${String(f.sceneCount).padStart(2, '0')}`;
  ctx.font = font(700, 13.5);
  const cw = ctx.measureText(chLabel).width + 38;
  rr(ctx, STAGE_W - 32 - cw, 20, cw, 40, 20);
  ctx.fillStyle = 'rgba(6, 10, 22, 0.82)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.28)';
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(chLabel, STAGE_W - 32 - cw / 2, 40.5);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

// ---------------------------------------------------------------- Akıllı Tahta Ana Gövde
interface Point {
  x: number;
  y: number;
}

type Area = { x: number; y: number; w: number; h: number };

function drawSmartBoard(ctx: CanvasRenderingContext2D, f: StageFrame): Point {
  const { x, y, w, h } = getBoardLayout(f.layoutMode).board;
  const reveal = f.poster ? 1 : f.progress;
  const d = f.scene.diagram;

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.74)';
  ctx.shadowBlur = 64;
  ctx.shadowOffsetY = 24;
  rr(ctx, x, y, w, h, 30);
  ctx.fillStyle = 'rgba(10, 16, 32, 0.96)';
  ctx.fill();
  ctx.restore();

  const glass = ctx.createLinearGradient(x, y, x, y + h);
  glass.addColorStop(0, 'rgba(56, 189, 248, 0.065)');
  glass.addColorStop(0.38, 'rgba(15, 23, 42, 0)');
  glass.addColorStop(1, 'rgba(168, 85, 247, 0.045)');
  rr(ctx, x, y, w, h, 30);
  ctx.fillStyle = glass;
  ctx.fill();

  const border = ctx.createLinearGradient(x, y, x + w, y + h);
  border.addColorStop(0, 'rgba(56, 189, 248, 0.55)');
  border.addColorStop(0.5, 'rgba(99, 102, 241, 0.28)');
  border.addColorStop(1, 'rgba(192, 132, 252, 0.45)');
  ctx.strokeStyle = border;
  ctx.lineWidth = 1.8;
  ctx.stroke();

  ctx.save();
  rr(ctx, x, y, w, h, 30);
  ctx.clip();

  // İnce koordinat ızgarası
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.032)';
  ctx.lineWidth = 1;
  for (let gx = x + 48; gx < x + w; gx += 48) {
    ctx.beginPath();
    ctx.moveTo(gx, y + 114);
    ctx.lineTo(gx, y + h - 54);
    ctx.stroke();
  }
  for (let gy = y + 140; gy < y + h - 54; gy += 48) {
    ctx.beginPath();
    ctx.moveTo(x, gy);
    ctx.lineTo(x + w, gy);
    ctx.stroke();
  }

  // Üst kategori etiketi
  const typeLabel = TYPE_LABEL[d.type] || 'STÜDYO DERS ŞEMASI';
  ctx.font = font(700, 12.5);
  const tagW = ctx.measureText(typeLabel).width + 28;
  rr(ctx, x + 36, y + 22, tagW, 28, 14);
  ctx.fillStyle = 'rgba(34, 211, 238, 0.13)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(34, 211, 238, 0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#67e8f9';
  ctx.textBaseline = 'middle';
  ctx.fillText(typeLabel, x + 50, y + 36.5);

  // Sağ üst ders adı rozeti
  if (d.rootBadge) {
    ctx.font = font(600, 12.5);
    const rb = wrapText(ctx, d.rootBadge, 280, 1)[0] || '';
    const rbw = ctx.measureText(rb).width + 26;
    rr(ctx, x + w - 36 - rbw, y + 22, rbw, 28, 14);
    ctx.fillStyle = 'rgba(148, 163, 184, 0.09)';
    ctx.fill();
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(rb, x + w - 36 - rbw + 13, y + 36.5);
  }
  ctx.textBaseline = 'alphabetic';

  // Ana sahne başlığı
  ctx.fillStyle = '#f8fafc';
  ctx.font = font(800, 29);
  const titleLine = wrapText(ctx, d.title || f.scene.title, w - 72, 1)[0] || '';
  ctx.fillText(titleLine, x + 36, y + 86);

  const sep = ctx.createLinearGradient(x + 36, 0, x + w - 36, 0);
  sep.addColorStop(0, 'rgba(34, 211, 238, 0.45)');
  sep.addColorStop(0.6, 'rgba(148, 163, 184, 0.14)');
  sep.addColorStop(1, 'rgba(148, 163, 184, 0.02)');
  ctx.fillStyle = sep;
  ctx.fillRect(x + 36, y + 104, w - 72, 1.5);

  const hasBottomNote = Boolean(d.metric || f.scene.examTip);
  const contentArea: Area = {
    x: x + 34,
    y: y + 120,
    w: w - 68,
    h: h - 120 - (hasBottomNote ? 68 : 24),
  };

  let focusPoint: Point = { x: x + w / 2, y: y + h / 2 };
  const nodes = d.nodes.slice(0, 5);

  if (nodes.length === 0) {
    focusPoint = drawTakeawayCards(ctx, contentArea, f.scene.keyTakeaways, reveal);
  } else if (d.type === 'visual') {
    focusPoint = drawVisualShowcase(ctx, contentArea, nodes, d.visualTheme, reveal, f.now);
  } else if (d.type === 'shapes' || d.type === 'structure' || d.type === 'network') {
    focusPoint = drawShapesDiagram(ctx, contentArea, nodes, d.rootBadge || 'MERKEZ YAPI', reveal, f.now);
  } else if (d.type === 'table') {
    focusPoint = drawDataTable(ctx, contentArea, nodes, reveal);
  } else if (d.type === 'curve') {
    focusPoint = drawEconomicCurvesDiagram(ctx, contentArea, nodes, d.title, reveal, f.now);
  } else if (d.type === 'chart') {
    if (/arz|talep|eğri|fiyat|miktar|maliyet|fayda|esneklik|denge/i.test(`${d.title} ${f.scene.title}`)) {
      focusPoint = drawEconomicCurvesDiagram(ctx, contentArea, nodes, d.title, reveal, f.now);
    } else {
      focusPoint = drawAnalyticsChart(ctx, contentArea, nodes, reveal, f.now);
    }
  } else if (d.type === 'scenario') {
    focusPoint = drawScenarioBoard(ctx, contentArea, nodes, reveal, f.now);
  } else if (d.type === 'timeline') {
    focusPoint = drawTimeline(ctx, contentArea, nodes, reveal, f.now);
  } else if (d.type === 'comparison') {
    focusPoint = drawComparison(ctx, contentArea, nodes, reveal);
  } else {
    focusPoint = drawVisualShowcase(ctx, contentArea, nodes, d.visualTheme, reveal, f.now);
  }

  // Alt sınav vurgu bandı — hocanın sorabileceği noktaları öne çıkarır
  const bottomNote = f.scene.examTip || d.metric;
  if (bottomNote) {
    const my = y + h - 56;
    rr(ctx, x + 34, my, w - 68, 40, 12);
    ctx.fillStyle = 'rgba(245, 158, 11, 0.12)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.34)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#fbbf24';
    ctx.font = font(700, 13.5);
    const prefix = 'SINAV NOTU:';
    ctx.fillText(prefix, x + 50, my + 25);
    const pw = ctx.measureText(prefix).width;

    ctx.fillStyle = '#fef3c7';
    ctx.font = font(500, 14.5);
    const noteLine = wrapText(ctx, bottomNote, w - 124 - pw, 1)[0] || '';
    ctx.fillText(noteLine, x + 62 + pw, my + 25);
  }

  ctx.restore();
  return focusPoint;
}

function drawTakeawayCards(ctx: CanvasRenderingContext2D, a: Area, items: string[], reveal: number): Point {
  const list = items.slice(0, 4);
  const gap = 16;
  const cardH = Math.min(110, (a.h - gap * (list.length - 1)) / Math.max(1, list.length));
  const act = activeIndex(list.length, reveal);
  let target: Point = { x: a.x + a.w / 2, y: a.y + a.h / 2 };

  list.forEach((txt, i) => {
    const t = appearAmount(i, list.length, reveal);
    if (t <= 0) return;
    const cy = a.y + i * (cardH + gap) + (1 - t) * 16;
    const [c1] = PALETTE[i % PALETTE.length];
    const isAct = i === act;
    if (isAct) target = { x: a.x + a.w / 2, y: cy + cardH / 2 };

    ctx.save();
    ctx.globalAlpha = t;
    rr(ctx, a.x, cy, a.w, cardH, 16);
    ctx.fillStyle = isAct ? 'rgba(20, 32, 58, 0.92)' : 'rgba(15, 23, 42, 0.72)';
    ctx.fill();
    ctx.strokeStyle = isAct ? c1 : 'rgba(148, 163, 184, 0.2)';
    ctx.lineWidth = isAct ? 2 : 1;
    ctx.stroke();

    ctx.fillStyle = '#f1f5f9';
    ctx.font = font(500, 18);
    const lines = wrapText(ctx, txt, a.w - 60, 2);
    drawLines(ctx, lines, a.x + 30, cy + 42, 26);
    ctx.restore();
  });

  return target;
}

// ================================================================ 1. GÖRSEL & İLLÜSTRASYON SAHNESİ ('visual')
function drawThematicIllustration(
  ctx: CanvasRenderingContext2D,
  box: Area,
  theme: VisualTheme,
  now: number,
  activeIdx: number,
): Point[] {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const slow = now / 2800;

  ctx.save();
  rr(ctx, box.x, box.y, box.w, box.h, 24);
  const bg = ctx.createLinearGradient(box.x, box.y, box.x + box.w, box.y + box.h);
  if (theme === 'history') {
    bg.addColorStop(0, '#0f1d38');
    bg.addColorStop(0.55, '#13243f');
    bg.addColorStop(1, '#1d1636');
  } else if (theme === 'economics') {
    bg.addColorStop(0, '#0b2239');
    bg.addColorStop(0.55, '#0d293e');
    bg.addColorStop(1, '#0c1f33');
  } else if (theme === 'law') {
    bg.addColorStop(0, '#141e38');
    bg.addColorStop(1, '#1f1938');
  } else {
    bg.addColorStop(0, '#0d1b36');
    bg.addColorStop(1, '#191638');
  }
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.clip();

  // Arka plan atmosferik hale
  const glow = ctx.createRadialGradient(cx, cy - 30, 12, cx, cy, box.w * 0.65);
  glow.addColorStop(0, theme === 'history' ? 'rgba(251, 191, 36, 0.20)' : 'rgba(34, 211, 238, 0.22)');
  glow.addColorStop(1, 'rgba(15, 23, 42, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(box.x, box.y, box.w, box.h);

  // Üst sol rozet
  rr(ctx, box.x + 18, box.y + 18, 148, 28, 14);
  ctx.fillStyle = 'rgba(6, 10, 22, 0.65)';
  ctx.fill();
  ctx.fillStyle = '#e2e8f0';
  ctx.font = font(700, 11.5);
  ctx.fillText('KONU İLLÜSTRASYONU', box.x + 32, box.y + 36);

  if (theme === 'history') {
    // 8 köşeli Selçuklu/Osmanlı geometrik yıldız madalyonu (üst merkezde yavaş döner)
    ctx.save();
    ctx.translate(cx, box.y + 125);
    ctx.rotate(slow * 0.22);
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.42)';
    ctx.lineWidth = 1.6;
    for (let k = 0; k < 2; k++) {
      ctx.save();
      ctx.rotate((k * Math.PI) / 4);
      ctx.strokeRect(-42, -42, 84, 84);
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(251, 191, 36, 0.22)';
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Anıtsal Taçkapı / Kervansaray Kemeri ve Kubbe Silüeti
    const baseLine = box.y + box.h - 78;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
    ctx.lineWidth = 2.2;

    // Yan sur duvarları
    rr(ctx, cx - 165, baseLine - 135, 330, 135, [14, 14, 0, 0]);
    ctx.fill();
    ctx.stroke();

    // Merkez kubbe
    ctx.beginPath();
    ctx.arc(cx, baseLine - 135, 78, Math.PI, 0);
    ctx.fillStyle = 'rgba(30, 58, 95, 0.85)';
    ctx.fill();
    ctx.strokeStyle = '#38bdf8';
    ctx.stroke();

    // Sivri Selçuklu kemeri
    ctx.beginPath();
    ctx.moveTo(cx - 56, baseLine);
    ctx.lineTo(cx - 56, baseLine - 72);
    ctx.quadraticCurveTo(cx - 56, baseLine - 122, cx, baseLine - 138);
    ctx.quadraticCurveTo(cx + 56, baseLine - 122, cx + 56, baseLine - 72);
    ctx.lineTo(cx + 56, baseLine);
    ctx.closePath();
    const archGlow = ctx.createLinearGradient(cx, baseLine - 138, cx, baseLine);
    archGlow.addColorStop(0, 'rgba(251, 191, 36, 0.45)');
    archGlow.addColorStop(1, 'rgba(34, 211, 238, 0.14)');
    ctx.fillStyle = archGlow;
    ctx.fill();
    ctx.strokeStyle = '#fbbf24';
    ctx.stroke();

    // Alt ekili miri toprak / ticaret yolu katmanları
    for (let r = 0; r < 3; r++) {
      ctx.beginPath();
      const ry = baseLine + 16 + r * 18;
      ctx.moveTo(box.x + 20, ry);
      ctx.bezierCurveTo(cx - 80, ry - 8, cx + 80, ry + 8, box.x + box.w - 20, ry - 4);
      ctx.strokeStyle = r === 0 ? 'rgba(52, 211, 153, 0.55)' : 'rgba(56, 189, 248, 0.30)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  } else if (theme === 'economics') {
    // Hassas İktisadi Denge Terazisi + Yükselen Piyasa Çubukları
    const baseY = box.y + box.h - 72;
    const barVals = [0.38, 0.56, 0.48, 0.76, 0.9];
    barVals.forEach((v, idx) => {
      const bw = 34;
      const bx = cx - 118 + idx * 50;
      const bh = 150 * v * (0.92 + Math.sin(slow + idx) * 0.06);
      const g = ctx.createLinearGradient(bx, baseY - bh, bx, baseY);
      g.addColorStop(0, idx === activeIdx % 5 ? '#fbbf24' : '#22d3ee');
      g.addColorStop(1, 'rgba(59, 130, 246, 0.18)');
      rr(ctx, bx, baseY - bh, bw, bh, [8, 8, 2, 2]);
      ctx.fillStyle = g;
      ctx.fill();
    });

    // Üst denge halkası ve terazi kolu
    const tilt = Math.sin(slow * 1.1) * 0.08;
    ctx.save();
    ctx.translate(cx, box.y + 155);
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.stroke();

    ctx.rotate(tilt);
    ctx.beginPath();
    ctx.moveTo(-115, 0);
    ctx.lineTo(115, 0);
    ctx.stroke();

    [-105, 105].forEach(px => {
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px - 22, 42);
      ctx.lineTo(px + 22, 42);
      ctx.closePath();
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.75)';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(px, 46, 26, 0, Math.PI);
      ctx.fillStyle = 'rgba(34, 211, 238, 0.25)';
      ctx.fill();
      ctx.stroke();
    });
    ctx.restore();
  } else if (theme === 'law') {
    // Klasik Kurumsal Alınlık ve 4 Sütunlu Devlet/Hukuk Yapısı
    const baseY = box.y + box.h - 90;
    ctx.strokeStyle = '#60a5fa';
    ctx.fillStyle = 'rgba(30, 41, 59, 0.85)';
    ctx.lineWidth = 2.2;

    // Üçgen alınlık
    ctx.beginPath();
    ctx.moveTo(cx - 150, box.y + 170);
    ctx.lineTo(cx, box.y + 96);
    ctx.lineTo(cx + 150, box.y + 170);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 4 sütun
    for (let c = 0; c < 4; c++) {
      const colX = cx - 118 + c * 70;
      rr(ctx, colX, box.y + 178, 26, baseY - (box.y + 178), 6);
      ctx.fillStyle = c === activeIdx % 4 ? 'rgba(56, 189, 248, 0.35)' : 'rgba(148, 163, 184, 0.18)';
      ctx.fill();
      ctx.stroke();
    }
    rr(ctx, cx - 156, baseY, 312, 22, 6);
    ctx.fillStyle = 'rgba(56, 189, 248, 0.22)';
    ctx.fill();
    ctx.stroke();
  } else {
    // Bilimsel / Kavramsal Prizma ve Yörünge Halkaları
    ctx.save();
    ctx.translate(cx, cy);
    for (let r = 0; r < 3; r++) {
      ctx.save();
      ctx.rotate((r * Math.PI) / 3 + slow * 0.35);
      ctx.beginPath();
      ctx.ellipse(0, 0, 145, 54, 0, 0, Math.PI * 2);
      ctx.strokeStyle = r === 0 ? 'rgba(34, 211, 238, 0.65)' : r === 1 ? 'rgba(167, 139, 250, 0.55)' : 'rgba(52, 211, 153, 0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();

      const orbAngle = slow * 1.4 + r * 2;
      const ox = Math.cos(orbAngle) * 145;
      const oy = Math.sin(orbAngle) * 54;
      ctx.beginPath();
      ctx.arc(ox, oy, 7, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.restore();
    }

    // Merkez prizma
    ctx.beginPath();
    ctx.arc(0, 0, 34, 0, Math.PI * 2);
    const core = ctx.createRadialGradient(-8, -8, 4, 0, 0, 34);
    core.addColorStop(0, '#ffffff');
    core.addColorStop(0.4, '#22d3ee');
    core.addColorStop(1, '#6366f1');
    ctx.fillStyle = core;
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();

  // Dış çerçeve
  rr(ctx, box.x, box.y, box.w, box.h, 24);
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.38)';
  ctx.lineWidth = 1.6;
  ctx.stroke();

  // Sağdaki kartlara bağlanacak odak noktaları
  return [
    { x: box.x + box.w - 18, y: box.y + box.h * 0.24 },
    { x: box.x + box.w - 18, y: box.y + box.h * 0.44 },
    { x: box.x + box.w - 18, y: box.y + box.h * 0.64 },
    { x: box.x + box.w - 18, y: box.y + box.h * 0.82 },
  ];
}

function drawVisualShowcase(
  ctx: CanvasRenderingContext2D,
  a: Area,
  nodes: DiagramNode[],
  theme: VisualTheme,
  reveal: number,
  now: number,
): Point {
  const list = nodes.slice(0, 4);
  const n = list.length;
  const act = activeIndex(n, reveal);

  const illBox: Area = {
    x: a.x,
    y: a.y + 4,
    w: Math.round(a.w * 0.41),
    h: a.h - 8,
  };
  const anchors = drawThematicIllustration(ctx, illBox, theme, now, act);

  const rightX = illBox.x + illBox.w + 34;
  const rightW = a.x + a.w - rightX;
  const gap = 14;
  const cardH = Math.min(118, (a.h - gap * (n - 1)) / Math.max(1, n));
  let target: Point = { x: illBox.x + illBox.w / 2, y: illBox.y + illBox.h / 2 };

  list.forEach((nd, i) => {
    const t = appearAmount(i, n, reveal);
    if (t <= 0) return;
    const isAct = i === act && reveal > 0.02;
    const [c1, c2] = PALETTE[i % PALETTE.length];
    const cy = a.y + i * (cardH + gap) + (1 - t) * 16;
    const anchor = anchors[i % anchors.length];

    // İllüstrasyondan karta ışıklı işaret çizgisi
    ctx.save();
    ctx.globalAlpha = t;
    ctx.beginPath();
    ctx.moveTo(anchor.x, anchor.y);
    ctx.bezierCurveTo(
      anchor.x + 16,
      anchor.y,
      rightX - 18,
      cy + cardH / 2,
      rightX,
      cy + cardH / 2,
    );
    ctx.strokeStyle = isAct ? c1 : 'rgba(148, 163, 184, 0.28)';
    ctx.lineWidth = isAct ? 2.2 : 1.2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(anchor.x, anchor.y, isAct ? 5.5 : 3.5, 0, Math.PI * 2);
    ctx.fillStyle = c1;
    ctx.fill();

    // Kart gövdesi
    rr(ctx, rightX, cy, rightW, cardH, 18);
    ctx.fillStyle = isAct ? 'rgba(20, 33, 60, 0.95)' : 'rgba(15, 23, 42, 0.80)';
    ctx.fill();
    ctx.strokeStyle = isAct ? c1 : 'rgba(148, 163, 184, 0.22)';
    ctx.lineWidth = isAct ? 2 : 1.1;
    ctx.stroke();

    // Sol vurgu şeridi
    const barG = ctx.createLinearGradient(rightX, cy, rightX, cy + cardH);
    barG.addColorStop(0, c1);
    barG.addColorStop(1, c2);
    rr(ctx, rightX, cy, 6, cardH, [18, 0, 0, 18]);
    ctx.fillStyle = barG;
    ctx.fill();

    // Üst başlık + rozet
    ctx.fillStyle = '#ffffff';
    ctx.font = font(700, 18);
    const lbl = wrapText(ctx, nd.label, rightW - 140, 1)[0] || '';
    ctx.fillText(lbl, rightX + 22, cy + 31);

    if (nd.badge) {
      ctx.font = font(600, 11);
      const bt = wrapText(ctx, nd.badge, 120, 1)[0] || '';
      const bw = ctx.measureText(bt).width + 18;
      rr(ctx, rightX + rightW - bw - 16, cy + 13, bw, 22, 11);
      ctx.fillStyle = `${c1}22`;
      ctx.fill();
      ctx.fillStyle = c1;
      ctx.fillText(bt, rightX + rightW - bw - 7, cy + 28);
    }

    ctx.fillStyle = '#cbd5e1';
    ctx.font = font(400, 15);
    const subLines = wrapText(ctx, nd.subtext, rightW - 38, 2);
    drawLines(ctx, subLines, rightX + 22, cy + 58, 22);
    ctx.restore();

    if (isAct) target = { x: rightX + rightW / 2, y: cy + cardH / 2 };
  });

  return target;
}

// ================================================================ 2. GEOMETRİK ŞEKİLLER & DÖNGÜSEL MODEL ('shapes')
function drawPolygon(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, sides: number, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const ang = rot + (i * Math.PI * 2) / sides;
    const px = cx + Math.cos(ang) * r;
    const py = cy + Math.sin(ang) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawShapesDiagram(
  ctx: CanvasRenderingContext2D,
  a: Area,
  nodes: DiagramNode[],
  centerTitle: string,
  reveal: number,
  now: number,
): Point {
  const list = nodes.slice(0, 4);
  const n = list.length;
  const act = activeIndex(n, reveal);
  const cx = a.x + a.w / 2;
  const cy = a.y + a.h / 2;

  // Dış döngüsel yörünge halkası ve hareketli akış okları
  const rx = 250;
  const ry = 165;
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 8]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Yörünge üzerinde dönen 4 akış partikülü
  for (let p = 0; p < 4; p++) {
    const ang = (now / 2600 + p * (Math.PI / 2)) % (Math.PI * 2);
    const px = cx + Math.cos(ang) * rx;
    const py = cy + Math.sin(ang) * ry;
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#22d3ee';
    ctx.fill();
  }
  ctx.restore();

  // Merkez altıgen çekirdek şekli
  ctx.save();
  drawPolygon(ctx, cx, cy, 74, 6, -Math.PI / 6);
  const hubG = ctx.createLinearGradient(cx - 70, cy - 70, cx + 70, cy + 70);
  hubG.addColorStop(0, 'rgba(14, 116, 144, 0.92)');
  hubG.addColorStop(1, 'rgba(67, 56, 202, 0.92)');
  ctx.fillStyle = hubG;
  ctx.shadowColor = 'rgba(34, 211, 238, 0.35)';
  ctx.shadowBlur = 26;
  ctx.fill();
  ctx.strokeStyle = '#67e8f9';
  ctx.lineWidth = 2.2;
  ctx.stroke();
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = font(800, 14.5);
  const centerLines = wrapText(ctx, centerTitle, 112, 2);
  drawLines(ctx, centerLines, cx, cy - (centerLines.length - 1) * 9 + 5, 19);
  ctx.textAlign = 'left';

  // 4 köşe geometrik şekil + açıklama kartı
  const corners = [
    { x: a.x + 12, y: a.y + 8 },
    { x: a.x + a.w - 372, y: a.y + 8 },
    { x: a.x + a.w - 372, y: a.y + a.h - 156 },
    { x: a.x + 12, y: a.y + a.h - 156 },
  ];
  const cardW = 360;
  const cardH = 146;
  let target: Point = { x: cx, y: cy };

  list.forEach((nd, i) => {
    const t = appearAmount(i, n, reveal);
    if (t <= 0) return;
    const isAct = i === act && reveal > 0.02;
    const [c1, c2] = PALETTE[i % PALETTE.length];
    const pos = corners[i % corners.length];
    const scale = 0.92 + easeOutBack(t) * 0.08;

    const midX = pos.x + cardW / 2;
    const midY = pos.y + cardH / 2;

    // Merkez çekirdeğe bağlantı kolu
    ctx.save();
    ctx.globalAlpha = t;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(midX, midY);
    ctx.strokeStyle = isAct ? c1 : 'rgba(148, 163, 184, 0.24)';
    ctx.lineWidth = isAct ? 2.4 : 1.3;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = t;
    ctx.translate(midX, midY);
    ctx.scale(scale, scale);
    ctx.translate(-midX, -midY);

    rr(ctx, pos.x, pos.y, cardW, cardH, 20);
    ctx.fillStyle = isAct ? 'rgba(20, 33, 60, 0.96)' : 'rgba(15, 23, 42, 0.85)';
    ctx.fill();
    ctx.strokeStyle = isAct ? c1 : 'rgba(148, 163, 184, 0.25)';
    ctx.lineWidth = isAct ? 2.2 : 1.2;
    ctx.stroke();

    // Sol üst geometrik şekil rozeti (altıgen / eşkenar dörtgen / daire / kare)
    const gx = pos.x + 32;
    const gy = pos.y + 34;
    const shapeGrad = ctx.createLinearGradient(gx - 18, gy - 18, gx + 18, gy + 18);
    shapeGrad.addColorStop(0, c1);
    shapeGrad.addColorStop(1, c2);
    ctx.fillStyle = shapeGrad;
    if (i % 3 === 0) {
      drawPolygon(ctx, gx, gy, 18, 6);
      ctx.fill();
    } else if (i % 3 === 1) {
      drawPolygon(ctx, gx, gy, 19, 4);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(gx, gy, 17, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#040711';
    ctx.font = font(800, 13.5);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`0${i + 1}`, gx, gy + 0.5);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    ctx.fillStyle = '#ffffff';
    ctx.font = font(700, 17.5);
    ctx.fillText(wrapText(ctx, nd.label, cardW - 76, 1)[0] || '', pos.x + 60, pos.y + 40);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = font(400, 14.5);
    const sl = wrapText(ctx, nd.subtext, cardW - 40, 3);
    drawLines(ctx, sl, pos.x + 20, pos.y + 72, 21);
    ctx.restore();

    if (isAct) target = { x: midX, y: midY };
  });

  return target;
}

// ================================================================ 3. AKADEMİK KARŞILAŞTIRMA & VERİ TABLOSU ('table')
function drawDataTable(
  ctx: CanvasRenderingContext2D,
  a: Area,
  nodes: DiagramNode[],
  reveal: number,
): Point {
  const rows = nodes.slice(0, 4);
  const n = rows.length;
  const act = activeIndex(n, reveal);

  const tableX = a.x;
  const tableY = a.y + 4;
  const tableW = a.w;
  const headerH = 50;
  const rowH = Math.min(112, (a.h - headerH - 12) / Math.max(1, n));
  const totalH = headerH + rowH * n;

  // Sütun genişlikleri
  const colNoW = 68;
  const colConceptW = Math.round(tableW * 0.25);
  const colBadgeW = 178;
  const colDescW = tableW - colNoW - colConceptW - colBadgeW;

  // Tablo dış çerçevesi
  ctx.save();
  rr(ctx, tableX, tableY, tableW, totalH, 20);
  ctx.fillStyle = 'rgba(11, 18, 35, 0.90)';
  ctx.fill();
  ctx.clip();

  // Tablo Üst Başlık Satırı
  const hg = ctx.createLinearGradient(tableX, tableY, tableX + tableW, tableY);
  hg.addColorStop(0, 'rgba(34, 211, 238, 0.20)');
  hg.addColorStop(0.6, 'rgba(59, 130, 246, 0.16)');
  hg.addColorStop(1, 'rgba(168, 85, 247, 0.18)');
  ctx.fillStyle = hg;
  ctx.fillRect(tableX, tableY, tableW, headerH);

  ctx.fillStyle = '#67e8f9';
  ctx.font = font(700, 12.5);
  ctx.textBaseline = 'middle';
  ctx.fillText('NO', tableX + 24, tableY + headerH / 2);
  ctx.fillText('KAVRAM / BOYUT', tableX + colNoW + 18, tableY + headerH / 2);
  ctx.fillText('TEMEL İŞLEYİŞ VE AÇIKLAMA', tableX + colNoW + colConceptW + 20, tableY + headerH / 2);
  ctx.fillText('SINAV / ETKİ ROLÜ', tableX + colNoW + colConceptW + colDescW + 18, tableY + headerH / 2);
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = 'rgba(148, 163, 184, 0.22)';
  ctx.fillRect(tableX, tableY + headerH, tableW, 1.2);

  let target: Point = { x: tableX + tableW / 2, y: tableY + totalH / 2 };

  rows.forEach((nd, i) => {
    const t = appearAmount(i, n, reveal);
    const ry = tableY + headerH + i * rowH;
    const isAct = i === act && reveal > 0.02;
    const [c1] = PALETTE[i % PALETTE.length];

    ctx.save();
    ctx.globalAlpha = Math.max(0.15, t);

    // Satır arka planı
    if (isAct) {
      const rg = ctx.createLinearGradient(tableX, ry, tableX + tableW, ry);
      rg.addColorStop(0, `${c1}26`);
      rg.addColorStop(1, 'rgba(30, 41, 59, 0.55)');
      ctx.fillStyle = rg;
      ctx.fillRect(tableX, ry, tableW, rowH);

      // Sol parlak aktif şerit
      ctx.fillStyle = c1;
      ctx.fillRect(tableX, ry + 6, 5, rowH - 12);
      target = { x: tableX + colNoW + colConceptW / 2, y: ry + rowH / 2 };
    } else if (i % 2 === 1) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
      ctx.fillRect(tableX, ry, tableW, rowH);
    }

    // Alt satır çizgisi
    if (i < n - 1) {
      ctx.fillStyle = 'rgba(148, 163, 184, 0.13)';
      ctx.fillRect(tableX, ry + rowH, tableW, 1);
    }

    // Sütun dikey ayraçları
    ctx.fillStyle = 'rgba(148, 163, 184, 0.09)';
    ctx.fillRect(tableX + colNoW, ry, 1, rowH);
    ctx.fillRect(tableX + colNoW + colConceptW, ry, 1, rowH);
    ctx.fillRect(tableX + colNoW + colConceptW + colDescW, ry, 1, rowH);

    // 1. Sütun: Numara rozeti
    rr(ctx, tableX + 18, ry + rowH / 2 - 15, 32, 30, 9);
    ctx.fillStyle = isAct ? c1 : 'rgba(148, 163, 184, 0.14)';
    ctx.fill();
    ctx.fillStyle = isAct ? '#040711' : '#e2e8f0';
    ctx.font = font(800, 14);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`0${i + 1}`, tableX + 34, ry + rowH / 2 + 0.5);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    // 2. Sütun: Kavram Başlığı
    ctx.fillStyle = '#ffffff';
    ctx.font = font(700, 17);
    const cLines = wrapText(ctx, nd.label, colConceptW - 34, 2);
    const cStartY = ry + rowH / 2 - ((cLines.length - 1) * 22) / 2 + 6;
    drawLines(ctx, cLines, tableX + colNoW + 18, cStartY, 22);

    // 3. Sütun: İşleyiş ve Açıklama
    ctx.fillStyle = '#e2e8f0';
    ctx.font = font(400, 15.5);
    const dLines = wrapText(ctx, nd.subtext, colDescW - 38, 3);
    const dStartY = ry + rowH / 2 - ((dLines.length - 1) * 22) / 2 + 5;
    drawLines(ctx, dLines, tableX + colNoW + colConceptW + 20, dStartY, 22);

    // 4. Sütun: Etki / Önem Rozeti
    const badgeLabel = wrapText(ctx, nd.badge || 'Temel Unsur', colBadgeW - 44, 1)[0] || 'Temel Unsur';
    ctx.font = font(700, 12.5);
    const bw = Math.min(colBadgeW - 28, ctx.measureText(badgeLabel).width + 24);
    const bx = tableX + colNoW + colConceptW + colDescW + 16;
    const by = ry + rowH / 2 - 15;
    rr(ctx, bx, by, bw, 30, 15);
    ctx.fillStyle = `${c1}24`;
    ctx.fill();
    ctx.strokeStyle = `${c1}66`;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = c1;
    ctx.textBaseline = 'middle';
    ctx.fillText(badgeLabel, bx + 12, by + 15.5);
    ctx.textBaseline = 'alphabetic';

    ctx.restore();
  });

  ctx.restore();

  rr(ctx, tableX, tableY, tableW, totalH, 20);
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.34)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  return target;
}

// ================================================================ 4. ANALİTİK SÜTUN & EĞRİ GRAFİĞİ ('chart')
function drawAnalyticsChart(
  ctx: CanvasRenderingContext2D,
  a: Area,
  nodes: DiagramNode[],
  reveal: number,
  now: number,
): Point {
  const list = nodes.slice(0, 4);
  const n = list.length;
  const act = activeIndex(n, reveal);

  const plotX = a.x + 54;
  const plotY = a.y + 24;
  const plotW = Math.round(a.w * 0.52);
  const plotH = a.h - 74;

  // Y ekseni ızgara çizgileri (%0 - %100)
  ctx.save();
  for (let g = 0; g <= 4; g++) {
    const gy = plotY + plotH - (g / 4) * plotH;
    ctx.strokeStyle = g === 0 ? 'rgba(148, 163, 184, 0.45)' : 'rgba(148, 163, 184, 0.13)';
    ctx.lineWidth = g === 0 ? 1.8 : 1;
    ctx.beginPath();
    ctx.moveTo(plotX, gy);
    ctx.lineTo(plotX + plotW, gy);
    ctx.stroke();

    ctx.fillStyle = '#94a3b8';
    ctx.font = font(600, 12);
    ctx.textAlign = 'right';
    ctx.fillText(`%${g * 25}`, plotX - 10, gy + 4);
  }
  ctx.textAlign = 'left';

  // Sütunlar + üst eğri noktaları
  const slotW = plotW / Math.max(1, n);
  const barW = Math.min(74, slotW * 0.52);
  const curvePts: Point[] = [];
  let target: Point = { x: plotX + plotW / 2, y: plotY + plotH / 2 };

  list.forEach((nd, i) => {
    const val = Math.max(25, Math.min(98, nd.value ?? 78));
    const t = appearAmount(i, n, reveal);
    const grow = easeOut(clamp(reveal * 1.4 - i * 0.12));
    const bh = (val / 100) * (plotH - 22) * grow;
    const bx = plotX + i * slotW + (slotW - barW) / 2;
    const by = plotY + plotH - bh;
    const [c1, c2] = PALETTE[i % PALETTE.length];
    const isAct = i === act && reveal > 0.02;

    if (bh > 2) {
      const bg = ctx.createLinearGradient(bx, by, bx, plotY + plotH);
      bg.addColorStop(0, c1);
      bg.addColorStop(1, `${c2}44`);
      rr(ctx, bx, by, barW, bh, [12, 12, 2, 2]);
      ctx.fillStyle = bg;
      ctx.fill();

      if (isAct) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    const pt = { x: bx + barW / 2, y: by };
    curvePts.push(pt);
    if (isAct) target = pt;

    // X ekseni altı kısa etiket
    ctx.fillStyle = isAct ? '#ffffff' : '#cbd5e1';
    ctx.font = font(isAct ? 700 : 600, 13);
    ctx.textAlign = 'center';
    const xLbl = wrapText(ctx, nd.label, slotW - 10, 1)[0] || '';
    ctx.fillText(xLbl, bx + barW / 2, plotY + plotH + 26);

    // Sütun üstü değer rozeti
    if (t > 0.2) {
      ctx.globalAlpha = t;
      ctx.fillStyle = '#ffffff';
      ctx.font = font(800, 14);
      ctx.fillText(`%${val}`, bx + barW / 2, by - 12);
      ctx.globalAlpha = 1;
    }
  });
  ctx.textAlign = 'left';

  // Sütunların üzerinden geçen akıcı analitik eğilim eğrisi
  if (curvePts.length >= 2) {
    ctx.beginPath();
    ctx.moveTo(curvePts[0].x, curvePts[0].y);
    for (let i = 1; i < curvePts.length; i++) {
      const prev = curvePts[i - 1];
      const cur = curvePts[i];
      const midX = (prev.x + cur.x) / 2;
      ctx.bezierCurveTo(midX, prev.y, midX, cur.y, cur.x, cur.y);
    }
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 3;
    ctx.shadowColor = 'rgba(251, 191, 36, 0.45)';
    ctx.shadowBlur = 14;
    ctx.stroke();
    ctx.shadowBlur = 0;

    curvePts.forEach((p, idx) => {
      const pulse = idx === act ? 7 + Math.sin(now / 260) * 1.5 : 5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, pulse, 0, Math.PI * 2);
      ctx.fillStyle = '#fbbf24';
      ctx.fill();
      ctx.strokeStyle = '#070b16';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  }
  ctx.restore();

  // Sağ analitik açıklama kartları
  const rx = plotX + plotW + 34;
  const rw = a.x + a.w - rx;
  const gap = 12;
  const cardH = Math.min(112, (a.h - gap * (n - 1)) / Math.max(1, n));

  list.forEach((nd, i) => {
    const t = appearAmount(i, n, reveal);
    if (t <= 0) return;
    const isAct = i === act && reveal > 0.02;
    const [c1] = PALETTE[i % PALETTE.length];
    const cy = a.y + i * (cardH + gap);

    ctx.save();
    ctx.globalAlpha = t;
    rr(ctx, rx, cy, rw, cardH, 16);
    ctx.fillStyle = isAct ? 'rgba(20, 33, 60, 0.95)' : 'rgba(15, 23, 42, 0.78)';
    ctx.fill();
    ctx.strokeStyle = isAct ? c1 : 'rgba(148, 163, 184, 0.22)';
    ctx.lineWidth = isAct ? 2 : 1;
    ctx.stroke();

    ctx.fillStyle = c1;
    ctx.beginPath();
    ctx.arc(rx + 18, cy + 25, 5.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = font(700, 16.5);
    ctx.fillText(wrapText(ctx, nd.label, rw - 88, 1)[0] || '', rx + 32, cy + 30);

    ctx.fillStyle = c1;
    ctx.font = font(800, 14);
    ctx.textAlign = 'right';
    ctx.fillText(`%${nd.value ?? 78}`, rx + rw - 16, cy + 30);
    ctx.textAlign = 'left';

    ctx.fillStyle = '#cbd5e1';
    ctx.font = font(400, 14.5);
    const sl = wrapText(ctx, nd.subtext, rw - 34, 2);
    drawLines(ctx, sl, rx + 18, cy + 56, 21);
    ctx.restore();
  });

  return target;
}

// ================================================================ 4B. SANAL TAHTA: EKONOMİK EĞRİLER & PİYASA DENGESİ ('curve')
function drawEconomicCurvesDiagram(
  ctx: CanvasRenderingContext2D,
  a: Area,
  nodes: DiagramNode[],
  mainTitle: string,
  reveal: number,
  now: number,
): Point {
  const list = nodes.slice(0, 4);
  const n = Math.max(1, list.length);
  const act = activeIndex(n, reveal);

  const plotX = a.x + 50;
  const plotY = a.y + 24;
  const plotW = Math.round(a.w * 0.53);
  const plotH = a.h - 68;

  ctx.save();

  // 1. Koordinat Izgarası ve Eksen Çizimleri
  for (let g = 0; g <= 4; g++) {
    const gy = plotY + plotH - (g / 4) * plotH;
    ctx.strokeStyle = g === 0 ? 'rgba(148, 163, 184, 0.45)' : 'rgba(148, 163, 184, 0.10)';
    ctx.lineWidth = g === 0 ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(plotX, gy);
    ctx.lineTo(plotX + plotW, gy);
    ctx.stroke();

    ctx.fillStyle = '#64748b';
    ctx.font = font(600, 11);
    ctx.textAlign = 'right';
    ctx.fillText(`${g * 25}`, plotX - 8, gy + 4);
  }
  ctx.textAlign = 'left';

  // Dikey ve Yatay Eksen Doğruları
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(plotX, plotY);
  ctx.lineTo(plotX, plotY + plotH);
  ctx.lineTo(plotX + plotW + 10, plotY + plotH);
  ctx.stroke();

  // Eksen Okları
  ctx.fillStyle = '#94a3b8';
  ctx.beginPath();
  ctx.moveTo(plotX, plotY - 6);
  ctx.lineTo(plotX - 4, plotY + 4);
  ctx.lineTo(plotX + 4, plotY + 4);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(plotX + plotW + 16, plotY + plotH);
  ctx.lineTo(plotX + plotW + 6, plotY + plotH - 4);
  ctx.lineTo(plotX + plotW + 6, plotY + plotH + 4);
  ctx.fill();

  // Eksen Etiketleri: P (Fiyat) ve Q (Miktar)
  ctx.fillStyle = '#38bdf8';
  ctx.font = font(800, 15);
  ctx.fillText('P (Fiyat)', plotX - 36, plotY - 4);

  ctx.fillText('Q (Miktar)', plotX + plotW - 40, plotY + plotH + 28);

  ctx.fillStyle = '#64748b';
  ctx.font = font(600, 12);
  ctx.fillText('0', plotX - 14, plotY + plotH + 16);

  // Denge Noktası Parametreleri
  const eqX = plotX + plotW * 0.50;
  const eqY = plotY + plotH * 0.48;

  // 2. Talep Eğrisi (D0 - Negatif Eğimli)
  const dStartX = plotX + 32;
  const dStartY = plotY + 28;
  const dEndX = plotX + plotW - 24;
  const dEndY = plotY + plotH - 24;

  const dProg = clamp((reveal - 0.05) / 0.32);
  if (dProg > 0) {
    const curDX = dStartX + (dEndX - dStartX) * dProg;
    const curDY = dStartY + (dEndY - dStartY) * dProg;

    ctx.beginPath();
    ctx.moveTo(dStartX, dStartY);
    ctx.lineTo(curDX, curDY);
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 3.4;
    ctx.shadowColor = 'rgba(34, 211, 238, 0.4)';
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.shadowBlur = 0;

    if (dProg > 0.85) {
      ctx.fillStyle = '#22d3ee';
      ctx.font = font(800, 14);
      ctx.fillText('D₀ (Talep)', dEndX - 18, dEndY + 18);
    }
  }

  // 3. Arz Eğrisi (S0 - Pozitif Eğimli)
  const sStartX = plotX + 32;
  const sStartY = plotY + plotH - 28;
  const sEndX = plotX + plotW - 24;
  const sEndY = plotY + 36;

  const sProg = clamp((reveal - 0.25) / 0.32);
  if (sProg > 0) {
    const curSX = sStartX + (sEndX - sStartX) * sProg;
    const curSY = sStartY + (sEndY - sStartY) * sProg;

    ctx.beginPath();
    ctx.moveTo(sStartX, sStartY);
    ctx.lineTo(curSX, curSY);
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 3.4;
    ctx.shadowColor = 'rgba(251, 191, 36, 0.4)';
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.shadowBlur = 0;

    if (sProg > 0.85) {
      ctx.fillStyle = '#fbbf24';
      ctx.font = font(800, 14);
      ctx.fillText('S₀ (Arz)', sEndX - 10, sEndY - 10);
    }
  }

  // 4. Piyasa Denge Noktası (E0) ve İzdüşüm Çizgileri
  const eqProg = clamp((reveal - 0.45) / 0.25);
  if (eqProg > 0) {
    // Tüketici Rantı (Consumer Surplus) Tarama Alanı
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(plotX, dStartY);
    ctx.lineTo(eqX, eqY);
    ctx.lineTo(plotX, eqY);
    ctx.closePath();
    const csGrad = ctx.createLinearGradient(plotX, dStartY, plotX, eqY);
    csGrad.addColorStop(0, 'rgba(34, 211, 238, 0.22)');
    csGrad.addColorStop(1, 'rgba(34, 211, 238, 0.04)');
    ctx.fillStyle = csGrad;
    ctx.fill();

    // Üretici Rantı (Producer Surplus) Tarama Alanı
    ctx.beginPath();
    ctx.moveTo(plotX, sStartY);
    ctx.lineTo(eqX, eqY);
    ctx.lineTo(plotX, eqY);
    ctx.closePath();
    const psGrad = ctx.createLinearGradient(plotX, sStartY, plotX, eqY);
    psGrad.addColorStop(0, 'rgba(192, 132, 252, 0.04)');
    psGrad.addColorStop(1, 'rgba(192, 132, 252, 0.20)');
    ctx.fillStyle = psGrad;
    ctx.fill();
    ctx.restore();

    // Kesikli İzdüşüm Çizgileri
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = '#34d399';
    ctx.lineWidth = 1.8;

    // Yatay izdüşüm (P*)
    ctx.beginPath();
    ctx.moveTo(plotX, eqY);
    ctx.lineTo(eqX, eqY);
    ctx.stroke();

    // Dikey izdüşüm (Q*)
    ctx.beginPath();
    ctx.moveTo(eqX, plotY + plotH);
    ctx.lineTo(eqX, eqY);
    ctx.stroke();
    ctx.restore();

    // Eksen İsimleri: P* ve Q*
    ctx.fillStyle = '#34d399';
    ctx.font = font(800, 13);
    ctx.textAlign = 'right';
    ctx.fillText('P* (Denge)', plotX - 8, eqY + 4);
    ctx.textAlign = 'center';
    ctx.fillText('Q* (Denge)', eqX, plotY + plotH + 24);
    ctx.textAlign = 'left';

    // Rant Rozetleri
    ctx.fillStyle = 'rgba(34, 211, 238, 0.85)';
    ctx.font = font(700, 11);
    ctx.fillText('CS: Tüketici Rantı', plotX + 16, eqY - 24);

    ctx.fillStyle = 'rgba(192, 132, 252, 0.85)';
    ctx.fillText('PS: Üretici Rantı', plotX + 16, eqY + 34);

    // Denge Noktası (E0) Parlayan Halka
    const pulse = 7 + Math.sin(now / 220) * 2;
    ctx.beginPath();
    ctx.arc(eqX, eqY, pulse + 5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(52, 211, 153, 0.22)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(eqX, eqY, pulse, 0, Math.PI * 2);
    ctx.fillStyle = '#34d399';
    ctx.fill();
    ctx.strokeStyle = '#050811';
    ctx.lineWidth = 2.4;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = font(800, 14.5);
    ctx.fillText('E₀ (P*, Q*)', eqX + 12, eqY - 10);
  }

  // 5. Dinamik Eğri Kayması (D1 Shift)
  if (reveal > 0.72) {
    const shiftProgress = clamp((reveal - 0.72) / 0.20);
    const shiftOffset = 42 * shiftProgress;

    ctx.save();
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(dStartX + shiftOffset, dStartY);
    ctx.lineTo(dEndX + shiftOffset, dEndY);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.6;
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = '#38bdf8';
    ctx.font = font(800, 13);
    ctx.fillText('D₁ (Talep Kayması)', dEndX + shiftOffset - 24, dEndY - 20);

    // Kayma Oku
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(eqX + 10, eqY + 30);
    ctx.lineTo(eqX + 38, eqY + 30);
    ctx.lineTo(eqX + 32, eqY + 26);
    ctx.moveTo(eqX + 38, eqY + 30);
    ctx.lineTo(eqX + 32, eqY + 34);
    ctx.stroke();
  }

  ctx.restore();

  // 6. Sağ Açıklama & Formül Paneli
  const rx = plotX + plotW + 32;
  const rw = a.x + a.w - rx;

  // Üst Formül Kutusu
  rr(ctx, rx, a.y + 12, rw, 86, 16);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.90)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.40)';
  ctx.lineWidth = 1.4;
  ctx.stroke();

  ctx.fillStyle = '#38bdf8';
  ctx.font = font(700, 11);
  ctx.fillText('AKADEMİK DENGE MODELİ & FORMÜL', rx + 18, a.y + 34);

  ctx.fillStyle = '#ffffff';
  ctx.font = font(800, 16.5);
  ctx.fillText('Qd(P) = Qs(P)  ⟺  P*, Q*', rx + 18, a.y + 58);

  ctx.fillStyle = '#94a3b8';
  ctx.font = font(400, 12.5);
  ctx.fillText('Ceteris paribus: Denge noktasında piyasa temizlenir.', rx + 18, a.y + 78);

  // Alt Kavram Kartları
  const gap = 12;
  const cardStartY = a.y + 110;
  const cardH = Math.min(105, (a.h - 110 - gap * (n - 1)) / n);
  let target: Point = { x: eqX, y: eqY };

  list.forEach((nd, i) => {
    const t = appearAmount(i, n, reveal);
    if (t <= 0) return;
    const isAct = i === act && reveal > 0.02;
    const [c1] = PALETTE[i % PALETTE.length];
    const cy = cardStartY + i * (cardH + gap);

    ctx.save();
    ctx.globalAlpha = t;
    rr(ctx, rx, cy, rw, cardH, 16);
    ctx.fillStyle = isAct ? 'rgba(20, 33, 60, 0.96)' : 'rgba(15, 23, 42, 0.78)';
    ctx.fill();
    ctx.strokeStyle = isAct ? c1 : 'rgba(148, 163, 184, 0.22)';
    ctx.lineWidth = isAct ? 2 : 1;
    ctx.stroke();

    ctx.fillStyle = c1;
    ctx.beginPath();
    ctx.arc(rx + 18, cy + 24, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = font(700, 15.5);
    ctx.fillText(wrapText(ctx, nd.label, rw - 44, 1)[0] || '', rx + 32, cy + 28);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = font(400, 13.5);
    const sl = wrapText(ctx, nd.subtext, rw - 34, 2);
    drawLines(ctx, sl, rx + 18, cy + 50, 19);

    ctx.restore();
    if (isAct) target = { x: rx + rw / 2, y: cy + cardH / 2 };
  });

  return target;
}

// ================================================================ 5. VAKA & SENARYO SİMÜLASYONU ('scenario')
function drawScenarioStepIcon(ctx: CanvasRenderingContext2D, stepIdx: number, cx: number, cy: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = `${color}24`;
  ctx.lineWidth = 2;

  rr(ctx, cx - 20, cy - 20, 40, 40, 12);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  if (stepIdx === 0) {
    // Pusula / Bağlam ikonu
    ctx.arc(cx, cy, 10, 0, Math.PI * 2);
    ctx.moveTo(cx - 4, cy + 4);
    ctx.lineTo(cx + 5, cy - 5);
  } else if (stepIdx === 1) {
    // Aktörler ikonu
    ctx.arc(cx - 4, cy - 4, 4.5, 0, Math.PI * 2);
    ctx.moveTo(cx - 12, cy + 9);
    ctx.quadraticCurveTo(cx - 4, cy + 2, cx + 4, cy + 9);
    ctx.moveTo(cx + 9, cy - 4);
    ctx.arc(cx + 6, cy - 4, 3.5, 0, Math.PI * 2);
  } else if (stepIdx === 2) {
    // Mekanizma / Şimşek-Çark ikonu
    ctx.moveTo(cx + 2, cy - 10);
    ctx.lineTo(cx - 6, cy + 1);
    ctx.lineTo(cx + 1, cy + 1);
    ctx.lineTo(cx - 2, cy + 10);
    ctx.lineTo(cx + 7, cy - 1);
    ctx.lineTo(cx, cy - 1);
    ctx.closePath();
  } else {
    // Sonuç / Onay Kalkanı ikonu
    ctx.moveTo(cx - 7, cy + 1);
    ctx.lineTo(cx - 2, cy + 6);
    ctx.lineTo(cx + 8, cy - 5);
  }
  ctx.stroke();
  ctx.restore();
}

function drawScenarioBoard(
  ctx: CanvasRenderingContext2D,
  a: Area,
  nodes: DiagramNode[],
  reveal: number,
  now: number,
): Point {
  const stages = nodes.slice(0, 4);
  const n = stages.length;
  const act = activeIndex(n, reveal);
  const stageTitles = ['01 · BAĞLAM VE DURUM', '02 · AKTÖRLER VE KOŞULLAR', '03 · İŞLEYEN MEKANİZMA', '04 · SONUÇ VE ÇIKARIM'];

  const gapX = 34;
  const gapY = 26;
  const cardW = (a.w - gapX) / 2;
  const cardH = (a.h - gapY) / 2;

  const coords = [
    { x: a.x, y: a.y },
    { x: a.x + cardW + gapX, y: a.y },
    { x: a.x + cardW + gapX, y: a.y + cardH + gapY },
    { x: a.x, y: a.y + cardH + gapY },
  ];

  // Kartlar arası ışıklı senaryo akış okları (1 -> 2 -> 3 -> 4)
  ctx.save();
  for (let i = 0; i < Math.min(n - 1, 3); i++) {
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const sx = p1.x + cardW / 2;
    const sy = p1.y + cardH / 2;
    const ex = p2.x + cardW / 2;
    const ey = p2.y + cardH / 2;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.strokeStyle = i < act ? '#22d3ee' : 'rgba(148, 163, 184, 0.25)';
    ctx.lineWidth = 2.6;
    ctx.setLineDash([7, 6]);
    ctx.lineDashOffset = -(now / 45);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();

  let target: Point = { x: a.x + a.w / 2, y: a.y + a.h / 2 };

  stages.forEach((nd, i) => {
    const t = appearAmount(i, n, reveal);
    if (t <= 0) return;
    const isAct = i === act && reveal > 0.02;
    const [c1] = PALETTE[i % PALETTE.length];
    const pos = coords[i % coords.length];

    ctx.save();
    ctx.globalAlpha = t;
    rr(ctx, pos.x, pos.y, cardW, cardH, 22);
    ctx.fillStyle = isAct ? 'rgba(19, 32, 60, 0.97)' : 'rgba(13, 21, 39, 0.90)';
    ctx.fill();
    ctx.strokeStyle = isAct ? c1 : 'rgba(148, 163, 184, 0.24)';
    ctx.lineWidth = isAct ? 2.4 : 1.2;
    ctx.stroke();

    drawScenarioStepIcon(ctx, i, pos.x + 38, pos.y + 40, c1);

    // Aşama etiketi
    ctx.fillStyle = c1;
    ctx.font = font(800, 12);
    ctx.fillText(stageTitles[i] || `AŞAMA 0${i + 1}`, pos.x + 70, pos.y + 32);

    // Kart başlığı
    ctx.fillStyle = '#ffffff';
    ctx.font = font(700, 19);
    const cleanLbl = nd.label.replace(/^0?\d\s*·\s*/, '');
    ctx.fillText(wrapText(ctx, cleanLbl, cardW - 92, 1)[0] || '', pos.x + 70, pos.y + 56);

    // Senaryo açıklaması
    ctx.fillStyle = '#e2e8f0';
    ctx.font = font(400, 15.5);
    const lines = wrapText(ctx, nd.subtext, cardW - 48, 4);
    drawLines(ctx, lines, pos.x + 24, pos.y + 94, 23);

    ctx.restore();
    if (isAct) target = { x: pos.x + cardW / 2, y: pos.y + cardH / 2 };
  });

  return target;
}

// ================================================================ 6. TARİHSEL & SÜREÇSEL ZAMAN AKIŞI ('timeline')
function drawTimeline(
  ctx: CanvasRenderingContext2D,
  a: Area,
  nodes: DiagramNode[],
  reveal: number,
  now: number,
): Point {
  const list = nodes.slice(0, 4);
  const n = list.length;
  const act = activeIndex(n, reveal);
  const trackY = a.y + a.h / 2;
  const startX = a.x + 120;
  const endX = a.x + a.w - 120;
  const span = Math.max(1, endX - startX);

  ctx.fillStyle = 'rgba(148, 163, 184, 0.20)';
  rr(ctx, startX, trackY - 3, span, 6, 3);
  ctx.fill();

  const fillW = span * clamp((reveal - 0.04) / 0.78);
  if (fillW > 2) {
    const g = ctx.createLinearGradient(startX, 0, endX, 0);
    g.addColorStop(0, '#22d3ee');
    g.addColorStop(0.5, '#3b82f6');
    g.addColorStop(1, '#a855f7');
    ctx.fillStyle = g;
    rr(ctx, startX, trackY - 3, fillW, 6, 3);
    ctx.fill();
  }

  let target: Point = { x: a.x + a.w / 2, y: trackY };
  const cardW = Math.min(280, (a.w - 36) / Math.max(2, n) - 14);
  const cardH = 176;

  list.forEach((nd, i) => {
    const t = appearAmount(i, n, reveal);
    if (t <= 0) return;
    const px = n === 1 ? (startX + endX) / 2 : startX + (i / (n - 1)) * span;
    const upper = i % 2 === 0;
    const cy = upper ? trackY - 40 - cardH : trackY + 40;
    const cx = clamp(px - cardW / 2, a.x + 4, a.x + a.w - cardW - 4);
    const isAct = i === act && reveal > 0.02;
    const [c1] = PALETTE[i % PALETTE.length];

    ctx.save();
    ctx.globalAlpha = t;
    ctx.strokeStyle = isAct ? c1 : 'rgba(148, 163, 184, 0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, trackY);
    ctx.lineTo(px, upper ? cy + cardH : cy);
    ctx.stroke();

    const r = isAct ? 13 + Math.sin(now / 260) * 2 : 10;
    ctx.beginPath();
    ctx.arc(px, trackY, r, 0, Math.PI * 2);
    ctx.fillStyle = '#0a1020';
    ctx.fill();
    ctx.strokeStyle = c1;
    ctx.lineWidth = 3;
    ctx.stroke();

    rr(ctx, cx, cy, cardW, cardH, 18);
    ctx.fillStyle = isAct ? 'rgba(20, 33, 60, 0.96)' : 'rgba(15, 23, 42, 0.85)';
    ctx.fill();
    ctx.strokeStyle = isAct ? c1 : 'rgba(148, 163, 184, 0.24)';
    ctx.lineWidth = isAct ? 2 : 1.1;
    ctx.stroke();

    ctx.fillStyle = c1;
    ctx.font = font(800, 12);
    ctx.fillText(`ADIM 0${i + 1}`, cx + 18, cy + 28);

    ctx.fillStyle = '#ffffff';
    ctx.font = font(700, 17);
    const tl = wrapText(ctx, nd.label, cardW - 36, 2);
    drawLines(ctx, tl, cx + 18, cy + 54, 21);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = font(400, 14);
    const sl = wrapText(ctx, nd.subtext, cardW - 36, 3);
    drawLines(ctx, sl, cx + 18, cy + 56 + tl.length * 21, 19.5);
    ctx.restore();

    if (isAct) target = { x: px, y: cy + cardH / 2 };
  });

  return target;
}

// ================================================================ 7. İKİLİ KARŞILAŞTIRMA MATRİSİ ('comparison')
function drawComparison(
  ctx: CanvasRenderingContext2D,
  a: Area,
  nodes: DiagramNode[],
  reveal: number,
): Point {
  const act = activeIndex(nodes.length, reveal);
  const gap = 58;
  const colW = (a.w - gap) / 2;
  const split = Math.ceil(nodes.length / 2);
  const cols = [nodes.slice(0, split), nodes.slice(split)];
  const colColors: [string, string][] = [
    ['#22d3ee', '#3b82f6'],
    ['#c084fc', '#ec4899'],
  ];

  const vx = a.x + a.w / 2;
  const vy = a.y + a.h / 2;
  ctx.beginPath();
  ctx.arc(vx, vy, 23, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = '#e2e8f0';
  ctx.font = font(800, 13.5);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('VS', vx, vy + 0.5);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  let target: Point = { x: vx, y: vy };

  cols.forEach((items, ci) => {
    if (!items.length) return;
    const cx = a.x + ci * (colW + gap);
    const [c1, c2] = colColors[ci];

    rr(ctx, cx, a.y, colW, a.h, 22);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
    ctx.fill();
    ctx.strokeStyle = `${c1}55`;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const hg = ctx.createLinearGradient(cx, a.y, cx + colW, a.y);
    hg.addColorStop(0, `${c1}30`);
    hg.addColorStop(1, `${c2}18`);
    rr(ctx, cx, a.y, colW, 56, [22, 22, 0, 0]);
    ctx.fillStyle = hg;
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = font(800, 18.5);
    ctx.fillText(wrapText(ctx, items[0].label, colW - 44, 1)[0] || '', cx + 24, a.y + 35);

    let iy = a.y + 74;
    items.forEach((it, ii) => {
      const globalIdx = ci === 0 ? ii : split + ii;
      const t = appearAmount(globalIdx, nodes.length, reveal);
      if (t <= 0) return;
      const isAct = globalIdx === act && reveal > 0.02;

      ctx.save();
      ctx.globalAlpha = t;
      const showSubTitle = ii > 0;
      ctx.font = font(400, 15.5);
      const sl = wrapText(ctx, it.subtext || it.label, colW - 64, 4);
      const boxH = (showSubTitle ? 34 : 0) + sl.length * 23 + 28;

      rr(ctx, cx + 18, iy, colW - 36, boxH, 16);
      ctx.fillStyle = isAct ? 'rgba(24, 38, 68, 0.95)' : 'rgba(30, 41, 59, 0.45)';
      ctx.fill();
      if (isAct) {
        ctx.strokeStyle = c1;
        ctx.lineWidth = 1.8;
        ctx.stroke();
        target = { x: cx + colW / 2, y: iy + boxH / 2 };
      }

      let ty = iy + 28;
      if (showSubTitle) {
        ctx.fillStyle = c1;
        ctx.font = font(700, 16.5);
        ctx.fillText(wrapText(ctx, it.label, colW - 68, 1)[0] || '', cx + 34, ty);
        ty += 28;
      }

      ctx.fillStyle = '#e2e8f0';
      ctx.font = font(400, 15.5);
      drawLines(ctx, sl, cx + 34, ty, 23);
      ctx.restore();

      iy += boxH + 14;
    });
  });

  return target;
}

// ---------------------------------------------------------------- Altyazı (Teleprompter — Dinamik Konuşmacı Takibi)
function drawCinemaSubtitles(ctx: CanvasRenderingContext2D, f: StageFrame, activeSpeaker: Speaker) {
  const sc = f.scene;
  const accent = SPEAKER_COLOR[activeSpeaker];
  const { x, y, w, h } = getBoardLayout(f.layoutMode).sub;

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
  ctx.shadowBlur = 36;
  rr(ctx, x, y, w, h, 22);
  ctx.fillStyle = 'rgba(6, 10, 20, 0.93)';
  ctx.fill();
  ctx.restore();

  rr(ctx, x, y, w, h, 22);
  ctx.strokeStyle = `${accent}58`;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  rr(ctx, x + 10, y + 20, 4, h - 40, 2);
  ctx.fillStyle = accent;
  ctx.fill();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = font(700, 14);
  ctx.fillStyle = accent;
  const spkTitle = activeSpeaker === 'Deniz' ? 'DR. DENİZ' : 'BARIŞ';
  ctx.fillText(spkTitle, x + 28, y + 34);

  ctx.font = font(500, 13);
  ctx.fillStyle = 'rgba(148, 163, 184, 0.85)';
  ctx.textAlign = 'right';
  ctx.fillText(
    `Diyalog ${Math.min(f.sentenceIndex + 1, sc.sentences.length)} / ${sc.sentences.length}`,
    x + w - 26,
    y + 34,
  );
  ctx.textAlign = 'left';

  const sentence = sc.sentences[f.sentenceIndex] || sc.narration;
  const subFontSize =
    f.subtitleSize === 'sm' ? 21 : f.subtitleSize === 'lg' ? 29 : f.subtitleSize === 'xl' ? 33 : 25.5;
  ctx.font = font(600, subFontSize);
  const maxW = w - 58;
  const words = sentence.split(' ').filter(Boolean);
  const lines: { word: string; start: number }[][] = [[]];
  let lineW = 0;
  let charPos = 0;
  const spaceW = ctx.measureText(' ').width;

  words.forEach(word => {
    const ww = ctx.measureText(word).width;
    if (lineW + ww > maxW && lines[lines.length - 1].length) {
      lines.push([]);
      lineW = 0;
    }
    lines[lines.length - 1].push({ word, start: charPos });
    lineW += ww + spaceW;
    charPos += word.length + 1;
  });

  let startLine = 0;
  if (lines.length > 3) {
    const activeLine = lines.findIndex(
      l => l.length && l[l.length - 1].start + l[l.length - 1].word.length >= f.charInSentence,
    );
    startLine = clamp(activeLine - 1, 0, lines.length - 3);
  }

  lines.slice(startLine, startLine + 3).forEach((line, li) => {
    let lx = x + 28;
    const ly = y + 74 + li * 35;
    line.forEach(({ word, start }) => {
      const end = start + word.length;
      const wordW = ctx.measureText(word).width;
      const isCurrentWord = !f.poster && f.playing && f.charInSentence >= start && f.charInSentence <= end + 1;
      const spoken = f.poster ? true : start <= f.charInSentence;

      if (isCurrentWord) {
        ctx.save();
        rr(ctx, lx - 5, ly - 24, wordW + 10, 31, 8);
        ctx.fillStyle = `${accent}24`;
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = '#ffffff';
      } else if (spoken) {
        ctx.fillStyle = '#f1f5f9';
      } else {
        ctx.fillStyle = 'rgba(148, 163, 184, 0.5)';
      }
      ctx.fillText(word, lx, ly);
      lx += wordW + spaceW;
    });
  });
}

// ---------------------------------------------------------------- Bölüm Geçiş Bandı
function drawChapterIntroOverlay(ctx: CanvasRenderingContext2D, f: StageFrame) {
  if (f.poster || f.sceneTime > 0.92) return;
  const t = f.sceneTime / 0.92;
  const alpha = t < 0.2 ? t / 0.2 : t > 0.72 ? (1 - t) / 0.28 : 1;
  const yShift = (1 - easeOut(t / 0.35)) * 18;

  ctx.save();
  ctx.globalAlpha = clamp(alpha) * 0.96;
  const bw = 980;
  const bh = 132;
  const bx = (STAGE_W - bw) / 2;
  const by = 368 + yShift;

  rr(ctx, bx, by, bw, bh, 24);
  const g = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
  g.addColorStop(0, 'rgba(8, 25, 48, 0.96)');
  g.addColorStop(1, 'rgba(22, 16, 48, 0.96)');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
  ctx.lineWidth = 1.6;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#67e8f9';
  ctx.font = font(700, 14);
  const typeTag = TYPE_LABEL[f.scene.diagram.type] || 'STÜDYO BÖLÜMÜ';
  ctx.fillText(`BÖLÜM ${String(f.sceneIndex + 1).padStart(2, '0')}  ·  ${typeTag}`, STAGE_W / 2, by + 46);

  ctx.fillStyle = '#ffffff';
  ctx.font = font(800, 31);
  ctx.fillText(wrapText(ctx, f.scene.title, bw - 80, 1)[0] || '', STAGE_W / 2, by + 92);
  ctx.restore();
  ctx.textAlign = 'left';
}

function drawWhiteboardPresenterBadge(
  ctx: CanvasRenderingContext2D,
  f: StageFrame,
  activeSpeaker: Speaker,
) {
  const accent = SPEAKER_COLOR[activeSpeaker];
  const bx = STAGE_W - 276;
  const by = 16;
  const bw = 246;
  const bh = 54;

  ctx.save();
  rr(ctx, bx, by, bw, bh, 27);
  ctx.fillStyle = 'rgba(8, 14, 28, 0.94)';
  ctx.fill();
  ctx.strokeStyle = `${accent}66`;
  ctx.lineWidth = 1.6;
  ctx.stroke();

  const avX = bx + 30;
  const avY = by + bh / 2;
  const avR = 19;

  ctx.beginPath();
  ctx.arc(avX, avY, avR + 2, 0, Math.PI * 2);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2.2;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(avX, avY, avR, 0, Math.PI * 2);
  ctx.fillStyle = activeSpeaker === 'Deniz' ? '#162846' : '#281a42';
  ctx.fill();

  ctx.fillStyle = activeSpeaker === 'Deniz' ? '#f4d0b5' : '#eed5c2';
  ctx.beginPath();
  ctx.arc(avX, avY + 1, 11, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = activeSpeaker === 'Deniz' ? '#2c221e' : '#1e1c22';
  ctx.beginPath();
  ctx.arc(avX, avY - 4, 11.5, Math.PI * 0.9, Math.PI * 2.1);
  ctx.fill();

  const blink = (f.now / 1000) % 4.5 < 0.12 ? 0 : 2;
  ctx.fillStyle = '#1e293b';
  if (blink > 0) {
    ctx.fillRect(avX - 5, avY - 1, 2.5, 2);
    ctx.fillRect(avX + 2.5, avY - 1, 2.5, 2);
  } else {
    ctx.fillRect(avX - 5, avY, 3, 1);
    ctx.fillRect(avX + 2.5, avY, 3, 1);
  }

  const mouthH = Math.max(1.2, f.mouthOpen * 7);
  ctx.fillStyle = '#881337';
  ctx.beginPath();
  ctx.ellipse(avX, avY + 6, 3.5, mouthH / 2, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = font(700, 13);
  ctx.fillText(activeSpeaker === 'Deniz' ? 'Dr. Deniz' : 'Barış', bx + 58, by + 23);

  const isSpeaking = f.playing && !f.inBreathPause;
  ctx.fillStyle = accent;
  ctx.font = font(600, 10);
  ctx.fillText(isSpeaking ? '● CANLI ANLATIM' : '○ DİNLİYOR', bx + 58, by + 40);

  for (let b = 0; b < 3; b++) {
    const waveH = isSpeaking ? 4 + Math.sin(f.now / 90 + b * 1.5) * 6 * f.mouthOpen : 3;
    const barX = bx + bw - 38 + b * 6;
    ctx.fillRect(barX, by + bh / 2 - waveH / 2, 3, waveH);
  }

  ctx.restore();
}

export function renderStage(ctx: CanvasRenderingContext2D, f: StageFrame) {
  ctx.save();
  drawBroadcastStudioBackground(ctx, f.now, f.playing ? f.mouthOpen : 0);

  const activeSpeaker: Speaker =
    f.activeSpeaker || f.scene.sentenceSpeakers?.[f.sentenceIndex] || f.scene.speaker;

  const denizSpeaks = f.playing && activeSpeaker === 'Deniz';
  const barisSpeaks = f.playing && activeSpeaker === 'Barış';

  const target = drawSmartBoard(ctx, f);

  if (f.layoutMode === 'whiteboard') {
    // Sanal Tahta Modu: Tahta tüm ekranı kaplar, sunucu üst köşede canlı avatar rozetiyle konuşur!
    drawWhiteboardPresenterBadge(ctx, f, activeSpeaker);
  } else if (f.layoutMode === 'focus') {
    // Odak Modu: Sadece tam ekran tahta ve altyazı
  } else {
    // Standart Stüdyo Modu: Masada sunucular ve merkezde akıllı tahta
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
    drawCinemaSubtitles(ctx, f, activeSpeaker);
  }

  drawBroadcastHud(ctx, f);
  drawChapterIntroOverlay(ctx, f);
  ctx.restore();
}
