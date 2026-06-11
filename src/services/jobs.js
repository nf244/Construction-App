/**
 * Jobs service: job documents, team membership, invites, progress updates,
 * and role-based permissions.
 *
 * Job shape (maps 1:1 to a future Firestore document):
 * {
 *   id, name, client, address, description,
 *   createdBy, managerId,
 *   memberIds: [userId],
 *   invites: [{ email, invitedBy, at }],     // pending until that email registers
 *   status: 'planning' | 'in_progress' | 'on_hold' | 'completed',
 *   progress: 0..100,
 *   startDate, dueDate,                       // 'YYYY-MM-DD' scheduling (optional)
 *   startedAt, completedAt,                   // actual timestamps, auto-set
 *   updates: [{ id, authorId, text, progress|null, photoIds: [], comments: [], createdAt }],
 *   comments on update: [{ id, authorId, text, createdAt }],
 *   tasks: [{ id, type:'check'|'count', ... }],
 *   createdAt, updatedAt
 * }
 */

import { getDoc, listDocs, putDoc, newId } from './storage.js';
import { deletePhoto } from './images.js';
import { ROLES, isOwnerLevel } from './roles.js';

export const JOB_STATUSES = {
  planning: { label: 'Planning', color: '#8b8b9e' },
  in_progress: { label: 'In Progress', color: '#f59e0b' },
  on_hold: { label: 'On Hold', color: '#ef4444' },
  completed: { label: 'Completed', color: '#22c55e' },
};

export async function createJob({ name, client, address, description, startDate, dueDate }, creator) {
  if (!canCreateJobs(creator)) throw new Error('Only owners and project managers can create jobs.');
  if (!name.trim()) throw new Error('Job name is required.');
  if (startDate && dueDate && startDate > dueDate) {
    throw new Error('Due date cannot be before the start date.');
  }

  const now = Date.now();
  const job = {
    id: newId(),
    name: name.trim(),
    client: client.trim(),
    address: address.trim(),
    description: description.trim(),
    createdBy: creator.id,
    managerId: creator.id,
    memberIds: [creator.id],
    invites: [],
    status: 'planning',
    progress: 0,
    startDate: startDate || null,
    dueDate: dueDate || null,
    startedAt: null,
    completedAt: null,
    tasks: [],
    updates: [],
    createdAt: now,
    updatedAt: now,
  };
  await putDoc('jobs', job);
  return job;
}

/** Edit core job details. Manager/owner only. */
export async function editJob(job, fields, actor) {
  if (!canManageJob(actor, job)) throw new Error("Only the owner or this job's manager can edit the job.");
  const startDate = fields.startDate ?? job.startDate;
  const dueDate = fields.dueDate ?? job.dueDate;
  if (startDate && dueDate && startDate > dueDate) {
    throw new Error('Due date cannot be before the start date.');
  }
  if ('name' in fields && !fields.name.trim()) throw new Error('Job name is required.');
  const next = {
    ...job,
    name: fields.name?.trim() ?? job.name,
    client: fields.client?.trim() ?? job.client,
    address: fields.address?.trim() ?? job.address,
    description: fields.description?.trim() ?? job.description,
    startDate: startDate || null,
    dueDate: dueDate || null,
  };
  return saveJob(next);
}

export async function getJob(id) {
  return getDoc('jobs', id);
}

/** Jobs visible to a user: owner-level accounts see everything, others see jobs they belong to. */
export async function listJobsFor(user) {
  const jobs = await listDocs('jobs');
  const visible = isOwnerLevel(user.role) ? jobs : jobs.filter((j) => j.memberIds.includes(user.id));
  return visible.sort((a, b) => b.updatedAt - a.updatedAt);
}

// ---- permissions -----------------------------------------------------------

export function canCreateJobs(user) {
  return isOwnerLevel(user.role) || user.role === ROLES.PROJECT_MANAGER;
}

export function canManageJob(user, job) {
  if (isOwnerLevel(user.role) || job.managerId === user.id) return true;
  // Any project manager assigned to the job can also manage it.
  return user.role === ROLES.PROJECT_MANAGER && job.memberIds.includes(user.id);
}

export function canPostUpdates(user, job) {
  return isOwnerLevel(user.role) || job.memberIds.includes(user.id);
}

/** Can this user remove a specific update/comment? Managers, or the author. */
export function canModerate(user, job, authorId) {
  return canManageJob(user, job) || authorId === user.id;
}

// ---- duration --------------------------------------------------------------

