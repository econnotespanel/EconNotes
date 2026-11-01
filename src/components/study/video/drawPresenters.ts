// Fotogerçekçi & Karizmatik Dijital Yayın Stüdyosu Sunucuları: Dr. Deniz & Barış (v5)
// - Keskin ve estetik maskülen yüz geometrisi (belirgin elmacık kemikleri, net çene hattı, pürüzsüz cilt ışıklandırması).
// - Doğal badem/avcı göz formu, düz-açılı bakımlı erkek kaşları, ince kemerli estetik burun ve doğal sıcak dudak tonları.
// - Dinamik alt çene eklemi (jawDrop), viseme dudak senkronu, sakkadik doğal göz teması ve hacimli modern saç tasarımı.

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

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / Math.max(0.0001, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
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

/** Doğal insan göz kırpma eğrisi (hızlı kapanış, yumuşak açılış + doğal çift kırpma) */
function computeBlink(now: number, seed: number): number {
  const cycle = (now / 1000 + seed) % 4.8;
  if (cycle < 0.055) {
    return smoothstep(0, 0.055, cycle);
  }
  if (cycle < 0.145) {
    return 1 - smoothstep(0.055, 0.145, cycle);
  }
  const doubleCycle = (now / 1000 + seed) % 14.4;
  if (doubleCycle > 0.22 && doubleCycle < 0.34) {
    return Math.sin(((doubleCycle - 0.22) / 0.12) * Math.PI);
  }
  return 0;
}

/** Sakkadik doğal bakış geçişi (kamera <-> akıllı tahta <-> rol arkadaşı) */
function computeSaccadicGaze(
  t: number,
  speaking: boolean,
  coHostSpeaking: boolean,
  boardOffsetX: number,
  boardOffsetY: number,
  coHostDir: 1 | -1,
  seed: number,
): { gx: number; gy: number } {
  const phase = (t * 0.4 + seed) % 3.0;
  const microX = Math.sin(t * 2.9 + seed) * 0.14;
  const microY = Math.cos(t * 2.4 + seed) * 0.09;

  if (coHostSpeaking) {
    const lookBoard = phase > 2.25 ? smoothstep(2.25, 2.4, phase) * (1 - smoothstep(2.85, 3.0, phase)) : 0;
    const targetX = coHostDir * 2.45 * (1 - lookBoard) + boardOffsetX * lookBoard;
    const targetY = -0.1 * (1 - lookBoard) + boardOffsetY * lookBoard;
    return { gx: targetX + microX, gy: targetY + microY };
  }

  if (speaking) {
    const boardWeight =
      phase > 1.9 ? smoothstep(1.9, 2.08, phase) * (1 - smoothstep(2.78, 2.96, phase)) : 0;
    const cameraX = coHostDir * 0.28;
    const gx = cameraX * (1 - boardWeight) + boardOffsetX * boardWeight;
    const gy = 0.05 * (1 - boardWeight) + boardOffsetY * boardWeight;
    return { gx: gx + microX, gy: gy + microY };
  }

  return { gx: boardOffsetX * 0.7 + microX, gy: boardOffsetY * 0.7 + microY };
}

/** Zarif ve orantılı anatomik kulak çizimi */
function drawSculptedEar(
  ctx: CanvasRenderingContext2D,
  ex: number,
  ey: number,
  side: -1 | 1,
  baseColor: string,
  shadowColor: string,
) {
  ctx.save();
  ctx.translate(ex, ey);
  ctx.rotate(side * 0.07);

  const earGrad = ctx.createLinearGradient(-side * 8, -14, side * 8, 15);
  earGrad.addColorStop(0, baseColor);
  earGrad.addColorStop(0.7, shadowColor);
  earGrad.addColorStop(1, 'rgba(156, 102, 76, 0.92)');
  ctx.fillStyle = earGrad;
  ctx.beginPath();
  ctx.ellipse(0, 0, 7.8, 15.4, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 240, 228, 0.32)';
  ctx.lineWidth = 1.15;
  ctx.beginPath();
  ctx.arc(0, -1, 6.0, side === 1 ? -Math.PI * 0.65 : -Math.PI * 0.35, side === 1 ? Math.PI * 0.55 : Math.PI * 1.45);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(118, 68, 48, 0.34)';
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.arc(0, -0.5, 4.1, side === 1 ? -Math.PI * 0.68 : -Math.PI * 0.32, side === 1 ? Math.PI * 0.6 : Math.PI * 1.4);
  ctx.stroke();

  ctx.restore();
}

/**
 * Estetik badem formlu, canlı iris dokulu ve pürüzsüz göz çevreli karizmatik erkek gözü
 * (Göz altı torbası veya kaz ayağı çizgisi olmadan taze ve net bakış)
 */
function drawAttractiveEye(
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
  creaseColor: string,
) {
  ctx.save();

  // Üst göz çukuru yumuşak derinlik gölgesi (yalnızca üst kapak üzerinde, göz altını tertemiz bırakır)
  const upperSocket = ctx.createRadialGradient(cx, cy - ry * 0.7, rx * 0.15, cx, cy - ry * 0.55, rx * 1.38);
  upperSocket.addColorStop(0, 'rgba(104, 60, 42, 0.15)');
  upperSocket.addColorStop(1, 'rgba(104, 60, 42, 0)');
  ctx.fillStyle = upperSocket;
  ctx.beginPath();
  ctx.ellipse(cx, cy - ry * 0.55, rx * 1.35, ry * 1.35, 0, Math.PI, Math.PI * 2);
  ctx.fill();

  // Maskülen yakın üst göz kapağı katlantısı (temiz, keskin ve çekici)
  const lidTrack = gazeY * 0.3;
  ctx.strokeStyle = creaseColor;
  ctx.lineWidth = 1.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - rx * 1.02, cy - ry * 0.52 + lidTrack * 0.4);
  ctx.bezierCurveTo(
    cx - rx * 0.44,
    cy - ry * 1.46 + lidTrack,
    cx + rx * 0.44,
    cy - ry * 1.44 + lidTrack,
    cx + rx * 1.04,
    cy - ry * 0.58 + lidTrack * 0.4,
  );
  ctx.stroke();

  const openFactor = clamp(1 - blink, 0.03, 1);
  const curRy = ry * openFactor;
  const innerY = cy + 0.85;
  const outerY = cy - 0.35; // Hafif çekici badem dış köşe eğimi (positive canthal tilt)
  const leftY = side === -1 ? outerY : innerY;
  const rightY = side === -1 ? innerY : outerY;

  if (blink > 0.86) {
    ctx.strokeStyle = '#1b120e';
    ctx.lineWidth = 2.05;
    ctx.beginPath();
    ctx.moveTo(cx - rx, leftY);
    ctx.quadraticCurveTo(cx, cy + 2.6, cx + rx, rightY);
    ctx.stroke();
    ctx.restore();
    return;
  }

  // Badem göz açıklığı
  ctx.beginPath();
  ctx.moveTo(cx - rx, leftY);
  ctx.bezierCurveTo(
    cx - rx * 0.5,
    cy - curRy * 1.18 + lidTrack,
    cx + rx * 0.5,
    cy - curRy * 1.18 + lidTrack,
    cx + rx,
    rightY,
  );
  ctx.bezierCurveTo(
    cx + rx * 0.48,
    cy + curRy * 1.04,
    cx - rx * 0.48,
    cy + curRy * 1.04,
    cx - rx,
    leftY,
  );
  ctx.closePath();

  // Temiz, parlak 3B sklera
  const scleraGrad = ctx.createRadialGradient(cx + gazeX * 0.28, cy, rx * 0.1, cx, cy, rx * 1.06);
  scleraGrad.addColorStop(0, '#fbfcfe');
  scleraGrad.addColorStop(0.72, '#eff3f9');
  scleraGrad.addColorStop(1, '#cfd8e6');
  ctx.fillStyle = scleraGrad;
  ctx.fill();

  ctx.save();
  ctx.clip();

  // Zarif iç göz pınarı
  const innerCornerX = side === -1 ? cx + rx * 0.86 : cx - rx * 0.86;
  ctx.fillStyle = 'rgba(210, 128, 122, 0.58)';
  ctx.beginPath();
  ctx.ellipse(innerCornerX, innerY - 0.1, 2.1, 1.4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Canlı, derinlikli İris + Limbal Halka
  const ix = cx + gazeX;
  const iy = cy + gazeY - 0.15;
  const irisR = ry * 0.98;

  ctx.fillStyle = limbalColor;
  ctx.beginPath();
  ctx.arc(ix, iy, irisR, 0, Math.PI * 2);
  ctx.fill();

  const irisGrad = ctx.createRadialGradient(ix, iy + irisR * 0.22, irisR * 0.08, ix, iy, irisR * 0.88);
  irisGrad.addColorStop(0, irisHighlight);
  irisGrad.addColorStop(0.56, irisMid);
  irisGrad.addColorStop(1, limbalColor);
  ctx.fillStyle = irisGrad;
  ctx.beginPath();
  ctx.arc(ix, iy, irisR * 0.87, 0, Math.PI * 2);
  ctx.fill();

  // İnce kristal iris lifleri
  ctx.strokeStyle = 'rgba(255, 236, 205, 0.22)';
  ctx.lineWidth = 0.68;
  for (let k = 0; k < 16; k++) {
    const ang = (k / 16) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(ix + Math.cos(ang) * irisR * 0.38, iy + Math.sin(ang) * irisR * 0.38);
    ctx.lineTo(ix + Math.cos(ang) * irisR * 0.82, iy + Math.sin(ang) * irisR * 0.82);
    ctx.stroke();
  }

  // Göz bebeği
  ctx.fillStyle = '#06080d';
  ctx.beginPath();
  ctx.arc(ix, iy, irisR * 0.39, 0, Math.PI * 2);
  ctx.fill();

  // Üst kapak yumuşak kornea gölgesi
  const lidShadow = ctx.createLinearGradient(0, cy - curRy * 1.2, 0, cy + 0.5);
  lidShadow.addColorStop(0, 'rgba(10, 15, 28, 0.42)');
  lidShadow.addColorStop(1, 'rgba(10, 15, 28, 0)');
  ctx.fillStyle = lidShadow;
  ctx.fillRect(cx - rx - 2, cy - curRy * 1.3, rx * 2 + 4, curRy * 1.3);

  // Çift stüdyo beauty-dish catchlight parıltısı (canlı ve etkileyici bakış)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.97)';
  ctx.beginPath();
  ctx.ellipse(ix - irisR * 0.27, iy - irisR * 0.27, irisR * 0.24, irisR * 0.17, -0.35, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(224, 247, 255, 0.72)';
  ctx.beginPath();
  ctx.arc(ix + irisR * 0.27, iy + irisR * 0.25, irisR * 0.11, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  // Net ve dolgun üst kirpik hattı
  ctx.strokeStyle = '#150e0b';
  ctx.lineWidth = 2.15;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - rx, leftY);
  ctx.bezierCurveTo(
    cx - rx * 0.5,
    cy - curRy * 1.18 + lidTrack,
    cx + rx * 0.5,
    cy - curRy * 1.18 + lidTrack,
    cx + rx,
    rightY,
  );
  ctx.stroke();

  // Çok ince ve temiz alt kirpik/su hattı tanımı
  ctx.strokeStyle = 'rgba(72, 44, 34, 0.28)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(cx - rx * 0.84, cy + curRy * 0.88);
  ctx.quadraticCurveTo(cx, cy + curRy * 1.08, cx + rx * 0.84, cy + curRy * 0.84);
  ctx.stroke();

  ctx.restore();
}

/**
 * Düz-açılı, gür ve bakımlı maskülen kaş çizimi
 * (Yuvarlak yarım daire yerine içten dış 2/3'e düz ve güçlü uzanıp dış kuyrukta hafifçe kırılan çekici erkek kaşı)
 */
function drawMasculineEyebrow(
  ctx: CanvasRenderingContext2D,
  side: -1 | 1,
  browLift: number,
  colorDark: string,
  colorSoft: string,
  thickness: number,
) {
  ctx.save();
  const innerX = side * 9.5;
  const peakX = side * 31.5;
  const outerX = side * 42.5;
  const innerY = -14.2 - browLift * 0.4;
  const peakY = -18.0 - browLift * 0.95;
  const outerY = -14.8 - browLift * 0.55;

  // Bakımlı tok kaş gövdesi
  ctx.fillStyle = colorSoft;
  ctx.beginPath();
  ctx.moveTo(innerX, innerY - thickness * 0.48);
  ctx.lineTo(peakX, peakY - thickness * 0.46);
  ctx.quadraticCurveTo(side * 37.5, peakY - thickness * 0.2, outerX, outerY);
  ctx.quadraticCurveTo(side * 36.5, peakY + thickness * 0.46, peakX, peakY + thickness * 0.5);
  ctx.lineTo(innerX, innerY + thickness * 0.54);
  ctx.closePath();
  ctx.fill();

  // Doğal yönlü tek tek kaş kılları
  ctx.strokeStyle = colorDark;
  ctx.lineWidth = 1.22;
  ctx.lineCap = 'round';
  const steps = 17;
  for (let i = 0; i < steps; i++) {
    const u = i / (steps - 1);
    const px = innerX + (outerX - innerX) * u;
    const baseLineY =
      u < 0.68
        ? innerY + (peakY - innerY) * (u / 0.68)
        : peakY + (outerY - peakY) * ((u - 0.68) / 0.32);
    const py = baseLineY + thickness * 0.38;
    const slantX = side * (1.5 + u * 3.1);
    const slantY = -thickness * (0.92 - u * 0.45);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + slantX, py + slantY);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Düz ve zarif burun sırtı, yumuşak ışık-gölge geçişi (sert burun deliği lekeleri veya dikey çizgiler olmadan)
 */
function drawRefinedMasculineNose(
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

  // Tek taraflı zarif 3B burun yan düzlem gölgesi
  const sideGrad = ctx.createLinearGradient(cx - 8, topY, cx + 8, topY + len);
  sideGrad.addColorStop(0, facingDir === 1 ? 'rgba(134, 80, 58, 0.16)' : 'rgba(134, 80, 58, 0.02)');
  sideGrad.addColorStop(1, facingDir === 1 ? 'rgba(134, 80, 58, 0.02)' : 'rgba(134, 80, 58, 0.16)');
  ctx.fillStyle = sideGrad;
  ctx.beginPath();
  ctx.moveTo(cx - 4.2, topY + 2);
  ctx.lineTo(cx + 4.2, topY + 2);
  ctx.lineTo(cx + 7.2, topY + len - 2);
  ctx.lineTo(cx - 7.2, topY + len - 2);
  ctx.closePath();
  ctx.fill();

  // Burun altı çok yumuşak doğal gölge
  const baseAO = ctx.createRadialGradient(cx, topY + len + 1.8, 1, cx, topY + len + 1.8, 9.5);
  baseAO.addColorStop(0, 'rgba(104, 58, 40, 0.18)');
  baseAO.addColorStop(1, 'rgba(104, 58, 40, 0)');
  ctx.fillStyle = baseAO;
  ctx.beginPath();
  ctx.ellipse(cx, topY + len + 2, 9.2, 3.4, 0, 0, Math.PI * 2);
  ctx.fill();

  // İnce, düz ve estetik burun sırtı hattı
  ctx.strokeStyle = shadowColor;
  ctx.lineWidth = 1.35;
  ctx.beginPath();
  ctx.moveTo(cx + facingDir * 2.0, topY + 1);
  ctx.bezierCurveTo(
    cx + facingDir * 3.4,
    topY + len * 0.52,
    cx + facingDir * 4.5,
    topY + len * 0.85,
    cx + facingDir * 1.4,
    topY + len + 0.4,
  );
  ctx.stroke();

  // Zarif burun ucu ve kanat konturu (minimalist martı kanadı formu)
  ctx.strokeStyle = shadowColor;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(cx - 7.8, topY + len - 1.8);
  ctx.quadraticCurveTo(cx - 8.6, topY + len + 1.4, cx - 3.6, topY + len + 1.3);
  ctx.quadraticCurveTo(cx, topY + len + 2.5, cx + 3.6, topY + len + 1.3);
  ctx.quadraticCurveTo(cx + 8.6, topY + len + 1.4, cx + 7.8, topY + len - 1.8);
  ctx.stroke();

  // Burun sırtı ve ucunda temiz stüdyo ışığı
  ctx.fillStyle = highlightColor;
  ctx.beginPath();
  ctx.ellipse(cx + facingDir * 0.4, topY + len * 0.44, 1.5, len * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + facingDir * 0.6, topY + len - 2.8, 2.6, 2.8, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * Karizmatik ve doğal erkek dudak yapısı + viseme senkronu
 * (Yaşlandırıcı nazolabial parantezler veya çene altı sert yay çizgisi olmadan sıcak, özgüvenli ifade)
 */
function drawCharismaticMouth(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  viseme: Viseme,
  openAmount: number,
  speaking: boolean,
  upperLipColor: string,
  lowerLipColor: string,
  lipShadowColor: string,
  jawDrop: number,
) {
  ctx.save();

  const open = speaking ? clamp(openAmount, 0, 1) : 0;
  let halfW = 19.2;
  let gapH = 0;

  if (!speaking || viseme === 'rest') {
    halfW = 19.4;
    gapH = open * 2.2;
  } else if (viseme === 'closed') {
    halfW = 18.0;
    gapH = 0.25;
  } else if (viseme === 'round') {
    halfW = 13.6;
    gapH = 3.4 + open * 7.8;
  } else if (viseme === 'open') {
    halfW = 18.6;
    gapH = 3.8 + open * 8.8;
  } else {
    halfW = 20.2;
    gapH = 2.0 + open * 6.2;
  }

  // Dinlenirken sıcak ve özgüvenli hafif tebessüm eğimi
  const cornerLift = speaking ? -0.9 + jawDrop * 0.12 : -2.1;

  // Konuşurken ağız içi ve temiz beyaz diş sırası
  if (gapH > 1.1) {
    ctx.beginPath();
    ctx.moveTo(cx - halfW + 1, cy + cornerLift);
    ctx.quadraticCurveTo(cx, cy - gapH * 0.34, cx + halfW - 1, cy + cornerLift);
    ctx.quadraticCurveTo(cx, cy + gapH * 1.1 + jawDrop * 0.22, cx - halfW + 1, cy + cornerLift);
    ctx.closePath();

    const mouthCavity = ctx.createLinearGradient(cx, cy - gapH * 0.35, cx, cy + gapH + jawDrop * 0.22);
    mouthCavity.addColorStop(0, '#2a0d14');
    mouthCavity.addColorStop(1, '#4c1a26');
    ctx.fillStyle = mouthCavity;
    ctx.fill();

    ctx.save();
    ctx.clip();
    if (gapH > 1.9 && viseme !== 'round') {
      const teethGrad = ctx.createLinearGradient(cx - halfW * 0.72, cy, cx + halfW * 0.72, cy);
      teethGrad.addColorStop(0, '#dce4ee');
      teethGrad.addColorStop(0.2, '#ffffff');
      teethGrad.addColorStop(0.8, '#ffffff');
      teethGrad.addColorStop(1, '#dce4ee');
      ctx.fillStyle = teethGrad;
      roundRectPath(
        ctx,
        cx - halfW * 0.7,
        cy - gapH * 0.42,
        halfW * 1.4,
        Math.min(4.8, gapH * 0.55),
        [0, 0, 2.2, 2.2],
      );
      ctx.fill();
    }

    const tongueGrad = ctx.createRadialGradient(cx, cy + gapH * 0.78, 1, cx, cy + gapH * 0.85, halfW * 0.56);
    tongueGrad.addColorStop(0, '#c05666');
    tongueGrad.addColorStop(1, '#882d3d');
    ctx.fillStyle = tongueGrad;
    ctx.beginPath();
    ctx.ellipse(cx, cy + gapH * 0.86 + jawDrop * 0.14, halfW * 0.5, gapH * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Üst dudak (doğal sıcak cilt-pembe tonu, dengeli maskülen hat)
  const upGrad = ctx.createLinearGradient(cx, cy - 5.2 - gapH * 0.18, cx, cy + 0.8);
  upGrad.addColorStop(0, upperLipColor);
  upGrad.addColorStop(1, lipShadowColor);
  ctx.fillStyle = upGrad;
  ctx.beginPath();
  ctx.moveTo(cx - halfW, cy + cornerLift);
  ctx.bezierCurveTo(
    cx - halfW * 0.5,
    cy - 4.1 - gapH * 0.18,
    cx - 3.4,
    cy - 4.7 - gapH * 0.18,
    cx,
    cy - 3.5 - gapH * 0.18,
  );
  ctx.bezierCurveTo(
    cx + 3.4,
    cy - 4.7 - gapH * 0.18,
    cx + halfW * 0.5,
    cy - 4.1 - gapH * 0.18,
    cx + halfW,
    cy + cornerLift,
  );
  ctx.quadraticCurveTo(cx, cy - gapH * 0.28 + 0.6, cx - halfW, cy + cornerLift);
  ctx.closePath();
  ctx.fill();

  // Alt dudak
  const lowBaseY = cy + gapH * 1.04 + jawDrop * 0.2;
  const lowGrad = ctx.createLinearGradient(cx, cy + gapH * 0.35, cx, lowBaseY + 6.2);
  lowGrad.addColorStop(0, lowerLipColor);
  lowGrad.addColorStop(0.72, upperLipColor);
  lowGrad.addColorStop(1, lipShadowColor);
  ctx.fillStyle = lowGrad;
  ctx.beginPath();
  ctx.moveTo(cx - halfW + 0.8, cy + cornerLift);
  ctx.quadraticCurveTo(cx, lowBaseY - 0.4, cx + halfW - 0.8, cy + cornerLift);
  ctx.quadraticCurveTo(cx, lowBaseY + 6.2, cx - halfW + 0.8, cy + cornerLift);
  ctx.closePath();
  ctx.fill();

  // Alt dudak doğal nem ışıltısı
  ctx.fillStyle = 'rgba(255, 248, 244, 0.22)';
  ctx.beginPath();
  ctx.ellipse(cx - 1.2, lowBaseY + 2.1, halfW * 0.25, 1.05, 0, 0, Math.PI * 2);
  ctx.fill();

  // Ağız birleşim hattı ve yumuşak tebessüm köşeleri
  if (gapH <= 1.1) {
    ctx.strokeStyle = 'rgba(84, 42, 40, 0.48)';
    ctx.lineWidth = 1.3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - halfW, cy + cornerLift);
    ctx.quadraticCurveTo(cx, cy + 0.5, cx + halfW, cy + cornerLift);
    ctx.stroke();
  }

  ctx.fillStyle = 'rgba(88, 44, 42, 0.3)';
  ctx.beginPath();
  ctx.arc(cx - halfW - 0.4, cy + cornerLift - 0.2, 1.2, 0, Math.PI * 2);
  ctx.arc(cx + halfW + 0.4, cy + cornerLift - 0.2, 1.2, 0, Math.PI * 2);
  ctx.fill();

  // Çene ucunda çok zarif üç boyutlu stüdyo ışığı (sert çizgi olmadan)
  const chinGlow = ctx.createRadialGradient(cx, lowBaseY + 15.5, 1, cx, lowBaseY + 15.5, 11);
  chinGlow.addColorStop(0, 'rgba(255, 245, 236, 0.2)');
  chinGlow.addColorStop(1, 'rgba(255, 245, 236, 0)');
  ctx.fillStyle = chinGlow;
  ctx.beginPath();
  ctx.ellipse(cx, lowBaseY + 15.5, 11, 5.2, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * Keskin, atletik ve yakışıklı maskülen yüz konturu (belirgin elmacık kemiği, içe incelen yanak ve net çene köşesi)
 */
function traceSculptedHeadPath(
  ctx: CanvasRenderingContext2D,
  hx: number,
  hy: number,
  w: number,
  h: number,
  jawSharpness: number,
  jawDrop = 0,
) {
  const gonialX = w * jawSharpness;
  const chinCornerX = w * 0.145;
  ctx.beginPath();
  // Üst kafa kubbesi -> sağ şakak -> sağ elmacık kemiği
  ctx.moveTo(hx, hy - h * 0.52);
  ctx.bezierCurveTo(
    hx + w * 0.46,
    hy - h * 0.52,
    hx + w * 0.5,
    hy - h * 0.22,
    hx + w * 0.495,
    hy - h * 0.03,
  );
  // Sağ elmacık kemiğinden keskin alt çene köşesine (gonial angle)
  ctx.bezierCurveTo(
    hx + w * 0.485,
    hy + h * 0.09,
    hx + gonialX + 2.5,
    hy + h * 0.2 + jawDrop * 0.25,
    hx + gonialX,
    hy + h * 0.28 + jawDrop * 0.42,
  );
  // Sağ çene köşesinden net, maskülen çene ucuna
  ctx.bezierCurveTo(
    hx + gonialX * 0.78,
    hy + h * 0.39 + jawDrop * 0.72,
    hx + chinCornerX,
    hy + h * 0.5 + jawDrop * 0.95,
    hx,
    hy + h * 0.508 + jawDrop,
  );
  // Çene ucundan sol çene köşesine
  ctx.bezierCurveTo(
    hx - chinCornerX,
    hy + h * 0.5 + jawDrop * 0.95,
    hx - gonialX * 0.78,
    hy + h * 0.39 + jawDrop * 0.72,
    hx - gonialX,
    hy + h * 0.28 + jawDrop * 0.42,
  );
  // Sol çene köşesinden sol elmacık kemiğine
  ctx.bezierCurveTo(
    hx - gonialX - 2.5,
    hy + h * 0.2 + jawDrop * 0.25,
    hx - w * 0.485,
    hy + h * 0.09,
    hx - w * 0.495,
    hy - h * 0.03,
  );
  // Sol elmacık kemiğinden şakak ve tepeye
  ctx.bezierCurveTo(
    hx - w * 0.5,
    hy - h * 0.22,
    hx - w * 0.46,
    hy - h * 0.52,
    hx,
    hy - h * 0.52,
  );
  ctx.closePath();
}

/** Elmacık kemiği altı hafif atletik yüz konturu (model/sunucu ışık gölgesi) */
function drawCheekboneSculptContour(ctx: CanvasRenderingContext2D, jawDrop: number) {
  const hollowL = ctx.createRadialGradient(-39, 17 + jawDrop * 0.2, 2, -39, 17 + jawDrop * 0.2, 22);
  hollowL.addColorStop(0, 'rgba(128, 76, 54, 0.14)');
  hollowL.addColorStop(1, 'rgba(128, 76, 54, 0)');
  ctx.fillStyle = hollowL;
  ctx.beginPath();
  ctx.ellipse(-39, 17 + jawDrop * 0.2, 16, 22, 0.28, 0, Math.PI * 2);
  ctx.fill();

  const hollowR = ctx.createRadialGradient(39, 17 + jawDrop * 0.2, 2, 39, 17 + jawDrop * 0.2, 22);
  hollowR.addColorStop(0, 'rgba(128, 76, 54, 0.14)');
  hollowR.addColorStop(1, 'rgba(128, 76, 54, 0)');
  ctx.fillStyle = hollowR;
  ctx.beginPath();
  ctx.ellipse(39, 17 + jawDrop * 0.2, 16, 22, -0.28, 0, Math.PI * 2);
  ctx.fill();
}

/** 5 parmaklı, gömlek manşetli zarif anlatım eli */
function drawArticulatedHandGesture(
  ctx: CanvasRenderingContext2D,
  side: 1 | -1,
  shoulderX: number,
  shoulderY: number,
  deskY: number,
  sleeveColor: string,
  skinLight: string,
  skinShadow: string,
  t: number,
  mouthOpen: number,
) {
  ctx.save();
  const emphasis = mouthOpen * 3.0;
  const wave = Math.sin(t * 2.4 + (side === 1 ? 0 : 0.7)) * 4.5 - emphasis;
  const wristX = shoulderX + side * (82 + Math.cos(t * 1.6) * 4.0);
  const wristY = deskY - 24 + wave;

  ctx.strokeStyle = sleeveColor;
  ctx.lineWidth = 29;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(shoulderX + side * 106, shoulderY + 94);
  ctx.quadraticCurveTo(shoulderX + side * 116, deskY - 4, wristX - side * 10, wristY + 7);
  ctx.stroke();

  ctx.strokeStyle = '#f1f5f9';
  ctx.lineWidth = 20;
  ctx.beginPath();
  ctx.moveTo(wristX - side * 9.5, wristY + 6);
  ctx.lineTo(wristX - side * 3, wristY + 3);
  ctx.stroke();

  ctx.translate(wristX + side * 5, wristY);
  ctx.rotate(side * -0.22);

  const palmGrad = ctx.createLinearGradient(-12, -10, 12, 12);
  palmGrad.addColorStop(0, skinLight);
  palmGrad.addColorStop(1, skinShadow);
  ctx.fillStyle = palmGrad;
  ctx.beginPath();
  ctx.ellipse(0, 1, 14.4, 9.6, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = skinLight;
  ctx.lineWidth = 4.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-side * 4, -4);
  ctx.quadraticCurveTo(side * 2, -13, side * 9.2, -13.8);
  ctx.stroke();

  const lengths = [16.5, 18.0, 16.4, 13.5];
  for (let f = 0; f < 4; f++) {
    const baseY = -5.0 + f * 3.25;
    const spread = (-0.26 + f * 0.18) * side;
    const len = lengths[f];
    ctx.strokeStyle = f >= 2 ? skinShadow : skinLight;
    ctx.lineWidth = 4.0 - f * 0.22;
    ctx.beginPath();
    ctx.moveTo(side * 8.8, baseY);
    ctx.quadraticCurveTo(
      side * (8.8 + len * 0.55),
      baseY + Math.sin(spread) * 5.8 - 1.1,
      side * (8.8 + len),
      baseY + Math.sin(spread) * 10.5,
    );
    ctx.stroke();
  }

  ctx.restore();
}

// ============================================================================
// DR. DENİZ (SOL ANLATICI — KARİZMATİK, YAKIŞIKLI AKADEMİSYEN SUNUCU)
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
  const breathe = Math.sin(t * 1.7) * 1.9;
  const torsoShift = speaking ? Math.sin(t * 0.72) * 1.7 : coHostSpeaking ? 1.4 : 0;
  const listenNod = coHostSpeaking ? Math.sin(t * 2.0) * 1.6 : 0;
  const speakCadence = speaking && !inBreath ? Math.sin(t * 3.8) * 1.1 : 0;
  const headTilt = speaking
    ? Math.sin(t * 0.92) * 0.016
    : coHostSpeaking
    ? 0.015 + Math.sin(t * 0.75) * 0.006
    : Math.sin(t * 0.58) * 0.008;

  const jawDrop = speaking && !inBreath ? clamp(mouthOpen, 0, 1) * 4.8 : 0;
  const bodyX = cx + torsoShift;
  const shoulderY = deskY - 204 + breathe * 0.5;
  const hx = bodyX + (speaking ? Math.sin(t * 0.85) * 1.8 : coHostSpeaking ? 1.6 : 0);
  const hy = shoulderY - 115 + breathe * 0.34 + listenNod + speakCadence;

  // Stüdyo arka portre ışıması
  const auraAlpha = speaking ? 0.22 : 0.07;
  const aura = ctx.createRadialGradient(bodyX + 14, hy + 46, 22, bodyX + 14, hy + 46, 250);
  aura.addColorStop(0, `rgba(34, 211, 238, ${auraAlpha})`);
  aura.addColorStop(1, 'rgba(34, 211, 238, 0)');
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(bodyX + 14, hy + 46, 250, 0, Math.PI * 2);
  ctx.fill();

  // Konuşmacıyı tahtadan ayıran yumuşak yayın rim ışığı.
  const rim = ctx.createLinearGradient(bodyX - 150, hy - 90, bodyX + 150, deskY);
  rim.addColorStop(0, `rgba(34, 211, 238, ${speaking ? 0.2 : 0.07})`);
  rim.addColorStop(0.5, 'rgba(255,255,255,0)');
  rim.addColorStop(1, 'rgba(34, 211, 238, 0)');
  ctx.fillStyle = rim;
  ctx.beginPath();
  ctx.ellipse(bodyX, shoulderY + 28, 158, 218, 0, 0, Math.PI * 2);
  ctx.fill();

  // 1. Atletik erkek boynu ve keskin çene altı gölgesi
  const neckGrad = ctx.createLinearGradient(hx - 27, hy + 44, hx + 27, shoulderY + 34);
  neckGrad.addColorStop(0, '#cf9a7c');
  neckGrad.addColorStop(0.5, '#efc3a7');
  neckGrad.addColorStop(1, '#d59f80');
  ctx.fillStyle = neckGrad;
  ctx.beginPath();
  ctx.moveTo(hx - 24.5, hy + 44);
  ctx.lineTo(hx - 29.5, shoulderY + 26);
  ctx.quadraticCurveTo(bodyX, shoulderY + 50, hx + 29.5, shoulderY + 26);
  ctx.lineTo(hx + 24.5, hy + 44);
  ctx.closePath();
  ctx.fill();

  const chinCast = ctx.createLinearGradient(0, hy + 52 + jawDrop, 0, hy + 86 + jawDrop);
  chinCast.addColorStop(0, 'rgba(72, 38, 25, 0.42)');
  chinCast.addColorStop(1, 'rgba(72, 38, 25, 0)');
  ctx.fillStyle = chinCast;
  ctx.fillRect(hx - 29, hy + 52 + jawDrop * 0.8, 58, 34);

  // 2. İtalyan kesim koyu lacivert ceket + jilet gibi beyaz gömlek + ipek cep mendili
  const blazerGrad = ctx.createLinearGradient(bodyX - 156, shoulderY, bodyX + 156, deskY + 20);
  blazerGrad.addColorStop(0, '#1f365d');
  blazerGrad.addColorStop(0.52, '#12213d');
  blazerGrad.addColorStop(1, '#081020');
  ctx.fillStyle = blazerGrad;
  ctx.beginPath();
  ctx.moveTo(bodyX - 158, deskY + 20);
  ctx.bezierCurveTo(bodyX - 156, shoulderY + 64, bodyX - 136, shoulderY + 10, bodyX - 48, shoulderY + 2);
  ctx.lineTo(bodyX + 48, shoulderY + 2);
  ctx.bezierCurveTo(bodyX + 136, shoulderY + 10, bodyX + 156, shoulderY + 64, bodyX + 158, deskY + 20);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(103, 232, 249, 0.42)';
  ctx.lineWidth = 2.0;
  ctx.beginPath();
  ctx.moveTo(bodyX + 48, shoulderY + 3);
  ctx.bezierCurveTo(bodyX + 132, shoulderY + 11, bodyX + 152, shoulderY + 64, bodyX + 156, deskY);
  ctx.stroke();

  // Açık yaka beyaz Oxford gömlek
  const shirtGrad = ctx.createLinearGradient(bodyX - 36, shoulderY + 4, bodyX + 36, shoulderY + 148);
  shirtGrad.addColorStop(0, '#ffffff');
  shirtGrad.addColorStop(0.62, '#eef5ff');
  shirtGrad.addColorStop(1, '#cbdcf4');
  ctx.fillStyle = shirtGrad;
  ctx.beginPath();
  ctx.moveTo(bodyX - 36, shoulderY + 4);
  ctx.lineTo(bodyX, shoulderY + 148);
  ctx.lineTo(bodyX + 36, shoulderY + 4);
  ctx.quadraticCurveTo(bodyX, shoulderY + 23, bodyX - 36, shoulderY + 4);
  ctx.closePath();
  ctx.fill();

  const collarGrad = ctx.createLinearGradient(bodyX, shoulderY - 6, bodyX, shoulderY + 32);
  collarGrad.addColorStop(0, '#ffffff');
  collarGrad.addColorStop(1, '#dbe6f5');
  ctx.fillStyle = collarGrad;
  ctx.beginPath();
  ctx.moveTo(bodyX - 31, shoulderY + 2);
  ctx.lineTo(bodyX - 15, shoulderY + 33);
  ctx.lineTo(bodyX - 2, shoulderY + 20);
  ctx.lineTo(bodyX - 24, shoulderY - 6);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(bodyX + 31, shoulderY + 2);
  ctx.lineTo(bodyX + 15, shoulderY + 33);
  ctx.lineTo(bodyX + 2, shoulderY + 20);
  ctx.lineTo(bodyX + 24, shoulderY - 6);
  ctx.closePath();
  ctx.fill();

  // Keskin ceket klapaları
  const lapelGrad = ctx.createLinearGradient(bodyX - 66, shoulderY + 4, bodyX + 66, shoulderY + 152);
  lapelGrad.addColorStop(0, '#294777');
  lapelGrad.addColorStop(1, '#142542');
  ctx.fillStyle = lapelGrad;

  ctx.beginPath();
  ctx.moveTo(bodyX - 38, shoulderY + 4);
  ctx.lineTo(bodyX - 66, shoulderY + 46);
  ctx.lineTo(bodyX - 53, shoulderY + 52);
  ctx.lineTo(bodyX - 63, shoulderY + 67);
  ctx.lineTo(bodyX - 3, shoulderY + 152);
  ctx.lineTo(bodyX - 29, shoulderY + 24);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(bodyX + 38, shoulderY + 4);
  ctx.lineTo(bodyX + 66, shoulderY + 46);
  ctx.lineTo(bodyX + 53, shoulderY + 52);
  ctx.lineTo(bodyX + 63, shoulderY + 67);
  ctx.lineTo(bodyX + 3, shoulderY + 152);
  ctx.lineTo(bodyX + 29, shoulderY + 24);
  ctx.closePath();
  ctx.fill();

  // İpek cep mendili & yaka mikrofonu
  ctx.fillStyle = 'rgba(224, 242, 254, 0.92)';
  ctx.beginPath();
  ctx.moveTo(bodyX + 54, shoulderY + 94);
  ctx.lineTo(bodyX + 69, shoulderY + 82);
  ctx.lineTo(bodyX + 83, shoulderY + 95);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#0c182c';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(bodyX + 49, shoulderY + 95);
  ctx.lineTo(bodyX + 88, shoulderY + 96);
  ctx.stroke();

  ctx.fillStyle = '#090e18';
  roundRectPath(ctx, bodyX + 35, shoulderY + 74, 7.2, 13, 3.5);
  ctx.fill();
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(bodyX + 31, shoulderY + 80, 5, 2.0);

  // 3. Karizmatik ve Yakışıklı Baş & Yüz Hatları
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(headTilt);

  // Dolgun arka saç hacmi
  ctx.fillStyle = '#1b110c';
  ctx.beginPath();
  ctx.ellipse(0, -21, 58.5, 58, 0, Math.PI * 0.86, Math.PI * 2.14);
  ctx.fill();

  // Zarif kulaklar
  drawSculptedEar(ctx, -55.5, 4, -1, '#e6b698', '#c68f70');
  drawSculptedEar(ctx, 55.5, 4, 1, '#ecc0a4', '#cc9576');

  // Keskin elmacık ve çene hatlı pürüzsüz cilt
  traceSculptedHeadPath(ctx, 0, 0, 112, 138, 0.415, jawDrop);
  const skinGrad = ctx.createRadialGradient(12, -20, 10, 0, 6, 92);
  skinGrad.addColorStop(0, '#fae0cb');
  skinGrad.addColorStop(0.54, '#ecc0a1');
  skinGrad.addColorStop(0.86, '#d69d7b');
  skinGrad.addColorStop(1, '#be8362');
  ctx.fillStyle = skinGrad;
  ctx.fill();

  ctx.save();
  traceSculptedHeadPath(ctx, 0, 0, 112, 138, 0.415, jawDrop);
  ctx.clip();

  // Saç çizgisi yumuşak gölgesi
  const hairlineAO = ctx.createLinearGradient(0, -68, 0, -40);
  hairlineAO.addColorStop(0, 'rgba(64, 34, 22, 0.24)');
  hairlineAO.addColorStop(1, 'rgba(64, 34, 22, 0)');
  ctx.fillStyle = hairlineAO;
  ctx.fillRect(-60, -70, 120, 32);

  // Akıllı tahta camgöbeği rim ışığı (sağ yanak/çene hattını keskinleştirir)
  const faceRim = ctx.createLinearGradient(34, 0, 56, 0);
  faceRim.addColorStop(0, 'rgba(103, 232, 249, 0)');
  faceRim.addColorStop(1, 'rgba(103, 232, 249, 0.24)');
  ctx.fillStyle = faceRim;
  ctx.fillRect(33, -70, 25, 150);

  // Sol şakak derinlik gölgesi
  const jawShadeL = ctx.createLinearGradient(-57, 0, -28, 0);
  jawShadeL.addColorStop(0, 'rgba(110, 64, 44, 0.22)');
  jawShadeL.addColorStop(1, 'rgba(110, 64, 44, 0)');
  ctx.fillStyle = jawShadeL;
  ctx.fillRect(-58, -68, 32, 150);

  // Atletik elmacık kemiği konturu ve sıcaklığı
  drawCheekboneSculptContour(ctx, jawDrop);

  ctx.fillStyle = 'rgba(255, 246, 238, 0.22)';
  ctx.beginPath();
  ctx.ellipse(-30, 3, 11, 4.6, -0.22, 0, Math.PI * 2);
  ctx.ellipse(30, 3, 11, 4.6, 0.22, 0, Math.PI * 2);
  ctx.ellipse(1, -33, 17, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  // Keskin çene hattı (jawline) ince stüdyo tanım çizgisi
  ctx.strokeStyle = 'rgba(116, 68, 48, 0.28)';
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.moveTo(-46.5, 38 + jawDrop * 0.42);
  ctx.quadraticCurveTo(-24, 65 + jawDrop * 0.85, 0, 70 + jawDrop);
  ctx.quadraticCurveTo(24, 65 + jawDrop * 0.85, 46.5, 38 + jawDrop * 0.42);
  ctx.stroke();

  // Sakkadik doğal bakış ve göz kırpma
  const boardOffsetX = clamp((boardFocusX - bodyX) / 520, -1, 1) * 2.5;
  const boardOffsetY = clamp((boardFocusY - hy) / 380, -1, 1) * 1.1;
  const { gx: gazeX, gy: gazeY } = computeSaccadicGaze(
    t,
    speaking,
    coHostSpeaking,
    boardOffsetX,
    boardOffsetY,
    1,
    0.3,
  );
  const blink = computeBlink(now, 0.4);

  // Çarpıcı zümrüt-ela / kehribar badem gözler
  drawAttractiveEye(
    ctx,
    -22.5,
    -4.0,
    13.2,
    6.7,
    -1,
    '#18241e',
    '#4b6b53',
    '#9c7c44',
    gazeX,
    gazeY,
    blink,
    'rgba(104, 60, 44, 0.32)',
  );
  drawAttractiveEye(
    ctx,
    22.5,
    -4.0,
    13.2,
    6.7,
    1,
    '#18241e',
    '#4b6b53',
    '#9c7c44',
    gazeX,
    gazeY,
    blink,
    'rgba(104, 60, 44, 0.32)',
  );

  // Düz-açılı gür ve bakımlı kaşlar
  const browLift = speaking ? Math.max(0, Math.sin(t * 2.3)) * 2.1 : coHostSpeaking ? 0.6 : 0;
  drawMasculineEyebrow(ctx, -1, browLift, '#22140e', 'rgba(42, 26, 18, 0.54)', 4.7);
  drawMasculineEyebrow(ctx, 1, browLift, '#22140e', 'rgba(42, 26, 18, 0.54)', 4.7);

  // Modern minimalist koyu titanyum / antrasit tasarım gözlük (gözleri kapatmayan ince şık çerçeve)
  ctx.save();
  ctx.strokeStyle = 'rgba(51, 65, 85, 0.85)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-41.5, -7.5);
  ctx.lineTo(-54.5, -2.5);
  ctx.moveTo(41.5, -7.5);
  ctx.lineTo(54.5, -2.5);
  ctx.stroke();

  ctx.fillStyle = 'rgba(186, 230, 253, 0.035)';
  roundRectPath(ctx, -41, -15, 34, 21.5, 6.5);
  ctx.fill();
  roundRectPath(ctx, 7, -15, 34, 21.5, 6.5);
  ctx.fill();

  ctx.strokeStyle = 'rgba(71, 85, 105, 0.92)';
  ctx.lineWidth = 1.65;
  roundRectPath(ctx, -41, -15, 34, 21.5, 6.5);
  ctx.stroke();
  roundRectPath(ctx, 7, -15, 34, 21.5, 6.5);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(-7, -6.8);
  ctx.quadraticCurveTo(0, -9.0, 7, -6.8);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(224, 242, 254, 0.18)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-35, -12);
  ctx.lineTo(-27, 2.5);
  ctx.moveTo(13, -12);
  ctx.lineTo(21, 2.5);
  ctx.stroke();
  ctx.restore();

  // Estetik düz burun
  drawRefinedMasculineNose(
    ctx,
    0,
    -3.5,
    25.5,
    1,
    'rgba(126, 74, 54, 0.4)',
    'rgba(255, 246, 238, 0.45)',
  );

  // Doğal sıcak dudaklar ve özgüvenli ifade
  drawCharismaticMouth(
    ctx,
    0,
    37.5 + jawDrop * 0.28,
    viseme,
    inBreath ? 0.03 : mouthOpen,
    speaking && !inBreath,
    '#b6786e',
    '#c88a80',
    '#8b524a',
    jawDrop,
  );

  // Modern, gür, geriye ve yana taranmış koyu kestane katmanlı saç + organik şakak geçişi
  const hairGrad = ctx.createLinearGradient(-56, -92, 56, -10);
  hairGrad.addColorStop(0, '#41281b');
  hairGrad.addColorStop(0.5, '#26160e');
  hairGrad.addColorStop(1, '#140b07');
  ctx.fillStyle = hairGrad;

  ctx.beginPath();
  ctx.moveTo(-54.5, 2);
  ctx.bezierCurveTo(-57.5, -18, -59, -50, -43, -78);
  ctx.bezierCurveTo(-24, -95, 22, -96, 44, -77);
  ctx.bezierCurveTo(59, -52, 57.5, -18, 54.5, 2);
  // Organik incelen şakak favorisi (sağ -> alın -> sol)
  ctx.bezierCurveTo(52, -8, 50.5, -24, 46, -38);
  ctx.bezierCurveTo(38, -50, 18, -54, -8, -52);
  ctx.bezierCurveTo(-28, -51, -42, -46, -47, -36);
  ctx.bezierCurveTo(-50.5, -23, -52, -8, -54.5, 2);
  ctx.closePath();
  ctx.fill();

  // Ön hacimli modern dalga katmanı (swept-back wave)
  const waveGrad = ctx.createLinearGradient(-38, -88, 46, -46);
  waveGrad.addColorStop(0, '#4d3021');
  waveGrad.addColorStop(1, '#23140d');
  ctx.fillStyle = waveGrad;
  ctx.beginPath();
  ctx.moveTo(-40, -46);
  ctx.bezierCurveTo(-24, -84, 24, -88, 47, -46);
  ctx.bezierCurveTo(24, -58, -14, -56, -40, -46);
  ctx.closePath();
  ctx.fill();

  // İpek gibi saç dokusu ve stüdyo ışık yansımaları
  ctx.strokeStyle = 'rgba(196, 146, 112, 0.3)';
  ctx.lineWidth = 1.45;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-30, -64);
  ctx.quadraticCurveTo(4, -82, 38, -56);
  ctx.moveTo(-16, -74);
  ctx.quadraticCurveTo(16, -86, 43, -64);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(103, 232, 249, 0.24)';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(14, -86);
  ctx.bezierCurveTo(44, -78, 56, -48, 55, -12);
  ctx.stroke();

  ctx.restore();

  if (speaking) {
    drawArticulatedHandGesture(
      ctx,
      1,
      bodyX,
      shoulderY,
      deskY,
      '#152745',
      '#efc4a8',
      '#d29b7b',
      t,
      mouthOpen,
    );
  }

  ctx.restore();
}

// ============================================================================
// BARIŞ (SAĞ SUNUCU — YAKIŞIKLI, DİNAMİK VE KARİZMATİK GENÇ ARAŞTIRMACI)
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
  const breathe = Math.sin(t * 1.82 + 1.2) * 2.0;
  const torsoShift = speaking ? Math.sin(t * 0.76 + 0.6) * -1.7 : coHostSpeaking ? -1.4 : 0;
  const listenNod = coHostSpeaking ? Math.sin(t * 2.1 + 0.5) * 1.7 : 0;
  const speakCadence = speaking && !inBreath ? Math.sin(t * 4.1 + 0.4) * 1.15 : 0;
  const headTilt = speaking
    ? Math.sin(t * 0.98) * -0.017
    : coHostSpeaking
    ? -0.015 + Math.sin(t * 0.75) * 0.006
    : Math.sin(t * 0.6) * 0.009;

  const jawDrop = speaking && !inBreath ? clamp(mouthOpen, 0, 1) * 4.8 : 0;
  const bodyX = cx + torsoShift;
  const shoulderY = deskY - 204 + breathe * 0.5;
  const hx = bodyX + (speaking ? Math.sin(t * 0.88) * -1.8 : coHostSpeaking ? -1.6 : 0);
  const hy = shoulderY - 115 + breathe * 0.34 + listenNod + speakCadence;

  // Arka stüdyo portre rim ışığı
  const auraAlpha = speaking ? 0.22 : 0.07;
  const aura = ctx.createRadialGradient(bodyX - 14, hy + 46, 22, bodyX - 14, hy + 46, 250);
  aura.addColorStop(0, `rgba(168, 85, 247, ${auraAlpha})`);
  aura.addColorStop(1, 'rgba(168, 85, 247, 0)');
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(bodyX - 14, hy + 46, 250, 0, Math.PI * 2);
  ctx.fill();

  const rim = ctx.createLinearGradient(bodyX - 150, hy - 90, bodyX + 150, deskY);
  rim.addColorStop(0, 'rgba(255,255,255,0)');
  rim.addColorStop(0.5, `rgba(192, 132, 252, ${speaking ? 0.2 : 0.07})`);
  rim.addColorStop(1, 'rgba(168, 85, 247, 0)');
  ctx.fillStyle = rim;
  ctx.beginPath();
  ctx.ellipse(bodyX, shoulderY + 28, 158, 218, 0, 0, Math.PI * 2);
  ctx.fill();

  // 1. Atletik erkek boynu ve çene altı gölgesi
  const neckGrad = ctx.createLinearGradient(hx - 26, hy + 44, hx + 26, shoulderY + 32);
  neckGrad.addColorStop(0, '#ca9475');
  neckGrad.addColorStop(0.52, '#eabca0');
  neckGrad.addColorStop(1, '#cf9878');
  ctx.fillStyle = neckGrad;
  ctx.beginPath();
  ctx.moveTo(hx - 24, hy + 44);
  ctx.lineTo(hx - 29, shoulderY + 26);
  ctx.quadraticCurveTo(bodyX, shoulderY + 48, hx + 29, shoulderY + 26);
  ctx.lineTo(hx + 24, hy + 44);
  ctx.closePath();
  ctx.fill();

  const chinShadow = ctx.createLinearGradient(0, hy + 52 + jawDrop, 0, hy + 86 + jawDrop);
  chinShadow.addColorStop(0, 'rgba(68, 36, 24, 0.42)');
  chinShadow.addColorStop(1, 'rgba(68, 36, 24, 0)');
  ctx.fillStyle = chinShadow;
  ctx.fillRect(hx - 29, hy + 52 + jawDrop * 0.8, 58, 34);

  // 2. Modern antrasit blazer + şık bordo merinos triko + beyaz yaka
  const jacketGrad = ctx.createLinearGradient(bodyX - 156, shoulderY, bodyX + 156, deskY + 20);
  jacketGrad.addColorStop(0, '#253144');
  jacketGrad.addColorStop(0.55, '#141d2c');
  jacketGrad.addColorStop(1, '#080c14');
  ctx.fillStyle = jacketGrad;
  ctx.beginPath();
  ctx.moveTo(bodyX - 158, deskY + 20);
  ctx.bezierCurveTo(bodyX - 156, shoulderY + 64, bodyX - 136, shoulderY + 10, bodyX - 48, shoulderY + 2);
  ctx.lineTo(bodyX + 48, shoulderY + 2);
  ctx.bezierCurveTo(bodyX + 136, shoulderY + 10, bodyX + 156, shoulderY + 64, bodyX + 158, deskY + 20);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(192, 132, 252, 0.42)';
  ctx.lineWidth = 2.0;
  ctx.beginPath();
  ctx.moveTo(bodyX - 48, shoulderY + 3);
  ctx.bezierCurveTo(bodyX - 132, shoulderY + 11, bodyX - 152, shoulderY + 64, bodyX - 156, deskY);
  ctx.stroke();

  const knitGrad = ctx.createLinearGradient(bodyX, shoulderY + 12, bodyX, deskY);
  knitGrad.addColorStop(0, '#882444');
  knitGrad.addColorStop(0.6, '#59152c');
  knitGrad.addColorStop(1, '#320b18');
  ctx.fillStyle = knitGrad;
  ctx.beginPath();
  ctx.moveTo(bodyX - 64, deskY + 20);
  ctx.lineTo(bodyX - 42, shoulderY + 10);
  ctx.quadraticCurveTo(bodyX, shoulderY + 35, bodyX + 42, shoulderY + 10);
  ctx.lineTo(bodyX + 64, deskY + 20);
  ctx.closePath();
  ctx.fill();

  const collarGrad = ctx.createLinearGradient(bodyX, shoulderY - 4, bodyX, shoulderY + 28);
  collarGrad.addColorStop(0, '#ffffff');
  collarGrad.addColorStop(1, '#dbe4f0');
  ctx.fillStyle = collarGrad;
  ctx.beginPath();
  ctx.moveTo(bodyX - 29, shoulderY + 2);
  ctx.lineTo(bodyX - 14, shoulderY + 28);
  ctx.lineTo(bodyX - 1, shoulderY + 18);
  ctx.lineTo(bodyX - 22, shoulderY - 5);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(bodyX + 29, shoulderY + 2);
  ctx.lineTo(bodyX + 14, shoulderY + 28);
  ctx.lineTo(bodyX + 1, shoulderY + 18);
  ctx.lineTo(bodyX + 22, shoulderY - 5);
  ctx.closePath();
  ctx.fill();

  const lapelGrad = ctx.createLinearGradient(bodyX - 68, shoulderY + 4, bodyX + 68, shoulderY + 150);
  lapelGrad.addColorStop(0, '#314058');
  lapelGrad.addColorStop(1, '#192231');
  ctx.fillStyle = lapelGrad;

  ctx.beginPath();
  ctx.moveTo(bodyX - 40, shoulderY + 4);
  ctx.lineTo(bodyX - 68, shoulderY + 48);
  ctx.lineTo(bodyX - 56, shoulderY + 54);
  ctx.lineTo(bodyX - 65, shoulderY + 68);
  ctx.lineTo(bodyX - 46, shoulderY + 152);
  ctx.lineTo(bodyX - 32, shoulderY + 22);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(bodyX + 40, shoulderY + 4);
  ctx.lineTo(bodyX + 68, shoulderY + 48);
  ctx.lineTo(bodyX + 56, shoulderY + 54);
  ctx.lineTo(bodyX + 65, shoulderY + 68);
  ctx.lineTo(bodyX + 46, shoulderY + 152);
  ctx.lineTo(bodyX + 32, shoulderY + 22);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#090e18';
  roundRectPath(ctx, bodyX - 50, shoulderY + 86, 7.2, 13, 3.5);
  ctx.fill();
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(bodyX - 45, shoulderY + 92, 4.5, 2.0);

  // 3. Yakışıklı, Keskin Hatlı Genç Araştırmacı Yüzü
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(headTilt);

  // Arka/yan modern fade saç tabanı
  ctx.fillStyle = '#140f0d';
  ctx.beginPath();
  ctx.ellipse(0, -21, 57.5, 57, 0, Math.PI * 0.86, Math.PI * 2.14);
  ctx.fill();

  drawSculptedEar(ctx, -54.5, 4, -1, '#e6b496', '#c58d6d');
  drawSculptedEar(ctx, 54.5, 4, 1, '#e1ae90', '#c08767');

  // Atletik V-taper çene hattı (jawSharpness = 0.405)
  traceSculptedHeadPath(ctx, 0, 0, 110, 137, 0.405, jawDrop);
  const skinGrad = ctx.createRadialGradient(-12, -20, 10, 0, 6, 90);
  skinGrad.addColorStop(0, '#f8dac3');
  skinGrad.addColorStop(0.55, '#e8b99a');
  skinGrad.addColorStop(0.86, '#d29876');
  skinGrad.addColorStop(1, '#ba7f5e');
  ctx.fillStyle = skinGrad;
  ctx.fill();

  ctx.save();
  traceSculptedHeadPath(ctx, 0, 0, 110, 137, 0.405, jawDrop);
  ctx.clip();

  const hairlineAO = ctx.createLinearGradient(0, -68, 0, -40);
  hairlineAO.addColorStop(0, 'rgba(54, 28, 18, 0.24)');
  hairlineAO.addColorStop(1, 'rgba(54, 28, 18, 0)');
  ctx.fillStyle = hairlineAO;
  ctx.fillRect(-58, -70, 116, 32);

  // Sol iç kenar akıllı tahta eflatun rim ışığı
  const rimL = ctx.createLinearGradient(-56, 0, -33, 0);
  rimL.addColorStop(0, 'rgba(192, 132, 252, 0.25)');
  rimL.addColorStop(1, 'rgba(192, 132, 252, 0)');
  ctx.fillStyle = rimL;
  ctx.fillRect(-58, -70, 25, 150);

  // Sağ dış elmacık/çene derinlik gölgesi
  const shadeR = ctx.createLinearGradient(28, 0, 56, 0);
  shadeR.addColorStop(0, 'rgba(104, 58, 40, 0)');
  shadeR.addColorStop(1, 'rgba(104, 58, 40, 0.22)');
  ctx.fillStyle = shadeR;
  ctx.fillRect(28, -68, 30, 150);

  drawCheekboneSculptContour(ctx, jawDrop);

  ctx.fillStyle = 'rgba(255, 245, 236, 0.22)';
  ctx.beginPath();
  ctx.ellipse(-29, 3, 10.5, 4.5, -0.2, 0, Math.PI * 2);
  ctx.ellipse(29, 3, 10.5, 4.5, 0.2, 0, Math.PI * 2);
  ctx.ellipse(-1, -33, 16, 5.2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Pürüzsüz, kadifemsi çok hafif bakımlı çene kontur gölgesi (dikenli nokta/leke olmadan!)
  const groomedJawShade = ctx.createLinearGradient(0, 26, 0, 72 + jawDrop);
  groomedJawShade.addColorStop(0, 'rgba(40, 28, 24, 0)');
  groomedJawShade.addColorStop(0.65, 'rgba(40, 28, 24, 0.045)');
  groomedJawShade.addColorStop(1, 'rgba(40, 28, 24, 0.11)');
  ctx.fillStyle = groomedJawShade;
  ctx.fillRect(-56, 26, 112, 50 + jawDrop);

  ctx.restore();

  // Keskin jawline konturu
  ctx.strokeStyle = 'rgba(112, 64, 46, 0.28)';
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.moveTo(-44.5, 38 + jawDrop * 0.42);
  ctx.quadraticCurveTo(-23, 64.5 + jawDrop * 0.85, 0, 69.5 + jawDrop);
  ctx.quadraticCurveTo(23, 64.5 + jawDrop * 0.85, 44.5, 38 + jawDrop * 0.42);
  ctx.stroke();

  // Sakkadik doğal bakış
  const boardOffsetX = clamp((boardFocusX - bodyX) / 520, -1, 1) * 2.5;
  const boardOffsetY = clamp((boardFocusY - hy) / 380, -1, 1) * 1.1;
  const { gx: gazeX, gy: gazeY } = computeSaccadicGaze(
    t,
    speaking,
    coHostSpeaking,
    boardOffsetX,
    boardOffsetY,
    -1,
    1.7,
  );
  const blink = computeBlink(now, 2.1);

  // Derin sıcak espresso-kehribar çekici gözler
  drawAttractiveEye(
    ctx,
    -22,
    -3.8,
    13.0,
    6.7,
    -1,
    '#160d08',
    '#4c2e1b',
    '#8f5b34',
    gazeX,
    gazeY,
    blink,
    'rgba(100, 58, 42, 0.32)',
  );
  drawAttractiveEye(
    ctx,
    22,
    -3.8,
    13.0,
    6.7,
    1,
    '#160d08',
    '#4c2e1b',
    '#8f5b34',
    gazeX,
    gazeY,
    blink,
    'rgba(100, 58, 42, 0.32)',
  );

  // Gür, düz-açılı maskülen kaşlar
  const browLift = speaking ? Math.max(0, Math.sin(t * 2.5)) * 2.3 : coHostSpeaking ? 0.6 : 0;
  drawMasculineEyebrow(ctx, -1, browLift, '#16100d', 'rgba(30, 20, 16, 0.56)', 5.0);
  drawMasculineEyebrow(ctx, 1, browLift, '#16100d', 'rgba(30, 20, 16, 0.56)', 5.0);

  // Düz ve estetik burun
  drawRefinedMasculineNose(
    ctx,
    0,
    -3.6,
    25.2,
    -1,
    'rgba(122, 72, 52, 0.4)',
    'rgba(255, 244, 234, 0.44)',
  );

  // Doğal sıcak dudaklar ve karizmatik tebessüm
  drawCharismaticMouth(
    ctx,
    0,
    37.5 + jawDrop * 0.28,
    viseme,
    inBreath ? 0.03 : mouthOpen,
    speaking && !inBreath,
    '#b5766c',
    '#c7887e',
    '#894f47',
    jawDrop,
  );

  // Modern hacimli dokulu espresso saç (textured quiff & tapered sides)
  const hairGrad = ctx.createLinearGradient(-56, -94, 56, -12);
  hairGrad.addColorStop(0, '#322520');
  hairGrad.addColorStop(0.5, '#1b1411');
  hairGrad.addColorStop(1, '#0d0908');
  ctx.fillStyle = hairGrad;

  ctx.beginPath();
  ctx.moveTo(-53.5, 1);
  ctx.bezierCurveTo(-56.5, -18, -58, -50, -42, -79);
  ctx.bezierCurveTo(-22, -97, 20, -98, 42, -78);
  ctx.bezierCurveTo(57.5, -52, 56.5, -18, 53.5, 1);
  // Organik kademeli (taper fade) şakak geçişi
  ctx.bezierCurveTo(51, -9, 49.5, -24, 45, -38);
  ctx.bezierCurveTo(36, -49, 14, -53, -12, -51);
  ctx.bezierCurveTo(-31, -50, -43, -45, -46.5, -36);
  ctx.bezierCurveTo(-49.5, -23, -51, -9, -53.5, 1);
  ctx.closePath();
  ctx.fill();

  // Ön hacimli modern dokulu quiff dalgası
  const quiffGrad = ctx.createLinearGradient(-42, -92, 44, -44);
  quiffGrad.addColorStop(0, '#3d2d27');
  quiffGrad.addColorStop(1, '#19120f');
  ctx.fillStyle = quiffGrad;
  ctx.beginPath();
  ctx.moveTo(-43, -44);
  ctx.bezierCurveTo(-28, -88, 18, -92, 45, -46);
  ctx.bezierCurveTo(20, -57, -16, -54, -43, -44);
  ctx.closePath();
  ctx.fill();

  // Saç üstü dinamik ışık dokusu ve mor rim yansıması
  ctx.strokeStyle = 'rgba(182, 152, 136, 0.28)';
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-32, -64);
  ctx.quadraticCurveTo(0, -83, 35, -57);
  ctx.moveTo(-18, -75);
  ctx.quadraticCurveTo(12, -88, 40, -64);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(192, 132, 252, 0.25)';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(-53, -24);
  ctx.bezierCurveTo(-50, -56, -32, -80, -8, -86);
  ctx.stroke();

  ctx.restore();

  if (speaking) {
    drawArticulatedHandGesture(
      ctx,
      -1,
      bodyX,
      shoulderY,
      deskY,
      '#182231',
      '#eabca0',
      '#ce9676',
      t,
      mouthOpen,
    );
  }

  ctx.restore();
}

/** Yayın stüdyosu cam yansımalı masası, kondenser mikrofonlar ve sunucu isimlikleri */
function drawBroadcastDeskAndLowerThirds(
  ctx: CanvasRenderingContext2D,
  deskY: number,
  stageW: number,
  stageH: number,
  denizSpeaking: boolean,
  barisSpeaking: boolean,
  mouthOpen: number,
  now: number,
) {
  ctx.save();

  const deskGrad = ctx.createLinearGradient(0, deskY, 0, stageH);
  deskGrad.addColorStop(0, 'rgba(12, 18, 34, 0.97)');
  deskGrad.addColorStop(0.35, 'rgba(7, 11, 22, 0.99)');
  deskGrad.addColorStop(1, '#03050b');
  ctx.fillStyle = deskGrad;
  ctx.beginPath();
  ctx.moveTo(0, deskY + 14);
  ctx.quadraticCurveTo(stageW / 2, deskY - 12, stageW, deskY + 14);
  ctx.lineTo(stageW, stageH);
  ctx.lineTo(0, stageH);
  ctx.closePath();
  ctx.fill();

  if (denizSpeaking) {
    const reflL = ctx.createRadialGradient(210, deskY + 34, 8, 210, deskY + 34, 180);
    reflL.addColorStop(0, 'rgba(34, 211, 238, 0.14)');
    reflL.addColorStop(1, 'rgba(34, 211, 238, 0)');
    ctx.fillStyle = reflL;
    ctx.fillRect(20, deskY, 380, stageH - deskY);
  }
  if (barisSpeaking) {
    const reflR = ctx.createRadialGradient(stageW - 210, deskY + 34, 8, stageW - 210, deskY + 34, 180);
    reflR.addColorStop(0, 'rgba(192, 132, 252, 0.14)');
    reflR.addColorStop(1, 'rgba(192, 132, 252, 0)');
    ctx.fillStyle = reflR;
    ctx.fillRect(stageW - 400, deskY, 380, stageH - deskY);
  }

  const edgeGrad = ctx.createLinearGradient(0, 0, stageW, 0);
  edgeGrad.addColorStop(0, denizSpeaking ? 'rgba(34, 211, 238, 0.75)' : 'rgba(34, 211, 238, 0.35)');
  edgeGrad.addColorStop(0.5, 'rgba(148, 163, 184, 0.22)');
  edgeGrad.addColorStop(1, barisSpeaking ? 'rgba(192, 132, 252, 0.75)' : 'rgba(168, 85, 247, 0.35)');
  ctx.strokeStyle = edgeGrad;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(0, deskY + 14);
  ctx.quadraticCurveTo(stageW / 2, deskY - 12, stageW, deskY + 14);
  ctx.stroke();

  const drawDeskMic = (mx: number, dir: 1 | -1, active: boolean, accent: string) => {
    ctx.save();
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 4.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(mx, deskY + 16);
    ctx.quadraticCurveTo(mx + dir * 11, deskY - 22, mx - dir * 18, deskY - 41);
    ctx.stroke();

    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.ellipse(mx, deskY + 16, 19, 5.2, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.translate(mx - dir * 21, deskY - 44);
    ctx.rotate(dir * -0.44);
    roundRectPath(ctx, -8.5, -15, 17, 28, 8.5);
    ctx.fillStyle = '#0b1120';
    ctx.fill();

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';
    ctx.lineWidth = 0.9;
    for (let gy = -10; gy <= -2; gy += 3) {
      ctx.beginPath();
      ctx.moveTo(-5.5, gy);
      ctx.lineTo(5.5, gy);
      ctx.stroke();
    }

    ctx.strokeStyle = active ? accent : '#475569';
    ctx.lineWidth = active ? 1.8 : 1.3;
    roundRectPath(ctx, -8.5, -15, 17, 28, 8.5);
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
    const bw = 258;
    const bh = 60;
    ctx.save();
    roundRectPath(ctx, bx, by, bw, bh, 15);
    ctx.fillStyle = 'rgba(6, 10, 21, 0.92)';
    ctx.fill();
    ctx.strokeStyle = active ? accent : 'rgba(148, 163, 184, 0.18)';
    ctx.lineWidth = active ? 1.85 : 1;
    ctx.stroke();

    roundRectPath(ctx, bx + 9, by + 11, 3.5, bh - 22, 2);
    ctx.fillStyle = active ? accent : 'rgba(148, 163, 184, 0.35)';
    ctx.fill();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#f8fafc';
    ctx.font = `700 18px ${FONT}`;
    ctx.fillText(name, bx + 23, by + 27);

    ctx.fillStyle = active ? accent : '#94a3b8';
    ctx.font = `600 11px ${FONT}`;
    ctx.fillText(role, bx + 23, by + 46);

    if (active) {
      const eqX = bx + bw - 43;
      const energyBoost = 0.45 + clamp(mouthOpen, 0, 1) * 0.75;
      for (let i = 0; i < 4; i++) {
        const barH = 5 + Math.abs(Math.sin(now / 105 + i * 1.35)) * 18 * energyBoost;
        ctx.fillStyle = accent;
        roundRectPath(ctx, eqX + i * 7, by + 30 - barH / 2, 4, barH, 2);
        ctx.fill();
      }
      ctx.fillStyle = accent;
      ctx.font = `700 9px ${FONT}`;
      ctx.fillText('● ON AIR', bx + bw - 66, by + 15);
    }
    ctx.restore();
  };

  drawBadge(38, stageH - 80, 'Dr. Deniz', 'AKADEMİK ANLATICI', '#22d3ee', denizSpeaking);
  drawBadge(stageW - 296, stageH - 80, 'Barış', 'ARAŞTIRMACI & SORU SORAN', '#c084fc', barisSpeaking);

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

  // Sunucular tahtadan ayrışacak kadar büyük, yüz ayrıntıları okunacak kadar yakın
  // görünür; masanın perspektifi ve alt bilgi kartları sabit kalır.
  const presenterScale = 1.12;
  ctx.save();
  ctx.translate(168, deskY);
  ctx.scale(presenterScale, presenterScale);
  ctx.translate(-168, -deskY);
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
  ctx.restore();

  ctx.save();
  ctx.translate(stageW - 168, deskY);
  ctx.scale(presenterScale, presenterScale);
  ctx.translate(-(stageW - 168), -deskY);
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
  ctx.restore();

  drawBroadcastDeskAndLowerThirds(
    ctx,
    deskY,
    stageW,
    stageH,
    denizSpeaking,
    barisSpeaking,
    mouthOpen,
    now,
  );
}
