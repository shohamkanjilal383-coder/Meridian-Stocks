import type { OHLCVBar } from '../types/market';

export interface TimeValue {
  time: number;
  value: number;
}

export interface BollingerOutput {
  upper: TimeValue[];
  middle: TimeValue[];
  lower: TimeValue[];
}

export interface MACDOutput {
  macd: TimeValue[];
  signal: TimeValue[];
  histogram: { time: number; value: number; color: string }[];
}

export interface StochasticOutput {
  k: TimeValue[];
  d: TimeValue[];
}

export interface ADXOutput {
  adx: TimeValue[];
  plusDI: TimeValue[];
  minusDI: TimeValue[];
}

export interface IchimokuOutput {
  tenkan: TimeValue[];
  kijun: TimeValue[];
  senkouA: TimeValue[];
  senkouB: TimeValue[];
  chikou: TimeValue[];
}

export interface PivotLevels {
  pivot: number;
  r1: number;
  r2: number;
  r3: number;
  s1: number;
  s2: number;
  s3: number;
}

export interface FibLevels {
  high: number;
  low: number;
  levels: { ratio: number; label: string; price: number }[];
}

export function toHeikinAshi(bars: OHLCVBar[]): OHLCVBar[] {
  if (bars.length === 0) return [];
  const res: OHLCVBar[] = [];
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const haClose = (b.open + b.high + b.low + b.close) / 4;
    const haOpen = i === 0 ? (b.open + b.close) / 2 : (res[i - 1].open + res[i - 1].close) / 2;
    const haHigh = Math.max(b.high, haOpen, haClose);
    const haLow = Math.min(b.low, haOpen, haClose);
    res.push({
      time: b.time,
      open: Number(haOpen.toFixed(4)),
      high: Number(haHigh.toFixed(4)),
      low: Number(haLow.toFixed(4)),
      close: Number(haClose.toFixed(4)),
      volume: b.volume,
    });
  }
  return res;
}

export function calcSMA(bars: OHLCVBar[], period: number): TimeValue[] {
  const out: TimeValue[] = [];
  let sum = 0;
  for (let i = 0; i < bars.length; i++) {
    sum += bars[i].close;
    if (i >= period) sum -= bars[i - period].close;
    if (i >= period - 1) {
      out.push({ time: bars[i].time, value: Number((sum / period).toFixed(4)) });
    }
  }
  return out;
}

export function calcEMA(bars: OHLCVBar[], period: number): TimeValue[] {
  if (bars.length < period) return [];
  const out: TimeValue[] = [];
  const k = 2 / (period + 1);
  let ema = bars.slice(0, period).reduce((acc, b) => acc + b.close, 0) / period;
  out.push({ time: bars[period - 1].time, value: Number(ema.toFixed(4)) });
  for (let i = period; i < bars.length; i++) {
    ema = bars[i].close * k + ema * (1 - k);
    out.push({ time: bars[i].time, value: Number(ema.toFixed(4)) });
  }
  return out;
}

export function calcWMA(bars: OHLCVBar[], period: number): TimeValue[] {
  const out: TimeValue[] = [];
  const denom = (period * (period + 1)) / 2;
  for (let i = period - 1; i < bars.length; i++) {
    let weighted = 0;
    for (let j = 0; j < period; j++) {
      weighted += bars[i - period + 1 + j].close * (j + 1);
    }
    out.push({ time: bars[i].time, value: Number((weighted / denom).toFixed(4)) });
  }
  return out;
}

export function calcVWAP(bars: OHLCVBar[]): TimeValue[] {
  const out: TimeValue[] = [];
  let cumPV = 0;
  let cumVol = 0;
  for (const b of bars) {
    const typical = (b.high + b.low + b.close) / 3;
    const vol = Math.max(b.volume, 1);
    cumPV += typical * vol;
    cumVol += vol;
    out.push({ time: b.time, value: Number((cumPV / cumVol).toFixed(4)) });
  }
  return out;
}

