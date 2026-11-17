import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type SeriesType,
  type UTCTimestamp,
} from 'lightweight-charts';
import {
  calcADX,
  calcATR,
  calcBollinger,
  calcCCI,
  calcDonchian,
  calcEMA,
  calcFibonacciLevels,
  calcIchimoku,
  calcKeltner,
  calcMACD,
  calcMFI,
  calcOBV,
  calcParabolicSAR,
  calcPivotPoints,
  calcROC,
  calcRSI,
  calcSMA,
  calcStochastic,
  calcStochRSI,
  calcSuperTrend,
  calcVWAP,
  calcWMA,
  calcWilliamsR,
  toHeikinAshi,
} from '../lib/indicators';
import type {
  ChartStyle,
  DrawingObject,
  DrawingPoint,
  DrawingToolType,
  HistoryRange,
  OHLCVBar,
  PredictionSuite,
  StockQuote,
} from '../types/market';

interface TradingChartProps {
  symbol: string;
  bars: OHLCVBar[];
  quote?: StockQuote;
  chartStyle: ChartStyle;
  visibleRange?: HistoryRange;
  activeIndicators: string[];
  activeTool: DrawingToolType;
  drawings: DrawingObject[];
  onAddDrawing: (drawing: DrawingObject) => void;
  prediction?: PredictionSuite;
  showForecastOverlay?: boolean;
  darkMode: boolean;
  highContrast: boolean;
  height?: number;
  syncedCrosshair?: { time: number; sourceId: string } | null;
  paneId: string;
  onCrosshairMove?: (payload: { time: number; sourceId: string } | null) => void;
  containerRefOut?: React.RefObject<HTMLDivElement | null>;
}

