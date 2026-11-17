import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  Eye,
  Flame,
  GripVertical,
  Landmark,
  Layers,
  Play,
  Plus,
  RotateCcw,
  ShieldAlert,
  Sliders,
  Trash2,
  TrendingUp,
  Zap,
} from 'lucide-react';
import {
  analyzeOptionStrategy,
  buildAnalystEstimateMomentum,
  buildDarkPoolSummary,
  buildGuidanceRevisions,
  buildOptionsChain,
  buildPeadHistory,
  buildUnusualOptionsScanner,
  evaluateVisualStrategy,
} from '../lib/quantEngine';
import type {
  AltDataPayload,
  InstitutionalHolder,
  MaxPainStrikePoint,
  OHLCVBar,
  OptionsFlowHeatmapCell,
  OptionStrategyPreset,
  PeadQuarterRecord,
  StockQuote,
  StrategyBlock,
  WhaleFiling13F,
} from '../types/market';
import { AltDataPanel } from './AltDataPanel';

export type QuantSubTab = 'options' | 'darkpool' | 'pead' | 'builder' | 'altdata';

interface QuantLabPanelProps {
  symbol: string;
  quote?: StockQuote;
  bars: OHLCVBar[];
  initialTab?: QuantSubTab;
  onTabChange?: (tab: QuantSubTab) => void;
  altData?: AltDataPayload | null;
  loadingAltData?: boolean;
  whales?: WhaleFiling13F[];
  institutions?: InstitutionalHolder[];
  onSelectSymbol?: (symbol: string) => void;
}

const PALETTE_BLOCKS: Omit<StrategyBlock, 'id'>[] = [
  { kind: 'entry', ruleType: 'sma_cross_above', label: 'SMA (15) > SMA (45) Cross', param: 15 },
  { kind: 'entry', ruleType: 'rsi_below', label: 'RSI (14) Oversold <', param: 35 },
  { kind: 'entry', ruleType: 'macd_hist_positive', label: 'MACD Histogram > 0', param: 0 },
  { kind: 'entry', ruleType: 'bb_upper_breakout', label: 'Close > Upper Bollinger', param: 20 },
  { kind: 'filter', ruleType: 'price_above_vwap', label: 'Price Above VWAP', param: 1 },
  { kind: 'filter', ruleType: 'volume_spike', label: 'Volume > N × Avg', param: 1.3 },
  { kind: 'filter', ruleType: 'adx_trending', label: 'ADX Trend Strength >=', param: 20 },
  { kind: 'exit', ruleType: 'rsi_above_exit', label: 'Exit RSI (14) >=', param: 70 },
  { kind: 'exit', ruleType: 'stop_loss_pct', label: 'Stop Loss (%)', param: 4 },
  { kind: 'exit', ruleType: 'take_profit_pct', label: 'Take Profit (%)', param: 8 },
];

