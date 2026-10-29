// EconNotes Stüdyo Ses Motoru v2:
// 1) Bulut/Gateway Neural TTS (Gemini/OpenAI Studio TTS) + arka plan ön-bellekleme (prefetch)
// 2) Tarayıcı Neural/Bulut ses keşfi (Emel/Ahmet Online Natural, Google Türkçe, Yelda/Cem)
// 3) Sahne içi çoklu konuşmacı (Dr. Deniz <-> Barış) geçişleri ve cümle içi doğal tonlama (prosody)
// 4) Web Audio sıcak stüdyo akustik ambiyansı + yumuşak bölüm geçiş tınısı + 5 kademeli Türkçe viseme

import { supabase } from '@/integrations/supabase/client';
import type { Speaker, StudioScene } from './sceneModel';

export type Viseme = 'rest' | 'closed' | 'round' | 'open' | 'wide';

export interface VoiceOption {
  id: string;
  name: string;
  cleanName: string;
  lang: string;
  gender: 'female' | 'male' | 'neutral';
  quality: 'neural' | 'cloud' | 'standard' | 'legacy';
  score: number;
  voice: SpeechSynthesisVoice;
}

export interface SpeakerVoiceAssignment {
  voice: SpeechSynthesisVoice | null;
  pitch: number;
  baseRate: number;
  label: string;
  quality: VoiceOption['quality'] | 'system';
}

const ORDINAL_TR: Record<number, string> = {
  1: 'birinci',
  2: 'ikinci',
  3: 'üçüncü',
  4: 'dördüncü',
  5: 'beşinci',
  6: 'altıncı',
  7: 'yedinci',
  8: 'sekizinci',
  9: 'dokuzuncu',
  10: 'onuncu',
  11: 'on birinci',
  12: 'on ikinci',
  13: 'on üçüncü',
  14: 'on dördüncü',
  15: 'on beşinci',
  16: 'on altıncı',
  17: 'on yedinci',
  18: 'on sekizinci',
  19: 'on dokuzuncu',
  20: 'yirminci',
  21: 'yirmi birinci',
};

const ROMAN_ORDINAL_TR: Record<string, string> = {
  I: 'Birinci',
  II: 'İkinci',
  III: 'Üçüncü',
  IV: 'Dördüncü',
  V: 'Beşinci',
  VI: 'Altıncı',
  VII: 'Yedinci',
  VIII: 'Sekizinci',
};

/**
 * Akademik yazılı Türkçe metni, ses sentezleyicinin takılmadan ve robotlaşmadan
 * doğal konuşma tonlamasıyla okuyacağı akıcı metne dönüştürür.
 */
