import { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Film,
  ListChecks,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { CanonicalSourceAnalysis } from '@/lib/studySourceAnalysis';
import type { VideoScenarioChapter, VideoScenarioPlan } from '@/types/study';

interface VideoScenarioPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canonicalAnalysis: CanonicalSourceAnalysis;
  notebookTitle: string;
  onConfirm: (plan: VideoScenarioPlan) => void;
}

const DIAGRAM_TYPE_OPTIONS: Array<{
  value: VideoScenarioChapter['diagramType'];
  label: string;
}> = [
  { value: 'visual', label: 'Kavram Şeması' },
  { value: 'structure', label: 'Süreç / Mekanizma' },
  { value: 'comparison', label: 'Karşılaştırma Tablosu' },
  { value: 'timeline', label: 'Tarihsel Akış / Kronoloji' },
  { value: 'curve', label: 'Ekonomik / Sayısal Grafik' },
  { value: 'table', label: 'Veri / Formül Matrisi' },
  { value: 'network', label: 'İlişki / Kavram Ağı' },
  { value: 'scenario', label: 'Vaka / Sınav Sorusu' },
];

function inferDiagramType(heading: string, course: string): VideoScenarioChapter['diagramType'] {
  const lower = `${heading} ${course}`.toLocaleLowerCase('tr-TR');
  if (/(tarih|dönem|yüzyıl|kronoloji|gelişim|osmanlı|devir|süreç)/.test(lower)) {
    return 'timeline';
  }
  if (/(karşılaştır|fark|mukayese|vs|benzerlik)/.test(lower)) {
    return 'comparison';
  }
  if (/(eğri|talep|arz|denge|is-lm|phillips|esneklik|grafik|maliyet|regresyon)/.test(lower)) {
    return 'curve';
  }
  if (/(formül|tablo|matris|oran|hesap|dağılım|olasılık|istatistik)/.test(lower)) {
    return 'table';
  }
  if (/(vaka|örnek|soru|uygulama|sınav|çözüm)/.test(lower)) {
    return 'scenario';
  }
  if (/(ilişki|sistem|yapı|ağ|etkileşim|aktarım)/.test(lower)) {
    return 'network';
  }
  return 'visual';
}

export function buildInitialVideoScenarioPlan(
  canonicalAnalysis: CanonicalSourceAnalysis,
  notebookTitle: string,
): VideoScenarioPlan {
  const courseName =
    canonicalAnalysis.primaryCourseLabel ||
    canonicalAnalysis.distinctCourses[0] ||
    'Akademik Ders';

  const firstSourceName = canonicalAnalysis.profiles[0]?.source.name
    ?.replace(/\.(pdf|pptx?|docx?|txt|md|png|jpe?g)$/i, '')
    .trim();

  const lessonTitle = firstSourceName
    ? `${firstSourceName} — Videolu Ders`
    : `${notebookTitle || courseName} — Videolu Ders`;

  const rawHeadings = Array.from(
    new Set(
      [
        ...(canonicalAnalysis.masterOutline || []).map((m) => m.heading),
        ...canonicalAnalysis.profiles.flatMap((p) =>
          (p.headings || []).map((h) => (typeof h === 'string' ? h : h?.heading || '')),
        ),
      ]
        .filter((h): h is string => typeof h === 'string')
        .map((h) => h.replace(/^[\d.\-\s]+/, '').trim())
        .filter((h) => h.length >= 4 && h.length <= 90),
    ),
  );

  const keyConcepts = Array.from(
    new Set(
      canonicalAnalysis.profiles
        .flatMap((p) => [
          ...(p.detection?.evidence || []),
          ...(p.formulas || []),
        ])
        .filter((k): k is string => typeof k === 'string')
        .map((k) => k.trim())
        .filter((k) => k.length >= 3 && k.length <= 60),
    ),
  );

  const chapters: VideoScenarioChapter[] = [];
  if (rawHeadings.length >= 3) {
    rawHeadings.slice(0, 6).forEach((heading, idx) => {
      const conceptHint = keyConcepts.slice(idx * 2, idx * 2 + 3).join(', ');
      chapters.push({
        id: `ch-${idx + 1}`,
        title: heading,
        focusNotes: conceptHint
          ? `Odak kavramlar: ${conceptHint}. Kaynak içi mekanizmayı ve sınav vurgusunu net açıkla.`
          : 'Kaynak metindeki temel ilkeleri, neden-sonuç bağını ve sınav püf noktalarını açıkla.',
        diagramType: inferDiagramType(heading, courseName),
      });
    });
  } else {
    const baseChapters: Array<[string, string, VideoScenarioChapter['diagramType']]> = [
      [
        `${courseName}: Giriş ve Temel Çerçeve`,
        'Dersin ana amacını, temel tanımlarını ve kavramsal haritasını kur.',
        'visual',
      ],
      [
        'Çekirdek Mekanizmalar ve Kuramsal Yapı',
        keyConcepts.slice(0, 4).length > 0
          ? `Ana kavramlar: ${keyConcepts.slice(0, 4).join(', ')}.`
          : 'Temel kuramlar, ilkeler ve bileşenler arasındaki ilişkiyi göster.',
        inferDiagramType(courseName, courseName),
      ],
      [
        'Karşılaştırmalı Analiz ve Neden-Sonuç İlişkileri',
        'Kavramlar arası ayrımları, kırılma noktalarını ve karşılaştırma eksenlerini vurgula.',
        'comparison',
      ],
      [
        'Uygulamalı Örnek ve Sınav Soru Stratejisi',
        'Sınavda en sık karıştırılan tuzakları çöz ve gerçek sınav sorusu mantığını göster.',
        'scenario',
      ],
    ];
    baseChapters.forEach(([title, focusNotes, diagramType], idx) => {
      chapters.push({
        id: `ch-${idx + 1}`,
        title,
        focusNotes,
        diagramType,
      });
    });
  }

  const learningObjectives: string[] = [
    `${courseName} kaynağındaki temel kavram ve ilkeleri kendi cümlelerinle açıklayabilmek`,
    chapters[1]
      ? `"${chapters[1].title}" konusundaki neden-sonuç mekanizmalarını analiz edebilmek`
      : 'Konular arası karşılaştırma ve kuramsal bağlantıları kurabilmek',
    'Sınavlarda sık sorulan ayrım noktalarını ve çeldiricileri hatasız ayırt edebilmek',
  ];

  return {
    lessonTitle,
    courseName,
    learningObjectives,
    chapters,
    narrationStyle: 'academic',
    speechPace: 'normal',
  };
}

