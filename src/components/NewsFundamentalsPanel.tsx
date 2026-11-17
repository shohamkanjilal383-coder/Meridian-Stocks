import React, { useEffect, useMemo, useState } from 'react';
import {
  Award,
  Building2,
  Calendar,
  ExternalLink,
  Landmark,
  MessageSquare,
  Newspaper,
  Send,
  ShieldCheck,
  TrendingUp,
  Users,
} from 'lucide-react';
import type {
  CommunityPrediction,
  CopyTraderProfile,
  FundamentalsData,
  NewsArticle,
  SocialSentimentData,
  WhaleFiling13F,
} from '../types/market';

export type ResearchSubTab = 'overview' | 'statements' | 'ownership' | 'news' | 'social';

interface NewsFundamentalsPanelProps {
  symbol: string;
  news: NewsArticle[];
  fundamentals: FundamentalsData | null;
  socialData: SocialSentimentData | null;
  whales?: WhaleFiling13F[];
  traders?: CopyTraderProfile[];
  predictions?: CommunityPrediction[];
  loading: boolean;
  initialTab?: ResearchSubTab;
  onTabChange?: (tab: ResearchSubTab) => void;
  onSelectSymbol?: (symbol: string) => void;
}

export const NewsFundamentalsPanel: React.FC<NewsFundamentalsPanelProps> = ({
  symbol,
  news,
  fundamentals,
  socialData,
  whales = [],
  traders = [],
  predictions = [],
  loading,
  initialTab = 'overview',
  onTabChange,
  onSelectSymbol,
}) => {
  const [subTab, setSubTab] = useState<ResearchSubTab>(initialTab);
  const [hideBots, setHideBots] = useState(true);
  const [mirroredAllocations, setMirroredAllocations] = useState<Record<string, number>>({ 'ct-1': 10000 });
  const [userPredictions, setUserPredictions] = useState<CommunityPrediction[]>([]);
  const [predDir, setPredDir] = useState<'Bullish' | 'Bearish'>('Bullish');
  const [predHorizon, setPredHorizon] = useState<'7D' | '30D' | '90D'>('30D');
  const [predTarget, setPredTarget] = useState('');
  const [predConf, setPredConf] = useState('75');
  const [predRationale, setPredRationale] = useState('');

  useEffect(() => {
    setSubTab(initialTab);
  }, [initialTab]);

  const changeTab = (next: ResearchSubTab) => {
    setSubTab(next);
    onTabChange?.(next);
  };

  const visiblePosts = useMemo(() => {
    if (!socialData) return [];
    return hideBots ? socialData.posts.filter((p) => p.botFlag === 'Verified Human') : socialData.posts;
  }, [socialData, hideBots]);

  const allPredictions = useMemo(
    () => [...userPredictions, ...predictions],
    [userPredictions, predictions]
  );

  const handleToggleCopy = (traderId: string) => {
    setMirroredAllocations((prev) => {
      if (prev[traderId]) {
        const next = { ...prev };
        delete next[traderId];
        return next;
      }
      return { ...prev, [traderId]: 10000 };
    });
  };

  const handleAddPrediction = (e: React.FormEvent) => {
    e.preventDefault();
    const tgt = Number(predTarget);
    if (!tgt || tgt <= 0) return;
    setUserPredictions((prev) => [
      {
        id: `user-pred-${Date.now()}`,
        author: 'You (Meridian Desk)',
        authorAccuracyPct: 71.4,
        symbol,
        direction: predDir,
        horizon: predHorizon,
        targetPrice: Number(tgt.toFixed(2)),
        confidencePct: Math.max(50, Math.min(99, Number(predConf) || 75)),
        rationale: predRationale.trim() || `${predDir} technical + flow setup on ${symbol}.`,
        createdAt: Date.now(),
      },
      ...prev,
    ]);
    setPredTarget('');
    setPredRationale('');
  };

  if (loading && !fundamentals) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="h-64 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] animate-pulse" />
        <div className="h-64 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Sub-navigation */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-[#111827] p-1">
          {(
            [
              { id: 'overview', label: 'Valuation & Analysts' },
              { id: 'statements', label: 'Financials & Earnings' },
              { id: 'ownership', label: 'Insiders & Institutions' },
              { id: 'news', label: `News Sentiment (${news.length})` },
              { id: 'social', label: 'Social, Whales & Copy Trading' },
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
        {fundamentals && (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {fundamentals.companyName} · {fundamentals.sector} · {fundamentals.headquarters}
          </span>
        )}
      </div>

      {subTab === 'overview' && fundamentals && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-sky-500" aria-hidden="true" />
                Company Profile &amp; Fundamental Multiples — {symbol}
              </h3>
              <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {fundamentals.description} Employees: {fundamentals.employees.toLocaleString()}.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs pt-2 border-t border-slate-200 dark:border-slate-800">
              {[
                { label: 'Trailing P/E', val: fundamentals.valuation.pe.toFixed(1) },
                { label: 'Forward P/E', val: fundamentals.valuation.forwardPe.toFixed(1) },
                { label: 'PEG Ratio', val: fundamentals.valuation.peg.toFixed(2) },
                { label: 'Price / Book', val: fundamentals.valuation.pb.toFixed(2) },
                { label: 'EV / EBITDA', val: fundamentals.valuation.evToEbitda.toFixed(1) },
                { label: 'Return on Equity', val: `${fundamentals.profitability.roe}%` },
                { label: 'Gross Margin', val: `${fundamentals.profitability.grossMargin}%` },
                { label: 'Operating Margin', val: `${fundamentals.profitability.operatingMargin}%` },
                { label: 'Debt / Equity', val: fundamentals.health.debtToEquity.toFixed(2) },
                { label: 'Current Ratio', val: fundamentals.health.currentRatio.toFixed(2) },
                { label: 'Free Cash Flow', val: `$${fundamentals.health.freeCashFlowB.toFixed(1)}B` },
                { label: 'Total Cash / Debt', val: `$${fundamentals.health.totalCashB}B / $${fundamentals.health.totalDebtB}B` },
              ].map((item) => (
                <div key={item.label} className="rounded border border-slate-200 dark:border-slate-800 p-2.5">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">{item.label}</div>
                  <div className="mt-0.5 font-mono font-semibold text-sm tabular-nums text-slate-900 dark:text-slate-100">
                    {item.val}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4 flex flex-col justify-between space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-sky-500" aria-hidden="true" />
                Analyst Consensus
              </h3>
              <div className="mt-2 text-lg font-semibold text-emerald-600 dark:text-emerald-400">
                {fundamentals.analystConsensus.ratingLabel}
              </div>

              <div className="mt-3 space-y-2 text-xs">
                {[
                  { label: 'Strong Buy', count: fundamentals.analystConsensus.strongBuy, col: 'bg-emerald-500' },
                  { label: 'Buy', count: fundamentals.analystConsensus.buy, col: 'bg-emerald-400/75' },
                  { label: 'Hold', count: fundamentals.analystConsensus.hold, col: 'bg-amber-400' },
                  { label: 'Sell', count: fundamentals.analystConsensus.sell, col: 'bg-red-500' },
                ].map((r) => {
                  const total =
                    fundamentals.analystConsensus.strongBuy +
                    fundamentals.analystConsensus.buy +
                    fundamentals.analystConsensus.hold +
                    fundamentals.analystConsensus.sell;
                  const pct = total > 0 ? (r.count / total) * 100 : 0;
                  return (
                    <div key={r.label}>
                      <div className="flex justify-between font-mono mb-0.5">
                        <span className="font-sans text-slate-600 dark:text-slate-300">{r.label}</span>
                        <span>{r.count}</span>
                      </div>
                      <div className="h-1.5 w-full rounded bg-slate-200 dark:bg-slate-800 overflow-hidden">
                        <div className={`h-full ${r.col}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 grid grid-cols-3 gap-2 text-center font-mono text-xs tabular-nums">
              <div>
                <div className="font-sans text-[11px] text-slate-500">Target Low</div>
                <div className="font-semibold text-red-500">{fundamentals.analystConsensus.targetLow.toFixed(2)}</div>
              </div>
              <div>
                <div className="font-sans text-[11px] text-slate-500">Mean Target</div>
                <div className="font-semibold text-sky-500">{fundamentals.analystConsensus.targetMean.toFixed(2)}</div>
              </div>
              <div>
                <div className="font-sans text-[11px] text-slate-500">Target High</div>
                <div className="font-semibold text-emerald-500">{fundamentals.analystConsensus.targetHigh.toFixed(2)}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {subTab === 'statements' && fundamentals && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Financial Statements Summary ($ Billions)
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono tabular-nums">
                <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#182235]/50 font-sans text-slate-500">
                  <tr>
                    <th className="py-2.5 px-3">Period</th>
                    <th className="py-2.5 px-3 text-right">Revenue</th>
                    <th className="py-2.5 px-3 text-right">Gross Profit</th>
                    <th className="py-2.5 px-3 text-right">Net Income</th>
                    <th className="py-2.5 px-3 text-right">FCF</th>
                    <th className="py-2.5 px-3 text-right">EPS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {fundamentals.statements.map((st) => (
                    <tr key={st.period}>
                      <td className="py-2.5 px-3 font-semibold">{st.period}</td>
                      <td className="py-2.5 px-3 text-right">${st.revenue.toFixed(1)}B</td>
                      <td className="py-2.5 px-3 text-right">${st.grossProfit.toFixed(1)}B</td>
                      <td className="py-2.5 px-3 text-right">${st.netIncome.toFixed(1)}B</td>
                      <td className="py-2.5 px-3 text-right">${st.freeCashFlow.toFixed(1)}B</td>
                      <td className="py-2.5 px-3 text-right">${st.eps.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-sky-500" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Earnings Calendar — Estimates vs Actuals
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono tabular-nums">
                <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#182235]/50 font-sans text-slate-500">
                  <tr>
                    <th className="py-2.5 px-3">Quarter</th>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3 text-right">EPS Est.</th>
                    <th className="py-2.5 px-3 text-right">EPS Actual</th>
                    <th className="py-2.5 px-3 text-right">Surprise</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {fundamentals.earnings.map((e) => (
                    <tr key={e.quarter}>
                      <td className="py-2.5 px-3 font-sans font-medium">{e.quarter}</td>
                      <td className="py-2.5 px-3 text-slate-500">{e.date}</td>
                      <td className="py-2.5 px-3 text-right">${e.epsEstimate.toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-right">{e.epsActual !== null ? `$${e.epsActual.toFixed(2)}` : 'Pending'}</td>
                      <td
                        className={`py-2.5 px-3 text-right ${
                          e.surprisePercent === null
                            ? 'text-slate-500'
                            : e.surprisePercent >= 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-red-500'
                        }`}
                      >
                        {e.surprisePercent !== null ? `${e.surprisePercent >= 0 ? '+' : ''}${e.surprisePercent.toFixed(1)}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {subTab === 'ownership' && fundamentals && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
              <Users className="w-4 h-4 text-sky-500" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Insider Transactions</h3>
            </div>
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#182235]/50 text-slate-500">
                <tr>
                  <th className="py-2.5 px-3 font-medium">Executive</th>
                  <th className="py-2.5 px-3 font-medium">Type</th>
                  <th className="py-2.5 px-3 font-medium text-right">Shares</th>
                  <th className="py-2.5 px-3 font-medium text-right">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {fundamentals.insiders.map((ins, i) => (
                  <tr key={i}>
                    <td className="py-2.5 px-3">
                      <div className="font-medium text-slate-900 dark:text-slate-100">{ins.name}</div>
                      <div className="text-[11px] text-slate-500">{ins.role} · {ins.date}</div>
                    </td>
                    <td
                      className={`py-2.5 px-3 font-mono font-medium ${
                        ins.type === 'Buy' ? 'text-emerald-500' : ins.type === 'Sell' ? 'text-red-500' : 'text-sky-500'
                      }`}
                    >
                      {ins.type}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">{ins.shares.toLocaleString()}</td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">${ins.valueUsd.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Top Institutional Holdings</h3>
            </div>
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#182235]/50 text-slate-500">
                <tr>
                  <th className="py-2.5 px-3 font-medium">Institution</th>
                  <th className="py-2.5 px-3 font-medium text-right">Shares</th>
                  <th className="py-2.5 px-3 font-medium text-right">% Out</th>
                  <th className="py-2.5 px-3 font-medium text-right">QoQ Chg</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono tabular-nums">
                {fundamentals.institutions.map((inst) => (
                  <tr key={inst.holder}>
                    <td className="py-2.5 px-3 font-sans font-medium text-slate-900 dark:text-slate-100">{inst.holder}</td>
                    <td className="py-2.5 px-3 text-right">{(inst.shares / 1e6).toFixed(2)}M</td>
                    <td className="py-2.5 px-3 text-right">{inst.percentOut.toFixed(2)}%</td>
                    <td className={`py-2.5 px-3 text-right ${inst.changePercent >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                      {inst.changePercent >= 0 ? '+' : ''}
                      {inst.changePercent.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'news' && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] divide-y divide-slate-200 dark:divide-slate-800">
          {news.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">No recent news stories found for {symbol}.</div>
          ) : (
            news.map((article) => (
              <div key={article.id} className="p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                    <Newspaper className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                    <span>{article.publisher}</span>
                    <span aria-hidden="true">·</span>
                    <span>{new Date(article.publishedAt).toLocaleString()}</span>
                    <span aria-hidden="true">·</span>
                    <span
                      className={`font-mono font-semibold ${
                        article.sentimentLabel === 'Bullish'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : article.sentimentLabel === 'Bearish'
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-slate-500'
                      }`}
                    >
                      {article.sentimentLabel} ({article.sentimentScore >= 0 ? '+' : ''}
                      {article.sentimentScore.toFixed(2)})
                    </span>
                  </div>
                  <a
                    href={article.link}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100 hover:text-sky-500 transition-colors"
                  >
                    {article.title}
                    <ExternalLink className="w-3.5 h-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                  </a>
                  <p className="text-xs text-slate-600 dark:text-slate-400">{article.summary}</p>
                </div>
                <div className="text-[11px] font-mono text-slate-500 shrink-0">
                  {article.relatedSymbols.join(' · ')}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* SOCIAL SENTIMENT (BOT DETECTION) + WHALE 13F FILINGS + COPY TRADING + COMMUNITY PREDICTIONS */}
      {subTab === 'social' && (
        <div className="space-y-4">
          {!socialData ? (
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-8 text-center text-xs text-slate-500">
              Loading social sentiment, bot diagnostics, 13F whale filings, and copy traders for {symbol}...
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-3.5">
                  <div className="text-xs text-slate-500 dark:text-slate-400">Human-Filtered Sentiment</div>
                  <div
                    className={`mt-1 text-lg font-mono font-bold tabular-nums ${
                      socialData.humanFilteredScore >= 0.08
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : socialData.humanFilteredScore <= -0.08
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-slate-900 dark:text-slate-100'
                    }`}
                  >
                    {socialData.humanFilteredScore >= 0 ? '+' : ''}
                    {socialData.humanFilteredScore.toFixed(2)}
                  </div>
                  <div className="text-[11px] font-mono text-slate-500">
                    Raw Composite: {socialData.overallScore >= 0 ? '+' : ''}
                    {socialData.overallScore.toFixed(2)}
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-3.5">
                  <div className="text-xs text-slate-500 dark:text-slate-400">Bullish / Bearish Split</div>
                  <div className="mt-1 text-lg font-mono font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                    {socialData.bullishPct}% <span className="text-xs font-normal text-slate-400">/ {socialData.bearishPct}%</span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full rounded bg-slate-200 dark:bg-slate-800 overflow-hidden flex">
                    <div className="bg-emerald-500 h-full" style={{ width: `${socialData.bullishPct}%` }} />
                    <div className="bg-red-500 h-full" style={{ width: `${socialData.bearishPct}%` }} />
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-3.5">
                  <div className="text-xs text-slate-500 dark:text-slate-400">Bot &amp; Spam Detection</div>
                  <div className="mt-1 text-lg font-mono font-bold tabular-nums text-amber-500">
                    {socialData.botTrafficPct}% Flagged
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Velocity: {socialData.mentionVelocity24h.toLocaleString()} / 24h
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-3.5 space-y-1.5">
                  <div className="text-xs text-slate-500 dark:text-slate-400">Platform Breakdown</div>
                  {socialData.platformBreakdown.map((p) => (
                    <div key={p.platform} className="flex items-center justify-between text-[11px] font-mono tabular-nums">
                      <span className="font-sans text-slate-700 dark:text-slate-300">{p.platform}</span>
                      <span>
                        {p.mentions} · <strong className="text-emerald-500">{p.bullishPct}% Bull</strong>
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bot-Filtered Social Stream */}
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] divide-y divide-slate-200 dark:divide-slate-800">
                <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-sky-500" aria-hidden="true" />
                    Scored Social Stream — {symbol} ({visiblePosts.length} posts)
                  </h3>
                  <button
                    type="button"
                    onClick={() => setHideBots((b) => !b)}
                    className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-medium transition-colors ${
                      hideBots
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500'
                        : 'border-slate-300 dark:border-slate-700 text-slate-500'
                    }`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                    {hideBots ? 'Suspected Bots Hidden' : 'Showing All (Incl. Bots)'}
                  </button>
                </div>
                {visiblePosts.map((post) => (
                  <div key={post.id} className="p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                        <span className="font-semibold text-sky-600 dark:text-sky-400">{post.platform}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono">{post.subredditOrHandle}</span>
                        <span aria-hidden="true">·</span>
                        <span>{post.author}</span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={`font-mono font-semibold ${
                            post.botFlag === 'Suspected Bot' ? 'text-amber-500' : 'text-emerald-500'
                          }`}
                        >
                          {post.botFlag} ({post.botProbabilityPct}% bot risk)
                        </span>
                      </div>
                      <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed">{post.text}</p>
                    </div>
                    <div className="flex sm:flex-col items-end gap-1 shrink-0 text-xs font-mono tabular-nums">
                      <span
                        className={`font-semibold ${
                          post.sentimentLabel === 'Bullish'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : post.sentimentLabel === 'Bearish'
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-slate-500'
                        }`}
                      >
                        {post.sentimentLabel} ({post.sentimentScore >= 0 ? '+' : ''}
                        {post.sentimentScore.toFixed(2)})
                      </span>
                      <span className="text-[11px] text-slate-500">Engagement: {post.upvotesOrLikes}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Whale 13F Filings + Copy Trading Leaderboard */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <Landmark className="w-4 h-4 text-sky-500" aria-hidden="true" />
                      Whale 13F Institutional Filings
                    </h3>
                    <span className="text-[11px] font-mono text-slate-500">SEC Form 13F-HR</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs font-mono tabular-nums">
                      <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#182235]/50 font-sans text-slate-500">
                        <tr>
                          <th className="py-2 px-3">Fund / Manager</th>
                          <th className="py-2 px-2">Ticker</th>
                          <th className="py-2 px-2">Action</th>
                          <th className="py-2 px-2 text-right">Value</th>
                          <th className="py-2 px-3 text-right">QoQ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {whales.map((w) => (
                          <tr key={w.id}>
                            <td className="py-2 px-3 font-sans">
                              <div className="font-semibold text-slate-900 dark:text-slate-100">{w.fundName}</div>
                              <div className="text-[11px] text-slate-500">{w.manager} · {w.quarter}</div>
                            </td>
                            <td className="py-2 px-2">
                              <button
                                type="button"
                                onClick={() => onSelectSymbol?.(w.symbol)}
                                className="font-semibold text-sky-500 hover:underline"
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
                              {w.changePct >= 0 ? '+' : ''}
                              {w.changePct}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <Award className="w-4 h-4 text-amber-500" aria-hidden="true" />
                      Copy Trading Leaderboard (Risk-Adjusted)
                    </h3>
                    <span className="text-[11px] font-mono text-slate-500">
                      Mirrored: $
                      {Object.values(mirroredAllocations)
                        .reduce((a, b) => a + b, 0)
                        .toLocaleString()}
                    </span>
                  </div>
                  <div className="divide-y divide-slate-200 dark:divide-slate-800">
                    {traders.map((tr) => {
                      const isCopying = Boolean(mirroredAllocations[tr.id]);
                      return (
                        <div key={tr.id} className="p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
                          <div className="space-y-0.5">
                            <div className="font-semibold text-slate-900 dark:text-slate-100">
                              @{tr.handle}{' '}
                              <span className="font-mono text-[11px] text-slate-500 font-normal">
                                · {tr.copiers.toLocaleString()} copiers · ${tr.aumUsdM}M AUM
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {tr.strategyStyle} · Top: {tr.topHoldings.join(', ')}
                            </div>
                            <div className="font-mono text-[11px] tabular-nums flex flex-wrap gap-3 pt-0.5">
                              <span className="text-emerald-500 font-semibold">YTD +{tr.ytdReturnPct}%</span>
                              <span>Sharpe {tr.sharpeRatio.toFixed(2)}</span>
                              <span>Sortino {tr.sortinoRatio.toFixed(2)}</span>
                              <span className="text-red-500">Max DD {tr.maxDrawdownPct}%</span>
                              <span>Win {tr.winRatePct}%</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleToggleCopy(tr.id)}
                            className={`rounded border px-3 py-1.5 text-xs font-semibold transition-colors ${
                              isCopying
                                ? 'border-emerald-500 bg-emerald-500/15 text-emerald-500'
                                : 'border-sky-500/40 bg-sky-500/10 text-sky-500 hover:bg-sky-500/20'
                            }`}
                          >
                            {isCopying ? 'Copying ($10k)' : 'Copy Strategy'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Community Predictions & Accuracy Tracking */}
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold">Community Price Predictions &amp; Historical Accuracy</h3>
                    <p className="text-xs text-slate-500">Crowd forecasts weighted by verified 90-day hit rates</p>
                  </div>
                </div>

                <form onSubmit={handleAddPrediction} className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-xs">
                  <select
                    aria-label="Prediction direction"
                    value={predDir}
                    onChange={(e) => setPredDir(e.target.value as 'Bullish' | 'Bearish')}
                    className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 font-mono"
                  >
                    <option value="Bullish">Bullish</option>
                    <option value="Bearish">Bearish</option>
                  </select>
                  <select
                    aria-label="Prediction horizon"
                    value={predHorizon}
                    onChange={(e) => setPredHorizon(e.target.value as '7D' | '30D' | '90D')}
                    className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 font-mono"
                  >
                    <option value="7D">7D Horizon</option>
                    <option value="30D">30D Horizon</option>
                    <option value="90D">90D Horizon</option>
                  </select>
                  <input
                    type="number"
                    step="any"
                    value={predTarget}
                    onChange={(e) => setPredTarget(e.target.value)}
                    placeholder={`${symbol} Target $`}
                    className="rounded border border-slate-300 dark:border-slate-700 bg-transparent px-2.5 py-1.5 font-mono"
                  />
                  <input
                    type="number"
                    min={50}
                    max={99}
                    value={predConf}
                    onChange={(e) => setPredConf(e.target.value)}
                    placeholder="Conf %"
                    className="rounded border border-slate-300 dark:border-slate-700 bg-transparent px-2.5 py-1.5 font-mono"
                  />
                  <input
                    type="text"
                    value={predRationale}
                    onChange={(e) => setPredRationale(e.target.value)}
                    placeholder="Thesis / catalyst note..."
                    className="rounded border border-slate-300 dark:border-slate-700 bg-transparent px-2.5 py-1.5 col-span-2 sm:col-span-1"
                  />
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center gap-1.5 rounded bg-sky-600 hover:bg-sky-700 px-3 py-1.5 font-semibold text-white"
                  >
                    <Send className="w-3.5 h-3.5" aria-hidden="true" />
                    Post Call
                  </button>
                </form>

                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {allPredictions.map((cp) => (
                    <div key={cp.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900 dark:text-slate-100">{cp.author}</span>
                          <span className="font-mono text-[11px] text-sky-500">
                            {cp.authorAccuracyPct.toFixed(1)}% historical accuracy
                          </span>
                          <span className="text-slate-400">·</span>
                          <span className="font-mono text-[11px] text-slate-500">{cp.horizon}</span>
                        </div>
                        <p className="text-slate-600 dark:text-slate-400">{cp.rationale}</p>
                      </div>
                      <div className="text-right font-mono tabular-nums">
                        <div className={`font-bold ${cp.direction === 'Bullish' ? 'text-emerald-500' : 'text-red-500'}`}>
                          {cp.direction} → ${cp.targetPrice.toFixed(2)}
                        </div>
                        <div className="text-[11px] text-slate-500">{cp.confidencePct}% confidence</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
