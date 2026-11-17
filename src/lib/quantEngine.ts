import type {
  AnalystEstimateMomentum,
  DarkPoolSummary,
  GuidanceRevisionRecord,
  MaxPainStrikePoint,
  OHLCVBar,
  OptionContract,
  OptionsChainData,
  OptionsFlowHeatmapCell,
  OptionStrategyAnalysis,
  OptionStrategyLeg,
  OptionStrategyPreset,
  PeadQuarterRecord,
  ShortInterestAnalytics,
  StrategyBlock,
  UnusualOptionActivity,
} from '../types/market';
import {
  calcADX,
  calcBollinger,
  calcMACD,
  calcRSI,
  calcSMA,
  calcVWAP,
} from './indicators';

// Standard Normal PDF and CDF for Black-Scholes
function normPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

function normCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + p * absX);
  const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-absX * absX);
  return 0.5 * (1 + sign * y);
}

export function blackScholesGreeks(params: {
  spot: number;
  strike: number;
  dte: number;
  iv: number;
  r?: number;
  type: 'call' | 'put';
}): { price: number; delta: number; gamma: number; theta: number; vega: number; rho: number } {
  const { spot, strike, dte, iv, r = 0.043, type } = params;
  const T = Math.max(1 / 365, dte / 365);
  const sqrtT = Math.sqrt(T);
  const sigma = Math.max(0.05, iv);

  const d1 = (Math.log(spot / strike) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const pdfD1 = normPDF(d1);

  const callPrice = spot * normCDF(d1) - strike * Math.exp(-r * T) * normCDF(d2);
  const putPrice = strike * Math.exp(-r * T) * normCDF(-d2) - spot * normCDF(-d1);
  const price = Math.max(0.01, type === 'call' ? callPrice : putPrice);

  const delta = type === 'call' ? normCDF(d1) : normCDF(d1) - 1;
  const gamma = pdfD1 / (spot * sigma * sqrtT);
  const thetaAnnual =
    type === 'call'
      ? -(spot * pdfD1 * sigma) / (2 * sqrtT) - r * strike * Math.exp(-r * T) * normCDF(d2)
      : -(spot * pdfD1 * sigma) / (2 * sqrtT) + r * strike * Math.exp(-r * T) * normCDF(-d2);
  const theta = thetaAnnual / 365;
  const vega = (spot * pdfD1 * sqrtT) / 100;
  const rho =
    type === 'call'
      ? (strike * T * Math.exp(-r * T) * normCDF(d2)) / 100
      : (-strike * T * Math.exp(-r * T) * normCDF(-d2)) / 100;

  return {
    price: Number(price.toFixed(2)),
    delta: Number(delta.toFixed(3)),
    gamma: Number(gamma.toFixed(4)),
    theta: Number(theta.toFixed(3)),
    vega: Number(vega.toFixed(3)),
    rho: Number(rho.toFixed(3)),
  };
}

export function buildOptionsChain(symbol: string, spotPrice: number, selectedDte = 30, baseVol = 0.28): OptionsChainData {
  const expirations = [
    { label: '7D Weekly', dte: 7 },
    { label: '14D Weekly', dte: 14 },
    { label: '30D Monthly', dte: 30 },
    { label: '60D Quarterly', dte: 60 },
    { label: '90D', dte: 90 },
    { label: '180D LEAPS', dte: 180 },
  ];

  const step = spotPrice > 1000 ? 25 : spotPrice > 300 ? 10 : spotPrice > 80 ? 5 : 2.5;
  const atm = Math.round(spotPrice / step) * step;
  const strikes = Array.from({ length: 13 }, (_, i) => Number((atm + (i - 6) * step).toFixed(2))).filter((s) => s > 0);

  const skewIv = (strike: number, dte: number) => {
    const moneyness = (strike - spotPrice) / spotPrice;
    // Volatility smile + negative equity skew + term structure
    const skew = -moneyness * 0.42 + moneyness * moneyness * 1.45;
    const termAdj = (30 / Math.max(7, dte) - 1) * 0.018;
    return Number(Math.max(0.11, Math.min(0.95, baseVol + skew + termAdj)).toFixed(4));
  };

  let totalCallOI = 0;
  let totalPutOI = 0;

  const calls: OptionContract[] = strikes.map((strike, idx) => {
    const iv = skewIv(strike, selectedDte);
    const bs = blackScholesGreeks({ spot: spotPrice, strike, dte: selectedDte, iv, type: 'call' });
    const dist = Math.abs(idx - 6);
    const oi = Math.round(14500 * Math.exp(-dist * 0.28) + ((strike * 13) % 900));
    const vol = Math.round(oi * 0.34);
    totalCallOI += oi;
    return {
      strike,
      type: 'call',
      bid: Number(Math.max(0.01, bs.price * 0.985).toFixed(2)),
      ask: Number((bs.price * 1.015).toFixed(2)),
      lastPrice: bs.price,
      impliedVolatility: iv,
      volume: vol,
      openInterest: oi,
      inTheMoney: strike < spotPrice,
      delta: bs.delta,
      gamma: bs.gamma,
      theta: bs.theta,
      vega: bs.vega,
      rho: bs.rho,
    };
  });

  const puts: OptionContract[] = strikes.map((strike, idx) => {
    const iv = skewIv(strike, selectedDte) + 0.012;
    const bs = blackScholesGreeks({ spot: spotPrice, strike, dte: selectedDte, iv, type: 'put' });
    const dist = Math.abs(idx - 6);
    const oi = Math.round(12800 * Math.exp(-dist * 0.25) + ((strike * 17) % 1100));
    const vol = Math.round(oi * 0.31);
    totalPutOI += oi;
    return {
      strike,
      type: 'put',
      bid: Number(Math.max(0.01, bs.price * 0.985).toFixed(2)),
      ask: Number((bs.price * 1.015).toFixed(2)),
      lastPrice: bs.price,
      impliedVolatility: iv,
      volume: vol,
      openInterest: oi,
      inTheMoney: strike > spotPrice,
      delta: bs.delta,
      gamma: bs.gamma,
      theta: bs.theta,
      vega: bs.vega,
      rho: bs.rho,
    };
  });

  // Max pain strike minimizes aggregate intrinsic value
  let maxPainStrike = atm;
  let minPain = Infinity;
  const maxPainCurve: MaxPainStrikePoint[] = [];
  for (const testStrike of strikes) {
    let callPainUsd = 0;
    let putPainUsd = 0;
    for (let i = 0; i < strikes.length; i++) {
      callPainUsd += Math.max(0, testStrike - strikes[i]) * calls[i].openInterest * 100;
      putPainUsd += Math.max(0, strikes[i] - testStrike) * puts[i].openInterest * 100;
    }
    const totalPainUsd = callPainUsd + putPainUsd;
    maxPainCurve.push({
      strike: testStrike,
      callPainUsd: Math.round(callPainUsd),
      putPainUsd: Math.round(putPainUsd),
      totalPainUsd: Math.round(totalPainUsd),
    });
    if (totalPainUsd < minPain) {
      minPain = totalPainUsd;
      maxPainStrike = testStrike;
    }
  }

  const dtes = expirations.map((e) => e.dte);
  const grid = dtes.map((dte) => strikes.map((st) => Number((skewIv(st, dte) * 100).toFixed(1))));

  // Options Flow Heatmap across active strikes and expirations
  let symHash = 13;
  for (let i = 0; i < symbol.length; i++) symHash = (symHash * 31 + symbol.charCodeAt(i)) >>> 0;
  const heatmapStrikes = strikes.slice(2, 11);
  const heatmapDtes = dtes.slice(0, 5);
  const cells: OptionsFlowHeatmapCell[] = [];
  for (let dIdx = 0; dIdx < heatmapDtes.length; dIdx++) {
    const dte = heatmapDtes[dIdx];
    for (let sIdx = 0; sIdx < heatmapStrikes.length; sIdx++) {
      const strike = heatmapStrikes[sIdx];
      const cellSeed = (symHash + dte * 97 + Math.round(strike) * 43 + dIdx * 17 + sIdx * 29) % 1000;
      const distFactor = Math.exp(-Math.abs(strike - spotPrice) / Math.max(5, spotPrice * 0.08));
      const biasCall = strike >= spotPrice ? 1.25 : 0.72;
      const biasPut = strike <= spotPrice ? 1.28 : 0.68;
      const callPrem = Math.round((95000 + (cellSeed % 620) * 1850) * distFactor * biasCall);
      const putPrem = Math.round((85000 + ((cellSeed * 7) % 590) * 1800) * distFactor * biasPut);
      const netFlowUsd = callPrem - putPrem;
      const gammaRaw =
        blackScholesGreeks({ spot: spotPrice, strike, dte, iv: skewIv(strike, dte), type: 'call' }).gamma *
        spotPrice *
        spotPrice *
        ((callPrem + putPrem) / 45000);
      cells.push({
        strike,
        dte,
        callPremiumUsd: callPrem,
        putPremiumUsd: putPrem,
        netFlowUsd,
        sweepCount: Math.max(0, Math.round((cellSeed % 9) * distFactor)),
        gammaNotionalM: Number((gammaRaw / 1e5).toFixed(2)),
      });
    }
  }

  return {
    symbol,
    spotPrice,
    expirations,
    selectedDte,
    ivRank: Math.round(Math.min(96, Math.max(12, baseVol * 165))),
    putCallOIRatio: Number((totalPutOI / Math.max(1, totalCallOI)).toFixed(2)),
    maxPainStrike,
    maxPainCurve,
    calls,
    puts,
    ivSurface: { dtes, strikes, grid },
    flowHeatmap: {
      dtes: heatmapDtes,
      strikes: heatmapStrikes,
      cells,
    },
  };
}

export interface MonteCarloOutput {
  days: number;
  simulations: number;
  percentiles: {
    day: number;
    p5: number;
    p25: number;
    p50: number;
    p75: number;
    p95: number;
  }[];
  samplePaths: number[][];
  expectedFinal: number;
  probProfitPct: number;
  probTargetPct: number;
  cagrMedianPct: number;
}

export function runMonteCarloPortfolio(params: {
  initialCapital: number;
  annualReturnPct: number;
  annualVolPct: number;
  days: number;
  monthlyContribution: number;
  targetValue: number;
  simulations?: number;
}): MonteCarloOutput {
  const {
    initialCapital,
    annualReturnPct,
    annualVolPct,
    days,
    monthlyContribution,
    targetValue,
    simulations = 600,
  } = params;

  const dt = 1 / 252;
  const mu = annualReturnPct / 100;
  const sigma = Math.max(0.02, annualVolPct / 100);
  const drift = (mu - 0.5 * sigma * sigma) * dt;
  const volStep = sigma * Math.sqrt(dt);

  // Box-Muller normal variates
  const randNormal = () => {
    const u1 = Math.max(1e-7, Math.random());
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };

  const paths: number[][] = Array.from({ length: simulations }, () => {
    const arr = new Array<number>(days + 1);
    arr[0] = initialCapital;
    for (let d = 1; d <= days; d++) {
      const z = randNormal();
      const contrib = d % 21 === 0 ? monthlyContribution : 0;
      arr[d] = Math.max(100, arr[d - 1] * Math.exp(drift + volStep * z) + contrib);
    }
    return arr;
  });

  const stepSample = Math.max(1, Math.floor(days / 45));
  const percentiles: MonteCarloOutput['percentiles'] = [];
  for (let d = 0; d <= days; d += stepSample) {
    const col = paths.map((p) => p[d]).sort((a, b) => a - b);
    percentiles.push({
      day: d,
      p5: Number(col[Math.floor(simulations * 0.05)].toFixed(0)),
      p25: Number(col[Math.floor(simulations * 0.25)].toFixed(0)),
      p50: Number(col[Math.floor(simulations * 0.5)].toFixed(0)),
      p75: Number(col[Math.floor(simulations * 0.75)].toFixed(0)),
      p95: Number(col[Math.floor(simulations * 0.95)].toFixed(0)),
    });
  }
  if (percentiles[percentiles.length - 1]?.day !== days) {
    const col = paths.map((p) => p[days]).sort((a, b) => a - b);
    percentiles.push({
      day: days,
      p5: Number(col[Math.floor(simulations * 0.05)].toFixed(0)),
      p25: Number(col[Math.floor(simulations * 0.25)].toFixed(0)),
      p50: Number(col[Math.floor(simulations * 0.5)].toFixed(0)),
      p75: Number(col[Math.floor(simulations * 0.75)].toFixed(0)),
      p95: Number(col[Math.floor(simulations * 0.95)].toFixed(0)),
    });
  }

  const finals = paths.map((p) => p[days]);
  const totalContributed = initialCapital + Math.floor(days / 21) * monthlyContribution;
  const probProfitPct = Number(((finals.filter((v) => v > totalContributed).length / simulations) * 100).toFixed(1));
  const probTargetPct = Number(((finals.filter((v) => v >= targetValue).length / simulations) * 100).toFixed(1));
  const medianFinal = percentiles[percentiles.length - 1].p50;
  const expectedFinal = Number((finals.reduce((a, b) => a + b, 0) / simulations).toFixed(0));
  const years = Math.max(0.1, days / 252);
  const cagrMedianPct = Number(((Math.pow(medianFinal / Math.max(1, totalContributed), 1 / years) - 1) * 100).toFixed(2));

  return {
    days,
    simulations,
    percentiles,
    samplePaths: paths.slice(0, 18),
    expectedFinal,
    probProfitPct,
    probTargetPct,
    cagrMedianPct,
  };
}

export function buildDarkPoolSummary(symbol: string, spotPrice: number, avgVolume: number): DarkPoolSummary {
  const venues = ['FINRA ADF', 'EDGX Dark', 'UBS ATS', 'SIGMA X2', 'IEX Midpoint'] as const;
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) hash = (hash * 31 + symbol.charCodeAt(i)) >>> 0;

  const prints = Array.from({ length: 10 }, (_, idx) => {
    const seed = (hash + idx * 7919) % 10000;
    const shares = Math.round(8500 + (seed % 65000));
    const offset = ((seed % 100) - 48) * 0.0004 * spotPrice;
    const price = Number((spotPrice + offset).toFixed(2));
    const side: 'Accumulation' | 'Distribution' | 'Neutral Block' =
      seed % 7 === 0 ? 'Neutral Block' : offset >= 0 ? 'Accumulation' : 'Distribution';
    return {
      id: `dp-${symbol}-${idx}`,
      timestamp: Date.now() - idx * 240000 - (seed % 120000),
      symbol,
      price,
      shares,
      notionalUsd: Math.round(shares * price),
      venue: venues[idx % venues.length],
      side,
    };
  });

  const accVol = prints.filter((p) => p.side === 'Accumulation').reduce((a, p) => a + p.notionalUsd, 0);
  const distVol = prints.filter((p) => p.side === 'Distribution').reduce((a, p) => a + p.notionalUsd, 0);
  const dixScore = Math.min(82, Math.max(24, Math.round((accVol / Math.max(1, accVol + distVol)) * 100)));

  const shortPctOfFloat = Number((1.4 + ((hash % 135) / 10)).toFixed(2));
  const floatShares = Math.round(Math.max(120_000_000, avgVolume * 38));
  const shortInterestShares = Math.round((floatShares * shortPctOfFloat) / 100);
  const daysToCover = Number((shortInterestShares / Math.max(1_000_000, avgVolume)).toFixed(2));
  const costToBorrowPct = Number((0.45 + ((hash % 42) / 10)).toFixed(2));
  const utilizationPct = Number(Math.min(96, 18 + shortPctOfFloat * 4.2 + (hash % 18)).toFixed(1));
  const momChg = Number((((hash % 32) - 12) * 0.9).toFixed(1));
  const squeezeRisk: ShortInterestAnalytics['squeezeRisk'] =
    shortPctOfFloat >= 11 || daysToCover >= 5.5
      ? 'High'
      : shortPctOfFloat >= 7 || daysToCover >= 3.8
      ? 'Elevated'
      : shortPctOfFloat >= 3.5 || daysToCover >= 2.2
      ? 'Moderate'
      : 'Low';

  const siDates = ['Jun 15', 'Jul 15', 'Aug 15', 'Sep 15', 'Oct 15', 'Nov 15'];
  const historicalSeries = siDates.map((date, idx) => {
    const wave = Math.sin((hash + idx * 1.3) * 0.7) * 0.65;
    const sp = Number(Math.max(0.8, shortPctOfFloat - (5 - idx) * (momChg / 50) + wave).toFixed(2));
    const dtc = Number(Math.max(0.7, daysToCover * (sp / Math.max(0.5, shortPctOfFloat))).toFixed(2));
    return { date, shortPctFloat: sp, daysToCover: dtc };
  });

  const shortInterest: ShortInterestAnalytics = {
    shortInterestShares,
    floatShares,
    shortPctOfFloat,
    shortInterestMoMChangePct: momChg,
    daysToCover,
    costToBorrowPct,
    utilizationPct,
    squeezeRisk,
    historicalSeries,
  };

  return {
    symbol,
    darkPoolPct: Number((37 + (hash % 14)).toFixed(1)),
    netInstitutionalFlowM: Number(((accVol - distVol) / 1e6).toFixed(2)),
    dixScore,
    keyLevels: [
      { price: Number((spotPrice * 0.985).toFixed(2)), volumeShares: Math.round(avgVolume * 0.045), bias: 'Support' },
      { price: Number((spotPrice * 0.968).toFixed(2)), volumeShares: Math.round(avgVolume * 0.062), bias: 'Support' },
      { price: Number((spotPrice * 1.018).toFixed(2)), volumeShares: Math.round(avgVolume * 0.051), bias: 'Resistance' },
    ],
    prints,
    shortInterest,
  };
}