/** Raw whole-day difference between two timestamps/date-strings (min 0). */
export function daysBetween(from, to) {
  if (from == null || to == null) return null;
  const a = typeof from === 'number' ? from : new Date(from + 'T00:00:00').getTime();
  const b = typeof to === 'number' ? to : new Date(to + 'T00:00:00').getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/** Human duration for a job: actual elapsed if started, else scheduled window. */
export function jobDuration(job) {
  if (job.startedAt) {
    const end = job.completedAt ?? Date.now();
    // Same-day start/finish reads as "1 day", not "0 days".
    const days = Math.max(1, daysBetween(job.startedAt, end));
    return {
      label: job.completedAt ? 'Took' : 'Running for',
      days,
      ongoing: !job.completedAt,
    };
  }
  if (job.startDate && job.dueDate) {
    // Scheduled windows count inclusively: Jun 15 → Jun 15 is a 1-day job.
    return { label: 'Scheduled', days: daysBetween(job.startDate, job.dueDate) + 1, ongoing: false };
  }
  return null;
}

/** Today as a LOCAL-calendar 'YYYY-MM-DD' (toISOString would use UTC). */
export function todayIso() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Is the job past its due date and not yet complete? */
export function isOverdue(job) {
  if (!job.dueDate || job.status === 'completed') return false;
  return job.dueDate < todayIso();
}

// ---- team & invites --------------------------------------------------------

export async function addMember(job, userId, actor) {
  if (!canManageJob(actor, job)) throw new Error("Only the owner or this job's manager can add people.");
  if (job.memberIds.includes(userId)) return job;
  return saveJob({ ...job, memberIds: [...job.memberIds, userId] });
}

export async function removeMember(job, userId, actor) {
  if (!canManageJob(actor, job)) throw new Error("Only the owner or this job's manager can remove people.");
  if (userId === job.managerId) throw new Error('The job manager cannot be removed.');
  return saveJob({ ...job, memberIds: job.memberIds.filter((id) => id !== userId) });
}

/** Invite by email. If no account exists yet, the invite stays pending and is
 *  redeemed automatically the first time that email signs in. */
export async function inviteByEmail(job, email, actor, existingUser) {
  if (!canManageJob(actor, job)) throw new Error("Only the owner or this job's manager can invite people.");
  const clean = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new Error('Enter a valid email address.');

  if (existingUser) {
    return addMember(job, existingUser.id, actor);
  }
  if (job.invites.some((i) => i.email === clean)) return job;
  return saveJob({
    ...job,
    invites: [...job.invites, { email: clean, invitedBy: actor.id, at: Date.now() }],
  });
}

export async function revokeInvite(job, email, actor) {
  if (!canManageJob(actor, job)) throw new Error("Only the owner or this job's manager can manage invites.");
  return saveJob({ ...job, invites: job.invites.filter((i) => i.email !== email) });
}

/** Called after login/registration: converts pending email invites into memberships. */
export async function redeemInvitesFor(user) {
  const jobs = await listDocs('jobs');
  for (const job of jobs) {
    if (job.invites.some((i) => i.email === user.email)) {
      await saveJob({
        ...job,
        memberIds: job.memberIds.includes(user.id) ? job.memberIds : [...job.memberIds, user.id],
        invites: job.invites.filter((i) => i.email !== user.email),
      });
    }
  }
}

// ---- progress --------------------------------------------------------------

export async function postUpdate(job, { text, progress, photoIds }, author) {
  if (!canPostUpdates(author, job)) throw new Error("You are not on this job's team.");
  if (!text.trim() && photoIds.length === 0) throw new Error('Add a description or at least one photo.');

  const update = {
    id: newId(),
    authorId: author.id,
    text: text.trim(),
    progress: progress ?? null,
    photoIds,
    comments: [],
    createdAt: Date.now(),
  };

  const next = { ...job, updates: [update, ...job.updates] };
  if (progress !== null && progress !== undefined) {
    next.progress = clampProgress(progress);
    if (next.progress >= 100) next.status = 'completed';
    else if (next.status === 'planning' && next.progress > 0) next.status = 'in_progress';
  }
  return saveJob(stampStatus(next, job));
}

/** Remove an update and its photos. Manager or author only. */
export async function deleteUpdate(job, updateId, actor) {
  const target = job.updates.find((u) => u.id === updateId);
  if (!target) return job;
  if (!canModerate(actor, job, target.authorId)) {
    throw new Error('You can only delete your own updates.');
  }
  const next = await saveJob({ ...job, updates: job.updates.filter((u) => u.id !== updateId) });
  // Photos are only referenced by this update — delete them too so they
  // don't pile up as unreachable ~1MB docs in Firestore. Best-effort: a
  // failed photo delete shouldn't undo the update removal.
  await Promise.allSettled((target.photoIds ?? []).map((pid) => deletePhoto(pid)));
  return next;
}

// ---- comments --------------------------------------------------------------

export async function addComment(job, updateId, text, author) {
  if (!canPostUpdates(author, job)) throw new Error("You are not on this job's team.");
  if (!text.trim()) throw new Error('Write a comment first.');
  const comment = { id: newId(), authorId: author.id, text: text.trim(), createdAt: Date.now() };
  const updates = job.updates.map((u) =>
    u.id === updateId ? { ...u, comments: [...(u.comments ?? []), comment] } : u,
  );
  return saveJob({ ...job, updates });
}

export async function deleteComment(job, updateId, commentId, actor) {
  const update = job.updates.find((u) => u.id === updateId);
  const comment = update?.comments?.find((c) => c.id === commentId);
  if (!comment) return job;
  if (!canModerate(actor, job, comment.authorId)) {
    throw new Error('You can only delete your own comments.');
  }
  const updates = job.updates.map((u) =>
    u.id === updateId ? { ...u, comments: u.comments.filter((c) => c.id !== commentId) } : u,
  );
  return saveJob({ ...job, updates });
}

export async function setStatus(job, status, actor) {
  if (!canManageJob(actor, job)) throw new Error("Only the owner or this job's manager can change status.");
  if (!JOB_STATUSES[status]) throw new Error('Unknown status.');
  const next = { ...job, status };
  if (status === 'completed') next.progress = 100;
  return saveJob(stampStatus(next, job));
}

export async function setProgress(job, progress, actor) {
  if (!canManageJob(actor, job)) throw new Error("Only the owner or this job's manager can set progress.");
  const value = clampProgress(progress);
  const next = { ...job, progress: value };
  if (value >= 100) next.status = 'completed';
  else if (next.status === 'completed') next.status = 'in_progress';
  return saveJob(stampStatus(next, job));
}

// ---- tasks -----------------------------------------------------------------

export async function addTask(job, { type, title, target }, actor) {
  if (!canManageJob(actor, job)) throw new Error('Only the job manager or owner can add tasks.');
  if (!title.trim()) throw new Error('Task title is required.');
  const task =
    type === 'count'
      ? { id: newId(), type: 'count', title: title.trim(), target: Math.max(1, parseInt(target) || 1), count: 0, createdAt: Date.now() }
      : { id: newId(), type: 'check', title: title.trim(), done: false, createdAt: Date.now() };
  return saveJob({ ...job, tasks: [...(job.tasks ?? []), task] });
}

export async function toggleTask(job, taskId, actor) {
  if (!canPostUpdates(actor, job)) throw new Error('You are not on this job\'s team.');
  const tasks = (job.tasks ?? []).map((t) =>
    t.id === taskId && t.type === 'check' ? { ...t, done: !t.done } : t,
  );
  return saveJob({ ...job, tasks });
}

export async function incrementTask(job, taskId, delta, actor) {
  if (!canPostUpdates(actor, job)) throw new Error('You are not on this job\'s team.');
  const tasks = (job.tasks ?? []).map((t) => {
    if (t.id !== taskId || t.type !== 'count') return t;
    const next = Math.max(0, t.count + delta);
    return { ...t, count: t.target != null ? Math.min(t.target, next) : next };
  });
  return saveJob({ ...job, tasks });
}

export async function deleteTask(job, taskId, actor) {
  if (!canManageJob(actor, job)) throw new Error('Only the job manager or owner can delete tasks.');
  return saveJob({ ...job, tasks: (job.tasks ?? []).filter((t) => t.id !== taskId) });
}

function clampProgress(value) {
  return Math.min(100, Math.max(0, Math.round(Number(value) || 0)));
}

/**
 * Maintain the actual start/finish timestamps on status TRANSITIONS only.
 * Jobs created before these fields existed must never be backfilled with
 * "now" — that would fabricate a zero-day history. So:
 *   - leaving 'planning' for the first time  -> stamp startedAt
 *   - entering 'completed' (from any other)  -> stamp completedAt
 *   - leaving 'completed'                    -> clear completedAt
 *   - no transition                          -> keep whatever was there
 */
function stampStatus(next, prev) {
  if (prev.status === 'planning' && next.status !== 'planning' && !prev.startedAt) {
    next.startedAt = Date.now();
  } else {
    next.startedAt = prev.startedAt ?? null;
  }
  if (next.status === 'completed') {
    next.completedAt =
      prev.status === 'completed' ? prev.completedAt ?? null : Date.now();
  } else {
    next.completedAt = null;
  }
  return next;
}

async function saveJob(job) {
  const next = { ...job, updatedAt: Date.now() };
  await putDoc('jobs', next);
  return next;
}
