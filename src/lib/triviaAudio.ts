/**
 * EconNotes Günlük Bilgi Yarışması — Özgün Web Audio Ses Efektleri, Fon Müziği ve Türkçe (tr-TR) Sesli Soru Okuma Motoru
 *
 * - %100 özgün, telifsiz Web Audio API sentezi (sıfır harici MP3 bağımlılığı, anında tepki, mobil dostu).
 * - iOS Safari ve iOS Standalone PWA autoplay kısıtlamalarına tam uyumlu:
 *   ses bağlamı yalnızca kullanıcı etkileşimiyle açılır; fon müziği kullanıcı izni olmadan asla kendiliğinden başlamaz.
 * - Ses desteklenmeyen tarayıcılarda yarışma akışı hiçbir hata vermeden normal şekilde devam eder.
 */

export type TriviaSoundEffect =
  | 'start'
  | 'next_question'
  | 'select'
  | 'correct'
  | 'wrong'
  | 'two_min_warning'
  | 'complete'
  | 'grand_prize';

export interface TriviaAudioPrefs {
  masterEnabled: boolean;
  sfxEnabled: boolean;
  musicEnabled: boolean;
  ttsEnabled: boolean;
  ttsReadOptions: boolean;
  volume: number; // 0.0 - 1.0
  reducedMotion: boolean;
}

const PREFS_STORAGE_KEY = 'econnotes_trivia_audio_prefs_v1';

function detectSystemReducedMotion(): boolean {
  try {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
  } catch {
    // ignore
  }
  return false;
}

export function getDefaultTriviaAudioPrefs(): TriviaAudioPrefs {
  return {
    masterEnabled: true,
    sfxEnabled: true,
    musicEnabled: false, // Kullanıcı izni olmadan otomatik müzik başlatılmaz
    ttsEnabled: true, // Yalnızca kullanıcı hoparlöre bastığında başlar
    ttsReadOptions: true,
    volume: 0.7,
    reducedMotion: detectSystemReducedMotion(),
  };
}

export function loadTriviaAudioPrefs(): TriviaAudioPrefs {
  const defaults = getDefaultTriviaAudioPrefs();
  try {
    if (typeof localStorage === 'undefined') return defaults;
    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<TriviaAudioPrefs>;
    return {
      masterEnabled: typeof parsed.masterEnabled === 'boolean' ? parsed.masterEnabled : defaults.masterEnabled,
      sfxEnabled: typeof parsed.sfxEnabled === 'boolean' ? parsed.sfxEnabled : defaults.sfxEnabled,
      musicEnabled: typeof parsed.musicEnabled === 'boolean' ? parsed.musicEnabled : defaults.musicEnabled,
      ttsEnabled: typeof parsed.ttsEnabled === 'boolean' ? parsed.ttsEnabled : defaults.ttsEnabled,
      ttsReadOptions: typeof parsed.ttsReadOptions === 'boolean' ? parsed.ttsReadOptions : defaults.ttsReadOptions,
      volume:
        typeof parsed.volume === 'number' && Number.isFinite(parsed.volume)
          ? Math.min(1, Math.max(0, parsed.volume))
          : defaults.volume,
      reducedMotion: typeof parsed.reducedMotion === 'boolean' ? parsed.reducedMotion : defaults.reducedMotion,
    };
  } catch {
    return defaults;
  }
}

export function saveTriviaAudioPrefs(prefs: TriviaAudioPrefs): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
    }
  } catch {
    // ignore quota errors
  }
}

export function isWebAudioSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(
    window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext,
  );
}

export function isTurkishTtsSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
}

// ---------------------------------------------------------------------------
// Internal Shared Web Audio Engine (iOS Safari & PWA Gesture-Unlocked)
// ---------------------------------------------------------------------------

let sharedCtx: AudioContext | null = null;
let audioUnlocked = false;

let ambientIntervalId: number | null = null;
let ambientMasterGain: GainNode | null = null;
let ambientChordStep = 0;

function getAudioContext(): AudioContext | null {
  if (!isWebAudioSupported()) return null;
  try {
    const AudioCtxCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtxCtor) return null;
    if (!sharedCtx || sharedCtx.state === 'closed') {
      sharedCtx = new AudioCtxCtor();
    }
    return sharedCtx;
  } catch {
    return null;
  }
}

