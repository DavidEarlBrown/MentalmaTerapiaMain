import { useState } from 'react';

interface TimezoneSelectorProps {
  value: string;
  onChange: (timezone: string) => void;
}

const COMMON_TIMEZONES = [
  { value: 'America/Bogota', label: 'Colombia (GMT-5)' },
  { value: 'America/New_York', label: 'New York (GMT-5/GMT-4)' },
  { value: 'America/Chicago', label: 'Chicago (GMT-6/GMT-5)' },
  { value: 'America/Denver', label: 'Denver (GMT-7/GMT-6)' },
  { value: 'America/Los_Angeles', label: 'Los Angeles (GMT-8/GMT-7)' },
  { value: 'America/Mexico_City', label: 'Mexico City (GMT-6)' },
  { value: 'America/Argentina/Buenos_Aires', label: 'Buenos Aires (GMT-3)' },
  { value: 'America/Sao_Paulo', label: 'São Paulo (GMT-3)' },
  { value: 'Europe/London', label: 'London (GMT/GMT+1)' },
  { value: 'Europe/Paris', label: 'Paris (GMT+1/GMT+2)' },
  { value: 'Europe/Madrid', label: 'Madrid (GMT+1/GMT+2)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (GMT+9)' },
  { value: 'Asia/Shanghai', label: 'Shanghai (GMT+8)' },
  { value: 'Asia/Dubai', label: 'Dubai (GMT+4)' },
  { value: 'Australia/Sydney', label: 'Sydney (GMT+10/GMT+11)' },
  { value: 'UTC', label: 'UTC (GMT+0)' },
];

export function TimezoneSelector({ value, onChange }: TimezoneSelectorProps) {
  const [showSelector, setShowSelector] = useState(false);

  const getCurrentTimezoneLabel = () => {
    const tz = COMMON_TIMEZONES.find(t => t.value === value);
    return tz ? tz.label : value;
  };

  const handleTimezoneChange = (newTimezone: string) => {
    onChange(newTimezone);
    setShowSelector(false);
  };

  return (
    <div style={{ marginTop: '0.5rem' }}>
      <div className="timezone-display">
        <span className="timezone-label">
          🌍 {getCurrentTimezoneLabel()}
        </span>
        <button
          type="button"
          onClick={() => setShowSelector(!showSelector)}
          className="timezone-change-btn"
        >
          {showSelector ? 'Close' : 'Change'}
        </button>
      </div>

      {showSelector && (
        <div className="timezone-selector">
          <label className="timezone-selector-label">Select your timezone:</label>
          <select
            value={value}
            onChange={(e) => handleTimezoneChange(e.target.value)}
            className="timezone-selector-dropdown"
          >
            {COMMON_TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

export function detectUserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'America/Bogota';
  }
}
