import React, { useMemo, useState } from 'react';
import { Bell, BellRing, FileSpreadsheet, Filter, Mail, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { exportGenericCSV } from '../lib/exportUtils';
import type { ExchangeCode, ScreenerRow, SmartAlert } from '../types/market';

interface ScreenerAlertsPanelProps {
  screenerRows: ScreenerRow[];
  loadingScreener: boolean;
  onRefreshScreener: () => void;
  onSelectSymbol: (symbol: string) => void;
  alerts: SmartAlert[];
  onCreateAlert: (alert: SmartAlert) => void;
  onDeleteAlert: (id: string) => void;
  activeSymbol: string;
  activePrice: number;
}

type PresetScreen = 'all' | 'momentum' | 'value' | 'growth' | 'breakout' | 'oversold' | 'overbought';

function evaluateCustomFormula(row: ScreenerRow, formula: string): boolean {
  const f = formula.trim();
  if (!f) return true;
  try {
    const fn = new Function(
      'price',
      'changePercent',
      'volume',
      'volumeRatio',
      'marketCapB',
      'pe',
      'rsi14',
      'sma50DistPct',
      'sma200DistPct',
      'macdHist',
      `return Boolean(${f});`
    );
    return Boolean(
      fn(
        row.price,
        row.changePercent,
        row.volume,
        row.volumeRatio,
        row.marketCapB,
        row.peRatio,
        row.rsi14,
        row.sma50DistPct,
        row.sma200DistPct,
        row.macdHist
      )
    );
  } catch {
    return true;
  }
}

export const ScreenerAlertsPanel: React.FC<ScreenerAlertsPanelProps> = ({
  screenerRows,
  loadingScreener,
  onRefreshScreener,
  onSelectSymbol,
  alerts,
  onCreateAlert,
  onDeleteAlert,
  activeSymbol,
  activePrice,
}) => {
  const [preset, setPreset] = useState<PresetScreen>('all');
  const [exchange, setExchange] = useState<'ALL' | ExchangeCode>('ALL');
  const [customFormula, setCustomFormula] = useState('');
  const [maxPE, setMaxPE] = useState('');

  // Alert creation form
  const [alertSymbol, setAlertSymbol] = useState(activeSymbol);
  const [conditionType, setConditionType] = useState<SmartAlert['conditionType']>('PRICE_ABOVE');
  const [threshold, setThreshold] = useState(String(Number((activePrice * 1.02).toFixed(2))));
  const [pushEnabled, setPushEnabled] = useState(false);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [emailAddr, setEmailAddr] = useState('');
  const [pushStatus, setPushStatus] = useState<string>('');

  const filteredRows = useMemo(() => {
    return screenerRows.filter((row) => {
      if (exchange !== 'ALL' && row.exchange !== exchange) return false;
      if (maxPE && row.peRatio > Number(maxPE)) return false;

      if (preset === 'momentum' && !(row.sma50DistPct > 0 && row.macdHist > 0)) return false;
      if (preset === 'value' && !(row.peRatio <= 24)) return false;
      if (preset === 'growth' && !(row.peRatio > 25 && row.marketCapB >= 150)) return false;
      if (preset === 'breakout' && !(row.volumeRatio >= 1.35 && row.changePercent > 0)) return false;
      if (preset === 'oversold' && !(row.rsi14 <= 38)) return false;
      if (preset === 'overbought' && !(row.rsi14 >= 68)) return false;

      if (customFormula.trim() && !evaluateCustomFormula(row, customFormula)) return false;
      return true;
    });
  }, [screenerRows, exchange, maxPE, preset, customFormula]);

  const handleToggleBrowserPush = async (checked: boolean) => {
    if (!checked) {
      setPushEnabled(false);
      return;
    }
    if (typeof Notification === 'undefined') {
      setPushStatus('Browser notifications not supported.');
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      setPushEnabled(true);
      setPushStatus('Browser push notifications enabled.');
    } else {
      setPushEnabled(false);
      setPushStatus('Notification permission denied by browser.');
    }
  };

  const handleAddAlert = (e: React.FormEvent) => {
    e.preventDefault();
    const sym = alertSymbol.toUpperCase().trim();
    if (!sym) return;
    onCreateAlert({
      id: `alt-${Date.now()}`,
      symbol: sym,
      conditionType,
      threshold: Number(threshold) || activePrice,
      channels: {
        inApp: true,
        browserPush: pushEnabled,
        email: emailEnabled,
      },
      emailAddress: emailEnabled ? emailAddr : undefined,
      active: true,
      triggeredAt: null,
      createdAt: Date.now(),
    });
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      {/* Screener Table */}
      <div className="xl:col-span-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Filter className="w-4 h-4 text-sky-500" aria-hidden="true" />
                Multi-Exchange Technical &amp; Fundamental Screener
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {filteredRows.length} matches across NYSE, NASDAQ, NSE, BSE
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onRefreshScreener}
                className="inline-flex items-center gap-1 rounded border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingScreener ? 'animate-spin' : ''}`} />
                Scan
              </button>
              <button
                type="button"
                onClick={() =>
                  exportGenericCSV(
                    `Meridian_Screener_${new Date().toISOString().slice(0, 10)}.csv`,
                    ['Symbol', 'Exchange', 'Price', 'Change%', 'P/E', 'RSI14', 'VolRatio', 'SMA50Dist%', 'Signal'],
                    filteredRows.map((r) => [
                      r.symbol,
                      r.exchange,
                      r.price,
                      r.changePercent,
                      r.peRatio,
                      r.rsi14,
                      r.volumeRatio,
                      r.sma50DistPct,
                      r.signal,
                    ])
                  )
                }
                className="inline-flex items-center gap-1 rounded border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                CSV
              </button>
            </div>
          </div>

          {/* Pre-built Screen Tabs */}
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'all', label: 'All Equities' },
                { id: 'momentum', label: 'Momentum' },
                { id: 'value', label: 'Value (P/E ≤ 24)' },
                { id: 'growth', label: 'Large Growth' },
                { id: 'breakout', label: 'Volume Breakout' },
                { id: 'oversold', label: 'Oversold (RSI ≤ 38)' },
                { id: 'overbought', label: 'Overbought (RSI ≥ 68)' },
              ] as const
            ).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setPreset(s.id)}
                className={`px-2.5 py-1 text-xs rounded transition-colors whitespace-nowrap shrink-0 ${
                  preset === s.id
                    ? 'bg-sky-600 text-white font-medium'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Exchange + Max P/E + Custom Formula */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <select
              aria-label="Filter by exchange"
              value={exchange}
              onChange={(e) => setExchange(e.target.value as 'ALL' | ExchangeCode)}
              className="rounded border border-slate-300 dark:border-slate-700 bg-transparent px-2.5 py-1.5 text-xs"
            >
              <option value="ALL" className="bg-white dark:bg-slate-900">All Exchanges</option>
              <option value="NASDAQ" className="bg-white dark:bg-slate-900">NASDAQ</option>
              <option value="NYSE" className="bg-white dark:bg-slate-900">NYSE</option>
              <option value="NSE" className="bg-white dark:bg-slate-900">NSE (India)</option>
              <option value="BSE" className="bg-white dark:bg-slate-900">BSE (India)</option>
            </select>
            <input
              type="number"
              placeholder="Max P/E (e.g. 30)"
              value={maxPE}
              onChange={(e) => setMaxPE(e.target.value)}
              className="rounded border border-slate-300 dark:border-slate-700 bg-transparent px-2.5 py-1.5 text-xs font-mono focus:border-sky-500 focus:outline-none"
            />
            <input
              type="text"
              placeholder="Custom formula: rsi14 < 45 && pe < 35"
              value={customFormula}
              onChange={(e) => setCustomFormula(e.target.value)}
              className="sm:col-span-2 rounded border border-slate-300 dark:border-slate-700 bg-transparent px-2.5 py-1.5 text-xs font-mono focus:border-sky-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="overflow-x-auto max-h-[460px]">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#182235] text-slate-500 dark:text-slate-400">
              <tr>
                <th className="py-2.5 px-3 font-medium">Ticker</th>
                <th className="py-2.5 px-3 font-medium">Exch</th>
                <th className="py-2.5 px-3 font-medium text-right">Price</th>
                <th className="py-2.5 px-3 font-medium text-right">Chg%</th>
                <th className="py-2.5 px-3 font-medium text-right">P/E</th>
                <th className="py-2.5 px-3 font-medium text-right">RSI(14)</th>
                <th className="py-2.5 px-3 font-medium text-right">Vol Ratio</th>
                <th className="py-2.5 px-3 font-medium text-right">Signal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">
                    No equities match the active screener filters.
                  </td>
                </tr>
              ) : (
                filteredRows.map((r) => (
                  <tr key={r.symbol} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-2 px-3">
                      <button
                        type="button"
                        onClick={() => onSelectSymbol(r.symbol)}
                        className="font-mono font-semibold text-sky-600 dark:text-sky-400 hover:underline"
                      >
                        {r.symbol}
                      </button>
                      <div className="text-[11px] text-slate-500 truncate max-w-[140px]">{r.name}</div>
                    </td>
                    <td className="py-2 px-3 font-mono text-slate-500">{r.exchange}</td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums">{r.price.toFixed(2)}</td>
                    <td
                      className={`py-2 px-3 text-right font-mono tabular-nums ${
                        r.changePercent >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {r.changePercent >= 0 ? '+' : ''}
                      {r.changePercent.toFixed(2)}%
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums">{r.peRatio.toFixed(1)}</td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums">{r.rsi14.toFixed(1)}</td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums">{r.volumeRatio.toFixed(2)}x</td>
                    <td
                      className={`py-2 px-3 text-right font-medium ${
                        r.signal.includes('Buy')
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : r.signal.includes('Sell')
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-slate-500'
                      }`}
                    >
                      {r.signal}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Smart Alerts Manager */}
      <div
        id="smart-alerts-panel"
        tabIndex={-1}
        className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4 space-y-4 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
      >
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <BellRing className="w-4 h-4 text-sky-500" aria-hidden="true" />
            Smart Alert Engine
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Real-time WebSocket evaluation across price, RSI, volume spikes, and news sentiment
          </p>
        </div>

        <form onSubmit={handleAddAlert} className="space-y-3 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Ticker</label>
              <input
                type="text"
                value={alertSymbol}
                onChange={(e) => setAlertSymbol(e.target.value.toUpperCase())}
                className="w-full rounded border border-slate-300 dark:border-slate-700 bg-transparent px-2.5 py-1.5 text-xs font-mono uppercase"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Threshold</label>
              <input
                type="number"
                step="any"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                className="w-full rounded border border-slate-300 dark:border-slate-700 bg-transparent px-2.5 py-1.5 text-xs font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-slate-500 mb-1">Trigger Condition</label>
            <select
              aria-label="Alert trigger condition"
              value={conditionType}
              onChange={(e) => setConditionType(e.target.value as SmartAlert['conditionType'])}
              className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs"
            >
              <option value="PRICE_ABOVE">Price Crosses Above</option>
              <option value="PRICE_BELOW">Price Crosses Below</option>
              <option value="RSI_OVERBOUGHT">RSI (14) Overbought (&gt;= Threshold)</option>
              <option value="RSI_OVERSOLD">RSI (14) Oversold (&lt;= Threshold)</option>
              <option value="VOLUME_SPIKE">Volume Spike (x Avg Volume)</option>
              <option value="NEWS_SENTIMENT">News Sentiment Polarity Shift</option>
            </select>
          </div>

          <div className="space-y-1.5 text-xs">
            <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked readOnly className="accent-sky-500" />
              <span>In-App Real-Time Alert Feed</span>
            </label>
            <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={pushEnabled}
                onChange={(e) => handleToggleBrowserPush(e.target.checked)}
                className="accent-sky-500"
              />
              <span>Browser Push Notification</span>
            </label>
            <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={emailEnabled}
                onChange={(e) => setEmailEnabled(e.target.checked)}
                className="accent-sky-500"
              />
              <span className="inline-flex items-center gap-1">
                <Mail className="w-3 h-3" /> Email Dispatch Log
              </span>
            </label>
            {emailEnabled && (
              <input
                type="email"
                placeholder="desk@example.com"
                value={emailAddr}
                onChange={(e) => setEmailAddr(e.target.value)}
                className="w-full rounded border border-slate-300 dark:border-slate-700 bg-transparent px-2.5 py-1.5 text-xs"
              />
            )}
            {pushStatus && <p className="text-[11px] text-sky-500">{pushStatus}</p>}
          </div>

          <button
            type="submit"
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-md bg-sky-600 hover:bg-sky-700 py-2 text-xs font-semibold text-white transition-colors"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            Create Smart Alert
          </button>
        </form>

        {/* Active Alerts List */}
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {alerts.length === 0 ? (
            <div className="py-4 text-center text-xs text-slate-500 flex flex-col items-center gap-1">
              <Bell className="w-4 h-4 text-slate-400" />
              No alerts configured yet.
            </div>
          ) : (
            alerts.map((a) => (
              <div
                key={a.id}
                className="flex items-start justify-between gap-2 rounded border border-slate-200 dark:border-slate-800 p-2.5 text-xs"
              >
                <div>
                  <div className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                    {a.symbol} · {a.conditionType.replace('_', ' ')} ({a.threshold})
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {a.triggeredAt ? (
                      <span className="text-amber-500 font-medium">
                        Triggered {new Date(a.triggeredAt).toLocaleTimeString()} — {a.lastMessage}
                      </span>
                    ) : (
                      <span>
                        Watching · {[a.channels.inApp && 'In-App', a.channels.browserPush && 'Push', a.channels.email && 'Email'].filter(Boolean).join(' / ')}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onDeleteAlert(a.id)}
                  aria-label="Delete alert"
                  className="text-slate-400 hover:text-red-500 p-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
