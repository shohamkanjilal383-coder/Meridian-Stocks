import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  CandlestickChart,
  Download,
  Eraser,
  FileSpreadsheet,
  FileText,
  Grid2x2,
  Layers,
  LineChart,
  MousePointer,
  PenLine,
  SlidersHorizontal,
  Sparkles,
  Square,
  TrendingUp,
  Undo2,
} from 'lucide-react';
import { INDICATOR_CATALOG } from '../lib/indicators';
import { exportBarsToCSV, exportChartCanvasToPNG, exportEquityReportPDF } from '../lib/exportUtils';
import { offlineCache } from '../lib/indexedDb';
import type {
  ChartLayoutMode,
  ChartStyle,
  DrawingObject,
  DrawingToolType,
  HistoryRange,
  OHLCVBar,
  PredictionSuite,
  StockQuote,
  Timeframe,
} from '../types/market';
import { TradingChart } from './TradingChart';

const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d', '1w', '1M'];
const HISTORY_RANGES: HistoryRange[] = ['1M', '3M', '6M', '1Y', '5Y', '10Y', 'ALL'];
const MULTI_SYMBOLS = ['AAPL', 'NVDA', 'MSFT', 'RELIANCE.NS'];

interface TechnicalWorkspaceProps {
  symbol: string;
  quote?: StockQuote;
  bars: OHLCVBar[];
  timeframe: Timeframe;
  onTimeframeChange: (tf: Timeframe) => void;
  quotes: Record<string, StockQuote>;
  prediction: PredictionSuite;
  darkMode: boolean;
  highContrast: boolean;
  loadingBars: boolean;
  onSelectSymbol: (sym: string) => void;
}

