export interface KeyboardSelectConfig {
  readonly getSelectableZoneIDs: () => readonly string[];
  readonly getCurrentFocusedZoneID: () => string | null;
  readonly onSelect: (zoneId: string) => void;
  readonly onFocusChange: (zoneId: string | null) => void;
  readonly onFocusAnnounce?: (zoneId: string) => void;
}

interface KeyboardEventLike {
  readonly key: string;
  readonly defaultPrevented?: boolean;
  preventDefault(): void;
}

interface KeydownTarget {
  addEventListener(type: 'keydown', listener: (event: KeyboardEventLike) => void): void;
  removeEventListener(type: 'keydown', listener: (event: KeyboardEventLike) => void): void;
}

const NEXT_KEYS = new Set(['ArrowDown', 'ArrowRight']);
const PREVIOUS_KEYS = new Set(['ArrowUp', 'ArrowLeft']);
const CONFIRM_KEYS = new Set(['Enter', ' ', 'Spacebar']);

export function handleKeyboardSelectKeyDown(event: KeyboardEventLike, config: KeyboardSelectConfig): boolean {
  const selectableZoneIDs = config.getSelectableZoneIDs();
  if (selectableZoneIDs.length === 0) {
    return false;
  }

  if (NEXT_KEYS.has(event.key)) {
    moveFocus(config, selectableZoneIDs, 1);
    return true;
  }

  if (PREVIOUS_KEYS.has(event.key)) {
    moveFocus(config, selectableZoneIDs, -1);
    return true;
  }

  if (CONFIRM_KEYS.has(event.key)) {
    const focusedZoneID = config.getCurrentFocusedZoneID();
    if (focusedZoneID === null || !selectableZoneIDs.includes(focusedZoneID)) {
      return false;
    }
    config.onSelect(focusedZoneID);
    return true;
  }

  if (event.key === 'Escape') {
    config.onFocusChange(null);
    return true;
  }

  return false;
}

export function attachKeyboardSelect(config: KeyboardSelectConfig): () => void {
  const keydownTarget = resolveKeydownTarget();
  if (keydownTarget === null) {
    return () => {};
  }

  const onKeyDown = (event: KeyboardEventLike): void => {
    if (event.defaultPrevented === true) {
      return;
    }

    if (handleKeyboardSelectKeyDown(event, config)) {
      event.preventDefault();
    }
  };

  keydownTarget.addEventListener('keydown', onKeyDown);

  return (): void => {
    keydownTarget.removeEventListener('keydown', onKeyDown);
  };
}

function resolveKeydownTarget(): KeydownTarget | null {
  if (typeof document === 'undefined') {
    return null;
  }

  return document as unknown as KeydownTarget;
}

function moveFocus(config: KeyboardSelectConfig, selectableZoneIDs: readonly string[], direction: 1 | -1): void {
  const focusedZoneID = config.getCurrentFocusedZoneID();
  const currentIndex = focusedZoneID === null ? -1 : selectableZoneIDs.indexOf(focusedZoneID);
  let nextIndex: number;

  if (currentIndex < 0) {
    nextIndex = direction === 1 ? 0 : selectableZoneIDs.length - 1;
  } else {
    nextIndex = (currentIndex + direction + selectableZoneIDs.length) % selectableZoneIDs.length;
  }

  const nextFocusedZoneID = selectableZoneIDs[nextIndex];
  if (nextFocusedZoneID === undefined || nextFocusedZoneID === focusedZoneID) {
    return;
  }

  config.onFocusChange(nextFocusedZoneID);
  config.onFocusAnnounce?.(nextFocusedZoneID);
}
