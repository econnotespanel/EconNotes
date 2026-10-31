import React, { useState, useMemo } from 'react';
import {
  X,
  SlidersHorizontal,
  RotateCcw,
  Sparkles,
  TrendingUp,
  Activity,
  Layers,
  HelpCircle,
  ArrowRight,
  BookOpen,
  DollarSign,
  Maximize2,
  CheckCircle2,
  Scale,
  Globe,
  Coins,
  Percent,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface InteractiveEconomicsLabProps {
  onClose: () => void;
  onAskCoach?: (question: string) => void;
  courseTitle?: string;
}

export type SimMode = 'market' | 'macro' | 'fx' | 'fiscal';

export const InteractiveEconomicsLab: React.FC<InteractiveEconomicsLabProps> = ({
  onClose,
  onAskCoach,
  courseTitle = 'İktisat & İktisadi Modeller',
}) => {
  const [mode, setMode] = useState<SimMode>('market');

  // ==========================================
  // 1. MİKROEKONOMİ: ARZ - TALEP & PİYASA DENGESİ
  // ==========================================
  const [demandBase, setDemandBase] = useState<number>(120); // a
  const [demandSlope, setDemandSlope] = useState<number>(4); // b
  const [supplyBase, setSupplyBase] = useState<number>(20); // c
  const [supplySlope, setSupplySlope] = useState<number>(6); // d
  const [currentPrice, setCurrentPrice] = useState<number>(10); // P

  const eqPrice = useMemo(() => {
    const denom = demandSlope + supplySlope;
    if (denom === 0) return 10;
    return Math.max(1, Math.round(((demandBase - supplyBase) / denom) * 10) / 10);
  }, [demandBase, supplyBase, demandSlope, supplySlope]);

  const eqQuantity = useMemo(() => {
    return Math.max(1, Math.round(demandBase - demandSlope * eqPrice));
  }, [demandBase, demandSlope, eqPrice]);

  const qDemand = Math.max(0, Math.round(demandBase - demandSlope * currentPrice));
  const qSupply = Math.max(0, Math.round(supplyBase + supplySlope * currentPrice));
  const diffQ = qSupply - qDemand; // > 0: Fazla / Artık, < 0: Kıtlık

  const maxDemandP = demandSlope > 0 ? demandBase / demandSlope : 30;
  const minSupplyP = supplySlope > 0 ? Math.max(0, -supplyBase / supplySlope) : 0;

  const consumerSurplus = useMemo(() => {
    if (maxDemandP <= eqPrice) return 0;
    return Math.round(0.5 * (maxDemandP - eqPrice) * eqQuantity);
  }, [maxDemandP, eqPrice, eqQuantity]);

  const producerSurplus = useMemo(() => {
    if (eqPrice <= minSupplyP) return 0;
    return Math.round(0.5 * (eqPrice - minSupplyP) * eqQuantity);
  }, [eqPrice, minSupplyP, eqQuantity]);

  // ==========================================
  // 2. MAKROEKONOMİ: ENFLASYON & FAİZ (TAYLOR KURALI & FISHER)
  // ==========================================
  const [inflationRate, setInflationRate] = useState<number>(14); // % π
  const [targetInflation, setTargetInflation] = useState<number>(5); // % π*
  const [neutralRealRate, setNeutralRealRate] = useState<number>(2.5); // % r*
  const [outputGap, setOutputGap] = useState<number>(1.2); // % Y - Y*
  const [moneyGrowth, setMoneyGrowth] = useState<number>(18); // % ΔM

  // Taylor Kuralı: i = π + r* + 0.5(π - π*) + 0.5(Y - Y*)
  const taylorPolicyRate = useMemo(() => {
    const rate =
      inflationRate +
      neutralRealRate +
      0.5 * (inflationRate - targetInflation) +
      0.5 * outputGap;
    return Math.round(rate * 10) / 10;
  }, [inflationRate, neutralRealRate, targetInflation, outputGap]);

  // Fisher Denklemi Reel Faizi: r = i - π
  const realInterestRate = useMemo(() => {
    return Math.round((taylorPolicyRate - inflationRate) * 10) / 10;
  }, [taylorPolicyRate, inflationRate]);

  // Miktar Teorisi Beklenen Enflasyon: π ≈ ΔM - ΔY
  const expectedQuantityTheoryInflation = useMemo(() => {
    const gdpTrendGrowth = 4.0; // potansiyel büyüme
    return Math.max(0, Math.round((moneyGrowth - gdpTrendGrowth) * 10) / 10);
  }, [moneyGrowth]);

  // ==========================================
  // 3. AÇIK EKONOMİ: DÖVİZ KURU & FAİZ PARİTESİ (UIP & PPP)
  // ==========================================
  const [domesticRate, setDomesticRate] = useState<number>(36); // % i_TL
  const [foreignRate, setForeignRate] = useState<number>(4.5); // % i_USD
  const [cdsSpread, setCdsSpread] = useState<number>(260); // bps (2.6%)
  const [baseExchangeRate, setBaseExchangeRate] = useState<number>(34.0); // E_0
  const [domesticInflation, setDomesticInflation] = useState<number>(28); // % π_TR
  const [foreignInflation, setForeignInflation] = useState<number>(3); // % π_US

  // UIP Net Faiz Arbitrajı: i_TL - i_USD - CDS%
  const netCarryReturn = useMemo(() => {
    const cdsPct = cdsSpread / 100;
    return Math.round((domesticRate - foreignRate - cdsPct) * 10) / 10;
  }, [domesticRate, foreignRate, cdsSpread]);

  // Satın Alma Gücü Paritesi (PPP) Kuru: E_1 = E_0 * (1 + π_TR) / (1 + π_US)
  const pppExchangeRate = useMemo(() => {
    const ratio = (1 + domesticInflation / 100) / (1 + foreignInflation / 100);
    return Math.round(baseExchangeRate * ratio * 100) / 100;
  }, [baseExchangeRate, domesticInflation, foreignInflation]);

  // UIP Beklenen Denge Kuru: E_UIP = E_0 * (1 + (i_TL - i_USD - CDS%) / 100)
  const uipExpectedRate = useMemo(() => {
    const expectedDeprec = (domesticRate - foreignRate - cdsSpread / 100) / 100;
    return Math.round(baseExchangeRate * (1 + expectedDeprec) * 100) / 100;
  }, [baseExchangeRate, domesticRate, foreignRate, cdsSpread]);

  // ==========================================
  // 4. MALİYE & İLTİZAM AKIŞI
  // ==========================================
  const [agriculturalOutput, setAgriculturalOutput] = useState<number>(1000);
  const [taxRate, setTaxRate] = useState<number>(12);
  const [mültezimCut, setMültezimCut] = useState<number>(18);

  const grossTax = Math.round((agriculturalOutput * taxRate) / 100);
  const mültezimProfit = Math.round((grossTax * mültezimCut) / 100);
  const treasuryRevenue = grossTax - mültezimProfit;

  // SVG Çizim Sabitleri
  const svgW = 420;
  const svgH = 310;
  const padL = 40;
  const padB = 35;
  const padT = 20;
  const padR = 25;

  const maxPlotP = 28;
  const maxPlotQ = 180;

  const toSvgX = (q: number) => padL + (Math.max(0, Math.min(maxPlotQ, q)) / maxPlotQ) * (svgW - padL - padR);
  const toSvgY = (p: number) => svgH - padB - (Math.max(0, Math.min(maxPlotP, p)) / maxPlotP) * (svgH - padB - padT);

  const dStart = { x: toSvgX(demandBase - demandSlope * 24), y: toSvgY(24) };
  const dEnd = { x: toSvgX(demandBase - demandSlope * 2), y: toSvgY(2) };
  const sStart = { x: toSvgX(supplyBase + supplySlope * 2), y: toSvgY(2) };
  const sEnd = { x: toSvgX(supplyBase + supplySlope * 24), y: toSvgY(24) };

  const eqSvg = { x: toSvgX(eqQuantity), y: toSvgY(eqPrice) };
  const curDemandSvg = { x: toSvgX(qDemand), y: toSvgY(currentPrice) };
  const curSupplySvg = { x: toSvgX(qSupply), y: toSvgY(currentPrice) };

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/85 p-3 sm:p-6 backdrop-blur-xl animate-in fade-in duration-200 select-none font-sans text-slate-100">
      <div className="relative flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-cyan-500/30 bg-[#090e1c] shadow-2xl">
        {/* Üst Başlık Çubuğu */}
        <div className="flex shrink-0 items-center justify-between border-b border-white/[0.08] bg-[#0c1326] px-5 py-3.5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/15 border border-cyan-400/30 text-cyan-300">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">Akademik İktisat Simülasyon Laboratuvarı</h3>
                <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-cyan-300 border border-cyan-500/25">
                  Canlı Matematiksel Modeller
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Piyasa dengesi, Taylor kuralı, Fisher reel faizi ve faiz paritesi dinamiklerini etkileşimli deneyimleyin.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/[0.08] text-slate-400 hover:bg-white/[0.08] hover:text-white transition"
            title="Kapat"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Model Mod Seçici Tablar */}
        <div className="flex items-center gap-1.5 border-b border-white/[0.08] bg-[#080d1a] px-5 py-2 overflow-x-auto text-xs">
          {[
            { id: 'market', label: 'Arz - Talep & Piyasa Dengesi', icon: TrendingUp },
            { id: 'macro', label: 'Enflasyon & Politika Faizi (Taylor)', icon: Percent },
            { id: 'fx', label: 'Döviz Kuru & Faiz Paritesi (UIP/PPP)', icon: Globe },
            { id: 'fiscal', label: 'Kamu Maliyesi & İltizam Akışı', icon: Layers },
          ].map(tab => {
            const Icon = tab.icon;
            const active = mode === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setMode(tab.id as SimMode)}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 font-semibold transition whitespace-nowrap ${
                  active
                    ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/35 shadow-xs'
                    : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Ana İçerik */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 bg-[#060a14]">
          {/* ========================================================= */}
          {/* MOD 1: MİKROEKONOMİ ARZ - TALEP & PİYASA DENGESİ */}
          {/* ========================================================= */}
          {mode === 'market' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* Sol: İnteraktif Grafik Tuvali (SVG) */}
              <div className="lg:col-span-7 flex flex-col rounded-2xl border border-white/[0.08] bg-[#060a14] p-4 shadow-inner">
                <div className="flex items-center justify-between pb-2 border-b border-white/[0.06] text-xs">
                  <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
                    Piyasa Koordinat Düzlemi (Fiyat $P$ / Miktar $Q$)
                  </span>
                  <div className="flex items-center gap-3 text-[11px] font-mono">
                    <span className="text-cyan-300 font-bold">D: Talep</span>
                    <span className="text-amber-300 font-bold">S: Arz</span>
                    <span className="text-emerald-300 font-bold">E₀: ({eqPrice}₺, {eqQuantity} Adet)</span>
                  </div>
                </div>

                <div className="relative mt-2 w-full aspect-[4/3] flex items-center justify-center">
                  <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-full overflow-visible select-none">
                    <defs>
                      <linearGradient id="csGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.03" />
                      </linearGradient>
                      <linearGradient id="psGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.03" />
                      </linearGradient>
                    </defs>

                    {/* Izgara Çizgileri */}
                    {[5, 10, 15, 20, 25].map(p => (
                      <line
                        key={`gp-${p}`}
                        x1={padL}
                        y1={toSvgY(p)}
                        x2={svgW - padR}
                        y2={toSvgY(p)}
                        stroke="rgba(255,255,255,0.05)"
                        strokeDasharray="2 2"
                      />
                    ))}
                    {[40, 80, 120, 160].map(q => (
                      <line
                        key={`gq-${q}`}
                        x1={toSvgX(q)}
                        y1={padT}
                        x2={toSvgX(q)}
                        y2={svgH - padB}
                        stroke="rgba(255,255,255,0.05)"
                        strokeDasharray="2 2"
                      />
                    ))}

                    {/* Tüketici Rantı Üçgeni */}
                    {maxDemandP > eqPrice && (
                      <polygon
                        points={`${toSvgX(0)},${toSvgY(maxDemandP)} ${eqSvg.x},${eqSvg.y} ${toSvgX(0)},${eqSvg.y}`}
                        fill="url(#csGrad)"
                      />
                    )}

                    {/* Üretici Rantı Üçgeni */}
                    {eqPrice > minSupplyP && (
                      <polygon
                        points={`${toSvgX(0)},${toSvgY(minSupplyP)} ${eqSvg.x},${eqSvg.y} ${toSvgX(0)},${eqSvg.y}`}
                        fill="url(#psGrad)"
                      />
                    )}

                    {/* Denge İzdüşüm Çizgileri */}
                    <line x1={padL} y1={eqSvg.y} x2={eqSvg.x} y2={eqSvg.y} stroke="#34d399" strokeDasharray="3 3" />
                    <line x1={eqSvg.x} y1={eqSvg.y} x2={eqSvg.x} y2={svgH - padB} stroke="#34d399" strokeDasharray="3 3" />

                    {/* Talep Doğrusu (D) */}
                    <line x1={dStart.x} y1={dStart.y} x2={dEnd.x} y2={dEnd.y} stroke="#22d3ee" strokeWidth="2.5" />
                    <text x={dEnd.x + 8} y={dEnd.y + 4} fill="#22d3ee" fontSize="12" fontWeight="bold">D</text>

                    {/* Arz Doğrusu (S) */}
                    <line x1={sStart.x} y1={sStart.y} x2={sEnd.x} y2={sEnd.y} stroke="#f59e0b" strokeWidth="2.5" />
                    <text x={sEnd.x + 8} y={sEnd.y + 4} fill="#f59e0b" fontSize="12" fontWeight="bold">S</text>

                    {/* Denge Noktası E0 */}
                    <circle cx={eqSvg.x} cy={eqSvg.y} r="5" fill="#10b981" stroke="#ffffff" strokeWidth="2" />

                    {/* Eksenler */}
                    <line x1={padL} y1={svgH - padB} x2={svgW - padR} y2={svgH - padB} stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" />
                    <line x1={padL} y1={svgH - padB} x2={padL} y2={padT} stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" />
                    <text x={svgW - padR + 5} y={svgH - padB + 4} fill="#94a3b8" fontSize="11" fontWeight="bold">Q</text>
                    <text x={padL - 10} y={padT - 6} fill="#94a3b8" fontSize="11" fontWeight="bold">P</text>
                  </svg>
                </div>
              </div>

              {/* Sağ: Kontrol Parametreleri */}
              <div className="lg:col-span-5 flex flex-col space-y-4">
                <div className="rounded-2xl border border-white/[0.08] bg-[#070d1d] p-4 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                    Piyasa Parametreleri
                  </h4>

                  <div>
                    <div className="flex justify-between text-xs text-slate-300 mb-1">
                      <span>Piyasa Fiyatı (P)</span>
                      <span className="font-mono font-bold text-white">{currentPrice} ₺</span>
                    </div>
                    <input
                      type="range"
                      min="2"
                      max="22"
                      step="1"
                      value={currentPrice}
                      onChange={e => setCurrentPrice(Number(e.target.value))}
                      className="w-full accent-cyan-400"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs text-slate-300 mb-1">
                      <span>Talep Otonom Kayması (a)</span>
                      <span className="font-mono font-bold text-cyan-300">{demandBase}</span>
                    </div>
                    <input
                      type="range"
                      min="80"
                      max="180"
                      step="5"
                      value={demandBase}
                      onChange={e => setDemandBase(Number(e.target.value))}
                      className="w-full accent-cyan-400"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs text-slate-300 mb-1">
                      <span>Arz Otonom Kayması (c)</span>
                      <span className="font-mono font-bold text-amber-300">{supplyBase}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="60"
                      step="5"
                      value={supplyBase}
                      onChange={e => setSupplyBase(Number(e.target.value))}
                      className="w-full accent-amber-400"
                    />
                  </div>
                </div>

                {/* Piyasa Çıktı Kartı */}
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-300">Denge Fiyatı (P*):</span>
                    <span className="font-mono font-bold text-emerald-300">{eqPrice} ₺</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-300">Denge Miktarı (Q*):</span>
                    <span className="font-mono font-bold text-emerald-300">{eqQuantity} Adet</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-300">Tüketici Rantı (CS):</span>
                    <span className="font-mono text-cyan-300">{consumerSurplus} ₺</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-300">Üretici Rantı (PS):</span>
                    <span className="font-mono text-amber-300">{producerSurplus} ₺</span>
                  </div>
                  <div className="pt-2 border-t border-white/[0.06] text-[11px] text-slate-300 font-semibold">
                    Durum: {diffQ === 0 ? 'Tam Piyasa Temizliği (Denge)' : diffQ > 0 ? `Artık / Ürün Fazlası (${diffQ} adet)` : `Kıtlık / Talep Fazlası (${Math.abs(diffQ)} adet)`}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* MOD 2: MAKROEKONOMİ: ENFLASYON & POLİTİKA FAİZİ (TAYLOR) */}
          {/* ========================================================= */}
          {mode === 'macro' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              <div className="lg:col-span-7 flex flex-col rounded-2xl border border-white/[0.08] bg-[#060a14] p-5 space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-purple-300 flex items-center gap-1.5">
                    <Percent className="h-4 w-4" />
                    <span>Taylor Kuralı Politika Faizi Reaksiyon Modeli</span>
                  </h4>
                  <span className="font-mono text-xs text-purple-300 font-bold">
                    i = π + r* + 0.5(π - π*) + 0.5(Y - Y*)
                  </span>
                </div>

                {/* SVG Taylor Kuralı Eğrisi */}
                <div className="relative w-full aspect-[16/9] flex items-center justify-center rounded-xl bg-[#03060f] p-3 border border-white/[0.04]">
                  <svg viewBox="0 0 400 220" className="w-full h-full">
                    {/* Eksenler */}
                    <line x1="40" y1="180" x2="380" y2="180" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
                    <line x1="40" y1="180" x2="40" y2="20" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
                    <text x="350" y="200" fill="#94a3b8" fontSize="10">Enflasyon (π)</text>
                    <text x="15" y="30" fill="#94a3b8" fontSize="10">Faiz (i)</text>

                    {/* 45 Derece Nötr Çizgisi (i = π) */}
                    <line x1="40" y1="180" x2="320" y2="20" stroke="rgba(255,255,255,0.15)" strokeDasharray="3 3" />
                    <text x="325" y="30" fill="#64748b" fontSize="9">i = π (0 Reel Faiz)</text>

                    {/* Taylor Kuralı Tepki Doğrusu */}
                    <line x1="50" y1="165" x2="360" y2="35" stroke="#c084fc" strokeWidth="3" />
                    <text x="320" y="55" fill="#c084fc" fontSize="10" fontWeight="bold">Taylor Doğrusu</text>

                    {/* Dinamik Denge Noktası */}
                    {(() => {
                      const cx = 40 + (inflationRate / 30) * 320;
                      const cy = 180 - (taylorPolicyRate / 40) * 160;
                      return (
                        <g>
                          <line x1="40" y1={cy} x2={cx} y2={cy} stroke="#38bdf8" strokeDasharray="2 2" />
                          <line x1={cx} y1={cy} x2={cx} y2="180" stroke="#38bdf8" strokeDasharray="2 2" />
                          <circle cx={cx} cy={cy} r="6" fill="#38bdf8" stroke="#ffffff" strokeWidth="2" />
                          <text x={cx + 8} y={cy - 4} fill="#ffffff" fontSize="11" fontWeight="bold">
                            i* = %{taylorPolicyRate}
                          </text>
                        </g>
                      );
                    })()}
                  </svg>
                </div>

                {/* Formül ve Akademik Açıklama */}
                <div className="rounded-xl border border-purple-500/20 bg-purple-500/[0.06] p-3 text-xs space-y-1.5">
                  <div className="font-semibold text-purple-200">Fisher Denklemi & Reel Getiri:</div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Nominal Politika Faizi (%{taylorPolicyRate}) - Enflasyon (%{inflationRate}) ={' '}
                    <strong className={realInterestRate >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
                      Reel Faiz: %{realInterestRate}
                    </strong>
                    {realInterestRate < 0 && ' (Negatif reel faiz: Tasarruf cezalandırılır, harcama öne çekilir).'}
                  </p>
                </div>
              </div>

              {/* Sağ: Makro Parametre Kontrolleri */}
              <div className="lg:col-span-5 flex flex-col space-y-4">
                <div className="rounded-2xl border border-white/[0.08] bg-[#070d1d] p-4 space-y-3.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-purple-300">
                    Makroekonomik Girdiler
                  </h4>

                  <div>
                    <div className="flex justify-between text-xs text-slate-300 mb-1">
                      <span>Gerçekleşen / Beklenen Enflasyon (π)</span>
                      <span className="font-mono font-bold text-white">%{inflationRate}</span>
                    </div>
                    <input
                      type="range"
                      min="2"
                      max="30"
                      step="0.5"
                      value={inflationRate}
                      onChange={e => setInflationRate(Number(e.target.value))}
                      className="w-full accent-purple-400"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs text-slate-300 mb-1">
                      <span>Çıktı Açığı (Y - Y*)</span>
                      <span className="font-mono font-bold text-cyan-300">
                        {outputGap > 0 ? `+${outputGap}` : outputGap}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="-6"
                      max="6"
                      step="0.2"
                      value={outputGap}
                      onChange={e => setOutputGap(Number(e.target.value))}
                      className="w-full accent-cyan-400"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs text-slate-300 mb-1">
                      <span>Para Arzı Yıllık Artışı (ΔM)</span>
                      <span className="font-mono font-bold text-amber-300">%{moneyGrowth}</span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="40"
                      step="1"
                      value={moneyGrowth}
                      onChange={e => setMoneyGrowth(Number(e.target.value))}
                      className="w-full accent-amber-400"
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-purple-400/30 bg-purple-500/10 p-4 space-y-2 text-xs">
                  <div className="flex justify-between font-bold">
                    <span>Taylor Kuralı Tavsiye Faizi:</span>
                    <span className="font-mono text-purple-300 text-sm">%{taylorPolicyRate}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Miktar Teorisi Enflasyon Öngörüsü:</span>
                    <span className="font-mono text-amber-300">%{expectedQuantityTheoryInflation}</span>
                  </div>
                  <div className="pt-2 border-t border-white/[0.08] text-[11px] text-slate-300">
                    Merkez Bankası Duruşu:{' '}
                    <strong className="text-white">
                      {realInterestRate > 2
                        ? 'Sıkı Para Politikası (Şahin)'
                        : realInterestRate < 0
                        ? 'Gevşek Para Politikası (Güvercin)'
                        : 'Nötr Denge Politikası'}
                    </strong>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* MOD 3: DÖVİZ KURU & FAİZ PARİTESİ (UIP & PPP) */}
          {/* ========================================================= */}
          {mode === 'fx' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              <div className="lg:col-span-7 flex flex-col rounded-2xl border border-white/[0.08] bg-[#060a14] p-5 space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-300 flex items-center gap-1.5">
                    <Globe className="h-4 w-4" />
                    <span>Açık Faiz Paritesi (UIP) & Satın Alma Gücü (PPP)</span>
                  </h4>
                  <span className="font-mono text-xs text-emerald-300 font-bold">
                    ΔE^e ≈ i_TL - i_USD - CDS%
                  </span>
                </div>

                {/* Canlı Döviz ve Getiri Kartları */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-center">
                    <p className="text-[10px] uppercase font-bold text-slate-400">Başlangıç Spot Kur (E₀)</p>
                    <p className="text-lg font-bold text-white font-mono mt-1">{baseExchangeRate.toFixed(2)} ₺</p>
                  </div>
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-center">
                    <p className="text-[10px] uppercase font-bold text-emerald-300">UIP 1 Yıl Sonu Beklenti</p>
                    <p className="text-lg font-bold text-emerald-300 font-mono mt-1">{uipExpectedRate.toFixed(2)} ₺</p>
                  </div>
                  <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3 text-center">
                    <p className="text-[10px] uppercase font-bold text-cyan-300">PPP Enflasyon Denge Kuru</p>
                    <p className="text-lg font-bold text-cyan-300 font-mono mt-1">{pppExchangeRate.toFixed(2)} ₺</p>
                  </div>
                </div>

                {/* Sermaye Akımı ve Arbitraj Göstergesi */}
                <div className="rounded-xl border border-white/10 bg-[#080d1d] p-4 space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-slate-200">Net Carry Trade Arbitraj Getirisi:</span>
                    <span className={`font-mono font-bold text-sm ${netCarryReturn >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      %{netCarryReturn}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    {netCarryReturn > 5
                      ? '🟢 Yüksek TL faizi ve kontrol altındaki risk primi nedeniyle yabancı sermaye girişi güçlü. TL reel olarak değer kazanma eğiliminde.'
                      : netCarryReturn < 0
                      ? '🔴 Yurtiçi faiz yabancı getiri + risk primini karşılamıyor. Sermaye çıkışı ve döviz kurunda hızlı yükseliş riski yüksek.'
                      : '🟡 Faiz ve kur risk primi dengede. Carry trade arbitraj fırsatı sınırlı.'}
                  </p>
                </div>
              </div>

              {/* Sağ: Döviz Parametreleri */}
              <div className="lg:col-span-5 flex flex-col space-y-4">
                <div className="rounded-2xl border border-white/[0.08] bg-[#070d1d] p-4 space-y-3.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-300">
                    Faiz & Kur Değişkenleri
                  </h4>

                  <div>
                    <div className="flex justify-between text-xs text-slate-300 mb-1">
                      <span>Yurtiçi Politika Faizi (i_TL)</span>
                      <span className="font-mono font-bold text-white">%{domesticRate}</span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="60"
                      step="1"
                      value={domesticRate}
                      onChange={e => setDomesticRate(Number(e.target.value))}
                      className="w-full accent-emerald-400"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs text-slate-300 mb-1">
                      <span>Yurtdışı FED Faizi (i_USD)</span>
                      <span className="font-mono font-bold text-cyan-300">%{foreignRate}</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="8"
                      step="0.25"
                      value={foreignRate}
                      onChange={e => setForeignRate(Number(e.target.value))}
                      className="w-full accent-cyan-400"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs text-slate-300 mb-1">
                      <span>Ülke Risk Primi (CDS)</span>
                      <span className="font-mono font-bold text-amber-300">{cdsSpread} bps</span>
                    </div>
                    <input
                      type="range"
                      min="100"
                      max="700"
                      step="10"
                      value={cdsSpread}
                      onChange={e => setCdsSpread(Number(e.target.value))}
                      className="w-full accent-amber-400"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs text-slate-300 mb-1">
                      <span>Yurtiçi Yıllık Enflasyon (π_TR)</span>
                      <span className="font-mono font-bold text-purple-300">%{domesticInflation}</span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="60"
                      step="1"
                      value={domesticInflation}
                      onChange={e => setDomesticInflation(Number(e.target.value))}
                      className="w-full accent-purple-400"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* MOD 4: KAMU MALİYESİ & İLTİZAM AKIŞI */}
          {/* ========================================================= */}
          {mode === 'fiscal' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              <div className="lg:col-span-7 flex flex-col rounded-2xl border border-white/[0.08] bg-[#060a14] p-5 space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-300">
                  Osmanlı İltizam Sistemi & Vergi Akışı
                </h4>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                    <p className="text-[10px] text-slate-400">Reaya Üretimi</p>
                    <p className="text-base font-bold text-white mt-1 font-mono">{agriculturalOutput} Kile</p>
                  </div>
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                    <p className="text-[10px] text-amber-300">Mültezim Kâr Payı</p>
                    <p className="text-base font-bold text-amber-300 mt-1 font-mono">{mültezimProfit} ₺</p>
                  </div>
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                    <p className="text-[10px] text-emerald-300">Devlet Hazinesi Geliri</p>
                    <p className="text-base font-bold text-emerald-300 mt-1 font-mono">{treasuryRevenue} ₺</p>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-5 flex flex-col space-y-4">
                <div className="rounded-2xl border border-white/[0.08] bg-[#070d1d] p-4 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-amber-300">
                    Maliye Parametreleri
                  </h4>
                  <div>
                    <div className="flex justify-between text-xs text-slate-300 mb-1">
                      <span>Aşar Vergi Oranı</span>
                      <span className="font-mono font-bold text-white">%{taxRate}</span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="30"
                      step="1"
                      value={taxRate}
                      onChange={e => setTaxRate(Number(e.target.value))}
                      className="w-full accent-amber-400"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-slate-300 mb-1">
                      <span>Mültezim Komisyonu</span>
                      <span className="font-mono font-bold text-amber-300">%{mültezimCut}</span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="35"
                      step="1"
                      value={mültezimCut}
                      onChange={e => setMültezimCut(Number(e.target.value))}
                      className="w-full accent-amber-400"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default InteractiveEconomicsLab;
