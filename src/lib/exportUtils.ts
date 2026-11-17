import { jsPDF } from 'jspdf';
import type { OHLCVBar, PredictionSuite, StockQuote } from '../types/market';

export function exportBarsToCSV(symbol: string, bars: OHLCVBar[]): void {
  const header = 'Timestamp,ISO_Date,Open,High,Low,Close,Volume\n';
  const rows = bars
    .map((b) => `${b.time},${new Date(b.time * 1000).toISOString()},${b.open},${b.high},${b.low},${b.close},${b.volume}`)
    .join('\n');
  downloadBlob(`${symbol}_ohlcv_${new Date().toISOString().slice(0, 10)}.csv`, header + rows, 'text/csv;charset=utf-8;');
}

export function exportGenericCSV(filename: string, headers: string[], rows: (string | number)[][]): void {
  const escape = (v: string | number) => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n');
  downloadBlob(filename, csv, 'text/csv;charset=utf-8;');
}

export function exportChartCanvasToPNG(containerEl: HTMLElement | null, symbol: string): boolean {
  if (!containerEl) return false;
  const canvases = Array.from(containerEl.querySelectorAll('canvas'));
  if (canvases.length === 0) return false;

  const rect = containerEl.getBoundingClientRect();
  const composite = document.createElement('canvas');
  composite.width = Math.max(800, Math.round(rect.width * 2));
  composite.height = Math.max(450, Math.round(rect.height * 2));
  const ctx = composite.getContext('2d');
  if (!ctx) return false;

  const isDark = document.documentElement.classList.contains('dark');
  ctx.fillStyle = isDark ? '#0B0F17' : '#FFFFFF';
  ctx.fillRect(0, 0, composite.width, composite.height);

  for (const c of canvases) {
    const cRect = c.getBoundingClientRect();
    const dx = (cRect.left - rect.left) * 2;
    const dy = (cRect.top - rect.top) * 2;
    const dw = cRect.width * 2;
    const dh = cRect.height * 2;
    if (dw > 0 && dh > 0) {
      try {
        ctx.drawImage(c, dx, dy, dw, dh);
      } catch {
        // Ignore tainted canvas
      }
    }
  }

  const url = composite.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = `${symbol}_chart_${new Date().toISOString().slice(0, 10)}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  return true;
}

export function exportEquityReportPDF(
  quote: StockQuote,
  prediction: PredictionSuite,
  aiSummary?: string
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const margin = 44;
  let y = 52;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(`Meridian Terminal — Equity Analysis Report`, margin, y);
  y += 22;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `${quote.symbol} (${quote.exchange}) · ${quote.name} · Generated ${new Date().toLocaleString()}`,
    margin,
    y
  );
  y += 22;

  doc.setDrawColor(203, 213, 225);
  doc.line(margin, y, 550, y);
  y += 20;

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Live Market Snapshot', margin, y);
  y += 18;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const lines = [
    `Last Price: ${quote.currency} ${quote.price.toFixed(2)} (${quote.change >= 0 ? '+' : ''}${quote.change.toFixed(2)} / ${quote.changePercent.toFixed(2)}%)`,
    `Day Range: ${quote.dayLow.toFixed(2)} – ${quote.dayHigh.toFixed(2)}  |  52W Range: ${quote.week52Low.toFixed(2)} – ${quote.week52High.toFixed(2)}`,
    `Volume: ${quote.volume.toLocaleString()}  |  Bid / Ask: ${quote.bid.toFixed(2)} / ${quote.ask.toFixed(2)}`,
    `P/E: ${quote.peRatio?.toFixed(2) ?? 'N/A'}  |  Beta: ${quote.beta?.toFixed(2) ?? 'N/A'}  |  Feed: ${quote.dataSource}`,
  ];
  for (const line of lines) {
    doc.text(line, margin, y);
    y += 15;
  }
  y += 12;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Ensemble ML Forecast', margin, y);
  y += 18;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  for (const h of prediction.horizons) {
    doc.text(
      `Horizon ${h.horizon.toUpperCase()}: ${h.direction} (${h.probability}% conf.) · Target ${h.targetBase.toFixed(2)} [${h.targetLow.toFixed(2)} – ${h.targetHigh.toFixed(2)}] (${h.expectedReturnPct >= 0 ? '+' : ''}${h.expectedReturnPct}%)`,
      margin,
      y
    );
    y += 15;
  }
  y += 10;

  if (prediction.patterns.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Detected Chart Patterns', margin, y);
    y += 18;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    for (const p of prediction.patterns) {
      doc.text(`${p.name} (${p.bias}, ${p.confidence}%): Target ${p.targetPrice.toFixed(2)} — ${p.description}`, margin, y, {
        maxWidth: 505,
      });
      y += 24;
    }
  }

  if (aiSummary) {
    y += 8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Analyst Brief', margin, y);
    y += 18;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    const split = doc.splitTextToSize(aiSummary, 505);
    doc.text(split.slice(0, 26), margin, y);
  }

  doc.save(`${quote.symbol}_Meridian_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
}

function downloadBlob(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
