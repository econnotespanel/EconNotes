// EconNotes Stüdyo Ses Motoru v3 (Saf Sessiz Stüdyo + 22.05 kHz VITS Neural Türkçe + Doğal Bulut Sesler):
// - Arka plan uğultusu/müziği/osilatörü %100 kaldırılmıştır (saf, berrak stüdyo sessizliği).
// - Eski robotik SAPI5 (Tolga/Desktop/eSpeak) sesleri kesin olarak devre dışı bırakılmıştır.
// - Tarayıcı içi 22.05 kHz VITS Derin Sinir Ağı Türkçe Stüdyo Sesleri (Fahrettin, Fettah, DFKI)
//   ve doğal bulut sesleri (Microsoft Emel/Ahmet Online Natural, Google Türkçe, Yelda/Cem) birlikte çalışır.

import { supabase } from '@/integrations/supabase/client';
import type { Speaker, StudioScene } from './sceneModel';
import {
  VITS_TURKISH_VOICES,
  synthesizeVitsTurkish,
  warmupVitsVoice,
  type VitsTurkishVoiceId,
} from './vitsTurkishEngine';

export type Viseme = 'rest' | 'closed' | 'round' | 'open' | 'wide';

export interface VoiceOption {
  id: string;
  name: string;
  cleanName: string;
  lang: string;
  gender: 'female' | 'male' | 'neutral';
  quality: 'neural' | 'cloud' | 'standard';
  engine: 'vits-neural' | 'browser';
  score: number;
  voice?: SpeechSynthesisVoice;
  vitsVoiceId?: VitsTurkishVoiceId;
  lengthScale?: number;
}

export interface SpeakerVoiceAssignment {
  engine: 'vits-neural' | 'browser';
  voice: SpeechSynthesisVoice | null;
  vitsVoiceId?: VitsTurkishVoiceId;
  lengthScale?: number;
  pitch: number;
  baseRate: number;
  label: string;
  quality: VoiceOption['quality'] | 'neural';
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
  IX: 'Dokuzuncu',
  X: 'Onuncu',
  XI: 'On birinci',
  XII: 'On ikinci',
  XIII: 'On üçüncü',
  XIV: 'On dördüncü',
  XV: 'On beşinci',
  XVI: 'On altıncı',
  XVII: 'On yedinci',
  XVIII: 'On sekizinci',
  XIX: 'On dokuzuncu',
  XX: 'Yirminci',
};

