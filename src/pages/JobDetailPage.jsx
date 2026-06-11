import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';
import {
  getJob,
  editJob,
  postUpdate,
  deleteUpdate,
  addComment,
  deleteComment,
  setStatus,
  setProgress,
  addTask,
  toggleTask,
  incrementTask,
  deleteTask,
  removeMember,
  inviteByEmail,
  revokeInvite,
  canManageJob,
  canPostUpdates,
  canModerate,
  jobDuration,
  isOverdue,
  JOB_STATUSES,
} from '../services/jobs.js';
import { listUsers, findUserByEmail, ROLE_LABELS } from '../services/auth.js';
import { getPhoto, photoUrl } from '../services/images.js';
import ProgressBar from '../components/ProgressBar.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import Avatar from '../components/Avatar.jsx';
import PhotoUploader from '../components/PhotoUploader.jsx';
import Lightbox from '../components/Lightbox.jsx';

export default function JobDetailPage() {
  const { id } = useParams();
  const { user } = useApp();
  const [job, setJob] = useState(null);
  const [users, setUsers] = useState([]);
  const [photos, setPhotos] = useState({});
  const [lightbox, setLightbox] = useState(null);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    getJob(id)
      .then((j) => (j ? setJob(j) : setNotFound(true)))
      .catch(() => setNotFound(true));
    listUsers().then(setUsers).catch(() => setUsers([]));
  }, [id]);

  // Load every photo referenced by the job's updates (thumbnails render lazily).
  useEffect(() => {
    if (!job) return;
    const ids = job.updates.flatMap((u) => u.photoIds).filter((pid) => !(pid in photos));
    if (ids.length === 0) return;
    Promise.all(ids.map((pid) => getPhoto(pid))).then((loaded) => {
      setPhotos((prev) => {
        const next = { ...prev };
        loaded.forEach((p, i) => (next[ids[i]] = p));
        return next;
      });
    });
  }, [job]); // eslint-disable-line react-hooks/exhaustive-deps

  const usersById = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users]);

  if (notFound) {
    return (
      <div className="page">
        <div className="empty-state">
          <span className="empty-icon">🤔</span>
          <h3>Job not found</h3>
          <p>
            <Link to="/">Back to dashboard</Link>
          </p>
        </div>
      </div>
    );
  }
  if (!job) return <div className="page-loading">Loading job…</div>;

  const manager = canManageJob(user, job);
  const member = canPostUpdates(user, job);

  async function run(action) {
    setError('');
    try {
      const next = await action();
      if (next) setJob(next);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="page">
      <Link to="/" className="back-link">
        ← All jobs
      </Link>

      <div className="job-head card">
        <div className="job-head-main">
          <div className="job-head-title">
            <h2>{job.name}</h2>
            <StatusBadge status={job.status} />
            {isOverdue(job) && <span className="badge" style={{ '--badge-color': '#ef4444' }}>Overdue</span>}
          </div>
          {job.client && <p className="muted">Client: {job.client}</p>}
          {job.address && <p className="muted">📍 {job.address}</p>}
          {job.description && <p className="job-desc">{job.description}</p>}
          <JobDates job={job} user={user} manager={manager} run={run} />
        </div>
        <div className="job-head-progress">
          <ProgressBar progress={job.progress} status={job.status} size="lg" />
          {manager && (
            <div className="manager-controls">
              <label>
                Progress
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={job.progress}
                  onChange={(e) => run(() => setProgress(job, e.target.value, user))}
                />
              </label>
              <label>
                Status
                <select value={job.status} onChange={(e) => run(() => setStatus(job, e.target.value, user))}>
                  {Object.entries(JOB_STATUSES).map(([key, info]) => (
                    <option key={key} value={key}>
                      {info.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}

      <div className="job-columns">
        <div className="job-main">
          <TasksPanel job={job} user={user} onJobChange={setJob} manager={manager} member={member} />

          {member ? (
            <UpdateComposer job={job} user={user} onPosted={setJob} onPhotosAdded={setPhotos} />
          ) : (
            <p className="muted card">You can view this job but only team members can post updates.</p>
          )}

          <h3 className="section-title">Progress Updates</h3>
          {job.updates.length === 0 ? (
            <p className="muted">No updates yet. Post the first one with photos from the site.</p>
          ) : (
            <ul className="timeline">
              {job.updates.map((u) => (
                <UpdateCard
                  key={u.id}
                  update={u}
                  job={job}
                  user={user}
                  usersById={usersById}
                  photos={photos}
                  onOpenPhoto={setLightbox}
                  run={run}
                />
              ))}
            </ul>
          )}
        </div>

        <aside className="job-side">
          <TeamPanel job={job} user={user} usersById={usersById} manager={manager} run={run} />
          <ReportPanel job={job} usersById={usersById} />
        </aside>
      </div>

      <Lightbox photo={lightbox} onClose={() => setLightbox(null)} />
    </div>
  );
}

function UpdateComposer({ job, user, onPosted, onPhotosAdded }) {
  const [text, setText] = useState('');
  const [withProgress, setWithProgress] = useState(false);
  const [progress, setProgressValue] = useState(job.progress);
  const [pendingPhotos, setPendingPhotos] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const next = await postUpdate(
        job,
        {
          text,
          progress: withProgress ? Number(progress) : null,
          photoIds: pendingPhotos.map((p) => p.id),
        },
        user,
      );
      onPhotosAdded((prev) => {
        const map = { ...prev };
        for (const p of pendingPhotos) map[p.id] = p;
        return map;
      });
      onPosted(next);
      setText('');
      setPendingPhotos([]);
      setWithProgress(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card form composer" onSubmit={submit}>
      <h3>Post an update</h3>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="What got done today? Framing finished on the second floor…"
      />
      <PhotoUploader
        jobId={job.id}
        uploaderId={user.id}
        photos={pendingPhotos}
        onChange={setPendingPhotos}
      />
      <label className="composer-progress">
        <input type="checkbox" checked={withProgress} onChange={(e) => setWithProgress(e.target.checked)} />
        Update overall progress
        {withProgress && (
          <>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={progress}
              onChange={(e) => setProgressValue(e.target.value)}
            />
            <strong>{progress}%</strong>
          </>
        )}
      </label>
      {error && <p className="form-error">{error}</p>}
      <button className="btn btn-primary" disabled={busy}>
        {busy ? 'Posting…' : 'Post Update'}
      </button>
    </form>
  );
}

function TeamPanel({ job, user, usersById, manager, run }) {
  const [email, setEmail] = useState('');

  async function invite(e) {
    e.preventDefault();
    const value = email.trim();
    if (!value) return;
    await run(async () => inviteByEmail(job, value, user, await findUserByEmail(value)));
    setEmail('');
  }

  return (
    <div className="card">
      <h3>Team</h3>
      <ul className="team-list">
        {job.memberIds.map((id) => {
          const u = usersById[id];
          return (
            <li key={id}>
              <Avatar name={u?.name ?? '?'} size={30} />
              <span className="team-name">
                {u?.name ?? 'Unknown user'}
                <small>
                  {u ? ROLE_LABELS[u.role] : ''}
                  {id === job.managerId ? ' · runs this job' : ''}
                </small>
              </span>
              {manager && id !== job.managerId && (
                <button
                  className="icon-btn"
                  aria-label={`Remove ${u?.name ?? 'member'}`}
                  onClick={() => run(() => removeMember(job, id, user))}
                >
                  ✕
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {job.invites.length > 0 && (
        <>
          <h4 className="team-subhead">Pending invites</h4>
          <ul className="team-list">
            {job.invites.map((i) => (
              <li key={i.email}>
                <span className="invite-dot">✉️</span>
                <span className="team-name">
                  {i.email}
                  <small>joins automatically on sign-up</small>
                </span>
                {manager && (
                  <button
                    className="icon-btn"
                    aria-label={`Revoke invite for ${i.email}`}
                    onClick={() => run(() => revokeInvite(job, i.email, user))}
                  >
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {manager && (
        <form className="invite-row" onSubmit={invite}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Invite by email…"
          />
          <button className="btn">Invite</button>
        </form>
      )}
    </div>
  );
}

function TasksPanel({ job, user, onJobChange, manager, member }) {
  const tasks = job.tasks ?? [];
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: '', type: 'check', target: '' });
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  if (tasks.length === 0 && !manager) return null;

  const doneCount = tasks.filter((t) =>
    t.type === 'check' ? t.done : t.count >= t.target,
  ).length;

  async function run(action) {
    try {
      const next = await action();
      if (next) onJobChange(next);
    } catch (err) {
      setFormError(err.message);
    }
  }

  async function submitAdd(e) {
    e.preventDefault();
    setFormError('');
    setBusy(true);
    try {
      const next = await addTask(job, form, user);
      onJobChange(next);
      setForm({ title: '', type: 'check', target: '' });
      setAdding(false);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tasks-panel card">
      <div className="tasks-head">
        <h3>
          Tasks
          {tasks.length > 0 && (
            <span className="tasks-badge">{doneCount}/{tasks.length}</span>
          )}
        </h3>
        {manager && (
          <button className="btn btn-sm" onClick={() => { setAdding((v) => !v); setFormError(''); }}>
            {adding ? 'Cancel' : '+ Add task'}
          </button>
        )}
      </div>

      {adding && (
        <form className="task-add-form" onSubmit={submitAdd}>
          <input
            autoFocus
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Task description…"
          />
          <select
            value={form.type}
            onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
          >
            <option value="check">Checkbox</option>
            <option value="count">Counter</option>
          </select>
          {form.type === 'count' && (
            <input
              type="number"
              min={1}
              value={form.target}
              onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))}
              placeholder="Target quantity"
              style={{ width: '120px' }}
            />
          )}
          <button className="btn btn-primary btn-sm" disabled={busy}>Add</button>
          {formError && <p className="form-error" style={{ margin: '0.25rem 0 0' }}>{formError}</p>}
        </form>
      )}

      {tasks.length === 0 ? (
        <p className="muted tasks-empty">
          No tasks yet. Add checkboxes for to-do steps or counters for quantity tracking (e.g. 80 wash stations).
        </p>
      ) : (
        <ul className="task-list">
          {tasks.map((task) => (
            <li key={task.id} className="task-item">
              {task.type === 'check' ? (
                <div className={`task-row${task.done ? ' task-done' : ''}`}>
                  <button
                    className="task-checkbox"
                    onClick={() => member && run(() => toggleTask(job, task.id, user))}
                    disabled={!member}
                    aria-label={task.done ? 'Mark incomplete' : 'Mark complete'}
                  >
                    {task.done ? '✓' : ''}
                  </button>
                  <span className="task-title">{task.title}</span>
                  {manager && (
                    <button className="icon-btn task-del" onClick={() => run(() => deleteTask(job, task.id, user))} aria-label="Delete task">✕</button>
                  )}
                </div>
              ) : (
                <div className={`task-row task-count-row${task.count >= task.target ? ' task-done' : ''}`}>
                  <span className="task-title">{task.title}</span>
                  <div className="task-counter">
                    {member && (
                      <button className="icon-btn" onClick={() => run(() => incrementTask(job, task.id, -1, user))} disabled={task.count <= 0}>−</button>
                    )}
                    <span className="task-count-val">{task.count}<span className="task-count-sep">/{task.target}</span></span>
                    {member && (
                      <button className="icon-btn" onClick={() => run(() => incrementTask(job, task.id, 1, user))} disabled={task.count >= task.target}>+</button>
                    )}
                  </div>
                  {manager && (
                    <button className="icon-btn task-del" onClick={() => run(() => deleteTask(job, task.id, user))} aria-label="Delete task">✕</button>
                  )}
                  <div className="task-bar">
                    <div className="task-bar-fill" style={{ width: `${Math.round((task.count / task.target) * 100)}%` }} />
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Scheduled dates + live duration line, with inline editing for managers. */
function JobDates({ job, user, manager, run }) {
  const [editing, setEditing] = useState(false);
  const [dates, setDates] = useState({ startDate: job.startDate ?? '', dueDate: job.dueDate ?? '' });
  const duration = jobDuration(job);

  async function save(e) {
    e.preventDefault();
    await run(() => editJob(job, { startDate: dates.startDate, dueDate: dates.dueDate }, user));
    setEditing(false);
  }

  if (editing) {
    return (
      <form className="edit-dates-form" onSubmit={save}>
        <label>
          Start date
          <input
            type="date"
            value={dates.startDate}
            onChange={(e) => setDates((d) => ({ ...d, startDate: e.target.value }))}
          />
        </label>
        <label>
          Due date
          <input
            type="date"
            value={dates.dueDate}
            min={dates.startDate || undefined}
            onChange={(e) => setDates((d) => ({ ...d, dueDate: e.target.value }))}
          />
        </label>
        <button className="btn btn-primary btn-sm">Save</button>
        <button type="button" className="btn btn-sm" onClick={() => setEditing(false)}>
          Cancel
        </button>
      </form>
    );
  }

  return (
    <div className="job-dates">
      {job.startDate && <span>🗓️ Starts {formatDay(job.startDate)}</span>}
      {job.dueDate && (
        <span className={isOverdue(job) ? 'overdue' : ''}>⏰ Due {formatDay(job.dueDate)}</span>
      )}
      {duration && (
        <span className="job-duration">
          ⏱ {duration.label} {duration.days} day{duration.days === 1 ? '' : 's'}
        </span>
      )}
      {manager && (
        <button type="button" className="comment-toggle" onClick={() => setEditing(true)}>
          {job.startDate || job.dueDate ? 'Edit dates' : '+ Set dates'}
        </button>
      )}
    </div>
  );
}

/** One progress update: header, text, photos, delete, and comment thread. */
function UpdateCard({ update, job, user, usersById, photos, onOpenPhoto, run }) {
  const canDelete = canModerate(user, job, update.authorId);

  return (
    <li className="update card">
      <div className="update-head">
        <Avatar name={usersById[update.authorId]?.name ?? '?'} size={32} />
        <div>
          <strong>{usersById[update.authorId]?.name ?? 'Unknown'}</strong>
          <span className="muted update-time">{formatDate(update.createdAt)}</span>
        </div>
        {update.progress !== null && <span className="update-progress">→ {update.progress}%</span>}
        {canDelete && (
          <span className="update-actions">
            <button
              className="icon-btn update-del"
              aria-label="Delete update"
              onClick={() => {
                if (window.confirm('Delete this update? This cannot be undone.')) {
                  run(() => deleteUpdate(job, update.id, user));
                }
              }}
            >
              ✕
            </button>
          </span>
        )}
      </div>
      {update.text && <p className="update-text">{update.text}</p>}
      {update.photoIds.length > 0 && (
        <div className="photo-grid">
          {update.photoIds.map((pid) =>
            photos[pid] ? (
              <button key={pid} type="button" className="photo-thumb" onClick={() => onOpenPhoto(photos[pid])}>
                <img src={photoUrl(photos[pid], { thumb: true })} alt="" loading="lazy" />
              </button>
            ) : (
              <span key={pid} className="photo-thumb photo-thumb-loading" />
            ),
          )}
        </div>
      )}
      <CommentThread update={update} job={job} user={user} usersById={usersById} run={run} />
    </li>
  );
}

function CommentThread({ update, job, user, usersById, run }) {
  const comments = update.comments ?? [];
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const member = canPostUpdates(user, job);

  async function submit(e) {
    e.preventDefault();
    if (!text.trim()) return;
    await run(() => addComment(job, update.id, text, user));
    setText('');
  }

  if (comments.length === 0 && !member) return null;

  return (
    <div className="comments">
      {comments.length > 0 && (
        <ul className="comment-list">
          {comments.map((c) => (
            <li key={c.id} className="comment">
              <Avatar name={usersById[c.authorId]?.name ?? '?'} size={24} />
              <div className="comment-body">
                <strong>{usersById[c.authorId]?.name ?? 'Unknown'}</strong>
                <span className="comment-time">{formatDate(c.createdAt)}</span>
                <p>{c.text}</p>
              </div>
              {canModerate(user, job, c.authorId) && (
                <button
                  className="icon-btn comment-del"
                  aria-label="Delete comment"
                  onClick={() => run(() => deleteComment(job, update.id, c.id, user))}
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {member &&
        (open ? (
          <form className="comment-form" onSubmit={submit}>
            <input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Write a comment…"
            />
            <button className="btn btn-sm">Post</button>
          </form>
        ) : (
          <button type="button" className="comment-toggle" onClick={() => setOpen(true)}>
            💬 {comments.length > 0 ? 'Reply' : 'Comment'}
          </button>
        ))}
    </div>
  );
}

function ReportPanel({ job, usersById }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function download() {
    setBusy(true);
    setError('');
    try {
      // jspdf is heavy — load it only when a report is actually requested.
      const { generateJobReport } = await import('../services/report.js');
      await generateJobReport(job, usersById);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ marginTop: '1rem' }}>
      <h3>Report</h3>
      <p className="muted">Download a PDF with the full job history — progress, tasks, updates, and photos.</p>
      {error && <p className="form-error">{error}</p>}
      <button className="btn btn-block" onClick={download} disabled={busy}>
        {busy ? 'Generating…' : '📄 Download PDF Report'}
      </button>
    </div>
  );
}

function formatDay(isoDate) {
  return new Date(isoDate + 'T00:00:00').toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDate(ts) {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
