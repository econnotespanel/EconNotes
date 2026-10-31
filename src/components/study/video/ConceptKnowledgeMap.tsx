import React, { useState, useMemo } from 'react';
import {
  X,
  Network,
  Search,
  BookOpen,
  ArrowRight,
  ExternalLink,
  Sparkles,
  Layers,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Filter,
} from 'lucide-react';
import { StudioScene } from './sceneModel';

interface ConceptNode {
  id: string;
  label: string;
  definition: string;
  sceneIdx: number;
  sceneTitle: string;
  category: 'core' | 'policy' | 'market' | 'history' | 'formula';
  x: number;
  y: number;
  connections: string[];
}

interface ConceptKnowledgeMapProps {
  scenes: StudioScene[];
  allTerms: Array<{ term: string; definition: string; sceneIdx: number }>;
  onClose: () => void;
  onJumpToScene: (sceneIdx: number, timeSec?: number) => void;
  courseTitle?: string;
}

const CATEGORY_COLORS: Record<
  ConceptNode['category'],
  { bg: string; border: string; text: string; fill: string }
> = {
  core: { bg: 'bg-cyan-500/15', border: 'border-cyan-400/50', text: 'text-cyan-300', fill: '#22d3ee' },
  policy: { bg: 'bg-purple-500/15', border: 'border-purple-400/50', text: 'text-purple-300', fill: '#c084fc' },
  market: { bg: 'bg-emerald-500/15', border: 'border-emerald-400/50', text: 'text-emerald-300', fill: '#34d399' },
  history: { bg: 'bg-amber-500/15', border: 'border-amber-400/50', text: 'text-amber-300', fill: '#fbbf24' },
  formula: { bg: 'bg-rose-500/15', border: 'border-rose-400/50', text: 'text-rose-300', fill: '#f43f5e' },
};

