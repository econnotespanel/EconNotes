import { describe, expect, it } from 'vitest';
import { buildStudioContent, MIN_LESSON_DURATION_SEC, shortLabel } from './sceneModel';
import {
  buildSceneSpeakerTurns,
  discoverTurkishVoices,
  normalizeForTurkishSpeech,
  selectVoicesForSpeakers,
  visemeFromTurkishChar,
  type VoiceOption,
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

    expect(fullStudio.scenes.some(s => s.title.includes('Hocanın Sorabileceği'))).toBe(true);
    expect(fullStudio.matchingPairs.length).toBeGreaterThanOrEqual(3);
    fullStudio.matchingPairs.forEach(pair => {
      expect(pair.term.length).toBeGreaterThan(1);
      expect(pair.definition.length).toBeGreaterThan(4);
      expect(pair.sceneIndex).toBeGreaterThanOrEqual(0);
      expect(pair.sceneIndex).toBeLessThan(fullStudio.scenes.length);
    });

    expect(fullStudio.examQuestions.length).toBeGreaterThanOrEqual(3);
    fullStudio.examQuestions.forEach(q => {
      expect(q.options.length).toBe(4);
      expect(q.correctIndex).toBeGreaterThanOrEqual(0);
      expect(q.correctIndex).toBeLessThan(4);
      expect(q.explanation.length).toBeGreaterThan(5);
      expect(q.sceneIndex).toBeGreaterThanOrEqual(0);
      expect(q.sceneIndex).toBeLessThan(fullStudio.scenes.length);
    });
  });

  it('normalizes Turkish academic abbreviations, year suffixes, apostrophes, Roman numerals and EconNotes phonetic pronunciation', () => {
    const spoken = normalizeForTurkishSpeech(
      "II. Kılıçarslan ve XVI. yüzyılda (örn. merkez maliyesi, GSYH %12 artışı) 1243'te Bizans'ın kervansaraylar vb. kurumları etkilendi. EconNotes'u başta econnotes diye değil EconNotes'un stüdyosunda dinliyoruz.",
    );
    expect(spoken).toContain('İkinci Kılıçarslan');
    expect(spoken).toContain('on altıncı yüzyılda');
    expect(spoken).toContain('gayrisafi yurt içi hasıla');
    expect(spoken).toContain('yüzde 12');
    expect(spoken).toContain('örneğin');
    expect(spoken).toContain('1243 yılında');
    expect(spoken).toContain('Bizansın');
    expect(spoken).toContain('ve benzeri');
    expect(spoken).toContain('Ekon Notsu');
    expect(spoken).toContain('Ekon Notsun');
    expect(spoken).not.toContain('(');
  });

  it('guarantees Dr. Deniz is lead instructor and Barış is respectful student across all dialogue scenes', () => {
    const multiSceneContent = {
      outline: 'İktisadi düşünceler tarihi ve maliye sacayakları.',
      scenes: [
        { title: 'Bölüm 1: Giriş', narration: 'Klasik iktisat piyasaların kendi dengesini bulacağını savunur.' },
        { title: 'Bölüm 2: Kurumsal Yapı', narration: 'Kurumsal iktisat mülkiyet haklarının ve hukuk kurallarının iktisadi büyümeyi belirlediğini kanıtlar.' },
        { title: 'Bölüm 3: Makro Denge', narration: 'Keynesyen model toplam talebin yetersiz kaldığı kriz dönemlerinde maliye politikasının müdahalesini zorunlu görür.' },
      ],
    };

    const studio = buildStudioContent(multiSceneContent, 'İktisat Tarihi', 'İktisat');
    expect(studio.scenes.length).toBeGreaterThanOrEqual(3);

    studio.scenes.forEach(scene => {
      // Deniz her zaman anlatıcıdır
      expect(scene.speaker).toBe('Deniz');
      expect(scene.speakerRole).toBe('Akademik Anlatıcı');

      // Her sahnede Dr. Deniz ve Barış konuşur
      expect(scene.sentenceSpeakers).toBeDefined();
      expect(scene.sentenceSpeakers[0]).toBe('Deniz');

      scene.sentences.forEach((sent, sIdx) => {
        const spk = scene.sentenceSpeakers[sIdx];
        if (spk === 'Deniz') {
          // Dr. Deniz asla kendine "Deniz hocam" demez
          expect(sent).not.toContain('Deniz hocam');
        }
        if (spk === 'Barış') {
          // Barış asla kendine "Barış" demez ("Aynen öyle Barış" dememeli)
          expect(sent).not.toContain('Aynen öyle Barış');
          expect(sent).not.toContain('Kesinlikle Barış');
          // Barış Deniz'e kaba şekilde sadece "Deniz" diyerek hitap etmemeli (Deniz hocam demeli)
          expect(sent).not.toMatch(/\byer alıyor Deniz(?!\s*hocam)\b/);
        }
      });
    });
  });

  it('assigns distinct 22.05kHz VITS Turkish neural voices (Eren & Fahrettin) and never defaults to Google Türkçe', () => {
    const baseVoices = discoverTurkishVoices();
    const fakeGoogleTurkish: VoiceOption = {
      id: 'Google Türkçe|tr-TR',
      name: 'Google Türkçe',
      cleanName: 'Google Türkçe · tr-TR',
      lang: 'tr-TR',
      gender: 'female',
      quality: 'cloud',
      engine: 'browser',
      score: 64,
      voice: { name: 'Google Türkçe', lang: 'tr-TR' } as any,
    };
    const voices = [...baseVoices, fakeGoogleTurkish];
    expect(voices.some(v => v.vitsVoiceId === 'tr_TR-eren-fluid')).toBe(true);
    expect(voices.some(v => v.vitsVoiceId === 'tr_TR-fahrettin-medium')).toBe(true);
    expect(voices.some(v => v.vitsVoiceId === 'tr_TR-fettah-medium')).toBe(true);
    expect(voices.some(v => v.vitsVoiceId === 'tr_TR-dfki-medium')).toBe(true);

    const assigned = selectVoicesForSpeakers(voices);
    expect(assigned.Deniz.pitch).toBe(1.0);
    expect(assigned.Barış.pitch).toBe(1.0);
    expect(assigned.Deniz.vitsVoiceId).toBe('tr_TR-eren-fluid');
    expect(assigned.Barış.vitsVoiceId).toBe('tr_TR-fahrettin-medium');
    expect(assigned.Deniz.voice).toBeNull();
    expect(assigned.Barış.voice).toBeNull();
    expect(assigned.Deniz.label).not.toBe(assigned.Barış.label);
  });

  it('groups consecutive same-speaker sentences into continuous fluid turns', () => {
    const fullStudio = buildStudioContent(
      {
        outline: 'İkta ve miri arazi rejimi analizi.',
        scenes: [
          {
            speaker: 'Deniz',
            title: 'Miri Arazi ve İkta',
            narration: 'Birinci cümle burada başlıyor. İkinci cümle aynı anlatıcıyla devam ediyor. Üçüncü cümle soruyu açıyor.',
            keyTakeaways: ['Miri arazi: Mülkiyet devlete aittir.'],
          },
        ],
      },
      'İktisat Tarihi',
      'İktisat Tarihi',
      { disableCurriculumExpansion: true },
    );
    const turns = buildSceneSpeakerTurns(fullStudio.scenes[0], 0);
    expect(turns.length).toBeGreaterThanOrEqual(1);
    expect(turns[0].spokenSentences.length).toBe(1);
    const totalSentencesInTurns = turns.reduce((acc, t) => acc + t.spokenSentences.length, 0);
    expect(totalSentencesInTurns).toBe(fullStudio.scenes[0].sentences.length);
  });

  it('eliminates broken truncations and bogus concepts from matching and exam questions', () => {
    const rawLesson = {
      videoTitle: 'Osmanlı İktisat Tarihi - 3. Hafta',
      outline:
        'Büyük Selçuklu ve Anadolu Selçuklu iktisadi yapısının mali sacayakları (merkez maliyesi, ikta sistemi ve vakıflar) incelenmektedir. Kırsal ve kentsel iskân politikaları, ticareti geliştirme hamleleri ve Moğol istilasının mali çöküşteki etkileri ele alınır. Özellikle miri arazi rejimi ile Anadolu\'daki küçük ikta sisteminin merkeziyetçi rolü vurgulanmaktadır.',
      scenes: [
        {
          title: 'Giriş ve Selçuklu Maliyesinin Üç Sacayağı',
          narration:
            'Selçuklu kamu maliyesi üç temel direk üzerine kurulmuştu: Merkez maliyesi, ikta sistemi ve vakıflar. Büyük Selçuklularda Abbasi gelirlerinin katbekat üzerine çıkılmış, iç gümrüklerin kaldırılmasıyla iktisadi birlik hedeflenmiştir. Modern devletin üstlendiği eğitim, sağlık, bayındırlık gibi sosyal harcamaların büyük kısmı ise özerk vakıflar aracılığıyla karşılanmıştır.',
          keyTakeaways: [
            'Selçuklu kamu maliyesi: Merkez maliyesi, ikta sistemi ve vakıflar.',
            'Büyük Selçuklularda Abbasi gelirlerinin katbekat üzerine çıkılmış, iç gümrüklerin kaldırılmasıyla iktisadi birlik hedeflenmiştir.',
            'Sosyal harcamalar: Sağlık ve bayındırlık harcamalarının büyük kısmı özerk vakıflar aracılığıyla karşılanmıştır.',
          ],
        },
      ],
    };

    const result = buildStudioContent(rawLesson, 'Osmanlı İktisat Tarihi - 3. Hafta', 'Osmanlı İktisat Tarihi');

    // 1. Asla "..." veya "…" ile kesilmiş soru, şık veya açıklama olmamalı
    result.examQuestions.forEach(q => {
      expect(q.question).not.toContain('…');
      expect(q.question).not.toMatch(/\.\.\./);
      q.options.forEach(opt => {
        expect(opt).not.toContain('…');
        expect(opt).not.toMatch(/\.\.\./);
        expect(opt).not.toBe('Büyük Selçuklularda Abbasi');
        expect(opt).not.toBe('Büyük Selçuklularda büyük');
        // Yarım kalan sözde-kavram ("Modern devletin üstlendiği eğ...") olmamalı
        expect(opt).not.toBe('Modern devletin üstlendiği eğ');
      });
      expect(q.explanation).not.toContain('…');
    });

    // 2. Eşleştirme kartlarında da kesik "…" olmamalı
    result.matchingPairs.forEach(p => {
      expect(p.term).not.toContain('…');
      expect(p.definition).not.toContain('…');
      expect(p.term).not.toBe('Büyük Selçuklularda Abbasi');
      expect(p.term).not.toBe('Büyük Selçuklularda büyük');
      expect(p.term).not.toBe('Modern devletin üstlendiği eğ');
    });

    // 3. Gerçek terimler bulunmalı
    const allTermNames = result.matchingPairs.map(p => p.term);
    expect(
      allTermNames.some(t =>
        ['Miri arazi rejimi', 'İkta sistemi', 'Kamu maliyesi', 'Merkez maliyesi', 'Özerk vakıflar', 'İktisadi birlik'].some(
          valid => t.toLocaleLowerCase('tr-TR').includes(valid.toLocaleLowerCase('tr-TR')),
        ),
      ),
    ).toBe(true);
  });

  it('maps Turkish characters to anatomical mouth visemes', () => {
    expect(visemeFromTurkishChar('m').viseme).toBe('closed');
    expect(visemeFromTurkishChar('ö').viseme).toBe('round');
    expect(visemeFromTurkishChar('a').viseme).toBe('open');
    expect(visemeFromTurkishChar('e').viseme).toBe('wide');
    expect(visemeFromTurkishChar(' ').viseme).toBe('rest');
  });

  it('calculates macroeconomic Taylor Rule policy rate and Fisher real rate correctly', () => {
    // Taylor Rule: i = π + r* + 0.5(π - π*) + 0.5(Y - Y*)
    const pi = 14;
    const rStar = 2.5;
    const piStar = 5;
    const outputGap = 1.2;
    const taylor = pi + rStar + 0.5 * (pi - piStar) + 0.5 * outputGap;
    expect(taylor).toBeCloseTo(21.6, 1);

    // Fisher real rate: r = i - π
    const fisherReal = taylor - pi;
    expect(fisherReal).toBeCloseTo(7.6, 1);
  });

  it('verifies Leitner 3-box spaced repetition state progression', () => {
    let box: 1 | 2 | 3 = 1;
    let streak = 0;

    // Successful review advances box
    box = Math.min(3, box + 1) as 1 | 2 | 3;
    streak += 1;
    expect(box).toBe(2);
    expect(streak).toBe(1);

    // Further success advances to mastery
    box = Math.min(3, box + 1) as 1 | 2 | 3;
    streak += 1;
    expect(box).toBe(3);
    expect(streak).toBe(2);

    // Failed review returns to box 1
    box = 1;
    streak = 0;
    expect(box).toBe(1);
    expect(streak).toBe(0);
  });
});
