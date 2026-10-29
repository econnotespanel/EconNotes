import { describe, expect, it } from 'vitest';
import { buildStudioContent, MIN_LESSON_DURATION_SEC, shortLabel } from './sceneModel';
import {
  discoverTurkishVoices,
  normalizeForTurkishSpeech,
  selectVoicesForSpeakers,
  visemeFromTurkishChar,
} from './speechEngine';

describe('video studio sceneModel & speechEngine', () => {
  it('never leaves trailing Turkish conjunctions/postpositions in shortLabel', () => {
    expect(shortLabel('Ermeni ve Süryani gibi yerli halklar', 4, 32)).toBe('Ermeni ve Süryani');
    expect(shortLabel('Bizans rejimine karşılık Selçuklu düzeni', 3, 32)).toBe('Bizans rejimine');
  });

  it('builds deep, non-redundant multi-modal academic curriculum >= 5.5 minutes', () => {
    const legacyContent = {
      outline: 'Büyük Selçuklu ve Anadolu Selçuklu iktisadi yapısının mali sacayakları incelenir.',
      scenes: [
        {
          speaker: 'Deniz',
          title: 'Kırsal Düzen ve Serflikten Hür Köylülüğe Geçiş',
          narration:
            'Bizans feodal rejimine karşılık Selçuklular, miri arazi rejimiyle köylüyü hür üretici kılmıştır. Ermeni ve Süryani gibi yerli halklar bu adil düzeni benimsemiştir.',
          keyTakeaways: [
            'Miri arazi rejimi: Toprağın çıplak mülkiyeti devlete, kullanım hakkı köylüye aittir.',
            'Ermeni ve Süryani gibi yerli halkların fethi kolayca kabullenmesinin temelinde adil mülkiyet düzeni yatar.',
          ],
          examTip: 'Anadolu Selçuklu küçük ikta sistemi merkezi otoriteyi güçlendirmiştir.',
        },
      ],
    };

    const rawOnly = buildStudioContent(
      legacyContent,
      'Video Özeti: Osmanlı İktisat Tarihi - 3. Hafta',
      'Osmanlı İktisat Tarihi',
      { disableCurriculumExpansion: true },
    );
    expect(rawOnly.title).toBe('Osmanlı İktisat Tarihi - 3. Hafta');
    expect(rawOnly.scenes[0].diagram.nodes[0].label).toBe('Miri arazi rejimi');
    expect(rawOnly.scenes[0].diagram.nodes[0].subtext.toLowerCase()).not.toContain('miri arazi rejimi:');
    expect(rawOnly.scenes[0].diagram.nodes[1].label.toLowerCase()).not.toMatch(/\bgibi$/);
    expect(new Set(rawOnly.scenes[0].sentenceSpeakers).size).toBe(2);

    const fullStudio = buildStudioContent(
      legacyContent,
      'Video Özeti: Osmanlı İktisat Tarihi - 3. Hafta',
      'Osmanlı İktisat Tarihi',
    );
    expect(fullStudio.totalDurationSec).toBeGreaterThanOrEqual(MIN_LESSON_DURATION_SEC);
    expect(fullStudio.totalDurationSec).toBeGreaterThanOrEqual(330);

    const diagramTypes = new Set(fullStudio.scenes.map(s => s.diagram.type));
    expect(diagramTypes.has('visual')).toBe(true);
    expect(diagramTypes.has('shapes')).toBe(true);
    expect(diagramTypes.has('table')).toBe(true);
    expect(diagramTypes.has('chart')).toBe(true);
    expect(diagramTypes.has('scenario')).toBe(true);
    expect(diagramTypes.has('comparison')).toBe(true);
  });

  it('normalizes Turkish academic abbreviations, economic acronyms, centuries and Roman numerals', () => {
    const spoken = normalizeForTurkishSpeech(
      'II. Kılıçarslan ve XVI. yüzyılda (örn. merkez maliyesi, GSYH %12 artışı) M.Ö. 4. yy. ve 13. yüzyılda kervansaraylar vb. kurumlar gelişti.',
    );
    expect(spoken).toContain('İkinci Kılıçarslan');
    expect(spoken).toContain('on altıncı yüzyılda');
    expect(spoken).toContain('gayrisafi yurt içi hasıla');
    expect(spoken).toContain('yüzde 12');
    expect(spoken).toContain('örneğin');
    expect(spoken).toContain('milattan önce');
    expect(spoken).toContain('dördüncü yüzyıl');
    expect(spoken).toContain('on üçüncü yüzyılda');
    expect(spoken).toContain('ve benzeri');
    expect(spoken).not.toContain('(');
  });

  it('provides 22.05kHz VITS Turkish neural voices and never pitch-warps speaker voices', () => {
    const voices = discoverTurkishVoices();
    expect(voices.some(v => v.vitsVoiceId === 'tr_TR-fahrettin-medium')).toBe(true);
    expect(voices.some(v => v.vitsVoiceId === 'tr_TR-fettah-medium')).toBe(true);
    expect(voices.some(v => v.vitsVoiceId === 'tr_TR-dfki-medium')).toBe(true);

    const assigned = selectVoicesForSpeakers(voices);
    expect(assigned.Deniz.pitch).toBe(1.0);
    expect(assigned.Barış.pitch).toBe(1.0);
    expect(assigned.Barış.vitsVoiceId).toBe('tr_TR-fahrettin-medium');
    expect(assigned.Deniz.label).not.toBe(assigned.Barış.label);
  });

  it('maps Turkish characters to anatomical mouth visemes', () => {
    expect(visemeFromTurkishChar('m').viseme).toBe('closed');
    expect(visemeFromTurkishChar('ö').viseme).toBe('round');
    expect(visemeFromTurkishChar('a').viseme).toBe('open');
    expect(visemeFromTurkishChar('e').viseme).toBe('wide');
    expect(visemeFromTurkishChar(' ').viseme).toBe('rest');
  });
});
