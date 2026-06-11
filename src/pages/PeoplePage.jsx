import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { listUsers, updateUserRole, ROLE_LABELS } from '../services/auth.js';
import { ROLES, isOwnerLevel } from '../services/roles.js';
import Avatar from '../components/Avatar.jsx';

const ALL_SECTIONS = [
  { value: ROLES.OWNER, label: 'Owner', desc: 'Sees all jobs, manages the team' },
  { value: ROLES.PROJECT_MANAGER, label: 'Project Manager', desc: 'Creates jobs, runs their own' },
  { value: ROLES.EMPLOYEE, label: 'Employee', desc: 'Posts updates on assigned jobs' },
];

export default function PeoplePage() {
  const { user } = useApp();
  const [users, setUsers] = useState(null);
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { listUsers().then(setUsers); }, []);

  if (!isOwnerLevel(user.role)) {
    return (
      <div className="page">
        <div className="empty-state">
          <span className="empty-icon">🔒</span>
          <h3>Owners only</h3>
        </div>
      </div>
    );
  }

  if (!users) return <div className="page-loading">Loading people…</div>;

  // Options this actor can assign. Admin can make owners; owners cannot.
  const assignableRoles = user.role === ROLES.ADMIN
    ? [ROLES.OWNER, ROLES.PROJECT_MANAGER, ROLES.EMPLOYEE]
    : [ROLES.PROJECT_MANAGER, ROLES.EMPLOYEE];

  const owners = users.filter((u) => u.role === ROLES.OWNER);

  async function changeRole(targetId, newRole) {
    setError('');
    // Only admin can demote the last owner (owners can't touch owner role at all).
    if (user.role === ROLES.ADMIN && owners.length === 1 && owners[0].id === targetId && newRole !== ROLES.OWNER) {
      setError('Cannot demote the only owner. Promote someone else to Owner first.');
      return;
    }
    setSaving(targetId);
    try {
      const updated = await updateUserRole(targetId, newRole, user);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(null);
    }
  }

  const byRole = {
    [ROLES.OWNER]: users.filter((u) => u.role === ROLES.OWNER),
    [ROLES.PROJECT_MANAGER]: users.filter((u) => u.role === ROLES.PROJECT_MANAGER),
    [ROLES.EMPLOYEE]: users.filter((u) => u.role === ROLES.EMPLOYEE),
  };

  return (
    <div className="page page-narrow">
      <div className="page-head">
        <div>
          <h2>People</h2>
          <p className="muted">
            {user.role === ROLES.ADMIN
              ? 'You can assign any role. Owners can promote employees to Project Manager.'
              : 'Promote employees to Project Manager or move them back.'}
          </p>
        </div>
        <div className="people-summary">
          {ALL_SECTIONS.map((r) => (
            <span key={r.value} className="chip">
              {byRole[r.value].length} {r.label}{byRole[r.value].length !== 1 ? 's' : ''}
            </span>
          ))}
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}

      {ALL_SECTIONS.map(({ value, label, desc }) => (
        <section key={value} className="people-section">
          <div className="people-section-head">
            <h3>{label}s</h3>
            <span className="muted">{desc}</span>
          </div>
          {byRole[value].length === 0 ? (
            <p className="people-empty muted">No {label.toLowerCase()}s yet.</p>
          ) : (
            <ul className="people-list">
              {byRole[value].map((u) => (
                <li key={u.id} className="people-row card">
                  <Avatar name={u.name} size={40} />
                  <div className="people-info">
                    <strong>{u.name}</strong>
                    <span className="muted">{u.email}</span>
                  </div>
                  <div className="people-role">
                    {u.id === user.id ? (
                      <span className="chip chip-active">{ROLE_LABELS[u.role]} (you)</span>
                    ) : u.role === ROLES.OWNER && user.role !== ROLES.ADMIN ? (
                      // Owners cannot touch other owners — only admin can.
                      <span className="chip">{ROLE_LABELS[u.role]}</span>
                    ) : (
                      <select
                        value={u.role}
                        disabled={saving === u.id}
                        onChange={(e) => changeRole(u.id, e.target.value)}
                        aria-label={`Role for ${u.name}`}
                      >
                        {assignableRoles.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                    )}
                    {saving === u.id && <span className="people-saving muted">Saving…</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
