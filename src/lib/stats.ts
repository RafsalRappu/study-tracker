import type { Session } from "./api";
import { START_DATE, END_DATE, DAILY_TARGET_HOURS } from "./config";

export const TARGET = DAILY_TARGET_HOURS * 3600_000;
const DAY = 86_400_000;
export const key = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parse = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };

export function fmt(ms: number) {
  const m = Math.floor(Math.abs(ms) / 60000);
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

// Time per calendar day. Sessions crossing midnight are split.
export function dailyTotals(sessions: Session[], now: number) {
  const t: Record<string, number> = {};
  for (const s of sessions) {
    let a = s.start; const end = s.end ?? now;
    while (a < end) {
      const d = new Date(a);
      const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
      const e = Math.min(next, end);
      t[key(d)] = (t[key(d)] ?? 0) + (e - a);
      a = e;
    }
  }
  return t;
}

export function summarize(sessions: Session[], now: number) {
  const totals = dailyTotals(sessions, now);
  const today = key(new Date(now));
  const days: { key: string; ms: number; diff: number }[] = [];
  const start = parse(START_DATE).getTime();
  const last = Math.min(parse(today).getTime(), parse(END_DATE).getTime());
  for (let t = start; t <= last; t += DAY) {
    const k = key(new Date(t)); const ms = totals[k] ?? 0;
    days.push({ key: k, ms, diff: ms - TARGET });
  }
  const past = days.filter((d) => d.key !== today);
  const balance = past.reduce((s, d) => s + d.diff, 0);
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].ms >= TARGET) streak++;
    else if (days[i].key !== today) break;
  }
  const daysLeft = Math.max(0, Math.ceil((parse(END_DATE).getTime() - parse(today).getTime()) / DAY));
  return {
    todayMs: totals[today] ?? 0, balance, streak, daysLeft,
    active: sessions.find((s) => s.end === null) ?? null,
    history: [...days].reverse(),
    metDays: past.filter((d) => d.diff >= 0).length, pastDays: past.length,
  };
}
