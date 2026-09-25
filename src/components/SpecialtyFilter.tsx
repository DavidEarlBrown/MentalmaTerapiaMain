import { useLanguage } from '../contexts/LanguageContext';
import type { Specialty } from '../types';
import { GeminiAiIcon } from './GeminiAiIcon';

interface SpecialtyFilterProps {
  specialties: Specialty[];
  selectedSpecialtyId: string | null;
  onSelectSpecialty: (id: string | null) => void;
  onAskMari?: () => void;
}

export function SpecialtyFilter({ specialties, selectedSpecialtyId, onSelectSpecialty, onAskMari }: SpecialtyFilterProps) {
  const { t, language } = useLanguage();

  return (
    <section className="section specialty-filter-section">
      <div className="section-header-with-ai">
        <div>
          <h2>{t('yourIssues')}</h2>
          <p className="section-subtitle">{t('selectSpecialty')}</p>
        </div>
        {onAskMari && (
          <button
            type="button"
            className="ai-assist-button"
            onClick={onAskMari}
            aria-label={t('askMariForSpecialty')}
          >
            <GeminiAiIcon className="ai-icon" />
            <span>{t('aiHelp')}</span>
          </button>
        )}
      </div>
      <div className="specialty-filter-content">
        <select
          className="specialty-select"
          value={selectedSpecialtyId || ''}
          onChange={(e) => onSelectSpecialty(e.target.value || null)}
        >
          <option value="">{t('allSpecialties')}</option>
          {specialties.map((specialty) => (
            <option key={specialty.id} value={specialty.id}>
              {language === 'en' ? specialty.name_en : specialty.name_es}
            </option>
          ))}
        </select>
        {selectedSpecialtyId && (
          <button
            className="clear-filter-button"
            onClick={() => onSelectSpecialty(null)}
          >
            {t('clearFilter')}
          </button>
        )}
      </div>
    </section>
  );
}
