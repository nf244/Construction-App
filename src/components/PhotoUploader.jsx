import { useRef, useState } from 'react';
import { savePhoto, deletePhoto, photoUrl, formatBytes } from '../services/images.js';

/**
 * Drag-and-drop / tap-to-pick photo input. Compresses every file on the
 * client before it is stored and shows the size savings, since this is a
 * photo-heavy app.
 */
export default function PhotoUploader({ jobId, uploaderId, photos, onChange }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState('');

  async function handleFiles(fileList) {
    const files = Array.from(fileList);
    if (files.length === 0) return;
    setBusy(true);
    setError('');
    const added = [];
    for (const file of files) {
      try {
        added.push(await savePhoto(file, { jobId, uploaderId }));
      } catch (err) {
        setError(err.message);
      }
    }
    if (added.length) onChange([...photos, ...added]);
    setBusy(false);
  }

  return (
    <div>
      <div
        className={`dropzone ${dragOver ? 'dropzone-active' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
        {busy ? 'Compressing photos…' : '📷 Drop photos here or tap to add'}
      </div>
      {error && <p className="form-error">{error}</p>}
      {photos.length > 0 && (
        <div className="upload-previews">
          {photos.map((p) => (
            <figure key={p.id} className="upload-preview">
              <img src={photoUrl(p, { thumb: true })} alt={p.fileName} />
              <figcaption>
                {formatBytes(p.originalSize)} → {formatBytes(p.storedSize)}
              </figcaption>
              <button
                type="button"
                className="upload-remove"
                aria-label={`Remove ${p.fileName}`}
                onClick={() => {
                  deletePhoto(p.id);
                  onChange(photos.filter((x) => x.id !== p.id));
                }}
              >
                ✕
              </button>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