export function calcBollinger(bars: OHLCVBar[], period = 20, mult = 2): BollingerOutput {
  const upper: TimeValue[] = [];
  const middle: TimeValue[] = [];
  const lower: TimeValue[] = [];
  for (let i = period - 1; i < bars.length; i++) {
    const slice = bars.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b.close, 0) / period;
    const variance = slice.reduce((a, b) => a + (b.close - mean) ** 2, 0) / period;
    const sd = Math.sqrt(variance);
    middle.push({ time: bars[i].time, value: Number(mean.toFixed(4)) });
    upper.push({ time: bars[i].time, value: Number((mean + mult * sd).toFixed(4)) });
    lower.push({ time: bars[i].time, value: Number((mean - mult * sd).toFixed(4)) });
  }
  return { upper, middle, lower };
}

export function calcATR(bars: OHLCVBar[], period = 14): TimeValue[] {
  if (bars.length < period + 1) return [];
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const h = bars[i].high;
    const l = bars[i].low;
    const pc = bars[i - 1].close;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  const out: TimeValue[] = [];
  let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out.push({ time: bars[period].time, value: Number(atr.toFixed(4)) });
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
    out.push({ time: bars[i + 1].time, value: Number(atr.toFixed(4)) });
  }
  return out;
}

export function calcKeltner(bars: OHLCVBar[], period = 20, mult = 2): BollingerOutput {
  const ema = calcEMA(bars, period);
  const atr = calcATR(bars, period);
  const atrMap = new Map(atr.map((a) => [a.time, a.value]));
  const upper: TimeValue[] = [];
  const middle: TimeValue[] = [];
  const lower: TimeValue[] = [];
  for (const pt of ema) {
    const a = atrMap.get(pt.time);
    if (a !== undefined) {
      middle.push(pt);
      upper.push({ time: pt.time, value: Number((pt.value + mult * a).toFixed(4)) });
      lower.push({ time: pt.time, value: Number((pt.value - mult * a).toFixed(4)) });
    }
  }
  return { upper, middle, lower };
}

export function calcDonchian(bars: OHLCVBar[], period = 20): BollingerOutput {
  const upper: TimeValue[] = [];
  const middle: TimeValue[] = [];
  const lower: TimeValue[] = [];
  for (let i = period - 1; i < bars.length; i++) {
    const slice = bars.slice(i - period + 1, i + 1);
    const hi = Math.max(...slice.map((b) => b.high));
    const lo = Math.min(...slice.map((b) => b.low));
    upper.push({ time: bars[i].time, value: Number(hi.toFixed(4)) });
    lower.push({ time: bars[i].time, value: Number(lo.toFixed(4)) });
    middle.push({ time: bars[i].time, value: Number(((hi + lo) / 2).toFixed(4)) });
  }
  return { upper, middle, lower };
}

export function calcIchimoku(bars: OHLCVBar[]): IchimokuOutput {
  const midHL = (idx: number, period: number) => {
    const slice = bars.slice(Math.max(0, idx - period + 1), idx + 1);
    const hi = Math.max(...slice.map((b) => b.high));
    const lo = Math.min(...slice.map((b) => b.low));
    return (hi + lo) / 2;
  };
  const tenkan: TimeValue[] = [];
  const kijun: TimeValue[] = [];
  const senkouA: TimeValue[] = [];
  const senkouB: TimeValue[] = [];
  const chikou: TimeValue[] = [];

  for (let i = 0; i < bars.length; i++) {
    if (i >= 8) tenkan.push({ time: bars[i].time, value: Number(midHL(i, 9).toFixed(4)) });
    if (i >= 25) {
      const tVal = midHL(i, 9);
      const kVal = midHL(i, 26);
      kijun.push({ time: bars[i].time, value: Number(kVal.toFixed(4)) });
      senkouA.push({ time: bars[i].time, value: Number(((tVal + kVal) / 2).toFixed(4)) });
    }
    if (i >= 51) {
      senkouB.push({ time: bars[i].time, value: Number(midHL(i, 52).toFixed(4)) });
    }
    if (i + 26 < bars.length) {
      chikou.push({ time: bars[i].time, value: Number(bars[i + 26].close.toFixed(4)) });
    }
  }
  return { tenkan, kijun, senkouA, senkouB, chikou };
}