export function buildPeadHistory(symbol: string): PeadQuarterRecord[] {
  let h = 17;
  for (let i = 0; i < symbol.length; i++) h = (h * 37 + symbol.charCodeAt(i)) >>> 0;
  const quarters = ['Q4 2024', 'Q1 2025', 'Q2 2025', 'Q3 2025', 'Q4 2025', 'Q1 2026', 'Q2 2026', 'Q3 2026'];
  return quarters.map((quarter, i) => {
    const s = ((h + i * 1031) % 200) - 85;
    const epsSurprisePct = Number((s / 12 + 1.8).toFixed(1));
    const day0GapPct = Number((epsSurprisePct * 0.55 + ((i % 3) - 1) * 0.8).toFixed(2));
    const drift5dPct = Number((day0GapPct * 0.35 + (epsSurprisePct > 0 ? 1.1 : -0.9)).toFixed(2));
    const drift20dPct = Number((drift5dPct * 1.8 + (epsSurprisePct > 0 ? 1.4 : -1.2)).toFixed(2));
    const drift30dPct = Number((drift20dPct * 1.25).toFixed(2));
    return { quarter, epsSurprisePct, day0GapPct, drift5dPct, drift20dPct, drift30dPct };
  });
}

export function buildGuidanceRevisions(symbol: string, spotPrice: number): GuidanceRevisionRecord[] {
  let h = 29;
  for (let i = 0; i < symbol.length; i++) h = (h * 41 + symbol.charCodeAt(i)) >>> 0;
  const baseEps = Math.max(0.8, Number((spotPrice / 95).toFixed(2)));
  const baseRev = Math.round(14 + (h % 65));

  return [
    {
      quarter: 'Q4 2026',
      announcedDate: '2026-10-29',
      metric: 'Revenue',
      priorGuide: `$${baseRev}.2B – $${baseRev + 1}.0B`,
      revisedGuide: `$${baseRev + 1}.1B – $${baseRev + 2}.1B`,
      deltaPct: Number((2.4 + (h % 28) / 10).toFixed(1)),
      action: 'Raised',
      catalyst: 'Enterprise & AI cloud backlog acceleration ahead of holiday cycle',
    },
    {
      quarter: 'Q4 2026',
      announcedDate: '2026-10-29',
      metric: 'EPS',
      priorGuide: `$${(baseEps * 0.96).toFixed(2)} – $${baseEps.toFixed(2)}`,
      revisedGuide: `$${(baseEps * 1.02).toFixed(2)} – $${(baseEps * 1.07).toFixed(2)}`,
      deltaPct: Number((4.8 + (h % 19) / 10).toFixed(1)),
      action: 'Raised',
      catalyst: 'Gross margin expansion (+90 bps QoQ) and share repurchase accretion',
    },
    {
      quarter: 'Q3 2026',
      announcedDate: '2026-07-30',
      metric: 'Op Margin',
      priorGuide: '28.5% – 29.2%',
      revisedGuide: '29.4% – 30.1%',
      deltaPct: 2.9,
      action: 'Raised',
      catalyst: 'Operating leverage across core services and lower freight costs',
    },
    {
      quarter: 'Q2 2026',
      announcedDate: '2026-05-01',
      metric: 'Revenue',
      priorGuide: `$${baseRev - 2}.0B – $${baseRev - 1}.2B`,
      revisedGuide: `$${baseRev - 2}.1B – $${baseRev - 1}.1B`,
      deltaPct: 0.2,
      action: 'Maintained',
      catalyst: 'FX headwind offset by unit ASP strength in flagship tier',
    },
    {
      quarter: 'Q1 2026',
      announcedDate: '2026-02-04',
      metric: 'EPS',
      priorGuide: `$${(baseEps * 0.91).toFixed(2)} – $${(baseEps * 0.95).toFixed(2)}`,
      revisedGuide: `$${(baseEps * 0.88).toFixed(2)} – $${(baseEps * 0.92).toFixed(2)}`,
      deltaPct: -3.2,
      action: 'Lowered',
      catalyst: 'Front-loaded R&D capex and seasonal channel inventory normalization',
    },
  ];
}

