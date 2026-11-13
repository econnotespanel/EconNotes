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
interface SceneMood {
  bgTop: string;
  bgMid: string;
  bgBottom: string;
  spotA: string;
  spotB: string;
  spotC: string;
  accent: string;
  secondary: string;
  pattern: 'radar' | 'mathgrid' | 'columns' | 'matrix' | 'constellation' | 'pulse' | 'horizon' | 'split';
}

const SCENE_MOODS: Record<DiagramType, SceneMood> = {
  visual: {
    bgTop: '#061322',
    bgMid: '#050915',
    bgBottom: '#02040a',
    spotA: '20, 184, 166',
    spotB: '56, 189, 248',
    spotC: '99, 102, 241',
    accent: '#22d3ee',
    secondary: '#2dd4bf',
    pattern: 'radar',
  },
  curve: {
    bgTop: '#05191d',
    bgMid: '#050c14',
    bgBottom: '#020509',
    spotA: '16, 185, 129',
    spotB: '245, 158, 11',
    spotC: '34, 211, 238',
    accent: '#34d399',
    secondary: '#fbbf24',
    pattern: 'mathgrid',
  },
  chart: {
    bgTop: '#071127',
    bgMid: '#050916',
    bgBottom: '#02040a',
    spotA: '59, 130, 246',
    spotB: '251, 191, 36',
    spotC: '34, 211, 238',
    accent: '#38bdf8',
    secondary: '#fbbf24',
    pattern: 'columns',
  },
  table: {
    bgTop: '#0a0f26',
    bgMid: '#060917',
    bgBottom: '#03040b',
    spotA: '99, 102, 241',
    spotB: '56, 189, 248',
    spotC: '168, 85, 247',
    accent: '#818cf8',
    secondary: '#38bdf8',
    pattern: 'matrix',
  },
  shapes: {
    bgTop: '#100c26',
    bgMid: '#070816',
    bgBottom: '#03040a',
    spotA: '168, 85, 247',
    spotB: '34, 211, 238',
    spotC: '236, 72, 153',
    accent: '#c084fc',
    secondary: '#22d3ee',
    pattern: 'constellation',
  },
  network: {
    bgTop: '#0e0f28',
    bgMid: '#060816',
    bgBottom: '#03040a',
    spotA: '139, 92, 246',
    spotB: '34, 211, 238',
    spotC: '52, 211, 153',
    accent: '#a78bfa',
    secondary: '#22d3ee',
    pattern: 'constellation',
  },
  structure: {
    bgTop: '#091426',
    bgMid: '#050915',
    bgBottom: '#02040a',
    spotA: '56, 189, 248',
    spotB: '129, 140, 248',
    spotC: '45, 212, 191',
    accent: '#38bdf8',
    secondary: '#818cf8',
    pattern: 'matrix',
  },
  scenario: {
    bgTop: '#1a1019',
    bgMid: '#0c0812',
    bgBottom: '#040308',
    spotA: '249, 115, 22',
    spotB: '244, 63, 94',
    spotC: '251, 191, 36',
    accent: '#fb923c',
    secondary: '#fb7185',
    pattern: 'pulse',
  },
  timeline: {
    bgTop: '#071429',
    bgMid: '#050917',
    bgBottom: '#02040b',
    spotA: '14, 165, 233',
    spotB: '139, 92, 246',
    spotC: '52, 211, 153',
    accent: '#38bdf8',
    secondary: '#a78bfa',
    pattern: 'horizon',
  },
  comparison: {
    bgTop: '#0b1024',
    bgMid: '#060814',
    bgBottom: '#02040a',
    spotA: '34, 211, 238',
    spotB: '236, 72, 153',
    spotC: '168, 85, 247',
    accent: '#22d3ee',
    secondary: '#f472b6',
    pattern: 'split',
  },
};

function getSceneMood(type?: DiagramType): SceneMood {
  return (type && SCENE_MOODS[type]) || SCENE_MOODS.visual;
}

