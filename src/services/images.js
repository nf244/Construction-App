/**
 * Image handling for a photo-heavy app.
 *
 * Every uploaded photo is compressed client-side BEFORE it is stored
 * (and, once Firebase is connected, before it is uploaded — saving
 * bandwidth and storage quota):
 *
 *   - full image:  resized to fit 1600px, re-encoded as JPEG q=0.78
 *   - thumbnail:   resized to fit 360px,  re-encoded as JPEG q=0.70
 *
 * Lists and grids render thumbnails only; the full image loads on demand
 * in the lightbox. With Firebase Storage, upload both blobs and store the
 * two download URLs in the photo metadata document instead of blobs.
 */

import { getDoc, putDoc, deleteDoc, newId } from './storage.js';

const FULL_MAX = 1600;
const THUMB_MAX = 360;
const FULL_QUALITY = 0.78;
const THUMB_QUALITY = 0.7;

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

/** Compress and persist one photo. Returns the photo metadata record. */
export async function savePhoto(file, { jobId, uploaderId }) {
  if (!file.type.startsWith('image/')) {
    throw new Error(`"${file.name}" is not an image.`);
  }

  const img = await loadBitmap(file);
  const full = await resizeToBlob(img, FULL_MAX, FULL_QUALITY);
  const thumb = await resizeToBlob(img, THUMB_MAX, THUMB_QUALITY);

  // If recompression somehow grew the file (already tiny/optimized), keep the original.
  const fullBlob = full.blob.size < file.size ? full.blob : file;

  const photo = {
    id: newId(),
    jobId,
    uploaderId,
    fileName: file.name,
    width: full.width,
    height: full.height,
    originalSize: file.size,
    storedSize: fullBlob.size,
    blob: fullBlob,
    thumbBlob: thumb.blob,
    createdAt: Date.now(),
  };
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

/** Object URL for a stored blob, cached for the life of the page. */
export function photoUrl(photo, { thumb = false } = {}) {
  if (!photo) return null;
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
