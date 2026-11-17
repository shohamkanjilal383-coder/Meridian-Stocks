export type ExchangeCode = 'NYSE' | 'NASDAQ' | 'NSE' | 'BSE' | 'INDEX';

export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d' | '1w' | '1M';

export type HistoryRange = '1M' | '3M' | '6M' | '1Y' | '5Y' | '10Y' | 'ALL';

export type ChartStyle = 'candlestick' | 'line' | 'area' | 'heikin_ashi';

export type ChartLayoutMode = '1x1' | '1x3' | '2x2';

export interface StockSymbolInfo {
  symbol: string;
  name: string;
  exchange: ExchangeCode;
  sector: string;
  currency: string;
}

export interface StockQuote {
  symbol: string;
  name: string;
  exchange: ExchangeCode;
  currency: string;
  sector: string;
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  open: number;
  dayHigh: number;
  dayLow: number;
  week52High: number;
  week52Low: number;
  volume: number;
  avgVolume: number;
  bid: number;
  ask: number;
  bidSize: number;
  askSize: number;
  marketCap: number;
  peRatio: number | null;
  forwardPe: number | null;
  eps: number | null;
  dividendYield: number | null;
  beta: number | null;
  preMarketPrice: number | null;
  preMarketChangePercent: number | null;
  postMarketPrice: number | null;
  postMarketChangePercent: number | null;
  marketState: 'PRE' | 'REGULAR' | 'POST' | 'CLOSED';
  dataSource: 'Yahoo Finance' | 'Twelve Data' | 'Alpha Vantage' | 'Finnhub' | 'Cached Feed';
  updatedAt: number;
}

export interface OHLCVBar {
  time: number; // Unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketIndex {
  symbol: string;
  displaySymbol: string;
  name: string;
  region: string;
  price: number;
  change: number;
  changePercent: number;
  sparkline: number[];
}

export interface SectorPerformance {
  name: string;
  etf: string;
  changePercent: number;
  leader: string;
  leaderChange: number;
}

export interface MarketBreadth {
  advancing: number;
  declining: number;
  unchanged: number;
  newHighs: number;
  newLows: number;
  vix: number;
  putCallRatio: number;
  advanceDeclineRatio: number;
}

export interface MarketOverviewData {
  indices: MarketIndex[];
  sectors: SectorPerformance[];
  breadth: MarketBreadth;
  updatedAt: number;
  source: string;
}

export interface NewsArticle {
  id: string;
  title: string;
  publisher: string;
  link: string;
  publishedAt: number;
  relatedSymbols: string[];
  sentimentScore: number; // -1 to +1
  sentimentLabel: 'Bullish' | 'Neutral' | 'Bearish';
  summary: string;
}

export interface FinancialPeriodRow {
  period: string;
  revenue: number;
  grossProfit: number;
  operatingIncome: number;
  netIncome: number;
  eps: number;
  totalAssets: number;
  totalDebt: number;
  freeCashFlow: number;
}

export interface EarningsEvent {
  quarter: string;
  date: string;
  epsEstimate: number;
  epsActual: number | null;
  surprisePercent: number | null;
  revenueEstimateB: number;
}

export interface InsiderTransaction {
  name: string;
  role: string;
  date: string;
  type: 'Buy' | 'Sell' | 'Grant';
  shares: number;
  valueUsd: number;
}

export interface InstitutionalHolder {
  holder: string;
  shares: number;
  percentOut: number;
  changePercent: number;
}

export interface AnalystConsensus {
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
  targetLow: number;
  targetMean: number;
  targetHigh: number;
  ratingLabel: string;
}

export interface FundamentalsData {
  symbol: string;
  companyName: string;
  sector: string;
  industry: string;
  description: string;
  employees: number;
  headquarters: string;
  valuation: {
    pe: number;
    forwardPe: number;
    peg: number;
    pb: number;
    ps: number;
    evToEbitda: number;
  };
  profitability: {
    roe: number;
    roa: number;
    grossMargin: number;
    operatingMargin: number;
    netMargin: number;
  };
  health: {
    debtToEquity: number;
    currentRatio: number;
    quickRatio: number;
    freeCashFlowB: number;
    totalCashB: number;
    totalDebtB: number;
  };
  statements: FinancialPeriodRow[];
  earnings: EarningsEvent[];
  insiders: InsiderTransaction[];
  institutions: InstitutionalHolder[];
  analystConsensus: AnalystConsensus;
}