/**
 * Akademik yazılı Türkçe metni, derin sinir ağı ses sentezleyicisinin takılmadan,
 * kısaltmalarda duraksamadan, akıcı bir üniversite hocası diksiyonuyla okuyacağı metne dönüştürür.
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
  t = t.replace(/\s*\(([^)]{2,140})\)/g, ', $1,');

  // Romen rakamlı yüzyıl ifadeleri (örn. XVI. yüzyıl -> on altıncı yüzyıl)
  t = t.replace(
    /\b(XX|XIX|XVIII|XVII|XVI|XV|XIV|XIII|XII|XI|IX|VIII|VII|VI|IV|III|II|X|V|I)\.\s*(?=yüzyıl|yy|asır)/gi,
    (_, rom: string) => {
      const val = ROMAN_ORDINAL_TR[rom.toUpperCase()];
      return val ? `${val.toLocaleLowerCase('tr-TR')} ` : `${rom} `;
    },
  );

  // Romen rakamlı hükümdar/dönem adları (örn. I. Keykubad, II. Kılıçarslan, III. Selim)
  t = t.replace(/\b(VIII|VII|VI|IV|III|II|V|I)\.\s+(?=[A-ZÇĞİÖŞÜ])/g, (_, rom: string) => {
    return `${ROMAN_ORDINAL_TR[rom] || rom} `;
  });

  // Sıra sayılı yüzyıl/hafta/dönem ifadeleri (örn. 13. yüzyılda -> on üçüncü yüzyılda)
  t = t.replace(/\b(\d{1,2})\.\s*(?=yüzyıl|yy|asır|hafta|bölüm|dönem|adım|aşama|halka|madde)/gi, (_, numStr) => {
    const n = Number(numStr);
    return ORDINAL_TR[n] ? `${ORDINAL_TR[n]} ` : `${numStr}. `;
  });

  // İktisat, tarih ve hukuk kısaltmaları ile semboller
  t = t
    .replace(/(?<![A-Za-zÇĞİÖŞÜçğıöşü])GSYH(?![A-Za-zÇĞİÖŞÜçğıöşü])/g, 'gayrisafi yurt içi hasıla')
    .replace(/(?<![A-Za-zÇĞİÖŞÜçğıöşü])GSMH(?![A-Za-zÇĞİÖŞÜçğıöşü])/g, 'gayrisafi milli hasıla')
    .replace(/(?<![A-Za-zÇĞİÖŞÜçğıöşü])TCMB(?![A-Za-zÇĞİÖŞÜçğıöşü])/g, 'Merkez Bankası')
    .replace(/(?<![A-Za-zÇĞİÖŞÜçğıöşü])TÜFE(?![A-Za-zÇĞİÖŞÜçğıöşü])/g, 'tüketici fiyat endeksi')
    .replace(/(?<![A-Za-zÇĞİÖŞÜçğıöşü])ÜFE(?![A-Za-zÇĞİÖŞÜçğıöşü])/g, 'üretici fiyat endeksi')
    .replace(/(?<![A-Za-zÇĞİÖŞÜçğıöşü])KDV(?![A-Za-zÇĞİÖŞÜçğıöşü])/g, 'katma değer vergisi')
    .replace(/(?<![A-Za-zÇĞİÖŞÜçğıöşü])ÖTV(?![A-Za-zÇĞİÖŞÜçğıöşü])/g, 'özel tüketim vergisi')
    .replace(/(?<![A-Za-zÇĞİÖŞÜçğıöşü])IMF(?![A-Za-zÇĞİÖŞÜçğıöşü])/g, 'Uluslararası Para Fonu')
    .replace(/(?<![A-Za-zÇĞİÖŞÜçğıöşü])yy\.(?![A-Za-zÇĞİÖŞÜçğıöşü])/gi, 'yüzyıl')
    .replace(/(?<![A-Za-zÇĞİÖŞÜçğıöşü])vb\.(?![A-Za-zÇĞİÖŞÜçğıöşü])/gi, 've benzeri')
    .replace(/(?<![A-Za-zÇĞİÖŞÜçğıöşü])vs\.(?![A-Za-zÇĞİÖŞÜçğıöşü])/gi, 'vesaire')
    .replace(/(?<![A-Za-zÇĞİÖŞÜçğıöşü])örn\.(?![A-Za-zÇĞİÖŞÜçğıöşü])/gi, 'örneğin')
    .replace(/(?<![A-Za-zÇĞİÖŞÜçğıöşü])bkz\.(?![A-Za-zÇĞİÖŞÜçğıöşü])/gi, 'bakınız')
    .replace(/(?<![A-Za-zÇĞİÖŞÜçğıöşü])yak\.(?![A-Za-zÇĞİÖŞÜçğıöşü])/gi, 'yaklaşık')
    .replace(/(?<![A-Za-zÇĞİÖŞÜçğıöşü])Prof\.\s*Dr\./gi, 'Profesör Doktor')
    .replace(/(?<![A-Za-zÇĞİÖŞÜçğıöşü])Doç\.\s*Dr\./gi, 'Doçent Doktor')
    .replace(/(?<![A-Za-zÇĞİÖŞÜçğıöşü])Dr\.(?=\s+[A-ZÇĞİÖŞÜ])/g, 'Doktor')
    .replace(/(?<![A-Za-zÇĞİÖŞÜçğıöşü])M\.?\s*Ö\.?(?![A-Za-zÇĞİÖŞÜçğıöşü])/g, 'milattan önce')
    .replace(/(?<![A-Za-zÇĞİÖŞÜçğıöşü])M\.?\s*S\.?(?![A-Za-zÇĞİÖŞÜçğıöşü])/g, 'milattan sonra')
    .replace(/%\s*(\d+(?:[.,]\d+)?)/g, 'yüzde $1')
    .replace(/(\d+)\s*₺/g, '$1 Türk lirası')
    .replace(/→|->/g, ', ardından ')
    .replace(/\s*&\s*/g, ' ve ')
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
    return { viseme: 'rest', open: 0.03 };
  }
  const c = ch.toLocaleLowerCase('tr-TR');
  if ('mbpfv'.includes(c)) return { viseme: 'closed', open: 0.02 };
  if ('oöuü'.includes(c)) return { viseme: 'round', open: 0.62 };
  if ('aâ'.includes(c)) return { viseme: 'open', open: 0.84 };
  if ('eê'.includes(c)) return { viseme: 'wide', open: 0.64 };
  if ('iıîy'.includes(c)) return { viseme: 'wide', open: 0.44 };
  if ('sşzçcj'.includes(c)) return { viseme: 'wide', open: 0.26 };
  return { viseme: 'wide', open: 0.36 };
}

