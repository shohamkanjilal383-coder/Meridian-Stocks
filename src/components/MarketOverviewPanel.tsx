import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  Compass,
  Gauge,
  Globe,
  Grid3X3,
  Layers,
  RefreshCw,
} from 'lucide-react';
import type {
  AssetCorrelationData,
  EconomicCalendarEvent,
  FuturesCurveData,
  FuturesDashboardData,
  MacroDashboardData,
  MarketOverviewData,
  SectorRotationItem,
} from '../types/market';

export type MarketsSubTab = 'overview' | 'futures' | 'macro' | 'calendar' | 'rotation' | 'correlations';

interface MarketOverviewPanelProps {
  overview: MarketOverviewData | null;
  macroData: MacroDashboardData | null;
  futuresData?: FuturesDashboardData | null;
  correlationData: AssetCorrelationData | null;
  rotationData: SectorRotationItem[];
  calendarEvents?: EconomicCalendarEvent[];
  loading: boolean;
  initialTab?: MarketsSubTab;
  onTabChange?: (tab: MarketsSubTab) => void;
  onRefresh: () => void;
  onSelectSymbol: (symbol: string) => void;
}

const MiniSparkline: React.FC<{ data: number[]; positive: boolean }> = ({ data, positive }) => {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const w = 88;
  const h = 28;
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / span) * (h - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="shrink-0">
      <polyline
        fill="none"
        stroke={positive ? '#22C55E' : '#EF4444'}
        strokeWidth="1.75"
        points={pts}
      />
    </svg>
  );
};

function pearsonCorr(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 3) return 0;
  let sumA = 0;
  let sumB = 0;
  for (let i = 0; i < n; i++) {
    sumA += a[i];
    sumB += b[i];
  }
  const meanA = sumA / n;
  const meanB = sumB / n;
  let num = 0;
  let denA = 0;
  let denB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }
  const den = Math.sqrt(denA * denB);
  return den === 0 ? 0 : Number((num / den).toFixed(2));
}

