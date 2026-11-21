/**
 * Dual-engine procedural sound generator for the EconNotes Chance Wheel.
 *
 * Primary path: Synthesizes exact 16-bit PCM WAV tracks in memory (< 2ms) and plays them
 * via a single gesture-authorized HTMLAudioElement. This guarantees crisp, audible wheel
 * spin clacks and prize win fanfare across desktop browsers, iOS Safari, Android Chrome,
 * and PWAs without AudioContext suspension or rAF jitter issues.
 *
 * Secondary path: Web Audio API fallback if HTMLAudioElement playback is unavailable.
 */

export interface WheelPegEvent {
  timeMs: number;
  speedRatio: number;
}

const SAMPLE_RATE = 22050;

let sharedAudioEl: HTMLAudioElement | null = null;
let lastSpinBlobUrl: string | null = null;
let cachedSingleTickUrl: string | null = null;
let cachedStandardWinUrl: string | null = null;
let cachedGrandWinUrl: string | null = null;

let sharedCtx: AudioContext | null = null;

function getSharedAudioEl(): HTMLAudioElement | null {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;
  if (!sharedAudioEl) {
    sharedAudioEl = new Audio();
    sharedAudioEl.preload = 'auto';
    (sharedAudioEl as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
  }
  return sharedAudioEl;
}

function getWebAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedCtx || sharedCtx.state === 'closed') {
    sharedCtx = new Ctor();
  }
  if (sharedCtx.state === 'suspended') {
    void sharedCtx.resume().catch(() => {});
  }
  return sharedCtx;
}

