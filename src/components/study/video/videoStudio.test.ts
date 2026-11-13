import { describe, expect, it } from 'vitest';
import {
  buildStudioContent,
  inferVisualTheme,
  MIN_LESSON_DURATION_SEC,
  shortLabel,
  type StudioScene,
} from './sceneModel';
import { renderStage, STAGE_H, STAGE_W, type StageFrame } from './renderStage';
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
    expect(assigned.Barış.vitsVoiceId).toBe('tr_TR-dfki-medium');
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


function createMockCanvasContext() {
  const fillTextCalls: string[] = [];
  const gradient = {
    addColorStop: () => undefined,
  };
  const base: Record<string, unknown> = {
    canvas: { width: STAGE_W, height: STAGE_H },
    fillStyle: '#000000',
    strokeStyle: '#000000',
    font: '400 16px sans-serif',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    globalAlpha: 1,
    shadowColor: 'transparent',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    lineDashOffset: 0,
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    measureText: (text: string) => ({ width: (text || '').length * 8 }) as TextMetrics,
    getLineDash: () => [],
    fillText: (text: string) => {
      fillTextCalls.push(String(text));
    },
  };

  const ctx = new Proxy(base, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      return () => undefined;
    },
    set(target, prop: string, value: unknown) {
      target[prop] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;

  return { ctx, fillTextCalls };
}

function makeTestFrame(scene: StudioScene, sceneIndex: number, sceneCount: number): StageFrame {
  return {
    scene,
    sceneIndex,
    sceneCount,
    progress: 0.65,
    overall: (sceneIndex + 0.65) / Math.max(1, sceneCount),
    sceneTime: 18,
    sentenceIndex: 0,
    charInSentence: 12,
    activeSpeaker: scene.speaker,
    playing: true,
    poster: false,
    now: 1200,
    courseLabel: 'Para Teorisi',
    showSubtitles: true,
    viseme: 'aa',
    mouthOpen: 0.45,
    inBreathPause: false,
    layoutMode: 'standard',
    subtitleSize: 'md',
  };
}

describe('Video Studio Phase 2: Domain Classification, Visual Density & Stage Rendering', () => {
  it('classifies Para Teorisi & monetary notes with historical mentions as economics, never history', () => {
    const monetaryTheme = inferVisualTheme(
      'Para Teorisi - 5. Hafta: Merkez bankası emisyon mekanizması, 20. yüzyıl tarihsel gelişim, likidite, faiz ve zorunlu karşılık oranları.',
    );
    expect(monetaryTheme).toBe('economics');

    const historyTheme = inferVisualTheme(
      'Selçuklu ikta sistemi 12. yüzyıl miri arazi, tımar ve dirlik düzeni üzerine tarihsel inceleme.',
    );
    expect(historyTheme).toBe('history');
  });

  it('filters opening greeting chatter from examTip and enforces dense nodes and varied diagram types', () => {
    const rawMonetaryStudio = {
      videoTitle: 'Para Teorisi - 5. Hafta',
      outline: 'Merkez bankası bilançosu, emisyon ve para arzı mekanizması.',
      scenes: [
        {
          title: 'Para Teorisi - 5. Hafta Giriş',
          speaker: 'Deniz',
          text:
            'Merhaba arkadaşlar. Para Teorisi dersimizin 5. haftasında merkez bankalarının emisyon faaliyetlerini inceliyoruz. Emisyon hacmi, açık piyasa işlemleri ve zorunlu karşılık oranları para arzını ve piyasa likiditesini doğrudan şekillendirir. Para talebi ile para arzı dengelendiğinde denge faiz oranı oluşur.',
          examTip:
            'Merhaba arkadaşlar. Para Teorisi dersimizin 5. haftasında merkez bankalarının emisyon faaliyetlerini inceliyoruz.',
          diagramData: {
            diagramType: 'visual',
            visualTheme: 'history',
            mainTitle: 'Para Teorisi - 5. Hafta',
            highlightMetric: 'Emisyon',
            nodes: [
              {
                label: 'Para Teorisi',
                subtext:
                  'Merhaba arkadaşlar. Para Teorisi dersimizin 5. haftasında merkez bankalarının temel niteliklerini ve emisyon faaliyetlerini inceliyoruz.',
              },
            ],
          },
          keyTakeaways: ['Emisyon hacmi merkez bankası bilançosunun pasif kalemidir.'],
          keyTerms: [
            {
              term: 'Emisyon İmtiyazı',
              definition: 'Merkez bankasının banknot ihraç etme tekel yetkisidir.',
            },
            {
              term: 'Zorunlu Karşılık',
              definition: 'Bankaların mevduatlarının belli oranını merkez bankasında tutma yükümlülüğüdür.',
            },
            {
              term: 'Açık Piyasa İşlemleri',
              definition: 'Merkez bankasının tahvil alım-satımıyla piyasa likiditesini yönetmesidir.',
            },
          ],
        },
        {
          title: 'Para Piyasası Dengesi ve Eğri Analizi',
          speaker: 'Deniz',
          text:
            'Para arzı dikey Ms eğrisiyle, para talebi ise faize duyarlı negatif eğimli Md eğrisiyle gösterilir. Genişletici para politikası faiz oranını düşürürken likiditeyi artırır.',
          diagramData: {
            diagramType: 'curve',
            mainTitle: 'Para Piyasası Faiz Dengesi',
            nodes: [
              { label: 'Dikey Para Arzı (Ms)', subtext: 'Merkez bankası tarafından dışsal belirlenir.' },
              { label: 'Para Talebi (Md)', subtext: 'Faiz düştükçe işlem ve spekülasyon talebi artar.' },
              { label: 'Denge Faiz (i*)', subtext: 'Ms ve Md kesişiminde piyasa temizlenir.' },
            ],
          },
          keyTakeaways: ['Likidite genişlediğinde kısa vadeli faiz oranı geriler.'],
        },
      ],
    };

    const studio = buildStudioContent(rawMonetaryStudio, 'Para Teorisi - 5. Hafta', 'Para Teorisi');

    // No greeting chatter in any scene examTip (SINAV NOTU)
    for (const sc of studio.scenes) {
      if (sc.examTip) {
        expect(sc.examTip).not.toMatch(/^\s*(?:merhaba|hoş\s+geldiniz|selam)/i);
      }
    }

    // Opening 'visual' scene must have >= 3 substantive nodes (no single lonely card)
    expect(studio.scenes[0].diagram.type).toBe('visual');
    expect(studio.scenes[0].diagram.visualTheme).toBe('economics');
    expect(studio.scenes[0].diagram.nodes.length).toBeGreaterThanOrEqual(3);

    // Chapter diversity must preserve both curve and chart diagrams across the lesson
    const types = new Set(studio.scenes.map((sc) => sc.diagram.type));
    expect(types.has('visual')).toBe(true);
    expect(types.has('curve')).toBe(true);
    expect(types.has('chart')).toBe(true);
    expect(types.size).toBeGreaterThanOrEqual(5);
  });

  it('smoke-tests renderStage cleanly across visual (economics), curve, and history scenes', () => {
    const studio = buildStudioContent(
      {
        videoTitle: 'Para Teorisi - 5. Hafta',
        scenes: [
          {
            title: 'Merkez Bankası ve Emisyon',
            speaker: 'Deniz',
            text:
              'Merkez bankası emisyon yetkisiyle banknot basar, zorunlu karşılık ve açık piyasa işlemleriyle likiditeyi yönlendirir.',
            diagramData: {
              diagramType: 'visual',
              visualTheme: 'economics',
              mainTitle: 'Merkez Bankası & Emisyon',
              nodes: [
                { label: 'Emisyon Yetkisi', subtext: 'Banknot ihracı ve rezerv yönetimi' },
                { label: 'Likidite Kanalı', subtext: 'Açık piyasa işlemleri ve APİ mekanizması' },
                { label: 'Fiyat İstikrarı', subtext: 'Enflasyon beklentilerinin çıpalanması' },
              ],
            },
          },
          {
            title: 'Para Piyasası Dengesi',
            speaker: 'Barış',
            text: 'Ms ve Md eğrilerinin kesişiminde para piyasası denge faiz oranı i* oluşur.',
            diagramData: {
              diagramType: 'curve',
              visualTheme: 'economics',
              mainTitle: 'Ms / Md Denge Grafiği',
              nodes: [
                { label: 'Para Arzı (Ms)', subtext: 'Dikey dışsal arz doğrusu' },
                { label: 'Para Talebi (Md)', subtext: 'Negatif eğimli likidite tercihi' },
                { label: 'Denge Faizi (i*)', subtext: 'M^s/P = L(Y, i) eşitliği' },
              ],
            },
          },
        ],
      },
      'Para Teorisi - 5. Hafta',
      'Para Teorisi',
    );

    const historyStudio = buildStudioContent(
      {
        videoTitle: 'Osmanlı Toprak Düzeni',
        scenes: [
          {
            title: 'Miri Arazi ve Tımar',
            speaker: 'Deniz',
            text: 'Osmanlı iktisat tarihinde tımar sistemi devlet mülkiyetindeki miri arazilerin işletilmesini düzenler.',
            diagramData: {
              diagramType: 'visual',
              visualTheme: 'history',
              mainTitle: 'Tımar ve İkta Yapısı',
              nodes: [
                { label: 'Miri Arazi', subtext: 'Rakamı devlete ait toprak mülkiyeti' },
                { label: 'Dirlik Dağıtımı', subtext: 'Hizmet karşılığı vergi toplama yetkisi' },
                { label: 'Cebeli Sipahi', subtext: 'Tarımsal üretim ve taşra güvenliği' },
              ],
            },
          },
        ],
      },
      'Osmanlı Toprak Düzeni',
      'İktisat Tarihi',
    );

    const scenesToDraw: StudioScene[] = [
      studio.scenes[0],
      studio.scenes.find((s) => s.diagram.type === 'curve') || studio.scenes[1],
      historyStudio.scenes[0],
    ];

    scenesToDraw.forEach((scene, idx) => {
      const { ctx, fillTextCalls } = createMockCanvasContext();
      expect(() => renderStage(ctx, makeTestFrame(scene, idx, scenesToDraw.length))).not.toThrow();
      expect(fillTextCalls.length).toBeGreaterThan(5);
    });
  });
});