/**
 * Must be called inside a user gesture (click / tap) so iOS Safari and iOS PWA
 * unlock Web Audio cleanly without autoplay rejection.
 */
export function unlockTriviaAudio(): boolean {
  const ctx = getAudioContext();
  if (!ctx) return false;
  try {
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }
    if (!audioUnlocked) {
      // Silent 1-sample buffer primes iOS WebKit audio session cleanly
      const buf = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
      audioUnlocked = true;
    }
    return true;
  } catch {
    return false;
  }
}

interface ToneStep {
  freq: number;
  offsetSec: number;
  durationSec: number;
  type?: OscillatorType;
  peakGain?: number;
  endFreq?: number;
}

function scheduleToneSequence(steps: ToneStep[], masterVolume: number): void {
  const ctx = getAudioContext();
  if (!ctx || masterVolume <= 0.001) return;

  try {
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }
    const now = ctx.currentTime + 0.01;

    for (const step of steps) {
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = step.type ?? 'sine';
      osc.frequency.setValueAtTime(step.freq, now + step.offsetSec);
      if (step.endFreq) {
        osc.frequency.exponentialRampToValueAtTime(
          Math.max(40, step.endFreq),
          now + step.offsetSec + step.durationSec,
        );
      }

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(3400, now + step.offsetSec);

      const peak = Math.max(0.001, (step.peakGain ?? 0.16) * masterVolume);
      const startAt = now + step.offsetSec;
      const attackAt = startAt + Math.min(0.025, step.durationSec * 0.25);
      const endAt = startAt + step.durationSec;

      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.linearRampToValueAtTime(peak, attackAt);
      gain.gain.exponentialRampToValueAtTime(0.0001, endAt);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startAt);
      osc.stop(endAt + 0.02);
    }
  } catch {
    // Graceful no-op if audio blocked or unsupported
  }
}

const SFX_PATTERNS: Record<TriviaSoundEffect, ToneStep[]> = {
  // Kısa, modern bilgi yarışması başlangıç akoru (C5 -> E5 -> G5 -> B5)
  start: [
    { freq: 523.25, offsetSec: 0.0, durationSec: 0.2, type: 'triangle', peakGain: 0.14 },
    { freq: 659.25, offsetSec: 0.09, durationSec: 0.22, type: 'triangle', peakGain: 0.15 },
    { freq: 783.99, offsetSec: 0.18, durationSec: 0.25, type: 'sine', peakGain: 0.16 },
    { freq: 987.77, offsetSec: 0.27, durationSec: 0.34, type: 'sine', peakGain: 0.15 },
  ],
  // Yeni soruya geçişte hafif, zarif geçiş sesi
  next_question: [
    { freq: 587.33, endFreq: 783.99, offsetSec: 0.0, durationSec: 0.11, type: 'sine', peakGain: 0.085 },
  ],
  // Cevap seçildiğinde kısa dokunsal etkileşim tıkı
  select: [
    { freq: 740, endFreq: 880, offsetSec: 0.0, durationSec: 0.065, type: 'sine', peakGain: 0.09 },
  ],
  // Doğru cevapta ferah yükselen başarı sesi
  correct: [
    { freq: 523.25, offsetSec: 0.0, durationSec: 0.15, type: 'sine', peakGain: 0.14 },
    { freq: 659.25, offsetSec: 0.075, durationSec: 0.18, type: 'triangle', peakGain: 0.15 },
    { freq: 783.99, offsetSec: 0.15, durationSec: 0.28, type: 'sine', peakGain: 0.16 },
  ],
  // Yanlış cevapta yumuşak, rahatsız etmeyen alçalan uyarı sesi
  wrong: [
    { freq: 329.63, offsetSec: 0.0, durationSec: 0.14, type: 'triangle', peakGain: 0.12 },
    { freq: 277.18, offsetSec: 0.11, durationSec: 0.2, type: 'triangle', peakGain: 0.11 },
  ],
  // Son 2 dakikaya girildiğinde temiz ikili çan uyarısı
  two_min_warning: [
    { freq: 880, offsetSec: 0.0, durationSec: 0.15, type: 'sine', peakGain: 0.13 },
    { freq: 880, offsetSec: 0.2, durationSec: 0.2, type: 'sine', peakGain: 0.14 },
  ],
  // Yarışma tamamlandığında sıcak başarı akoru
  complete: [
    { freq: 523.25, offsetSec: 0.0, durationSec: 0.26, type: 'triangle', peakGain: 0.13 },
    { freq: 659.25, offsetSec: 0.1, durationSec: 0.28, type: 'sine', peakGain: 0.14 },
    { freq: 783.99, offsetSec: 0.2, durationSec: 0.34, type: 'sine', peakGain: 0.15 },
    { freq: 1046.5, offsetSec: 0.31, durationSec: 0.45, type: 'sine', peakGain: 0.16 },
  ],
  // 15/15 Mükemmel Başarı için özel altın kazanma fanfarı
  grand_prize: [
    { freq: 523.25, offsetSec: 0.0, durationSec: 0.24, type: 'triangle', peakGain: 0.15 },
    { freq: 659.25, offsetSec: 0.09, durationSec: 0.26, type: 'triangle', peakGain: 0.16 },
    { freq: 783.99, offsetSec: 0.18, durationSec: 0.3, type: 'sine', peakGain: 0.17 },
    { freq: 987.77, offsetSec: 0.28, durationSec: 0.36, type: 'sine', peakGain: 0.16 },
    { freq: 1046.5, offsetSec: 0.38, durationSec: 0.55, type: 'triangle', peakGain: 0.18 },
    { freq: 1318.51, offsetSec: 0.44, durationSec: 0.55, type: 'sine', peakGain: 0.15 },
  ],
};

