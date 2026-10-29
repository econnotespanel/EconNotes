// EconNotes Video Stüdyosu — 1920x1080 Full HD Sinematik Sahne Çizim Motoru
// Hem canlı oynatıcı hem de 1080p MP4 dışa aktarma aynı saf çizim motorunu kullanır.

import type { StudioScene, DiagramNode, Speaker } from './sceneModel';
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
  playing: boolean;
  /** Oynatma başlamadan önceki kapak görünümü */
  poster: boolean;
  now: number;
  courseLabel: string;
  showSubtitles: boolean;
  viseme: Viseme;
  mouthOpen: number;
  inBreathPause: boolean;
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
  timeline: 'TARİHSEL AKIŞ & SÜREÇ',
  structure: 'KURUMSAL & KAVRAMSAL YAPI',
  network: 'KAVRAM İLİŞKİ AĞI',
  comparison: 'KARŞILAŞTIRMALI ANALİZ',
  curve: 'MODEL & GRAFİK ANALİZİ',
};

const BOARD = { x: 344, y: 74, w: 1232, h: 726 };
const SUB = { x: 364, y: 828, w: 1192, h: 170 };

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
  const start = 0.03 + (i / Math.max(1, n)) * 0.68;
  return easeOut((progress - start) / 0.11);
}

function activeIndex(n: number, progress: number) {
  let idx = 0;
  for (let i = 0; i < n; i++) {
    if (progress >= 0.03 + (i / Math.max(1, n)) * 0.68) idx = i;
  }
  return idx;
}

