import { useCallback, useEffect, useRef, useState } from 'react';
import { offlineCache } from '../lib/indexedDb';
import type { StockQuote } from '../types/market';

export type SocketStatus = 'connected' | 'reconnecting' | 'disconnected';

export function useMarketSocket(subscribedSymbols: string[]) {
  const [quotes, setQuotes] = useState<Record<string, StockQuote>>({});
  const [status, setStatus] = useState<SocketStatus>('reconnecting');
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const attemptRef = useRef(0);
  const intentionalCloseRef = useRef(false);
  const symbolsRef = useRef<string[]>(subscribedSymbols);
  symbolsRef.current = subscribedSymbols;

  const symbolsKey = subscribedSymbols.slice().sort().join(',');

  // Seed initial state from IndexedDB immediately for zero-latency startup
  useEffect(() => {
    offlineCache.getAllQuotes().then((cached) => {
      if (cached.length > 0) {
        setQuotes((prev) => {
          const next = { ...prev };
          for (const q of cached) {
            if (!next[q.symbol]) next[q.symbol] = q;
          }
          return next;
        });
      }
    });
  }, []);

  const connect = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    if (!navigator.onLine) {
      setStatus('disconnected');
      return;
    }

    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    intentionalCloseRef.current = false;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/market`;
    setStatus(attemptRef.current > 0 ? 'reconnecting' : 'reconnecting');

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      attemptRef.current = 0;
      setReconnectAttempt(0);
      setStatus('connected');
      if (symbolsRef.current.length > 0) {
        ws.send(JSON.stringify({ type: 'subscribe', symbols: symbolsRef.current }));
      }
    };

    ws.onmessage = (evt) => {
      try {
        const payload = JSON.parse(evt.data) as { type: string; quotes?: StockQuote[] };
        if ((payload.type === 'snapshot' || payload.type === 'ticks') && Array.isArray(payload.quotes)) {
          setQuotes((prev) => {
            const next = { ...prev };
            for (const q of payload.quotes!) {
              next[q.symbol] = q;
              offlineCache.saveQuote(q);
            }
            return next;
          });
        }
      } catch {
        // Ignore malformed frame
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
      if (intentionalCloseRef.current || !navigator.onLine) {
        setStatus('disconnected');
        return;
      }
      attemptRef.current += 1;
      setReconnectAttempt(attemptRef.current);
      setStatus('reconnecting');
      const delayMs = Math.min(15000, 1500 * Math.pow(1.6, Math.min(attemptRef.current - 1, 5)));
      reconnectTimerRef.current = window.setTimeout(() => {
        connect();
      }, delayMs);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  const manualReconnect = useCallback(() => {
    intentionalCloseRef.current = false;
    attemptRef.current = 0;
    setReconnectAttempt(0);
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    setStatus('reconnecting');
    connect();
  }, [connect]);

  useEffect(() => {
    connect();

    const handleOnline = () => {
      attemptRef.current = 0;
      setReconnectAttempt(0);
      connect();
    };
    const handleOffline = () => {
      setStatus('disconnected');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      intentionalCloseRef.current = true;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  useEffect(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && subscribedSymbols.length > 0) {
      wsRef.current.send(JSON.stringify({ type: 'subscribe', symbols: subscribedSymbols }));
    }
  }, [symbolsKey]);

  const upsertQuote = useCallback((q: StockQuote) => {
    setQuotes((prev) => ({ ...prev, [q.symbol]: q }));
    offlineCache.saveQuote(q);
  }, []);

  return { quotes, status, reconnectAttempt, reconnect: manualReconnect, upsertQuote };
}
