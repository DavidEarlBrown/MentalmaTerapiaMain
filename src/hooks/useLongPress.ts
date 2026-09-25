import { useRef, useCallback } from 'react';

interface LongPressOptions {
  delay?: number;
}

interface LongPressHandlers {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onClick: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

export function useLongPress(callback: () => void, options: LongPressOptions = {}): LongPressHandlers {
  const { delay = 500 } = options;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggeredRef = useRef(false);
  const movedRef = useRef(false);

  const start = useCallback(() => {
    triggeredRef.current = false;
    movedRef.current = false;
    timerRef.current = setTimeout(() => {
      triggeredRef.current = true;
      callback();
    }, delay);
  }, [callback, delay]);

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      start();
    }
  }, [start]);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (triggeredRef.current) {
      e.preventDefault();
      e.stopPropagation();
    }
    cancel();
  }, [cancel]);

  const onTouchMove = useCallback(() => {
    movedRef.current = true;
    cancel();
  }, [cancel]);

  const onClick = useCallback((e: React.MouseEvent) => {
    if (triggeredRef.current) {
      e.preventDefault();
      e.stopPropagation();
      triggeredRef.current = false;
    }
  }, []);

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    triggeredRef.current = true;
    callback();
  }, [callback]);

  return { onTouchStart, onTouchEnd, onTouchMove, onClick, onContextMenu };
}
