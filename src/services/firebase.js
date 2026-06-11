/**
 * Firebase initialization. The app runs in one of two modes:
 *
 *   - LOCAL (default): no Firebase env vars set — everything persists in the
 *     browser via IndexedDB. Good for trying the app out.
 *   - FIREBASE: set the VITE_FIREBASE_* env vars (see .env.example) and data
 *     syncs across devices through Firebase Auth + Firestore.
 *
 * Set VITE_FIREBASE_EMULATOR=1 to point at a local emulator suite (used by
 * the smoke test; never set this in production).
 */
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseEnabled = Boolean(config.apiKey && config.projectId);

export let auth = null;
export let db = null;

if (firebaseEnabled) {
  const app = initializeApp(config);
  auth = getAuth(app);
  db = getFirestore(app);
  if (import.meta.env.VITE_FIREBASE_EMULATOR) {
    connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, 'localhost', 8080);
  }
}