export function normalizeForTurkishSpeech(raw: string): string {
  let t = (raw || '').trim();
  if (!t) return '';

  // Sahne başı numaralandırma rozetlerini ("01 · Bağlam ve Durum") doğal konuşmaya çevir
  t = t.replace(/\b0?(\d)\s*·\s*/g, (_, d) => {
    const n = Number(d);
    return ORDINAL_TR[n] ? `${ORDINAL_TR[n]} aşama olan ` : '';
  });

  // Parantez içi açıklamaları doğal virgül tonlamasına çevir
  t = t.replace(/\s*\(([^)]{2,120})\)/g, ', $1,');

  // Romen rakamlı hükümdar/dönem adları (örn. I. Keykubad, II. Kılıçarslan)
  t = t.replace(/\b(VIII|VII|VI|IV|III|II|V|I)\.\s+(?=[A-ZÇĞİÖŞÜ])/g, (_, rom) => {
    return `${ROMAN_ORDINAL_TR[rom] || rom} `;
  });

  // Sıra sayılı yüzyıl/hafta/dönem ifadeleri (örn. 13. yüzyılda -> on üçüncü yüzyılda)
  t = t.replace(/\b(\d{1,2})\.\s*(?=yüzyıl|yy|asır|hafta|bölüm|dönem|adım|aşama)/gi, (_, numStr) => {
    const n = Number(numStr);
    return ORDINAL_TR[n] ? `${ORDINAL_TR[n]} ` : `${numStr}. `;
  });

  // Yaygın akademik kısaltmalar (Türkçe Unicode harf sınırlarına duyarlı)
  t = t
    .replace(/(?<![A-Za-zÇĞİÖŞÜçğıöşü])yy\.(?![A-Za-zÇĞİÖŞÜçğıöşü])/gi, 'yüzyıl')
    .replace(/(?<![A-Za-zÇĞİÖŞÜçğıöşü])vb\.(?![A-Za-zÇĞİÖŞÜçğıöşü])/gi, 've benzeri')
    .replace(/(?<![A-Za-zÇĞİÖŞÜçğıöşü])vs\.(?![A-Za-zÇĞİÖŞÜçğıöşü])/gi, 'vesaire')
    .replace(/(?<![A-Za-zÇĞİÖŞÜçğıöşü])örn\.(?![A-Za-zÇĞİÖŞÜçğıöşü])/gi, 'örneğin')
    .replace(/(?<![A-Za-zÇĞİÖŞÜçğıöşü])bkz\.(?![A-Za-zÇĞİÖŞÜçğıöşü])/gi, 'bakınız')
    .replace(/(?<![A-Za-zÇĞİÖŞÜçğıöşü])Prof\.\s*Dr\./gi, 'Profesör Doktor')
    .replace(/(?<![A-Za-zÇĞİÖŞÜçğıöşü])Doç\.\s*Dr\./gi, 'Doçent Doktor')
    .replace(/(?<![A-Za-zÇĞİÖŞÜçğıöşü])Dr\.(?=\s+[A-ZÇĞİÖŞÜ])/g, 'Doktor')
    .replace(/(?<![A-Za-zÇĞİÖŞÜçğıöşü])M\.?\s*Ö\.?(?![A-Za-zÇĞİÖŞÜçğıöşü])/g, 'milattan önce')
    .replace(/(?<![A-Za-zÇĞİÖŞÜçğıöşü])M\.?\s*S\.?(?![A-Za-zÇĞİÖŞÜçğıöşü])/g, 'milattan sonra')
    .replace(/%\s*(\d+)/g, 'yüzde $1')
    .replace(/\s*\/\s*/g, ' veya ')
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/,\s*,+/g, ',')
    .replace(/\s+/g, ' ')
    .trim();

  return t;
}

