import { JOB_STATUSES } from '../services/jobs.js';

export default function ProgressBar({ progress, status, size = 'md' }) {
  const color = JOB_STATUSES[status]?.color ?? '#f59e0b';
  return (
    <div className={`progress ${size === 'lg' ? 'progress-lg' : ''}`}>
      <div className="progress-track">
        <div
          className="progress-fill"
          style={{ width: `${progress}%`, background: color }}
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
      <span className="progress-label">{progress}%</span>
    </div>
  );
}
