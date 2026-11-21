import { useMemo, useState } from 'react';
import {
  BookOpen,
  MessageSquareText,
  Network,
  RotateCcw,
  Search,
  Sparkles,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { extractFullDocumentOutline } from '@/lib/studySourceProcessor';
import type { ExtractedSourceItem, StudyMaterial } from '@/types/study';

interface MindNode {
  id: string;
  label: string;
  detail: string;
  sourceName: string;
  ring: 1 | 2;
  color: string;
  x: number;
  y: number;
  parentId: string;
}

interface NotebookMindMapDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notebookTitle: string;
  sources: ExtractedSourceItem[];
  materials: StudyMaterial[];
  onAskTutor: (prompt: string) => void;
}

const BRANCH_COLORS = [
  '#3b82f6', // cobalt blue
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ec4899', // pink
];

export function NotebookMindMapDialog({
  open,
  onOpenChange,
  notebookTitle,
  sources,
  materials,
  onAskTutor,
}: NotebookMindMapDialogProps) {
  const [search, setSearch] = useState('');
  const [zoom, setZoom] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { nodes, totalConcepts } = useMemo(() => {
    const rawItems: Array<{ label: string; detail: string; sourceName: string; isCore: boolean }> = [];
    const seen = new Set<string>();

    const pushUnique = (label: string, detail: string, sourceName: string, isCore: boolean) => {
      const clean = label.replace(/^#+\s*/, '').replace(/\s+/g, ' ').trim();
      if (clean.length < 3 || clean.length > 72) return;
      const key = clean.toLocaleLowerCase('tr-TR');
      if (seen.has(key)) return;
      seen.add(key);
      rawItems.push({
        label: clean,
        detail: detail.trim() || `${sourceName} kaynağından çıkarılan temel başlık.`,
        sourceName,
        isCore,
      });
    };

    // 1) Pull structured sections & keyTerms from linked materials
    for (const mat of materials) {
      const sections = mat.content?.sections;
      if (Array.isArray(sections)) {
        for (const sec of sections.slice(0, 8)) {
          if (sec?.heading) {
            pushUnique(
              sec.heading,
              (sec.takeaways?.[0] || sec.content || '').slice(0, 260),
              mat.title,
              true,
            );
          }
        }
      }
      const keyTerms = mat.content?.keyTerms;
      if (Array.isArray(keyTerms)) {
        for (const kt of keyTerms.slice(0, 10)) {
          if (kt?.term) {
            pushUnique(kt.term, kt.definition || '', mat.title, false);
          }
        }
      }
      const cards = mat.content?.cards;
      if (Array.isArray(cards)) {
        for (const card of cards.slice(0, 8)) {
          if (card?.front) {
            pushUnique(card.front.slice(0, 62), card.back || '', mat.title, false);
          }
        }
      }
    }

    // 2) Pull headings & concepts from active raw sources
    for (const src of sources) {
      if (!src.text) continue;
      const outline = extractFullDocumentOutline(src.text, 10);
      for (const item of outline) {
        pushUnique(item.heading, item.excerpt || '', src.name, true);
      }
    }

    const coreList = rawItems.filter((r) => r.isCore).slice(0, 6);
    const secondaryPool = rawItems.filter((r) => !coreList.includes(r)).slice(0, 12);
    const cx = 480;
    const cy = 310;
    const built: MindNode[] = [];

    const ring1Items = coreList.length > 0 ? coreList : secondaryPool.slice(0, 6);
    const ring2Items = coreList.length > 0 ? secondaryPool : secondaryPool.slice(6, 14);

    ring1Items.forEach((item, idx) => {
      const angle = (idx / Math.max(1, ring1Items.length)) * Math.PI * 2 - Math.PI / 2;
      const r = 155;
      built.push({
        id: `n1-${idx}`,
        label: item.label,
        detail: item.detail,
        sourceName: item.sourceName,
        ring: 1,
        color: BRANCH_COLORS[idx % BRANCH_COLORS.length],
        x: Math.round(cx + r * Math.cos(angle)),
        y: Math.round(cy + r * Math.sin(angle)),
        parentId: 'root',
      });
    });

    ring2Items.forEach((item, idx) => {
      const parentIdx = idx % Math.max(1, ring1Items.length);
      const parent = built[parentIdx];
      const baseAngle =
        (parentIdx / Math.max(1, ring1Items.length)) * Math.PI * 2 - Math.PI / 2;
      const offsetSlot = Math.floor(idx / Math.max(1, ring1Items.length));
      const spread = (offsetSlot % 2 === 0 ? 1 : -1) * (0.28 + Math.floor(offsetSlot / 2) * 0.16);
      const angle = baseAngle + spread;
      const r = 275;
      built.push({
        id: `n2-${idx}`,
        label: item.label,
        detail: item.detail,
        sourceName: item.sourceName,
        ring: 2,
        color: parent?.color || BRANCH_COLORS[idx % BRANCH_COLORS.length],
        x: Math.round(cx + r * Math.cos(angle)),
        y: Math.round(cy + r * Math.sin(angle)),
        parentId: parent?.id || 'root',
      });
    });

    return { nodes: built, totalConcepts: built.length };
  }, [sources, materials]);

  const filteredIds = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    if (!q) return null;
    return new Set(
      nodes
        .filter(
          (n) =>
            n.label.toLocaleLowerCase('tr-TR').includes(q) ||
            n.detail.toLocaleLowerCase('tr-TR').includes(q),
        )
        .map((n) => n.id),
    );
  }, [nodes, search]);

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedId) || nodes[0] || null,
    [nodes, selectedId],
  );

  const cx = 480;
  const cy = 310;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[88dvh] max-h-[820px] w-[calc(100vw-1.5rem)] max-w-6xl flex-col gap-0 overflow-hidden rounded-2xl border-border/80 bg-card p-0 shadow-2xl">
        <DialogHeader className="flex shrink-0 flex-row flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-muted/20 px-5 py-3.5 pr-12 text-left">
          <div className="min-w-0">
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-600 dark:text-cyan-400">
                <Network className="h-4 w-4" />
              </span>
              <span className="truncate">İnteraktif Kavram Haritası</span>
              <Badge variant="outline" className="text-[10px]">
                {totalConcepts} düğüm
              </Badge>
            </DialogTitle>
            <DialogDescription className="mt-0.5 text-xs">
              {notebookTitle} — Bir kavrama tıkla, özetini gör veya AI Öğretmen’e tek tıkla sor.
            </DialogDescription>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative w-44 sm:w-56">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Kavram ara..."
                className="h-8 rounded-xl pl-8 text-xs"
              />
            </div>
            <div className="flex items-center rounded-xl border border-border/70 bg-background/70 p-0.5">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setZoom((z) => Math.max(0.7, +(z - 0.15).toFixed(2)))}
                title="Uzaklaştır"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setZoom(1)}
                title="Sıfırla"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setZoom((z) => Math.min(1.45, +(z + 0.15).toFixed(2)))}
                title="Yakınlaştır"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        {nodes.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-500">
              <Network className="h-7 w-7" />
            </div>
            <h3 className="text-sm font-bold text-foreground">Henüz Haritalanacak Kavram Yok</h3>
            <p className="mt-1 max-w-md text-xs text-muted-foreground">
              Sol panelden en az bir ders notu, PDF veya slayt ekleyip seçtiğinde kavram zihin haritan otomatik olarak çıkarılır.
            </p>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-12">
            {/* SVG Interactive Canvas */}
            <div className="relative min-h-[340px] overflow-auto bg-[radial-gradient(circle_at_center,hsl(var(--primary)/0.06),transparent_70%)] p-3 lg:col-span-8">
              <svg
                viewBox="0 0 960 620"
                className="h-full w-full min-w-[680px] transition-transform duration-200"
                style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
              >
                {/* Connector lines */}
                {nodes.map((node) => {
                  const parent =
                    node.parentId === 'root'
                      ? { x: cx, y: cy }
                      : nodes.find((n) => n.id === node.parentId) || { x: cx, y: cy };
                  const dimmed = filteredIds !== null && !filteredIds.has(node.id);
                  const isActive = selectedNode?.id === node.id;
                  const midX = (parent.x + node.x) / 2;
                  const midY = (parent.y + node.y) / 2;
                  return (
                    <path
                      key={`edge-${node.id}`}
                      d={`M ${parent.x} ${parent.y} Q ${midX} ${parent.y} ${node.x} ${node.y}`}
                      fill="none"
                      stroke={node.color}
                      strokeOpacity={dimmed ? 0.12 : isActive ? 0.95 : 0.4}
                      strokeWidth={isActive ? 2.8 : node.ring === 1 ? 2 : 1.3}
                    />
                  );
                })}

                {/* Root center pill */}
                <g transform={`translate(${cx}, ${cy})`}>
                  <rect
                    x={-96}
                    y={-28}
                    width={192}
                    height={56}
                    rx={28}
                    className="fill-primary stroke-primary/30"
                    strokeWidth={6}
                  />
                  <text
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="fill-primary-foreground text-[13px] font-bold"
                  >
                    {notebookTitle.length > 22
                      ? `${notebookTitle.slice(0, 21)}…`
                      : notebookTitle}
                  </text>
                </g>

                {/* Concept nodes */}
                {nodes.map((node) => {
                  const dimmed = filteredIds !== null && !filteredIds.has(node.id);
                  const isActive = selectedNode?.id === node.id;
                  const shortLabel =
                    node.label.length > 22 ? `${node.label.slice(0, 21)}…` : node.label;
                  const pillW = Math.max(116, Math.min(186, shortLabel.length * 7.2 + 26));
                  const pillH = node.ring === 1 ? 38 : 32;
                  return (
                    <g
                      key={node.id}
                      transform={`translate(${node.x}, ${node.y})`}
                      onClick={() => setSelectedId(node.id)}
                      className="cursor-pointer transition-opacity"
                      style={{ opacity: dimmed ? 0.22 : 1 }}
                    >
                      <rect
                        x={-pillW / 2}
                        y={-pillH / 2}
                        width={pillW}
                        height={pillH}
                        rx={pillH / 2}
                        fill="hsl(var(--card))"
                        stroke={node.color}
                        strokeWidth={isActive ? 3 : 1.6}
                      />
                      <circle
                        cx={-pillW / 2 + 12}
                        cy={0}
                        r={4}
                        fill={node.color}
                      />
                      <text
                        x={6}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        className="fill-foreground text-[11px] font-semibold select-none"
                      >
                        {shortLabel}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Detail Inspector Side Card */}
            <aside className="flex flex-col justify-between border-t border-border/60 bg-muted/15 p-5 lg:col-span-4 lg:border-l lg:border-t-0">
              {selectedNode ? (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: selectedNode.color }}
                      />
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {selectedNode.ring === 1 ? 'Ana Konu Düğümü' : 'Alt Kavram'}
                      </span>
                    </div>
                    <h3 className="text-base font-bold leading-snug text-foreground">
                      {selectedNode.label}
                    </h3>
                    <div className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/70 px-2.5 py-1 text-[11px] text-muted-foreground">
                      <BookOpen className="h-3 w-3 text-primary" />
                      <span className="truncate max-w-[230px]">{selectedNode.sourceName}</span>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border/70 bg-card p-3.5 text-xs leading-relaxed text-foreground/90">
                    {selectedNode.detail}
                  </div>

                  <div className="space-y-2 pt-1">
                    <Button
                      type="button"
                      className="w-full gap-2 rounded-xl"
                      onClick={() => {
                        onOpenChange(false);
                        onAskTutor(
                          `"${selectedNode.label}" kavramını seçili kaynaklarıma dayanarak adım adım açıkla, somut örnek ver ve sınavda nasıl sorulabileceğini göster.`,
                        );
                      }}
                    >
                      <MessageSquareText className="h-4 w-4" />
                      AI Öğretmen’e Detaylı Sor
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full gap-2 rounded-xl text-xs"
                      onClick={() => {
                        onOpenChange(false);
                        onAskTutor(
                          `"${selectedNode.label}" konusunda beni 2 kısa soruyla test et; önce soruyu sor, ben cevaplayınca değerlendir.`,
                        );
                      }}
                    >
                      <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                      Bu Kavramdan Beni Test Et
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="mt-4 border-t border-border/60 pt-3">
                <p className="mb-2 text-[11px] font-semibold text-muted-foreground">
                  Hızlı Kavram Geçişi
                </p>
                <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto pr-1">
                  {nodes.map((n) => (
                    <button
                      key={`chip-${n.id}`}
                      type="button"
                      onClick={() => setSelectedId(n.id)}
                      className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                        selectedNode?.id === n.id
                          ? 'border-primary bg-primary/15 font-semibold text-primary'
                          : 'border-border/70 bg-background/70 text-muted-foreground hover:border-primary/40 hover:text-foreground'
                      }`}
                    >
                      {n.label.length > 26 ? `${n.label.slice(0, 25)}…` : n.label}
                    </button>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
