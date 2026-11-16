// Device storage (IndexedDB) - data lives on the user's own device.
import type { Session } from "./api";
const DB = "study-tracker", STORE = "sessions";

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      const s = r.result.createObjectStore(STORE, { keyPath: "id" });
      s.createIndex("userId", "userId");
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((res, rej) => {
    const r = fn(db.transaction(STORE, mode).objectStore(STORE));
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
export const db = {
  all: (userId: string) => run<Session[]>("readonly", (s) => s.index("userId").getAll(userId)),
  put: (x: Session) => run("readwrite", (s) => s.put(x)),
  clear: (userId: string) =>
    db.all(userId).then((l) => Promise.all(l.map((x) => run("readwrite", (s) => s.delete(x.id))))),
};
export async function requestPersistence() {
  try { await navigator.storage?.persist?.(); } catch {}
}
