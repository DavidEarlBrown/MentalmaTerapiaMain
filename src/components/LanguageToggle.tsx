import { useLanguage } from '../contexts/LanguageContext';
import { APP_LANGUAGE_COUNTRY_CODES } from '../lib/languageCountryCodes';
import { CountryFlag } from './CountryFlag';

const TOGGLE_FLAG_SIZE = 28;

export function LanguageToggle() {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="language-toggle">
      <button
        onClick={() => setLanguage('en')}
        className={`flag-button ${language === 'en' ? 'active' : ''}`}
        aria-label="English"
        title="English"
      >
        <CountryFlag code={APP_LANGUAGE_COUNTRY_CODES.en} size={TOGGLE_FLAG_SIZE} className="flag-icon" />
      </button>
      <button
        onClick={() => setLanguage('es')}
        className={`flag-button ${language === 'es' ? 'active' : ''}`}
        aria-label="Español"
        title="Español"
      >
        <CountryFlag code={APP_LANGUAGE_COUNTRY_CODES.es} size={TOGGLE_FLAG_SIZE} className="flag-icon" />
      </button>
    </div>
  );
}
