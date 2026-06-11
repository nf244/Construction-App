/**
 * Document store facade. Picks the backend once at startup:
 *
 *   - Firebase configured (VITE_FIREBASE_* env vars) -> Firestore
 *   - otherwise                                      -> IndexedDB (local)
 *
 * Both backends expose the same API, so the rest of the app never knows
 * which one it is talking to.
 */
import { firebaseEnabled } from './firebase.js';
import * as local from './local/storage.js';
import * as cloud from './cloud/storage.js';

const impl = firebaseEnabled ? cloud : local;

export const getDoc = impl.getDoc;
export const listDocs = impl.listDocs;
export const putDoc = impl.putDoc;
export const deleteDoc = impl.deleteDoc;

export function newId() {
  return crypto.randomUUID();
}