/**
 * Chrome ve Edge tarayıcılarında bulut/neural ses listesi eşzamansız yüklendiği için
 * ilk konuşmadan önce ses listesinin hazır olmasını bekler.
 */
export function waitForBrowserVoicesReady(timeoutMs = 550): Promise<void> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return Promise.resolve();
  }
  const existing = window.speechSynthesis.getVoices() || [];
  if (existing.some(v => /natural|neural|online|google|yelda|cem/i.test(v.name))) {
    return Promise.resolve();
  }
  return new Promise<void>(resolve => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.speechSynthesis.removeEventListener?.('voiceschanged', onVoices);
      resolve();
    };
    const onVoices = () => {
      const list = window.speechSynthesis.getVoices() || [];
      if (list.length > 0) finish();
    };
    window.speechSynthesis.addEventListener?.('voiceschanged', onVoices);
    window.setTimeout(finish, timeoutMs);
  });
}

/**
 * Hem tarayıcı içi 22.05 kHz VITS Derin Sinir Ağı Türkçe Stüdyo seslerini hem de
 * tarayıcıdaki yüksek kaliteli Neural/Bulut Türkçe sesleri birleştirir.
 * Eski robotik SAPI5 (Tolga/Desktop/eSpeak) sesleri kesin olarak elenir.
 */
export function discoverTurkishVoices(): VoiceOption[] {
  const vitsOptions: VoiceOption[] = VITS_TURKISH_VOICES.map(v => ({
    id: v.optionId,
    name: v.cleanName,
    cleanName: v.cleanName,
    lang: 'tr-TR',
    gender: v.gender,
    quality: 'neural',
    engine: 'vits-neural',
    score: v.score,
    vitsVoiceId: v.voiceId,
    lengthScale: v.defaultLengthScale,
  }));

  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return vitsOptions;
  }

  const all = window.speechSynthesis.getVoices() || [];
  const trVoices = all.filter(
    v =>
      (/^tr([-_]|$)/i.test(v.lang) ||
        /turkish|türkçe|emel|ahmet|yelda|cem|filiz/i.test(v.name)) &&
      // Eski robotik masaüstü SAPI5 / eSpeak seslerini tamamen engelle
      !/tolga|espeak|desktop|sapi/i.test(v.name),
  );

  const browserOptions: VoiceOption[] = trVoices.map(v => {
    const n = v.name.toLowerCase();
    let score = 68;
    let quality: VoiceOption['quality'] = 'standard';

    if (/natural|neural|online/.test(n)) {
      score = 100;
      quality = 'neural';
    } else if (/enhanced|premium|siri/.test(n)) {
      score = 94;
      quality = 'neural';
    } else if (/google/.test(n) || v.localService === false) {
      score = 91;
      quality = 'cloud';
    }

    let gender: VoiceOption['gender'] = 'neutral';
    if (/emel|yelda|filiz|zeynep|seda|ayşe|female|kadın|google türkçe/.test(n)) {
      gender = 'female';
    } else if (/ahmet|cem|kerem|murat|male|erkek/.test(n)) {
      gender = 'male';
    }

    const cleanName = v.name
      .replace(/Microsoft\s+/i, '')
      .replace(/\s*Online\s*\(Natural\)\s*/i, ' · Doğal Neural HD')
      .replace(/\s*-\s*Turkish\s*\(Turkey\)/i, '')
      .replace(/\s*\(tr-TR\)/i, '')
      .replace(/^Google\s+Türkçe$/i, 'Google Türkçe · Bulut HD')
      .trim();

    return {
      id: v.voiceURI || v.name,
      name: v.name,
      cleanName,
      lang: v.lang || 'tr-TR',
      gender,
      quality,
      engine: 'browser',
      score,
      voice: v,
    };
  });

  const combined = [...browserOptions, ...vitsOptions];
  combined.sort((a, b) => b.score - a.score);
  return combined;
}

