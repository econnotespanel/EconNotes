import { supabase } from '@/integrations/supabase/client';
import {
  formatSectionContentForFallback,
  generateClientStudyMaterial,
  type GeneratePayload,
} from '@/lib/studyMaterialGenerator';
import {
  buildTopicPriorityGuide,
  classifyStudyDomain,
  extractFullDocumentOutline,
  isLargeStudyBundle,
  sampleUniformContext,
  sliceContextForSection,
  type AcademicDomainMode,
} from '@/lib/studySourceProcessor';
import type {
  CoachMode,
  OpenEndedGradeResult,
  ProcessedStudyBundle,
  StudyContentPayload,
  StudioGenerationSettings,
  StudyTopicPriorityItem,
  SummaryContent,
  SummarySection,
} from '@/types/study';

export interface OrchestrationResult {
  content: StudyContentPayload;
  model: string;
  sourceMode: 'ai' | 'fallback' | 'local';
}

export type ProgressCallback = (pct: number, label: string) => void;

const PUBLIC_REASONING_URL = 'https://text.pollinations.ai/openai';

function extractJsonLoose(raw: string): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    // continue
  }
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) {
    try {
      return JSON.parse(fence[1].trim()) as Record<string, unknown>;
    } catch {
      // continue
    }
  }
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first !== -1 && last > first) {
    try {
      return JSON.parse(trimmed.slice(first, last + 1)) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
}

async function ensureFreshSession() {
  try {
    const { data } = await supabase.auth.getSession();
    const expiresAt = data.session?.expires_at;
    if (expiresAt && expiresAt * 1000 - Date.now() < 60_000) {
      await supabase.auth.refreshSession().catch(() => {});
    }
  } catch {
    // Ignore in test environments
  }
}

async function invokeEdgeGenerate(body: Record<string, unknown>): Promise<{
  content: StudyContentPayload & Record<string, unknown>;
  model: string;
  sourceMode: 'ai' | 'fallback';
} | null> {
  try {
    await ensureFreshSession();
    const { data, error } = await supabase.functions.invoke('generate-study-material', {
      body,
    });
    if (error || !data || data.error || !data.content) {
      return null;
    }
    return {
      content: data.content as StudyContentPayload & Record<string, unknown>,
      model: String(data.model || 'EconNotes Deep Academic AI'),
      sourceMode: data.sourceMode === 'fallback' ? 'fallback' : 'ai',
    };
  } catch {
    return null;
  }
}

async function postPublicJsonAttempt(
  systemPrompt: string,
  userPrompt: string,
  useResponseFormat: boolean,
): Promise<Record<string, unknown> | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 38_000);
    const bodyPayload: Record<string, unknown> = {
      model: 'openai',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt.slice(0, 15_500) },
      ],
      temperature: 0.28,
    };
    if (useResponseFormat) {
      bodyPayload.response_format = { type: 'json_object' };
    }
    const res = await fetch(PUBLIC_REASONING_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyPayload),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const json = await res.json();
    const text = json?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) return null;
    return extractJsonLoose(text);
  } catch {
    return null;
  }
}

async function invokePublicJsonFallback(
  systemPrompt: string,
  userPrompt: string,
): Promise<Record<string, unknown> | null> {
  const first = await postPublicJsonAttempt(systemPrompt, userPrompt, true);
  if (first) return first;
  // Bazı genel uç noktalar response_format: json_object ile 400 döndürür; kısıtsız JSON istemiyle tekrar dene
  return postPublicJsonAttempt(
    `${systemPrompt}\n\nKRİTİK: Yalnızca ham JSON nesnesi ({...}) döndür, ek sohbet veya markdown açıklaması yazma.`,
    userPrompt,
    false,
  );
}

function averageSectionWords(sections: SummarySection[]): number {
  if (!sections.length) return 0;
  const totalWords = sections.reduce(
    (sum, s) => sum + String(s.content || '').trim().split(/\s+/).filter(Boolean).length,
    0,
  );
  return totalWords / sections.length;
}

function sectionsLackStructure(sections: SummarySection[]): boolean {
  if (!sections.length) return true;
  const structuredCount = sections.filter((s) => {
    const c = String(s.content || '');
    return /^#{2,4}\s+/m.test(c) && (/\n[-*]\s+/.test(c) || /\|[^|\n]+\|/.test(c));
  }).length;
  return structuredCount < Math.ceil(sections.length / 2);
}

function getDomainSummaryDirective(domainMode: AcademicDomainMode, examStyleHint?: string): string {
  const facultyHint = examStyleHint ? `\nFAKÜLTE / ALAN ODAĞI: ${examStyleHint}` : '';
  if (domainMode === 'verbal') {
    return `SÖZEL / KURAMSAL & SOSYAL BİLİMLER UZMANLIK STANDARDI:${facultyHint}
- Bu ders SÖZEL / KURAMSAL ağırlıklıdır (Siyaset Bilimi, Kamu Yönetimi, Uluslararası İlişkiler, Hukuk, Eğitim Bilimleri, Tarih, Sosyoloji, Psikoloji, Felsefe, Edebiyat veya Kuramsal Alanlar).
- KESİN KAYNAK SADAKATİ: Yalnızca yüklenen ders notundaki konulara odaklan; başka bölümlerden (ör. alakasız iktisat/tarih örnekleri) konu dışı bilgi ekleme.
- ASLA uydurma matematiksel formül veya yapay sembol EKLEME ($...$ / $$...$$ yalnız metinde gerçekten denklem varsa kullan).
- Her bölümde şu yüksek verimli akademik yapıyı kur:
  1. \`#### Kavramsal Öz ve Ana Tez\`: Kuramın/dönemin/konunun özünü, aktörlerini ve temel argümanını akıcı fakülte diliyle açıkla.
  2. \`#### Neden–Sonuç Zinciri ve Süreç / Mekanizma\`: Kavramsal gelişim, hukuki/siyasal/pedagojik koşul–sonuç akışını net madde veya numaralı adımlarla kur.
  3. \`#### Karşılaştırma ve Ayrım Tablosu\`: Ekoller, dönemler, görüşler veya karıştırılan kavram ikilileri arasında mutlaka net bir Markdown tablosu (\`| Ölçüt | ... | ... |\`) oluştur.
  4. \`#### Sınav & Yorum Sorusu Çerçevesi\`: Vize/finalde buradan nasıl soru çıkacağını ve tam puan cevabın hangi kavramlara dayanması gerektiğini belirt.`;
  }
  return `ANALİTİK / UYGULAMALI & FEN/SAĞLIK/MÜHENDİSLİK DERS STANDARDI:${facultyHint}
- KESİN KAYNAK SADAKATİ: Yalnızca yüklenen ders notunun gerçek terminolojisine ve içeriğine sadık kal; konu dışı alakasız bölüm örnekleri veya uydurma veriler ekleme.
- Her bölümde \`#### Analitik Çerçeve\`, sezgisel mantık + varsa metindeki formel LaTeX gösterimi (\`$...$\` veya \`$$...$$\`), somut uygulama/vaka örneği, net Markdown karşılaştırma tablosu (\`|...|...|\`) ve \`> **Sınav Odağı:**\` vurgusu sun.`;
}

