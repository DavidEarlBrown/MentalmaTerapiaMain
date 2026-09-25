import { useLongPress } from '../hooks/useLongPress';
import type { Problem } from '../types';

interface ProblemCheckboxItemProps {
  problem: Problem;
  name: string;
  desc: string;
  isSelected: boolean;
  onToggle: () => void;
  onInfo: (name: string, desc: string) => void;
  hintTitle: string;
}

export function ProblemCheckboxItem({ problem, name, desc, isSelected, onToggle, onInfo, hintTitle }: ProblemCheckboxItemProps) {
  const { onClick, onTouchStart, onTouchEnd, onTouchMove, onContextMenu } = useLongPress(() => onInfo(name, desc));

  return (
    <div
      className={`problem-checkbox-item${isSelected ? ' selected' : ''}`}
      title={hintTitle}
      onContextMenu={onContextMenu}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchMove={onTouchMove}
      onClick={(e) => {
        onClick(e);
        if (!e.defaultPrevented) {
          onToggle();
        }
      }}
      style={{ touchAction: 'none', cursor: 'pointer', userSelect: 'none' }}
    >
      <input
        type="checkbox"
        id={`problem-${problem.id}`}
        checked={isSelected}
        onChange={() => {}}
        onClick={(e) => e.stopPropagation()}
        readOnly
        tabIndex={-1}
        style={{ pointerEvents: 'none' }}
      />
      <div className="problem-checkbox-content">
        <span className="problem-checkbox-name">{name}</span>
        {desc && <span className="problem-checkbox-desc">{desc}</span>}
      </div>
    </div>
  );
}