// ---------------------------------------------------------------- Stüdyo Arka Planı
function drawBroadcastStudioBackground(ctx: CanvasRenderingContext2D, now: number) {
  const bg = ctx.createLinearGradient(0, 0, 0, STAGE_H);
  bg.addColorStop(0, '#080d1a');
  bg.addColorStop(0.55, '#050812');
  bg.addColorStop(1, '#02040a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, STAGE_W, STAGE_H);

  // Mimari akustik dikey duvar panelleri (çok ince stüdyo dokusu)
  ctx.fillStyle = 'rgba(148, 163, 184, 0.018)';
  for (let x = 24; x < STAGE_W; x += 36) {
    ctx.fillRect(x, 0, 10, STAGE_H - 130);
  }

  // Yumuşak stüdyo tavan spot ışıkları (volumetric cones)
  const spots = [
    { x: 240, y: -60, r: 680, c: '34, 211, 238', a: 0.10 },
    { x: STAGE_W / 2, y: -120, r: 820, c: '59, 130, 246', a: 0.09 },
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

  // İnce yatay ufuk ışık çizgisi
  const horizonGrad = ctx.createLinearGradient(0, 0, STAGE_W, 0);
  horizonGrad.addColorStop(0, 'rgba(34, 211, 238, 0)');
  horizonGrad.addColorStop(0.25, 'rgba(34, 211, 238, 0.12)');
  horizonGrad.addColorStop(0.75, 'rgba(168, 85, 247, 0.12)');
  horizonGrad.addColorStop(1, 'rgba(168, 85, 247, 0)');
  ctx.fillStyle = horizonGrad;
  ctx.fillRect(0, 816, STAGE_W, 1.5);
}

// ---------------------------------------------------------------- Üst Yayın Bilgisi (HUD)
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

  // Sol üst yayın rozeti
  rr(ctx, 32, 22, 236, 40, 20);
  ctx.fillStyle = 'rgba(7, 11, 22, 0.78)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
  ctx.lineWidth = 1;
  ctx.stroke();

  const pulse = 0.55 + Math.sin(f.now / 360) * 0.45;
  ctx.fillStyle = f.playing ? `rgba(16, 185, 129, ${pulse})` : 'rgba(148, 163, 184, 0.65)';
  ctx.beginPath();
  ctx.arc(54, 42, 5.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#f8fafc';
  ctx.font = font(700, 15);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('EconNotes', 70, 42);
  ctx.fillStyle = '#67e8f9';
  ctx.font = font(600, 12.5);
  ctx.fillText('STÜDYO 1080p', 160, 42.5);

  // Sağ üst bölüm göstergesi
  const chLabel = `BÖLÜM ${String(f.sceneIndex + 1).padStart(2, '0')} / ${String(f.sceneCount).padStart(2, '0')}`;
  ctx.font = font(700, 13.5);
  const cw = ctx.measureText(chLabel).width + 38;
  rr(ctx, STAGE_W - 32 - cw, 22, cw, 40, 20);
  ctx.fillStyle = 'rgba(7, 11, 22, 0.78)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.28)';
  ctx.stroke();
  ctx.fillStyle = '#f1f5f9';
  ctx.textAlign = 'center';
  ctx.fillText(chLabel, STAGE_W - 32 - cw / 2, 42.5);
  ctx.textAlign = 'left';
}

// ---------------------------------------------------------------- Akıllı Tahta
interface Point {
  x: number;
  y: number;
}

type Area = { x: number; y: number; w: number; h: number };

function drawSmartBoard(ctx: CanvasRenderingContext2D, f: StageFrame): Point {
  const { x, y, w, h } = BOARD;
  const reveal = f.poster ? 1 : f.progress;
  const d = f.scene.diagram;

  // Dış yumuşak gölge + cam gövde
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.72)';
  ctx.shadowBlur = 64;
  ctx.shadowOffsetY = 24;
  rr(ctx, x, y, w, h, 30);
  ctx.fillStyle = 'rgba(10, 16, 32, 0.95)';
  ctx.fill();
  ctx.restore();

  // İnce iç cam yansıması
  const glass = ctx.createLinearGradient(x, y, x, y + h);
  glass.addColorStop(0, 'rgba(56, 189, 248, 0.06)');
  glass.addColorStop(0.35, 'rgba(15, 23, 42, 0)');
  glass.addColorStop(1, 'rgba(168, 85, 247, 0.04)');
  rr(ctx, x, y, w, h, 30);
  ctx.fillStyle = glass;
  ctx.fill();

  // Zarif çerçeve konturu
  const border = ctx.createLinearGradient(x, y, x + w, y + h);
  border.addColorStop(0, 'rgba(56, 189, 248, 0.55)');
  border.addColorStop(0.5, 'rgba(99, 102, 241, 0.28)');
  border.addColorStop(1, 'rgba(192, 132, 252, 0.45)');
  ctx.strokeStyle = border;
  ctx.lineWidth = 1.8;
  rr(ctx, x + 1, y + 1, w - 2, h - 2, 29);
  ctx.stroke();

  // Üst kategori etiketi + ders adı
  const typeLabel = TYPE_LABEL[d.type] || 'DERS ANALİZ TAHTASI';
  ctx.font = font(700, 12.5);
  const tw = ctx.measureText(typeLabel).width + 30;
  rr(ctx, x + 38, y + 28, tw, 30, 15);
  ctx.fillStyle = 'rgba(34, 211, 238, 0.14)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(34, 211, 238, 0.32)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#67e8f9';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(typeLabel, x + 53, y + 43.5);

  if (f.courseLabel) {
    ctx.font = font(500, 14);
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'right';
    const cLine = wrapText(ctx, f.courseLabel, 380, 1)[0] || '';
    ctx.fillText(cLine, x + w - 38, y + 43.5);
    ctx.textAlign = 'left';
  }

  // Ana başlık (net ve keskin tipografi)
  const titleFade = f.poster ? 1 : easeOut(clamp(f.sceneTime / 0.6));
  ctx.save();
  ctx.globalAlpha = titleFade;
  ctx.font = font(800, 33);
  ctx.fillStyle = '#f8fafc';
  ctx.textBaseline = 'alphabetic';
  const titleText = wrapText(ctx, d.title, w - 76, 1)[0] || '';
  ctx.fillText(titleText, x + 38, y + 98);
  ctx.restore();

  // İnce ayırıcı çizgi
  ctx.fillStyle = 'rgba(148, 163, 184, 0.14)';
  ctx.fillRect(x + 38, y + 118, w - 76, 1);

  // Diyagram çizim alanı
  const hasMetric = Boolean(d.metric);
  const bottomReserve = hasMetric ? 86 : 32;
  const area: Area = {
    x: x + 38,
    y: y + 138,
    w: w - 76,
    h: h - 138 - bottomReserve,
  };

  ctx.save();
  rr(ctx, area.x - 10, area.y - 10, area.w + 20, area.h + 20, 16);
  ctx.clip();

  let target: Point;
  switch (d.type) {
    case 'timeline':
      target = drawTimelineDiagram(ctx, area, d.nodes, reveal, f.now);
      break;
    case 'structure':
      target = drawStructureDiagram(ctx, area, d.rootBadge, d.nodes, reveal, f.now);
      break;
    case 'comparison':
      target = drawComparisonDiagram(ctx, area, d.nodes, reveal, f.now);
      break;
    case 'curve':
      target = drawCurveDiagram(ctx, area, d.nodes, reveal, f.now);
      break;
    default:
      target = drawNetworkDiagram(ctx, area, d.rootBadge, d.nodes, reveal, f.now);
      break;
  }
  ctx.restore();

  // Alt sınav ipucu şeridi
  const metricT = f.poster ? 1 : easeOut((reveal - 0.35) / 0.15);
  if (hasMetric && metricT > 0) {
    const my = y + h - 68 + (1 - metricT) * 14;
    ctx.save();
    ctx.globalAlpha = metricT;
    rr(ctx, x + 38, my, w - 76, 48, 14);
    const mg = ctx.createLinearGradient(x + 38, 0, x + w - 38, 0);
    mg.addColorStop(0, 'rgba(245, 158, 11, 0.16)');
    mg.addColorStop(1, 'rgba(249, 115, 22, 0.05)');
    ctx.fillStyle = mg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.42)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    rr(ctx, x + 48, my + 9, 132, 30, 9);
    ctx.fillStyle = '#f59e0b';
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.font = font(800, 12.5);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ÖNEMLİ NOT', x + 114, my + 24.5);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#fef3c7';
    ctx.font = font(600, 17.5);
    const mLine = wrapText(ctx, d.metric, w - 76 - 166, 1)[0] || '';
    ctx.fillText(mLine, x + 194, my + 25);
    ctx.restore();
  }

  return target;
}

