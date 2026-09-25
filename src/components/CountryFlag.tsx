import type { CSSProperties, ComponentType } from 'react';
import BR from 'country-flag-icons/react/3x2/BR';
import CN from 'country-flag-icons/react/3x2/CN';
import CO from 'country-flag-icons/react/3x2/CO';
import DE from 'country-flag-icons/react/3x2/DE';
import ES from 'country-flag-icons/react/3x2/ES';
import FR from 'country-flag-icons/react/3x2/FR';
import IN from 'country-flag-icons/react/3x2/IN';
import IT from 'country-flag-icons/react/3x2/IT';
import JP from 'country-flag-icons/react/3x2/JP';
import KR from 'country-flag-icons/react/3x2/KR';
import RU from 'country-flag-icons/react/3x2/RU';
import SA from 'country-flag-icons/react/3x2/SA';
import US from 'country-flag-icons/react/3x2/US';
import { getCountryCodeForLanguage } from '../lib/languageCountryCodes';

type FlagSvgProps = { style?: CSSProperties; 'aria-hidden'?: boolean };

const FLAG_COMPONENTS: Record<string, ComponentType<FlagSvgProps>> = {
  BR,
  CN,
  CO,
  DE,
  ES,
  FR,
  IN,
  IT,
  JP,
  KR,
  RU,
  SA,
  US,
};

export interface CountryFlagProps {
  code: string;
  size?: number;
  title?: string;
  className?: string;
  style?: CSSProperties;
}

export function CountryFlag({ code, size = 20, title, className, style }: CountryFlagProps) {
  const Flag = FLAG_COMPONENTS[code.toUpperCase()];
  if (!Flag) return null;

  const height = Math.round(size * (2 / 3));

  return (
    <span
      className={className ?? 'country-flag'}
      title={title}
      style={{ display: 'inline-flex', alignItems: 'center', lineHeight: 0, ...style }}
    >
      <Flag
        aria-hidden
        style={{
          width: size,
          height,
          display: 'block',
          borderRadius: 2,
          boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.08)',
        }}
      />
    </span>
  );
}

export interface LanguageFlagProps {
  languageName: string;
  size?: number;
  className?: string;
}

export function LanguageFlag({ languageName, size, className }: LanguageFlagProps) {
  const code = getCountryCodeForLanguage(languageName);
  if (!code) return null;
  return <CountryFlag code={code} size={size} title={languageName} className={className} />;
}

export interface LanguageFlagGroupProps {
  languages: string[];
  size?: number;
  gap?: string;
  className?: string;
}

export function LanguageFlagGroup({ languages, size = 18, gap = '0.2rem', className }: LanguageFlagGroupProps) {
  const flags = languages
    .map(lang => ({ lang, code: getCountryCodeForLanguage(lang) }))
    .filter((entry): entry is { lang: string; code: string } => Boolean(entry.code));

  if (flags.length === 0) return null;

  return (
    <span className={className} style={{ display: 'inline-flex', alignItems: 'center', gap }}>
      {flags.map(({ lang, code }) => (
        <CountryFlag key={`${lang}-${code}`} code={code} size={size} title={lang} />
      ))}
    </span>
  );
}