export function calcParabolicSAR(bars: OHLCVBar[], step = 0.02, maxStep = 0.2): TimeValue[] {
  if (bars.length < 3) return [];
  const out: TimeValue[] = [];
  let isLong = bars[1].close >= bars[0].close;
  let af = step;
  let ep = isLong ? bars[0].high : bars[0].low;
  let sar = isLong ? bars[0].low : bars[0].high;

  for (let i = 1; i < bars.length; i++) {
    const b = bars[i];
    sar = sar + af * (ep - sar);
    if (isLong) {
      if (b.low < sar) {
        isLong = false;
        sar = ep;
        ep = b.low;
        af = step;
      } else {
        if (b.high > ep) {
          ep = b.high;
          af = Math.min(maxStep, af + step);
        }
      }
    } else {
      if (b.high > sar) {
        isLong = true;
        sar = ep;
        ep = b.high;
        af = step;
      } else {
        if (b.low < ep) {
          ep = b.low;
          af = Math.min(maxStep, af + step);
        }
      }
    }
    out.push({ time: b.time, value: Number(sar.toFixed(4)) });
  }
  return out;
}

export function calcSuperTrend(bars: OHLCVBar[], period = 10, mult = 3): TimeValue[] {
  const atr = calcATR(bars, period);
  const atrMap = new Map(atr.map((a) => [a.time, a.value]));
  const out: TimeValue[] = [];
  let upperBand = 0;
  let lowerBand = 0;
  let trendUp = true;

  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const a = atrMap.get(b.time);
    if (a === undefined) continue;
    const hl2 = (b.high + b.low) / 2;
    const basicUpper = hl2 + mult * a;
    const basicLower = hl2 - mult * a;
    upperBand = upperBand === 0 || basicUpper < upperBand || bars[i - 1].close > upperBand ? basicUpper : upperBand;
    lowerBand = lowerBand === 0 || basicLower > lowerBand || bars[i - 1].close < lowerBand ? basicLower : lowerBand;
    if (b.close > upperBand) trendUp = true;
    else if (b.close < lowerBand) trendUp = false;
    out.push({ time: b.time, value: Number((trendUp ? lowerBand : upperBand).toFixed(4)) });
  }
  return out;
}

export function calcRSI(bars: OHLCVBar[], period = 14): TimeValue[] {
  if (bars.length <= period) return [];
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = bars[i].close - bars[i - 1].close;
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  const out: TimeValue[] = [];
  const firstRS = avgLoss === 0 ? 100 : avgGain / avgLoss;
  out.push({ time: bars[period].time, value: Number((100 - 100 / (1 + firstRS)).toFixed(2)) });

  for (let i = period + 1; i < bars.length; i++) {
    const diff = bars[i].close - bars[i - 1].close;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    out.push({ time: bars[i].time, value: Number((100 - 100 / (1 + rs)).toFixed(2)) });
  }
  return out;
}

export function calcMACD(bars: OHLCVBar[], fast = 12, slow = 26, sig = 9): MACDOutput {
  const emaFast = calcEMA(bars, fast);
  const emaSlow = calcEMA(bars, slow);
  const fastMap = new Map(emaFast.map((p) => [p.time, p.value]));
  const macdLine: TimeValue[] = [];

  for (const s of emaSlow) {
    const f = fastMap.get(s.time);
    if (f !== undefined) {
      macdLine.push({ time: s.time, value: Number((f - s.value).toFixed(4)) });
    }
  }
  if (macdLine.length < sig) return { macd: macdLine, signal: [], histogram: [] };

  const k = 2 / (sig + 1);
  let signalVal = macdLine.slice(0, sig).reduce((a, b) => a + b.value, 0) / sig;
  const signal: TimeValue[] = [{ time: macdLine[sig - 1].time, value: Number(signalVal.toFixed(4)) }];
  const histogram: { time: number; value: number; color: string }[] = [];
  const firstHist = macdLine[sig - 1].value - signalVal;
  histogram.push({
    time: macdLine[sig - 1].time,
    value: Number(firstHist.toFixed(4)),
    color: firstHist >= 0 ? 'rgba(34, 197, 94, 0.7)' : 'rgba(239, 68, 68, 0.7)',
  });

  for (let i = sig; i < macdLine.length; i++) {
    signalVal = macdLine[i].value * k + signalVal * (1 - k);
    signal.push({ time: macdLine[i].time, value: Number(signalVal.toFixed(4)) });
    const h = macdLine[i].value - signalVal;
    histogram.push({
      time: macdLine[i].time,
      value: Number(h.toFixed(4)),
      color: h >= 0 ? 'rgba(34, 197, 94, 0.7)' : 'rgba(239, 68, 68, 0.7)',
    });
  }

  return { macd: macdLine, signal, histogram };
}

