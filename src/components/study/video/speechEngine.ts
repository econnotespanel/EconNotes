// Doğal Türkçe Seslendirme & Fonetik Dudak Senkronu (Viseme) Motoru
// Bulut/Neural sesleri (Microsoft Emel/Ahmet Online Natural, Google Türkçe, Apple Yelda/Cem)
// otomatik keşfeder; eski robotik SAPI5 seslerini geri plana atar; cümle bazlı nefes esleri
// ve gerçek zamanlı kelime sınırı (onboundary) takibiyle insan doğallığında okuma sağlar.

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

export interface SpeechProgressState {
  sentenceIndex: number;
  charInSentence: number;
  inBreathPause: boolean;
  viseme: Viseme;
  mouthOpenness: number;
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
  let t = raw.trim();
  if (!t) return '';

  // Parantez içi açıklamaları doğal virgül tonlamasına çevir
  t = t.replace(/\s*\(([^)]{2,120})\)/g, ', $1,');

  // Romen rakamlı hükümdar/dönem adları (örn. I. Keykubad, II. Kılıçarslan)
  t = t.replace(/\b(VIII|VII|VI|IV|III|II|V|I)\.\s+(?=[A-ZÇĞİÖŞÜ])/g, (_, rom) => {
    return `${ROMAN_ORDINAL_TR[rom] || rom} `;
  });

  // Sıra sayılı yüzyıl/hafta/dönem ifadeleri (örn. 13. yüzyılda -> on üçüncü yüzyılda)
  t = t.replace(/\b(\d{1,2})\.\s*(?=yüzyıl|yy|asır|hafta|bölüm|dönem)/gi, (_, numStr) => {
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
      // Eski 2012 SAPI5 çevrimdışı robotik ses — yalnızca hiçbir bulut/neural ses yoksa kullanılır
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

export interface SpeakerVoiceAssignment {
  voice: SpeechSynthesisVoice | null;
  pitch: number;
  baseRate: number;
  label: string;
  quality: VoiceOption['quality'] | 'system';
}

/**
 * Deniz (kadın/analitik) ve Barış (erkek/sorgulayıcı) için en doğal ses eşleşmesini seçer.
 * Asla yüksek kaliteli bulut sesi varken düşük kaliteli robotik SAPI5 sesine düşmez.
 */
export function selectVoicesForSpeakers(
  options: VoiceOption[],
  preferredDenizId?: string,
  preferredBarisId?: string,
): Record<Speaker, SpeakerVoiceAssignment> {
  if (options.length === 0) {
    return {
      Deniz: { voice: null, pitch: 1.0, baseRate: 1.0, label: 'Sistem Türkçe Ses', quality: 'system' },
      Barış: { voice: null, pitch: 0.95, baseRate: 0.97, label: 'Sistem Türkçe Ses', quality: 'system' },
    };
  }

  const manualDeniz = preferredDenizId ? options.find(o => o.id === preferredDenizId) : undefined;
  const manualBaris = preferredBarisId ? options.find(o => o.id === preferredBarisId) : undefined;

  // Kaliteli havuz (varsa robotik legacy sesleri hariç tut)
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
        pitch: 1.0,
        baseRate: 1.0,
        label: denizOpt.cleanName,
        quality: denizOpt.quality,
      },
      Barış: {
        voice: manualBaris.voice,
        pitch: sameVoice ? 0.93 : 1.0,
        baseRate: sameVoice ? 0.96 : 0.99,
        label: manualBaris.cleanName,
        quality: manualBaris.quality,
      },
    };
  }

  if (bestMale) {
    // İki ayrı doğal ses mevcut (ör. Emel Neural + Ahmet Neural veya Yelda + Cem): sıfır yapay perde kaydırma!
    return {
      Deniz: {
        voice: denizOpt.voice,
        pitch: 1.0,
        baseRate: 1.0,
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

  // Tek kaliteli bulut sesi varsa (ör. Chrome üzerinde Google Türkçe):
  // İki anlatıcıda da kaliteli sesi kullan, yalnızca çok hafif doğal konuşma temposu/ton farkı ver
  const secondModern = pool.find(o => o.id !== denizOpt.id);
  if (secondModern) {
    return {
      Deniz: {
        voice: denizOpt.voice,
        pitch: 1.0,
        baseRate: 1.01,
        label: denizOpt.cleanName,
        quality: denizOpt.quality,
      },
      Barış: {
        voice: secondModern.voice,
        pitch: 0.96,
        baseRate: 0.97,
        label: secondModern.cleanName,
        quality: secondModern.quality,
      },
    };
  }

  return {
    Deniz: {
      voice: denizOpt.voice,
      pitch: 1.02,
      baseRate: 1.01,
      label: denizOpt.cleanName,
      quality: denizOpt.quality,
    },
    Barış: {
      voice: denizOpt.voice,
      pitch: 0.93,
      baseRate: 0.96,
      label: `${denizOpt.cleanName} (Derin Ton)`,
      quality: denizOpt.quality,
    },
  };
}

export interface PlaySceneSpeechOptions {
  scene: StudioScene;
  assignment: SpeakerVoiceAssignment;
  playbackSpeed: number;
  volume: number;
  muted: boolean;
  startSentenceIndex?: number;
  onBoundaryProgress: (sentenceIndex: number, charInSentence: number, boundaryHit: boolean) => void;
  onBreathPause: (paused: boolean) => void;
  onComplete: () => void;
}

/**
 * Sahneyi cümle cümle, doğal nefes aralarıyla ve Chrome 15sn kilitlenmesine karşı korumalı okur.
 * İptal fonksiyonu döndürür.
 */
export function playSceneConversationally(opts: PlaySceneSpeechOptions): () => void {
  const {
    scene,
    assignment,
    playbackSpeed,
    volume,
    muted,
    startSentenceIndex = 0,
    onBoundaryProgress,
    onBreathPause,
    onComplete,
  } = opts;

  if (typeof window === 'undefined' || !('speechSynthesis' in window) || muted || volume <= 0.01) {
    return () => {};
  }

  let cancelled = false;
  let pauseTimer: number | null = null;
  let keepAliveTimer: number | null = null;

  const synth = window.speechSynthesis;
  synth.cancel();

  // Chrome'da uzun bulut seslendirmelerinin donmasını önleyen hafif canlı tutma döngüsü
  keepAliveTimer = window.setInterval(() => {
    if (!cancelled && synth.speaking && !synth.paused) {
      synth.resume();
    }
  }, 8000);

  const speakSentenceAt = (sIdx: number) => {
    if (cancelled) return;
    if (sIdx >= scene.sentences.length) {
      onBreathPause(false);
      onComplete();
      return;
    }

    const displaySentence = scene.sentences[sIdx] || '';
    const spokenSentence = normalizeForTurkishSpeech(displaySentence);
    if (!spokenSentence) {
      speakSentenceAt(sIdx + 1);
      return;
    }

    onBreathPause(false);
    onBoundaryProgress(sIdx, 0, false);

    const utter = new SpeechSynthesisUtterance(spokenSentence);
    utter.lang = assignment.voice?.lang || 'tr-TR';
    if (assignment.voice) {
      utter.voice = assignment.voice;
    }
    utter.pitch = assignment.pitch;
    // Soru cümlelerinde çok hafif canlı tempo, açıklamalarda dengeli akış
    const isQuestion = displaySentence.trim().endsWith('?');
    const sentenceRateMod = isQuestion ? 1.02 : 1.0;
    utter.rate = Math.max(0.65, Math.min(1.85, assignment.baseRate * playbackSpeed * sentenceRateMod));
    utter.volume = Math.max(0, Math.min(1, volume));

    const lenRatio = displaySentence.length / Math.max(1, spokenSentence.length);

    utter.onboundary = (ev: SpeechSynthesisEvent) => {
      if (cancelled) return;
      if (typeof ev.charIndex === 'number') {
        const mappedChar = Math.min(displaySentence.length, Math.round(ev.charIndex * lenRatio));
        onBoundaryProgress(sIdx, mappedChar, true);
      }
    };

    const advanceAfterBreath = () => {
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

      // Doğal insan nefes arası (soru/ünlem sonrası biraz daha belirgin es)
      onBreathPause(true);
      const basePause = /[?!]$/.test(displaySentence.trim()) ? 340 : 220;
      const pauseMs = Math.round(basePause / Math.max(0.75, playbackSpeed));
      pauseTimer = window.setTimeout(() => {
        speakSentenceAt(sIdx + 1);
      }, pauseMs);
    };

    utter.onend = advanceAfterBreath;
    utter.onerror = (ev: SpeechSynthesisErrorEvent) => {
      if (cancelled || ev.error === 'interrupted' || ev.error === 'canceled') return;
      advanceAfterBreath();
    };

    synth.speak(utter);
  };

  speakSentenceAt(Math.max(0, Math.min(scene.sentences.length - 1, startSentenceIndex)));

  return () => {
    cancelled = true;
    if (pauseTimer !== null) window.clearTimeout(pauseTimer);
    if (keepAliveTimer !== null) window.clearInterval(keepAliveTimer);
    try {
      synth.cancel();
    } catch {
      // ignore
    }
  };
}