/** Türkçe karaktere karşılık gelen anatomik dudak şekli (viseme) */
export function visemeFromTurkishChar(ch: string): { viseme: Viseme; open: number } {
  if (!ch || /[\s.,;!?—–\-:()"]/.test(ch)) {
    return { viseme: 'rest', open: 0.04 };
  }
  const c = ch.toLocaleLowerCase('tr-TR');
  if ('mbpfv'.includes(c)) return { viseme: 'closed', open: 0.02 };
  if ('oöuü'.includes(c)) return { viseme: 'round', open: 0.58 };
  if ('aâ'.includes(c)) return { viseme: 'open', open: 0.82 };
  if ('eê'.includes(c)) return { viseme: 'wide', open: 0.62 };
  if ('iıîy'.includes(c)) return { viseme: 'wide', open: 0.42 };
  if ('sşzçcj'.includes(c)) return { viseme: 'wide', open: 0.26 };
  return { viseme: 'wide', open: 0.36 };
}

/** Tarayıcıdaki Türkçe sesleri bulur ve doğallık kalitesine göre puanlar. */
export function discoverTurkishVoices(): VoiceOption[] {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
  const all = window.speechSynthesis.getVoices() || [];

  const trVoices = all.filter(
    v =>
      /^tr([-_]|$)/i.test(v.lang) ||
      /turkish|türkçe|emel|ahmet|yelda|cem|filiz|tolga/i.test(v.name),
  );

  const mapped: VoiceOption[] = trVoices.map(v => {
    const n = v.name.toLowerCase();
    let score = 50;
    let quality: VoiceOption['quality'] = 'standard';

    if (/natural|neural|online/.test(n)) {
      score = 100;
      quality = 'neural';
    } else if (/enhanced|premium|siri/.test(n)) {
      score = 92;
      quality = 'neural';
    } else if (/google/.test(n) || v.localService === false) {
      score = 86;
      quality = 'cloud';
    } else if (/tolga|sapi|desktop/.test(n) && v.localService) {
      score = 14;
      quality = 'legacy';
    }

    let gender: VoiceOption['gender'] = 'neutral';
    if (/emel|yelda|filiz|zeynep|seda|ayşe|female|kadın|google türkçe/.test(n)) {
      gender = 'female';
    } else if (/ahmet|cem|tolga|kerem|murat|male|erkek/.test(n)) {
      gender = 'male';
    }

    const cleanName = v.name
      .replace(/Microsoft\s+/i, '')
      .replace(/\s*Online\s*\(Natural\)\s*/i, ' · Doğal Neural')
      .replace(/\s*-\s*Turkish\s*\(Turkey\)/i, '')
      .replace(/\s*\(tr-TR\)/i, '')
      .trim();

    return {
      id: v.voiceURI || v.name,
      name: v.name,
      cleanName,
      lang: v.lang,
      gender,
      quality,
      score,
      voice: v,
    };
  });

  mapped.sort((a, b) => b.score - a.score);
  return mapped;
}

/**
 * Deniz (kadın/analitik) ve Barış (erkek/sorgulayıcı) için en doğal ses eşleşmesini seçer.
 */
export function selectVoicesForSpeakers(
  options: VoiceOption[],
  preferredDenizId?: string,
  preferredBarisId?: string,
): Record<Speaker, SpeakerVoiceAssignment> {
  if (options.length === 0) {
    return {
      Deniz: { voice: null, pitch: 1.03, baseRate: 1.01, label: 'Sistem Türkçe Ses', quality: 'system' },
      Barış: { voice: null, pitch: 0.91, baseRate: 0.96, label: 'Sistem Türkçe Ses (Derin)', quality: 'system' },
    };
  }

  const manualDeniz = preferredDenizId ? options.find(o => o.id === preferredDenizId) : undefined;
  const manualBaris = preferredBarisId ? options.find(o => o.id === preferredBarisId) : undefined;

  const modernPool = options.filter(o => o.score >= 45);
  const pool = modernPool.length > 0 ? modernPool : options;

  const bestFemale = pool.find(o => o.gender === 'female') || pool[0];
  const bestMale = pool.find(o => o.gender === 'male' && o.id !== bestFemale.id);

  const denizOpt = manualDeniz || bestFemale;

  if (manualBaris) {
    const sameVoice = manualBaris.id === denizOpt.id;
    return {
      Deniz: {
        voice: denizOpt.voice,
        pitch: sameVoice ? 1.03 : 1.0,
        baseRate: sameVoice ? 1.02 : 1.0,
        label: denizOpt.cleanName,
        quality: denizOpt.quality,
      },
      Barış: {
        voice: manualBaris.voice,
        pitch: sameVoice ? 0.91 : 1.0,
        baseRate: sameVoice ? 0.96 : 0.99,
        label: manualBaris.cleanName,
        quality: manualBaris.quality,
      },
    };
  }

  if (bestMale) {
    return {
      Deniz: {
        voice: denizOpt.voice,
        pitch: 1.0,
        baseRate: 1.01,
        label: denizOpt.cleanName,
        quality: denizOpt.quality,
      },
      Barış: {
        voice: bestMale.voice,
        pitch: 1.0,
        baseRate: 0.98,
        label: bestMale.cleanName,
        quality: bestMale.quality,
      },
    };
  }

  const secondModern = pool.find(o => o.id !== denizOpt.id);
  if (secondModern) {
    return {
      Deniz: {
        voice: denizOpt.voice,
        pitch: 1.02,
        baseRate: 1.02,
        label: denizOpt.cleanName,
        quality: denizOpt.quality,
      },
      Barış: {
        voice: secondModern.voice,
        pitch: 0.93,
        baseRate: 0.96,
        label: secondModern.cleanName,
        quality: secondModern.quality,
      },
    };
  }

  // Tek ses (örn. Chrome Google Türkçe) bulunduğunda robotlaşmadan net kadın/erkek karakter ayrımı
  return {
    Deniz: {
      voice: denizOpt.voice,
      pitch: 1.04,
      baseRate: 1.02,
      label: denizOpt.cleanName,
      quality: denizOpt.quality,
    },
    Barış: {
      voice: denizOpt.voice,
      pitch: 0.90,
      baseRate: 0.96,
      label: `${denizOpt.cleanName} · Barış Tonu`,
      quality: denizOpt.quality,
    },
  };
}

// ---------------------------------------------------------------- Bulut Studio Neural TTS Önbelleği
const cloudAudioBlobCache = new Map<string, string>();
const cloudInflight = new Map<string, Promise<string | null>>();
let cloudTtsState: 'unknown' | 'available' | 'unavailable' = 'unknown';

function base64ToBlobUrl(b64: string, mimeType: string): string {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: mimeType || 'audio/mpeg' });
  return URL.createObjectURL(blob);
}

