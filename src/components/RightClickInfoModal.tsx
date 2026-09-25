import { useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { CompanyAiIcon } from './CompanyAiIcon';

interface RightClickInfoModalProps {
  title: string;
  content: string;
  loading: boolean;
  onClose: () => void;
  isAdmin?: boolean;
  onRefreshAndGenerate?: () => Promise<void>;
}

export function RightClickInfoModal({ title, content, loading, onClose, isAdmin, onRefreshAndGenerate }: RightClickInfoModalProps) {
  const { t, language } = useLanguage();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (!onRefreshAndGenerate) return;
    setRefreshing(true);
    try {
      await onRefreshAndGenerate();
    } finally {
      setRefreshing(false);
    }
  };

  const showRefresh = isAdmin && !loading && onRefreshAndGenerate;

  return (
    <div className="specialty-explanation-modal" onClick={onClose}>
      <div className="specialty-explanation-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="specialty-explanation-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ color: '#1976d2', display: 'inline-flex' }}>
              <CompanyAiIcon size={22} />
            </span>
            <h3 style={{ margin: 0 }}>{title}</h3>
          </div>
          <button
            type="button"
            className="specialty-modal-close-button"
            onClick={onClose}
            aria-label={t('rightClickInfoClose')}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>
        <div className="specialty-explanation-modal-body">
          {loading ? (
            <div className="specialty-loading-spinner">
              <div className="spinner"></div>
              <p>{t('rightClickInfoLoading')}</p>
            </div>
          ) : (
            <div className="specialty-explanation-text">
              {content.split('\n').map((paragraph, index) =>
                paragraph.trim() ? <p key={index}>{paragraph}</p> : null
              )}
            </div>
          )}
        </div>
        <div className="specialty-explanation-modal-footer">
          {showRefresh && (
            <div style={{ display: 'flex', gap: '0.5rem', marginRight: 'auto' }}>
              <button
                type="button"
                onClick={handleRefresh}
                disabled={refreshing}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.4rem 0.85rem',
                  backgroundColor: '#fef3c7',
                  color: '#92400e',
                  border: '1px solid #fcd34d',
                  borderRadius: '6px',
                  cursor: refreshing ? 'not-allowed' : 'pointer',
                  fontSize: '0.8rem',
                  fontWeight: 500,
                  opacity: refreshing ? 0.7 : 1,
                  transition: 'all 0.2s',
                }}
              >
                {refreshing ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'spin 1s linear infinite' }}>
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                  </svg>
                ) : (
                  <CompanyAiIcon size={16} />
                )}
                {refreshing
                  ? (language === 'es' ? 'Generando EN y ES...' : 'Generating EN & ES...')
                  : (language === 'es' ? 'Actualizar' : 'Refresh')}
              </button>
            </div>
          )}
          <button
            type="button"
            className="specialty-modal-ok-button"
            onClick={onClose}
          >
            {t('rightClickInfoClose')}
          </button>
        </div>
      </div>
    </div>
  );
}