export const QuantLabPanel: React.FC<QuantLabPanelProps> = ({
  symbol,
  quote,
  bars,
  initialTab = 'options',
  onTabChange,
  altData = null,
  loadingAltData = false,
  whales = [],
  institutions = [],
  onSelectSymbol,
}) => {
  const [subTab, setSubTab] = useState<QuantSubTab>(initialTab);
  const [selectedDte, setSelectedDte] = useState<number>(30);
  const [optPreset, setOptPreset] = useState<OptionStrategyPreset>('iron_condor');
  const [wingWidthPct, setWingWidthPct] = useState<number>(6);
  const [optContracts, setOptContracts] = useState<number>(2);
  const [uoaFilter, setUoaFilter] = useState<'ALL' | 'SWEEP' | 'BLOCK'>('ALL');
  const [dpFilter, setDpFilter] = useState<'ALL' | 'Accumulation' | 'Distribution'>('ALL');
  const [hoveredFlowCell, setHoveredFlowCell] = useState<OptionsFlowHeatmapCell | null>(null);
  const spotPrice = quote?.price ?? (bars.length ? bars[bars.length - 1].close : 220);

  useEffect(() => {
    setSubTab(initialTab);
  }, [initialTab]);

  const changeTab = (next: QuantSubTab) => {
    setSubTab(next);
    onTabChange?.(next);
  };

  // Estimate realized vol from historical bars to anchor options IV
  const realizedVol = useMemo(() => {
    if (bars.length < 15) return 0.28;
    const rets = bars.slice(1).map((b, i) => Math.log(b.close / Math.max(0.01, bars[i].close)));
    const sd = Math.sqrt(rets.reduce((a, r) => a + r * r, 0) / rets.length);
    return Number(Math.min(0.85, Math.max(0.14, sd * Math.sqrt(252) * 1.12)).toFixed(3));
  }, [bars]);

  const optionsData = useMemo(
    () => buildOptionsChain(symbol, spotPrice, selectedDte, realizedVol),
    [symbol, spotPrice, selectedDte, realizedVol]
  );

  const strategyAnalysis = useMemo(
    () =>
      analyzeOptionStrategy({
        spot: spotPrice,
        preset: optPreset,
        dte: selectedDte,
        baseIv: realizedVol,
        wingWidthPct,
        contracts: optContracts,
      }),
    [spotPrice, optPreset, selectedDte, realizedVol, wingWidthPct, optContracts]
  );

  const uoaScanner = useMemo(
    () =>
      buildUnusualOptionsScanner(symbol, spotPrice).filter(
        (row) => uoaFilter === 'ALL' || row.executionType === uoaFilter
      ),
    [symbol, spotPrice, uoaFilter]
  );

  const darkPool = useMemo(
    () => buildDarkPoolSummary(symbol, spotPrice, quote?.avgVolume ?? 24000000),
    [symbol, spotPrice, quote?.avgVolume]
  );

  const peadHistory = useMemo(() => buildPeadHistory(symbol), [symbol]);
  const guidanceRevisions = useMemo(() => buildGuidanceRevisions(symbol, spotPrice), [symbol, spotPrice]);
  const estimateMomentum = useMemo(() => buildAnalystEstimateMomentum(symbol, spotPrice), [symbol, spotPrice]);

  // Visual Drag-and-Drop Strategy Builder State
  const [strategyBlocks, setStrategyBlocks] = useState<StrategyBlock[]>([
    { id: 'blk-1', kind: 'entry', ruleType: 'sma_cross_above', label: 'SMA (15) > SMA (45) Cross', param: 15 },
    { id: 'blk-2', kind: 'filter', ruleType: 'adx_trending', label: 'ADX Trend Strength >=', param: 18 },
    { id: 'blk-3', kind: 'exit', ruleType: 'stop_loss_pct', label: 'Stop Loss (%)', param: 5 },
    { id: 'blk-4', kind: 'exit', ruleType: 'take_profit_pct', label: 'Take Profit (%)', param: 10 },
  ]);
  const [draggedTemplateIdx, setDraggedTemplateIdx] = useState<number | null>(null);
  const [dragOverCanvas, setDragOverCanvas] = useState(false);

  const customBacktest = useMemo(
    () => evaluateVisualStrategy(bars, strategyBlocks),
    [bars, strategyBlocks]
  );

  const addTemplateBlock = (tpl: Omit<StrategyBlock, 'id'>) => {
    setStrategyBlocks((prev) => [
      ...prev,
      { ...tpl, id: `blk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` },
    ]);
  };

  const handleDropOnCanvas = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverCanvas(false);
    if (draggedTemplateIdx !== null && PALETTE_BLOCKS[draggedTemplateIdx]) {
      addTemplateBlock(PALETTE_BLOCKS[draggedTemplateIdx]);
      setDraggedTemplateIdx(null);
    }
  };

  const posPead = peadHistory.filter((q) => q.epsSurprisePct > 0);
  const negPead = peadHistory.filter((q) => q.epsSurprisePct <= 0);
  const avgField = (arr: typeof peadHistory, k: keyof (typeof peadHistory)[0]) =>
    arr.length ? Number((arr.reduce((s, r) => s + Number(r[k]), 0) / arr.length).toFixed(2)) : 0;

  return (
    <div className="space-y-4">
      {/* Sub-navigation */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-subtle)] p-1">
          {(
            [
              { id: 'options', label: 'Options, IV & Flow Heatmap' },
              { id: 'darkpool', label: 'Dark Pool, Short Int & 13F' },
              { id: 'pead', label: 'Earnings, PEAD & Guidance' },
              { id: 'builder', label: 'Visual Strategy Builder' },
              { id: 'altdata', label: 'Alternative Data' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              data-vim-tab={t.id}
              onClick={() => changeTab(t.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                subTab === t.id
                  ? 'bg-[var(--surface-panel)] text-[var(--text-primary)] shadow-xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <span className="text-xs font-mono text-[var(--text-muted)]">
          Underlying: {symbol} · Spot {spotPrice.toFixed(2)}
        </span>
      </div>

      {/* 1. OPTIONS CHAIN (with Rho), 3D IV SURFACE, STRATEGY BUILDER + PoP & UOA SCANNER */}
      {subTab === 'options' && (
        <div className="space-y-4">
          {/* Options Summary & Expiration Selector */}
          <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-6 text-xs font-mono tabular-nums">
              <div>
                <div className="font-sans text-[11px] text-[var(--text-muted)]">IV Rank</div>
                <div className="text-base font-bold text-sky-500">{optionsData.ivRank}%</div>
              </div>
              <div>
                <div className="font-sans text-[11px] text-[var(--text-muted)]">Put / Call OI</div>
                <div className="text-base font-bold">{optionsData.putCallOIRatio.toFixed(2)}x</div>
              </div>
              <div>
                <div className="font-sans text-[11px] text-[var(--text-muted)]">Max Pain Strike</div>
                <div className="text-base font-bold text-amber-500">${optionsData.maxPainStrike.toFixed(2)}</div>
              </div>
              <div>
                <div className="font-sans text-[11px] text-[var(--text-muted)]">Realized Vol (Hist)</div>
                <div className="text-base font-bold">{(realizedVol * 100).toFixed(1)}%</div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1">
              {optionsData.expirations.map((exp) => (
                <button
                  key={exp.dte}
                  type="button"
                  onClick={() => setSelectedDte(exp.dte)}
                  className={`px-2.5 py-1 text-xs font-mono rounded transition-colors ${
                    selectedDte === exp.dte
                      ? 'bg-sky-600 text-white font-semibold'
                      : 'bg-[var(--surface-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {exp.label}
                </button>
              ))}
            </div>
          </div>

          {/* Options Chain Table (Calls | Strike | Puts) with Delta, Gamma, Theta, Vega, Rho */}
          <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] overflow-hidden">
            <div className="px-4 py-2.5 border-b border-[var(--border-hairline)] flex items-center justify-between text-xs">
              <span className="font-semibold">Black-Scholes Options Chain &amp; 5 Greeks ({selectedDte} DTE)</span>
              <span className="font-mono text-[11px] text-[var(--text-muted)]">Calls (Left) · Strike · Puts (Right)</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-[11px] font-mono tabular-nums">
                <thead className="border-b border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-[var(--text-muted)]">
                  <tr>
                    <th className="py-2 px-1.5">OI</th>
                    <th className="py-2 px-1.5">IV%</th>
                    <th className="py-2 px-1.5">Delta</th>
                    <th className="py-2 px-1.5">Gamma</th>
                    <th className="py-2 px-1.5">Theta</th>
                    <th className="py-2 px-1.5">Vega</th>
                    <th className="py-2 px-1.5">Rho</th>
                    <th className="py-2 px-2">Bid/Ask</th>
                    <th className="py-2 px-3 text-center bg-sky-500/10 text-sky-500 font-bold">Strike</th>
                    <th className="py-2 px-2">Bid/Ask</th>
                    <th className="py-2 px-1.5">Rho</th>
                    <th className="py-2 px-1.5">Vega</th>
                    <th className="py-2 px-1.5">Theta</th>
                    <th className="py-2 px-1.5">Gamma</th>
                    <th className="py-2 px-1.5">Delta</th>
                    <th className="py-2 px-1.5">IV%</th>
                    <th className="py-2 px-1.5">OI</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-hairline)]">
                  {optionsData.calls.map((c, idx) => {
                    const p = optionsData.puts[idx];
                    return (
                      <tr key={c.strike} className="hover:bg-[var(--surface-subtle)]/50">
                        <td className={`py-1.5 px-1.5 ${c.inTheMoney ? 'bg-emerald-500/8' : ''}`}>{c.openInterest.toLocaleString()}</td>
                        <td className={`py-1.5 px-1.5 ${c.inTheMoney ? 'bg-emerald-500/8' : ''}`}>{(c.impliedVolatility * 100).toFixed(1)}%</td>
                        <td className={`py-1.5 px-1.5 text-emerald-500 ${c.inTheMoney ? 'bg-emerald-500/8' : ''}`}>{c.delta.toFixed(2)}</td>
                        <td className={`py-1.5 px-1.5 ${c.inTheMoney ? 'bg-emerald-500/8' : ''}`}>{c.gamma.toFixed(3)}</td>
                        <td className={`py-1.5 px-1.5 text-red-400 ${c.inTheMoney ? 'bg-emerald-500/8' : ''}`}>{c.theta.toFixed(2)}</td>
                        <td className={`py-1.5 px-1.5 ${c.inTheMoney ? 'bg-emerald-500/8' : ''}`}>{c.vega.toFixed(2)}</td>
                        <td className={`py-1.5 px-1.5 text-sky-400 ${c.inTheMoney ? 'bg-emerald-500/8' : ''}`}>{c.rho.toFixed(3)}</td>
                        <td className={`py-1.5 px-2 font-semibold ${c.inTheMoney ? 'bg-emerald-500/8' : ''}`}>
                          {c.bid.toFixed(2)}/{c.ask.toFixed(2)}
                        </td>
                        <td className="py-1.5 px-3 text-center font-bold bg-sky-500/10 text-[var(--text-primary)]">
                          {c.strike.toFixed(2)}
                        </td>
                        <td className={`py-1.5 px-2 font-semibold ${p.inTheMoney ? 'bg-red-500/8' : ''}`}>
                          {p.bid.toFixed(2)}/{p.ask.toFixed(2)}
                        </td>
                        <td className={`py-1.5 px-1.5 text-sky-400 ${p.inTheMoney ? 'bg-red-500/8' : ''}`}>{p.rho.toFixed(3)}</td>
                        <td className={`py-1.5 px-1.5 ${p.inTheMoney ? 'bg-red-500/8' : ''}`}>{p.vega.toFixed(2)}</td>
                        <td className={`py-1.5 px-1.5 text-red-400 ${p.inTheMoney ? 'bg-red-500/8' : ''}`}>{p.theta.toFixed(2)}</td>
                        <td className={`py-1.5 px-1.5 ${p.inTheMoney ? 'bg-red-500/8' : ''}`}>{p.gamma.toFixed(3)}</td>
                        <td className={`py-1.5 px-1.5 text-red-500 ${p.inTheMoney ? 'bg-red-500/8' : ''}`}>{p.delta.toFixed(2)}</td>
                        <td className={`py-1.5 px-1.5 ${p.inTheMoney ? 'bg-red-500/8' : ''}`}>{(p.impliedVolatility * 100).toFixed(1)}%</td>
                        <td className={`py-1.5 px-1.5 ${p.inTheMoney ? 'bg-red-500/8' : ''}`}>{p.openInterest.toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 3D Interactive IV Surface + Volatility Skew/Smile */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <IvSurface3D
              dtes={optionsData.ivSurface.dtes}
              strikes={optionsData.ivSurface.strikes}
              grid={optionsData.ivSurface.grid}
            />

            <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-4 flex flex-col justify-between space-y-3">
              <div>
                <h3 className="text-xs font-semibold mb-1">Volatility Skew / Smile ({selectedDte}D Calls vs Puts)</h3>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Term structure skew across strikes · Drag the 3D surface on the left to inspect vol convexity
                </p>
              </div>
              <VolSmileSvg calls={optionsData.calls} puts={optionsData.puts} />
            </div>
          </div>

          {/* Options Flow Heatmap + Max Pain Intrinsic Distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Flame className="w-4 h-4 text-sky-500" aria-hidden="true" />
                    Options Flow Heatmap (Net Call / Put Premium by Strike &amp; Tenor)
                  </h3>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Green = Net Call Premium Inflow · Red = Net Put Premium Inflow · Hover or focus cell for gamma notional
                  </p>
                </div>
                {hoveredFlowCell && (
                  <div className="text-[11px] font-mono text-[var(--text-primary)]">
                    ${hoveredFlowCell.strike} ({hoveredFlowCell.dte}D): Net{' '}
                    <span className={hoveredFlowCell.netFlowUsd >= 0 ? 'text-emerald-500 font-bold' : 'text-red-500 font-bold'}>
                      {hoveredFlowCell.netFlowUsd >= 0 ? '+' : '-'}${(Math.abs(hoveredFlowCell.netFlowUsd) / 1e6).toFixed(2)}M
                    </span>{' '}
                    · {hoveredFlowCell.sweepCount} sweeps · Γ ${hoveredFlowCell.gammaNotionalM}M
                  </div>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-center text-[11px] font-mono tabular-nums border-collapse">
                  <thead>
                    <tr className="text-[var(--text-muted)] border-b border-[var(--border-hairline)]">
                      <th className="py-1.5 px-2 text-left">Strike \ Tenor</th>
                      {optionsData.flowHeatmap.dtes.map((d) => (
                        <th key={d} className="py-1.5 px-2">
                          {d}D
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {optionsData.flowHeatmap.strikes.map((st) => {
                      const isNearSpot = Math.abs(st - spotPrice) <= spotPrice * 0.018;
                      return (
                        <tr key={st} className="border-t border-[var(--border-hairline)]/60">
                          <td className={`py-1.5 px-2 text-left font-bold ${isNearSpot ? 'text-sky-500' : ''}`}>
                            ${st.toFixed(0)} {isNearSpot ? '· Spot' : ''}
                          </td>
                          {optionsData.flowHeatmap.dtes.map((dte) => {
                            const cell = optionsData.flowHeatmap.cells.find(
                              (c) => c.strike === st && c.dte === dte
                            );
                            if (!cell) return <td key={dte}>—</td>;
                            const mag = Math.min(1, Math.abs(cell.netFlowUsd) / 750000);
                            const bgStyle =
                              cell.netFlowUsd >= 0
                                ? `rgba(16, 185, 129, ${(0.12 + mag * 0.48).toFixed(2)})`
                                : `rgba(239, 68, 68, ${(0.12 + mag * 0.48).toFixed(2)})`;
                            return (
                              <td
                                key={dte}
                                tabIndex={0}
                                onMouseEnter={() => setHoveredFlowCell(cell)}
                                onFocus={() => setHoveredFlowCell(cell)}
                                style={{ backgroundColor: bgStyle }}
                                className="py-1.5 px-2 border border-[var(--border-hairline)]/40 cursor-pointer focus:outline-2 focus:outline-sky-500"
                              >
                                <div className="font-semibold">
                                  {cell.netFlowUsd >= 0 ? '+' : '-'}${(Math.abs(cell.netFlowUsd) / 1000).toFixed(0)}K
                                </div>
                                {cell.sweepCount > 0 && (
                                  <div className="text-[9px] opacity-80">{cell.sweepCount} sweeps</div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="lg:col-span-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-4 flex flex-col justify-between space-y-3">
              <div>
                <h3 className="text-sm font-semibold">Max Pain Intrinsic Distribution ({selectedDte}D)</h3>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Minimum aggregate option buyer payoff occurs at{' '}
                  <strong className="font-mono text-amber-500">${optionsData.maxPainStrike.toFixed(2)}</strong>
                </p>
              </div>
              <MaxPainCurveSvg
                curve={optionsData.maxPainCurve}
                maxPainStrike={optionsData.maxPainStrike}
                spotPrice={spotPrice}
              />
            </div>
          </div>

          {/* Multi-Leg Options Strategy Builder + PoP Calculator */}
          <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-sky-500" aria-hidden="true" />
                  Options Strategy Builder &amp; Probability of Profit (PoP)
                </h3>
                <p className="text-xs text-[var(--text-muted)]">
                  {strategyAnalysis.name} · Black-Scholes log-normal PoP integration
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <select
                  aria-label="Options strategy preset"
                  value={optPreset}
                  onChange={(e) => setOptPreset(e.target.value as OptionStrategyPreset)}
                  className="rounded border border-[var(--border-hairline)] bg-[var(--surface-subtle)] px-2.5 py-1.5 font-medium"
                >
                  <option value="iron_condor">Iron Condor</option>
                  <option value="iron_butterfly">Iron Butterfly</option>
                  <option value="long_straddle">Long Straddle</option>
                  <option value="long_strangle">Long Strangle</option>
                  <option value="calendar_spread">Calendar Spread</option>
                </select>
                <label className="flex items-center gap-1.5 font-mono text-[11px] text-[var(--text-muted)]">
                  Wing %
                  <input
                    type="number"
                    min={2}
                    max={20}
                    value={wingWidthPct}
                    onChange={(e) => setWingWidthPct(Math.max(2, Math.min(20, Number(e.target.value) || 5)))}
                    className="w-14 rounded border border-[var(--border-hairline)] bg-transparent px-2 py-1 text-right text-[var(--text-primary)]"
                  />
                </label>
                <label className="flex items-center gap-1.5 font-mono text-[11px] text-[var(--text-muted)]">
                  Qty
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={optContracts}
                    onChange={(e) => setOptContracts(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                    className="w-14 rounded border border-[var(--border-hairline)] bg-transparent px-2 py-1 text-right text-[var(--text-primary)]"
                  />
                </label>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs font-mono tabular-nums">
              <div className="rounded border border-[var(--border-hairline)] p-2.5">
                <div className="font-sans text-[11px] text-[var(--text-muted)]">Prob. of Profit</div>
                <div className="mt-0.5 text-base font-bold text-sky-500">{strategyAnalysis.probOfProfitPct}%</div>
              </div>
              <div className="rounded border border-[var(--border-hairline)] p-2.5">
                <div className="font-sans text-[11px] text-[var(--text-muted)]">Net Credit / Debit</div>
                <div
                  className={`mt-0.5 text-base font-bold ${
                    strategyAnalysis.netCreditOrDebit >= 0 ? 'text-emerald-500' : 'text-amber-500'
                  }`}
                >
                  {strategyAnalysis.netCreditOrDebit >= 0 ? '+' : '-'}$
                  {Math.abs(strategyAnalysis.netCreditOrDebit).toFixed(0)}
                </div>
              </div>
              <div className="rounded border border-[var(--border-hairline)] p-2.5">
                <div className="font-sans text-[11px] text-[var(--text-muted)]">Max Profit</div>
                <div className="mt-0.5 text-base font-bold text-emerald-500">
                  {strategyAnalysis.maxProfit === 'Unlimited' ? 'Unlimited' : `$${strategyAnalysis.maxProfit.toFixed(0)}`}
                </div>
              </div>
              <div className="rounded border border-[var(--border-hairline)] p-2.5">
                <div className="font-sans text-[11px] text-[var(--text-muted)]">Max Loss</div>
                <div className="mt-0.5 text-base font-bold text-red-500">
                  {strategyAnalysis.maxLoss === 'Unlimited' ? 'Unlimited' : `-$${strategyAnalysis.maxLoss.toFixed(0)}`}
                </div>
              </div>
              <div className="rounded border border-[var(--border-hairline)] p-2.5">
                <div className="font-sans text-[11px] text-[var(--text-muted)]">Breakeven(s)</div>
                <div className="mt-0.5 text-xs font-bold">
                  {strategyAnalysis.breakevens.length ? strategyAnalysis.breakevens.map((b) => `$${b}`).join(' · ') : 'N/A'}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-center">
              <div className="lg:col-span-3">
                <PayoffCurveSvg curve={strategyAnalysis.payoffCurve} spot={spotPrice} />
              </div>
              <div className="lg:col-span-2 space-y-2">
                <div className="text-[11px] font-mono text-[var(--text-muted)] flex flex-wrap gap-3 pb-1 border-b border-[var(--border-hairline)]">
                  <span>Δ {strategyAnalysis.netGreeks.delta}</span>
                  <span>Γ {strategyAnalysis.netGreeks.gamma}</span>
                  <span>Θ ${strategyAnalysis.netGreeks.theta}/d</span>
                  <span>V ${strategyAnalysis.netGreeks.vega}</span>
                  <span>ρ ${strategyAnalysis.netGreeks.rho}</span>
                </div>
                <table className="w-full text-left text-[11px] font-mono tabular-nums">
                  <thead className="text-[var(--text-muted)] border-b border-[var(--border-hairline)]">
                    <tr>
                      <th className="py-1">Leg</th>
                      <th className="py-1 text-right">Strike</th>
                      <th className="py-1 text-right">DTE</th>
                      <th className="py-1 text-right">Prem</th>
                      <th className="py-1 text-right">IV%</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-hairline)]">
                    {strategyAnalysis.legs.map((leg, i) => (
                      <tr key={i}>
                        <td className={`py-1 font-semibold ${leg.action === 'BUY' ? 'text-emerald-500' : 'text-red-500'}`}>
                          {leg.action} {leg.contracts} {leg.type.toUpperCase()}
                        </td>
                        <td className="py-1 text-right">${leg.strike.toFixed(2)}</td>
                        <td className="py-1 text-right">{leg.dte}d</td>
                        <td className="py-1 text-right">${leg.premium.toFixed(2)}</td>
                        <td className="py-1 text-right">{leg.iv}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Unusual Options Activity (UOA) Scanner */}
          <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border-hairline)] flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" aria-hidden="true" />
                Unusual Options Activity (UOA) Flow Scanner
              </h3>
              <div className="flex items-center gap-1">
                {(['ALL', 'SWEEP', 'BLOCK'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setUoaFilter(f)}
                    className={`px-2.5 py-1 text-[11px] font-mono rounded ${
                      uoaFilter === f
                        ? 'bg-sky-600 text-white font-semibold'
                        : 'bg-[var(--surface-subtle)] text-[var(--text-muted)]'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono tabular-nums">
                <thead className="border-b border-[var(--border-hairline)] bg-[var(--surface-subtle)] font-sans text-[var(--text-muted)]">
                  <tr>
                    <th className="py-2 px-3">Ticker</th>
                    <th className="py-2 px-3">Contract</th>
                    <th className="py-2 px-3">Exp (DTE)</th>
                    <th className="py-2 px-3 text-right">Volume / OI</th>
                    <th className="py-2 px-3 text-right">Vol/OI</th>
                    <th className="py-2 px-3 text-right">IV%</th>
                    <th className="py-2 px-3 text-right">Premium</th>
                    <th className="py-2 px-3 text-right">Execution · Bias</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-hairline)]">
                  {uoaScanner.map((row) => (
                    <tr key={row.id} className="hover:bg-[var(--surface-subtle)]/50">
                      <td className="py-2 px-3">
                        <button
                          type="button"
                          onClick={() => onSelectSymbol?.(row.symbol)}
                          className="font-bold text-sky-500 hover:underline"
                        >
                          {row.symbol}
                        </button>
                      </td>
                      <td className="py-2 px-3">
                        ${row.strike} {row.type}
                      </td>
                      <td className="py-2 px-3 text-[var(--text-muted)]">
                        {row.expiration} ({row.dte}d)
                      </td>
                      <td className="py-2 px-3 text-right">
                        {row.volume.toLocaleString()} / {row.openInterest.toLocaleString()}
                      </td>
                      <td className="py-2 px-3 text-right font-bold text-amber-500">{row.volOiRatio}x</td>
                      <td className="py-2 px-3 text-right">{row.impliedVolPct}%</td>
                      <td className="py-2 px-3 text-right font-semibold">${(row.premiumUsd / 1e6).toFixed(2)}M</td>
                      <td
                        className={`py-2 px-3 text-right font-sans font-semibold ${
                          row.sentiment === 'Bullish' ? 'text-emerald-500' : 'text-red-500'
                        }`}
                      >
                        {row.executionType} · {row.sentiment}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 2. ALTERNATIVE DATA INTEGRATION */}
      {subTab === 'altdata' && (
        <AltDataPanel
          symbol={symbol}
          data={altData}
          loading={loadingAltData}
          onSelectSymbol={(s) => onSelectSymbol?.(s)}
        />
      )}

      {/* 3. DARK POOL, SHORT INTEREST (DAYS-TO-COVER) & 13F INSTITUTIONAL TRACKING */}
      {subTab === 'darkpool' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-4">
              <div className="text-xs text-[var(--text-muted)]">Off-Exchange Dark Pool Share</div>
              <div className="mt-1 text-xl font-mono font-bold tabular-nums">{darkPool.darkPoolPct}%</div>
              <div className="text-[11px] text-[var(--text-muted)]">FINRA ADF / ATS Share of Total Vol</div>
            </div>
            <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-4">
              <div className="text-xs text-[var(--text-muted)]">Net Institutional Flow</div>
              <div
                className={`mt-1 text-xl font-mono font-bold tabular-nums ${
                  darkPool.netInstitutionalFlowM >= 0 ? 'text-emerald-500' : 'text-red-500'
                }`}
              >
                {darkPool.netInstitutionalFlowM >= 0 ? '+' : ''}${darkPool.netInstitutionalFlowM.toFixed(2)}M
              </div>
              <div className="text-[11px] text-[var(--text-muted)]">Net Accumulation vs Distribution</div>
            </div>
            <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-4">
              <div className="text-xs text-[var(--text-muted)]">Dark Pool Index (DIX Score)</div>
              <div className="mt-1 text-xl font-mono font-bold tabular-nums text-sky-500">{darkPool.dixScore} / 100</div>
              <div className="text-[11px] text-[var(--text-muted)]">
                {darkPool.dixScore >= 55 ? 'Institutional Buying Bias' : darkPool.dixScore <= 42 ? 'Distribution Bias' : 'Balanced Liquidity'}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--border-hairline)] flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Eye className="w-4 h-4 text-sky-500" aria-hidden="true" />
                  Block Trade &amp; Off-Exchange Dark Pool Prints — {symbol}
                </h3>
                <div className="flex items-center gap-1">
                  {(['ALL', 'Accumulation', 'Distribution'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setDpFilter(f)}
                      className={`px-2 py-1 text-[11px] font-mono rounded ${
                        dpFilter === f
                          ? 'bg-sky-600 text-white font-semibold'
                          : 'bg-[var(--surface-subtle)] text-[var(--text-muted)]'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
              <table className="w-full text-left text-xs font-mono tabular-nums">
                <thead className="border-b border-[var(--border-hairline)] bg-[var(--surface-subtle)] font-sans text-[var(--text-muted)]">
                  <tr>
                    <th className="py-2 px-3">Time</th>
                    <th className="py-2 px-3">Venue</th>
                    <th className="py-2 px-3 text-right">Price</th>
                    <th className="py-2 px-3 text-right">Shares</th>
                    <th className="py-2 px-3 text-right">Notional</th>
                    <th className="py-2 px-3 text-right">Flow Bias</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-hairline)]">
                  {darkPool.prints
                    .filter((pr) => dpFilter === 'ALL' || pr.side === dpFilter)
                    .map((pr) => (
                      <tr key={pr.id} className="hover:bg-[var(--surface-subtle)]/50">
                        <td className="py-2 px-3 text-[var(--text-muted)]">{new Date(pr.timestamp).toLocaleTimeString()}</td>
                        <td className="py-2 px-3 font-sans">{pr.venue}</td>
                        <td className="py-2 px-3 text-right">${pr.price.toFixed(2)}</td>
                        <td className="py-2 px-3 text-right">{pr.shares.toLocaleString()}</td>
                        <td className="py-2 px-3 text-right">${(pr.notionalUsd / 1e6).toFixed(2)}M</td>
                        <td
                          className={`py-2 px-3 text-right font-sans font-medium ${
                            pr.side === 'Accumulation'
                              ? 'text-emerald-500'
                              : pr.side === 'Distribution'
                                ? 'text-red-500'
                                : 'text-[var(--text-muted)]'
                          }`}
                        >
                          {pr.side}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-4 space-y-3">
              <h3 className="text-sm font-semibold">Institutional Dark Pool Levels</h3>
              <p className="text-xs text-[var(--text-muted)]">High-notional signature print clusters</p>
              <div className="space-y-2.5">
                {darkPool.keyLevels.map((lvl, i) => (
                  <div key={i} className="rounded border border-[var(--border-hairline)] p-3 text-xs">
                    <div className="flex items-center justify-between font-mono">
                      <span className="font-bold text-sm">${lvl.price.toFixed(2)}</span>
                      <span className={lvl.bias === 'Support' ? 'text-emerald-500' : 'text-red-500'}>{lvl.bias}</span>
                    </div>
                    <div className="mt-1 text-[11px] font-mono text-[var(--text-muted)]">
                      Cluster Volume: {(lvl.volumeShares / 1e6).toFixed(2)}M shares
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Short Interest Analytics & Days-to-Cover */}
          <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-500" aria-hidden="true" />
                  Short Interest Analytics &amp; Days-to-Cover — {symbol}
                </h3>
                <p className="text-xs text-[var(--text-muted)]">
                  Exchange bi-monthly FINRA short interest vs average daily liquidity and borrow utilization
                </p>
              </div>
              <span
                className={`text-xs font-mono font-semibold ${
                  darkPool.shortInterest.squeezeRisk === 'High' || darkPool.shortInterest.squeezeRisk === 'Elevated'
                    ? 'text-amber-500'
                    : 'text-emerald-500'
                }`}
              >
                Squeeze Risk: {darkPool.shortInterest.squeezeRisk}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs font-mono tabular-nums">
              <div className="rounded border border-[var(--border-hairline)] p-3">
                <div className="font-sans text-[11px] text-[var(--text-muted)]">Short % of Float</div>
                <div className="mt-1 text-base font-bold text-amber-500">{darkPool.shortInterest.shortPctOfFloat}%</div>
                <div className="text-[10px] text-[var(--text-muted)]">
                  {(darkPool.shortInterest.shortInterestShares / 1e6).toFixed(1)}M / {(darkPool.shortInterest.floatShares / 1e6).toFixed(0)}M shs
                </div>
              </div>
              <div className="rounded border border-[var(--border-hairline)] p-3">
                <div className="font-sans text-[11px] text-[var(--text-muted)]">Days to Cover (DTC)</div>
                <div className="mt-1 text-base font-bold text-sky-500">{darkPool.shortInterest.daysToCover} days</div>
                <div className="text-[10px] text-[var(--text-muted)]">Short Ratio vs Avg Vol</div>
              </div>
              <div className="rounded border border-[var(--border-hairline)] p-3">
                <div className="font-sans text-[11px] text-[var(--text-muted)]">MoM Short Change</div>
                <div
                  className={`mt-1 text-base font-bold ${
                    darkPool.shortInterest.shortInterestMoMChangePct >= 0 ? 'text-red-500' : 'text-emerald-500'
                  }`}
                >
                  {darkPool.shortInterest.shortInterestMoMChangePct >= 0 ? '+' : ''}
                  {darkPool.shortInterest.shortInterestMoMChangePct}%
                </div>
                <div className="text-[10px] text-[var(--text-muted)]">Prior settlement cycle</div>
              </div>
              <div className="rounded border border-[var(--border-hairline)] p-3">
                <div className="font-sans text-[11px] text-[var(--text-muted)]">Cost to Borrow (CTB)</div>
                <div className="mt-1 text-base font-bold">{darkPool.shortInterest.costToBorrowPct}%</div>
                <div className="text-[10px] text-[var(--text-muted)]">Annualized borrow fee</div>
              </div>
              <div className="rounded border border-[var(--border-hairline)] p-3">
                <div className="font-sans text-[11px] text-[var(--text-muted)]">Lendable Utilization</div>
                <div className="mt-1 text-base font-bold">{darkPool.shortInterest.utilizationPct}%</div>
                <div className="text-[10px] text-[var(--text-muted)]">Prime broker inventory</div>
              </div>
            </div>

            <ShortInterestSvg series={darkPool.shortInterest.historicalSeries} />
          </div>

          {/* Institutional Ownership Changes (SEC Form 13F Tracking) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--border-hairline)] flex items-center justify-between">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Landmark className="w-4 h-4 text-sky-500" aria-hidden="true" />
                  13F Hedge Fund &amp; Whale Flow Changes
                </h3>
                <span className="text-[11px] font-mono text-[var(--text-muted)]">SEC Form 13F-HR</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono tabular-nums">
                  <thead className="border-b border-[var(--border-hairline)] bg-[var(--surface-subtle)] font-sans text-[var(--text-muted)]">
                    <tr>
                      <th className="py-2 px-3">Fund / Manager</th>
                      <th className="py-2 px-2">Ticker</th>
                      <th className="py-2 px-2">Action</th>
                      <th className="py-2 px-2 text-right">Value</th>
                      <th className="py-2 px-3 text-right">QoQ Chg</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-hairline)]">
                    {whales.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-6 text-center font-sans text-[var(--text-muted)]">
                          Loading SEC 13F filings...
                        </td>
                      </tr>
                    ) : (
                      whales.map((w) => (
                        <tr key={w.id} className="hover:bg-[var(--surface-subtle)]/50">
                          <td className="py-2 px-3 font-sans">
                            <div className="font-semibold">{w.fundName}</div>
                            <div className="text-[11px] text-[var(--text-muted)]">{w.manager} · {w.quarter}</div>
                          </td>
                          <td className="py-2 px-2">
                            <button
                              type="button"
                              onClick={() => onSelectSymbol?.(w.symbol)}
                              className="font-bold text-sky-500 hover:underline"
                            >
                              {w.symbol}
                            </button>
                          </td>
                          <td
                            className={`py-2 px-2 font-sans font-semibold ${
                              w.action === 'Reduced' || w.action === 'Exited' ? 'text-red-500' : 'text-emerald-500'
                            }`}
                          >
                            {w.action}
                          </td>
                          <td className="py-2 px-2 text-right">${w.valueUsdM.toFixed(1)}M</td>
                          <td className={`py-2 px-3 text-right ${w.changePct >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                            {w.changePct >= 0 ? '+' : ''}{w.changePct}%
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--border-hairline)] flex items-center justify-between">
                <h3 className="text-sm font-semibold">Core Institutional Ownership Changes — {symbol}</h3>
                <span className="text-[11px] font-mono text-[var(--text-muted)]">Quarter-over-Quarter</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono tabular-nums">
                  <thead className="border-b border-[var(--border-hairline)] bg-[var(--surface-subtle)] font-sans text-[var(--text-muted)]">
                    <tr>
                      <th className="py-2 px-3">Institution</th>
                      <th className="py-2 px-2 text-right">Shares</th>
                      <th className="py-2 px-2 text-right">% Out</th>
                      <th className="py-2 px-3 text-right">QoQ Change</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-hairline)]">
                    {institutions.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-6 text-center font-sans text-[var(--text-muted)]">
                          Loading institutional ownership table...
                        </td>
                      </tr>
                    ) : (
                      institutions.map((inst) => (
                        <tr key={inst.holder} className="hover:bg-[var(--surface-subtle)]/50">
                          <td className="py-2 px-3 font-sans font-medium">{inst.holder}</td>
                          <td className="py-2 px-2 text-right">{(inst.shares / 1e6).toFixed(2)}M</td>
                          <td className="py-2 px-2 text-right">{inst.percentOut.toFixed(2)}%</td>
                          <td className={`py-2 px-3 text-right font-semibold ${inst.changePercent >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                            {inst.changePercent >= 0 ? '+' : ''}{inst.changePercent.toFixed(1)}%
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. EARNINGS MOMENTUM, PEAD DRIFT, GUIDANCE REVISIONS & ANALYST ESTIMATE MOMENTUM */}
      {subTab === 'pead' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-3.5">
              <div className="text-xs text-[var(--text-muted)]">Beat Cohort (Avg T+20)</div>
              <div className="mt-1 text-lg font-mono font-bold text-emerald-500">
                +{avgField(posPead, 'drift20dPct')}%
              </div>
            </div>
            <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-3.5">
              <div className="text-xs text-[var(--text-muted)]">Miss Cohort (Avg T+20)</div>
              <div className="mt-1 text-lg font-mono font-bold text-red-500">
                {avgField(negPead, 'drift20dPct')}%
              </div>
            </div>
            <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-3.5">
              <div className="text-xs text-[var(--text-muted)]">Estimate Momentum</div>
              <div className="mt-1 text-lg font-mono font-bold text-sky-500">
                {estimateMomentum.estimateMomentumScore} / 100
              </div>
            </div>
            <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-3.5">
              <div className="text-xs text-[var(--text-muted)]">Earnings ESP</div>
              <div
                className={`mt-1 text-lg font-mono font-bold ${
                  estimateMomentum.earningsEspPct >= 0 ? 'text-emerald-500' : 'text-red-500'
                }`}
              >
                {estimateMomentum.earningsEspPct >= 0 ? '+' : ''}
                {estimateMomentum.earningsEspPct}%
              </div>
            </div>
            <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-3.5">
              <div className="text-xs text-[var(--text-muted)]">Beat Frequency (8Q)</div>
              <div className="mt-1 text-lg font-mono font-bold text-sky-500">
                {Math.round((posPead.length / Math.max(1, peadHistory.length)) * 100)}%
              </div>
            </div>
          </div>

          {/* PEAD Cumulative Drift Chart + Analyst Estimate Momentum Trajectory */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-4 space-y-3">
              <div>
                <h3 className="text-sm font-semibold">PEAD Cumulative Drift Trajectory (Day 0 → T+30)</h3>
                <p className="text-xs text-[var(--text-muted)]">
                  Average post-earnings abnormal drift following EPS beats vs misses on {symbol}
                </p>
              </div>
              <PeadDriftSvg peadHistory={peadHistory} />
            </div>

            <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold">Analyst Estimate Momentum — {symbol}</h3>
                  <p className="text-xs text-[var(--text-muted)]">
                    Current Qtr EPS Consensus ${estimateMomentum.epsCurrentQ.toFixed(2)} (90D ago ${estimateMomentum.eps90dAgo.toFixed(2)})
                  </p>
                </div>
                <span className="text-xs font-mono text-emerald-500 font-semibold">
                  {estimateMomentum.upRevisions30d} Up / {estimateMomentum.downRevisions30d} Down (30D)
                </span>
              </div>

              <EstimateTrajectorySvg trajectory={estimateMomentum.consensusTrajectory} />

              <div className="grid grid-cols-2 gap-3 text-xs pt-1">
                <div>
                  <div className="flex justify-between font-mono text-[11px] mb-1">
                    <span className="font-sans text-[var(--text-muted)]">30D EPS Revisions</span>
                    <span>{estimateMomentum.upRevisions30d}↑ / {estimateMomentum.downRevisions30d}↓</span>
                  </div>
                  <div className="h-2 rounded bg-[var(--surface-subtle)] overflow-hidden flex">
                    <div
                      className="bg-emerald-500 h-full"
                      style={{
                        width: `${(estimateMomentum.upRevisions30d / Math.max(1, estimateMomentum.upRevisions30d + estimateMomentum.downRevisions30d)) * 100}%`,
                      }}
                    />
                    <div className="bg-red-500 h-full flex-1" />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between font-mono text-[11px] mb-1">
                    <span className="font-sans text-[var(--text-muted)]">30D Revenue Revisions</span>
                    <span>{estimateMomentum.revUp30d}↑ / {estimateMomentum.revDown30d}↓</span>
                  </div>
                  <div className="h-2 rounded bg-[var(--surface-subtle)] overflow-hidden flex">
                    <div
                      className="bg-sky-500 h-full"
                      style={{
                        width: `${(estimateMomentum.revUp30d / Math.max(1, estimateMomentum.revUp30d + estimateMomentum.revDown30d)) * 100}%`,
                      }}
                    />
                    <div className="bg-red-500 h-full flex-1" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Guidance Revision Tracking Table */}
          <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border-hairline)] flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Management Guidance Revision Tracking — {symbol}</h3>
              <span className="text-[11px] font-mono text-[var(--text-muted)]">
                Raised: {guidanceRevisions.filter((g) => g.action === 'Raised').length} · Lowered:{' '}
                {guidanceRevisions.filter((g) => g.action === 'Lowered').length}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono tabular-nums">
                <thead className="border-b border-[var(--border-hairline)] bg-[var(--surface-subtle)] font-sans text-[var(--text-muted)]">
                  <tr>
                    <th className="py-2.5 px-3">Quarter · Date</th>
                    <th className="py-2.5 px-3">Metric</th>
                    <th className="py-2.5 px-3">Prior Guidance</th>
                    <th className="py-2.5 px-3">Revised Guidance</th>
                    <th className="py-2.5 px-3 text-right">Midpoint Δ</th>
                    <th className="py-2.5 px-3">Action</th>
                    <th className="py-2.5 px-3">Management Catalyst</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-hairline)]">
                  {guidanceRevisions.map((g, idx) => (
                    <tr key={idx} className="hover:bg-[var(--surface-subtle)]/50">
                      <td className="py-2.5 px-3 font-sans">
                        <div className="font-semibold">{g.quarter}</div>
                        <div className="text-[11px] font-mono text-[var(--text-muted)]">{g.announcedDate}</div>
                      </td>
                      <td className="py-2.5 px-3 font-sans">{g.metric}</td>
                      <td className="py-2.5 px-3 text-[var(--text-muted)]">{g.priorGuide}</td>
                      <td className="py-2.5 px-3 font-semibold">{g.revisedGuide}</td>
                      <td className={`py-2.5 px-3 text-right font-bold ${g.deltaPct >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        {g.deltaPct >= 0 ? '+' : ''}{g.deltaPct}%
                      </td>
                      <td
                        className={`py-2.5 px-3 font-sans font-semibold ${
                          g.action === 'Raised' ? 'text-emerald-500' : g.action === 'Lowered' ? 'text-red-500' : 'text-amber-500'
                        }`}
                      >
                        {g.action}
                      </td>
                      <td className="py-2.5 px-3 font-sans text-[var(--text-muted)]">{g.catalyst}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border-hairline)] flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-sky-500" aria-hidden="true" />
              <h3 className="text-sm font-semibold">Post-Earnings Announcement Drift (PEAD) History — {symbol}</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono tabular-nums">
                <thead className="border-b border-[var(--border-hairline)] bg-[var(--surface-subtle)] font-sans text-[var(--text-muted)]">
                  <tr>
                    <th className="py-2.5 px-3">Quarter</th>
                    <th className="py-2.5 px-3 text-right">EPS Surprise</th>
                    <th className="py-2.5 px-3 text-right">Day-0 Gap</th>
                    <th className="py-2.5 px-3 text-right">T+5 Drift</th>
                    <th className="py-2.5 px-3 text-right">T+20 Drift</th>
                    <th className="py-2.5 px-3 text-right">T+30 Drift</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-hairline)]">
                  {peadHistory.map((row) => (
                    <tr key={row.quarter} className="hover:bg-[var(--surface-subtle)]/50">
                      <td className="py-2.5 px-3 font-sans font-semibold">{row.quarter}</td>
                      <td className={`py-2.5 px-3 text-right ${row.epsSurprisePct >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        {row.epsSurprisePct >= 0 ? '+' : ''}{row.epsSurprisePct}%
                      </td>
                      <td className={`py-2.5 px-3 text-right ${row.day0GapPct >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        {row.day0GapPct >= 0 ? '+' : ''}{row.day0GapPct}%
                      </td>
                      <td className={`py-2.5 px-3 text-right ${row.drift5dPct >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        {row.drift5dPct >= 0 ? '+' : ''}{row.drift5dPct}%
                      </td>
                      <td className={`py-2.5 px-3 text-right ${row.drift20dPct >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        {row.drift20dPct >= 0 ? '+' : ''}{row.drift20dPct}%
                      </td>
                      <td className={`py-2.5 px-3 text-right font-semibold ${row.drift30dPct >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        {row.drift30dPct >= 0 ? '+' : ''}{row.drift30dPct}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 5. VISUAL DRAG-AND-DROP STRATEGY BUILDER */}
      {subTab === 'builder' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-4 space-y-3">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Layers className="w-4 h-4 text-sky-500" aria-hidden="true" />
                Strategy Rule Blocks
              </h3>
              <p className="text-xs text-[var(--text-muted)]">Drag blocks onto the canvas or click + to add</p>
            </div>
            <div className="space-y-1.5">
              {PALETTE_BLOCKS.map((tpl, idx) => (
                <div
                  key={tpl.ruleType}
                  draggable
                  onDragStart={() => setDraggedTemplateIdx(idx)}
                  onDragEnd={() => setDraggedTemplateIdx(null)}
                  className="flex items-center justify-between gap-2 rounded border border-[var(--border-hairline)] bg-[var(--surface-subtle)] px-2.5 py-2 text-xs cursor-grab active:cursor-grabbing hover:border-sky-500/60"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <GripVertical className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
                    <div className="truncate">
                      <span className="font-mono text-[10px] uppercase text-sky-500 mr-1.5">{tpl.kind}</span>
                      <span>{tpl.label}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => addTemplateBlock(tpl)}
                    aria-label={`Add ${tpl.label}`}
                    className="text-sky-500 hover:bg-sky-500/10 rounded p-1 shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-2 space-y-4">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverCanvas(true);
              }}
              onDragLeave={() => setDragOverCanvas(false)}
              onDrop={handleDropOnCanvas}
              className={`rounded-lg border-2 border-dashed p-4 transition-colors ${
                dragOverCanvas
                  ? 'border-sky-500 bg-sky-500/8'
                  : 'border-[var(--border-hairline)] bg-[var(--surface-panel)]'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Play className="w-4 h-4 text-emerald-500" aria-hidden="true" />
                  Active Strategy Pipeline ({strategyBlocks.length} rules)
                </h3>
                <button
                  type="button"
                  onClick={() => setStrategyBlocks([])}
                  className="text-xs text-[var(--text-muted)] hover:text-red-500"
                >
                  Clear Canvas
                </button>
              </div>

              {strategyBlocks.length === 0 ? (
                <div className="py-10 text-center text-xs text-[var(--text-muted)]">
                  Drag and drop Entry, Filter, and Exit blocks here to compose a custom quantitative strategy.
                </div>
              ) : (
                <div className="space-y-2">
                  {strategyBlocks.map((blk) => (
                    <div
                      key={blk.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded border border-[var(--border-hairline)] bg-[var(--surface-subtle)] px-3 py-2 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-mono text-[10px] uppercase font-bold ${
                            blk.kind === 'entry'
                              ? 'text-emerald-500'
                              : blk.kind === 'exit'
                                ? 'text-red-500'
                                : 'text-sky-500'
                          }`}
                        >
                          {blk.kind}
                        </span>
                        <span className="font-medium">{blk.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {!['macd_hist_positive', 'bb_upper_breakout', 'price_above_vwap'].includes(blk.ruleType) && (
                          <input
                            type="number"
                            step="any"
                            value={blk.param}
                            onChange={(e) => {
                              const val = Number(e.target.value) || 0;
                              setStrategyBlocks((prev) =>
                                prev.map((x) => (x.id === blk.id ? { ...x, param: val } : x))
                              );
                            }}
                            className="w-16 rounded border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-2 py-1 text-right font-mono text-xs"
                          />
                        )}
                        <button
                          type="button"
                          onClick={() => setStrategyBlocks((prev) => prev.filter((x) => x.id !== blk.id))}
                          aria-label="Remove block"
                          className="text-[var(--text-muted)] hover:text-red-500 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold flex items-center gap-1.5">
                  <BarChart3 className="w-4 h-4 text-sky-500" aria-hidden="true" />
                  Live Strategy Backtest on {symbol}
                </h4>
                <span className="text-[11px] font-mono text-[var(--text-muted)]">{customBacktest.trades} round-trip trades</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs font-mono tabular-nums">
                <div>
                  <div className="font-sans text-[11px] text-[var(--text-muted)]">Strategy Return</div>
                  <div className={`font-bold text-sm ${customBacktest.returnPct >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                    {customBacktest.returnPct >= 0 ? '+' : ''}{customBacktest.returnPct}%
                  </div>
                </div>
                <div>
                  <div className="font-sans text-[11px] text-[var(--text-muted)]">Buy &amp; Hold</div>
                  <div className="font-bold text-sm">{customBacktest.buyHoldPct >= 0 ? '+' : ''}{customBacktest.buyHoldPct}%</div>
                </div>
                <div>
                  <div className="font-sans text-[11px] text-[var(--text-muted)]">Win Rate</div>
                  <div className="font-bold text-sm">{customBacktest.winRatePct}%</div>
                </div>
                <div>
                  <div className="font-sans text-[11px] text-[var(--text-muted)]">Sharpe Ratio</div>
                  <div className="font-bold text-sm">{customBacktest.sharpeRatio.toFixed(2)}</div>
                </div>
                <div>
                  <div className="font-sans text-[11px] text-[var(--text-muted)]">Max Drawdown</div>
                  <div className="font-bold text-sm text-red-500">-{customBacktest.maxDrawdownPct}%</div>
                </div>
              </div>

              {customBacktest.equityCurve.length > 2 && (
                <StrategyCurveSvg curve={customBacktest.equityCurve} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Interactive 3D Rotatable Implied Volatility Surface Mesh (Painter's Algorithm SVG/Canvas)
const IvSurface3D: React.FC<{
  dtes: number[];
  strikes: number[];
  grid: number[][];
}> = ({ dtes, strikes, grid }) => {
  const [yaw, setYaw] = useState(0.58);
  const [pitch, setPitch] = useState(0.55);
  const draggingRef = useRef<{ x: number; y: number } | null>(null);

  const flatVals = grid.flat();
  const minIv = Math.min(...flatVals);
  const maxIv = Math.max(...flatVals);
  const ivSpan = maxIv - minIv || 1;

  const project = (nx: number, ny: number, nz: number) => {
    // Rotate around Y (yaw) then X (pitch)
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    const x1 = nx * cosY - ny * sinY;
    const y1 = nx * sinY + ny * cosY;

    const cosP = Math.cos(pitch);
    const sinP = Math.sin(pitch);
    const z2 = nz * cosP - y1 * sinP;
    const y2 = nz * sinP + y1 * cosP;

    const scale = 115;
    const cx = 225;
    const cy = 128;
    return {
      sx: cx + x1 * scale,
      sy: cy - z2 * scale * 0.78 + y2 * 24,
      depth: y1,
    };
  };

  const quads: {
    pts: string;
    fill: string;
    depth: number;
  }[] = [];

  const rows = dtes.length;
  const cols = strikes.length;
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const toCoord = (rr: number, cc: number) => {
        const nx = (cc / Math.max(1, cols - 1)) * 2 - 1;
        const ny = (rr / Math.max(1, rows - 1)) * 2 - 1;
        const iv = grid[rr][cc];
        const nz = ((iv - minIv) / ivSpan) * 1.15 - 0.35;
        return { p: project(nx, ny, nz), iv };
      };
      const a = toCoord(r, c);
      const b = toCoord(r, c + 1);
      const d = toCoord(r + 1, c + 1);
      const e = toCoord(r + 1, c);
      const avgIv = (a.iv + b.iv + d.iv + e.iv) / 4;
      const t = Math.min(1, Math.max(0, (avgIv - minIv) / ivSpan));
      const hue = Math.round(205 - t * 170); // cyan-blue low IV -> amber/red high IV
      const light = Math.round(44 + t * 14);
      quads.push({
        pts: `${a.p.sx.toFixed(1)},${a.p.sy.toFixed(1)} ${b.p.sx.toFixed(1)},${b.p.sy.toFixed(1)} ${d.p.sx.toFixed(1)},${d.p.sy.toFixed(1)} ${e.p.sx.toFixed(1)},${e.p.sy.toFixed(1)}`,
        fill: `hsla(${hue}, 82%, ${light}%, 0.85)`,
        depth: (a.p.depth + b.p.depth + d.p.depth + e.p.depth) / 4,
      });
    }
  }
  quads.sort((a, b) => b.depth - a.depth);

  return (
    <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-4 space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-semibold">3D Implied Volatility Surface (Drag to Rotate)</h3>
          <p className="text-[11px] font-mono text-[var(--text-muted)]">
            Strikes {strikes[0]}–{strikes[strikes.length - 1]} · Tenors {dtes[0]}D–{dtes[dtes.length - 1]}D · IV {minIv.toFixed(1)}%–{maxIv.toFixed(1)}%
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setYaw(0.58);
            setPitch(0.55);
          }}
          title="Reset 3D camera angle"
          className="inline-flex items-center gap-1 rounded border border-[var(--border-hairline)] px-2 py-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          <RotateCcw className="w-3 h-3" />
          Reset
        </button>
      </div>

      <svg
        viewBox="0 0 450 220"
        className="w-full h-52 cursor-grab active:cursor-grabbing select-none touch-none"
        onPointerDown={(e) => {
          draggingRef.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerMove={(e) => {
          if (!draggingRef.current) return;
          const dx = e.clientX - draggingRef.current.x;
          const dy = e.clientY - draggingRef.current.y;
          draggingRef.current = { x: e.clientX, y: e.clientY };
          setYaw((y) => y + dx * 0.01);
          setPitch((p) => Math.max(0.15, Math.min(1.25, p + dy * 0.01)));
        }}
        onPointerUp={() => {
          draggingRef.current = null;
        }}
        onPointerLeave={() => {
          draggingRef.current = null;
        }}
      >
        {quads.map((q, idx) => (
          <polygon
            key={idx}
            points={q.pts}
            fill={q.fill}
            stroke="rgba(15, 23, 42, 0.35)"
            strokeWidth="0.7"
          />
        ))}
      </svg>

      <div className="flex items-center justify-between text-[10px] font-mono text-[var(--text-muted)]">
        <span>Low IV ({minIv.toFixed(1)}%)</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-16 rounded bg-gradient-to-r from-sky-500 via-amber-400 to-red-500 inline-block" />
          Vol Convexity
        </span>
        <span>High IV ({maxIv.toFixed(1)}%)</span>
      </div>
    </div>
  );
};

const PayoffCurveSvg: React.FC<{ curve: { price: number; pnl: number }[]; spot: number }> = ({
  curve,
  spot,
}) => {
  if (curve.length < 2) return null;
  const pnls = curve.map((c) => c.pnl);
  const minP = Math.min(0, ...pnls);
  const maxP = Math.max(0, ...pnls);
  const spanP = maxP - minP || 1;
  const minX = curve[0].price;
  const maxX = curve[curve.length - 1].price;
  const spanX = maxX - minX || 1;
  const w = 520;
  const h = 155;
  const padY = 14;
  const toX = (px: number) => ((px - minX) / spanX) * w;
  const toY = (pnl: number) => h - padY - ((pnl - minP) / spanP) * (h - padY * 2);
  const zeroY = toY(0);
  const spotX = toX(spot);
  const pts = curve.map((c) => `${toX(c.price).toFixed(1)},${toY(c.pnl).toFixed(1)}`).join(' ');

  return (
    <div className="space-y-1">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-40">
        <line x1="0" y1={zeroY} x2={w} y2={zeroY} stroke="#64748B" strokeDasharray="4 3" strokeWidth="1" />
        <line x1={spotX} y1="6" x2={spotX} y2={h - 6} stroke="#38BDF8" strokeDasharray="3 3" strokeWidth="1.2" />
        <polyline fill="none" stroke="#10B981" strokeWidth="2.4" points={pts} />
      </svg>
      <div className="flex items-center justify-between text-[11px] font-mono text-[var(--text-muted)]">
        <span>${minX.toFixed(0)}</span>
        <span className="text-sky-500">Spot ${spot.toFixed(2)}</span>
        <span>${maxX.toFixed(0)}</span>
      </div>
    </div>
  );
};

const VolSmileSvg: React.FC<{ calls: { strike: number; impliedVolatility: number }[]; puts: { strike: number; impliedVolatility: number }[] }> = ({
  calls,
  puts,
}) => {
  const allIVs = [...calls, ...puts].map((x) => x.impliedVolatility * 100);
  const min = Math.min(...allIVs);
  const max = Math.max(...allIVs);
  const span = max - min || 1;
  const w = 420;
  const h = 165;
  const toPts = (arr: { impliedVolatility: number }[]) =>
    arr
      .map((x, i) => {
        const px = (i / Math.max(1, arr.length - 1)) * (w - 20) + 10;
        const py = h - ((x.impliedVolatility * 100 - min) / span) * (h - 24) - 12;
        return `${px.toFixed(1)},${py.toFixed(1)}`;
      })
      .join(' ');
  return (
    <div className="space-y-1.5">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-44">
        <polyline fill="none" stroke="#38BDF8" strokeWidth="2" points={toPts(calls)} />
        <polyline fill="none" stroke="#F59E0B" strokeWidth="2" strokeDasharray="4 3" points={toPts(puts)} />
      </svg>
      <div className="flex items-center justify-between text-[11px] font-mono text-[var(--text-muted)]">
        <span>Low Strike ({calls[0]?.strike})</span>
        <span>
          <span className="text-sky-500">■ Call IV</span> · <span className="text-amber-500">■ Put IV</span>
        </span>
        <span>High Strike ({calls[calls.length - 1]?.strike})</span>
      </div>
    </div>
  );
};

const StrategyCurveSvg: React.FC<{ curve: { equity: number; benchmark: number }[] }> = ({ curve }) => {
  const vals = curve.flatMap((c) => [c.equity, c.benchmark]);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const w = 640;
  const h = 130;
  const toPts = (k: 'equity' | 'benchmark') =>
    curve
      .map((c, i) => {
        const x = (i / Math.max(1, curve.length - 1)) * w;
        const y = h - ((c[k] - min) / span) * (h - 14) - 7;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-32" preserveAspectRatio="none">
      <polyline fill="none" stroke="#94A3B8" strokeWidth="1.5" strokeDasharray="4 3" points={toPts('benchmark')} />
      <polyline fill="none" stroke="#10B981" strokeWidth="2.2" points={toPts('equity')} />
    </svg>
  );
};

const MaxPainCurveSvg: React.FC<{
  curve: MaxPainStrikePoint[];
  maxPainStrike: number;
  spotPrice: number;
}> = ({ curve, maxPainStrike, spotPrice }) => {
  if (curve.length < 2) return null;
  const maxVal = Math.max(...curve.map((c) => c.totalPainUsd)) || 1;
  const w = 420;
  const h = 185;
  const padB = 22;
  const padT = 14;
  const barW = Math.max(8, (w - 24) / curve.length - 4);

  return (
    <div className="space-y-1.5">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-48">
        {curve.map((pt, i) => {
          const x = 12 + (i / curve.length) * (w - 24);
          const totalH = (pt.totalPainUsd / maxVal) * (h - padB - padT);
          const callH = (pt.callPainUsd / maxVal) * (h - padB - padT);
          const putH = Math.max(0, totalH - callH);
          const isMaxPain = pt.strike === maxPainStrike;
          return (
            <g key={pt.strike}>
              <rect
                x={x}
                y={h - padB - totalH}
                width={barW}
                height={putH}
                fill={isMaxPain ? '#F59E0B' : 'rgba(239, 68, 68, 0.55)'}
                rx="1.5"
              />
              <rect
                x={x}
                y={h - padB - callH}
                width={barW}
                height={callH}
                fill={isMaxPain ? '#FBBF24' : 'rgba(16, 185, 129, 0.6)'}
                rx="1.5"
              />
              {i % 2 === 0 && (
                <text
                  x={x + barW / 2}
                  y={h - 6}
                  textAnchor="middle"
                  fontSize="9"
                  fill={isMaxPain ? '#F59E0B' : '#64748B'}
                  className="font-mono"
                >
                  {pt.strike.toFixed(0)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="flex items-center justify-between text-[11px] font-mono text-[var(--text-muted)]">
        <span>
          <span className="text-emerald-500">■ Call Pain</span> · <span className="text-red-500">■ Put Pain</span>
        </span>
        <span className="text-amber-500">Max Pain ${maxPainStrike.toFixed(0)} vs Spot ${spotPrice.toFixed(2)}</span>
      </div>
    </div>
  );
};

const ShortInterestSvg: React.FC<{
  series: { date: string; shortPctFloat: number; daysToCover: number }[];
}> = ({ series }) => {
  if (series.length < 2) return null;
  const w = 640;
  const h = 130;
  const padX = 28;
  const padY = 18;
  const minS = Math.min(...series.map((s) => s.shortPctFloat)) * 0.85;
  const maxS = Math.max(...series.map((s) => s.shortPctFloat)) * 1.15 || 1;
  const minD = Math.min(...series.map((s) => s.daysToCover)) * 0.85;
  const maxD = Math.max(...series.map((s) => s.daysToCover)) * 1.15 || 1;

  const toX = (i: number) => padX + (i / (series.length - 1)) * (w - padX * 2);
  const sPts = series
    .map((pt, i) => `${toX(i).toFixed(1)},${(h - padY - ((pt.shortPctFloat - minS) / (maxS - minS || 1)) * (h - padY * 2)).toFixed(1)}`)
    .join(' ');
  const dPts = series
    .map((pt, i) => `${toX(i).toFixed(1)},${(h - padY - ((pt.daysToCover - minD) / (maxD - minD || 1)) * (h - padY * 2)).toFixed(1)}`)
    .join(' ');

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px] font-mono text-[var(--text-muted)]">
        <span>6-Month Settlement History</span>
        <span>
          <span className="text-amber-500">■ Short % Float</span> · <span className="text-sky-500">■ Days to Cover</span>
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-32">
        <polyline fill="none" stroke="#F59E0B" strokeWidth="2.2" points={sPts} />
        <polyline fill="none" stroke="#38BDF8" strokeWidth="2.2" strokeDasharray="4 3" points={dPts} />
        {series.map((pt, i) => (
          <text key={pt.date} x={toX(i)} y={h - 4} textAnchor="middle" fontSize="10" fill="#64748B" className="font-mono">
            {pt.date}
          </text>
        ))}
      </svg>
    </div>
  );
};

const PeadDriftSvg: React.FC<{ peadHistory: PeadQuarterRecord[] }> = ({ peadHistory }) => {
  const pos = peadHistory.filter((q) => q.epsSurprisePct > 0);
  const neg = peadHistory.filter((q) => q.epsSurprisePct <= 0);
  const avg = (arr: PeadQuarterRecord[], k: keyof PeadQuarterRecord) =>
    arr.length ? arr.reduce((s, r) => s + Number(r[k]), 0) / arr.length : 0;

  const pointsBeat = [0, avg(pos, 'day0GapPct'), avg(pos, 'drift5dPct'), avg(pos, 'drift20dPct'), avg(pos, 'drift30dPct')];
  const pointsMiss = [0, avg(neg, 'day0GapPct'), avg(neg, 'drift5dPct'), avg(neg, 'drift20dPct'), avg(neg, 'drift30dPct')];
  const labels = ['Pre-Print', 'Day-0 Gap', 'T+5', 'T+20', 'T+30'];

  const all = [...pointsBeat, ...pointsMiss];
  const min = Math.min(-2, ...all);
  const max = Math.max(2, ...all);
  const span = max - min || 1;
  const w = 480;
  const h = 150;
  const padX = 36;
  const padY = 18;
  const toX = (i: number) => padX + (i / (labels.length - 1)) * (w - padX * 2);
  const toY = (v: number) => h - padY - ((v - min) / span) * (h - padY * 2);
  const zeroY = toY(0);

  return (
    <div className="space-y-1">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-36">
        <line x1={padX} y1={zeroY} x2={w - padX} y2={zeroY} stroke="#64748B" strokeDasharray="4 3" strokeWidth="1" />
        <polyline
          fill="none"
          stroke="#10B981"
          strokeWidth="2.4"
          points={pointsBeat.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ')}
        />
        <polyline
          fill="none"
          stroke="#EF4444"
          strokeWidth="2.2"
          strokeDasharray="4 3"
          points={pointsMiss.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ')}
        />
        {labels.map((lbl, i) => (
          <text key={lbl} x={toX(i)} y={h - 4} textAnchor="middle" fontSize="10" fill="#64748B" className="font-mono">
            {lbl}
          </text>
        ))}
      </svg>
      <div className="flex items-center justify-between text-[11px] font-mono text-[var(--text-muted)]">
        <span><span className="text-emerald-500">■ EPS Beat Cohort</span> · <span className="text-red-500">■ EPS Miss Cohort</span></span>
        <span>Avg T+30 Spread: +{(pointsBeat[4] - pointsMiss[4]).toFixed(1)}%</span>
      </div>
    </div>
  );
};

const EstimateTrajectorySvg: React.FC<{
  trajectory: { label: string; eps: number; revB: number }[];
}> = ({ trajectory }) => {
  if (trajectory.length < 2) return null;
  const vals = trajectory.map((t) => t.eps);
  const min = Math.min(...vals) * 0.96;
  const max = Math.max(...vals) * 1.04 || 1;
  const span = max - min || 1;
  const w = 480;
  const h = 115;
  const padX = 34;
  const padY = 18;
  const toX = (i: number) => padX + (i / (trajectory.length - 1)) * (w - padX * 2);
  const toY = (v: number) => h - padY - ((v - min) / span) * (h - padY * 2);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-28">
      <polyline
        fill="none"
        stroke="#38BDF8"
        strokeWidth="2.4"
        points={trajectory.map((t, i) => `${toX(i).toFixed(1)},${toY(t.eps).toFixed(1)}`).join(' ')}
      />
      {trajectory.map((t, i) => (
        <g key={t.label}>
          <circle cx={toX(i)} cy={toY(t.eps)} r="3.5" fill="#0EA5E9" />
          <text x={toX(i)} y={toY(t.eps) - 7} textAnchor="middle" fontSize="9.5" fill="currentColor" className="font-mono">
            ${t.eps.toFixed(2)}
          </text>
          <text x={toX(i)} y={h - 3} textAnchor="middle" fontSize="9.5" fill="#64748B" className="font-mono">
            {t.label}
          </text>
        </g>
      ))}
    </svg>
  );
};