export function calcStochastic(bars: OHLCVBar[], kPeriod = 14, dPeriod = 3): StochasticOutput {
  const k: TimeValue[] = [];
  for (let i = kPeriod - 1; i < bars.length; i++) {
    const slice = bars.slice(i - kPeriod + 1, i + 1);
    const hi = Math.max(...slice.map((b) => b.high));
    const lo = Math.min(...slice.map((b) => b.low));
    const val = hi === lo ? 50 : ((bars[i].close - lo) / (hi - lo)) * 100;
    k.push({ time: bars[i].time, value: Number(val.toFixed(2)) });
  }
  const d: TimeValue[] = [];
  for (let i = dPeriod - 1; i < k.length; i++) {
    const avg = k.slice(i - dPeriod + 1, i + 1).reduce((a, b) => a + b.value, 0) / dPeriod;
    d.push({ time: k[i].time, value: Number(avg.toFixed(2)) });
  }
  return { k, d };
}

export function calcStochRSI(bars: OHLCVBar[], period = 14): TimeValue[] {
  const rsi = calcRSI(bars, period);
  const out: TimeValue[] = [];
  for (let i = period - 1; i < rsi.length; i++) {
    const slice = rsi.slice(i - period + 1, i + 1).map((r) => r.value);
    const hi = Math.max(...slice);
    const lo = Math.min(...slice);
    const val = hi === lo ? 50 : ((rsi[i].value - lo) / (hi - lo)) * 100;
    out.push({ time: rsi[i].time, value: Number(val.toFixed(2)) });
  }
  return out;
}

export function calcADX(bars: OHLCVBar[], period = 14): ADXOutput {
  if (bars.length < period * 2) return { adx: [], plusDI: [], minusDI: [] };
  const trs: number[] = [];
  const plusDMs: number[] = [];
  const minusDMs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const upMove = bars[i].high - bars[i - 1].high;
    const downMove = bars[i - 1].low - bars[i].low;
    plusDMs.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDMs.push(downMove > upMove && downMove > 0 ? downMove : 0);
    trs.push(Math.max(bars[i].high - bars[i].low, Math.abs(bars[i].high - bars[i - 1].close), Math.abs(bars[i].low - bars[i - 1].close)));
  }
  const plusDI: TimeValue[] = [];
  const minusDI: TimeValue[] = [];
  const dxList: { time: number; dx: number }[] = [];

  let smTR = trs.slice(0, period).reduce((a, b) => a + b, 0);
  let smPlus = plusDMs.slice(0, period).reduce((a, b) => a + b, 0);
  let smMinus = minusDMs.slice(0, period).reduce((a, b) => a + b, 0);

  for (let i = period; i < trs.length; i++) {
    smTR = smTR - smTR / period + trs[i];
    smPlus = smPlus - smPlus / period + plusDMs[i];
    smMinus = smMinus - smMinus / period + minusDMs[i];
    const pdi = smTR === 0 ? 0 : (smPlus / smTR) * 100;
    const mdi = smTR === 0 ? 0 : (smMinus / smTR) * 100;
    const time = bars[i + 1].time;
    plusDI.push({ time, value: Number(pdi.toFixed(2)) });
    minusDI.push({ time, value: Number(mdi.toFixed(2)) });
    const dx = pdi + mdi === 0 ? 0 : (Math.abs(pdi - mdi) / (pdi + mdi)) * 100;
    dxList.push({ time, dx });
  }

  const adx: TimeValue[] = [];
  if (dxList.length >= period) {
    let adxVal = dxList.slice(0, period).reduce((a, b) => a + b.dx, 0) / period;
    adx.push({ time: dxList[period - 1].time, value: Number(adxVal.toFixed(2)) });
    for (let i = period; i < dxList.length; i++) {
      adxVal = (adxVal * (period - 1) + dxList[i].dx) / period;
      adx.push({ time: dxList[i].time, value: Number(adxVal.toFixed(2)) });
    }
  }
  return { adx, plusDI, minusDI };
}