function getExamModeDirective(examMode?: StudioGenerationSettings['examMode']): string {
  if (examMode === 'cram_24h') {
    return 'SINAV MODU — SON 24 SAAT ACİL KURTARMA: Sınavda çıkma olasılığı en yüksek çekirdek kavramları, kritik ayrımları, sık yapılan tuzakları ve hızlı hatırlama tablolarını öne çıkar. Gereksiz uzatmalardan kaçın.';
  }
  if (examMode === 'large_note') {
    return 'SINAV MODU — KALIN / ÇOKLU DERS NOTU TAM KAPSAM: Kullanıcının yüklediği kapsamlı/çok sayfalı notun başından sonuna TEK BİR ÜNİTEYİ BİLE ATLAMADAN tüm önemli detayları bölüm bölüm eksiksiz özetle ve mutlaka "studyPriorityMap" ile hangi konulara öncelik vermesi gerektiğini derecelendir.';
  }
  if (examMode === 'deep_mastery') {
    return 'SINAV MODU — DERİN KAVRAMA (FEYNMAN): Karmaşık kavramları adım adım sadeleştirip somut vaka örnekleriyle kalıcı öğrenme sağla.';
  }
  return 'SINAV MODU — VİZE/FİNAL TAM KAPSAM: Tüm önemli ayrıntıları sistematik biçimde özetle, sınavda çıkabilecek noktaları işaretle ve "studyPriorityMap" ile öncelikli çalışma sırası sun.';
}

function normalizePriorityMap(
  raw: unknown,
  sections: SummarySection[],
  keyTerms?: SummaryContent['keyTerms'],
  teacherEmphasis?: SummaryContent['teacherEmphasis'],
  overview?: string,
  disciplineTag?: string,
): StudyTopicPriorityItem[] {
  if (Array.isArray(raw) && raw.length >= 2) {
    const cleaned: StudyTopicPriorityItem[] = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      const topic = String(rec.topic || '').trim();
      if (!topic) continue;
      const rawPri = String(rec.priority || '').toLowerCase();
      const priority: StudyTopicPriorityItem['priority'] =
        rawPri === 'critical' || rawPri.includes('kritik') || rawPri.includes('yüksek')
          ? 'critical'
          : rawPri === 'review' || rawPri.includes('göz') || rawPri.includes('düşük')
          ? 'review'
          : 'important';
      const secIdx =
        typeof rec.sectionIndex === 'number' && rec.sectionIndex >= 0 && rec.sectionIndex < sections.length
          ? rec.sectionIndex
          : sections.findIndex((s) =>
              s.heading.toLocaleLowerCase('tr-TR').includes(topic.toLocaleLowerCase('tr-TR').slice(0, 14)),
            );
      cleaned.push({
        topic,
        priority,
        reason: String(rec.reason || 'Sınav kapsamı ve temel kavram bağlantısı nedeniyle önceliklidir.').trim(),
        estimatedMinutes: Math.max(3, Math.min(25, Number(rec.estimatedMinutes) || 8)),
        focusConcepts: Array.isArray(rec.focusConcepts)
          ? rec.focusConcepts.map(String).filter(Boolean).slice(0, 4)
          : [],
        likelyQuestionType: rec.likelyQuestionType ? String(rec.likelyQuestionType) : undefined,
        sectionIndex: secIdx >= 0 ? secIdx : undefined,
      });
    }
    if (cleaned.length >= 2) return cleaned;
  }
  return buildTopicPriorityGuide({
    sections,
    keyTerms,
    teacherEmphasis,
    overview,
    disciplineTag,
  });
}

function buildSectionExpansionSystemPrompt(
  settings: StudioGenerationSettings,
  domainMode: AcademicDomainMode = 'hybrid',
  examStyleHint?: string,
): string {
  const wordsTarget =
    settings.summaryDepth === 'short'
      ? '180-260'
      : settings.summaryDepth === 'textbook'
      ? '380-540'
      : settings.summaryDepth === 'comprehensive'
      ? '320-460'
      : '250-350';
  const domainDirective = getDomainSummaryDirective(domainMode, examStyleHint);
  const examDirective = getExamModeDirective(settings.examMode);
  return `Sen seçkin bir üniversite kürsü profesörüsün. Sana verilen ders bölümü taslağını ve kaynak metin kesitini kullanarak derin, akıcı, akademik ders kitabı düzeyinde Türkçe özet bölümleri yaz.
${domainDirective}
${examDirective}
${settings.deepResearch ? 'Derin Araştırma aktif: teorik arka plan, literatür bağlamı ve güncel uygulama örneğini "deepResearchNote" alanında sun.' : ''}
Kurallar:
- Her bölüm ${wordsTarget} kelime civarında eksiksiz Markdown prose olsun.
- Kopya/yüzeysel cümle dizimi, konu dışı bilgi veya genel şablon klişeler asla kullanma; kaynak metindeki kavramları sebep-sonuç zinciriyle, net başlıklar ve karşılaştırmalarla sentezle.
YALNIZCA JSON döndür:
{
  "sections": [
    {
      "index": 0,
      "heading": "Bölüm başlığı",
      "pageRange": "Varsa sayfa",
      "content": "Zengin Türkçe Markdown ders bölümü...",
      "takeaways": ["Net çıkarım 1", "Net çıkarım 2", "Net çıkarım 3"],
      "deepResearchNote": "Varsa ek akademik bağlam / vaka",
      "commonPitfalls": ["Sınavda en sık karıştırılan kavram veya tuzak"],
      "checkpointQuestion": { "question": "Soru?", "options": ["A","B","C","D"], "correctIndex": 0, "explanation": "Açıklama" }
    }
  ]
}`;
}

