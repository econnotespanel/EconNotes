import { useMemo, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  BrainCircuit,
  Film,
  HelpCircle,
  Layers,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  MaterialType,
  StudyContentPayload,
  StudyMaterial,
  StudyProgressRow,
} from '@/types/study';

interface StudyMaterialLibraryProps {
  materials: StudyMaterial[];
  progress: StudyProgressRow[];
  onOpenMaterial: (material: StudyMaterial) => void;
  onDeleteMaterial: (id: string) => void;
  onCreateNew: () => void;
}

const TYPE_META: Record<
  MaterialType,
  { label: string; icon: typeof BookOpen; countLabel: (c: StudyContentPayload) => string }
> = {
  summary: {
    label: 'Ders Özeti',
    icon: BookOpen,
    countLabel: (c) => `${Array.isArray(c?.sections) ? c.sections.length : 0} bölüm`,
  },
  quiz: {
    label: 'Sınav',
    icon: HelpCircle,
    countLabel: (c) => `${Array.isArray(c?.questions) ? c.questions.length : 0} soru`,
  },
  flashcards: {
    label: 'Bilgi Kartı',
    icon: Layers,
    countLabel: (c) => `${Array.isArray(c?.cards) ? c.cards.length : 0} kart`,
  },
  video: {
    label: 'Video Ders',
    icon: Film,
    countLabel: (c) => `${Array.isArray(c?.scenes) ? c.scenes.length : 0} sahne`,
  },
};

export function StudyMaterialLibrary({
  materials,
  progress,
  onOpenMaterial,
  onDeleteMaterial,
  onCreateNew,
}: StudyMaterialLibraryProps) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | MaterialType>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'score'>('newest');

  const bestScoreMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of progress) {
      if (p.total_questions <= 0) continue;
      const pct = Math.round((p.score / p.total_questions) * 100);
      const prev = map.get(p.material_id) ?? -1;
      if (pct > prev) map.set(p.material_id, pct);
    }
    return map;
  }, [progress]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return materials
      .filter((m) => {
        if (typeFilter !== 'all' && m.material_type !== typeFilter) return false;
        if (!q) return true;
        return (
          m.title.toLowerCase().includes(q) ||
          (m.course || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (sortBy === 'score') {
          const sa = bestScoreMap.get(a.id) ?? -1;
          const sb = bestScoreMap.get(b.id) ?? -1;
          if (sb !== sa) return sb - sa;
        }
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [materials, typeFilter, search, sortBy, bestScoreMap]);

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            Kütüphanem ({materials.length})
          </h2>
          <p className="text-xs text-muted-foreground">
            Tüm çalışma materyalleriniz tam ekran etkileşimli çalışma alanında açılır.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-56">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Materyal veya ders ara..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>

          <Select value={sortBy} onValueChange={(v) => setSortBy(v as 'newest' | 'score')}>
            <SelectTrigger className="h-9 w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">En Yeni</SelectItem>
              <SelectItem value="score">En Yüksek Puan</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ['all', 'Tümü'],
            ['summary', 'Ders Özeti'],
            ['quiz', 'Sınav'],
            ['flashcards', 'Bilgi Kartları'],
            ['video', 'Video Ders'],
          ] as const
        ).map(([val, label]) => (
          <Button
            key={val}
            type="button"
            size="sm"
            variant={typeFilter === val ? 'default' : 'outline'}
            onClick={() => setTypeFilter(val)}
            className="h-8 rounded-full px-3.5 text-xs"
          >
            {label}
          </Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card className="border-dashed border-border bg-card/50">
          <CardContent className="flex flex-col items-center justify-center py-14 text-center">
            <Sparkles className="h-9 w-9 text-primary/70" />
            <h3 className="mt-3 text-base font-semibold text-foreground">
              {materials.length === 0
                ? 'Henüz çalışma materyali oluşturmadınız'
                : 'Aramanızla eşleşen çalışma seti yok'}
            </h3>
            <p className="mt-1 max-w-md text-xs text-muted-foreground">
              Yukarıdaki Çoklu Kaynak & Derin Öğrenme Atölyesinden PDF, slayt veya not yükleyerek
              ilk üniversite çalışma paketinizi oluşturun.
            </p>
            {materials.length === 0 && (
              <Button className="mt-4" size="sm" onClick={onCreateNew}>
                İlk Seti Oluştur
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((mat) => {
            const meta = TYPE_META[mat.material_type] || TYPE_META.summary;
            const Icon = meta.icon;
            const bestScore = bestScoreMap.get(mat.id);
            const isDeep = Boolean(mat.content?.metadata?.deepResearch);
            const sourceMode = mat.content?.metadata?.sourceMode;

            return (
              <Card
                key={mat.id}
                className="group flex flex-col justify-between border-border bg-card transition-all hover:border-primary/50 hover:shadow-md"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="secondary" className="gap-1 text-[11px]">
                        <Icon className="h-3 w-3 text-primary" />
                        {meta.label}
                      </Badge>
                      {isDeep && (
                        <Badge variant="outline" className="gap-1 border-primary/40 text-[10px] text-primary">
                          <BrainCircuit className="h-3 w-3" />
                          Derin Araştırma
                        </Badge>
                      )}
                      {sourceMode === 'local' && (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">
                          Yerel Ayrıştırma
                        </Badge>
                      )}
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`${mat.title} materyalini sil`}
                      onClick={() => onDeleteMaterial(mat.id)}
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <CardTitle className="mt-2 line-clamp-2 text-base font-semibold leading-snug text-foreground">
                    {mat.title}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {mat.course || 'Genel Ders'} • {meta.countLabel(mat.content)} •{' '}
                    {new Date(mat.created_at).toLocaleDateString('tr-TR')}
                  </p>
                </CardHeader>

                <CardContent className="pb-3 pt-0">
                  {mat.content?.overview && (
                    <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                      {String(mat.content.overview)}
                    </p>
                  )}
                  {bestScore !== undefined && (
                    <div className="mt-2 inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                      En İyi Skor: %{bestScore}
                    </div>
                  )}
                </CardContent>

                <CardFooter className="pt-0">
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full justify-between font-medium group-hover:bg-primary group-hover:text-primary-foreground"
                    onClick={() => onOpenMaterial(mat)}
                  >
                    <span>Çalışma Alanını Aç</span>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
