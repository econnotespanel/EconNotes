// EconNotes Video Stüdyosu — sinematik sahne çizim motoru (Canvas 2D).
// Saf fonksiyonlar: aynı girdi → aynı kare. Hem canlı oynatıcı hem de video
// dışa aktarma bu motoru kullanır. Koordinat sistemi daima 1280x720'dir.

import type { StudioScene, DiagramNode, Speaker } from './sceneModel';

export const STAGE_W = 1280;
export const STAGE_H = 720;

export interface FloatingReaction {
  id: number;
  emoji: string;
  x: number;
  born: number;
  drift: number;
}

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
  /** Oynatma başlamadan önceki kapak görünümü: diyagram tamamen açık */
  poster: boolean;
  now: number;
  courseLabel: string;
  showSubtitles: boolean;
  reactions: FloatingReaction[];
}

const FONT = 'Inter, "Segoe UI", system-ui, -apple-system, sans-serif';
const PALETTE = [
  ['#22d3ee', '#3b82f6'],
  ['#a78bfa', '#7c3aed'],
  ['#f472b6', '#e11d48'],
  ['#34d399', '#059669'],
  ['#fbbf24', '#f97316'],
  ['#60a5fa', '#6366f1'],
];
const SPEAKER_COLOR: Record<Speaker, string> = { Deniz: '#22d3ee', Barış: '#fb7185' };
const TYPE_LABEL: Record<string, string> = {
  timeline: 'ZAMAN ÇİZELGESİ',
  structure: 'KURUMSAL YAPI',
  network: 'KAVRAM HARİTASI',
  comparison: 'KARŞILAŞTIRMA',
  curve: 'GRAFİK ANALİZİ',
};

const BOARD = { x: 252, y: 70, w: 776, h: 470 };
const SUB = { x: 262, y: 556, w: 756, h: 134 };

// ---------------------------------------------------------------- helpers
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t), 3);
const easeOutBack = (t: number) => {
  const c1 = 1.70158;
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

export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = (text || '').split(' ').filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = words[i];
      if (lines.length === maxLines) {
        line = '';
        // kalan kelimeler var → son satıra üç nokta
        let last = lines[maxLines - 1];
        while (ctx.measureText(`${last}…`).width > maxWidth && last.length > 1) last = last.slice(0, -1);
        lines[maxLines - 1] = `${last.trimEnd()}…`;
        return lines;
      }
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  // tek kelime bile sığmıyorsa kırp
  return lines.map(l => {
    if (ctx.measureText(l).width <= maxWidth) return l;
    let cut = l;
    while (ctx.measureText(`${cut}…`).width > maxWidth && cut.length > 1) cut = cut.slice(0, -1);
    return `${cut}…`;
  });
}

function drawLines(ctx: CanvasRenderingContext2D, lines: string[], x: number, y: number, lineH: number) {
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineH));
}

/** Düğüm i'nin anlatım ilerlemesine göre görünme miktarı */
function appearAmount(i: number, n: number, progress: number) {
  const start = 0.04 + (i / Math.max(1, n)) * 0.72;
  return easeOut((progress - start) / 0.09);
}

function activeIndex(n: number, progress: number) {
  let idx = 0;
  for (let i = 0; i < n; i++) {
    if (progress >= 0.04 + (i / Math.max(1, n)) * 0.72) idx = i;
  }
  return idx;
}

// ---------------------------------------------------------------- background
function drawBackground(ctx: CanvasRenderingContext2D, now: number) {
  const g = ctx.createLinearGradient(0, 0, 0, STAGE_H);
  g.addColorStop(0, '#070b1c');
  g.addColorStop(0.6, '#050816');
  g.addColorStop(1, '#020309');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, STAGE_W, STAGE_H);

  const orbs = [
    { x: 180, y: 150, r: 420, c: '34,211,238', a: 0.13 },
    { x: 1100, y: 170, r: 460, c: '168,85,247', a: 0.13 },
    { x: 640, y: 760, r: 560, c: '59,130,246', a: 0.10 },
  ];
  orbs.forEach((o, i) => {
    const ox = o.x + Math.sin(now / 5200 + i * 2) * 60;
    const oy = o.y + Math.cos(now / 6100 + i) * 40;
    const rg = ctx.createRadialGradient(ox, oy, 0, ox, oy, o.r);
    rg.addColorStop(0, `rgba(${o.c},${o.a})`);
    rg.addColorStop(1, `rgba(${o.c},0)`);
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, STAGE_W, STAGE_H);
  });

  // perspektif zemin ızgarası
  ctx.save();
  const horizon = 548;
  const vpX = STAGE_W / 2;
  ctx.beginPath();
  ctx.rect(0, horizon, STAGE_W, STAGE_H - horizon);
  ctx.clip();
  ctx.strokeStyle = 'rgba(56,189,248,0.10)';
  ctx.lineWidth = 1;
  for (let i = -14; i <= 14; i++) {
    ctx.beginPath();
    ctx.moveTo(vpX + i * 18, horizon);
    ctx.lineTo(vpX + i * 160, STAGE_H);
    ctx.stroke();
  }
  const shift = (now / 1400) % 1;
  for (let k = 0; k < 9; k++) {
    const t = (k + shift) / 9;
    const y = horizon + Math.pow(t, 2.1) * (STAGE_H - horizon);
    ctx.globalAlpha = 0.25 + t * 0.6;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(STAGE_W, y);
    ctx.stroke();
  }
  ctx.restore();

  // yıldız tozu
  for (let i = 0; i < 46; i++) {
    const seed = i * 97.13;
    const speed = 8 + (i % 7) * 4;
    const x = (seed * 13.7) % STAGE_W + Math.sin(now / 3000 + i) * 6;
    const y = STAGE_H - (((now / 1000) * speed + seed * 7) % (STAGE_H + 40)) + 20;
    const r = 0.8 + (i % 4) * 0.5;
    ctx.fillStyle = i % 3 === 0 ? 'rgba(167,139,250,0.55)' : 'rgba(103,232,249,0.5)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawVignette(ctx: CanvasRenderingContext2D) {
  const v = ctx.createRadialGradient(STAGE_W / 2, STAGE_H / 2, STAGE_H * 0.45, STAGE_W / 2, STAGE_H / 2, STAGE_W * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, STAGE_W, STAGE_H);
}

