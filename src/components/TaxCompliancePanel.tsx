import React, { useMemo, useState } from 'react';
import { AlertTriangle, FileDown, Globe, ReceiptText, Scale } from 'lucide-react';
import { exportGenericCSV } from '../lib/exportUtils';
import {
  analyzeTaxLossHarvesting,
  detectWashSales,
  evaluateInternationalTax,
  generateForm8949,
} from '../lib/taxEngine';
import type {
  PortfolioPosition,
  PortfolioTransaction,
  StockQuote,
  TradeJournalEntry,
} from '../types/market';

interface TaxCompliancePanelProps {
  positions: PortfolioPosition[];
  transactions: PortfolioTransaction[];
  journalEntries: TradeJournalEntry[];
  quotes: Record<string, StockQuote>;
  activeSymbol: string;
  onStageHarvestTrade?: (symbol: string, shares: number, replacementSymbol: string) => void;
}

export const TaxCompliancePanel: React.FC<TaxCompliancePanelProps> = ({
  positions,
  transactions,
  journalEntries,
  quotes,
  activeSymbol,
  onStageHarvestTrade,
}) => {
  const [shortTermRate, setShortTermRate] = useState(35);
  const [longTermRate, setLongTermRate] = useState(20);
  const [formPartFilter, setFormPartFilter] = useState<'ALL' | 'Part I (Short-Term)' | 'Part II (Long-Term)'>('ALL');
  const [harvestMessage, setHarvestMessage] = useState<string | null>(null);

  const harvestCandidates = useMemo(
    () => analyzeTaxLossHarvesting(positions, quotes, shortTermRate, longTermRate),
    [positions, quotes, shortTermRate, longTermRate]
  );

  const washSales = useMemo(
    () => detectWashSales(transactions, journalEntries),
    [transactions, journalEntries]
  );

  const form8949Rows = useMemo(
    () => generateForm8949(journalEntries, transactions, washSales),
    [journalEntries, transactions, washSales]
  );

  const filtered8949 = useMemo(
    () => form8949Rows.filter((r) => formPartFilter === 'ALL' || r.part === formPartFilter),
    [form8949Rows, formPartFilter]
  );

  const intlNotices = useMemo(
    () => evaluateInternationalTax(positions, activeSymbol),
    [positions, activeSymbol]
  );

  const totalHarvestSavings = harvestCandidates.reduce((s, c) => s + c.estimatedTaxSavings, 0);
  const totalUnrealizedLoss = harvestCandidates.reduce((s, c) => s + c.unrealizedLoss, 0);
  const totalDisallowedWash = washSales.reduce((s, w) => s + w.disallowedLossUsd, 0);
  const totalNet8949 = filtered8949.reduce((s, r) => s + r.gainOrLoss, 0);

  const handleExport8949 = () => {
    exportGenericCSV(
      `IRS_Form_8949_${new Date().toISOString().slice(0, 10)}.csv`,
      [
        'Part',
        'Description of Property',
        'Date Acquired',
        'Date Sold',
        'Proceeds (d)',
        'Cost Basis (e)',
        'Adj Code (f)',
        'Adjustment Amount (g)',
        'Gain or Loss (h)',
      ],
      filtered8949.map((r) => [
        r.part,
        r.description,
        r.dateAcquired,
        r.dateSold,
        r.proceeds.toFixed(2),
        r.costBasis.toFixed(2),
        r.adjustmentCode,
        r.adjustmentAmount.toFixed(2),
        r.gainOrLoss.toFixed(2),
      ])
    );
  };

  return (
    <div className="space-y-4">
      {/* Top Tax Summary & Rate Controls */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-3.5">
          <div className="text-xs text-slate-500 dark:text-slate-400">Harvestable Tax Alpha</div>
          <div className="mt-1 text-lg font-mono font-bold tabular-nums text-emerald-500">
            ${totalHarvestSavings.toFixed(2)}
          </div>
          <div className="text-[11px] font-mono text-slate-500 tabular-nums">
            On ${totalUnrealizedLoss.toFixed(2)} unrealized loss
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-3.5">
          <div className="text-xs text-slate-500 dark:text-slate-400">Wash Sale Flags (§1091)</div>
          <div
            className={`mt-1 text-lg font-mono font-bold tabular-nums ${
              washSales.length > 0 ? 'text-amber-500' : 'text-emerald-500'
            }`}
          >
            {washSales.length} Flagged
          </div>
          <div className="text-[11px] font-mono text-slate-500 tabular-nums">
            Disallowed: ${totalDisallowedWash.toFixed(2)}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-3.5">
          <div className="text-xs text-slate-500 dark:text-slate-400">Form 8949 Net Gain/Loss</div>
          <div
            className={`mt-1 text-lg font-mono font-bold tabular-nums ${
              totalNet8949 >= 0 ? 'text-emerald-500' : 'text-red-500'
            }`}
          >
            {totalNet8949 >= 0 ? '+' : ''}${totalNet8949.toFixed(2)}
          </div>
          <div className="text-[11px] font-mono text-slate-500 tabular-nums">
            {filtered8949.length} reportable disposals
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-3.5 space-y-1.5">
          <div className="text-xs text-slate-500 dark:text-slate-400">Marginal Tax Rates (%)</div>
          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            <div>
              <span className="text-[10px] text-slate-500 block">Short-Term</span>
              <input
                type="number"
                min={0}
                max={60}
                value={shortTermRate}
                onChange={(e) => setShortTermRate(Math.max(0, Math.min(60, Number(e.target.value) || 0)))}
                className="w-full rounded border border-slate-300 dark:border-slate-700 bg-transparent px-2 py-1"
              />
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block">Long-Term</span>
              <input
                type="number"
                min={0}
                max={50}
                value={longTermRate}
                onChange={(e) => setLongTermRate(Math.max(0, Math.min(50, Number(e.target.value) || 0)))}
                className="w-full rounded border border-slate-300 dark:border-slate-700 bg-transparent px-2 py-1"
              />
            </div>
          </div>
        </div>
      </div>

      {harvestMessage && (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2 text-xs text-emerald-600 dark:text-emerald-400">
          {harvestMessage}
        </div>
      )}

      {/* Tax-Loss Harvesting Optimizer + Wash Sale Detector */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Scale className="w-4 h-4 text-sky-500" aria-hidden="true" />
              Tax-Loss Harvesting Optimizer
            </h3>
            <span className="text-[11px] font-mono text-slate-500">30-Day Substantially Identical Safe Proxies</span>
          </div>

          {harvestCandidates.length === 0 ? (
            <div className="p-6 text-xs text-slate-500">
              All open holdings currently carry unrealized gains above cost basis — no tax-loss harvesting required.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono tabular-nums">
                <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#182235]/50 font-sans text-slate-500">
                  <tr>
                    <th className="py-2.5 px-3">Position</th>
                    <th className="py-2.5 px-3 text-right">Unrealized Loss</th>
                    <th className="py-2.5 px-3 text-right">Tax Alpha</th>
                    <th className="py-2.5 px-3">Replacement Proxy</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {harvestCandidates.map((c) => (
                    <tr key={c.symbol}>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{c.symbol}</div>
                        <div className="font-sans text-[11px] text-slate-500">
                          {c.shares} sh · {c.holdingTerm}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right text-red-500">-${c.unrealizedLoss.toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-right font-semibold text-emerald-500">
                        +${c.estimatedTaxSavings.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 font-sans">
                        <div className="font-mono font-semibold text-sky-500">{c.suggestedReplacement}</div>
                        <div className="text-[11px] text-slate-500 max-w-[240px]">{c.replacementRationale}</div>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {onStageHarvestTrade && (
                          <button
                            type="button"
                            onClick={() => {
                              onStageHarvestTrade(c.symbol, c.shares, c.suggestedReplacement);
                              setHarvestMessage(
                                `Harvested ${c.symbol} (${c.shares} sh) and rotated notional into ${c.suggestedReplacement}.`
                              );
                            }}
                            className="rounded border border-sky-500/40 bg-sky-500/10 px-2.5 py-1 text-[11px] font-sans font-semibold text-sky-500 hover:bg-sky-500/20"
                          >
                            Harvest &amp; Rotate
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Wash Sale Detection */}
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4 space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" aria-hidden="true" />
            IRS §1091 Wash Sale Detector
          </h3>
          <p className="text-xs text-slate-500">
            Scans 61-day window (±30 days around realized loss sales) across transactions &amp; trade journal.
          </p>

          {washSales.length === 0 ? (
            <div className="rounded border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-emerald-600 dark:text-emerald-400">
              No §1091 wash sales detected across your active transaction history.
            </div>
          ) : (
            <div className="space-y-2">
              {washSales.map((ws) => (
                <div key={ws.id} className="rounded border border-amber-500/40 bg-amber-500/8 p-3 text-xs space-y-1">
                  <div className="flex items-center justify-between font-mono font-semibold">
                    <span className="text-amber-500">{ws.symbol} · Code W</span>
                    <span className="text-red-500">-${ws.disallowedLossUsd.toFixed(2)} disallowed</span>
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono">
                    Loss {ws.lossSaleDate} · Re-buy {ws.repurchaseDate} ({ws.daysApart}d apart)
                  </div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-300 font-mono">
                    Adjusted Cost Basis: ${ws.adjustedCostBasisPerShare.toFixed(2)} / sh
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Form 8949 Generator */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <ReceiptText className="w-4 h-4 text-sky-500" aria-hidden="true" />
              IRS Form 8949 Generator (Sales &amp; Dispositions of Capital Assets)
            </h3>
            <p className="text-[11px] text-slate-500">
              Auto-populates Part I / Part II boxes and Code W wash-sale cost adjustments
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Filter Form 8949 Part"
              value={formPartFilter}
              onChange={(e) => setFormPartFilter(e.target.value as typeof formPartFilter)}
              className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 text-xs"
            >
              <option value="ALL">All Parts (I &amp; II)</option>
              <option value="Part I (Short-Term)">Part I (Short-Term)</option>
              <option value="Part II (Long-Term)">Part II (Long-Term)</option>
            </select>
            <button
              type="button"
              onClick={handleExport8949}
              className="inline-flex items-center gap-1.5 rounded-md bg-sky-600 hover:bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors"
            >
              <FileDown className="w-3.5 h-3.5" aria-hidden="true" />
              Export Form 8949 CSV
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono tabular-nums">
            <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#182235]/50 font-sans text-slate-500">
              <tr>
                <th className="py-2.5 px-3">Part</th>
                <th className="py-2.5 px-3">(a) Property</th>
                <th className="py-2.5 px-3">(b) Acquired</th>
                <th className="py-2.5 px-3">(c) Sold</th>
                <th className="py-2.5 px-3 text-right">(d) Proceeds</th>
                <th className="py-2.5 px-3 text-right">(e) Basis</th>
                <th className="py-2.5 px-3 text-center">(f) Code</th>
                <th className="py-2.5 px-3 text-right">(g) Adj.</th>
                <th className="py-2.5 px-3 text-right">(h) Gain / Loss</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {filtered8949.map((row) => (
                <tr key={row.id}>
                  <td className="py-2 px-3 font-sans text-[11px] text-slate-500">{row.part}</td>
                  <td className="py-2 px-3 font-semibold">{row.description}</td>
                  <td className="py-2 px-3 text-slate-500">{row.dateAcquired}</td>
                  <td className="py-2 px-3 text-slate-500">{row.dateSold}</td>
                  <td className="py-2 px-3 text-right">${row.proceeds.toFixed(2)}</td>
                  <td className="py-2 px-3 text-right">${row.costBasis.toFixed(2)}</td>
                  <td className="py-2 px-3 text-center font-bold text-amber-500">{row.adjustmentCode || '—'}</td>
                  <td className="py-2 px-3 text-right">
                    {row.adjustmentAmount > 0 ? `$${row.adjustmentAmount.toFixed(2)}` : '—'}
                  </td>
                  <td
                    className={`py-2 px-3 text-right font-semibold ${
                      row.gainOrLoss >= 0 ? 'text-emerald-500' : 'text-red-500'
                    }`}
                  >
                    {row.gainOrLoss >= 0 ? '+' : ''}${row.gainOrLoss.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* International & Regulatory Considerations */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Globe className="w-4 h-4 text-sky-500" aria-hidden="true" />
            International Tax &amp; Regulatory Screening (PFIC · DTAA · §1256 · FBAR)
          </h3>
          <span className="text-[11px] text-slate-500">Informational tax modeling — verify with a CPA</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {intlNotices.map((n) => (
            <div key={n.category} className="rounded border border-slate-200 dark:border-slate-800 p-3 space-y-1.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-900 dark:text-slate-100">{n.category}</span>
                <span
                  className={`font-mono text-[11px] font-semibold shrink-0 ${
                    n.applicability === 'Applies'
                      ? 'text-amber-500'
                      : n.applicability === 'Advisory'
                        ? 'text-sky-500'
                        : 'text-emerald-500'
                  }`}
                >
                  {n.applicability}
                </span>
              </div>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed">{n.summary}</p>
              <p className="text-[11px] font-mono text-slate-500">Action: {n.actionItem}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
