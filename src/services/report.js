/**
 * PDF job report generator.
 *
 * Builds a clean, client-ready PDF for a single construction job and triggers
 * a browser download. Everything is laid out by hand on a core jsPDF document
 * (pt units, A4) — no autotable plugin — so we control pagination precisely:
 * a running `cursorY` is tracked and every block checks whether it fits before
 * drawing, adding a fresh page when it doesn't.
 *
 * Sections, in order: header band + title, meta (status + progress bar),
 * timeline, description, team, tasks, and chronological progress updates with
 * embedded photos and comments. A "Page X of Y / Generated <date>" footer is
 * stamped on every page at the end.
 *
 * Photos come from the images service. In Firebase mode a photo carries a
 * base64 `dataUrl`; in local mode it carries a `blob` we convert on the fly.
 * Photo embedding is wrapped in try/catch so one bad image never sinks the
 * whole report.
 */

import { jsPDF } from 'jspdf';
import { getPhoto } from './images.js';

// ---- constants -------------------------------------------------------------

const PAGE_W = 595; // A4 width in pt
const PAGE_H = 842; // A4 height in pt
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;

// Palette (kept in sync with the app's JOB_STATUSES / role colors).
const AMBER = '#f59e0b';
const TEXT_DARK = '#222222';
const TEXT_MUTED = '#888888';
const TRACK_GRAY = '#e5e5ea';
const WHITE = '#ffffff';

const STATUS_META = {
  planning: { label: 'Planning', color: '#8b8b9e' },
  in_progress: { label: 'In Progress', color: '#f59e0b' },
  on_hold: { label: 'On Hold', color: '#ef4444' },
  completed: { label: 'Completed', color: '#22c55e' },
};