export function playTriviaSound(kind: TriviaSoundEffect, prefs: TriviaAudioPrefs): boolean {
  if (!prefs.masterEnabled || !prefs.sfxEnabled || prefs.volume <= 0.001) {
    return false;
  }
  const steps = SFX_PATTERNS[kind];
  if (!steps) return false;
  scheduleToneSequence(steps, prefs.volume);
  return true;
}

// ---------------------------------------------------------------------------
// Opt-in Ambient Focus Pad (Gentle, non-distracting quiz atmosphere)
// ---------------------------------------------------------------------------

const AMBIENT_CHORDS: number[][] = [
  [261.63, 329.63, 392.0], // Cmaj
  [220.0, 261.63, 329.63], // Am
  [174.61, 220.0, 261.63], // Fmaj
  [196.0, 246.94, 293.66], // Gmaj
];

function triggerAmbientChord(ctx: AudioContext, masterGain: GainNode): void {
  try {
    const chord = AMBIENT_CHORDS[ambientChordStep % AMBIENT_CHORDS.length];
    ambientChordStep += 1;
    const now = ctx.currentTime + 0.02;

    for (const freq of chord) {
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const noteGain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(680, now);

      noteGain.gain.setValueAtTime(0.0001, now);
      noteGain.gain.linearRampToValueAtTime(0.28, now + 0.9);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, now + 2.65);

      osc.connect(filter);
      filter.connect(noteGain);
      noteGain.connect(masterGain);

      osc.start(now);
      osc.stop(now + 2.75);
    }
  } catch {
    // ignore
  }
}

export function startTriviaAmbientMusic(prefs: TriviaAudioPrefs): boolean {
  if (!prefs.masterEnabled || !prefs.musicEnabled || prefs.volume <= 0.001) {
    stopTriviaAmbientMusic();
    return false;
  }
  const ctx = getAudioContext();
  if (!ctx) return false;

  try {
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }

    if (!ambientMasterGain) {
      ambientMasterGain = ctx.createGain();
      ambientMasterGain.connect(ctx.destination);
    }
    ambientMasterGain.gain.setValueAtTime(Math.max(0.0001, prefs.volume * 0.055), ctx.currentTime);

    if (ambientIntervalId === null) {
      triggerAmbientChord(ctx, ambientMasterGain);
      ambientIntervalId = window.setInterval(() => {
        if (!sharedCtx || !ambientMasterGain || sharedCtx.state === 'closed') {
          stopTriviaAmbientMusic();
          return;
        }
        triggerAmbientChord(sharedCtx, ambientMasterGain);
      }, 2600);
    }
    return true;
  } catch {
    return false;
  }
}

