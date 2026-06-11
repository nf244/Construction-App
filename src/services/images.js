/**
 * Image handling for a photo-heavy app.
 *
 * Every uploaded photo is compressed client-side BEFORE it is stored or
 * uploaded — saving bandwidth and storage quota:
 *
 *   - full image:  resized to fit 1600px, re-encoded as JPEG q=0.78
 *   - thumbnail:   resized to fit 360px,  re-encoded as JPEG q=0.70
 *
 * Lists and grids render thumbnails only; the full image loads on demand
 * in the lightbox.
 *
 * Storage of the compressed bytes depends on the backend:
 *   - local mode:    Blobs in IndexedDB
 *   - Firebase mode: base64 data URLs inside Firestore `photos` documents.
 *     Firestore caps documents at 1 MiB, so if a photo is still too big
 *     after the first pass it is re-compressed at smaller sizes until it
 *     fits. (Firebase's file storage product requires a paid plan for new
 *     projects, so on the free tier Firestore IS the photo store. If you
 *     later upgrade, swap savePhoto/photoUrl to Firebase Storage uploads.)
 */

import { firebaseEnabled } from './firebase.js';
import { getDoc, putDoc, deleteDoc, newId } from './storage.js';

const FULL_MAX = 1600;
const THUMB_MAX = 360;
const FULL_QUALITY = 0.78;
const THUMB_QUALITY = 0.7;

// Firestore documents max out at 1 MiB; keep the full-image data URL under
// ~700k chars to leave room for the thumbnail and metadata.
const DATAURL_BUDGET = 700_000;
const FALLBACK_PASSES = [
  { max: 1280, quality: 0.7 },
  { max: 1024, quality: 0.6 },
  { max: 800, quality: 0.55 },
];

function loadBitmap(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image file.'));
    };
    img.src = url;
  });
}

function resizeToBlob(img, maxDim, quality) {
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve({ blob, width, height }) : reject(new Error('Image compression failed.'))),
      'image/jpeg',
      quality,
    );
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not encode image.'));
    reader.readAsDataURL(blob);
  });
}

/** Compress and persist one photo. Returns the photo metadata record. */
export async function savePhoto(file, { jobId, uploaderId }) {
  if (!file.type.startsWith('image/')) {
    throw new Error(`"${file.name}" is not an image.`);
  }

  const img = await loadBitmap(file);
  let full = await resizeToBlob(img, FULL_MAX, FULL_QUALITY);
  const thumb = await resizeToBlob(img, THUMB_MAX, THUMB_QUALITY);

  const photo = {
    id: newId(),
    jobId,
    uploaderId,
    fileName: file.name,
    width: full.width,
    height: full.height,
    originalSize: file.size,
    storedSize: full.blob.size,
    createdAt: Date.now(),
  };

  if (firebaseEnabled) {
    // Firestore mode: store base64, shrinking until it fits the doc limit.
    let dataUrl = await blobToDataUrl(full.blob);
    for (const pass of FALLBACK_PASSES) {
      if (dataUrl.length <= DATAURL_BUDGET) break;
      full = await resizeToBlob(img, pass.max, pass.quality);
      dataUrl = await blobToDataUrl(full.blob);
    }
    if (dataUrl.length > DATAURL_BUDGET) {
      throw new Error(`"${file.name}" could not be compressed enough to store.`);
    }
    photo.width = full.width;
    photo.height = full.height;
    photo.storedSize = full.blob.size;
    photo.dataUrl = dataUrl;
    photo.thumbDataUrl = await blobToDataUrl(thumb.blob);
  } else {
    // Local mode: keep binary blobs in IndexedDB. If recompression somehow
    // grew the file (already tiny/optimized), keep the original.
    const fullBlob = full.blob.size < file.size ? full.blob : file;
    photo.storedSize = fullBlob.size;
    photo.blob = fullBlob;
    photo.thumbBlob = thumb.blob;
  }

  await putDoc('photos', photo);
  return photo;
}

export async function getPhoto(id) {
  return getDoc('photos', id);
}

export async function deletePhoto(id) {
  return deleteDoc('photos', id);
}

const urlCache = new Map();

/** URL for a stored photo (object URL for local blobs, data URL for Firestore). */
export function photoUrl(photo, { thumb = false } = {}) {
  if (!photo) return null;
  if (photo.dataUrl) return thumb ? photo.thumbDataUrl : photo.dataUrl;
  const key = `${photo.id}:${thumb ? 't' : 'f'}`;
  if (!urlCache.has(key)) {
    urlCache.set(key, URL.createObjectURL(thumb ? photo.thumbBlob : photo.blob));
  }
  return urlCache.get(key);
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