export interface HorizonPrediction {
  horizon: '1h' | '4h' | '1d' | '1w';
  direction: 'Bullish' | 'Bearish' | 'Neutral';
  probability: number; // 0-100
  targetLow: number;
  targetBase: number;
  targetHigh: number;
  expectedReturnPct: number;
}

export interface DetectedPattern {
  name: string;
  bias: 'Bullish' | 'Bearish' | 'Neutral';
  confidence: number;
  startIndex: number;
  endIndex: number;
  targetPrice: number;
  description: string;
}

export interface MarketAnomaly {
  time: number;
  type: 'Volume Spike' | 'Price Gap / Outlier' | 'Volatility Surge';
  severity: 'High' | 'Medium';
  zScore: number;
  detail: string;
}

export interface PredictionSuite {
  symbol: string;
  currentPrice: number;
  horizons: HorizonPrediction[];
  patterns: DetectedPattern[];
  anomalies: MarketAnomaly[];
  ensembleWeights: {
    momentumRegression: number;
    exponentialSmoothing: number;
    meanReversionOscillator: number;
    volatilityRegime: number;
  };
  newsSentimentAvg: number;
  projectedSeries: { time: number; base: number; upper80: number; lower80: number; upper95: number; lower95: number }[];
}

export interface PortfolioPosition {
  id: string;
  symbol: string;
  name: string;
  exchange: ExchangeCode;
  sector: string;
  shares: number;
  avgCost: number;
  currency: string;
  addedAt: number;
}

export interface PortfolioTransaction {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  shares: number;
  price: number;
  timestamp: number;
}

export interface SmartAlert {
  id: string;
  symbol: string;
  conditionType: 'PRICE_ABOVE' | 'PRICE_BELOW' | 'RSI_OVERBOUGHT' | 'RSI_OVERSOLD' | 'VOLUME_SPIKE' | 'NEWS_SENTIMENT';
  threshold: number;
  channels: {
    inApp: boolean;
    browserPush: boolean;
    email: boolean;
  };
  emailAddress?: string;
  active: boolean;
  triggeredAt: number | null;
  lastMessage?: string;
  createdAt: number;
}

export type DrawingToolType = 'cursor' | 'trendline' | 'horizontal' | 'channel' | 'fib_ext' | 'gann_fan';

export interface DrawingPoint {
  time: number;
  price: number;
}

export interface DrawingObject {
  id: string;
  symbol: string;
  type: Exclude<DrawingToolType, 'cursor'>;
  points: DrawingPoint[];
  color: string;
  label?: string;
}

export interface ScreenerRow {
  symbol: string;
  name: string;
  exchange: ExchangeCode;
  sector: string;
  price: number;
  changePercent: number;
  volume: number;
  volumeRatio: number;
  marketCapB: number;
  peRatio: number;
  rsi14: number;
  sma50DistPct: number;
  sma200DistPct: number;
  macdHist: number;
  signal: 'Strong Buy' | 'Buy' | 'Neutral' | 'Sell' | 'Strong Sell';
}

// --- Advanced Quant, Options, Macro, Social & Journal Types ---

export interface OptionContract {
  strike: number;
  type: 'call' | 'put';
  bid: number;
  ask: number;
  lastPrice: number;
  impliedVolatility: number; // decimal e.g. 0.28
  volume: number;
  openInterest: number;
  inTheMoney: boolean;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
}

export interface MaxPainStrikePoint {
  strike: number;
  callPainUsd: number;
  putPainUsd: number;
  totalPainUsd: number;
}

export interface OptionsFlowHeatmapCell {
  strike: number;
  dte: number;
  callPremiumUsd: number;
  putPremiumUsd: number;
  netFlowUsd: number; // positive = call net inflow, negative = put net inflow
  sweepCount: number;
  gammaNotionalM: number;
}

export interface OptionsChainData {
  symbol: string;
  spotPrice: number;
  expirations: { label: string; dte: number }[];
  selectedDte: number;
  ivRank: number;
  putCallOIRatio: number;
  maxPainStrike: number;
  maxPainCurve: MaxPainStrikePoint[];
  calls: OptionContract[];
  puts: OptionContract[];
  ivSurface: {
    dtes: number[];
    strikes: number[];
    grid: number[][]; // [dteIdx][strikeIdx] -> IV %
  };
  flowHeatmap: {
    dtes: number[];
    strikes: number[];
    cells: OptionsFlowHeatmapCell[];
  };
}

