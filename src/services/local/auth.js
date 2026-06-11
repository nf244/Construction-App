/**
 * Local auth backend: users live in IndexedDB, passwords are stored as
 * salted SHA-256 hashes, and the active session id sits in localStorage.
 * Used when no Firebase config is present.
 */
import { getDoc, listDocs, putDoc, newId } from './storage.js';
import { ROLES, isOwnerLevel } from '../roles.js';

const SESSION_KEY = 'sitetrack.session';

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

export async function register({ name, email, password }) {
  const cleanEmail = email.trim().toLowerCase();
  if (!name.trim()) throw new Error('Name is required.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) throw new Error('Enter a valid email address.');
  if (password.length < 6) throw new Error('Password must be at least 6 characters.');
  // All new accounts start as Employee; roles are assigned by admin/owners.
  const role = ROLES.EMPLOYEE;

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

export async function adminRegister({ name, email, password }) {
  const cleanEmail = email.trim().toLowerCase();
  if (!name.trim()) throw new Error('Name is required.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) throw new Error('Enter a valid email address.');
  if (password.length < 6) throw new Error('Password must be at least 6 characters.');
  if (await findUserByEmail(cleanEmail)) throw new Error('An account with this email already exists.');
  const salt = newId();
  const user = {
    id: newId(),
    name: name.trim(),
    email: cleanEmail,
    role: ROLES.ADMIN,
    salt,
    passwordHash: await hashPassword(password, salt),
    createdAt: Date.now(),
  };
  await putDoc('users', user);
  localStorage.setItem(SESSION_KEY, user.id);
  return sanitize(user);
}

export async function upgradeToAdmin(userId) {
  const user = await getDoc('users', userId);
  if (!user) throw new Error('User not found.');
  const updated = { ...user, role: ROLES.ADMIN };
  await putDoc('users', updated);
  return sanitize(updated);
}

export async function resetPassword() {
  throw new Error('Password reset is only available when Firebase is connected.');
}

export async function loginWithGoogle() {
  throw new Error('Google sign-in is only available when Firebase is connected.');
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
  // Admin accounts are never exposed to other users.
  return users
    .filter((u) => u.role !== ROLES.ADMIN)
    .map(sanitize)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function updateUserRole(userId, newRole, actor) {
  if (!isOwnerLevel(actor.role)) throw new Error('Only owners can change roles.');
  const target = await getDoc('users', userId);
  if (!target) throw new Error('User not found.');
  // Admin accounts are untouchable.
  if (target.role === ROLES.ADMIN) throw new Error('This account cannot be modified.');
  if (newRole === ROLES.ADMIN) throw new Error('Cannot assign admin role from here.');
  // Regular owners can only assign PM or Employee — only admin can make owners.
  if (actor.role === ROLES.OWNER && newRole === ROLES.OWNER) {
    throw new Error('Only the admin can promote someone to Owner.');
  }
  const user = await getDoc('users', userId);
  if (!user) throw new Error('User not found.');
  const updated = { ...user, role: newRole };
  await putDoc('users', updated);
  return sanitize(updated);
}

function sanitize(user) {
  const { passwordHash, salt, ...safe } = user;
  return safe;
}