export function buildAnalystEstimateMomentum(symbol: string, spotPrice: number): AnalystEstimateMomentum {
  let h = 53;
  for (let i = 0; i < symbol.length; i++) h = (h * 33 + symbol.charCodeAt(i)) >>> 0;
  const epsCurrentQ = Number(Math.max(0.75, spotPrice / 92).toFixed(2));
  const driftFactor = ((h % 18) - 4) / 100; // mostly positive bias with symbol variation
  const eps7dAgo = Number((epsCurrentQ * (1 - driftFactor * 0.15)).toFixed(2));
  const eps30dAgo = Number((epsCurrentQ * (1 - driftFactor * 0.55)).toFixed(2));
  const eps90dAgo = Number((epsCurrentQ * (1 - driftFactor)).toFixed(2));

  const upRevisions30d = 8 + (h % 17);
  const downRevisions30d = 2 + (h % 8);
  const revUp30d = 6 + (h % 14);
  const revDown30d = 2 + (h % 7);

  const breadthRatio = upRevisions30d / Math.max(1, upRevisions30d + downRevisions30d);
  const epsChg = (epsCurrentQ - eps90dAgo) / Math.max(0.1, eps90dAgo);
  const estimateMomentumScore = Math.round(Math.min(97, Math.max(18, breadthRatio * 75 + epsChg * 140)));
  const earningsEspPct = Number((((epsCurrentQ - eps30dAgo) / Math.max(0.1, eps30dAgo)) * 100 + 1.1).toFixed(2));
  const baseRevB = Number((18 + (h % 55)).toFixed(1));

  return {
    symbol,
    epsCurrentQ,
    eps7dAgo,
    eps30dAgo,
    eps90dAgo,
    upRevisions30d,
    downRevisions30d,
    revUp30d,
    revDown30d,
    estimateMomentumScore,
    earningsEspPct,
    consensusTrajectory: [
      { label: '90D Ago', eps: eps90dAgo, revB: Number((baseRevB * 0.96).toFixed(1)) },
      { label: '60D Ago', eps: Number(((eps90dAgo + eps30dAgo) / 2).toFixed(2)), revB: Number((baseRevB * 0.975).toFixed(1)) },
      { label: '30D Ago', eps: eps30dAgo, revB: Number((baseRevB * 0.988).toFixed(1)) },
      { label: '7D Ago', eps: eps7dAgo, revB: Number((baseRevB * 0.996).toFixed(1)) },
      { label: 'Current', eps: epsCurrentQ, revB: baseRevB },
    ],
  };
}

