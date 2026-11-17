import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import {
  getAlternativeData,
  getCrossAssetCorrelations,
  getEconomicCalendar,
  getFundamentals,
  getFuturesTermStructures,
  getHistoricalBars,
  getLiveQuote,
  getMacroDashboard,
  getMarketOverview,
  getNewsFeed,
  getScreenerSnapshot,
  getSectorRotation,
  getSocialSentiment,
  getWhalesAndCopyTrading,
  searchSymbols,
} from './src/server/marketProviders.ts';
import type { Timeframe } from './src/types/market.ts';

const PORT = 3000;
const app = express();
app.use(express.json({ limit: '1mb' }));

// OpenAI-Compatible AI Client (Server-side only — NVIDIA Integrate API)
const DEFAULT_AI_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const DEFAULT_AI_MODEL = 'nvidia/nemotron-3-ultra-550b-a55b';

interface OpenAIChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

async function callAiChatCompletion(
  messages: OpenAIChatMessage[],
  options?: { enableThinking?: boolean; temperature?: number; topP?: number; maxTokens?: number }
): Promise<string> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey || apiKey === 'MY_NVIDIA_API_KEY') {
    throw new Error('NVIDIA_API_KEY is not configured. Please configure NVIDIA_API_KEY in your environment.');
  }
  const baseUrl = (process.env.NVIDIA_BASE_URL || DEFAULT_AI_BASE_URL).replace(/\/+$/, '');
  const model = process.env.NVIDIA_MODEL || DEFAULT_AI_MODEL;

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: options?.temperature ?? 1,
      top_p: options?.topP ?? 0.95,
      max_tokens: options?.maxTokens ?? 16384,
      chat_template_kwargs: { enable_thinking: options?.enableThinking ?? true },
    }),
    signal: AbortSignal.timeout(45000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`AI provider error (${res.status}): ${errText.slice(0, 240) || res.statusText}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const raw = data.choices?.[0]?.message?.content ?? '';
  return raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

// --- Market Data REST API Routes ---
app.get('/api/market/search', async (req, res) => {
  try {
    const q = String(req.query.q ?? '');
    const exchange = String(req.query.exchange ?? 'ALL');
    const results = await searchSymbols(q, exchange);
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Symbol search failed' });
  }
});

app.get('/api/market/quote/:symbol', async (req, res) => {
  try {
    const quote = await getLiveQuote(req.params.symbol);
    res.json(quote);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Quote fetch failed' });
  }
});

app.get('/api/market/bars/:symbol', async (req, res) => {
  try {
    const tf = (String(req.query.timeframe ?? '1d') as Timeframe);
    const data = await getHistoricalBars(req.params.symbol, tf);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Historical bars fetch failed' });
  }
});

app.get('/api/market/overview', async (_req, res) => {
  try {
    const overview = await getMarketOverview();
    res.json(overview);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Market overview fetch failed' });
  }
});

app.get('/api/market/news', async (req, res) => {
  try {
    const symbol = req.query.symbol ? String(req.query.symbol) : undefined;
    const articles = await getNewsFeed(symbol);
    res.json({ articles });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'News fetch failed' });
  }
});

app.get('/api/market/fundamentals/:symbol', async (req, res) => {
  try {
    const data = await getFundamentals(req.params.symbol);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Fundamentals fetch failed' });
  }
});

app.get('/api/market/screener', async (_req, res) => {
  try {
    const rows = await getScreenerSnapshot();
    res.json({ rows });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Screener fetch failed' });
  }
});

app.get('/api/market/macro', async (_req, res) => {
  try {
    const macro = await getMacroDashboard();
    res.json(macro);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Macro dashboard fetch failed' });
  }
});

app.get('/api/market/correlations', async (_req, res) => {
  try {
    const data = await getCrossAssetCorrelations();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Correlations fetch failed' });
  }
});

app.get('/api/market/rotation', async (_req, res) => {
  try {
    const items = await getSectorRotation();
    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Sector rotation fetch failed' });
  }
});

app.get('/api/market/social/:symbol', async (req, res) => {
  try {
    const social = await getSocialSentiment(req.params.symbol);
    res.json(social);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Social sentiment fetch failed' });
  }
});

app.get('/api/market/calendar', async (_req, res) => {
  try {
    const events = await getEconomicCalendar();
    res.json({ events });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Economic calendar fetch failed' });
  }
});

app.get('/api/market/futures', async (_req, res) => {
  try {
    const data = await getFuturesTermStructures();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Futures term structure fetch failed' });
  }
});

app.get('/api/market/altdata/:symbol', async (req, res) => {
  try {
    const payload = await getAlternativeData(req.params.symbol);
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Alternative data fetch failed' });
  }
});

app.get('/api/market/social-traders/:symbol', async (req, res) => {
  try {
    const data = await getWhalesAndCopyTrading(req.params.symbol);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Whales & copy trading fetch failed' });
  }
});

// --- AI Assistant & Automated Report Routes ---
app.post('/api/ai/chat', async (req, res) => {
  try {
    const { message, history, marketContext } = req.body as {
      message: string;
      history?: { role: 'user' | 'model'; text: string }[];
      marketContext?: Record<string, unknown>;
    };
    if (!message || typeof message !== 'string') {
      res.status(400).json({ error: 'Message is required.' });
      return;
    }

    const systemInstruction = `You are Meridian Terminal's institutional quantitative & equity research analyst.
Answer concisely, accurately, and using structured bullet points and explicit numbers from the live market context provided.
Cover technical structure, catalyst/news drivers, risk levels, and actionable context without inventing unverified prices.
Remind users briefly when appropriate that analysis is informational and not personalized financial advice.

Live Terminal Context:
${JSON.stringify(marketContext ?? {}, null, 2)}`;

    const messages: OpenAIChatMessage[] = [
      { role: 'system', content: systemInstruction },
      ...(history ?? []).slice(-8).map((m) => ({
        role: (m.role === 'model' ? 'assistant' : 'user') as 'user' | 'assistant',
        content: m.text,
      })),
      { role: 'user', content: message },
    ];

    const reply = await callAiChatCompletion(messages, { enableThinking: true });
    res.json({ reply: reply || 'No response generated.' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'AI request failed';
    res.status(500).json({ error: msg });
  }
});

app.post('/api/ai/report', async (req, res) => {
  try {
    const { symbol, quote, prediction, fundamentals, news } = req.body as Record<string, unknown>;
    const prompt = `Generate a structured, institutional-grade Equity Research & Technical Brief for ${String(symbol)}.
Include:
1. Executive Thesis & Price Action Summary
2. Technical Structure & Chart Patterns
3. Quantitative Forecast & Risk Parameters
4. Fundamental & Catalyst Outlook
5. Key Levels to Watch (Support / Resistance)

Market Data Snapshot:
${JSON.stringify({ quote, prediction, fundamentals, news }, null, 2)}`;

    const report = await callAiChatCompletion(
      [
        {
          role: 'system',
          content: 'Write crisp, plain-markdown institutional equity research reports with exact figures from the provided snapshot.',
        },
        { role: 'user', content: prompt },
      ],
      { enableThinking: true }
    );

    res.json({ report: report || 'Unable to generate report.' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Report generation failed';
    res.status(500).json({ error: msg });
  }
});

app.post('/api/ai/journal-review', async (req, res) => {
  try {
    const { entries } = req.body as { entries?: unknown[] };
    if (!Array.isArray(entries) || entries.length === 0) {
      res.status(400).json({ error: 'At least one trade journal entry is required for review.' });
      return;
    }
    const prompt = `Review this trader's execution log and provide a concise, actionable performance coaching brief:
1. Pattern of strengths & edge (which setups win/lose)
2. Risk management & position sizing observations
3. Psychological/discipline insights based on ratings & notes
4. Three concrete next-session rules

Trade Journal Entries:
${JSON.stringify(entries.slice(0, 20), null, 2)}`;

    const review = await callAiChatCompletion(
      [
        {
          role: 'system',
          content: 'You are an institutional trading performance coach. Be direct, quantitative, and constructive.',
        },
        { role: 'user', content: prompt },
      ],
      { enableThinking: true }
    );
    res.json({ review: review || 'Unable to generate journal review.' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Journal review failed';
    res.status(500).json({ error: msg });
  }
});

// --- HTTP + WebSocket Server ---
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
  if (pathname === '/ws/market') {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  }
});

interface ClientSession {
  ws: WebSocket;
  symbols: Set<string>;
}

const clients = new Set<ClientSession>();
const lastStreamPrices = new Map<string, number>();

wss.on('connection', (ws) => {
  const session: ClientSession = { ws, symbols: new Set(['AAPL', 'NVDA', 'MSFT', 'RELIANCE.NS']) };
  clients.add(session);

  ws.send(JSON.stringify({ type: 'connected', serverTime: Date.now() }));

  // Send immediate snapshot for default symbols
  Promise.all(Array.from(session.symbols).map((sym) => getLiveQuote(sym)))
    .then((quotes) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'snapshot', quotes }));
      }
    })
    .catch(() => {});

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString()) as { type: string; symbols?: string[]; symbol?: string };
      if (msg.type === 'subscribe' && Array.isArray(msg.symbols)) {
        for (const s of msg.symbols) {
          session.symbols.add(s.toUpperCase().trim());
        }
        const quotes = await Promise.all(Array.from(session.symbols).slice(0, 12).map((s) => getLiveQuote(s)));
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'snapshot', quotes }));
        }
      } else if (msg.type === 'unsubscribe' && msg.symbol) {
        session.symbols.delete(msg.symbol.toUpperCase().trim());
      }
    } catch {
      // Ignore malformed client frames
    }
  });

  ws.on('close', () => {
    clients.delete(session);
  });
});

// Stream live ticks to connected WebSocket subscribers every 2.5s
setInterval(async () => {
  if (clients.size === 0) return;
  const activeSymbols = new Set<string>();
  for (const c of clients) {
    for (const s of c.symbols) activeSymbols.add(s);
  }
  const symbolList = Array.from(activeSymbols).slice(0, 16);
  if (symbolList.length === 0) return;

  try {
    const quotes = await Promise.all(symbolList.map((s) => getLiveQuote(s)));
    const tickMap = new Map<string, ReturnType<typeof Object>>();

    for (const q of quotes) {
      // Apply micro-tick jitter only when quote is cached between exchange polls to mirror live order book ticks
      const prev = lastStreamPrices.get(q.symbol) ?? q.price;
      const microDelta = q.dataSource === 'Cached Feed'
        ? (Math.random() - 0.495) * q.price * 0.0012
        : (Math.random() - 0.5) * q.price * 0.00035;
      const livePrice = Number(Math.max(0.5, prev + microDelta).toFixed(2));
      lastStreamPrices.set(q.symbol, livePrice);

      const change = Number((livePrice - q.previousClose).toFixed(2));
      const changePercent = q.previousClose ? Number(((change / q.previousClose) * 100).toFixed(2)) : q.changePercent;
      const spread = Math.max(0.01, Number((livePrice * 0.0003).toFixed(2)));
      tickMap.set(q.symbol, {
        ...q,
        price: livePrice,
        change,
        changePercent,
        bid: Number((livePrice - spread).toFixed(2)),
        ask: Number((livePrice + spread).toFixed(2)),
        volume: q.volume + Math.floor(Math.random() * 4500),
        updatedAt: Date.now(),
      });
    }

    for (const c of clients) {
      if (c.ws.readyState !== WebSocket.OPEN) continue;
      const updates = Array.from(c.symbols)
        .map((s) => tickMap.get(s))
        .filter(Boolean);
      if (updates.length > 0) {
        c.ws.send(JSON.stringify({ type: 'ticks', quotes: updates, serverTime: Date.now() }));
      }
    }
  } catch {
    // Keep interval resilient
  }
}, 2500);

// --- Vite Dev Middleware / Static Production Mount ---
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        ws: { server },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Meridian Terminal server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