export const TechnicalWorkspace: React.FC<TechnicalWorkspaceProps> = ({
  symbol,
  quote,
  bars,
  timeframe,
  onTimeframeChange,
  quotes,
  prediction,
  darkMode,
  highContrast,
  loadingBars,
  onSelectSymbol,
}) => {
  const [chartStyle, setChartStyle] = useState<ChartStyle>('candlestick');
  const [historyRange, setHistoryRange] = useState<HistoryRange>('ALL');
  const [layoutMode, setLayoutMode] = useState<ChartLayoutMode>('1x1');
  const [activeIndicators, setActiveIndicators] = useState<string[]>(['sma20', 'sma50', 'rsi']);
  const [showIndicatorMenu, setShowIndicatorMenu] = useState(false);
  const [activeTool, setActiveTool] = useState<DrawingToolType>('cursor');
  const [drawings, setDrawings] = useState<DrawingObject[]>([]);
  const [showForecastOverlay, setShowForecastOverlay] = useState(true);
  const [syncedCrosshair, setSyncedCrosshair] = useState<{ time: number; sourceId: string } | null>(null);
  const [paneSymbols, setPaneSymbols] = useState<string[]>([symbol, 'NVDA', 'MSFT', 'RELIANCE.NS']);
  const [paneBars, setPaneBars] = useState<Record<string, OHLCVBar[]>>({});
  const exportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setPaneSymbols((prev) => [symbol, ...prev.slice(1)]);
  }, [symbol]);

  useEffect(() => {
    offlineCache.getDrawings().then((saved) => {
      if (saved.length > 0) setDrawings(saved);
    });
  }, []);

  // Fetch bars for extra multi-chart panes
  useEffect(() => {
    if (layoutMode === '1x1') return;
    const count = layoutMode === '1x3' ? 3 : 4;
    const targets = paneSymbols.slice(1, count);
    targets.forEach(async (sym) => {
      const cacheKey = `${sym}::${timeframe}`;
      if (paneBars[cacheKey]?.length) return;
      try {
        const res = await fetch(`/api/market/bars/${encodeURIComponent(sym)}?timeframe=${timeframe}`);
        if (res.ok) {
          const data = (await res.json()) as { bars: OHLCVBar[] };
          setPaneBars((prev) => ({ ...prev, [cacheKey]: data.bars }));
        }
      } catch {
        // Ignore
      }
    });
  }, [layoutMode, timeframe, paneSymbols.join(',')]);

  const toggleIndicator = (id: string) => {
    setActiveIndicators((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleAddDrawing = (d: DrawingObject) => {
    setDrawings((prev) => [...prev, d]);
    offlineCache.saveDrawing(d);
    setActiveTool('cursor');
  };

  const handleUndoDrawing = () => {
    const forSym = drawings.filter((d) => d.symbol === symbol);
    const last = forSym[forSym.length - 1];
    if (!last) return;
    setDrawings((prev) => prev.filter((d) => d.id !== last.id));
    offlineCache.deleteDrawing(last.id);
  };

  const handleClearDrawings = () => {
    const toRemove = drawings.filter((d) => d.symbol === symbol);
    setDrawings((prev) => prev.filter((d) => d.symbol !== symbol));
    toRemove.forEach((d) => offlineCache.deleteDrawing(d.id));
  };

  const paneCount = layoutMode === '1x1' ? 1 : layoutMode === '1x3' ? 3 : 4;

  const spanLabel =
    bars.length >= 2
      ? `${new Date(bars[0].time * 1000).toISOString().slice(0, 10)} → ${new Date(bars[bars.length - 1].time * 1000).toISOString().slice(0, 10)} · ${bars.length.toLocaleString()} bars`
      : '';

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] px-3 py-2">
        {/* Timeframes & History Range */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 overflow-x-auto" role="group" aria-label="Chart Timeframe">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => onTimeframeChange(tf)}
                className={`px-2 py-1 text-xs font-mono font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  timeframe === tf
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          <span className="hidden sm:inline text-slate-300 dark:text-slate-700" aria-hidden="true">|</span>

          <div className="flex items-center gap-0.5 overflow-x-auto" role="group" aria-label="Visible History Range">
            {HISTORY_RANGES.map((rng) => (
              <button
                key={rng}
                type="button"
                onClick={() => setHistoryRange(rng)}
                title={rng === 'ALL' ? 'Fit full all-time history' : `Zoom to last ${rng}`}
                className={`px-2 py-1 text-[11px] font-mono font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  historyRange === rng
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {rng}
              </button>
            ))}
          </div>

          {spanLabel && (
            <span className="hidden xl:inline text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
              {spanLabel}
            </span>
          )}
        </div>

        {/* Chart Style & Indicators & Layout */}
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex items-center rounded-md border border-slate-200 dark:border-slate-700 p-0.5">
            {(
              [
                { id: 'candlestick', label: 'Candles', icon: CandlestickChart },
                { id: 'heikin_ashi', label: 'Heikin-Ashi', icon: Activity },
                { id: 'line', label: 'Line', icon: LineChart },
                { id: 'area', label: 'Area', icon: Layers },
              ] as const
            ).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setChartStyle(id)}
                title={label}
                className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors whitespace-nowrap shrink-0 ${
                  chartStyle === id
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 font-medium'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          {/* Indicators Popover Button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowIndicatorMenu((s) => !s)}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-sky-500" aria-hidden="true" />
              Indicators ({activeIndicators.length})
            </button>

            {showIndicatorMenu && (
              <div className="absolute right-0 top-full mt-1.5 z-40 w-80 max-h-96 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 shadow-lg">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200 dark:border-slate-800">
                  <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    Technical Indicators ({INDICATOR_CATALOG.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowIndicatorMenu(false)}
                    className="text-xs text-sky-500 hover:underline"
                  >
                    Done
                  </button>
                </div>
                {(['Trend', 'Momentum', 'Volatility', 'Volume', 'Levels'] as const).map((cat) => (
                  <div key={cat} className="mb-3 last:mb-0">
                    <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">{cat}</div>
                    <div className="grid grid-cols-1 gap-1">
                      {INDICATOR_CATALOG.filter((i) => i.category === cat).map((ind) => {
                        const active = activeIndicators.includes(ind.id);
                        return (
                          <label
                            key={ind.id}
                            className="flex items-center justify-between px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer text-xs"
                          >
                            <span className="text-slate-800 dark:text-slate-200">{ind.name}</span>
                            <input
                              type="checkbox"
                              checked={active}
                              onChange={() => toggleIndicator(ind.id)}
                              className="accent-sky-500"
                            />
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Forecast Cone Toggle */}
          <button
            type="button"
            onClick={() => setShowForecastOverlay((v) => !v)}
            className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              showForecastOverlay
                ? 'border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-300'
                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            ML Cone
          </button>

          {/* Multi-Chart Layout */}
          <div className="flex items-center rounded-md border border-slate-200 dark:border-slate-700 p-0.5">
            {(
              [
                { id: '1x1', label: '1x1', icon: Square },
                { id: '1x3', label: '1x3', icon: TrendingUp },
                { id: '2x2', label: '2x2', icon: Grid2x2 },
              ] as const
            ).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setLayoutMode(id)}
                className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors whitespace-nowrap shrink-0 ${
                  layoutMode === id
                    ? 'bg-sky-600 text-white font-medium'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <Icon className="w-3 h-3" aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Drawing Tools + Export Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] px-3 py-1.5">
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mr-1">Draw:</span>
          {(
            [
              { id: 'cursor', label: 'Crosshair', icon: MousePointer },
              { id: 'trendline', label: 'Trendline', icon: PenLine },
              { id: 'horizontal', label: 'S/R Level', icon: Activity },
              { id: 'channel', label: 'Channel', icon: Layers },
              { id: 'fib_ext', label: 'Fib Ext', icon: TrendingUp },
              { id: 'gann_fan', label: 'Gann Fan', icon: Sparkles },
            ] as const
          ).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTool(id)}
              className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors whitespace-nowrap shrink-0 ${
                activeTool === id
                  ? 'bg-sky-500/15 text-sky-600 dark:text-sky-300 font-medium border border-sky-500/30'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="w-3 h-3" aria-hidden="true" />
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={handleUndoDrawing}
            title="Undo last drawing"
            className="inline-flex items-center gap-1 px-2 py-1 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 rounded"
          >
            <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={handleClearDrawings}
            title="Clear drawings for symbol"
            className="inline-flex items-center gap-1 px-2 py-1 text-xs text-slate-500 hover:text-red-500 rounded"
          >
            <Eraser className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => exportChartCanvasToPNG(exportRef.current, symbol)}
            className="inline-flex items-center gap-1 rounded border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            PNG
          </button>
          <button
            type="button"
            onClick={() => exportBarsToCSV(symbol, bars)}
            className="inline-flex items-center gap-1 rounded border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" aria-hidden="true" />
            CSV
          </button>
          {quote && (
            <button
              type="button"
              onClick={() => exportEquityReportPDF(quote, prediction)}
              className="inline-flex items-center gap-1 rounded bg-slate-900 dark:bg-slate-100 px-2.5 py-1 text-xs font-medium text-white dark:text-slate-900 hover:opacity-90 whitespace-nowrap shrink-0"
            >
              <FileText className="w-3.5 h-3.5" aria-hidden="true" />
              PDF Report
            </button>
          )}
        </div>
      </div>

      {/* Chart Grid Viewport */}
      <div
        className={`grid gap-3 ${
          layoutMode === '1x1'
            ? 'grid-cols-1'
            : layoutMode === '1x3'
              ? 'grid-cols-1 lg:grid-cols-3'
              : 'grid-cols-1 md:grid-cols-2'
        }`}
      >
        {Array.from({ length: paneCount }).map((_, idx) => {
          const paneSym = idx === 0 ? symbol : paneSymbols[idx] || MULTI_SYMBOLS[idx];
          const pBars = idx === 0 ? bars : paneBars[`${paneSym}::${timeframe}`] ?? bars;
          const pQuote = quotes[paneSym];
          const paneHeight = layoutMode === '1x1' ? 490 : 320;

          return (
            <div
              key={`${paneSym}-${idx}`}
              className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F17] overflow-hidden"
            >
              {layoutMode !== '1x1' && (
                <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#111827] text-xs">
                  <div className="flex items-center gap-2">
                    <select
                      aria-label={`Chart pane ${idx + 1} symbol`}
                      value={paneSym}
                      onChange={(e) => {
                        const nextSym = e.target.value;
                        if (idx === 0) onSelectSymbol(nextSym);
                        else {
                          setPaneSymbols((prev) => {
                            const copy = [...prev];
                            copy[idx] = nextSym;
                            return copy;
                          });
                        }
                      }}
                      className="bg-transparent font-mono font-semibold text-slate-900 dark:text-slate-100 focus:outline-none"
                    >
                      {['AAPL', 'NVDA', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'JPM', 'RELIANCE.NS', 'TCS.NS'].map((s) => (
                        <option key={s} value={s} className="bg-white dark:bg-slate-900">
                          {s}
                        </option>
                      ))}
                    </select>
                    {pQuote && (
                      <span className="font-mono tabular-nums text-slate-600 dark:text-slate-300">
                        {pQuote.price.toFixed(2)} ({pQuote.changePercent >= 0 ? '+' : ''}
                        {pQuote.changePercent.toFixed(2)}%)
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-slate-500">Synced Crosshair</span>
                </div>
              )}

              {loadingBars && idx === 0 ? (
                <div className="flex items-center justify-center bg-slate-50 dark:bg-[#0B0F17]" style={{ height: paneHeight }}>
                  <div className="animate-pulse text-xs font-mono text-slate-500">Loading {paneSym} {timeframe} bars...</div>
                </div>
              ) : (
                <TradingChart
                  paneId={`pane-${idx}`}
                  symbol={paneSym}
                  bars={pBars}
                  quote={pQuote}
                  chartStyle={chartStyle}
                  visibleRange={historyRange}
                  activeIndicators={idx === 0 ? activeIndicators : activeIndicators.slice(0, 2)}
                  activeTool={idx === 0 ? activeTool : 'cursor'}
                  drawings={drawings}
                  onAddDrawing={handleAddDrawing}
                  prediction={idx === 0 ? prediction : undefined}
                  showForecastOverlay={idx === 0 && showForecastOverlay}
                  darkMode={darkMode}
                  highContrast={highContrast}
                  height={paneHeight}
                  syncedCrosshair={syncedCrosshair}
                  onCrosshairMove={setSyncedCrosshair}
                  containerRefOut={idx === 0 ? exportRef : undefined}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
