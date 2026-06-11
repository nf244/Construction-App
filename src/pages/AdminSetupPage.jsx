/**
 * Hidden admin account registration page.
 *
 * URL:  /#/system-setup
 * This route is not linked anywhere in the UI. To use it:
 *   1. Navigate to the URL directly.
 *   2. Enter the admin access code (set via VITE_ADMIN_CODE env var on Vercel).
 *   3. Fill in the account details and submit.
 *
 * Once the account exists, this page is no longer functional — attempting to
 * register a second admin will fail with "account already exists" (the email
 * uniqueness check catches it first).
 *
 * The resulting account:
 *   - Has the 'admin' role, giving full owner-level access to everything.
 *   - Never appears in listUsers(), the People page, or team pickers.
 *   - Cannot be modified or deleted by any other user.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';
import { adminRegister } from '../services/auth.js';

const ADMIN_CODE = import.meta.env.VITE_ADMIN_CODE;

export default function AdminSetupPage() {
  const { user } = useApp();
  const navigate = useNavigate();

  const [code, setCode] = useState('');
  const [codeOk, setCodeOk] = useState(false);
  const [fields, setFields] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Already logged in as admin — nothing to do here.
  if (user?.role === 'admin') {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <p style={{ textAlign: 'center', color: 'var(--muted)' }}>Admin account already active.</p>
        </div>
      </div>
    );
  }

  if (!ADMIN_CODE) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <p style={{ textAlign: 'center', color: 'var(--muted)' }}>
            Admin setup is not configured on this deployment.
          </p>
        </div>
      </div>
    );
  }

  function checkCode(e) {
    e.preventDefault();
    if (code.trim() === ADMIN_CODE) {
      setCodeOk(true);
      setError('');
    } else {
      setError('Incorrect access code.');
    }
  }

  const set = (key) => (e) => setFields((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await adminRegister(fields);
      navigate('/');
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
          <span className="auth-logo-mark">🔐</span>
          <h1>System Setup</h1>
        </div>

        {!codeOk ? (
          <form onSubmit={checkCode}>
            <label>
              Access code
              <input
                type="password"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Enter access code"
                autoFocus
              />
            </label>
            {error && <p className="form-error">{error}</p>}
            <button className="btn btn-primary btn-block">Continue</button>
          </form>
        ) : (
          <form onSubmit={submit}>
            <label>
              Full name
              <input value={fields.name} onChange={set('name')} placeholder="Your name" autoFocus />
            </label>
            <label>
              Email
              <input type="email" value={fields.email} onChange={set('email')} placeholder="you@example.com" />
            </label>
            <label>
              Password
              <input
                type="password"
                value={fields.password}
                onChange={set('password')}
                placeholder="At least 6 characters"
                autoComplete="new-password"
              />
            </label>
            {error && <p className="form-error">{error}</p>}
            <button className="btn btn-primary btn-block" disabled={busy}>
              {busy ? 'Creating…' : 'Create Admin Account'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
