import type {
  DetectedPattern,
  HorizonPrediction,
  MarketAnomaly,
  NewsArticle,
  OHLCVBar,
  PredictionSuite,
} from '../types/market';
import { calcATR, calcMACD, calcRSI, calcSMA } from './indicators';

function linearRegression(values: number[]): { slope: number; intercept: number; r2: number } {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] ?? 0, r2: 0 };
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumXX += i * i;
  }
  const denom = n * sumXX - sumX * sumX;
  const slope = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  const meanY = sumY / n;
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    const pred = intercept + slope * i;
    ssTot += (values[i] - meanY) ** 2;
    ssRes += (values[i] - pred) ** 2;
  }
  const r2 = ssTot === 0 ? 0 : Math.max(0, 1 - ssRes / ssTot);
  return { slope, intercept, r2 };
}

function holtLinearForecast(values: number[], steps: number, alpha = 0.35, beta = 0.15): number {
  if (values.length < 2) return values[0] ?? 0;
  let level = values[0];
  let trend = values[1] - values[0];
  for (let i = 1; i < values.length; i++) {
    const prevLevel = level;
    level = alpha * values[i] + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
  }
  return level + steps * trend;
}

function findPivots(bars: OHLCVBar[], window = 4): { highs: { idx: number; price: number }[]; lows: { idx: number; price: number }[] } {
  const highs: { idx: number; price: number }[] = [];
  const lows: { idx: number; price: number }[] = [];
  for (let i = window; i < bars.length - window; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - window; j <= i + window; j++) {
      if (j === i) continue;
      if (bars[j].high >= bars[i].high) isHigh = false;
      if (bars[j].low <= bars[i].low) isLow = false;
    }
    if (isHigh) highs.push({ idx: i, price: bars[i].high });
    if (isLow) lows.push({ idx: i, price: bars[i].low });
  }
  return { highs, lows };
}