async function generatePublicMapReduceSummary(
  bundle: ProcessedStudyBundle,
  settings: StudioGenerationSettings,
  domainMode: AcademicDomainMode,
  examStyleHint: string,
  onProgress?: ProgressCallback,
): Promise<SummaryContent | null> {
  const largeBundle = isLargeStudyBundle(bundle) || settings.examMode === 'large_note';
  const targetCount =
    settings.summaryDepth === 'short'
      ? 4
      : settings.summaryDepth === 'textbook'
      ? largeBundle
        ? 11
        : 8
      : settings.summaryDepth === 'comprehensive'
      ? largeBundle
        ? 10
        : 7
      : largeBundle
      ? 8
      : 6;

  const fullOutlineAnchors = extractFullDocumentOutline(bundle.combinedText, 24);
  const outlineMapText =
    fullOutlineAnchors.length > 0
      ? `\nDOKÜMANIN TAM BAŞLIK HARİTASI (BAŞTAN SONA HİÇBİR ÜNİTEYİ ATLAMA):\n${fullOutlineAnchors
          .map((a, i) => `${i + 1}. ${a.heading}${a.pageHint ? ` (${a.pageHint})` : ''}`)
          .join('\n')}\n`
      : '';

  onProgress?.(
    32,
    largeBundle
      ? `Büyük ders notu (${bundle.totalWords} kelime) baştan sona taranıyor ve öncelik haritası kuruluyor...`
      : 'Akademik ders planı ve kavram mimarisi çıkarılıyor...',
  );
  const bpSystem = `Sen seçkin bir üniversite profesörüsün. Verilen ders materyalinin TAMAMINI (ilk sayfadan son sayfaya kadar hiçbir önemli konuyu atlamadan) tarayarak ${targetCount} ana bölümlük kapsamlı bir özet mimarisi ve "Hangi Konulara Bakmalıyım?" sınav öncelik haritası oluştur.
${getDomainSummaryDirective(domainMode, examStyleHint)}
${getExamModeDirective(settings.examMode)}
YALNIZCA JSON döndür:
{
  "overview": "Konunun amacını, temel tezini ve büyük resmini anlatan 2 güçlü paragraf",
  "disciplineTag": "${bundle.detectedDiscipline}",
  "keyPoints": ["6-10 kapsamlı anahtar çıkarım"],
  "sectionsPlan": [
    { "index": 0, "title": "Net akademik bölüm başlığı", "pageRange": "", "focusPoints": ["Odak 1", "Odak 2", "Odak 3"] }
  ],
  "studyPriorityMap": [
    {
      "topic": "Bölüm / Konu adı",
      "priority": "critical | important | review",
      "reason": "Sınavda neden mutlaka bakılması veya pekiştirilmesi gerektiği (1-2 net cümle)",
      "estimatedMinutes": 10,
      "focusConcepts": ["Anahtar kavram 1", "Anahtar kavram 2"],
      "likelyQuestionType": "Karşılaştırma / Tanım / Uygulama / Vaka",
      "sectionIndex": 0
    }
  ],
  "teacherEmphasis": [{ "point": "Kritik kavram veya ayrım", "whyImportant": "Sınavda neden sorulur ve nasıl cevaplanmalı", "examProbability": "Yüksek" }],
  "comparativeMatrix": { "title": "Karşılaştırma Tablosu", "columns": ["Boyut", "Yaklaşım / Kavram A", "Yaklaşım / Kavram B"], "rows": [["...", "...", "..."], ["...", "...", "..."]] },
  "deepResearchTopics": [{ "topic": "İleri Okuma Başlığı", "literatureContext": "Kuramsal / akademik bağlam", "realWorldApplication": "Güncel veya uygulamalı örnek" }],
  "keyTerms": [{ "term": "Terim", "definition": "Tam tanım", "formula": "" }],
  "studyChecklist": ["Öğrenme hedefi 1", "Öğrenme hedefi 2"]
}`;
  const bpUser = `DERS: ${bundle.course || bundle.detectedDiscipline}\nBAŞLIK: ${bundle.title}\nKAYNAK İSTATİSTİĞİ: ${bundle.sourceCount} kaynak, ~${bundle.totalWords} kelime, ~${bundle.totalPagesOrSlides} sayfa/slayt\n${
    settings.customPrompt ? `ÖZEL İSTEK: ${settings.customPrompt}\n` : ''
  }${outlineMapText}\nKAYNAK ÖZETİ:\n${sampleUniformContext(bundle.combinedText, 13_500)}`;

  const bp = await invokePublicJsonFallback(bpSystem, bpUser);
  const rawPlan = Array.isArray(bp?.sectionsPlan)
    ? (bp.sectionsPlan as Array<{ index?: number; title?: string; pageRange?: string; focusPoints?: string[] }>)
    : [];

  if (rawPlan.length === 0) {
    // Plan çıkarılamazsa kompakt tek seferlik bulut sentezini dene
    const singlePrompt = buildPublicSummaryPrompt(bundle, settings, domainMode);
    const singleJson = await invokePublicJsonFallback(singlePrompt.system, singlePrompt.user);
    if (singleJson && Array.isArray(singleJson.sections) && singleJson.sections.length > 0) {
      const singleSections = singleJson.sections as SummarySection[];
      return {
        ...(singleJson as unknown as SummaryContent),
        disciplineTag: String(singleJson.disciplineTag || bundle.detectedDiscipline),
        studyPriorityMap: normalizePriorityMap(
          singleJson.studyPriorityMap,
          singleSections,
          singleJson.keyTerms as SummaryContent['keyTerms'],
          singleJson.teacherEmphasis as SummaryContent['teacherEmphasis'],
          String(singleJson.overview || ''),
          String(singleJson.disciplineTag || bundle.detectedDiscipline),
        ),
        metadata: {
          sourceMode: 'ai',
          deepResearch: settings.deepResearch,
          summaryDepth: settings.summaryDepth,
          examMode: settings.examMode,
          faculty: settings.faculty,
          isLargeBundle: largeBundle,
          sourceStats: {
            sourceCount: bundle.sourceCount,
            wordCount: bundle.totalWords,
            pagesOrSlides: bundle.totalPagesOrSlides,
            sectionCount: singleSections.length,
          },
        },
      };
    }
    return null;
  }

  const normalizedPlan = rawPlan.map((p, idx) => ({
    index: typeof p.index === 'number' ? p.index : idx,
    title: String(p.title || `Bölüm ${idx + 1}`),
    pageRange: p.pageRange ? String(p.pageRange) : undefined,
    focusPoints: Array.isArray(p.focusPoints) ? p.focusPoints.map(String) : [],
  }));

  const expandSys = buildSectionExpansionSystemPrompt(settings, domainMode, examStyleHint);
  const expandedSections: SummarySection[] = [];
  const batchSize = 2;

  for (let i = 0; i < normalizedPlan.length; i += batchSize) {
    const batch = normalizedPlan.slice(i, i + batchSize);
    const pct = Math.min(92, Math.round(45 + ((i + batch.length) / Math.max(1, normalizedPlan.length)) * 45));
    onProgress?.(pct, `Ders bölümleri ayrıntılarıyla yazılıyor (${i + 1}-${Math.min(i + batchSize, normalizedPlan.length)}/${normalizedPlan.length})...`);

    const batchPayload = batch.map((b) => ({
      index: b.index,
      heading: b.title,
      focusPoints: b.focusPoints,
      sourceExcerpt: sliceContextForSection(
        bundle.combinedText,
        b.title,
        b.index,
        normalizedPlan.length,
        b.focusPoints,
        largeBundle ? 5_200 : 4_200,
      ),
    }));

    const batchUser = `DERS: ${bundle.course || bundle.detectedDiscipline} | BAŞLIK: ${bundle.title}\nGENEL ÖZET: ${String(
      bp?.overview || '',
    )}\nBÖLÜMLER:\n${JSON.stringify(batchPayload)}`;
    const expandedJson = await invokePublicJsonFallback(expandSys, batchUser);
    const gotSections = Array.isArray(expandedJson?.sections)
      ? (expandedJson.sections as SummarySection[])
      : [];

    batch.forEach((b, bi) => {
      const matched = gotSections.find((s) => s.index === b.index) || gotSections[bi];
      if (matched && String(matched.content || '').trim().length > 60) {
        expandedSections.push({
          ...matched,
          index: b.index,
          heading: matched.heading || b.title,
          pageRange: matched.pageRange || b.pageRange,
        });
      } else {
        // Asla ham metin parçası basma — yapısal sözel/sayısal biçimlendirici ile düzenle
        expandedSections.push(
          formatSectionContentForFallback({
            index: b.index,
            heading: b.title,
            pageRange: b.pageRange,
            rawSlice: batchPayload[bi].sourceExcerpt,
            focusPoints: b.focusPoints,
            course: bundle.course || bundle.detectedDiscipline,
            title: bundle.title,
            deepResearch: settings.deepResearch,
          }),
        );
      }
    });
  }

  expandedSections.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const finalKeyTerms = Array.isArray(bp?.keyTerms) ? (bp.keyTerms as SummaryContent['keyTerms']) : [];
  const finalEmphasis = Array.isArray(bp?.teacherEmphasis) ? (bp.teacherEmphasis as SummaryContent['teacherEmphasis']) : [];
  const finalOverview = String(bp?.overview || `${bundle.title} çalışma özeti`);
  const finalDiscipline = String(bp?.disciplineTag || bundle.detectedDiscipline);

  return {
    overview: finalOverview,
    disciplineTag: finalDiscipline,
    keyPoints: Array.isArray(bp?.keyPoints) ? bp.keyPoints.map(String) : [],
    sections: expandedSections,
    teacherEmphasis: finalEmphasis,
    comparativeMatrix: bp?.comparativeMatrix as SummaryContent['comparativeMatrix'],
    deepResearchTopics: Array.isArray(bp?.deepResearchTopics)
      ? (bp.deepResearchTopics as SummaryContent['deepResearchTopics'])
      : [],
    keyTerms: finalKeyTerms,
    studyChecklist: Array.isArray(bp?.studyChecklist) ? bp.studyChecklist.map(String) : [],
    studyPriorityMap: normalizePriorityMap(
      bp?.studyPriorityMap,
      expandedSections,
      finalKeyTerms,
      finalEmphasis,
      finalOverview,
      finalDiscipline,
    ),
    metadata: {
      sourceMode: 'ai',
      deepResearch: settings.deepResearch,
      summaryDepth: settings.summaryDepth,
      examMode: settings.examMode,
      faculty: settings.faculty,
      isLargeBundle: largeBundle,
      sourceStats: {
        sourceCount: bundle.sourceCount,
        wordCount: bundle.totalWords,
        pagesOrSlides: bundle.totalPagesOrSlides,
        sectionCount: expandedSections.length,
      },
    },
  };
}