// ---------------------------------------------------------------- HUD
function drawHud(ctx: CanvasRenderingContext2D, f: StageFrame) {
  // üst ilerleme çizgisi
  ctx.fillStyle = 'rgba(148,163,184,0.15)';
  ctx.fillRect(0, 0, STAGE_W, 4);
  const pg = ctx.createLinearGradient(0, 0, STAGE_W, 0);
  pg.addColorStop(0, '#22d3ee');
  pg.addColorStop(1, '#a855f7');
  ctx.fillStyle = pg;
  ctx.fillRect(0, 0, STAGE_W * clamp(f.overall), 4);

  // marka
  rr(ctx, 22, 20, 200, 34, 17);
  ctx.fillStyle = 'rgba(2,6,23,0.7)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(148,163,184,0.25)';
  ctx.lineWidth = 1;
  ctx.stroke();
  const pulse = 0.55 + Math.sin(f.now / 300) * 0.45;
  ctx.fillStyle = f.playing ? `rgba(244,63,94,${pulse})` : 'rgba(148,163,184,0.8)';
  ctx.beginPath();
  ctx.arc(42, 37, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f8fafc';
  ctx.font = font(800, 13);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('EconNotes', 56, 37);
  ctx.fillStyle = '#67e8f9';
  ctx.font = font(700, 11);
  ctx.fillText('CANLI DERS', 136, 37.5);

  // sağ üst bölüm sayacı
  const label = `BÖLÜM ${String(f.sceneIndex + 1).padStart(2, '0')} / ${String(f.sceneCount).padStart(2, '0')}`;
  ctx.font = font(800, 12);
  const lw = ctx.measureText(label).width + 30;
  rr(ctx, STAGE_W - 22 - lw, 20, lw, 34, 17);
  ctx.fillStyle = 'rgba(2,6,23,0.7)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(34,211,238,0.35)';
  ctx.stroke();
  ctx.fillStyle = '#e2e8f0';
  ctx.textAlign = 'center';
  ctx.fillText(label, STAGE_W - 22 - lw / 2, 37.5);

  if (f.courseLabel) {
    ctx.font = font(600, 11);
    ctx.fillStyle = 'rgba(148,163,184,0.9)';
    ctx.textAlign = 'right';
    const course = wrapText(ctx, f.courseLabel, 260, 1)[0] || '';
    ctx.fillText(course, STAGE_W - 24, 66);
  }
  ctx.textAlign = 'left';
}

// ---------------------------------------------------------------- board
interface Point { x: number; y: number }

function drawBoard(ctx: CanvasRenderingContext2D, f: StageFrame): Point {
  const { x, y, w, h } = BOARD;
  const reveal = f.poster ? 1 : f.progress;
  const d = f.scene.diagram;

  // gölge + cam panel
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.65)';
  ctx.shadowBlur = 50;
  ctx.shadowOffsetY = 20;
  rr(ctx, x, y, w, h, 26);
  ctx.fillStyle = 'rgba(10,16,34,0.94)';
  ctx.fill();
  ctx.restore();

  const sheen = ctx.createLinearGradient(x, y, x, y + h);
  sheen.addColorStop(0, 'rgba(56,189,248,0.07)');
  sheen.addColorStop(0.4, 'rgba(56,189,248,0.0)');
  sheen.addColorStop(1, 'rgba(168,85,247,0.05)');
  rr(ctx, x, y, w, h, 26);
  ctx.fillStyle = sheen;
  ctx.fill();

  const border = ctx.createLinearGradient(x, y, x + w, y + h);
  border.addColorStop(0, 'rgba(34,211,238,0.85)');
  border.addColorStop(0.5, 'rgba(99,102,241,0.45)');
  border.addColorStop(1, 'rgba(236,72,153,0.7)');
  ctx.strokeStyle = border;
  ctx.lineWidth = 2;
  rr(ctx, x + 1, y + 1, w - 2, h - 2, 25);
  ctx.stroke();

  // köşe parıltısı (dolaşan ışık)
  const orbitT = (f.now / 4000) % 1;
  const perim = orbitT * 4;
  let gx = x, gy = y;
  if (perim < 1) { gx = x + w * perim; gy = y; } else if (perim < 2) { gx = x + w; gy = y + h * (perim - 1); } else if (perim < 3) { gx = x + w * (3 - perim); gy = y + h; } else { gx = x; gy = y + h * (4 - perim); }
  const glow = ctx.createRadialGradient(gx, gy, 0, gx, gy, 60);
  glow.addColorStop(0, 'rgba(103,232,249,0.55)');
  glow.addColorStop(1, 'rgba(103,232,249,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(gx - 60, gy - 60, 120, 120);

  // başlık bandı
  const typeLabel = TYPE_LABEL[d.type] || 'AKILLI TAHTA';
  ctx.font = font(800, 11);
  const tw = ctx.measureText(typeLabel).width + 26;
  rr(ctx, x + 26, y + 22, tw, 24, 12);
  const chipG = ctx.createLinearGradient(x + 26, 0, x + 26 + tw, 0);
  chipG.addColorStop(0, 'rgba(34,211,238,0.22)');
  chipG.addColorStop(1, 'rgba(168,85,247,0.22)');
  ctx.fillStyle = chipG;
  ctx.fill();
  ctx.fillStyle = '#a5f3fc';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(typeLabel, x + 39, y + 34.5);

  // daktilo efektli tahta başlığı
  const typeT = f.poster ? 1 : clamp((f.sceneTime - 0.7) / 1.3);
  ctx.font = font(800, 26);
  ctx.fillStyle = '#f8fafc';
  const titleLines = wrapText(ctx, d.title, w - 60, 1);
  const fullTitle = titleLines[0] || '';
  const shown = fullTitle.slice(0, Math.ceil(fullTitle.length * typeT));
  ctx.fillText(shown, x + 26, y + 72);
  if (typeT < 1 && Math.floor(f.now / 350) % 2 === 0) {
    const cw = ctx.measureText(shown).width;
    ctx.fillStyle = '#22d3ee';
    ctx.fillRect(x + 28 + cw, y + 58, 3, 28);
  }

  // ayırıcı + parlama
  ctx.fillStyle = 'rgba(148,163,184,0.16)';
  ctx.fillRect(x + 26, y + 98, w - 52, 1);
  const shimmerX = x + 26 + ((f.now / 2200) % 1) * (w - 52);
  const sh = ctx.createLinearGradient(shimmerX - 80, 0, shimmerX + 80, 0);
  sh.addColorStop(0, 'rgba(34,211,238,0)');
  sh.addColorStop(0.5, 'rgba(34,211,238,0.9)');
  sh.addColorStop(1, 'rgba(34,211,238,0)');
  ctx.fillStyle = sh;
  ctx.fillRect(shimmerX - 80, y + 98, 160, 1.5);

  // diyagram alanı
  const area = { x: x + 26, y: y + 114, w: w - 52, h: h - 114 - 70 };
  ctx.save();
  rr(ctx, area.x - 6, area.y - 6, area.w + 12, area.h + 12, 12);
  ctx.clip();
  let target: Point;
  switch (d.type) {
    case 'timeline': target = drawTimeline(ctx, area, d.nodes, reveal, f.now); break;
    case 'structure': target = drawStructure(ctx, area, d.title, d.nodes, reveal, f.now); break;
    case 'comparison': target = drawComparison(ctx, area, d.nodes, reveal, f.now); break;
    case 'curve': target = drawCurve(ctx, area, d.nodes, reveal, f.now); break;
    default: target = drawNetwork(ctx, area, d.title, d.nodes, reveal, f.now);
  }
  ctx.restore();

  // sınav notu bandı
  const metricT = f.poster ? 1 : easeOut((reveal - 0.5) / 0.12);
  if (d.metric && metricT > 0) {
    const my = y + h - 56 + (1 - metricT) * 20;
    ctx.save();
    ctx.globalAlpha = metricT;
    rr(ctx, x + 26, my, w - 52, 40, 12);
    const mg = ctx.createLinearGradient(x + 26, 0, x + w - 26, 0);
    mg.addColorStop(0, 'rgba(251,191,36,0.22)');
    mg.addColorStop(1, 'rgba(249,115,22,0.08)');
    ctx.fillStyle = mg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(251,191,36,0.55)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    rr(ctx, x + 34, my + 8, 104, 24, 8);
    ctx.fillStyle = '#f59e0b';
    ctx.fill();
    ctx.fillStyle = '#1c1917';
    ctx.font = font(900, 11);
    ctx.textAlign = 'center';
    ctx.fillText('★ SINAV NOTU', x + 86, my + 20.5);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fef3c7';
    ctx.font = font(600, 15);
    const mLine = wrapText(ctx, d.metric, w - 52 - 130, 1)[0] || '';
    ctx.fillText(mLine, x + 150, my + 20.5);
    ctx.restore();
  }

  return target;
}

type Area = { x: number; y: number; w: number; h: number };

function drawTimeline(ctx: CanvasRenderingContext2D, a: Area, nodesIn: DiagramNode[], reveal: number, now: number): Point {
  const nodes = nodesIn.slice(0, 5);
  const n = nodes.length;
  const slot = a.w / n;
  const lineY = a.y + 92;
  const act = activeIndex(n, reveal);
  const firstX = a.x + slot / 2;
  const lastX = a.x + slot * (n - 0.5);

  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(148,163,184,0.22)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(firstX, lineY);
  ctx.lineTo(lastX, lineY);
  ctx.stroke();

  const actX = a.x + slot * (act + 0.5);
  const fillTo = firstX + (actX - firstX) * 1 + slot * 0.5 * appearAmount(Math.min(n - 1, act + 1), n, reveal);
  const lg = ctx.createLinearGradient(firstX, 0, lastX, 0);
  lg.addColorStop(0, '#22d3ee');
  lg.addColorStop(1, '#a855f7');
  ctx.strokeStyle = lg;
  ctx.beginPath();
  ctx.moveTo(firstX, lineY);
  ctx.lineTo(Math.min(lastX, Math.max(firstX, fillTo)), lineY);
  ctx.stroke();

  nodes.forEach((nd, i) => {
    const cx = a.x + slot * (i + 0.5);
    const t = appearAmount(i, n, reveal);
    const isAct = i === act && reveal > 0.02;
    // hayalet nokta
    ctx.fillStyle = 'rgba(51,65,85,0.8)';
    ctx.beginPath();
    ctx.arc(cx, lineY, 9, 0, Math.PI * 2);
    ctx.fill();
    if (t <= 0) return;

    const s = easeOutBack(t);
    const r = 24 * s;
    if (isAct) {
      const pr = r + 10 + Math.sin(now / 220) * 4;
      ctx.strokeStyle = 'rgba(34,211,238,0.35)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, lineY, pr, 0, Math.PI * 2);
      ctx.stroke();
    }
    const cg = ctx.createLinearGradient(cx - r, lineY - r, cx + r, lineY + r);
    cg.addColorStop(0, PALETTE[i % PALETTE.length][0]);
    cg.addColorStop(1, PALETTE[i % PALETTE.length][1]);
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(cx, lineY, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0b1120';
    ctx.font = font(900, 17);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = t;
    ctx.fillText(String(i + 1), cx, lineY + 1);

    // üst etiket
    const off = (1 - t) * 16;
    ctx.fillStyle = isAct ? '#ffffff' : '#e2e8f0';
    ctx.font = font(800, 17);
    ctx.textBaseline = 'alphabetic';
    const labelLines = wrapText(ctx, nd.label, slot - 18, 2);
    const ly = lineY - 40 - (labelLines.length - 1) * 20 + off;
    drawLines(ctx, labelLines, cx, ly, 20);

    // alt kart
    if (nd.subtext) {
      ctx.font = font(500, 13.5);
      const subLines = wrapText(ctx, nd.subtext, slot - 26, 5);
      const cardH = subLines.length * 18 + 20;
      const cardY = lineY + 40 + off;
      rr(ctx, cx - (slot - 14) / 2, cardY, slot - 14, cardH, 12);
      ctx.fillStyle = isAct ? 'rgba(34,211,238,0.12)' : 'rgba(30,41,59,0.6)';
      ctx.fill();
      ctx.strokeStyle = isAct ? 'rgba(34,211,238,0.6)' : 'rgba(71,85,105,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = isAct ? '#e0f2fe' : '#cbd5e1';
      drawLines(ctx, subLines, cx, cardY + 23, 18);
    }
    ctx.globalAlpha = 1;
  });
  ctx.textAlign = 'left';
  return { x: actX, y: lineY };
}

function drawStructure(ctx: CanvasRenderingContext2D, a: Area, title: string, nodesIn: DiagramNode[], reveal: number, now: number): Point {
  const nodes = nodesIn.slice(0, 5);
  const n = nodes.length;
  const act = activeIndex(n, reveal);
  const rootW = Math.min(440, a.w - 40);
  const rootX = a.x + (a.w - rootW) / 2;
  const rootY = a.y + 2;
  const rootH = 50;

  const rg = ctx.createLinearGradient(rootX, 0, rootX + rootW, 0);
  rg.addColorStop(0, '#0891b2');
  rg.addColorStop(1, '#4f46e5');
  ctx.save();
  ctx.shadowColor = 'rgba(34,211,238,0.45)';
  ctx.shadowBlur = 24;
  rr(ctx, rootX, rootY, rootW, rootH, 14);
  ctx.fillStyle = rg;
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#fff';
  ctx.font = font(800, 17);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(wrapText(ctx, title, rootW - 30, 1)[0] || '', rootX + rootW / 2, rootY + rootH / 2 + 1);

  const slot = a.w / n;
  const childY = a.y + 110;
  const childH = Math.min(178, a.h - 112);
  const busY = rootY + rootH + 28;
  let target: Point = { x: rootX + rootW / 2, y: rootY + rootH / 2 };

  nodes.forEach((nd, i) => {
    const t = appearAmount(i, n, reveal);
    const cx = a.x + slot * (i + 0.5);
    const isAct = i === act && reveal > 0.02;
    // bağlantı
    ctx.strokeStyle = 'rgba(100,116,139,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(rootX + rootW / 2, rootY + rootH);
    ctx.lineTo(rootX + rootW / 2, busY);
    ctx.lineTo(cx, busY);
    ctx.lineTo(cx, childY);
    ctx.stroke();
    if (t <= 0) return;
    ctx.strokeStyle = PALETTE[i % PALETTE.length][0];
    ctx.lineWidth = 2.5;
    ctx.setLineDash([7, 7]);
    ctx.lineDashOffset = -now / 40;
    ctx.globalAlpha = t;
    ctx.beginPath();
    ctx.moveTo(rootX + rootW / 2, busY);
    ctx.lineTo(cx, busY);
    ctx.lineTo(cx, childY);
    ctx.stroke();
    ctx.setLineDash([]);

    const bw = slot - 14;
    const lift = isAct ? -6 - Math.sin(now / 300) * 2 : 0;
    const by = childY + (1 - t) * 24 + lift;
    const bx = cx - bw / 2;
    ctx.save();
    if (isAct) {
      ctx.shadowColor = PALETTE[i % PALETTE.length][0];
      ctx.shadowBlur = 26;
    }
    rr(ctx, bx, by, bw, childH, 14);
    ctx.fillStyle = isAct ? 'rgba(30,41,59,0.98)' : 'rgba(22,30,50,0.92)';
    ctx.fill();
    ctx.restore();
    rr(ctx, bx, by, bw, childH, 14);
    ctx.strokeStyle = isAct ? PALETTE[i % PALETTE.length][0] : 'rgba(71,85,105,0.6)';
    ctx.lineWidth = isAct ? 2 : 1;
    ctx.stroke();
    rr(ctx, bx, by, bw, 6, [14, 14, 0, 0]);
    ctx.fillStyle = PALETTE[i % PALETTE.length][0];
    ctx.fill();

    ctx.fillStyle = '#f8fafc';
    ctx.font = font(800, 15.5);
    ctx.textBaseline = 'alphabetic';
    const ll = wrapText(ctx, nd.label, bw - 20, 2);
    drawLines(ctx, ll, cx, by + 32, 19);
    if (nd.subtext) {
      ctx.fillStyle = '#cbd5e1';
      ctx.font = font(500, 12.5);
      const maxLines = Math.max(2, Math.floor((childH - 50 - ll.length * 19) / 17));
      drawLines(ctx, wrapText(ctx, nd.subtext, bw - 20, maxLines), cx, by + 40 + ll.length * 19, 17);
    }
    ctx.globalAlpha = 1;
    if (isAct) target = { x: cx, y: by + 40 };
  });
  ctx.textAlign = 'left';
  return target;
}

function drawNetwork(ctx: CanvasRenderingContext2D, a: Area, title: string, nodesIn: DiagramNode[], reveal: number, now: number): Point {
  const nodes = nodesIn.slice(0, 6);
  const n = nodes.length;
  const act = activeIndex(n, reveal);
  const cx = a.x + a.w / 2;
  const cy = a.y + a.h / 2;
  const rx = a.w / 2 - 112;
  const ry = a.h / 2 - 40;
  let target: Point = { x: cx, y: cy };

  const positions = nodes.map((_, i) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return {
      x: cx + Math.cos(ang) * rx + Math.sin(now / 1500 + i) * 3,
      y: cy + Math.sin(ang) * ry + Math.cos(now / 1700 + i) * 3,
    };
  });

  // bağlantılar
  positions.forEach((p, i) => {
    const t = appearAmount(i, n, reveal);
    if (t <= 0) return;
    const isAct = i === act;
    ctx.globalAlpha = t;
    ctx.strokeStyle = isAct ? PALETTE[i % PALETTE.length][0] : 'rgba(100,116,139,0.55)';
    ctx.lineWidth = isAct ? 2.5 : 1.6;
    ctx.setLineDash([6, 8]);
    ctx.lineDashOffset = -now / 35;
    const mx = (cx + p.x) / 2 + (p.y - cy) * 0.12;
    const my = (cy + p.y) / 2 - (p.x - cx) * 0.12;
    const ex = cx + (p.x - cx) * t;
    const ey = cy + (p.y - cy) * t;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.quadraticCurveTo(mx, my, ex, ey);
    ctx.stroke();
    ctx.setLineDash([]);
    // akan parçacık
    const k = ((now / 1300) + i * 0.17) % 1;
    const qx = (1 - k) * (1 - k) * cx + 2 * (1 - k) * k * mx + k * k * p.x;
    const qy = (1 - k) * (1 - k) * cy + 2 * (1 - k) * k * my + k * k * p.y;
    ctx.fillStyle = PALETTE[i % PALETTE.length][0];
    ctx.beginPath();
    ctx.arc(qx, qy, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  });

  // merkez
  const hubR = 74 + Math.sin(now / 600) * 2;
  const hg = ctx.createRadialGradient(cx - 20, cy - 20, 10, cx, cy, hubR);
  hg.addColorStop(0, '#22d3ee');
  hg.addColorStop(1, '#4338ca');
  ctx.save();
  ctx.shadowColor = 'rgba(34,211,238,0.6)';
  ctx.shadowBlur = 34;
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.arc(cx, cy, hubR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, hubR + 9, now / 900, now / 900 + Math.PI * 1.3);
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = font(800, 14.5);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const hl = wrapText(ctx, title, 124, 4);
  drawLines(ctx, hl, cx, cy - ((hl.length - 1) * 17) / 2 + 5, 17);

  // düğüm kartları
  positions.forEach((p, i) => {
    const t = appearAmount(i, n, reveal);
    if (t <= 0) return;
    const nd = nodes[i];
    const isAct = i === act && reveal > 0.02;
    const s = 0.7 + 0.3 * easeOutBack(t);
    const cw = 196;
    ctx.font = font(800, 14.5);
    const ll = wrapText(ctx, nd.label, cw - 22, 2);
    ctx.font = font(500, 12);
    const sl = nd.subtext ? wrapText(ctx, nd.subtext, cw - 22, 2) : [];
    const ch = 22 + ll.length * 17 + sl.length * 15 + (sl.length ? 6 : 0);
    const bx = clamp(p.x - cw / 2, a.x, a.x + a.w - cw);
    const by = clamp(p.y - ch / 2, a.y, a.y + a.h - ch);

    ctx.save();
    ctx.globalAlpha = t;
    ctx.translate(bx + cw / 2, by + ch / 2);
    ctx.scale(s, s);
    ctx.translate(-(bx + cw / 2), -(by + ch / 2));
    if (isAct) {
      ctx.shadowColor = PALETTE[i % PALETTE.length][0];
      ctx.shadowBlur = 26;
    }
    rr(ctx, bx, by, cw, ch, 14);
    ctx.fillStyle = isAct ? 'rgba(30,41,59,0.98)' : 'rgba(17,24,43,0.95)';
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = isAct ? PALETTE[i % PALETTE.length][0] : 'rgba(71,85,105,0.7)';
    ctx.lineWidth = isAct ? 2 : 1;
    ctx.stroke();
    rr(ctx, bx, by + 10, 4, ch - 20, 2);
    ctx.fillStyle = PALETTE[i % PALETTE.length][0];
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f8fafc';
    ctx.font = font(800, 14.5);
    drawLines(ctx, ll, bx + 14, by + 25, 17);
    if (sl.length) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = font(500, 12);
      drawLines(ctx, sl, bx + 14, by + 31 + ll.length * 17, 15);
    }
    ctx.restore();
    if (isAct) target = { x: bx + cw / 2, y: by + ch / 2 };
  });
  ctx.textAlign = 'left';
  return target;
}

function drawComparison(ctx: CanvasRenderingContext2D, a: Area, nodesIn: DiagramNode[], reveal: number, now: number): Point {
  const nodes = nodesIn.slice(0, 4);
  const n = nodes.length;
  const act = activeIndex(n, reveal);
  const gap = n === 2 ? 70 : 18;
  const colW = (a.w - gap * (n - 1)) / n;
  const colH = a.h - 6;
  let target: Point = { x: a.x + a.w / 2, y: a.y + a.h / 2 };

  nodes.forEach((nd, i) => {
    const t = appearAmount(i, n, reveal);
    if (t <= 0) return;
    const isAct = i === act && reveal > 0.02;
    const x = a.x + i * (colW + gap);
    const y = a.y + (1 - t) * 30 + (isAct ? -5 - Math.sin(now / 320) * 2 : 0);
    const [c1, c2] = PALETTE[i % PALETTE.length];
    ctx.save();
    ctx.globalAlpha = t;
    if (isAct) {
      ctx.shadowColor = c1;
      ctx.shadowBlur = 28;
    }
    rr(ctx, x, y, colW, colH, 16);
    ctx.fillStyle = 'rgba(17,24,43,0.96)';
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = isAct ? c1 : 'rgba(71,85,105,0.6)';
    ctx.lineWidth = isAct ? 2 : 1;
    ctx.stroke();
    const hg = ctx.createLinearGradient(x, y, x + colW, y + 64);
    hg.addColorStop(0, c1);
    hg.addColorStop(1, c2);
    rr(ctx, x, y, colW, 64, [16, 16, 0, 0]);
    ctx.fillStyle = hg;
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = font(800, 16.5);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const ll = wrapText(ctx, nd.label, colW - 24, 2);
    drawLines(ctx, ll, x + colW / 2, y + (ll.length === 1 ? 38 : 28), 20);
    if (nd.subtext) {
      ctx.fillStyle = '#cbd5e1';
      ctx.font = font(500, 14);
      const maxLines = Math.floor((colH - 90) / 20);
      ctx.textAlign = 'left';
      drawLines(ctx, wrapText(ctx, nd.subtext, colW - 32, maxLines), x + 16, y + 92, 20);
    }
    ctx.restore();
    if (isAct) target = { x: x + colW / 2, y: y + 32 };
  });

  if (n === 2 && appearAmount(1, n, reveal) > 0) {
    const vx = a.x + colW + gap / 2;
    const vy = a.y + colH / 2;
    const s = 1 + Math.sin(now / 260) * 0.06;
    ctx.save();
    ctx.translate(vx, vy);
    ctx.scale(s, s);
    const vg = ctx.createLinearGradient(-26, -26, 26, 26);
    vg.addColorStop(0, '#f59e0b');
    vg.addColorStop(1, '#ef4444');
    ctx.fillStyle = vg;
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = font(900, 16);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('VS', 0, 1);
    ctx.restore();
  }
  ctx.textAlign = 'left';
  return target;
}

function drawCurve(ctx: CanvasRenderingContext2D, a: Area, nodesIn: DiagramNode[], reveal: number, now: number): Point {
  const nodes = nodesIn.slice(0, 5);
  const n = nodes.length;
  const act = activeIndex(n, reveal);
  const gx = a.x + 40;
  const gy = a.y + 8;
  const gw = a.w * 0.55;
  const gh = a.h - 40;
  const ox = gx;
  const oy = gy + gh;

  ctx.strokeStyle = 'rgba(203,213,225,0.7)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(ox, gy);
  ctx.lineTo(ox, oy);
  ctx.lineTo(ox + gw, oy);
  ctx.stroke();
  ctx.fillStyle = 'rgba(203,213,225,0.8)';
  ctx.font = font(700, 13);
  ctx.fillText('P', ox - 20, gy + 10);
  ctx.fillText('Q', ox + gw - 6, oy + 22);

  const curves = [
    { color: '#22d3ee', f: (u: number) => oy - gh * (0.1 + 0.8 * u) },
    { color: '#f472b6', f: (u: number) => oy - gh * (0.9 - 0.8 * u) },
  ];
  curves.forEach((c, ci) => {
    const t = ci < n ? appearAmount(ci, n, reveal) : 0;
    if (t <= 0) return;
    ctx.strokeStyle = c.color;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    const steps = 40;
    for (let s = 0; s <= steps * t; s++) {
      const u = s / steps;
      const px = ox + 30 + u * (gw - 60);
      const py = c.f(u) + Math.sin(u * 3) * 6 * (ci === 0 ? 1 : -1);
      if (s === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    if (t > 0.9) {
      ctx.fillStyle = c.color;
      ctx.font = font(800, 13);
      const label = wrapText(ctx, nodes[ci].label, 140, 1)[0] || '';
      ctx.fillText(label, ox + gw - 120, c.f(1) + (ci === 0 ? -10 : 22));
    }
  });

  let target: Point = { x: ox + gw / 2, y: oy - gh / 2 };
  if (n >= 2 && appearAmount(1, n, reveal) > 0.9) {
    const ex = ox + 30 + 0.5 * (gw - 60);
    const ey = oy - gh * 0.5;
    const pr = 8 + Math.sin(now / 200) * 3;
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(ex, ey, pr, 0, Math.PI * 2);
    ctx.fill();
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = 'rgba(251,191,36,0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex, oy);
    ctx.moveTo(ex, ey);
    ctx.lineTo(ox, ey);
    ctx.stroke();
    ctx.setLineDash([]);
    target = { x: ex, y: ey };
  }

  // açıklama listesi
  const lx = a.x + a.w * 0.62;
  const lw = a.w * 0.38;
  let ly = a.y + 4;
  nodes.forEach((nd, i) => {
    const t = appearAmount(i, n, reveal);
    if (t <= 0) return;
    const isAct = i === act && reveal > 0.02;
    ctx.save();
    ctx.globalAlpha = t;
    ctx.font = font(500, 12);
    const sl = nd.subtext ? wrapText(ctx, nd.subtext, lw - 30, 2) : [];
    const h = 30 + sl.length * 15;
    rr(ctx, lx + (1 - t) * 20, ly, lw, h, 10);
    ctx.fillStyle = isAct ? 'rgba(34,211,238,0.12)' : 'rgba(30,41,59,0.6)';
    ctx.fill();
    ctx.strokeStyle = isAct ? 'rgba(34,211,238,0.6)' : 'rgba(71,85,105,0.4)';
    ctx.stroke();
    ctx.fillStyle = PALETTE[i % PALETTE.length][0];
    ctx.beginPath();
    ctx.arc(lx + 14, ly + 15, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f1f5f9';
    ctx.font = font(800, 13.5);
    ctx.fillText(wrapText(ctx, nd.label, lw - 34, 1)[0] || '', lx + 26, ly + 20);
    ctx.fillStyle = '#94a3b8';
    ctx.font = font(500, 12);
    drawLines(ctx, sl, lx + 26, ly + 36, 15);
    ctx.restore();
    ly += h + 8;
  });
  return target;
}

// ---------------------------------------------------------------- characters
function mouthOpen(now: number, speaking: boolean) {
  if (!speaking) return 0;
  const t = now / 1000;
  return clamp(0.15 + Math.abs(Math.sin(t * 13.5) * Math.sin(t * 4.7 + 1)) * 0.95);
}

function drawEyes(ctx: CanvasRenderingContext2D, hx: number, hy: number, now: number, lookDx: number, seed: number) {
  const t = now / 1000 + seed;
  const blink = (t % 4.2) < 0.13;
  [-16, 16].forEach(dx => {
    if (blink) {
      ctx.strokeStyle = '#1f2937';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(hx + dx - 5, hy);
      ctx.lineTo(hx + dx + 5, hy);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(hx + dx, hy, 6.5, 7.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.arc(hx + dx + lookDx, hy + 0.5, 4.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(hx + dx + lookDx + 1.5, hy - 1.5, 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function drawMouth(ctx: CanvasRenderingContext2D, hx: number, hy: number, open: number) {
  if (open > 0.05) {
    ctx.fillStyle = '#7f1d1d';
    ctx.beginPath();
    ctx.ellipse(hx, hy, 9, 2 + open * 7.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fb7185';
    ctx.beginPath();
    ctx.ellipse(hx, hy + open * 4, 5, 1.5 + open * 2, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.strokeStyle = '#9f1239';
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(hx, hy - 6, 10, Math.PI * 0.2, Math.PI * 0.8);
    ctx.stroke();
  }
}

function drawSpeakerGlow(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, now: number) {
  const r = 175 + Math.sin(now / 260) * 8;
  const g = ctx.createRadialGradient(x, y, 10, x, y, r);
  g.addColorStop(0, color.replace(')', ',0.30)').replace('rgb', 'rgba'));
  g.addColorStop(1, color.replace(')', ',0)').replace('rgb', 'rgba'));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawNameTag(ctx: CanvasRenderingContext2D, cx: number, y: number, name: string, role: string, color: string, speaking: boolean, now: number) {
  ctx.font = font(800, 14);
  const nw = ctx.measureText(name).width;
  ctx.font = font(600, 10.5);
  const rw = ctx.measureText(role).width;
  const w = Math.max(nw + (speaking ? 44 : 20), rw + 20) + 20;
  rr(ctx, cx - w / 2, y, w, 44, 12);
  ctx.fillStyle = 'rgba(2,6,23,0.88)';
  ctx.fill();
  ctx.strokeStyle = speaking ? color : 'rgba(100,116,139,0.5)';
  ctx.lineWidth = speaking ? 2 : 1;
  ctx.stroke();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#f8fafc';
  ctx.font = font(800, 14);
  ctx.fillText(name, cx - w / 2 + 14, y + 19);
  ctx.fillStyle = color;
  ctx.font = font(600, 10.5);
  ctx.fillText(role, cx - w / 2 + 14, y + 35);
  if (speaking) {
    const bx = cx - w / 2 + 14 + nw + 10;
    for (let i = 0; i < 4; i++) {
      const h = 4 + Math.abs(Math.sin(now / 110 + i * 1.3)) * 11;
      ctx.fillStyle = color;
      rr(ctx, bx + i * 6, y + 14 - h / 2, 3.5, h, 2);
      ctx.fill();
    }
  }
}

function drawDeniz(ctx: CanvasRenderingContext2D, cx: number, base: number, speaking: boolean, now: number, pointTo: Point | null, sceneIndex: number) {
  const t = now / 1000;
  const breathe = Math.sin(t * 2) * 2;
  const bob = speaking ? Math.sin(t * 8.5) * 1.6 : Math.sin(t * 2.6) * 2.2; // dinlerken başını sallar
  const hx = cx + (speaking ? Math.sin(t * 1.4) * 3 : 0);
  const hy = base - 262 + breathe + bob;
  const topY = base - 190 + breathe * 0.5;

  if (speaking) drawSpeakerGlow(ctx, cx, base - 180, 'rgb(34,211,238)', now);

  // arka saç
  ctx.fillStyle = '#2a1810';
  ctx.beginPath();
  ctx.ellipse(hx, hy + 22, 58, 74, 0, 0, Math.PI * 2);
  ctx.fill();

  // gövde (ceket)
  const bg = ctx.createLinearGradient(cx, topY, cx, base);
  bg.addColorStop(0, '#1d4ed8');
  bg.addColorStop(1, '#172554');
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.moveTo(cx - 100, base);
  ctx.lineTo(cx - 100, topY + 64);
  ctx.quadraticCurveTo(cx - 98, topY + 6, cx - 38, topY);
  ctx.lineTo(cx + 38, topY);
  ctx.quadraticCurveTo(cx + 98, topY + 6, cx + 100, topY + 64);
  ctx.lineTo(cx + 100, base);
  ctx.closePath();
  ctx.fill();
  // gömlek + yaka
  ctx.fillStyle = '#e2e8f0';
  ctx.beginPath();
  ctx.moveTo(cx - 26, topY);
  ctx.lineTo(cx, topY + 58);
  ctx.lineTo(cx + 26, topY);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#1e3a8a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - 30, topY + 2);
  ctx.lineTo(cx - 6, topY + 70);
  ctx.moveTo(cx + 30, topY + 2);
  ctx.lineTo(cx + 6, topY + 70);
  ctx.stroke();
  // broş
  ctx.fillStyle = '#22d3ee';
  ctx.beginPath();
  ctx.arc(cx - 52, topY + 44, 5, 0, Math.PI * 2);
  ctx.fill();

  // boyun
  ctx.fillStyle = '#e3b08f';
  ctx.fillRect(hx - 13, hy + 36, 26, topY - (hy + 36) + 6);

  // kafa
  ctx.fillStyle = '#f6cfb0';
  ctx.beginPath();
  ctx.arc(hx, hy, 46, 0, Math.PI * 2);
  ctx.fill();
  // kulaklar + küpe
  ctx.beginPath();
  ctx.arc(hx - 45, hy + 4, 8, 0, Math.PI * 2);
  ctx.arc(hx + 45, hy + 4, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fbbf24';
  ctx.beginPath();
  ctx.arc(hx - 46, hy + 16, 3, 0, Math.PI * 2);
  ctx.arc(hx + 46, hy + 16, 3, 0, Math.PI * 2);
  ctx.fill();

  // ön saç + topuz
  ctx.fillStyle = '#3b2416';
  ctx.beginPath();
  ctx.arc(hx + 6, hy - 60, 21, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(hx, hy - 20, 50, 34, 0, Math.PI, Math.PI * 2);
  ctx.quadraticCurveTo(hx + 20, hy - 30, hx - 6, hy - 18);
  ctx.quadraticCurveTo(hx - 30, hy - 8, hx - 50, hy - 4);
  ctx.closePath();
  ctx.fill();

  // gözler (tahtaya bakar)
  drawEyes(ctx, hx, hy + 2, now, speaking ? 2 : 1.5, 0.3);
  // gözlük
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2.6;
  rr(ctx, hx - 29, hy - 9, 25, 21, 7);
  ctx.stroke();
  rr(ctx, hx + 4, hy - 9, 25, 21, 7);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(hx - 4, hy);
  ctx.lineTo(hx + 4, hy);
  ctx.stroke();
  // kaşlar
  const browUp = speaking ? Math.max(0, Math.sin(t * 2.3)) * 3 : 0;
  ctx.strokeStyle = '#3b2416';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(hx - 26, hy - 15 - browUp);
  ctx.quadraticCurveTo(hx - 17, hy - 20 - browUp, hx - 8, hy - 15 - browUp);
  ctx.moveTo(hx + 8, hy - 15 - browUp);
  ctx.quadraticCurveTo(hx + 17, hy - 20 - browUp, hx + 26, hy - 15 - browUp);
  ctx.stroke();
  // yanaklar
  ctx.fillStyle = 'rgba(244,114,182,0.28)';
  ctx.beginPath();
  ctx.arc(hx - 27, hy + 18, 7, 0, Math.PI * 2);
  ctx.arc(hx + 27, hy + 18, 7, 0, Math.PI * 2);
  ctx.fill();
  drawMouth(ctx, hx + 1, hy + 26, mouthOpen(now, speaking));

  // kol
  const shX = cx + 72;
  const shY = topY + 34;
  ctx.lineCap = 'round';
  if (speaking && pointTo) {
    const ang = Math.atan2(pointTo.y - shY, pointTo.x - shX);
    const a1 = clamp(ang, -1.2, 0.2) + Math.sin(t * 2.2) * 0.04;
    const ex = shX + Math.cos(a1 + 0.5) * 62;
    const ey = shY + Math.sin(a1 + 0.5) * 62;
    const hx2 = ex + Math.cos(a1 - 0.15) * 58;
    const hy2 = ey + Math.sin(a1 - 0.15) * 58;
    ctx.strokeStyle = '#1e40af';
    ctx.lineWidth = 24;
    ctx.beginPath();
    ctx.moveTo(shX, shY);
    ctx.lineTo(ex, ey);
    ctx.lineTo(hx2, hy2);
    ctx.stroke();
    ctx.fillStyle = '#f6cfb0';
    ctx.beginPath();
    ctx.arc(hx2, hy2, 11, 0, Math.PI * 2);
    ctx.fill();
    // işaret çubuğu
    const pa = Math.atan2(pointTo.y - hy2, pointTo.x - hx2);
    const tipX = hx2 + Math.cos(pa) * 64;
    const tipY = hy2 + Math.sin(pa) * 64;
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(hx2, hy2);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    // lazer
    ctx.strokeStyle = 'rgba(244,63,94,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(pointTo.x, pointTo.y);
    ctx.stroke();
    const lr = 7 + Math.sin(now / 120) * 2;
    const lg = ctx.createRadialGradient(pointTo.x, pointTo.y, 0, pointTo.x, pointTo.y, lr * 3);
    lg.addColorStop(0, 'rgba(244,63,94,0.95)');
    lg.addColorStop(0.35, 'rgba(244,63,94,0.5)');
    lg.addColorStop(1, 'rgba(244,63,94,0)');
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.arc(pointTo.x, pointTo.y, lr * 3, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // not defteri tutan kol
    ctx.strokeStyle = '#1e40af';
    ctx.lineWidth = 24;
    ctx.beginPath();
    ctx.moveTo(shX, shY);
    ctx.lineTo(shX + 6, shY + 70);
    ctx.lineTo(cx + 18, shY + 92);
    ctx.stroke();
    ctx.save();
    ctx.translate(cx + 30, shY + 70);
    ctx.rotate(-0.12);
    rr(ctx, -26, -34, 52, 66, 5);
    ctx.fillStyle = '#f8fafc';
    ctx.fill();
    ctx.fillStyle = '#22d3ee';
    ctx.fillRect(-26, -34, 52, 9);
    ctx.fillStyle = '#cbd5e1';
    for (let i = 0; i < 4; i++) ctx.fillRect(-18, -16 + i * 10, 36, 2);
    ctx.restore();
    ctx.fillStyle = '#f6cfb0';
    ctx.beginPath();
    ctx.arc(cx + 14, shY + 92, 10, 0, Math.PI * 2);
    ctx.fill();
  }

  drawNameTag(ctx, cx, base - 58, 'Deniz', 'AKADEMİK ANLATICI', '#22d3ee', speaking, now);
  void sceneIndex;
}

function drawBaris(ctx: CanvasRenderingContext2D, cx: number, base: number, speaking: boolean, now: number, sceneIndex: number) {
  const t = now / 1000;
  const breathe = Math.sin(t * 2.1 + 1) * 2;
  const bob = speaking ? Math.sin(t * 9) * 1.8 : Math.sin(t * 2.4 + 0.5) * 2.4;
  const hx = cx + (speaking ? Math.sin(t * 1.2) * 3 : 0);
  const hy = base - 258 + breathe + bob;
  const topY = base - 188 + breathe * 0.5;

  if (speaking) drawSpeakerGlow(ctx, cx, base - 180, 'rgb(251,113,133)', now);

  // kapüşon (kafanın arkasında)
  ctx.fillStyle = '#9f1239';
  ctx.beginPath();
  ctx.ellipse(cx, topY + 8, 70, 34, 0, Math.PI, Math.PI * 2);
  ctx.fill();

  // gövde
  const bg = ctx.createLinearGradient(cx, topY, cx, base);
  bg.addColorStop(0, '#f43f5e');
  bg.addColorStop(1, '#881337');
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.moveTo(cx - 102, base);
  ctx.lineTo(cx - 102, topY + 66);
  ctx.quadraticCurveTo(cx - 100, topY + 6, cx - 40, topY);
  ctx.lineTo(cx + 40, topY);
  ctx.quadraticCurveTo(cx + 100, topY + 6, cx + 102, topY + 66);
  ctx.lineTo(cx + 102, base);
  ctx.closePath();
  ctx.fill();
  // ip + cep + logo
  ctx.strokeStyle = '#fecdd3';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - 14, topY + 6);
  ctx.lineTo(cx - 16, topY + 58);
  ctx.moveTo(cx + 14, topY + 6);
  ctx.lineTo(cx + 16, topY + 58);
  ctx.stroke();
  rr(ctx, cx - 44, topY + 104, 88, 40, 10);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fill();
  ctx.fillStyle = '#fff1f2';
  ctx.font = font(900, 15);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('EN', cx, topY + 84);

  // boyun
  ctx.fillStyle = '#c98e64';
  ctx.fillRect(hx - 13, hy + 36, 26, topY - (hy + 36) + 6);

  // kulaklık (boyunda)
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(hx, topY - 4, 30, Math.PI * 0.05, Math.PI * 0.95);
  ctx.stroke();
  ctx.fillStyle = '#1e293b';
  rr(ctx, hx - 40, topY - 10, 16, 24, 6);
  ctx.fill();
  rr(ctx, hx + 24, topY - 10, 16, 24, 6);
  ctx.fill();
  ctx.fillStyle = '#fb7185';
  ctx.fillRect(hx - 36, topY - 2, 8, 3);
  ctx.fillRect(hx + 28, topY - 2, 8, 3);

  // kafa
  ctx.fillStyle = '#e0a87e';
  ctx.beginPath();
  ctx.arc(hx, hy, 46, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(hx - 45, hy + 4, 8, 0, Math.PI * 2);
  ctx.arc(hx + 45, hy + 4, 8, 0, Math.PI * 2);
  ctx.fill();

  // saç (dikleşmiş)
  ctx.fillStyle = '#111827';
  ctx.beginPath();
  ctx.ellipse(hx, hy - 22, 48, 30, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 6; i++) {
    const sx = hx - 40 + i * 16;
    ctx.beginPath();
    ctx.moveTo(sx - 9, hy - 28);
    ctx.lineTo(sx + 2, hy - 58 - (i % 2) * 8);
    ctx.lineTo(sx + 12, hy - 28);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillRect(hx - 48, hy - 26, 10, 22);
  ctx.fillRect(hx + 38, hy - 26, 10, 22);

  // gözler (tahtaya — sola bakar)
  drawEyes(ctx, hx, hy + 2, now, speaking ? -1.5 : -2.2, 1.7);
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  const browUp = speaking ? Math.max(0, Math.sin(t * 2.7)) * 4 : (Math.sin(t * 0.9) > 0.7 ? 4 : 0);
  ctx.beginPath();
  ctx.moveTo(hx - 25, hy - 13 - browUp);
  ctx.lineTo(hx - 8, hy - 15 - browUp);
  ctx.moveTo(hx + 8, hy - 15 - browUp * 1.4);
  ctx.lineTo(hx + 25, hy - 13 - browUp * 1.4);
  ctx.stroke();
  ctx.fillStyle = 'rgba(244,114,182,0.2)';
  ctx.beginPath();
  ctx.arc(hx - 27, hy + 18, 7, 0, Math.PI * 2);
  ctx.arc(hx + 27, hy + 18, 7, 0, Math.PI * 2);
  ctx.fill();
  drawMouth(ctx, hx - 1, hy + 26, mouthOpen(now + 400, speaking));

  // kol / jest
  const shX = cx - 74;
  const shY = topY + 34;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#be123c';
  ctx.lineWidth = 24;
  if (speaking) {
    const wave = Math.sin(t * 3.6) * 16;
    const ex = shX - 40;
    const ey = shY + 40;
    const hx2 = shX - 62;
    const hy2 = shY - 26 + wave;
    ctx.beginPath();
    ctx.moveTo(shX, shY);
    ctx.lineTo(ex, ey);
    ctx.lineTo(hx2, hy2);
    ctx.stroke();
    // açık avuç
    ctx.fillStyle = '#e0a87e';
    ctx.beginPath();
    ctx.ellipse(hx2, hy2 - 6, 12, 15, -0.3, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.ellipse(hx2 - 9 + i * 6, hy2 - 22, 2.8, 7, -0.15, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    ctx.beginPath();
    ctx.moveTo(shX, shY);
    ctx.lineTo(shX - 6, shY + 70);
    ctx.lineTo(cx - 20, shY + 96);
    ctx.stroke();
    ctx.fillStyle = '#e0a87e';
    ctx.beginPath();
    ctx.arc(cx - 16, shY + 96, 10, 0, Math.PI * 2);
    ctx.fill();
    // düşünce balonu
    const phase = (t % 6) / 6;
    if (phase > 0.25) {
      const bt = easeOut((phase - 0.25) / 0.15) * (phase > 0.9 ? clamp((1 - phase) / 0.1) : 1);
      ctx.save();
      ctx.globalAlpha = bt;
      ctx.fillStyle = 'rgba(248,250,252,0.95)';
      ctx.beginPath();
      ctx.arc(hx - 56, hy - 54, 5, 0, Math.PI * 2);
      ctx.arc(hx - 68, hy - 72, 8, 0, Math.PI * 2);
      ctx.fill();
      rr(ctx, hx - 120, hy - 130, 74, 50, 22);
      ctx.fill();
      ctx.font = font(600, 26);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const icons = ['🤔', '💡', '❓', '📝'];
      ctx.fillText(icons[sceneIndex % icons.length], hx - 83, hy - 104);
      ctx.restore();
    }
  }

  drawNameTag(ctx, cx, base - 58, 'Barış', 'MERAKLI SORU SORAN', '#fb7185', speaking, now);
}

// ---------------------------------------------------------------- subtitles
function drawSubtitles(ctx: CanvasRenderingContext2D, f: StageFrame) {
  const sc = f.scene;
  const color = SPEAKER_COLOR[sc.speaker];
  const { x, y, w, h } = SUB;

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 30;
  rr(ctx, x, y, w, h, 18);
  ctx.fillStyle = 'rgba(2,6,23,0.86)';
  ctx.fill();
  ctx.restore();
  rr(ctx, x, y, w, h, 18);
  ctx.strokeStyle = color + '66';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  rr(ctx, x, y + 16, 4, h - 32, 2);
  ctx.fillStyle = color;
  ctx.fill();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = font(900, 12);
  ctx.fillStyle = color;
  ctx.fillText(sc.speaker.toLocaleUpperCase('tr-TR'), x + 22, y + 26);
  ctx.font = font(600, 11);
  ctx.fillStyle = 'rgba(148,163,184,0.9)';
  ctx.textAlign = 'right';
  ctx.fillText(`${Math.min(f.sentenceIndex + 1, sc.sentences.length)} / ${sc.sentences.length}`, x + w - 20, y + 26);
  ctx.textAlign = 'left';

  const sentence = sc.sentences[f.sentenceIndex] || sc.narration;
  ctx.font = font(600, 22);
  const maxW = w - 44;
  const words = sentence.split(' ');
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
  // 3 satırdan fazlaysa aktif bölgeyi göster
  let startLine = 0;
  if (lines.length > 3) {
    const activeLine = lines.findIndex(l => l.length && l[l.length - 1].start + l[l.length - 1].word.length >= f.charInSentence);
    startLine = clamp(activeLine - 1, 0, lines.length - 3);
  }
  lines.slice(startLine, startLine + 3).forEach((line, li) => {
    let lx = x + 22;
    const ly = y + 60 + li * 30;
    line.forEach(({ word, start }) => {
      const spoken = f.poster ? true : start < f.charInSentence;
      ctx.fillStyle = spoken ? '#ffffff' : 'rgba(148,163,184,0.55)';
      ctx.fillText(word, lx, ly);
      lx += ctx.measureText(word).width + spaceW;
    });
  });
}

function drawSceneTransition(ctx: CanvasRenderingContext2D, f: StageFrame) {
  if (f.poster || f.sceneTime > 1.15) return;
  const t = f.sceneTime / 1.15;
  const alpha = t < 0.18 ? t / 0.18 : t > 0.68 ? (1 - t) / 0.32 : 1;
  const slide = (1 - easeOut(t / 0.3)) * -120;
  ctx.save();
  ctx.globalAlpha = clamp(alpha);
  const bandY = 262;
  const bandH = 180;
  const g = ctx.createLinearGradient(0, bandY, STAGE_W, bandY + bandH);
  g.addColorStop(0, 'rgba(8,47,73,0.97)');
  g.addColorStop(0.5, 'rgba(30,27,75,0.97)');
  g.addColorStop(1, 'rgba(76,5,25,0.97)');
  ctx.fillStyle = g;
  ctx.fillRect(0, bandY, STAGE_W, bandH);
  ctx.fillStyle = '#22d3ee';
  ctx.fillRect(0, bandY, STAGE_W, 3);
  ctx.fillStyle = '#f472b6';
  ctx.fillRect(0, bandY + bandH - 3, STAGE_W, 3);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#67e8f9';
  ctx.font = font(800, 16);
  ctx.fillText(`BÖLÜM ${String(f.sceneIndex + 1).padStart(2, '0')}  ·  ${f.scene.speaker.toLocaleUpperCase('tr-TR')} ANLATIYOR`, STAGE_W / 2 + slide, bandY + 66);
  ctx.fillStyle = '#ffffff';
  ctx.font = font(900, 40);
  ctx.fillText(wrapText(ctx, f.scene.title, STAGE_W - 200, 1)[0] || '', STAGE_W / 2 - slide, bandY + 122);
  ctx.restore();
  ctx.textAlign = 'left';
}

function drawReactions(ctx: CanvasRenderingContext2D, f: StageFrame) {
  f.reactions.forEach(r => {
    const age = (f.now - r.born) / 1000;
    if (age < 0 || age > 2.4) return;
    const y = 640 - age * 200;
    const x = r.x + Math.sin(age * 4 + r.drift) * 18;
    ctx.globalAlpha = clamp(1 - age / 2.4);
    ctx.font = `${30 + r.drift * 4}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(r.emoji, x, y);
  });
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}

// ---------------------------------------------------------------- main
export function renderStage(ctx: CanvasRenderingContext2D, f: StageFrame) {
  ctx.save();
  drawBackground(ctx, f.now);
  const speakingNow = f.playing;
  const denizSpeaks = speakingNow && f.scene.speaker === 'Deniz';
  const barisSpeaks = speakingNow && f.scene.speaker === 'Barış';

  const target = drawBoard(ctx, f);
  drawDeniz(ctx, 128, STAGE_H + 6, denizSpeaks, f.now, target, f.sceneIndex);
  drawBaris(ctx, STAGE_W - 128, STAGE_H + 6, barisSpeaks, f.now, f.sceneIndex);
  if (f.showSubtitles) drawSubtitles(ctx, f);
  drawHud(ctx, f);
  drawSceneTransition(ctx, f);
  drawReactions(ctx, f);
  drawVignette(ctx);
  ctx.restore();
}