export type OptionStrategyPreset =
  | 'iron_condor'
  | 'iron_butterfly'
  | 'long_straddle'
  | 'long_strangle'
  | 'calendar_spread';

export interface OptionStrategyLeg {
  action: 'BUY' | 'SELL';
  type: 'call' | 'put';
  strike: number;
  dte: number;
  contracts: number;
  premium: number;
  iv: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
}

export interface OptionStrategyAnalysis {
  preset: OptionStrategyPreset;
  name: string;
  legs: OptionStrategyLeg[];
  netCreditOrDebit: number; // positive = credit, negative = debit (per share * 100)
  maxProfit: number | 'Unlimited';
  maxLoss: number | 'Unlimited';
  breakevens: number[];
  probOfProfitPct: number;
  netGreeks: {
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
    rho: number;
  };
  payoffCurve: { price: number; pnl: number }[];
}

export interface UnusualOptionActivity {
  id: string;
  symbol: string;
  type: 'CALL' | 'PUT';
  strike: number;
  expiration: string;
  dte: number;
  volume: number;
  openInterest: number;
  volOiRatio: number;
  impliedVolPct: number;
  premiumUsd: number;
  executionType: 'SWEEP' | 'BLOCK' | 'SPLIT';
  sentiment: 'Bullish' | 'Bearish';
}

export interface MacroInstrument {
  symbol: string;
  name: string;
  category: 'Yields' | 'Currency' | 'Volatility' | 'Commodities' | 'Crypto';
  price: number;
  unit: string;
  change: number;
  changePercent: number;
  sparkline: number[];
}

export interface VixTermPoint {
  tenor: string;
  dte: number;
  vixLevel: number;
}

export interface FearGreedData {
  score: number; // 0 - 100
  label: 'Extreme Fear' | 'Fear' | 'Neutral' | 'Greed' | 'Extreme Greed';
  components: { name: string; score: number; signal: string }[];
}

export interface EconomicHistoricalRelease {
  date: string;
  consensus: string;
  actual: string;
  surprise: 'Beat' | 'Miss' | 'In-Line';
  spx15mPct: number;
  spx1dPct: number;
  us10yBps: number;
  dxyPct: number;
}

export interface EconomicHistoricalReaction {
  avgSpxMove15mPct: number;
  avgSpxMove1dPct: number;
  avgUs10yMoveBps: number;
  avgDxyMovePct: number;
  beatAvgSpxPct: number;
  missAvgSpxPct: number;
  volatilityMultiplier: number;
  sampleSize: number;
  pastReleases: EconomicHistoricalRelease[];
}

export interface EconomicCalendarEvent {
  id: string;
  date: string;
  timeEt: string;
  country: 'US' | 'IN' | 'EU';
  event: string;
  impact: 'High' | 'Medium' | 'Low';
  consensus: string;
  previous: string;
  actual: string | null;
  surpriseStatus: 'Beat' | 'Miss' | 'In-Line' | 'Upcoming';
  marketImpactScore: number; // 1 - 10
  historicalReaction: EconomicHistoricalReaction;
}

export interface FuturesContractPoint {
  contractCode: string;
  label: string;
  dte: number;
  price: number;
  changePct: number;
  volume: number;
  openInterest: number;
  basisPct: number;
}

export interface FuturesCurveData {
  rootSymbol: string;
  yahooSymbol: string;
  name: string;
  assetClass: 'Commodities' | 'Indices' | 'Crypto';
  exchange: string;
  unit: string;
  spotPrice: number;
  frontPrice: number;
  backPrice: number;
  dayChangePct: number;
  curveRegime: 'Contango' | 'Backwardation' | 'Flat';
  annualizedRollYieldPct: number;
  curveSlopePct: number;
  totalOpenInterest: number;
  contracts: FuturesContractPoint[];
}

export interface FuturesDashboardData {
  curves: FuturesCurveData[];
  updatedAt: number;
}

export interface MacroRegimeSignal {
  factor: string;
  reading: string;
  bias: 'Risk-On' | 'Risk-Off' | 'Neutral';
  weightPct: number;
}

export interface MacroRegimeData {
  regime: 'Risk-On' | 'Risk-Off' | 'Transitional';
  confidencePct: number;
  compositeScore: number; // -100 to +100
  summary: string;
  signals: MacroRegimeSignal[];
}