export function calcOBV(bars: OHLCVBar[]): TimeValue[] {
  if (bars.length === 0) return [];
  let obv = 0;
  const out: TimeValue[] = [{ time: bars[0].time, value: 0 }];
  for (let i = 1; i < bars.length; i++) {
    if (bars[i].close > bars[i - 1].close) obv += bars[i].volume;
    else if (bars[i].close < bars[i - 1].close) obv -= bars[i].volume;
    out.push({ time: bars[i].time, value: obv });
  }
  return out;
}

export function calcCCI(bars: OHLCVBar[], period = 20): TimeValue[] {
  const out: TimeValue[] = [];
  for (let i = period - 1; i < bars.length; i++) {
    const slice = bars.slice(i - period + 1, i + 1);
    const tps = slice.map((b) => (b.high + b.low + b.close) / 3);
    const sma = tps.reduce((a, b) => a + b, 0) / period;
    const meanDev = tps.reduce((a, b) => a + Math.abs(b - sma), 0) / period;
    const cci = meanDev === 0 ? 0 : (tps[tps.length - 1] - sma) / (0.015 * meanDev);
    out.push({ time: bars[i].time, value: Number(cci.toFixed(2)) });
  }
  return out;
}

export function calcWilliamsR(bars: OHLCVBar[], period = 14): TimeValue[] {
  const out: TimeValue[] = [];
  for (let i = period - 1; i < bars.length; i++) {
    const slice = bars.slice(i - period + 1, i + 1);
    const hi = Math.max(...slice.map((b) => b.high));
    const lo = Math.min(...slice.map((b) => b.low));
    const wr = hi === lo ? -50 : ((hi - bars[i].close) / (hi - lo)) * -100;
    out.push({ time: bars[i].time, value: Number(wr.toFixed(2)) });
  }
  return out;
}

export function calcMFI(bars: OHLCVBar[], period = 14): TimeValue[] {
  if (bars.length <= period) return [];
  const tps = bars.map((b) => (b.high + b.low + b.close) / 3);
  const out: TimeValue[] = [];
  for (let i = period; i < bars.length; i++) {
    let posFlow = 0;
    let negFlow = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const flow = tps[j] * bars[j].volume;
      if (tps[j] >= tps[j - 1]) posFlow += flow;
      else negFlow += flow;
    }
    const mfi = negFlow === 0 ? 100 : 100 - 100 / (1 + posFlow / negFlow);
    out.push({ time: bars[i].time, value: Number(mfi.toFixed(2)) });
  }
  return out;
}

export function calcROC(bars: OHLCVBar[], period = 12): TimeValue[] {
  const out: TimeValue[] = [];
  for (let i = period; i < bars.length; i++) {
    const prev = bars[i - period].close;
    const roc = prev === 0 ? 0 : ((bars[i].close - prev) / prev) * 100;
    out.push({ time: bars[i].time, value: Number(roc.toFixed(2)) });
  }
  return out;
}

export function calcPivotPoints(bars: OHLCVBar[]): PivotLevels | null {
  if (bars.length < 2) return null;
  const prev = bars[bars.length - 2];
  const pivot = (prev.high + prev.low + prev.close) / 3;
  return {
    pivot: Number(pivot.toFixed(2)),
    r1: Number((2 * pivot - prev.low).toFixed(2)),
    s1: Number((2 * pivot - prev.high).toFixed(2)),
    r2: Number((pivot + (prev.high - prev.low)).toFixed(2)),
    s2: Number((pivot - (prev.high - prev.low)).toFixed(2)),
    r3: Number((prev.high + 2 * (pivot - prev.low)).toFixed(2)),
    s3: Number((prev.low - 2 * (prev.high - pivot)).toFixed(2)),
  };
}

