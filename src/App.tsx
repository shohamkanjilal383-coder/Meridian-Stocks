import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  Bot,
  Contrast,
  Keyboard,
  Moon,
  Search,
  Sun,
  X,
} from 'lucide-react';
import { AiAssistantPanel } from './components/AiAssistantPanel';
import { CommandPalette, type NavigationTarget } from './components/CommandPalette';
import { ErrorBoundary } from './components/ErrorBoundary';
import { MarketOverviewPanel, type MarketsSubTab } from './components/MarketOverviewPanel';
import { NewsFundamentalsPanel, type ResearchSubTab } from './components/NewsFundamentalsPanel';
import { PortfolioRiskPanel, type PortfolioSubTab } from './components/PortfolioRiskPanel';
import { OfflineIndicator, PWAInstallButton } from './components/PWAInstallButton';
import { PredictionPanel } from './components/PredictionPanel';
import { QuantLabPanel, type QuantSubTab } from './components/QuantLabPanel';
import { ScreenerAlertsPanel } from './components/ScreenerAlertsPanel';
import { TechnicalWorkspace } from './components/TechnicalWorkspace';
import { useMarketSocket } from './hooks/useMarketSocket';
import { calcRSI } from './lib/indicators';
import { offlineCache } from './lib/indexedDb';
import { getAllExchangeHours } from './lib/marketHours';
import { runEnsemblePredictions } from './lib/predictions';
import type {
  AltDataPayload,
  AssetCorrelationData,
  CommunityPrediction,
  CopyTraderProfile,
  EconomicCalendarEvent,
  ExchangeCode,
  FundamentalsData,
  FuturesDashboardData,
  MacroDashboardData,
  MarketOverviewData,
  NewsArticle,
  OHLCVBar,
  PortfolioPosition,
  PortfolioTransaction,
  ScreenerRow,
  SectorRotationItem,
  SmartAlert,
  SocialSentimentData,
  StockSymbolInfo,
  Timeframe,
  TradeJournalEntry,
  WhaleFiling13F,
} from './types/market';

type WorkspaceView = 'charting' | 'markets' | 'quant' | 'portfolio' | 'research' | 'ai';

const DEFAULT_WATCHLIST: string[] = [
  'AAPL',
  'NVDA',
  'MSFT',
  'GOOGL',
  'AMZN',
  'TSLA',
  'JPM',
  'RELIANCE.NS',
  'TCS.NS',
  'SBIN.BO',
];

