// Fotogerçekçi Dijital Yayın Stüdyosu Sunucuları: Dr. Deniz & Barış (v4)
// - Dinamik alt çene eklemi (mandible/jaw drop): Konuşma enerjisiyle alt çene ve çene gölgesi fiziksel olarak hareket eder.
// - Alt-yüzey cilt ışık kırılması (subsurface scattering), alın/göz kenarı doğal mikro ifade çizgileri,
//   sakkadik doğal göz odaklanması (izleyici <-> akıllı tahta <-> rol arkadaşı) ve üst göz kapağı takibi.
// - Dr. Deniz (Kıdemli Akademik Anlatıcı) ve Barış (Genç Araştırmacı) ses karakterleriyle %100 uyumlu portre gerçekçiliği.

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
  const cycle = (now / 1000 + seed) % 4.6;
  if (cycle < 0.055) {
    return smoothstep(0, 0.055, cycle);
  }
  if (cycle < 0.145) {
    return 1 - smoothstep(0.055, 0.145, cycle);
  }
  const doubleCycle = (now / 1000 + seed) % 13.8;
  if (doubleCycle > 0.22 && doubleCycle < 0.34) {
    return Math.sin(((doubleCycle - 0.22) / 0.12) * Math.PI);
  }
  return 0;
}

/** Sakkadik doğal insan bakış geçişi (sarkaç gibi sallanmak yerine net odak noktaları arasında yumuşak sıçrama) */
function computeSaccadicGaze(
  t: number,
  speaking: boolean,
  coHostSpeaking: boolean,
  boardOffsetX: number,
  boardOffsetY: number,
  coHostDir: 1 | -1,
  seed: number,
): { gx: number; gy: number } {
  const phase = (t * 0.42 + seed) % 3.0;
  // Mikro canlılık (canlı göz kasları)
  const microX = Math.sin(t * 3.1 + seed) * 0.16;
  const microY = Math.cos(t * 2.6 + seed) * 0.11;

  if (coHostSpeaking) {
    const lookBoard = phase > 2.25 ? smoothstep(2.25, 2.4, phase) * (1 - smoothstep(2.85, 3.0, phase)) : 0;
    const targetX = coHostDir * 2.75 * (1 - lookBoard) + boardOffsetX * lookBoard;
    const targetY = -0.15 * (1 - lookBoard) + boardOffsetY * lookBoard;
    return { gx: targetX + microX, gy: targetY + microY };
  }

  if (speaking) {
    // Konuşurken %65 doğrudan izleyiciye (kameraya), %35 akıllı tahtadaki aktif şemaya odaklanır
    const boardWeight =
      phase > 1.85 ? smoothstep(1.85, 2.02, phase) * (1 - smoothstep(2.78, 2.96, phase)) : 0;
    const cameraX = coHostDir * 0.35;
    const gx = cameraX * (1 - boardWeight) + boardOffsetX * boardWeight;
    const gy = 0.08 * (1 - boardWeight) + boardOffsetY * boardWeight;
    return { gx: gx + microX, gy: gy + microY };
  }

  return { gx: boardOffsetX * 0.75 + microX, gy: boardOffsetY * 0.75 + microY };
}