export function calcFibonacciLevels(bars: OHLCVBar[], lookback = 60): FibLevels | null {
  if (bars.length < 10) return null;
  const slice = bars.slice(-Math.min(lookback, bars.length));
  const high = Math.max(...slice.map((b) => b.high));
  const low = Math.min(...slice.map((b) => b.low));
  const diff = high - low;
  const ratios = [
    { ratio: 0, label: '0.0%' },
    { ratio: 0.236, label: '23.6%' },
    { ratio: 0.382, label: '38.2%' },
    { ratio: 0.5, label: '50.0%' },
    { ratio: 0.618, label: '61.8%' },
    { ratio: 0.786, label: '78.6%' },
    { ratio: 1.0, label: '100.0%' },
  ];
  return {
    high: Number(high.toFixed(2)),
    low: Number(low.toFixed(2)),
    levels: ratios.map((r) => ({
      ratio: r.ratio,
      label: r.label,
      price: Number((high - diff * r.ratio).toFixed(2)),
    })),
  };
}

export interface IndicatorCatalogItem {
  id: string;
  name: string;
  category: 'Trend' | 'Momentum' | 'Volatility' | 'Volume' | 'Levels';
  pane: 'overlay' | 'oscillator';
}

export const INDICATOR_CATALOG: IndicatorCatalogItem[] = [
  { id: 'sma20', name: 'SMA (20)', category: 'Trend', pane: 'overlay' },
  { id: 'sma50', name: 'SMA (50)', category: 'Trend', pane: 'overlay' },
  { id: 'sma200', name: 'SMA (200)', category: 'Trend', pane: 'overlay' },
  { id: 'ema9', name: 'EMA (9)', category: 'Trend', pane: 'overlay' },
  { id: 'ema21', name: 'EMA (21)', category: 'Trend', pane: 'overlay' },
  { id: 'ema50', name: 'EMA (50)', category: 'Trend', pane: 'overlay' },
  { id: 'wma20', name: 'WMA (20)', category: 'Trend', pane: 'overlay' },
  { id: 'vwap', name: 'VWAP', category: 'Volume', pane: 'overlay' },
  { id: 'bb', name: 'Bollinger Bands (20, 2)', category: 'Volatility', pane: 'overlay' },
  { id: 'keltner', name: 'Keltner Channels', category: 'Volatility', pane: 'overlay' },
  { id: 'donchian', name: 'Donchian Channels', category: 'Volatility', pane: 'overlay' },
  { id: 'ichimoku', name: 'Ichimoku Cloud', category: 'Trend', pane: 'overlay' },
  { id: 'psar', name: 'Parabolic SAR', category: 'Trend', pane: 'overlay' },
  { id: 'supertrend', name: 'SuperTrend (10, 3)', category: 'Trend', pane: 'overlay' },
  { id: 'fib', name: 'Fibonacci Retracements', category: 'Levels', pane: 'overlay' },
  { id: 'pivots', name: 'Standard Pivot Points', category: 'Levels', pane: 'overlay' },
  { id: 'rsi', name: 'RSI (14)', category: 'Momentum', pane: 'oscillator' },
  { id: 'macd', name: 'MACD (12, 26, 9)', category: 'Momentum', pane: 'oscillator' },
  { id: 'stoch', name: 'Stochastic (14, 3)', category: 'Momentum', pane: 'oscillator' },
  { id: 'stochrsi', name: 'Stochastic RSI', category: 'Momentum', pane: 'oscillator' },
  { id: 'atr', name: 'ATR (14)', category: 'Volatility', pane: 'oscillator' },
  { id: 'adx', name: 'ADX (14, +DI/-DI)', category: 'Trend', pane: 'oscillator' },
  { id: 'obv', name: 'On-Balance Volume (OBV)', category: 'Volume', pane: 'oscillator' },
  { id: 'cci', name: 'CCI (20)', category: 'Momentum', pane: 'oscillator' },
  { id: 'willr', name: 'Williams %R (14)', category: 'Momentum', pane: 'oscillator' },
  { id: 'mfi', name: 'Money Flow Index (14)', category: 'Volume', pane: 'oscillator' },
  { id: 'roc', name: 'Rate of Change (12)', category: 'Momentum', pane: 'oscillator' },
];