export function VideoScenarioPreviewDialog({
  open,
  onOpenChange,
  canonicalAnalysis,
  notebookTitle,
  onConfirm,
}: VideoScenarioPreviewDialogProps) {
  const [plan, setPlan] = useState<VideoScenarioPlan>(() =>
    buildInitialVideoScenarioPlan(canonicalAnalysis, notebookTitle),
  );

  useEffect(() => {
    if (open) {
      setPlan(buildInitialVideoScenarioPlan(canonicalAnalysis, notebookTitle));
    }
  }, [open, canonicalAnalysis, notebookTitle]);

  const updateChapter = (id: string, patch: Partial<VideoScenarioChapter>) => {
    setPlan((prev) => ({
      ...prev,
      chapters: prev.chapters.map((ch) => (ch.id === id ? { ...ch, ...patch } : ch)),
    }));
  };

  const moveChapter = (index: number, delta: -1 | 1) => {
    setPlan((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.chapters.length) return prev;
      const next = [...prev.chapters];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return { ...prev, chapters: next };
    });
  };

  const removeChapter = (id: string) => {
    setPlan((prev) => {
      if (prev.chapters.length <= 2) return prev;
      return {
        ...prev,
        chapters: prev.chapters.filter((ch) => ch.id !== id),
      };
    });
  };

  const addChapter = () => {
    setPlan((prev) => ({
      ...prev,
      chapters: [
        ...prev.chapters,
        {
          id: `ch-${Date.now()}`,
          title: `Bölüm ${prev.chapters.length + 1}: Ek Konu Derinleştirmesi`,
          focusNotes: 'Kaynak içi ek örnekler ve sınav değerlendirmesi.',
          diagramType: 'visual',
        },
      ],
    }));
  };

  const updateObjective = (idx: number, val: string) => {
    setPlan((prev) => {
      const next = [...prev.learningObjectives];
      next[idx] = val;
      return { ...prev, learningObjectives: next };
    });
  };

  const addObjective = () => {
    setPlan((prev) => ({
      ...prev,
      learningObjectives: [...prev.learningObjectives, ''],
    }));
  };

  const removeObjective = (idx: number) => {
    setPlan((prev) => {
      if (prev.learningObjectives.length <= 1) return prev;
      return {
        ...prev,
        learningObjectives: prev.learningObjectives.filter((_, i) => i !== idx),
      };
    });
  };

  const canConfirm =
    plan.lessonTitle.trim().length >= 3 &&
    plan.chapters.length >= 2 &&
    plan.chapters.every((ch) => ch.title.trim().length >= 2);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="video-scenario-preview-dialog"
        className="flex max-h-[90dvh] w-[calc(100vw-1.5rem)] max-w-2xl flex-col overflow-hidden rounded-2xl"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Film className="h-4 w-4 text-primary" />
            Videolu Ders Senaryo &amp; Bölüm Planı
          </DialogTitle>
          <DialogDescription className="text-xs">
            Üretimi başlatmadan önce videolu dersin başlığını, öğrenme hedeflerini, bölüm sırasını
            ve her sahnede gösterilecek akademik şema türünü inceleyip düzenleyebilirsin.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          {/* Course & Lesson Metadata */}
          <div className="grid grid-cols-1 gap-3 rounded-2xl border border-border/70 bg-muted/20 p-3.5 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label className="text-xs font-semibold">Ders Başlığı</Label>
                <Badge variant="outline" className="gap-1 text-[10.5px] font-semibold text-primary">
                  <BookOpen className="h-3 w-3" />
                  {plan.courseName}
                </Badge>
              </div>
              <Input
                value={plan.lessonTitle}
                onChange={(e) => setPlan((p) => ({ ...p, lessonTitle: e.target.value }))}
                className="h-9 rounded-xl text-xs"
                placeholder="Videolu ders başlığı"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Anlatım Tarzı</Label>
              <Select
                value={plan.narrationStyle}
                onValueChange={(v) =>
                  setPlan((p) => ({
                    ...p,
                    narrationStyle: v as VideoScenarioPlan['narrationStyle'],
                  }))
                }
              >
                <SelectTrigger className="h-9 rounded-xl text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="academic">Akademik Ders Anlatımı</SelectItem>
                  <SelectItem value="exam_focus">Sınav Odaklı Stratejik</SelectItem>
                  <SelectItem value="feynman">Yalın &amp; Adım Adım (Feynman)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Seslendirme Temposu</Label>
              <Select
                value={plan.speechPace}
                onValueChange={(v) =>
                  setPlan((p) => ({
                    ...p,
                    speechPace: v as VideoScenarioPlan['speechPace'],
                  }))
                }
              >
                <SelectTrigger className="h-9 rounded-xl text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="calm">Sakin &amp; Tane Tane (0.9x)</SelectItem>
                  <SelectItem value="normal">Doğal Öğretmen Temposu (1.0x)</SelectItem>
                  <SelectItem value="brisk">Akıcı Hızlı Tekrar (1.1x)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Learning Objectives */}
          <div className="space-y-2 rounded-2xl border border-border/70 bg-card p-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                <ListChecks className="h-3.5 w-3.5 text-primary" />
                Öğrenme Hedefleri ({plan.learningObjectives.length})
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={addObjective}
                className="h-7 gap-1 rounded-lg px-2 text-[11px] text-primary"
              >
                <Plus className="h-3 w-3" />
                Hedef Ekle
              </Button>
            </div>
            <div className="space-y-1.5">
              {plan.learningObjectives.map((obj, idx) => (
                <div key={idx} className="flex items-center gap-1.5">
                  <span className="w-5 shrink-0 text-center text-[11px] font-bold text-muted-foreground">
                    {idx + 1}.
                  </span>
                  <Input
                    value={obj}
                    onChange={(e) => updateObjective(idx, e.target.value)}
                    placeholder="Öğrencinin bu dersten kazanacağı hedef..."
                    className="h-8 rounded-lg text-xs"
                  />
                  {plan.learningObjectives.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeObjective(idx)}
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Chapters / Scenes Plan */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold text-foreground">
                Ders Bölümleri ve Görsel Şemalar ({plan.chapters.length} sahne)
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addChapter}
                className="h-7 gap-1 rounded-lg px-2.5 text-[11px]"
              >
                <Plus className="h-3 w-3" />
                Bölüm Ekle
              </Button>
            </div>

            <div className="space-y-2.5">
              {plan.chapters.map((ch, idx) => (
                <div
                  key={ch.id}
                  className="space-y-2 rounded-xl border border-border/70 bg-muted/20 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex h-5 items-center rounded-full bg-primary/10 px-2 text-[10.5px] font-bold text-primary">
                      Bölüm {idx + 1}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={idx === 0}
                        onClick={() => moveChapter(idx, -1)}
                        className="h-7 w-7 text-muted-foreground"
                        title="Yukarı taşı"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={idx === plan.chapters.length - 1}
                        onClick={() => moveChapter(idx, 1)}
                        className="h-7 w-7 text-muted-foreground"
                        title="Aşağı taşı"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={plan.chapters.length <= 2}
                        onClick={() => removeChapter(ch.id)}
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        title="Bölümü kaldır"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_180px]">
                    <Input
                      value={ch.title}
                      onChange={(e) => updateChapter(ch.id, { title: e.target.value })}
                      placeholder="Bölüm başlığı"
                      className="h-8 rounded-lg text-xs font-semibold"
                    />
                    <Select
                      value={ch.diagramType}
                      onValueChange={(v) =>
                        updateChapter(ch.id, {
                          diagramType: v as VideoScenarioChapter['diagramType'],
                        })
                      }
                    >
                      <SelectTrigger className="h-8 rounded-lg text-[11px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DIAGRAM_TYPE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Input
                    value={ch.focusNotes}
                    onChange={(e) => updateChapter(ch.id, { focusNotes: e.target.value })}
                    placeholder="Bu bölümde vurgulanacak noktalar, formüller veya sınav ipuçları..."
                    className="h-8 rounded-lg bg-background text-[11.5px]"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 border-t border-border/60 pt-3">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!canConfirm}
            data-testid="video-scenario-confirm-btn"
            onClick={() =>
              onConfirm({
                ...plan,
                lessonTitle: plan.lessonTitle.trim(),
                learningObjectives: plan.learningObjectives.map((o) => o.trim()).filter(Boolean),
                chapters: plan.chapters.map((c) => ({
                  ...c,
                  title: c.title.trim(),
                  focusNotes: c.focusNotes.trim(),
                })),
              })
            }
            className="gap-1.5 bg-gradient-to-r from-[#174ec4] to-[#2e78f6] text-white"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Senaryoyu Onayla ve Videoyu Oluştur
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
