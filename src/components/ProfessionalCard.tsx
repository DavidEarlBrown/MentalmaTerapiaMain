import { useState, useEffect } from 'react';
import type { Professional, CounselingType } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { fetchCounselingTypes } from '../lib/api';
import { ProfessionalResumeModal } from './ProfessionalResumeModal';
import { ExpandableProfessionalPhoto } from './ProfessionalPhotoLightbox';
import { LanguageFlag } from './CountryFlag';

interface ProfessionalCardProps {
  professional: Professional;
  isSelected: boolean;
  onSelect: () => void;
  isAdmin?: boolean;
}

export function ProfessionalCard({ professional, isSelected, onSelect, isAdmin = false }: ProfessionalCardProps) {
  const { language, t } = useLanguage();
  const [counselingTypes, setCounselingTypes] = useState<CounselingType[]>([]);
  const [showResumeModal, setShowResumeModal] = useState(false);

  useEffect(() => {
    loadCounselingTypes();
  }, []);

  const loadCounselingTypes = async () => {
    try {
      const types = await fetchCounselingTypes();
      setCounselingTypes(types);
    } catch (error) {
      console.error('Error loading counseling types:', error);
    }
  };

  const getCounselingTypeName = (typeId: string) => {
    const type = counselingTypes.find(t => t.id === typeId);
    if (!type) return typeId;
    return language === 'en' ? type.name_en : type.name_es;
  };

  const name = language === 'en' ? professional.name_en : professional.name_es;
  const bio = language === 'en' ? professional.bio_en : professional.bio_es;
  const specialties = language === 'en' ? professional.specialties_en : professional.specialties_es;

  const allLanguages: string[] = [];
  if (professional.PrimaryLanguage) {
    allLanguages.push(professional.PrimaryLanguage.trim());
  }
  if (professional.SecondaryLanguages && professional.SecondaryLanguages.length > 0) {
    professional.SecondaryLanguages.forEach(lang => {
      if (lang && !allLanguages.includes(lang.trim())) {
        allLanguages.push(lang.trim());
      }
    });
  }

  return (
    <>
    <div
      onClick={onSelect}
      className={`professional-card ${isSelected ? 'selected' : ''}`}
    >
      <ExpandableProfessionalPhoto
        src={professional.photo_url}
        alt={name}
        className="professional-photo"
      />
      <div className="professional-info">
        <h3>{name}</h3>
        {(professional.Título || professional.Clasificación) && (
          <p style={{
            margin: '0.15rem 0 0.5rem',
            fontSize: '0.9rem',
            color: '#546e7a',
            fontWeight: 500,
          }}>
            {professional.Título && <span>{professional.Título}</span>}
            {professional.Título && professional.Clasificación && <span> — </span>}
            {professional.Clasificación && <span>{professional.Clasificación}</span>}
          </p>
        )}
        <p className="bio">{bio}</p>
        <div className="specialties">
          <strong>{t('specialties')}:</strong>
          <div className="specialty-tags">
            {specialties.map((specialty, index) => (
              <span key={index} className="specialty-tag specialty-tag--highlight">
                {specialty}
              </span>
            ))}
          </div>
        </div>
        {professional.counseling_types && professional.counseling_types.length > 0 && (
          <div className="counseling-types">
            <strong>{t('counselingTypes')}:</strong>
            <div className="counseling-type-tags">
              {professional.counseling_types.map((type, index) => (
                <span key={index} className="counseling-type-tag">
                  {getCounselingTypeName(type)}
                </span>
              ))}
            </div>
          </div>
        )}
        {(allLanguages.length > 0 || professional.time_zone) && (
          <div className="professional-meta" style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '1rem',
            marginTop: '0.75rem',
            fontSize: '0.9rem',
            color: '#64748b'
          }}>
            {allLanguages.length > 0 && (
              <div className="languages" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <span style={{ marginRight: '0.25rem' }}>{t('languages')}:</span>
                {allLanguages.map((lang, index) => (
                  <LanguageFlag key={index} languageName={lang} size={20} />
                ))}
              </div>
            )}
            {professional.time_zone && (
              <div className="timezone" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.7 }}>
                  <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.2 3.2.8-1.3-4.5-2.7V7z"/>
                </svg>
                <span>{t('timeZone')}: {professional.time_zone}</span>
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: '1rem' }}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowResumeModal(true);
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.45rem 1rem',
              backgroundColor: '#f1f5f9',
              color: '#334155',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: 500,
              transition: 'background-color 0.15s, border-color 0.15s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#e2e8f0';
              (e.currentTarget as HTMLButtonElement).style.borderColor = '#94a3b8';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#f1f5f9';
              (e.currentTarget as HTMLButtonElement).style.borderColor = '#cbd5e1';
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10 9 9 9 8 9"/>
            </svg>
            {language === 'en' ? 'Resume' : 'Currículum'}
          </button>
        </div>
      </div>

    </div>

      {showResumeModal && (
        <ProfessionalResumeModal
          professional={professional}
          isAdmin={isAdmin}
          onClose={() => setShowResumeModal(false)}
        />
      )}
    </>
  );
}
