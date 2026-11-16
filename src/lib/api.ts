// "API" layer. Today it talks to device storage; to go online later,
// replace the bodies with fetch("/api/...") calls - the UI won't change.
import { db } from "./db";
export interface Session { id: string; userId: string; start: number; end: number | null }

const sorted = (l: Session[]) => l.sort((a, b) => a.start - b.start);

export const api = {
  list: async (u: string) => sorted(await db.all(u)),
  start: async (u: string) => {
    const list = await api.list(u);
    if (list.some((s) => s.end === null)) return;
    await db.put({ id: crypto.randomUUID(), userId: u, start: Date.now(), end: null });
  },
  stop: async (u: string) => {
    const a = (await api.list(u)).find((s) => s.end === null);
    if (a) await db.put({ ...a, end: Date.now() });
  },
  exportJson: async (u: string) => JSON.stringify(await api.list(u), null, 2),
  importJson: async (u: string, json: string) => {
    const items = JSON.parse(json) as Session[];
    await db.clear(u);
    await Promise.all(items.map((x) => db.put({ ...x, userId: u })));
  },
};
