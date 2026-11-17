import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Bot,
  Calculator,
  Check,
  Code2,
  Copy,
  Download,
  FileSpreadsheet,
  Play,
  Plus,
  ShieldAlert,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { exportGenericCSV } from '../lib/exportUtils';
import { runMonteCarloPortfolio, type MonteCarloOutput } from '../lib/quantEngine';
import {
  calculateKellySizing,
  compareStrategiesWithSignificance,
  computePortfolioRisk,
  generateQuantConnectPython,
  runParameterOptimization,
  runStrategyMonteCarloRobustness,
  runVectorizedBacktest,
  runWalkForwardBacktest,
  type BacktestStrategyId,
} from '../lib/riskEngine';
import type {
  OHLCVBar,
  PortfolioPosition,
  PortfolioTransaction,
  StockQuote,
  TradeJournalEntry,
} from '../types/market';
import { TaxCompliancePanel } from './TaxCompliancePanel';

export type PortfolioSubTab = 'holdings' | 'risk' | 'kelly' | 'backtest' | 'montecarlo' | 'journal' | 'tax';

interface PortfolioRiskPanelProps {
  positions: PortfolioPosition[];
  transactions: PortfolioTransaction[];
  quotes: Record<string, StockQuote>;
  historicalSeries: Record<string, OHLCVBar[]>;
  activeSymbol: string;
  activeBars: OHLCVBar[];
  journalEntries: TradeJournalEntry[];
  initialTab?: PortfolioSubTab;
  onTabChange?: (tab: PortfolioSubTab) => void;
  onTrade: (side: 'BUY' | 'SELL', symbol: string, shares: number, price: number) => void;
  onRemovePosition: (id: string) => void;
  onSelectSymbol: (symbol: string) => void;
  onAddJournalEntry: (entry: TradeJournalEntry) => void;
  onUpdateJournalEntry: (entry: TradeJournalEntry) => void;
  onDeleteJournalEntry: (id: string) => void;
}