// 1. ZAMAN ÇİZELGESİ / AŞAMALI AKIŞ
function drawTimelineDiagram(
  ctx: CanvasRenderingContext2D,
  a: Area,
  nodesIn: DiagramNode[],
  reveal: number,
  now: number,
): Point {
  const nodes = nodesIn.slice(0, 5);
  const n = Math.max(1, nodes.length);
  const slot = a.w / n;
  const lineY = a.y + 126;
  const act = activeIndex(n, reveal);
  const firstX = a.x + slot / 2;
  const lastX = a.x + slot * (n - 0.5);

  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(firstX, lineY);
  ctx.lineTo(lastX, lineY);
  ctx.stroke();

  const actX = a.x + slot * (act + 0.5);
  const nextBoost = slot * 0.5 * appearAmount(Math.min(n - 1, act + 1), n, reveal);
  const lg = ctx.createLinearGradient(firstX, 0, Math.max(firstX + 1, lastX), 0);
  lg.addColorStop(0, '#22d3ee');
  lg.addColorStop(1, '#a855f7');
  ctx.strokeStyle = lg;
  ctx.beginPath();
  ctx.moveTo(firstX, lineY);
  ctx.lineTo(Math.min(lastX, Math.max(firstX, actX + nextBoost)), lineY);
  ctx.stroke();

  nodes.forEach((nd, i) => {
    const cx = a.x + slot * (i + 0.5);
    const t = appearAmount(i, n, reveal);
    const isAct = i === act && reveal > 0.02;

    ctx.fillStyle = 'rgba(51, 65, 85, 0.85)';
    ctx.beginPath();
    ctx.arc(cx, lineY, 11, 0, Math.PI * 2);
    ctx.fill();
    if (t <= 0) return;

    const s = easeOutBack(t);
    const r = 28 * s;
    if (isAct) {
      const pr = r + 12 + Math.sin(now / 260) * 3.5;
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.35)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx, lineY, pr, 0, Math.PI * 2);
      ctx.stroke();
    }

    const [c1, c2] = PALETTE[i % PALETTE.length];
    const cg = ctx.createLinearGradient(cx - r, lineY - r, cx + r, lineY + r);
    cg.addColorStop(0, c1);
    cg.addColorStop(1, c2);
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(cx, lineY, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = t;
    ctx.fillStyle = '#08101f';
    ctx.font = font(800, 19);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1).padStart(2, '0'), cx, lineY + 1);

    // Üst başlık
    const off = (1 - t) * 18;
    ctx.fillStyle = isAct ? '#ffffff' : '#e2e8f0';
    ctx.font = font(700, 20);
    ctx.textBaseline = 'alphabetic';
    const labelLines = wrapText(ctx, nd.label, slot - 24, 2);
    const ly = lineY - 48 - (labelLines.length - 1) * 24 + off;
    drawLines(ctx, labelLines, cx, ly, 24);

    // Alt açıklama kartı
    if (nd.subtext) {
      const cardW = slot - 20;
      const cardX = cx - cardW / 2;
      const cardY = lineY + 48 + off;
      const maxCardH = a.y + a.h - cardY - 6;
      ctx.font = font(500, 16.5);
      const maxSubLines = Math.max(2, Math.floor((maxCardH - 36) / 24));
      const subLines = wrapText(ctx, nd.subtext, cardW - 32, maxSubLines);
      const cardH = Math.min(maxCardH, subLines.length * 24 + 34);

      rr(ctx, cardX, cardY, cardW, cardH, 16);
      ctx.fillStyle = isAct ? 'rgba(20, 33, 58, 0.96)' : 'rgba(15, 23, 42, 0.78)';
      ctx.fill();
      ctx.strokeStyle = isAct ? c1 : 'rgba(71, 85, 105, 0.45)';
      ctx.lineWidth = isAct ? 1.8 : 1;
      ctx.stroke();

      ctx.fillStyle = isAct ? '#f1f5f9' : '#cbd5e1';
      drawLines(ctx, subLines, cx, cardY + 30, 24);
    }
    ctx.globalAlpha = 1;
  });

  ctx.textAlign = 'left';
  return { x: actX, y: lineY };
}