const ROLE_LABELS = {
  admin: 'Admin',
  owner: 'Owner',
  project_manager: 'Project Manager',
  employee: 'Employee',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ---- date / formatting helpers ---------------------------------------------

/** Coerce an epoch-ms number or 'YYYY-MM-DD' string into a Date (or null). */
function toDate(value) {
  if (value == null || value === '') return null;
  const d = typeof value === 'number' ? new Date(value) : new Date(value + 'T00:00:00');
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "Jun 9, 2026" from an epoch-ms number or 'YYYY-MM-DD' string. */
function fmtDate(epochOrDateString) {
  const d = toDate(epochOrDateString);
  if (!d) return '—';
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** "Jun 9, 2026, 3:04 PM" from an epoch-ms number. */
function fmtDateTime(epochMs) {
  const d = toDate(epochMs);
  if (!d) return '—';
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${fmtDate(epochMs)}, ${hours}:${minutes} ${ampm}`;
}

/** Whole days between two timestamps/date-strings (min 0), or null. */
function daysBetween(from, to) {
  const a = toDate(from);
  const b = toDate(to);
  if (!a || !b) return null;
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86_400_000));
}

/** Filesystem-safe slug for the job name, used in the download filename. */
function slugify(name) {
  return (name || 'job')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'job';
}

/** Today's date as 'YYYY-MM-DD' (local) for the filename. */
function todayStamp() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Convert a Blob to a base64 data URL via FileReader (local/dev photo mode). */
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not encode image.'));
    reader.readAsDataURL(blob);
  });
}

/** Resolve a photo record into a usable JPEG data URL, whatever the backend. */
async function photoDataUrl(photo) {
  if (!photo) return null;
  if (photo.dataUrl) return photo.dataUrl;
  if (photo.thumbDataUrl) return photo.thumbDataUrl;
  if (photo.blob) return blobToDataUrl(photo.blob);
  if (photo.thumbBlob) return blobToDataUrl(photo.thumbBlob);
  return null;
}

// ---- main entry point ------------------------------------------------------

/**
 * Build a PDF report for `job` and trigger a download.
 * @param {object} job - the job document (see jobs.js for shape)
 * @param {Object<string, {id,name,email,role}>} usersById - user lookup map
 */
export async function generateJobReport(job, usersById) {
  const users = usersById ?? {};
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  // A small drawing cursor with helpers shared across the section builders.
  const ctx = { doc, cursorY: MARGIN };

  /** Ensure `height` pt fit below the cursor; page-break if not. */
  const ensure = (height) => {
    if (ctx.cursorY + height > PAGE_H - MARGIN) {
      doc.addPage();
      ctx.cursorY = MARGIN;
    }
  };

  /** Section heading with a thin underline rule. */
  const heading = (label) => {
    ensure(34);
    ctx.cursorY += 8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(TEXT_DARK);
    doc.text(label, MARGIN, ctx.cursorY);
    ctx.cursorY += 5;
    doc.setDrawColor(TRACK_GRAY);
    doc.setLineWidth(1);
    doc.line(MARGIN, ctx.cursorY, PAGE_W - MARGIN, ctx.cursorY);
    ctx.cursorY += 12;
  };

  /** A "Label: value" line, wrapping the value to the content width. */
  const labelValue = (label, value, indent = 0) => {
    const x = MARGIN + indent;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(TEXT_DARK);
    const labelText = `${label}: `;
    const labelW = doc.getTextWidth(labelText);
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(String(value ?? '—'), CONTENT_W - indent - labelW);
    ensure(lines.length * 13 + 2);
    doc.setFont('helvetica', 'bold');
    doc.text(labelText, x, ctx.cursorY);
    doc.setFont('helvetica', 'normal');
    doc.text(lines, x + labelW, ctx.cursorY);
    ctx.cursorY += lines.length * 13 + 2;
  };

  /** Wrapped body paragraph. */
  const paragraph = (text, { size = 10, color = TEXT_DARK, indent = 0 } = {}) => {
    const x = MARGIN + indent;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(size);
    doc.setTextColor(color);
    const lines = doc.splitTextToSize(String(text ?? ''), CONTENT_W - indent);
    const lh = size + 3;
    for (const line of lines) {
      ensure(lh);
      doc.text(line, x, ctx.cursorY);
      ctx.cursorY += lh;
    }
  };

  /** A progress bar: gray track + amber fill + "NN%" label. */
  const progressBar = (pct, x, y, width, height) => {
    const value = Math.min(100, Math.max(0, Math.round(Number(pct) || 0)));
    doc.setFillColor(TRACK_GRAY);
    doc.roundedRect(x, y, width, height, 2, 2, 'F');
    if (value > 0) {
      doc.setFillColor(AMBER);
      doc.roundedRect(x, y, Math.max(2, (width * value) / 100), height, 2, 2, 'F');
    }
  };

  // 1) Header band + job title --------------------------------------------
  doc.setFillColor(AMBER);
  doc.rect(0, 0, PAGE_W, 64, 'F');
  doc.setTextColor(WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('SiteTrack', MARGIN, 33);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text('Job Report', MARGIN, 50);
  ctx.cursorY = 64 + 28;

  doc.setTextColor(TEXT_DARK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  const titleLines = doc.splitTextToSize(job.name || 'Untitled Job', CONTENT_W);
  for (const line of titleLines) {
    doc.text(line, MARGIN, ctx.cursorY);
    ctx.cursorY += 24;
  }
  ctx.cursorY += 4;

  // 2) Meta block ---------------------------------------------------------
  const status = STATUS_META[job.status] ?? { label: job.status || 'Unknown', color: TEXT_MUTED };

  // Status line with a colored dot badge.
  ensure(18);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(TEXT_DARK);
  doc.text('Status: ', MARGIN, ctx.cursorY);
  const statusLabelX = MARGIN + doc.getTextWidth('Status: ');
  doc.setFillColor(status.color);
  doc.circle(statusLabelX + 4, ctx.cursorY - 3, 4, 'F');
  doc.setFont('helvetica', 'normal');
  doc.text(status.label, statusLabelX + 13, ctx.cursorY);
  ctx.cursorY += 16;

  // Progress line with a bar + percentage.
  const pct = Math.min(100, Math.max(0, Math.round(Number(job.progress) || 0)));
  ensure(20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(TEXT_DARK);
  doc.text('Progress: ', MARGIN, ctx.cursorY);
  const barX = MARGIN + doc.getTextWidth('Progress: ');
  const barW = 180;
  progressBar(pct, barX, ctx.cursorY - 9, barW, 10);
  doc.setFont('helvetica', 'normal');
  doc.text(`${pct}%`, barX + barW + 8, ctx.cursorY);
  ctx.cursorY += 18;

  labelValue('Client', job.client || '—');
  labelValue('Address', job.address || '—');
  const manager = users[job.managerId];
  labelValue('Manager', manager ? manager.name : '—');

  // 3) Timeline -----------------------------------------------------------
  heading('Timeline');
  labelValue('Scheduled', `${fmtDate(job.startDate)}  →  ${fmtDate(job.dueDate)}`);
  labelValue(
    'Actual',
    `${job.startedAt ? fmtDate(job.startedAt) : '—'}  →  ${job.completedAt ? fmtDate(job.completedAt) : '—'}`,
  );
  const duration = describeDuration(job);
  if (duration) labelValue('Duration', duration);

  // 4) Description --------------------------------------------------------
  if (job.description && job.description.trim()) {
    heading('Description');
    paragraph(job.description.trim());
  }

  // 5) Team ---------------------------------------------------------------
  const memberIds = job.memberIds ?? [];
  if (memberIds.length) {
    heading('Team');
    for (const id of memberIds) {
      const user = users[id];
      const name = user ? user.name : 'Unknown user';
      const role = user ? (ROLE_LABELS[user.role] ?? user.role ?? '') : '';
      const isManager = id === job.managerId;
      const line = `${name} — ${role}${isManager ? '  (manager)' : ''}`;
      paragraph(line, { indent: 4 });
    }
  }

  // 6) Tasks --------------------------------------------------------------
  const tasks = job.tasks ?? [];
  if (tasks.length) {
    const checks = tasks.filter((t) => t.type === 'check');
    const doneChecks = checks.filter((t) => t.done).length;
    heading(`Tasks (${doneChecks}/${checks.length} complete)`);
    for (const task of tasks) {
      if (task.type === 'count') {
        const count = Number(task.count) || 0;
        const target = Number(task.target) || 0;
        ensure(18);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(TEXT_DARK);
        const text = `${task.title} — ${count}/${target}`;
        doc.text(text, MARGIN + 4, ctx.cursorY);
        // Tiny inline progress bar after the label.
        const tx = MARGIN + 4 + doc.getTextWidth(text) + 8;
        const tw = 70;
        if (tx + tw < PAGE_W - MARGIN) {
          const fillPct = target > 0 ? (count / target) * 100 : 0;
          progressBar(fillPct, tx, ctx.cursorY - 7, tw, 7);
        }
        ctx.cursorY += 15;
      } else {
        const box = task.done ? '[x]' : '[ ]';
        paragraph(`${box} ${task.title}`, { indent: 4 });
      }
    }
  }

  // 7) Progress updates (chronological: oldest first) ---------------------
  const updates = (job.updates ?? []).slice().reverse();
  if (updates.length) {
    heading('Progress Updates');
    for (const update of updates) {
      await renderUpdate(ctx, ensure, paragraph, progressBar, update, users);
    }
  }

  // 8) Footer on every page ----------------------------------------------
  const generated = fmtDate(Date.now());
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(TEXT_MUTED);
    doc.text(`Page ${i} of ${pageCount}`, PAGE_W / 2, PAGE_H - 22, { align: 'center' });
    doc.text(`Generated ${generated}`, PAGE_W - MARGIN, PAGE_H - 22, { align: 'right' });
  }

  const filename = `SiteTrack-${slugify(job.name)}-${todayStamp()}.pdf`;
  doc.save(filename);
}

// ---- section helpers -------------------------------------------------------

/** Human-readable job duration, mirroring jobs.js#jobDuration. */
function describeDuration(job) {
  if (job.startedAt) {
    const end = job.completedAt ?? Date.now();
    const days = daysBetween(job.startedAt, end);
    if (days == null) return null;
    return job.completedAt ? `Took ${days} days` : `Running for ${days} days`;
  }
  if (job.startDate && job.dueDate) {
    const days = daysBetween(job.startDate, job.dueDate);
    if (days == null) return null;
    return `Scheduled ${days} days`;
  }
  return null;
}

/** Render a single progress update: header, progress marker, text, photos, comments. */
async function renderUpdate(ctx, ensure, paragraph, progressBar, update, users) {
  const { doc } = ctx;

  // Author + timestamp header line.
  const author = users[update.authorId];
  const authorName = author ? author.name : 'Unknown user';
  ensure(20);
  ctx.cursorY += 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(TEXT_DARK);
  doc.text(authorName, MARGIN, ctx.cursorY);
  const nameW = doc.getTextWidth(authorName);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(TEXT_MUTED);
  doc.text(`  ·  ${fmtDateTime(update.createdAt)}`, MARGIN + nameW, ctx.cursorY);
  ctx.cursorY += 14;

  // Progress marker, if this update set one.
  if (update.progress !== null && update.progress !== undefined) {
    ensure(14);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(AMBER);
    doc.text(`→ ${Math.round(Number(update.progress) || 0)}%`, MARGIN, ctx.cursorY);
    ctx.cursorY += 13;
  }

  // Body text.
  if (update.text && update.text.trim()) {
    paragraph(update.text.trim(), { size: 10 });
  }

  // Photos laid out in a grid, scaled to page width.
  const photoIds = update.photoIds ?? [];
  if (photoIds.length) {
    await renderPhotos(ctx, ensure, photoIds);
  }

  // Comments indented beneath the update.
  const comments = update.comments ?? [];
  for (const comment of comments) {
    const cAuthor = users[comment.authorId];
    const cName = cAuthor ? cAuthor.name : 'Unknown user';
    paragraph(`↳ ${cName}: ${comment.text ?? ''}`, { size: 9, color: TEXT_MUTED, indent: 14 });
  }

  ctx.cursorY += 6;
}

/** Embed an update's photos in rows (max 3 per row), preserving aspect ratio. */
async function renderPhotos(ctx, ensure, photoIds) {
  const { doc } = ctx;
  const perRow = photoIds.length === 1 ? 1 : photoIds.length === 2 ? 2 : 3;
  const gap = 8;
  const cellW = (CONTENT_W - gap * (perRow - 1)) / perRow;

  // Resolve all photos up front; skip any that fail to load.
  const loaded = [];
  for (const id of photoIds) {
    try {
      const photo = await getPhoto(id);
      const dataUrl = await photoDataUrl(photo);
      if (!dataUrl) continue;
      const ratio = photo && photo.width && photo.height ? photo.height / photo.width : 0.75;
      loaded.push({ dataUrl, ratio });
    } catch {
      // One unreadable photo shouldn't break the report — skip it.
    }
  }
  if (!loaded.length) return;

  ctx.cursorY += 4;
  for (let i = 0; i < loaded.length; i += perRow) {
    const row = loaded.slice(i, i + perRow);
    // Row height is the tallest scaled image in the row.
    const rowH = Math.max(...row.map((p) => Math.min(cellW * p.ratio, 200)));
    ensure(rowH + gap);
    let x = MARGIN;
    for (const p of row) {
      const h = Math.min(cellW * p.ratio, 200);
      const w = p.ratio > 0 ? h / p.ratio : cellW;
      try {
        doc.addImage(p.dataUrl, 'JPEG', x, ctx.cursorY, w, h);
      } catch {
        // Skip an image jsPDF refuses to decode; keep going.
      }
      x += cellW + gap;
    }
    ctx.cursorY += rowH + gap;
  }
}
