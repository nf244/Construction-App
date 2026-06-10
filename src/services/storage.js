/**
 * Local persistence layer backed by IndexedDB.
 *
 * This module is the single swap point for a real backend. Every function
 * is async and mirrors a document-store API (get/list/put/delete by id),
 * so replacing it with Firebase (Firestore + Storage) later means
 * reimplementing these same functions — no UI changes required:
 *
 *   users  -> Firestore "users" collection (or Firebase Auth profiles)
 *   jobs   -> Firestore "jobs" collection
 *   photos -> Firebase Storage blobs + a "photos" metadata collection
 */

const DB_NAME = 'sitetrack';
const DB_VERSION = 1;
const STORES = ['users', 'jobs', 'photos'];

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: 'id' });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(db, store, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const result = fn(t.objectStore(store));
    t.oncomplete = () => resolve(result.result !== undefined ? result.result : undefined);
    t.onerror = () => reject(t.error);
  });
}

export async function getDoc(store, id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(store).objectStore(store).get(id);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function listDocs(store) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(store).objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror = () => reject(req.error);
  });
}

export async function putDoc(store, doc) {
  const db = await openDb();
  await tx(db, store, 'readwrite', (s) => s.put(doc));
  return doc;
}

export async function deleteDoc(store, id) {
  const db = await openDb();
  await tx(db, store, 'readwrite', (s) => s.delete(id));
}

export function newId() {
  return crypto.randomUUID();
}
