import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';
import { listJobsFor, JOB_STATUSES, isOverdue } from '../services/jobs.js';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Zero-padded 'YYYY-MM-DD' for a Date, using its local calendar fields. */
function toIso(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** A job is on the calendar only if it has at least one scheduled date. */
function isScheduled(job) {
  return Boolean(job.startDate || job.dueDate);
}

/** Is the cell iso 'd' within the job's scheduled span (inclusive)? */
function inSpan(job, d) {
  const start = job.startDate ?? job.dueDate;
  const end = job.dueDate ?? job.startDate;
  if (!start || !end) return false;
  return start <= d && d <= end;
}

export default function CalendarPage() {
  const { user } = useApp();
  const [jobs, setJobs] = useState(null);
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  useEffect(() => {
    listJobsFor(user)
      .then(setJobs)
      .catch(() => setJobs([]));
  }, [user]);

  const todayIso = toIso(new Date());

  // Build the 42-cell (6-week) grid starting from the Sunday on/before the 1st.
  const cells = useMemo(() => {
    const monthIndex = cursor.getMonth();
    const firstOfMonth = new Date(cursor.getFullYear(), monthIndex, 1);
    const gridStart = new Date(firstOfMonth);
    gridStart.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());

    const out = [];
    for (let i = 0; i < 42; i++) {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + i);
      out.push({
        iso: toIso(date),
        day: date.getDate(),
        outside: date.getMonth() !== monthIndex,
      });
    }
    return out;
  }, [cursor]);

  if (jobs === null) {
    return <div className="page-loading">Loading calendar…</div>;
  }

  const scheduled = jobs.filter(isScheduled);

  const goToMonth = (delta) => {
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));
  };
  const goToToday = () => {
    const now = new Date();
    setCursor(new Date(now.getFullYear(), now.getMonth(), 1));
  };

  return (
    <div className="page">
      <div className="calendar">
        <div className="cal-head">
          <h2 className="cal-title">
            {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
          </h2>
          <div className="cal-nav">
            <button className="cal-nav-btn" onClick={() => goToMonth(-1)} aria-label="Previous month">
              ◀
            </button>
            <button className="cal-nav-btn" onClick={goToToday}>
              Today
            </button>
            <button className="cal-nav-btn" onClick={() => goToMonth(1)} aria-label="Next month">
              ▶
            </button>
          </div>
        </div>

        <div className="cal-grid">
          {WEEKDAYS.map((wd) => (
            <div key={wd} className="cal-weekday">
              {wd}
            </div>
          ))}

          {cells.map((cell) => {
            const dayJobs = scheduled.filter((job) => inSpan(job, cell.iso));
            const visible = dayJobs.slice(0, 3);
            const extra = dayJobs.length - visible.length;
            const classes = ['cal-cell'];
            if (cell.iso === todayIso) classes.push('cal-today');
            if (cell.outside) classes.push('cal-outside');

            return (
              <div key={cell.iso} className={classes.join(' ')}>
                <span className="cal-daynum">{cell.day}</span>
                <div className="cal-pills">
                  {visible.map((job) => {
                    const info = JOB_STATUSES[job.status];
                    const color = info ? info.color : 'var(--muted)';
                    const overdue = isOverdue(job);
                    return (
                      <Link
                        key={job.id}
                        to={`/jobs/${job.id}`}
                        className={overdue ? 'cal-pill cal-pill-overdue' : 'cal-pill'}
                        style={{ '--pill-color': color }}
                        title={job.name}
                      >
                        {overdue && <span aria-hidden="true">⚠ </span>}
                        {job.name}
                      </Link>
                    );
                  })}
                  {extra > 0 && <span className="cal-more">+{extra} more</span>}
                </div>
              </div>
            );
          })}
        </div>

        <div className="cal-legend">
          {Object.entries(JOB_STATUSES).map(([key, info]) => (
            <span key={key} className="cal-legend-item">
              <span className="cal-legend-dot" style={{ background: info.color }} />
              {info.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
