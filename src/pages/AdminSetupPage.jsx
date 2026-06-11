/**
 * Hidden admin setup page — URL: /#/system-setup
 *
 * Three cases handled:
 *   1. Already logged in as admin              → "already active"
 *   2. Already logged in as another role       → upgrade current account to admin
 *   3. Not logged in                           → create a brand-new admin account
 *
 * All paths require the VITE_ADMIN_CODE access code first.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';
import { adminRegister, upgradeToAdmin } from '../services/auth.js';

const ADMIN_CODE = import.meta.env.VITE_ADMIN_CODE;

export default function AdminSetupPage() {
  const { user, refreshUser } = useApp();
  const navigate = useNavigate();

  const [code, setCode] = useState('');
  const [codeOk, setCodeOk] = useState(false);
  const [fields, setFields] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user?.role === 'admin') {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-logo"><span className="auth-logo-mark">🔐</span></div>
          <p style={{ textAlign: 'center', color: 'var(--muted)' }}>Admin account is active.</p>
          <button className="btn btn-block" style={{ marginTop: '1rem' }} onClick={() => navigate('/')}>
            Go to dashboard
          </button>
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
    if (code.trim() === ADMIN_CODE) { setCodeOk(true); setError(''); }
    else setError('Incorrect access code.');
  }

  const set = (k) => (e) => setFields((f) => ({ ...f, [k]: e.target.value }));

  // Case 2: upgrade the already-logged-in account.
  async function upgrade(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await upgradeToAdmin(user.id);
      await refreshUser();
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // Case 3: create a fresh admin account.
  async function create(e) {
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

        ) : user ? (
          /* Logged in but not admin — offer to upgrade this account. */
          <form onSubmit={upgrade}>
            <div className="admin-upgrade-info">
              <p>Upgrade <strong>{user.name}</strong> ({user.email}) to the admin account?</p>
              <p className="muted">This account will gain full admin permissions and become invisible to other users.</p>
            </div>
            {error && <p className="form-error">{error}</p>}
            <button className="btn btn-primary btn-block" disabled={busy}>
              {busy ? 'Upgrading…' : 'Make this the Admin Account'}
            </button>
          </form>

        ) : (
          /* Not logged in — create a new admin account. */
          <form onSubmit={create}>
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