export const PortfolioRiskPanel: React.FC<PortfolioRiskPanelProps> = ({
  positions,
  transactions,
  quotes,
  historicalSeries,
  activeSymbol,
  activeBars,
  journalEntries,
  initialTab = 'holdings',
  onTabChange,
  onTrade,
  onRemovePosition,
  onSelectSymbol,
  onAddJournalEntry,
  onUpdateJournalEntry,
  onDeleteJournalEntry,
}) => {
  const [subTab, setSubTab] = useState<PortfolioSubTab>(initialTab);

  useEffect(() => {
    setSubTab(initialTab);
  }, [initialTab]);

  const changeTab = (next: PortfolioSubTab) => {
    setSubTab(next);
    onTabChange?.(next);
  };

  // Trade ticket state
  const [tradeSym, setTradeSym] = useState(activeSymbol);
  const [tradeShares, setTradeShares] = useState('10');
  const [tradeSide, setTradeSide] = useState<'BUY' | 'SELL'>('BUY');

  // Kelly calculator state
  const [kellyBalance, setKellyBalance] = useState('100000');
  const [kellyWinRate, setKellyWinRate] = useState('56');
  const [kellyAvgWin, setKellyAvgWin] = useState('4.2');
  const [kellyAvgLoss, setKellyAvgLoss] = useState('2.1');
  const [kellyEntry, setKellyEntry] = useState(String(quotes[activeSymbol]?.price ?? 220));
  const [kellyStop, setKellyStop] = useState(String(Number(((quotes[activeSymbol]?.price ?? 220) * 0.95).toFixed(2))));

  // Advanced Backtest Lab state
  const [strategyId, setStrategyId] = useState<BacktestStrategyId>('sma_cross');
  const [slippageBps, setSlippageBps] = useState(5);
  const [commissionUsd, setCommissionUsd] = useState(1.5);
  const [fastParam, setFastParam] = useState(20);
  const [slowParam, setSlowParam] = useState(50);
  const [showQcCode, setShowQcCode] = useState(false);
  const [qcCopied, setQcCopied] = useState(false);

  const risk = useMemo(
    () => computePortfolioRisk(positions, quotes, historicalSeries),
    [positions, quotes, historicalSeries]
  );

  // Monte Carlo state
  const [mcCapital, setMcCapital] = useState(() => String(Math.round(risk.totalValue || 100000)));
  const [mcReturn, setMcReturn] = useState('14');
  const [mcVol, setMcVol] = useState(() => String(Math.max(12, Math.round(risk.annualizedVolPct || 22))));
  const [mcDays, setMcDays] = useState<30 | 90 | 180 | 252>(252);
  const [mcContrib, setMcContrib] = useState('1000');
  const [mcTarget, setMcTarget] = useState('130000');
  const [mcSeed, setMcSeed] = useState(0);

  const monteCarlo = useMemo(
    () =>
      runMonteCarloPortfolio({
        initialCapital: Math.max(1000, Number(mcCapital) || 100000),
        annualReturnPct: Number(mcReturn) || 12,
        annualVolPct: Math.max(4, Number(mcVol) || 20),
        days: mcDays,
        monthlyContribution: Math.max(0, Number(mcContrib) || 0),
        targetValue: Math.max(1000, Number(mcTarget) || 125000),
        simulations: 600,
      }),
    [mcCapital, mcReturn, mcVol, mcDays, mcContrib, mcTarget, mcSeed]
  );

  // Trade Journal Form & AI Coach state
  const [jSymbol, setJSymbol] = useState(activeSymbol);
  const [jSide, setJSide] = useState<'LONG' | 'SHORT'>('LONG');
  const [jEntryPx, setJEntryPx] = useState(String(quotes[activeSymbol]?.price ?? 220));
  const [jExitPx, setJExitPx] = useState(String(Number(((quotes[activeSymbol]?.price ?? 220) * 1.03).toFixed(2))));
  const [jShares, setJShares] = useState('25');
  const [jSetup, setJSetup] = useState('VWAP Pullback');
  const [jDiscipline, setJDiscipline] = useState<1 | 2 | 3 | 4 | 5>(4);
  const [jNotes, setJNotes] = useState('');
  const [aiReviewText, setAiReviewText] = useState('');
  const [aiReviewLoading, setAiReviewLoading] = useState(false);
  const [aiReviewError, setAiReviewError] = useState<string | null>(null);

  const kelly = useMemo(
    () =>
      calculateKellySizing({
        accountBalance: Number(kellyBalance) || 100000,
        winRatePct: Number(kellyWinRate) || 50,
        avgWinPct: Number(kellyAvgWin) || 2,
        avgLossPct: Number(kellyAvgLoss) || 1,
        entryPrice: Number(kellyEntry) || 100,
        stopLossPrice: Number(kellyStop) || 95,
      }),
    [kellyBalance, kellyWinRate, kellyAvgWin, kellyAvgLoss, kellyEntry, kellyStop]
  );

  const backtest = useMemo(
    () => runWalkForwardBacktest(activeBars, strategyId),
    [activeBars, strategyId]
  );

  const vectorizedBt = useMemo(
    () =>
      runVectorizedBacktest({
        bars: activeBars,
        strategy: strategyId,
        slippageBps,
        commissionUsd,
        fastParam,
        slowParam,
      }),
    [activeBars, strategyId, slippageBps, commissionUsd, fastParam, slowParam]
  );

  const strategyMc = useMemo(
    () => runStrategyMonteCarloRobustness(vectorizedBt.tradeReturns, 400),
    [vectorizedBt.tradeReturns]
  );

  const optGrid = useMemo(
    () => runParameterOptimization(activeBars, strategyId, slippageBps, commissionUsd),
    [activeBars, strategyId, slippageBps, commissionUsd]
  );

  const strategyComparison = useMemo(
    () => compareStrategiesWithSignificance(activeBars, slippageBps, commissionUsd),
    [activeBars, slippageBps, commissionUsd]
  );

  const quantConnectCode = useMemo(
    () =>
      generateQuantConnectPython({
        symbol: activeSymbol,
        strategy: strategyId,
        slippageBps,
        commissionUsd,
        fastParam,
        slowParam,
      }),
    [activeSymbol, strategyId, slippageBps, commissionUsd, fastParam, slowParam]
  );

  const handleStageHarvestTrade = (sellSymbol: string, shares: number, replacementSymbol: string) => {
    const sellPx = quotes[sellSymbol]?.price ?? 100;
    const buyPx = quotes[replacementSymbol]?.price ?? sellPx;
    const notional = shares * sellPx;
    onTrade('SELL', sellSymbol, shares, sellPx);
    onTrade('BUY', replacementSymbol, Number((notional / Math.max(1, buyPx)).toFixed(4)), buyPx);
  };

  const handleCopyQc = async () => {
    try {
      await navigator.clipboard.writeText(quantConnectCode);
      setQcCopied(true);
      window.setTimeout(() => setQcCopied(false), 1800);
    } catch {
      // Ignore clipboard failures
    }
  };

  const handleDownloadQc = () => {
    const blob = new Blob([quantConnectCode], { type: 'text/x-python' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meridian_${activeSymbol.toLowerCase()}_${strategyId}_qc.py`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const journalStats = useMemo(() => {
    const total = journalEntries.length;
    const wins = journalEntries.filter((e) => e.pnlUsd > 0);
    const losses = journalEntries.filter((e) => e.pnlUsd < 0);
    const totalPnl = journalEntries.reduce((s, e) => s + e.pnlUsd, 0);
    const grossWin = wins.reduce((s, e) => s + e.pnlUsd, 0);
    const grossLoss = Math.abs(losses.reduce((s, e) => s + e.pnlUsd, 0));
    const winRate = total > 0 ? (wins.length / total) * 100 : 0;
    const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 3.5 : 0;
    const avgDisc = total > 0 ? journalEntries.reduce((s, e) => s + e.disciplineRating, 0) / total : 0;
    return { total, totalPnl, winRate, profitFactor, avgDisc };
  }, [journalEntries]);

  const handleAddJournal = (e: React.FormEvent) => {
    e.preventDefault();
    const sym = jSymbol.toUpperCase().trim();
    const entry = Number(jEntryPx);
    const exit = Number(jExitPx);
    const qty = Number(jShares);
    if (!sym || !entry || !exit || !qty) return;
    const mult = jSide === 'LONG' ? 1 : -1;
    const pnlUsd = Number(((exit - entry) * qty * mult).toFixed(2));
    const pnlPct = Number((((exit - entry) / entry) * 100 * mult).toFixed(2));
    const today = new Date().toISOString().slice(0, 10);
    onAddJournalEntry({
      id: `jrn-${Date.now()}`,
      symbol: sym,
      side: jSide,
      entryPrice: entry,
      exitPrice: exit,
      shares: qty,
      entryDate: today,
      exitDate: today,
      setupTag: jSetup.trim() || 'Discretionary',
      disciplineRating: jDiscipline,
      notes: jNotes.trim() || 'Executed per plan.',
      pnlUsd,
      pnlPct,
    });
    setJNotes('');
  };

  const handleRunAiCoach = async () => {
    if (journalEntries.length === 0) return;
    setAiReviewLoading(true);
    setAiReviewError(null);
    try {
      const res = await fetch('/api/ai/journal-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: journalEntries }),
      });
      const data = (await res.json()) as { review?: string; error?: string };
      if (!res.ok || data.error) {
        setAiReviewError(data.error ?? `AI review failed (${res.status})`);
      } else {
        setAiReviewText(data.review ?? 'No review returned.');
        const latest = journalEntries[0];
        if (latest) {
          onUpdateJournalEntry({ ...latest, aiReview: data.review });
        }
      }
    } catch (err) {
      setAiReviewError(err instanceof Error ? err.message : 'Network error calling AI Coach');
    } finally {
      setAiReviewLoading(false);
    }
  };

  const handleExecuteTrade = (e: React.FormEvent) => {
    e.preventDefault();
    const sym = tradeSym.toUpperCase().trim();
    const qty = Math.max(0.01, Number(tradeShares) || 0);
    if (!sym || qty <= 0) return;
    const price = quotes[sym]?.price ?? quotes[activeSymbol]?.price ?? 150;
    onTrade(tradeSide, sym, qty, price);
  };

  const handleExportPortfolio = () => {
    exportGenericCSV(
      `Meridian_Portfolio_${new Date().toISOString().slice(0, 10)}.csv`,
      ['Symbol', 'Exchange', 'Sector', 'Shares', 'AvgCost', 'LivePrice', 'MarketValue', 'UnrealizedPnL'],
      positions.map((p) => {
        const px = quotes[p.symbol]?.price ?? p.avgCost;
        const mv = p.shares * px;
        const pnl = mv - p.shares * p.avgCost;
        return [p.symbol, p.exchange, p.sector, p.shares, p.avgCost.toFixed(2), px.toFixed(2), mv.toFixed(2), pnl.toFixed(2)];
      })
    );
  };

  return (
    <div className="space-y-4">
      {/* Top KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-3.5">
          <div className="text-xs text-slate-500 dark:text-slate-400">Portfolio Equity</div>
          <div className="mt-1 text-lg font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100">
            ${risk.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] font-mono text-slate-500 tabular-nums">
            Cost Basis: ${risk.totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-3.5">
          <div className="text-xs text-slate-500 dark:text-slate-400">Unrealized P&amp;L</div>
          <div
            className={`mt-1 text-lg font-mono font-bold tabular-nums ${
              risk.unrealizedPnL >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
            }`}
          >
            {risk.unrealizedPnL >= 0 ? '+' : ''}${risk.unrealizedPnL.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] font-mono text-slate-500 tabular-nums">
            {risk.unrealizedPnLPct >= 0 ? '+' : ''}
            {risk.unrealizedPnLPct.toFixed(2)}% total return
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-3.5">
          <div className="text-xs text-slate-500 dark:text-slate-400">Day P&amp;L</div>
          <div
            className={`mt-1 text-lg font-mono font-bold tabular-nums ${
              risk.dayPnL >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
            }`}
          >
            {risk.dayPnL >= 0 ? '+' : ''}${risk.dayPnL.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] font-mono text-slate-500 tabular-nums">Beta: {risk.portfolioBeta.toFixed(2)}</div>
        </div>

        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-3.5">
          <div className="text-xs text-slate-500 dark:text-slate-400">95% Daily VaR</div>
          <div className="mt-1 text-lg font-mono font-bold tabular-nums text-amber-600 dark:text-amber-400">
            -${risk.var95Daily.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] font-mono text-slate-500 tabular-nums">
            99% VaR: -${risk.var99Daily.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-3.5">
          <div className="text-xs text-slate-500 dark:text-slate-400">Sharpe / Max DD</div>
          <div className="mt-1 text-lg font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100">
            {risk.sharpeRatio.toFixed(2)}
          </div>
          <div className="text-[11px] font-mono text-slate-500 tabular-nums">
            Max Drawdown: -{risk.maxDrawdownPct.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* Sub-navigation */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-[#111827] p-1">
          {(
            [
              { id: 'holdings', label: 'Holdings & Execution' },
              { id: 'risk', label: 'Risk & Correlation' },
              { id: 'kelly', label: 'Kelly Sizing' },
              { id: 'backtest', label: 'Backtesting Lab' },
              { id: 'montecarlo', label: 'Monte Carlo' },
              { id: 'journal', label: 'Trade Journal & AI' },
              { id: 'tax', label: 'Tax & Form 8949' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              data-vim-tab={t.id}
              onClick={() => changeTab(t.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                subTab === t.id
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={handleExportPortfolio}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <FileSpreadsheet className="w-3.5 h-3.5" aria-hidden="true" />
          Export CSV
        </button>
      </div>

      {subTab === 'holdings' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Holdings Table */}
          <div className="lg:col-span-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Virtual Portfolio Positions</h3>
              <span className="text-xs text-slate-500 font-mono">{positions.length} active</span>
            </div>

            {positions.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No positions held. Use the trade ticket to open your first position.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#182235]/50 text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="py-2.5 px-3 font-medium">Symbol</th>
                      <th className="py-2.5 px-3 font-medium text-right">Shares</th>
                      <th className="py-2.5 px-3 font-medium text-right">Avg Cost</th>
                      <th className="py-2.5 px-3 font-medium text-right">Live Price</th>
                      <th className="py-2.5 px-3 font-medium text-right">Mkt Value</th>
                      <th className="py-2.5 px-3 font-medium text-right">Unrealized P&amp;L</th>
                      <th className="py-2.5 px-3 font-medium text-right">Weight</th>
                      <th className="py-2.5 px-3 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {positions.map((pos) => {
                      const px = quotes[pos.symbol]?.price ?? pos.avgCost;
                      const mv = pos.shares * px;
                      const pnl = mv - pos.shares * pos.avgCost;
                      const pnlPct = ((px - pos.avgCost) / pos.avgCost) * 100;
                      const weight = risk.totalValue > 0 ? (mv / risk.totalValue) * 100 : 0;
                      return (
                        <tr key={pos.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="py-2.5 px-3">
                            <button
                              type="button"
                              onClick={() => onSelectSymbol(pos.symbol)}
                              className="font-mono font-semibold text-sky-600 dark:text-sky-400 hover:underline"
                            >
                              {pos.symbol}
                            </button>
                            <div className="text-[11px] text-slate-500 truncate max-w-[140px]">{pos.sector}</div>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums">{pos.shares}</td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums">${pos.avgCost.toFixed(2)}</td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums font-medium">${px.toFixed(2)}</td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums">${mv.toFixed(2)}</td>
                          <td
                            className={`py-2.5 px-3 text-right font-mono tabular-nums ${
                              pnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                            }`}
                          >
                            {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} ({pnlPct >= 0 ? '+' : ''}
                            {pnlPct.toFixed(1)}%)
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums">{weight.toFixed(1)}%</td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => onRemovePosition(pos.id)}
                              aria-label={`Remove ${pos.symbol}`}
                              className="text-slate-400 hover:text-red-500 p-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Paper Trade Execution & Attribution */}
          <div className="space-y-4">
            <form
              onSubmit={handleExecuteTrade}
              className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4 space-y-3"
            >
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Paper Trade Ticket</h3>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTradeSide('BUY')}
                  className={`py-1.5 text-xs font-semibold rounded border ${
                    tradeSide === 'BUY'
                      ? 'border-emerald-500 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                      : 'border-slate-200 dark:border-slate-700 text-slate-500'
                  }`}
                >
                  BUY
                </button>
                <button
                  type="button"
                  onClick={() => setTradeSide('SELL')}
                  className={`py-1.5 text-xs font-semibold rounded border ${
                    tradeSide === 'SELL'
                      ? 'border-red-500 bg-red-500/15 text-red-600 dark:text-red-400'
                      : 'border-slate-200 dark:border-slate-700 text-slate-500'
                  }`}
                >
                  SELL
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Symbol</label>
                  <input
                    type="text"
                    value={tradeSym}
                    onChange={(e) => setTradeSym(e.target.value.toUpperCase())}
                    className="w-full rounded border border-slate-300 dark:border-slate-700 bg-transparent px-2.5 py-1.5 text-xs font-mono uppercase focus:border-sky-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Shares</label>
                  <input
                    type="number"
                    min="0.01"
                    step="any"
                    value={tradeShares}
                    onChange={(e) => setTradeShares(e.target.value)}
                    className="w-full rounded border border-slate-300 dark:border-slate-700 bg-transparent px-2.5 py-1.5 text-xs font-mono focus:border-sky-500 focus:outline-none"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between text-xs font-mono text-slate-500">
                <span>Est. Fill Price:</span>
                <span className="text-slate-900 dark:text-slate-100">
                  ${(quotes[tradeSym]?.price ?? quotes[activeSymbol]?.price ?? 150).toFixed(2)}
                </span>
              </div>
              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-md bg-sky-600 hover:bg-sky-700 py-2 text-xs font-semibold text-white transition-colors"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                Submit {tradeSide} Order
              </button>
            </form>

            {/* Allocation Breakdown */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Allocation &amp; Attribution</h3>
              <div className="space-y-2.5">
                {risk.attribution.map((a) => (
                  <div key={a.symbol} className="text-xs">
                    <div className="flex items-center justify-between font-mono mb-1">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {a.symbol} <span className="font-sans font-normal text-slate-500">· {a.sector}</span>
                      </span>
                      <span className="tabular-nums">
                        {a.weightPct}% ·{' '}
                        <span className={a.contributionPnL >= 0 ? 'text-emerald-500' : 'text-red-500'}>
                          {a.contributionPnL >= 0 ? '+' : ''}${a.contributionPnL.toFixed(0)}
                        </span>
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded bg-slate-200 dark:bg-slate-800 overflow-hidden">
                      <div className="h-full bg-sky-500" style={{ width: `${Math.min(100, a.weightPct)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              {transactions.length > 0 && (
                <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800">
                  <div className="text-[11px] font-semibold text-slate-500 mb-1.5">Recent Executions</div>
                  <div className="space-y-1 max-h-28 overflow-y-auto text-[11px] font-mono">
                    {transactions.slice(0, 5).map((tx) => (
                      <div key={tx.id} className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                        <span>
                          {tx.side} {tx.shares} {tx.symbol} @ ${tx.price.toFixed(2)}
                        </span>
                        <span>{new Date(tx.timestamp).toLocaleTimeString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {subTab === 'risk' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-3">
              <ShieldAlert className="w-4 h-4 text-amber-500" aria-hidden="true" />
              Quantitative Risk Diagnostics
            </h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              {[
                { label: 'Historical VaR (95%, 1-Day)', val: `-$${risk.var95Daily.toFixed(2)}` },
                { label: 'Tail VaR (99%, 1-Day)', val: `-$${risk.var99Daily.toFixed(2)}` },
                { label: 'Annualized Sharpe Ratio', val: risk.sharpeRatio.toFixed(2) },
                { label: 'Annualized Sortino Ratio', val: risk.sortinoRatio.toFixed(2) },
                { label: 'Max Historical Drawdown', val: `-${risk.maxDrawdownPct.toFixed(2)}%` },
                { label: 'Portfolio Beta (vs SPX)', val: risk.portfolioBeta.toFixed(2) },
                { label: 'Annualized Volatility', val: `${risk.annualizedVolPct.toFixed(2)}%` },
                { label: 'Active Positions', val: String(positions.length) },
              ].map((m) => (
                <div key={m.label} className="rounded border border-slate-200 dark:border-slate-800 p-3">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">{m.label}</div>
                  <div className="mt-1 text-base font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                    {m.val}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4 overflow-x-auto">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
              Asset Return Correlation Matrix
            </h3>
            {risk.correlationMatrix.symbols.length === 0 ? (
              <p className="text-xs text-slate-500">Add positions to compute cross-asset correlations.</p>
            ) : (
              <table className="w-full text-center text-xs font-mono tabular-nums">
                <thead>
                  <tr>
                    <th className="p-2 text-left text-slate-500">Asset</th>
                    {risk.correlationMatrix.symbols.map((s) => (
                      <th key={s} className="p-2 text-slate-600 dark:text-slate-300">
                        {s}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {risk.correlationMatrix.symbols.map((s, rIdx) => (
                    <tr key={s} className="border-t border-slate-200 dark:border-slate-800">
                      <td className="p-2 text-left font-semibold text-slate-800 dark:text-slate-200">{s}</td>
                      {risk.correlationMatrix.matrix[rIdx].map((val, cIdx) => {
                        const bg =
                          val > 0.75
                            ? 'bg-sky-500/25 text-sky-900 dark:text-sky-200'
                            : val > 0.35
                              ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'
                              : val < -0.1
                                ? 'bg-red-500/20 text-red-800 dark:text-red-300'
                                : 'bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300';
                        return (
                          <td key={`${rIdx}-${cIdx}`} className={`p-2 ${bg}`}>
                            {val.toFixed(2)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {subTab === 'kelly' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Calculator className="w-4 h-4 text-sky-500" aria-hidden="true" />
              Kelly Criterion Position Sizing Calculator
            </h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              {[
                { label: 'Account Equity ($)', val: kellyBalance, set: setKellyBalance },
                { label: 'Historical Win Rate (%)', val: kellyWinRate, set: setKellyWinRate },
                { label: 'Average Win (%)', val: kellyAvgWin, set: setKellyAvgWin },
                { label: 'Average Loss (%)', val: kellyAvgLoss, set: setKellyAvgLoss },
                { label: 'Entry Price ($)', val: kellyEntry, set: setKellyEntry },
                { label: 'Stop-Loss Price ($)', val: kellyStop, set: setKellyStop },
              ].map((f) => (
                <div key={f.label}>
                  <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">{f.label}</label>
                  <input
                    type="number"
                    step="any"
                    value={f.val}
                    onChange={(e) => f.set(e.target.value)}
                    className="w-full rounded border border-slate-300 dark:border-slate-700 bg-transparent px-2.5 py-1.5 font-mono text-xs focus:border-sky-500 focus:outline-none"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#182235]/60 p-4 flex flex-col justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">Optimal Capital Allocation</div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <div>
                  <div className="text-[11px] text-slate-500">Full Kelly</div>
                  <div className="text-lg font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100">
                    {kelly.fullKellyPct}%
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-sky-500 font-medium">Half Kelly (Rec.)</div>
                  <div className="text-lg font-mono font-bold tabular-nums text-sky-600 dark:text-sky-400">
                    {kelly.halfKellyPct}%
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Quarter Kelly</div>
                  <div className="text-lg font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100">
                    {kelly.quarterKellyPct}%
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 grid grid-cols-2 gap-3 text-xs font-mono tabular-nums">
              <div>
                <span className="block font-sans text-[11px] text-slate-500">Recommended Shares (Half Kelly)</span>
                <strong className="text-base text-slate-900 dark:text-slate-100">{kelly.recommendedShares} shares</strong>
              </div>
              <div>
                <span className="block font-sans text-[11px] text-slate-500">Position Dollar Allocation</span>
                <strong className="text-base text-slate-900 dark:text-slate-100">
                  ${kelly.positionDollarValue.toLocaleString()}
                </strong>
              </div>
              <div>
                <span className="block font-sans text-[11px] text-slate-500">Risk to Stop-Loss</span>
                <strong className="text-amber-600 dark:text-amber-400">${kelly.maxRiskDollars.toLocaleString()}</strong>
              </div>
              <div>
                <span className="block font-sans text-[11px] text-slate-500">Expectancy / $1 Risked</span>
                <strong className={kelly.expectedValuePerDollar >= 0 ? 'text-emerald-500' : 'text-red-500'}>
                  {kelly.expectedValuePerDollar >= 0 ? '+' : ''}
                  {kelly.expectedValuePerDollar}
                </strong>
              </div>
            </div>
          </div>
        </div>
      )}

      {subTab === 'backtest' && (
        <div className="space-y-4">
          {/* Controls & Vectorized KPIs */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Play className="w-4 h-4 text-sky-500" aria-hidden="true" />
                  Advanced Vectorized Backtesting Lab ({activeSymbol})
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {vectorizedBt.strategyName} · Slippage {slippageBps} bps · Commission ${commissionUsd.toFixed(2)}/order
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <select
                  aria-label="Select backtest strategy"
                  value={strategyId}
                  onChange={(e) => setStrategyId(e.target.value as BacktestStrategyId)}
                  className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 font-medium"
                >
                  <option value="sma_cross">SMA Trend Crossover</option>
                  <option value="rsi_reversion">RSI Mean Reversion</option>
                  <option value="macd_momentum">MACD Histogram Momentum</option>
                  <option value="bb_breakout">Bollinger Volatility Breakout</option>
                </select>
                <label className="flex items-center gap-1 font-mono text-[11px] text-slate-500">
                  Slip (bps)
                  <input
                    type="number"
                    min={0}
                    max={50}
                    value={slippageBps}
                    onChange={(e) => setSlippageBps(Math.max(0, Math.min(50, Number(e.target.value) || 0)))}
                    className="w-14 rounded border border-slate-300 dark:border-slate-700 bg-transparent px-2 py-1 text-right text-slate-900 dark:text-slate-100"
                  />
                </label>
                <label className="flex items-center gap-1 font-mono text-[11px] text-slate-500">
                  Comm ($)
                  <input
                    type="number"
                    min={0}
                    step="0.5"
                    max={25}
                    value={commissionUsd}
                    onChange={(e) => setCommissionUsd(Math.max(0, Math.min(25, Number(e.target.value) || 0)))}
                    className="w-14 rounded border border-slate-300 dark:border-slate-700 bg-transparent px-2 py-1 text-right text-slate-900 dark:text-slate-100"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setShowQcCode((s) => !s)}
                  className="inline-flex items-center gap-1.5 rounded border border-sky-500/40 bg-sky-500/10 px-2.5 py-1.5 text-xs font-semibold text-sky-500 hover:bg-sky-500/20"
                >
                  <Code2 className="w-3.5 h-3.5" aria-hidden="true" />
                  {showQcCode ? 'Hide QuantConnect' : 'Export Python / QC'}
                </button>
              </div>
            </div>

            {showQcCode && (
              <div className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-950 text-slate-100 p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-sky-400">QuantConnect LEAN Python Algorithm (QCAlgorithm)</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCopyQc}
                      className="inline-flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-[11px] hover:bg-slate-800"
                    >
                      {qcCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      {qcCopied ? 'Copied' : 'Copy'}
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadQc}
                      className="inline-flex items-center gap-1 rounded bg-sky-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-sky-700"
                    >
                      <Download className="w-3 h-3" />
                      Download .py
                    </button>
                  </div>
                </div>
                <pre className="text-[11px] font-mono overflow-x-auto max-h-60 leading-relaxed text-slate-300">
                  {quantConnectCode}
                </pre>
              </div>
            )}

            {/* Vectorized Net vs Gross KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5 text-xs font-mono tabular-nums">
              {[
                {
                  label: 'Net Return',
                  val: `${vectorizedBt.netReturnPct >= 0 ? '+' : ''}${vectorizedBt.netReturnPct}%`,
                  cls: vectorizedBt.netReturnPct >= 0 ? 'text-emerald-500' : 'text-red-500',
                },
                {
                  label: 'Gross Return',
                  val: `${vectorizedBt.grossReturnPct >= 0 ? '+' : ''}${vectorizedBt.grossReturnPct}%`,
                  cls: '',
                },
                {
                  label: 'Friction Cost',
                  val: `$${vectorizedBt.totalFrictionUsd.toFixed(0)}`,
                  cls: 'text-amber-500',
                },
                { label: 'Sharpe', val: vectorizedBt.sharpeRatio.toFixed(2), cls: '' },
                { label: 'Sortino', val: vectorizedBt.sortinoRatio.toFixed(2), cls: '' },
                { label: 'Max DD', val: `-${vectorizedBt.maxDrawdownPct}%`, cls: 'text-red-500' },
                { label: 't-Stat', val: vectorizedBt.tStatistic.toFixed(2), cls: '' },
                {
                  label: 'p-Value',
                  val: `${vectorizedBt.pValue.toFixed(3)}${vectorizedBt.statisticallySignificant ? ' *' : ''}`,
                  cls: vectorizedBt.statisticallySignificant ? 'text-emerald-500' : 'text-slate-500',
                },
              ].map((k) => (
                <div key={k.label} className="rounded border border-slate-200 dark:border-slate-800 p-2.5">
                  <div className="font-sans text-[11px] text-slate-500">{k.label}</div>
                  <div className={`mt-0.5 font-semibold text-sm ${k.cls}`}>{k.val}</div>
                </div>
              ))}
            </div>

            {vectorizedBt.equityCurve.length > 2 && (
              <div className="rounded border border-slate-200 dark:border-slate-800 p-3">
                <div className="flex items-center justify-between text-[11px] text-slate-500 mb-2">
                  <span>Net Equity Curve vs Buy-and-Hold ({vectorizedBt.trades} round-trip trades · Win Rate {vectorizedBt.winRatePct}%)</span>
                  <span className="font-mono">
                    <span className="text-sky-500">■ Net Strategy</span> · <span className="text-slate-400">■ Benchmark</span>
                  </span>
                </div>
                <BacktestEquitySvg curve={vectorizedBt.equityCurve} />
              </div>
            )}
          </div>

          {/* Strategy Monte Carlo Robustness + Parameter Optimization Walk-Forward Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold">Strategy Monte Carlo Robustness (400 Resamples)</h4>
                  <p className="text-xs text-slate-500">Bootstrap resampling of empirical trade returns</p>
                </div>
                <span className="text-xs font-mono text-amber-500 font-semibold">
                  Risk of Ruin: {strategyMc.riskOfRuinPct}%
                </span>
              </div>

              <div className="grid grid-cols-4 gap-2 text-xs font-mono tabular-nums">
                <div className="rounded border border-slate-200 dark:border-slate-800 p-2">
                  <div className="font-sans text-[10px] text-slate-500">P5 Tail</div>
                  <div className="font-bold text-red-500">{strategyMc.p5ReturnPct}%</div>
                </div>
                <div className="rounded border border-slate-200 dark:border-slate-800 p-2">
                  <div className="font-sans text-[10px] text-slate-500">Median Ret</div>
                  <div className="font-bold text-sky-500">{strategyMc.medianReturnPct}%</div>
                </div>
                <div className="rounded border border-slate-200 dark:border-slate-800 p-2">
                  <div className="font-sans text-[10px] text-slate-500">P95 Bull</div>
                  <div className="font-bold text-emerald-500">+{strategyMc.p95ReturnPct}%</div>
                </div>
                <div className="rounded border border-slate-200 dark:border-slate-800 p-2">
                  <div className="font-sans text-[10px] text-slate-500">P95 Max DD</div>
                  <div className="font-bold text-red-500">-{strategyMc.worstDrawdownP95Pct}%</div>
                </div>
              </div>

              <StrategyRobustnessSvg curves={strategyMc.sampleCurves} />
            </div>

            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold">Parameter Optimization &amp; Walk-Forward Efficiency</h4>
                  <p className="text-[11px] text-slate-500">65% In-Sample / 35% Out-of-Sample grid (click row to apply)</p>
                </div>
                <span className="font-mono text-[11px] text-sky-500">
                  Active: {fastParam}/{slowParam}
                </span>
              </div>
              <div className="overflow-x-auto max-h-64 overflow-y-auto">
                <table className="w-full text-left text-xs font-mono tabular-nums">
                  <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#182235]/50 font-sans text-slate-500">
                    <tr>
                      <th className="py-2 px-3">Fast / Slow</th>
                      <th className="py-2 px-2 text-right">IS Sharpe</th>
                      <th className="py-2 px-2 text-right">OOS Sharpe</th>
                      <th className="py-2 px-2 text-right">OOS Ret</th>
                      <th className="py-2 px-3 text-right">WFE Ratio</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {optGrid.slice(0, 8).map((cell, i) => {
                      const active = cell.fastParam === fastParam && cell.slowParam === slowParam;
                      return (
                        <tr
                          key={i}
                          onClick={() => {
                            setFastParam(cell.fastParam);
                            setSlowParam(cell.slowParam);
                          }}
                          className={`cursor-pointer ${
                            active ? 'bg-sky-500/12' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                          }`}
                        >
                          <td className="py-1.5 px-3 font-semibold text-sky-500">
                            {cell.fastParam} / {cell.slowParam}
                          </td>
                          <td className="py-1.5 px-2 text-right">{cell.inSampleSharpe.toFixed(2)}</td>
                          <td className="py-1.5 px-2 text-right font-semibold">{cell.outSampleSharpe.toFixed(2)}</td>
                          <td
                            className={`py-1.5 px-2 text-right ${
                              cell.netReturnPct >= 0 ? 'text-emerald-500' : 'text-red-500'
                            }`}
                          >
                            {cell.netReturnPct >= 0 ? '+' : ''}
                            {cell.netReturnPct}%
                          </td>
                          <td className="py-1.5 px-3 text-right">{cell.wfeRatio.toFixed(2)}x</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Multi-Strategy Statistical Significance Comparison + Walk-Forward Folds */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h4 className="text-sm font-semibold">Strategy Comparison &amp; Statistical Significance Matrix</h4>
              <span className="text-[11px] font-mono text-slate-500">Alpha Significance Threshold: p &lt; 0.05</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono tabular-nums">
                <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#182235]/50 font-sans text-slate-500">
                  <tr>
                    <th className="py-2 px-3">Strategy</th>
                    <th className="py-2 px-2 text-right">Net Ret</th>
                    <th className="py-2 px-2 text-right">Sharpe</th>
                    <th className="py-2 px-2 text-right">Sortino</th>
                    <th className="py-2 px-2 text-right">Max DD</th>
                    <th className="py-2 px-2 text-right">Trades</th>
                    <th className="py-2 px-2 text-right">t-Stat</th>
                    <th className="py-2 px-3 text-right">p-Value · Significance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {strategyComparison.map((row) => (
                    <tr key={row.strategyId} className={row.strategyId === strategyId ? 'bg-sky-500/8' : ''}>
                      <td className="py-2 px-3 font-sans font-semibold">{row.strategyName}</td>
                      <td className={`py-2 px-2 text-right ${row.netReturnPct >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        {row.netReturnPct >= 0 ? '+' : ''}
                        {row.netReturnPct}%
                      </td>
                      <td className="py-2 px-2 text-right">{row.sharpeRatio.toFixed(2)}</td>
                      <td className="py-2 px-2 text-right">{row.sortinoRatio.toFixed(2)}</td>
                      <td className="py-2 px-2 text-right text-red-500">-{row.maxDrawdownPct}%</td>
                      <td className="py-2 px-2 text-right">{row.trades}</td>
                      <td className="py-2 px-2 text-right">{row.tStatistic.toFixed(2)}</td>
                      <td
                        className={`py-2 px-3 text-right font-sans font-semibold ${
                          row.statisticallySignificant ? 'text-emerald-500' : 'text-slate-500'
                        }`}
                      >
                        p={row.pValue.toFixed(3)} · {row.statisticallySignificant ? 'Significant' : 'Inconclusive'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {backtest.walkForwardFolds.length > 0 && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4">
              <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                3-Fold Walk-Forward Validation Splits (In-Sample vs Out-of-Sample)
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {backtest.walkForwardFolds.map((f) => (
                  <div key={f.fold} className="rounded border border-slate-200 dark:border-slate-800 p-3 text-xs font-mono">
                    <div className="font-sans font-semibold text-slate-800 dark:text-slate-200 mb-1">Fold #{f.fold}</div>
                    <div className="flex justify-between text-slate-500">
                      <span>In-Sample:</span>
                      <span>
                        {f.inSampleReturnPct >= 0 ? '+' : ''}
                        {f.inSampleReturnPct}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Out-of-Sample:</span>
                      <span className={f.outSampleReturnPct >= 0 ? 'text-emerald-500' : 'text-red-500'}>
                        {f.outSampleReturnPct >= 0 ? '+' : ''}
                        {f.outSampleReturnPct}%
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-500">
                      <span>OOS Sharpe / Trades:</span>
                      <span>
                        {f.outSampleSharpe} / {f.trades}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* MONTE CARLO SIMULATOR (#3) */}
      {subTab === 'montecarlo' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-sky-500" aria-hidden="true" />
                Monte Carlo Parameters
              </h3>
              <button
                type="button"
                onClick={() => setMcSeed((s) => s + 1)}
                className="rounded border border-sky-500/40 bg-sky-500/10 px-2.5 py-1 text-[11px] font-semibold text-sky-500 hover:bg-sky-500/20"
              >
                Re-Simulate (600 Paths)
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Initial Capital ($)</label>
                <input
                  type="number"
                  value={mcCapital}
                  onChange={(e) => setMcCapital(e.target.value)}
                  className="w-full rounded border border-slate-300 dark:border-slate-700 bg-transparent px-2.5 py-1.5 font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Target Equity ($)</label>
                <input
                  type="number"
                  value={mcTarget}
                  onChange={(e) => setMcTarget(e.target.value)}
                  className="w-full rounded border border-slate-300 dark:border-slate-700 bg-transparent px-2.5 py-1.5 font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Expected Return (% / yr)</label>
                <input
                  type="number"
                  step="0.5"
                  value={mcReturn}
                  onChange={(e) => setMcReturn(e.target.value)}
                  className="w-full rounded border border-slate-300 dark:border-slate-700 bg-transparent px-2.5 py-1.5 font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Annual Volatility (%)</label>
                <input
                  type="number"
                  step="1"
                  value={mcVol}
                  onChange={(e) => setMcVol(e.target.value)}
                  className="w-full rounded border border-slate-300 dark:border-slate-700 bg-transparent px-2.5 py-1.5 font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Monthly Contribution ($)</label>
                <input
                  type="number"
                  step="100"
                  value={mcContrib}
                  onChange={(e) => setMcContrib(e.target.value)}
                  className="w-full rounded border border-slate-300 dark:border-slate-700 bg-transparent px-2.5 py-1.5 font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Projection Horizon</label>
                <select
                  aria-label="Monte Carlo projection horizon"
                  value={mcDays}
                  onChange={(e) => setMcDays(Number(e.target.value) as 30 | 90 | 180 | 252)}
                  className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 font-mono"
                >
                  <option value={30}>30 Trading Days</option>
                  <option value={90}>90 Trading Days</option>
                  <option value={180}>180 Trading Days</option>
                  <option value={252}>1 Year (252D)</option>
                </select>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 grid grid-cols-2 gap-3 text-xs font-mono tabular-nums">
              <div>
                <span className="block font-sans text-[11px] text-slate-500">Expected Terminal Equity</span>
                <strong className="text-sm text-slate-900 dark:text-slate-100">
                  ${monteCarlo.expectedFinal.toLocaleString()}
                </strong>
              </div>
              <div>
                <span className="block font-sans text-[11px] text-slate-500">Median CAGR</span>
                <strong className="text-sm text-sky-500">
                  {monteCarlo.cagrMedianPct >= 0 ? '+' : ''}
                  {monteCarlo.cagrMedianPct}%
                </strong>
              </div>
              <div>
                <span className="block font-sans text-[11px] text-slate-500">Prob. of Profit</span>
                <strong className="text-sm text-emerald-500">{monteCarlo.probProfitPct}%</strong>
              </div>
              <div>
                <span className="block font-sans text-[11px] text-slate-500">Prob. Hitting Target</span>
                <strong className="text-sm text-emerald-500">{monteCarlo.probTargetPct}%</strong>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4 flex flex-col justify-between space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  GBM Stochastic Portfolio Fan Chart ({monteCarlo.days}D)
                </h3>
                <p className="text-xs text-slate-500">
                  5th–95th outer confidence envelope · 25th–75th interquartile band · P50 median path
                </p>
              </div>
              <div className="flex items-center gap-3 text-[11px] font-mono">
                <span className="text-sky-500">■ P50 Median</span>
                <span className="text-emerald-500">■ P95 Bull</span>
                <span className="text-red-500">■ P5 Tail</span>
              </div>
            </div>
            <MonteCarloFanSvg mc={monteCarlo} />
            <div className="grid grid-cols-5 gap-2 pt-2 border-t border-slate-200 dark:border-slate-800 text-center text-xs font-mono tabular-nums">
              {(() => {
                const last = monteCarlo.percentiles[monteCarlo.percentiles.length - 1];
                return [
                  { label: 'P5 Tail', val: last.p5, col: 'text-red-500' },
                  { label: 'P25', val: last.p25, col: 'text-amber-500' },
                  { label: 'P50 Median', val: last.p50, col: 'text-sky-500' },
                  { label: 'P75', val: last.p75, col: 'text-emerald-400' },
                  { label: 'P95 Bull', val: last.p95, col: 'text-emerald-500' },
                ].map((b) => (
                  <div key={b.label} className="rounded border border-slate-200 dark:border-slate-800 p-2">
                    <div className="font-sans text-[11px] text-slate-500">{b.label}</div>
                    <div className={`font-bold ${b.col}`}>${b.val.toLocaleString()}</div>
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
      )}

      {/* TRADE JOURNAL & AI COACH (#10) */}
      {subTab === 'journal' && (
        <div className="space-y-4">
          {/* Journal KPI Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-3">
              <div className="text-[11px] text-slate-500">Logged Trades</div>
              <div className="mt-1 text-lg font-mono font-bold tabular-nums">{journalStats.total}</div>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-3">
              <div className="text-[11px] text-slate-500">Realized Journal P&amp;L</div>
              <div
                className={`mt-1 text-lg font-mono font-bold tabular-nums ${
                  journalStats.totalPnl >= 0 ? 'text-emerald-500' : 'text-red-500'
                }`}
              >
                {journalStats.totalPnl >= 0 ? '+' : ''}${journalStats.totalPnl.toFixed(2)}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-3">
              <div className="text-[11px] text-slate-500">Win Rate</div>
              <div className="mt-1 text-lg font-mono font-bold tabular-nums">{journalStats.winRate.toFixed(1)}%</div>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-3">
              <div className="text-[11px] text-slate-500">Profit Factor</div>
              <div className="mt-1 text-lg font-mono font-bold tabular-nums">{journalStats.profitFactor.toFixed(2)}</div>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-3">
              <div className="text-[11px] text-slate-500">Avg Discipline</div>
              <div className="mt-1 text-lg font-mono font-bold tabular-nums text-sky-500">
                {journalStats.avgDisc.toFixed(1)} / 5.0
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Log Trade Form */}
            <form
              onSubmit={handleAddJournal}
              className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4 space-y-3"
            >
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-sky-500" aria-hidden="true" />
                Log Completed Trade
              </h3>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Symbol</label>
                  <input
                    type="text"
                    value={jSymbol}
                    onChange={(e) => setJSymbol(e.target.value.toUpperCase())}
                    className="w-full rounded border border-slate-300 dark:border-slate-700 bg-transparent px-2.5 py-1.5 font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Direction</label>
                  <select
                    aria-label="Trade direction"
                    value={jSide}
                    onChange={(e) => setJSide(e.target.value as 'LONG' | 'SHORT')}
                    className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 font-mono"
                  >
                    <option value="LONG">LONG</option>
                    <option value="SHORT">SHORT</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Entry Price ($)</label>
                  <input
                    type="number"
                    step="any"
                    value={jEntryPx}
                    onChange={(e) => setJEntryPx(e.target.value)}
                    className="w-full rounded border border-slate-300 dark:border-slate-700 bg-transparent px-2.5 py-1.5 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Exit Price ($)</label>
                  <input
                    type="number"
                    step="any"
                    value={jExitPx}
                    onChange={(e) => setJExitPx(e.target.value)}
                    className="w-full rounded border border-slate-300 dark:border-slate-700 bg-transparent px-2.5 py-1.5 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Shares</label>
                  <input
                    type="number"
                    step="any"
                    value={jShares}
                    onChange={(e) => setJShares(e.target.value)}
                    className="w-full rounded border border-slate-300 dark:border-slate-700 bg-transparent px-2.5 py-1.5 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Discipline (1-5)</label>
                  <select
                    aria-label="Discipline rating"
                    value={jDiscipline}
                    onChange={(e) => setJDiscipline(Number(e.target.value) as 1 | 2 | 3 | 4 | 5)}
                    className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 font-mono"
                  >
                    <option value={5}>5 — Textbook</option>
                    <option value={4}>4 — Solid</option>
                    <option value={3}>3 — Acceptable</option>
                    <option value={2}>2 — Impulsive</option>
                    <option value={1}>1 — Tilt / Rule Break</option>
                  </select>
                </div>
              </div>
              <div className="text-xs">
                <label className="block text-[11px] text-slate-500 mb-1">Setup Tag</label>
                <input
                  type="text"
                  value={jSetup}
                  onChange={(e) => setJSetup(e.target.value)}
                  placeholder="e.g. Opening Range Breakout, PEAD Drift..."
                  className="w-full rounded border border-slate-300 dark:border-slate-700 bg-transparent px-2.5 py-1.5"
                />
              </div>
              <div className="text-xs">
                <label className="block text-[11px] text-slate-500 mb-1">Execution Notes &amp; Emotions</label>
                <textarea
                  rows={2}
                  value={jNotes}
                  onChange={(e) => setJNotes(e.target.value)}
                  placeholder="Why did you enter/exit? Did you move your stop?"
                  className="w-full rounded border border-slate-300 dark:border-slate-700 bg-transparent px-2.5 py-1.5"
                />
              </div>
              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-md bg-sky-600 hover:bg-sky-700 py-2 text-xs font-semibold text-white transition-colors"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                Save Journal Entry
              </button>
            </form>

            {/* Journal History & AI Coach */}
            <div className="lg:col-span-2 space-y-4">
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      <Bot className="w-4 h-4 text-sky-500" aria-hidden="true" />
                      AI Performance Coach Review
                    </h3>
                    <p className="text-xs text-slate-500">
                      Audits setup expectancy, risk sizing, discipline leaks &amp; next-session rules
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={aiReviewLoading || journalEntries.length === 0}
                    onClick={handleRunAiCoach}
                    className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 px-3 py-1.5 text-xs font-semibold hover:opacity-90 disabled:opacity-50"
                  >
                    <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                    {aiReviewLoading ? 'Analyzing Journal...' : 'Run AI Coach Review'}
                  </button>
                </div>

                {aiReviewError && (
                  <div className="rounded border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-500">
                    {aiReviewError}
                  </div>
                )}

                {aiReviewText ? (
                  <div className="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#182235]/60 p-3.5 text-xs leading-relaxed whitespace-pre-wrap text-slate-800 dark:text-slate-200 max-h-64 overflow-y-auto">
                    {aiReviewText}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    Click &ldquo;Run AI Coach Review&rdquo; to evaluate your logged trade executions and psychology patterns.
                  </p>
                )}
              </div>

              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Trade Ledger</h3>
                  <span className="text-xs font-mono text-slate-500">{journalEntries.length} records</span>
                </div>
                <div className="overflow-x-auto max-h-72 overflow-y-auto">
                  <table className="w-full text-left text-xs font-mono tabular-nums">
                    <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#182235]/50 font-sans text-slate-500">
                      <tr>
                        <th className="py-2 px-3">Date / Setup</th>
                        <th className="py-2 px-2">Symbol</th>
                        <th className="py-2 px-2 text-right">Entry → Exit</th>
                        <th className="py-2 px-2 text-right">P&amp;L</th>
                        <th className="py-2 px-2 text-right">Disc.</th>
                        <th className="py-2 px-3 text-right">Del</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {journalEntries.map((j) => (
                        <tr key={j.id}>
                          <td className="py-2 px-3 font-sans">
                            <div className="font-semibold text-slate-900 dark:text-slate-100">{j.setupTag}</div>
                            <div className="text-[11px] text-slate-500 truncate max-w-[200px]">{j.notes}</div>
                          </td>
                          <td className="py-2 px-2">
                            <span className="font-semibold text-sky-500">{j.symbol}</span>{' '}
                            <span className="text-[10px] text-slate-400">{j.side}</span>
                          </td>
                          <td className="py-2 px-2 text-right">
                            ${j.entryPrice.toFixed(2)} → ${j.exitPrice.toFixed(2)}
                          </td>
                          <td className={`py-2 px-2 text-right font-semibold ${j.pnlUsd >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                            {j.pnlUsd >= 0 ? '+' : ''}${j.pnlUsd.toFixed(2)} ({j.pnlPct >= 0 ? '+' : ''}
                            {j.pnlPct}%)
                          </td>
                          <td className="py-2 px-2 text-right">{j.disciplineRating}/5</td>
                          <td className="py-2 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => onDeleteJournalEntry(j.id)}
                              aria-label={`Delete journal trade ${j.symbol}`}
                              className="text-slate-400 hover:text-red-500 p-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {subTab === 'tax' && (
        <TaxCompliancePanel
          positions={positions}
          transactions={transactions}
          journalEntries={journalEntries}
          quotes={quotes}
          activeSymbol={activeSymbol}
          onStageHarvestTrade={handleStageHarvestTrade}
        />
      )}
    </div>
  );
};

const StrategyRobustnessSvg: React.FC<{ curves: number[][] }> = ({ curves }) => {
  if (curves.length === 0) return null;
  const vals = curves.flat();
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const w = 440;
  const h = 115;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-28" preserveAspectRatio="none">
      {curves.map((c, idx) => {
        const pts = c
          .map((v, i) => {
            const x = (i / Math.max(1, c.length - 1)) * w;
            const y = h - ((v - min) / span) * (h - 10) - 5;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .join(' ');
        return (
          <polyline
            key={idx}
            fill="none"
            stroke={c[c.length - 1] >= 100 ? '#10B981' : '#EF4444'}
            strokeOpacity="0.45"
            strokeWidth="1.3"
            points={pts}
          />
        );
      })}
    </svg>
  );
};

const BacktestEquitySvg: React.FC<{ curve: { time: number; equity: number; benchmark: number }[] }> = ({ curve }) => {
  const vals = curve.flatMap((c) => [c.equity, c.benchmark]);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const w = 720;
  const h = 150;
  const toPts = (key: 'equity' | 'benchmark') =>
    curve
      .map((pt, i) => {
        const x = (i / (curve.length - 1)) * w;
        const y = h - ((pt[key] - min) / span) * (h - 14) - 7;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-36" preserveAspectRatio="none">
      <polyline fill="none" stroke="#94A3B8" strokeWidth="1.5" strokeDasharray="4 3" points={toPts('benchmark')} />
      <polyline fill="none" stroke="#38BDF8" strokeWidth="2.2" points={toPts('equity')} />
    </svg>
  );
};

const MonteCarloFanSvg: React.FC<{ mc: MonteCarloOutput }> = ({ mc }) => {
  const pcts = mc.percentiles;
  if (pcts.length < 2) return null;
  const allVals = pcts.flatMap((p) => [p.p5, p.p95]);
  const min = Math.min(...allVals);
  const max = Math.max(...allVals);
  const span = max - min || 1;
  const w = 720;
  const h = 210;
  const padY = 12;
  const toX = (i: number, len: number) => (i / Math.max(1, len - 1)) * w;
  const toY = (v: number) => h - padY - ((v - min) / span) * (h - padY * 2);

  const outerPoly = [
    ...pcts.map((p, i) => `${toX(i, pcts.length).toFixed(1)},${toY(p.p95).toFixed(1)}`),
    ...pcts
      .slice()
      .reverse()
      .map((p, i) => `${toX(pcts.length - 1 - i, pcts.length).toFixed(1)},${toY(p.p5).toFixed(1)}`),
  ].join(' ');

  const innerPoly = [
    ...pcts.map((p, i) => `${toX(i, pcts.length).toFixed(1)},${toY(p.p75).toFixed(1)}`),
    ...pcts
      .slice()
      .reverse()
      .map((p, i) => `${toX(pcts.length - 1 - i, pcts.length).toFixed(1)},${toY(p.p25).toFixed(1)}`),
  ].join(' ');

  const p50Pts = pcts.map((p, i) => `${toX(i, pcts.length).toFixed(1)},${toY(p.p50).toFixed(1)}`).join(' ');
  const p95Pts = pcts.map((p, i) => `${toX(i, pcts.length).toFixed(1)},${toY(p.p95).toFixed(1)}`).join(' ');
  const p5Pts = pcts.map((p, i) => `${toX(i, pcts.length).toFixed(1)},${toY(p.p5).toFixed(1)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-52" preserveAspectRatio="none">
      {/* Sample simulation paths */}
      {mc.samplePaths.slice(0, 12).map((path, pIdx) => {
        const step = Math.max(1, Math.floor(path.length / 40));
        const sampled = path.filter((_, idx) => idx % step === 0 || idx === path.length - 1);
        const pts = sampled.map((val, idx) => `${toX(idx, sampled.length).toFixed(1)},${toY(val).toFixed(1)}`).join(' ');
        return (
          <polyline
            key={pIdx}
            fill="none"
            stroke="#64748B"
            strokeOpacity="0.22"
            strokeWidth="1"
            points={pts}
          />
        );
      })}
      <polygon fill="rgba(56, 189, 248, 0.12)" points={outerPoly} />
      <polygon fill="rgba(56, 189, 248, 0.22)" points={innerPoly} />
      <polyline fill="none" stroke="#EF4444" strokeWidth="1.5" strokeDasharray="4 3" points={p5Pts} />
      <polyline fill="none" stroke="#22C55E" strokeWidth="1.5" strokeDasharray="4 3" points={p95Pts} />
      <polyline fill="none" stroke="#0EA5E9" strokeWidth="2.8" points={p50Pts} />
    </svg>
  );
};