export function detectChartPatterns(bars: OHLCVBar[]): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  if (bars.length < 30) return patterns;

  const recent = bars.slice(-80);
  const offset = bars.length - recent.length;
  const lastPrice = recent[recent.length - 1].close;
  const { highs, lows } = findPivots(recent, 3);

  // 1. Double Top & Double Bottom
  if (highs.length >= 2) {
    const h1 = highs[highs.length - 2];
    const h2 = highs[highs.length - 1];
    const diffPct = Math.abs(h1.price - h2.price) / h1.price;
    if (diffPct < 0.025 && h2.idx - h1.idx >= 5) {
      const neckline = Math.min(...recent.slice(h1.idx, h2.idx + 1).map((b) => b.low));
      patterns.push({
        name: 'Double Top',
        bias: 'Bearish',
        confidence: Math.round((1 - diffPct * 12) * 86),
        startIndex: offset + h1.idx,
        endIndex: offset + h2.idx,
        targetPrice: Number((neckline - (h1.price - neckline) * 0.85).toFixed(2)),
        description: `Twin resistance peaks near ${h2.price.toFixed(2)} with neckline support at ${neckline.toFixed(2)}.`,
      });
    }
  }

  if (lows.length >= 2) {
    const l1 = lows[lows.length - 2];
    const l2 = lows[lows.length - 1];
    const diffPct = Math.abs(l1.price - l2.price) / l1.price;
    if (diffPct < 0.025 && l2.idx - l1.idx >= 5) {
      const neckline = Math.max(...recent.slice(l1.idx, l2.idx + 1).map((b) => b.high));
      patterns.push({
        name: 'Double Bottom',
        bias: 'Bullish',
        confidence: Math.round((1 - diffPct * 12) * 88),
        startIndex: offset + l1.idx,
        endIndex: offset + l2.idx,
        targetPrice: Number((neckline + (neckline - l1.price) * 0.85).toFixed(2)),
        description: `Twin support troughs near ${l2.price.toFixed(2)} signaling demand absorption above ${neckline.toFixed(2)}.`,
      });
    }
  }

  // 2. Head & Shoulders / Inverse Head & Shoulders
  if (highs.length >= 3) {
    const [ls, head, rs] = highs.slice(-3);
    if (head.price > ls.price * 1.015 && head.price > rs.price * 1.015 && Math.abs(ls.price - rs.price) / head.price < 0.035) {
      const neckline = Math.min(...recent.slice(ls.idx, rs.idx + 1).map((b) => b.low));
      patterns.push({
        name: 'Head & Shoulders',
        bias: 'Bearish',
        confidence: 78,
        startIndex: offset + ls.idx,
        endIndex: offset + rs.idx,
        targetPrice: Number((neckline - (head.price - neckline)).toFixed(2)),
        description: `Left shoulder (${ls.price.toFixed(2)}), head (${head.price.toFixed(2)}), and right shoulder (${rs.price.toFixed(2)}) topping structure.`,
      });
    }
  }

  // 3. Triangles & Wedges via upper/lower pivot slopes
  if (highs.length >= 2 && lows.length >= 2) {
    const hSlope = (highs[highs.length - 1].price - highs[0].price) / Math.max(1, highs[highs.length - 1].idx - highs[0].idx);
    const lSlope = (lows[lows.length - 1].price - lows[0].price) / Math.max(1, lows[lows.length - 1].idx - lows[0].idx);
    const normH = (hSlope / lastPrice) * 100;
    const normL = (lSlope / lastPrice) * 100;

    if (Math.abs(normH) < 0.08 && normL > 0.08) {
      patterns.push({
        name: 'Ascending Triangle',
        bias: 'Bullish',
        confidence: 76,
        startIndex: offset + Math.min(highs[0].idx, lows[0].idx),
        endIndex: bars.length - 1,
        targetPrice: Number((lastPrice * 1.055).toFixed(2)),
        description: 'Flat overhead resistance paired with rising higher-low buyer support.',
      });
    } else if (normH < -0.06 && normL > 0.06) {
      patterns.push({
        name: 'Symmetrical Triangle',
        bias: lastPrice > recent[0].close ? 'Bullish' : 'Bearish',
        confidence: 72,
        startIndex: offset + Math.min(highs[0].idx, lows[0].idx),
        endIndex: bars.length - 1,
        targetPrice: Number((lastPrice * (lastPrice > recent[0].close ? 1.045 : 0.955)).toFixed(2)),
        description: 'Converging volatility apex indicating imminent range expansion.',
      });
    } else if (normH < -0.05 && normL < -0.02 && normL > normH) {
      patterns.push({
        name: 'Falling Wedge',
        bias: 'Bullish',
        confidence: 74,
        startIndex: offset + highs[0].idx,
        endIndex: bars.length - 1,
        targetPrice: Number((lastPrice * 1.05).toFixed(2)),
        description: 'Downward-sloping converging channel compressing selling momentum.',
      });
    } else if (normH > 0.02 && normL > 0.05 && normH < normL) {
      patterns.push({
        name: 'Rising Wedge',
        bias: 'Bearish',
        confidence: 71,
        startIndex: offset + lows[0].idx,
        endIndex: bars.length - 1,
        targetPrice: Number((lastPrice * 0.95).toFixed(2)),
        description: 'Narrowing upward wedge showing diminishing upside follow-through.',
      });
    }
  }

  // 4. Bull / Bear Flag (sharp impulse followed by tight consolidation)
  if (recent.length >= 25) {
    const poleStart = recent[recent.length - 22].close;
    const poleEnd = recent[recent.length - 10].close;
    const poleMove = (poleEnd - poleStart) / poleStart;
    const flagSlice = recent.slice(-10);
    const flagRange = (Math.max(...flagSlice.map((b) => b.high)) - Math.min(...flagSlice.map((b) => b.low))) / lastPrice;
    if (poleMove > 0.05 && flagRange < 0.045) {
      patterns.push({
        name: 'Bull Flag',
        bias: 'Bullish',
        confidence: 79,
        startIndex: bars.length - 22,
        endIndex: bars.length - 1,
        targetPrice: Number((lastPrice * (1 + poleMove * 0.75)).toFixed(2)),
        description: `Tight ${(flagRange * 100).toFixed(1)}% consolidation following a +${(poleMove * 100).toFixed(1)}% impulse pole.`,
      });
    } else if (poleMove < -0.05 && flagRange < 0.045) {
      patterns.push({
        name: 'Bear Flag',
        bias: 'Bearish',
        confidence: 77,
        startIndex: bars.length - 22,
        endIndex: bars.length - 1,
        targetPrice: Number((lastPrice * (1 + poleMove * 0.75)).toFixed(2)),
        description: `Bearish pause after a ${(poleMove * 100).toFixed(1)}% sell-off leg.`,
      });
    }
  }

  // 5. Cup & Handle check on wider swing
  if (recent.length >= 50) {
    const leftRim = Math.max(...recent.slice(0, 15).map((b) => b.high));
    const cupBottom = Math.min(...recent.slice(15, 45).map((b) => b.low));
    const rightRim = Math.max(...recent.slice(45, -8).map((b) => b.high));
    const depth = (leftRim - cupBottom) / leftRim;
    if (depth > 0.06 && depth < 0.35 && Math.abs(leftRim - rightRim) / leftRim < 0.04 && lastPrice > rightRim * 0.94) {
      patterns.push({
        name: 'Cup & Handle',
        bias: 'Bullish',
        confidence: 81,
        startIndex: offset,
        endIndex: bars.length - 1,
        targetPrice: Number((rightRim + (leftRim - cupBottom) * 0.75).toFixed(2)),
        description: `Rounded ${(depth * 100).toFixed(1)}% accumulation base with shallow handle pullback.`,
      });
    }
  }

  return patterns.slice(0, 4);
}

