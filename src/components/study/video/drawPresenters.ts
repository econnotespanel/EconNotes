// Yüksek Detaylı Gerçekçi Dijital Stüdyo Sunucuları: Dr. Deniz & Barış
// 3 noktalı portre ışıklandırması (key + fill + rim), anatomik yüz düzlemleri (elmacık kemiği,
// nazolabial kıvrım, filtrum, çene hattı), limbal halkalı ve lif dokulu iris, tel tel kaş ve saç
// katmanları, dikim detaylı ceket/gömlek dokusu ve 5 parmaklı eklemli anlatım jestleri içerir.

import type { Viseme } from './speechEngine';

export interface PresenterRenderProps {
  ctx: CanvasRenderingContext2D;
  now: number;
  denizSpeaking: boolean;
  barisSpeaking: boolean;
  viseme: Viseme;
  mouthOpen: number;
  inBreathPause: boolean;
  boardFocusX: number;
  boardFocusY: number;
}

const FONT = 'Inter, "Segoe UI", system-ui, -apple-system, sans-serif';

function clamp(v: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, v));
}

function roundRectPath(
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

/** Doğal insan göz kırpma eğrisi (0 = açık, 1 = kapalı) */
function computeBlink(now: number, seed: number): number {
  const cycle = (now / 1000 + seed) % 4.4;
  if (cycle < 0.13) {
    return Math.sin((cycle / 0.13) * Math.PI);
  }
  const doubleCycle = (now / 1000 + seed) % 13.2;
  if (doubleCycle > 0.21 && doubleCycle < 0.33) {
    return Math.sin(((doubleCycle - 0.21) / 0.12) * Math.PI);
  }
  return 0;
}

/** İç kulak kıvrımlarıyla (heliks + konka gölgesi) anatomik kulak çizimi */
function drawDetailedEar(
  ctx: CanvasRenderingContext2D,
  ex: number,
  ey: number,
  side: -1 | 1,
  baseColor: string,
  shadowColor: string,
  earringPearl: boolean,
) {
  ctx.save();
  ctx.translate(ex, ey);
  ctx.rotate(side * 0.11);

  const earGrad = ctx.createLinearGradient(-side * 8, -14, side * 8, 16);
  earGrad.addColorStop(0, baseColor);
  earGrad.addColorStop(1, shadowColor);
  ctx.fillStyle = earGrad;
  ctx.beginPath();
  ctx.ellipse(0, 0, 8.8, 16.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // İç kulak kepçesi (concha & helix) gölgesi
  ctx.strokeStyle = 'rgba(110, 62, 44, 0.42)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, -1, 5.2, side === 1 ? -Math.PI * 0.7 : -Math.PI * 0.3, side === 1 ? Math.PI * 0.65 : Math.PI * 1.35);
  ctx.stroke();

  ctx.fillStyle = 'rgba(105, 56, 38, 0.22)';
  ctx.beginPath();
  ctx.ellipse(-side * 1.4, 1.5, 3.2, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();

  if (earringPearl) {
    const pGrad = ctx.createRadialGradient(-1, 14.5, 0.5, 0, 15.5, 4);
    pGrad.addColorStop(0, '#ffffff');
    pGrad.addColorStop(0.65, '#fef3c7');
    pGrad.addColorStop(1, '#d97706');
    ctx.fillStyle = pGrad;
    ctx.beginPath();
    ctx.arc(side * 0.8, 15.5, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/** Lif dokulu iris, limbal halka, gözyaşı pınarı ve kirpiklerle yüksek gerçekçilikte insan gözü */
function drawLifelikeEye(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  side: -1 | 1,
  limbalColor: string,
  irisMid: string,
  irisHighlight: string,
  gazeX: number,
  gazeY: number,
  blink: number,
  feminineLashes: boolean,
  creaseColor: string,
) {
  ctx.save();

  // Üst göz kapağı kıvrımı (palpebral sulcus)
  ctx.strokeStyle = creaseColor;
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - rx * 1.06, cy - ry * 0.72);
  ctx.bezierCurveTo(
    cx - rx * 0.45,
    cy - ry * 1.85,
    cx + rx * 0.45,
    cy - ry * 1.82,
    cx + rx * 1.06,
    cy - ry * 0.68,
  );
  ctx.stroke();

  // Alt göz altı hafif doğal torba/çukur gölgesi (tear trough)
  ctx.strokeStyle = 'rgba(128, 76, 58, 0.16)';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(cx - rx * 0.78, cy + ry * 1.18);
  ctx.quadraticCurveTo(cx, cy + ry * 1.58, cx + rx * 0.78, cy + ry * 1.12);
  ctx.stroke();

  const openFactor = clamp(1 - blink, 0.03, 1);
  const curRy = ry * openFactor;

  if (blink > 0.86) {
    ctx.strokeStyle = '#1b120e';
    ctx.lineWidth = feminineLashes ? 2.7 : 2.2;
    ctx.beginPath();
    ctx.moveTo(cx - rx, cy + 0.8);
    ctx.quadraticCurveTo(cx, cy + 3.6, cx + rx, cy + 0.4);
    ctx.stroke();
    ctx.restore();
    return;
  }

  // Anatomik badem göz açıklığı
  ctx.beginPath();
  ctx.moveTo(cx - rx, cy + 0.8);
  ctx.bezierCurveTo(
    cx - rx * 0.52,
    cy - curRy * 1.32,
    cx + rx * 0.52,
    cy - curRy * 1.28,
    cx + rx,
    cy + 0.2,
  );
  ctx.bezierCurveTo(
    cx + rx * 0.52,
    cy + curRy * 1.14,
    cx - rx * 0.52,
    cy + curRy * 1.12,
    cx - rx,
    cy + 0.8,
  );
  ctx.closePath();

  // Doğal 3B küresel göz akı (sklera kenarlarda hafif gölgeli)
  const scleraGrad = ctx.createRadialGradient(cx + gazeX * 0.3, cy, rx * 0.1, cx, cy, rx * 1.05);
  scleraGrad.addColorStop(0, '#f9fafc');
  scleraGrad.addColorStop(0.7, '#eef2f7');
  scleraGrad.addColorStop(1, '#cfd8e4');
  ctx.fillStyle = scleraGrad;
  ctx.fill();

  ctx.save();
  ctx.clip();

  // İç göz pınarı (lacrimal caruncle)
  const innerCornerX = side === -1 ? cx + rx * 0.86 : cx - rx * 0.86;
  ctx.fillStyle = 'rgba(214, 128, 124, 0.68)';
  ctx.beginPath();
  ctx.ellipse(innerCornerX, cy + 0.6, 2.4, 1.8, 0, 0, Math.PI * 2);
  ctx.fill();

  // İris + Limbal Halka + Lif Dokusu
  const ix = cx + gazeX;
  const iy = cy + gazeY;
  const irisR = ry * 0.92;

  // Dış limbal halka (gerçekçi bakış derinliği)
  ctx.fillStyle = limbalColor;
  ctx.beginPath();
  ctx.arc(ix, iy, irisR, 0, Math.PI * 2);
  ctx.fill();

  const irisGrad = ctx.createRadialGradient(ix, iy + irisR * 0.18, irisR * 0.12, ix, iy, irisR * 0.88);
  irisGrad.addColorStop(0, irisHighlight);
  irisGrad.addColorStop(0.62, irisMid);
  irisGrad.addColorStop(1, limbalColor);
  ctx.fillStyle = irisGrad;
  ctx.beginPath();
  ctx.arc(ix, iy, irisR * 0.86, 0, Math.PI * 2);
  ctx.fill();

  // İnce radyal iris lifleri
  ctx.strokeStyle = 'rgba(255, 232, 195, 0.18)';
  ctx.lineWidth = 0.75;
  for (let k = 0; k < 12; k++) {
    const ang = (k / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(ix + Math.cos(ang) * irisR * 0.42, iy + Math.sin(ang) * irisR * 0.42);
    ctx.lineTo(ix + Math.cos(ang) * irisR * 0.82, iy + Math.sin(ang) * irisR * 0.82);
    ctx.stroke();
  }

  // Göz bebeği (pupil)
  ctx.fillStyle = '#080b11';
  ctx.beginPath();
  ctx.arc(ix, iy, irisR * 0.41, 0, Math.PI * 2);
  ctx.fill();

  // Üst göz kapağının kornea üzerine düşürdüğü yumuşak gölge
  const lidShadow = ctx.createLinearGradient(0, cy - curRy * 1.2, 0, cy - curRy * 0.1);
  lidShadow.addColorStop(0, 'rgba(12, 18, 32, 0.42)');
  lidShadow.addColorStop(1, 'rgba(12, 18, 32, 0)');
  ctx.fillStyle = lidShadow;
  ctx.fillRect(cx - rx - 2, cy - curRy * 1.3, rx * 2 + 4, curRy * 1.25);

  // Stüdyo softbox yansımaları (çift kornea catchlight)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.beginPath();
  ctx.ellipse(ix - irisR * 0.28, iy - irisR * 0.28, irisR * 0.23, irisR * 0.18, -0.35, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(224, 247, 255, 0.62)';
  ctx.beginPath();
  ctx.arc(ix + irisR * 0.27, iy + irisR * 0.26, irisR * 0.11, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  // Üst kirpik hattı
  ctx.strokeStyle = '#18100d';
  ctx.lineWidth = feminineLashes ? 2.6 : 2.05;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - rx, cy + 0.8);
  ctx.bezierCurveTo(
    cx - rx * 0.52,
    cy - curRy * 1.32,
    cx + rx * 0.52,
    cy - curRy * 1.28,
    cx + rx,
    cy + 0.2,
  );
  ctx.stroke();

  // Dış köşe doğal ince kirpik uçları
  if (feminineLashes) {
    const outerDir = side;
    const outerX = cx + outerDir * rx * 0.92;
    ctx.lineWidth = 1.35;
    for (let l = 0; l < 3; l++) {
      ctx.beginPath();
      ctx.moveTo(outerX - outerDir * l * 2.4, cy - curRy * (0.28 + l * 0.18));
      ctx.quadraticCurveTo(
        outerX + outerDir * (2.6 - l * 0.5),
        cy - curRy * (0.62 + l * 0.2),
        outerX + outerDir * (4.2 - l * 0.7),
        cy - curRy * (0.95 + l * 0.18),
      );
      ctx.stroke();
    }
  }

  // Alt kirpik su hattı (waterline)
  ctx.strokeStyle = 'rgba(248, 224, 215, 0.45)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(cx - rx * 0.8, cy + curRy * 0.88);
  ctx.quadraticCurveTo(cx, cy + curRy * 1.08, cx + rx * 0.8, cy + curRy * 0.84);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(68, 42, 32, 0.42)';
  ctx.lineWidth = 1.05;
  ctx.beginPath();
  ctx.moveTo(cx - rx * 0.86, cy + curRy * 0.95);
  ctx.quadraticCurveTo(cx, cy + curRy * 1.22, cx + rx * 0.86, cy + curRy * 0.9);
  ctx.stroke();

  ctx.restore();
}

/** Tel tel kıl dokulu doğal kaş çizimi */
function drawNaturalEyebrow(
  ctx: CanvasRenderingContext2D,
  side: -1 | 1,
  browLift: number,
  colorDark: string,
  colorSoft: string,
  thicker: boolean,
) {
  ctx.save();
  const innerX = side * 9;
  const archX = side * 25;
  const outerX = side * 41;
  const baseY = thicker ? -16.5 : -18;
  const thickness = thicker ? 5.2 : 3.9;

  // Yumuşak kaş gövde tabanı
  ctx.fillStyle = colorSoft;
  ctx.beginPath();
  ctx.moveTo(innerX, baseY - browLift * 0.45);
  ctx.quadraticCurveTo(archX, baseY - 8.5 - browLift, outerX, baseY - 1 - browLift * 0.55);
  ctx.quadraticCurveTo(archX, baseY - 8.5 + thickness - browLift, innerX, baseY + thickness * 0.85 - browLift * 0.45);
  ctx.closePath();
  ctx.fill();

  // Doğal kaş kılları
  ctx.strokeStyle = colorDark;
  ctx.lineWidth = thicker ? 1.35 : 1.15;
  ctx.lineCap = 'round';
  const steps = 13;
  for (let i = 0; i < steps; i++) {
    const u = i / (steps - 1);
    const px = innerX + (outerX - innerX) * u;
    const archCurve = Math.sin(u * Math.PI) * 6.8;
    const py = baseY + thickness * 0.55 - archCurve - browLift * (0.45 + Math.sin(u * Math.PI) * 0.55);
    const slantX = side * (2.2 + u * 3.2);
    const slantY = -thickness * (1.0 - u * 0.42);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + slantX, py + slantY);
    ctx.stroke();
  }

  ctx.restore();
}

/** Burun sırtı, kanatları, burun delikleri ve filtrum (dudak üstü oluğu) */
function drawSculptedNoseAndPhiltrum(
  ctx: CanvasRenderingContext2D,
  cx: number,
  topY: number,
  len: number,
  facingDir: 1 | -1,
  shadowColor: string,
  highlightColor: string,
) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Burun sırtı yumuşak yanal gölgesi
  const sideGrad = ctx.createLinearGradient(cx - 8, topY, cx + 8, topY + len);
  sideGrad.addColorStop(0, facingDir === 1 ? 'rgba(138, 82, 60, 0.18)' : 'rgba(138, 82, 60, 0.04)');
  sideGrad.addColorStop(1, facingDir === 1 ? 'rgba(138, 82, 60, 0.04)' : 'rgba(138, 82, 60, 0.2)');
  ctx.fillStyle = sideGrad;
  ctx.beginPath();
  ctx.moveTo(cx - 5, topY + 2);
  ctx.lineTo(cx + 5, topY + 2);
  ctx.lineTo(cx + 8, topY + len - 3);
  ctx.lineTo(cx - 8, topY + len - 3);
  ctx.closePath();
  ctx.fill();

  // Burun sırtı konturu
  ctx.strokeStyle = shadowColor;
  ctx.lineWidth = 1.75;
  ctx.beginPath();
  ctx.moveTo(cx + facingDir * 2.2, topY - 1);
  ctx.bezierCurveTo(
    cx + facingDir * 4.2,
    topY + len * 0.55,
    cx + facingDir * 6.5,
    topY + len * 0.86,
    cx + facingDir * 2.2,
    topY + len,
  );
  ctx.stroke();

  // Burun kanatları (alae) + hafif burun deliği gölgesi
  ctx.strokeStyle = shadowColor;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(cx - 9.5, topY + len - 3.5);
  ctx.bezierCurveTo(cx - 11, topY + len + 1, cx - 6, topY + len + 2.8, cx - 3, topY + len + 1.5);
  ctx.moveTo(cx + 9.5, topY + len - 3.5);
  ctx.bezierCurveTo(cx + 11, topY + len + 1, cx + 6, topY + len + 2.8, cx + 3, topY + len + 1.5);
  ctx.stroke();

  ctx.fillStyle = 'rgba(92, 48, 34, 0.42)';
  ctx.beginPath();
  ctx.ellipse(cx - 4.6, topY + len + 0.8, 2.1, 1.0, 0.25, 0, Math.PI * 2);
  ctx.ellipse(cx + 4.6, topY + len + 0.8, 2.1, 1.0, -0.25, 0, Math.PI * 2);
  ctx.fill();

  // Burun sırtı ve ucu stüdyo ışığı
  ctx.fillStyle = highlightColor;
  ctx.beginPath();
  ctx.ellipse(cx + facingDir * 0.8, topY + len * 0.45, 1.8, len * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + facingDir * 1.2, topY + len - 4.2, 3.4, 4.2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Filtrum (burun altından üst dudağa inen doğal anatomik oluk)
  ctx.strokeStyle = 'rgba(138, 82, 62, 0.2)';
  ctx.lineWidth = 1.15;
  ctx.beginPath();
  ctx.moveTo(cx - 2.4, topY + len + 3.2);
  ctx.lineTo(cx - 3.2, topY + len + 10.5);
  ctx.moveTo(cx + 2.4, topY + len + 3.2);
  ctx.lineTo(cx + 3.2, topY + len + 10.5);
  ctx.stroke();

  ctx.restore();
}

/** Nazolabial ifade kıvrımları + gerçekçi hacimli dudak ve diş/dil senkronu */
function drawLifelikeMouth(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  viseme: Viseme,
  openAmount: number,
  speaking: boolean,
  upperLipColor: string,
  lowerLipColor: string,
  lipShadowColor: string,
) {
  ctx.save();

  const open = speaking ? clamp(openAmount, 0, 1) : 0;
  let halfW = 18;
  let gapH = 0;

  if (!speaking || viseme === 'rest') {
    halfW = 18.4;
    gapH = open * 2.8;
  } else if (viseme === 'closed') {
    halfW = 16.8;
    gapH = 0.35;
  } else if (viseme === 'round') {
    halfW = 12.6;
    gapH = 3.8 + open * 8.4;
  } else if (viseme === 'open') {
    halfW = 17.6;
    gapH = 4.2 + open * 9.8;
  } else {
    halfW = 19.6;
    gapH = 2.4 + open * 6.8;
  }

  const cornerLift = speaking ? -0.9 : -2.1;

  // Hafif doğal nazolabial (burun kenarı - ağız köşesi) ifade çizgileri
  ctx.strokeStyle = 'rgba(132, 76, 56, 0.17)';
  ctx.lineWidth = 1.35;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - 13, cy - 17);
  ctx.quadraticCurveTo(cx - halfW - 5.5, cy - 5, cx - halfW - 3.2, cy + cornerLift + 4);
  ctx.moveTo(cx + 13, cy - 17);
  ctx.quadraticCurveTo(cx + halfW + 5.5, cy - 5, cx + halfW + 3.2, cy + cornerLift + 4);
  ctx.stroke();

  // Ağız içi boşluğu (konuşurken)
  if (gapH > 1.25) {
    ctx.beginPath();
    ctx.moveTo(cx - halfW + 1, cy + cornerLift);
    ctx.quadraticCurveTo(cx, cy - gapH * 0.42, cx + halfW - 1, cy + cornerLift);
    ctx.quadraticCurveTo(cx, cy + gapH * 1.18, cx - halfW + 1, cy + cornerLift);
    ctx.closePath();

    const mouthCavity = ctx.createLinearGradient(cx, cy - gapH * 0.4, cx, cy + gapH);
    mouthCavity.addColorStop(0, '#2c0b14');
    mouthCavity.addColorStop(1, '#4c1726');
    ctx.fillStyle = mouthCavity;
    ctx.fill();

    ctx.save();
    ctx.clip();
    // Doğal üst diş sırası (hafif yumuşak fildişi tonu)
    if (gapH > 2.3 && viseme !== 'round') {
      const teethGrad = ctx.createLinearGradient(cx - halfW * 0.7, cy, cx + halfW * 0.7, cy);
      teethGrad.addColorStop(0, '#dce3ec');
      teethGrad.addColorStop(0.25, '#f8fafc');
      teethGrad.addColorStop(0.75, '#f8fafc');
      teethGrad.addColorStop(1, '#dce3ec');
      ctx.fillStyle = teethGrad;
      roundRectPath(
        ctx,
        cx - halfW * 0.68,
        cy - gapH * 0.46,
        halfW * 1.36,
        Math.min(4.8, gapH * 0.54),
        [0, 0, 2, 2],
      );
      ctx.fill();
    }

    // Dil
    const tongueGrad = ctx.createRadialGradient(cx, cy + gapH * 0.78, 1, cx, cy + gapH * 0.85, halfW * 0.6);
    tongueGrad.addColorStop(0, '#be4b60');
    tongueGrad.addColorStop(1, '#88293b');
    ctx.fillStyle = tongueGrad;
    ctx.beginPath();
    ctx.ellipse(cx, cy + gapH * 0.86, halfW * 0.54, gapH * 0.46, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Üst dudak (Cupid's bow + 3B dikey gradyan)
  const upGrad = ctx.createLinearGradient(cx, cy - 7 - gapH * 0.25, cx, cy + 1);
  upGrad.addColorStop(0, upperLipColor);
  upGrad.addColorStop(1, lipShadowColor);
  ctx.fillStyle = upGrad;
  ctx.beginPath();
  ctx.moveTo(cx - halfW, cy + cornerLift);
  ctx.bezierCurveTo(
    cx - halfW * 0.52,
    cy - 5.4 - gapH * 0.24,
    cx - 3.8,
    cy - 6.4 - gapH * 0.24,
    cx,
    cy - 4.5 - gapH * 0.24,
  );
  ctx.bezierCurveTo(
    cx + 3.8,
    cy - 6.4 - gapH * 0.24,
    cx + halfW * 0.52,
    cy - 5.4 - gapH * 0.24,
    cx + halfW,
    cy + cornerLift,
  );
  ctx.quadraticCurveTo(cx, cy - gapH * 0.34 + 0.8, cx - halfW, cy + cornerLift);
  ctx.closePath();
  ctx.fill();

  // Alt dudak (hacimli yastık + specular ışık)
  const lowGrad = ctx.createLinearGradient(cx, cy + gapH * 0.4, cx, cy + gapH * 1.15 + 8);
  lowGrad.addColorStop(0, lowerLipColor);
  lowGrad.addColorStop(0.7, upperLipColor);
  lowGrad.addColorStop(1, lipShadowColor);
  ctx.fillStyle = lowGrad;
  ctx.beginPath();
  ctx.moveTo(cx - halfW + 0.6, cy + cornerLift);
  ctx.quadraticCurveTo(cx, cy + gapH * 1.04, cx + halfW - 0.6, cy + cornerLift);
  ctx.quadraticCurveTo(cx, cy + gapH * 1.15 + 7.8, cx - halfW + 0.6, cy + cornerLift);
  ctx.closePath();
  ctx.fill();

  // Alt dudak doğal nem ışıltısı
  ctx.fillStyle = 'rgba(255, 248, 248, 0.25)';
  ctx.beginPath();
  ctx.ellipse(cx - 2, cy + gapH * 0.82 + 3.1, halfW * 0.28, 1.4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Ağız köşeleri mikro gölgesi (commissures)
  ctx.fillStyle = 'rgba(72, 24, 34, 0.38)';
  ctx.beginPath();
  ctx.arc(cx - halfW, cy + cornerLift, 1.4, 0, Math.PI * 2);
  ctx.arc(cx + halfW, cy + cornerLift, 1.4, 0, Math.PI * 2);
  ctx.fill();

  if (gapH <= 1.25) {
    ctx.strokeStyle = 'rgba(67, 19, 32, 0.58)';
    ctx.lineWidth = 1.45;
    ctx.beginPath();
    ctx.moveTo(cx - halfW, cy + cornerLift);
    ctx.quadraticCurveTo(cx, cy + 1.1, cx + halfW, cy + cornerLift);
    ctx.stroke();
  }

  // Alt dudak altı çene oluğu (mentolabial sulcus)
  ctx.strokeStyle = 'rgba(118, 68, 50, 0.22)';
  ctx.lineWidth = 1.7;
  ctx.beginPath();
  ctx.arc(cx, cy + gapH + 13.5, 8.5, Math.PI * 1.16, Math.PI * 1.84);
  ctx.stroke();

  ctx.restore();
}

/** Anatomik baş şekli (alın, şakak, elmacık kemiği ve çene hattı Bezier konturu) */
function traceHeadPath(
  ctx: CanvasRenderingContext2D,
  hx: number,
  hy: number,
  w: number,
  h: number,
  jawTaper: number,
) {
  ctx.beginPath();
  ctx.moveTo(hx, hy - h * 0.52);
  ctx.bezierCurveTo(
    hx + w * 0.48,
    hy - h * 0.52,
    hx + w * 0.53,
    hy - h * 0.19,
    hx + w * 0.5,
    hy + h * 0.04,
  );
  ctx.bezierCurveTo(
    hx + w * 0.49,
    hy + h * 0.24,
    hx + w * jawTaper,
    hy + h * 0.45,
    hx,
    hy + h * 0.52,
  );
  ctx.bezierCurveTo(
    hx - w * jawTaper,
    hy + h * 0.45,
    hx - w * 0.49,
    hy + h * 0.24,
    hx - w * 0.5,
    hy + h * 0.04,
  );
  ctx.bezierCurveTo(
    hx - w * 0.53,
    hy - h * 0.19,
    hx - w * 0.48,
    hy - h * 0.52,
    hx,
    hy - h * 0.52,
  );
  ctx.closePath();
}

/** 5 parmaklı, başparmak ve gömleğin manşet detayına sahip anatomik anlatım eli */
function drawArticulatedHandGesture(
  ctx: CanvasRenderingContext2D,
  side: 1 | -1, // 1 = Deniz (sağa uzanan iç el), -1 = Barış (sola uzanan iç el)
  shoulderX: number,
  shoulderY: number,
  deskY: number,
  sleeveColor: string,
  skinLight: string,
  skinShadow: string,
  t: number,
) {
  ctx.save();
  const wave = Math.sin(t * 2.7 + (side === 1 ? 0 : 0.7)) * 5.5;
  const wristX = shoulderX + side * (78 + Math.cos(t * 1.8) * 4.5);
  const wristY = deskY - 22 + wave;

  // Ceket kolu
  ctx.strokeStyle = sleeveColor;
  ctx.lineWidth = 29;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(shoulderX + side * 102, shoulderY + 94);
  ctx.quadraticCurveTo(shoulderX + side * 112, deskY - 4, wristX - side * 10, wristY + 7);
  ctx.stroke();

  // Gömlek/bluz beyaz manşet ucu
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 21;
  ctx.beginPath();
  ctx.moveTo(wristX - side * 9, wristY + 6);
  ctx.lineTo(wristX - side * 3, wristY + 3);
  ctx.stroke();

  // Avuç içi (3B gölgeli)
  ctx.translate(wristX + side * 5, wristY);
  ctx.rotate(side * -0.22);

  const palmGrad = ctx.createLinearGradient(-12, -10, 12, 12);
  palmGrad.addColorStop(0, skinLight);
  palmGrad.addColorStop(1, skinShadow);
  ctx.fillStyle = palmGrad;
  ctx.beginPath();
  ctx.ellipse(0, 1, 14.5, 9.8, 0, 0, Math.PI * 2);
  ctx.fill();

  // Başparmak (yukarı doğal açık)
  ctx.strokeStyle = skinLight;
  ctx.lineWidth = 4.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-side * 4, -4);
  ctx.quadraticCurveTo(side * 2, -13, side * 9, -14);
  ctx.stroke();

  // 4 kavisli parmak (işaret -> serçe)
  const lengths = [16.5, 18, 16.5, 13.5];
  for (let f = 0; f < 4; f++) {
    const baseY = -5 + f * 3.3;
    const spread = (-0.28 + f * 0.19) * side;
    const len = lengths[f];
    ctx.strokeStyle = f >= 2 ? skinShadow : skinLight;
    ctx.lineWidth = 4.1 - f * 0.25;
    ctx.beginPath();
    ctx.moveTo(side * 9, baseY);
    ctx.quadraticCurveTo(
      side * (9 + len * 0.55),
      baseY + Math.sin(spread) * 6 - 1.2,
      side * (9 + len),
      baseY + Math.sin(spread) * 11,
    );
    ctx.stroke();
  }

  ctx.restore();
}

// ============================================================================
// DR. DENİZ (SOL ANLATICI — AKADEMİSYEN SUNUCU)
// ============================================================================
function drawDenizPresenter(
  ctx: CanvasRenderingContext2D,
  cx: number,
  deskY: number,
  speaking: boolean,
  coHostSpeaking: boolean,
  viseme: Viseme,
  mouthOpen: number,
  inBreath: boolean,
  boardFocusX: number,
  boardFocusY: number,
  now: number,
) {
  ctx.save();
  const t = now / 1000;
  const breathe = Math.sin(t * 1.75) * 2.1;
  const listenNod = coHostSpeaking ? Math.sin(t * 2.05) * 1.9 : 0;
  const speakCadence = speaking && !inBreath ? Math.sin(t * 4.1) * 1.3 : 0;
  const headTilt = speaking
    ? Math.sin(t * 1.05) * 0.02
    : coHostSpeaking
    ? 0.018 + Math.sin(t * 0.8) * 0.008
    : Math.sin(t * 0.65) * 0.01;

  const shoulderY = deskY - 196 + breathe * 0.55;
  const hx = cx + (speaking ? Math.sin(t * 0.88) * 2.2 : coHostSpeaking ? 2.0 : 0);
  const hy = shoulderY - 114 + breathe * 0.38 + listenNod + speakCadence;

  // Konuşmacı arka stüdyo yumuşak portre rim ışığı
  const auraAlpha = speaking ? 0.2 : 0.06;
  const aura = ctx.createRadialGradient(cx + 12, hy + 50, 20, cx + 12, hy + 50, 240);
  aura.addColorStop(0, `rgba(34, 211, 238, ${auraAlpha})`);
  aura.addColorStop(1, 'rgba(34, 211, 238, 0)');
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(cx + 12, hy + 50, 240, 0, Math.PI * 2);
  ctx.fill();

  // 1. Arka hacimli katmanlı kestane saç + tel detayları
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(headTilt);
  const backHairGrad = ctx.createLinearGradient(-70, -82, 70, 138);
  backHairGrad.addColorStop(0, '#44261a');
  backHairGrad.addColorStop(0.45, '#2b160e');
  backHairGrad.addColorStop(1, '#160a06');
  ctx.fillStyle = backHairGrad;
  ctx.beginPath();
  ctx.moveTo(-66, -24);
  ctx.bezierCurveTo(-86, 26, -90, 94, -72, 136);
  ctx.quadraticCurveTo(0, 150, 75, 134);
  ctx.bezierCurveTo(90, 92, 86, 24, 66, -24);
  ctx.bezierCurveTo(55, -78, -55, -78, -66, -24);
  ctx.closePath();
  ctx.fill();

  // Arka saç ince dalga telleri
  ctx.strokeStyle = 'rgba(130, 76, 50, 0.25)';
  ctx.lineWidth = 1.6;
  for (let w = -2; w <= 2; w++) {
    if (w === 0) continue;
    ctx.beginPath();
    ctx.moveTo(w * 28, 12);
    ctx.bezierCurveTo(w * 34, 58, w * 32, 98, w * 27, 130);
    ctx.stroke();
  }
  ctx.restore();

  // 2. Anatomik boyun, sternokleidomastoid kası ve köprücük kemiği çukuru
  const neckGrad = ctx.createLinearGradient(hx - 24, hy + 46, hx + 24, shoulderY + 36);
  neckGrad.addColorStop(0, '#cfa086');
  neckGrad.addColorStop(0.48, '#eec4ab');
  neckGrad.addColorStop(1, '#dba98e');
  ctx.fillStyle = neckGrad;
  ctx.beginPath();
  ctx.moveTo(hx - 21, hy + 46);
  ctx.lineTo(hx - 25, shoulderY + 26);
  ctx.quadraticCurveTo(cx, shoulderY + 54, hx + 25, shoulderY + 26);
  ctx.lineTo(hx + 21, hy + 46);
  ctx.closePath();
  ctx.fill();

  // Boyun tendon ve suprasternal çukur gölgesi
  ctx.strokeStyle = 'rgba(148, 92, 70, 0.22)';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(hx - 15, hy + 66);
  ctx.quadraticCurveTo(cx - 5, shoulderY + 20, cx - 3, shoulderY + 30);
  ctx.moveTo(hx + 15, hy + 66);
  ctx.quadraticCurveTo(cx + 5, shoulderY + 20, cx + 3, shoulderY + 30);
  ctx.stroke();

  const chinCast = ctx.createLinearGradient(0, hy + 52, 0, hy + 86);
  chinCast.addColorStop(0, 'rgba(84, 44, 30, 0.38)');
  chinCast.addColorStop(1, 'rgba(84, 44, 30, 0)');
  ctx.fillStyle = chinCast;
  ctx.fillRect(hx - 25, hy + 52, 50, 34);

  // 3. Özel dikim gece-laciverti stüdyo ceketi + pilili ipek bluz
  const blazerGrad = ctx.createLinearGradient(cx - 140, shoulderY, cx + 140, deskY + 20);
  blazerGrad.addColorStop(0, '#21375b');
  blazerGrad.addColorStop(0.48, '#14233c');
  blazerGrad.addColorStop(1, '#091120');
  ctx.fillStyle = blazerGrad;
  ctx.beginPath();
  ctx.moveTo(cx - 144, deskY + 20);
  ctx.bezierCurveTo(cx - 142, shoulderY + 70, cx - 124, shoulderY + 13, cx - 44, shoulderY + 4);
  ctx.lineTo(cx + 44, shoulderY + 4);
  ctx.bezierCurveTo(cx + 124, shoulderY + 13, cx + 142, shoulderY + 70, cx + 144, deskY + 20);
  ctx.closePath();
  ctx.fill();

  // Omuz dikiş çizgileri + akıllı tahtadan gelen camgöbeği rim ışığı
  ctx.strokeStyle = 'rgba(8, 15, 28, 0.55)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(cx - 106, shoulderY + 28);
  ctx.quadraticCurveTo(cx - 96, shoulderY + 74, cx - 102, deskY);
  ctx.moveTo(cx + 106, shoulderY + 28);
  ctx.quadraticCurveTo(cx + 96, shoulderY + 74, cx + 102, deskY);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(103, 232, 249, 0.38)';
  ctx.lineWidth = 2.1;
  ctx.beginPath();
  ctx.moveTo(cx + 44, shoulderY + 5);
  ctx.bezierCurveTo(cx + 120, shoulderY + 14, cx + 138, shoulderY + 68, cx + 142, deskY);
  ctx.stroke();

  // Fildişi ipek bluz + kumaş pilileri
  const blouseGrad = ctx.createLinearGradient(cx - 30, shoulderY + 8, cx + 30, shoulderY + 118);
  blouseGrad.addColorStop(0, '#f8fafc');
  blouseGrad.addColorStop(0.65, '#e2e8f0');
  blouseGrad.addColorStop(1, '#cbd5e1');
  ctx.fillStyle = blouseGrad;
  ctx.beginPath();
  ctx.moveTo(cx - 33, shoulderY + 6);
  ctx.lineTo(cx, shoulderY + 112);
  ctx.lineTo(cx + 33, shoulderY + 6);
  ctx.quadraticCurveTo(cx, shoulderY + 24, cx - 33, shoulderY + 6);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(cx - 12, shoulderY + 34);
  ctx.lineTo(cx - 3, shoulderY + 96);
  ctx.moveTo(cx + 12, shoulderY + 34);
  ctx.lineTo(cx + 3, shoulderY + 96);
  ctx.stroke();

  // Zarif altın kolye ve inci uç
  ctx.strokeStyle = 'rgba(245, 192, 78, 0.85)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(cx - 21, shoulderY + 16);
  ctx.quadraticCurveTo(cx, shoulderY + 53, cx + 21, shoulderY + 16);
  ctx.stroke();
  ctx.fillStyle = '#fde68a';
  ctx.beginPath();
  ctx.arc(cx, shoulderY + 37, 3.2, 0, Math.PI * 2);
  ctx.fill();

  // Özel dikim ceket klapaları + ince terzi dikişi
  const lapelGrad = ctx.createLinearGradient(cx - 56, shoulderY + 5, cx + 56, shoulderY + 120);
  lapelGrad.addColorStop(0, '#29436d');
  lapelGrad.addColorStop(1, '#172845');
  ctx.fillStyle = lapelGrad;

  ctx.beginPath();
  ctx.moveTo(cx - 33, shoulderY + 5);
  ctx.lineTo(cx - 58, shoulderY + 42);
  ctx.lineTo(cx - 45, shoulderY + 48);
  ctx.lineTo(cx - 54, shoulderY + 63);
  ctx.lineTo(cx - 4, shoulderY + 120);
  ctx.lineTo(cx - 23, shoulderY + 38);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(cx + 33, shoulderY + 5);
  ctx.lineTo(cx + 58, shoulderY + 42);
  ctx.lineTo(cx + 45, shoulderY + 48);
  ctx.lineTo(cx + 54, shoulderY + 63);
  ctx.lineTo(cx + 4, shoulderY + 120);
  ctx.lineTo(cx + 23, shoulderY + 38);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(148, 184, 232, 0.22)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - 54, shoulderY + 63);
  ctx.lineTo(cx - 5, shoulderY + 118);
  ctx.moveTo(cx + 54, shoulderY + 63);
  ctx.lineTo(cx + 5, shoulderY + 118);
  ctx.stroke();

  // Profesyonel yaka mikrofonu (lavalier windscreen + klips + kablo)
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(cx + 30, shoulderY + 78);
  ctx.quadraticCurveTo(cx + 34, shoulderY + 102, cx + 26, deskY);
  ctx.stroke();
  ctx.fillStyle = '#0b101b';
  roundRectPath(ctx, cx + 26, shoulderY + 65, 7.5, 13.5, 3.5);
  ctx.fill();
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(cx + 23, shoulderY + 71, 4.5, 2.2);

  // 4. Baş ve Yüksek Gerçekçilikte Yüz Hatları
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(headTilt);

  // Anatomik kulaklar + inci küpeler
  drawDetailedEar(ctx, -56.5, 6, -1, '#e8b99e', '#c99174', true);
  drawDetailedEar(ctx, 56.5, 6, 1, '#ecc0a6', '#ce9679', true);

  // 3B çok katmanlı cilt ışıklandırması
  traceHeadPath(ctx, 0, 0, 114, 136, 0.31);
  const skinGrad = ctx.createRadialGradient(14, -18, 10, 0, 6, 88);
  skinGrad.addColorStop(0, '#fce4d4');
  skinGrad.addColorStop(0.54, '#f1c4a8');
  skinGrad.addColorStop(0.86, '#dfa788');
  skinGrad.addColorStop(1, '#c98e6f');
  ctx.fillStyle = skinGrad;
  ctx.fill();

  // Yüz içi 3B düzlem gölgeleri ve elmacık kemiği ışıltısı (clipped)
  ctx.save();
  traceHeadPath(ctx, 0, 0, 114, 136, 0.31);
  ctx.clip();

  // Sağ kenar akıllı tahta mavi-camgöbeği rim yansıması
  const faceRim = ctx.createLinearGradient(36, 0, 58, 0);
  faceRim.addColorStop(0, 'rgba(103, 232, 249, 0)');
  faceRim.addColorStop(1, 'rgba(103, 232, 249, 0.22)');
  ctx.fillStyle = faceRim;
  ctx.fillRect(34, -70, 26, 140);

  // Sol dış çene/şakak derinlik gölgesi
  const jawShadeL = ctx.createLinearGradient(-58, 0, -28, 0);
  jawShadeL.addColorStop(0, 'rgba(124, 72, 52, 0.24)');
  jawShadeL.addColorStop(1, 'rgba(124, 72, 52, 0)');
  ctx.fillStyle = jawShadeL;
  ctx.fillRect(-60, -68, 34, 140);

  // Elmacık kemiği sıcak doğal canlılık + üst highlight
  const cheekL = ctx.createRadialGradient(-33, 18, 2, -33, 18, 23);
  cheekL.addColorStop(0, 'rgba(226, 118, 124, 0.2)');
  cheekL.addColorStop(1, 'rgba(226, 118, 124, 0)');
  ctx.fillStyle = cheekL;
  ctx.fillRect(-56, -6, 46, 46);

  const cheekR = ctx.createRadialGradient(34, 18, 2, 34, 18, 23);
  cheekR.addColorStop(0, 'rgba(226, 118, 124, 0.2)');
  cheekR.addColorStop(1, 'rgba(226, 118, 124, 0)');
  ctx.fillStyle = cheekR;
  ctx.fillRect(12, -6, 46, 46);

  ctx.fillStyle = 'rgba(255, 247, 240, 0.22)';
  ctx.beginPath();
  ctx.ellipse(-30, 8, 11, 5.5, -0.25, 0, Math.PI * 2);
  ctx.ellipse(31, 8, 11, 5.5, 0.25, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  // Akıllı tahta odak noktasına ve Barış'a duyarlı doğal bakış
  const lookBoardCycle = Math.sin(t * 0.62);
  const boardOffsetX = clamp((boardFocusX - cx) / 520, -1, 1) * 2.5;
  const boardOffsetY = clamp((boardFocusY - hy) / 380, -1, 1) * 1.1;
  const gazeX = speaking
    ? lookBoardCycle > 0.52
      ? boardOffsetX
      : 0.6
    : coHostSpeaking
    ? 2.8
    : boardOffsetX;
  const gazeY = speaking ? (lookBoardCycle > 0.52 ? boardOffsetY : 0.15) : -0.2;
  const blink = computeBlink(now, 0.4);

  // Canlı ela-kehribar gözler
  drawLifelikeEye(
    ctx,
    -23.5,
    -4,
    13.6,
    7.8,
    -1,
    '#2d1c10',
    '#6e4724',
    '#b57c3c',
    gazeX,
    gazeY,
    blink,
    true,
    'rgba(124, 74, 54, 0.34)',
  );
  drawLifelikeEye(
    ctx,
    23.5,
    -4,
    13.6,
    7.8,
    1,
    '#2d1c10',
    '#6e4724',
    '#b57c3c',
    gazeX,
    gazeY,
    blink,
    true,
    'rgba(124, 74, 54, 0.34)',
  );

  // Tel tel doğal kavisli kaşlar
  const browLift = speaking ? Math.max(0, Math.sin(t * 2.4)) * 2.5 : coHostSpeaking ? 0.8 : 0;
  drawNaturalEyebrow(ctx, -1, browLift, '#2e1910', 'rgba(64, 36, 24, 0.42)', false);
  drawNaturalEyebrow(ctx, 1, browLift, '#2e1910', 'rgba(64, 36, 24, 0.42)', false);

  // İnce şampanya-titanyum akademik gözlük (saplar, burun pedi ve anti-refle yansıma)
  ctx.save();
  // Kulaklara giden gözlük sapları
  ctx.strokeStyle = 'rgba(196, 158, 98, 0.78)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-42, -8);
  ctx.lineTo(-55, -2);
  ctx.moveTo(42, -8);
  ctx.lineTo(55, -2);
  ctx.stroke();

  // Çerçeveler
  ctx.strokeStyle = 'rgba(216, 178, 114, 0.92)';
  ctx.lineWidth = 1.85;
  roundRectPath(ctx, -41.5, -16, 34.5, 24, 9);
  ctx.stroke();
  roundRectPath(ctx, 7, -16, 34.5, 24, 9);
  ctx.stroke();

  // Köprü ve burun pedleri
  ctx.beginPath();
  ctx.moveTo(-7, -6.5);
  ctx.quadraticCurveTo(0, -9.5, 7, -6.5);
  ctx.stroke();
  ctx.fillStyle = 'rgba(226, 196, 142, 0.75)';
  ctx.beginPath();
  ctx.ellipse(-6.2, -1.5, 1.2, 2.5, 0.2, 0, Math.PI * 2);
  ctx.ellipse(6.2, -1.5, 1.2, 2.5, -0.2, 0, Math.PI * 2);
  ctx.fill();

  // Anti-refle cam yansıması
  ctx.strokeStyle = 'rgba(165, 243, 252, 0.22)';
  ctx.lineWidth = 2.1;
  ctx.beginPath();
  ctx.moveTo(-36, -12);
  ctx.lineTo(-27, 4);
  ctx.moveTo(12, -12);
  ctx.lineTo(21, 4);
  ctx.stroke();
  ctx.restore();

  // Anatomik burun ve filtrum
  drawSculptedNoseAndPhiltrum(
    ctx,
    0,
    -4,
    25.5,
    1,
    'rgba(142, 86, 64, 0.44)',
    'rgba(255, 246, 238, 0.46)',
  );

  // Dudaklar (gerçek ses enerjisi + Türkçe viseme senkronlu)
  drawLifelikeMouth(
    ctx,
    0,
    38,
    viseme,
    inBreath ? 0.03 : mouthOpen,
    speaking && !inBreath,
    '#b65965',
    '#cc6d79',
    '#8c3c48',
  );

  // Ön katmanlı dalgalı kestane saç + tel tel ışıltılar
  const frontHairGrad = ctx.createLinearGradient(-56, -78, 56, 26);
  frontHairGrad.addColorStop(0, '#512f20');
  frontHairGrad.addColorStop(0.5, '#361d13');
  frontHairGrad.addColorStop(1, '#21100a');
  ctx.fillStyle = frontHairGrad;

  // Sol dalga tutamı
  ctx.beginPath();
  ctx.moveTo(-19, -67);
  ctx.bezierCurveTo(-58, -65, -70, -28, -63, 28);
  ctx.bezierCurveTo(-56, -6, -46, -35, -18, -51);
  ctx.closePath();
  ctx.fill();

  // Sağ geniş dalga tutamı
  ctx.beginPath();
  ctx.moveTo(-22, -69);
  ctx.bezierCurveTo(18, -80, 66, -56, 64, 26);
  ctx.bezierCurveTo(56, -10, 37, -43, -18, -53);
  ctx.closePath();
  ctx.fill();

  // Saç ayrım çizgisi gölgesi ve ince ışıltı telleri
  ctx.strokeStyle = 'rgba(202, 138, 96, 0.32)';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(-10, -64);
  ctx.bezierCurveTo(22, -62, 46, -42, 55, -12);
  ctx.moveTo(-24, -61);
  ctx.bezierCurveTo(-46, -50, -56, -24, -58, 6);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(103, 232, 249, 0.2)';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(28, -62);
  ctx.bezierCurveTo(52, -46, 62, -16, 62, 18);
  ctx.stroke();

  ctx.restore();

  // 5. Konuşurken eklemli doğal anlatım jesti
  if (speaking) {
    drawArticulatedHandGesture(
      ctx,
      1,
      cx,
      shoulderY,
      deskY,
      '#162846',
      '#f1c5aa',
      '#d9a182',
      t,
    );
  }

  ctx.restore();
}

// ============================================================================
// BARIŞ (SAĞ SUNUCU — ARAŞTIRMACI & SORU SORAN)
// ============================================================================
function drawBarisPresenter(
  ctx: CanvasRenderingContext2D,
  cx: number,
  deskY: number,
  speaking: boolean,
  coHostSpeaking: boolean,
  viseme: Viseme,
  mouthOpen: number,
  inBreath: boolean,
  boardFocusX: number,
  boardFocusY: number,
  now: number,
) {
  ctx.save();
  const t = now / 1000;
  const breathe = Math.sin(t * 1.85 + 1.2) * 2.1;
  const listenNod = coHostSpeaking ? Math.sin(t * 2.15 + 0.5) * 2.0 : 0;
  const speakCadence = speaking && !inBreath ? Math.sin(t * 4.35 + 0.4) * 1.4 : 0;
  const headTilt = speaking
    ? Math.sin(t * 1.02) * -0.02
    : coHostSpeaking
    ? -0.018 + Math.sin(t * 0.75) * 0.008
    : Math.sin(t * 0.62) * 0.011;

  const shoulderY = deskY - 202 + breathe * 0.55;
  const hx = cx + (speaking ? Math.sin(t * 0.92) * -2.2 : coHostSpeaking ? -2.0 : 0);
  const hy = shoulderY - 116 + breathe * 0.38 + listenNod + speakCadence;

  // Arka stüdyo portre rim ışığı
  const auraAlpha = speaking ? 0.2 : 0.06;
  const aura = ctx.createRadialGradient(cx - 12, hy + 50, 20, cx - 12, hy + 50, 240);
  aura.addColorStop(0, `rgba(168, 85, 247, ${auraAlpha})`);
  aura.addColorStop(1, 'rgba(168, 85, 247, 0)');
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(cx - 12, hy + 50, 240, 0, Math.PI * 2);
  ctx.fill();

  // 1. Anatomik erkek boynu ve kas gölgeleri
  const neckGrad = ctx.createLinearGradient(hx - 26, hy + 46, hx + 26, shoulderY + 32);
  neckGrad.addColorStop(0, '#c58e6e');
  neckGrad.addColorStop(0.52, '#e2b394');
  neckGrad.addColorStop(1, '#c89272');
  ctx.fillStyle = neckGrad;
  ctx.beginPath();
  ctx.moveTo(hx - 24, hy + 46);
  ctx.lineTo(hx - 29, shoulderY + 26);
  ctx.quadraticCurveTo(cx, shoulderY + 48, hx + 29, shoulderY + 26);
  ctx.lineTo(hx + 24, hy + 46);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(120, 72, 52, 0.22)';
  ctx.lineWidth = 1.9;
  ctx.beginPath();
  ctx.moveTo(hx - 17, hy + 66);
  ctx.quadraticCurveTo(cx - 6, shoulderY + 18, cx - 3, shoulderY + 28);
  ctx.moveTo(hx + 17, hy + 66);
  ctx.quadraticCurveTo(cx + 6, shoulderY + 18, cx + 3, shoulderY + 28);
  ctx.stroke();

  const chinShadow = ctx.createLinearGradient(0, hy + 54, 0, hy + 86);
  chinShadow.addColorStop(0, 'rgba(72, 38, 25, 0.4)');
  chinShadow.addColorStop(1, 'rgba(72, 38, 25, 0)');
  ctx.fillStyle = chinShadow;
  ctx.fillRect(hx - 29, hy + 54, 58, 32);

  // 2. Özel dikim antrasit ceket + merinos bordo triko + beyaz Oxford gömlek yakası
  const jacketGrad = ctx.createLinearGradient(cx - 152, shoulderY, cx + 152, deskY + 20);
  jacketGrad.addColorStop(0, '#232e3f');
  jacketGrad.addColorStop(0.55, '#131b29');
  jacketGrad.addColorStop(1, '#080c14');
  ctx.fillStyle = jacketGrad;
  ctx.beginPath();
  ctx.moveTo(cx - 154, deskY + 20);
  ctx.bezierCurveTo(cx - 152, shoulderY + 68, cx - 132, shoulderY + 12, cx - 48, shoulderY + 2);
  ctx.lineTo(cx + 48, shoulderY + 2);
  ctx.bezierCurveTo(cx + 132, shoulderY + 12, cx + 152, shoulderY + 68, cx + 154, deskY + 20);
  ctx.closePath();
  ctx.fill();

  // Omuz dikişleri + sol rim ışığı
  ctx.strokeStyle = 'rgba(7, 10, 18, 0.6)';
  ctx.lineWidth = 1.7;
  ctx.beginPath();
  ctx.moveTo(cx - 112, shoulderY + 28);
  ctx.quadraticCurveTo(cx - 102, shoulderY + 76, cx - 108, deskY);
  ctx.moveTo(cx + 112, shoulderY + 28);
  ctx.quadraticCurveTo(cx + 102, shoulderY + 76, cx + 108, deskY);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(192, 132, 252, 0.38)';
  ctx.lineWidth = 2.1;
  ctx.beginPath();
  ctx.moveTo(cx - 48, shoulderY + 3);
  ctx.bezierCurveTo(cx - 128, shoulderY + 13, cx - 148, shoulderY + 66, cx - 152, deskY);
  ctx.stroke();

  // İç merinos bordo triko kazak + yaka ribana dokusu
  const knitGrad = ctx.createLinearGradient(cx, shoulderY + 12, cx, deskY);
  knitGrad.addColorStop(0, '#78203c');
  knitGrad.addColorStop(0.6, '#541429');
  knitGrad.addColorStop(1, '#340b19');
  ctx.fillStyle = knitGrad;
  ctx.beginPath();
  ctx.moveTo(cx - 64, deskY + 20);
  ctx.lineTo(cx - 42, shoulderY + 10);
  ctx.quadraticCurveTo(cx, shoulderY + 35, cx + 42, shoulderY + 10);
  ctx.lineTo(cx + 64, deskY + 20);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(244, 114, 182, 0.2)';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(cx - 38, shoulderY + 12);
  ctx.quadraticCurveTo(cx, shoulderY + 36, cx + 38, shoulderY + 12);
  ctx.stroke();

  // Beyaz Oxford gömlek yakası + sedef düğme
  const collarGrad = ctx.createLinearGradient(cx, shoulderY - 4, cx, shoulderY + 28);
  collarGrad.addColorStop(0, '#f8fafc');
  collarGrad.addColorStop(1, '#cbd5e1');
  ctx.fillStyle = collarGrad;
  ctx.beginPath();
  ctx.moveTo(cx - 29, shoulderY + 2);
  ctx.lineTo(cx - 14, shoulderY + 29);
  ctx.lineTo(cx - 1, shoulderY + 18);
  ctx.lineTo(cx - 22, shoulderY - 5);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(cx + 29, shoulderY + 2);
  ctx.lineTo(cx + 14, shoulderY + 29);
  ctx.lineTo(cx + 1, shoulderY + 18);
  ctx.lineTo(cx + 22, shoulderY - 5);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#e2e8f0';
  ctx.beginPath();
  ctx.arc(cx, shoulderY + 21, 2.2, 0, Math.PI * 2);
  ctx.fill();

  // Ceket klapaları + ilik detayı
  const lapelGrad = ctx.createLinearGradient(cx - 68, shoulderY + 4, cx + 68, shoulderY + 150);
  lapelGrad.addColorStop(0, '#2e3c52');
  lapelGrad.addColorStop(1, '#192231');
  ctx.fillStyle = lapelGrad;

  ctx.beginPath();
  ctx.moveTo(cx - 40, shoulderY + 4);
  ctx.lineTo(cx - 68, shoulderY + 48);
  ctx.lineTo(cx - 56, shoulderY + 54);
  ctx.lineTo(cx - 65, shoulderY + 68);
  ctx.lineTo(cx - 46, shoulderY + 152);
  ctx.lineTo(cx - 32, shoulderY + 22);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(cx + 40, shoulderY + 4);
  ctx.lineTo(cx + 68, shoulderY + 48);
  ctx.lineTo(cx + 56, shoulderY + 54);
  ctx.lineTo(cx + 65, shoulderY + 68);
  ctx.lineTo(cx + 46, shoulderY + 152);
  ctx.lineTo(cx + 32, shoulderY + 22);
  ctx.closePath();
  ctx.fill();

  // Sol klapa ilik dikişi + yaka mikrofonu
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(cx - 57, shoulderY + 73);
  ctx.lineTo(cx - 49, shoulderY + 75);
  ctx.stroke();

  ctx.fillStyle = '#0b101b';
  roundRectPath(ctx, cx - 50, shoulderY + 86, 7.5, 13.5, 3.5);
  ctx.fill();
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(cx - 45, shoulderY + 92, 4.5, 2.2);

  // 3. Baş & Yüksek Detaylı Erkek Yüzü
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(headTilt);

  // Arka/yan kademeli kısa kesim saç tabanı
  ctx.fillStyle = '#171210';
  ctx.beginPath();
  ctx.ellipse(0, -18, 60.5, 56, 0, Math.PI * 0.86, Math.PI * 2.14);
  ctx.fill();

  // Anatomik kulaklar
  drawDetailedEar(ctx, -58.5, 6, -1, '#dfa989', '#be8464', false);
  drawDetailedEar(ctx, 58.5, 6, 1, '#da9f7e', '#b97f5f', false);

  // 3B yüz cildi ışıklandırması
  traceHeadPath(ctx, 0, 0, 116, 138, 0.36);
  const skinGrad = ctx.createRadialGradient(-14, -18, 10, 0, 6, 90);
  skinGrad.addColorStop(0, '#f3c8ab');
  skinGrad.addColorStop(0.56, '#e2af8e');
  skinGrad.addColorStop(0.88, '#cc9473');
  skinGrad.addColorStop(1, '#b67d5d');
  ctx.fillStyle = skinGrad;
  ctx.fill();

  // Yüz içi düzlem gölgeleri, rim ışığı ve doğal hafif kirli sakal dokusu
  ctx.save();
  traceHeadPath(ctx, 0, 0, 116, 138, 0.36);
  ctx.clip();

  // Sol iç kenar akıllı tahta mor-eflatun rim ışığı
  const rimL = ctx.createLinearGradient(-58, 0, -35, 0);
  rimL.addColorStop(0, 'rgba(192, 132, 252, 0.22)');
  rimL.addColorStop(1, 'rgba(192, 132, 252, 0)');
  ctx.fillStyle = rimL;
  ctx.fillRect(-60, -70, 26, 140);

  // Sağ dış elmacık/çene derinlik gölgesi
  const shadeR = ctx.createLinearGradient(28, 0, 58, 0);
  shadeR.addColorStop(0, 'rgba(104, 58, 40, 0)');
  shadeR.addColorStop(1, 'rgba(104, 58, 40, 0.24)');
  ctx.fillStyle = shadeR;
  ctx.fillRect(26, -68, 34, 140);

  // Elmacık kemiği sıcak doğal ton ve üst highlight
  ctx.fillStyle = 'rgba(255, 240, 228, 0.18)';
  ctx.beginPath();
  ctx.ellipse(-31, 8, 11, 5, -0.2, 0, Math.PI * 2);
  ctx.ellipse(31, 8, 11, 5, 0.2, 0, Math.PI * 2);
  ctx.fill();

  // Doğal mikro kirli sakal gölgesi (çene hattı ve bıyık gölgesi)
  const beardShadow = ctx.createLinearGradient(0, 14, 0, 72);
  beardShadow.addColorStop(0, 'rgba(38, 28, 25, 0)');
  beardShadow.addColorStop(0.5, 'rgba(38, 28, 25, 0.08)');
  beardShadow.addColorStop(1, 'rgba(38, 28, 25, 0.19)');
  ctx.fillStyle = beardShadow;
  ctx.fillRect(-60, 14, 120, 60);

  const mustacheShade = ctx.createRadialGradient(0, 29, 2, 0, 29, 22);
  mustacheShade.addColorStop(0, 'rgba(38, 28, 25, 0.12)');
  mustacheShade.addColorStop(1, 'rgba(38, 28, 25, 0)');
  ctx.fillStyle = mustacheShade;
  ctx.fillRect(-24, 20, 48, 16);

  ctx.restore();

  // Doğal bakış (tahtaya ve Deniz'e duyarlı)
  const lookCycle = Math.sin(t * 0.58 + 1.1);
  const boardOffsetX = clamp((boardFocusX - cx) / 520, -1, 1) * 2.5;
  const boardOffsetY = clamp((boardFocusY - hy) / 380, -1, 1) * 1.1;
  const gazeX = speaking
    ? lookCycle > 0.52
      ? boardOffsetX
      : -0.6
    : coHostSpeaking
    ? -2.8
    : boardOffsetX;
  const gazeY = speaking ? (lookCycle > 0.52 ? boardOffsetY : 0.15) : -0.2;
  const blink = computeBlink(now, 2.1);

  // Koyu kahve-kehribar lif dokulu gözler
  drawLifelikeEye(
    ctx,
    -23.5,
    -3,
    13.3,
    7.2,
    -1,
    '#1a0f09',
    '#422717',
    '#744629',
    gazeX,
    gazeY,
    blink,
    false,
    'rgba(108, 64, 46, 0.36)',
  );
  drawLifelikeEye(
    ctx,
    23.5,
    -3,
    13.3,
    7.2,
    1,
    '#1a0f09',
    '#422717',
    '#744629',
    gazeX,
    gazeY,
    blink,
    false,
    'rgba(108, 64, 46, 0.36)',
  );

  // Tel tel doğal erkek kaşları
  const browLift = speaking ? Math.max(0, Math.sin(t * 2.6)) * 2.8 : coHostSpeaking ? 0.7 : 0;
  drawNaturalEyebrow(ctx, -1, browLift, '#18110e', 'rgba(36, 26, 22, 0.48)', true);
  drawNaturalEyebrow(ctx, 1, browLift, '#18110e', 'rgba(36, 26, 22, 0.48)', true);

  // Anatomik burun ve filtrum
  drawSculptedNoseAndPhiltrum(
    ctx,
    0,
    -4,
    26.5,
    -1,
    'rgba(130, 78, 56, 0.46)',
    'rgba(255, 241, 230, 0.4)',
  );

  // Dudaklar
  drawLifelikeMouth(
    ctx,
    0,
    39,
    viseme,
    inBreath ? 0.03 : mouthOpen,
    speaking && !inBreath,
    '#9c5256',
    '#b36368',
    '#78383d',
  );

  // Katmanlı doğal dalgalı espresso saç + tel tel doku
  const hairGrad = ctx.createLinearGradient(-56, -84, 56, -16);
  hairGrad.addColorStop(0, '#2e2420');
  hairGrad.addColorStop(0.52, '#1c1512');
  hairGrad.addColorStop(1, '#100c0a');
  ctx.fillStyle = hairGrad;

  ctx.beginPath();
  ctx.moveTo(-56, -8);
  ctx.bezierCurveTo(-61, -45, -45, -78, -8, -82);
  ctx.bezierCurveTo(30, -86, 59, -65, 58, -10);
  ctx.bezierCurveTo(54, -27, 46, -43, 26, -47);
  ctx.bezierCurveTo(4, -51, -24, -49, -46, -35);
  ctx.bezierCurveTo(-52, -27, -54, -18, -56, -8);
  ctx.closePath();
  ctx.fill();

  // Alın üstü doğal hacimli perçem katmanı
  ctx.beginPath();
  ctx.moveTo(-44, -44);
  ctx.bezierCurveTo(-24, -71, 18, -76, 44, -48);
  ctx.bezierCurveTo(18, -55, -16, -52, -44, -44);
  ctx.closePath();
  ctx.fill();

  // Kademeli şakak favorileri (tapered sideburns)
  const sbGrad = ctx.createLinearGradient(0, -14, 0, 8);
  sbGrad.addColorStop(0, '#181210');
  sbGrad.addColorStop(1, 'rgba(24, 18, 16, 0.15)');
  ctx.fillStyle = sbGrad;
  ctx.fillRect(-57.5, -14, 5, 20);
  ctx.fillRect(52.5, -14, 5, 20);

  // Saç üstü tel tel stüdyo ışığı çizgileri
  ctx.strokeStyle = 'rgba(162, 136, 122, 0.25)';
  ctx.lineWidth = 1.7;
  ctx.beginPath();
  ctx.moveTo(-32, -60);
  ctx.quadraticCurveTo(2, -73, 36, -55);
  ctx.moveTo(-18, -68);
  ctx.quadraticCurveTo(12, -76, 42, -60);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(192, 132, 252, 0.2)';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(-54, -28);
  ctx.bezierCurveTo(-50, -56, -30, -74, -6, -78);
  ctx.stroke();

  ctx.restore();

  // 4. Konuşurken eklemli doğal anlatım jesti
  if (speaking) {
    drawArticulatedHandGesture(
      ctx,
      -1,
      cx,
      shoulderY,
      deskY,
      '#182231',
      '#e5b495',
      '#ca9373',
      t,
    );
  }

  ctx.restore();
}

/** Yayın stüdyosu masası, kondenser mikrofonlar ve modern sunucu isimlikleri */
function drawBroadcastDeskAndLowerThirds(
  ctx: CanvasRenderingContext2D,
  deskY: number,
  stageW: number,
  stageH: number,
  denizSpeaking: boolean,
  barisSpeaking: boolean,
  now: number,
) {
  ctx.save();

  const deskGrad = ctx.createLinearGradient(0, deskY, 0, stageH);
  deskGrad.addColorStop(0, 'rgba(13, 19, 35, 0.97)');
  deskGrad.addColorStop(0.35, 'rgba(8, 12, 23, 0.99)');
  deskGrad.addColorStop(1, '#04060d');
  ctx.fillStyle = deskGrad;
  ctx.beginPath();
  ctx.moveTo(0, deskY + 14);
  ctx.quadraticCurveTo(stageW / 2, deskY - 12, stageW, deskY + 14);
  ctx.lineTo(stageW, stageH);
  ctx.lineTo(0, stageH);
  ctx.closePath();
  ctx.fill();

  const edgeGrad = ctx.createLinearGradient(0, 0, stageW, 0);
  edgeGrad.addColorStop(0, 'rgba(34, 211, 238, 0.48)');
  edgeGrad.addColorStop(0.5, 'rgba(148, 163, 184, 0.24)');
  edgeGrad.addColorStop(1, 'rgba(168, 85, 247, 0.48)');
  ctx.strokeStyle = edgeGrad;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, deskY + 14);
  ctx.quadraticCurveTo(stageW / 2, deskY - 12, stageW, deskY + 14);
  ctx.stroke();

  const drawDeskMic = (mx: number, dir: 1 | -1, active: boolean, accent: string) => {
    ctx.save();
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(mx, deskY + 16);
    ctx.quadraticCurveTo(mx + dir * 10, deskY - 22, mx - dir * 18, deskY - 40);
    ctx.stroke();

    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.ellipse(mx, deskY + 16, 18, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.translate(mx - dir * 21, deskY - 43);
    ctx.rotate(dir * -0.45);
    roundRectPath(ctx, -8, -14, 16, 26, 8);
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    ctx.strokeStyle = active ? accent : '#475569';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  };

  drawDeskMic(308, 1, denizSpeaking, '#22d3ee');
  drawDeskMic(stageW - 308, -1, barisSpeaking, '#c084fc');

  const drawBadge = (
    bx: number,
    by: number,
    name: string,
    role: string,
    accent: string,
    active: boolean,
  ) => {
    const bw = 250;
    const bh = 58;
    ctx.save();
    roundRectPath(ctx, bx, by, bw, bh, 14);
    ctx.fillStyle = 'rgba(7, 11, 22, 0.9)';
    ctx.fill();
    ctx.strokeStyle = active ? accent : 'rgba(148, 163, 184, 0.18)';
    ctx.lineWidth = active ? 1.8 : 1;
    ctx.stroke();

    roundRectPath(ctx, bx + 8, by + 11, 3.5, bh - 22, 2);
    ctx.fillStyle = active ? accent : 'rgba(148, 163, 184, 0.35)';
    ctx.fill();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#f8fafc';
    ctx.font = `700 18px ${FONT}`;
    ctx.fillText(name, bx + 22, by + 26);

    ctx.fillStyle = active ? accent : '#94a3b8';
    ctx.font = `600 11.5px ${FONT}`;
    ctx.fillText(role, bx + 22, by + 45);

    if (active) {
      const eqX = bx + bw - 42;
      for (let i = 0; i < 4; i++) {
        const barH = 6 + Math.abs(Math.sin(now / 115 + i * 1.4)) * 16;
        ctx.fillStyle = accent;
        roundRectPath(ctx, eqX + i * 7, by + 29 - barH / 2, 4, barH, 2);
        ctx.fill();
      }
    }
    ctx.restore();
  };

  drawBadge(42, stageH - 78, 'Dr. Deniz', 'AKADEMİK ANLATICI', '#22d3ee', denizSpeaking);
  drawBadge(stageW - 292, stageH - 78, 'Barış', 'ARAŞTIRMACI & SORU SORAN', '#c084fc', barisSpeaking);

  ctx.restore();
}

export function drawStudioPresentersAndDesk(
  props: PresenterRenderProps,
  stageW: number,
  stageH: number,
) {
  const {
    ctx,
    now,
    denizSpeaking,
    barisSpeaking,
    viseme,
    mouthOpen,
    inBreathPause,
    boardFocusX,
    boardFocusY,
  } = props;
  const deskY = stageH - 132;

  drawDenizPresenter(
    ctx,
    168,
    deskY,
    denizSpeaking,
    barisSpeaking,
    viseme,
    mouthOpen,
    inBreathPause,
    boardFocusX,
    boardFocusY,
    now,
  );
  drawBarisPresenter(
    ctx,
    stageW - 168,
    deskY,
    barisSpeaking,
    denizSpeaking,
    viseme,
    mouthOpen,
    inBreathPause,
    boardFocusX,
    boardFocusY,
    now,
  );
  drawBroadcastDeskAndLowerThirds(
    ctx,
    deskY,
    stageW,
    stageH,
    denizSpeaking,
    barisSpeaking,
    now,
  );
}