function drawBroadcastStudioBackground(
  ctx: CanvasRenderingContext2D,
  now: number,
  energy = 0,
  diagramType?: DiagramType,
  sceneIndex = 0,
) {
  const mood = getSceneMood(diagramType);
  const bg = ctx.createLinearGradient(0, 0, 0, STAGE_H);
  bg.addColorStop(0, mood.bgTop);
  bg.addColorStop(0.55, mood.bgMid);
  bg.addColorStop(1, mood.bgBottom);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, STAGE_W, STAGE_H);

  // Bölüme göre değişen mimari arka plan geometrisi (tekdüzelik kırılır)
  ctx.fillStyle = 'rgba(148, 163, 184, 0.02)';
  if (mood.pattern === 'split') {
    const splitLeft = ctx.createLinearGradient(0, 0, STAGE_W * 0.5, 0);
    splitLeft.addColorStop(0, 'rgba(34, 211, 238, 0.06)');
    splitLeft.addColorStop(1, 'rgba(34, 211, 238, 0)');
    ctx.fillStyle = splitLeft;
    ctx.fillRect(0, 0, STAGE_W * 0.5, STAGE_H);

    const splitRight = ctx.createLinearGradient(STAGE_W * 0.5, 0, STAGE_W, 0);
    splitRight.addColorStop(0, 'rgba(236, 72, 153, 0)');
    splitRight.addColorStop(1, 'rgba(236, 72, 153, 0.06)');
    ctx.fillStyle = splitRight;
    ctx.fillRect(STAGE_W * 0.5, 0, STAGE_W * 0.5, STAGE_H);
  } else {
    for (let x = 24; x < STAGE_W; x += mood.pattern === 'columns' ? 48 : 36) {
      ctx.fillRect(x, 0, mood.pattern === 'columns' ? 14 : 9, STAGE_H - 130);
    }
  }

  // Yumuşak stüdyo tavan spot ışıkları (sahne temasına göre kayar)
  const drift = (sceneIndex % 3) * 65 - 65;
  const spots = [
    { x: 260 + drift, y: -60, r: 720, c: mood.spotA, a: 0.13 },
    { x: STAGE_W / 2 - drift * 0.5, y: -110, r: 880, c: mood.spotB, a: 0.10 },
    { x: STAGE_W - 260 - drift, y: -60, r: 720, c: mood.spotC, a: 0.12 },
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
  horizonGrad.addColorStop(0, `rgba(${mood.spotA}, 0)`);
  horizonGrad.addColorStop(0.28, `rgba(${mood.spotA}, 0.22)`);
  horizonGrad.addColorStop(0.72, `rgba(${mood.spotB}, 0.20)`);
  horizonGrad.addColorStop(1, `rgba(${mood.spotB}, 0)`);
  ctx.fillStyle = horizonGrad;
  ctx.fillRect(0, 816, STAGE_W, 1.8);

  // Sahneye özel hareketli parçacıklar ve konuşma enerjisi tepkisi
  ctx.save();
  for (let i = 0; i < 30; i++) {
    const phase = i * 1.73 + sceneIndex * 0.9;
    const x = ((i * 271 + now * (0.008 + (i % 3) * 0.002)) % (STAGE_W + 80)) - 40;
    const y = 110 + ((i * 97 + Math.sin(now / 2400 + phase) * 36) % 680);
    const radius = 1.2 + (i % 4) * 0.55;
    const alpha = 0.055 + energy * 0.04;
    ctx.fillStyle = i % 2 ? `rgba(${mood.spotA}, ${alpha})` : `rgba(${mood.spotB}, ${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  const sweepX = ((now / 8) % (STAGE_W + 700)) - 350;
  const sweep = ctx.createLinearGradient(sweepX - 220, 0, sweepX + 220, 0);
  sweep.addColorStop(0, 'rgba(255,255,255,0)');
  sweep.addColorStop(0.5, `rgba(${mood.spotA}, ${0.03 + energy * 0.03})`);
  sweep.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sweep;
  ctx.fillRect(0, 80, STAGE_W, 700);
  ctx.restore();

  const vignette = ctx.createRadialGradient(STAGE_W / 2, STAGE_H * 0.42, 320, STAGE_W / 2, STAGE_H * 0.42, 1120);
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.34)');
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

  ctx.fillStyle = 'rgba(148, 163, 184, 0.7)';
  ctx.font = font(700, 10.5);

  ctx.textAlign = 'right';

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
  const mood = getSceneMood(d.type);

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.78)';
  ctx.shadowBlur = 66;
  ctx.shadowOffsetY = 24;
  rr(ctx, x, y, w, h, 30);
  ctx.fillStyle = 'rgba(9, 15, 31, 0.96)';
  ctx.fill();
  ctx.restore();

  // Tahtanın odak noktasını destekleyen, sahne moduna uyumlu sinematik parlama
  const focusGlow = ctx.createRadialGradient(
    x + w * (0.28 + f.progress * 0.44),
    y + h * 0.5,
    8,
    x + w * (0.28 + f.progress * 0.44),
    y + h * 0.5,
    Math.min(w, h) * 0.60,
  );
  focusGlow.addColorStop(0, `rgba(${mood.spotA}, ${0.045 + f.mouthOpen * 0.03})`);
  focusGlow.addColorStop(1, `rgba(${mood.spotA}, 0)`);
  ctx.fillStyle = focusGlow;
  ctx.fillRect(x, y, w, h);

  const glass = ctx.createLinearGradient(x, y, x + w, y + h);
  glass.addColorStop(0, `rgba(${mood.spotA}, 0.085)`);
  glass.addColorStop(0.45, 'rgba(15, 23, 42, 0)');
  glass.addColorStop(1, `rgba(${mood.spotB}, 0.065)`);
  rr(ctx, x, y, w, h, 30);
  ctx.fillStyle = glass;
  ctx.fill();

  const border = ctx.createLinearGradient(x, y, x + w, y + h);
  border.addColorStop(0, `rgba(${mood.spotA}, 0.65)`);
  border.addColorStop(0.5, `rgba(${mood.spotC}, 0.34)`);
  border.addColorStop(1, `rgba(${mood.spotB}, 0.58)`);
  ctx.strokeStyle = border;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Köşe nişangah / stüdyo kamera çerçeve çizgileri
  ctx.save();
  ctx.strokeStyle = mood.accent;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 2.4;
  const cl = 22;
  [
    [x + 12, y + 12, 1, 1],
    [x + w - 12, y + 12, -1, 1],
    [x + 12, y + h - 12, 1, -1],
    [x + w - 12, y + h - 12, -1, -1],
  ].forEach(([cxp, cyp, dx, dy]) => {
    ctx.beginPath();
    ctx.moveTo(cxp, cyp + dy * cl);
    ctx.lineTo(cxp, cyp);
    ctx.lineTo(cxp + dx * cl, cyp);
    ctx.stroke();
  });
  ctx.restore();

  ctx.save();
  rr(ctx, x, y, w, h, 30);
  ctx.clip();

  // Sahne tipine göre değişen iç yüzey dokusu (ızgara / takımyıldız / ayrım zemini)
  if (mood.pattern === 'constellation' || mood.pattern === 'radar') {
    ctx.strokeStyle = `rgba(${mood.spotA}, 0.045)`;
    ctx.lineWidth = 1;
    for (let r = 120; r < w * 0.7; r += 110) {
      ctx.beginPath();
      ctx.arc(x + w * 0.22, y + h * 0.55, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else {
    ctx.strokeStyle = mood.pattern === 'mathgrid' ? `rgba(${mood.spotA}, 0.055)` : 'rgba(148, 163, 184, 0.032)';
    ctx.lineWidth = 1;
    const step = mood.pattern === 'mathgrid' ? 36 : 48;
    for (let gx = x + 48; gx < x + w; gx += step) {
      ctx.beginPath();
      ctx.moveTo(gx, y + 114);
      ctx.lineTo(gx, y + h - 68);
      ctx.stroke();
    }
    for (let gy = y + 132; gy < y + h - 68; gy += step) {
      ctx.beginPath();
      ctx.moveTo(x, gy);
      ctx.lineTo(x + w, gy);
      ctx.stroke();
    }
  }

  // Üst kategori etiketi
  const typeLabel = TYPE_LABEL[d.type] || 'STÜDYO DERS ŞEMASI';
  ctx.font = font(700, 12.5);
  const tagW = ctx.measureText(typeLabel).width + 32;
  rr(ctx, x + 36, y + 22, tagW, 28, 14);
  ctx.fillStyle = `rgba(${mood.spotA}, 0.16)`;
  ctx.fill();
  ctx.strokeStyle = `rgba(${mood.spotA}, 0.45)`;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.fillStyle = mood.accent;
  ctx.textBaseline = 'middle';
  ctx.fillText(typeLabel, x + 52, y + 36.5);

  // Sahne tematik göstergesi + sağ üst ders adı rozeti
  if (d.rootBadge) {
    ctx.font = font(600, 12.5);
    const rb = wrapText(ctx, d.rootBadge, 280, 1)[0] || '';
    const rbw = ctx.measureText(rb).width + 26;
    rr(ctx, x + w - 36 - rbw, y + 22, rbw, 28, 14);
    ctx.fillStyle = 'rgba(148, 163, 184, 0.10)';
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
  sep.addColorStop(0, mood.accent);
  sep.addColorStop(0.55, `rgba(${mood.spotB}, 0.25)`);
  sep.addColorStop(1, 'rgba(148, 163, 184, 0.02)');
  ctx.fillStyle = sep;
  ctx.fillRect(x + 36, y + 104, w - 72, 1.8);

  const bottomNote = f.scene.examTip || d.metric;
  const noteLinesCount = bottomNote ? Math.min(2, wrapText(ctx, bottomNote, w - 210, 2).length) : 0;
  const bottomBarH = noteLinesCount === 2 ? 56 : noteLinesCount === 1 ? 42 : 0;
  const contentArea: Area = {
    x: x + 34,
    y: y + 120,
    w: w - 68,
    h: h - 120 - (bottomBarH > 0 ? bottomBarH + 22 : 24),
  };

  let focusPoint: Point = { x: x + w / 2, y: y + h / 2 };
  const nodes = d.nodes.slice(0, 5);

  if (nodes.length === 0) {
    focusPoint = drawTakeawayCards(ctx, contentArea, f.scene.keyTakeaways, reveal);
  } else if (d.type === 'visual') {
    focusPoint = drawVisualShowcase(
      ctx,
      contentArea,
      nodes,
      d.visualTheme,
      reveal,
      f.now,
      `${f.courseLabel}|${f.scene.title}|${f.sceneIndex}|${d.title}`,
    );
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
    focusPoint = drawVisualShowcase(
      ctx,
      contentArea,
      nodes,
      d.visualTheme,
      reveal,
      f.now,
      `${f.courseLabel}|${f.scene.title}|${f.sceneIndex}|${d.title}`,
    );
  }

  // Alt sınav vurgu bandı — hocanın sorabileceği noktaları 2 satıra kadar eksiksiz vurgular
  if (bottomNote && bottomBarH > 0) {
    const my = y + h - bottomBarH - 12;
    rr(ctx, x + 34, my, w - 68, bottomBarH, 13);
    ctx.fillStyle = 'rgba(245, 158, 11, 0.13)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.38)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.fillStyle = '#fbbf24';
    ctx.font = font(800, 12.5);
    const prefix = 'SINAV NOTU:';
    ctx.fillText(prefix, x + 50, my + 24);
    const pw = ctx.measureText(prefix).width;

    ctx.fillStyle = '#fef3c7';
    ctx.font = font(500, 14);
    const wrappedNotes = wrapText(ctx, bottomNote, w - 134 - pw, 2);
    drawLines(ctx, wrappedNotes, x + 62 + pw, my + 24, 19);
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
  variantKey: string,
): Point[] {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const slow = now / 2800;
  let variantHash = 0;
  for (let i = 0; i < variantKey.length; i++) {
    variantHash = (variantHash * 31 + variantKey.charCodeAt(i)) | 0;
  }
  const variant = Math.abs(variantHash) % 3;
  const lowerKey = variantKey.toLocaleLowerCase('tr-TR');
  const isMonetaryTopic =
    /para teorisi|merkez bankası|emisyon|likidite|para arzı|para talebi|faiz|enflasyon|rezerv|kredi|banka|taylor|fisher|monetar/.test(
      lowerKey,
    );

  ctx.save();
  rr(ctx, box.x, box.y, box.w, box.h, 24);
  const bg = ctx.createLinearGradient(box.x, box.y, box.x + box.w, box.y + box.h);
  if (theme === 'history') {
    bg.addColorStop(0, '#0f1b34');
    bg.addColorStop(0.55, '#13233d');
    bg.addColorStop(1, '#1d1636');
  } else if (theme === 'economics') {
    bg.addColorStop(0, '#072238');
    bg.addColorStop(0.55, '#0b293d');
    bg.addColorStop(1, '#091a2e');
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
  glow.addColorStop(
    0,
    theme === 'history'
      ? 'rgba(251, 191, 36, 0.18)'
      : theme === 'economics'
      ? 'rgba(16, 185, 129, 0.22)'
      : 'rgba(34, 211, 238, 0.22)',
  );
  glow.addColorStop(1, 'rgba(15, 23, 42, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(box.x, box.y, box.w, box.h);

  // Üst sol rozet
  const badgeTitle =
    theme === 'economics' && isMonetaryTopic
      ? 'PARASAL MEKANİZMA'
      : theme === 'economics'
      ? 'İKTİSADİ MODEL'
      : theme === 'history'
      ? 'TARİHSEL KRONİK'
      : 'KONU İLLÜSTRASYONU';
  ctx.font = font(700, 11.5);
  const btW = ctx.measureText(badgeTitle).width + 28;
  rr(ctx, box.x + 18, box.y + 18, btW, 28, 14);
  ctx.fillStyle = 'rgba(6, 10, 22, 0.72)';
  ctx.fill();
  ctx.strokeStyle = theme === 'economics' ? 'rgba(52, 211, 153, 0.4)' : 'rgba(56, 189, 248, 0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = theme === 'economics' ? '#6ee7b7' : '#e2e8f0';
  ctx.fillText(badgeTitle, box.x + 32, box.y + 36);

  if (theme === 'history') {
    const baseY = box.y + box.h - 76;
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(box.x + 38, baseY);
    ctx.lineTo(box.x + box.w - 38, baseY);
    ctx.stroke();

    if (variant === 1) {
      const milestones = [
        { x: box.x + 70, title: 'KÖKEN', color: '#22d3ee' },
        { x: cx - 64, title: 'DÖNÜŞÜM', color: '#fbbf24' },
        { x: cx + 64, title: 'ETKİ', color: '#a78bfa' },
        { x: box.x + box.w - 70, title: 'MİRAS', color: '#34d399' },
      ];
      milestones.forEach((item, index) => {
        const y = baseY - (index % 2 === 0 ? 114 : 186);
        ctx.beginPath();
        ctx.moveTo(item.x, baseY);
        ctx.lineTo(item.x, y + 34);
        ctx.strokeStyle = `${item.color}99`;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(item.x, baseY, 9, 0, Math.PI * 2);
        ctx.fillStyle = item.color;
        ctx.fill();
        rr(ctx, item.x - 54, y, 108, 36, 12);
        ctx.fillStyle = `${item.color}22`;
        ctx.fill();
        ctx.strokeStyle = `${item.color}88`;
        ctx.stroke();
        ctx.fillStyle = '#f8fafc';
        ctx.font = font(700, 10.5);
        ctx.textAlign = 'center';
        ctx.fillText(item.title, item.x, y + 23);
      });
      ctx.textAlign = 'left';
    } else if (variant === 2) {
      ctx.save();
      ctx.translate(cx, cy - 8);
      ctx.rotate(slow * 0.25);
      [96, 62].forEach((r, ri) => {
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.strokeStyle = ri === 0 ? 'rgba(251, 191, 36, 0.45)' : 'rgba(56, 189, 248, 0.5)';
        ctx.setLineDash(ri === 0 ? [8, 6] : []);
        ctx.lineWidth = 2;
        ctx.stroke();
      });
      ctx.setLineDash([]);
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 18, Math.sin(a) * 18);
        ctx.lineTo(Math.cos(a) * 96, Math.sin(a) * 96);
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.5)';
        ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = '#fef3c7';
      ctx.font = font(800, 13);
      ctx.textAlign = 'center';
      ctx.fillText('KURUMSAL DÖNÜŞÜM', cx, baseY - 12);
      ctx.textAlign = 'left';
    } else {
      const left = cx - 150;
      const top = box.y + 92;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.86)';
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.62)';
      ctx.lineWidth = 2;
      rr(ctx, left, top, 300, 224, 18);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(251, 191, 36, 0.16)';
      ctx.fillRect(left + 18, top + 18, 264, 42);
      ctx.fillStyle = '#fbbf24';
      ctx.font = font(800, 16);
      ctx.textAlign = 'center';
      ctx.fillText('TARİHSEL BELGE & KRONİK', cx, top + 44);
      ctx.textAlign = 'left';
      for (let row = 0; row < 4; row++) {
        const y = top + 84 + row * 30;
        ctx.fillStyle = row === activeIdx % 4 ? '#67e8f9' : 'rgba(148, 163, 184, 0.45)';
        ctx.fillRect(left + 26, y, 52 + row * 20, 5);
        ctx.fillRect(left + 94, y, 164 - row * 14, 5);
      }
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.55)';
      ctx.beginPath();
      ctx.moveTo(left + 26, top + 190);
      ctx.bezierCurveTo(left + 90, top + 148, left + 190, top + 210, left + 274, top + 166);
      ctx.stroke();
    }
  } else if (theme === 'economics' && isMonetaryTopic && variant === 0) {
    // MERKEZ BANKASI EMİSYON VE PARASAL AKTARIM MEKANİZMASI
    const hubY = cy - 42;
    const targets = [
      { x: cx - 120, y: cy + 102, title: 'EMİSYON', sub: 'M0 / Rezerv', color: '#34d399' },
      { x: cx, y: cy + 118, title: 'LİKİDİTE', sub: 'M1 / Kredi', color: '#22d3ee' },
      { x: cx + 120, y: cy + 102, title: 'İSTİKRAR', sub: 'Fiyat & Faiz', color: '#fbbf24' },
    ];

    targets.forEach((tg, idx) => {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx, hubY + 46);
      ctx.bezierCurveTo(cx, hubY + 88, tg.x, tg.y - 54, tg.x, tg.y - 26);
      ctx.strokeStyle = idx === activeIdx % targets.length ? tg.color : 'rgba(148, 163, 184, 0.34)';
      ctx.lineWidth = idx === activeIdx % targets.length ? 3 : 1.8;
      ctx.stroke();

      const p = ((now / 1500 + idx * 0.33) % 1);
      const px = cx + (tg.x - cx) * p;
      const py = hubY + 46 + (tg.y - 26 - (hubY + 46)) * p;
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.fillStyle = tg.color;
      ctx.fill();

      rr(ctx, tg.x - 54, tg.y - 24, 108, 58, 14);
      ctx.fillStyle = idx === activeIdx % targets.length ? 'rgba(16, 42, 62, 0.96)' : 'rgba(15, 23, 42, 0.85)';
      ctx.fill();
      ctx.strokeStyle = tg.color;
      ctx.lineWidth = idx === activeIdx % targets.length ? 2.2 : 1.2;
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.fillStyle = tg.color;
      ctx.font = font(800, 11.5);
      ctx.fillText(tg.title, tg.x, tg.y - 2);
      ctx.fillStyle = '#e2e8f0';
      ctx.font = font(600, 11);
      ctx.fillText(tg.sub, tg.x, tg.y + 18);
      ctx.restore();
    });

    ctx.save();
    drawPolygon(ctx, cx, hubY, 64, 6, -Math.PI / 6);
    const cg = ctx.createLinearGradient(cx - 56, hubY - 56, cx + 56, hubY + 56);
    cg.addColorStop(0, 'rgba(16, 185, 129, 0.92)');
    cg.addColorStop(1, 'rgba(14, 116, 144, 0.95)');
    ctx.fillStyle = cg;
    ctx.shadowColor = 'rgba(52, 211, 153, 0.4)';
    ctx.shadowBlur = 24;
    ctx.fill();
    ctx.strokeStyle = '#6ee7b7';
    ctx.lineWidth = 2.4;
    ctx.stroke();
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = font(800, 15);
    ctx.fillText('MERKEZ', cx, hubY - 4);
    ctx.fillText('BANKASI', cx, hubY + 15);
    ctx.textAlign = 'left';

    rr(ctx, box.x + box.w - 146, box.y + 18, 128, 28, 14);
    ctx.fillStyle = 'rgba(16, 185, 129, 0.16)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(52, 211, 153, 0.45)';
    ctx.stroke();
    ctx.fillStyle = '#6ee7b7';
    ctx.font = font(800, 12);
    ctx.textAlign = 'center';
    ctx.fillText('M · V = P · Y', box.x + box.w - 82, box.y + 36);
    ctx.textAlign = 'left';
  } else if (theme === 'economics' && variant === 0) {
    // Hassas İktisadi Denge Terazisi + Yükselen Piyasa Çubukları
    const baseY = box.y + box.h - 72;
    const barVals = [0.38, 0.56, 0.48, 0.76, 0.9];
    barVals.forEach((v, idx) => {
      const bw = 34;
      const bx = cx - 118 + idx * 50;
      const bh = 150 * v * (0.92 + Math.sin(slow + idx) * 0.06);
      const g = ctx.createLinearGradient(bx, baseY - bh, bx, baseY);
      g.addColorStop(0, idx === activeIdx % 5 ? '#fbbf24' : '#34d399');
      g.addColorStop(1, 'rgba(14, 165, 233, 0.18)');
      rr(ctx, bx, baseY - bh, bw, bh, [8, 8, 2, 2]);
      ctx.fillStyle = g;
      ctx.fill();
    });

    const tilt = Math.sin(slow * 1.1) * 0.08;
    ctx.save();
    ctx.translate(cx, box.y + 148);
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

    [-105, 105].forEach((px, pIdx) => {
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px - 22, 42);
      ctx.lineTo(px + 22, 42);
      ctx.closePath();
      ctx.strokeStyle = 'rgba(52, 211, 153, 0.78)';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(px, 46, 26, 0, Math.PI);
      ctx.fillStyle = 'rgba(52, 211, 153, 0.25)';
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#e2e8f0';
      ctx.font = font(700, 10);
      ctx.textAlign = 'center';
      ctx.fillText(isMonetaryTopic ? (pIdx === 0 ? 'Ms ARZ' : 'Md TALEP') : (pIdx === 0 ? 'ARZ' : 'TALEP'), px, 34);
    });
    ctx.restore();
  } else if (theme === 'economics' && variant === 1) {
    // Arz-talep veya Para Piyasası kesişimi
    const axisX = box.x + 52;
    const axisY = box.y + box.h - 90;
    const chartW = box.w - 104;
    const chartH = box.h - 186;
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(axisX, axisY - chartH);
    ctx.lineTo(axisX, axisY);
    ctx.lineTo(axisX + chartW, axisY);
    ctx.stroke();
    ctx.save();
    ctx.beginPath();
    ctx.rect(axisX, axisY - chartH, chartW, chartH);
    ctx.clip();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#34d399';
    ctx.beginPath();
    if (isMonetaryTopic) {
      const msX = axisX + chartW * 0.52;
      ctx.moveTo(msX, axisY - 14);
      ctx.lineTo(msX, axisY - chartH + 14);
    } else {
      ctx.moveTo(axisX + 24, axisY - 30);
      ctx.bezierCurveTo(axisX + chartW * 0.3, axisY - chartH * 0.4, axisX + chartW * 0.62, axisY - chartH * 0.78, axisX + chartW - 20, axisY - chartH + 22);
    }
    ctx.stroke();
    ctx.strokeStyle = '#fbbf24';
    ctx.beginPath();
    ctx.moveTo(axisX + 24, axisY - chartH + 22);
    ctx.bezierCurveTo(axisX + chartW * 0.3, axisY - chartH * 0.78, axisX + chartW * 0.62, axisY - chartH * 0.4, axisX + chartW - 20, axisY - 30);
    ctx.stroke();
    const pulse = (Math.sin(slow * 1.5) + 1) / 2;
    const eqX = axisX + chartW * (isMonetaryTopic ? 0.52 : 0.48 + pulse * 0.04);
    const eqY = axisY - chartH * (0.50 + pulse * 0.04);
    ctx.beginPath();
    ctx.arc(eqX, eqY, 10, 0, Math.PI * 2);
    ctx.fillStyle = '#f8fafc';
    ctx.fill();
    ctx.strokeStyle = '#34d399';
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#6ee7b7';
    ctx.font = font(700, 12);
    ctx.fillText(isMonetaryTopic ? 'i (Faiz)' : 'Fiyat (P)', axisX - 36, axisY - chartH + 8);
    ctx.fillText(isMonetaryTopic ? 'M (Para)' : 'Miktar (Q)', axisX + chartW - 58, axisY + 32);
  } else if (theme === 'economics') {
    const center = { x: cx, y: cy + 10 };
    const orbit = isMonetaryTopic
      ? [
          { x: cx - 128, y: cy - 82, label: 'TCMB / MB', color: '#34d399' },
          { x: cx + 128, y: cy - 82, label: 'Bankalar', color: '#fbbf24' },
          { x: cx - 128, y: cy + 112, label: 'Kredi', color: '#22d3ee' },
          { x: cx + 128, y: cy + 112, label: 'Reel Ekonomi', color: '#a78bfa' },
        ]
      : [
          { x: cx - 128, y: cy - 82, label: 'Hanehalkı', color: '#22d3ee' },
          { x: cx + 128, y: cy - 82, label: 'Firmalar', color: '#fbbf24' },
          { x: cx - 128, y: cy + 112, label: 'Devlet', color: '#34d399' },
          { x: cx + 128, y: cy + 112, label: 'Piyasa', color: '#a78bfa' },
        ];
    orbit.forEach((item, index) => {
      ctx.save();
      ctx.strokeStyle = `${item.color}88`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(item.x, item.y);
      ctx.lineTo(center.x, center.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(item.x, item.y, 44 + (index === activeIdx % orbit.length ? 5 : 0), 0, Math.PI * 2);
      ctx.fillStyle = `${item.color}24`;
      ctx.fill();
      ctx.strokeStyle = item.color;
      ctx.stroke();
      ctx.fillStyle = '#f8fafc';
      ctx.font = font(700, 12.5);
      ctx.textAlign = 'center';
      ctx.fillText(item.label, item.x, item.y + 5);
      ctx.restore();
    });
    ctx.beginPath();
    ctx.arc(center.x, center.y, 58, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(14, 116, 144, 0.88)';
    ctx.fill();
    ctx.strokeStyle = '#67e8f9';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = font(800, 16);
    ctx.textAlign = 'center';
    ctx.fillText(isMonetaryTopic ? 'LİKİDİTE' : 'DENGE', center.x, center.y + 6);
    ctx.textAlign = 'left';
    ctx.beginPath();
    ctx.arc(center.x, center.y, 58, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(14, 116, 144, 0.85)';
    ctx.fill();
    ctx.strokeStyle = '#67e8f9';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = font(800, 17);
    ctx.textAlign = 'center';
    ctx.fillText('DENGE', center.x, center.y + 6);
    ctx.textAlign = 'left';
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
  lessonKey: string,
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
  const variantKey = `${theme}|${lessonKey}|${nodes.map(node => `${node.label}:${node.subtext}`).join('|')}`;
  const anchors = drawThematicIllustration(ctx, illBox, theme, now, act, variantKey);

  const rightX = illBox.x + illBox.w + 34;
  const rightW = a.x + a.w - rightX;
  const gap = n <= 2 ? 20 : 14;
  const maxCardCap = n === 1 ? 230 : n === 2 ? 190 : 118;
  const cardH = Math.min(maxCardCap, (a.h - gap * (n - 1)) / Math.max(1, n));
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
    ctx.lineWidth = isAct ? 2.4 : 1.2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(anchor.x, anchor.y, isAct ? 6 : 3.5, 0, Math.PI * 2);
    ctx.fillStyle = c1;
    ctx.fill();

    // Kart gövdesi
    rr(ctx, rightX, cy, rightW, cardH, 18);
    ctx.fillStyle = isAct ? 'rgba(20, 33, 60, 0.96)' : 'rgba(15, 23, 42, 0.82)';
    ctx.fill();
    ctx.strokeStyle = isAct ? c1 : 'rgba(148, 163, 184, 0.22)';
    ctx.lineWidth = isAct ? 2.2 : 1.1;
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
    ctx.font = font(700, n <= 2 ? 20 : 17.5);
    const lbl = wrapText(ctx, nd.label, rightW - 150, 1)[0] || '';
    ctx.fillText(lbl, rightX + 22, cy + (n <= 2 ? 36 : 31));

    if (nd.badge) {
      ctx.font = font(600, 11);
      const bt = wrapText(ctx, nd.badge, 125, 1)[0] || '';
      const bw = ctx.measureText(bt).width + 18;
      rr(ctx, rightX + rightW - bw - 16, cy + 14, bw, 22, 11);
      ctx.fillStyle = `${c1}24`;
      ctx.fill();
      ctx.fillStyle = c1;
      ctx.fillText(bt, rightX + rightW - bw - 7, cy + 29);
    }

    ctx.fillStyle = '#cbd5e1';
    ctx.font = font(400, n <= 2 ? 16 : 14.5);
    const maxLines = n === 1 ? 5 : n === 2 ? 4 : 2;
    const subLines = wrapText(ctx, nd.subtext, rightW - 38, maxLines);
    drawLines(ctx, subLines, rightX + 22, cy + (n <= 2 ? 68 : 56), n <= 2 ? 24 : 21);
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
  const curveCorpus = `${mainTitle} ${nodes.map(nd => `${nd.label} ${nd.subtext}`).join(' ')}`.toLocaleLowerCase('tr-TR');
  const isMonetary = /para arz|para talep|merkez bankas|emisyon|likidite|para teorisi|faiz oran|rezerv/.test(curveCorpus);
  const isMacroAdAs = !isMonetary && /toplam talep|toplam arz|gsyh|enflasyon|is-lm|maliye|büyüme|hasıla/.test(curveCorpus);

  const yLabel = isMonetary ? 'i (Faiz %)' : isMacroAdAs ? 'P (Fiyat Düz.)' : 'P (Fiyat)';
  const xLabel = isMonetary ? 'M (Para Miktarı)' : isMacroAdAs ? 'Y (Reel GSYH)' : 'Q (Miktar)';
  const yEqLabel = isMonetary ? 'i*' : 'P*';
  const xEqLabel = isMonetary ? 'M*' : isMacroAdAs ? 'Y*' : 'Q*';
  const demandLabel = isMonetary ? 'Md (Para Talebi)' : isMacroAdAs ? 'AD₀ (Top. Talep)' : 'D₀ (Talep)';
  const supplyLabel = isMonetary ? 'Ms₀ (Para Arzı)' : isMacroAdAs ? 'AS₀ (Top. Arz)' : 'S₀ (Arz)';
  const shiftLabel = isMonetary ? 'Ms₁ (Likidite Artışı)' : isMacroAdAs ? 'AD₁ (Genişleme)' : 'D₁ (Talep Kayması)';
  const topAreaTag = isMonetary ? 'İşlem & İhtiyat Güdüsü' : isMacroAdAs ? 'Enflasyonist Baskı' : 'CS: Tüketici Rantı';
  const botAreaTag = isMonetary ? 'Spekülasyon / Likidite' : isMacroAdAs ? 'Hasıla Açığı' : 'PS: Üretici Rantı';
  const formulaBadge = isMonetary
    ? 'PARASAL DENGE VE LİKİDİTE MODELİ'
    : isMacroAdAs
    ? 'MAKROEKONOMİK GENEL DENGE MODELİ'
    : 'AKADEMİK DENGE MODELİ & FORMÜL';
  const formulaExpr = isMonetary
    ? 'Mˢ / P = L(Y, i)   ⟺   M · V = P · Y'
    : isMacroAdAs
    ? 'Y = C + I(r) + G + NX   ⟺   AD = AS'
    : 'Qd(P) = Qs(P)   ⟺   P*, Q*';
  const formulaNote = isMonetary
    ? 'Merkez bankası Ms arzını genişlettiğinde faiz i* düşer, likidite artar.'
    : isMacroAdAs
    ? 'Talep kayması reel hasıla Y* ve genel fiyat düzeyini P* birlikte etkiler.'
    : 'Ceteris paribus: Denge noktasında piyasa temizlenir.';

  const plotX = a.x + 56;
  const plotY = a.y + 24;
  const plotW = Math.round(a.w * 0.52);
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

  // Eksen Etiketleri
  ctx.fillStyle = '#38bdf8';
  ctx.font = font(800, 14.5);
  ctx.fillText(yLabel, plotX - 42, plotY - 6);
  ctx.fillText(xLabel, plotX + plotW - 62, plotY + plotH + 28);

  ctx.fillStyle = '#64748b';
  ctx.font = font(600, 12);
  ctx.fillText('0', plotX - 14, plotY + plotH + 16);

  const eqX = plotX + plotW * (isMonetary ? 0.44 : 0.50);
  const eqY = plotY + plotH * 0.48;

  // 2. Negatif Eğimli Eğri (Talep / Para Talebi Md)
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
      ctx.font = font(800, 13.5);
      ctx.fillText(demandLabel, dEndX - 66, dEndY + 18);
    }
  }

  // 3. Arz Eğrisi (Para Piyasasında Dikey Ms0, aksi halde Pozitif Eğimli S0)
  const sStartX = isMonetary ? eqX : plotX + 32;
  const sStartY = isMonetary ? plotY + plotH - 20 : plotY + plotH - 28;
  const sEndX = isMonetary ? eqX : plotX + plotW - 24;
  const sEndY = isMonetary ? plotY + 22 : plotY + 36;

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
      ctx.font = font(800, 13.5);
      ctx.fillText(supplyLabel, isMonetary ? sEndX - 38 : sEndX - 24, sEndY - 10);
    }
  }

  // 4. Denge Noktası (E0) ve Alan Taramaları
  const eqProg = clamp((reveal - 0.45) / 0.25);
  if (eqProg > 0) {
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

    if (!isMonetary) {
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
    }
    ctx.restore();

    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = '#34d399';
    ctx.lineWidth = 1.8;

    ctx.beginPath();
    ctx.moveTo(plotX, eqY);
    ctx.lineTo(eqX, eqY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(eqX, plotY + plotH);
    ctx.lineTo(eqX, eqY);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = '#34d399';
    ctx.font = font(800, 12.5);
    ctx.textAlign = 'right';
    ctx.fillText(yEqLabel, plotX - 8, eqY + 4);
    ctx.textAlign = 'center';
    ctx.fillText(xEqLabel, eqX, plotY + plotH + 22);
    ctx.textAlign = 'left';

    ctx.fillStyle = 'rgba(34, 211, 238, 0.85)';
    ctx.font = font(700, 11);
    ctx.fillText(topAreaTag, plotX + 14, eqY - 24);

    ctx.fillStyle = 'rgba(192, 132, 252, 0.85)';
    ctx.fillText(botAreaTag, plotX + 14, eqY + 34);

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
    ctx.font = font(800, 14);
    ctx.fillText(`E₀ (${xEqLabel}, ${yEqLabel})`, eqX + 12, eqY - 10);
  }

  // 5. Dinamik Politika Kayması (Para Arzı Ms -> Ms1 veya Talep D -> D1)
  if (reveal > 0.72) {
    const shiftProgress = clamp((reveal - 0.72) / 0.20);
    const shiftOffset = (isMonetary ? 58 : 42) * shiftProgress;

    ctx.save();
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    if (isMonetary) {
      ctx.moveTo(sStartX + shiftOffset, sStartY);
      ctx.lineTo(sEndX + shiftOffset, sEndY);
    } else {
      ctx.moveTo(dStartX + shiftOffset, dStartY);
      ctx.lineTo(dEndX + shiftOffset, dEndY);
    }
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.6;
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = '#38bdf8';
    ctx.font = font(800, 13);
    if (isMonetary) {
      ctx.fillText(shiftLabel, sEndX + shiftOffset - 46, sEndY + 18);
    } else {
      ctx.fillText(shiftLabel, dEndX + shiftOffset - 44, dEndY - 20);
    }

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

  rr(ctx, rx, a.y + 12, rw, 86, 16);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.90)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.40)';
  ctx.lineWidth = 1.4;
  ctx.stroke();

  ctx.fillStyle = '#38bdf8';
  ctx.font = font(700, 11);
  ctx.fillText(formulaBadge, rx + 18, a.y + 34);

  ctx.fillStyle = '#ffffff';
  ctx.font = font(800, 15.5);
  ctx.fillText(formulaExpr, rx + 18, a.y + 58);

  ctx.fillStyle = '#94a3b8';
  ctx.font = font(400, 12);
  ctx.fillText(wrapText(ctx, formulaNote, rw - 36, 1)[0] || '', rx + 18, a.y + 78);

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
  drawBroadcastStudioBackground(
    ctx,
    f.now,
    f.playing ? f.mouthOpen : 0,
    f.scene?.diagram?.type,
    f.sceneIndex,
  );

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
