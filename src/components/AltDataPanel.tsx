import React, { useState } from 'react';
import { CreditCard, Globe2, Landmark, Leaf, Satellite } from 'lucide-react';
import type { AltDataPayload } from '../types/market';

interface AltDataPanelProps {
  symbol: string;
  data: AltDataPayload | null;
  loading?: boolean;
  onSelectSymbol: (symbol: string) => void;
}

type AltSection = 'all' | 'satellite' | 'spend' | 'web' | 'esg' | 'congress';

export const AltDataPanel: React.FC<AltDataPanelProps> = ({
  symbol,
  data,
  loading = false,
  onSelectSymbol,
}) => {
  const [section, setSection] = useState<AltSection>('all');

  if (loading && !data) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-44 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-8 text-center text-xs text-[var(--text-muted)]">
        Alternative data signals are loading for {symbol}.
      </div>
    );
  }

  const show = (key: Exclude<AltSection, 'all'>) => section === 'all' || section === key;

  return (
    <div className="space-y-4">
      {/* Section Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-subtle)] p-1">
          {(
            [
              { id: 'all', label: 'All Alt Signals' },
              { id: 'satellite', label: 'Satellite Imagery' },
              { id: 'spend', label: 'Credit Card Spend' },
              { id: 'web', label: 'Web Scraping' },
              { id: 'esg', label: 'ESG Metrics' },
              { id: 'congress', label: 'Congressional Trades' },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setSection(f.id)}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                section === f.id
                  ? 'bg-[var(--surface-panel)] text-[var(--text-primary)] shadow-xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="text-xs font-mono text-[var(--text-muted)]">
          Coverage: {data.symbol} · Multi-Source Alternative Feed
        </span>
      </div>

      {/* Satellite + Credit Card Spend */}
      {(show('satellite') || show('spend')) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {show('satellite') && (
            <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Satellite className="w-4 h-4 text-sky-500" aria-hidden="true" />
                    Satellite Imagery Telemetry
                  </h3>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">{data.satellite.regionSummary}</p>
                </div>
                <span
                  className={`text-xs font-mono font-semibold tabular-nums ${
                    data.satellite.parkingLotYoYPct >= 0 ? 'text-emerald-500' : 'text-red-500'
                  }`}
                >
                  {data.satellite.parkingLotYoYPct >= 0 ? '+' : ''}
                  {data.satellite.parkingLotYoYPct.toFixed(2)}% YoY
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2.5 text-xs font-mono tabular-nums pt-1">
                <div className="rounded border border-[var(--border-hairline)] p-2.5">
                  <div className="font-sans text-[11px] text-[var(--text-muted)]">Parking Lot Index</div>
                  <div className="mt-0.5 text-base font-bold">{data.satellite.parkingLotIndex.toFixed(1)}</div>
                </div>
                <div className="rounded border border-[var(--border-hairline)] p-2.5">
                  <div className="font-sans text-[11px] text-[var(--text-muted)]">Oil Storage Fill</div>
                  <div className="mt-0.5 text-base font-bold text-amber-500">{data.satellite.oilStorageFillPct}%</div>
                </div>
                <div className="rounded border border-[var(--border-hairline)] p-2.5">
                  <div className="font-sans text-[11px] text-[var(--text-muted)]">Crop Health NDVI</div>
                  <div className="mt-0.5 text-base font-bold text-emerald-500">{data.satellite.cropHealthNdvi.toFixed(2)}</div>
                </div>
              </div>

              <MiniBarSeries
                items={data.satellite.series.map((s) => ({ label: s.week, value: s.index }))}
                baseline={100}
                unit=""
              />
            </div>
          )}

          {show('spend') && (
            <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-sky-500" aria-hidden="true" />
                    Credit Card &amp; Consumer Spend Panel
                  </h3>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    Category: {data.creditCard.categoryLeader}
                  </p>
                </div>
                <span
                  className={`text-xs font-mono font-semibold tabular-nums ${
                    data.creditCard.spendYoYPct >= 0 ? 'text-emerald-500' : 'text-red-500'
                  }`}
                >
                  {data.creditCard.spendYoYPct >= 0 ? '+' : ''}
                  {data.creditCard.spendYoYPct.toFixed(2)}% Spend YoY
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2.5 text-xs font-mono tabular-nums pt-1">
                <div className="rounded border border-[var(--border-hairline)] p-2.5">
                  <div className="font-sans text-[11px] text-[var(--text-muted)]">Spend Growth YoY</div>
                  <div
                    className={`mt-0.5 text-base font-bold ${
                      data.creditCard.spendYoYPct >= 0 ? 'text-emerald-500' : 'text-red-500'
                    }`}
                  >
                    {data.creditCard.spendYoYPct >= 0 ? '+' : ''}
                    {data.creditCard.spendYoYPct}%
                  </div>
                </div>
                <div className="rounded border border-[var(--border-hairline)] p-2.5">
                  <div className="font-sans text-[11px] text-[var(--text-muted)]">Tx Volume YoY</div>
                  <div className="mt-0.5 text-base font-bold">
                    {data.creditCard.txVolumeYoYPct >= 0 ? '+' : ''}
                    {data.creditCard.txVolumeYoYPct}%
                  </div>
                </div>
                <div className="rounded border border-[var(--border-hairline)] p-2.5">
                  <div className="font-sans text-[11px] text-[var(--text-muted)]">Avg Ticket Size</div>
                  <div className="mt-0.5 text-base font-bold">${data.creditCard.avgTicketUsd.toFixed(2)}</div>
                </div>
              </div>

              <MiniBarSeries
                items={data.creditCard.monthlyTrend.map((m) => ({ label: m.month, value: m.yoyPct }))}
                baseline={0}
                unit="%"
              />
            </div>
          )}
        </div>
      )}

      {/* Web Scraping + ESG Sustainability */}
      {(show('web') || show('esg')) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {show('web') && (
            <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-4 space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Globe2 className="w-4 h-4 text-sky-500" aria-hidden="true" />
                Web Scraping Alternative Signals
              </h3>
              <p className="text-xs text-[var(--text-muted)]">
                Corporate hiring velocity, mobile app download rankings &amp; physical store foot traffic
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs font-mono tabular-nums">
                <div className="rounded border border-[var(--border-hairline)] p-3">
                  <div className="font-sans text-[11px] text-[var(--text-muted)]">Open Job Postings</div>
                  <div className="mt-1 text-base font-bold">{data.webScraping.openJobPostings.toLocaleString()}</div>
                  <div
                    className={`text-[11px] ${
                      data.webScraping.jobGrowthMoMPct >= 0 ? 'text-emerald-500' : 'text-red-500'
                    }`}
                  >
                    {data.webScraping.jobGrowthMoMPct >= 0 ? '+' : ''}
                    {data.webScraping.jobGrowthMoMPct}% MoM
                  </div>
                </div>
                <div className="rounded border border-[var(--border-hairline)] p-3">
                  <div className="font-sans text-[11px] text-[var(--text-muted)]">App Store Rank</div>
                  <div className="mt-1 text-base font-bold text-sky-500">#{data.webScraping.appDownloadsRank}</div>
                  <div
                    className={`text-[11px] ${
                      data.webScraping.appDauGrowthPct >= 0 ? 'text-emerald-500' : 'text-red-500'
                    }`}
                  >
                    DAU {data.webScraping.appDauGrowthPct >= 0 ? '+' : ''}
                    {data.webScraping.appDauGrowthPct}%
                  </div>
                </div>
                <div className="rounded border border-[var(--border-hairline)] p-3 col-span-2 sm:col-span-1">
                  <div className="font-sans text-[11px] text-[var(--text-muted)]">Foot Traffic Index</div>
                  <div className="mt-1 text-base font-bold">{data.webScraping.footTrafficIndex.toFixed(1)}</div>
                  <div className="text-[11px] text-[var(--text-muted)]">100 = 12M baseline</div>
                </div>
              </div>
            </div>
          )}

          {show('esg') && (
            <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Leaf className="w-4 h-4 text-emerald-500" aria-hidden="true" />
                  ESG &amp; Sustainability Scorecard
                </h3>
                <span className="font-mono text-xs font-bold text-emerald-500 tabular-nums">
                  {data.esg.totalScore} / 100 · Top {100 - data.esg.peerPercentile}% Peers
                </span>
              </div>

              <div className="space-y-2 text-xs">
                {[
                  { label: 'Environmental (E)', score: data.esg.envScore, color: 'bg-emerald-500' },
                  { label: 'Social (S)', score: data.esg.socialScore, color: 'bg-sky-500' },
                  { label: 'Governance (G)', score: data.esg.govScore, color: 'bg-amber-500' },
                ].map((bar) => (
                  <div key={bar.label}>
                    <div className="flex justify-between font-mono mb-0.5 tabular-nums">
                      <span className="font-sans text-[var(--text-muted)]">{bar.label}</span>
                      <span className="font-semibold">{bar.score} / 100</span>
                    </div>
                    <div className="h-1.5 w-full rounded bg-slate-200 dark:bg-slate-800 overflow-hidden">
                      <div className={`h-full ${bar.color}`} style={{ width: `${bar.score}%` }} />
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-2 border-t border-[var(--border-hairline)] flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-[var(--text-muted)] tabular-nums">
                <span>Carbon Intensity: {data.esg.carbonIntensity} tCO2e/$M</span>
                <span>Target: {data.esg.netZeroTarget}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Congressional Trading Tracker */}
      {show('congress') && (
        <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border-hairline)] flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Landmark className="w-4 h-4 text-sky-500" aria-hidden="true" />
              STOCK Act Congressional Trading Tracker
            </h3>
            <span className="text-[11px] font-mono text-[var(--text-muted)]">Click ticker to load chart</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono tabular-nums">
              <thead className="border-b border-[var(--border-hairline)] bg-[var(--surface-subtle)] font-sans text-[var(--text-muted)]">
                <tr>
                  <th className="py-2.5 px-3">Representative / Senator</th>
                  <th className="py-2.5 px-3">Chamber · Party</th>
                  <th className="py-2.5 px-3">Ticker</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Disclosed Amount</th>
                  <th className="py-2.5 px-3 text-right">Trade Date</th>
                  <th className="py-2.5 px-3 text-right">Filing Lag</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {data.congressionalTrades.map((tr) => (
                  <tr key={tr.id} className="hover:bg-[var(--surface-subtle)]/50">
                    <td className="py-2.5 px-3 font-sans font-semibold">{tr.politician}</td>
                    <td className="py-2.5 px-3 font-sans text-[var(--text-muted)]">
                      {tr.chamber} ({tr.party})
                    </td>
                    <td className="py-2.5 px-3">
                      <button
                        type="button"
                        onClick={() => onSelectSymbol(tr.ticker)}
                        className="font-semibold text-sky-500 hover:underline"
                      >
                        {tr.ticker}
                      </button>
                    </td>
                    <td
                      className={`py-2.5 px-3 font-sans font-semibold ${
                        tr.txType === 'Purchase' ? 'text-emerald-500' : 'text-red-500'
                      }`}
                    >
                      {tr.txType}
                    </td>
                    <td className="py-2.5 px-3">{tr.amountRange}</td>
                    <td className="py-2.5 px-3 text-right text-[var(--text-muted)]">{tr.txDate}</td>
                    <td className="py-2.5 px-3 text-right">{tr.disclosureDelayDays}d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

const MiniBarSeries: React.FC<{
  items: { label: string; value: number }[];
  baseline: number;
  unit: string;
}> = ({ items, baseline, unit }) => {
  const vals = items.map((i) => i.value);
  const min = Math.min(baseline, ...vals);
  const max = Math.max(baseline + 1, ...vals);
  const span = max - min || 1;
  return (
    <div className="pt-2 border-t border-[var(--border-hairline)]">
      <div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5 items-end h-20">
        {items.map((item) => {
          const pct = Math.max(12, Math.round(((item.value - min) / span) * 100));
          const above = item.value >= baseline;
          return (
            <div key={item.label} className="flex flex-col items-center justify-end h-full gap-1">
              <span className="text-[10px] font-mono tabular-nums text-[var(--text-muted)]">
                {item.value > 0 && unit === '%' ? '+' : ''}
                {item.value.toFixed(unit === '%' ? 1 : 0)}
                {unit}
              </span>
              <div
                className={`w-full rounded-t ${above ? 'bg-sky-500/75' : 'bg-amber-500/75'}`}
                style={{ height: `${Math.round(pct * 0.55)}%` }}
              />
              <span className="text-[10px] font-mono text-[var(--text-muted)]">{item.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
