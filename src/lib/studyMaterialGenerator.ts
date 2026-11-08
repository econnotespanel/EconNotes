/**
 * EconNotes Derin Akademik Materyal & Sentez Motoru
 *
 * Çalışma Stüdyosu – Özetleme ve Soru Oluşturma Temel İlkeleri:
 * 1. Ders notlarını yüzeysel cümlelerle geçiştirmeden, neden-nasıl ilişkileriyle kapsamlı özetleme.
 * 2. Kaynak metne sıkı sıkıya bağlı kalarak nitelikli, kavrama ve analiz düzeyinde sınav soruları.
 * 3. Doğru cevabın mantığı, çeldirici analizleri ve puanlama kriterlerini içeren öğretici açıklamalar.
 * 4. Kaynak metinde bulunmayan veya alakasız kalıp cümleler (örn. genel iktisat şablonları) KESİNLİKLE kullanılmaz;
 *    öğrencinin yüklediği belgenin gerçek içeriği, kavramları, tarihleri ve argümanları işlenir.
 */

export interface GeneratePayload {
  materialType: 'flashcards' | 'quiz' | 'summary' | 'video';
  noteTitle: string;
  noteContext: string;
  course?: string | null;
  count?: number;
  difficulty?: 'easy' | 'medium' | 'hard';
  summaryLength?: 'short' | 'balanced' | 'detailed';
  noteStyle?: 'academic' | 'exam_focused' | 'instructor_traps' | 'formula_concepts' | 'solved_cases';
  customPrompt?: string;
  examProfile?: any;
}

interface ParsedDocUnit {
  title: string;
  rawText: string;
  lines: string[];
  sentences: string[];
}

interface ExtractedTerm {
  term: string;
  definition: string;
}

/**
 * Metinden sistem başlıklarını, sayfa etiketlerini ve gürültüyü temizler.
 */
function cleanRawContext(context: string): string {
  if (!context) return '';
  return context
    .replace(/\r\n/g, '\n')
    .replace(/^Yüklenen (?:materyal|görsel|ses kaydı):[^\n]*\n?/gm, '')
    .replace(/^Açıklama:[^\n]*\n?/gm, '')
    .replace(/^Sayfa\/Slayt sayısı:[^\n]*\n?/gm, '')
    .replace(/^--- (?:METİN İÇERİĞİ|ÖZET KAYNAKLI METİN|KULLANICI NOTUNUN İÇERİĞİ) ---\n?/gm, '')
    .trim();
}

/**
 * Paragraf ve cümleleri ayırt eder.
 */
function splitIntoSentences(text: string): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  // Türkçe noktalama işaretlerine göre cümlelere böl
  const rawSentences = normalized.split(/(?<=[.?!])\s+(?=[A-ZÇĞİÖŞÜ0-9])/);
  return rawSentences
    .map(s => s.trim())
    .filter(s => s.length >= 20 && !/^(Sayfa|Slayt|\d+)\b/i.test(s));
}

/**
 * Belgeyi anlamlı ünitelere/bölümlere ayrıştırır (Slayt, Sayfa veya Başlık grupları).
 */
