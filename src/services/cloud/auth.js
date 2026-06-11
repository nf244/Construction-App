/**
 * Firebase Auth backend. Accounts live in Firebase Authentication
 * (email/password); the profile — name and role — lives in a Firestore
 * `users` collection keyed by the auth uid.
 */
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  collection,
  query,
  where,
} from 'firebase/firestore';
import { auth, db } from '../firebase.js';
import { ROLES } from '../roles.js';

function friendlyError(err) {
  switch (err.code) {
    case 'auth/email-already-in-use':
      return new Error('An account with this email already exists.');
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return new Error('Incorrect email or password.');
    case 'auth/weak-password':
      return new Error('Password must be at least 6 characters.');
    case 'auth/invalid-email':
      return new Error('Enter a valid email address.');
    case 'auth/too-many-requests':
      return new Error('Too many attempts — try again in a few minutes.');
    default:
      return err;
  }
}

async function profileFor(uid, fallbackEmail = '') {
  const snap = await getDoc(doc(db, 'users', uid));
  if (snap.exists()) return snap.data();
  // Auth account without a profile doc (shouldn't happen in normal flow).
  return { id: uid, name: fallbackEmail, email: fallbackEmail, role: ROLES.EMPLOYEE };
}

export async function register({ name, email, password, role }) {
  const cleanEmail = email.trim().toLowerCase();
  if (!name.trim()) throw new Error('Name is required.');
  if (!Object.values(ROLES).includes(role)) throw new Error('Choose a role.');

  let cred;
  try {
    cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
  } catch (err) {
    throw friendlyError(err);
  }
  const user = {
    id: cred.user.uid,
    name: name.trim(),
    email: cleanEmail,
    role,
    createdAt: Date.now(),
  };
  await setDoc(doc(db, 'users', user.id), user);
  return user;
}

export async function login(email, password) {
  let cred;
  try {
    cred = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
  } catch (err) {
    throw friendlyError(err);
  }
  return profileFor(cred.user.uid, cred.user.email);
}

export function logout() {
  signOut(auth);
}

export async function currentUser() {
  const fbUser = await new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (u) => {
      unsub();
      resolve(u);
    });
  });
  if (!fbUser) return null;
  return profileFor(fbUser.uid, fbUser.email);
}

export async function listUsers() {
  const snap = await getDocs(collection(db, 'users'));
  return snap.docs
    .map((d) => d.data())
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function updateUserRole(userId, newRole, actor) {
  if (actor.role !== ROLES.OWNER) throw new Error('Only owners can change roles.');
  const ref = doc(db, 'users', userId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('User not found.');
  const updated = { ...snap.data(), role: newRole };
  await setDoc(ref, updated);
  return updated;
}

export async function findUserByEmail(email) {
  const clean = email.trim().toLowerCase();
  const snap = await getDocs(query(collection(db, 'users'), where('email', '==', clean)));
  return snap.empty ? null : snap.docs[0].data();
}