export interface IntermarketPair {
  pair: string;
  relationship: 'Bonds vs Equities' | 'Commodities vs FX' | 'Growth vs Safe-Haven' | 'Carry / Risk';
  corr30d: number;
  corr90d: number;
  status: 'Aligned' | 'Diverging' | 'Stress';
  detail: string;
}

export interface MacroDashboardData {
  instruments: MacroInstrument[];
  yieldCurve: { tenor: string; yieldPct: number }[];
  spread10y2y: number;
  spread10y3m: number;
  fedFundsTarget: string;
  effectiveFedRate: number;
  inflation5yBreakeven: number;
  inflation10yBreakeven: number;
  realYield10y: number;
  vixTermStructure: VixTermPoint[];
  vixContango: boolean;
  fearGreed: FearGreedData;
  cryptoCorrelations: { pair: string; corr30d: number; corr90d: number }[];
  intermarketPairs: IntermarketPair[];
  macroRegime: MacroRegimeData;
  businessCyclePhase: 'Early Expansion' | 'Mid Cycle' | 'Late Cycle' | 'Defensive Contraction';
  updatedAt: number;
}

export interface AssetCorrelationData {
  assets: { symbol: string; label: string; assetClass: string }[];
  returnsByAsset: Record<string, number[]>;
  dates: number[];
}

export interface SectorRotationItem {
  etf: string;
  name: string;
  rsRatio: number; // ~100 centered
  rsMomentum: number; // ~100 centered
  quadrant: 'Leading' | 'Weakening' | 'Lagging' | 'Improving';
  ret1W: number;
  ret1M: number;
  ret3M: number;
  momentumScore: number;
  cycleBias: 'Early Expansion' | 'Mid Cycle' | 'Late Cycle' | 'Defensive Contraction';
}

export interface DarkPoolPrint {
  id: string;
  timestamp: number;
  symbol: string;
  price: number;
  shares: number;
  notionalUsd: number;
  venue: 'FINRA ADF' | 'EDGX Dark' | 'UBS ATS' | 'SIGMA X2' | 'IEX Midpoint';
  side: 'Accumulation' | 'Distribution' | 'Neutral Block';
}

export interface ShortInterestAnalytics {
  shortInterestShares: number;
  floatShares: number;
  shortPctOfFloat: number;
  shortInterestMoMChangePct: number;
  daysToCover: number;
  costToBorrowPct: number;
  utilizationPct: number;
  squeezeRisk: 'Low' | 'Moderate' | 'Elevated' | 'High';
  historicalSeries: { date: string; shortPctFloat: number; daysToCover: number }[];
}

export interface DarkPoolSummary {
  symbol: string;
  darkPoolPct: number;
  netInstitutionalFlowM: number;
  dixScore: number; // 0 - 100
  keyLevels: { price: number; volumeShares: number; bias: 'Support' | 'Resistance' }[];
  prints: DarkPoolPrint[];
  shortInterest: ShortInterestAnalytics;
}

export interface PeadQuarterRecord {
  quarter: string;
  epsSurprisePct: number;
  day0GapPct: number;
  drift5dPct: number;
  drift20dPct: number;
  drift30dPct: number;
}

export interface GuidanceRevisionRecord {
  quarter: string;
  announcedDate: string;
  metric: 'Revenue' | 'EPS' | 'Op Margin';
  priorGuide: string;
  revisedGuide: string;
  deltaPct: number;
  action: 'Raised' | 'Maintained' | 'Lowered';
  catalyst: string;
}

export interface AnalystEstimateMomentum {
  symbol: string;
  epsCurrentQ: number;
  eps7dAgo: number;
  eps30dAgo: number;
  eps90dAgo: number;
  upRevisions30d: number;
  downRevisions30d: number;
  revUp30d: number;
  revDown30d: number;
  estimateMomentumScore: number; // 0 - 100
  earningsEspPct: number;
  consensusTrajectory: { label: string; eps: number; revB: number }[];
}

export interface SocialPost {
  id: string;
  platform: 'Reddit' | 'X / Twitter' | 'StockTwits';
  author: string;
  subredditOrHandle: string;
  text: string;
  timestamp: number;
  upvotesOrLikes: number;
  sentimentScore: number;
  sentimentLabel: 'Bullish' | 'Neutral' | 'Bearish';
  botProbabilityPct: number;
  botFlag: 'Verified Human' | 'Suspected Bot';
}