export function updateTriviaAmbientMusicVolume(prefs: TriviaAudioPrefs): void {
  if (!prefs.masterEnabled || !prefs.musicEnabled || prefs.volume <= 0.001) {
    stopTriviaAmbientMusic();
    return;
  }
  if (sharedCtx && ambientMasterGain && sharedCtx.state !== 'closed') {
    try {
      ambientMasterGain.gain.setTargetAtTime(
        Math.max(0.0001, prefs.volume * 0.055),
        sharedCtx.currentTime,
        0.08,
      );
    } catch {
      // ignore
    }
  }
}

export function stopTriviaAmbientMusic(): void {
  if (ambientIntervalId !== null) {
    try {
      window.clearInterval(ambientIntervalId);
    } catch {
      // ignore
    }
    ambientIntervalId = null;
  }
  if (ambientMasterGain && sharedCtx && sharedCtx.state !== 'closed') {
    try {
      ambientMasterGain.gain.setTargetAtTime(0.0001, sharedCtx.currentTime, 0.06);
    } catch {
      // ignore
    }
  }
}

// ---------------------------------------------------------------------------
// Turkish (tr-TR) On-Demand Speech Synthesis Reader
// ---------------------------------------------------------------------------

const OPTION_SPEECH_PREFIX = ['A şıkkı', 'B şıkkı', 'C şıkkı', 'D şıkkı'] as const;

export function buildTriviaSpeechText(params: {
  questionIndex: number;
  question: string;
  options?: readonly string[];
  includeOptions: boolean;
}): string {
  const cleanQuestion = String(params.question || '').replace(/\s+/g, ' ').trim();
  const base = `Soru ${params.questionIndex + 1}. ${cleanQuestion}`;
  if (!params.includeOptions || !params.options || params.options.length === 0) {
    return base;
  }
  const optsPart = params.options
    .slice(0, 4)
    .map((opt, idx) => `${OPTION_SPEECH_PREFIX[idx]}: ${String(opt || '').replace(/\s+/g, ' ').trim()}.`)
    .join(' ');
  return `${base} Seçenekler: ${optsPart}`;
}

function pickBestTurkishVoice(): SpeechSynthesisVoice | null {
  try {
    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return null;
    const exactTr = voices.find((v) => v.lang.toLowerCase() === 'tr-tr' || v.lang.toLowerCase() === 'tr_tr');
    if (exactTr) return exactTr;
    const anyTr = voices.find((v) => v.lang.toLowerCase().startsWith('tr'));
    return anyTr || null;
  } catch {
    return null;
  }
}

export function stopTriviaSpeech(): void {
  if (!isTurkishTtsSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // ignore
  }
}

export function speakTriviaQuestion(
  params: {
    questionIndex: number;
    question: string;
    options?: readonly string[];
    includeOptions: boolean;
  },
  prefs: TriviaAudioPrefs,
  callbacks?: {
    onStart?: () => void;
    onEnd?: () => void;
    onError?: () => void;
  },
): boolean {
  if (!prefs.masterEnabled || !prefs.ttsEnabled || prefs.volume <= 0.001) {
    return false;
  }
  if (!isTurkishTtsSupported()) {
    callbacks?.onError?.();
    return false;
  }

  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(buildTriviaSpeechText(params));
    utterance.lang = 'tr-TR';
    utterance.rate = 0.98;
    utterance.pitch = 1.0;
    utterance.volume = Math.min(1, Math.max(0.05, prefs.volume));

    const trVoice = pickBestTurkishVoice();
    if (trVoice) {
      utterance.voice = trVoice;
    }

    utterance.onstart = () => callbacks?.onStart?.();
    utterance.onend = () => callbacks?.onEnd?.();
    utterance.onerror = () => callbacks?.onError?.();

    window.speechSynthesis.speak(utterance);
    return true;
  } catch {
    callbacks?.onError?.();
    return false;
  }
}

/** Immediately silences background music and any active speech reading. */
export function stopAllTriviaAudio(): void {
  stopTriviaSpeech();
  stopTriviaAmbientMusic();
}