function encodeMonoWavBlobUrl(samples: Float32Array, sampleRate = SAMPLE_RATE): string {
  const numSamples = samples.length;
  const dataBytes = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) {
      view.setUint8(offset + i, s.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // Linear PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // Byte rate
  view.setUint16(32, 2, true); // Block align
  view.setUint16(34, 16, true); // Bits per sample
  writeStr(36, 'data');
  view.setUint32(40, dataBytes, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }

  const blob = new Blob([buffer], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}

/** Mixes one punchy wooden/acrylic fortune-wheel flapper clack into `buf` at `startSample`. */
function mixPegClack(
  buf: Float32Array,
  startSample: number,
  speedRatio: number,
  sampleRate = SAMPLE_RATE,
): void {
  const clamped = Math.max(0, Math.min(1, speedRatio));
  const clickLen = Math.floor(sampleRate * 0.052); // 52ms crisp resonant clack
  const baseFreq = 680 + clamped * 360;
  const highFreq = 1850 + clamped * 680;
  const amp = 0.72 + clamped * 0.2;

  let phase1 = 0;
  let phase2 = 0;
  // Simple deterministic pseudo-noise seed per click for crisp flapper snap
  let seed = (startSample * 1664525 + 1013904223) >>> 0;

  for (let i = 0; i < clickLen; i++) {
    const idx = startSample + i;
    if (idx >= buf.length) break;
    const t = i / sampleRate;

    // Sharp attack (1.5ms) + fast woody exponential decay
    const attack = Math.min(1, i / (sampleRate * 0.0015));
    const bodyEnv = attack * Math.exp(-t * 95);
    const snapEnv = attack * Math.exp(-t * 210);

    // Pitch-dropping resonant wooden tap
    const f1 = baseFreq * Math.exp(-t * 26) + 210;
    const f2 = highFreq * Math.exp(-t * 42) + 520;
    phase1 += (2 * Math.PI * f1) / sampleRate;
    phase2 += (2 * Math.PI * f2) / sampleRate;

    // Fast LCG white noise burst for mechanical peg snap
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const noise = ((seed & 0xffff) / 32768) - 1;

    const sample =
      amp *
      (Math.sin(phase1) * 0.62 * bodyEnv +
        Math.sin(phase2) * 0.28 * snapEnv +
        noise * 0.34 * snapEnv);

    buf[idx] += sample;
  }
}

function normalizeAndSoftClip(buf: Float32Array, targetPeak = 0.88): void {
  let peak = 0;
  for (let i = 0; i < buf.length; i++) {
    const a = Math.abs(buf[i]);
    if (a > peak) peak = a;
  }
  if (peak < 1e-5) return;
  const scale = targetPeak / peak;
  for (let i = 0; i < buf.length; i++) {
    buf[i] = Math.tanh(buf[i] * scale * 1.15) * targetPeak;
  }
}

function synthesizeSpinTrackUrl(events: WheelPegEvent[], durationMs: number): string {
  const totalSamples = Math.floor(((durationMs + 180) / 1000) * SAMPLE_RATE);
  const buf = new Float32Array(totalSamples);

  // Subtle physical bearing whir that smoothly slows down with the wheel
  let whirPhase = 0;
  for (let i = 0; i < totalSamples; i++) {
    const tNorm = Math.min(1, i / Math.max(1, (durationMs / 1000) * SAMPLE_RATE));
    const speed = Math.pow(1 - tNorm, 1.45);
    const whirFreq = 85 + speed * 145;
    whirPhase += (2 * Math.PI * whirFreq) / SAMPLE_RATE;
    const fadeIn = Math.min(1, i / (SAMPLE_RATE * 0.04));
    const fadeOut = Math.max(0, 1 - Math.max(0, tNorm - 0.82) / 0.18);
    buf[i] += Math.sin(whirPhase) * 0.045 * speed * fadeIn * fadeOut;
  }

  for (const ev of events) {
    const sampleOffset = Math.floor((ev.timeMs / 1000) * SAMPLE_RATE);
    mixPegClack(buf, sampleOffset, ev.speedRatio, SAMPLE_RATE);
  }

  normalizeAndSoftClip(buf, 0.9);
  return encodeMonoWavBlobUrl(buf, SAMPLE_RATE);
}

function getSingleTickUrl(): string {
  if (cachedSingleTickUrl) return cachedSingleTickUrl;
  const buf = new Float32Array(Math.floor(SAMPLE_RATE * 0.08));
  mixPegClack(buf, 0, 0.78, SAMPLE_RATE);
  normalizeAndSoftClip(buf, 0.85);
  cachedSingleTickUrl = encodeMonoWavBlobUrl(buf, SAMPLE_RATE);
  return cachedSingleTickUrl;
}

function getWinFanfareUrl(isGrandPrize: boolean): string {
  if (isGrandPrize && cachedGrandWinUrl) return cachedGrandWinUrl;
  if (!isGrandPrize && cachedStandardWinUrl) return cachedStandardWinUrl;

  const durationSec = isGrandPrize ? 1.55 : 1.25;
  const buf = new Float32Array(Math.floor(SAMPLE_RATE * durationSec));

  const notes = isGrandPrize
    ? [
        { freq: 523.25, t: 0.0, dur: 0.24, vol: 0.34 }, // C5
        { freq: 659.25, t: 0.08, dur: 0.24, vol: 0.34 }, // E5
        { freq: 783.99, t: 0.16, dur: 0.26, vol: 0.36 }, // G5
        { freq: 1046.5, t: 0.24, dur: 0.44, vol: 0.4 }, // C6
        { freq: 1318.5, t: 0.33, dur: 0.52, vol: 0.38 }, // E6
        { freq: 1567.98, t: 0.42, dur: 0.78, vol: 0.42 }, // G6
      ]
    : [
        { freq: 523.25, t: 0.0, dur: 0.22, vol: 0.34 }, // C5
        { freq: 659.25, t: 0.09, dur: 0.24, vol: 0.35 }, // E5
        { freq: 783.99, t: 0.18, dur: 0.28, vol: 0.38 }, // G5
        { freq: 1046.5, t: 0.27, dur: 0.72, vol: 0.42 }, // C6
      ];

  for (const n of notes) {
    const startIdx = Math.floor(n.t * SAMPLE_RATE);
    const len = Math.floor(n.dur * SAMPLE_RATE);
    for (let i = 0; i < len; i++) {
      const idx = startIdx + i;
      if (idx >= buf.length) break;
      const t = i / SAMPLE_RATE;
      const env = Math.min(1, t / 0.012) * Math.exp((-t / n.dur) * 3.4);
      // Bright bell + warm harmonic overtones
      const s =
        Math.sin(2 * Math.PI * n.freq * t) * 0.65 +
        Math.sin(2 * Math.PI * n.freq * 2 * t) * 0.25 +
        Math.sin(2 * Math.PI * n.freq * 3 * t) * 0.1;
      buf[idx] += s * n.vol * env;
    }
  }

  // Celebratory triumphant shimmer chord on the landing beat
  const chordStart = isGrandPrize ? 0.4 : 0.26;
  const chordDur = 0.95;
  const chordFreqs = isGrandPrize
    ? [523.25, 659.25, 783.99, 1046.5]
    : [523.25, 659.25, 783.99];

  const chordStartIdx = Math.floor(chordStart * SAMPLE_RATE);
  const chordLen = Math.floor(chordDur * SAMPLE_RATE);
  for (const cf of chordFreqs) {
    for (let i = 0; i < chordLen; i++) {
      const idx = chordStartIdx + i;
      if (idx >= buf.length) break;
      const t = i / SAMPLE_RATE;
      const env = Math.min(1, t / 0.03) * Math.exp((-t / chordDur) * 2.8);
      buf[idx] += Math.sin(2 * Math.PI * cf * t) * 0.14 * env;
    }
  }

  normalizeAndSoftClip(buf, 0.88);
  const url = encodeMonoWavBlobUrl(buf, SAMPLE_RATE);
  if (isGrandPrize) cachedGrandWinUrl = url;
  else cachedStandardWinUrl = url;
  return url;
}

/**
 * Evaluates CSS cubic-bezier(0.15, 0.88, 0.22, 1) progress for t in [0, 1]
 * so wheel peg ticks match the visual rotation curve with millisecond accuracy.
 */
export function evaluateWheelEase(t: number): number {
  const x = Math.max(0, Math.min(1, t));
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

/**
 * Precomputes exact peg-hit timestamps matching the wheel's CSS bezier spin curve.
 */
export function computeWheelPegEvents(
  startRotation: number,
  totalDelta: number,
  durationMs: number,
  pegCount = 14,
): WheelPegEvent[] {
  const pegAngle = 360 / pegCount;
  const events: WheelPegEvent[] = [];
  let lastPegIdx = Math.floor(startRotation / pegAngle);
  let lastTickMs = -100;

  // Immediate opening clack so user hears audio the instant they tap spin
  events.push({ timeMs: 12, speedRatio: 1 });
  lastTickMs = 12;

  for (let ms = 16; ms <= durationMs - 30; ms += 2) {
    const t = ms / durationMs;
    const eased = evaluateWheelEase(t);
    const deg = startRotation + totalDelta * eased;
    const pegIdx = Math.floor(deg / pegAngle);
    if (pegIdx !== lastPegIdx && ms - lastTickMs >= 38) {
      lastPegIdx = pegIdx;
      lastTickMs = ms;
      const speedRatio = Math.max(0.08, Math.min(1, Math.pow(1 - t, 1.15)));
      events.push({ timeMs: ms, speedRatio });
    }
  }

  return events;
}

/** Web Audio fallback scheduler for peg ticks if HTMLAudioElement is blocked. */
function scheduleWebAudioSpinTicks(events: WheelPegEvent[]): void {
  const ctx = getWebAudioContext();
  if (!ctx) return;
  const baseTime = ctx.currentTime + 0.01;

  for (const ev of events) {
    const when = baseTime + ev.timeMs / 1000;
    const clamped = Math.max(0, Math.min(1, ev.speedRatio));
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(760 + clamped * 380, when);
    osc.frequency.exponentialRampToValueAtTime(220, when + 0.042);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.42 + clamped * 0.18, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + 0.048);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(when);
    osc.stop(when + 0.052);
  }
}

/** Web Audio fallback for win fanfare if HTMLAudioElement is blocked. */
function playWebAudioWinFanfare(isGrandPrize: boolean): void {
  const ctx = getWebAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime + 0.01;
  const notes = isGrandPrize
    ? [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98]
    : [523.25, 659.25, 783.99, 1046.5];

  notes.forEach((freq, idx) => {
    const start = now + idx * 0.085;
    const dur = idx === notes.length - 1 ? 0.65 : 0.24;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, start);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.linearRampToValueAtTime(0.38, start + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, start + dur);

    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  });
}

/** Call synchronously inside a click handler to unlock audio on mobile & desktop browsers. */
export function unlockWheelAudio(): void {
  const ctx = getWebAudioContext();
  if (ctx) {
    try {
      const silent = ctx.createBuffer(1, 1, ctx.sampleRate);
      const src = ctx.createBufferSource();
      src.buffer = silent;
      src.connect(ctx.destination);
      src.start(0);
    } catch {
      // ignore
    }
  }
  // Pre-warm cached win fanfare blobs lazily so zero delay at prize reveal
  try {
    getSingleTickUrl();
    getWinFanfareUrl(false);
    getWinFanfareUrl(true);
  } catch {
    // ignore
  }
}

/**
 * Starts the complete decelerating fortune-wheel clack audio track synchronously inside
 * the user's spin button click handler for 100% browser reliability.
 */
export function startWheelSpinAudio(events: WheelPegEvent[], durationMs: number): void {
  unlockWheelAudio();

  const audio = getSharedAudioEl();
  if (audio) {
    try {
      if (lastSpinBlobUrl) {
        URL.revokeObjectURL(lastSpinBlobUrl);
        lastSpinBlobUrl = null;
      }
      const spinUrl = synthesizeSpinTrackUrl(events, durationMs);
      lastSpinBlobUrl = spinUrl;
      audio.pause();
      audio.src = spinUrl;
      audio.volume = 0.95;
      audio.currentTime = 0;
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        void playPromise.catch(() => {
          scheduleWebAudioSpinTicks(events);
        });
      }
      return;
    } catch {
      // Fall through to Web Audio
    }
  }

  scheduleWebAudioSpinTicks(events);
}

