// EconNotes Stüdyo Ses Motoru v4 (Akıcı Türkçe Diyalog Blokları + 22.05 kHz VITS Neural HD):
// - Arka plan uğultusu/müziği/osilatörü %100 kaldırılmıştır (saf, berrak stüdyo sessizliği).
// - Eski tarayıcı varsayılan seslerine (Google Türkçe / Tolga / SAPI5) otomatik düşüş kaldırılmıştır;
//   Dr. Deniz (Eren · Akıcı Akademik Neural HD) ve Barış (Fahrettin · Akıcı Stüdyo Neural HD)
//   varsayılan olarak iki farklı, akıcı 22.05 kHz Derin Sinir Ağı Türkçe Stüdyo sesiyle konuşur.
// - Cümle cümle kesik okuma yerine konuşmacı bazlı akıcı paragraf/diyalog bloğu sentezi yapılır;
//   örneklem-hassasiyetli (sample-accurate) zaman damgalarıyla altyazı ve akıllı tahta %100 senkron kalır.

import { supabase } from '@/integrations/supabase/client';
import type { Speaker, StudioScene } from './sceneModel';
import {
  VITS_TURKISH_VOICES,
  synthesizeVitsTurkishTurn,
  warmupVitsVoice,
  type SynthesizedSpeechClip,
  type VitsTurkishVoiceId,
} from './vitsTurkishEngine';

export type Viseme = 'rest' | 'closed' | 'round' | 'open' | 'wide';

