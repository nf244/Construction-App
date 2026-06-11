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
 *   updates: [{ id, authorId, text, progress|null, photoIds: [], createdAt }],
 *   createdAt, updatedAt
 * }
 */

import { getDoc, listDocs, putDoc, newId } from './storage.js';
import { ROLES, isOwnerLevel } from './roles.js';

export const JOB_STATUSES = {
  planning: { label: 'Planning', color: '#8b8b9e' },
  in_progress: { label: 'In Progress', color: '#f59e0b' },
  on_hold: { label: 'On Hold', color: '#ef4444' },
  completed: { label: 'Completed', color: '#22c55e' },
};

export async function createJob({ name, client, address, description }, creator) {
  if (!canCreateJobs(creator)) throw new Error('Only owners and project managers can create jobs.');
  if (!name.trim()) throw new Error('Job name is required.');

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
    updates: [],
    createdAt: now,
    updatedAt: now,
  };
  await putDoc('jobs', job);
  return job;
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
  return isOwnerLevel(user.role) || job.managerId === user.id;
}

export function canPostUpdates(user, job) {
  return isOwnerLevel(user.role) || job.memberIds.includes(user.id);
}

// ---- team & invites --------------------------------------------------------

export async function addMember(job, userId, actor) {
  if (!canManageJob(actor, job)) throw new Error('Only the owner or this job’s manager can add people.');
  if (job.memberIds.includes(userId)) return job;
  return saveJob({ ...job, memberIds: [...job.memberIds, userId] });
}

export async function removeMember(job, userId, actor) {
  if (!canManageJob(actor, job)) throw new Error('Only the owner or this job’s manager can remove people.');
  if (userId === job.managerId) throw new Error('The job manager cannot be removed.');
  return saveJob({ ...job, memberIds: job.memberIds.filter((id) => id !== userId) });
}

/** Invite by email. If no account exists yet, the invite stays pending and is
 *  redeemed automatically the first time that email signs in. */
export async function inviteByEmail(job, email, actor, existingUser) {
  if (!canManageJob(actor, job)) throw new Error('Only the owner or this job’s manager can invite people.');
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
  if (!canManageJob(actor, job)) throw new Error('Only the owner or this job’s manager can manage invites.');
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
  if (!canPostUpdates(author, job)) throw new Error('You are not on this job’s team.');
  if (!text.trim() && photoIds.length === 0) throw new Error('Add a description or at least one photo.');

  const update = {
    id: newId(),
    authorId: author.id,
    text: text.trim(),
    progress: progress ?? null,
    photoIds,
    createdAt: Date.now(),
  };

  const next = { ...job, updates: [update, ...job.updates] };
  if (progress !== null && progress !== undefined) {
    next.progress = clampProgress(progress);
    if (next.progress >= 100) next.status = 'completed';
    else if (next.status === 'planning' && next.progress > 0) next.status = 'in_progress';
  }
  return saveJob(next);
}

export async function setStatus(job, status, actor) {
  if (!canManageJob(actor, job)) throw new Error('Only the owner or this job’s manager can change status.');
  if (!JOB_STATUSES[status]) throw new Error('Unknown status.');
  const next = { ...job, status };
  if (status === 'completed') next.progress = 100;
  return saveJob(next);
}

export async function setProgress(job, progress, actor) {
  if (!canManageJob(actor, job)) throw new Error('Only the owner or this job’s manager can set progress.');
  const value = clampProgress(progress);
  const next = { ...job, progress: value };
  if (value >= 100) next.status = 'completed';
  else if (next.status === 'completed') next.status = 'in_progress';
  return saveJob(next);
}

function clampProgress(value) {
  return Math.min(100, Math.max(0, Math.round(Number(value) || 0)));
}

async function saveJob(job) {
  const next = { ...job, updatedAt: Date.now() };
  await putDoc('jobs', next);
  return next;
}