async function fetchStudioNeuralTts(spokenText: string, speaker: Speaker): Promise<string | null> {
  if (cloudTtsState === 'unavailable') return null;
  const cacheKey = `${speaker}::${spokenText}`;
  const cached = cloudAudioBlobCache.get(cacheKey);
  if (cached) return cached;

  const existing = cloudInflight.get(cacheKey);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 3200);
      const { data, error } = await supabase.functions.invoke('study-coach', {
        body: { mode: 'tts', text: spokenText, speaker },
      });
      window.clearTimeout(timeout);

      if (error || !data || data.fallback || typeof data.audioBase64 !== 'string') {
        if (cloudTtsState === 'unknown') cloudTtsState = 'unavailable';
        return null;
      }

      cloudTtsState = 'available';
      const url = base64ToBlobUrl(data.audioBase64, data.mimeType || 'audio/mpeg');
      cloudAudioBlobCache.set(cacheKey, url);
      return url;
    } catch {
      if (cloudTtsState === 'unknown') cloudTtsState = 'unavailable';
      return null;
    } finally {
      cloudInflight.delete(cacheKey);
    }
  })();

  cloudInflight.set(cacheKey, promise);
  return promise;
}

// ---------------------------------------------------------------- Stüdyo Akustik Ambiyans Motoru
export class StudioAmbienceEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private oscs: OscillatorNode[] = [];
  private running = false;

  start(volume = 1) {
    if (typeof window === 'undefined') return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      if (!this.ctx) {
        this.ctx = new AudioCtx();
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      if (this.running) {
        this.setVolume(volume);
        return;
      }

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(240, this.ctx.currentTime);
      filter.Q.setValueAtTime(0.7, this.ctx.currentTime);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0005, 0.011 * volume), this.ctx.currentTime + 1.2);

      filter.connect(gain);
      gain.connect(this.ctx.destination);

      // Çok hafif sıcak belgesel/stüdyo oda akoru (Dmaj9 sıcak alt armoni)
      const freqs = [146.83, 220.0, 277.18, 329.63];
      this.oscs = freqs.map((f, idx) => {
        const osc = this.ctx!.createOscillator();
        osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(f, this.ctx!.currentTime);
        osc.detune.setValueAtTime((idx - 1.5) * 3.5, this.ctx!.currentTime);
        osc.connect(filter);
        osc.start();
        return osc;
      });

      this.masterGain = gain;
      this.running = true;
    } catch {
      // Ses kartı kısıtlaması varsa sessiz geç
    }
  }

  setVolume(volume: number) {
    if (!this.ctx || !this.masterGain || !this.running) return;
    const target = Math.max(0.0002, 0.011 * Math.max(0, Math.min(1, volume)));
    this.masterGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.25);
  }

  /** Bölüm geçişlerinde çok zarif stüdyo tınısı */
  playChapterChime(volume = 1) {
    if (typeof window === 'undefined' || volume <= 0.01) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      if (!this.ctx) this.ctx = new AudioCtx();
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});

      const now = this.ctx.currentTime;
      [523.25, 659.25].forEach((freq, i) => {
        const osc = this.ctx!.createOscillator();
        const g = this.ctx!.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + i * 0.09);
        g.gain.setValueAtTime(0.0001, now + i * 0.09);
        g.gain.exponentialRampToValueAtTime(0.016 * volume, now + i * 0.09 + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.09 + 0.55);
        osc.connect(g);
        g.connect(this.ctx!.destination);
        osc.start(now + i * 0.09);
        osc.stop(now + i * 0.09 + 0.6);
      });
    } catch {
      // ignore
    }
  }

  stop() {
    if (!this.running) return;
    try {
      this.oscs.forEach(o => {
        try {
          o.stop();
          o.disconnect();
        } catch {
          // ignore
        }
      });
      this.masterGain?.disconnect();
    } catch {
      // ignore
    }
    this.oscs = [];
    this.masterGain = null;
    this.running = false;
  }
}