// 2. KURUMSAL & KAVRAMSAL HİYERARŞİ (Başlık tekrarı olmadan!)
function drawStructureDiagram(
  ctx: CanvasRenderingContext2D,
  a: Area,
  rootBadge: string,
  nodesIn: DiagramNode[],
  reveal: number,
  now: number,
): Point {
  const nodes = nodesIn.slice(0, 4);
  const n = Math.max(1, nodes.length);
  const act = activeIndex(n, reveal);

  // Üst kök rozet (tahta başlığını tekrarlamaz; ders veya üst çerçeve adını gösterir)
  const badgeText = rootBadge.toLocaleUpperCase('tr-TR');
  ctx.font = font(700, 14);
  const rootW = Math.min(460, Math.max(240, ctx.measureText(badgeText).width + 64));
  const rootH = 48;
  const rootX = a.x + (a.w - rootW) / 2;
  const rootY = a.y + 4;

  const rg = ctx.createLinearGradient(rootX, 0, rootX + rootW, 0);
  rg.addColorStop(0, 'rgba(14, 116, 144, 0.85)');
  rg.addColorStop(1, 'rgba(67, 56, 202, 0.85)');
  rr(ctx, rootX, rootY, rootW, rootH, 24);
  ctx.fillStyle = rg;
  ctx.fill();
  ctx.strokeStyle = 'rgba(103, 232, 249, 0.45)';
  ctx.lineWidth = 1.3;
  ctx.stroke();

  ctx.fillStyle = '#f8fafc';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(wrapText(ctx, badgeText, rootW - 36, 1)[0] || '', rootX + rootW / 2, rootY + rootH / 2 + 0.5);

  const gap = 22;
  const cardW = (a.w - gap * (n - 1)) / n;
  const childY = a.y + 104;
  const childH = a.h - 110;
  const busY = rootY + rootH + 26;
  let target: Point = { x: rootX + rootW / 2, y: rootY + rootH / 2 };

  // Ana dikey hat
  ctx.strokeStyle = 'rgba(100, 116, 139, 0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(rootX + rootW / 2, rootY + rootH);
  ctx.lineTo(rootX + rootW / 2, busY);
  ctx.stroke();

  nodes.forEach((nd, i) => {
    const t = appearAmount(i, n, reveal);
    const bx = a.x + i * (cardW + gap);
    const cx = bx + cardW / 2;
    const isAct = i === act && reveal > 0.02;
    const [c1, c2] = PALETTE[i % PALETTE.length];

    // Bağlantı kolu
    ctx.strokeStyle = t > 0 ? (isAct ? c1 : 'rgba(100, 116, 139, 0.45)') : 'rgba(71, 85, 105, 0.2)';
    ctx.lineWidth = isAct ? 2.4 : 1.6;
    ctx.beginPath();
    ctx.moveTo(rootX + rootW / 2, busY);
    ctx.lineTo(cx, busY);
    ctx.lineTo(cx, childY);
    ctx.stroke();

    if (t <= 0) return;

    const lift = isAct ? -6 - Math.sin(now / 340) * 2 : 0;
    const by = childY + (1 - t) * 24 + lift;

    ctx.save();
    ctx.globalAlpha = t;
    if (isAct) {
      ctx.shadowColor = c1 + '55';
      ctx.shadowBlur = 32;
    }
    rr(ctx, bx, by, cardW, childH, 20);
    ctx.fillStyle = isAct ? 'rgba(20, 30, 54, 0.98)' : 'rgba(14, 21, 38, 0.92)';
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = isAct ? c1 : 'rgba(71, 85, 105, 0.5)';
    ctx.lineWidth = isAct ? 2 : 1;
    ctx.stroke();

    // Üst renk şeridi
    const barG = ctx.createLinearGradient(bx, 0, bx + cardW, 0);
    barG.addColorStop(0, c1);
    barG.addColorStop(1, c2);
    rr(ctx, bx, by, cardW, 6, [20, 20, 0, 0]);
    ctx.fillStyle = barG;
    ctx.fill();

    // Numara rozeti
    rr(ctx, bx + 20, by + 22, 36, 26, 8);
    ctx.fillStyle = c1 + '24';
    ctx.fill();
    ctx.fillStyle = c1;
    ctx.font = font(800, 13);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1).padStart(2, '0'), bx + 38, by + 35.5);

    // Başlık
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#f8fafc';
    ctx.font = font(700, 21);
    const ll = wrapText(ctx, nd.label, cardW - 40, 2);
    drawLines(ctx, ll, bx + 20, by + 78, 26);

    // Ayırıcı
    const sepY = by + 70 + ll.length * 26;
    ctx.fillStyle = 'rgba(148, 163, 184, 0.14)';
    ctx.fillRect(bx + 20, sepY, cardW - 40, 1);

    // Alt metin
    if (nd.subtext) {
      ctx.fillStyle = isAct ? '#e2e8f0' : '#cbd5e1';
      ctx.font = font(400, 17);
      const maxSub = Math.max(2, Math.floor((childH - (sepY - by) - 28) / 25));
      const sl = wrapText(ctx, nd.subtext, cardW - 40, maxSub);
      drawLines(ctx, sl, bx + 20, sepY + 28, 25);
    }

    ctx.restore();
    if (isAct) target = { x: cx, y: by + 50 };
  });

  ctx.textAlign = 'left';
  return target;
}