function toAssignment(opt: VoiceOption, customLengthScale?: number): SpeakerVoiceAssignment {
  if (opt.engine === 'vits-neural' && opt.vitsVoiceId) {
    return {
      engine: 'vits-neural',
      voice: null,
      vitsVoiceId: opt.vitsVoiceId,
      lengthScale: customLengthScale ?? opt.lengthScale ?? 1.0,
      pitch: 1.0,
      baseRate: 1.0,
      label: opt.cleanName,
      quality: 'neural',
    };
  }
  return {
    engine: 'browser',
    voice: opt.voice || null,
    // Asla yapay perde bükme (pitch shift) uygulanmaz — %100 doğal insan tonu korunur
    pitch: 1.0,
    baseRate: 1.0,
    label: opt.cleanName,
    quality: opt.quality,
  };
}

/**
 * Dr. Deniz ve Barış için robotlaşma olmadan en üst düzey Türkçe ses eşleşmesini seçer:
 * - Edge'de: Microsoft Emel Online (Natural) + Microsoft Ahmet Online (Natural)
 * - Chrome'da: Google Türkçe Bulut HD (Deniz, pitch=1.0) + Fahrettin Stüdyo Neural HD (Barış, 22.05kHz VITS)
 * - Firefox/Diğer: DFKI/Fettah Stüdyo Neural HD (Deniz) + Fahrettin Stüdyo Neural HD (Barış)
 */
export function selectVoicesForSpeakers(
  options: VoiceOption[],
  preferredDenizId?: string,
  preferredBarisId?: string,
): Record<Speaker, SpeakerVoiceAssignment> {
  const pool = options.length > 0 ? options : discoverTurkishVoices();

  const manualDeniz = preferredDenizId ? pool.find(o => o.id === preferredDenizId) : undefined;
  const manualBaris = preferredBarisId ? pool.find(o => o.id === preferredBarisId) : undefined;

  // Dr. Deniz için en kaliteli kadın neural/bulut sesi; yoksa DFKI / Fettah Neural HD
  const bestFemaleBrowser = pool.find(
    o => o.engine === 'browser' && o.gender === 'female' && o.score >= 85,
  );
  const dfkiNeural = pool.find(o => o.vitsVoiceId === 'tr_TR-dfki-medium');
  const fettahNeural = pool.find(o => o.vitsVoiceId === 'tr_TR-fettah-medium');
  const fahrettinNeural = pool.find(o => o.vitsVoiceId === 'tr_TR-fahrettin-medium');

  const denizDefault = bestFemaleBrowser || dfkiNeural || fettahNeural || pool[0];
  const denizPicked = manualDeniz || denizDefault;

  // Barış için en kaliteli erkek neural sesi (Ahmet Online Natural veya Fahrettin 22.05kHz Stüdyo Neural HD)
  const bestMaleNativeNeural = pool.find(
    o => o.engine === 'browser' && o.gender === 'male' && o.score >= 92 && o.id !== denizPicked?.id,
  );
  const barisDefault =
    bestMaleNativeNeural ||
    (fahrettinNeural && fahrettinNeural.id !== denizPicked?.id ? fahrettinNeural : fettahNeural) ||
    pool.find(o => o.id !== denizPicked?.id) ||
    denizPicked;

  const barisPicked = manualBaris || barisDefault;

  const denizAssign = denizPicked
    ? toAssignment(denizPicked, denizPicked.engine === 'vits-neural' ? 1.0 : undefined)
    : {
        engine: 'vits-neural' as const,
        voice: null,
        vitsVoiceId: 'tr_TR-dfki-medium' as VitsTurkishVoiceId,
        lengthScale: 1.0,
        pitch: 1.0,
        baseRate: 1.0,
        label: 'DFKI · Stüdyo Neural HD',
        quality: 'neural' as const,
      };

  const barisAssign = barisPicked
    ? toAssignment(barisPicked, barisPicked.engine === 'vits-neural' ? 0.97 : undefined)
    : {
        engine: 'vits-neural' as const,
        voice: null,
        vitsVoiceId: 'tr_TR-fahrettin-medium' as VitsTurkishVoiceId,
        lengthScale: 0.97,
        pitch: 1.0,
        baseRate: 1.0,
        label: 'Fahrettin · Stüdyo Neural HD',
        quality: 'neural' as const,
      };

  return {
    Deniz: denizAssign,
    Barış: barisAssign,
  };
}