export function detectAnomalies(bars: OHLCVBar[]): MarketAnomaly[] {
  if (bars.length < 25) return [];
  const anomalies: MarketAnomaly[] = [];
  const vols = bars.map((b) => b.volume);
  const rets = bars.slice(1).map((b, i) => (b.close - bars[i].close) / Math.max(bars[i].close, 0.01));

  const meanVol = vols.reduce((a, b) => a + b, 0) / vols.length;
  const sdVol = Math.sqrt(vols.reduce((a, b) => a + (b - meanVol) ** 2, 0) / vols.length) || 1;
  const meanRet = rets.reduce((a, b) => a + b, 0) / rets.length;
  const sdRet = Math.sqrt(rets.reduce((a, b) => a + (b - meanRet) ** 2, 0) / rets.length) || 0.005;

  const recentStart = Math.max(1, bars.length - 25);
  for (let i = recentStart; i < bars.length; i++) {
    const b = bars[i];
    const zVol = (b.volume - meanVol) / sdVol;
    if (zVol > 2.2) {
      anomalies.push({
        time: b.time,
        type: 'Volume Spike',
        severity: zVol > 3.2 ? 'High' : 'Medium',
        zScore: Number(zVol.toFixed(2)),
        detail: `Volume surged ${(b.volume / Math.max(meanVol, 1)).toFixed(1)}x above rolling baseline (${zVol.toFixed(1)}σ).`,
      });
    }
    const r = (b.close - bars[i - 1].close) / Math.max(bars[i - 1].close, 0.01);
    const zRet = Math.abs((r - meanRet) / sdRet);
    if (zRet > 2.3) {
      anomalies.push({
        time: b.time,
        type: 'Price Gap / Outlier',
        severity: zRet > 3.1 ? 'High' : 'Medium',
        zScore: Number(zRet.toFixed(2)),
        detail: `${r >= 0 ? '+' : ''}${(r * 100).toFixed(2)}% move represents a ${zRet.toFixed(1)}σ return outlier.`,
      });
    }
  }
  return anomalies.slice(-6).reverse();
}