export const ConceptKnowledgeMap: React.FC<ConceptKnowledgeMapProps> = ({
  scenes,
  allTerms,
  onClose,
  onJumpToScene,
  courseTitle = 'Ders Kavram Haritası',
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('all');
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  // Kavram Haritası Düğümlerini ve Bağlantılarını Otomatik Oluştur
  const { nodes, edges } = useMemo(() => {
    const rawTerms = allTerms.length > 0
      ? allTerms
      : scenes.flatMap((sc, idx) =>
          sc.keyTerms.map(kt => ({ term: kt.term, definition: kt.definition, sceneIdx: idx }))
        );

    // En fazla 18 anahtar kavram seç
    const uniqueTerms = rawTerms.slice(0, 18);
    const count = Math.max(1, uniqueTerms.length);

    // Dairesel / Organik Çift Halkalı Yerleşim
    const radiusInner = 180;
    const radiusOuter = 310;
    const centerX = 450;
    const centerY = 340;

    const generatedNodes: ConceptNode[] = uniqueTerms.map((item, i) => {
      const isOuter = i % 2 === 1;
      const r = isOuter ? radiusOuter : radiusInner;
      const angle = (i / count) * 2 * Math.PI - Math.PI / 2;
      const x = Math.round(centerX + r * Math.cos(angle));
      const y = Math.round(centerY + r * Math.sin(angle));

      const termLower = item.term.toLocaleLowerCase('tr-TR');
      let cat: ConceptNode['category'] = 'core';
      if (termLower.includes('vergi') || termLower.includes('iltizam') || termLower.includes('aşar') || termLower.includes('tımar') || termLower.includes('düyun')) {
        cat = 'history';
      } else if (termLower.includes('faiz') || termLower.includes('politika') || termLower.includes('enflasyon') || termLower.includes('para')) {
        cat = 'policy';
      } else if (termLower.includes('arz') || termLower.includes('talep') || termLower.includes('denge') || termLower.includes('piyasa') || termLower.includes('fiyat')) {
        cat = 'market';
      } else if (termLower.includes('eğri') || termLower.includes('rant') || termLower.includes('esneklik') || termLower.includes('fonksiyon')) {
        cat = 'formula';
      }

      const scene = scenes[item.sceneIdx] || scenes[0];

      return {
        id: `node-${i}`,
        label: item.term,
        definition: item.definition,
        sceneIdx: item.sceneIdx,
        sceneTitle: scene?.title || `Bölüm ${item.sceneIdx + 1}`,
        category: cat,
        x,
        y,
        connections: [],
      };
    });

    // Otomatik Anlamsal İlişkiler (Edges) Kur
    const edgeList: Array<{ from: string; to: string; id: string }> = [];
    for (let i = 0; i < generatedNodes.length; i++) {
      for (let j = i + 1; j < generatedNodes.length; j++) {
        const nodeA = generatedNodes[i];
        const nodeB = generatedNodes[j];

        // Aynı bölümde işlenen veya aynı kategorideki kavramları bağla
        const sameScene = nodeA.sceneIdx === nodeB.sceneIdx;
        const sameCategory = nodeA.category === nodeB.category;
        const sequential = Math.abs(i - j) === 1 || (i === 0 && j === generatedNodes.length - 1);

        if (sameScene || (sameCategory && sequential) || sequential) {
          edgeList.push({
            id: `edge-${nodeA.id}-${nodeB.id}`,
            from: nodeA.id,
            to: nodeB.id,
          });
          nodeA.connections.push(nodeB.id);
          nodeB.connections.push(nodeA.id);
        }
      }
    }

    return { nodes: generatedNodes, edges: edgeList };
  }, [allTerms, scenes]);

  const selectedNode = useMemo(() => {
    return nodes.find(n => n.id === selectedNodeId) || nodes[0] || null;
  }, [nodes, selectedNodeId]);

  const filteredNodes = useMemo(() => {
    const q = searchQuery.trim().toLocaleLowerCase('tr-TR');
    return nodes.filter(n => {
      const matchQuery =
        !q ||
        n.label.toLocaleLowerCase('tr-TR').includes(q) ||
        n.definition.toLocaleLowerCase('tr-TR').includes(q);
      const matchCat =
        activeCategoryFilter === 'all' || n.category === activeCategoryFilter;
      return matchQuery && matchCat;
    });
  }, [nodes, searchQuery, activeCategoryFilter]);

  const connectedNodeIds = useMemo(() => {
    if (!selectedNode) return new Set<string>();
    return new Set(selectedNode.connections);
  }, [selectedNode]);

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/85 p-2 sm:p-5 backdrop-blur-xl animate-in fade-in duration-200 select-none">
      <div className="relative flex h-full max-h-[920px] w-full max-w-[1300px] flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#070c18] shadow-2xl">
        {/* Üst Bar */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/[0.08] bg-[#090f20] px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-400 border border-cyan-400/30">
              <Network className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white tracking-tight flex items-center gap-2">
                <span>Akıllı Kavram Haritası</span>
                <span className="rounded-md bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-300 border border-cyan-400/20">
                  {nodes.length} Kavram · {edges.length} Bağlantı
                </span>
              </h2>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                Kavramlar arasındaki nedensellik, kuramsal ilişkiler ve ders bölümleri
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-1 rounded-xl border border-white/[0.08] bg-white/[0.02] p-0.5">
              <button
                onClick={() => setZoomLevel(z => Math.max(0.75, z - 0.1))}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-white/[0.06] hover:text-white"
                title="Uzaklaş"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
              <span className="px-1 text-[11px] font-mono text-slate-400">
                %{Math.round(zoomLevel * 100)}
              </span>
              <button
                onClick={() => setZoomLevel(z => Math.min(1.4, z + 0.1))}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-white/[0.06] hover:text-white"
                title="Yaklaş"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
            </div>

            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-400 hover:bg-rose-500/20 hover:text-rose-300 transition"
              title="Kapat (Esc)"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Ana Gövde: Sol Grafik Ağı, Sağ Kavram Müfettişi */}
        <div className="flex flex-1 min-h-0 flex-col lg:flex-row overflow-hidden">
          {/* Sol: İnteraktif Ağ Grafiği */}
          <div className="relative flex flex-1 flex-col overflow-hidden bg-[#050914]">
            {/* Arama & Kategori Filtre Çubuğu */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] bg-[#070d1d]/80 px-4 py-2.5 backdrop-blur-md">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Kavram veya tanım ara..."
                  className="h-8 w-full rounded-xl border border-white/10 bg-white/[0.04] pl-8 pr-3 text-xs text-white placeholder:text-slate-500 focus:border-cyan-400/50 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-1 overflow-x-auto text-[11px]">
                {[
                  { id: 'all', label: 'Tümü' },
                  { id: 'market', label: 'Piyasa & Arz-Talep' },
                  { id: 'policy', label: 'Para & Faiz' },
                  { id: 'history', label: 'Kurum & Tarih' },
                  { id: 'formula', label: 'Grafik & Eğri' },
                ].map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategoryFilter(cat.id)}
                    className={`rounded-lg px-2.5 py-1 font-medium transition whitespace-nowrap ${
                      activeCategoryFilter === cat.id
                        ? 'bg-cyan-500/20 text-cyan-300 font-semibold border border-cyan-400/30'
                        : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* SVG Ağ Tuvali */}
            <div className="relative flex-1 overflow-auto flex items-center justify-center p-4">
              <svg
                viewBox="0 0 900 680"
                className="h-full w-full max-h-[640px] max-w-[860px] transition-transform duration-200"
                style={{ transform: `scale(${zoomLevel})` }}
              >
                <defs>
                  {/* Işıma Filtresi */}
                  <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
                    <feGaussianBlur stdDeviation="4" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                  <linearGradient id="edgeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#c084fc" stopOpacity="0.4" />
                  </linearGradient>
                </defs>

                {/* Bağlantı Çizgileri (Edges) */}
                {edges.map(edge => {
                  const nodeA = nodes.find(n => n.id === edge.from);
                  const nodeB = nodes.find(n => n.id === edge.to);
                  if (!nodeA || !nodeB) return null;

                  const isConnectedToSelected =
                    selectedNode &&
                    (nodeA.id === selectedNode.id || nodeB.id === selectedNode.id);

                  return (
                    <line
                      key={edge.id}
                      x1={nodeA.x}
                      y1={nodeA.y}
                      x2={nodeB.x}
                      y2={nodeB.y}
                      stroke={isConnectedToSelected ? '#38bdf8' : 'rgba(255,255,255,0.12)'}
                      strokeWidth={isConnectedToSelected ? 2.5 : 1.2}
                      strokeDasharray={isConnectedToSelected ? undefined : '3 3'}
                      className="transition-all duration-300"
                    />
                  );
                })}

                {/* Düğümler (Nodes) */}
                {nodes.map(node => {
                  const isSelected = selectedNode?.id === node.id;
                  const isNeighbor = connectedNodeIds.has(node.id);
                  const isMatchingFilter = filteredNodes.some(fn => fn.id === node.id);
                  const theme = CATEGORY_COLORS[node.category];

                  return (
                    <g
                      key={node.id}
                      onClick={() => setSelectedNodeId(node.id)}
                      className="cursor-pointer transition-transform duration-200 hover:scale-110"
                      opacity={isMatchingFilter ? 1 : 0.25}
                    >
                      {/* Dış Halka & Seçim Işıması */}
                      {isSelected && (
                        <circle
                          cx={node.x}
                          cy={node.y}
                          r={34}
                          fill="none"
                          stroke={theme.fill}
                          strokeWidth={2}
                          strokeDasharray="4 4"
                          filter="url(#glow)"
                        />
                      )}

                      {/* Ana Düğüm Gövdesi */}
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={isSelected ? 26 : isNeighbor ? 22 : 18}
                        fill="#0b1329"
                        stroke={isSelected ? theme.fill : isNeighbor ? '#38bdf8' : 'rgba(255,255,255,0.25)'}
                        strokeWidth={isSelected ? 3 : 1.8}
                      />

                      {/* İç Kategori İkon Noktası */}
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={isSelected ? 9 : 6}
                        fill={theme.fill}
                      />

                      {/* Düğüm Etiketi */}
                      <text
                        x={node.x}
                        y={node.y + (isSelected ? 38 : 30)}
                        textAnchor="middle"
                        fill={isSelected ? '#ffffff' : '#94a3b8'}
                        fontSize={isSelected ? 12 : 10.5}
                        fontWeight={isSelected ? 'bold' : '500'}
                        className="pointer-events-none select-none drop-shadow-md"
                      >
                        {node.label}
                      </text>
                    </g>
                  );
                })}
              </svg>

              {/* Sol Alt Kılavuz */}
              <div className="absolute bottom-3 left-4 flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-[#090f22]/90 px-3 py-1.5 backdrop-blur-md text-[10px] text-slate-300">
                <span className="font-semibold text-white">Göstergeler:</span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" /> Piyasa & Denge
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-purple-400" /> Para & Faiz
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-amber-400" /> Kurum & Tarih
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-rose-400" /> Grafik & Rant
                </span>
              </div>
            </div>
          </div>

          {/* Sağ: Seçili Kavram Detay Kartı (Inspector) */}
          <div className="flex w-full lg:w-96 shrink-0 flex-col border-t lg:border-t-0 lg:border-l border-white/[0.08] bg-[#080d1b] p-5 overflow-y-auto space-y-4">
            {selectedNode ? (
              <div className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-200">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span
                      className={`rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${CATEGORY_COLORS[selectedNode.category].bg} ${CATEGORY_COLORS[selectedNode.category].text} border ${CATEGORY_COLORS[selectedNode.category].border}`}
                    >
                      Bölüm {selectedNode.sceneIdx + 1} Kavramı
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {selectedNode.connections.length} Bağlantılı Terim
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-white tracking-tight">
                    {selectedNode.label}
                  </h3>
                  <p className="text-xs text-cyan-300/90 font-medium">
                    {selectedNode.sceneTitle}
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-2">
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <BookOpen className="h-3.5 w-3.5 text-cyan-400" />
                    <span>Akademik Tanım</span>
                  </h4>
                  <p className="text-xs leading-relaxed text-slate-200">
                    {selectedNode.definition}
                  </p>
                </div>

                {/* Bağlantılı Diğer Kavramlar */}
                <div className="space-y-2">
                  <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    İlişkili Diğer Kavramlar ({selectedNode.connections.length})
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedNode.connections.map(targetId => {
                      const target = nodes.find(n => n.id === targetId);
                      if (!target) return null;
                      return (
                        <button
                          key={targetId}
                          onClick={() => setSelectedNodeId(targetId)}
                          className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-slate-300 transition hover:border-cyan-400/40 hover:bg-cyan-500/10 hover:text-white"
                        >
                          <span>{target.label}</span>
                          <ChevronRight className="h-3 w-3 text-slate-500" />
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Videoda İlgili Bölüme Git Butonu */}
                <div className="pt-2">
                  <button
                    onClick={() => {
                      onJumpToScene(selectedNode.sceneIdx);
                      onClose();
                    }}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2.5 text-xs font-bold text-slate-950 transition hover:brightness-110 shadow-lg"
                  >
                    <span>Bu Kavramın Anlatıldığı Bölümü İzle</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center text-slate-400 p-6">
                <Network className="h-10 w-10 text-slate-600 mb-3" />
                <p className="text-xs">
                  Detaylarını görmek için soldaki haritadan herhangi bir kavram düğümüne tıklayın.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConceptKnowledgeMap;
