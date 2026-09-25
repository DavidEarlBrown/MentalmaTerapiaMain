import { useState, useEffect } from 'react';

interface DateTimePickerProps {
  value: string;
  onChange: (value: string) => void;
  minDate?: string;
  required?: boolean;
  id?: string;
  name?: string;
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

export function DateTimePicker({ value, onChange, minDate, required, id, name }: DateTimePickerProps) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [timezone, setTimezone] = useState(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return 'America/Bogota';
    }
  });
  const [showTimezoneSelector, setShowTimezoneSelector] = useState(false);

  useEffect(() => {
    if (value) {
      const [datePart, timePart] = value.split('T');
      setDate(datePart || '');
      setTime(timePart?.substring(0, 5) || '');
    }
  }, [value]);

  const generateTimeOptions = () => {
    const times: string[] = [];
    for (let hour = 0; hour < 24; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const h = hour.toString().padStart(2, '0');
        const m = minute.toString().padStart(2, '0');
        times.push(`${h}:${m}`);
      }
    }
    return times;
  };

  const handleDateChange = (newDate: string) => {
    setDate(newDate);
    if (newDate && time) {
      onChange(`${newDate}T${time}`);
    }
  };

  const handleTimeChange = (newTime: string) => {
    setTime(newTime);
    if (date && newTime) {
      onChange(`${date}T${newTime}`);
    }
  };

  const getMinDate = () => {
    if (minDate) {
      return minDate.split('T')[0];
    }
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  };

  const getCurrentTimezoneLabel = () => {
    const tz = COMMON_TIMEZONES.find(t => t.value === timezone);
    return tz ? tz.label : timezone;
  };

  const handleTimezoneChange = (newTimezone: string) => {
    setTimezone(newTimezone);
    setShowTimezoneSelector(false);
  };

  return (
    <div className="datetime-picker">
      <div className="datetime-picker-inputs">
        <input
          type="date"
          id={id}
          name={name}
          value={date}
          onChange={(e) => handleDateChange(e.target.value)}
          min={getMinDate()}
          required={required}
          className="datetime-date-input"
        />
        <select
          value={time}
          onChange={(e) => handleTimeChange(e.target.value)}
          required={required}
          className="datetime-time-input"
        >
          <option value="">Select time</option>
          {generateTimeOptions().map((timeOption) => (
            <option key={timeOption} value={timeOption}>
              {timeOption}
            </option>
          ))}
        </select>
      </div>

      <div className="timezone-display">
        <span className="timezone-label">
          🌍 {getCurrentTimezoneLabel()}
        </span>
        <button
          type="button"
          onClick={() => setShowTimezoneSelector(!showTimezoneSelector)}
          className="timezone-change-btn"
        >
          {showTimezoneSelector ? 'Close' : 'Change'}
        </button>
      </div>

      {showTimezoneSelector && (
        <div className="timezone-selector">
          <label className="timezone-selector-label">Select your timezone:</label>
          <select
            value={timezone}
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