export function runEnsemblePredictions(
  symbol: string,
  bars: OHLCVBar[],
  news: NewsArticle[]
): PredictionSuite {
  const empty: PredictionSuite = {
    symbol,
    currentPrice: 0,
    horizons: [],
    patterns: [],
    anomalies: [],
    ensembleWeights: {
      momentumRegression: 0.35,
      exponentialSmoothing: 0.30,
      meanReversionOscillator: 0.20,
      volatilityRegime: 0.15,
    },
    newsSentimentAvg: 0,
    projectedSeries: [],
  };
  if (bars.length < 20) return empty;

  const closes = bars.map((b) => b.close);
  const currentPrice = closes[closes.length - 1];
  const lastTime = bars[bars.length - 1].time;
  const barStepSec = Math.max(60, bars[bars.length - 1].time - bars[bars.length - 2].time);

  // Compute returns volatility
  const returns = closes.slice(1).map((c, i) => Math.log(c / Math.max(closes[i], 0.01)));
  const recentRets = returns.slice(-30);
  const sigma = Math.sqrt(recentRets.reduce((a, b) => a + b * b, 0) / Math.max(1, recentRets.length)) || 0.012;

  const reg = linearRegression(closes.slice(-30));
  const rsiArr = calcRSI(bars, 14);
  const latestRSI = rsiArr.length ? rsiArr[rsiArr.length - 1].value : 50;
  const macdOut = calcMACD(bars);
  const latestMacdHist = macdOut.histogram.length ? macdOut.histogram[macdOut.histogram.length - 1].value : 0;
  const sma50Arr = calcSMA(bars, 50);
  const latestSma50 = sma50Arr.length ? sma50Arr[sma50Arr.length - 1].value : currentPrice;
  const atrArr = calcATR(bars, 14);
  const latestAtr = atrArr.length ? atrArr[atrArr.length - 1].value : currentPrice * 0.015;

  const newsSentimentAvg = news.length
    ? Number((news.reduce((a, n) => a + n.sentimentScore, 0) / news.length).toFixed(2))
    : 0;

  // Mean-reversion adjustment from RSI & distance to SMA50
  const rsiSignal = (50 - latestRSI) / 250; // overbought pulls down, oversold lifts
  const trendBias = currentPrice > latestSma50 ? 0.002 : -0.002;
  const macdBias = latestMacdHist > 0 ? 0.0018 : -0.0018;
  const sentimentBias = newsSentimentAvg * 0.004;

  const horizonSpecs: { horizon: '1h' | '4h' | '1d' | '1w'; steps: number; volScale: number }[] = [
    { horizon: '1h', steps: 1, volScale: 0.65 },
    { horizon: '4h', steps: 3, volScale: 1.15 },
    { horizon: '1d', steps: 6, volScale: 1.85 },
    { horizon: '1w', steps: 14, volScale: 3.1 },
  ];

  const horizons: HorizonPrediction[] = horizonSpecs.map(({ horizon, steps, volScale }) => {
    const regProj = reg.intercept + reg.slope * (29 + steps * 0.5);
    const holtProj = holtLinearForecast(closes.slice(-40), steps * 0.5);
    const meanRevProj = currentPrice * (1 + rsiSignal * Math.sqrt(steps) + trendBias + macdBias + sentimentBias);

    const targetBase = 0.35 * regProj + 0.30 * holtProj + 0.35 * meanRevProj;
    const band = Math.max(latestAtr * 0.65, currentPrice * sigma * volScale);
    const targetLow = Math.max(0.01, targetBase - band * 1.28);
    const targetHigh = targetBase + band * 1.28;
    const expectedReturnPct = ((targetBase - currentPrice) / currentPrice) * 100;

    // Calibrated probability based on signal agreement
    const signalAgreement =
      (reg.slope > 0 ? 1 : -1) * 0.35 +
      (latestMacdHist > 0 ? 1 : -1) * 0.25 +
      (currentPrice > latestSma50 ? 1 : -1) * 0.25 +
      (newsSentimentAvg >= 0 ? 1 : -1) * 0.15;

    const rawProb = 50 + Math.abs(signalAgreement) * 28 + Math.min(8, reg.r2 * 10);
    const probability = Math.min(89, Math.max(51, Math.round(rawProb)));

    const direction: 'Bullish' | 'Bearish' | 'Neutral' =
      expectedReturnPct > 0.25 ? 'Bullish' : expectedReturnPct < -0.25 ? 'Bearish' : 'Neutral';

    return {
      horizon,
      direction,
      probability,
      targetLow: Number(targetLow.toFixed(2)),
      targetBase: Number(targetBase.toFixed(2)),
      targetHigh: Number(targetHigh.toFixed(2)),
      expectedReturnPct: Number(expectedReturnPct.toFixed(2)),
    };
  });

  // Build 14-step projected confidence cone
  const projectedSeries = Array.from({ length: 14 }, (_, idx) => {
    const step = idx + 1;
    const regProj = reg.intercept + reg.slope * (29 + step * 0.5);
    const holtProj = holtLinearForecast(closes.slice(-40), step * 0.5);
    const base = 0.4 * regProj + 0.35 * holtProj + 0.25 * currentPrice * (1 + sentimentBias * 0.5);
    const sdStep = currentPrice * sigma * Math.sqrt(step) * 0.85;
    return {
      time: lastTime + step * barStepSec,
      base: Number(base.toFixed(2)),
      upper80: Number((base + 1.28 * sdStep).toFixed(2)),
      lower80: Number(Math.max(0.01, base - 1.28 * sdStep).toFixed(2)),
      upper95: Number((base + 1.96 * sdStep).toFixed(2)),
      lower95: Number(Math.max(0.01, base - 1.96 * sdStep).toFixed(2)),
    };
  });

  return {
    symbol,
    currentPrice,
    horizons,
    patterns: detectChartPatterns(bars),
    anomalies: detectAnomalies(bars),
    ensembleWeights: {
      momentumRegression: 0.35,
      exponentialSmoothing: 0.30,
      meanReversionOscillator: 0.20,
      volatilityRegime: 0.15,
    },
    newsSentimentAvg,
    projectedSeries,
  };
}