export const MarketOverviewPanel: React.FC<MarketOverviewPanelProps> = ({
  overview,
  macroData,
  futuresData = null,
  correlationData,
  rotationData,
  calendarEvents = [],
  loading,
  initialTab = 'overview',
  onTabChange,
  onRefresh,
  onSelectSymbol,
}) => {
  const [subTab, setSubTab] = useState<MarketsSubTab>(initialTab);
  const [futuresClass, setFuturesClass] = useState<'ALL' | 'Indices' | 'Commodities' | 'Crypto'>('ALL');
  const [selectedRoot, setSelectedRoot] = useState<string>('CL');
  const [corrWindow, setCorrWindow] = useState<20 | 60 | 90 | 180>(60);
  const [corrClassFilter, setCorrClassFilter] = useState<'ALL' | 'Equities' | 'Bonds' | 'Commodities' | 'Forex' | 'Crypto'>('ALL');
  const [rsWindow, setRsWindow] = useState<'ret1W' | 'ret1M' | 'ret3M'>('ret1M');
  const [pairA, setPairA] = useState('SPY');
  const [pairB, setPairB] = useState('TLT');
  const [calCountry, setCalCountry] = useState<'ALL' | 'US' | 'IN' | 'EU'>('ALL');
  const [calImpact, setCalImpact] = useState<'ALL' | 'High' | 'Medium' | 'Low'>('ALL');
  const [selectedCalId, setSelectedCalId] = useState<string>('ec-1');

  useEffect(() => {
    setSubTab(initialTab);
  }, [initialTab]);

  const changeTab = (next: MarketsSubTab) => {
    setSubTab(next);
    onTabChange?.(next);
  };

  const corrMatrix = useMemo(() => {
    if (!correlationData || correlationData.assets.length === 0) return null;
    const filteredAssets =
      corrClassFilter === 'ALL'
        ? correlationData.assets
        : correlationData.assets.filter((a) =>
            corrClassFilter === 'Equities'
              ? a.assetClass === 'US Equities' || a.assetClass === 'Sector'
              : a.assetClass === corrClassFilter
          );
    const activeAssets = filteredAssets.length >= 2 ? filteredAssets : correlationData.assets;
    const syms = activeAssets.map((a) => a.symbol);
    const sliced: Record<string, number[]> = {};
    for (const s of syms) {
      const series = correlationData.returnsByAsset[s] ?? [];
      sliced[s] = series.slice(-corrWindow);
    }
    const matrix = syms.map((r) =>
      syms.map((c) => (r === c ? 1 : pearsonCorr(sliced[r], sliced[c])))
    );
    return { assets: activeAssets, matrix };
  }, [correlationData, corrWindow, corrClassFilter]);

  const rollingPairSeries = useMemo(() => {
    if (!correlationData) return [];
    const serA = correlationData.returnsByAsset[pairA] ?? [];
    const serB = correlationData.returnsByAsset[pairB] ?? [];
    const n = Math.min(serA.length, serB.length);
    const win = Math.min(20, Math.max(10, Math.floor(corrWindow / 3)));
    if (n <= win) return [];
    const pts: { idx: number; corr: number }[] = [];
    for (let i = win; i <= n; i++) {
      pts.push({
        idx: i,
        corr: pearsonCorr(serA.slice(i - win, i), serB.slice(i - win, i)),
      });
    }
    return pts;
  }, [correlationData, pairA, pairB, corrWindow]);

  const filteredCalendar = useMemo(
    () =>
      calendarEvents.filter(
        (ev) =>
          (calCountry === 'ALL' || ev.country === calCountry) &&
          (calImpact === 'ALL' || ev.impact === calImpact)
      ),
    [calendarEvents, calCountry, calImpact]
  );

  const selectedCalendarEvent = useMemo(
    () =>
      filteredCalendar.find((ev) => ev.id === selectedCalId) ??
      filteredCalendar[0] ??
      null,
    [filteredCalendar, selectedCalId]
  );

  const filteredFutures = useMemo(() => {
    const list = futuresData?.curves ?? [];
    return futuresClass === 'ALL' ? list : list.filter((c) => c.assetClass === futuresClass);
  }, [futuresData, futuresClass]);

  const activeFuture = useMemo(
    () => filteredFutures.find((c) => c.rootSymbol === selectedRoot) ?? filteredFutures[0] ?? null,
    [filteredFutures, selectedRoot]
  );

  if (loading && !overview) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-24 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] animate-pulse"
          />
        ))}
      </div>
    );
  }

  const advTotal = overview
    ? overview.breadth.advancing + overview.breadth.declining + overview.breadth.unchanged
    : 0;
  const advPct = overview && advTotal > 0 ? (overview.breadth.advancing / advTotal) * 100 : 50;
  const decPct = overview && advTotal > 0 ? (overview.breadth.declining / advTotal) * 100 : 50;

  return (
    <div className="space-y-4">
      {/* Header & Sub-Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-[#111827] p-1">
          {(
            [
              { id: 'overview', label: 'Indices & Breadth', icon: Globe },
              { id: 'futures', label: 'Futures & Term Structure', icon: Layers },
              { id: 'macro', label: 'Macro, Fed & VIX Term', icon: Activity },
              { id: 'calendar', label: 'Economic Calendar', icon: CalendarDays },
              { id: 'rotation', label: 'Business Cycle & RRG', icon: Compass },
              { id: 'correlations', label: 'Rolling Correlations', icon: Grid3X3 },
            ] as const
          ).map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                data-vim-tab={t.id}
                onClick={() => changeTab(t.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  subTab === t.id
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                {t.label}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          Refresh Feeds
        </button>
      </div>

      {/* TAB 1: Global Indices & Breadth */}
      {subTab === 'overview' && overview && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>
              US &amp; Indian benchmarks · {overview.source} · Updated{' '}
              {new Date(overview.updatedAt).toLocaleTimeString()}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {overview.indices.map((idx) => {
              const pos = idx.changePercent >= 0;
              return (
                <div
                  key={idx.symbol}
                  className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-3.5 flex flex-col justify-between gap-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {idx.displaySymbol}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[130px]">
                        {idx.name}
                      </div>
                    </div>
                    <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">{idx.region}</span>
                  </div>
                  <div className="flex items-end justify-between gap-2">
                    <div>
                      <div className="text-base font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                        {idx.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <div
                        className={`inline-flex items-center gap-0.5 text-xs font-mono tabular-nums ${
                          pos ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {pos ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                        {pos ? '+' : ''}
                        {idx.change.toFixed(2)} ({pos ? '+' : ''}
                        {idx.changePercent.toFixed(2)}%)
                      </div>
                    </div>
                    <MiniSparkline data={idx.sparkline} positive={pos} />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Sector Performance (SPDR ETFs)
                </h3>
                <span className="text-xs text-slate-500 dark:text-slate-400">Click leader to load chart</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {overview.sectors.map((sec) => {
                  const pos = sec.changePercent >= 0;
                  return (
                    <button
                      key={sec.etf}
                      type="button"
                      data-vim-item
                      onClick={() => onSelectSymbol(sec.leader)}
                      className="text-left rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#182235]/60 p-3 hover:border-sky-500/50 transition-colors"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-800 dark:text-slate-200 truncate">{sec.name}</span>
                        <span className="font-mono text-[11px] text-slate-500">{sec.etf}</span>
                      </div>
                      <div
                        className={`mt-1.5 text-sm font-mono font-semibold tabular-nums ${
                          pos ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {pos ? '+' : ''}
                        {sec.changePercent.toFixed(2)}%
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                        Leader: {sec.leader} ({sec.leaderChange >= 0 ? '+' : ''}
                        {sec.leaderChange.toFixed(2)}%)
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4 flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Market Breadth &amp; Internals
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">NYSE + NASDAQ composite breadth</p>

                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs font-mono tabular-nums mb-1.5">
                    <span className="text-emerald-600 dark:text-emerald-400">
                      Advancing {overview.breadth.advancing.toLocaleString()} ({advPct.toFixed(1)}%)
                    </span>
                    <span className="text-red-600 dark:text-red-400">
                      Declining {overview.breadth.declining.toLocaleString()} ({decPct.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="h-2.5 w-full rounded overflow-hidden bg-slate-200 dark:bg-slate-800 flex">
                    <div style={{ width: `${advPct}%` }} className="bg-emerald-500 h-full" />
                    <div style={{ width: `${decPct}%` }} className="bg-red-500 h-full" />
                  </div>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                <div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">CBOE VIX</div>
                  <div className="text-sm font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                    {overview.breadth.vix.toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">A/D Ratio</div>
                  <div className="text-sm font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                    {overview.breadth.advanceDeclineRatio.toFixed(2)}x
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">52W New Highs</div>
                  <div className="text-sm font-mono font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                    {overview.breadth.newHighs}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">Put / Call Ratio</div>
                  <div className="text-sm font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                    {overview.breadth.putCallRatio.toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Futures Data (Commodities, Indices, Crypto) & Term Structure Visualization */}
      {subTab === 'futures' && (
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-sky-500" aria-hidden="true" />
                  Global Futures Complexes &amp; Forward Term Structure
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Commodities (CL, GC, NG, HG), Equity Indices (ES, NQ, RTY) &amp; CME Crypto (BTC, ETH) across M1–M12 maturities
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {(['ALL', 'Indices', 'Commodities', 'Crypto'] as const).map((cls) => (
                  <button
                    key={cls}
                    type="button"
                    onClick={() => setFuturesClass(cls)}
                    className={`px-2.5 py-1 rounded border text-xs font-medium transition-colors ${
                      futuresClass === cls
                        ? 'border-sky-500 bg-sky-500/15 text-sky-500 font-semibold'
                        : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100'
                    }`}
                  >
                    {cls}
                  </button>
                ))}
              </div>
            </div>

            {filteredFutures.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                Loading live futures term structures across CME, NYMEX, and COMEX...
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono tabular-nums">
                  <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#182235]/50 font-sans text-slate-500">
                    <tr>
                      <th className="py-2.5 px-3">Contract</th>
                      <th className="py-2.5 px-2">Class / Venue</th>
                      <th className="py-2.5 px-2 text-right">Spot Est.</th>
                      <th className="py-2.5 px-2 text-right">Front (M1)</th>
                      <th className="py-2.5 px-2 text-right">Back (M12)</th>
                      <th className="py-2.5 px-2 text-right">Day Chg</th>
                      <th className="py-2.5 px-2">Curve Structure</th>
                      <th className="py-2.5 px-2 text-right">Ann. Roll Yield</th>
                      <th className="py-2.5 px-3 text-right">Total OI</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {filteredFutures.map((fc) => {
                      const isSel = activeFuture?.rootSymbol === fc.rootSymbol;
                      const pos = fc.dayChangePct >= 0;
                      const dec = fc.frontPrice < 20 ? 3 : fc.frontPrice < 100 ? 2 : 1;
                      return (
                        <tr
                          key={fc.rootSymbol}
                          data-vim-item
                          onClick={() => setSelectedRoot(fc.rootSymbol)}
                          className={`cursor-pointer transition-colors ${
                            isSel ? 'bg-sky-500/12' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                          }`}
                        >
                          <td className="py-2.5 px-3">
                            <button
                              type="button"
                              onClick={() => setSelectedRoot(fc.rootSymbol)}
                              className="font-bold text-sky-600 dark:text-sky-400 hover:underline"
                            >
                              {fc.rootSymbol}
                            </button>
                            <div className="font-sans text-[11px] text-slate-500 truncate max-w-[160px]">{fc.name}</div>
                          </td>
                          <td className="py-2.5 px-2 font-sans text-[11px] text-slate-500">
                            {fc.assetClass} · {fc.exchange}
                          </td>
                          <td className="py-2.5 px-2 text-right text-slate-500">
                            {fc.spotPrice.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec })}
                          </td>
                          <td className="py-2.5 px-2 text-right font-semibold text-slate-900 dark:text-slate-100">
                            {fc.frontPrice.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec })}
                          </td>
                          <td className="py-2.5 px-2 text-right">
                            {fc.backPrice.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec })}
                          </td>
                          <td className={`py-2.5 px-2 text-right font-semibold ${pos ? 'text-emerald-500' : 'text-red-500'}`}>
                            {pos ? '+' : ''}
                            {fc.dayChangePct.toFixed(2)}%
                          </td>
                          <td
                            className={`py-2.5 px-2 font-sans font-semibold ${
                              fc.curveRegime === 'Backwardation'
                                ? 'text-emerald-500'
                                : fc.curveRegime === 'Contango'
                                  ? 'text-amber-500'
                                  : 'text-slate-500'
                            }`}
                          >
                            {fc.curveRegime} ({fc.curveSlopePct >= 0 ? '+' : ''}
                            {fc.curveSlopePct.toFixed(2)}%)
                          </td>
                          <td
                            className={`py-2.5 px-2 text-right font-semibold ${
                              fc.annualizedRollYieldPct < 0 ? 'text-emerald-500' : 'text-amber-500'
                            }`}
                          >
                            {fc.annualizedRollYieldPct >= 0 ? '+' : ''}
                            {fc.annualizedRollYieldPct.toFixed(2)}%
                          </td>
                          <td className="py-2.5 px-3 text-right">{fc.totalOpenInterest.toLocaleString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {activeFuture && (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {activeFuture.name} ({activeFuture.rootSymbol}) Forward Term Curve
                      </h4>
                      <p className="text-xs text-slate-500">
                        {activeFuture.exchange} · Unit: {activeFuture.unit} · Dashed line = Implied Spot (
                        {activeFuture.spotPrice.toLocaleString()})
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onSelectSymbol(activeFuture.yahooSymbol)}
                      className="text-xs font-medium text-sky-500 hover:underline"
                    >
                      Open {activeFuture.yahooSymbol} Chart →
                    </button>
                  </div>
                  <FuturesTermStructureSvg curve={activeFuture} />
                </div>

                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4 space-y-2">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Normalized Basis Comparison (% vs Spot Across Complexes)
                    </h4>
                    <p className="text-xs text-slate-500">
                      Compares carry steepness (Contango &gt; 0% vs Backwardation &lt; 0%) across M1–M12 tenors
                    </p>
                  </div>
                  <FuturesNormalizedCurveSvg
                    curves={filteredFutures.slice(0, 6)}
                    activeRoot={activeFuture.rootSymbol}
                  />
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {activeFuture.name} Contract Maturity Ladder ({activeFuture.contracts.length} active expiries)
                  </h4>
                  <span className="text-xs font-mono text-slate-500">
                    M1–M12 Slope: {activeFuture.curveSlopePct >= 0 ? '+' : ''}
                    {activeFuture.curveSlopePct.toFixed(2)}%
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono tabular-nums">
                    <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#182235]/50 font-sans text-slate-500">
                      <tr>
                        <th className="py-2.5 px-3">Contract Code</th>
                        <th className="py-2.5 px-3">Tenor</th>
                        <th className="py-2.5 px-3 text-right">DTE</th>
                        <th className="py-2.5 px-3 text-right">Futures Price ({activeFuture.unit})</th>
                        <th className="py-2.5 px-3 text-right">Basis vs Spot</th>
                        <th className="py-2.5 px-3 text-right">Day Chg %</th>
                        <th className="py-2.5 px-3 text-right">Volume</th>
                        <th className="py-2.5 px-3 text-right">Open Interest</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {activeFuture.contracts.map((c) => {
                        const dec = activeFuture.frontPrice < 20 ? 3 : activeFuture.frontPrice < 100 ? 2 : 1;
                        return (
                          <tr key={c.contractCode} data-vim-item className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                            <td className="py-2.5 px-3 font-bold text-sky-500">{c.contractCode}</td>
                            <td className="py-2.5 px-3 font-sans font-medium">{c.label}</td>
                            <td className="py-2.5 px-3 text-right text-slate-500">{c.dte}d</td>
                            <td className="py-2.5 px-3 text-right font-semibold">
                              {c.price.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec })}
                            </td>
                            <td
                              className={`py-2.5 px-3 text-right font-semibold ${
                                c.basisPct >= 0 ? 'text-amber-500' : 'text-emerald-500'
                              }`}
                            >
                              {c.basisPct >= 0 ? '+' : ''}
                              {c.basisPct.toFixed(2)}%
                            </td>
                            <td className={`py-2.5 px-3 text-right ${c.changePct >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                              {c.changePct >= 0 ? '+' : ''}
                              {c.changePct.toFixed(2)}%
                            </td>
                            <td className="py-2.5 px-3 text-right">{c.volume.toLocaleString()}</td>
                            <td className="py-2.5 px-3 text-right">{c.openInterest.toLocaleString()}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 2: Macro Economic Dashboard (Fed Rates, 2s10s/3m10s, Inflation, Fear & Greed, VIX Term Structure, Crypto Corr) */}
      {subTab === 'macro' && (
        <div className="space-y-4">
          {!macroData ? (
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-8 text-center text-xs text-slate-500">
              Loading live Fed rates, Treasury yields, DXY, VIX term structure, and commodities...
            </div>
          ) : (
            <>
              {/* Policy, Spreads & Inflation Expectations Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-3">
                  <div className="text-[11px] text-slate-500">Fed Funds Target</div>
                  <div className="mt-1 text-sm font-mono font-bold tabular-nums">{macroData.fedFundsTarget}</div>
                  <div className="text-[11px] font-mono text-slate-500">EFFR {macroData.effectiveFedRate}%</div>
                </div>
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-3">
                  <div className="text-[11px] text-slate-500">2s10s Spread</div>
                  <div
                    className={`mt-1 text-sm font-mono font-bold tabular-nums ${
                      macroData.spread10y2y >= 0 ? 'text-emerald-500' : 'text-amber-500'
                    }`}
                  >
                    {macroData.spread10y2y >= 0 ? '+' : ''}
                    {macroData.spread10y2y.toFixed(2)}%
                  </div>
                  <div className="text-[11px] text-slate-500">{macroData.spread10y2y >= 0 ? 'Normal Curve' : 'Inverted'}</div>
                </div>
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-3">
                  <div className="text-[11px] text-slate-500">3m10s Spread</div>
                  <div
                    className={`mt-1 text-sm font-mono font-bold tabular-nums ${
                      macroData.spread10y3m >= 0 ? 'text-emerald-500' : 'text-amber-500'
                    }`}
                  >
                    {macroData.spread10y3m >= 0 ? '+' : ''}
                    {macroData.spread10y3m.toFixed(2)}%
                  </div>
                  <div className="text-[11px] text-slate-500">NY Fed Recession Gauge</div>
                </div>
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-3">
                  <div className="text-[11px] text-slate-500">5Y / 10Y Breakeven</div>
                  <div className="mt-1 text-sm font-mono font-bold tabular-nums">
                    {macroData.inflation5yBreakeven.toFixed(2)}% / {macroData.inflation10yBreakeven.toFixed(2)}%
                  </div>
                  <div className="text-[11px] text-slate-500">Implied Inflation</div>
                </div>
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-3">
                  <div className="text-[11px] text-slate-500">10Y TIPS Real Yield</div>
                  <div className="mt-1 text-sm font-mono font-bold tabular-nums text-sky-500">
                    {macroData.realYield10y.toFixed(2)}%
                  </div>
                  <div className="text-[11px] text-slate-500">Financial Tightness</div>
                </div>
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-3">
                  <div className="text-[11px] text-slate-500">Business Cycle Model</div>
                  <div className="mt-1 text-sm font-semibold text-sky-500">{macroData.businessCyclePhase}</div>
                  <div className="text-[11px] text-slate-500">Curve + Vol Regime</div>
                </div>
              </div>

              {/* Macro Regime Detection (Risk-On / Risk-Off) & Intermarket Analysis */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                <div className="lg:col-span-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        Macro Regime Detection (Risk-On / Risk-Off)
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Multi-factor cross-asset regime classifier
                      </p>
                    </div>
                    <div className="text-right font-mono tabular-nums">
                      <div
                        className={`text-sm font-bold ${
                          macroData.macroRegime.regime === 'Risk-On'
                            ? 'text-emerald-500'
                            : macroData.macroRegime.regime === 'Risk-Off'
                              ? 'text-red-500'
                              : 'text-amber-500'
                        }`}
                      >
                        {macroData.macroRegime.regime} ({macroData.macroRegime.confidencePct}%)
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Score: {macroData.macroRegime.compositeScore >= 0 ? '+' : ''}
                        {macroData.macroRegime.compositeScore}
                      </div>
                    </div>
                  </div>

                  {/* Composite Regime Meter (-100 to +100) */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-mono text-slate-500">
                      <span>-100 Risk-Off</span>
                      <span>0 Neutral</span>
                      <span>+100 Risk-On</span>
                    </div>
                    <div className="h-2 w-full rounded bg-slate-200 dark:bg-slate-800 relative overflow-hidden">
                      <div
                        className={`absolute top-0 bottom-0 w-2.5 -translate-x-1/2 rounded-xs ${
                          macroData.macroRegime.compositeScore >= 15
                            ? 'bg-emerald-500'
                            : macroData.macroRegime.compositeScore <= -15
                              ? 'bg-red-500'
                              : 'bg-amber-500'
                        }`}
                        style={{
                          left: `${Math.max(4, Math.min(96, ((macroData.macroRegime.compositeScore + 100) / 200) * 100))}%`,
                        }}
                      />
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {macroData.macroRegime.summary}
                  </p>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs font-mono tabular-nums">
                      <thead className="border-b border-slate-200 dark:border-slate-800 font-sans text-slate-500">
                        <tr>
                          <th className="py-1.5 pr-2">Regime Factor</th>
                          <th className="py-1.5 px-2 text-right">Reading</th>
                          <th className="py-1.5 px-2 text-right">Wt</th>
                          <th className="py-1.5 pl-2 text-right">Signal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {macroData.macroRegime.signals.map((sig) => (
                          <tr key={sig.factor} data-vim-item className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                            <td className="py-1.5 pr-2 font-sans font-medium text-slate-800 dark:text-slate-200">
                              {sig.factor}
                            </td>
                            <td className="py-1.5 px-2 text-right text-slate-600 dark:text-slate-300">{sig.reading}</td>
                            <td className="py-1.5 px-2 text-right text-slate-500">{sig.weightPct}%</td>
                            <td
                              className={`py-1.5 pl-2 text-right font-sans font-semibold ${
                                sig.bias === 'Risk-On'
                                  ? 'text-emerald-500'
                                  : sig.bias === 'Risk-Off'
                                    ? 'text-red-500'
                                    : 'text-amber-500'
                              }`}
                            >
                              {sig.bias}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="lg:col-span-7 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        Intermarket Analysis (Bonds, Commodities, Forex &amp; Carry)
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        30D vs 90D cross-asset correlation regime &amp; macro divergence alerts
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => changeTab('correlations')}
                      className="text-xs font-medium text-sky-500 hover:underline"
                    >
                      Open Full Matrix →
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs font-mono tabular-nums">
                      <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#182235]/50 font-sans text-slate-500">
                        <tr>
                          <th className="py-2 px-3">Pair</th>
                          <th className="py-2 px-2">Linkage</th>
                          <th className="py-2 px-2 text-right">30D Corr</th>
                          <th className="py-2 px-2 text-right">90D Corr</th>
                          <th className="py-2 px-2">Status</th>
                          <th className="py-2 px-3">Macro Interpretation</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {macroData.intermarketPairs.map((ip) => (
                          <tr key={ip.pair} data-vim-item className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                            <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                              {ip.pair}
                            </td>
                            <td className="py-2.5 px-2 font-sans text-[11px] text-slate-500 whitespace-nowrap">
                              {ip.relationship}
                            </td>
                            <td
                              className={`py-2.5 px-2 text-right font-semibold ${
                                ip.corr30d >= 0 ? 'text-emerald-500' : 'text-red-500'
                              }`}
                            >
                              {ip.corr30d >= 0 ? '+' : ''}
                              {ip.corr30d.toFixed(2)}
                            </td>
                            <td
                              className={`py-2.5 px-2 text-right ${
                                ip.corr90d >= 0 ? 'text-emerald-500/80' : 'text-red-500/80'
                              }`}
                            >
                              {ip.corr90d >= 0 ? '+' : ''}
                              {ip.corr90d.toFixed(2)}
                            </td>
                            <td
                              className={`py-2.5 px-2 font-sans font-semibold ${
                                ip.status === 'Aligned'
                                  ? 'text-emerald-500'
                                  : ip.status === 'Stress'
                                    ? 'text-red-500'
                                    : 'text-amber-500'
                              }`}
                            >
                              {ip.status}
                            </td>
                            <td className="py-2.5 px-3 font-sans text-[11px] text-slate-600 dark:text-slate-300">
                              {ip.detail}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Yield Curve + VIX Term Structure */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        US Treasury Yield Curve (3M – 30Y)
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Sovereign curve slope across money-market &amp; long duration
                      </p>
                    </div>
                  </div>
                  <YieldCurveSvg curve={macroData.yieldCurve} />
                </div>

                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        VIX Futures Term Structure (Spot – M6)
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Implied volatility curve across CFE expiration tenors
                      </p>
                    </div>
                    <span
                      className={`text-xs font-mono font-semibold ${
                        macroData.vixContango ? 'text-emerald-500' : 'text-red-500'
                      }`}
                    >
                      {macroData.vixContango ? 'Contango (Calm)' : 'Backwardation (Stress)'}
                    </span>
                  </div>
                  <VixTermSvg points={macroData.vixTermStructure} contango={macroData.vixContango} />
                </div>
              </div>

              {/* Fear & Greed Index + Crypto Correlation */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <Gauge className="w-4 h-4 text-sky-500" aria-hidden="true" />
                      Composite Fear &amp; Greed Index
                    </h3>
                    <span className="font-mono text-sm font-bold text-sky-500 tabular-nums">
                      {macroData.fearGreed.score} / 100 · {macroData.fearGreed.label}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
                    <FearGreedGaugeSvg score={macroData.fearGreed.score} label={macroData.fearGreed.label} />
                    <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {macroData.fearGreed.components.map((c) => (
                        <div key={c.name} className="rounded border border-slate-200 dark:border-slate-800 p-2.5">
                          <div className="flex items-center justify-between font-mono">
                            <span className="font-sans font-medium truncate max-w-[155px]">{c.name}</span>
                            <span className="font-bold text-sky-500">{c.score}</span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">{c.signal}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4 space-y-3">
                  <h3 className="text-sm font-semibold">Crypto Cross-Asset Correlations</h3>
                  <p className="text-xs text-slate-500">Rolling 30D vs 90D BTC return sensitivity</p>
                  <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs font-mono tabular-nums">
                    {macroData.cryptoCorrelations.map((row) => (
                      <div key={row.pair} className="py-2.5 flex items-center justify-between">
                        <span className="font-sans font-medium">{row.pair}</span>
                        <div className="text-right">
                          <span className={row.corr30d >= 0 ? 'text-emerald-500 font-bold' : 'text-red-500 font-bold'}>
                            30D: {row.corr30d >= 0 ? '+' : ''}
                            {row.corr30d.toFixed(2)}
                          </span>
                          <span className="block text-[11px] text-slate-500">
                            90D: {row.corr90d >= 0 ? '+' : ''}
                            {row.corr90d.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Instruments Grid (Yields, DXY, FX, VIX, Commodities, Crypto) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {macroData.instruments.map((inst) => {
                  const pos = inst.changePercent >= 0;
                  return (
                    <div
                      key={inst.symbol}
                      className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-3.5 flex flex-col justify-between gap-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-[11px] font-mono text-sky-500 font-semibold">{inst.category}</div>
                          <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">{inst.name}</div>
                        </div>
                        <span className="text-[11px] font-mono text-slate-400">{inst.symbol}</span>
                      </div>
                      <div className="flex items-end justify-between gap-2">
                        <div>
                          <div className="text-base font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100">
                            {inst.unit === '$' ? '$' : ''}
                            {inst.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            {inst.unit === '%' ? '%' : ''}
                          </div>
                          <div
                            className={`text-xs font-mono tabular-nums ${
                              pos ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                            }`}
                          >
                            {pos ? '+' : ''}
                            {inst.change.toFixed(2)} ({pos ? '+' : ''}
                            {inst.changePercent.toFixed(2)}%)
                          </div>
                        </div>
                        <MiniSparkline data={inst.sparkline} positive={pos} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 3: Economic Calendar with Impact Ratings & Historical Market Reaction Analysis */}
      {subTab === 'calendar' && (
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-sky-500" aria-hidden="true" />
                  Global Economic Calendar &amp; Market Impact Scoring
                </h3>
                <p className="text-xs text-slate-500">
                  Click any catalyst row to inspect historical SPX, 10Y Treasury, and DXY market reaction curves
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <select
                  aria-label="Filter economic calendar by region"
                  value={calCountry}
                  onChange={(e) => setCalCountry(e.target.value as typeof calCountry)}
                  className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 font-mono"
                >
                  <option value="ALL">All Regions</option>
                  <option value="US">US (Fed / BLS)</option>
                  <option value="IN">India (RBI / MOSPI)</option>
                  <option value="EU">Eurozone (ECB)</option>
                </select>
                <select
                  aria-label="Filter economic calendar by impact"
                  value={calImpact}
                  onChange={(e) => setCalImpact(e.target.value as typeof calImpact)}
                  className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 font-mono"
                >
                  <option value="ALL">All Impact</option>
                  <option value="High">High Impact</option>
                  <option value="Medium">Medium Impact</option>
                  <option value="Low">Low Impact</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono tabular-nums">
                <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#182235]/50 font-sans text-slate-500">
                  <tr>
                    <th className="py-2.5 px-3">Date / Time</th>
                    <th className="py-2.5 px-3">Region</th>
                    <th className="py-2.5 px-3">Event</th>
                    <th className="py-2.5 px-3">Impact</th>
                    <th className="py-2.5 px-3 text-right">Previous</th>
                    <th className="py-2.5 px-3 text-right">Consensus</th>
                    <th className="py-2.5 px-3 text-right">Actual</th>
                    <th className="py-2.5 px-3 text-right">Surprise</th>
                    <th className="py-2.5 px-3 text-right">Impact Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {filteredCalendar.map((ev) => {
                    const isSel = selectedCalendarEvent?.id === ev.id;
                    return (
                      <tr
                        key={ev.id}
                        data-vim-item
                        onClick={() => setSelectedCalId(ev.id)}
                        className={`cursor-pointer transition-colors ${
                          isSel ? 'bg-sky-500/12' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        <td className="py-2.5 px-3 text-slate-500">
                          {ev.date} · {ev.timeEt}
                        </td>
                        <td className="py-2.5 px-3 font-bold text-sky-500">{ev.country}</td>
                        <td className="py-2.5 px-3 font-sans font-semibold text-slate-900 dark:text-slate-100">
                          <button
                            type="button"
                            onClick={() => setSelectedCalId(ev.id)}
                            className="text-left hover:text-sky-500"
                          >
                            {ev.event}
                          </button>
                        </td>
                        <td
                          className={`py-2.5 px-3 font-sans font-semibold ${
                            ev.impact === 'High'
                              ? 'text-red-500'
                              : ev.impact === 'Medium'
                                ? 'text-amber-500'
                                : 'text-slate-500'
                          }`}
                        >
                          {ev.impact}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-500">{ev.previous}</td>
                        <td className="py-2.5 px-3 text-right">{ev.consensus}</td>
                        <td className="py-2.5 px-3 text-right font-bold">{ev.actual ?? 'Pending'}</td>
                        <td
                          className={`py-2.5 px-3 text-right font-sans font-semibold ${
                            ev.surpriseStatus === 'Beat'
                              ? 'text-emerald-500'
                              : ev.surpriseStatus === 'Miss'
                                ? 'text-red-500'
                                : 'text-slate-500'
                          }`}
                        >
                          {ev.surpriseStatus}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-sky-500">
                          {ev.marketImpactScore.toFixed(1)} / 10
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {selectedCalendarEvent && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Historical Market Reaction Analysis — {selectedCalendarEvent.event}
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Trailing {selectedCalendarEvent.historicalReaction.sampleSize}-release cross-asset response across SPX, US 10Y Yield &amp; Dollar Index
                  </p>
                </div>
                <span className="text-xs font-mono text-sky-500 font-semibold">
                  Volatility Multiplier: {selectedCalendarEvent.historicalReaction.volatilityMultiplier.toFixed(2)}x normal 15m range
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs font-mono tabular-nums">
                <div className="rounded border border-slate-200 dark:border-slate-800 p-2.5">
                  <div className="font-sans text-[11px] text-slate-500">Avg |SPX| T+15m</div>
                  <div className="mt-1 text-sm font-bold text-slate-900 dark:text-slate-100">
                    ±{selectedCalendarEvent.historicalReaction.avgSpxMove15mPct.toFixed(2)}%
                  </div>
                </div>
                <div className="rounded border border-slate-200 dark:border-slate-800 p-2.5">
                  <div className="font-sans text-[11px] text-slate-500">Avg |SPX| T+1D</div>
                  <div className="mt-1 text-sm font-bold text-slate-900 dark:text-slate-100">
                    ±{selectedCalendarEvent.historicalReaction.avgSpxMove1dPct.toFixed(2)}%
                  </div>
                </div>
                <div className="rounded border border-slate-200 dark:border-slate-800 p-2.5">
                  <div className="font-sans text-[11px] text-slate-500">Avg |10Y Yield|</div>
                  <div className="mt-1 text-sm font-bold text-sky-500">
                    ±{selectedCalendarEvent.historicalReaction.avgUs10yMoveBps.toFixed(1)} bps
                  </div>
                </div>
                <div className="rounded border border-slate-200 dark:border-slate-800 p-2.5">
                  <div className="font-sans text-[11px] text-slate-500">Avg |DXY| Move</div>
                  <div className="mt-1 text-sm font-bold text-slate-900 dark:text-slate-100">
                    ±{selectedCalendarEvent.historicalReaction.avgDxyMovePct.toFixed(2)}%
                  </div>
                </div>
                <div className="rounded border border-slate-200 dark:border-slate-800 p-2.5">
                  <div className="font-sans text-[11px] text-slate-500">On Beat (Avg SPX)</div>
                  <div className="mt-1 text-sm font-bold text-emerald-500">
                    {selectedCalendarEvent.historicalReaction.beatAvgSpxPct >= 0 ? '+' : ''}
                    {selectedCalendarEvent.historicalReaction.beatAvgSpxPct.toFixed(2)}%
                  </div>
                </div>
                <div className="rounded border border-slate-200 dark:border-slate-800 p-2.5">
                  <div className="font-sans text-[11px] text-slate-500">On Miss (Avg SPX)</div>
                  <div className="mt-1 text-sm font-bold text-red-500">
                    {selectedCalendarEvent.historicalReaction.missAvgSpxPct >= 0 ? '+' : ''}
                    {selectedCalendarEvent.historicalReaction.missAvgSpxPct.toFixed(2)}%
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                <div className="lg:col-span-5 rounded border border-slate-200 dark:border-slate-800 p-3 space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      SPX T+1D Reaction Across Past 6 Prints
                    </span>
                    <span className="font-mono">Green = Beat · Red = Miss</span>
                  </div>
                  <CalendarReactionSvg releases={selectedCalendarEvent.historicalReaction.pastReleases} />
                </div>

                <div className="lg:col-span-7 overflow-x-auto rounded border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-left text-xs font-mono tabular-nums">
                    <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#182235]/50 font-sans text-slate-500">
                      <tr>
                        <th className="py-2 px-3">Release Date</th>
                        <th className="py-2 px-2 text-right">Cons.</th>
                        <th className="py-2 px-2 text-right">Actual</th>
                        <th className="py-2 px-2">Surprise</th>
                        <th className="py-2 px-2 text-right">SPX 15m</th>
                        <th className="py-2 px-2 text-right">SPX 1D</th>
                        <th className="py-2 px-2 text-right">US 10Y</th>
                        <th className="py-2 px-3 text-right">DXY</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {selectedCalendarEvent.historicalReaction.pastReleases.map((rel) => (
                        <tr key={rel.date} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="py-2 px-3 text-slate-500">{rel.date}</td>
                          <td className="py-2 px-2 text-right">{rel.consensus}</td>
                          <td className="py-2 px-2 text-right font-semibold">{rel.actual}</td>
                          <td
                            className={`py-2 px-2 font-sans font-semibold ${
                              rel.surprise === 'Beat'
                                ? 'text-emerald-500'
                                : rel.surprise === 'Miss'
                                  ? 'text-red-500'
                                  : 'text-sky-500'
                            }`}
                          >
                            {rel.surprise}
                          </td>
                          <td className={`py-2 px-2 text-right ${rel.spx15mPct >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                            {rel.spx15mPct >= 0 ? '+' : ''}
                            {rel.spx15mPct.toFixed(2)}%
                          </td>
                          <td
                            className={`py-2 px-2 text-right font-semibold ${
                              rel.spx1dPct >= 0 ? 'text-emerald-500' : 'text-red-500'
                            }`}
                          >
                            {rel.spx1dPct >= 0 ? '+' : ''}
                            {rel.spx1dPct.toFixed(2)}%
                          </td>
                          <td className={`py-2 px-2 text-right ${rel.us10yBps >= 0 ? 'text-amber-500' : 'text-sky-500'}`}>
                            {rel.us10yBps >= 0 ? '+' : ''}
                            {rel.us10yBps.toFixed(1)} bps
                          </td>
                          <td className={`py-2 px-3 text-right ${rel.dxyPct >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                            {rel.dxyPct >= 0 ? '+' : ''}
                            {rel.dxyPct.toFixed(2)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: Business Cycle & Sector Rotation Model (RRG) */}
      {subTab === 'rotation' && (
        <div className="space-y-4">
          {macroData && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div>
                <span className="text-slate-500">Current Business Cycle Regime:</span>{' '}
                <strong className="text-sky-500 font-semibold">{macroData.businessCyclePhase}</strong>
                <span className="ml-2 text-slate-500">
                  (2s10s {macroData.spread10y2y >= 0 ? '+' : ''}{macroData.spread10y2y.toFixed(2)}% · 5Y Breakeven {macroData.inflation5yBreakeven.toFixed(2)}%)
                </span>
              </div>
              <div className="font-mono text-[11px] text-slate-500">
                Favored Rotation:{' '}
                <strong className="text-emerald-500">
                  {rotationData
                    .filter((r) => r.cycleBias === macroData.businessCyclePhase)
                    .map((r) => r.etf)
                    .join(' · ') || 'XLK · XLI'}
                </strong>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Relative Rotation Graph (RRG vs SPY)
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    X: Relative Strength Ratio (100-centered) · Y: Relative Momentum
                  </p>
                </div>
                <div className="flex items-center gap-3 text-[11px] font-mono">
                  <span className="text-emerald-500">■ Leading</span>
                  <span className="text-amber-500">■ Weakening</span>
                  <span className="text-red-500">■ Lagging</span>
                  <span className="text-sky-500">■ Improving</span>
                </div>
              </div>
              <SectorRotationSvg items={rotationData} onSelectEtf={onSelectSymbol} />
            </div>

            <div className="lg:col-span-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Sector Momentum &amp; Cycle Rankings
                </h3>
                <p className="text-[11px] text-slate-500">Weighted 1W / 1M / 3M relative momentum &amp; cycle fit</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono tabular-nums">
                  <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#182235]/50 font-sans text-slate-500">
                    <tr>
                      <th className="py-2 px-3">Sector</th>
                      <th className="py-2 px-2 text-right">1M</th>
                      <th className="py-2 px-2 text-right">Score</th>
                      <th className="py-2 px-2">Cycle Bias</th>
                      <th className="py-2 px-3 text-right">Phase</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {rotationData.map((sec) => {
                      const phaseColor =
                        sec.quadrant === 'Leading'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : sec.quadrant === 'Improving'
                            ? 'text-sky-600 dark:text-sky-400'
                            : sec.quadrant === 'Weakening'
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-red-600 dark:text-red-400';
                      const isCycleMatch = macroData?.businessCyclePhase === sec.cycleBias;
                      return (
                        <tr key={sec.etf} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="py-2 px-3">
                            <button
                              type="button"
                              onClick={() => onSelectSymbol(sec.etf)}
                              className="font-semibold text-sky-600 dark:text-sky-400 hover:underline"
                            >
                              {sec.etf}
                            </button>
                            <div className="font-sans text-[11px] text-slate-500 truncate max-w-[100px]">{sec.name}</div>
                          </td>
                          <td className={`py-2 px-2 text-right ${sec.ret1M >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                            {sec.ret1M >= 0 ? '+' : ''}
                            {sec.ret1M.toFixed(1)}%
                          </td>
                          <td className="py-2 px-2 text-right font-bold text-slate-900 dark:text-slate-100">
                            {sec.momentumScore}
                          </td>
                          <td className={`py-2 px-2 font-sans text-[11px] ${isCycleMatch ? 'font-bold text-sky-500' : 'text-slate-500'}`}>
                            {sec.cycleBias}
                          </td>
                          <td className={`py-2 px-3 text-right font-sans font-semibold ${phaseColor}`}>
                            {sec.quadrant}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Sector Relative Strength Matrix (ETF vs ETF Spread %) */}
          {rotationData.length > 1 && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Sector Relative Strength Matrix (Row ETF vs Column ETF Spread)
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Pairwise return spread (%) — positive values indicate the row sector outperforms the column sector
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  {(
                    [
                      { id: 'ret1W', label: '1W Spread' },
                      { id: 'ret1M', label: '1M Spread' },
                      { id: 'ret3M', label: '3M Spread' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setRsWindow(opt.id)}
                      className={`px-2.5 py-1 rounded border text-xs font-mono transition-colors ${
                        rsWindow === opt.id
                          ? 'border-sky-500 bg-sky-500/15 text-sky-500 font-semibold'
                          : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-center text-[11px] font-mono tabular-nums border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800">
                      <th className="p-2 text-left font-sans text-slate-500">Row vs Col</th>
                      {rotationData.map((col) => (
                        <th key={col.etf} className="p-2 text-slate-700 dark:text-slate-300" title={col.name}>
                          {col.etf}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rotationData.map((rowSec) => (
                      <tr key={rowSec.etf} className="border-t border-slate-200 dark:border-slate-800">
                        <td className="p-2 text-left whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => onSelectSymbol(rowSec.etf)}
                            className="font-bold text-sky-600 dark:text-sky-400 hover:underline"
                          >
                            {rowSec.etf}
                          </button>
                          <span className="ml-1.5 text-[10px] text-slate-500">
                            ({rowSec[rsWindow] >= 0 ? '+' : ''}
                            {rowSec[rsWindow].toFixed(1)}%)
                          </span>
                        </td>
                        {rotationData.map((colSec) => {
                          if (rowSec.etf === colSec.etf) {
                            return (
                              <td
                                key={colSec.etf}
                                className="p-2 border border-slate-200/50 dark:border-slate-800/60 bg-slate-200/60 dark:bg-slate-800 text-slate-400"
                              >
                                —
                              </td>
                            );
                          }
                          const spread = rowSec[rsWindow] - colSec[rsWindow];
                          const bg =
                            spread >= 4
                              ? 'bg-emerald-500/30 text-emerald-900 dark:text-emerald-200 font-semibold'
                              : spread > 0
                                ? 'bg-emerald-500/12 text-emerald-800 dark:text-emerald-300'
                                : spread <= -4
                                  ? 'bg-red-500/25 text-red-900 dark:text-red-200 font-semibold'
                                  : 'bg-red-500/10 text-red-700 dark:text-red-300';
                          return (
                            <td
                              key={colSec.etf}
                              title={`${rowSec.etf} vs ${colSec.etf}: ${spread >= 0 ? '+' : ''}${spread.toFixed(2)}%`}
                              className={`p-2 border border-slate-200/50 dark:border-slate-800/60 ${bg}`}
                            >
                              {spread >= 0 ? '+' : ''}
                              {spread.toFixed(1)}%
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: Rolling Cross-Asset Correlation Heatmap */}
      {subTab === 'correlations' && (
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Intermarket &amp; Cross-Asset Correlation Heatmap
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Pearson daily return correlations across Equities, Bonds, Commodities, Forex &amp; Crypto
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1">
                  {(['ALL', 'Equities', 'Bonds', 'Commodities', 'Forex', 'Crypto'] as const).map((cls) => (
                    <button
                      key={cls}
                      type="button"
                      onClick={() => setCorrClassFilter(cls)}
                      className={`px-2 py-1 rounded border text-[11px] font-medium transition-colors ${
                        corrClassFilter === cls
                          ? 'border-sky-500 bg-sky-500/15 text-sky-500 font-semibold'
                          : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100'
                      }`}
                    >
                      {cls}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1.5">
                  {([20, 60, 90, 180] as const).map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => setCorrWindow(w)}
                      className={`px-2.5 py-1 rounded border text-xs font-mono transition-colors ${
                        corrWindow === w
                          ? 'border-sky-500 bg-sky-500/15 text-sky-500 font-semibold'
                          : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100'
                      }`}
                    >
                      {w}D Window
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {!corrMatrix ? (
              <div className="p-8 text-center text-xs text-slate-500">Loading cross-asset correlation series...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-center text-xs font-mono tabular-nums border-collapse">
                  <thead>
                    <tr>
                      <th className="p-2 text-left text-slate-500 font-sans">Asset / Class</th>
                      {corrMatrix.assets.map((a) => (
                        <th key={a.symbol} className="p-2 text-slate-700 dark:text-slate-300" title={a.label}>
                          {a.symbol}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {corrMatrix.assets.map((rowAsset, rIdx) => (
                      <tr key={rowAsset.symbol} className="border-t border-slate-200 dark:border-slate-800">
                        <td className="p-2 text-left">
                          <span className="font-semibold text-slate-900 dark:text-slate-100">{rowAsset.symbol}</span>
                          <span className="ml-1.5 font-sans text-[11px] text-slate-500">{rowAsset.assetClass}</span>
                        </td>
                        {corrMatrix.matrix[rIdx].map((val, cIdx) => {
                          const bg =
                            rIdx === cIdx
                              ? 'bg-slate-200/70 dark:bg-slate-800 text-slate-500'
                              : val >= 0.7
                                ? 'bg-emerald-500/30 text-emerald-900 dark:text-emerald-200 font-semibold'
                                : val >= 0.35
                                  ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'
                                  : val <= -0.35
                                    ? 'bg-red-500/25 text-red-900 dark:text-red-200 font-semibold'
                                    : val < 0
                                      ? 'bg-red-500/10 text-red-700 dark:text-red-300'
                                      : 'bg-slate-100/70 dark:bg-slate-800/40 text-slate-600 dark:text-slate-300';
                          return (
                            <td key={`${rIdx}-${cIdx}`} className={`p-2 border border-slate-200/50 dark:border-slate-800/60 ${bg}`}>
                              {val.toFixed(2)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {correlationData && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Rolling Pair Correlation Trajectory ({pairA} vs {pairB})
                  </h4>
                  <p className="text-xs text-slate-500">
                    Tracks regime shifts between positive &amp; inverse correlation over time
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs font-mono">
                  <select
                    aria-label="First asset for rolling correlation"
                    value={pairA}
                    onChange={(e) => setPairA(e.target.value)}
                    className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1"
                  >
                    {correlationData.assets.map((a) => (
                      <option key={a.symbol} value={a.symbol}>
                        {a.symbol} ({a.label})
                      </option>
                    ))}
                  </select>
                  <span className="text-slate-400">vs</span>
                  <select
                    aria-label="Second asset for rolling correlation"
                    value={pairB}
                    onChange={(e) => setPairB(e.target.value)}
                    className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1"
                  >
                    {correlationData.assets.map((a) => (
                      <option key={a.symbol} value={a.symbol}>
                        {a.symbol} ({a.label})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <RollingPairSvg series={rollingPairSeries} />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const YieldCurveSvg: React.FC<{ curve: { tenor: string; yieldPct: number }[] }> = ({ curve }) => {
  if (curve.length < 2) return null;
  const vals = curve.map((c) => c.yieldPct);
  const min = Math.min(...vals) - 0.25;
  const max = Math.max(...vals) + 0.25;
  const span = max - min || 1;
  const w = 640;
  const h = 180;
  const padX = 48;
  const padY = 22;

  const coords = curve.map((c, i) => {
    const x = padX + (i / (curve.length - 1)) * (w - padX * 2);
    const y = h - padY - ((c.yieldPct - min) / span) * (h - padY * 2);
    return { ...c, x, y };
  });

  const linePts = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const areaPts = `${coords[0].x.toFixed(1)},${h - padY} ${linePts} ${coords[coords.length - 1].x.toFixed(1)},${h - padY}`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-44">
      <polygon fill="rgba(56, 189, 248, 0.14)" points={areaPts} />
      <polyline fill="none" stroke="#38BDF8" strokeWidth="2.5" points={linePts} />
      {coords.map((c) => (
        <g key={c.tenor}>
          <circle cx={c.x} cy={c.y} r="4.5" fill="#0EA5E9" stroke="#FFFFFF" strokeWidth="1.5" />
          <text x={c.x} y={c.y - 10} textAnchor="middle" fontSize="11" fill="currentColor" className="font-mono font-semibold">
            {c.yieldPct.toFixed(2)}%
          </text>
          <text x={c.x} y={h - 6} textAnchor="middle" fontSize="11" fill="#64748B" className="font-mono">
            {c.tenor}
          </text>
        </g>
      ))}
    </svg>
  );
};

const VixTermSvg: React.FC<{
  points: { tenor: string; vixLevel: number }[];
  contango: boolean;
}> = ({ points, contango }) => {
  if (points.length < 2) return null;
  const vals = points.map((p) => p.vixLevel);
  const min = Math.min(...vals) - 0.8;
  const max = Math.max(...vals) + 0.8;
  const span = max - min || 1;
  const w = 640;
  const h = 180;
  const padX = 48;
  const padY = 22;
  const stroke = contango ? '#10B981' : '#EF4444';

  const coords = points.map((p, i) => {
    const x = padX + (i / (points.length - 1)) * (w - padX * 2);
    const y = h - padY - ((p.vixLevel - min) / span) * (h - padY * 2);
    return { ...p, x, y };
  });
  const pts = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-44">
      <polyline fill="none" stroke={stroke} strokeWidth="2.5" points={pts} />
      {coords.map((c) => (
        <g key={c.tenor}>
          <circle cx={c.x} cy={c.y} r="4.5" fill={stroke} stroke="#FFFFFF" strokeWidth="1.5" />
          <text x={c.x} y={c.y - 10} textAnchor="middle" fontSize="11" fill="currentColor" className="font-mono font-semibold">
            {c.vixLevel.toFixed(2)}
          </text>
          <text x={c.x} y={h - 6} textAnchor="middle" fontSize="11" fill="#64748B" className="font-mono">
            {c.tenor}
          </text>
        </g>
      ))}
    </svg>
  );
};

const FearGreedGaugeSvg: React.FC<{ score: number; label: string }> = ({ score, label }) => {
  const angle = Math.PI - (Math.max(0, Math.min(100, score)) / 100) * Math.PI;
  const cx = 110;
  const cy = 104;
  const r = 74;
  const nx = cx + Math.cos(angle) * (r - 12);
  const ny = cy - Math.sin(angle) * (r - 12);
  return (
    <svg viewBox="0 0 220 128" className="w-full max-w-[210px] mx-auto">
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="#334155" strokeWidth="14" strokeLinecap="round" />
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx} ${cy - r}`}
        fill="none"
        stroke="#EF4444"
        strokeOpacity="0.45"
        strokeWidth="14"
        strokeLinecap="round"
      />
      <path
        d={`M ${cx} ${cy - r} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none"
        stroke="#10B981"
        strokeOpacity="0.45"
        strokeWidth="14"
        strokeLinecap="round"
      />
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="#38BDF8" strokeWidth="3" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="5" fill="#38BDF8" />
      <text x={cx} y={cy + 18} textAnchor="middle" fontSize="12" fill="currentColor" className="font-mono font-bold">
        {score} · {label}
      </text>
    </svg>
  );
};

const SectorRotationSvg: React.FC<{
  items: SectorRotationItem[];
  onSelectEtf: (etf: string) => void;
}> = ({ items, onSelectEtf }) => {
  const w = 520;
  const h = 340;
  const pad = 32;
  const minVal = 92;
  const maxVal = 108;
  const toX = (r: number) => pad + ((Math.max(minVal, Math.min(maxVal, r)) - minVal) / (maxVal - minVal)) * (w - pad * 2);
  const toY = (m: number) => h - pad - ((Math.max(minVal, Math.min(maxVal, m)) - minVal) / (maxVal - minVal)) * (h - pad * 2);
  const midX = toX(100);
  const midY = toY(100);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-72 select-none">
      <rect x={midX} y={pad} width={w - pad - midX} height={midY - pad} fill="rgba(34,197,94,0.08)" />
      <rect x={midX} y={midY} width={w - pad - midX} height={h - pad - midY} fill="rgba(245,158,11,0.08)" />
      <rect x={pad} y={midY} width={midX - pad} height={h - pad - midY} fill="rgba(239,68,68,0.08)" />
      <rect x={pad} y={pad} width={midX - pad} height={midY - pad} fill="rgba(14,165,233,0.08)" />

      <line x1={pad} y1={midY} x2={w - pad} y2={midY} stroke="#64748B" strokeDasharray="4 4" strokeWidth="1" />
      <line x1={midX} y1={pad} x2={midX} y2={h - pad} stroke="#64748B" strokeDasharray="4 4" strokeWidth="1" />

      <text x={w - pad - 8} y={pad + 16} textAnchor="end" fontSize="11" fill="#22C55E" fontWeight="600">
        LEADING
      </text>
      <text x={w - pad - 8} y={h - pad - 8} textAnchor="end" fontSize="11" fill="#F59E0B" fontWeight="600">
        WEAKENING
      </text>
      <text x={pad + 8} y={h - pad - 8} textAnchor="start" fontSize="11" fill="#EF4444" fontWeight="600">
        LAGGING
      </text>
      <text x={pad + 8} y={pad + 16} textAnchor="start" fontSize="11" fill="#0EA5E9" fontWeight="600">
        IMPROVING
      </text>

      {items.map((item) => {
        const cx = toX(item.rsRatio);
        const cy = toY(item.rsMomentum);
        const color =
          item.quadrant === 'Leading'
            ? '#22C55E'
            : item.quadrant === 'Weakening'
              ? '#F59E0B'
              : item.quadrant === 'Improving'
                ? '#0EA5E9'
                : '#EF4444';
        return (
          <g
            key={item.etf}
            className="cursor-pointer"
            onClick={() => onSelectEtf(item.etf)}
          >
            <line x1={midX} y1={midY} x2={cx} y2={cy} stroke={color} strokeOpacity="0.28" strokeWidth="1.2" />
            <circle cx={cx} cy={cy} r="6.5" fill={color} stroke="#FFFFFF" strokeWidth="1.5" />
            <text x={cx + 9} y={cy + 3} fontSize="11" fill="currentColor" className="font-mono font-bold">
              {item.etf}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

const RollingPairSvg: React.FC<{ series: { idx: number; corr: number }[] }> = ({ series }) => {
  if (series.length < 2) {
    return <div className="text-xs text-slate-500 py-4">Select a longer window to view rolling pair correlation.</div>;
  }
  const w = 720;
  const h = 135;
  const padY = 14;
  const toY = (v: number) => h - padY - ((v + 1) / 2) * (h - padY * 2);
  const zeroY = toY(0);
  const pts = series
    .map((p, i) => {
      const x = (i / (series.length - 1)) * w;
      return `${x.toFixed(1)},${toY(p.corr).toFixed(1)}`;
    })
    .join(' ');
  const latest = series[series.length - 1].corr;

  return (
    <div>
      <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 mb-1">
        <span>+1.00 (Lockstep) / -1.00 (Hedge)</span>
        <span>
          Current Rolling Corr:{' '}
          <strong className={latest >= 0 ? 'text-emerald-500' : 'text-red-500'}>{latest.toFixed(2)}</strong>
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-32" preserveAspectRatio="none">
        <line x1="0" y1={zeroY} x2={w} y2={zeroY} stroke="#64748B" strokeDasharray="4 4" strokeWidth="1" />
        <polyline fill="none" stroke="#38BDF8" strokeWidth="2.2" points={pts} />
      </svg>
    </div>
  );
};

const FuturesTermStructureSvg: React.FC<{ curve: FuturesCurveData }> = ({ curve }) => {
  const contracts = curve.contracts;
  if (contracts.length < 2) return null;
  const prices = [...contracts.map((c) => c.price), curve.spotPrice];
  const min = Math.min(...prices) * 0.996;
  const max = Math.max(...prices) * 1.004;
  const span = max - min || 1;
  const w = 640;
  const h = 190;
  const padX = 54;
  const padY = 26;
  const dec = curve.frontPrice < 20 ? 3 : curve.frontPrice < 100 ? 2 : 1;

  const toY = (v: number) => h - padY - ((v - min) / span) * (h - padY * 2);
  const spotY = toY(curve.spotPrice);
  const stroke = curve.curveRegime === 'Backwardation' ? '#10B981' : '#F59E0B';

  const coords = contracts.map((c, i) => {
    const x = padX + (i / (contracts.length - 1)) * (w - padX * 2);
    const y = toY(c.price);
    return { ...c, x, y };
  });
  const linePts = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-48">
      <line x1={padX} y1={spotY} x2={w - padX} y2={spotY} stroke="#64748B" strokeDasharray="4 4" strokeWidth="1.2" />
      <text x={padX} y={spotY - 5} fontSize="10" fill="#64748B" className="font-mono">
        Spot {curve.spotPrice.toFixed(dec)}
      </text>
      <polyline fill="none" stroke={stroke} strokeWidth="2.5" points={linePts} />
      {coords.map((c) => (
        <g key={c.contractCode}>
          <circle cx={c.x} cy={c.y} r="4.5" fill={stroke} stroke="#FFFFFF" strokeWidth="1.5" />
          <text x={c.x} y={c.y - 10} textAnchor="middle" fontSize="10.5" fill="currentColor" className="font-mono font-semibold">
            {c.price.toFixed(dec)}
          </text>
          <text x={c.x} y={h - 6} textAnchor="middle" fontSize="10.5" fill="#64748B" className="font-mono">
            {c.label.replace(' (Front)', '')}
          </text>
        </g>
      ))}
    </svg>
  );
};

const FuturesNormalizedCurveSvg: React.FC<{ curves: FuturesCurveData[]; activeRoot: string }> = ({
  curves,
  activeRoot,
}) => {
  if (curves.length === 0) return null;
  const allBasis = curves.flatMap((c) => c.contracts.map((pt) => pt.basisPct));
  const min = Math.min(-2, ...allBasis) - 0.5;
  const max = Math.max(2, ...allBasis) + 0.5;
  const span = max - min || 1;
  const w = 640;
  const h = 190;
  const padX = 48;
  const padY = 22;
  const toY = (v: number) => h - padY - ((v - min) / span) * (h - padY * 2);
  const zeroY = toY(0);
  const palette = ['#0EA5E9', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6', '#14B8A6'];
  const labels = curves[0]?.contracts.map((c) => c.label.replace(' (Front)', '')) ?? [];

  return (
    <div className="space-y-2">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-44">
        <line x1={padX} y1={zeroY} x2={w - padX} y2={zeroY} stroke="#64748B" strokeDasharray="4 4" strokeWidth="1" />
        <text x={padX - 6} y={zeroY + 3} textAnchor="end" fontSize="10" fill="#64748B" className="font-mono">
          0%
        </text>
        {labels.map((lbl, idx) => {
          const x = padX + (idx / Math.max(1, labels.length - 1)) * (w - padX * 2);
          return (
            <text key={lbl} x={x} y={h - 6} textAnchor="middle" fontSize="10.5" fill="#64748B" className="font-mono">
              {lbl}
            </text>
          );
        })}
        {curves.map((curve, cIdx) => {
          const color = palette[cIdx % palette.length];
          const isActive = curve.rootSymbol === activeRoot;
          const pts = curve.contracts
            .map((pt, i) => {
              const x = padX + (i / Math.max(1, curve.contracts.length - 1)) * (w - padX * 2);
              const y = toY(pt.basisPct);
              return `${x.toFixed(1)},${y.toFixed(1)}`;
            })
            .join(' ');
          return (
            <polyline
              key={curve.rootSymbol}
              fill="none"
              stroke={color}
              strokeWidth={isActive ? 2.8 : 1.5}
              strokeOpacity={isActive ? 1 : 0.55}
              points={pts}
            />
          );
        })}
      </svg>
      <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono">
        {curves.map((c, idx) => (
          <span key={c.rootSymbol} className={c.rootSymbol === activeRoot ? 'font-bold' : 'opacity-75'}>
            <span style={{ color: palette[idx % palette.length] }}>■</span> {c.rootSymbol} ({c.curveSlopePct >= 0 ? '+' : ''}
            {c.curveSlopePct.toFixed(1)}%)
          </span>
        ))}
      </div>
    </div>
  );
};

const CalendarReactionSvg: React.FC<{
  releases: EconomicCalendarEvent['historicalReaction']['pastReleases'];
}> = ({ releases }) => {
  if (releases.length === 0) return null;
  const w = 440;
  const h = 155;
  const padX = 28;
  const padY = 20;
  const maxAbs = Math.max(0.5, ...releases.map((r) => Math.abs(r.spx1dPct)));
  const zeroY = padY + (h - padY * 2) / 2;
  const barStep = (w - padX * 2) / releases.length;
  const barW = Math.min(34, barStep * 0.62);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-36">
      <line x1={padX} y1={zeroY} x2={w - padX} y2={zeroY} stroke="#64748B" strokeDasharray="3 3" strokeWidth="1" />
      {releases
        .slice()
        .reverse()
        .map((rel, i) => {
          const cx = padX + i * barStep + barStep / 2;
          const barH = (Math.abs(rel.spx1dPct) / maxAbs) * ((h - padY * 2) / 2 - 8);
          const y = rel.spx1dPct >= 0 ? zeroY - barH : zeroY;
          const fill =
            rel.surprise === 'Beat' ? '#10B981' : rel.surprise === 'Miss' ? '#EF4444' : '#0EA5E9';
          return (
            <g key={rel.date}>
              <rect x={cx - barW / 2} y={y} width={barW} height={Math.max(3, barH)} rx="2" fill={fill} fillOpacity="0.82" />
              <text
                x={cx}
                y={rel.spx1dPct >= 0 ? y - 4 : y + barH + 11}
                textAnchor="middle"
                fontSize="10"
                fill="currentColor"
                className="font-mono font-semibold"
              >
                {rel.spx1dPct >= 0 ? '+' : ''}
                {rel.spx1dPct.toFixed(2)}%
              </text>
              <text x={cx} y={h - 4} textAnchor="middle" fontSize="9.5" fill="#64748B" className="font-mono">
                {rel.date.slice(5)}
              </text>
            </g>
          );
        })}
    </svg>
  );
};