/** İç kulak kıvrımlarıyla (heliks, antiheliks, tragüs ve konka gölgesi) anatomik kulak çizimi */
function drawDetailedEar(
  ctx: CanvasRenderingContext2D,
  ex: number,
  ey: number,
  side: -1 | 1,
  baseColor: string,
  shadowColor: string,
) {
  ctx.save();
  ctx.translate(ex, ey);
  ctx.rotate(side * 0.1);

  const earGrad = ctx.createLinearGradient(-side * 9, -15, side * 9, 17);
  earGrad.addColorStop(0, baseColor);
  earGrad.addColorStop(0.65, shadowColor);
  earGrad.addColorStop(1, 'rgba(138, 86, 62, 0.95)');
  ctx.fillStyle = earGrad;
  ctx.beginPath();
  ctx.ellipse(0, 0, 9.2, 17.2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Heliks dış kıvrım ışığı
  ctx.strokeStyle = 'rgba(255, 236, 222, 0.28)';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.arc(0, -1, 7.2, side === 1 ? -Math.PI * 0.65 : -Math.PI * 0.35, side === 1 ? Math.PI * 0.55 : Math.PI * 1.45);
  ctx.stroke();

  // İç kulak kepçesi (concha & antihelix) gölgesi
  ctx.strokeStyle = 'rgba(98, 52, 36, 0.44)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, -1, 5.1, side === 1 ? -Math.PI * 0.7 : -Math.PI * 0.3, side === 1 ? Math.PI * 0.65 : Math.PI * 1.35);
  ctx.stroke();

  ctx.fillStyle = 'rgba(88, 44, 28, 0.28)';
  ctx.beginPath();
  ctx.ellipse(-side * 1.5, 1.6, 3.3, 5.6, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/** Lif dokulu iris, limbal halka, gözyaşı pınarı, sklera damar/gölge derinliği ve göz kapağı takibiyle insan gözü */
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
  creaseColor: string,
  matureCrinkles: boolean,
) {
  ctx.save();

  // Göz çukuru yumuşak orbital ortam gölgesi (ambient occlusion)
  const orbitAO = ctx.createRadialGradient(cx, cy - 2, rx * 0.2, cx, cy - 2, rx * 1.45);
  orbitAO.addColorStop(0, 'rgba(96, 52, 36, 0.16)');
  orbitAO.addColorStop(1, 'rgba(96, 52, 36, 0)');
  ctx.fillStyle = orbitAO;
  ctx.beginPath();
  ctx.ellipse(cx, cy - 2, rx * 1.42, ry * 1.95, 0, 0, Math.PI * 2);
  ctx.fill();

  // Üst göz kapağı kıvrımı (palpebral sulcus — dikey bakışı hafifçe takip eder)
  const lidTrack = gazeY * 0.35;
  ctx.strokeStyle = creaseColor;
  ctx.lineWidth = 1.65;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - rx * 1.08, cy - ry * 0.68 + lidTrack * 0.5);
  ctx.bezierCurveTo(
    cx - rx * 0.46,
    cy - ry * 1.82 + lidTrack,
    cx + rx * 0.46,
    cy - ry * 1.78 + lidTrack,
    cx + rx * 1.08,
    cy - ry * 0.64 + lidTrack * 0.5,
  );
  ctx.stroke();

  // Alt göz altı doğal anatomik hat (tear trough)
  ctx.strokeStyle = 'rgba(116, 68, 50, 0.18)';
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.moveTo(cx - rx * 0.82, cy + ry * 1.2);
  ctx.quadraticCurveTo(cx, cy + ry * 1.62, cx + rx * 0.82, cy + ry * 1.15);
  ctx.stroke();

  // Kıdemli akademisyen dış göz kenarı doğal ifade çizgileri
  if (matureCrinkles) {
    const outerX = cx + side * (rx + 2.2);
    ctx.strokeStyle = 'rgba(112, 64, 46, 0.18)';
    ctx.lineWidth = 1.0;
    for (let c = -1; c <= 1; c++) {
      ctx.beginPath();
      ctx.moveTo(outerX, cy + c * 2.2);
      ctx.lineTo(outerX + side * 5.2, cy + c * 3.6 - 0.6);
      ctx.stroke();
    }
  }

  const openFactor = clamp(1 - blink, 0.03, 1);
  const curRy = ry * openFactor;

  if (blink > 0.86) {
    ctx.strokeStyle = '#1b120e';
    ctx.lineWidth = 2.15;
    ctx.beginPath();
    ctx.moveTo(cx - rx, cy + 0.8);
    ctx.quadraticCurveTo(cx, cy + 3.4, cx + rx, cy + 0.5);
    ctx.stroke();
    ctx.restore();
    return;
  }

  // Anatomik göz açıklığı
  ctx.beginPath();
  ctx.moveTo(cx - rx, cy + 0.8);
  ctx.bezierCurveTo(
    cx - rx * 0.52,
    cy - curRy * 1.28 + lidTrack,
    cx + rx * 0.52,
    cy - curRy * 1.25 + lidTrack,
    cx + rx,
    cy + 0.3,
  );
  ctx.bezierCurveTo(
    cx + rx * 0.52,
    cy + curRy * 1.12,
    cx - rx * 0.52,
    cy + curRy * 1.1,
    cx - rx,
    cy + 0.8,
  );
  ctx.closePath();

  // Doğal 3B küresel göz akı (sklera — düz beyaz değil, kenarlarda gerçekçi küresel gölge)
  const scleraGrad = ctx.createRadialGradient(cx + gazeX * 0.3, cy, rx * 0.08, cx, cy, rx * 1.05);
  scleraGrad.addColorStop(0, '#f7f8fb');
  scleraGrad.addColorStop(0.68, '#eaedf4');
  scleraGrad.addColorStop(1, '#c5cfdd');
  ctx.fillStyle = scleraGrad;
  ctx.fill();

  ctx.save();
  ctx.clip();

  // İç göz pınarı (lacrimal caruncle)
  const innerCornerX = side === -1 ? cx + rx * 0.86 : cx - rx * 0.86;
  ctx.fillStyle = 'rgba(204, 118, 114, 0.72)';
  ctx.beginPath();
  ctx.ellipse(innerCornerX, cy + 0.65, 2.5, 1.8, 0, 0, Math.PI * 2);
  ctx.fill();

  // İris + Limbal Halka + Lif Dokusu
  const ix = cx + gazeX;
  const iy = cy + gazeY;
  const irisR = ry * 0.94;

  ctx.fillStyle = limbalColor;
  ctx.beginPath();
  ctx.arc(ix, iy, irisR, 0, Math.PI * 2);
  ctx.fill();

  const irisGrad = ctx.createRadialGradient(ix, iy + irisR * 0.2, irisR * 0.1, ix, iy, irisR * 0.88);
  irisGrad.addColorStop(0, irisHighlight);
  irisGrad.addColorStop(0.58, irisMid);
  irisGrad.addColorStop(1, limbalColor);
  ctx.fillStyle = irisGrad;
  ctx.beginPath();
  ctx.arc(ix, iy, irisR * 0.86, 0, Math.PI * 2);
  ctx.fill();

  // İnce radyal iris stroma lifleri
  ctx.strokeStyle = 'rgba(255, 228, 188, 0.19)';
  ctx.lineWidth = 0.72;
  for (let k = 0; k < 14; k++) {
    const ang = (k / 14) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(ix + Math.cos(ang) * irisR * 0.4, iy + Math.sin(ang) * irisR * 0.4);
    ctx.lineTo(ix + Math.cos(ang) * irisR * 0.82, iy + Math.sin(ang) * irisR * 0.82);
    ctx.stroke();
  }

  // Göz bebeği (pupil)
  ctx.fillStyle = '#07090e';
  ctx.beginPath();
  ctx.arc(ix, iy, irisR * 0.4, 0, Math.PI * 2);
  ctx.fill();

  // Üst göz kapağının kornea üzerine düşürdüğü yumuşak gölge
  const lidShadow = ctx.createLinearGradient(0, cy - curRy * 1.25, 0, cy);
  lidShadow.addColorStop(0, 'rgba(10, 15, 28, 0.48)');
  lidShadow.addColorStop(1, 'rgba(10, 15, 28, 0)');
  ctx.fillStyle = lidShadow;
  ctx.fillRect(cx - rx - 2, cy - curRy * 1.35, rx * 2 + 4, curRy * 1.35);

  // Stüdyo softbox yansımaları (kornea catchlight)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
  ctx.beginPath();
  ctx.ellipse(ix - irisR * 0.28, iy - irisR * 0.28, irisR * 0.22, irisR * 0.16, -0.35, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(186, 238, 255, 0.58)';
  ctx.beginPath();
  ctx.arc(ix + irisR * 0.28, iy + irisR * 0.26, irisR * 0.1, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  // Üst kirpik kökü hattı
  ctx.strokeStyle = '#17100c';
  ctx.lineWidth = 2.1;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - rx, cy + 0.8);
  ctx.bezierCurveTo(
    cx - rx * 0.52,
    cy - curRy * 1.28 + lidTrack,
    cx + rx * 0.52,
    cy - curRy * 1.25 + lidTrack,
    cx + rx,
    cy + 0.3,
  );
  ctx.stroke();

  // Alt göz kapağı ıslak su hattı (waterline) + ince alt kirpik gölgesi
  ctx.strokeStyle = 'rgba(248, 222, 212, 0.44)';
  ctx.lineWidth = 0.95;
  ctx.beginPath();
  ctx.moveTo(cx - rx * 0.82, cy + curRy * 0.88);
  ctx.quadraticCurveTo(cx, cy + curRy * 1.06, cx + rx * 0.82, cy + curRy * 0.84);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(64, 38, 28, 0.38)';
  ctx.lineWidth = 1.0;
  ctx.beginPath();
  ctx.moveTo(cx - rx * 0.86, cy + curRy * 0.96);
  ctx.quadraticCurveTo(cx, cy + curRy * 1.2, cx + rx * 0.86, cy + curRy * 0.92);
  ctx.stroke();

  ctx.restore();
}

/** Tel tel kıl dokulu ve kaş kemiği gölgeli doğal kaş çizimi */
function drawNaturalEyebrow(
  ctx: CanvasRenderingContext2D,
  side: -1 | 1,
  browLift: number,
  colorDark: string,
  colorSoft: string,
  thickness: number,
) {
  ctx.save();
  const innerX = side * 8.5;
  const archX = side * 25;
  const outerX = side * 42;
  const baseY = -16.8;

  // Kaş kemiği yumuşak gölgesi
  ctx.fillStyle = colorSoft;
  ctx.beginPath();
  ctx.moveTo(innerX, baseY - browLift * 0.45);
  ctx.quadraticCurveTo(archX, baseY - 7.8 - browLift, outerX, baseY - 0.8 - browLift * 0.55);
  ctx.quadraticCurveTo(
    archX,
    baseY - 7.8 + thickness - browLift,
    innerX,
    baseY + thickness * 0.88 - browLift * 0.45,
  );
  ctx.closePath();
  ctx.fill();

  // Tek tek doğal yönlü kaş kılları
  ctx.strokeStyle = colorDark;
  ctx.lineWidth = 1.28;
  ctx.lineCap = 'round';
  const steps = 15;
  for (let i = 0; i < steps; i++) {
    const u = i / (steps - 1);
    const px = innerX + (outerX - innerX) * u;
    const archCurve = Math.sin(u * Math.PI) * 6.2;
    const py = baseY + thickness * 0.58 - archCurve - browLift * (0.45 + Math.sin(u * Math.PI) * 0.55);
    const slantX = side * (1.8 + u * 3.4);
    const slantY = -thickness * (1.02 - u * 0.44);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + slantX, py + slantY);
    ctx.stroke();
  }

  ctx.restore();
}

/** Burun sırtı, kanatları, burun ucu alt gölgesi ve filtrum (dudak üstü oluğu) */
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

  // Burun yan duvarı 3B düzlem gölgesi
  const sideGrad = ctx.createLinearGradient(cx - 10, topY, cx + 10, topY + len);
  sideGrad.addColorStop(0, facingDir === 1 ? 'rgba(126, 72, 52, 0.21)' : 'rgba(126, 72, 52, 0.04)');
  sideGrad.addColorStop(1, facingDir === 1 ? 'rgba(126, 72, 52, 0.04)' : 'rgba(126, 72, 52, 0.22)');
  ctx.fillStyle = sideGrad;
  ctx.beginPath();
  ctx.moveTo(cx - 5.5, topY + 1);
  ctx.lineTo(cx + 5.5, topY + 1);
  ctx.lineTo(cx + 9, topY + len - 2);
  ctx.lineTo(cx - 9, topY + len - 2);
  ctx.closePath();
  ctx.fill();

  // Burun tabanı alt gölgesi (subnasale AO)
  const baseAO = ctx.createRadialGradient(cx, topY + len + 2, 1, cx, topY + len + 2, 11);
  baseAO.addColorStop(0, 'rgba(92, 48, 34, 0.26)');
  baseAO.addColorStop(1, 'rgba(92, 48, 34, 0)');
  ctx.fillStyle = baseAO;
  ctx.beginPath();
  ctx.ellipse(cx, topY + len + 2.2, 11, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Burun sırtı konturu
  ctx.strokeStyle = shadowColor;
  ctx.lineWidth = 1.65;
  ctx.beginPath();
  ctx.moveTo(cx + facingDir * 2.2, topY - 1);
  ctx.bezierCurveTo(
    cx + facingDir * 4.4,
    topY + len * 0.55,
    cx + facingDir * 6.4,
    topY + len * 0.86,
    cx + facingDir * 2.0,
    topY + len + 0.5,
  );
  ctx.stroke();

  // Burun kanatları (alae) + burun delikleri
  ctx.strokeStyle = shadowColor;
  ctx.lineWidth = 1.55;
  ctx.beginPath();
  ctx.moveTo(cx - 10, topY + len - 3.5);
  ctx.bezierCurveTo(cx - 11.6, topY + len + 1.2, cx - 6.2, topY + len + 3, cx - 3, topY + len + 1.6);
  ctx.moveTo(cx + 10, topY + len - 3.5);
  ctx.bezierCurveTo(cx + 11.6, topY + len + 1.2, cx + 6.2, topY + len + 3, cx + 3, topY + len + 1.6);
  ctx.stroke();

  ctx.fillStyle = 'rgba(78, 38, 26, 0.48)';
  ctx.beginPath();
  ctx.ellipse(cx - 4.8, topY + len + 0.9, 2.2, 1.05, 0.25, 0, Math.PI * 2);
  ctx.ellipse(cx + 4.8, topY + len + 0.9, 2.2, 1.05, -0.25, 0, Math.PI * 2);
  ctx.fill();

  // Burun sırtı ve ucu yumuşak stüdyo ışığı
  ctx.fillStyle = highlightColor;
  ctx.beginPath();
  ctx.ellipse(cx + facingDir * 0.7, topY + len * 0.44, 1.9, len * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + facingDir * 1.1, topY + len - 4, 3.5, 4.0, 0, 0, Math.PI * 2);
  ctx.fill();

  // Filtrum oluğu
  ctx.strokeStyle = 'rgba(128, 74, 54, 0.22)';
  ctx.lineWidth = 1.15;
  ctx.beginPath();
  ctx.moveTo(cx - 2.5, topY + len + 3.2);
  ctx.lineTo(cx - 3.4, topY + len + 10.5);
  ctx.moveTo(cx + 2.5, topY + len + 3.2);
  ctx.lineTo(cx + 3.4, topY + len + 10.5);
  ctx.stroke();

  ctx.restore();
}

/** Dinamik alt çene eklemli, nazolabial kıvrımlı, doğal dudak ve diş/dil senkronu */
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
  jawDrop: number,
) {
  ctx.save();

  const open = speaking ? clamp(openAmount, 0, 1) : 0;
  let halfW = 18.8;
  let gapH = 0;

  if (!speaking || viseme === 'rest') {
    halfW = 19.0;
    gapH = open * 2.4;
  } else if (viseme === 'closed') {
    halfW = 17.4;
    gapH = 0.3;
  } else if (viseme === 'round') {
    halfW = 13.2;
    gapH = 3.6 + open * 8.2;
  } else if (viseme === 'open') {
    halfW = 18.2;
    gapH = 4.0 + open * 9.5;
  } else {
    halfW = 20.0;
    gapH = 2.2 + open * 6.6;
  }

  const cornerLift = speaking ? -0.7 + jawDrop * 0.15 : -1.8;

  // Doğal nazolabial ifade kıvrımları (konuşurken hafifçe belirginleşir)
  const nlAlpha = 0.16 + open * 0.08;
  ctx.strokeStyle = `rgba(122, 68, 48, ${nlAlpha.toFixed(2)})`;
  ctx.lineWidth = 1.45;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - 13.5, cy - 17.5);
  ctx.quadraticCurveTo(cx - halfW - 6, cy - 4.5, cx - halfW - 3.4, cy + cornerLift + 5);
  ctx.moveTo(cx + 13.5, cy - 17.5);
  ctx.quadraticCurveTo(cx + halfW + 6, cy - 4.5, cx + halfW + 3.4, cy + cornerLift + 5);
  ctx.stroke();

  // Ağız içi boşluğu (konuşurken)
  if (gapH > 1.2) {
    ctx.beginPath();
    ctx.moveTo(cx - halfW + 1, cy + cornerLift);
    ctx.quadraticCurveTo(cx, cy - gapH * 0.36, cx + halfW - 1, cy + cornerLift);
    ctx.quadraticCurveTo(cx, cy + gapH * 1.15 + jawDrop * 0.25, cx - halfW + 1, cy + cornerLift);
    ctx.closePath();

    const mouthCavity = ctx.createLinearGradient(cx, cy - gapH * 0.35, cx, cy + gapH + jawDrop * 0.25);
    mouthCavity.addColorStop(0, '#240910');
    mouthCavity.addColorStop(1, '#471522');
    ctx.fillStyle = mouthCavity;
    ctx.fill();

    ctx.save();
    ctx.clip();
    // Üst diş sırası (yumuşak doğal mine tonu)
    if (gapH > 2.2 && viseme !== 'round') {
      const teethGrad = ctx.createLinearGradient(cx - halfW * 0.7, cy, cx + halfW * 0.7, cy);
      teethGrad.addColorStop(0, '#cfd8e3');
      teethGrad.addColorStop(0.25, '#f4f7fb');
      teethGrad.addColorStop(0.75, '#f4f7fb');
      teethGrad.addColorStop(1, '#cfd8e3');
      ctx.fillStyle = teethGrad;
      roundRectPath(
        ctx,
        cx - halfW * 0.68,
        cy - gapH * 0.42,
        halfW * 1.36,
        Math.min(4.6, gapH * 0.52),
        [0, 0, 2, 2],
      );
      ctx.fill();
    }

    // Dil
    const tongueGrad = ctx.createRadialGradient(cx, cy + gapH * 0.78, 1, cx, cy + gapH * 0.85, halfW * 0.6);
    tongueGrad.addColorStop(0, '#b5495c');
    tongueGrad.addColorStop(1, '#7e2536');
    ctx.fillStyle = tongueGrad;
    ctx.beginPath();
    ctx.ellipse(cx, cy + gapH * 0.86 + jawDrop * 0.15, halfW * 0.52, gapH * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();

    // Alt dişlerin çok hafif doğal parıltısı (geniş açık ünlülerde)
    if (gapH > 6.5) {
      ctx.fillStyle = 'rgba(232, 238, 246, 0.72)';
      roundRectPath(ctx, cx - halfW * 0.5, cy + gapH * 0.72 + jawDrop * 0.2, halfW, 2.2, 1);
      ctx.fill();
    }
    ctx.restore();
  }

  // Üst dudak (doğal erkek anatomisine uygun dengeli hacim)
  const upGrad = ctx.createLinearGradient(cx, cy - 6.2 - gapH * 0.2, cx, cy + 1);
  upGrad.addColorStop(0, upperLipColor);
  upGrad.addColorStop(1, lipShadowColor);
  ctx.fillStyle = upGrad;
  ctx.beginPath();
  ctx.moveTo(cx - halfW, cy + cornerLift);
  ctx.bezierCurveTo(
    cx - halfW * 0.52,
    cy - 4.8 - gapH * 0.2,
    cx - 3.6,
    cy - 5.6 - gapH * 0.2,
    cx,
    cy - 4.1 - gapH * 0.2,
  );
  ctx.bezierCurveTo(
    cx + 3.6,
    cy - 5.6 - gapH * 0.2,
    cx + halfW * 0.52,
    cy - 4.8 - gapH * 0.2,
    cx + halfW,
    cy + cornerLift,
  );
  ctx.quadraticCurveTo(cx, cy - gapH * 0.3 + 0.7, cx - halfW, cy + cornerLift);
  ctx.closePath();
  ctx.fill();

  // Alt dudak (alt çene hareketiyle uyumlu)
  const lowBaseY = cy + gapH * 1.06 + jawDrop * 0.22;
  const lowGrad = ctx.createLinearGradient(cx, cy + gapH * 0.4, cx, lowBaseY + 7.2);
  lowGrad.addColorStop(0, lowerLipColor);
  lowGrad.addColorStop(0.7, upperLipColor);
  lowGrad.addColorStop(1, lipShadowColor);
  ctx.fillStyle = lowGrad;
  ctx.beginPath();
  ctx.moveTo(cx - halfW + 0.6, cy + cornerLift);
  ctx.quadraticCurveTo(cx, lowBaseY - 0.5, cx + halfW - 0.6, cy + cornerLift);
  ctx.quadraticCurveTo(cx, lowBaseY + 7.2, cx - halfW + 0.6, cy + cornerLift);
  ctx.closePath();
  ctx.fill();

  // Alt dudak doğal dokusu / mikro ışıltısı
  ctx.fillStyle = 'rgba(255, 245, 242, 0.2)';
  ctx.beginPath();
  ctx.ellipse(cx - 1.5, lowBaseY + 2.4, halfW * 0.26, 1.2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Ağız köşeleri mikro gölgesi (commissures)
  ctx.fillStyle = 'rgba(64, 22, 30, 0.42)';
  ctx.beginPath();
  ctx.arc(cx - halfW, cy + cornerLift, 1.45, 0, Math.PI * 2);
  ctx.arc(cx + halfW, cy + cornerLift, 1.45, 0, Math.PI * 2);
  ctx.fill();

  if (gapH <= 1.2) {
    ctx.strokeStyle = 'rgba(62, 20, 30, 0.58)';
    ctx.lineWidth = 1.45;
    ctx.beginPath();
    ctx.moveTo(cx - halfW, cy + cornerLift);
    ctx.quadraticCurveTo(cx, cy + 0.9, cx + halfW, cy + cornerLift);
    ctx.stroke();
  }

  // Alt dudak altı çene oluğu (mentolabial sulcus — çeneyle birlikte iner)
  ctx.strokeStyle = 'rgba(108, 60, 44, 0.26)';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(cx, lowBaseY + 12.2, 9.0, Math.PI * 1.16, Math.PI * 1.84);
  ctx.stroke();

  // Çene ucu yumuşak stüdyo ışığı (mental protuberance)
  ctx.fillStyle = 'rgba(255, 242, 230, 0.16)';
  ctx.beginPath();
  ctx.ellipse(cx, lowBaseY + 18.5, 9.5, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * Dinamik alt çene eklemli (jawDrop) anatomik baş konturu:
 * Konuşma sırasında alt çene ve yanak-çene hattı gerçek insan anatomisi gibi hareket eder.
 */
function traceHeadPath(
  ctx: CanvasRenderingContext2D,
  hx: number,
  hy: number,
  w: number,
  h: number,
  jawTaper: number,
  jawDrop = 0,
) {
  const taper = jawTaper - jawDrop * 0.0025;
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
    hy + h * 0.24 + jawDrop * 0.35,
    hx + w * taper,
    hy + h * 0.45 + jawDrop * 0.78,
    hx,
    hy + h * 0.52 + jawDrop,
  );
  ctx.bezierCurveTo(
    hx - w * taper,
    hy + h * 0.45 + jawDrop * 0.78,
    hx - w * 0.49,
    hy + h * 0.24 + jawDrop * 0.35,
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

/** Gerçekçi yönlü mikro sakal folikülleri (düz gri leke yerine ince kıl dokusu) */
function drawDirectionalMicroStubble(
  ctx: CanvasRenderingContext2D,
  intensity: number,
  jawDrop: number,
) {
  ctx.save();
  ctx.strokeStyle = `rgba(34, 24, 20, ${intensity.toFixed(3)})`;
  ctx.lineWidth = 0.85;
  ctx.lineCap = 'round';

  // Çene ve alt yanak bölgesi deterministik mikro folikül dizilimi
  for (let row = 0; row < 7; row++) {
    const baseY = 22 + row * 7.2 + jawDrop * (0.25 + row * 0.1);
    const halfSpan = Math.max(12, 52 - row * 5.8);
    const step = 4.6;
    for (let x = -halfSpan; x <= halfSpan; x += step) {
      // Ağız açıklığı çevresini temiz bırak
      if (Math.abs(x) < 19 && baseY > 28 && baseY < 47 + jawDrop * 0.5) continue;
      const jitterX = Math.sin(x * 0.7 + row * 1.9) * 1.1;
      const jitterY = Math.cos(x * 0.5 + row * 2.3) * 0.9;
      const sx = x + jitterX;
      const sy = baseY + jitterY;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + (x >= 0 ? -0.4 : 0.4), sy + 1.8);
      ctx.stroke();
    }
  }

  // Bıyık hattı ince folikülleri
  for (let x = -17; x <= 17; x += 3.2) {
    if (Math.abs(x) < 2.2) continue;
    const archY = 26.5 + (x * x) / 95;
    ctx.beginPath();
    ctx.moveTo(x, archY);
    ctx.lineTo(x + (x > 0 ? 0.5 : -0.5), archY + 2.0);
    ctx.stroke();
  }

  ctx.restore();
}

/** 5 parmaklı, eklem gölgeli ve gömlek manşetli anatomik anlatım eli */
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
  mouthOpen: number,
) {
  ctx.save();
  const emphasis = mouthOpen * 3.2;
  const wave = Math.sin(t * 2.5 + (side === 1 ? 0 : 0.7)) * 4.8 - emphasis;
  const wristX = shoulderX + side * (80 + Math.cos(t * 1.65) * 4.2);
  const wristY = deskY - 24 + wave;

  // Ceket kolu + kumaş kıvrım gölgesi
  ctx.strokeStyle = sleeveColor;
  ctx.lineWidth = 30;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(shoulderX + side * 104, shoulderY + 94);
  ctx.quadraticCurveTo(shoulderX + side * 114, deskY - 4, wristX - side * 10, wristY + 7);
  ctx.stroke();

  // Gömlek beyaz manşet ucu + manşet düğmesi detayı
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 21;
  ctx.beginPath();
  ctx.moveTo(wristX - side * 9.5, wristY + 6);
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
  ctx.ellipse(0, 1, 14.8, 10.0, 0, 0, Math.PI * 2);
  ctx.fill();

  // Başparmak
  ctx.strokeStyle = skinLight;
  ctx.lineWidth = 4.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-side * 4, -4);
  ctx.quadraticCurveTo(side * 2, -13.5, side * 9.5, -14.2);
  ctx.stroke();

  // 4 kavisli parmak (işaret -> serçe)
  const lengths = [17, 18.5, 16.8, 13.8];
  for (let f = 0; f < 4; f++) {
    const baseY = -5.2 + f * 3.35;
    const spread = (-0.28 + f * 0.19) * side;
    const len = lengths[f];
    ctx.strokeStyle = f >= 2 ? skinShadow : skinLight;
    ctx.lineWidth = 4.2 - f * 0.25;
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
// DR. DENİZ (SOL ANLATICI — KIDEMLİ AKADEMİSYEN SUNUCU)
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
  const breathe = Math.sin(t * 1.72) * 2.0;
  const torsoShift = speaking ? Math.sin(t * 0.72) * 1.8 : coHostSpeaking ? 1.5 : 0;
  const listenNod = coHostSpeaking ? Math.sin(t * 2.05) * 1.8 : 0;
  const speakCadence = speaking && !inBreath ? Math.sin(t * 3.85) * 1.2 : 0;
  const headTilt = speaking
    ? Math.sin(t * 0.95) * 0.018
    : coHostSpeaking
    ? 0.017 + Math.sin(t * 0.75) * 0.007
    : Math.sin(t * 0.6) * 0.009;

  const jawDrop = speaking && !inBreath ? clamp(mouthOpen, 0, 1) * 5.2 : 0;
  const bodyX = cx + torsoShift;
  const shoulderY = deskY - 202 + breathe * 0.55;
  const hx = bodyX + (speaking ? Math.sin(t * 0.85) * 1.9 : coHostSpeaking ? 1.8 : 0);
  const hy = shoulderY - 116 + breathe * 0.36 + listenNod + speakCadence;

  // Konuşmacı arka stüdyo yumuşak portre rim ışığı
  const auraAlpha = speaking ? 0.21 : 0.06;
  const aura = ctx.createRadialGradient(bodyX + 14, hy + 48, 22, bodyX + 14, hy + 48, 245);
  aura.addColorStop(0, `rgba(34, 211, 238, ${auraAlpha})`);
  aura.addColorStop(1, 'rgba(34, 211, 238, 0)');
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(bodyX + 14, hy + 48, 245, 0, Math.PI * 2);
  ctx.fill();

  // 1. Anatomik boyun, sternokleidomastoid kası ve çene altı dinamik gölgesi
  const neckGrad = ctx.createLinearGradient(hx - 26, hy + 46, hx + 26, shoulderY + 34);
  neckGrad.addColorStop(0, '#c79072');
  neckGrad.addColorStop(0.5, '#e8b99c');
  neckGrad.addColorStop(1, '#ce9678');
  ctx.fillStyle = neckGrad;
  ctx.beginPath();
  ctx.moveTo(hx - 24, hy + 46);
  ctx.lineTo(hx - 29, shoulderY + 26);
  ctx.quadraticCurveTo(bodyX, shoulderY + 50, hx + 29, shoulderY + 26);
  ctx.lineTo(hx + 24, hy + 46);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(128, 76, 56, 0.24)';
  ctx.lineWidth = 1.9;
  ctx.beginPath();
  ctx.moveTo(hx - 17, hy + 66);
  ctx.quadraticCurveTo(bodyX - 6, shoulderY + 18, bodyX - 3, shoulderY + 28);
  ctx.moveTo(hx + 17, hy + 66);
  ctx.quadraticCurveTo(bodyX + 6, shoulderY + 18, bodyX + 3, shoulderY + 28);
  ctx.stroke();

  const chinCast = ctx.createLinearGradient(0, hy + 53 + jawDrop, 0, hy + 88 + jawDrop);
  chinCast.addColorStop(0, 'rgba(68, 36, 24, 0.44)');
  chinCast.addColorStop(1, 'rgba(68, 36, 24, 0)');
  ctx.fillStyle = chinCast;
  ctx.fillRect(hx - 29, hy + 53 + jawDrop * 0.8, 58, 35);

  // 2. Özel dikim gece-laciverti yün akademisyen ceketi + açık yaka gökyüzü-beyaz Oxford gömlek + cep mendili
  const blazerGrad = ctx.createLinearGradient(bodyX - 152, shoulderY, bodyX + 152, deskY + 20);
  blazerGrad.addColorStop(0, '#1e3356');
  blazerGrad.addColorStop(0.52, '#111f38');
  blazerGrad.addColorStop(1, '#070e1c');
  ctx.fillStyle = blazerGrad;
  ctx.beginPath();
  ctx.moveTo(bodyX - 154, deskY + 20);
  ctx.bezierCurveTo(bodyX - 152, shoulderY + 68, bodyX - 132, shoulderY + 12, bodyX - 48, shoulderY + 2);
  ctx.lineTo(bodyX + 48, shoulderY + 2);
  ctx.bezierCurveTo(bodyX + 132, shoulderY + 12, bodyX + 152, shoulderY + 68, bodyX + 154, deskY + 20);
  ctx.closePath();
  ctx.fill();

  // Omuz dikiş çizgileri + akıllı tahtadan yansıyan camgöbeği rim ışığı
  ctx.strokeStyle = 'rgba(6, 12, 24, 0.62)';
  ctx.lineWidth = 1.7;
  ctx.beginPath();
  ctx.moveTo(bodyX - 112, shoulderY + 28);
  ctx.quadraticCurveTo(bodyX - 102, shoulderY + 76, bodyX - 108, deskY);
  ctx.moveTo(bodyX + 112, shoulderY + 28);
  ctx.quadraticCurveTo(bodyX + 102, shoulderY + 76, bodyX + 108, deskY);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(103, 232, 249, 0.42)';
  ctx.lineWidth = 2.1;
  ctx.beginPath();
  ctx.moveTo(bodyX + 48, shoulderY + 3);
  ctx.bezierCurveTo(bodyX + 128, shoulderY + 13, bodyX + 148, shoulderY + 66, bodyX + 152, deskY);
  ctx.stroke();

  // İç açık buz-mavisi/beyaz Oxford akademik gömlek ve pat/düğme detayı
  const shirtGrad = ctx.createLinearGradient(bodyX - 36, shoulderY + 4, bodyX + 36, shoulderY + 148);
  shirtGrad.addColorStop(0, '#f8fafc');
  shirtGrad.addColorStop(0.58, '#e0ecff');
  shirtGrad.addColorStop(1, '#bfd2ee');
  ctx.fillStyle = shirtGrad;
  ctx.beginPath();
  ctx.moveTo(bodyX - 36, shoulderY + 4);
  ctx.lineTo(bodyX, shoulderY + 148);
  ctx.lineTo(bodyX + 36, shoulderY + 4);
  ctx.quadraticCurveTo(bodyX, shoulderY + 24, bodyX - 36, shoulderY + 4);
  ctx.closePath();
  ctx.fill();

  // Gömlek ön pat şeridi ve sedef düğmeler
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.42)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(bodyX - 4, shoulderY + 26);
  ctx.lineTo(bodyX - 2, shoulderY + 136);
  ctx.moveTo(bodyX + 4, shoulderY + 26);
  ctx.lineTo(bodyX + 2, shoulderY + 136);
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  for (const byOff of [48, 82, 114]) {
    ctx.beginPath();
    ctx.arc(bodyX, shoulderY + byOff, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Dik duruşlu gömlek yakaları
  const collarGrad = ctx.createLinearGradient(bodyX, shoulderY - 6, bodyX, shoulderY + 32);
  collarGrad.addColorStop(0, '#ffffff');
  collarGrad.addColorStop(1, '#cbd5e1');
  ctx.fillStyle = collarGrad;
  ctx.beginPath();
  ctx.moveTo(bodyX - 31, shoulderY + 2);
  ctx.lineTo(bodyX - 15, shoulderY + 33);
  ctx.lineTo(bodyX - 2, shoulderY + 21);
  ctx.lineTo(bodyX - 23, shoulderY - 6);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(bodyX + 31, shoulderY + 2);
  ctx.lineTo(bodyX + 15, shoulderY + 33);
  ctx.lineTo(bodyX + 2, shoulderY + 21);
  ctx.lineTo(bodyX + 23, shoulderY - 6);
  ctx.closePath();
  ctx.fill();

  // Özel dikim ceket klapaları + terzi dikişi + cep mendili
  const lapelGrad = ctx.createLinearGradient(bodyX - 66, shoulderY + 4, bodyX + 66, shoulderY + 152);
  lapelGrad.addColorStop(0, '#27426d');
  lapelGrad.addColorStop(1, '#14243f');
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

  ctx.strokeStyle = 'rgba(148, 197, 255, 0.22)';
  ctx.lineWidth = 1.05;
  ctx.beginPath();
  ctx.moveTo(bodyX - 62, shoulderY + 67);
  ctx.lineTo(bodyX - 4, shoulderY + 150);
  ctx.moveTo(bodyX + 62, shoulderY + 67);
  ctx.lineTo(bodyX + 4, shoulderY + 150);
  ctx.stroke();

  // Ceket sol göğüs cebi ve ince ipek cep mendili
  ctx.fillStyle = 'rgba(224, 242, 254, 0.88)';
  ctx.beginPath();
  ctx.moveTo(bodyX + 54, shoulderY + 94);
  ctx.lineTo(bodyX + 68, shoulderY + 83);
  ctx.lineTo(bodyX + 82, shoulderY + 95);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#0c182c';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(bodyX + 49, shoulderY + 95);
  ctx.lineTo(bodyX + 88, shoulderY + 96);
  ctx.stroke();

  // Profesyonel yaka mikrofonu (lavalier windscreen + metal klips)
  ctx.fillStyle = '#090e18';
  roundRectPath(ctx, bodyX + 35, shoulderY + 74, 7.5, 13.5, 3.5);
  ctx.fill();
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(bodyX + 31, shoulderY + 80, 5, 2.2);

  // 3. Baş ve Fotogerçekçi Akademisyen Yüz Hatları
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(headTilt);

  // Arka/yan katmanlı saç tabanı
  ctx.fillStyle = '#1d1410';
  ctx.beginPath();
  ctx.ellipse(0, -18, 60.5, 56.5, 0, Math.PI * 0.85, Math.PI * 2.15);
  ctx.fill();

  // Anatomik kulaklar
  drawDetailedEar(ctx, -58.5, 6, -1, '#e0ac8e', '#c08768');
  drawDetailedEar(ctx, 58.5, 6, 1, '#e6b498', '#c68d6e');

  // 3B alt-yüzey ışık kırılmalı (SSS) yüz cildi
  traceHeadPath(ctx, 0, 0, 116, 138, 0.35, jawDrop);
  const skinGrad = ctx.createRadialGradient(14, -20, 10, 0, 8, 92);
  skinGrad.addColorStop(0, '#f7d6be');
  skinGrad.addColorStop(0.52, '#e7b696');
  skinGrad.addColorStop(0.84, '#cf9472');
  skinGrad.addColorStop(1, '#b57857');
  ctx.fillStyle = skinGrad;
  ctx.fill();

  // Yüz içi 3B düzlem gölgeleri, alın/ifade detayları ve stüdyo rim yansıması
  ctx.save();
  traceHeadPath(ctx, 0, 0, 116, 138, 0.35, jawDrop);
  ctx.clip();

  // Alın üstü saç dibi yumuşak ortam gölgesi (hairline AO)
  const hairlineAO = ctx.createLinearGradient(0, -68, 0, -38);
  hairlineAO.addColorStop(0, 'rgba(64, 34, 22, 0.32)');
  hairlineAO.addColorStop(1, 'rgba(64, 34, 22, 0)');
  ctx.fillStyle = hairlineAO;
  ctx.fillRect(-62, -70, 124, 34);

  // Sağ iç kenar akıllı tahta camgöbeği rim ışığı
  const faceRim = ctx.createLinearGradient(35, 0, 58, 0);
  faceRim.addColorStop(0, 'rgba(103, 232, 249, 0)');
  faceRim.addColorStop(1, 'rgba(103, 232, 249, 0.25)');
  ctx.fillStyle = faceRim;
  ctx.fillRect(34, -70, 26, 150);

  // Sol dış şakak ve elmacık altı derinlik gölgesi
  const jawShadeL = ctx.createLinearGradient(-59, 0, -26, 0);
  jawShadeL.addColorStop(0, 'rgba(104, 58, 40, 0.28)');
  jawShadeL.addColorStop(1, 'rgba(104, 58, 40, 0)');
  ctx.fillStyle = jawShadeL;
  ctx.fillRect(-60, -68, 35, 150);

  // Elmacık kemiği sıcak kan dolaşımı (subsurface warmth) + T-bölgesi doğal parlaklık
  const warmCheek = ctx.createRadialGradient(-32, 14, 2, -32, 14, 24);
  warmCheek.addColorStop(0, 'rgba(198, 98, 86, 0.14)');
  warmCheek.addColorStop(1, 'rgba(198, 98, 86, 0)');
  ctx.fillStyle = warmCheek;
  ctx.fillRect(-56, -10, 48, 48);

  const warmCheekR = ctx.createRadialGradient(32, 14, 2, 32, 14, 24);
  warmCheekR.addColorStop(0, 'rgba(198, 98, 86, 0.14)');
  warmCheekR.addColorStop(1, 'rgba(198, 98, 86, 0)');
  ctx.fillStyle = warmCheekR;
  ctx.fillRect(8, -10, 48, 48);

  ctx.fillStyle = 'rgba(255, 244, 234, 0.2)';
  ctx.beginPath();
  ctx.ellipse(-31, 7, 11, 5, -0.22, 0, Math.PI * 2);
  ctx.ellipse(31, 7, 11, 5, 0.22, 0, Math.PI * 2);
  ctx.ellipse(2, -34, 18, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Çok hafif sinekkaydı tıraş gölgesi (doğal erkek çene dokusu)
  const cleanShaveShade = ctx.createLinearGradient(0, 18, 0, 74 + jawDrop);
  cleanShaveShade.addColorStop(0, 'rgba(42, 34, 32, 0)');
  cleanShaveShade.addColorStop(0.55, 'rgba(42, 34, 32, 0.05)');
  cleanShaveShade.addColorStop(1, 'rgba(42, 34, 32, 0.12)');
  ctx.fillStyle = cleanShaveShade;
  ctx.fillRect(-60, 18, 120, 62 + jawDrop);

  ctx.restore();

  // Sakkadik doğal bakış ve göz kırpma
  const boardOffsetX = clamp((boardFocusX - bodyX) / 520, -1, 1) * 2.6;
  const boardOffsetY = clamp((boardFocusY - hy) / 380, -1, 1) * 1.15;
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

  // Canlı ela-kehribar derin bakışlı gözler
  drawLifelikeEye(
    ctx,
    -23.5,
    -3.5,
    13.4,
    7.3,
    -1,
    '#23160c',
    '#5c3b1e',
    '#9e6b34',
    gazeX,
    gazeY,
    blink,
    'rgba(110, 64, 46, 0.36)',
    true,
  );
  drawLifelikeEye(
    ctx,
    23.5,
    -3.5,
    13.4,
    7.3,
    1,
    '#23160c',
    '#5c3b1e',
    '#9e6b34',
    gazeX,
    gazeY,
    blink,
    'rgba(110, 64, 46, 0.36)',
    true,
  );

  // Tel tel doğal kaşlar + kaş kalktığında beliren çok hafif alın ifade çizgisi
  const browLift = speaking ? Math.max(0, Math.sin(t * 2.3)) * 2.4 : coHostSpeaking ? 0.7 : 0;
  drawNaturalEyebrow(ctx, -1, browLift, '#241610', 'rgba(48, 30, 22, 0.46)', 4.8);
  drawNaturalEyebrow(ctx, 1, browLift, '#241610', 'rgba(48, 30, 22, 0.46)', 4.8);

  if (browLift > 0.6) {
    ctx.strokeStyle = `rgba(118, 68, 48, ${(browLift * 0.055).toFixed(3)})`;
    ctx.lineWidth = 1.05;
    ctx.beginPath();
    ctx.moveTo(-22, -33);
    ctx.quadraticCurveTo(0, -35.5, 22, -33);
    ctx.stroke();
  }

  // İnce fırçalanmış titanyum akademik gözlük (saplar, burun pedi ve anti-refle mercek)
  ctx.save();
  ctx.strokeStyle = 'rgba(182, 154, 110, 0.8)';
  ctx.lineWidth = 1.65;
  ctx.beginPath();
  ctx.moveTo(-42.5, -7.5);
  ctx.lineTo(-56, -1.5);
  ctx.moveTo(42.5, -7.5);
  ctx.lineTo(56, -1.5);
  ctx.stroke();

  // Çok hafif mercek optik tonu
  ctx.fillStyle = 'rgba(186, 230, 253, 0.045)';
  roundRectPath(ctx, -42, -15.5, 35, 23.5, 7.5);
  ctx.fill();
  roundRectPath(ctx, 7, -15.5, 35, 23.5, 7.5);
  ctx.fill();

  ctx.strokeStyle = 'rgba(208, 176, 124, 0.92)';
  ctx.lineWidth = 1.85;
  roundRectPath(ctx, -42, -15.5, 35, 23.5, 7.5);
  ctx.stroke();
  roundRectPath(ctx, 7, -15.5, 35, 23.5, 7.5);
  ctx.stroke();

  // Köprü ve burun pedleri
  ctx.beginPath();
  ctx.moveTo(-7, -6.5);
  ctx.quadraticCurveTo(0, -9.2, 7, -6.5);
  ctx.stroke();
  ctx.fillStyle = 'rgba(226, 198, 148, 0.76)';
  ctx.beginPath();
  ctx.ellipse(-6.2, -1.5, 1.2, 2.5, 0.2, 0, Math.PI * 2);
  ctx.ellipse(6.2, -1.5, 1.2, 2.5, -0.2, 0, Math.PI * 2);
  ctx.fill();

  // Anti-refle stüdyo mercek yansıması
  ctx.strokeStyle = 'rgba(165, 243, 252, 0.2)';
  ctx.lineWidth = 2.0;
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
    -3.5,
    26.5,
    1,
    'rgba(128, 76, 56, 0.45)',
    'rgba(255, 244, 234, 0.42)',
  );

  // Dudaklar ve çene eklemi senkronu
  drawLifelikeMouth(
    ctx,
    0,
    38.5 + jawDrop * 0.28,
    viseme,
    inBreath ? 0.03 : mouthOpen,
    speaking && !inBreath,
    '#9c5458',
    '#b2656a',
    '#76393e',
    jawDrop,
  );

  // Koyu kestane katmanlı profesör saçı + şakaklarda zarif gümüş-kır teller
  const hairGrad = ctx.createLinearGradient(-56, -86, 56, -14);
  hairGrad.addColorStop(0, '#3a2419');
  hairGrad.addColorStop(0.55, '#24150e');
  hairGrad.addColorStop(1, '#140b07');
  ctx.fillStyle = hairGrad;

  ctx.beginPath();
  ctx.moveTo(-56.5, -6);
  ctx.bezierCurveTo(-62, -46, -46, -80, -10, -84);
  ctx.bezierCurveTo(32, -88, 60, -64, 58, -8);
  ctx.bezierCurveTo(54, -28, 45, -45, 22, -49);
  ctx.bezierCurveTo(-2, -53, -28, -50, -47, -34);
  ctx.bezierCurveTo(-53, -26, -55, -16, -56.5, -6);
  ctx.closePath();
  ctx.fill();

  // Yan ayrımlı doğal hacimli ön dalga
  ctx.beginPath();
  ctx.moveTo(-36, -50);
  ctx.bezierCurveTo(-18, -77, 26, -79, 49, -46);
  ctx.bezierCurveTo(24, -56, -12, -55, -36, -50);
  ctx.closePath();
  ctx.fill();

  // Şakak favorileri + ince gümüş-kır profesör telleri
  const sbGrad = ctx.createLinearGradient(0, -14, 0, 9);
  sbGrad.addColorStop(0, '#231610');
  sbGrad.addColorStop(1, 'rgba(35, 22, 16, 0.2)');
  ctx.fillStyle = sbGrad;
  ctx.fillRect(-57.5, -14, 5.2, 22);
  ctx.fillRect(52.3, -14, 5.2, 22);

  // Şakaklarda hafif kırlaşmış doğal tel dokusu
  ctx.strokeStyle = 'rgba(203, 213, 225, 0.34)';
  ctx.lineWidth = 1.15;
  for (let s = 0; s < 4; s++) {
    ctx.beginPath();
    ctx.moveTo(-55.5 + s * 0.9, -14 + s * 4);
    ctx.lineTo(-52 + s * 0.7, -4 + s * 4);
    ctx.moveTo(55.5 - s * 0.9, -14 + s * 4);
    ctx.lineTo(52 - s * 0.7, -4 + s * 4);
    ctx.stroke();
  }

  // Saç üstü tel tel stüdyo ışığı ve camgöbeği rim parıltısı
  ctx.strokeStyle = 'rgba(180, 134, 104, 0.28)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-28, -62);
  ctx.quadraticCurveTo(6, -76, 40, -54);
  ctx.moveTo(-14, -70);
  ctx.quadraticCurveTo(18, -79, 45, -60);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(103, 232, 249, 0.22)';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(16, -79);
  ctx.bezierCurveTo(44, -72, 57, -46, 57, -14);
  ctx.stroke();

  ctx.restore();

  // 4. Konuşurken eklemli doğal anlatım jesti
  if (speaking) {
    drawArticulatedHandGesture(
      ctx,
      1,
      bodyX,
      shoulderY,
      deskY,
      '#152745',
      '#eac0a4',
      '#ce9676',
      t,
      mouthOpen,
    );
  }

  ctx.restore();
}

// ============================================================================
// BARIŞ (SAĞ SUNUCU — GENÇ ARAŞTIRMACI & SORU SORAN)
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
  const torsoShift = speaking ? Math.sin(t * 0.76 + 0.6) * -1.8 : coHostSpeaking ? -1.5 : 0;
  const listenNod = coHostSpeaking ? Math.sin(t * 2.15 + 0.5) * 1.9 : 0;
  const speakCadence = speaking && !inBreath ? Math.sin(t * 4.2 + 0.4) * 1.3 : 0;
  const headTilt = speaking
    ? Math.sin(t * 1.0) * -0.019
    : coHostSpeaking
    ? -0.017 + Math.sin(t * 0.75) * 0.007
    : Math.sin(t * 0.62) * 0.01;

  const jawDrop = speaking && !inBreath ? clamp(mouthOpen, 0, 1) * 5.2 : 0;
  const bodyX = cx + torsoShift;
  const shoulderY = deskY - 202 + breathe * 0.55;
  const hx = bodyX + (speaking ? Math.sin(t * 0.9) * -2.0 : coHostSpeaking ? -1.8 : 0);
  const hy = shoulderY - 116 + breathe * 0.36 + listenNod + speakCadence;

  // Arka stüdyo portre rim ışığı
  const auraAlpha = speaking ? 0.21 : 0.06;
  const aura = ctx.createRadialGradient(bodyX - 14, hy + 48, 22, bodyX - 14, hy + 48, 245);
  aura.addColorStop(0, `rgba(168, 85, 247, ${auraAlpha})`);
  aura.addColorStop(1, 'rgba(168, 85, 247, 0)');
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(bodyX - 14, hy + 48, 245, 0, Math.PI * 2);
  ctx.fill();

  // 1. Anatomik erkek boynu ve dinamik çene altı gölgesi
  const neckGrad = ctx.createLinearGradient(hx - 26, hy + 46, hx + 26, shoulderY + 32);
  neckGrad.addColorStop(0, '#c28a6a');
  neckGrad.addColorStop(0.52, '#e2b293');
  neckGrad.addColorStop(1, '#c68f6f');
  ctx.fillStyle = neckGrad;
  ctx.beginPath();
  ctx.moveTo(hx - 23.5, hy + 46);
  ctx.lineTo(hx - 28.5, shoulderY + 26);
  ctx.quadraticCurveTo(bodyX, shoulderY + 48, hx + 28.5, shoulderY + 26);
  ctx.lineTo(hx + 23.5, hy + 46);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(120, 72, 52, 0.23)';
  ctx.lineWidth = 1.85;
  ctx.beginPath();
  ctx.moveTo(hx - 16.5, hy + 66);
  ctx.quadraticCurveTo(bodyX - 6, shoulderY + 18, bodyX - 3, shoulderY + 28);
  ctx.moveTo(hx + 16.5, hy + 66);
  ctx.quadraticCurveTo(bodyX + 6, shoulderY + 18, bodyX + 3, shoulderY + 28);
  ctx.stroke();

  const chinShadow = ctx.createLinearGradient(0, hy + 53 + jawDrop, 0, hy + 88 + jawDrop);
  chinShadow.addColorStop(0, 'rgba(68, 36, 24, 0.44)');
  chinShadow.addColorStop(1, 'rgba(68, 36, 24, 0)');
  ctx.fillStyle = chinShadow;
  ctx.fillRect(hx - 29, hy + 53 + jawDrop * 0.8, 58, 35);

  // 2. Özel dikim antrasit ceket + merinos bordo triko + beyaz Oxford gömlek yakası
  const jacketGrad = ctx.createLinearGradient(bodyX - 152, shoulderY, bodyX + 152, deskY + 20);
  jacketGrad.addColorStop(0, '#232e3f');
  jacketGrad.addColorStop(0.55, '#131b29');
  jacketGrad.addColorStop(1, '#080c14');
  ctx.fillStyle = jacketGrad;
  ctx.beginPath();
  ctx.moveTo(bodyX - 154, deskY + 20);
  ctx.bezierCurveTo(bodyX - 152, shoulderY + 68, bodyX - 132, shoulderY + 12, bodyX - 48, shoulderY + 2);
  ctx.lineTo(bodyX + 48, shoulderY + 2);
  ctx.bezierCurveTo(bodyX + 132, shoulderY + 12, bodyX + 152, shoulderY + 68, bodyX + 154, deskY + 20);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(7, 10, 18, 0.6)';
  ctx.lineWidth = 1.7;
  ctx.beginPath();
  ctx.moveTo(bodyX - 112, shoulderY + 28);
  ctx.quadraticCurveTo(bodyX - 102, shoulderY + 76, bodyX - 108, deskY);
  ctx.moveTo(bodyX + 112, shoulderY + 28);
  ctx.quadraticCurveTo(bodyX + 102, shoulderY + 76, bodyX + 108, deskY);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(192, 132, 252, 0.4)';
  ctx.lineWidth = 2.1;
  ctx.beginPath();
  ctx.moveTo(bodyX - 48, shoulderY + 3);
  ctx.bezierCurveTo(bodyX - 128, shoulderY + 13, bodyX - 148, shoulderY + 66, bodyX - 152, deskY);
  ctx.stroke();

  // İç merinos bordo triko kazak
  const knitGrad = ctx.createLinearGradient(bodyX, shoulderY + 12, bodyX, deskY);
  knitGrad.addColorStop(0, '#7c213e');
  knitGrad.addColorStop(0.6, '#541429');
  knitGrad.addColorStop(1, '#320b18');
  ctx.fillStyle = knitGrad;
  ctx.beginPath();
  ctx.moveTo(bodyX - 64, deskY + 20);
  ctx.lineTo(bodyX - 42, shoulderY + 10);
  ctx.quadraticCurveTo(bodyX, shoulderY + 35, bodyX + 42, shoulderY + 10);
  ctx.lineTo(bodyX + 64, deskY + 20);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(244, 114, 182, 0.22)';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(bodyX - 38, shoulderY + 12);
  ctx.quadraticCurveTo(bodyX, shoulderY + 36, bodyX + 38, shoulderY + 12);
  ctx.stroke();

  // Beyaz Oxford gömlek yakası
  const collarGrad = ctx.createLinearGradient(bodyX, shoulderY - 4, bodyX, shoulderY + 28);
  collarGrad.addColorStop(0, '#f8fafc');
  collarGrad.addColorStop(1, '#cbd5e1');
  ctx.fillStyle = collarGrad;
  ctx.beginPath();
  ctx.moveTo(bodyX - 29, shoulderY + 2);
  ctx.lineTo(bodyX - 14, shoulderY + 29);
  ctx.lineTo(bodyX - 1, shoulderY + 18);
  ctx.lineTo(bodyX - 22, shoulderY - 5);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(bodyX + 29, shoulderY + 2);
  ctx.lineTo(bodyX + 14, shoulderY + 29);
  ctx.lineTo(bodyX + 1, shoulderY + 18);
  ctx.lineTo(bodyX + 22, shoulderY - 5);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#e2e8f0';
  ctx.beginPath();
  ctx.arc(bodyX, shoulderY + 21, 2.2, 0, Math.PI * 2);
  ctx.fill();

  // Ceket klapaları + ilik dikişi + yaka mikrofonu
  const lapelGrad = ctx.createLinearGradient(bodyX - 68, shoulderY + 4, bodyX + 68, shoulderY + 150);
  lapelGrad.addColorStop(0, '#2e3c52');
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

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(bodyX - 57, shoulderY + 73);
  ctx.lineTo(bodyX - 49, shoulderY + 75);
  ctx.stroke();

  ctx.fillStyle = '#090e18';
  roundRectPath(ctx, bodyX - 50, shoulderY + 86, 7.5, 13.5, 3.5);
  ctx.fill();
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(bodyX - 45, shoulderY + 92, 4.5, 2.2);

  // 3. Baş & Fotogerçekçi Genç Araştırmacı Yüz Hatları
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(headTilt);

  // Arka/yan kademeli kısa kesim saç tabanı
  ctx.fillStyle = '#15100e';
  ctx.beginPath();
  ctx.ellipse(0, -18, 59.5, 55.5, 0, Math.PI * 0.86, Math.PI * 2.14);
  ctx.fill();

  // Anatomik kulaklar
  drawDetailedEar(ctx, -57.5, 6, -1, '#dfa989', '#be8464');
  drawDetailedEar(ctx, 57.5, 6, 1, '#da9f7e', '#b97f5f');

  // 3B yüz cildi ışıklandırması (dinamik alt çene eklemli)
  traceHeadPath(ctx, 0, 0, 114, 137, 0.33, jawDrop);
  const skinGrad = ctx.createRadialGradient(-14, -19, 10, 0, 7, 90);
  skinGrad.addColorStop(0, '#f4caad');
  skinGrad.addColorStop(0.55, '#e2af8e');
  skinGrad.addColorStop(0.86, '#cb9371');
  skinGrad.addColorStop(1, '#b37a59');
  ctx.fillStyle = skinGrad;
  ctx.fill();

  ctx.save();
  traceHeadPath(ctx, 0, 0, 114, 137, 0.33, jawDrop);
  ctx.clip();

  // Saç dibi yumuşak ortam gölgesi
  const hairlineAO = ctx.createLinearGradient(0, -68, 0, -36);
  hairlineAO.addColorStop(0, 'rgba(54, 28, 18, 0.32)');
  hairlineAO.addColorStop(1, 'rgba(54, 28, 18, 0)');
  ctx.fillStyle = hairlineAO;
  ctx.fillRect(-60, -70, 120, 34);

  // Sol iç kenar akıllı tahta mor-eflatun rim ışığı
  const rimL = ctx.createLinearGradient(-58, 0, -34, 0);
  rimL.addColorStop(0, 'rgba(192, 132, 252, 0.25)');
  rimL.addColorStop(1, 'rgba(192, 132, 252, 0)');
  ctx.fillStyle = rimL;
  ctx.fillRect(-60, -70, 26, 150);

  // Sağ dış elmacık/çene derinlik gölgesi
  const shadeR = ctx.createLinearGradient(27, 0, 58, 0);
  shadeR.addColorStop(0, 'rgba(98, 54, 36, 0)');
  shadeR.addColorStop(1, 'rgba(98, 54, 36, 0.27)');
  ctx.fillStyle = shadeR;
  ctx.fillRect(26, -68, 34, 150);

  // Elmacık kemiği sıcak doğal kan dolaşımı ve highlight
  const cheekWarm = ctx.createRadialGradient(-30, 14, 2, -30, 14, 22);
  cheekWarm.addColorStop(0, 'rgba(194, 96, 82, 0.13)');
  cheekWarm.addColorStop(1, 'rgba(194, 96, 82, 0)');
  ctx.fillStyle = cheekWarm;
  ctx.fillRect(-52, -8, 44, 44);

  ctx.fillStyle = 'rgba(255, 240, 228, 0.19)';
  ctx.beginPath();
  ctx.ellipse(-30, 8, 10.5, 4.8, -0.2, 0, Math.PI * 2);
  ctx.ellipse(30, 8, 10.5, 4.8, 0.2, 0, Math.PI * 2);
  ctx.ellipse(-2, -33, 16, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Yumuşak sakal gölgesi tabanı + gerçekçi mikro kıl folikülleri
  const beardShadow = ctx.createLinearGradient(0, 16, 0, 74 + jawDrop);
  beardShadow.addColorStop(0, 'rgba(34, 24, 21, 0)');
  beardShadow.addColorStop(0.5, 'rgba(34, 24, 21, 0.08)');
  beardShadow.addColorStop(1, 'rgba(34, 24, 21, 0.18)');
  ctx.fillStyle = beardShadow;
  ctx.fillRect(-60, 16, 120, 62 + jawDrop);

  drawDirectionalMicroStubble(ctx, 0.16, jawDrop);

  ctx.restore();

  // Sakkadik doğal bakış
  const boardOffsetX = clamp((boardFocusX - bodyX) / 520, -1, 1) * 2.6;
  const boardOffsetY = clamp((boardFocusY - hy) / 380, -1, 1) * 1.15;
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

  // Koyu kahve-kehribar lif dokulu canlı gözler
  drawLifelikeEye(
    ctx,
    -23,
    -3,
    13.2,
    7.2,
    -1,
    '#180e08',
    '#432717',
    '#78482a',
    gazeX,
    gazeY,
    blink,
    'rgba(104, 60, 44, 0.36)',
    false,
  );
  drawLifelikeEye(
    ctx,
    23,
    -3,
    13.2,
    7.2,
    1,
    '#180e08',
    '#432717',
    '#78482a',
    gazeX,
    gazeY,
    blink,
    'rgba(104, 60, 44, 0.36)',
    false,
  );

  // Tel tel doğal erkek kaşları
  const browLift = speaking ? Math.max(0, Math.sin(t * 2.55)) * 2.7 : coHostSpeaking ? 0.7 : 0;
  drawNaturalEyebrow(ctx, -1, browLift, '#17100d', 'rgba(34, 24, 20, 0.48)', 5.2);
  drawNaturalEyebrow(ctx, 1, browLift, '#17100d', 'rgba(34, 24, 20, 0.48)', 5.2);

  // Anatomik burun ve filtrum
  drawSculptedNoseAndPhiltrum(
    ctx,
    0,
    -3.8,
    26.2,
    -1,
    'rgba(126, 74, 54, 0.46)',
    'rgba(255, 241, 230, 0.4)',
  );

  // Dudaklar ve çene eklemi senkronu
  drawLifelikeMouth(
    ctx,
    0,
    38.8 + jawDrop * 0.28,
    viseme,
    inBreath ? 0.03 : mouthOpen,
    speaking && !inBreath,
    '#9a5155',
    '#b16267',
    '#75363b',
    jawDrop,
  );

  // Katmanlı doğal dalgalı koyu espresso saç + doğal alın tüy geçişi
  const hairGrad = ctx.createLinearGradient(-56, -86, 56, -14);
  hairGrad.addColorStop(0, '#2c211d');
  hairGrad.addColorStop(0.52, '#1a1310');
  hairGrad.addColorStop(1, '#0e0a08');
  ctx.fillStyle = hairGrad;

  ctx.beginPath();
  ctx.moveTo(-55.5, -8);
  ctx.bezierCurveTo(-60, -45, -45, -79, -8, -83);
  ctx.bezierCurveTo(30, -87, 58, -65, 57, -10);
  ctx.bezierCurveTo(53, -27, 45, -43, 25, -47);
  ctx.bezierCurveTo(4, -51, -24, -49, -45, -35);
  ctx.bezierCurveTo(-51, -27, -53.5, -18, -55.5, -8);
  ctx.closePath();
  ctx.fill();

  // Alın üstü doğal hacimli dalga perçemleri
  ctx.beginPath();
  ctx.moveTo(-45, -43);
  ctx.bezierCurveTo(-24, -73, 19, -77, 45, -47);
  ctx.bezierCurveTo(18, -55, -16, -52, -45, -43);
  ctx.closePath();
  ctx.fill();

  // Doğal saç çizgisi ince saç telleri (sert kask kenarını tamamen yok eder)
  ctx.strokeStyle = 'rgba(26, 19, 16, 0.72)';
  ctx.lineWidth = 1.25;
  for (let h = -38; h <= 36; h += 6.5) {
    ctx.beginPath();
    ctx.moveTo(h, -48);
    ctx.quadraticCurveTo(h + 2, -43, h - 1.5, -39.5);
    ctx.stroke();
  }

  // Kademeli şakak favorileri
  const sbGrad = ctx.createLinearGradient(0, -14, 0, 9);
  sbGrad.addColorStop(0, '#17110f');
  sbGrad.addColorStop(1, 'rgba(23, 17, 15, 0.16)');
  ctx.fillStyle = sbGrad;
  ctx.fillRect(-56.5, -14, 4.8, 21);
  ctx.fillRect(51.7, -14, 4.8, 21);

  // Saç üstü tel tel stüdyo ışığı çizgileri
  ctx.strokeStyle = 'rgba(164, 138, 124, 0.25)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-32, -60);
  ctx.quadraticCurveTo(2, -74, 36, -55);
  ctx.moveTo(-18, -69);
  ctx.quadraticCurveTo(12, -77, 42, -60);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(192, 132, 252, 0.22)';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(-54, -28);
  ctx.bezierCurveTo(-50, -56, -30, -75, -6, -79);
  ctx.stroke();

  ctx.restore();

  // 4. Konuşurken eklemli doğal anlatım jesti
  if (speaking) {
    drawArticulatedHandGesture(
      ctx,
      -1,
      bodyX,
      shoulderY,
      deskY,
      '#182231',
      '#e5b495',
      '#ca9373',
      t,
      mouthOpen,
    );
  }

  ctx.restore();
}

/** Yayın stüdyosu cam yansımalı masası, shockmount kondenser mikrofonlar ve modern sunucu isimlikleri */
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

  // Masa üstü ince stüdyo cam yansıması (aktif konuşmacı tarafında hafif ışıma)
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
  edgeGrad.addColorStop(0, denizSpeaking ? 'rgba(34, 211, 238, 0.72)' : 'rgba(34, 211, 238, 0.35)');
  edgeGrad.addColorStop(0.5, 'rgba(148, 163, 184, 0.22)');
  edgeGrad.addColorStop(1, barisSpeaking ? 'rgba(192, 132, 252, 0.72)' : 'rgba(168, 85, 247, 0.35)');
  ctx.strokeStyle = edgeGrad;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(0, deskY + 14);
  ctx.quadraticCurveTo(stageW / 2, deskY - 12, stageW, deskY + 14);
  ctx.stroke();

  const drawDeskMic = (mx: number, dir: 1 | -1, active: boolean, accent: string) => {
    ctx.save();
    // Mafsallı stüdyo mikrofon kolu
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

    // Mikrofon kapsül ızgara dokusu
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';
    ctx.lineWidth = 0.9;
    for (let gy = -10; gy <= -2; gy += 3) {
      ctx.beginPath();
      ctx.moveTo(-5.5, gy);
      ctx.lineTo(5.5, gy);
      ctx.stroke();
    }

    // Aktif yayın tally halkası
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
    }
    ctx.restore();
  };

  drawBadge(38, stageH - 80, 'Dr. Deniz', 'KIDEMLİ AKADEMİK ANLATICI', '#22d3ee', denizSpeaking);
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
    mouthOpen,
    now,
  );
}