export interface VoiceOption {
  id: string;
  name: string;
  cleanName: string;
  roleHint?: string;
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

export interface SpeakerTurn {
  speaker: Speaker;
  sentenceIndices: number[];
  displaySentences: string[];
  spokenSentences: string[];
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
 * kesme işaretlerinde teklemeden, akıcı bir üniversite hocası diksiyonuyla okuyacağı metne dönüştürür.
 */
export function normalizeForTurkishSpeech(raw: string): string {
  let t = (raw || '').trim();
  if (!t) return '';

  // Sahne başı numaralandırma rozetlerini ("01 · Bağlam ve Durum") doğal konuşmaya çevir
  t = t.replace(/\b0?(\d)\s*·\s*/g, (_, d) => {
    const n = Number(d);
    return ORDINAL_TR[n] ? `${ORDINAL_TR[n]} aşama olan ` : '';
  });

  // Parantez içi açıklamaları doğal virgül nefesine çevir
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

  // Yıl + kesme eki ifadelerini doğal akıcı Türkçe söyleyişe çevir (örn. 1243'te -> 1243 yılında)
  t = t
    .replace(/\b(\d{4})\s*['’`]\s*(?:te|ta|de|da)\b/gi, '$1 yılında')
    .replace(/\b(\d{4})\s*['’`]\s*(?:ten|tan|den|dan)\b/gi, '$1 yılından')
    .replace(/\b(\d{4})\s*['’`]\s*(?:e|a|ye|ya)\b/gi, '$1 yılına');

  // Özel isim çekim eklerindeki kesme işaretlerini birleştir (Bizans'ın -> Bizansın, Anadolu’daki -> Anadoludaki)
  // Böylece hiçbir TTS motoru ekten önce yapay duraksama yapmaz.
  t = t.replace(/([A-Za-zÇĞİÖŞÜçğıöşüâîûÂÎÛ])['’`]([a-zçğıöşüâîû])/g, '$1$2');

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
    .replace(/\.\.\.+/g, '.')
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
  if ('oöuüû'.includes(c)) return { viseme: 'round', open: 0.62 };
  if ('aâ'.includes(c)) return { viseme: 'open', open: 0.84 };
  if ('eê'.includes(c)) return { viseme: 'wide', open: 0.64 };
  if ('iıîy'.includes(c)) return { viseme: 'wide', open: 0.44 };
  if ('sşzçcj'.includes(c)) return { viseme: 'wide', open: 0.26 };
  return { viseme: 'wide', open: 0.36 };
}

export function waitForBrowserVoicesReady(timeoutMs = 500): Promise<void> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return Promise.resolve();
  }
  const existing = window.speechSynthesis.getVoices() || [];
  if (existing.some(v => /natural|neural|online|yelda|cem/i.test(v.name))) {
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
 * 22.05 kHz VITS Derin Sinir Ağı Türkçe Stüdyo seslerini en üst öncelikle sunar;
 * eski robotik SAPI5 (Tolga/Desktop/eSpeak) seslerini kesin olarak eler.
 */
export function discoverTurkishVoices(): VoiceOption[] {
  const vitsOptions: VoiceOption[] = VITS_TURKISH_VOICES.map(v => ({
    id: v.optionId,
    name: v.cleanName,
    cleanName: v.cleanName,
    roleHint: v.roleHint,
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
      // Eski robotik masaüstü SAPI5 / eSpeak ve tekdüze eski Google TTS seslerini varsayılan dışı tut
      !/tolga|espeak|desktop|sapi/i.test(v.name),
  );

  const browserOptions: VoiceOption[] = trVoices.map(v => {
    const n = v.name.toLowerCase();
    let score = 62;
    let quality: VoiceOption['quality'] = 'standard';

    if (/natural|neural|online/.test(n)) {
      score = 96;
      quality = 'neural';
    } else if (/enhanced|premium|siri/.test(n)) {
      score = 92;
      quality = 'neural';
    } else if (/google/.test(n) || v.localService === false) {
      score = 72;
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
      .replace(/\s*Online\s*\(Natural\)\s*/i, ' · Doğal Bulut')
      .replace(/\s*-\s*Turkish\s*\(Turkey\)/i, '')
      .replace(/\s*\(tr-TR\)/i, '')
      .replace(/^Google\s+Türkçe$/i, 'Tarayıcı Bulut Türkçe (Alternatif)')
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

  const combined = [...vitsOptions, ...browserOptions];
  combined.sort((a, b) => b.score - a.score);
  return combined;
}

function toAssignment(opt: VoiceOption, customLengthScale?: number): SpeakerVoiceAssignment {
  if (opt.engine === 'vits-neural' && opt.vitsVoiceId) {
    return {
      engine: 'vits-neural',
      voice: null,
      vitsVoiceId: opt.vitsVoiceId,
      lengthScale: customLengthScale ?? opt.lengthScale,
      pitch: 1.0,
      baseRate: 1.0,
      label: opt.cleanName,
      quality: 'neural',
    };
  }
  return {
    engine: 'browser',
    voice: opt.voice || null,
    pitch: 1.0,
    baseRate: 1.0,
    label: opt.cleanName,
    quality: opt.quality,
  };
}

/**
 * Dr. Deniz ve Barış için tarayıcının eski yerleşik seslerine bağımlı kalmadan,
 * doğrudan iki farklı 22.05 kHz VITS Derin Sinir Ağı Türkçe Stüdyo sesini seçer:
 * - Dr. Deniz (Kıdemli Akademik Anlatıcı): Eren · Akıcı Akademik Neural HD
 * - Barış (Genç Araştırmacı & Soru Soran): Fahrettin · Akıcı Stüdyo Neural HD
 */
export function selectVoicesForSpeakers(
  options: VoiceOption[],
  preferredDenizId?: string,
  preferredBarisId?: string,
): Record<Speaker, SpeakerVoiceAssignment> {
  const pool = options.length > 0 ? options : discoverTurkishVoices();

  const manualDeniz = preferredDenizId ? pool.find(o => o.id === preferredDenizId) : undefined;
  const manualBaris = preferredBarisId ? pool.find(o => o.id === preferredBarisId) : undefined;

  const erenNeural = pool.find(o => o.vitsVoiceId === 'tr_TR-eren-fluid');
  const fahrettinNeural = pool.find(o => o.vitsVoiceId === 'tr_TR-fahrettin-medium');
  const dfkiNeural = pool.find(o => o.vitsVoiceId === 'tr_TR-dfki-medium');
  const fettahNeural = pool.find(o => o.vitsVoiceId === 'tr_TR-fettah-medium');

  const denizPicked = manualDeniz || erenNeural || dfkiNeural || fettahNeural || pool[0];
  const barisPicked =
    manualBaris ||
    (fahrettinNeural && fahrettinNeural.id !== denizPicked?.id
      ? fahrettinNeural
      : dfkiNeural && dfkiNeural.id !== denizPicked?.id
      ? dfkiNeural
      : fettahNeural) ||
    pool.find(o => o.id !== denizPicked?.id) ||
    denizPicked;

  const denizAssign: SpeakerVoiceAssignment = denizPicked
    ? toAssignment(denizPicked)
    : {
        engine: 'vits-neural',
        voice: null,
        vitsVoiceId: 'tr_TR-eren-fluid',
        lengthScale: 0.87,
        pitch: 1.0,
        baseRate: 1.0,
        label: 'Eren · Akıcı Akademik Neural HD',
        quality: 'neural',
      };

  const barisAssign: SpeakerVoiceAssignment = barisPicked
    ? toAssignment(barisPicked)
    : {
        engine: 'vits-neural',
        voice: null,
        vitsVoiceId: 'tr_TR-fahrettin-medium',
        lengthScale: 0.96,
        pitch: 1.0,
        baseRate: 1.0,
        label: 'Fahrettin · Akıcı Stüdyo Neural HD',
        quality: 'neural',
      };

  return {
    Deniz: denizAssign,
    Barış: barisAssign,
  };
}

/**
 * Her iki sunucunun 22.05 kHz VITS Neural Türkçe modellerini arka planda önceden ısıtır.
 */
export function preloadAssignedNeuralVoices(assignments: Record<Speaker, SpeakerVoiceAssignment>): void {
  if (typeof window === 'undefined') return;
  const ordered: VitsTurkishVoiceId[] = [];
  if (assignments.Deniz.engine === 'vits-neural' && assignments.Deniz.vitsVoiceId) {
    ordered.push(assignments.Deniz.vitsVoiceId);
  }
  if (
    assignments.Barış.engine === 'vits-neural' &&
    assignments.Barış.vitsVoiceId &&
    !ordered.includes(assignments.Barış.vitsVoiceId)
  ) {
    ordered.push(assignments.Barış.vitsVoiceId);
  }
  // Önce açılış konuşmacısını (Deniz), ardından Barış'ı sırayla ısıt ki ilk sahne en hızlı başlasın
  ordered.reduce<Promise<void>>(
    (chain, id) => chain.then(() => warmupVitsVoice(id).catch(() => {})),
    Promise.resolve(),
  );
}

/**
 * Sahnedeki cümleleri aynı konuşmacının ardışık sözlerinden oluşan akıcı diyalog bloklarına (Turn) ayırır.
 * Böylece her noktadan sonra ses kesilmez; doğal ve akışkan paragraf tonlaması korunur.
 */
export function buildSceneSpeakerTurns(
  scene: StudioScene,
  startSentenceIndex = 0,
): SpeakerTurn[] {
  const turns: SpeakerTurn[] = [];
  const startIdx = Math.max(0, Math.min(scene.sentences.length - 1, startSentenceIndex));

  for (let i = startIdx; i < scene.sentences.length; i++) {
    const raw = (scene.sentences[i] || '').trim();
    const spoken = normalizeForTurkishSpeech(raw);
    if (!spoken) continue;
    const spk: Speaker = scene.sentenceSpeakers?.[i] || scene.speaker;

    const prev = turns[turns.length - 1];
    const currentTurnChars = prev
      ? prev.spokenSentences.reduce((sum, s) => sum + s.length, 0)
      : 0;

    if (
      prev &&
      prev.speaker === spk &&
      prev.sentenceIndices.length < 3 &&
      currentTurnChars + spoken.length <= 440
    ) {
      prev.sentenceIndices.push(i);
      prev.displaySentences.push(raw);
      prev.spokenSentences.push(spoken);
    } else {
      turns.push({
        speaker: spk,
        sentenceIndices: [i],
        displaySentences: [raw],
        spokenSentences: [spoken],
      });
    }
  }

  return turns;
}

// ---------------------------------------------------------------- Bulut Gateway Neural TTS Önbelleği
const cloudAudioBlobCache = new Map<string, string>();
const cloudInflight = new Map<string, Promise<string | null>>();
let cloudTtsFailures = 0;
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
      const { data, error } = await supabase.functions.invoke('study-coach', {
        body: { mode: 'tts', text: spokenText, speaker },
      });

      if (error || !data || data.fallback || typeof data.audioBase64 !== 'string') {
        // Sunucu açıkça fallback döndürdüyse doğrudan yerel 22.05kHz VITS Neural motoruna kilitlen
        if (data?.fallback) {
          cloudTtsState = 'unavailable';
        } else {
          cloudTtsFailures += 1;
          if (cloudTtsFailures >= 2) cloudTtsState = 'unavailable';
        }
        return null;
      }

      cloudTtsState = 'available';
      cloudTtsFailures = 0;
      const url = base64ToBlobUrl(data.audioBase64, data.mimeType || 'audio/mpeg');
      cloudAudioBlobCache.set(cacheKey, url);
      return url;
    } catch {
      cloudTtsFailures += 1;
      if (cloudTtsFailures >= 2) cloudTtsState = 'unavailable';
      return null;
    } finally {
      cloudInflight.delete(cacheKey);
    }
  })();

  cloudInflight.set(cacheKey, promise);
  return promise;
}

async function synthesizeTurnAudio(
  turn: SpeakerTurn,
  assignments: Record<Speaker, SpeakerVoiceAssignment>,
  preferCloudNeural: boolean,
): Promise<SynthesizedSpeechClip | null> {
  const assign = assignments[turn.speaker] || assignments.Deniz;
  const joinedSpoken = turn.spokenSentences.join(' ');

  if (preferCloudNeural && cloudTtsState !== 'unavailable') {
    const cloudUrl = await fetchStudioNeuralTts(joinedSpoken, turn.speaker);
    if (cloudUrl) {
      return {
        blobUrl: cloudUrl,
        durationSec: Math.max(1.5, joinedSpoken.length / 13.5),
        envelope: [],
        sentenceEndSec: [],
      };
    }
  }

  if (assign.engine === 'vits-neural' && assign.vitsVoiceId) {
    return await synthesizeVitsTurkishTurn(
      turn.spokenSentences,
      assign.vitsVoiceId,
      assign.lengthScale,
    );
  }

  return null;
}

/**
 * Oynat düğmesine basıldığında ilk konuşma bloğunu (ve arka planda ikinci bloğu) önceden hazırlar;
 * böylece ders 00:00'dan itibaren %100 akıcı Neural Türkçe sesle, kesintisiz başlar.
 */
export async function prepareSceneFirstTurn(
  scene: StudioScene,
  assignments: Record<Speaker, SpeakerVoiceAssignment>,
  preferCloudNeural = true,
  startSentenceIndex = 0,
): Promise<void> {
  if (typeof window === 'undefined') return;
  const turns = buildSceneSpeakerTurns(scene, startSentenceIndex);
  if (turns.length === 0) return;

  const firstAssign = assignments[turns[0].speaker] || assignments.Deniz;
  if (firstAssign.engine === 'browser' && (!preferCloudNeural || cloudTtsState === 'unavailable')) {
    await waitForBrowserVoicesReady(400);
    return;
  }

  await synthesizeTurnAudio(turns[0], assignments, preferCloudNeural);
  // İkinci konuşmacı bloğunu da beklemeden arka planda ısıt
  if (turns[1]) {
    synthesizeTurnAudio(turns[1], assignments, preferCloudNeural).catch(() => {});
  }
}

/**
 * Ses ayarları menüsünden seçilen anlatıcı sesini anında test etmek için kısa önizleme oynatır.
 */
let activePreviewAudio: HTMLAudioElement | null = null;
export async function previewSpeakerVoice(
  assignment: SpeakerVoiceAssignment,
  speaker: Speaker,
  volume = 1.0,
): Promise<void> {
  if (typeof window === 'undefined') return;
  if (activePreviewAudio) {
    try {
      activePreviewAudio.pause();
      activePreviewAudio.src = '';
    } catch {
      // ignore
    }
    activePreviewAudio = null;
  }
  window.speechSynthesis?.cancel();

  const sampleText =
    speaker === 'Deniz'
      ? 'Merhaba arkadaşlar, bugün konumuzun temel kavramlarını ve sınavda öne çıkan noktalarını akıcı biçimde inceleyeceğiz.'
      : 'Hocam, bu mekanizmanın pratikteki etkisini somut bir vaka senaryosu üzerinden birlikte karşılaştırabilir miyiz?';

  if (assignment.engine === 'vits-neural' && assignment.vitsVoiceId) {
    const clip = await synthesizeVitsTurkishTurn(
      [normalizeForTurkishSpeech(sampleText)],
      assignment.vitsVoiceId,
      assignment.lengthScale,
    );
    if (clip) {
      const audio = new Audio(clip.blobUrl);
      activePreviewAudio = audio;
      audio.volume = Math.max(0.1, Math.min(1, volume));
      await audio.play().catch(() => {});
      return;
    }
  }

  if ('speechSynthesis' in window) {
    const utter = new SpeechSynthesisUtterance(sampleText);
    utter.lang = assignment.voice?.lang || 'tr-TR';
    if (assignment.voice) utter.voice = assignment.voice;
    utter.pitch = 1.0;
    utter.rate = 1.0;
    utter.volume = Math.max(0.1, Math.min(1, volume));
    window.speechSynthesis.speak(utter);
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
 * Sahneyi konuşmacı diyalog blokları (Turn) halinde, sıfır arka plan uğultusuyla,
 * cümle aralarında kesilmeden akıcı Türkçe diksiyonla seslendirir.
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

  const turns = buildSceneSpeakerTurns(scene, startSentenceIndex);
  if (turns.length === 0) {
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

  const prefetchTurn = (tIdx: number) => {
    if (cancelled || tIdx >= turns.length) return;
    synthesizeTurnAudio(turns[tIdx], assignments, preferCloudNeural).catch(() => {});
  };

  const scheduleNextTurn = (tIdx: number) => {
    if (cancelled) return;
    const finishedTurn = turns[tIdx];
    const lastPos = finishedTurn.sentenceIndices.length - 1;
    const lastSIdx = finishedTurn.sentenceIndices[lastPos];
    const lastDisplay = finishedTurn.displaySentences[lastPos] || '';

    onBoundaryProgress(lastSIdx, lastDisplay.length, true);
    onAudioEnergy?.(0.02, 'rest');

    if (tIdx + 1 >= turns.length) {
      onBreathPause(true);
      const endPause = Math.round(280 / Math.max(0.75, playbackSpeed));
      pauseTimer = window.setTimeout(() => {
        if (!cancelled) {
          onBreathPause(false);
          onComplete();
        }
      }, endPause);
      return;
    }

    onBreathPause(true);
    const nextTurn = turns[tIdx + 1];
    const handoffMs = nextTurn.speaker !== finishedTurn.speaker ? 210 : 140;
    const pauseMs = Math.round(handoffMs / Math.max(0.75, playbackSpeed));

    pauseTimer = window.setTimeout(() => {
      speakTurnAt(tIdx + 1);
    }, pauseMs);
  };

  const playTurnClipWithSync = async (
    clip: SynthesizedSpeechClip,
    turn: SpeakerTurn,
    tIdx: number,
  ): Promise<boolean> => {
    if (cancelled) return true;
    const audio = new Audio(clip.blobUrl);
    activeAudio = audio;
    audio.playbackRate = Math.max(0.7, Math.min(1.75, playbackSpeed));
    audio.volume = Math.max(0, Math.min(1, volume));

    // Eğer bulut sesi nedeniyle sentenceEndSec boşsa karakter ağırlıklı zaman sınırları üret
    const totalDispChars = Math.max(
      1,
      turn.displaySentences.reduce((acc, s) => acc + Math.max(1, s.length), 0),
    );

    const syncLoop = () => {
      if (cancelled || !activeAudio) return;
      const dur = activeAudio.duration && Number.isFinite(activeAudio.duration)
        ? activeAudio.duration
        : clip.durationSec || 1;
      const cur = activeAudio.currentTime || 0;

      // O an konuşulan cümleyi ve cümle içi karakter indeksini örneklem-hassasiyetli bul
      let subIdx = 0;
      let segStartSec = 0;
      let segEndSec = dur;

      if (clip.sentenceEndSec.length === turn.sentenceIndices.length && clip.durationSec > 0) {
        const scale = dur / clip.durationSec;
        for (let k = 0; k < clip.sentenceEndSec.length; k++) {
          const endScaled = clip.sentenceEndSec[k] * scale;
          if (cur <= endScaled || k === clip.sentenceEndSec.length - 1) {
            subIdx = k;
            segStartSec = k === 0 ? 0 : clip.sentenceEndSec[k - 1] * scale;
            segEndSec = endScaled;
            break;
          }
        }
      } else {
        let cumChars = 0;
        for (let k = 0; k < turn.displaySentences.length; k++) {
          const prevEnd = (cumChars / totalDispChars) * dur;
          cumChars += Math.max(1, turn.displaySentences[k].length);
          const curEnd = (cumChars / totalDispChars) * dur;
          if (cur <= curEnd || k === turn.displaySentences.length - 1) {
            subIdx = k;
            segStartSec = prevEnd;
            segEndSec = curEnd;
            break;
          }
        }
      }

      const activeSIdx = turn.sentenceIndices[subIdx];
      const dispSent = turn.displaySentences[subIdx] || '';
      const localRatio = Math.max(
        0,
        Math.min(1, (cur - segStartSec) / Math.max(0.12, segEndSec - segStartSec)),
      );
      const charPos = Math.min(dispSent.length, Math.floor(localRatio * dispSent.length));
      onBoundaryProgress(activeSIdx, charPos, true);

      const ch = dispSent.charAt(charPos);
      const v = visemeFromTurkishChar(ch);
      if (clip.envelope && clip.envelope.length > 0) {
        const envPos = clip.durationSec > 0 ? (cur / Math.max(0.15, dur)) * clip.durationSec : cur;
        const envIdx = Math.min(clip.envelope.length - 1, Math.max(0, Math.floor(envPos * 50)));
        const rmsEnergy = clip.envelope[envIdx] ?? 0;
        const blendedOpen = rmsEnergy < 0.035 ? 0.02 : Math.min(1, rmsEnergy * 0.72 + v.open * 0.38);
        onAudioEnergy?.(blendedOpen, rmsEnergy < 0.03 ? 'rest' : v.viseme);
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
        scheduleNextTurn(tIdx);
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

  const speakTurnViaBrowserFallback = async (turn: SpeakerTurn, tIdx: number) => {
    if (!synth || cancelled) {
      scheduleNextTurn(tIdx);
      return;
    }
    await waitForBrowserVoicesReady(350);
    if (cancelled) return;

    const assignment = assignments[turn.speaker] || assignments.Deniz;
    let chosenVoice = assignment.voice;
    if (!chosenVoice) {
      const fresh = discoverTurkishVoices().find(v => v.engine === 'browser');
      chosenVoice = fresh?.voice || null;
    }

    const joinedSpoken = turn.spokenSentences.join(' ');
    const utter = new SpeechSynthesisUtterance(joinedSpoken);
    utter.lang = chosenVoice?.lang || 'tr-TR';
    if (chosenVoice) utter.voice = chosenVoice;
    utter.pitch = 1.0;
    utter.rate = Math.max(0.75, Math.min(1.75, assignment.baseRate * playbackSpeed));
    utter.volume = Math.max(0, Math.min(1, volume));

    // Birleşik metin üzerindeki karakter sınırlarını ilgili sahne cümlelerine eşle
    const spokenBounds: Array<{ start: number; end: number; sIdx: number; dispLen: number }> = [];
    let cursor = 0;
    for (let k = 0; k < turn.spokenSentences.length; k++) {
      const len = turn.spokenSentences[k].length;
      spokenBounds.push({
        start: cursor,
        end: cursor + len,
        sIdx: turn.sentenceIndices[k],
        dispLen: turn.displaySentences[k].length,
      });
      cursor += len + 1;
    }

    utter.onboundary = (ev: SpeechSynthesisEvent) => {
      if (cancelled || typeof ev.charIndex !== 'number') return;
      const c = ev.charIndex;
      const seg =
        spokenBounds.find(b => c >= b.start && c <= b.end) ||
        spokenBounds[spokenBounds.length - 1];
      if (seg) {
        const ratio = (c - seg.start) / Math.max(1, seg.end - seg.start);
        onBoundaryProgress(seg.sIdx, Math.min(seg.dispLen, Math.round(ratio * seg.dispLen)), true);
      }
    };

    const done = () => scheduleNextTurn(tIdx);
    utter.onend = done;
    utter.onerror = (ev: SpeechSynthesisErrorEvent) => {
      if (cancelled || ev.error === 'interrupted' || ev.error === 'canceled') return;
      done();
    };
    synth.speak(utter);
  };

  const speakTurnAt = async (tIdx: number) => {
    if (cancelled) return;
    if (tIdx >= turns.length) {
      onBreathPause(false);
      onComplete();
      return;
    }

    const turn = turns[tIdx];
    onSpeakerChange?.(turn.speaker);
    onBreathPause(false);
    onBoundaryProgress(turn.sentenceIndices[0], 0, false);

    // Sıradaki 2 konuşmacı bloğunu şimdiden arka planda sentezle (sıfır bekleme ile söz geçişi)
    prefetchTurn(tIdx + 1);
    prefetchTurn(tIdx + 2);

    const clip = await synthesizeTurnAudio(turn, assignments, preferCloudNeural);
    if (cancelled) return;

    if (clip) {
      const ok = await playTurnClipWithSync(clip, turn, tIdx);
      if (ok) return;
    }

    // Yalnızca kullanıcı tarayıcı sesi seçtiyse veya WASM engellendiyse tarayıcı sesine düş
    await speakTurnViaBrowserFallback(turn, tIdx);
  };

  speakTurnAt(0);

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
