import type {
  Form8949Row,
  PortfolioPosition,
  PortfolioTransaction,
  StockQuote,
  TaxHarvestCandidate,
  TradeJournalEntry,
  WashSaleFlag,
} from '../types/market';

const REPLACEMENT_MAP: Record<string, { ticker: string; rationale: string }> = {
  AAPL: { ticker: 'XLK', rationale: 'Broad US Tech ETF preserves megacap tech beta while avoiding substantially identical trigger.' },
  NVDA: { ticker: 'SMH', rationale: 'VanEck Semiconductor ETF captures AI/GPU cycle without triggering IRS §1091 wash sale.' },
  MSFT: { ticker: 'IGV', rationale: 'iShares Expanded Tech-Software ETF tracks enterprise cloud & AI software exposure.' },
  GOOGL: { ticker: 'XLC', rationale: 'Communication Services SPDR ETF maintains digital ad & platform beta.' },
  AMZN: { ticker: 'XLY', rationale: 'Consumer Discretionary ETF mirrors retail & consumer spend trends.' },
  JPM: { ticker: 'XLF', rationale: 'Financial Select SPDR ETF preserves money-center bank & rate sensitivity.' },
  TSLA: { ticker: 'DRIV', rationale: 'Autonomous & EV thematic ETF maintains EV sector beta cleanly.' },
};

export function analyzeTaxLossHarvesting(
  positions: PortfolioPosition[],
  quotes: Record<string, StockQuote>,
  shortTermRatePct = 35,
  longTermRatePct = 20
): TaxHarvestCandidate[] {
  const candidates: TaxHarvestCandidate[] = [];
  const now = Date.now();

  for (const pos of positions) {
    const livePx = quotes[pos.symbol]?.price ?? pos.avgCost;
    const costTotal = pos.shares * pos.avgCost;
    const mktTotal = pos.shares * livePx;
    const diff = mktTotal - costTotal;

    if (diff < -10) {
      const heldDays = (now - pos.addedAt) / 86400000;
      const holdingTerm: 'Short-Term' | 'Long-Term' = heldDays > 365 ? 'Long-Term' : 'Short-Term';
      const taxRate = (holdingTerm === 'Short-Term' ? shortTermRatePct : longTermRatePct) / 100;
      const loss = Math.abs(diff);
      const rep = REPLACEMENT_MAP[pos.symbol] ?? {
        ticker: 'SPY',
        rationale: 'Broad market equity index ETF preserves general market exposure across the 30-day window.',
      };

      candidates.push({
        symbol: pos.symbol,
        name: pos.name,
        shares: pos.shares,
        costBasisTotal: Number(costTotal.toFixed(2)),
        marketValueTotal: Number(mktTotal.toFixed(2)),
        unrealizedLoss: Number(loss.toFixed(2)),
        holdingTerm,
        estimatedTaxSavings: Number((loss * taxRate).toFixed(2)),
        suggestedReplacement: rep.ticker,
        replacementRationale: rep.rationale,
      });
    }
  }

  return candidates.sort((a, b) => b.estimatedTaxSavings - a.estimatedTaxSavings);
}

export function detectWashSales(
  transactions: PortfolioTransaction[],
  journalEntries: TradeJournalEntry[]
): WashSaleFlag[] {
  const flags: WashSaleFlag[] = [];

  // Combine realized loss events from journalEntries and check against BUY transactions or journal re-entries within +/-30 days
  const buysBySym = new Map<string, { date: string; ms: number; price: number }[]>();
  for (const tx of transactions) {
    if (tx.side === 'BUY') {
      const list = buysBySym.get(tx.symbol) ?? [];
      list.push({ date: new Date(tx.timestamp).toISOString().slice(0, 10), ms: tx.timestamp, price: tx.price });
      buysBySym.set(tx.symbol, list);
    }
  }

  for (const entry of journalEntries) {
    if (entry.pnlUsd >= 0) continue;
    const exitMs = new Date(entry.exitDate).getTime();
    const candidates = buysBySym.get(entry.symbol) ?? [];
    for (const buy of candidates) {
      const daysApart = Math.round(Math.abs(buy.ms - exitMs) / 86400000);
      if (daysApart <= 30) {
        const disallowed = Math.abs(entry.pnlUsd);
        flags.push({
          id: `ws-${entry.id}-${buy.ms}`,
          symbol: entry.symbol,
          lossSaleDate: entry.exitDate,
          repurchaseDate: buy.date,
          daysApart,
          disallowedLossUsd: Number(disallowed.toFixed(2)),
          adjustedCostBasisPerShare: Number((buy.price + disallowed / Math.max(1, entry.shares)).toFixed(2)),
        });
        break;
      }
    }
  }

  // Also detect back-to-back closed trades on the same ticker within 30 days in journal
  for (let i = 0; i < journalEntries.length; i++) {
    const lossTrade = journalEntries[i];
    if (lossTrade.pnlUsd >= 0) continue;
    if (flags.some((f) => f.symbol === lossTrade.symbol && f.lossSaleDate === lossTrade.exitDate)) continue;
    const lossMs = new Date(lossTrade.exitDate).getTime();

    for (let j = 0; j < journalEntries.length; j++) {
      if (i === j) continue;
      const other = journalEntries[j];
      if (other.symbol !== lossTrade.symbol) continue;
      const entryMs = new Date(other.entryDate).getTime();
      const daysApart = Math.round(Math.abs(entryMs - lossMs) / 86400000);
      if (daysApart <= 30) {
        const disallowed = Math.abs(lossTrade.pnlUsd);
        flags.push({
          id: `ws-jrn-${lossTrade.id}-${other.id}`,
          symbol: lossTrade.symbol,
          lossSaleDate: lossTrade.exitDate,
          repurchaseDate: other.entryDate,
          daysApart,
          disallowedLossUsd: Number(disallowed.toFixed(2)),
          adjustedCostBasisPerShare: Number((other.entryPrice + disallowed / Math.max(1, other.shares)).toFixed(2)),
        });
        break;
      }
    }
  }

  return flags;
}

