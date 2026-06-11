import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';
import {
  getJob,
  postUpdate,
  setStatus,
  setProgress,
  removeMember,
  inviteByEmail,
  revokeInvite,
  canManageJob,
  canPostUpdates,
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
          </div>
          {job.client && <p className="muted">Client: {job.client}</p>}
          {job.address && <p className="muted">📍 {job.address}</p>}
          {job.description && <p className="job-desc">{job.description}</p>}
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
                <li key={u.id} className="update card">
                  <div className="update-head">
                    <Avatar name={usersById[u.authorId]?.name ?? '?'} size={32} />
                    <div>
                      <strong>{usersById[u.authorId]?.name ?? 'Unknown'}</strong>
                      <span className="muted update-time">{formatDate(u.createdAt)}</span>
                    </div>
                    {u.progress !== null && <span className="update-progress">→ {u.progress}%</span>}
                  </div>
                  {u.text && <p className="update-text">{u.text}</p>}
                  {u.photoIds.length > 0 && (
                    <div className="photo-grid">
                      {u.photoIds.map((pid) =>
                        photos[pid] ? (
                          <button
                            key={pid}
                            type="button"
                            className="photo-thumb"
                            onClick={() => setLightbox(photos[pid])}
                          >
                            <img src={photoUrl(photos[pid], { thumb: true })} alt="" loading="lazy" />
                          </button>
                        ) : (
                          <span key={pid} className="photo-thumb photo-thumb-loading" />
                        ),
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <aside className="job-side">
          <TeamPanel job={job} user={user} usersById={usersById} manager={manager} run={run} />
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

function formatDate(ts) {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