/** Immediately stops any currently playing wheel spin audio (e.g. when muted or closed). */
export function stopWheelSpinAudio(): void {
  const audio = getSharedAudioEl();
  if (audio) {
    try {
      audio.pause();
      audio.currentTime = 0;
    } catch {
      // ignore
    }
  }
}

/** Plays a single crisp wooden peg click (used for mute/unmute audio feedback). */
export function playWheelTick(speedRatio = 0.75): void {
  const audio = getSharedAudioEl();
  if (audio) {
    try {
      audio.pause();
      audio.src = getSingleTickUrl();
      audio.volume = 0.88;
      audio.currentTime = 0;
      const p = audio.play();
      if (p && typeof p.catch === 'function') {
        void p.catch(() => {
          scheduleWebAudioSpinTicks([{ timeMs: 0, speedRatio }]);
        });
      }
      return;
    } catch {
      // Fall through
    }
  }
  scheduleWebAudioSpinTicks([{ timeMs: 0, speedRatio }]);
}

/**
 * Plays the celebratory prize-win fanfare chime when the wheel lands on a reward.
 * Reuses the gesture-authorized HTMLAudioElement for guaranteed playback on mobile & desktop.
 */
export function playWheelWinSound(isGrandPrize = false): void {
  const audio = getSharedAudioEl();
  if (audio) {
    try {
      audio.pause();
      audio.src = getWinFanfareUrl(isGrandPrize);
      audio.volume = 0.95;
      audio.currentTime = 0;
      const p = audio.play();
      if (p && typeof p.catch === 'function') {
        void p.catch(() => {
          playWebAudioWinFanfare(isGrandPrize);
        });
      }
      return;
    } catch {
      // Fall through
    }
  }
  playWebAudioWinFanfare(isGrandPrize);
}