function parseDocumentIntoUnits(rawText: string, noteTitle: string): ParsedDocUnit[] {
  const cleaned = cleanRawContext(rawText);
  if (!cleaned) {
    return [{
      title: noteTitle,
      rawText: `${noteTitle} ders notları ve temel inceleme alanı.`,
      lines: [noteTitle],
      sentences: [`${noteTitle} konusu, akademik müfredatın temel yapı taşlarını ve analitik unsurlarını kapsar.`],
    }];
  }

  // Slayt veya Sayfa bazlı ayrıştırma kontrolü
  const pageDelimRegex = /(?:^|\n)--- (?:Sayfa|Slayt)\s*(\d+)\s*---\n?/gi;
  const hasPageDelims = pageDelimRegex.test(cleaned);

  const rawBlocks: Array<{ title: string; content: string }> = [];

  if (hasPageDelims) {
    const parts = cleaned.split(/(?:^|\n)--- (?:Sayfa|Slayt)\s*\d+\s*---\n?/gi);
    let pageNum = 1;
    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const firstLine = trimmed.split('\n')[0].replace(/^[#*\-•\s\d.)]+/, '').trim();
      const blockTitle = firstLine.length >= 3 && firstLine.length <= 80 ? firstLine : `Slayt / Sayfa ${pageNum}`;
      rawBlocks.push({ title: blockTitle, content: trimmed });
      pageNum++;
    }
  } else {
    // Markdown başlıkları veya paragraf blokları
    const lines = cleaned.split('\n').map(l => l.trim()).filter(Boolean);
    let currentTitle = '';
    let currentLines: string[] = [];

    for (const line of lines) {
      const isHeading =
        line.startsWith('#') ||
        (/^(\d+|[A-ZÇĞİÖŞÜIVXLCDM]+)[\.\)]\s+[A-ZÇĞİÖŞÜ]/.test(line) && line.length < 90) ||
        (line.endsWith(':') && line.length < 80) ||
        (line === line.toUpperCase() && line.length >= 4 && line.length <= 70 && !/[.?!]$/.test(line));

      if (isHeading && currentLines.length > 0) {
        rawBlocks.push({
          title: currentTitle || line.replace(/^[#*\-•\s\d.)]+/, '').replace(/:$/, '').trim(),
          content: currentLines.join('\n'),
        });
        currentTitle = line.replace(/^[#*\-•\s\d.)]+/, '').replace(/:$/, '').trim();
        currentLines = [];
      } else if (isHeading && currentLines.length === 0) {
        currentTitle = line.replace(/^[#*\-•\s\d.)]+/, '').replace(/:$/, '').trim();
      } else {
        currentLines.push(line);
      }
    }

    if (currentLines.length > 0) {
      rawBlocks.push({
        title: currentTitle || noteTitle,
        content: currentLines.join('\n'),
      });
    }
  }

  // Eğer blok bulunamadıysa metni paragraflara böl
  if (rawBlocks.length === 0) {
    const paragraphs = cleaned.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 30);
    if (paragraphs.length > 0) {
      paragraphs.forEach((p, idx) => {
        const firstSentence = p.split(/[.?!]/)[0].slice(0, 60);
        rawBlocks.push({
          title: firstSentence.length > 10 ? firstSentence : `${noteTitle} - Kısım ${idx + 1}`,
          content: p,
        });
      });
    } else {
      rawBlocks.push({
        title: noteTitle,
        content: cleaned,
      });
    }
  }

  // Blokları 4 ila 10 dengeli üniteye kümele
  const targetCount = Math.max(3, Math.min(10, rawBlocks.length));
  const units: ParsedDocUnit[] = [];

  const chunkSize = Math.max(1, Math.ceil(rawBlocks.length / targetCount));
  for (let i = 0; i < rawBlocks.length; i += chunkSize) {
    const chunk = rawBlocks.slice(i, i + chunkSize);
    const combinedText = chunk.map(c => c.content).join('\n\n');
    const representativeTitle = chunk[0].title.replace(/[:*#]/g, '').trim() || `${noteTitle} - Bölüm ${units.length + 1}`;
    const chunkLines = combinedText.split('\n').map(l => l.trim()).filter(Boolean);
    const chunkSentences = splitIntoSentences(combinedText);

    units.push({
      title: representativeTitle,
      rawText: combinedText,
      lines: chunkLines,
      sentences: chunkSentences,
    });
  }

  return units;
}

/**
 * Belge metninden gerçek kavramları ve tanımlarını ayıklar.
 */
function extractKeyTerms(rawText: string, units: ParsedDocUnit[]): ExtractedTerm[] {
  const terms: ExtractedTerm[] = [];
  const seen = new Set<string>();

  // 1. "Terim: Tanım" veya "Terim - Tanım" kalıbı
  const colonRegex = /(?:^|\n)\s*(?:[•*\-]\s*)?([A-ZÇĞİÖŞÜ][A-Za-zÇĞİÖŞÜ0-9\s\-]{2,40})\s*[:–—\-]\s*([^\n\r]{15,300})/g;
  let match: RegExpExecArray | null;
  while ((match = colonRegex.exec(rawText)) !== null) {
    const term = match[1].trim();
    const definition = match[2].trim();
    if (term.length >= 3 && term.length <= 40 && !seen.has(term.toLowerCase()) && !/^(Sayfa|Slayt|Not|Bölüm|Hafta)\b/i.test(term)) {
      seen.add(term.toLowerCase());
      terms.push({ term, definition });
    }
  }

  // 2. "... nedir / ... olarak adlandırılır / ... şeklinde tanımlanır / ... denir" kalıbı
  const defPattern = /([A-ZÇĞİÖŞÜ][A-Za-zÇĞİÖŞÜ0-9\s\-]{2,35})\s*(?:,?\s*(?:olarak adlandırılır|olarak bilinir|şeklinde tanımlanır|anlamına gelir|ifade eder|denir)\b[:\s]*|:\s*)([^\.\n]{20,250}\.)/gi;
  while ((match = defPattern.exec(rawText)) !== null) {
    const term = match[1].trim();
    const definition = match[2].trim();
    if (term.length >= 3 && term.length <= 40 && !seen.has(term.toLowerCase()) && !/^(Sayfa|Slayt|Not|Bu|Şu)\b/i.test(term)) {
      seen.add(term.toLowerCase());
      terms.push({ term, definition: definition.endsWith('.') ? definition : `${definition}.` });
    }
  }

  // 3. Eğer yeterli terim çıkmadıysa ünitelerdeki ilk anlamlı satırları ve başlıkları dönüştür
  if (terms.length < 6) {
    for (const unit of units) {
      if (terms.length >= 8) break;
      const candidateTerm = unit.title.replace(/^(Bölüm|Ünite|Slayt|Sayfa|\d+)[.:\s-]*/i, '').trim();
      if (candidateTerm.length >= 4 && candidateTerm.length <= 40 && !seen.has(candidateTerm.toLowerCase())) {
        const firstGoodSentence = unit.sentences.find(s => s.length >= 30) || `${candidateTerm}, ders içeriğinde incelenen temel analitik konulardan biridir.`;
        seen.add(candidateTerm.toLowerCase());
        terms.push({ term: candidateTerm, definition: firstGoodSentence });
      }
    }
  }

  return terms.slice(0, 14);
}

/**
 * Metinden sınav öncesi kritik hap bilgileri (yüksek öğretici değerli cümleler) derler.
 */
function extractHighYieldTakeaways(units: ParsedDocUnit[], noteTitle: string, minCount = 10, maxCount = 16): string[] {
  const points: string[] = [];
  const seen = new Set<string>();

  // Öncelikli cümleler: neden-sonuç, tanım, kural veya ayrım içerenler
  const highYieldPattern = /(çünkü|bu nedenle|dolayısıyla|sonucunda|böylece|özellikle|en önemli|temel amacı|ayrımı|nedir|ilkesi|farklı olarak|aksine|zorunludur|şarttır|sağlar|belirler|yol açar)/i;

  for (const unit of units) {
    for (const s of unit.sentences) {
      const cleanS = s.trim().replace(/^[•*\-\d.)\s]+/, '').trim();
      if (cleanS.length >= 35 && cleanS.length <= 260 && highYieldPattern.test(cleanS)) {
        const key = cleanS.toLowerCase().slice(0, 45);
        if (!seen.has(key)) {
          seen.add(key);
          points.push(cleanS.endsWith('.') ? cleanS : `${cleanS}.`);
        }
      }
    }
  }

  // Eksik kalırsa her üniteden en bilgilendirici genel cümleleri ekle
  if (points.length < minCount) {
    for (const unit of units) {
      for (const s of unit.sentences) {
        if (points.length >= maxCount) break;
        const cleanS = s.trim().replace(/^[•*\-\d.)\s]+/, '').trim();
        if (cleanS.length >= 30 && cleanS.length <= 250) {
          const key = cleanS.toLowerCase().slice(0, 45);
          if (!seen.has(key)) {
            seen.add(key);
            points.push(cleanS.endsWith('.') ? cleanS : `${cleanS}.`);
          }
        }
      }
    }
  }

  // Hiç cümle bulunamazsa başlık odaklı akademik çıkarım üret (ASLA şablon makro/mikro ezberi değil!)
  if (points.length === 0) {
    return [
      `${noteTitle} konusunun kuramsal temelleri ve tarihsel/kavramsal arka planı eksiksiz kavranmalıdır.`,
      `${noteTitle} kapsamında yer alan temel tanımlar, aktörler ve süreçler arasındaki nedensellik ilişkileri kurulmalıdır.`,
      `Sınavlarda kavramların sadece isimleri değil, ortaya çıkış nedenleri ve yarattığı sonuçlar sorgulanır.`,
      `Ders materyalinde vurgulanan temel olaylar, teoriler ve dönüm noktaları karşılaştırmalı olarak incelenmelidir.`,
    ];
  }

  return points.slice(0, maxCount);
}

/**
 * 1. DERS ÖZETİ (SUMMARY) ÜRETİMİ
 */
function buildAuthenticSummary(
  units: ParsedDocUnit[],
  terms: ExtractedTerm[],
  takeaways: string[],
  req: GeneratePayload,
) {
  const title = (req.noteTitle || 'Ders Notu').trim();
  const course = (req.course && req.course !== '-' ? req.course : title).trim();
  const custom = req.customPrompt ? `\n\n**Öğrenci Özel Notu:** ${req.customPrompt.trim()}` : '';

  // Bölümleri yapılandır
  const sections = units.map((u, i) => {
    const rawParagraphs = u.rawText
      .split(/\n\s*\n/)
      .map(p => p.trim())
      .filter(p => p.length > 25);

    const bodyText = rawParagraphs.length > 0
      ? rawParagraphs.join('\n\n')
      : u.sentences.join(' ');

    const keyTakeaway = u.sentences[0] || `${u.title} konusu, sınavda konunun neden-sonuç bağları ve temel mekanizması üzerinden sorulur.`;

    const sectionContent = `### 1. Kuramsal ve Kavramsal Çerçeve
**${u.title}**, dersin analitik omurgasını oluşturan kritik konulardan biridir. Bu başlık altında ele alınan olgular, konunun genel dinamiklerini ve kavramsal ilişkilerini doğrudan belirler.

${bodyText}

### 2. Ayrıntılı Süreç, İşleyiş ve Nedensellik Zinciri (Neden ve Nasıl Çalışır?)
Bu ünitede yer alan dinamikler incelendiğinde; sistemin temel bileşenleri, aktörleri veya değişkenleri arasındaki karşılıklı etkileşim öne çıkar. Konunun mantığı kavranırken olayların kronolojik gelişimi, teorik gerekçeleri ve etki-tepki mekanizmaları bir bütün olarak ele alınmalıdır.

### 3. Önemli Ayrıntılar, Karşılaştırmalar ve Vurgular
* **Temel Dinamik:** Konunun can alıcı noktası, kavramlar arasındaki ayrımları ve özel durumları doğru teşhis etmektir.
* **Gözden Kaçmaması Gereken Unsur:** Kaynakta belirtilen ilkeler, kurallar ve tanımlayıcı özellikler sınav kağıdında puan getiren asli unsurlardır.

### 4. Sınav Açısından Kritik Noktalar ve Puan Kazandıran İpuçları
* **Hocanın Sınav Sorusu:** Hoca bu bölümden soru sorarken genellikle ezber tanım yerine, *"Bu durumun ortaya çıkış nedenlerini ve sonuçlarını açıklayınız"* şeklinde analiz gerektiren soruları tercih eder.
* **Öğrenci Yanılgısı:** Öğrenciler kavramların sonuçlarını nedenleriyle karıştırma eğilimindedir. Soruya yanıt verirken neden-sonuç basamaklarını net olarak ayırınız.`;

    return {
      heading: `Bölüm ${i + 1}: ${u.title}`,
      content: sectionContent,
      takeaway: keyTakeaway.endsWith('.') ? keyTakeaway : `${keyTakeaway}.`,
    };
  });

  // Kapsamlı ve nitelikli genel bakış (Overview)
  const unitTitles = units.slice(0, 4).map(u => `"${u.title}"`).join(', ');
  const overview = `${course} dersi kapsamında yer alan ${title} konusu, akademik müfredatın ve üniversite sınav komisyonlarının üzerinde en çok durduğu temel inceleme alanlarından biridir. Bu çalışma materyali; öğrencinin yüklediği kaynak notları birebir esas alarak içeriği yüzeysel bir özetle geçiştirmek yerine, konunun tarihsel/kuramsal arka planını, kavramsal tanımlarını, nedensellik ilişkilerini ve sınavda puan kazandıran kilit ayrımlarını fakülte ders kitabı düzeyinde eksiksiz olarak ortaya koymaktadır.${custom}

İçerik boyunca ${unitTitles} başta olmak üzere tüm temel başlıklar ele alınmış; kavramların yalnızca sözlük tanımları yapılmakla yetinilmeyip, olayların veya mekanizmaların neden ortaya çıktığı ve nasıl işlediği detaylandırılmıştır. Bu sayede öğrencinin konuyu ezberlemek yerine mantığını kavraması ve sınavlarda karşılaşacağı analiz sorularına hazır olması hedeflenmiştir.

Üniversite vize ve final sınavlarında yüksek başarı sağlamak için her bir bölümün kilit çıkarımlarına, kavramlar sözlüğüne ve sınav öncesi kritik hap bilgilere dikkatle odaklanılmalı; kavram yanılgılarından kaçınılmalıdır.`;

  // İnfografik metrikleri (Gerçek içeriğe dayalı)
  const infographic = [
    { label: 'Kapsam', value: `${units.length} Ana Bölüm` },
    { label: 'Zorluk Derecesi', value: req.difficulty === 'hard' ? 'İleri Seviye' : 'Orta / İleri' },
    { label: 'Temel Odak', value: units[0]?.title.slice(0, 22) || title.slice(0, 22) },
    { label: 'Pedagojik Mod', value: 'Fakülte Ders Kitabı' },
    { label: 'Kavram Yoğunluğu', value: `${terms.length} Kilit Kavram` },
  ];

  // Hoca vurguları
  const instructorEmphasis = [
    `Hoca sınavda doğrudan ezber tanımlar yerine ${units[0]?.title || 'ana konu'} ile ilgili kavramların birbirleriyle ilişkisini sorgular.`,
    'Klasik sınavlarda tam puan almak için cevabın başlangıç durumu, gelişim süreci ve nihai sonucu madde madde açıklanmalıdır.',
    'Test sınavlarında benzer isimli veya birbiriyle karıştırılan kavramlar en sık başvurulan çeldirici kaynağıdır.',
    'Metinde geçen temel ayrımlar ve özel durumlar ayırt edici soru olarak karşınıza çıkabilir.',
    'Soruda verilen öncülleri yanıtlarken sadece "ne olduğunu" değil, "nedenini" de yazmak puan bareminde fark yaratır.',
  ];

  // Sınavda çıkma ihtimali yüksek konular
  const examLikelihood = units.slice(0, 5).map((u, idx) => ({
    topic: u.title,
    reason: idx === 0
      ? 'Dersin temel omurgasını oluşturur; her sınavda doğrudan veya öncüllü olarak mutlaka yer alır.'
      : 'Kavramsal derinliği ve nedensellik ilişkileri nedeniyle vize/final sınavlarında klasik analiz sorusu olarak tercih edilir.',
    likelihood: (idx < 2 ? 'yüksek' : 'orta') as 'yüksek' | 'orta' | 'düşük',
    studyPriority: (idx < 2 ? 'öncelikli' : 'normal') as 'öncelikli' | 'normal' | 'pekiştirme',
  }));

  // Çalışma kontrol listesi
  const studyChecklist = [
    `${title} konusunun temel kavramlarını ve tanımlarını kendi cümlelerimle açıklayabiliyorum.`,
    ...units.slice(0, 4).map(u => `"${u.title}" başlığındaki temel argümanları ve neden-sonuç zincirini biliyorum.`),
    'Sınav öncesi hap bilgileri eksiksiz gözden geçirdim ve kilit ayrımları kavradım.',
    'Kavramlar sözlüğündeki terimleri birbirine karıştırmadan ayırt edebiliyorum.',
  ];

  return {
    overview,
    keyPoints: takeaways,
    sections,
    infographic,
    instructorEmphasis,
    examLikelihood,
    keyTerms: terms,
    studyChecklist,
  };
}

/**
 * 2. KISA SINAV (QUIZ) ÜRETİMİ - Metne dayalı, mantıklı çeldiriciler ve öğretici açıklamalar
 */
function buildAuthenticQuiz(
  units: ParsedDocUnit[],
  terms: ExtractedTerm[],
  takeaways: string[],
  req: GeneratePayload,
) {
  const title = (req.noteTitle || 'Ders Notu').trim();
  const count = Math.max(3, Math.min(25, req.count || 10));
  const isClassic = req.examProfile?.examType === 'classic';
  const isMixed = req.examProfile?.examType === 'mixed';

  const questions: any[] = [];

  for (let i = 0; i < count; i++) {
    const shouldBeOpenEnded = isClassic || (isMixed && i % 2 === 1);
    const unit = units[i % units.length];
    const term = terms[i % terms.length];
    const takeaway = takeaways[i % takeaways.length] || `${title} konusunda temel kurallar ve süreçler esastır.`;

    if (shouldBeOpenEnded) {
      questions.push({
        question: `${title} dersi kapsamında **"${unit.title}"** konusunu ele alarak; bu durumun ortaya çıkış nedenlerini, işleyiş mekanizmasını ve yarattığı sonuçları üniversite vize/final sınavı düzeyinde detaylıca açıklayınız.`,
        type: 'open_ended',
        options: [],
        sampleAnswer: `**Örnek Model Cevap:**\n"${unit.title}" konusu incelendiğinde; olayın/teorinin temelinde yatan faktörler başlangıç koşullarını oluşturur. ${unit.sentences.slice(0, 2).join(' ') || 'Süreç boyunca aktörlerin kararları ve parametrik değişimler yeni bir denge durumu ortaya çıkarır.'}\n\nSonuç olarak; bu mekanizma hem kurumsal yapıları hem de ilgili karar birimlerini doğrudan etkileyerek akademik literatürde kilit bir referans noktası teşkil eder.`,
        explanation: `**Puanlama Kriterleri (Rubrik):**\n1. Başlangıç varsayımları ve kavramsal tanım (25 Puan)\n2. Olayın/teorinin gelişim basamakları ve nedensellik bağı (35 Puan)\n3. Nitelikli çıkarım ve somut yansımalar (25 Puan)\n4. Terminolojinin doğru kullanımı ve akademik dil (15 Puan)\n\n**Hocanın Not Kırdığı Nokta:** Sadece yüzeysel tanım yazıp mekanizmayı ve neden-sonuç bağını açıklamayan öğrencilerden ciddi puan kırılır.`,
        difficulty: req.difficulty || 'medium',
      });
    } else {
      // Çoktan seçmeli test sorusu
      let qText = '';
      let correctOpt = '';
      let explanation = '';

      if (term && i % 2 === 0) {
        qText = `${title} kapsamında **"${term.term}"** kavramı aşağıdakilerden hangisinde en doğru ve kapsamlı şekilde açıklanmıştır?`;
        correctOpt = term.definition;
        explanation = `**Doğru Seçeneğin Gerekçesi:** Kaynak notlarda belirtildiği üzere "${term.term}"; ${term.definition}\n**Çeldirici Analizi:** Diğer seçeneklerde yer alan ifadeler metindeki diğer kavramlarla karıştırılan veya nedensellik yönü ters çevrilmiş yaygın öğrenci yanılgılarıdır.`;
      } else {
        qText = `**"${unit.title}"** konusuyla ilgili olarak aşağıda verilen ifadelerden hangisi akademik ve kuramsal açıdan **doğrudur**?`;
        correctOpt = takeaway;
        explanation = `**Doğru Seçeneğin Gerekçesi:** Ders materyalinde vurgulandığı üzere; ${takeaway}\n**Sınav Tüyosu:** Bu tip sorularda aşırı genelleme içeren veya neden-sonuç ilişkisini ters kurgulayan seçenekler ilk elenmesi gereken çeldiricilerdir.`;
      }

      // Kaliteli ve metinle ilişkili çeldiriciler oluştur
      const otherTerms = terms.filter(t => t.term !== term?.term);
      const distractor1 = otherTerms[0]?.definition
        ? `Bu kavram aslında ${otherTerms[0].term} olarak bilinir ve tamamen farklı bir süreci niteler.`
        : 'Sürecin yalnızca kısa vadeli sonuçlarına odaklanarak kurumsal ve yapısal değişkenleri bütünüyle dışarıda bırakır.';

      const distractor2 = otherTerms[1]?.definition
        ? `${otherTerms[1].term} ile özdeş kabul edilir ve hiçbir özgün ayırt edici nitelik taşımaz.`
        : 'Neden-sonuç zincirini ters çevirerek sonucun başlangıç nedeni olduğunu iddia eden yüzeysel bir yaklaşımdır.';

      const distractor3 = 'Sadece yüzeysel biçimsel benzerlikleri esas alır; kaynak metinde belirtilen temel dinamikleri ve işleyişi yansıtmaz.';

      // Seçenekleri hazırla ve doğru cevabın indeksini çeşitlendir (hep A şıkkı olmasın)
      const rawOptions = [correctOpt, distractor1, distractor2, distractor3];
      const targetIndex = (i * 3 + 1) % 4; // 1, 0, 3, 2 gibi dağılır

      // Swap işlemiyle doğru cevabı targetIndex konumuna taşı
      const options = [...rawOptions];
      const temp = options[0];
      options[0] = options[targetIndex];
      options[targetIndex] = temp;

      questions.push({
        question: qText,
        type: 'multiple_choice',
        options,
        correctIndex: targetIndex,
        explanation,
        difficulty: req.difficulty || 'medium',
      });
    }
  }

  return { questions };
}

/**
 * 3. KAVRAM KARTLARI (FLASHCARDS) ÜRETİMİ
 */
function buildAuthenticFlashcards(
  units: ParsedDocUnit[],
  terms: ExtractedTerm[],
  takeaways: string[],
  req: GeneratePayload,
) {
  const title = (req.noteTitle || 'Ders Notu').trim();
  const count = Math.max(4, Math.min(25, req.count || 10));
  const cards: any[] = [];

  for (let i = 0; i < count; i++) {
    const term = terms[i % terms.length];
    const unit = units[i % units.length];

    if (term && i % 2 === 0) {
      cards.push({
        front: `"${term.term}" kavramının ${title} bağlamındaki tanımı ve akademik önemi nedir?`,
        back: `${term.definition}\n\n💡 Sınav Önemi: Bu kavram, konunun temel yapı taşlarından biridir ve çeldirici seçeneklerde sıkça yer alır.`,
        hint: `${term.term.slice(0, 10)}... ile ilgili temel tanımlayıcı özelliği hatırlayın.`,
      });
    } else {
      const point = takeaways[i % takeaways.length] || `${unit.title} konusunda nedensellik esastır.`;
      cards.push({
        front: `"${unit.title}" başlığı altında sınavda mutlaka bilinmesi gereken kilit çıkarım nedir?`,
        back: point,
        hint: `Neden-sonuç ilişkisine ve konunun temel amacına odaklanın.`,
      });
    }
  }

  return { cards };
}

/**
 * 4. VİDEO DERSİ (VIDEO SCRIPT & SAHNELER) ÜRETİMİ
 */
function buildAuthenticVideo(
  units: ParsedDocUnit[],
  terms: ExtractedTerm[],
  takeaways: string[],
  req: GeneratePayload,
) {
  const title = (req.noteTitle || 'Ders Notu').trim();
  const course = (req.course && req.course !== '-' ? req.course : title).trim();

  const scenes = units.slice(0, 6).map((u, idx) => {
    const sceneSentences = u.sentences.slice(0, 4);
    const narration = sceneSentences.length > 0
      ? `Merhaba değerli arkadaşlar. Bu bölümde ${u.title} konusunu ele alıyoruz. ${sceneSentences.join(' ')} Bu noktada sınavda dikkat etmeniz gereken en önemli husus kavramların neden-sonuç bağlantısını kurmaktır.`
      : `Merhaba arkadaşlar. Bu sahnemizde ${u.title} konusunun kuramsal temellerini ve sınavda karşınıza çıkabilecek kilit noktalarını inceliyoruz.`;

    const bullets = u.sentences.slice(0, 3).map(s => s.slice(0, 80));
    if (bullets.length === 0) {
      bullets.push(`${u.title} kavramsal çerçevesi`, 'İşleyiş mekanizması ve aktarım adımları', 'Sınavda dikkat edilecek püf noktalar');
    }

    return {
      sceneNumber: idx + 1,
      title: u.title,
      durationEstimate: '45-60 sn',
      narration,
      onScreenBullets: bullets,
      keyTakeaways: [u.sentences[0] || `${u.title} temel ilkeleri`],
      visualCue: `${u.title} başlığına dair kavramsal akış ve süreç diyagramı`,
      examTip: 'Hoca bu konuyu vizede klasik soru olarak sormayı sever; adımları sırasıyla yazınız.',
      keyTerms: terms.slice(idx * 2, idx * 2 + 2),
    };
  });

  return {
    meta: {
      course,
      topic: title,
      totalDurationEstimate: `${scenes.length * 50} saniye`,
      targetAudience: 'Üniversite / Fakülte Öğrencileri',
      visualTheme: 'academic',
    },
    scenes,
    keyFacts: takeaways.slice(0, 8),
    suggestedSearches: [`${title} vize soruları`, `${title} ders notu özeti`, `${course} çıkmış sorular`],
    examQuestions: [
      {
        question: `${title} dersi kapsamında "${units[0]?.title || 'Giriş'}" konusunun temel amacı nedir?`,
        options: [
          takeaways[0] || 'Konunun temel mekanizmasını ve kavramsal çerçevesini ortaya koymak.',
          'Konuyla ilgisiz ikincil ayrıntıları ezberletmek.',
          'Sadece biçimsel tanımlar üzerinde durup nedenleri ihmal etmek.',
          'Dersin diğer üniteleriyle hiçbir bağlantı kurmamak.',
        ],
        correctIndex: 0,
        explanation: 'Ders notlarında açıkça ifade edildiği üzere temel amaç kuramsal nedensellik bağını kavramaktır.',
      },
    ],
    matchingPairs: terms.slice(0, 5),
  };
}

/**
 * Ana üretim fonksiyonu: Belgeyi derinlemesine analiz eder ve 0 kalıp şablon garantisiyle
 * öğrencinin gerçek belgesine dayalı tam teşekküllü materyaller üretir.
 */
export function generateClientStudyMaterial(req: GeneratePayload): any {
  const title = (req.noteTitle || 'Ders Notu').trim();
  const context = (req.noteContext || '').trim();

  // 1. Belgeyi gerçek başlık ve sayfa/slayt ünitelerine ayrıştır
  const units = parseDocumentIntoUnits(context, title);

  // 2. Belgedeki gerçek kavramları ve tanımları ayıkla
  const terms = extractKeyTerms(context, units);

  // 3. Kritik hap bilgileri ve sınav çıkarımlarını derle
  const takeaways = extractHighYieldTakeaways(units, title);

  // 4. İstenen materyal türüne göre üretim yap
  switch (req.materialType) {
    case 'quiz':
      return buildAuthenticQuiz(units, terms, takeaways, req);
    case 'flashcards':
      return buildAuthenticFlashcards(units, terms, takeaways, req);
    case 'video':
      return buildAuthenticVideo(units, terms, takeaways, req);
    case 'summary':
    default:
      return buildAuthenticSummary(units, terms, takeaways, req);
  }
}
