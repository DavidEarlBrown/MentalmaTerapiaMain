import { useRef, useEffect, useState, useCallback } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { useLanguage } from '../contexts/LanguageContext';

interface QRCodeModalProps {
  onClose: () => void;
}

export function QRCodeModal({ onClose }: QRCodeModalProps) {
  const { language } = useLanguage();
  const hiddenCanvasRef = useRef<HTMLDivElement>(null);
  const [imgSrc, setImgSrc] = useState<string>('');
  const [copied, setCopied] = useState<'image' | 'url' | null>(null);
  const [rightClickToast, setRightClickToast] = useState(false);
  const rightClickedQR = useRef(false);

  const baseUrl = window.location.origin;
  const qrUrl = `${baseUrl}/?section=client-info`;

  useEffect(() => {
    const timer = setTimeout(() => {
      const canvas = hiddenCanvasRef.current?.querySelector('canvas');
      if (canvas) {
        setImgSrc(canvas.toDataURL('image/png'));
      }
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Detect when the user copies after right-clicking the QR image
  const handleCopyEvent = useCallback(() => {
    if (rightClickedQR.current) {
      rightClickedQR.current = false;
      setRightClickToast(true);
      setTimeout(() => setRightClickToast(false), 3000);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('copy', handleCopyEvent);
    return () => document.removeEventListener('copy', handleCopyEvent);
  }, [handleCopyEvent]);

  const showCopied = (type: 'image' | 'url') => {
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleDownload = () => {
    if (!imgSrc) return;
    const a = document.createElement('a');
    a.href = imgSrc;
    a.download = 'client-request-qrcode.png';
    a.click();
  };

  const handleCopyImage = async () => {
    if (!imgSrc) return;
    try {
      const res = await fetch(imgSrc);
      const blob = await res.blob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      showCopied('image');
    } catch {
      // Fallback: trigger download if clipboard API not available
      handleDownload();
    }
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(qrUrl).then(() => showCopied('url'));
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9999, padding: '1rem',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#fff', borderRadius: '12px', padding: '2rem',
          maxWidth: '400px', width: '100%', boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#1a237e' }}>
            {language === 'es' ? 'Código QR — Solicitud de Cliente' : 'QR Code — Client Request Form'}
          </h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666', fontSize: '1.5rem', lineHeight: 1 }}
            aria-label="Close"
          >×</button>
        </div>

        <p style={{ margin: 0, fontSize: '0.85rem', color: '#555', textAlign: 'center' }}>
          {language === 'es'
            ? 'Al escanear este código, sus clientes irán directamente al formulario de solicitud.'
            : 'Scanning this code takes clients directly to the request form.'}
        </p>

        {/* Hidden canvas for generating image data */}
        <div ref={hiddenCanvasRef} style={{ position: 'absolute', visibility: 'hidden', pointerEvents: 'none' }}>
          <QRCodeCanvas value={qrUrl} size={240} level="M" includeMargin={true} />
        </div>

        {/* QR as <img> — right-click "Copy image" / "Save image as" works natively */}
        <div style={{ position: 'relative', display: 'inline-block' }}>
          {imgSrc ? (
            <img
              src={imgSrc}
              alt="QR Code"
              width={240}
              height={240}
              style={{ display: 'block', border: '1px solid #e0e0e0', borderRadius: '8px' }}
              title={language === 'es' ? 'Clic derecho → Copiar imagen' : 'Right-click → Copy image'}
              onContextMenu={() => { rightClickedQR.current = true; }}
            />
          ) : (
            <div style={{ width: 240, height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', border: '1px solid #eee', borderRadius: '8px' }}>
              Loading...
            </div>
          )}

          {/* Toast shown after right-click copy */}
          {rightClickToast && (
            <div style={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              backgroundColor: 'rgba(30, 30, 30, 0.9)',
              color: '#fff', padding: '0.6rem 1.1rem',
              borderRadius: '8px', fontSize: '0.9rem', fontWeight: 600,
              whiteSpace: 'nowrap', pointerEvents: 'none',
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#4caf50">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
              </svg>
              {language === 'es' ? 'Código QR copiado' : 'QR code copied'}
            </div>
          )}
        </div>

        <p style={{ margin: 0, fontSize: '0.75rem', color: '#888', textAlign: 'center' }}>
          {language === 'es' ? '↑ Clic derecho sobre el código para copiar o guardar la imagen' : '↑ Right-click the code to copy or save it as an image'}
        </p>

        {/* URL display */}
        <div style={{
          width: '100%', padding: '0.6rem 0.75rem',
          backgroundColor: '#f5f5f5', borderRadius: '6px',
          fontSize: '0.76rem', color: '#333', wordBreak: 'break-all',
          fontFamily: 'monospace', textAlign: 'center', border: '1px solid #e0e0e0',
        }}>
          {qrUrl}
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '0.6rem', width: '100%' }}>
          <button
            onClick={handleDownload}
            style={{
              flex: 1, padding: '0.6rem 0.4rem', backgroundColor: '#1a237e',
              color: '#fff', border: 'none', borderRadius: '8px',
              fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#283593'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#1a237e'; }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
            </svg>
            {language === 'es' ? 'Descargar' : 'Download'}
          </button>

          <button
            onClick={handleCopyImage}
            style={{
              flex: 1, padding: '0.6rem 0.4rem',
              backgroundColor: copied === 'image' ? '#388e3c' : '#6c63ff',
              color: '#fff', border: 'none', borderRadius: '8px',
              fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem',
              transition: 'background-color 0.2s',
            }}
            onMouseEnter={(e) => { if (copied !== 'image') e.currentTarget.style.backgroundColor = '#5852d6'; }}
            onMouseLeave={(e) => { if (copied !== 'image') e.currentTarget.style.backgroundColor = '#6c63ff'; }}
          >
            {copied === 'image' ? (
              <>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                {language === 'es' ? 'Copiado!' : 'Copied!'}
              </>
            ) : (
              <>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
                </svg>
                {language === 'es' ? 'Copiar QR' : 'Copy QR'}
              </>
            )}
          </button>

          <button
            onClick={handleCopyUrl}
            style={{
              flex: 1, padding: '0.6rem 0.4rem',
              backgroundColor: copied === 'url' ? '#388e3c' : '#fff',
              color: copied === 'url' ? '#fff' : '#1a237e',
              border: '2px solid #1a237e', borderRadius: '8px',
              fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem',
              transition: 'background-color 0.2s',
            }}
            onMouseEnter={(e) => { if (copied !== 'url') e.currentTarget.style.backgroundColor = '#e8eaf6'; }}
            onMouseLeave={(e) => { if (copied !== 'url') e.currentTarget.style.backgroundColor = '#fff'; }}
          >
            {copied === 'url' ? (
              <>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                {language === 'es' ? 'Copiado!' : 'Copied!'}
              </>
            ) : (
              <>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
                </svg>
                {language === 'es' ? 'Copiar URL' : 'Copy URL'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
