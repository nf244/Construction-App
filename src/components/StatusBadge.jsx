import { JOB_STATUSES } from '../services/jobs.js';

export default function StatusBadge({ status }) {
  const info = JOB_STATUSES[status] ?? { label: status, color: '#8b8b9e' };
  return (
    <span className="badge" style={{ '--badge-color': info.color }}>
      {info.label}
    </span>
  );
}
