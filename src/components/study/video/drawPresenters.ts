// Yarı-gerçekçi (semi-realistic) anatomik stüdyo sunucuları: Deniz & Barış
// 1920x1080 Full HD yayın sahnesi için çok katmanlı cilt ışıklandırması, anatomik yüz hatları,
// doğal bakış/göz kırpma ve Türkçe fonetik dudak senkronu (viseme) içerir.

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
  const cycle = (now / 1000 + seed) % 4.6;
  if (cycle < 0.14) {
    const u = cycle / 0.14;
    return Math.sin(u * Math.PI);
  }
  // Arada çift kırpma (gerçekçilik)
  const longCycle = (now / 1000 + seed) % 13.8;
  if (longCycle > 0.22 && longCycle < 0.34) {
    return Math.sin(((longCycle - 0.22) / 0.12) * Math.PI);
  }
  return 0;
}

/** Anatomik badem göz + katmanlı iris + göz kapağı çizimi */
function drawRealisticEye(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  irisOuter: string,
  irisInner: string,
  gazeX: number,
  gazeY: number,
  blink: number,
  feminineLashes: boolean,
  skinShadow: string,
) {
  ctx.save();

  // Göz çukuru hafif gölgesi (orbital crease)
  ctx.strokeStyle = skinShadow;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(cx - rx * 1.05, cy - ry * 0.9);
  ctx.quadraticCurveTo(cx, cy - ry * 1.75, cx + rx * 1.05, cy - ry * 0.85);
  ctx.stroke();

  const openFactor = clamp(1 - blink, 0.04, 1);
  const curRy = ry * openFactor;

  if (blink > 0.86) {
    // Kapalı göz kapağı çizgisi
    ctx.strokeStyle = '#231712';
    ctx.lineWidth = feminineLashes ? 2.8 : 2.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - rx, cy + 1);
    ctx.quadraticCurveTo(cx, cy + 3.5, cx + rx, cy + 0.5);
    ctx.stroke();
    ctx.restore();
    return;
  }

  // Badem göz kesiti (clip)
  ctx.beginPath();
  ctx.moveTo(cx - rx, cy + 0.5);
  ctx.bezierCurveTo(cx - rx * 0.55, cy - curRy * 1.25, cx + rx * 0.55, cy - curRy * 1.25, cx + rx, cy);
  ctx.bezierCurveTo(cx + rx * 0.55, cy + curRy * 1.1, cx - rx * 0.55, cy + curRy * 1.1, cx - rx, cy + 0.5);
  ctx.closePath();

  // Sklera (yumuşak doğal göz akı, aşırı beyaz değil)
  const scleraGrad = ctx.createLinearGradient(cx, cy - curRy, cx, cy + curRy);
  scleraGrad.addColorStop(0, '#dde3ec');
  scleraGrad.addColorStop(0.35, '#f6f8fb');
  scleraGrad.addColorStop(1, '#e6ebf2');
  ctx.fillStyle = scleraGrad;
  ctx.fill();

  ctx.save();
  ctx.clip();

  // İris
  const ix = cx + gazeX;
  const iy = cy + gazeY;
  const irisR = ry * 0.88;

  ctx.fillStyle = irisOuter;
  ctx.beginPath();
  ctx.arc(ix, iy, irisR, 0, Math.PI * 2);
  ctx.fill();

  const irisGrad = ctx.createRadialGradient(ix, iy + 1, irisR * 0.15, ix, iy, irisR * 0.92);
  irisGrad.addColorStop(0, irisInner);
  irisGrad.addColorStop(1, irisOuter);
  ctx.fillStyle = irisGrad;
  ctx.beginPath();
  ctx.arc(ix, iy, irisR * 0.88, 0, Math.PI * 2);
  ctx.fill();

  // Göz bebeği
  ctx.fillStyle = '#0c0f17';
  ctx.beginPath();
  ctx.arc(ix, iy, irisR * 0.44, 0, Math.PI * 2);
  ctx.fill();

  // Üst göz kapağı gölgesi
  ctx.fillStyle = 'rgba(15, 23, 42, 0.22)';
  ctx.fillRect(cx - rx - 2, cy - curRy - 2, rx * 2 + 4, curRy * 0.55);

  // Stüdyo ışık yansımaları (catchlights)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.beginPath();
  ctx.arc(ix - irisR * 0.28, iy - irisR * 0.28, irisR * 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.beginPath();
  ctx.arc(ix + irisR * 0.26, iy + irisR * 0.24, irisR * 0.11, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  // Üst ve alt kirpik/göz kapağı konturu
  ctx.strokeStyle = '#1c1310';
  ctx.lineWidth = feminineLashes ? 2.7 : 2.1;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - rx, cy + 0.5);
  ctx.bezierCurveTo(
    cx - rx * 0.55,
    cy - curRy * 1.25,
    cx + rx * 0.55,
    cy - curRy * 1.25,
    cx + (feminineLashes ? rx * 1.14 : rx),
    cy - (feminineLashes ? 1.5 : 0),
  );
  ctx.stroke();

  ctx.strokeStyle = 'rgba(70, 45, 35, 0.45)';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(cx - rx * 0.85, cy + curRy * 0.72);
  ctx.quadraticCurveTo(cx, cy + curRy * 1.15, cx + rx * 0.85, cy + curRy * 0.68);
  ctx.stroke();

  ctx.restore();
}