export const TradingChart: React.FC<TradingChartProps> = ({
  symbol,
  bars,
  quote,
  chartStyle,
  visibleRange = 'ALL',
  activeIndicators,
  activeTool,
  drawings,
  onAddDrawing,
  prediction,
  showForecastOverlay = false,
  darkMode,
  highContrast,
  height = 440,
  syncedCrosshair,
  paneId,
  onCrosshairMove,
  containerRefOut,
}) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const priceContainerRef = useRef<HTMLDivElement>(null);
  const oscContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const oscChartRef = useRef<IChartApi | null>(null);
  const mainSeriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const isSyncingRef = useRef(false);

  const [draftPoints, setDraftPoints] = useState<DrawingPoint[]>([]);
  const [hoverPoint, setHoverPoint] = useState<DrawingPoint | null>(null);
  const [svgRevision, setSvgRevision] = useState(0);
  const [ohlcReadout, setOhlcReadout] = useState<OHLCVBar | null>(null);

  const activeOscillators = useMemo(
    () =>
      activeIndicators.filter((id) =>
        ['rsi', 'macd', 'stoch', 'stochrsi', 'atr', 'adx', 'obv', 'cci', 'willr', 'mfi', 'roc'].includes(id)
      ),
    [activeIndicators]
  );

  const hasOscillator = activeOscillators.length > 0;
  const priceHeight = hasOscillator ? Math.round(height * 0.72) : height;
  const oscHeight = hasOscillator ? Math.max(110, height - priceHeight - 4) : 0;

  const displayBars = useMemo(() => {
    if (bars.length === 0) return [];
    const cloned = bars.map((b) => ({ ...b }));
    if (quote && cloned.length > 0) {
      const last = cloned[cloned.length - 1];
      last.close = quote.price;
      last.high = Math.max(last.high, quote.price);
      last.low = Math.min(last.low, quote.price);
    }
    return chartStyle === 'heikin_ashi' ? toHeikinAshi(cloned) : cloned;
  }, [bars, quote?.price, chartStyle]);

  const barByTimeMap = useMemo(() => {
    const m = new Map<number, OHLCVBar>();
    for (const b of displayBars) m.set(b.time, b);
    return m;
  }, [displayBars]);

  const firstBarTime = displayBars[0]?.time ?? 0;
  const lastBarTime = displayBars[displayBars.length - 1]?.time ?? 0;

  const applyRangeToCharts = (
    mainChart: IChartApi | null,
    oscChart: IChartApi | null,
    range: HistoryRange
  ) => {
    if (!mainChart || displayBars.length === 0) return;
    if (range === 'ALL') {
      mainChart.timeScale().fitContent();
      oscChart?.timeScale().fitContent();
      return;
    }
    const daysMap: Record<Exclude<HistoryRange, 'ALL'>, number> = {
      '1M': 30,
      '3M': 90,
      '6M': 180,
      '1Y': 365,
      '5Y': 365 * 5,
      '10Y': 365 * 10,
    };
    const spanSec = daysMap[range] * 86400;
    const toTime = lastBarTime;
    const fromTime = toTime - spanSec;
    if (fromTime <= firstBarTime) {
      mainChart.timeScale().fitContent();
      oscChart?.timeScale().fitContent();
      return;
    }
    try {
      mainChart.timeScale().setVisibleRange({
        from: fromTime as UTCTimestamp,
        to: toTime as UTCTimestamp,
      });
      oscChart?.timeScale().setVisibleRange({
        from: fromTime as UTCTimestamp,
        to: toTime as UTCTimestamp,
      });
    } catch {
      mainChart.timeScale().fitContent();
      oscChart?.timeScale().fitContent();
    }
  };

  // Build main & oscillator charts
  useEffect(() => {
    const el = priceContainerRef.current;
    if (!el || displayBars.length === 0) return;

    const bg = highContrast
      ? darkMode ? '#000000' : '#FFFFFF'
      : darkMode ? '#0B0F17' : '#FFFFFF';
    const textCol = highContrast
      ? darkMode ? '#FFFFFF' : '#000000'
      : darkMode ? '#94A3B8' : '#475569';
    const gridCol = darkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(15, 23, 42, 0.06)';
    const upCol = highContrast ? (darkMode ? '#00FF88' : '#006622') : (darkMode ? '#22C55E' : '#15803D');
    const dnCol = highContrast ? (darkMode ? '#FF3B5C' : '#B3001B') : (darkMode ? '#EF4444' : '#B91C1C');

    const chart = createChart(el, {
      width: el.clientWidth,
      height: priceHeight,
      layout: {
        background: { type: ColorType.Solid, color: bg },
        textColor: textCol,
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: gridCol },
        horzLines: { color: gridCol },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(56, 189, 248, 0.5)', labelBackgroundColor: '#0284C7' },
        horzLine: { color: 'rgba(56, 189, 248, 0.5)', labelBackgroundColor: '#0284C7' },
      },
      rightPriceScale: {
        borderColor: darkMode ? '#1F2937' : '#E2E8F0',
      },
      timeScale: {
        borderColor: darkMode ? '#1F2937' : '#E2E8F0',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    chartRef.current = chart;

    let mainSeries: ISeriesApi<SeriesType>;
    if (chartStyle === 'line') {
      const s = chart.addSeries(LineSeries, { color: '#38BDF8', lineWidth: 2 });
      s.setData(displayBars.map((b) => ({ time: b.time as UTCTimestamp, value: b.close })));
      mainSeries = s;
    } else if (chartStyle === 'area') {
      const s = chart.addSeries(AreaSeries, {
        lineColor: '#38BDF8',
        topColor: 'rgba(56, 189, 248, 0.32)',
        bottomColor: 'rgba(56, 189, 248, 0.02)',
        lineWidth: 2,
      });
      s.setData(displayBars.map((b) => ({ time: b.time as UTCTimestamp, value: b.close })));
      mainSeries = s;
    } else {
      const s = chart.addSeries(CandlestickSeries, {
        upColor: upCol,
        downColor: dnCol,
        borderUpColor: upCol,
        borderDownColor: dnCol,
        wickUpColor: upCol,
        wickDownColor: dnCol,
      });
      s.setData(
        displayBars.map((b) => ({
          time: b.time as UTCTimestamp,
          open: b.open,
          high: b.high,
          low: b.low,
          close: b.close,
        }))
      );
      mainSeries = s;
    }
    mainSeriesRef.current = mainSeries;

    // Volume histogram at bottom 18%
    const volSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'vol',
    });
    chart.priceScale('vol').applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });
    volSeries.setData(
      displayBars.map((b) => ({
        time: b.time as UTCTimestamp,
        value: b.volume,
        color: b.close >= b.open ? 'rgba(34, 197, 94, 0.25)' : 'rgba(239, 68, 68, 0.25)',
      }))
    );

    const addOverlayLine = (pts: { time: number; value: number }[], color: string, width = 1.5, style = LineStyle.Solid) => {
      if (pts.length === 0) return;
      const l = chart.addSeries(LineSeries, {
        color,
        lineWidth: width as 1 | 2 | 3 | 4,
        lineStyle: style,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      l.setData(pts.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
    };

    // Overlays
    if (activeIndicators.includes('sma20')) addOverlayLine(calcSMA(displayBars, 20), '#F59E0B');
    if (activeIndicators.includes('sma50')) addOverlayLine(calcSMA(displayBars, 50), '#38BDF8');
    if (activeIndicators.includes('sma200')) addOverlayLine(calcSMA(displayBars, 200), '#A855F7');
    if (activeIndicators.includes('ema9')) addOverlayLine(calcEMA(displayBars, 9), '#10B981');
    if (activeIndicators.includes('ema21')) addOverlayLine(calcEMA(displayBars, 21), '#EC4899');
    if (activeIndicators.includes('ema50')) addOverlayLine(calcEMA(displayBars, 50), '#6366F1');
    if (activeIndicators.includes('wma20')) addOverlayLine(calcWMA(displayBars, 20), '#14B8A6');
    if (activeIndicators.includes('vwap')) addOverlayLine(calcVWAP(displayBars), '#F97316', 2);

    if (activeIndicators.includes('bb')) {
      const bb = calcBollinger(displayBars, 20, 2);
      addOverlayLine(bb.upper, 'rgba(56, 189, 248, 0.7)', 1, LineStyle.Dashed);
      addOverlayLine(bb.middle, 'rgba(56, 189, 248, 0.45)', 1);
      addOverlayLine(bb.lower, 'rgba(56, 189, 248, 0.7)', 1, LineStyle.Dashed);
    }
    if (activeIndicators.includes('keltner')) {
      const kc = calcKeltner(displayBars);
      addOverlayLine(kc.upper, '#FB7185', 1, LineStyle.Dotted);
      addOverlayLine(kc.lower, '#FB7185', 1, LineStyle.Dotted);
    }
    if (activeIndicators.includes('donchian')) {
      const dc = calcDonchian(displayBars);
      addOverlayLine(dc.upper, '#34D399', 1);
      addOverlayLine(dc.lower, '#34D399', 1);
    }
    if (activeIndicators.includes('ichimoku')) {
      const ichi = calcIchimoku(displayBars);
      addOverlayLine(ichi.tenkan, '#EF4444', 1);
      addOverlayLine(ichi.kijun, '#3B82F6', 1);
      addOverlayLine(ichi.senkouA, 'rgba(34, 197, 94, 0.55)', 1, LineStyle.Dashed);
      addOverlayLine(ichi.senkouB, 'rgba(239, 68, 68, 0.55)', 1, LineStyle.Dashed);
    }
    if (activeIndicators.includes('psar')) {
      const psar = calcParabolicSAR(displayBars);
      const s = chart.addSeries(LineSeries, {
        color: '#FBBF24',
        lineVisible: false,
        pointMarkersVisible: true,
        pointMarkersRadius: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      s.setData(psar.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
    }
    if (activeIndicators.includes('supertrend')) {
      addOverlayLine(calcSuperTrend(displayBars), '#22D3EE', 2);
    }
    if (activeIndicators.includes('fib')) {
      const fib = calcFibonacciLevels(displayBars);
      fib?.levels.forEach((lvl) => {
        mainSeries.createPriceLine({
          price: lvl.price,
          color: 'rgba(245, 158, 11, 0.55)',
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: `Fib ${lvl.label}`,
        });
      });
    }
    if (activeIndicators.includes('pivots')) {
      const piv = calcPivotPoints(displayBars);
      if (piv) {
        [
          { p: piv.r2, t: 'R2', c: 'rgba(239, 68, 68, 0.6)' },
          { p: piv.r1, t: 'R1', c: 'rgba(239, 68, 68, 0.45)' },
          { p: piv.pivot, t: 'PP', c: 'rgba(56, 189, 248, 0.7)' },
          { p: piv.s1, t: 'S1', c: 'rgba(34, 197, 94, 0.45)' },
          { p: piv.s2, t: 'S2', c: 'rgba(34, 197, 94, 0.6)' },
        ].forEach((lvl) => {
          mainSeries.createPriceLine({
            price: lvl.p,
            color: lvl.c,
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            axisLabelVisible: true,
            title: lvl.t,
          });
        });
      }
    }

    // ML Projected Forecast Cone Overlay
    if (showForecastOverlay && prediction && prediction.projectedSeries.length > 0) {
      const lastBar = displayBars[displayBars.length - 1];
      const anchor = { time: lastBar.time, value: lastBar.close };
      addOverlayLine(
        [anchor, ...prediction.projectedSeries.map((p) => ({ time: p.time, value: p.base }))],
        '#38BDF8',
        2,
        LineStyle.Dashed
      );
      addOverlayLine(
        [anchor, ...prediction.projectedSeries.map((p) => ({ time: p.time, value: p.upper80 }))],
        'rgba(34, 197, 94, 0.6)',
        1,
        LineStyle.Dotted
      );
      addOverlayLine(
        [anchor, ...prediction.projectedSeries.map((p) => ({ time: p.time, value: p.lower80 }))],
        'rgba(239, 68, 68, 0.6)',
        1,
        LineStyle.Dotted
      );
    }

    chart.timeScale().fitContent();

    // Oscillator sub-chart
    let oscChart: IChartApi | null = null;
    if (hasOscillator && oscContainerRef.current) {
      const oscEl = oscContainerRef.current;
      oscChart = createChart(oscEl, {
        width: oscEl.clientWidth,
        height: oscHeight,
        layout: {
          background: { type: ColorType.Solid, color: bg },
          textColor: textCol,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
        },
        grid: {
          vertLines: { color: gridCol },
          horzLines: { color: gridCol },
        },
        rightPriceScale: { borderColor: darkMode ? '#1F2937' : '#E2E8F0' },
        timeScale: { borderColor: darkMode ? '#1F2937' : '#E2E8F0', timeVisible: true },
      });
      oscChartRef.current = oscChart;

      const oscId = activeOscillators[0];
      const addOscLine = (pts: { time: number; value: number }[], color: string) => {
        const s = oscChart!.addSeries(LineSeries, { color, lineWidth: 2, priceLineVisible: false });
        s.setData(pts.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
        return s;
      };

      if (oscId === 'rsi') {
        const s = addOscLine(calcRSI(displayBars, 14), '#38BDF8');
        s.createPriceLine({ price: 70, color: 'rgba(239, 68, 68, 0.5)', lineWidth: 1, lineStyle: LineStyle.Dashed, title: 'OB' });
        s.createPriceLine({ price: 30, color: 'rgba(34, 197, 94, 0.5)', lineWidth: 1, lineStyle: LineStyle.Dashed, title: 'OS' });
      } else if (oscId === 'macd') {
        const m = calcMACD(displayBars);
        const h = oscChart.addSeries(HistogramSeries, { priceLineVisible: false });
        h.setData(m.histogram.map((x) => ({ time: x.time as UTCTimestamp, value: x.value, color: x.color })));
        addOscLine(m.macd, '#38BDF8');
        addOscLine(m.signal, '#F59E0B');
      } else if (oscId === 'stoch') {
        const st = calcStochastic(displayBars);
        addOscLine(st.k, '#38BDF8');
        addOscLine(st.d, '#F59E0B');
      } else if (oscId === 'stochrsi') {
        addOscLine(calcStochRSI(displayBars), '#A855F7');
      } else if (oscId === 'atr') {
        addOscLine(calcATR(displayBars), '#F59E0B');
      } else if (oscId === 'adx') {
        const a = calcADX(displayBars);
        addOscLine(a.adx, '#E2E8F0');
        addOscLine(a.plusDI, '#22C55E');
        addOscLine(a.minusDI, '#EF4444');
      } else if (oscId === 'obv') {
        addOscLine(calcOBV(displayBars), '#10B981');
      } else if (oscId === 'cci') {
        addOscLine(calcCCI(displayBars), '#38BDF8');
      } else if (oscId === 'willr') {
        addOscLine(calcWilliamsR(displayBars), '#EC4899');
      } else if (oscId === 'mfi') {
        addOscLine(calcMFI(displayBars), '#14B8A6');
      } else if (oscId === 'roc') {
        addOscLine(calcROC(displayBars), '#F97316');
      }

      oscChart.timeScale().fitContent();
      chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        setSvgRevision((r) => r + 1);
        if (range && oscChart) {
          oscChart.timeScale().setVisibleLogicalRange(range);
        }
      });
    } else {
      oscChartRef.current = null;
      chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
        setSvgRevision((r) => r + 1);
      });
    }

    // Crosshair sync & OHLC readout
    chart.subscribeCrosshairMove((param) => {
      if (param.time) {
        const t = Number(param.time);
        const match = barByTimeMap.get(t);
        if (match) setOhlcReadout(match);
        if (!isSyncingRef.current && onCrosshairMove) {
          onCrosshairMove({ time: t, sourceId: paneId });
        }
      } else {
        setOhlcReadout(null);
        if (!isSyncingRef.current && onCrosshairMove) {
          onCrosshairMove(null);
        }
      }
    });

    applyRangeToCharts(chart, oscChart, visibleRange);

    const handleResize = () => {
      if (priceContainerRef.current) {
        chart.applyOptions({ width: priceContainerRef.current.clientWidth });
      }
      if (oscChart && oscContainerRef.current) {
        oscChart.applyOptions({ width: oscContainerRef.current.clientWidth });
      }
      setSvgRevision((r) => r + 1);
    };
    const ro = new ResizeObserver(handleResize);
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      if (oscChart) oscChart.remove();
      chartRef.current = null;
      oscChartRef.current = null;
      mainSeriesRef.current = null;
    };
  }, [
    symbol,
    displayBars.length,
    firstBarTime,
    lastBarTime,
    chartStyle,
    activeIndicators.join(','),
    showForecastOverlay,
    darkMode,
    highContrast,
    priceHeight,
    oscHeight,
    hasOscillator,
  ]);

  // Apply quick range zoom changes without tearing down chart instance
  useEffect(() => {
    applyRangeToCharts(chartRef.current, oscChartRef.current, visibleRange);
  }, [visibleRange, displayBars.length, firstBarTime, lastBarTime]);

  // Live tick update on the last bar without rebuilding the chart
  useEffect(() => {
    const series = mainSeriesRef.current;
    if (!series || displayBars.length === 0 || !quote) return;
    const last = displayBars[displayBars.length - 1];
    try {
      if (chartStyle === 'line' || chartStyle === 'area') {
        series.update({ time: last.time as UTCTimestamp, value: quote.price });
      } else {
        series.update({
          time: last.time as UTCTimestamp,
          open: last.open,
          high: Math.max(last.high, quote.price),
          low: Math.min(last.low, quote.price),
          close: quote.price,
        });
      }
    } catch {
      // Ignore out-of-order updates on timeframe switch
    }
  }, [quote?.price, chartStyle]);

  // Synchronized crosshair from sibling charts
  useEffect(() => {
    const chart = chartRef.current;
    const series = mainSeriesRef.current;
    if (!chart || !series) return;
    if (!syncedCrosshair || syncedCrosshair.sourceId === paneId) return;
    const bar = barByTimeMap.get(syncedCrosshair.time);
    if (!bar) return;
    isSyncingRef.current = true;
    try {
      chart.setCrosshairPosition(bar.close, bar.time as UTCTimestamp, series);
    } catch {
      // Ignore if timestamp outside pane range
    }
    isSyncingRef.current = false;
  }, [syncedCrosshair, paneId, barByTimeMap]);

  // Sync ref out for PNG export
  useEffect(() => {
    if (containerRefOut && wrapperRef.current) {
      (containerRefOut as React.MutableRefObject<HTMLDivElement | null>).current = wrapperRef.current;
    }
  }, [containerRefOut]);

  // Convert mouse event to chart (time, price) for drawing tools
  const eventToPoint = (e: React.MouseEvent<SVGSVGElement>): DrawingPoint | null => {
    const chart = chartRef.current;
    const series = mainSeriesRef.current;
    const svg = e.currentTarget;
    if (!chart || !series || displayBars.length === 0) return null;
    const rect = svg.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const price = series.coordinateToPrice(y);
    const timeVal = chart.timeScale().coordinateToTime(x);
    if (price === null) return null;
    const resolvedTime = timeVal ? Number(timeVal) : displayBars[displayBars.length - 1].time;
    return { time: resolvedTime, price: Number(price.toFixed(2)) };
  };

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (activeTool === 'cursor') return;
    const pt = eventToPoint(e);
    if (!pt) return;

    const palette: Record<Exclude<DrawingToolType, 'cursor'>, string> = {
      trendline: '#38BDF8',
      horizontal: '#F59E0B',
      channel: '#A855F7',
      fib_ext: '#10B981',
      gann_fan: '#EC4899',
    };

    if (activeTool === 'horizontal') {
      onAddDrawing({
        id: `drw-${Date.now()}`,
        symbol,
        type: 'horizontal',
        points: [pt],
        color: palette.horizontal,
        label: `S/R ${pt.price.toFixed(2)}`,
      });
      setDraftPoints([]);
      return;
    }

    if (draftPoints.length === 0) {
      setDraftPoints([pt]);
    } else {
      onAddDrawing({
        id: `drw-${Date.now()}`,
        symbol,
        type: activeTool,
        points: [draftPoints[0], pt],
        color: palette[activeTool],
      });
      setDraftPoints([]);
      setHoverPoint(null);
    }
  };

  const pointToXY = (pt: DrawingPoint): { x: number; y: number } | null => {
    const chart = chartRef.current;
    const series = mainSeriesRef.current;
    if (!chart || !series) return null;
    const x = chart.timeScale().timeToCoordinate(pt.time as UTCTimestamp);
    const y = series.priceToCoordinate(pt.price);
    if (x === null || y === null) return null;
    return { x, y };
  };

  // Trigger svg coordinate recalculation with svgRevision
  const renderDrawing = (d: Pick<DrawingObject, 'id' | 'type' | 'points' | 'color' | 'label'>, isDraft = false) => {
    void svgRevision;
    const p1 = pointToXY(d.points[0]);
    if (!p1) return null;
    const width = priceContainerRef.current?.clientWidth ?? 800;

    if (d.type === 'horizontal') {
      return (
        <g key={d.id} opacity={isDraft ? 0.65 : 1}>
          <line x1={0} y1={p1.y} x2={width} y2={p1.y} stroke={d.color} strokeWidth={1.5} strokeDasharray="5 4" />
          <text x={10} y={p1.y - 5} fill={d.color} fontSize="10" fontFamily="JetBrains Mono, monospace">
            {d.label ?? d.points[0].price.toFixed(2)}
          </text>
        </g>
      );
    }

    const p2 = d.points[1] ? pointToXY(d.points[1]) : null;
    if (!p2) return null;

    if (d.type === 'trendline') {
      return (
        <g key={d.id} opacity={isDraft ? 0.7 : 1}>
          <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={d.color} strokeWidth={2} />
          <circle cx={p1.x} cy={p1.y} r={3.5} fill={d.color} />
          <circle cx={p2.x} cy={p2.y} r={3.5} fill={d.color} />
        </g>
      );
    }

    if (d.type === 'channel') {
      const offset = 36;
      return (
        <g key={d.id} opacity={isDraft ? 0.7 : 1}>
          <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={d.color} strokeWidth={1.75} />
          <line x1={p1.x} y1={p1.y - offset} x2={p2.x} y2={p2.y - offset} stroke={d.color} strokeWidth={1.5} strokeDasharray="4 3" />
          <polygon
            points={`${p1.x},${p1.y} ${p2.x},${p2.y} ${p2.x},${p2.y - offset} ${p1.x},${p1.y - offset}`}
            fill={d.color}
            fillOpacity={0.08}
          />
        </g>
      );
    }

    if (d.type === 'fib_ext') {
      const ratios = [0, 0.382, 0.618, 1, 1.618];
      const dy = p2.y - p1.y;
      return (
        <g key={d.id} opacity={isDraft ? 0.7 : 1}>
          <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={d.color} strokeWidth={1} strokeDasharray="3 3" />
          {ratios.map((r) => {
            const ly = p1.y + dy * r;
            return (
              <g key={r}>
                <line x1={Math.min(p1.x, p2.x)} y1={ly} x2={Math.max(p1.x, p2.x) + 120} y2={ly} stroke={d.color} strokeWidth={1.2} strokeOpacity={0.75} />
                <text x={Math.min(p1.x, p2.x) + 4} y={ly - 3} fill={d.color} fontSize="9.5" fontFamily="JetBrains Mono, monospace">
                  {(r * 100).toFixed(1)}%
                </text>
              </g>
            );
          })}
        </g>
      );
    }

    if (d.type === 'gann_fan') {
      const angles = [0.25, 0.5, 1, 2, 4];
      const dx = p2.x - p1.x || 1;
      const dy = p2.y - p1.y;
      return (
        <g key={d.id} opacity={isDraft ? 0.7 : 1}>
          {angles.map((mult) => (
            <line
              key={mult}
              x1={p1.x}
              y1={p1.y}
              x2={p1.x + dx * 2}
              y2={p1.y + dy * mult * 2}
              stroke={d.color}
              strokeWidth={mult === 1 ? 1.8 : 1.1}
              strokeOpacity={mult === 1 ? 0.95 : 0.6}
            />
          ))}
        </g>
      );
    }

    return null;
  };

  const activeBar = ohlcReadout ?? displayBars[displayBars.length - 1];

  return (
    <div ref={wrapperRef} className="relative flex flex-col select-none">
      {/* Compact OHLCV HUD */}
      {activeBar && (
        <div className="pointer-events-none absolute top-2 left-3 z-20 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono tabular-nums bg-white/85 dark:bg-[#0B0F17]/85 px-2 py-1 rounded border border-slate-200/70 dark:border-slate-800/80">
          <span className="font-semibold text-slate-900 dark:text-slate-100">{symbol}</span>
          <span className="text-slate-500 dark:text-slate-400">
            O <strong className="text-slate-800 dark:text-slate-200 font-medium">{activeBar.open.toFixed(2)}</strong>
          </span>
          <span className="text-slate-500 dark:text-slate-400">
            H <strong className="text-slate-800 dark:text-slate-200 font-medium">{activeBar.high.toFixed(2)}</strong>
          </span>
          <span className="text-slate-500 dark:text-slate-400">
            L <strong className="text-slate-800 dark:text-slate-200 font-medium">{activeBar.low.toFixed(2)}</strong>
          </span>
          <span className="text-slate-500 dark:text-slate-400">
            C <strong className="text-slate-800 dark:text-slate-200 font-medium">{activeBar.close.toFixed(2)}</strong>
          </span>
          <span className="text-slate-500 dark:text-slate-400">
            V <strong className="text-slate-800 dark:text-slate-200 font-medium">{(activeBar.volume / 1e6).toFixed(2)}M</strong>
          </span>
        </div>
      )}

      {/* Main Price Chart */}
      <div className="relative w-full" style={{ height: priceHeight }}>
        <div ref={priceContainerRef} className="w-full h-full" />
        {/* Interactive Drawing Overlay */}
        <svg
          onClick={handleSvgClick}
          onMouseMove={(e) => {
            if (activeTool !== 'cursor' && draftPoints.length === 1) {
              setHoverPoint(eventToPoint(e));
            }
          }}
          className={`absolute inset-0 z-10 w-full h-full ${
            activeTool === 'cursor' ? 'pointer-events-none' : 'cursor-crosshair pointer-events-auto'
          }`}
        >
          {drawings.filter((d) => d.symbol === symbol).map((d) => renderDrawing(d))}
          {activeTool !== 'cursor' &&
            draftPoints.length === 1 &&
            hoverPoint &&
            renderDrawing(
              {
                id: 'draft',
                type: activeTool,
                points: [draftPoints[0], hoverPoint],
                color: '#38BDF8',
              },
              true
            )}
        </svg>
      </div>

      {/* Oscillator Pane */}
      {hasOscillator && (
        <div className="relative w-full border-t border-slate-200 dark:border-slate-800" style={{ height: oscHeight }}>
          <div className="pointer-events-none absolute top-1 left-3 z-10 text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {activeOscillators[0]}
          </div>
          <div ref={oscContainerRef} className="w-full h-full" />
        </div>
      )}
    </div>
  );
};