export interface SocialSentimentData {
  symbol: string;
  overallScore: number; // -1 to +1
  humanFilteredScore: number;
  bullishPct: number;
  bearishPct: number;
  mentionVelocity24h: number;
  botTrafficPct: number;
  platformBreakdown: { platform: 'Reddit' | 'X / Twitter' | 'StockTwits'; mentions: number; bullishPct: number }[];
  posts: SocialPost[];
}

export interface AltDataPayload {
  symbol: string;
  satellite: {
    parkingLotIndex: number; // 100 = baseline
    parkingLotYoYPct: number;
    oilStorageFillPct: number;
    cropHealthNdvi: number;
    regionSummary: string;
    series: { week: string; index: number }[];
  };
  creditCard: {
    spendYoYPct: number;
    txVolumeYoYPct: number;
    avgTicketUsd: number;
    categoryLeader: string;
    monthlyTrend: { month: string; yoyPct: number }[];
  };
  webScraping: {
    openJobPostings: number;
    jobGrowthMoMPct: number;
    appDownloadsRank: number;
    appDauGrowthPct: number;
    footTrafficIndex: number;
  };
  esg: {
    totalScore: number; // 0 - 100
    envScore: number;
    socialScore: number;
    govScore: number;
    carbonIntensity: number; // tCO2e / $M rev
    netZeroTarget: string;
    peerPercentile: number;
  };
  congressionalTrades: {
    id: string;
    politician: string;
    chamber: 'Senate' | 'House';
    party: 'D' | 'R';
    ticker: string;
    txType: 'Purchase' | 'Sale';
    amountRange: string;
    txDate: string;
    disclosureDelayDays: number;
  }[];
}

export interface WhaleFiling13F {
  id: string;
  fundName: string;
  manager: string;
  symbol: string;
  action: 'New Stake' | 'Increased' | 'Reduced' | 'Exited';
  sharesM: number;
  valueUsdM: number;
  changePct: number;
  portfolioWeightPct: number;
  quarter: string;
}

export interface CopyTraderProfile {
  id: string;
  handle: string;
  strategyStyle: string;
  ytdReturnPct: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdownPct: number;
  winRatePct: number;
  copiers: number;
  aumUsdM: number;
  topHoldings: string[];
}

export interface CommunityPrediction {
  id: string;
  author: string;
  authorAccuracyPct: number;
  symbol: string;
  direction: 'Bullish' | 'Bearish';
  horizon: '7D' | '30D' | '90D';
  targetPrice: number;
  confidencePct: number;
  rationale: string;
  createdAt: number;
}

export interface StrategyBlock {
  id: string;
  kind: 'entry' | 'filter' | 'exit';
  ruleType:
    | 'sma_cross_above'
    | 'rsi_below'
    | 'macd_hist_positive'
    | 'bb_upper_breakout'
    | 'price_above_vwap'
    | 'volume_spike'
    | 'adx_trending'
    | 'rsi_above_exit'
    | 'stop_loss_pct'
    | 'take_profit_pct';
  label: string;
  param: number;
}

export interface TradeJournalEntry {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number;
  shares: number;
  entryDate: string;
  exitDate: string;
  setupTag: string;
  disciplineRating: 1 | 2 | 3 | 4 | 5;
  notes: string;
  pnlUsd: number;
  pnlPct: number;
  aiReview?: string;
}

export interface TaxHarvestCandidate {
  symbol: string;
  name: string;
  shares: number;
  costBasisTotal: number;
  marketValueTotal: number;
  unrealizedLoss: number;
  holdingTerm: 'Short-Term' | 'Long-Term';
  estimatedTaxSavings: number;
  suggestedReplacement: string;
  replacementRationale: string;
}

export interface WashSaleFlag {
  id: string;
  symbol: string;
  lossSaleDate: string;
  repurchaseDate: string;
  daysApart: number;
  disallowedLossUsd: number;
  adjustedCostBasisPerShare: number;
}

export interface Form8949Row {
  id: string;
  part: 'Part I (Short-Term)' | 'Part II (Long-Term)';
  description: string;
  dateAcquired: string;
  dateSold: string;
  proceeds: number;
  costBasis: number;
  adjustmentCode: '' | 'W';
  adjustmentAmount: number;
  gainOrLoss: number;
}