export interface CustomBacktestOutput {
  returnPct: number;
  buyHoldPct: number;
  winRatePct: number;
  sharpeRatio: number;
  maxDrawdownPct: number;
  trades: number;
  equityCurve: { time: number; equity: number; benchmark: number }[];
}

export function evaluateVisualStrategy(bars: OHLCVBar[], blocks: StrategyBlock[]): CustomBacktestOutput {
  if (bars.length < 35 || blocks.length === 0) {
    return { returnPct: 0, buyHoldPct: 0, winRatePct: 0, sharpeRatio: 0, maxDrawdownPct: 0, trades: 0, equityCurve: [] };
  }

  const smaFast = new Map(calcSMA(bars, 15).map((x) => [x.time, x.value]));
  const smaSlow = new Map(calcSMA(bars, 45).map((x) => [x.time, x.value]));
  const rsi = new Map(calcRSI(bars, 14).map((x) => [x.time, x.value]));
  const macd = calcMACD(bars);
  const macdHist = new Map(macd.histogram.map((x) => [x.time, x.value]));
  const bb = calcBollinger(bars, 20, 2);
  const bbUpper = new Map(bb.upper.map((x) => [x.time, x.value]));
  const vwap = new Map(calcVWAP(bars).map((x) => [x.time, x.value]));
  const adx = new Map(calcADX(bars, 14).adx.map((x) => [x.time, x.value]));
  const avgVol = bars.reduce((a, b) => a + b.volume, 0) / bars.length;

  const entryBlocks = blocks.filter((b) => b.kind === 'entry' || b.kind === 'filter');
  const exitBlocks = blocks.filter((b) => b.kind === 'exit');

  let cash = 100000;
  let shares = 0;
  let entryPx = 0;
  let wins = 0;
  let losses = 0;
  let peak = 100000;
  let maxDD = 0;
  const startPx = bars[0].close;
  const curve: { time: number; equity: number; benchmark: number }[] = [];
  const rets: number[] = [];
  let prevEq = 100000;

  for (let i = 1; i < bars.length; i++) {
    const b = bars[i];
    const checkRule = (blk: StrategyBlock): boolean => {
      switch (blk.ruleType) {
        case 'sma_cross_above': {
          const f = smaFast.get(b.time);
          const s = smaSlow.get(b.time);
          return Boolean(f && s && f > s);
        }
        case 'rsi_below': {
          const r = rsi.get(b.time);
          return r !== undefined && r < blk.param;
        }
        case 'macd_hist_positive': {
          const h = macdHist.get(b.time);
          return h !== undefined && h > 0;
        }
        case 'bb_upper_breakout': {
          const u = bbUpper.get(b.time);
          return Boolean(u && b.close > u);
        }
        case 'price_above_vwap': {
          const v = vwap.get(b.time);
          return Boolean(v && b.close > v);
        }
        case 'volume_spike':
          return b.volume > avgVol * blk.param;
        case 'adx_trending': {
          const a = adx.get(b.time);
          return a !== undefined && a >= blk.param;
        }
        case 'rsi_above_exit': {
          const r = rsi.get(b.time);
          return r !== undefined && r >= blk.param;
        }
        case 'stop_loss_pct':
          return entryPx > 0 && ((b.close - entryPx) / entryPx) * 100 <= -blk.param;
        case 'take_profit_pct':
          return entryPx > 0 && ((b.close - entryPx) / entryPx) * 100 >= blk.param;
      }
    };

    const canEnter = entryBlocks.length > 0 && entryBlocks.every(checkRule);
    const shouldExit = exitBlocks.length > 0 ? exitBlocks.some(checkRule) : !canEnter;

    if (shares === 0 && canEnter) {
      shares = cash / b.close;
      entryPx = b.close;
      cash = 0;
    } else if (shares > 0 && shouldExit) {
      const val = shares * b.close;
      if (val >= shares * entryPx) wins++;
      else losses++;
      cash = val;
      shares = 0;
      entryPx = 0;
    }

    const eq = cash + shares * b.close;
    const bench = 100000 * (b.close / startPx);
    if (eq > peak) peak = eq;
    const dd = (peak - eq) / peak;
    if (dd > maxDD) maxDD = dd;
    rets.push((eq - prevEq) / Math.max(1, prevEq));
    prevEq = eq;
    curve.push({ time: b.time, equity: Number(eq.toFixed(2)), benchmark: Number(bench.toFixed(2)) });
  }

  const finalEq = cash + shares * bars[bars.length - 1].close;
  const returnPct = Number((((finalEq - 100000) / 100000) * 100).toFixed(2));
  const buyHoldPct = Number((((bars[bars.length - 1].close - startPx) / startPx) * 100).toFixed(2));
  const trades = wins + losses;
  const winRatePct = trades > 0 ? Number(((wins / trades) * 100).toFixed(1)) : 50;
  const mean = rets.reduce((a, b) => a + b, 0) / Math.max(1, rets.length);
  const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, rets.length)) || 0.01;
  const sharpeRatio = Number(((mean / sd) * Math.sqrt(252)).toFixed(2));

  return {
    returnPct,
    buyHoldPct,
    winRatePct,
    sharpeRatio,
    maxDrawdownPct: Number((maxDD * 100).toFixed(2)),
    trades,
    equityCurve: curve,
  };
}