function buildPublicSummaryPrompt(
  bundle: ProcessedStudyBundle,
  settings: StudioGenerationSettings,
  domainMode: AcademicDomainMode = 'hybrid',
): { system: string; user: string } {
  const depthHint =
    settings.summaryDepth === 'short'
      ? '4 bölüm, bölüm başına 190-260 kelime'
      : settings.summaryDepth === 'textbook'
      ? '6-8 bölüm, bölüm başına 300-450 kelime, çok derin ders kitabı düzeyi'
      : '5-7 bölüm, bölüm başına 260-380 kelime, kapsamlı fakülte düzeyi';

  const domainDirective = getDomainSummaryDirective(domainMode);

  const system = `Sen seçkin bir üniversite kürsü profesörüsün. Verilen notlardan kapsamlı, sıfır şablon cümleli ve mükemmel yapılandırılmış Türkçe Çalışma Özeti üret.
${domainDirective}
${
  settings.deepResearch
    ? 'Derin Araştırma aktif: teorik arka plan, literatür bağlamı ve Türkiye/dünya vaka örneklerini [Derin Akademik Araştırma] etiketiyle ekle.'
    : ''
}
Hedef uzunluk: ${depthHint}.
YALNIZCA geçerli JSON döndür:
{
  "overview": "2 paragraf yönetici özeti",
  "keyPoints": ["6-8 madde"],
  "sections": [{
    "heading": "Bölüm başlığı",
    "content": "Zengin Markdown + alt başlıklar + karşılaştırma tablosu + örnek metni",
    "takeaways": ["3 çıkarım"],
    "deepResearchNote": "Varsa derin akademik araştırma notu",
    "commonPitfalls": ["Sık karıştırılan kavram / sınav tuzağı"],
    "checkpointQuestion": { "question": "...", "options": ["A","B","C","D"], "correctIndex": 0, "explanation": "..." }
  }],
  "teacherEmphasis": [{ "point": "...", "whyImportant": "...", "examProbability": "Yüksek" }],
  "comparativeMatrix": { "title": "...", "columns": ["Boyut","Yaklaşım A","Yaklaşım B"], "rows": [["...","...","..."]] },
  "deepResearchTopics": [{ "topic": "...", "literatureContext": "...", "realWorldApplication": "..." }],
  "keyTerms": [{ "term": "...", "definition": "...", "formula": "" }],
  "studyChecklist": ["Kendini değerlendirme maddesi"]
}`;

  const user = `DERS: ${bundle.course || bundle.detectedDiscipline}\nBAŞLIK: ${bundle.title}\n${
    settings.customPrompt ? `ÖZEL İSTEK: ${settings.customPrompt}\n` : ''
  }\nKAYNAK METİN:\n${sampleUniformContext(bundle.combinedText, 14_000)}`;

  return { system, user };
}

async function enrichThinAiSections(
  rawSummary: SummaryContent,
  bundle: ProcessedStudyBundle,
  settings: StudioGenerationSettings,
  domainMode: AcademicDomainMode,
  onProgress?: ProgressCallback,
): Promise<SummaryContent> {
  const existing = Array.isArray(rawSummary.sections) ? rawSummary.sections : [];
  if (existing.length === 0) return rawSummary;

  const avgWords = averageSectionWords(existing);
  const needsDeepening =
    (settings.summaryDepth !== 'short' && (avgWords < 175 || sectionsLackStructure(existing))) ||
    (settings.deepResearch && !existing.some((s) => Boolean(s.deepResearchNote)));

  if (!needsDeepening || bundle.images.length > 0) {
    return rawSummary;
  }

  onProgress?.(68, 'Yapay zekâ özet bölümleri fakülte ders kitabı düzeyine derinleştiriliyor...');
  const expandSys = buildSectionExpansionSystemPrompt(settings, domainMode);
  const enriched: SummarySection[] = [];
  const batchSize = 2;

  for (let i = 0; i < existing.length; i += batchSize) {
    const batch = existing.slice(i, i + batchSize);
    const batchPayload = batch.map((sec, bi) => ({
      index: i + bi,
      heading: sec.heading,
      existingDraft: sec.content,
      sourceExcerpt: sliceContextForSection(bundle.combinedText, sec.heading, i + bi, existing.length, sec.takeaways || [], 3_800),
    }));
    const res = await invokePublicJsonFallback(
      expandSys,
      `DERS: ${bundle.course || bundle.detectedDiscipline} | BAŞLIK: ${bundle.title}\nMEVCUT BÖLÜMLERİ GENİŞLET:\n${JSON.stringify(
        batchPayload,
      )}`,
    );
    const expanded = Array.isArray(res?.sections) ? (res.sections as SummarySection[]) : [];
    batch.forEach((orig, bi) => {
      const match = expanded.find((s) => s.index === i + bi) || expanded[bi];
      if (match && String(match.content || '').length > String(orig.content || '').length) {
        enriched.push({
          ...orig,
          ...match,
          index: i + bi,
          heading: match.heading || orig.heading,
        });
      } else {
        enriched.push({ ...orig, index: i + bi });
      }
    });
  }

  return {
    ...rawSummary,
    sections: enriched,
  };
}