// 3. KAVRAM İLİŞKİ AĞI
function drawNetworkDiagram(
  ctx: CanvasRenderingContext2D,
  a: Area,
  rootBadge: string,
  nodesIn: DiagramNode[],
  reveal: number,
  now: number,
): Point {
  const nodes = nodesIn.slice(0, 5);
  const n = Math.max(1, nodes.length);
  const act = activeIndex(n, reveal);
  const cx = a.x + a.w / 2;
  const cy = a.y + a.h / 2;
  const rx = a.w / 2 - 190;
  const ry = a.h / 2 - 86;
  let target: Point = { x: cx, y: cy };

  const positions = nodes.map((_, i) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return {
      x: cx + Math.cos(ang) * rx,
      y: cy + Math.sin(ang) * ry,
    };
  });

  // Bağlantı eğrileri
  positions.forEach((p, i) => {
    const t = appearAmount(i, n, reveal);
    if (t <= 0) return;
    const isAct = i === act;
    const [c1] = PALETTE[i % PALETTE.length];
    ctx.save();
    ctx.globalAlpha = t;
    ctx.strokeStyle = isAct ? c1 : 'rgba(100, 116, 139, 0.45)';
    ctx.lineWidth = isAct ? 2.6 : 1.6;
    const mx = (cx + p.x) / 2;
    const my = (cy + p.y) / 2 - 18;
    const ex = cx + (p.x - cx) * t;
    const ey = cy + (p.y - cy) * t;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.quadraticCurveTo(mx, my, ex, ey);
    ctx.stroke();

    if (isAct) {
      const k = (now / 1400) % 1;
      const qx = (1 - k) * (1 - k) * cx + 2 * (1 - k) * k * mx + k * k * p.x;
      const qy = (1 - k) * (1 - k) * cy + 2 * (1 - k) * k * my + k * k * p.y;
      ctx.fillStyle = c1;
      ctx.beginPath();
      ctx.arc(qx, qy, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  });

  // Merkez çekirdek
  const hubR = 88;
  const hg = ctx.createRadialGradient(cx - 20, cy - 20, 12, cx, cy, hubR);
  hg.addColorStop(0, '#0891b2');
  hg.addColorStop(1, '#312e81');
  ctx.save();
  ctx.shadowColor = 'rgba(34, 211, 238, 0.35)';
  ctx.shadowBlur = 36;
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.arc(cx, cy, hubR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = 'rgba(165, 243, 252, 0.45)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(cx, cy, hubR + 8, now / 1400, now / 1400 + Math.PI * 1.35);
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = font(700, 16.5);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const hubLines = wrapText(ctx, rootBadge || 'Ana Konu', 144, 3);
  drawLines(ctx, hubLines, cx, cy - ((hubLines.length - 1) * 21) / 2 + 6, 21);

  // Çevre kavram kartları
  positions.forEach((p, i) => {
    const t = appearAmount(i, n, reveal);
    if (t <= 0) return;
    const nd = nodes[i];
    const isAct = i === act && reveal > 0.02;
    const [c1] = PALETTE[i % PALETTE.length];
    const cw = 330;

    ctx.font = font(700, 19);
    const ll = wrapText(ctx, nd.label, cw - 36, 2);
    ctx.font = font(400, 15.5);
    const sl = nd.subtext ? wrapText(ctx, nd.subtext, cw - 36, 3) : [];
    const ch = 30 + ll.length * 23 + (sl.length ? sl.length * 21 + 10 : 0);

    const bx = clamp(p.x - cw / 2, a.x, a.x + a.w - cw);
    const by = clamp(p.y - ch / 2, a.y, a.y + a.h - ch);
    const s = 0.85 + 0.15 * easeOutBack(t);

    ctx.save();
    ctx.globalAlpha = t;
    ctx.translate(bx + cw / 2, by + ch / 2);
    ctx.scale(s, s);
    ctx.translate(-(bx + cw / 2), -(by + ch / 2));

    if (isAct) {
      ctx.shadowColor = c1 + '55';
      ctx.shadowBlur = 28;
    }
    rr(ctx, bx, by, cw, ch, 16);
    ctx.fillStyle = isAct ? 'rgba(20, 30, 54, 0.98)' : 'rgba(13, 20, 37, 0.94)';
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = isAct ? c1 : 'rgba(71, 85, 105, 0.55)';
    ctx.lineWidth = isAct ? 2 : 1;
    ctx.stroke();

    rr(ctx, bx + 8, by + 14, 4, ch - 28, 2);
    ctx.fillStyle = c1;
    ctx.fill();

    ctx.textAlign = 'left';
    ctx.fillStyle = '#f8fafc';
    ctx.font = font(700, 19);
    drawLines(ctx, ll, bx + 22, by + 32, 23);

    if (sl.length) {
      ctx.fillStyle = '#cbd5e1';
      ctx.font = font(400, 15.5);
      drawLines(ctx, sl, bx + 22, by + 40 + ll.length * 23, 21);
    }
    ctx.restore();

    if (isAct) target = { x: bx + cw / 2, y: by + ch / 2 };
  });

  ctx.textAlign = 'left';
  return target;
}

// 4. KARŞILAŞTIRMALI ANALİZ SÜTUNLARI
function drawComparisonDiagram(
  ctx: CanvasRenderingContext2D,
  a: Area,
  nodesIn: DiagramNode[],
  reveal: number,
  now: number,
): Point {
  const nodes = nodesIn.slice(0, 4);
  const n = Math.max(1, nodes.length);
  const act = activeIndex(n, reveal);
  const gap = n === 2 ? 78 : 24;
  const colW = (a.w - gap * (n - 1)) / n;
  const colH = a.h - 8;
  let target: Point = { x: a.x + a.w / 2, y: a.y + a.h / 2 };

  nodes.forEach((nd, i) => {
    const t = appearAmount(i, n, reveal);
    if (t <= 0) return;
    const isAct = i === act && reveal > 0.02;
    const x = a.x + i * (colW + gap);
    const y = a.y + (1 - t) * 26 + (isAct ? -5 - Math.sin(now / 340) * 2 : 0);
    const [c1, c2] = PALETTE[i % PALETTE.length];

    ctx.save();
    ctx.globalAlpha = t;
    if (isAct) {
      ctx.shadowColor = c1 + '55';
      ctx.shadowBlur = 30;
    }
    rr(ctx, x, y, colW, colH, 20);
    ctx.fillStyle = 'rgba(14, 21, 38, 0.96)';
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = isAct ? c1 : 'rgba(71, 85, 105, 0.55)';
    ctx.lineWidth = isAct ? 2 : 1;
    ctx.stroke();

    const hg = ctx.createLinearGradient(x, y, x + colW, y + 82);
    hg.addColorStop(0, c1 + '38');
    hg.addColorStop(1, c2 + '18');
    rr(ctx, x, y, colW, 82, [20, 20, 0, 0]);
    ctx.fillStyle = hg;
    ctx.fill();

    rr(ctx, x, y, colW, 5, [20, 20, 0, 0]);
    ctx.fillStyle = c1;
    ctx.fill();

    ctx.fillStyle = '#f8fafc';
    ctx.font = font(700, 22);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const ll = wrapText(ctx, nd.label, colW - 44, 2);
    drawLines(ctx, ll, x + 22, y + (ll.length === 1 ? 50 : 38), 26);

    if (nd.subtext) {
      ctx.fillStyle = '#e2e8f0';
      ctx.font = font(400, 18);
      const maxLines = Math.max(2, Math.floor((colH - 120) / 27));
      drawLines(ctx, wrapText(ctx, nd.subtext, colW - 44, maxLines), x + 22, y + 122, 27);
    }
    ctx.restore();
    if (isAct) target = { x: x + colW / 2, y: y + 44 };
  });

  if (n === 2 && appearAmount(1, n, reveal) > 0.2) {
    const vx = a.x + colW + gap / 2;
    const vy = a.y + colH / 2;
    ctx.save();
    rr(ctx, vx - 28, vy - 28, 56, 56, 28);
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.65)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#fbbf24';
    ctx.font = font(800, 17);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('VS', vx, vy + 1);
    ctx.restore();
  }

  ctx.textAlign = 'left';
  return target;
}

// 5. EKONOMİK EĞRİ & MODEL GRAFİĞİ
function drawCurveDiagram(
  ctx: CanvasRenderingContext2D,
  a: Area,
  nodesIn: DiagramNode[],
  reveal: number,
  now: number,
): Point {
  const nodes = nodesIn.slice(0, 4);
  const n = Math.max(1, nodes.length);
  const act = activeIndex(n, reveal);
  const gx = a.x + 54;
  const gy = a.y + 18;
  const gw = a.w * 0.52;
  const gh = a.h - 54;
  const ox = gx;
  const oy = gy + gh;

  // Izgara çizgileri
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.1)';
  ctx.lineWidth = 1;
  for (let i = 1; i <= 4; i++) {
    const py = gy + (gh / 5) * i;
    const px = ox + (gw / 5) * i;
    ctx.beginPath();
    ctx.moveTo(ox, py);
    ctx.lineTo(ox + gw, py);
    ctx.moveTo(px, gy);
    ctx.lineTo(px, oy);
    ctx.stroke();
  }

  // Eksenler
  ctx.strokeStyle = 'rgba(226, 232, 240, 0.78)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(ox, gy);
  ctx.lineTo(ox, oy);
  ctx.lineTo(ox + gw, oy);
  ctx.stroke();

  ctx.fillStyle = '#cbd5e1';
  ctx.font = font(700, 16);
  ctx.fillText('Fiyat (P)', ox - 44, gy - 4);
  ctx.fillText('Miktar (Q)', ox + gw - 74, oy + 32);

  const curves = [
    { color: '#22d3ee', f: (u: number) => oy - gh * (0.14 + 0.72 * u) },
    { color: '#f472b6', f: (u: number) => oy - gh * (0.86 - 0.72 * u) },
  ];

  curves.forEach((c, ci) => {
    const t = ci < n ? appearAmount(ci, n, reveal) : 0;
    if (t <= 0) return;
    ctx.strokeStyle = c.color;
    ctx.lineWidth = 4.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    const steps = 48;
    for (let s = 0; s <= steps * t; s++) {
      const u = s / steps;
      const px = ox + 36 + u * (gw - 72);
      const py = c.f(u);
      if (s === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    if (t > 0.85 && nodes[ci]) {
      ctx.fillStyle = c.color;
      ctx.font = font(700, 16);
      const lbl = wrapText(ctx, nodes[ci].label, 190, 1)[0] || '';
      ctx.fillText(lbl, ox + gw - 180, c.f(1) + (ci === 0 ? -14 : 26));
    }
  });

  let target: Point = { x: ox + gw / 2, y: oy - gh / 2 };
  if (n >= 2 && appearAmount(1, n, reveal) > 0.85) {
    const ex = ox + 36 + 0.5 * (gw - 72);
    const ey = oy - gh * 0.5;
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.55)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex, oy);
    ctx.moveTo(ex, ey);
    ctx.lineTo(ox, ey);
    ctx.stroke();
    ctx.setLineDash([]);

    const pr = 9 + Math.sin(now / 240) * 2.5;
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(ex, ey, pr, 0, Math.PI * 2);
    ctx.fill();
    target = { x: ex, y: ey };
  }

  // Sağ açıklama kartları
  const lx = a.x + a.w * 0.58;
  const lw = a.w * 0.42;
  let ly = a.y + 12;
  nodes.forEach((nd, i) => {
    const t = appearAmount(i, n, reveal);
    if (t <= 0) return;
    const isAct = i === act && reveal > 0.02;
    const [c1] = PALETTE[i % PALETTE.length];

    ctx.save();
    ctx.globalAlpha = t;
    ctx.font = font(400, 15.5);
    const sl = nd.subtext ? wrapText(ctx, nd.subtext, lw - 42, 2) : [];
    const ch = 42 + sl.length * 22;

    rr(ctx, lx + (1 - t) * 18, ly, lw, ch, 14);
    ctx.fillStyle = isAct ? 'rgba(20, 33, 58, 0.95)' : 'rgba(15, 23, 42, 0.78)';
    ctx.fill();
    ctx.strokeStyle = isAct ? c1 : 'rgba(71, 85, 105, 0.45)';
    ctx.stroke();

    ctx.fillStyle = c1;
    ctx.beginPath();
    ctx.arc(lx + 18, ly + 22, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#f8fafc';
    ctx.font = font(700, 17.5);
    ctx.fillText(wrapText(ctx, nd.label, lw - 48, 1)[0] || '', lx + 32, ly + 27);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = font(400, 15.5);
    drawLines(ctx, sl, lx + 32, ly + 52, 22);
    ctx.restore();
    ly += ch + 12;
  });

  return target;
}

// ---------------------------------------------------------------- Altyazı (Teleprompter)
function drawCinemaSubtitles(ctx: CanvasRenderingContext2D, f: StageFrame) {
  const sc = f.scene;
  const accent = SPEAKER_COLOR[sc.speaker];
  const { x, y, w, h } = SUB;

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
  ctx.shadowBlur = 36;
  rr(ctx, x, y, w, h, 22);
  ctx.fillStyle = 'rgba(6, 10, 20, 0.92)';
  ctx.fill();
  ctx.restore();

  rr(ctx, x, y, w, h, 22);
  ctx.strokeStyle = accent + '55';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  rr(ctx, x + 10, y + 20, 4, h - 40, 2);
  ctx.fillStyle = accent;
  ctx.fill();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = font(700, 14);
  ctx.fillStyle = accent;
  const spkTitle = sc.speaker === 'Deniz' ? 'DR. DENİZ' : 'BARIŞ';
  ctx.fillText(spkTitle, x + 28, y + 34);

  ctx.font = font(500, 13);
  ctx.fillStyle = 'rgba(148, 163, 184, 0.85)';
  ctx.textAlign = 'right';
  ctx.fillText(
    `Cümle ${Math.min(f.sentenceIndex + 1, sc.sentences.length)} / ${sc.sentences.length}`,
    x + w - 26,
    y + 34,
  );
  ctx.textAlign = 'left';

  const sentence = sc.sentences[f.sentenceIndex] || sc.narration;
  ctx.font = font(600, 26);
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
    const ly = y + 74 + li * 36;
    line.forEach(({ word, start }) => {
      const end = start + word.length;
      const isCurrentWord = !f.poster && f.playing && f.charInSentence >= start && f.charInSentence <= end + 1;
      const spoken = f.poster ? true : start <= f.charInSentence;

      if (isCurrentWord) {
        ctx.fillStyle = '#ffffff';
      } else if (spoken) {
        ctx.fillStyle = '#f1f5f9';
      } else {
        ctx.fillStyle = 'rgba(148, 163, 184, 0.52)';
      }
      ctx.fillText(word, lx, ly);
      lx += ctx.measureText(word).width + spaceW;
    });
  });
}

