import { useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { resetPassword } from '../services/auth.js';

// Google "G" logo as an inline SVG so there's no extra dependency.
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"/>
    </svg>
  );
}

export default function AuthPage() {
  const { login, loginWithGoogle, register } = useApp();
  // mode: 'login' | 'register' | 'forgot'
  const [mode, setMode] = useState('login');
  const [fields, setFields] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const set = (key) => (e) => setFields((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'login') {
        await login(fields.email, fields.password);
      } else if (mode === 'register') {
        await register(fields);
      } else if (mode === 'forgot') {
        await resetPassword(fields.email);
        setResetSent(true);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setError('');
    setBusy(true);
    try {
      await loginWithGoogle();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function switchMode(next) {
    setMode(next);
    setError('');
    setResetSent(false);
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <span className="auth-logo-mark">🏗️</span>
          <h1>SiteTrack</h1>
          <p>Track every job from groundbreaking to handover.</p>
        </div>

        {/* ---- tabs: only show for login / register ---- */}
        {mode !== 'forgot' && (
          <div className="auth-tabs">
            <button className={mode === 'login' ? 'active' : ''} onClick={() => switchMode('login')}>
              Sign In
            </button>
            <button className={mode === 'register' ? 'active' : ''} onClick={() => switchMode('register')}>
              Create Account
            </button>
          </div>
        )}

        {/* ---- Google button (login + register only) ---- */}
        {mode !== 'forgot' && (
          <>
            <button className="btn btn-google btn-block" onClick={handleGoogle} disabled={busy} type="button">
              <GoogleIcon />
              {mode === 'login' ? 'Sign in with Google' : 'Sign up with Google'}
            </button>
            <div className="auth-divider"><span>or</span></div>
          </>
        )}

        {/* ---- forgot password ---- */}
        {mode === 'forgot' && (
          <div className="forgot-head">
            <h2>Reset password</h2>
            <p className="muted">We'll email you a link to create a new one.</p>
          </div>
        )}

        {resetSent ? (
          <div className="auth-success">
            <span>✅</span>
            <p>Reset link sent — check your inbox (and spam folder).</p>
            <button className="btn btn-block" onClick={() => switchMode('login')}>
              Back to Sign In
            </button>
          </div>
        ) : (
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
            {mode !== 'forgot' && (
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
            )}

            {mode === 'login' && (
              <div className="forgot-link-row">
                <button type="button" className="link-btn" onClick={() => switchMode('forgot')}>
                  Forgot password?
                </button>
              </div>
            )}

            {error && <p className="form-error">{error}</p>}

            <button className="btn btn-primary btn-block" disabled={busy}>
              {busy
                ? 'Working…'
                : mode === 'login'
                ? 'Sign In'
                : mode === 'register'
                ? 'Create Account'
                : 'Send Reset Link'}
            </button>

            {mode === 'forgot' && (
              <button type="button" className="btn btn-block" style={{ marginTop: '0.5rem' }} onClick={() => switchMode('login')}>
                Back to Sign In
              </button>
            )}
          </form>
        )}

        {mode === 'register' && !resetSent && (
          <p className="auth-hint">
            Your account starts as an Employee. An owner will assign your role once you're in.
          </p>
        )}
      </div>
    </div>
  );
}
