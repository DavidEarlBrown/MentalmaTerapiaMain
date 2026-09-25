import { useState, useRef, useEffect, useCallback } from 'react';

export interface InfoSelectOption {
  value: string;
  label: string;
  description?: string;
}

interface InfoSelectProps {
  id?: string;
  name?: string;
  value: string;
  options: InfoSelectOption[];
  placeholder: string;
  onChange: (value: string) => void;
  onInfo: (label: string, description: string) => void;
  required?: boolean;
  style?: React.CSSProperties;
  infoButtonTitle?: string;
}

export function InfoSelect({
  id,
  name,
  value,
  options,
  placeholder,
  onChange,
  onInfo,
  required,
  style,
  infoButtonTitle = 'Right-click or long-press for info',
}: InfoSelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);

  const selectedOption = options.find(o => o.value === value);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        close();
      }
    };
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, close]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, close]);

  const startLongPress = (label: string, description: string) => {
    longPressTriggeredRef.current = false;
    longPressRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      onInfo(label, description || '');
    }, 500);
  };

  const cancelLongPress = () => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  };

  const handleOptionClick = (opt: InfoSelectOption) => {
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }
    onChange(opt.value);
    close();
  };

  const handleOptionContextMenu = (e: React.MouseEvent, opt: InfoSelectOption) => {
    e.preventDefault();
    e.stopPropagation();
    onInfo(opt.label, opt.description || '');
  };

  return (
    <div
      ref={containerRef}
      className="info-select-container"
      style={style}
    >
      <div
        className={`info-select-trigger${open ? ' open' : ''}${selectedOption ? ' has-selection' : ''}`}
        id={id}
        tabIndex={0}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-required={required}
        title={selectedOption ? infoButtonTitle : undefined}
        onClick={() => setOpen(o => !o)}
        onContextMenu={(e) => {
          if (selectedOption) {
            e.preventDefault();
            onInfo(selectedOption.label, selectedOption.description || '');
          }
        }}
        onTouchStart={() => {
          if (selectedOption) startLongPress(selectedOption.label, selectedOption.description || '');
        }}
        onTouchEnd={() => cancelLongPress()}
        onTouchMove={() => cancelLongPress()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(o => !o); }
          if (e.key === 'ArrowDown' && !open) setOpen(true);
        }}
      >
        <span className={`info-select-value${!selectedOption ? ' placeholder' : ''}`}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <svg
          className="info-select-arrow"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="currentColor"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
        >
          <path d="M7 10l5 5 5-5z"/>
        </svg>
      </div>

      {open && (
        <ul
          className="info-select-dropdown"
          role="listbox"
          aria-label={placeholder}
        >
          <li
            role="option"
            aria-selected={value === ''}
            className={`info-select-option${value === '' ? ' selected' : ''}`}
            onClick={() => { onChange(''); close(); }}
          >
            <span>{placeholder}</span>
          </li>
          {options.map(opt => (
            <li
              key={opt.value}
              role="option"
              aria-selected={opt.value === value}
              className={`info-select-option${opt.value === value ? ' selected' : ''}${opt.description ? ' has-info' : ''}`}
              onClick={() => handleOptionClick(opt)}
              onContextMenu={(e) => handleOptionContextMenu(e, opt)}
              onTouchStart={() => startLongPress(opt.label, opt.description || '')}
              onTouchEnd={() => cancelLongPress()}
              onTouchMove={() => cancelLongPress()}
              title={opt.description ? infoButtonTitle : undefined}
            >
              <span className="info-select-option-label">{opt.label}</span>
              {opt.description && (
                <button
                  type="button"
                  className="info-select-option-info-btn"
                  tabIndex={-1}
                  title={infoButtonTitle}
                  onClick={(e) => {
                    e.stopPropagation();
                    onInfo(opt.label, opt.description || '');
                  }}
                  aria-label={`Info: ${opt.label}`}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
                  </svg>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <input
        type="hidden"
        name={name}
        value={value}
        required={required}
      />
    </div>
  );
}
