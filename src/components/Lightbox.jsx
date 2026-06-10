import { useEffect } from 'react';
import { photoUrl } from '../services/images.js';

export default function Lightbox({ photo, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!photo) return null;
  return (
    <div className="lightbox" onClick={onClose} role="dialog" aria-label={photo.fileName}>
      <img src={photoUrl(photo)} alt={photo.fileName} onClick={(e) => e.stopPropagation()} />
      <button className="lightbox-close" onClick={onClose} aria-label="Close">
        ✕
      </button>
    </div>
  );
}
