import { useEffect, useMemo, useState } from 'react';
import {
  Brain,
  Database,
  FileText,
  Layers,
  LayoutGrid,
  List,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Video,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  extractSearchableTextFromMaterial,
  indexDocumentInVectorStore,
} from '@/lib/neural/engineRouter';
import {
  getIndexedDocuments,
  searchChunks,
  type SearchHit,
} from '@/lib/neural/vectorIndex';
import { cn } from '@/lib/utils';
import type { MaterialType, StudyMaterial, StudyProgressRow } from '@/types/study';
import { toast } from 'sonner';

interface NeuralLibraryViewProps {
  materials: StudyMaterial[];
  progress: StudyProgressRow[];
  onOpenMaterial: (mat: StudyMaterial) => void;
  onDeleteMaterial: (id: string) => void;
  onCreateNew: () => void;
  onIndexChanged?: () => void;
}

const TYPE_META: Record<
  MaterialType,
  { label: string; icon: typeof FileText; color: string }
> = {
  summary: { label: 'Akademik Özet', icon: FileText, color: 'text-cyan-500' },
  quiz: { label: 'Sınav Bankası', icon: Sparkles, color: 'text-amber-500' },
  flashcards: { label: 'Aktif Kartlar', icon: Layers, color: 'text-emerald-500' },
  video: { label: 'Video Ders', icon: Video, color: 'text-violet-500' },
};

