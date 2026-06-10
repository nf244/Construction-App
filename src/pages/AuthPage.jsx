import { useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { ROLES, ROLE_LABELS } from '../services/auth.js';

export default function AuthPage() {
  const { login, register } = useApp();
  const [mode, setMode] = useState('login');
  const [fields, setFields] = useState({ name: '', email: '', password: '', role: ROLES.EMPLOYEE });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setFields((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'login') await login(fields.email, fields.password);
      else await register(fields);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <span className="auth-logo-mark">🏗️</span>
          <h1>SiteTrack</h1>
          <p>Track every job from groundbreaking to handover.</p>
        </div>

        <div className="auth-tabs">
          <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>
            Sign In
          </button>
          <button className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>
            Create Account
          </button>
        </div>

        <form onSubmit={submit}>
          {mode === 'register' && (
            <label>
              Full name
              <input value={fields.name} onChange={set('name')} placeholder="Pat Builder" autoComplete="name" />
            </label>
          )}
          <label>
            Email
            <input
              type="email"
              value={fields.email}
              onChange={set('email')}
              placeholder="you@company.com"
              autoComplete="email"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={fields.password}
              onChange={set('password')}
              placeholder={mode === 'register' ? 'At least 6 characters' : 'Your password'}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              required
            />
          </label>
          {mode === 'register' && (
            <label>
              Role
              <select value={fields.role} onChange={set('role')}>
                {Object.values(ROLES).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </label>
          )}

          {error && <p className="form-error">{error}</p>}

          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Working…' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <p className="auth-hint">
          Owners see every job. Project managers run their jobs and invite the crew. Employees post
          photo updates from the field.
        </p>
      </div>
    </div>
  );
}