export function analyzeOptionStrategy(params: {
  spot: number;
  preset: OptionStrategyPreset;
  dte: number;
  baseIv: number;
  wingWidthPct: number;
  contracts: number;
}): OptionStrategyAnalysis {
  const { spot, preset, dte, baseIv, wingWidthPct, contracts } = params;
  const step = spot > 1000 ? 25 : spot > 300 ? 10 : spot > 80 ? 5 : 2.5;
  const roundStrike = (px: number) => Math.max(step, Math.round(px / step) * step);
  const atm = roundStrike(spot);
  const width = Math.max(step, roundStrike((spot * wingWidthPct) / 100) - atm || step * 2);

  const makeLeg = (action: 'BUY' | 'SELL', type: 'call' | 'put', strike: number, legDte: number): OptionStrategyLeg => {
    const moneyness = (strike - spot) / spot;
    const iv = Math.max(0.12, Math.min(0.95, baseIv - moneyness * 0.35 + moneyness * moneyness * 1.3));
    const g = blackScholesGreeks({ spot, strike, dte: legDte, iv, type });
    const sign = action === 'BUY' ? 1 : -1;
    return {
      action,
      type,
      strike,
      dte: legDte,
      contracts,
      premium: g.price,
      iv: Number((iv * 100).toFixed(1)),
      delta: Number((g.delta * sign).toFixed(3)),
      gamma: Number((g.gamma * sign).toFixed(4)),
      theta: Number((g.theta * sign).toFixed(3)),
      vega: Number((g.vega * sign).toFixed(3)),
      rho: Number((g.rho * sign).toFixed(3)),
    };
  };

  let name = '';
  let legs: OptionStrategyLeg[] = [];
  if (preset === 'iron_condor') {
    name = 'Iron Condor (Defined-Risk Short Vol)';
    const shortPut = roundStrike(atm - width);
    const longPut = Math.max(step, shortPut - width);
    const shortCall = roundStrike(atm + width);
    const longCall = shortCall + width;
    legs = [
      makeLeg('BUY', 'put', longPut, dte),
      makeLeg('SELL', 'put', shortPut, dte),
      makeLeg('SELL', 'call', shortCall, dte),
      makeLeg('BUY', 'call', longCall, dte),
    ];
  } else if (preset === 'iron_butterfly') {
    name = 'Iron Butterfly (ATM Pinning)';
    legs = [
      makeLeg('BUY', 'put', Math.max(step, atm - width * 1.5), dte),
      makeLeg('SELL', 'put', atm, dte),
      makeLeg('SELL', 'call', atm, dte),
      makeLeg('BUY', 'call', atm + width * 1.5, dte),
    ];
  } else if (preset === 'long_straddle') {
    name = 'Long Straddle (Breakout Vol Expansion)';
    legs = [makeLeg('BUY', 'call', atm, dte), makeLeg('BUY', 'put', atm, dte)];
  } else if (preset === 'long_strangle') {
    name = 'Long Strangle (OTM Tail Expansion)';
    legs = [
      makeLeg('BUY', 'put', Math.max(step, atm - width), dte),
      makeLeg('BUY', 'call', atm + width, dte),
    ];
  } else {
    name = 'Call Calendar Spread (Term Structure Play)';
    legs = [
      makeLeg('SELL', 'call', atm, dte),
      makeLeg('BUY', 'call', atm, Math.min(180, dte + 30)),
    ];
  }

  // Net cashflow per contract * 100 * contracts (+ = credit, - = debit)
  const netPerShare = legs.reduce((s, l) => s + (l.action === 'SELL' ? l.premium : -l.premium), 0);
  const netCreditOrDebit = Number((netPerShare * 100 * contracts).toFixed(2));

  const frontDte = Math.min(...legs.map((l) => l.dte));
  const loPx = Math.max(1, spot * 0.72);
  const hiPx = spot * 1.28;
  const steps = 65;
  const payoffCurve: { price: number; pnl: number }[] = [];

  for (let i = 0; i <= steps; i++) {
    const px = loPx + (i / steps) * (hiPx - loPx);
    let pnl = 0;
    for (const l of legs) {
      const mult = l.action === 'BUY' ? 1 : -1;
      let valAtFrontExp = 0;
      if (l.dte === frontDte) {
        valAtFrontExp = l.type === 'call' ? Math.max(0, px - l.strike) : Math.max(0, l.strike - px);
      } else {
        // Remaining time value on longer-dated calendar leg
        valAtFrontExp = blackScholesGreeks({
          spot: px,
          strike: l.strike,
          dte: l.dte - frontDte,
          iv: l.iv / 100,
          type: l.type,
        }).price;
      }
      pnl += mult * (valAtFrontExp - l.premium) * 100 * l.contracts;
    }
    payoffCurve.push({ price: Number(px.toFixed(2)), pnl: Number(pnl.toFixed(2)) });
  }

  // Compute breakevens by sign transitions
  const breakevens: number[] = [];
  for (let i = 1; i < payoffCurve.length; i++) {
    const a = payoffCurve[i - 1];
    const b = payoffCurve[i];
    if ((a.pnl <= 0 && b.pnl > 0) || (a.pnl >= 0 && b.pnl < 0)) {
      const ratio = Math.abs(a.pnl) / Math.max(0.01, Math.abs(a.pnl) + Math.abs(b.pnl));
      breakevens.push(Number((a.price + (b.price - a.price) * ratio).toFixed(2)));
    }
  }

  const pnls = payoffCurve.map((p) => p.pnl);
  const maxGridProfit = Math.max(...pnls);
  const minGridLoss = Math.min(...pnls);
  const isUnlimitedUpside = preset === 'long_straddle' || preset === 'long_strangle';

  // Log-normal Probability of Profit via numerical integration over payoffCurve profit bins weighted by BS terminal density
  const T = Math.max(1 / 365, frontDte / 365);
  const r = 0.043;
  const sigma = Math.max(0.08, baseIv);
  let probProfit = 0;
  for (let i = 1; i < payoffCurve.length; i++) {
    const mid = (payoffCurve[i - 1].price + payoffCurve[i].price) / 2;
    const midPnl = (payoffCurve[i - 1].pnl + payoffCurve[i].pnl) / 2;
    if (midPnl > 0) {
      const d2Hi = (Math.log(payoffCurve[i].price / spot) - (r - 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
      const d2Lo = (Math.log(payoffCurve[i - 1].price / spot) - (r - 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
      probProfit += Math.max(0, normCDF(d2Hi) - normCDF(d2Lo));
    }
    void mid;
  }
  if (isUnlimitedUpside && payoffCurve[payoffCurve.length - 1].pnl > 0) {
    const d2Top = (Math.log(hiPx / spot) - (r - 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    probProfit += 1 - normCDF(d2Top);
  }

  const netGreeks = {
    delta: Number((legs.reduce((s, l) => s + l.delta * l.contracts * 100, 0) / 100).toFixed(3)),
    gamma: Number((legs.reduce((s, l) => s + l.gamma * l.contracts * 100, 0) / 100).toFixed(4)),
    theta: Number((legs.reduce((s, l) => s + l.theta * l.contracts * 100, 0)).toFixed(2)),
    vega: Number((legs.reduce((s, l) => s + l.vega * l.contracts * 100, 0)).toFixed(2)),
    rho: Number((legs.reduce((s, l) => s + l.rho * l.contracts * 100, 0)).toFixed(2)),
  };

  return {
    preset,
    name,
    legs,
    netCreditOrDebit,
    maxProfit: isUnlimitedUpside ? 'Unlimited' : Number(Math.max(0, maxGridProfit).toFixed(2)),
    maxLoss: Number(Math.abs(Math.min(0, minGridLoss)).toFixed(2)),
    breakevens,
    probOfProfitPct: Number(Math.min(96, Math.max(4, probProfit * 100)).toFixed(1)),
    netGreeks,
    payoffCurve,
  };
}

export function buildUnusualOptionsScanner(activeSymbol: string, spotPrice: number): UnusualOptionActivity[] {
  const candidates = [
    { symbol: activeSymbol, basePx: spotPrice },
    { symbol: 'NVDA', basePx: 142 },
    { symbol: 'AAPL', basePx: 228 },
    { symbol: 'TSLA', basePx: 325 },
    { symbol: 'AMD', basePx: 158 },
    { symbol: 'META', basePx: 590 },
    { symbol: 'SPY', basePx: 595 },
  ];

  const unique = candidates.filter((c, i, arr) => arr.findIndex((x) => x.symbol === c.symbol) === i).slice(0, 6);
  const execTypes = ['SWEEP', 'BLOCK', 'SPLIT'] as const;

  return unique.flatMap((c, idx) => {
    let h = 19;
    for (let i = 0; i < c.symbol.length; i++) h = (h * 33 + c.symbol.charCodeAt(i)) >>> 0;
    const isCall = (h + idx) % 3 !== 0;
    const step = c.basePx > 300 ? 10 : 5;
    const strike = Math.round((c.basePx * (isCall ? 1.05 : 0.94)) / step) * step;
    const dte = [7, 14, 21, 35, 45][idx % 5];
    const exp = new Date(Date.now() + dte * 86400000).toISOString().slice(0, 10);
    const oi = 1200 + (h % 4500);
    const volOiRatio = Number((3.4 + ((h % 95) / 10)).toFixed(1));
    const volume = Math.round(oi * volOiRatio);
    const contractPx = Math.max(1.2, c.basePx * 0.022);
    const premiumUsd = Math.round(volume * contractPx * 100);

    return [
      {
        id: `uoa-${c.symbol}-${idx}`,
        symbol: c.symbol,
        type: isCall ? 'CALL' : 'PUT',
        strike,
        expiration: exp,
        dte,
        volume,
        openInterest: oi,
        volOiRatio,
        impliedVolPct: Number((28 + (h % 36)).toFixed(1)),
        premiumUsd,
        executionType: execTypes[(h + idx) % execTypes.length],
        sentiment: isCall ? 'Bullish' : 'Bearish',
      },
    ];
  });
}