const STARTER_POSITIONS: PortfolioPosition[] = [
  { id: 'pos-aapl', symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ', sector: 'Technology', shares: 45, avgCost: 214.5, currency: 'USD', addedAt: Date.now() - 86400000 * 14 },
  { id: 'pos-nvda', symbol: 'NVDA', name: 'NVIDIA Corporation', exchange: 'NASDAQ', sector: 'Semiconductors', shares: 80, avgCost: 129.0, currency: 'USD', addedAt: Date.now() - 86400000 * 10 },
  { id: 'pos-jpm', symbol: 'JPM', name: 'JPMorgan Chase & Co.', exchange: 'NYSE', sector: 'Financials', shares: 30, avgCost: 226.4, currency: 'USD', addedAt: Date.now() - 86400000 * 7 },
  { id: 'pos-msft', symbol: 'MSFT', name: 'Microsoft Corporation', exchange: 'NASDAQ', sector: 'Technology', shares: 22, avgCost: 405.0, currency: 'USD', addedAt: Date.now() - 86400000 * 4 },
];

const STARTER_JOURNAL: TradeJournalEntry[] = [
  {
    id: 'jrn-starter-1',
    symbol: 'NVDA',
    side: 'LONG',
    entryPrice: 132.4,
    exitPrice: 141.1,
    shares: 120,
    entryDate: '2025-02-10',
    exitDate: '2025-02-14',
    setupTag: 'VWAP + Dark Pool Support',
    disciplineRating: 5,
    notes: 'Waited for institutional VWAP reclaim with 1.8x relative volume before entering.',
    pnlUsd: 1044.0,
    pnlPct: 6.57,
  },
  {
    id: 'jrn-starter-2',
    symbol: 'AAPL',
    side: 'LONG',
    entryPrice: 229.8,
    exitPrice: 225.1,
    shares: 60,
    entryDate: '2025-02-18',
    exitDate: '2025-02-19',
    setupTag: 'Pre-Earnings Drift Chase',
    disciplineRating: 2,
    notes: 'Entered late near upper Bollinger Band without waiting for pullback.',
    pnlUsd: -282.0,
    pnlPct: -2.05,
  },
  {
    id: 'jrn-starter-3',
    symbol: 'MSFT',
    side: 'LONG',
    entryPrice: 408.2,
    exitPrice: 419.5,
    shares: 40,
    entryDate: '2025-02-21',
    exitDate: '2025-02-26',
    setupTag: 'PEAD Beat Continuation',
    disciplineRating: 4,
    notes: 'Held core through 5-day post-earnings consolidation, trailed stop under EMA 20.',
    pnlUsd: 452.0,
    pnlPct: 2.77,
  },
];

export default function App() {
  const [view, setView] = useState<WorkspaceView>('charting');
  const [marketsTab, setMarketsTab] = useState<MarketsSubTab>('overview');
  const [quantMode, setQuantMode] = useState<'lab' | 'ml'>('lab');
  const [quantTab, setQuantTab] = useState<QuantSubTab>('options');
  const [portfolioTab, setPortfolioTab] = useState<PortfolioSubTab>('holdings');
  const [researchTab, setResearchTab] = useState<ResearchSubTab>('overview');

  const [activeSymbol, setActiveSymbol] = useState('AAPL');
  const [timeframe, setTimeframe] = useState<Timeframe>('1d');
  const [darkMode, setDarkMode] = useState(true);
  const [highContrast, setHighContrast] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [exchangeHours, setExchangeHours] = useState(() => getAllExchangeHours());
  const [vimZone, setVimZone] = useState<'panel' | 'watchlist'>('panel');
  const [vimChord, setVimChord] = useState<'g' | null>(null);
  const vimIndexRef = useRef<number>(-1);
  const vimChordTimerRef = useRef<number | null>(null);
  const isMac = useMemo(
    () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent),
    []
  );

  // Watchlist & Search
  const [watchlist, setWatchlist] = useState<string[]>(DEFAULT_WATCHLIST);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchExchange, setSearchExchange] = useState<'ALL' | ExchangeCode>('ALL');
  const [searchResults, setSearchResults] = useState<StockSymbolInfo[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Market Data State
  const [barsBySymbol, setBarsBySymbol] = useState<Record<string, OHLCVBar[]>>({});
  const [loadingBars, setLoadingBars] = useState(false);
  const [overview, setOverview] = useState<MarketOverviewData | null>(null);
  const [futuresData, setFuturesData] = useState<FuturesDashboardData | null>(null);
  const [macroData, setMacroData] = useState<MacroDashboardData | null>(null);
  const [correlationData, setCorrelationData] = useState<AssetCorrelationData | null>(null);
  const [rotationData, setRotationData] = useState<SectorRotationItem[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<EconomicCalendarEvent[]>([]);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [fundamentals, setFundamentals] = useState<FundamentalsData | null>(null);
  const [socialData, setSocialData] = useState<SocialSentimentData | null>(null);
  const [altData, setAltData] = useState<AltDataPayload | null>(null);
  const [whales, setWhales] = useState<WhaleFiling13F[]>([]);
  const [copyTraders, setCopyTraders] = useState<CopyTraderProfile[]>([]);
  const [communityPreds, setCommunityPreds] = useState<CommunityPrediction[]>([]);
  const [loadingFundamentals, setLoadingFundamentals] = useState(false);
  const [screenerRows, setScreenerRows] = useState<ScreenerRow[]>([]);
  const [loadingScreener, setLoadingScreener] = useState(false);

  // Portfolio, Journal & Alerts State (persisted in IndexedDB)
  const [positions, setPositions] = useState<PortfolioPosition[]>([]);
  const [transactions, setTransactions] = useState<PortfolioTransaction[]>([]);
  const [journalEntries, setJournalEntries] = useState<TradeJournalEntry[]>([]);
  const [alerts, setAlerts] = useState<SmartAlert[]>([]);
  const [alertToasts, setAlertToasts] = useState<{ id: string; message: string }[]>([]);

  const subscribedSymbols = useMemo(
    () => Array.from(new Set([activeSymbol, ...watchlist, ...positions.map((p) => p.symbol), ...alerts.map((a) => a.symbol)])),
    [activeSymbol, watchlist, positions, alerts]
  );

  const { quotes, status: socketStatus, reconnectAttempt, reconnect: reconnectSocket, upsertQuote } =
    useMarketSocket(subscribedSymbols);

  useEffect(() => {
    const id = window.setInterval(() => setExchangeHours(getAllExchangeHours()), 30000);
    return () => window.clearInterval(id);
  }, []);

  // Hydrate preferences, portfolio, journal, and alerts from IndexedDB
  useEffect(() => {
    offlineCache.getPref<boolean>('darkMode').then((val) => {
      if (val !== undefined) setDarkMode(val);
    });
    offlineCache.getPref<boolean>('highContrast').then((val) => {
      if (val !== undefined) setHighContrast(val);
    });
    offlineCache.getPositions().then((saved) => {
      if (saved.length > 0) setPositions(saved);
      else {
        setPositions(STARTER_POSITIONS);
        STARTER_POSITIONS.forEach((p) => offlineCache.savePosition(p));
      }
    });
    offlineCache.getTransactions().then(setTransactions);
    offlineCache.getAlerts().then(setAlerts);
    offlineCache.getJournalEntries().then((saved) => {
      if (saved.length > 0) setJournalEntries(saved);
      else {
        setJournalEntries(STARTER_JOURNAL);
        STARTER_JOURNAL.forEach((j) => offlineCache.saveJournalEntry(j));
      }
    });
  }, []);

  // Sync theme classes onto <html>
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) root.classList.add('dark');
    else root.classList.remove('dark');
    root.setAttribute('data-contrast', highContrast ? 'high' : 'standard');
    offlineCache.setPref('darkMode', darkMode);
    offlineCache.setPref('highContrast', highContrast);
  }, [darkMode, highContrast]);

  // Fetch OHLCV bars for activeSymbol + timeframe (with IndexedDB offline cache)
  useEffect(() => {
    let cancelled = false;
    setLoadingBars(true);

    offlineCache.getBars(activeSymbol, timeframe).then((cached) => {
      if (!cancelled && cached && cached.length > 0) {
        setBarsBySymbol((prev) => ({ ...prev, [activeSymbol]: cached }));
      }
    });

    fetch(`/api/market/bars/${encodeURIComponent(activeSymbol)}?timeframe=${timeframe}`)
      .then((r) => r.json())
      .then((data: { bars?: OHLCVBar[] }) => {
        if (!cancelled && Array.isArray(data.bars) && data.bars.length > 0) {
          setBarsBySymbol((prev) => ({ ...prev, [activeSymbol]: data.bars! }));
          offlineCache.saveBars(activeSymbol, timeframe, data.bars!);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingBars(false);
      });

    // Also fetch quote snapshot immediately
    fetch(`/api/market/quote/${encodeURIComponent(activeSymbol)}`)
      .then((r) => r.json())
      .then((q) => {
        if (!cancelled && q?.symbol) upsertQuote(q);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [activeSymbol, timeframe, upsertQuote]);

  // Fetch news, fundamentals & social sentiment when activeSymbol changes
  useEffect(() => {
    let cancelled = false;
    setLoadingFundamentals(true);
    Promise.all([
      fetch(`/api/market/news?symbol=${encodeURIComponent(activeSymbol)}`).then((r) => r.json()),
      fetch(`/api/market/fundamentals/${encodeURIComponent(activeSymbol)}`).then((r) => r.json()),
      fetch(`/api/market/social/${encodeURIComponent(activeSymbol)}`).then((r) => r.json()),
      fetch(`/api/market/altdata/${encodeURIComponent(activeSymbol)}`).then((r) => r.json()),
      fetch(`/api/market/social-traders/${encodeURIComponent(activeSymbol)}`).then((r) => r.json()),
    ])
      .then(([newsRes, fundRes, socRes, altRes, tradersRes]) => {
        if (!cancelled) {
          setNews(newsRes.articles ?? []);
          setFundamentals(fundRes?.symbol ? fundRes : null);
          setSocialData(socRes?.symbol ? socRes : null);
          setAltData(altRes?.symbol ? altRes : null);
          setWhales(tradersRes?.filings ?? []);
          setCopyTraders(tradersRes?.traders ?? []);
          setCommunityPreds(tradersRes?.predictions ?? []);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingFundamentals(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeSymbol]);

  const fetchOverview = useCallback(async () => {
    setLoadingOverview(true);
    try {
      const [ovRes, futRes, macRes, corRes, rotRes, calRes] = await Promise.all([
        fetch('/api/market/overview'),
        fetch('/api/market/futures'),
        fetch('/api/market/macro'),
        fetch('/api/market/correlations'),
        fetch('/api/market/rotation'),
        fetch('/api/market/calendar'),
      ]);
      if (ovRes.ok) setOverview(await ovRes.json());
      if (futRes.ok) setFuturesData(await futRes.json());
      if (macRes.ok) setMacroData(await macRes.json());
      if (corRes.ok) setCorrelationData(await corRes.json());
      if (rotRes.ok) {
        const d = (await rotRes.json()) as { items?: SectorRotationItem[]; sectors?: SectorRotationItem[] };
        setRotationData(d.items ?? d.sectors ?? []);
      }
      if (calRes.ok) {
        const d = (await calRes.json()) as { events?: EconomicCalendarEvent[] };
        setCalendarEvents(d.events ?? []);
      }
    } finally {
      setLoadingOverview(false);
    }
  }, []);

  const fetchScreener = useCallback(async () => {
    setLoadingScreener(true);
    try {
      const res = await fetch('/api/market/screener');
      if (res.ok) {
        const d = (await res.json()) as { rows?: ScreenerRow[] };
        setScreenerRows(d.rows ?? []);
      }
    } finally {
      setLoadingScreener(false);
    }
  }, []);

  useEffect(() => {
    fetchOverview();
    fetchScreener();
  }, [fetchOverview, fetchScreener]);

  // Symbol Lookup debounced search
  useEffect(() => {
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/market/search?q=${encodeURIComponent(searchQuery)}&exchange=${encodeURIComponent(searchExchange)}`
        );
        if (res.ok) {
          const data = (await res.json()) as { results?: StockSymbolInfo[] };
          setSearchResults(data.results ?? []);
        }
      } catch {
        // Ignore offline search errors
      }
    }, 180);
    return () => window.clearTimeout(timer);
  }, [searchQuery, searchExchange]);

  const activeBars = barsBySymbol[activeSymbol] ?? [];
  const activeQuote = quotes[activeSymbol];

  const prediction = useMemo(
    () => runEnsemblePredictions(activeSymbol, activeBars, news),
    [activeSymbol, activeBars, news]
  );

  // Evaluate Smart Alerts on incoming live ticks
  useEffect(() => {
    if (alerts.length === 0) return;
    const rsiArr = calcRSI(activeBars, 14);
    const latestRsi = rsiArr.length ? rsiArr[rsiArr.length - 1].value : 50;

    let changed = false;
    const updatedAlerts = alerts.map((al) => {
      if (!al.active || al.triggeredAt) return al;
      const q = quotes[al.symbol];
      if (!q) return al;

      let triggered = false;
      let msg = '';
      if (al.conditionType === 'PRICE_ABOVE' && q.price >= al.threshold) {
        triggered = true;
        msg = `${al.symbol} crossed above ${al.threshold.toFixed(2)} (now ${q.price.toFixed(2)})`;
      } else if (al.conditionType === 'PRICE_BELOW' && q.price <= al.threshold) {
        triggered = true;
        msg = `${al.symbol} dropped below ${al.threshold.toFixed(2)} (now ${q.price.toFixed(2)})`;
      } else if (al.conditionType === 'VOLUME_SPIKE' && q.avgVolume > 0 && q.volume / q.avgVolume >= al.threshold) {
        triggered = true;
        msg = `${al.symbol} volume surged ${(q.volume / q.avgVolume).toFixed(1)}x avg`;
      } else if (al.conditionType === 'RSI_OVERBOUGHT' && al.symbol === activeSymbol && latestRsi >= al.threshold) {
        triggered = true;
        msg = `${al.symbol} RSI(14) reached ${latestRsi.toFixed(1)}`;
      } else if (al.conditionType === 'RSI_OVERSOLD' && al.symbol === activeSymbol && latestRsi <= al.threshold) {
        triggered = true;
        msg = `${al.symbol} RSI(14) fell to ${latestRsi.toFixed(1)}`;
      }

      if (triggered) {
        changed = true;
        setAlertToasts((prev) => [{ id: al.id, message: msg }, ...prev.slice(0, 3)]);
        if (al.channels.browserPush && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification('Meridian Terminal Alert', { body: msg });
        }
        const nextAl = { ...al, triggeredAt: Date.now(), lastMessage: msg };
        offlineCache.saveAlert(nextAl);
        return nextAl;
      }
      return al;
    });

    if (changed) setAlerts(updatedAlerts);
  }, [quotes, alerts, activeBars, activeSymbol]);

  const navigateToAlertsPanel = useCallback(() => {
    setView('research');
    window.setTimeout(() => {
      const el = document.getElementById('smart-alerts-panel');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.focus();
      }
    }, 80);
  }, []);

  const clearVimHighlight = useCallback(() => {
    document.querySelectorAll('[data-vim-active="true"]').forEach((el) => {
      el.removeAttribute('data-vim-active');
    });
  }, []);

  const focusVimItem = useCallback(
    (zone: 'panel' | 'watchlist', delta: number | 'first' | 'last') => {
      const selector =
        zone === 'watchlist'
          ? 'aside button'
          : 'main tbody tr, main [data-vim-item], main [data-vim-tab]';
      const nodes = Array.from(document.querySelectorAll<HTMLElement>(selector)).filter(
        (el) => el.offsetParent !== null
      );
      clearVimHighlight();
      if (nodes.length === 0) {
        vimIndexRef.current = -1;
        return;
      }
      let nextIdx = 0;
      if (delta === 'first') {
        nextIdx = 0;
      } else if (delta === 'last') {
        nextIdx = nodes.length - 1;
      } else if (vimIndexRef.current < 0) {
        nextIdx = delta >= 0 ? 0 : nodes.length - 1;
      } else {
        nextIdx = Math.max(0, Math.min(nodes.length - 1, vimIndexRef.current + delta));
      }
      vimIndexRef.current = nextIdx;
      const targetEl = nodes[nextIdx];
      targetEl.setAttribute('data-vim-active', 'true');
      targetEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    },
    [clearVimHighlight]
  );

  // Reset Vim cursor when active view or sub-tab changes
  useEffect(() => {
    vimIndexRef.current = -1;
    clearVimHighlight();
  }, [view, marketsTab, quantTab, quantMode, portfolioTab, researchTab, clearVimHighlight]);

  const cycleSubTab = useCallback(
    (dir: -1 | 1) => {
      if (view === 'markets') {
        const tabs: MarketsSubTab[] = ['overview', 'futures', 'macro', 'calendar', 'rotation', 'correlations'];
        const idx = tabs.indexOf(marketsTab);
        setMarketsTab(tabs[(idx + dir + tabs.length) % tabs.length]);
      } else if (view === 'quant') {
        if (quantMode === 'ml') {
          setQuantMode('lab');
          return;
        }
        const tabs: QuantSubTab[] = ['options', 'darkpool', 'pead', 'builder', 'altdata'];
        const idx = tabs.indexOf(quantTab);
        setQuantTab(tabs[(idx + dir + tabs.length) % tabs.length]);
      } else if (view === 'portfolio') {
        const tabs: PortfolioSubTab[] = ['holdings', 'risk', 'kelly', 'backtest', 'montecarlo', 'journal', 'tax'];
        const idx = tabs.indexOf(portfolioTab);
        setPortfolioTab(tabs[(idx + dir + tabs.length) % tabs.length]);
      } else if (view === 'research') {
        const tabs: ResearchSubTab[] = ['overview', 'statements', 'ownership', 'news', 'social'];
        const idx = tabs.indexOf(researchTab);
        setResearchTab(tabs[(idx + dir + tabs.length) % tabs.length]);
      } else if (view === 'charting') {
        const tfs: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d', '1w', '1M'];
        const idx = tfs.indexOf(timeframe);
        setTimeframe(tfs[(idx + dir + tfs.length) % tfs.length]);
      }
    },
    [view, marketsTab, quantMode, quantTab, portfolioTab, researchTab, timeframe]
  );

  // Global keyboard shortcuts & Vim-style navigation for power users
  useEffect(() => {
    const clearChord = () => {
      setVimChord(null);
      if (vimChordTimerRef.current) {
        window.clearTimeout(vimChordTimerRef.current);
        vimChordTimerRef.current = null;
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;

      if (mod && !e.shiftKey && key === 'k') {
        e.preventDefault();
        clearChord();
        setCommandOpen((o) => !o);
        return;
      }
      if (mod && e.shiftKey && key === 't') {
        e.preventDefault();
        setDarkMode((d) => !d);
        return;
      }
      if (mod && e.shiftKey && key === 'h') {
        e.preventDefault();
        setHighContrast((c) => !c);
        return;
      }
      if (mod && e.shiftKey && key === 'p') {
        e.preventDefault();
        setPortfolioTab('holdings');
        setView('portfolio');
        return;
      }
      if (mod && e.shiftKey && key === 'a') {
        e.preventDefault();
        navigateToAlertsPanel();
        return;
      }
      if (mod && e.shiftKey && key === 'i') {
        e.preventDefault();
        setView('ai');
        return;
      }

      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable);

      if (e.key === '/' && !isInput && !mod) {
        e.preventDefault();
        clearChord();
        setSearchOpen(true);
        searchInputRef.current?.focus();
        return;
      }
      if (e.key === 'Escape') {
        clearChord();
        clearVimHighlight();
        vimIndexRef.current = -1;
        setSearchOpen(false);
        setShowShortcuts(false);
        setCommandOpen(false);
        if (isInput && target) target.blur();
        return;
      }
      if (isInput || commandOpen || showShortcuts) return;

      // Vim half-page scroll & zone switch (Ctrl+d/u/h/l)
      if (e.ctrlKey && !e.metaKey && !e.shiftKey) {
        if (key === 'd') {
          e.preventDefault();
          window.scrollBy({ top: Math.round(window.innerHeight * 0.45), behavior: 'smooth' });
          return;
        }
        if (key === 'u') {
          e.preventDefault();
          window.scrollBy({ top: -Math.round(window.innerHeight * 0.45), behavior: 'smooth' });
          return;
        }
        if (key === 'h') {
          e.preventDefault();
          setVimZone('watchlist');
          vimIndexRef.current = -1;
          focusVimItem('watchlist', 'first');
          return;
        }
        if (key === 'l') {
          e.preventDefault();
          setVimZone('panel');
          vimIndexRef.current = -1;
          focusVimItem('panel', 'first');
          return;
        }
      }

      if (mod || e.altKey) return;

      // Handle 'g' chord second key
      if (vimChord === 'g') {
        e.preventDefault();
        clearChord();
        if (e.key === 'g') {
          focusVimItem(vimZone, 'first');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else if (key === 'c') {
          setView('charting');
        } else if (key === 'm') {
          setMarketsTab('overview');
          setView('markets');
        } else if (key === 'f') {
          setMarketsTab('futures');
          setView('markets');
        } else if (key === 'i') {
          setMarketsTab('macro');
          setView('markets');
        } else if (key === 'r') {
          setMarketsTab('rotation');
          setView('markets');
        } else if (key === 'o') {
          setQuantMode('lab');
          setQuantTab('options');
          setView('quant');
        } else if (key === 'd') {
          setQuantMode('lab');
          setQuantTab('darkpool');
          setView('quant');
        } else if (key === 'e') {
          setQuantMode('lab');
          setQuantTab('pead');
          setView('quant');
        } else if (key === 'p') {
          setPortfolioTab('holdings');
          setView('portfolio');
        } else if (key === 'b') {
          setPortfolioTab('backtest');
          setView('portfolio');
        } else if (key === 's') {
          setResearchTab('overview');
          setView('research');
        } else if (key === 'a') {
          setView('ai');
        }
        return;
      }

      // Start 'g' chord
      if (e.key === 'g') {
        e.preventDefault();
        setVimChord('g');
        if (vimChordTimerRef.current) window.clearTimeout(vimChordTimerRef.current);
        vimChordTimerRef.current = window.setTimeout(() => setVimChord(null), 900);
        return;
      }

      // Jump to bottom (Shift+G)
      if (e.key === 'G') {
        e.preventDefault();
        focusVimItem(vimZone, 'last');
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
        return;
      }

      // Vim j / k row & item navigation
      if (key === 'j') {
        e.preventDefault();
        focusVimItem(vimZone, 1);
        return;
      }
      if (key === 'k') {
        e.preventDefault();
        focusVimItem(vimZone, -1);
        return;
      }

      // Vim h / l sub-tab cycling
      if (key === 'h') {
        e.preventDefault();
        cycleSubTab(-1);
        return;
      }
      if (key === 'l') {
        e.preventDefault();
        cycleSubTab(1);
        return;
      }

      // [ / ] primary workspace view cycling
      if (e.key === '[' || e.key === ']') {
        e.preventDefault();
        const views: WorkspaceView[] = ['charting', 'markets', 'quant', 'portfolio', 'research', 'ai'];
        const cur = views.indexOf(view);
        const dir = e.key === ']' ? 1 : -1;
        setView(views[(cur + dir + views.length) % views.length]);
        return;
      }

      // Enter or 'o' activates highlighted Vim element
      if (e.key === 'Enter' || key === 'o') {
        const activeEl = document.querySelector<HTMLElement>('[data-vim-active="true"]');
        if (activeEl) {
          e.preventDefault();
          const clickable =
            activeEl.tagName === 'BUTTON' || activeEl.tagName === 'A'
              ? activeEl
              : activeEl.querySelector<HTMLElement>('button, a');
          (clickable ?? activeEl).click();
          return;
        }
      }

      const tfMap: Record<string, Timeframe> = {
        '1': '1m', '2': '5m', '3': '15m', '4': '1h', '5': '4h', '6': '1d', '7': '1w', '8': '1M',
      };
      if (tfMap[e.key]) {
        setTimeframe(tfMap[e.key]);
      } else if (key === 't') {
        setDarkMode((d) => !d);
      } else if (e.key === '?') {
        setShowShortcuts((s) => !s);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (vimChordTimerRef.current) window.clearTimeout(vimChordTimerRef.current);
    };
  }, [
    navigateToAlertsPanel,
    clearVimHighlight,
    focusVimItem,
    cycleSubTab,
    commandOpen,
    showShortcuts,
    vimChord,
    vimZone,
    view,
  ]);

  const handleSelectSymbol = (sym: string) => {
    const clean = sym.toUpperCase().trim();
    setActiveSymbol(clean);
    if (!watchlist.includes(clean)) {
      setWatchlist((prev) => [clean, ...prev]);
    }
    setSearchOpen(false);
    setSearchQuery('');
  };

  const handleTrade = (side: 'BUY' | 'SELL', sym: string, shares: number, price: number) => {
    const tx: PortfolioTransaction = {
      id: `tx-${Date.now()}`,
      symbol: sym,
      side,
      shares,
      price,
      timestamp: Date.now(),
    };
    setTransactions((prev) => [tx, ...prev]);
    offlineCache.saveTransaction(tx);

    setPositions((prev) => {
      const existing = prev.find((p) => p.symbol === sym);
      if (side === 'BUY') {
        if (existing) {
          const totalShares = existing.shares + shares;
          const nextCost = (existing.shares * existing.avgCost + shares * price) / totalShares;
          const updated: PortfolioPosition = { ...existing, shares: totalShares, avgCost: Number(nextCost.toFixed(2)) };
          offlineCache.savePosition(updated);
          return prev.map((p) => (p.id === existing.id ? updated : p));
        }
        const q = quotes[sym];
        const created: PortfolioPosition = {
          id: `pos-${sym}-${Date.now()}`,
          symbol: sym,
          name: q?.name ?? sym,
          exchange: q?.exchange ?? 'NASDAQ',
          sector: q?.sector ?? 'Equities',
          shares,
          avgCost: price,
          currency: q?.currency ?? 'USD',
          addedAt: Date.now(),
        };
        offlineCache.savePosition(created);
        return [created, ...prev];
      } else {
        if (!existing) return prev;
        const remaining = existing.shares - shares;
        if (remaining <= 0.001) {
          offlineCache.deletePosition(existing.id);
          return prev.filter((p) => p.id !== existing.id);
        }
        const updated = { ...existing, shares: Number(remaining.toFixed(4)) };
        offlineCache.savePosition(updated);
        return prev.map((p) => (p.id === existing.id ? updated : p));
      }
    });
  };

  const handleRemovePosition = (id: string) => {
    setPositions((prev) => prev.filter((p) => p.id !== id));
    offlineCache.deletePosition(id);
  };

  const handleCreateAlert = (al: SmartAlert) => {
    setAlerts((prev) => [al, ...prev]);
    offlineCache.saveAlert(al);
  };

  const handleDeleteAlert = (id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    offlineCache.deleteAlert(id);
  };

  const handleAddJournalEntry = (entry: TradeJournalEntry) => {
    setJournalEntries((prev) => [entry, ...prev]);
    offlineCache.saveJournalEntry(entry);
  };

  const handleUpdateJournalEntry = (entry: TradeJournalEntry) => {
    setJournalEntries((prev) => prev.map((j) => (j.id === entry.id ? entry : j)));
    offlineCache.saveJournalEntry(entry);
  };

  const handleDeleteJournalEntry = (id: string) => {
    setJournalEntries((prev) => prev.filter((j) => j.id !== id));
    offlineCache.deleteJournalEntry(id);
  };

  const handleCommandNavigate = useCallback(
    (target: NavigationTarget) => {
      if (target === 'alerts') {
        navigateToAlertsPanel();
      } else if (target === 'markets') {
        setMarketsTab('overview');
        setView('markets');
      } else if (target === 'markets:futures') {
        setMarketsTab('futures');
        setView('markets');
      } else if (target === 'markets:macro') {
        setMarketsTab('macro');
        setView('markets');
      } else if (target === 'markets:calendar') {
        setMarketsTab('calendar');
        setView('markets');
      } else if (target === 'markets:rotation') {
        setMarketsTab('rotation');
        setView('markets');
      } else if (target === 'markets:correlations') {
        setMarketsTab('correlations');
        setView('markets');
      } else if (target === 'quant:ml') {
        setQuantMode('ml');
        setView('quant');
      } else if (target === 'quant:options') {
        setQuantMode('lab');
        setQuantTab('options');
        setView('quant');
      } else if (target === 'quant:altdata') {
        setQuantMode('lab');
        setQuantTab('altdata');
        setView('quant');
      } else if (target === 'quant:darkpool') {
        setQuantMode('lab');
        setQuantTab('darkpool');
        setView('quant');
      } else if (target === 'quant:pead') {
        setQuantMode('lab');
        setQuantTab('pead');
        setView('quant');
      } else if (target === 'quant:builder') {
        setQuantMode('lab');
        setQuantTab('builder');
        setView('quant');
      } else if (target === 'portfolio') {
        setPortfolioTab('holdings');
        setView('portfolio');
      } else if (target === 'portfolio:backtest') {
        setPortfolioTab('backtest');
        setView('portfolio');
      } else if (target === 'portfolio:montecarlo') {
        setPortfolioTab('montecarlo');
        setView('portfolio');
      } else if (target === 'portfolio:journal') {
        setPortfolioTab('journal');
        setView('portfolio');
      } else if (target === 'portfolio:tax') {
        setPortfolioTab('tax');
        setView('portfolio');
      } else if (target === 'research') {
        setResearchTab('overview');
        setView('research');
      } else if (target === 'research:social') {
        setResearchTab('social');
        setView('research');
      } else {
        setView(target);
      }
    },
    [navigateToAlertsPanel]
  );

  const isPositive = (activeQuote?.changePercent ?? 0) >= 0;
  const rangePct = (val: number, lo: number, hi: number) =>
    hi > lo ? Math.max(0, Math.min(100, ((val - lo) / (hi - lo)) * 100)) : 50;

  return (
    <div className="min-h-screen flex flex-col bg-[var(--surface-canvas)] text-[var(--text-primary)]">
      {/* Strict 3-Zone Top Navigation Bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-8 px-4 lg:px-6 h-14 border-b border-[var(--border-hairline)] bg-[var(--surface-panel)]">
        {/* Zone 1: Single-element Brand Wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setView('charting');
          }}
          className="font-display text-base font-bold tracking-tight text-[var(--text-primary)] whitespace-nowrap shrink-0"
        >
          Meridian Terminal
        </a>

        {/* Zone 2: 5 concise single-line text nav links */}
        <nav className="hidden md:flex items-center gap-6 text-xs font-medium" aria-label="Primary Workspace Navigation">
          {(
            [
              { id: 'charting', label: 'Charting' },
              { id: 'markets', label: 'Markets & Macro' },
              { id: 'quant', label: 'Quant Lab' },
              { id: 'portfolio', label: 'Portfolio' },
              { id: 'research', label: 'Screener & Research' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setView(item.id)}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                view === item.id
                  ? 'border-sky-500 text-[var(--text-primary)] font-semibold'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Zone 3: Live WebSocket Status + Primary Action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={reconnectSocket}
            title={
              socketStatus === 'connected'
                ? 'Live WebSocket stream connected (click to refresh)'
                : socketStatus === 'reconnecting'
                  ? `Auto-reconnecting (attempt ${reconnectAttempt}) — click to retry now`
                  : 'WebSocket disconnected — click to reconnect'
            }
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-hairline)] px-2.5 py-1 text-[11px] font-mono text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors whitespace-nowrap shrink-0"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                socketStatus === 'connected'
                  ? 'bg-emerald-500'
                  : socketStatus === 'reconnecting'
                    ? 'bg-amber-500 animate-pulse'
                    : 'bg-red-500'
              }`}
              aria-hidden="true"
            />
            <span>
              {socketStatus === 'connected'
                ? 'WS Connected'
                : socketStatus === 'reconnecting'
                  ? `Reconnecting${reconnectAttempt > 0 ? ` (${reconnectAttempt})` : ''}`
                  : 'Disconnected'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setView('ai')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              view === 'ai'
                ? 'bg-sky-600 text-white'
                : 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 hover:opacity-90'
            }`}
          >
            <Bot className="w-3.5 h-3.5" aria-hidden="true" />
            AI Analyst
          </button>
        </div>
      </header>

      {/* Mobile Bottom/Sub Nav */}
      <div className="flex md:hidden items-center gap-1 overflow-x-auto px-3 py-2 border-b border-[var(--border-hairline)] bg-[var(--surface-panel)]">
        {(
          [
            { id: 'charting', label: 'Chart' },
            { id: 'markets', label: 'Markets' },
            { id: 'quant', label: 'Quant' },
            { id: 'portfolio', label: 'Portfolio' },
            { id: 'research', label: 'Research' },
            { id: 'ai', label: 'AI' },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setView(item.id)}
            className={`px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap shrink-0 ${
              view === item.id ? 'bg-sky-600 text-white' : 'text-[var(--text-muted)]'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Workspace Control Strip (Search, Exchange Filter, Theme, High Contrast, PWA Install, Shortcuts) */}
      <div className="border-b border-[var(--border-hairline)] bg-[var(--surface-panel)] px-4 lg:px-6 py-2 flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex items-center gap-2 flex-1 max-w-xl">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
            <input
              ref={searchInputRef}
              type="text"
              aria-label="Search ticker or company across NYSE, NASDAQ, NSE, BSE"
              value={searchQuery}
              onFocus={() => setSearchOpen(true)}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSearchOpen(true);
              }}
              placeholder="Lookup symbol (AAPL, NVDA, RELIANCE.NS, TCS.BO)... press /"
              className="w-full rounded-md border border-[var(--border-hairline)] bg-[var(--surface-subtle)] pl-8 pr-3 py-1.5 text-xs focus:border-sky-500 focus:outline-none"
            />
          </div>
          <select
            aria-label="Exchange filter"
            value={searchExchange}
            onChange={(e) => setSearchExchange(e.target.value as 'ALL' | ExchangeCode)}
            className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-subtle)] px-2.5 py-1.5 text-xs font-mono"
          >
            <option value="ALL">ALL</option>
            <option value="NASDAQ">NASDAQ</option>
            <option value="NYSE">NYSE</option>
            <option value="NSE">NSE</option>
            <option value="BSE">BSE</option>
          </select>

          {searchOpen && (
            <div className="absolute left-0 top-full mt-1 z-40 w-full max-h-72 overflow-y-auto rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] shadow-xl divide-y divide-[var(--border-hairline)]">
              <div className="flex items-center justify-between px-3 py-1.5 text-[11px] text-[var(--text-muted)]">
                <span>Matching Symbols ({searchResults.length})</span>
                <button type="button" onClick={() => setSearchOpen(false)} className="hover:text-sky-500">
                  Close
                </button>
              </div>
              {searchResults.map((res) => (
                <button
                  key={res.symbol}
                  type="button"
                  onClick={() => handleSelectSymbol(res.symbol)}
                  className="w-full text-left px-3 py-2 hover:bg-[var(--surface-subtle)] flex items-center justify-between text-xs"
                >
                  <div>
                    <span className="font-mono font-semibold text-sky-500">{res.symbol}</span>
                    <span className="ml-2 text-[var(--text-primary)]">{res.name}</span>
                  </div>
                  <span className="font-mono text-[11px] text-[var(--text-muted)]">
                    {res.exchange} · {res.currency}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Per-Exchange Market Hours Status */}
          <div
            className="hidden xl:flex items-center gap-3 text-[11px] font-mono text-[var(--text-muted)]"
            aria-label="Global Exchange Market Hours"
          >
            {exchangeHours.map((ex, i) => {
              const statusColor =
                ex.status === 'Open'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : ex.status === 'Pre-Market' || ex.status === 'After-Hours'
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-[var(--text-muted)]';
              return (
                <React.Fragment key={ex.exchange}>
                  {i > 0 && <span aria-hidden="true" className="text-slate-400/50">·</span>}
                  <span title={`${ex.exchange} regular session: ${ex.hoursLabel} (${ex.localTime})`}>
                    <strong className="text-[var(--text-primary)] font-semibold">{ex.exchange}</strong>{' '}
                    <span className={statusColor}>{ex.status}</span>
                  </span>
                </React.Fragment>
              );
            })}
          </div>

          {vimChord && (
            <kbd
              aria-live="polite"
              className="rounded border border-sky-500/50 bg-sky-500/15 px-2 py-1 font-mono text-[11px] font-semibold text-sky-500"
            >
              {vimChord} →
            </kbd>
          )}

          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            title={`Open Command Palette (${isMac ? 'Cmd+K' : 'Ctrl+K'})`}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-subtle)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors whitespace-nowrap shrink-0"
          >
            <span>Command</span>
            <kbd className="font-mono text-[10px] opacity-80">{isMac ? '⌘K' : 'Ctrl+K'}</kbd>
          </button>

          <PWAInstallButton />

          <button
            type="button"
            onClick={() => setHighContrast((c) => !c)}
            aria-pressed={highContrast}
            title="Toggle High-Contrast Trading Mode (Ctrl+Shift+H)"
            className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              highContrast
                ? 'border-sky-500 bg-sky-500/15 text-sky-500'
                : 'border-[var(--border-hairline)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Contrast className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">High Contrast</span>
          </button>

          <button
            type="button"
            onClick={() => setDarkMode((d) => !d)}
            aria-label="Toggle light or dark theme"
            title="Toggle Theme (Ctrl+Shift+T)"
            className="inline-flex items-center gap-1 rounded-md border border-[var(--border-hairline)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            {darkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            onClick={() => setShowShortcuts(true)}
            aria-label="Keyboard shortcuts"
            title="Keyboard Shortcuts (?)"
            className="inline-flex items-center gap-1 rounded-md border border-[var(--border-hairline)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            <Keyboard className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Compact Market Hours Row for Mobile / Tablet */}
      <div className="flex xl:hidden items-center gap-3 overflow-x-auto px-4 py-1.5 border-b border-[var(--border-hairline)] bg-[var(--surface-panel)] text-[11px] font-mono text-[var(--text-muted)]">
        {exchangeHours.map((ex, i) => (
          <React.Fragment key={ex.exchange}>
            {i > 0 && <span aria-hidden="true" className="text-slate-400/50">·</span>}
            <span className="whitespace-nowrap shrink-0">
              <strong className="text-[var(--text-primary)]">{ex.exchange}</strong>{' '}
              <span
                className={
                  ex.status === 'Open'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : ex.status === 'Pre-Market' || ex.status === 'After-Hours'
                      ? 'text-amber-600 dark:text-amber-400'
                      : ''
                }
              >
                {ex.status}
              </span>{' '}
              <span className="opacity-70">({ex.localTime})</span>
            </span>
          </React.Fragment>
        ))}
      </div>

      {/* Triggered Smart Alert Toasts */}
      {alertToasts.length > 0 && (
        <div className="px-4 lg:px-6 pt-2 space-y-1.5">
          {alertToasts.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300"
            >
              <span className="flex items-center gap-2 font-medium">
                <Bell className="w-3.5 h-3.5" aria-hidden="true" />
                Alert Triggered: {t.message}
              </span>
              <button
                type="button"
                onClick={() => setAlertToasts((prev) => prev.filter((x) => x.id !== t.id))}
                aria-label="Dismiss alert"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Main Multi-Panel Terminal Body */}
      <div className="flex-1 flex flex-col lg:flex-row">
        {/* Left Watchlist Sidebar */}
        <aside className="w-full lg:w-64 shrink-0 border-b lg:border-b-0 lg:border-r border-[var(--border-hairline)] bg-[var(--surface-panel)]">
          <div className="px-3.5 py-2.5 border-b border-[var(--border-hairline)] flex items-center justify-between">
            <h2 className="text-xs font-semibold text-[var(--text-primary)]">Live Watchlist</h2>
            <span className="text-[11px] font-mono text-[var(--text-muted)]">{watchlist.length} symbols</span>
          </div>
          <div className="flex lg:flex-col overflow-x-auto lg:overflow-y-auto lg:max-h-[calc(100vh-140px)] divide-x lg:divide-x-0 lg:divide-y divide-[var(--border-hairline)]">
            {watchlist.map((sym) => {
              const q = quotes[sym];
              const active = sym === activeSymbol;
              const pos = (q?.changePercent ?? 0) >= 0;
              return (
                <button
                  key={sym}
                  type="button"
                  onClick={() => setActiveSymbol(sym)}
                  className={`min-w-[140px] lg:min-w-0 w-full text-left px-3.5 py-2.5 transition-colors flex items-center justify-between gap-2 ${
                    active ? 'bg-sky-500/10' : 'hover:bg-[var(--surface-subtle)]'
                  }`}
                >
                  <div>
                    <div className="font-mono text-xs font-semibold text-[var(--text-primary)]">{sym}</div>
                    <div className="text-[11px] text-[var(--text-muted)] truncate max-w-[95px]">
                      {q?.exchange ?? 'EQUITY'}
                    </div>
                  </div>
                  <div className="text-right font-mono tabular-nums">
                    <div className="text-xs font-semibold text-[var(--text-primary)]">
                      {q ? q.price.toFixed(2) : '—'}
                    </div>
                    <div
                      className={`text-[11px] ${
                        pos ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {q ? `${pos ? '+' : ''}${q.changePercent.toFixed(2)}%` : '0.00%'}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Primary Viewport */}
        <main className="flex-1 p-4 lg:p-5 space-y-4 overflow-x-hidden">
          {/* Active Ticker Live Quote Banner */}
          <section className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-4">
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
                  <span className="font-mono font-semibold text-sky-500">{activeQuote?.exchange ?? 'NASDAQ'}</span>
                  <span aria-hidden="true">·</span>
                  <span>{activeQuote?.sector ?? 'Equities'}</span>
                  <span aria-hidden="true">·</span>
                  <span>Source: {activeQuote?.dataSource ?? 'Connecting'}</span>
                  <span aria-hidden="true">·</span>
                  <span>State: {activeQuote?.marketState ?? 'REGULAR'}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-baseline gap-3">
                  <h1 className="font-display text-xl sm:text-2xl font-bold text-[var(--text-primary)]">
                    {activeSymbol} <span className="font-normal text-base text-[var(--text-muted)]">{activeQuote?.name}</span>
                  </h1>
                  {activeQuote && (
                    <div className="flex items-baseline gap-2.5 font-mono tabular-nums">
                      <span className="text-2xl font-bold text-[var(--text-primary)]">
                        {activeQuote.currency} {activeQuote.price.toFixed(2)}
                      </span>
                      <span
                        className={`inline-flex items-center gap-0.5 text-sm font-semibold ${
                          isPositive ? 'text-[var(--bull-color)]' : 'text-[var(--bear-color)]'
                        }`}
                      >
                        {isPositive ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                        {isPositive ? '+' : ''}
                        {activeQuote.change.toFixed(2)} ({isPositive ? '+' : ''}
                        {activeQuote.changePercent.toFixed(2)}%)
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Bid/Ask, Pre/Post Market, Day & 52W Range */}
              {activeQuote && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono tabular-nums">
                  <div>
                    <div className="font-sans text-[11px] text-[var(--text-muted)]">Bid / Ask</div>
                    <div className="mt-0.5 font-semibold">
                      {activeQuote.bid.toFixed(2)} × {activeQuote.ask.toFixed(2)}
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)]">
                      Size {activeQuote.bidSize} / {activeQuote.askSize}
                    </div>
                  </div>

                  <div>
                    <div className="font-sans text-[11px] text-[var(--text-muted)]">Volume / Avg</div>
                    <div className="mt-0.5 font-semibold">{(activeQuote.volume / 1e6).toFixed(2)}M</div>
                    <div className="text-[11px] text-[var(--text-muted)]">
                      Avg {(activeQuote.avgVolume / 1e6).toFixed(1)}M
                    </div>
                  </div>

                  <div>
                    <div className="font-sans text-[11px] text-[var(--text-muted)]">Day Range</div>
                    <div className="mt-0.5 flex justify-between text-[11px]">
                      <span>{activeQuote.dayLow.toFixed(2)}</span>
                      <span>{activeQuote.dayHigh.toFixed(2)}</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full rounded bg-slate-200 dark:bg-slate-800 relative">
                      <div
                        className="absolute top-0 h-1.5 w-2 rounded bg-sky-500 -translate-x-1/2"
                        style={{ left: `${rangePct(activeQuote.price, activeQuote.dayLow, activeQuote.dayHigh)}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="font-sans text-[11px] text-[var(--text-muted)]">Pre / After-Hours</div>
                    <div className="mt-0.5 text-[11px]">
                      Pre:{' '}
                      <strong>
                        {activeQuote.preMarketPrice?.toFixed(2) ?? '—'} (
                        {activeQuote.preMarketChangePercent !== null
                          ? `${activeQuote.preMarketChangePercent >= 0 ? '+' : ''}${activeQuote.preMarketChangePercent.toFixed(2)}%`
                          : '—'}
                        )
                      </strong>
                    </div>
                    <div className="text-[11px]">
                      Post:{' '}
                      <strong>
                        {activeQuote.postMarketPrice?.toFixed(2) ?? '—'} (
                        {activeQuote.postMarketChangePercent !== null
                          ? `${activeQuote.postMarketChangePercent >= 0 ? '+' : ''}${activeQuote.postMarketChangePercent.toFixed(2)}%`
                          : '—'}
                        )
                      </strong>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Active Workspace View */}
          {view === 'charting' && (
            <ErrorBoundary panelName="Technical Charting">
              <TechnicalWorkspace
                symbol={activeSymbol}
                quote={activeQuote}
                bars={activeBars}
                timeframe={timeframe}
                onTimeframeChange={setTimeframe}
                quotes={quotes}
                prediction={prediction}
                darkMode={darkMode}
                highContrast={highContrast}
                loadingBars={loadingBars}
                onSelectSymbol={handleSelectSymbol}
              />
            </ErrorBoundary>
          )}

          {view === 'markets' && (
            <ErrorBoundary panelName="Market Overview & Macro">
              <MarketOverviewPanel
                overview={overview}
                futuresData={futuresData}
                macroData={macroData}
                correlationData={correlationData}
                rotationData={rotationData}
                calendarEvents={calendarEvents}
                loading={loadingOverview}
                initialTab={marketsTab}
                onTabChange={setMarketsTab}
                onRefresh={fetchOverview}
                onSelectSymbol={(s) => {
                  handleSelectSymbol(s);
                  setView('charting');
                }}
              />
            </ErrorBoundary>
          )}

          {view === 'quant' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-3.5 py-2.5">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setQuantMode('lab')}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                      quantMode === 'lab'
                        ? 'bg-sky-600 text-white'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    Quant Lab (Options · Alt Data · Dark Pool · PEAD · Builder)
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuantMode('ml')}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                      quantMode === 'ml'
                        ? 'bg-sky-600 text-white'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    ML Ensemble Predictions &amp; Patterns
                  </button>
                </div>
                <span className="text-xs font-mono text-[var(--text-muted)]">
                  Active Ticker: {activeSymbol}
                </span>
              </div>

              {quantMode === 'lab' ? (
                <ErrorBoundary panelName="Quant Lab">
                  <QuantLabPanel
                    symbol={activeSymbol}
                    quote={activeQuote}
                    bars={activeBars}
                    initialTab={quantTab}
                    onTabChange={setQuantTab}
                    altData={altData}
                    loadingAltData={loadingFundamentals}
                    whales={whales}
                    institutions={fundamentals?.institutions ?? []}
                    onSelectSymbol={(s) => {
                      handleSelectSymbol(s);
                      setView('charting');
                    }}
                  />
                </ErrorBoundary>
              ) : (
                <ErrorBoundary panelName="ML Predictions">
                  <PredictionPanel prediction={prediction} currency={activeQuote?.currency ?? 'USD'} />
                </ErrorBoundary>
              )}
            </div>
          )}

          {view === 'portfolio' && (
            <ErrorBoundary panelName="Portfolio & Risk">
              <PortfolioRiskPanel
                positions={positions}
                transactions={transactions}
                quotes={quotes}
                historicalSeries={barsBySymbol}
                activeSymbol={activeSymbol}
                activeBars={activeBars}
                journalEntries={journalEntries}
                initialTab={portfolioTab}
                onTabChange={setPortfolioTab}
                onTrade={handleTrade}
                onRemovePosition={handleRemovePosition}
                onSelectSymbol={(s) => {
                  handleSelectSymbol(s);
                  setView('charting');
                }}
                onAddJournalEntry={handleAddJournalEntry}
                onUpdateJournalEntry={handleUpdateJournalEntry}
                onDeleteJournalEntry={handleDeleteJournalEntry}
              />
            </ErrorBoundary>
          )}

          {view === 'research' && (
            <div className="space-y-6">
              <ErrorBoundary panelName="Screener & Alerts">
                <ScreenerAlertsPanel
                  screenerRows={screenerRows}
                  loadingScreener={loadingScreener}
                  onRefreshScreener={fetchScreener}
                  onSelectSymbol={(s) => {
                    handleSelectSymbol(s);
                    setView('charting');
                  }}
                  alerts={alerts}
                  onCreateAlert={handleCreateAlert}
                  onDeleteAlert={handleDeleteAlert}
                  activeSymbol={activeSymbol}
                  activePrice={activeQuote?.price ?? 150}
                />
              </ErrorBoundary>
              <ErrorBoundary panelName="News, Fundamentals & Social Sentiment">
                <NewsFundamentalsPanel
                  symbol={activeSymbol}
                  news={news}
                  fundamentals={fundamentals}
                  socialData={socialData}
                  whales={whales}
                  traders={copyTraders}
                  predictions={communityPreds}
                  loading={loadingFundamentals}
                  initialTab={researchTab}
                  onTabChange={setResearchTab}
                  onSelectSymbol={(s) => {
                    handleSelectSymbol(s);
                    setView('charting');
                  }}
                />
              </ErrorBoundary>
            </div>
          )}

          {view === 'ai' && (
            <ErrorBoundary panelName="AI Quantitative Assistant">
              <AiAssistantPanel
                symbol={activeSymbol}
                quote={activeQuote}
                prediction={prediction}
                fundamentals={fundamentals}
                news={news}
              />
            </ErrorBoundary>
          )}
        </main>
      </div>

      {/* Keyboard Shortcuts Modal */}
      {showShortcuts && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="shortcuts-title"
          onClick={() => setShowShortcuts(false)}
        >
          <div
            className="w-full max-w-2xl rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-5 shadow-xl max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-hairline)]">
              <h3 id="shortcuts-title" className="text-sm font-semibold flex items-center gap-2">
                <Activity className="w-4 h-4 text-sky-500" />
                Vim Navigation &amp; Power-User Shortcuts
              </h3>
              <button type="button" onClick={() => setShowShortcuts(false)} aria-label="Close shortcuts">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
              <div className="space-y-2">
                <div className="font-semibold text-[var(--text-primary)] pb-1 border-b border-[var(--border-hairline)]">
                  Vim Panel &amp; Cursor Motion
                </div>
                {[
                  { key: 'j / k', desc: 'Move down / up across rows & items' },
                  { key: 'h / l', desc: 'Cycle panel sub-tabs (or timeframe)' },
                  { key: '[ / ]', desc: 'Cycle primary workspace views' },
                  { key: 'Ctrl+h / Ctrl+l', desc: 'Switch focus: Watchlist ↔ Active Panel' },
                  { key: 'Enter / o', desc: 'Activate highlighted row or control' },
                  { key: 'gg / G', desc: 'Jump to top / bottom of active panel' },
                  { key: 'Ctrl+d / Ctrl+u', desc: 'Half-page scroll down / up' },
                  { key: '/', desc: 'Focus inline symbol search' },
                  { key: '1 – 8', desc: 'Switch chart timeframe (1m to 1M)' },
                ].map((s) => (
                  <div key={s.key} className="flex items-center justify-between gap-2 py-0.5">
                    <span className="text-[var(--text-muted)]">{s.desc}</span>
                    <kbd className="rounded border border-[var(--border-hairline)] bg-[var(--surface-subtle)] px-2 py-0.5 font-mono text-[11px] shrink-0">
                      {s.key}
                    </kbd>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <div className="font-semibold text-[var(--text-primary)] pb-1 border-b border-[var(--border-hairline)]">
                  Command Palette &amp; Go-To Chords
                </div>
                {[
                  { key: 'Cmd+K / Ctrl+K', desc: 'Open Command Palette' },
                  { key: 'g c', desc: 'Go to Technical Charting' },
                  { key: 'g m', desc: 'Go to Markets & Breadth' },
                  { key: 'g f', desc: 'Go to Futures & Term Structure' },
                  { key: 'g i', desc: 'Go to Macro Regime & Intermarket' },
                  { key: 'g r', desc: 'Go to Sector Rotation & RS Matrix' },
                  { key: 'g o', desc: 'Go to Options, IV Surface & Flow Heatmap' },
                  { key: 'g d', desc: 'Go to Dark Pool, Short Interest & 13F' },
                  { key: 'g e', desc: 'Go to Earnings PEAD & Guidance' },
                  { key: 'g p / g b', desc: 'Go to Portfolio / Backtest Lab' },
                  { key: 'g s / g a', desc: 'Go to Screener / AI Analyst' },
                  { key: 'Ctrl+Shift+T / H', desc: 'Toggle Theme / High-Contrast Mode' },
                  { key: 'Esc', desc: 'Close modal or clear Vim selection' },
                ].map((s) => (
                  <div key={s.key} className="flex items-center justify-between gap-2 py-0.5">
                    <span className="text-[var(--text-muted)]">{s.desc}</span>
                    <kbd className="rounded border border-[var(--border-hairline)] bg-[var(--surface-subtle)] px-2 py-0.5 font-mono text-[11px] shrink-0">
                      {s.key}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <CommandPalette
        open={commandOpen}
        onClose={() => setCommandOpen(false)}
        onSelectSymbol={handleSelectSymbol}
        onNavigate={handleCommandNavigate}
        onToggleTheme={() => setDarkMode((d) => !d)}
        onToggleContrast={() => setHighContrast((c) => !c)}
        onReconnectWs={reconnectSocket}
        onShowShortcuts={() => setShowShortcuts(true)}
      />

      <OfflineIndicator />
    </div>
  );
}
