import { useLanguage } from '../contexts/LanguageContext';

interface CompanyAiIconProps {
  size?: number;
  className?: string;
}

/** Home company logo with AI / IA overlaid, for Gemini-enabled request-session buttons. */
export function CompanyAiIcon({ size = 22, className = '' }: CompanyAiIconProps) {
  const { language } = useLanguage();
  const mark = language === 'es' ? 'IA' : 'AI';

  return (
    <span
      className={`company-ai-icon ${className}`.trim()}
      style={{ width: size, height: size, fontSize: size }}
      aria-hidden="true"
    >
      <img src="/logo.png" alt="" />
      <span className="company-ai-icon__mark">{mark}</span>
    </span>
  );
}
