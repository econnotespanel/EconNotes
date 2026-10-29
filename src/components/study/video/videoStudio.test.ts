import { describe, expect, it } from 'vitest';
import { buildStudioContent, shortLabel } from './sceneModel';
import { normalizeForTurkishSpeech, visemeFromTurkishChar } from './speechEngine';

describe('video studio sceneModel & speechEngine', () => {
  it('never leaves trailing Turkish conjunctions/postpositions in shortLabel', () => {
    expect(shortLabel('Ermeni ve Süryani gibi yerli halklar', 4, 32)).toBe('Ermeni ve Süryani');
    expect(shortLabel('Bizans rejimine karşılık Selçuklu düzeni', 3, 32)).toBe('Bizans rejimine');
  });

  it('builds clean non-redundant diagram nodes for legacy note materials', () => {
    const legacyContent = {
      outline: 'Selçuklu mali yapısı incelenir.',
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
        },
      ],
    };

    const studio = buildStudioContent(
      legacyContent,
      'Video Özeti: Osmanlı İktisat Tarihi - 3. Hafta',
      'Osmanlı İktisat Tarihi',
    );

    expect(studio.title).toBe('Osmanlı İktisat Tarihi - 3. Hafta');
    expect(studio.scenes).toHaveLength(1);
    const nodes = studio.scenes[0].diagram.nodes;
    expect(nodes.length).toBeGreaterThanOrEqual(2);
    expect(nodes[0].label).toBe('Miri arazi rejimi');
    expect(nodes[0].subtext.toLowerCase()).not.toContain('miri arazi rejimi:');
    expect(nodes[1].label.toLowerCase()).not.toMatch(/\bgibi$/);
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