async function generateSummaryMapReduce(
  bundle: ProcessedStudyBundle,
  settings: StudioGenerationSettings,
  onProgress?: ProgressCallback,
): Promise<OrchestrationResult> {
  const largeBundle = isLargeStudyBundle(bundle) || settings.examMode === 'large_note';
  onProgress?.(
    12,
    largeBundle
      ? `1/3 • Kapsamlı ders notu (~${bundle.totalWords} kelime) baştan sona taranıyor...`
      : '1/3 • Kaynak mimarisi ve ders haritası çıkarılıyor...',
  );
  const domain = classifyStudyDomain(bundle.combinedText, bundle.course, bundle.title, settings.faculty);
  const fullOutlineHint = extractFullDocumentOutline(bundle.combinedText, 24).map(
    (a) => `${a.heading}${a.pageHint ? ` (${a.pageHint})` : ''}`,
  );

  const commonReq = {
    noteTitle: bundle.title,
    course: bundle.course || domain.discipline,
    faculty: settings.faculty && settings.faculty !== 'auto' ? domain.discipline : undefined,
    examMode: settings.examMode || undefined,
    fullOutlineHint: fullOutlineHint.length > 0 ? fullOutlineHint : undefined,
    summaryDepth: settings.summaryDepth,
    deepResearch: settings.deepResearch,
    pedagogicalStyle: settings.pedagogicalStyle,
    customPrompt: settings.customPrompt || undefined,
    examFocus: settings.examFocus || undefined,
  };

  // Use single pass ONLY when short depth AND compact text (< 300 words) AND not deep research
  if (settings.summaryDepth === 'short' && bundle.totalWords < 300 && !settings.deepResearch) {
    const singleEdge = await invokeEdgeGenerate({
      ...commonReq,
      materialType: 'summary',
      stage: 'single',
      noteContext: bundle.combinedText,
      images: bundle.images.length > 0 ? bundle.images : undefined,
      audio: bundle.audio,
    });
    if (singleEdge && singleEdge.sourceMode === 'ai') {
      const secs = (singleEdge.content?.sections || []) as SummarySection[];
      return {
        content: {
          ...singleEdge.content,
          disciplineTag: singleEdge.content?.disciplineTag || domain.discipline,
          studyPriorityMap: normalizePriorityMap(
            singleEdge.content?.studyPriorityMap,
            secs,
            singleEdge.content?.keyTerms,
            singleEdge.content?.teacherEmphasis,
            singleEdge.content?.overview,
            singleEdge.content?.disciplineTag || domain.discipline,
          ),
          metadata: {
            sourceMode: 'ai',
            deepResearch: settings.deepResearch,
            summaryDepth: settings.summaryDepth,
            examMode: settings.examMode,
            faculty: settings.faculty,
            isLargeBundle: largeBundle,
            sourceStats: {
              sourceCount: bundle.sourceCount,
              wordCount: bundle.totalWords,
              pagesOrSlides: bundle.totalPagesOrSlides,
              sectionCount: secs.length,
            },
          },
        },
        model: singleEdge.model,
        sourceMode: 'ai',
      };
    }
  }

  // Stage 1: Blueprint
  const blueprintRes = await invokeEdgeGenerate({
    ...commonReq,
    materialType: 'summary',
    stage: 'blueprint',
    noteContext: sampleUniformContext(bundle.combinedText, 68_000),
    images: bundle.images.length > 0 ? bundle.images : undefined,
    audio: bundle.audio,
  });

  if (blueprintRes && blueprintRes.sourceMode === 'ai' && Array.isArray(blueprintRes.content?.sectionsPlan)) {
    const blueprint = blueprintRes.content;
    const plan: Array<{
      index: number;
      title: string;
      pageRange?: string;
      focusPoints?: string[];
      keyConcepts?: string[];
    }> = blueprint.sectionsPlan;

    const batchSize = 3;
    const batches: typeof plan[] = [];
    for (let i = 0; i < plan.length; i += batchSize) {
      batches.push(plan.slice(i, i + batchSize));
    }

    const expandedSections: SummarySection[] = [];
    let allBatchesAi = true;

    for (let bIdx = 0; bIdx < batches.length; bIdx++) {
      const batch = batches[bIdx];
      const pct = Math.min(92, Math.round(35 + ((bIdx + 1) / Math.max(1, batches.length)) * 55));
      const rangeLabel = `${batch[0].index + 1}-${batch[batch.length - 1].index + 1}/${plan.length}`;
      onProgress?.(pct, `2/3 • Bölümler derinlemesine yazılıyor (${rangeLabel})...`);

      const sectionTargets = batch.map((item) => ({
        ...item,
        contextSlice: sliceContextForSection(
          bundle.combinedText,
          item.title,
          item.index,
          plan.length,
          item.focusPoints || [],
        ),
      }));

      const batchRes = await invokeEdgeGenerate({
        ...commonReq,
        materialType: 'summary',
        stage: 'expand_batch',
        noteContext: sampleUniformContext(bundle.combinedText, 32_000),
        globalOutline: {
          overview: blueprint.overview,
          keyPoints: blueprint.keyPoints,
          courseTitle: bundle.course || domain.discipline,
        },
        sectionTargets,
      });

      if (batchRes?.sourceMode === 'ai' && batchRes.content?.sections && Array.isArray(batchRes.content.sections)) {
        for (const sec of batchRes.content.sections) {
          expandedSections.push(sec);
        }
      } else {
        // Edge expand_batch başarısız olduysa veya yerel fallback döndürdüyse Tier-2 AI ile bölümü derinleştir
        const pubBatch = await invokePublicJsonFallback(
          buildSectionExpansionSystemPrompt(settings, domain.mode, domain.examStyleHint),
          `DERS: ${bundle.course || domain.discipline}\nBÖLÜMLER:\n${JSON.stringify(sectionTargets)}`,
        );
        if (Array.isArray(pubBatch?.sections) && pubBatch.sections.length > 0) {
          for (const sec of pubBatch.sections as SummarySection[]) {
            expandedSections.push(sec);
          }
        } else {
          allBatchesAi = false;
          for (const target of sectionTargets) {
            expandedSections.push(
              formatSectionContentForFallback({
                index: target.index,
                heading: target.title,
                pageRange: target.pageRange,
                rawSlice: target.contextSlice || '',
                focusPoints: target.focusPoints || [],
                course: bundle.course || domain.discipline,
                title: bundle.title,
                deepResearch: settings.deepResearch,
              }),
            );
          }
        }
      }
    }

    expandedSections.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

    onProgress?.(96, '3/3 • Sınav öncelik haritası, karşılaştırma matrisi ve kontrol listesi birleştiriliyor...');
    const finalSummary: SummaryContent = {
      overview: blueprint.overview,
      disciplineTag: blueprint.disciplineTag || domain.discipline,
      keyPoints: blueprint.keyPoints || [],
      sections: expandedSections,
      teacherEmphasis: blueprint.teacherEmphasis || [],
      comparativeMatrix: blueprint.comparativeMatrix,
      deepResearchTopics: blueprint.deepResearchTopics || [],
      keyTerms: blueprint.keyTerms || [],
      studyChecklist: blueprint.studyChecklist || [],
      studyPriorityMap: normalizePriorityMap(
        blueprint.studyPriorityMap,
        expandedSections,
        blueprint.keyTerms,
        blueprint.teacherEmphasis,
        blueprint.overview,
        blueprint.disciplineTag || domain.discipline,
      ),
      metadata: {
        sourceMode: allBatchesAi ? 'ai' : 'fallback',
        deepResearch: settings.deepResearch,
        summaryDepth: settings.summaryDepth,
        examMode: settings.examMode,
        faculty: settings.faculty,
        isLargeBundle: largeBundle,
        sourceStats: {
          sourceCount: bundle.sourceCount,
          wordCount: bundle.totalWords,
          pagesOrSlides: bundle.totalPagesOrSlides,
          sectionCount: expandedSections.length,
        },
      },
    };

    return {
      content: finalSummary,
      model: blueprintRes.model,
      sourceMode: allBatchesAi ? 'ai' : 'fallback',
    };
  }

  // Eski/tek-atışlı Supabase Edge sürümü sectionsPlan yerine doğrudan sections döndürdüyse kurtar ve derinleştir!
  if (
    blueprintRes &&
    blueprintRes.sourceMode === 'ai' &&
    Array.isArray(blueprintRes.content?.sections) &&
    blueprintRes.content.sections.length > 0
  ) {
    const deepened = await enrichThinAiSections(
      blueprintRes.content as unknown as SummaryContent,
      bundle,
      settings,
      domain.mode,
      onProgress,
    );
    return {
      content: {
        ...deepened,
        disciplineTag: deepened.disciplineTag || domain.discipline,
        studyPriorityMap: normalizePriorityMap(
          deepened.studyPriorityMap,
          deepened.sections || [],
          deepened.keyTerms,
          deepened.teacherEmphasis,
          deepened.overview,
          deepened.disciplineTag || domain.discipline,
        ),
        metadata: {
          sourceMode: 'ai',
          deepResearch: settings.deepResearch,
          summaryDepth: settings.summaryDepth,
          examMode: settings.examMode,
          faculty: settings.faculty,
          isLargeBundle: largeBundle,
          sourceStats: {
            sourceCount: bundle.sourceCount,
            wordCount: bundle.totalWords,
            pagesOrSlides: bundle.totalPagesOrSlides,
            sectionCount: deepened.sections?.length || 0,
          },
        },
      },
      model: blueprintRes.model,
      sourceMode: 'ai',
    };
  }

  // Tier-2 Client Public AI Map-Reduce Synthesis (Blueprint + Batched Expansion)
  if (bundle.images.length === 0 && bundle.combinedText.trim().length >= 30) {
    const pubSummary = await generatePublicMapReduceSummary(
      bundle,
      settings,
      domain.mode,
      domain.examStyleHint,
      onProgress,
    );
    if (pubSummary && pubSummary.sections.length > 0) {
      return {
        content: pubSummary,
        model: 'EconNotes Cloud Academic AI',
        sourceMode: 'ai',
      };
    }
  }

  // Tier-3 Local Deterministic Structured Parser (guarantees zero crash + zero foreign boilerplate)
  onProgress?.(90, 'Yerel yapısal ders ayrıştırıcı ile özet ve öncelik haritası hazırlanıyor...');
  const local = generateClientStudyMaterial({
    materialType: 'summary',
    noteTitle: bundle.title,
    course: bundle.course || domain.discipline,
    noteContext: bundle.combinedText,
    summaryDepth: settings.summaryDepth,
    deepResearch: settings.deepResearch,
    pedagogicalStyle: settings.pedagogicalStyle,
    customPrompt: settings.customPrompt,
  });
  const localSections = Array.isArray(local.sections) ? (local.sections as SummarySection[]) : [];
  return {
    content: {
      ...local,
      disciplineTag: domain.discipline,
      studyPriorityMap: normalizePriorityMap(
        local.studyPriorityMap,
        localSections,
        local.keyTerms as SummaryContent['keyTerms'],
        local.teacherEmphasis as SummaryContent['teacherEmphasis'],
        String(local.overview || ''),
        domain.discipline,
      ),
      metadata: {
        sourceMode: 'local',
        deepResearch: settings.deepResearch,
        summaryDepth: settings.summaryDepth,
        examMode: settings.examMode,
        faculty: settings.faculty,
        isLargeBundle: largeBundle,
        sourceStats: {
          sourceCount: bundle.sourceCount,
          wordCount: bundle.totalWords,
          pagesOrSlides: bundle.totalPagesOrSlides,
          sectionCount: localSections.length,
        },
      },
    },
    model: 'EconNotes Yerel Yapısal Ayrıştırıcı',
    sourceMode: 'local',
  };
}

