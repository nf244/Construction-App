import { useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { resetPassword, ROLE_LABELS } from '../services/auth.js';
import { firebaseEnabled } from '../services/firebase.js';
import Avatar from '../components/Avatar.jsx';

export default function ProfilePage() {
  const { user, updateProfile, logout } = useApp();

  const [name, setName] = useState(user.name);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [saveError, setSaveError] = useState('');

  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState('');
  const [pwError, setPwError] = useState('');

  const dirty = name.trim() !== user.name;

  async function handleSave(e) {
    e.preventDefault();
    if (!dirty) return;
    setSaving(true);
    setSaveMsg('');
    setSaveError('');
    try {
      await updateProfile({ name });
      setSaveMsg('Name updated.');
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handlePasswordReset() {
    setPwBusy(true);
    setPwMsg('');
    setPwError('');
    try {
      await resetPassword(user.email);
      setPwMsg(`Reset link sent to ${user.email}.`);
    } catch (err) {
      setPwError(err.message);
    } finally {
      setPwBusy(false);
    }
  }

  return (
    <div className="page page-narrow">
      <div className="profile-card card">
        <div className="profile-avatar">
          <Avatar name={name || user.name} size={72} />
        </div>

        <form onSubmit={handleSave} className="profile-form">
          <label>
            Name
            <input
              value={name}
              onChange={(e) => { setName(e.target.value); setSaveMsg(''); setSaveError(''); }}
              placeholder="Your name"
            />
          </label>

          <label>
            Email
            <input value={user.email} disabled />
          </label>

          <label>
            Role
            <input value={ROLE_LABELS[user.role] ?? user.role} disabled />
          </label>

          {saveError && <p className="form-error">{saveError}</p>}
          {saveMsg && <p className="form-success">{saveMsg}</p>}

          <button className="btn btn-primary" disabled={!dirty || saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </form>
      </div>

      <div className="profile-section card">
        <h3>Password</h3>
        {firebaseEnabled ? (
          <>
            <p className="muted">We'll send a reset link to <strong>{user.email}</strong>.</p>
            {pwError && <p className="form-error">{pwError}</p>}
            {pwMsg && <p className="form-success">{pwMsg}</p>}
            <button className="btn" onClick={handlePasswordReset} disabled={pwBusy}>
              {pwBusy ? 'Sending…' : 'Send password reset email'}
            </button>
          </>
        ) : (
          <p className="muted">Password reset is only available when Firebase is connected.</p>
        )}
      </div>

      <div className="profile-section card">
        <h3>Session</h3>
        <p className="muted">Sign out of SiteTrack on this device.</p>
        <button className="btn btn-danger" onClick={logout}>Sign out</button>
      </div>
    </div>
  );
}
