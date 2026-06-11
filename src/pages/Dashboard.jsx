import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';
import { listJobsFor, canCreateJobs, JOB_STATUSES } from '../services/jobs.js';
import { listUsers } from '../services/auth.js';
import { isOwnerLevel } from '../services/roles.js';
import ProgressBar from '../components/ProgressBar.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import Avatar from '../components/Avatar.jsx';

export default function Dashboard() {
  const { user } = useApp();
  const [jobs, setJobs] = useState(null);
  const [users, setUsers] = useState([]);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    listJobsFor(user).then(setJobs);
    listUsers().then(setUsers);
  }, [user]);

  if (!jobs) return <div className="page-loading">Loading jobs…</div>;

  const filtered = filter === 'all' ? jobs : jobs.filter((j) => j.status === filter);
  const usersById = Object.fromEntries(users.map((u) => [u.id, u]));
  const active = jobs.filter((j) => j.status === 'in_progress').length;
  const done = jobs.filter((j) => j.status === 'completed').length;
  const avgProgress = jobs.length
    ? Math.round(jobs.reduce((sum, j) => sum + j.progress, 0) / jobs.length)
    : 0;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>{isOwnerLevel(user.role) ? 'All Jobs' : 'My Jobs'}</h2>
          <p className="muted">
            {isOwnerLevel(user.role)
              ? 'Company-wide view of every job and how far along it is.'
              : 'Jobs you manage or are assigned to.'}
          </p>
        </div>
        {canCreateJobs(user) && (
          <Link to="/jobs/new" className="btn btn-primary">
            + New Job
          </Link>
        )}
      </div>

      {jobs.length > 0 && (
        <div className="stat-row">
          <div className="stat">
            <span className="stat-value">{jobs.length}</span>
            <span className="stat-label">Total jobs</span>
          </div>
          <div className="stat">
            <span className="stat-value">{active}</span>
            <span className="stat-label">In progress</span>
          </div>
          <div className="stat">
            <span className="stat-value">{done}</span>
            <span className="stat-label">Completed</span>
          </div>
          <div className="stat">
            <span className="stat-value">{avgProgress}%</span>
            <span className="stat-label">Avg. progress</span>
          </div>
        </div>
      )}

      <div className="filter-row">
        <button className={filter === 'all' ? 'chip chip-active' : 'chip'} onClick={() => setFilter('all')}>
          All
        </button>
        {Object.entries(JOB_STATUSES).map(([key, info]) => (
          <button
            key={key}
            className={filter === key ? 'chip chip-active' : 'chip'}
            onClick={() => setFilter(key)}
          >
            {info.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">🚧</span>
          <h3>{jobs.length === 0 ? 'No jobs yet' : 'No jobs match this filter'}</h3>
          {jobs.length === 0 && canCreateJobs(user) && (
            <p>
              Create your first job and invite the crew. <Link to="/jobs/new">Start one now →</Link>
            </p>
          )}
          {jobs.length === 0 && !canCreateJobs(user) && (
            <p>When a project manager adds you to a job, it will show up here.</p>
          )}
        </div>
      ) : (
        <div className="job-grid">
          {filtered.map((job) => (
            <Link to={`/jobs/${job.id}`} key={job.id} className="job-card">
              <div className="job-card-top">
                <h3>{job.name}</h3>
                <StatusBadge status={job.status} />
              </div>
              {job.client && <p className="job-card-client">{job.client}</p>}
              {job.address && <p className="job-card-address">📍 {job.address}</p>}
              <ProgressBar progress={job.progress} status={job.status} />
              <div className="job-card-foot">
                <div className="avatar-stack">
                  {job.memberIds.slice(0, 4).map((id) => (
                    <Avatar key={id} name={usersById[id]?.name ?? '?'} size={26} />
                  ))}
                  {job.memberIds.length > 4 && (
                    <span className="avatar-more">+{job.memberIds.length - 4}</span>
                  )}
                </div>
                <span className="muted">
                  {job.updates.length} update{job.updates.length === 1 ? '' : 's'}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
