import { describe, expect, it } from 'vitest';
import { buildStudioContent, MIN_LESSON_DURATION_SEC, shortLabel } from './sceneModel';
import { normalizeForTurkishSpeech, visemeFromTurkishChar } from './speechEngine';

describe('video studio sceneModel & speechEngine', () => {
  it('never leaves trailing Turkish conjunctions/postpositions in shortLabel', () => {
    expect(shortLabel('Ermeni ve Süryani gibi yerli halklar', 4, 32)).toBe('Ermeni ve Süryani');
    expect(shortLabel('Bizans rejimine karşılık Selçuklu düzeni', 3, 32)).toBe('Bizans rejimine');
  });

  it('builds clean non-redundant diagram nodes and guarantees >= 5 min multi-modal curriculum', () => {
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
    // Sahne içinde hem Deniz hem Barış karşılıklı konuşur
    expect(new Set(rawOnly.scenes[0].sentenceSpeakers).size).toBe(2);

    // Tam müfredat genişletmesi: en az 5+ dakika ve zengin görsel tiplerin tamamı mevcut
    const fullStudio = buildStudioContent(
      legacyContent,
      'Video Özeti: Osmanlı İktisat Tarihi - 3. Hafta',
      'Osmanlı İktisat Tarihi',
    );
    expect(fullStudio.totalDurationSec).toBeGreaterThanOrEqual(MIN_LESSON_DURATION_SEC);
    expect(fullStudio.totalDurationSec).toBeGreaterThanOrEqual(300);

    const diagramTypes = new Set(fullStudio.scenes.map(s => s.diagram.type));
    expect(diagramTypes.has('visual')).toBe(true);
    expect(diagramTypes.has('shapes')).toBe(true);
    expect(diagramTypes.has('table')).toBe(true);
    expect(diagramTypes.has('chart')).toBe(true);
    expect(diagramTypes.has('scenario')).toBe(true);
  });

  it('normalizes Turkish academic abbreviations, centuries and Roman numerals for natural speech', () => {
    const spoken = normalizeForTurkishSpeech(
      'II. Kılıçarslan döneminde (örn. merkez maliyesi ve vakıflar) M.Ö. 4. yy. ve 13. yüzyılda kervansaraylar vb. kurumlar gelişti.',
    );
    expect(spoken).toContain('İkinci Kılıçarslan');
    expect(spoken).toContain('örneğin');
    expect(spoken).toContain('milattan önce');
    expect(spoken).toContain('dördüncü yüzyıl');
    expect(spoken).toContain('on üçüncü yüzyılda');
    expect(spoken).toContain('ve benzeri');
    expect(spoken).not.toContain('(');
  });

  it('maps Turkish characters to anatomical mouth visemes', () => {
    expect(visemeFromTurkishChar('m').viseme).toBe('closed');
    expect(visemeFromTurkishChar('ö').viseme).toBe('round');
    expect(visemeFromTurkishChar('a').viseme).toBe('open');
    expect(visemeFromTurkishChar('e').viseme).toBe('wide');
    expect(visemeFromTurkishChar(' ').viseme).toBe('rest');
  });
});