export async function generateMaterialWithOrchestration(
  bundle: ProcessedStudyBundle,
  settings: StudioGenerationSettings,
  onProgress?: ProgressCallback,
): Promise<OrchestrationResult> {
  if (settings.materialType === 'summary') {
    return generateSummaryMapReduce(bundle, settings, onProgress);
  }

  onProgress?.(
    25,
    settings.materialType === 'quiz'
      ? 'Soru bankası ve rubrikler oluşturuluyor...'
      : settings.materialType === 'flashcards'
      ? 'Aktif hatırlama kartları sentezleniyor...'
      : 'İnteraktif video ders sahneleri ve görsel diyagramlar hazırlanıyor...',
  );

  const domain = classifyStudyDomain(bundle.combinedText, bundle.course, bundle.title, settings.faculty);
  const edgeRes = await invokeEdgeGenerate({
    materialType: settings.materialType,
    stage: 'single',
    noteTitle: bundle.title,
    course: bundle.course || domain.discipline,
    faculty: settings.faculty && settings.faculty !== 'auto' ? domain.discipline : undefined,
    examMode: settings.examMode || undefined,
    noteContext: sampleUniformContext(bundle.combinedText, 68_000),
    questionCount: settings.questionCount,
    cardCount: settings.cardCount,
    difficulty: settings.difficulty,
    quizFormat: settings.quizFormat,
    deepResearch: settings.deepResearch,
    pedagogicalStyle: settings.pedagogicalStyle,
    customPrompt: settings.customPrompt || undefined,
    examFocus: settings.examFocus || undefined,
    images: bundle.images.length > 0 ? bundle.images : undefined,
    audio: bundle.audio,
  });

  if (edgeRes && edgeRes.sourceMode === 'ai') {
    onProgress?.(95, 'Materyal hazırlandı.');
    return {
      content: {
        ...edgeRes.content,
        metadata: {
          sourceMode: 'ai',
          deepResearch: settings.deepResearch,
        },
      },
      model: edgeRes.model,
      sourceMode: 'ai',
    };
  }

  // Tier-2 Public Cloud AI fallback (quiz / flashcards / interactive video!)
  if (bundle.images.length === 0 && bundle.combinedText.trim().length >= 30) {
    onProgress?.(60, 'Alternatif bulut zekâ üzerinden zenginleştirilerek üretiliyor...');
    if (settings.materialType === 'video') {
      const domain = classifyStudyDomain(bundle.combinedText, bundle.course, bundle.title, settings.faculty);
      const videoSys = `Sen tüm üniversite fakülteleri (Tıp, Mühendislik, İktisat, Siyaset Bilimi ve Kamu Yönetimi, Uluslararası İlişkiler, Eğitim, Fen-Edebiyat, Sağlık Bilimleri, İşletme, Spor Bilimleri, Ziraat, Hukuk) için ders notlarını yüksek okunabilirlikli, tamamen konuya sadık videolu anlatıma dönüştüren akademik senaristsin.
Verilen ders notlarından 5-7 sahneli, Dr. Deniz (anlatıcı) ve Barış (soru soran öğrenci) arasında geçen, net ve anlaşılır Türkçe Video Ders JSON'u üret.
KESİN KURALLAR:
1. KONU DIŞI BİLGİ YASAĞI: YALNIZCA yüklenen ders notundaki gerçek kavram, süreç, formül ve örnekleri anlat. Notla alakasız bölüm terimleri (ör. tıp/mühendislik/spor/ziraat/eğitim notuna iktisat veya tarih örneği katmak), uydurma yüzde/istatistik ve klişe dolgu cümleler ("Merhaba arkadaşlar", "Akıllı tahtamızda", "Tam 12'den vurdun") KESİNLİKLE YASAKTIR.
2. OKUNABİLİRLİK: Her sahnenin 'diagramData.nodes' dizisinde 3-4 net kavram kartı üret. Her kartta 'label' 2-5 kelimelik net başlık (en fazla 36 karakter), 'subtext' ise 1-2 sade ve anlaşılır cümle (en fazla 130 karakter) olsun.
3. GÖRSEL TİPİ: Sadece metne uygun şemalar seç: 'visual', 'table', 'comparison', 'timeline', 'scenario', 'shapes'. 'curve' tipini YALNIZCA gerçek bir iktisat arz-talep/faiz dengesi konusundaysa kullan; 'chart' tipini YALNIZCA notta gerçek sayısal veriler varsa kullan.
4. 'visualTheme' değerini dersin gerçek fakültesine göre seç: "economics" | "history" | "law" | "politics" | "medicine" | "engineering" | "education" | "sports" | "agriculture" | "science" | "society".
YALNIZCA JSON döndür:
{
  "videoTitle": "Yüklenen ders notunun gerçek ve net başlığı",
  "outline": "2-3 cümlelik doğrudan ders notuna sadık genel özet",
  "keyFacts": ["Ders notundan çıkarım 1", "Çıkarım 2", "Çıkarım 3"],
  "scenes": [{
    "title": "Nottaki gerçek bölüm/konu başlığı",
    "turns": [
      { "speaker": "Deniz", "text": "Nottaki kavramı net, anlaşılır ve doğru akademik dille açıkla..." },
      { "speaker": "Barış", "text": "Deniz hocam, bu kavramın işleyişi veya ayırt edici noktası nedir?" },
      { "speaker": "Deniz", "text": "Nottaki gerçek mekanizma, koşul veya örnekle net yanıt..." }
    ],
    "diagramData": {
      "diagramType": "visual | table | comparison | timeline | scenario | shapes",
      "visualTheme": "economics | history | law | politics | medicine | engineering | education | sports | agriculture | science | society",
      "mainTitle": "Slayt başlığı",
      "highlightMetric": "Nottaki en kritik sınav çıkarımı",
      "nodes": [
        { "label": "Nottan Gerçek Kavram 1", "subtext": "Kısa, net ve ekranda kolayca okunabilir açıklama.", "badge": "Temel Kavram" },
        { "label": "Nottan Gerçek Kavram 2", "subtext": "İkinci bileşenin işleyişi veya ayırt edici yönü.", "badge": "Mekanizma" },
        { "label": "Nottan Gerçek Kavram 3", "subtext": "Üçüncü unsur, koşul veya sonuç.", "badge": "Sonuç" }
      ]
    },
    "keyTakeaways": ["Net çıkarım 1", "Net çıkarım 2"],
    "keyTerms": [{ "term": "Nottaki terim", "definition": "Kısa ve net tanım" }],
    "examTip": "Bu konuya özgü gerçek sınav ipucu veya kavram ayrımı"
  }],
  "matchingPairs": [{ "term": "...", "definition": "..." }],
  "examQuestions": [{ "question": "...", "options": ["A","B","C","D"], "correctIndex": 0, "explanation": "..." }]
}`;
      const videoUser = `FAKÜLTE / ALAN: ${domain.discipline}\nDERS: ${bundle.course || domain.discipline}\nBAŞLIK: ${bundle.title}\n\nKAYNAK DERS NOTU (YALNIZCA BU METNE SADIK KAL):\n${sampleUniformContext(
        bundle.combinedText,
        14_000,
      )}`;
      const pubVideo = await invokePublicJsonFallback(videoSys, videoUser);
      if (Array.isArray(pubVideo?.scenes) && pubVideo.scenes.length > 0) {
        return {
          content: { ...pubVideo, metadata: { sourceMode: 'ai', deepResearch: settings.deepResearch } },
          model: 'EconNotes Cloud Academic AI',
          sourceMode: 'ai',
        };
      }
    } else {
      const isQuiz = settings.materialType === 'quiz';
      const system = isQuiz
        ? `Üniversite hocası olarak ${settings.questionCount} adet ${settings.difficulty} zorlukta Türkçe sınav sorusu üret. Şık sırasını (correctIndex: 0..3) dengeli dağıt. JSON döndür: { "questions": [{ "type": "multiple_choice", "question": "...", "options": ["A","B","C","D"], "correctIndex": 0, "explanation": "...", "topic": "...", "difficulty": "medium", "bloomLevel": "Analiz" }] }`
        : `Aktif hatırlama uzmanı olarak ${settings.cardCount} adet Türkçe flashcard üret. JSON döndür: { "cards": [{ "front": "...", "back": "...", "hint": "...", "topic": "...", "difficulty": "medium" }] }`;
      const user = `DERS: ${bundle.course || bundle.detectedDiscipline}\nBAŞLIK: ${bundle.title}\n\n${sampleUniformContext(
        bundle.combinedText,
        14_500,
      )}`;

      const pub = await invokePublicJsonFallback(system, user);
      if ((isQuiz && Array.isArray(pub?.questions) && pub.questions.length > 0) || (!isQuiz && Array.isArray(pub?.cards) && pub.cards.length > 0)) {
        return {
          content: { ...pub, metadata: { sourceMode: 'ai', deepResearch: settings.deepResearch } },
          model: 'EconNotes Cloud Academic AI',
          sourceMode: 'ai',
        };
      }
    }
  }

  onProgress?.(90, 'Yerel ayrıştırıcı ile hazırlanıyor...');
  const payload: GeneratePayload = {
    materialType: settings.materialType,
    noteTitle: bundle.title,
    course: bundle.course || bundle.detectedDiscipline,
    noteContext: bundle.combinedText,
    questionCount: settings.questionCount,
    cardCount: settings.cardCount,
    difficulty: settings.difficulty,
    quizFormat: settings.quizFormat,
    deepResearch: settings.deepResearch,
    pedagogicalStyle: settings.pedagogicalStyle,
    customPrompt: settings.customPrompt,
    examFocus: settings.examFocus,
  };
  const localContent = generateClientStudyMaterial(payload);
  return {
    content: localContent,
    model: 'EconNotes Yerel Yapısal Ayrıştırıcı',
    sourceMode: 'local',
  };
}

