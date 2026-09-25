interface GeminiAiIconProps {
  size?: number;
  className?: string;
}

/** Small Gemini sparkle mark for buttons that call Gemini. */
export function GeminiAiIcon({ size = 16, className = 'gemini-ai-icon' }: GeminiAiIconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 2c.28 5.53 4.47 9.72 10 10-5.53.28-9.72 4.47-10 10-.28-5.53-4.47-9.72-10-10C7.53 11.72 11.72 7.53 12 2z" />
      <path d="M18.6 14.15c.13 1.7 1.45 3.02 3.15 3.15-1.7.13-3.02 1.45-3.15 3.15-.13-1.7-1.45-3.02-3.15-3.15 1.7-.13 3.02-1.45 3.15-3.15z" />
    </svg>
  );
}
