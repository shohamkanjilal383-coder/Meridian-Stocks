import React, { useState } from 'react';
import { Bot, FileText, Send, Sparkles } from 'lucide-react';
import { exportEquityReportPDF } from '../lib/exportUtils';
import type { FundamentalsData, NewsArticle, PredictionSuite, StockQuote } from '../types/market';

interface AiAssistantPanelProps {
  symbol: string;
  quote?: StockQuote;
  prediction: PredictionSuite;
  fundamentals: FundamentalsData | null;
  news: NewsArticle[];
}

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
}

export const AiAssistantPanel: React.FC<AiAssistantPanelProps> = ({
  symbol,
  quote,
  prediction,
  fundamentals,
  news,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'model',
      text: `Ready to analyze ${symbol} using live quote, technical indicators, ensemble forecasts, and news sentiment. Ask a question or generate a structured research memo.`,
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedReport, setGeneratedReport] = useState<string | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);

  const sendMessage = async (promptText: string) => {
    const trimmed = promptText.trim();
    if (!trimmed || loading) return;
    setError(null);

    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', text: trimmed };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          history: nextHistory.slice(-8).map((m) => ({ role: m.role, text: m.text })),
          marketContext: {
            symbol,
            quote,
            horizons: prediction.horizons,
            patterns: prediction.patterns,
            anomalies: prediction.anomalies,
            headlines: news.slice(0, 5).map((n) => ({ title: n.title, sentiment: n.sentimentLabel })),
            valuation: fundamentals?.valuation,
          },
        }),
      });
      const data = (await res.json()) as { reply?: string; error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Failed to get AI response');
      }
      setMessages((prev) => [
        ...prev,
        { id: `m-${Date.now()}`, role: 'model', text: data.reply || 'No response returned.' },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reach AI endpoint');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateReport = async () => {
    if (generatingReport) return;
    setError(null);
    setGeneratingReport(true);
    try {
      const res = await fetch('/api/ai/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          quote,
          prediction,
          fundamentals,
          news: news.slice(0, 6),
        }),
      });
      const data = (await res.json()) as { report?: string; error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Report generation failed');
      }
      setGeneratedReport(data.report || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Report generation failed');
    } finally {
      setGeneratingReport(false);
    }
  };

  const quickPrompts = [
    `Why did ${symbol} move today?`,
    'Show me bullish technical setups for tech',
    `Explain ${symbol} support/resistance & ensemble targets`,
    'How should I size a trade using Half-Kelly?',
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Chat Workspace */}
      <div className="lg:col-span-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] flex flex-col h-[540px]">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-sky-500" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Quantitative Research Assistant
            </h3>
          </div>
          <span className="text-[11px] font-mono text-slate-500">Context: {symbol}</span>
        </div>

        {/* Quick Prompt Chips */}
        <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-800 flex flex-wrap gap-1.5">
          {quickPrompts.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => sendMessage(p)}
              className="rounded border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-[11px] text-slate-700 dark:text-slate-300 hover:border-sky-500 hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
            >
              {p}
            </button>
          ))}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`max-w-[88%] rounded-lg px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'ml-auto bg-sky-600 text-white'
                  : 'mr-auto border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#182235] text-slate-800 dark:text-slate-200'
              }`}
            >
              {m.text}
            </div>
          ))}
          {loading && (
            <div className="mr-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#182235] px-3.5 py-2.5 text-xs text-slate-500 animate-pulse">
              Synthesizing live market &amp; technical context...
            </div>
          )}
          {error && (
            <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400">
              {error}
            </div>
          )}
        </div>

        {/* Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage(input);
          }}
          className="p-3 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Ask about ${symbol}, sector setups, or quantitative strategies...`}
            className="flex-1 rounded-md border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-xs focus:border-sky-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-sky-600 hover:bg-sky-700 disabled:opacity-50 px-3.5 py-2 text-xs font-semibold text-white transition-colors"
          >
            <Send className="w-3.5 h-3.5" aria-hidden="true" />
            Ask
          </button>
        </form>
      </div>

      {/* Automated Research Report Generator */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4 flex flex-col h-[540px]">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-sky-500" aria-hidden="true" />
              Automated Research Brief
            </h3>
            <p className="text-[11px] text-slate-500">Institutional memo for {symbol}</p>
          </div>
          <button
            type="button"
            onClick={handleGenerateReport}
            disabled={generatingReport}
            className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 dark:bg-slate-100 px-3 py-1.5 text-xs font-semibold text-white dark:text-slate-900 hover:opacity-90 disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            {generatingReport ? 'Drafting...' : 'Generate'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-3 text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
          {generatedReport ? (
            generatedReport
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 px-4">
              <FileText className="w-7 h-7 text-slate-400 mb-2" aria-hidden="true" />
              Click <strong>Generate</strong> to synthesize an institutional equity research report from live price action, chart patterns, and fundamentals.
            </div>
          )}
        </div>

        {quote && (
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => exportEquityReportPDF(quote, prediction, generatedReport ?? undefined)}
              className="w-full rounded-md border border-slate-300 dark:border-slate-700 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Download Full PDF Report
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
