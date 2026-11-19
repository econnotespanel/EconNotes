/**
 * Procedural Web Audio API sound engine for the EconNotes Chance Wheel.
 * Generates realistic decelerating wheel peg-click ticks and celebratory prize fanfare
 * with zero external audio assets and instant iOS/Android gesture unlock.
 */

let sharedCtx: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedCtx || sharedCtx.state === 'closed') {
    sharedCtx = new Ctor();
    noiseBuffer = null;
  }
  if (sharedCtx.state === 'suspended') {
    void sharedCtx.resume().catch(() => {});
  }
  return sharedCtx;
}

function getShortNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) {
    return noiseBuffer;
  }
  const len = Math.floor(ctx.sampleRate * 0.04);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.22));
  }
  noiseBuffer = buf;
  return buf;
}

/** Call synchronously inside a click handler to unlock audio on mobile browsers. */
export function unlockWheelAudio(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => {});
  }
}

/**
 * Plays a crisp physical fortune-wheel flapper/peg click sound.
 * @param speedRatio 0 (nearly stopped) to 1 (peak spin speed)
 */
export function playWheelTick(speedRatio = 0.5): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const clamped = Math.max(0, Math.min(1, speedRatio));

  // 1) Crisp mechanical peg snap (bandpass-filtered transient noise)
  const noise = ctx.createBufferSource();
  noise.buffer = getShortNoiseBuffer(ctx);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(1600 + clamped * 900, now);
  bp.Q.setValueAtTime(2.4, now);

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.24 + clamped * 0.12, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.022);

  noise.connect(bp);
  bp.connect(noiseGain);
  noiseGain.connect(ctx.destination);
  noise.start(now);
  noise.stop(now + 0.026);

  // 2) Warm resonant wooden/acrylic click body
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  const startFreq = 760 + clamped * 380;
  osc.frequency.setValueAtTime(startFreq, now);
  osc.frequency.exponentialRampToValueAtTime(220, now + 0.032);

  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(0.22 + clamped * 0.08, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.036);

  osc.connect(oscGain);
  oscGain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.04);
}

/**
 * Plays a rich celebratory prize-win fanfare chime when the wheel lands on a reward.
 * @param isGrandPrize true for top rewards (+500 XP or 1 Gün Sınırsız)
 */
export function playWheelWinSound(isGrandPrize = false): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  // Bright uplifting C-major 9 / jackpot arpeggio notes (Hz)
  const notes = isGrandPrize
    ? [
        { freq: 523.25, t: 0.0, dur: 0.24, vol: 0.22 },   // C5
        { freq: 659.25, t: 0.075, dur: 0.24, vol: 0.22 }, // E5
        { freq: 783.99, t: 0.15, dur: 0.24, vol: 0.24 },  // G5
        { freq: 1046.5, t: 0.225, dur: 0.42, vol: 0.26 }, // C6
        { freq: 1318.5, t: 0.31, dur: 0.55, vol: 0.24 },  // E6
        { freq: 1567.98, t: 0.4, dur: 0.72, vol: 0.25 },  // G6
      ]
    : [
        { freq: 523.25, t: 0.0, dur: 0.22, vol: 0.2 },    // C5
        { freq: 659.25, t: 0.085, dur: 0.22, vol: 0.21 }, // E5
        { freq: 783.99, t: 0.17, dur: 0.26, vol: 0.22 },  // G5
        { freq: 1046.5, t: 0.26, dur: 0.62, vol: 0.25 },  // C6
      ];

  for (const n of notes) {
    const start = now + n.t;

    // Warm main chime voice
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(n.freq, start);

    // Sparkling bell harmonic overtone (octave up, soft)
    const bell = ctx.createOscillator();
    bell.type = 'sine';
    bell.frequency.setValueAtTime(n.freq * 2, start);

    const gMain = ctx.createGain();
    gMain.gain.setValueAtTime(0.0001, start);
    gMain.gain.linearRampToValueAtTime(n.vol, start + 0.015);
    gMain.gain.exponentialRampToValueAtTime(0.0008, start + n.dur);

    const gBell = ctx.createGain();
    gBell.gain.setValueAtTime(0.0001, start);
    gBell.gain.linearRampToValueAtTime(n.vol * 0.32, start + 0.012);
    gBell.gain.exponentialRampToValueAtTime(0.0006, start + n.dur * 0.85);

    osc.connect(gMain);
    bell.connect(gBell);
    gMain.connect(ctx.destination);
    gBell.connect(ctx.destination);

    osc.start(start);
    bell.start(start);
    osc.stop(start + n.dur + 0.03);
    bell.stop(start + n.dur + 0.03);
  }

  // Celebratory shimmer chord pad on the final beat
  const chordStart = now + (isGrandPrize ? 0.38 : 0.25);
  const chordFreqs = isGrandPrize ? [523.25, 659.25, 783.99, 1046.5] : [523.25, 659.25, 783.99];
  for (const cf of chordFreqs) {
    const pad = ctx.createOscillator();
    pad.type = 'sine';
    pad.frequency.setValueAtTime(cf, chordStart);

    const pg = ctx.createGain();
    pg.gain.setValueAtTime(0.0001, chordStart);
    pg.gain.linearRampToValueAtTime(0.08, chordStart + 0.03);
    pg.gain.exponentialRampToValueAtTime(0.0005, chordStart + 0.85);

    pad.connect(pg);
    pg.connect(ctx.destination);
    pad.start(chordStart);
    pad.stop(chordStart + 0.88);
  }
}

/**
 * Evaluates CSS cubic-bezier(0.15, 0.88, 0.22, 1) progress for t in [0, 1]
 * so wheel peg ticks match the visual rotation curve with millisecond accuracy.
 */
export function evaluateWheelEase(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  // Solve x(u) = 3(1-u)^2 u * x1 + 3(1-u)u^2 * x2 + u^3 via 6 Newton iterations
  const x1 = 0.15;
  const y1 = 0.88;
  const x2 = 0.22;
  const y2 = 1.0;

  let u = x;
  for (let i = 0; i < 6; i++) {
    const inv = 1 - u;
    const bx = 3 * inv * inv * u * x1 + 3 * inv * u * u * x2 + u * u * u;
    const dx = 3 * inv * inv * x1 + 6 * inv * u * (x2 - x1) + 3 * u * u * (1 - x2);
    if (Math.abs(dx) < 1e-5) break;
    u = Math.max(0, Math.min(1, u - (bx - x) / dx));
  }
  const inv = 1 - u;
  return 3 * inv * inv * u * y1 + 3 * inv * u * u * y2 + u * u * u;
}
