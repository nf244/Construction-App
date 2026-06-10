const PALETTE = ['#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#14b8a6', '#f97316'];

export default function Avatar({ name = '?', size = 32 }) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const color = PALETTE[hash % PALETTE.length];
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, fontSize: size * 0.4, background: color }}
      title={name}
    >
      {initials || '?'}
    </span>
  );
}