/** Anatomik burun gölgesi ve ucu */
function drawRealisticNose(
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

  // Burun sırtı yumuşak gölge
  ctx.strokeStyle = shadowColor;
  ctx.lineWidth = 2.0;
  ctx.beginPath();
  ctx.moveTo(cx + facingDir * 2, topY);
  ctx.bezierCurveTo(
    cx + facingDir * 4.5,
    topY + len * 0.55,
    cx + facingDir * 7,
    topY + len * 0.88,
    cx + facingDir * 2,
    topY + len,
  );
  ctx.stroke();

  // Burun kanatları hafif kontur
  ctx.strokeStyle = shadowColor;
  ctx.lineWidth = 1.7;
  ctx.beginPath();
  ctx.moveTo(cx - 8, topY + len - 2);
  ctx.quadraticCurveTo(cx, topY + len + 3.5, cx + 8, topY + len - 2);
  ctx.stroke();

  // Burun ucu stüdyo ışığı
  ctx.fillStyle = highlightColor;
  ctx.beginPath();
  ctx.ellipse(cx + facingDir * 1.5, topY + len - 4.5, 3.2, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/** Fonetik (viseme) tabanlı gerçekçi dudak çizimi */
function drawRealisticMouth(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  viseme: Viseme,
  openAmount: number,
  speaking: boolean,
  upperLipColor: string,
  lowerLipColor: string,
) {
  ctx.save();

  const open = speaking ? clamp(openAmount, 0, 1) : 0;
  let halfW = 17.5;
  let gapH = 0;

  if (!speaking || viseme === 'rest') {
    halfW = 18;
    gapH = open * 3;
  } else if (viseme === 'closed') {
    halfW = 16.5;
    gapH = 0.4;
  } else if (viseme === 'round') {
    halfW = 12.2;
    gapH = 4 + open * 8.5;
  } else if (viseme === 'open') {
    halfW = 17.2;
    gapH = 4.5 + open * 10;
  } else {
    // wide (e, i, s, r, t...)
    halfW = 19.2;
    gapH = 2.5 + open * 7;
  }

  const cornerLift = speaking ? -0.8 : -2.2; // dinlerken hafif sıcak tebessüm

  // Ağız içi boşluğu (yalnızca konuşurken açık olduğunda)
  if (gapH > 1.3) {
    ctx.beginPath();
    ctx.moveTo(cx - halfW + 1, cy + cornerLift);
    ctx.quadraticCurveTo(cx, cy - gapH * 0.42, cx + halfW - 1, cy + cornerLift);
    ctx.quadraticCurveTo(cx, cy + gapH * 1.18, cx - halfW + 1, cy + cornerLift);
    ctx.closePath();
    ctx.fillStyle = '#431320';
    ctx.fill();

    // Üst dişler (hafif ve doğal)
    ctx.save();
    ctx.clip();
    if (gapH > 2.6 && viseme !== 'round') {
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(cx - halfW * 0.72, cy - gapH * 0.45, halfW * 1.44, Math.min(4.8, gapH * 0.52));
    }
    // Dil gölgesi
    ctx.fillStyle = '#9f3a4d';
    ctx.beginPath();
    ctx.ellipse(cx, cy + gapH * 0.85, halfW * 0.55, gapH * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Üst dudak (Cupid's bow)
  ctx.fillStyle = upperLipColor;
  ctx.beginPath();
  ctx.moveTo(cx - halfW, cy + cornerLift);
  ctx.bezierCurveTo(
    cx - halfW * 0.5,
    cy - 5.5 - gapH * 0.25,
    cx - 3.5,
    cy - 6.2 - gapH * 0.25,
    cx,
    cy - 4.4 - gapH * 0.25,
  );
  ctx.bezierCurveTo(
    cx + 3.5,
    cy - 6.2 - gapH * 0.25,
    cx + halfW * 0.5,
    cy - 5.5 - gapH * 0.25,
    cx + halfW,
    cy + cornerLift,
  );
  ctx.quadraticCurveTo(cx, cy - gapH * 0.35 + 0.8, cx - halfW, cy + cornerLift);
  ctx.closePath();
  ctx.fill();

  // Alt dudak
  ctx.fillStyle = lowerLipColor;
  ctx.beginPath();
  ctx.moveTo(cx - halfW + 0.5, cy + cornerLift);
  ctx.quadraticCurveTo(cx, cy + gapH * 1.05, cx + halfW - 0.5, cy + cornerLift);
  ctx.quadraticCurveTo(cx, cy + gapH * 1.15 + 7.5, cx - halfW + 0.5, cy + cornerLift);
  ctx.closePath();
  ctx.fill();

  // Alt dudak parlaklığı
  ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + gapH * 0.82 + 3.2, halfW * 0.38, 1.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Dudak birleşim çizgisi (kapalıyken)
  if (gapH <= 1.3) {
    ctx.strokeStyle = 'rgba(67, 19, 32, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - halfW, cy + cornerLift);
    ctx.quadraticCurveTo(cx, cy + 1.2, cx + halfW, cy + cornerLift);
    ctx.stroke();
  }

  // Çene altı hafif çukur gölgesi
  ctx.strokeStyle = 'rgba(120, 72, 54, 0.18)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(cx, cy + gapH + 13, 8, Math.PI * 1.15, Math.PI * 1.85);
  ctx.stroke();

  ctx.restore();
}

/** Anatomik baş şekli (elmacık kemiği + çene hattı Bezier konturu) */
function traceHeadPath(ctx: CanvasRenderingContext2D, hx: number, hy: number, w: number, h: number, jawTaper: number) {
  ctx.beginPath();
  // Alın tepesinden sağ şakağa
  ctx.moveTo(hx, hy - h * 0.52);
  ctx.bezierCurveTo(hx + w * 0.48, hy - h * 0.52, hx + w * 0.53, hy - h * 0.2, hx + w * 0.5, hy + h * 0.04);
  // Sağ elmacık kemiğinden çeneye
  ctx.bezierCurveTo(hx + w * 0.48, hy + h * 0.25, hx + w * jawTaper, hy + h * 0.44, hx, hy + h * 0.52);
  // Çeneden sol elmacık kemiğine
  ctx.bezierCurveTo(hx - w * jawTaper, hy + h * 0.44, hx - w * 0.48, hy + h * 0.25, hx - w * 0.5, hy + h * 0.04);
  // Sol şakaktan alın tepesine
  ctx.bezierCurveTo(hx - w * 0.53, hy - h * 0.2, hx - w * 0.48, hy - h * 0.52, hx, hy - h * 0.52);
  ctx.closePath();
}

// ============================================================================
// DR. DENİZ (SOL ANLATICI — AKADEMİK SUNUCU)
// ============================================================================
function drawDenizPresenter(
  ctx: CanvasRenderingContext2D,
  cx: number,
  deskY: number,
  speaking: boolean,
  viseme: Viseme,
  mouthOpen: number,
  inBreath: boolean,
  now: number,
) {
  ctx.save();
  const t = now / 1000;
  const breathe = Math.sin(t * 1.8) * 2.2;
  const listenNod = !speaking ? Math.sin(t * 1.9) * 1.8 : 0;
  const speakCadence = speaking && !inBreath ? Math.sin(t * 4.2) * 1.4 : 0;
  const headTilt = speaking ? Math.sin(t * 1.1) * 0.022 : Math.sin(t * 0.7) * 0.014;

  const shoulderY = deskY - 195 + breathe * 0.6;
  const hx = cx + (speaking ? Math.sin(t * 0.9) * 2.5 : 0);
  const hy = shoulderY - 114 + breathe * 0.4 + listenNod + speakCadence;

  // Konuşmacı arka stüdyo yumuşak rim ışığı
  const auraAlpha = speaking ? 0.22 : 0.07;
  const aura = ctx.createRadialGradient(cx + 10, hy + 55, 20, cx + 10, hy + 55, 235);
  aura.addColorStop(0, `rgba(34, 211, 238, ${auraAlpha})`);
  aura.addColorStop(1, 'rgba(34, 211, 238, 0)');
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(cx + 10, hy + 55, 235, 0, Math.PI * 2);
  ctx.fill();

  // 1. Arka katman dalgalı kestane saç
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(headTilt);
  const backHairGrad = ctx.createLinearGradient(0, -80, 0, 130);
  backHairGrad.addColorStop(0, '#3a2117');
  backHairGrad.addColorStop(0.55, '#26140e');
  backHairGrad.addColorStop(1, '#190c08');
  ctx.fillStyle = backHairGrad;
  ctx.beginPath();
  ctx.moveTo(-66, -24);
  ctx.bezierCurveTo(-84, 25, -88, 92, -70, 134);
  ctx.quadraticCurveTo(0, 148, 74, 132);
  ctx.bezierCurveTo(88, 90, 84, 24, 66, -24);
  ctx.bezierCurveTo(54, -76, -54, -76, -66, -24);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // 2. Boyun ve köprücük kemiği gölgesi
  const neckGrad = ctx.createLinearGradient(hx - 20, hy + 46, hx + 24, shoulderY + 34);
  neckGrad.addColorStop(0, '#d8a284');
  neckGrad.addColorStop(0.45, '#ecc0a6');
  neckGrad.addColorStop(1, '#dfb094');
  ctx.fillStyle = neckGrad;
  ctx.beginPath();
  ctx.moveTo(hx - 20, hy + 48);
  ctx.lineTo(hx - 24, shoulderY + 26);
  ctx.quadraticCurveTo(cx, shoulderY + 52, hx + 24, shoulderY + 26);
  ctx.lineTo(hx + 20, hy + 48);
  ctx.closePath();
  ctx.fill();

  // Çene altı yumuşak gölge
  const chinShadow = ctx.createLinearGradient(0, hy + 52, 0, hy + 82);
  chinShadow.addColorStop(0, 'rgba(92, 50, 36, 0.34)');
  chinShadow.addColorStop(1, 'rgba(92, 50, 36, 0)');
  ctx.fillStyle = chinShadow;
  ctx.fillRect(hx - 24, hy + 52, 48, 30);

  // 3. Kıyafet: Özel dikim koyu lacivert ceket + ipek bluz
  const blazerGrad = ctx.createLinearGradient(cx - 135, shoulderY, cx + 135, deskY + 20);
  blazerGrad.addColorStop(0, '#1e3252');
  blazerGrad.addColorStop(0.5, '#132038');
  blazerGrad.addColorStop(1, '#0a1222');
  ctx.fillStyle = blazerGrad;
  ctx.beginPath();
  ctx.moveTo(cx - 142, deskY + 20);
  ctx.bezierCurveTo(cx - 140, shoulderY + 72, cx - 122, shoulderY + 14, cx - 44, shoulderY + 4);
  ctx.lineTo(cx + 44, shoulderY + 4);
  ctx.bezierCurveTo(cx + 122, shoulderY + 14, cx + 140, shoulderY + 72, cx + 142, deskY + 20);
  ctx.closePath();
  ctx.fill();

  // Omuz kenarı stüdyo rim ışığı (tahta tarafından gelen ışık)
  ctx.strokeStyle = 'rgba(103, 232, 249, 0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx + 44, shoulderY + 5);
  ctx.bezierCurveTo(cx + 118, shoulderY + 15, cx + 136, shoulderY + 68, cx + 140, deskY);
  ctx.stroke();

  // İpek krem bluz (V yaka)
  const blouseGrad = ctx.createLinearGradient(cx, shoulderY + 8, cx, shoulderY + 120);
  blouseGrad.addColorStop(0, '#f8fafc');
  blouseGrad.addColorStop(1, '#cbd5e1');
  ctx.fillStyle = blouseGrad;
  ctx.beginPath();
  ctx.moveTo(cx - 32, shoulderY + 6);
  ctx.lineTo(cx, shoulderY + 108);
  ctx.lineTo(cx + 32, shoulderY + 6);
  ctx.quadraticCurveTo(cx, shoulderY + 22, cx - 32, shoulderY + 6);
  ctx.closePath();
  ctx.fill();

  // İnce altın kolye
  ctx.strokeStyle = 'rgba(251, 191, 36, 0.78)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - 21, shoulderY + 16);
  ctx.quadraticCurveTo(cx, shoulderY + 52, cx + 21, shoulderY + 16);
  ctx.stroke();
  ctx.fillStyle = '#fbbf24';
  ctx.beginPath();
  ctx.arc(cx, shoulderY + 36, 3, 0, Math.PI * 2);
  ctx.fill();

  // Ceket klapaları (notched lapels)
  ctx.fillStyle = '#243b61';
  ctx.beginPath();
  ctx.moveTo(cx - 33, shoulderY + 5);
  ctx.lineTo(cx - 56, shoulderY + 42);
  ctx.lineTo(cx - 44, shoulderY + 48);
  ctx.lineTo(cx - 52, shoulderY + 62);
  ctx.lineTo(cx - 4, shoulderY + 118);
  ctx.lineTo(cx - 22, shoulderY + 38);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(cx + 33, shoulderY + 5);
  ctx.lineTo(cx + 56, shoulderY + 42);
  ctx.lineTo(cx + 44, shoulderY + 48);
  ctx.lineTo(cx + 52, shoulderY + 62);
  ctx.lineTo(cx + 4, shoulderY + 118);
  ctx.lineTo(cx + 22, shoulderY + 38);
  ctx.closePath();
  ctx.fill();

  // Yaka mikrofonu (lavalier mic)
  ctx.fillStyle = '#090d16';
  roundRectPath(ctx, cx + 26, shoulderY + 66, 7, 13, 3);
  ctx.fill();
  ctx.fillStyle = '#64748b';
  ctx.fillRect(cx + 24, shoulderY + 71, 4, 2);

  // 4. Baş & Anatomik Yüz
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(headTilt);

  // Kulaklar + inci küpe
  ctx.fillStyle = '#e5b497';
  ctx.beginPath();
  ctx.ellipse(-56, 6, 8, 15, -0.12, 0, Math.PI * 2);
  ctx.ellipse(56, 6, 8, 15, 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fef3c7';
  ctx.beginPath();
  ctx.arc(-57, 19, 3.4, 0, Math.PI * 2);
  ctx.arc(57, 19, 3.4, 0, Math.PI * 2);
  ctx.fill();

  // Yüz cildi 3B ışıklandırma
  traceHeadPath(ctx, 0, 0, 114, 136, 0.31);
  const skinGrad = ctx.createRadialGradient(14, -14, 12, 0, 6, 88);
  skinGrad.addColorStop(0, '#fbe0ce');
  skinGrad.addColorStop(0.58, '#f1c4a8');
  skinGrad.addColorStop(1, '#dfa889');
  ctx.fillStyle = skinGrad;
  ctx.fill();

  // Elmacık kemiği doğal allık
  const cheekL = ctx.createRadialGradient(-33, 18, 2, -33, 18, 22);
  cheekL.addColorStop(0, 'rgba(232, 122, 130, 0.22)');
  cheekL.addColorStop(1, 'rgba(232, 122, 130, 0)');
  ctx.fillStyle = cheekL;
  ctx.fillRect(-56, -4, 46, 44);

  const cheekR = ctx.createRadialGradient(34, 18, 2, 34, 18, 22);
  cheekR.addColorStop(0, 'rgba(232, 122, 130, 0.22)');
  cheekR.addColorStop(1, 'rgba(232, 122, 130, 0)');
  ctx.fillStyle = cheekR;
  ctx.fillRect(12, -4, 46, 44);

  // Bakış yönü (konuşurken izleyiciye ve arada tahtaya; dinlerken tahtaya/Barış'a)
  const lookBoardCycle = Math.sin(t * 0.65);
  const gazeX = speaking ? (lookBoardCycle > 0.55 ? 2.6 : 0.8) : 2.8;
  const gazeY = speaking ? (lookBoardCycle > 0.55 ? -0.8 : 0.2) : -0.4;
  const blink = computeBlink(now, 0.4);

  // Badem gözler (ela-kehribar iris)
  drawRealisticEye(ctx, -23, -4, 13.5, 7.8, '#5c3d22', '#9c6b34', gazeX, gazeY, blink, true, 'rgba(130, 82, 62, 0.32)');
  drawRealisticEye(ctx, 23, -4, 13.5, 7.8, '#5c3d22', '#9c6b34', gazeX, gazeY, blink, true, 'rgba(130, 82, 62, 0.32)');

  // Kaşlar (doğal kavisli)
  const browLift = speaking ? Math.max(0, Math.sin(t * 2.5)) * 2.6 : 0;
  ctx.fillStyle = '#382016';
  // Sol kaş
  ctx.beginPath();
  ctx.moveTo(-39, -18 - browLift * 0.6);
  ctx.quadraticCurveTo(-24, -27 - browLift, -9, -19 - browLift * 0.5);
  ctx.quadraticCurveTo(-24, -22.5 - browLift, -39, -16 - browLift * 0.6);
  ctx.closePath();
  ctx.fill();
  // Sağ kaş
  ctx.beginPath();
  ctx.moveTo(9, -19 - browLift * 0.5);
  ctx.quadraticCurveTo(24, -27 - browLift, 39, -18 - browLift * 0.6);
  ctx.quadraticCurveTo(24, -22.5 - browLift, 9, -16 - browLift * 0.5);
  ctx.closePath();
  ctx.fill();

  // Şık ince altın-titanyum gözlük
  ctx.strokeStyle = 'rgba(212, 175, 112, 0.92)';
  ctx.lineWidth = 1.9;
  roundRectPath(ctx, -41, -16, 34, 24, 9);
  ctx.stroke();
  roundRectPath(ctx, 7, -16, 34, 24, 9);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-7, -6);
  ctx.quadraticCurveTo(0, -9, 7, -6);
  ctx.stroke();
  // Cam parlaklığı
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-35, -12);
  ctx.lineTo(-27, 4);
  ctx.moveTo(13, -12);
  ctx.lineTo(21, 4);
  ctx.stroke();

  // Burun
  drawRealisticNose(ctx, 0, -4, 26, 1, 'rgba(150, 94, 72, 0.42)', 'rgba(255, 245, 238, 0.45)');

  // Dudaklar (fonetik viseme senkronlu)
  drawRealisticMouth(
    ctx,
    0,
    38,
    viseme,
    inBreath ? 0.04 : mouthOpen,
    speaking && !inBreath,
    '#b85d68',
    '#cb6e79',
  );

  // Ön saç tutamları (doğal yandan ayrılmış dalgalı saç)
  const frontHairGrad = ctx.createLinearGradient(-50, -76, 50, 20);
  frontHairGrad.addColorStop(0, '#4c2c1e');
  frontHairGrad.addColorStop(0.5, '#351d13');
  frontHairGrad.addColorStop(1, '#24120b');
  ctx.fillStyle = frontHairGrad;
  ctx.beginPath();
  ctx.moveTo(-18, -66);
  ctx.bezierCurveTo(-56, -64, -68, -28, -62, 24);
  ctx.bezierCurveTo(-56, -8, -46, -34, -18, -50);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(-22, -68);
  ctx.bezierCurveTo(18, -78, 64, -56, 63, 22);
  ctx.bezierCurveTo(56, -12, 36, -42, -18, -52);
  ctx.closePath();
  ctx.fill();

  // Saç ışıltı çizgisi
  ctx.strokeStyle = 'rgba(180, 118, 82, 0.28)';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(-8, -62);
  ctx.quadraticCurveTo(32, -58, 52, -22);
  ctx.stroke();

  ctx.restore();

  // 5. Konuşurken zarif stüdyo el jesti (masanın hemen üstünde doğal anlatım eli)
  if (speaking) {
    const handWave = Math.sin(t * 2.8) * 6;
    const hxHand = cx + 82 + Math.cos(t * 1.9) * 5;
    const hyHand = deskY - 24 + handWave;

    // Ceket kolu
    ctx.strokeStyle = '#162744';
    ctx.lineWidth = 28;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx + 104, shoulderY + 95);
    ctx.quadraticCurveTo(cx + 112, deskY - 6, hxHand - 8, hyHand + 8);
    ctx.stroke();

    // Zarif açık el silüeti
    ctx.fillStyle = '#efc2a7';
    ctx.beginPath();
    ctx.ellipse(hxHand + 6, hyHand, 16, 10, -0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 4.2;
    ctx.strokeStyle = '#efc2a7';
    for (let f = 0; f < 4; f++) {
      const ang = -0.55 + f * 0.22;
      ctx.beginPath();
      ctx.moveTo(hxHand + 10, hyHand - 3 + f * 2);
      ctx.lineTo(hxHand + 10 + Math.cos(ang) * 16, hyHand - 3 + f * 2 + Math.sin(ang) * 14);
      ctx.stroke();
    }
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
  viseme: Viseme,
  mouthOpen: number,
  inBreath: boolean,
  now: number,
) {
  ctx.save();
  const t = now / 1000;
  const breathe = Math.sin(t * 1.9 + 1.2) * 2.2;
  const listenNod = !speaking ? Math.sin(t * 2.1 + 0.6) * 2.0 : 0;
  const speakCadence = speaking && !inBreath ? Math.sin(t * 4.5 + 0.4) * 1.5 : 0;
  const headTilt = speaking ? Math.sin(t * 1.05) * -0.022 : Math.sin(t * 0.65) * 0.015;

  const shoulderY = deskY - 202 + breathe * 0.6;
  const hx = cx + (speaking ? Math.sin(t * 0.95) * -2.5 : 0);
  const hy = shoulderY - 116 + breathe * 0.4 + listenNod + speakCadence;

  // Arka rim ışığı
  const auraAlpha = speaking ? 0.22 : 0.07;
  const aura = ctx.createRadialGradient(cx - 10, hy + 55, 20, cx - 10, hy + 55, 235);
  aura.addColorStop(0, `rgba(168, 85, 247, ${auraAlpha})`);
  aura.addColorStop(1, 'rgba(168, 85, 247, 0)');
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(cx - 10, hy + 55, 235, 0, Math.PI * 2);
  ctx.fill();

  // 1. Boyun
  const neckGrad = ctx.createLinearGradient(hx - 24, hy + 48, hx + 24, shoulderY + 30);
  neckGrad.addColorStop(0, '#c89272');
  neckGrad.addColorStop(0.5, '#dfb090');
  neckGrad.addColorStop(1, '#cc9878');
  ctx.fillStyle = neckGrad;
  ctx.beginPath();
  ctx.moveTo(hx - 24, hy + 46);
  ctx.lineTo(hx - 28, shoulderY + 26);
  ctx.quadraticCurveTo(cx, shoulderY + 48, hx + 28, shoulderY + 26);
  ctx.lineTo(hx + 24, hy + 46);
  ctx.closePath();
  ctx.fill();

  const chinShadow = ctx.createLinearGradient(0, hy + 54, 0, hy + 84);
  chinShadow.addColorStop(0, 'rgba(78, 42, 28, 0.36)');
  chinShadow.addColorStop(1, 'rgba(78, 42, 28, 0)');
  ctx.fillStyle = chinShadow;
  ctx.fillRect(hx - 28, hy + 54, 56, 30);

  // 2. Kıyafet: Modern antrasit ceket + bordo triko kazak + Oxford gömlek yakası
  const jacketGrad = ctx.createLinearGradient(cx - 150, shoulderY, cx + 150, deskY + 20);
  jacketGrad.addColorStop(0, '#1f2937');
  jacketGrad.addColorStop(0.55, '#111827');
  jacketGrad.addColorStop(1, '#090d16');
  ctx.fillStyle = jacketGrad;
  ctx.beginPath();
  ctx.moveTo(cx - 152, deskY + 20);
  ctx.bezierCurveTo(cx - 150, shoulderY + 68, cx - 130, shoulderY + 12, cx - 48, shoulderY + 2);
  ctx.lineTo(cx + 48, shoulderY + 2);
  ctx.bezierCurveTo(cx + 130, shoulderY + 12, cx + 150, shoulderY + 68, cx + 152, deskY + 20);
  ctx.closePath();
  ctx.fill();

  // Sol omuz rim ışığı (tahta yönünden)
  ctx.strokeStyle = 'rgba(192, 132, 252, 0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 48, shoulderY + 3);
  ctx.bezierCurveTo(cx - 126, shoulderY + 13, cx - 146, shoulderY + 66, cx - 150, deskY);
  ctx.stroke();

  // İç bordo/mürdüm triko kazak
  const knitGrad = ctx.createLinearGradient(cx, shoulderY + 12, cx, deskY);
  knitGrad.addColorStop(0, '#6e1d36');
  knitGrad.addColorStop(1, '#3b0e1d');
  ctx.fillStyle = knitGrad;
  ctx.beginPath();
  ctx.moveTo(cx - 64, deskY + 20);
  ctx.lineTo(cx - 42, shoulderY + 10);
  ctx.quadraticCurveTo(cx, shoulderY + 34, cx + 42, shoulderY + 10);
  ctx.lineTo(cx + 64, deskY + 20);
  ctx.closePath();
  ctx.fill();

  // Beyaz gömlek yakası
  ctx.fillStyle = '#eef2f6';
  ctx.beginPath();
  ctx.moveTo(cx - 28, shoulderY + 2);
  ctx.lineTo(cx - 14, shoulderY + 28);
  ctx.lineTo(cx, shoulderY + 18);
  ctx.lineTo(cx - 22, shoulderY - 4);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(cx + 28, shoulderY + 2);
  ctx.lineTo(cx + 14, shoulderY + 28);
  ctx.lineTo(cx, shoulderY + 18);
  ctx.lineTo(cx + 22, shoulderY - 4);
  ctx.closePath();
  ctx.fill();

  // Ceket klapaları
  ctx.fillStyle = '#273449';
  ctx.beginPath();
  ctx.moveTo(cx - 40, shoulderY + 4);
  ctx.lineTo(cx - 66, shoulderY + 52);
  ctx.lineTo(cx - 46, shoulderY + 148);
  ctx.lineTo(cx - 32, shoulderY + 22);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(cx + 40, shoulderY + 4);
  ctx.lineTo(cx + 66, shoulderY + 52);
  ctx.lineTo(cx + 46, shoulderY + 148);
  ctx.lineTo(cx + 32, shoulderY + 22);
  ctx.closePath();
  ctx.fill();

  // 3. Baş & Anatomik Erkek Yüzü
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(headTilt);

  // Arka/yan kısa kesim saç tabanı
  ctx.fillStyle = '#181311';
  ctx.beginPath();
  ctx.ellipse(0, -18, 60, 56, 0, Math.PI * 0.88, Math.PI * 2.12);
  ctx.fill();

  // Kulaklar
  ctx.fillStyle = '#d49d7d';
  ctx.beginPath();
  ctx.ellipse(-58, 6, 8.5, 16, -0.1, 0, Math.PI * 2);
  ctx.ellipse(58, 6, 8.5, 16, 0.1, 0, Math.PI * 2);
  ctx.fill();

  // Yüz konturu (belirgin ama doğal erkek çene hattı)
  traceHeadPath(ctx, 0, 0, 116, 138, 0.36);
  const skinGrad = ctx.createRadialGradient(-14, -14, 12, 0, 6, 90);
  skinGrad.addColorStop(0, '#f0c4a6');
  skinGrad.addColorStop(0.6, '#e2af8e');
  skinGrad.addColorStop(1, '#cc9574');
  ctx.fillStyle = skinGrad;
  ctx.fill();

  // Çok hafif kirli sakal / çene gölgesi (doğal erkek karakter detayı)
  ctx.save();
  traceHeadPath(ctx, 0, 0, 116, 138, 0.36);
  ctx.clip();
  const beardShadow = ctx.createLinearGradient(0, 16, 0, 72);
  beardShadow.addColorStop(0, 'rgba(42, 32, 28, 0)');
  beardShadow.addColorStop(0.55, 'rgba(42, 32, 28, 0.08)');
  beardShadow.addColorStop(1, 'rgba(42, 32, 28, 0.17)');
  ctx.fillStyle = beardShadow;
  ctx.fillRect(-60, 16, 120, 60);
  ctx.restore();

  // Gözler (tahtaya/Deniz'e yani sola doğru doğal bakış)
  const lookCycle = Math.sin(t * 0.6 + 1.1);
  const gazeX = speaking ? (lookCycle > 0.55 ? -2.4 : -0.6) : -2.6;
  const gazeY = speaking ? 0.2 : -0.3;
  const blink = computeBlink(now, 2.1);

  drawRealisticEye(ctx, -23, -3, 13.2, 7.2, '#2b1a10', '#4d301d', gazeX, gazeY, blink, false, 'rgba(115, 70, 50, 0.34)');
  drawRealisticEye(ctx, 23, -3, 13.2, 7.2, '#2b1a10', '#4d301d', gazeX, gazeY, blink, false, 'rgba(115, 70, 50, 0.34)');

  // Doğal erkek kaşları
  const browLift = speaking ? Math.max(0, Math.sin(t * 2.7)) * 3.0 : 0;
  ctx.fillStyle = '#1c1512';
  ctx.beginPath();
  ctx.moveTo(-40, -16 - browLift * 0.6);
  ctx.quadraticCurveTo(-24, -23.5 - browLift, -8, -17 - browLift * 0.5);
  ctx.quadraticCurveTo(-24, -19 - browLift, -40, -13 - browLift * 0.6);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(8, -17 - browLift * 0.5);
  ctx.quadraticCurveTo(24, -23.5 - browLift, 40, -16 - browLift * 0.6);
  ctx.quadraticCurveTo(24, -19 - browLift, 8, -13 - browLift * 0.5);
  ctx.closePath();
  ctx.fill();

  // Burun
  drawRealisticNose(ctx, 0, -4, 27, -1, 'rgba(136, 82, 60, 0.45)', 'rgba(255, 240, 228, 0.38)');

  // Dudaklar
  drawRealisticMouth(
    ctx,
    0,
    39,
    viseme,
    inBreath ? 0.04 : mouthOpen,
    speaking && !inBreath,
    '#9e5458',
    '#b26468',
  );

  // Modern doğal dalgalı saç (hiçbir sivri üçgen yok, yumuşak katmanlı doku)
  const hairGrad = ctx.createLinearGradient(-55, -82, 55, -20);
  hairGrad.addColorStop(0, '#2a211d');
  hairGrad.addColorStop(0.55, '#1b1412');
  hairGrad.addColorStop(1, '#120d0c');
  ctx.fillStyle = hairGrad;

  ctx.beginPath();
  ctx.moveTo(-56, -8);
  ctx.bezierCurveTo(-60, -44, -44, -76, -8, -80);
  ctx.bezierCurveTo(28, -84, 58, -64, 58, -10);
  ctx.bezierCurveTo(54, -26, 46, -42, 26, -46);
  ctx.bezierCurveTo(4, -50, -24, -48, -46, -34);
  ctx.bezierCurveTo(-52, -26, -54, -18, -56, -8);
  ctx.closePath();
  ctx.fill();

  // Alın üstü yumuşak doğal dalga hacmi
  ctx.beginPath();
  ctx.moveTo(-42, -44);
  ctx.bezierCurveTo(-24, -68, 16, -74, 42, -48);
  ctx.bezierCurveTo(18, -54, -16, -52, -42, -44);
  ctx.closePath();
  ctx.fill();

  // Favoriler (tapered sideburns)
  ctx.fillRect(-57, -14, 5, 18);
  ctx.fillRect(52, -14, 5, 18);

  // Saç üstü yumuşak stüdyo ışığı
  ctx.strokeStyle = 'rgba(148, 124, 112, 0.22)';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(-26, -64);
  ctx.quadraticCurveTo(4, -72, 34, -56);
  ctx.stroke();

  ctx.restore();

  // 4. Konuşurken doğal el jesti
  if (speaking) {
    const handWave = Math.sin(t * 3.0 + 0.5) * 6;
    const hxHand = cx - 84 + Math.cos(t * 2.1) * 5;
    const hyHand = deskY - 24 + handWave;

    ctx.strokeStyle = '#18212f';
    ctx.lineWidth = 29;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 108, shoulderY + 96);
    ctx.quadraticCurveTo(cx - 114, deskY - 6, hxHand + 8, hyHand + 8);
    ctx.stroke();

    ctx.fillStyle = '#e0ae8e';
    ctx.beginPath();
    ctx.ellipse(hxHand - 6, hyHand, 16, 10, 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 4.4;
    ctx.strokeStyle = '#e0ae8e';
    for (let f = 0; f < 4; f++) {
      const ang = Math.PI + 0.55 - f * 0.22;
      ctx.beginPath();
      ctx.moveTo(hxHand - 10, hyHand - 3 + f * 2);
      ctx.lineTo(hxHand - 10 + Math.cos(ang) * 16, hyHand - 3 + f * 2 + Math.sin(ang) * 14);
      ctx.stroke();
    }
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

  // Ön stüdyo masası (koyu fırçalanmış cam & titanyum kenar)
  const deskGrad = ctx.createLinearGradient(0, deskY, 0, stageH);
  deskGrad.addColorStop(0, 'rgba(13, 19, 35, 0.96)');
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

  // Masa üst kenar ince ışık çizgisi
  const edgeGrad = ctx.createLinearGradient(0, 0, stageW, 0);
  edgeGrad.addColorStop(0, 'rgba(34, 211, 238, 0.45)');
  edgeGrad.addColorStop(0.5, 'rgba(148, 163, 184, 0.22)');
  edgeGrad.addColorStop(1, 'rgba(168, 85, 247, 0.45)');
  ctx.strokeStyle = edgeGrad;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, deskY + 14);
  ctx.quadraticCurveTo(stageW / 2, deskY - 12, stageW, deskY + 14);
  ctx.stroke();

  // Masa üstü alçak profilli yayın mikrofonları
  const drawDeskMic = (mx: number, dir: 1 | -1, active: boolean, accent: string) => {
    ctx.save();
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(mx, deskY + 16);
    ctx.quadraticCurveTo(mx + dir * 10, deskY - 22, mx - dir * 18, deskY - 40);
    ctx.stroke();
    // Taban
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.ellipse(mx, deskY + 16, 18, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Kapsül
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

  // Modern yayın isimlikleri (Lower-Third Badges)
  const drawBadge = (
    bx: number,
    by: number,
    name: string,
    role: string,
    accent: string,
    active: boolean,
  ) => {
    const bw = 248;
    const bh = 58;
    ctx.save();
    roundRectPath(ctx, bx, by, bw, bh, 14);
    ctx.fillStyle = 'rgba(7, 11, 22, 0.88)';
    ctx.fill();
    ctx.strokeStyle = active ? accent : 'rgba(148, 163, 184, 0.18)';
    ctx.lineWidth = active ? 1.8 : 1;
    ctx.stroke();

    // Sol aksan şeridi
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

    // Canlı ses ekolayzır çubukları
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
  drawBadge(stageW - 290, stageH - 78, 'Barış', 'ARAŞTIRMACI & SORU SORAN', '#c084fc', barisSpeaking);

  ctx.restore();
}

export function drawStudioPresentersAndDesk(
  props: PresenterRenderProps,
  stageW: number,
  stageH: number,
) {
  const { ctx, now, denizSpeaking, barisSpeaking, viseme, mouthOpen, inBreathPause } = props;
  const deskY = stageH - 132;

  drawDenizPresenter(ctx, 168, deskY, denizSpeaking, viseme, mouthOpen, inBreathPause, now);
  drawBarisPresenter(ctx, stageW - 168, deskY, barisSpeaking, viseme, mouthOpen, inBreathPause, now);
  drawBroadcastDeskAndLowerThirds(ctx, deskY, stageW, stageH, denizSpeaking, barisSpeaking, now);
}
