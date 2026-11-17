import React from 'react';
import { Activity, AlertCircle, ArrowDownRight, ArrowUpRight, Compass, Cpu, Minus } from 'lucide-react';
import type { PredictionSuite } from '../types/market';

interface PredictionPanelProps {
  prediction: PredictionSuite;
  currency: string;
}

export const PredictionPanel: React.FC<PredictionPanelProps> = ({ prediction, currency }) => {
  if (prediction.horizons.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6 text-center text-sm text-slate-500">
        Insufficient OHLCV history to compute ensemble forecasts. Select a standard timeframe with at least 20 bars.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Multi-Horizon Ensemble Predictions */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-sky-500" aria-hidden="true" />
              Ensemble Price Direction &amp; Confidence Ranges — {prediction.symbol}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Weighted blend: Momentum Regression (35%) · Holt Exponential Smoothing (30%) · Mean-Reversion Oscillator (20%) · Volatility Regime (15%)
            </p>
          </div>
          <div className="text-xs font-mono text-slate-600 dark:text-slate-300 tabular-nums">
            News Sentiment Score: {prediction.newsSentimentAvg >= 0 ? '+' : ''}
            {prediction.newsSentimentAvg.toFixed(2)}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {prediction.horizons.map((h) => {
            const isBull = h.direction === 'Bullish';
            const isBear = h.direction === 'Bearish';
            return (
              <div
                key={h.horizon}
                className="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#182235]/60 p-3.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-semibold uppercase text-slate-500 dark:text-slate-400">
                    Horizon {h.horizon}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-semibold ${
                      isBull
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : isBear
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {isBull ? <ArrowUpRight className="w-3.5 h-3.5" /> : isBear ? <ArrowDownRight className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
                    {h.direction} · {h.probability}%
                  </span>
                </div>

                <div className="mt-2 flex items-baseline justify-between">
                  <div className="text-lg font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100">
                    {currency} {h.targetBase.toFixed(2)}
                  </div>
                  <div
                    className={`text-xs font-mono tabular-nums ${
                      h.expectedReturnPct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {h.expectedReturnPct >= 0 ? '+' : ''}
                    {h.expectedReturnPct.toFixed(2)}%
                  </div>
                </div>

                <div className="mt-2.5 pt-2 border-t border-slate-200 dark:border-slate-700/70 flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  <span>80% CI Low: {h.targetLow.toFixed(2)}</span>
                  <span>High: {h.targetHigh.toFixed(2)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Pattern Recognition & Anomaly Detection */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Compass className="w-4 h-4 text-sky-500" aria-hidden="true" />
              Automated Chart Pattern Recognition
            </h3>
            <span className="text-xs text-slate-500 dark:text-slate-400">{prediction.patterns.length} detected</span>
          </div>

          {prediction.patterns.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-6 text-center">
              No classical reversal or continuation patterns triggered within active lookback pivots.
            </p>
          ) : (
            <div className="space-y-2.5">
              {prediction.patterns.map((p, idx) => (
                <div
                  key={`${p.name}-${idx}`}
                  className="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-[#182235]/50 p-3"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{p.name}</span>
                    <span
                      className={`font-mono font-medium ${
                        p.bias === 'Bullish'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : p.bias === 'Bearish'
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-slate-500'
                      }`}
                    >
                      {p.bias} · {p.confidence}% confidence · Target {p.targetPrice.toFixed(2)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{p.description}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500" aria-hidden="true" />
              Volume &amp; Price Action Anomaly Detection
            </h3>
            <span className="text-xs text-slate-500 dark:text-slate-400">Z-score threshold &gt; 2.2σ</span>
          </div>

          {prediction.anomalies.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400 flex flex-col items-center gap-1.5">
              <Activity className="w-5 h-5 text-slate-400" aria-hidden="true" />
              Price and volume dispersion remain within normal 2.2σ statistical bounds.
            </div>
          ) : (
            <div className="space-y-2">
              {prediction.anomalies.map((a, idx) => (
                <div
                  key={`${a.time}-${idx}`}
                  className="flex items-start justify-between gap-3 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-[#182235]/50 p-3 text-xs"
                >
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      {a.type} · <span className={a.severity === 'High' ? 'text-red-500' : 'text-amber-500'}>{a.severity} Severity</span>
                    </div>
                    <p className="mt-0.5 text-slate-600 dark:text-slate-400">{a.detail}</p>
                  </div>
                  <div className="text-right font-mono text-[11px] text-slate-500 dark:text-slate-400 shrink-0 tabular-nums">
                    <div>{a.zScore}σ</div>
                    <div>{new Date(a.time * 1000).toLocaleDateString()}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