export function generateForm8949(
  journalEntries: TradeJournalEntry[],
  transactions: PortfolioTransaction[],
  washSales: WashSaleFlag[]
): Form8949Row[] {
  const rows: Form8949Row[] = [];
  const washBySymbolDate = new Map<string, WashSaleFlag>();
  for (const w of washSales) {
    washBySymbolDate.set(`${w.symbol}::${w.lossSaleDate}`, w);
  }

  for (const entry of journalEntries) {
    const proceeds = Number((entry.exitPrice * entry.shares).toFixed(2));
    const costBasis = Number((entry.entryPrice * entry.shares).toFixed(2));
    const heldDays = Math.max(
      1,
      Math.round((new Date(entry.exitDate).getTime() - new Date(entry.entryDate).getTime()) / 86400000)
    );
    const part: Form8949Row['part'] = heldDays > 365 ? 'Part II (Long-Term)' : 'Part I (Short-Term)';
    const ws = washBySymbolDate.get(`${entry.symbol}::${entry.exitDate}`);
    const adjCode: '' | 'W' = ws ? 'W' : '';
    const adjAmt = ws ? ws.disallowedLossUsd : 0;
    const netGain = Number((proceeds - costBasis + adjAmt).toFixed(2));

    rows.push({
      id: `8949-${entry.id}`,
      part,
      description: `${entry.shares} sh ${entry.symbol}`,
      dateAcquired: entry.entryDate,
      dateSold: entry.exitDate,
      proceeds,
      costBasis,
      adjustmentCode: adjCode,
      adjustmentAmount: adjAmt,
      gainOrLoss: netGain,
    });
  }

  // Include SELL executions from virtual portfolio transactions
  for (const tx of transactions) {
    if (tx.side !== 'SELL') continue;
    const proceeds = Number((tx.shares * tx.price).toFixed(2));
    const estCost = Number((proceeds * 0.94).toFixed(2));
    const d = new Date(tx.timestamp).toISOString().slice(0, 10);
    rows.push({
      id: `8949-tx-${tx.id}`,
      part: 'Part I (Short-Term)',
      description: `${tx.shares} sh ${tx.symbol}`,
      dateAcquired: d,
      dateSold: d,
      proceeds,
      costBasis: estCost,
      adjustmentCode: '',
      adjustmentAmount: 0,
      gainOrLoss: Number((proceeds - estCost).toFixed(2)),
    });
  }

  return rows;
}

export interface InternationalTaxNotice {
  category: string;
  applicability: 'Applies' | 'Advisory' | 'Clear';
  summary: string;
  actionItem: string;
}

export function evaluateInternationalTax(
  positions: PortfolioPosition[],
  activeSymbol: string
): InternationalTaxNotice[] {
  const foreignHoldings = positions.filter((p) => p.symbol.endsWith('.NS') || p.symbol.endsWith('.BO'));
  const hasForeignActive = activeSymbol.endsWith('.NS') || activeSymbol.endsWith('.BO');

  return [
    {
      category: 'PFIC (IRS Form 8621 — Foreign Mutual Funds / ETFs)',
      applicability: foreignHoldings.length > 0 || hasForeignActive ? 'Advisory' : 'Clear',
      summary:
        foreignHoldings.length > 0 || hasForeignActive
          ? 'Foreign-domiciled pooled funds or non-US passive entities can trigger punitive PFIC mark-to-market or QEF election rules.'
          : 'Current US-domiciled single-stock and US ETF positions are exempt from PFIC classification.',
      actionItem: 'Confirm non-US ETFs/REITs are not classified as Passive Foreign Investment Companies prior to year-end.',
    },
    {
      category: 'US–India DTAA Dividend Withholding & FTC (Form 1116)',
      applicability: foreignHoldings.length > 0 || hasForeignActive ? 'Applies' : 'Advisory',
      summary:
        'NSE/BSE equities incur Indian dividend withholding (20% statutory, reducible to 15%–25% under treaty) and Indian STCG/LTCG considerations.',
      actionItem: 'Claim Foreign Tax Credit on Form 1116 for verified treaty-withheld dividend taxes.',
    },
    {
      category: 'IRS Section 1256 Contracts (Index Options & Futures)',
      applicability: 'Advisory',
      summary:
        'Broad-based index options (SPX, NDX, VIX) and regulated futures qualify for 60% Long-Term / 40% Short-Term blended capital gains regardless of holding period.',
      actionItem: 'Track mark-to-market year-end balances separately on Form 6781; wash-sale rules do not apply to §1256.',
    },
    {
      category: 'FBAR (FinCEN 114) & FATCA (Form 8938)',
      applicability: foreignHoldings.length > 0 ? 'Applies' : 'Clear',
      summary:
        'Aggregate foreign brokerage account balances exceeding $10,000 at any point in the calendar year require FBAR electronic filing.',
      actionItem: 'Aggregate peak INR/foreign custody account valuations in USD using Treasury year-end FX rates.',
    },
  ];
}