export function NeuralLibraryView({
  materials,
  progress,
  onOpenMaterial,
  onDeleteMaterial,
  onCreateNew,
  onIndexChanged,
}: NeuralLibraryViewProps) {
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | MaterialType>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'score'>('newest');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [semanticMode, setSemanticMode] = useState(false);
  const [indexedIds, setIndexedIds] = useState<Set<string>>(new Set());
  const [indexingAll, setIndexingAll] = useState(false);
  const [semanticHits, setSemanticHits] = useState<SearchHit[]>([]);

  useEffect(() => {
    void getIndexedDocuments().then((docs) => {
      setIndexedIds(new Set(docs.map((d) => d.docId)));
    });
  }, [materials.length]);

  useEffect(() => {
    if (!semanticMode || query.trim().length < 2) {
      setSemanticHits([]);
      return;
    }
    let cancelled = false;
    void searchChunks({ query: query.trim(), topK: 8 }).then((hits) => {
      if (!cancelled) setSemanticHits(hits);
    });
    return () => {
      cancelled = true;
    };
  }, [semanticMode, query]);

  const bestScoreByMaterial = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of progress) {
      const pct = row.total_questions > 0 ? Math.round((row.score / row.total_questions) * 100) : 0;
      map.set(row.material_id, Math.max(map.get(row.material_id) || 0, pct));
    }
    return map;
  }, [progress]);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr-TR');
    const hitDocIds = new Set(semanticHits.map((h) => h.chunk.docId));

    const list = materials.filter((m) => {
      if (typeFilter !== 'all' && m.material_type !== typeFilter) return false;
      if (!q) return true;
      const textMatch = `${m.title} ${m.course || ''}`.toLocaleLowerCase('tr-TR').includes(q);
      if (semanticMode) return textMatch || hitDocIds.has(m.id);
      return textMatch;
    });

    if (sortBy === 'score') {
      return [...list].sort(
        (a, b) => (bestScoreByMaterial.get(b.id) || 0) - (bestScoreByMaterial.get(a.id) || 0),
      );
    }
    return [...list].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }, [materials, typeFilter, query, semanticMode, semanticHits, sortBy, bestScoreByMaterial]);

  const handleIndexAll = async () => {
    if (materials.length === 0) return;
    setIndexingAll(true);
    try {
      let totalChunks = 0;
      for (const m of materials) {
        const text = extractSearchableTextFromMaterial(m);
        if (text.trim().length > 20) {
          totalChunks += await indexDocumentInVectorStore({
            docId: m.id,
            title: m.title,
            course: m.course,
            text,
          });
        }
      }
      const docs = await getIndexedDocuments();
      setIndexedIds(new Set(docs.map((d) => d.docId)));
      onIndexChanged?.();
      toast.success(`${docs.length} materyal (${totalChunks} pasaj) anlamsal RAG dizinine eklendi.`);
    } finally {
      setIndexingAll(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="neural-card space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold">Çalışma Kütüphanesi & Anlamsal Dizin</h2>
            <p className="text-xs text-muted-foreground">
              {materials.length} kayıtlı çalışma materyali · {indexedIds.size} tanesi RAG aramasında aktif
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={indexingAll || materials.length === 0}
              onClick={() => void handleIndexAll()}
              className="gap-1.5 text-xs"
            >
              {indexingAll ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Database className="h-3.5 w-3.5 text-cyan-500" />
              )}
              Tümünü RAG İndeksle
            </Button>
            <Button type="button" size="sm" onClick={onCreateNew} className="gap-1.5 text-xs">
              <Plus className="h-3.5 w-3.5" />
              Yeni Üret
            </Button>
          </div>
        </div>

        {/* Search + Filter Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={
                semanticMode
                  ? 'İçerik içi anlamsal arama (kavram, denklem, tanım)...'
                  : 'Başlık veya ders adıyla ara...'
              }
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-9 pl-9 text-xs"
            />
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-background/60 px-3 py-1.5">
            <Brain className={cn('h-3.5 w-3.5', semanticMode ? 'text-cyan-500' : 'text-muted-foreground')} />
            <span className="text-xs font-medium">Anlamsal Ara</span>
            <Switch checked={semanticMode} onCheckedChange={setSemanticMode} />
          </div>

          <div className="flex rounded-xl border border-border/60 bg-background/60 p-0.5">
            {(['all', 'summary', 'quiz', 'flashcards', 'video'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTypeFilter(t)}
                className={cn(
                  'rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
                  typeFilter === t
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t === 'all' ? 'Tümü' : t === 'summary' ? 'Özet' : t === 'quiz' ? 'Quiz' : t === 'flashcards' ? 'Kart' : 'Video'}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 rounded-xl border border-border/60 bg-background/60 p-0.5">
            <button
              type="button"
              onClick={() => setSortBy(sortBy === 'newest' ? 'score' : 'newest')}
              className="rounded-lg px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              {sortBy === 'newest' ? 'En Yeni' : 'En Yüksek Skor'}
            </button>
            <button
              type="button"
              aria-label="Izgara görünümü"
              onClick={() => setViewMode('grid')}
              className={cn('rounded-lg p-1.5', viewMode === 'grid' && 'bg-muted text-foreground')}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label="Liste görünümü"
              onClick={() => setViewMode('list')}
              className={cn('rounded-lg p-1.5', viewMode === 'list' && 'bg-muted text-foreground')}
            >
              <List className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Matched Semantic Excerpts Preview */}
        {semanticMode && semanticHits.length > 0 && (
          <div className="space-y-1.5 rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-3">
            <p className="text-[11px] font-bold text-cyan-600 dark:text-cyan-300">
              Pasaj Eşleşmeleri ({semanticHits.length})
            </p>
            {semanticHits.slice(0, 3).map((hit) => {
              const targetMat = materials.find((m) => m.id === hit.chunk.docId);
              return (
                <button
                  key={hit.chunk.id}
                  type="button"
                  onClick={() => targetMat && onOpenMaterial(targetMat)}
                  className="block w-full rounded-lg border border-border/50 bg-background/70 p-2 text-left text-xs hover:border-primary/40"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">
                      {hit.chunk.docTitle} · {hit.chunk.sectionHeading}
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      %{Math.round(hit.score * 100)} eşleşme
                    </Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                    {hit.chunk.text}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Materials Grid / List */}
      {filtered.length === 0 ? (
        <div className="neural-card p-8 text-center text-xs text-muted-foreground">
          Arama kriterine uyan materyal bulunamadı.
        </div>
      ) : (
        <div
          className={cn(
            viewMode === 'grid' ? 'grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3' : 'space-y-2.5',
          )}
        >
          {filtered.map((mat) => {
            const meta = TYPE_META[mat.material_type];
            const Icon = meta.icon;
            const score = bestScoreByMaterial.get(mat.id);
            const isIndexed = indexedIds.has(mat.id);

            return (
              <div
                key={mat.id}
                className={cn(
                  'neural-card flex justify-between p-4',
                  viewMode === 'grid' ? 'flex-col' : 'flex-row items-center gap-4',
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary" className="gap-1 text-[10px]">
                      <Icon className={cn('h-3 w-3', meta.color)} />
                      {meta.label}
                    </Badge>
                    {isIndexed && (
                      <Badge variant="outline" className="border-cyan-500/35 text-[10px] text-cyan-500">
                        RAG Hazır
                      </Badge>
                    )}
                    {score !== undefined && (
                      <Badge variant="outline" className="border-emerald-500/40 text-[10px] text-emerald-500">
                        En iyi %{score}
                      </Badge>
                    )}
                  </div>
                  <h3 className="line-clamp-2 text-sm font-bold">{mat.title}</h3>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {mat.course || 'Genel'} · {new Date(mat.created_at).toLocaleDateString('tr-TR')}
                  </p>
                </div>

                <div
                  className={cn(
                    'flex items-center gap-2',
                    viewMode === 'grid' ? 'mt-4 border-t border-border/50 pt-3' : 'shrink-0',
                  )}
                >
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => onOpenMaterial(mat)}
                    className="flex-1 text-xs"
                  >
                    Çalışmaya Başla
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`${mat.title} sil`}
                    onClick={() => onDeleteMaterial(mat.id)}
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
