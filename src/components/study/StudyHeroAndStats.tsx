import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  BookOpen,
  BrainCircuit,
  Flag,
  GraduationCap,
  Layers,
  Plus,
  Sparkles,
  Trophy,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { StudyMaterial, StudyProgressRow } from '@/types/study';

interface StudyHeroAndStatsProps {
  materials: StudyMaterial[];
  progress: StudyProgressRow[];
  onStartCreate: () => void;
  onReportIssue: () => void;
  showComposer: boolean;
}

export function StudyHeroAndStats({
  materials,
  progress,
  onStartCreate,
  onReportIssue,
  showComposer,
}: StudyHeroAndStatsProps) {
  const stats = useMemo(() => {
    const summaries = materials.filter((m) => m.material_type === 'summary').length;
    const quizzes = materials.filter((m) => m.material_type === 'quiz').length;
    const flashcards = materials.filter((m) => m.material_type === 'flashcards').length;
    const deepCount = materials.filter((m) => m.content?.metadata?.deepResearch).length;

    const totalAttempts = progress.length;
    const avgPct =
      totalAttempts > 0
        ? Math.round(
            progress.reduce(
              (sum, row) => sum + (row.total_questions > 0 ? (row.score / row.total_questions) * 100 : 0),
              0,
            ) / totalAttempts,
          )
        : null;

    const chartData = [...progress]
      .slice(0, 10)
      .reverse()
      .map((row, idx) => ({
        name: `#${idx + 1}`,
        puan: row.total_questions > 0 ? Math.round((row.score / row.total_questions) * 100) : 0,
      }));

    return {
      total: materials.length,
      summaries,
      quizzes,
      flashcards,
      deepCount,
      totalAttempts,
      avgPct,
      chartData,
    };
  }, [materials, progress]);

  return (
    <section className="space-y-5">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-sm">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl"
        />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="gap-1.5 px-2.5 py-0.5 text-xs font-medium">
                <GraduationCap className="h-3.5 w-3.5 text-primary" />
                Üniversite Derin Öğrenme & Araştırma Stüdyosu
              </Badge>
              <Badge variant="outline" className="gap-1 text-xs">
                <Sparkles className="h-3 w-3 text-primary" />
                Çoklu Kaynak + PDF/Slayt OCR + Akademik Sentez
              </Badge>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Ders notlarını derin üniversite kaynaklarına dönüştür
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
              Birden fazla PDF, sunum slaytı, görsel, ses kaydı veya metin notunu birleştir; bölüm bölüm
              genişletilmiş özetler, karşılaştırmalı literatür analizleri, rubrik puanlamalı sınavlar ve
              Feynman/Sokratik yapay zekâ koçluğu ile çalış.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <Button size="lg" onClick={onStartCreate} className="gap-2 font-medium shadow-sm">
              <Plus className="h-4 w-4" />
              {showComposer ? 'Oluşturucuya Git' : 'Yeni Çalışma Seti Oluştur'}
            </Button>
            <Button variant="outline" size="lg" onClick={onReportIssue} className="gap-2">
              <Flag className="h-4 w-4" />
              Hata / Öneri Bildir
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="border-border bg-card">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Kayıtlı Setler</p>
              <p className="mt-1 text-2xl font-bold text-foreground">{stats.total}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {stats.summaries} özet • {stats.quizzes} test • {stats.flashcards} kart
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Layers className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Derin Araştırma Setleri</p>
              <p className="mt-1 text-2xl font-bold text-foreground">{stats.deepCount}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Literatür & formül sentezli
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <BrainCircuit className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Tamamlanan Denemeler</p>
              <p className="mt-1 text-2xl font-bold text-foreground">{stats.totalAttempts}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Sınav & aktif hatırlama
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <BookOpen className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Başarı Ortalaması</p>
              <p className="mt-1 text-2xl font-bold text-foreground">
                {stats.avgPct !== null ? `%${stats.avgPct}` : '—'}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {stats.avgPct !== null ? 'Son sınav/kart oturumları' : 'Henüz deneme yapılmadı'}
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Trophy className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {stats.chartData.length >= 2 && (
        <Card className="border-border bg-card">
          <CardContent className="p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Son Çalışma Performansı</h2>
                <p className="text-xs text-muted-foreground">
                  Son {stats.chartData.length} değerlendirmedeki yüzdelik gelişim
                </p>
              </div>
              <Badge variant="outline" className="text-xs">
                Ort: %{stats.avgPct ?? 0}
              </Badge>
            </div>
            <div className="h-36 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.chartData}>
                  <defs>
                    <linearGradient id="studyPerfGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      borderColor: 'hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                    formatter={(value: number | string) => [`%${value}`, 'Başarı']}
                  />
                  <Area
                    type="monotone"
                    dataKey="puan"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#studyPerfGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