/**
 * Seçili konuşmacı seslerinden VITS Neural olanları arka planda önceden ısıtır (OPFS + WASM).
 */
export function preloadAssignedNeuralVoices(assignments: Record<Speaker, SpeakerVoiceAssignment>): void {
  if (typeof window === 'undefined') return;
  const ids = new Set<VitsTurkishVoiceId>();
  if (assignments.Barış.engine === 'vits-neural' && assignments.Barış.vitsVoiceId) {
    ids.add(assignments.Barış.vitsVoiceId);
  }
  if (assignments.Deniz.engine === 'vits-neural' && assignments.Deniz.vitsVoiceId) {
    ids.add(assignments.Deniz.vitsVoiceId);
  }
  ids.forEach(id => {
    warmupVitsVoice(id).catch(() => {});
  });
}

// ---------------------------------------------------------------- Bulut Gateway Neural TTS Önbelleği
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
      const timeout = window.setTimeout(() => controller.abort(), 2800);
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
 * Sahneyi cümle cümle, sıfır arka plan uğultusuyla, konuşmacı geçişlerine duyarlı biçimde
 * (Bulut HD Neural -> 22.05 kHz VITS Stüdyo Neural -> Doğal Bulut Tarayıcı Sesi) seslendirir.
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

  // Sıradaki cümleleri hem Bulut hem VITS Neural motorunda önceden sentezle (sıfır bekleme)
  const prefetchUpcoming = (idx: number) => {
    if (cancelled || idx >= scene.sentences.length) return;
    const raw = scene.sentences[idx] || '';
    const spoken = normalizeForTurkishSpeech(raw);
    if (!spoken) return;
    const spk: Speaker = scene.sentenceSpeakers?.[idx] || scene.speaker;
    const assign = assignments[spk] || assignments.Deniz;

    if (preferCloudNeural && cloudTtsState !== 'unavailable') {
      fetchStudioNeuralTts(spoken, spk).catch(() => {});
    }
    if (assign.engine === 'vits-neural' && assign.vitsVoiceId) {
      synthesizeVitsTurkish(spoken, assign.vitsVoiceId, assign.lengthScale).catch(() => {});
    }
  };

  const scheduleNextSentence = (sIdx: number, displaySentence: string, currentSpeaker: Speaker) => {
    if (cancelled) return;
    onBoundaryProgress(sIdx, displaySentence.length, true);
    onAudioEnergy?.(0.02, 'rest');

    if (sIdx + 1 >= scene.sentences.length) {
      onBreathPause(true);
      const endPause = Math.round(340 / Math.max(0.75, playbackSpeed));
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
      ? 330
      : /[?!]$/.test(displaySentence.trim())
      ? 260
      : 175;
    const pauseMs = Math.round(basePause / Math.max(0.75, playbackSpeed));

    pauseTimer = window.setTimeout(() => {
      speakSentenceAt(sIdx + 1);
    }, pauseMs);
  };

  const playAudioClipWithSync = async (
    blobUrl: string,
    envelope: number[] | null,
    sIdx: number,
    displaySentence: string,
    speaker: Speaker,
  ): Promise<boolean> => {
    if (cancelled) return true;
    const audio = new Audio(blobUrl);
    activeAudio = audio;
    audio.playbackRate = Math.max(0.7, Math.min(1.75, playbackSpeed));
    audio.volume = Math.max(0, Math.min(1, volume));

    const syncLoop = () => {
      if (cancelled || !activeAudio) return;
      const dur = activeAudio.duration || 1;
      const cur = activeAudio.currentTime || 0;
      const ratio = Math.max(0, Math.min(1, cur / Math.max(0.18, dur)));
      const charPos = Math.min(displaySentence.length, Math.floor(ratio * displaySentence.length));
      onBoundaryProgress(sIdx, charPos, true);

      const ch = displaySentence.charAt(charPos);
      const v = visemeFromTurkishChar(ch);
      if (envelope && envelope.length > 0) {
        const envIdx = Math.min(envelope.length - 1, Math.max(0, Math.floor(cur * 50)));
        const rmsEnergy = envelope[envIdx] ?? 0;
        const blendedOpen = rmsEnergy < 0.04 ? 0.02 : Math.min(1, rmsEnergy * 0.68 + v.open * 0.42);
        onAudioEnergy?.(blendedOpen, rmsEnergy < 0.035 ? 'rest' : v.viseme);
      } else {
        onAudioEnergy?.(v.open, v.viseme);
      }
      rafEnergyId = requestAnimationFrame(syncLoop);
    };

    const cleanupAudio = () => {
      if (rafEnergyId !== null) {
        cancelAnimationFrame(rafEnergyId);
        rafEnergyId = null;
      }
      activeAudio = null;
    };

    return new Promise<boolean>(resolve => {
      audio.onplay = () => {
        rafEnergyId = requestAnimationFrame(syncLoop);
      };
      audio.onended = () => {
        cleanupAudio();
        scheduleNextSentence(sIdx, displaySentence, speaker);
        resolve(true);
      };
      audio.onerror = () => {
        cleanupAudio();
        resolve(false);
      };
      audio.play().catch(() => {
        cleanupAudio();
        resolve(false);
      });
    });
  };

  const speakViaBrowserVoice = async (
    sIdx: number,
    displaySentence: string,
    spokenSentence: string,
    speaker: Speaker,
  ) => {
    if (!synth || cancelled) return;
    await waitForBrowserVoicesReady(450);
    if (cancelled) return;

    const assignment = assignments[speaker] || assignments.Deniz;
    let chosenVoice = assignment.voice;

    // Atanan ses henüz yüklenmemişse güncel listeden SAPI5 olmayan en iyi Türkçe sesi bul
    if (!chosenVoice) {
      const fresh = discoverTurkishVoices().find(
        v => v.engine === 'browser' && (speaker === 'Deniz' ? v.gender === 'female' : v.gender === 'male'),
      ) || discoverTurkishVoices().find(v => v.engine === 'browser');
      chosenVoice = fresh?.voice || null;
    }

    const utter = new SpeechSynthesisUtterance(spokenSentence);
    utter.lang = chosenVoice?.lang || 'tr-TR';
    if (chosenVoice) {
      utter.voice = chosenVoice;
    }

    // %100 doğal perde (pitch = 1.0) — yapay robotik ses bükmesi yapılmaz
    utter.pitch = 1.0;
    utter.rate = Math.max(0.72, Math.min(1.75, assignment.baseRate * playbackSpeed));
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
    const assignment = assignments[speaker] || assignments.Deniz;

    if (!spokenSentence) {
      speakSentenceAt(sIdx + 1);
      return;
    }

    onSpeakerChange?.(speaker);
    onBreathPause(false);
    onBoundaryProgress(sIdx, 0, false);

    // Gelecek iki cümleyi şimdiden arka planda hazırla
    prefetchUpcoming(sIdx + 1);
    prefetchUpcoming(sIdx + 2);

    // 1. Öncelik: Bulut Gateway Studio Neural TTS (etkinse)
    if (preferCloudNeural && cloudTtsState !== 'unavailable') {
      const cloudUrl = await fetchStudioNeuralTts(spokenSentence, speaker);
      if (cancelled) return;
      if (cloudUrl) {
        const ok = await playAudioClipWithSync(cloudUrl, null, sIdx, displaySentence, speaker);
        if (ok) return;
      }
    }

    // 2. Öncelik: Tarayıcı İçi 22.05 kHz VITS Derin Sinir Ağı Türkçe Stüdyo Sesi (Fahrettin / Fettah / DFKI)
    if (assignment.engine === 'vits-neural' && assignment.vitsVoiceId) {
      const clip = await synthesizeVitsTurkish(
        spokenSentence,
        assignment.vitsVoiceId,
        assignment.lengthScale,
      );
      if (cancelled) return;
      if (clip) {
        const ok = await playAudioClipWithSync(
          clip.blobUrl,
          clip.envelope,
          sIdx,
          displaySentence,
          speaker,
        );
        if (ok) return;
      }
    }

    // 3. Doğal Bulut / Neural Tarayıcı Sesi (Emel Online Natural / Google Türkçe HD, pitch=1.0)
    await speakViaBrowserVoice(sIdx, displaySentence, spokenSentence, speaker);
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
