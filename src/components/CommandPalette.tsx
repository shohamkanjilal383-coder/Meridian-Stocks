import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  BellRing,
  Bot,
  Briefcase,
  CandlestickChart,
  Contrast,
  Cpu,
  Filter,
  Globe,
  Keyboard,
  Newspaper,
  RefreshCw,
  Search,
  SunMoon,
  X,
} from 'lucide-react';
import type { StockSymbolInfo } from '../types/market';

export interface CommandAction {
  id: string;
  group: 'Navigation' | 'Actions' | 'Symbols';
  label: string;
  subtitle?: string;
  shortcut?: string;
  icon: React.ComponentType<{ className?: string }>;
  onRun: () => void;
}

export type NavigationTarget =
  | 'charting'
  | 'markets'
  | 'markets:futures'
  | 'markets:macro'
  | 'markets:calendar'
  | 'markets:rotation'
  | 'markets:correlations'
  | 'quant:ml'
  | 'quant:options'
  | 'quant:altdata'
  | 'quant:darkpool'
  | 'quant:pead'
  | 'quant:builder'
  | 'portfolio'
  | 'portfolio:backtest'
  | 'portfolio:montecarlo'
  | 'portfolio:journal'
  | 'portfolio:tax'
  | 'research'
  | 'research:social'
  | 'alerts'
  | 'ai';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onSelectSymbol: (symbol: string) => void;
  onNavigate: (target: NavigationTarget) => void;
  onToggleTheme: () => void;
  onToggleContrast: () => void;
  onReconnectWs: () => void;
  onShowShortcuts: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  onClose,
  onSelectSymbol,
  onNavigate,
  onToggleTheme,
  onToggleContrast,
  onReconnectWs,
  onShowShortcuts,
}) => {
  const [query, setQuery] = useState('');
  const [symbolMatches, setSymbolMatches] = useState<StockSymbolInfo[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      window.setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/market/search?q=${encodeURIComponent(query)}&exchange=ALL`);
        if (res.ok) {
          const data = (await res.json()) as { results?: StockSymbolInfo[] };
          setSymbolMatches((data.results ?? []).slice(0, 8));
        }
      } catch {
        setSymbolMatches([]);
      }
    }, 120);
    return () => window.clearTimeout(timer);
  }, [query, open]);

  const staticCommands: CommandAction[] = useMemo(
    () => [
      {
        id: 'nav-charting',
        group: 'Navigation',
        label: 'Technical Charting & Multi-Layout',
        subtitle: 'Candlestick, Heikin-Ashi, 27 indicators & drawing tools',
        icon: CandlestickChart,
        onRun: () => onNavigate('charting'),
      },
      {
        id: 'nav-markets',
        group: 'Navigation',
        label: 'Global Market Overview',
        subtitle: 'S&P 500, NASDAQ, Dow, Nifty 50, Sensex & sector breadth',
        icon: Globe,
        onRun: () => onNavigate('markets'),
      },
      {
        id: 'nav-futures',
        group: 'Navigation',
        label: 'Futures Data & Term Structure (Commodities, Indices, Crypto)',
        subtitle: 'CL, GC, NG, HG, ES, NQ, RTY & CME BTC/ETH M1–M12 contango/backwardation curves',
        shortcut: 'g f',
        icon: Activity,
        onRun: () => onNavigate('markets:futures'),
      },
      {
        id: 'nav-macro',
        group: 'Navigation',
        label: 'Macro Regime (Risk-On/Off), Intermarket & VIX Term',
        subtitle: 'Macro regime detector, Bonds/Commodities/FX intermarket pairs, Fed 2s10s & Fear & Greed',
        shortcut: 'g i',
        icon: Activity,
        onRun: () => onNavigate('markets:macro'),
      },
      {
        id: 'nav-calendar',
        group: 'Navigation',
        label: 'Economic Calendar & Historical Market Reaction Analysis',
        subtitle: 'FOMC, CPI, NFP, RBI & ECB releases with consensus vs actual surprise & past 6-print reactions',
        icon: Globe,
        onRun: () => onNavigate('markets:calendar'),
      },
      {
        id: 'nav-rotation',
        group: 'Navigation',
        label: 'Sector Rotation (RRG) & Relative Strength Matrix',
        subtitle: '4-quadrant RRG & N×N sector ETF vs ETF spread matrix (1W / 1M / 3M)',
        shortcut: 'g r',
        icon: Globe,
        onRun: () => onNavigate('markets:rotation'),
      },
      {
        id: 'nav-correlations',
        group: 'Navigation',
        label: 'Intermarket & Cross-Asset Correlation Heatmap',
        subtitle: 'Bonds, Commodities, Forex & Equity rolling 20D/60D/90D/180D correlations',
        icon: Activity,
        onRun: () => onNavigate('markets:correlations'),
      },
      {
        id: 'nav-options',
        group: 'Navigation',
        label: 'Options Chain, 3D IV Surface, Max Pain & Flow Heatmap',
        subtitle: '5 Greeks incl. Rho, 3D IV mesh, Options Flow Heatmap, Max Pain curve & UOA scanner',
        shortcut: 'g o',
        icon: Cpu,
        onRun: () => onNavigate('quant:options'),
      },
      {
        id: 'nav-altdata',
        group: 'Navigation',
        label: 'Alternative Data (Satellite, Card Spend, ESG, Congress)',
        subtitle: 'Parking lot & oil storage satellite telemetry, job postings, app downloads & STOCK Act',
        icon: Cpu,
        onRun: () => onNavigate('quant:altdata'),
      },
      {
        id: 'nav-darkpool',
        group: 'Navigation',
        label: 'Dark Pool, Short Interest (DTC) & 13F Institutional Flow',
        subtitle: 'FINRA ATS block prints, Days-to-Cover & squeeze analytics, 13F ownership changes',
        shortcut: 'g d',
        icon: Cpu,
        onRun: () => onNavigate('quant:darkpool'),
      },
      {
        id: 'nav-pead',
        group: 'Navigation',
        label: 'Earnings Momentum, Guidance Revisions & Estimate Momentum',
        subtitle: 'PEAD drift curve, management guidance raises/cuts & 30D analyst EPS revision breadth',
        shortcut: 'g e',
        icon: Cpu,
        onRun: () => onNavigate('quant:pead'),
      },
      {
        id: 'nav-builder',
        group: 'Navigation',
        label: 'Visual Strategy Builder (Drag & Drop)',
        subtitle: 'Compose entry/filter/exit blocks and run instant historical backtests',
        icon: Cpu,
        onRun: () => onNavigate('quant:builder'),
      },
      {
        id: 'nav-ml',
        group: 'Navigation',
        label: 'ML Price Predictions & Patterns',
        subtitle: 'Ensemble targets, chart patterns & anomaly detection',
        icon: Cpu,
        onRun: () => onNavigate('quant:ml'),
      },
      {
        id: 'nav-portfolio',
        group: 'Navigation',
        label: 'Portfolio & Risk Management',
        subtitle: 'Holdings, VaR, Sharpe, Kelly criterion & risk diagnostics',
        shortcut: 'Ctrl+Shift+P',
        icon: Briefcase,
        onRun: () => onNavigate('portfolio'),
      },
      {
        id: 'nav-backtest',
        group: 'Navigation',
        label: 'Advanced Backtesting Lab & QuantConnect Export',
        subtitle: 'Slippage/commission simulation, Monte Carlo robustness, WFE grid & Python export',
        icon: Briefcase,
        onRun: () => onNavigate('portfolio:backtest'),
      },
      {
        id: 'nav-montecarlo',
        group: 'Navigation',
        label: 'Monte Carlo Portfolio Projections',
        subtitle: '600-path GBM simulation, P5-P95 fan chart & target hit probability',
        icon: Briefcase,
        onRun: () => onNavigate('portfolio:montecarlo'),
      },
      {
        id: 'nav-journal',
        group: 'Navigation',
        label: 'Trade Journal & AI Coach Review',
        subtitle: 'Log trade executions, discipline ratings & AI behavioral critique',
        icon: Briefcase,
        onRun: () => onNavigate('portfolio:journal'),
      },
      {
        id: 'nav-tax',
        group: 'Navigation',
        label: 'Tax-Loss Harvesting, Wash Sales & Form 8949',
        subtitle: 'Tax alpha optimizer, §1091 wash sale scanner, Form 8949 CSV & PFIC/DTAA checks',
        icon: Briefcase,
        onRun: () => onNavigate('portfolio:tax'),
      },
      {
        id: 'nav-alerts',
        group: 'Navigation',
        label: 'Smart Alerts Panel',
        subtitle: 'Price crosses, RSI triggers, volume spikes & push alerts',
        shortcut: 'Ctrl+Shift+A',
        icon: BellRing,
        onRun: () => onNavigate('alerts'),
      },
      {
        id: 'nav-screener',
        group: 'Navigation',
        label: 'Screener & News Fundamentals',
        subtitle: 'Multi-exchange stock screener, financials & analyst targets',
        icon: Filter,
        onRun: () => onNavigate('research'),
      },
      {
        id: 'nav-social',
        group: 'Navigation',
        label: 'Social Sentiment (Bot Filter), Whales 13F & Copy Trading',
        subtitle: 'Bot detection, 13F filings, copy trading leaderboard & community predictions',
        icon: Newspaper,
        onRun: () => onNavigate('research:social'),
      },
      {
        id: 'nav-ai',
        group: 'Navigation',
        label: 'AI Quantitative Analyst',
        subtitle: 'Natural language research chat & automated PDF reports',
        shortcut: 'g a',
        icon: Bot,
        onRun: () => onNavigate('ai'),
      },
      {
        id: 'act-theme',
        group: 'Actions',
        label: 'Toggle Dark / Light Theme',
        shortcut: 'Ctrl+Shift+T',
        icon: SunMoon,
        onRun: onToggleTheme,
      },
      {
        id: 'act-contrast',
        group: 'Actions',
        label: 'Toggle High-Contrast Trading Mode',
        shortcut: 'Ctrl+Shift+H',
        icon: Contrast,
        onRun: onToggleContrast,
      },
      {
        id: 'act-ws',
        group: 'Actions',
        label: 'Reconnect WebSocket Market Stream',
        icon: RefreshCw,
        onRun: onReconnectWs,
      },
      {
        id: 'act-shortcuts',
        group: 'Actions',
        label: 'View Keyboard Shortcuts Reference',
        shortcut: '?',
        icon: Keyboard,
        onRun: onShowShortcuts,
      },
    ],
    [onNavigate, onToggleTheme, onToggleContrast, onReconnectWs, onShowShortcuts]
  );

  const items: CommandAction[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const symbolItems: CommandAction[] = symbolMatches.map((s) => ({
      id: `sym-${s.symbol}`,
      group: 'Symbols',
      label: `${s.symbol} — ${s.name}`,
      subtitle: `${s.exchange} · ${s.sector} · ${s.currency}`,
      icon: Activity,
      onRun: () => onSelectSymbol(s.symbol),
    }));

    const filteredCmds = staticCommands.filter(
      (c) =>
        !q ||
        c.label.toLowerCase().includes(q) ||
        (c.subtitle?.toLowerCase().includes(q) ?? false) ||
        c.group.toLowerCase().includes(q)
    );

    // Prioritize matching symbols when typing a ticker/query
    return q ? [...symbolItems, ...filteredCmds] : [...filteredCmds, ...symbolItems.slice(0, 5)];
  }, [query, symbolMatches, staticCommands, onSelectSymbol]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [items.length, query]);

  if (!open) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const key = e.key.toLowerCase();
    if (e.key === 'ArrowDown' || (e.ctrlKey && (key === 'j' || key === 'n'))) {
      e.preventDefault();
      setSelectedIndex((i) => (items.length > 0 ? (i + 1) % items.length : 0));
    } else if (e.key === 'ArrowUp' || (e.ctrlKey && (key === 'k' || key === 'p'))) {
      e.preventDefault();
      setSelectedIndex((i) => (items.length > 0 ? (i - 1 + items.length) % items.length : 0));
    } else if (e.key === 'Enter' && items[selectedIndex]) {
      e.preventDefault();
      items[selectedIndex].onRun();
      onClose();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-16 px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="flex items-center gap-2.5 px-3.5 py-3 border-b border-[var(--border-hairline)]">
          <Search className="w-4 h-4 text-sky-500 shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search symbols (AAPL, NVDA, RELIANCE.NS) or jump to any panel..."
            className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close command palette"
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-96 overflow-y-auto py-1.5 divide-y divide-[var(--border-hairline)]/40">
          {items.length === 0 ? (
            <div className="py-8 text-center text-xs text-[var(--text-muted)]">
              No matching symbols or commands found.
            </div>
          ) : (
            items.map((item, idx) => {
              const Icon = item.icon;
              const active = idx === selectedIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  onMouseEnter={() => setSelectedIndex(idx)}
                  onClick={() => {
                    item.onRun();
                    onClose();
                  }}
                  className={`w-full text-left px-3.5 py-2.5 flex items-center justify-between gap-3 transition-colors ${
                    active ? 'bg-sky-500/12 text-[var(--text-primary)]' : 'text-[var(--text-primary)]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-sky-500' : 'text-[var(--text-muted)]'}`} />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold truncate">{item.label}</div>
                      {item.subtitle && (
                        <div className="text-[11px] text-[var(--text-muted)] truncate">{item.subtitle}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-mono text-[var(--text-muted)]">{item.group}</span>
                    {item.shortcut && (
                      <kbd className="rounded border border-[var(--border-hairline)] bg-[var(--surface-subtle)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">
                        {item.shortcut}
                      </kbd>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer Hints */}
        <div className="px-3.5 py-2 border-t border-[var(--border-hairline)] bg-[var(--surface-subtle)] flex items-center justify-between text-[11px] text-[var(--text-muted)]">
          <span>↑↓ / Ctrl+J/K Navigate · Enter Select · Esc Close</span>
          <span className="font-mono">Cmd+K / Ctrl+K</span>
        </div>
      </div>
    </div>
  );
};