// ---------------------------------------------------------------- Bölüm Geçiş Bandı
function drawChapterIntroOverlay(ctx: CanvasRenderingContext2D, f: StageFrame) {
  if (f.poster || f.sceneTime > 0.95) return;
  const t = f.sceneTime / 0.95;
  const alpha = t < 0.2 ? t / 0.2 : t > 0.72 ? (1 - t) / 0.28 : 1;
  const yShift = (1 - easeOut(t / 0.35)) * 18;

  ctx.save();
  ctx.globalAlpha = clamp(alpha) * 0.96;
  const bw = 960;
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
  ctx.font = font(700, 14.5);
  const spk = f.scene.speaker === 'Deniz' ? 'DR. DENİZ' : 'BARIŞ';
  ctx.fillText(`BÖLÜM ${String(f.sceneIndex + 1).padStart(2, '0')}  ·  ${spk}`, STAGE_W / 2, by + 46);

  ctx.fillStyle = '#ffffff';
  ctx.font = font(800, 32);
  ctx.fillText(wrapText(ctx, f.scene.title, bw - 80, 1)[0] || '', STAGE_W / 2, by + 92);
  ctx.restore();
  ctx.textAlign = 'left';
}

export function renderStage(ctx: CanvasRenderingContext2D, f: StageFrame) {
  ctx.save();
  drawBroadcastStudioBackground(ctx, f.now);

  const denizSpeaks = f.playing && f.scene.speaker === 'Deniz';
  const barisSpeaks = f.playing && f.scene.speaker === 'Barış';

  const target = drawSmartBoard(ctx, f);

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

  if (f.showSubtitles) {
    drawCinemaSubtitles(ctx, f);
  }

  drawBroadcastHud(ctx, f);
  drawChapterIntroOverlay(ctx, f);
  ctx.restore();
}
