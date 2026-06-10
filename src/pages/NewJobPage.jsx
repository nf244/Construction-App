import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';
import { createJob, inviteByEmail, addMember, canCreateJobs } from '../services/jobs.js';
import { listUsers, findUserByEmail, ROLE_LABELS } from '../services/auth.js';
import Avatar from '../components/Avatar.jsx';

export default function NewJobPage() {
  const { user } = useApp();
  const navigate = useNavigate();
  const [fields, setFields] = useState({ name: '', client: '', address: '', description: '' });
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteEmails, setInviteEmails] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listUsers().then((all) => setUsers(all.filter((u) => u.id !== user.id)));
  }, [user]);

  if (!canCreateJobs(user)) {
    return (
      <div className="page">
        <div className="empty-state">
          <span className="empty-icon">🔒</span>
          <h3>Only owners and project managers can create jobs</h3>
          <p>
            <Link to="/">Back to dashboard</Link>
          </p>
        </div>
      </div>
    );
  }

  const set = (key) => (e) => setFields((f) => ({ ...f, [key]: e.target.value }));

  function toggle(id) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  function queueInvite(e) {
    e.preventDefault();
    const email = inviteEmail.trim().toLowerCase();
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Enter a valid email address to invite.');
      return;
    }
    setError('');
    if (!inviteEmails.includes(email)) setInviteEmails((list) => [...list, email]);
    setInviteEmail('');
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      let job = await createJob(fields, user);
      for (const id of selected) {
        job = await addMember(job, id, user);
      }
      for (const email of inviteEmails) {
        job = await inviteByEmail(job, email, user, await findUserByEmail(email));
      }
      navigate(`/jobs/${job.id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="page page-narrow">
      <div className="page-head">
        <div>
          <h2>New Job</h2>
          <p className="muted">Set up the job, pick your crew, and invite anyone not signed up yet.</p>
        </div>
      </div>

      <form onSubmit={submit} className="card form">
        <label>
          Job name *
          <input value={fields.name} onChange={set('name')} placeholder="Riverside Duplex Renovation" required />
        </label>
        <div className="form-row">
          <label>
            Client
            <input value={fields.client} onChange={set('client')} placeholder="Smith Family" />
          </label>
          <label>
            Address
            <input value={fields.address} onChange={set('address')} placeholder="42 Riverside Dr" />
          </label>
        </div>
        <label>
          Description
          <textarea
            value={fields.description}
            onChange={set('description')}
            rows={3}
            placeholder="Scope of work, key dates, anything the crew should know…"
          />
        </label>

        <h3 className="form-section">Team</h3>
        {users.length > 0 ? (
          <ul className="member-pick-list">
            {users.map((u) => (
              <li key={u.id}>
                <label className="member-pick">
                  <input type="checkbox" checked={selected.includes(u.id)} onChange={() => toggle(u.id)} />
                  <Avatar name={u.name} size={30} />
                  <span className="member-pick-name">
                    {u.name}
                    <small>{ROLE_LABELS[u.role]}</small>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No other accounts yet — invite people by email below.</p>
        )}

        <div className="invite-row">
          <input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="Invite by email…"
            onKeyDown={(e) => e.key === 'Enter' && queueInvite(e)}
          />
          <button type="button" className="btn" onClick={queueInvite}>
            Add Invite
          </button>
        </div>
        {inviteEmails.length > 0 && (
          <div className="invite-chips">
            {inviteEmails.map((email) => (
              <span key={email} className="chip chip-active">
                {email}
                <button
                  type="button"
                  aria-label={`Remove invite for ${email}`}
                  onClick={() => setInviteEmails((list) => list.filter((x) => x !== email))}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}

        {error && <p className="form-error">{error}</p>}

        <div className="form-actions">
          <Link to="/" className="btn">
            Cancel
          </Link>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Creating…' : 'Create Job'}
          </button>
        </div>
      </form>
    </div>
  );
}
