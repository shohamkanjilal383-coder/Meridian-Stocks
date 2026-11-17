export type MarketSessionStatus = 'Open' | 'Pre-Market' | 'After-Hours' | 'Closed';

export interface ExchangeHoursInfo {
  exchange: 'NYSE' | 'NASDAQ' | 'NSE' | 'BSE';
  status: MarketSessionStatus;
  localTime: string;
  hoursLabel: string;
}

function getZonedClock(timeZone: string, now: Date): { dayOfWeek: number; minutes: number; timeStr: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const weekdayStr = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon';
  const hourStr = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const minStr = parts.find((p) => p.type === 'minute')?.value ?? '00';

  const dayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const hour = Number(hourStr) % 24;
  const minute = Number(minStr);
  return {
    dayOfWeek: dayMap[weekdayStr] ?? 1,
    minutes: hour * 60 + minute,
    timeStr: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
  };
}

function evaluateSession(
  minutes: number,
  dayOfWeek: number,
  preStart: number,
  regStart: number,
  regEnd: number,
  postEnd: number
): MarketSessionStatus {
  if (dayOfWeek === 0 || dayOfWeek === 6) return 'Closed';
  if (minutes >= regStart && minutes < regEnd) return 'Open';
  if (minutes >= preStart && minutes < regStart) return 'Pre-Market';
  if (minutes >= regEnd && minutes < postEnd) return 'After-Hours';
  return 'Closed';
}

export function getAllExchangeHours(now: Date = new Date()): ExchangeHoursInfo[] {
  const ny = getZonedClock('America/New_York', now);
  const ist = getZonedClock('Asia/Kolkata', now);

  const usStatus = evaluateSession(ny.minutes, ny.dayOfWeek, 4 * 60, 9 * 60 + 30, 16 * 60, 20 * 60);
  const inStatus = evaluateSession(ist.minutes, ist.dayOfWeek, 9 * 60, 9 * 60 + 15, 15 * 60 + 30, 16 * 60);

  return [
    {
      exchange: 'NYSE',
      status: usStatus,
      localTime: `${ny.timeStr} ET`,
      hoursLabel: '09:30–16:00 ET',
    },
    {
      exchange: 'NASDAQ',
      status: usStatus,
      localTime: `${ny.timeStr} ET`,
      hoursLabel: '09:30–16:00 ET',
    },
    {
      exchange: 'NSE',
      status: inStatus,
      localTime: `${ist.timeStr} IST`,
      hoursLabel: '09:15–15:30 IST',
    },
    {
      exchange: 'BSE',
      status: inStatus,
      localTime: `${ist.timeStr} IST`,
      hoursLabel: '09:15–15:30 IST',
    },
  ];
}