export async function expandSingleSummarySection(params: {
  title: string;
  course?: string | null;
  sectionIndex: number;
  section: SummarySection;
  existingOverview?: string;
}): Promise<SummarySection | null> {
  const domain = classifyStudyDomain(
    `${params.existingOverview || ''} ${params.section.content}`,
    params.course || undefined,
    params.title,
  );
  const expandDirective =
    domain.mode === 'verbal'
      ? 'Bu sözel/kuramsal bölümü iki kat derinleştir: kavramsal özü genişlet, neden-sonuç zinciri kur, karşılaştırma tablosu ve klasik sınav yorum çerçevesi ekle. Uydurma formül ekleme.'
      : 'Bu bölümü çok daha ayrıntılı genişlet: ek çözümlü sayısal/somut örnek, formül türetimi veya vaka analizi ve karşılaştırma tablosu ekle.';

  const edgeRes = await invokeEdgeGenerate({
    materialType: 'summary',
    stage: 'expand_batch',
    noteTitle: params.title,
    course: params.course || undefined,
    deepResearch: true,
    pedagogicalStyle: 'academic_rigor',
    customPrompt: expandDirective,
    globalOutline: {
      overview: params.existingOverview || params.title,
      courseTitle: params.course || undefined,
    },
    sectionTargets: [
      {
        index: params.sectionIndex,
        title: params.section.heading,
        pageRange: params.section.pageRange,
        focusPoints: params.section.takeaways || [],
        contextSlice: params.section.content,
      },
    ],
    noteContext: params.section.content,
  });

  if (edgeRes?.sourceMode === 'ai' && Array.isArray(edgeRes.content?.sections) && edgeRes.content.sections[0]) {
    return edgeRes.content.sections[0];
  }

  const pub = await invokePublicJsonFallback(
    `Üniversite profesörü olarak verilen ders özet bölümünü iki kat derinleştir (${
      domain.mode === 'verbal'
        ? 'kavramsal analiz, neden-sonuç zinciri, Markdown karşılaştırma tablosu ve klasik sınav çerçevesi ekle; uydurma formül ekleme'
        : 'çözümlü somut örnek, formül ve Markdown karşılaştırma tablosu ekle'
    }). YALNIZCA JSON döndür: { "sections": [{ "index": 0, "heading": "...", "content": "...", "takeaways": ["..."], "deepResearchNote": "..." }] }`,
    `DERS: ${params.course || '-'} | BAŞLIK: ${params.title}\nBÖLÜM: ${params.section.heading}\nMEVCUT METİN:\n${params.section.content}`,
  );
  const pubSec = Array.isArray(pub?.sections) ? (pub.sections[0] as SummarySection | undefined) : undefined;
  return pubSec || null;
}

