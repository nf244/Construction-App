/**
 * Auth facade: Firebase Auth when configured, local IndexedDB accounts
 * otherwise. See firebase.js for how the mode is chosen.
 */
import { firebaseEnabled } from './firebase.js';
import * as local from './local/auth.js';
import * as cloud from './cloud/auth.js';

export { ROLES, ROLE_LABELS } from './roles.js';

const impl = firebaseEnabled ? cloud : local;

export const register = impl.register;
export const login = impl.login;
export const logout = impl.logout;
export const currentUser = impl.currentUser;
export const listUsers = impl.listUsers;
export const findUserByEmail = impl.findUserByEmail;
export const updateUserRole = impl.updateUserRole;
export const adminRegister = impl.adminRegister;
export const resetPassword = impl.resetPassword;
export const loginWithGoogle = impl.loginWithGoogle;
