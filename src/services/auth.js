/**
 * Authentication service.
 *
 * Local implementation: users live in IndexedDB, passwords are stored as
 * salted SHA-256 hashes, and the active session id sits in localStorage.
 * When migrating to Firebase, replace this file with calls to Firebase Auth
 * (createUserWithEmailAndPassword / signInWithEmailAndPassword /
 * onAuthStateChanged) and keep the same exported function signatures.
 */

import { getDoc, listDocs, putDoc, newId } from './storage.js';

const SESSION_KEY = 'sitetrack.session';

export const ROLES = {
  OWNER: 'owner',
  PROJECT_MANAGER: 'project_manager',
  EMPLOYEE: 'employee',
};

export const ROLE_LABELS = {
  owner: 'Owner',
  project_manager: 'Project Manager',
  employee: 'Employee',
};

async function hashPassword(password, salt) {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function findUserByEmail(email) {
  const users = await listDocs('users');
  const needle = email.trim().toLowerCase();
  return users.find((u) => u.email === needle) ?? null;
}

export async function register({ name, email, password, role }) {
  const cleanEmail = email.trim().toLowerCase();
  if (!name.trim()) throw new Error('Name is required.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) throw new Error('Enter a valid email address.');
  if (password.length < 6) throw new Error('Password must be at least 6 characters.');
  if (!Object.values(ROLES).includes(role)) throw new Error('Choose a role.');

  if (await findUserByEmail(cleanEmail)) {
    throw new Error('An account with this email already exists.');
  }

  const salt = newId();
  const user = {
    id: newId(),
    name: name.trim(),
    email: cleanEmail,
    role,
    salt,
    passwordHash: await hashPassword(password, salt),
    createdAt: Date.now(),
  };
  await putDoc('users', user);
  localStorage.setItem(SESSION_KEY, user.id);
  return sanitize(user);
}

export async function login(email, password) {
  const user = await findUserByEmail(email);
  if (!user) throw new Error('No account found for that email.');
  const hash = await hashPassword(password, user.salt);
  if (hash !== user.passwordHash) throw new Error('Incorrect password.');
  localStorage.setItem(SESSION_KEY, user.id);
  return sanitize(user);
}

export function logout() {
  localStorage.removeItem(SESSION_KEY);
}

export async function currentUser() {
  const id = localStorage.getItem(SESSION_KEY);
  if (!id) return null;
  const user = await getDoc('users', id);
  return user ? sanitize(user) : null;
}

export async function listUsers() {
  const users = await listDocs('users');
  return users.map(sanitize);
}

function sanitize(user) {
  const { passwordHash, salt, ...safe } = user;
  return safe;
}