export async function gradeOpenEndedAnswer(params: {
  course?: string | null;
  topic?: string;
  question: string;
  rubricAnswer: string;
  studentAnswer: string;
}): Promise<OpenEndedGradeResult> {
  const edgeRes = await invokeEdgeGenerate({
    materialType: 'quiz',
    stage: 'grade_answer',
    course: params.course || undefined,
    gradePayload: {
      question: params.question,
      rubricAnswer: params.rubricAnswer,
      studentAnswer: params.studentAnswer,
      topic: params.topic,
    },
  });

  if (edgeRes?.content && typeof edgeRes.content.score === 'number') {
    return edgeRes.content as OpenEndedGradeResult;
  }

  // Honest deterministic lexical rubric scorer when Edge is offline
  const rubricTokens = params.rubricAnswer
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 4);
  const ansLower = params.studentAnswer.toLowerCase();
  const hits = rubricTokens.filter((w) => ansLower.includes(w));
  const misses = rubricTokens.filter((w) => !ansLower.includes(w));
  const uniqueHits = Array.from(new Set(hits));
  const uniqueMisses = Array.from(new Set(misses));
  const denom = Math.max(4, Math.min(12, new Set(rubricTokens).size));
  const score = Math.min(95, Math.max(20, Math.round((uniqueHits.length / denom) * 100)));

  return {
    score,
    verdict: score >= 75 ? 'Güçlü Cevap' : score >= 50 ? 'Kısmi Doğru' : 'Geliştirilmeli',
    feedback:
      'Cevabınız örnek çözümdeki anahtar kavramlarla karşılaştırıldı. Eksik kavramları ekleyerek yanıtınızı güçlendirebilirsiniz.',
    strengths: uniqueHits.slice(0, 4).map((w) => `Doğru kavram: ${w}`),
    missingConcepts: uniqueMisses.slice(0, 4).map((w) => `Eklenebilir kavram: ${w}`),
    improvedAnswer: params.rubricAnswer,
  };
}

export async function askStudyCoach(params: {
  materialTitle: string;
  course?: string | null;
  materialType: string;
  materialContent: StudyContentPayload | Record<string, unknown>;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  coachMode: CoachMode;
}): Promise<{ reply: string; model: string }> {
  await ensureFreshSession();
  try {
    const { data, error } = await supabase.functions.invoke('study-coach', {
      body: {
        materialTitle: params.materialTitle,
        course: params.course,
        materialType: params.materialType,
        materialContent: params.materialContent,
        messages: params.messages.slice(-14),
        coachMode: params.coachMode,
      },
    });
    if (!error && data?.reply) {
      return {
        reply: String(data.reply),
        model: String(data.model || 'EconNotes Akıl Hocası'),
      };
    }
  } catch {
    // Fall through to resilient cloud fallback
  }

  // Tier-2 Public Reasoning fallback so Akıl Hocası keeps working cleanly
  const modeNote =
    params.coachMode === 'feynman'
      ? 'Feynman analojisiyle sadeleştirerek anlat ve ardından öğrenciye geri özet sor.'
      : params.coachMode === 'socratic'
      ? 'Sokratik yöntemle ipucu ver ve tek bir yönlendirici soru sor.'
      : params.coachMode === 'deep_research'
      ? 'Yüksek lisans düzeyinde teorik arka plan, LaTeX formül ($...$) ve gerçek dünya örneğiyle derinlemesine açıkla.'
      : 'Üniversite ders koçu gibi net, adım adım, formüllü ve örnekli Türkçe yanıt ver.';

  try {
    const snippet = JSON.stringify(params.materialContent || {}).slice(0, 12_000);
    const res = await fetch(PUBLIC_REASONING_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'openai',
        messages: [
          {
            role: 'system',
            content: `Sen EconNotes Akıl Hocası'sın. Ders: ${params.course || '-'} | Başlık: ${
              params.materialTitle
            }. ${modeNote} Materyal bağlamı: ${snippet}`,
          },
          ...params.messages.slice(-8),
        ],
        temperature: 0.3,
      }),
    });
    if (res.ok) {
      const json = await res.json();
      const content = json?.choices?.[0]?.message?.content;
      if (typeof content === 'string' && content.trim()) {
        return { reply: content.trim(), model: 'EconNotes Akıl Hocası' };
      }
    }
  } catch {
    // Ignore
  }

  throw new Error('Akıl Hocası şu anda yanıt veremedi. Lütfen biraz sonra tekrar deneyin.');
}
