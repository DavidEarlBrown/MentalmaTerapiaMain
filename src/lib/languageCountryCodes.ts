/** ISO 3166-1 alpha-2 codes for spoken languages shown in the UI. */
export const LANGUAGE_COUNTRY_CODES: Record<string, string> = {
  English: 'US',
  Spanish: 'ES',
  Portuguese: 'BR',
  French: 'FR',
  German: 'DE',
  Italian: 'IT',
  Chinese: 'CN',
  Japanese: 'JP',
  Korean: 'KR',
  Arabic: 'SA',
  Russian: 'RU',
  Hindi: 'IN',
};

/** App UI language toggle (Spanish uses Colombia flag). */
export const APP_LANGUAGE_COUNTRY_CODES: Record<'en' | 'es', string> = {
  en: 'US',
  es: 'CO',
};

export function getCountryCodeForLanguage(languageName: string): string | undefined {
  const normalized = languageName.trim();
  return LANGUAGE_COUNTRY_CODES[normalized];
}
