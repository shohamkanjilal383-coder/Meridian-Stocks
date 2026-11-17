import type {
  DrawingObject,
  OHLCVBar,
  PortfolioPosition,
  PortfolioTransaction,
  SmartAlert,
  StockQuote,
  TradeJournalEntry,
} from '../types/market';

const DB_NAME = 'meridian_terminal_db';
const DB_VERSION = 2;

const STORES = {
  QUOTES: 'quotes',
  BARS: 'bars',
  PORTFOLIO: 'portfolio',
  TRANSACTIONS: 'transactions',
  ALERTS: 'alerts',
  DRAWINGS: 'drawings',
  PREFS: 'prefs',
  JOURNAL: 'journal',
} as const;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB unavailable'));
  }
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.QUOTES)) {
        db.createObjectStore(STORES.QUOTES, { keyPath: 'symbol' });
      }
      if (!db.objectStoreNames.contains(STORES.BARS)) {
        db.createObjectStore(STORES.BARS, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORES.PORTFOLIO)) {
        db.createObjectStore(STORES.PORTFOLIO, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.TRANSACTIONS)) {
        db.createObjectStore(STORES.TRANSACTIONS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.ALERTS)) {
        db.createObjectStore(STORES.ALERTS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.DRAWINGS)) {
        db.createObjectStore(STORES.DRAWINGS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.PREFS)) {
        db.createObjectStore(STORES.PREFS, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORES.JOURNAL)) {
        db.createObjectStore(STORES.JOURNAL, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function putItem<T>(storeName: string, value: T): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(value);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Graceful no-op
  }
}

async function getItem<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
  try {
    const db = await openDB();
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return undefined;
  }
}

async function getAllItems<T>(storeName: string): Promise<T[]> {
  try {
    const db = await openDB();
    return await new Promise<T[]>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve((req.result as T[]) ?? []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

async function deleteItem(storeName: string, key: IDBValidKey): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Graceful no-op
  }
}

async function clearStore(storeName: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Graceful no-op
  }
}

export const offlineCache = {
  async saveQuote(quote: StockQuote): Promise<void> {
    await putItem(STORES.QUOTES, quote);
  },
  async getQuote(symbol: string): Promise<StockQuote | undefined> {
    return getItem<StockQuote>(STORES.QUOTES, symbol);
  },
  async getAllQuotes(): Promise<StockQuote[]> {
    return getAllItems<StockQuote>(STORES.QUOTES);
  },
  async saveBars(symbol: string, timeframe: string, bars: OHLCVBar[]): Promise<void> {
    await putItem(STORES.BARS, { key: `alltime::${symbol}::${timeframe}`, bars, updatedAt: Date.now() });
  },
  async getBars(symbol: string, timeframe: string): Promise<OHLCVBar[] | undefined> {
    const row = await getItem<{ key: string; bars: OHLCVBar[] }>(STORES.BARS, `alltime::${symbol}::${timeframe}`);
    return row?.bars;
  },
  async getPositions(): Promise<PortfolioPosition[]> {
    return getAllItems<PortfolioPosition>(STORES.PORTFOLIO);
  },
  async savePosition(pos: PortfolioPosition): Promise<void> {
    await putItem(STORES.PORTFOLIO, pos);
  },
  async deletePosition(id: string): Promise<void> {
    await deleteItem(STORES.PORTFOLIO, id);
  },
  async clearPortfolio(): Promise<void> {
    await clearStore(STORES.PORTFOLIO);
    await clearStore(STORES.TRANSACTIONS);
  },
  async getTransactions(): Promise<PortfolioTransaction[]> {
    return getAllItems<PortfolioTransaction>(STORES.TRANSACTIONS);
  },
  async saveTransaction(tx: PortfolioTransaction): Promise<void> {
    await putItem(STORES.TRANSACTIONS, tx);
  },
  async getAlerts(): Promise<SmartAlert[]> {
    return getAllItems<SmartAlert>(STORES.ALERTS);
  },
  async saveAlert(alert: SmartAlert): Promise<void> {
    await putItem(STORES.ALERTS, alert);
  },
  async deleteAlert(id: string): Promise<void> {
    await deleteItem(STORES.ALERTS, id);
  },
  async getDrawings(): Promise<DrawingObject[]> {
    return getAllItems<DrawingObject>(STORES.DRAWINGS);
  },
  async saveDrawing(drawing: DrawingObject): Promise<void> {
    await putItem(STORES.DRAWINGS, drawing);
  },
  async deleteDrawing(id: string): Promise<void> {
    await deleteItem(STORES.DRAWINGS, id);
  },
  async getJournalEntries(): Promise<TradeJournalEntry[]> {
    return getAllItems<TradeJournalEntry>(STORES.JOURNAL);
  },
  async saveJournalEntry(entry: TradeJournalEntry): Promise<void> {
    await putItem(STORES.JOURNAL, entry);
  },
  async deleteJournalEntry(id: string): Promise<void> {
    await deleteItem(STORES.JOURNAL, id);
  },
  async setPref<T>(key: string, value: T): Promise<void> {
    await putItem(STORES.PREFS, { key, value });
  },
  async getPref<T>(key: string): Promise<T | undefined> {
    const res = await getItem<{ key: string; value: T }>(STORES.PREFS, key);
    return res?.value;
  },
};
