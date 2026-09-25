import { useEffect, useState, type CSSProperties, type ImgHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../contexts/LanguageContext';

interface ProfessionalPhotoLightboxProps {
  src: string;
  alt: string;
  onClose: () => void;
}

export function ProfessionalPhotoLightbox({ src, alt, onClose }: ProfessionalPhotoLightboxProps) {
  const { language } = useLanguage();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return createPortal(
    <div
      className="professional-photo-lightbox"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={alt}
    >
      <button
        type="button"
        className="professional-photo-lightbox__close"
        onClick={onClose}
        aria-label={language === 'es' ? 'Cerrar' : 'Close'}
      >
        ×
      </button>
      <img
        src={src}
        alt={alt}
        className="professional-photo-lightbox__img"
        onClick={event => event.stopPropagation()}
      />
    </div>,
    document.body,
  );
}

interface ExpandableProfessionalPhotoProps {
  src?: string | null;
  alt: string;
  className?: string;
  style?: CSSProperties;
  onError?: ImgHTMLAttributes<HTMLImageElement>['onError'];
}

export function ExpandableProfessionalPhoto({
  src,
  alt,
  className,
  style,
  onError,
}: ExpandableProfessionalPhotoProps) {
  const [open, setOpen] = useState(false);
  if (!src) return null;

  return (
    <>
      <button
        type="button"
        className="professional-photo-thumb"
        onClick={event => {
          event.stopPropagation();
          setOpen(true);
        }}
        aria-haspopup="dialog"
        aria-label={alt}
      >
        <img src={src} alt={alt} className={className} style={style} onError={onError} />
      </button>
      {open && (
        <ProfessionalPhotoLightbox src={src} alt={alt} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