export interface PlaySceneSpeechOptions {
  scene: StudioScene;
  assignments: Record<Speaker, SpeakerVoiceAssignment>;
  playbackSpeed: number;
  volume: number;
  muted: boolean;
  preferCloudNeural?: boolean;
  startSentenceIndex?: number;
  onSpeakerChange?: (speaker: Speaker) => void;
  onBoundaryProgress: (sentenceIndex: number, charInSentence: number, boundaryHit: boolean) => void;
  onAudioEnergy?: (mouthOpen: number, viseme: Viseme) => void;
  onBreathPause: (paused: boolean) => void;
  onComplete: () => void;
}

/**
 * Sahneyi cümle cümle, konuşmacı değişimlerine (Dr. Deniz <-> Barış) duyarlı biçimde,
 * varsa Bulut Studio Neural TTS ile, yoksa doğal prosody (vurgu/tonlama) motoruyla okur.
 */
export function playSceneConversationally(opts: PlaySceneSpeechOptions): () => void {
  const {
    scene,
    assignments,
    playbackSpeed,
    volume,
    muted,
    preferCloudNeural = true,
    startSentenceIndex = 0,
    onSpeakerChange,
    onBoundaryProgress,
    onAudioEnergy,
    onBreathPause,
    onComplete,
  } = opts;

  if (typeof window === 'undefined' || muted || volume <= 0.01) {
    return () => {};
  }

  let cancelled = false;
  let pauseTimer: number | null = null;
  let keepAliveTimer: number | null = null;
  let activeAudio: HTMLAudioElement | null = null;
  let rafEnergyId: number | null = null;

  const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
  synth?.cancel();

  if (synth) {
    keepAliveTimer = window.setInterval(() => {
      if (!cancelled && synth.speaking && !synth.paused) {
        synth.resume();
      }
    }, 8000);
  }

  const prefetchNextSentence = (nextIdx: number) => {
    if (!preferCloudNeural || cloudTtsState === 'unavailable') return;
    if (nextIdx >= scene.sentences.length) return;
    const nextRaw = scene.sentences[nextIdx] || '';
    const nextSpoken = normalizeForTurkishSpeech(nextRaw);
    const nextSpk = scene.sentenceSpeakers?.[nextIdx] || scene.speaker;
    if (nextSpoken) {
      fetchStudioNeuralTts(nextSpoken, nextSpk).catch(() => {});
    }
  };

  const scheduleNextSentence = (sIdx: number, displaySentence: string, currentSpeaker: Speaker) => {
    if (cancelled) return;
    onBoundaryProgress(sIdx, displaySentence.length, true);

    if (sIdx + 1 >= scene.sentences.length) {
      onBreathPause(true);
      const endPause = Math.round(360 / Math.max(0.75, playbackSpeed));
      pauseTimer = window.setTimeout(() => {
        if (!cancelled) {
          onBreathPause(false);
          onComplete();
        }
      }, endPause);
      return;
    }

    const nextSpeaker = scene.sentenceSpeakers?.[sIdx + 1] || scene.speaker;
    const isSpeakerHandoff = nextSpeaker !== currentSpeaker;
    onBreathPause(true);

    const basePause = isSpeakerHandoff
      ? 350
      : /[?!]$/.test(displaySentence.trim())
      ? 290
      : 195;
    const pauseMs = Math.round(basePause / Math.max(0.75, playbackSpeed));

    pauseTimer = window.setTimeout(() => {
      speakSentenceAt(sIdx + 1);
    }, pauseMs);
  };

  const speakViaBrowserProsody = (
    sIdx: number,
    displaySentence: string,
    spokenSentence: string,
    speaker: Speaker,
  ) => {
    if (!synth || cancelled) return;
    const assignment = assignments[speaker] || assignments.Deniz;

    const utter = new SpeechSynthesisUtterance(spokenSentence);
    utter.lang = assignment.voice?.lang || 'tr-TR';
    if (assignment.voice) {
      utter.voice = assignment.voice;
    }

    const trimmed = displaySentence.trim();
    const isQuestion = trimmed.endsWith('?');
    const isExclaim = trimmed.endsWith('!') || /^(harika|kesinlikle|tam olarak|tam isabet)/i.test(trimmed);

    const pitchMod = isQuestion ? 1.03 : isExclaim ? 1.02 : 1.0;
    const rateMod = isQuestion ? 1.03 : isExclaim ? 1.02 : sIdx === 0 ? 0.99 : 1.0;

    utter.pitch = Math.max(0.82, Math.min(1.18, assignment.pitch * pitchMod));
    utter.rate = Math.max(0.68, Math.min(1.85, assignment.baseRate * playbackSpeed * rateMod));
    utter.volume = Math.max(0, Math.min(1, volume));

    const lenRatio = displaySentence.length / Math.max(1, spokenSentence.length);

    utter.onboundary = (ev: SpeechSynthesisEvent) => {
      if (cancelled) return;
      if (typeof ev.charIndex === 'number') {
        const mappedChar = Math.min(displaySentence.length, Math.round(ev.charIndex * lenRatio));
        onBoundaryProgress(sIdx, mappedChar, true);
      }
    };

    const done = () => scheduleNextSentence(sIdx, displaySentence, speaker);
    utter.onend = done;
    utter.onerror = (ev: SpeechSynthesisErrorEvent) => {
      if (cancelled || ev.error === 'interrupted' || ev.error === 'canceled') return;
      done();
    };

    synth.speak(utter);
  };

  const speakSentenceAt = async (sIdx: number) => {
    if (cancelled) return;
    if (sIdx >= scene.sentences.length) {
      onBreathPause(false);
      onComplete();
      return;
    }

    const displaySentence = scene.sentences[sIdx] || '';
    const spokenSentence = normalizeForTurkishSpeech(displaySentence);
    const speaker: Speaker = scene.sentenceSpeakers?.[sIdx] || scene.speaker;

    if (!spokenSentence) {
      speakSentenceAt(sIdx + 1);
      return;
    }

    onSpeakerChange?.(speaker);
    onBreathPause(false);
    onBoundaryProgress(sIdx, 0, false);
    prefetchNextSentence(sIdx + 1);

    // 1. Öncelik: Bulut Studio Neural TTS (Gemini/OpenAI HD ses akışı)
    if (preferCloudNeural && cloudTtsState !== 'unavailable') {
      const audioUrl = await fetchStudioNeuralTts(spokenSentence, speaker);
      if (cancelled) return;

      if (audioUrl) {
        prefetchNextSentence(sIdx + 2);
        const audio = new Audio(audioUrl);
        activeAudio = audio;
        audio.playbackRate = Math.max(0.65, Math.min(1.8, playbackSpeed));
        audio.volume = Math.max(0, Math.min(1, volume));

        const syncLoop = () => {
          if (cancelled || !activeAudio) return;
          const dur = activeAudio.duration || 1;
          const cur = activeAudio.currentTime || 0;
          const ratio = Math.max(0, Math.min(1, cur / Math.max(0.2, dur)));
          const charPos = Math.min(displaySentence.length, Math.floor(ratio * displaySentence.length));
          onBoundaryProgress(sIdx, charPos, true);

          const ch = displaySentence.charAt(charPos);
          const v = visemeFromTurkishChar(ch);
          onAudioEnergy?.(v.open, v.viseme);
          rafEnergyId = requestAnimationFrame(syncLoop);
        };

        audio.onplay = () => {
          rafEnergyId = requestAnimationFrame(syncLoop);
        };

        const cleanupAudio = () => {
          if (rafEnergyId !== null) {
            cancelAnimationFrame(rafEnergyId);
            rafEnergyId = null;
          }
          activeAudio = null;
        };

        audio.onended = () => {
          cleanupAudio();
          scheduleNextSentence(sIdx, displaySentence, speaker);
        };
        audio.onerror = () => {
          cleanupAudio();
          speakViaBrowserProsody(sIdx, displaySentence, spokenSentence, speaker);
        };

        try {
          await audio.play();
          return;
        } catch {
          cleanupAudio();
        }
      }
    }

    // 2. Doğal Prosody Tarayıcı Ses Motoru
    speakViaBrowserProsody(sIdx, displaySentence, spokenSentence, speaker);
  };

  speakSentenceAt(Math.max(0, Math.min(scene.sentences.length - 1, startSentenceIndex)));

  return () => {
    cancelled = true;
    if (pauseTimer !== null) window.clearTimeout(pauseTimer);
    if (keepAliveTimer !== null) window.clearInterval(keepAliveTimer);
    if (rafEnergyId !== null) cancelAnimationFrame(rafEnergyId);
    if (activeAudio) {
      try {
        activeAudio.pause();
        activeAudio.src = '';
      } catch {
        // ignore
      }
      activeAudio = null;
    }
    try {
      synth?.cancel();
    } catch {
      // ignore
    }
  };
}
