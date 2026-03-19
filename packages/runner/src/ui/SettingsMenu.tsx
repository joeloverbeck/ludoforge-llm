import { useEffect, useId, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactElement, type RefObject } from 'react';

import type { RunnerControlDescriptor, RunnerControlSection } from './runner-control-surface.js';
import styles from './SettingsMenu.module.css';

interface SettingsMenuProps {
  readonly id?: string;
  readonly triggerId: string;
  readonly triggerRef?: RefObject<HTMLElement | null>;
  readonly open: boolean;
  readonly sections: readonly RunnerControlSection[];
  readonly onClose: () => void;
}

const FOCUSABLE_SELECTOR = [
  'button:not(:disabled)',
  'input:not(:disabled)',
  'select:not(:disabled)',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export function SettingsMenu({
  id,
  triggerId,
  triggerRef,
  open,
  sections,
  onClose,
}: SettingsMenuProps): ReactElement | null {
  const generatedId = useId();
  const menuId = id ?? `settings-menu-${generatedId}`;
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const menuElement = menuRef.current;
    focusFirstItem(menuElement);

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (menuElement?.contains(target) === true) {
        return;
      }
      if (triggerRef?.current?.contains(target) === true) {
        return;
      }
      onClose();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      event.preventDefault();
      onClose();
      if (triggerRef?.current instanceof HTMLElement) {
        triggerRef.current.focus();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose, triggerRef]);

  if (!open) {
    return null;
  }

  const visibleSections = sections
    .map((section) => ({
      ...section,
      controls: section.controls.filter((control) => control.hidden !== true),
    }))
    .filter((section) => section.controls.length > 0);

  return (
    <div
      id={menuId}
      ref={menuRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby={triggerId}
      className={styles.menu}
      data-testid="settings-menu"
      onKeyDown={(event) => {
        handleMenuKeyDown(event, menuRef.current);
      }}
    >
      {visibleSections.map((section) => (
        <section
          key={section.id}
          className={styles.section}
          aria-labelledby={`${menuId}-section-${section.id}`}
          data-testid={`settings-menu-section-${section.id}`}
        >
          <h2
            id={`${menuId}-section-${section.id}`}
            className={styles.sectionTitle}
          >
            {section.label}
          </h2>
          <div className={styles.controls}>
            {section.controls.map((control) => renderControl(control, menuId, onClose))}
          </div>
        </section>
      ))}
    </div>
  );
}

function renderControl(
  control: RunnerControlDescriptor,
  menuId: string,
  onClose: () => void,
): ReactElement {
  const controlId = `${menuId}-control-${control.id}`;
  const descriptionId = control.description === undefined ? undefined : `${controlId}-description`;

  switch (control.kind) {
    case 'segmented':
      return (
        <div
          key={control.id}
          className={styles.controlBlock}
          role="group"
          aria-labelledby={`${controlId}-label`}
          {...(descriptionId === undefined ? {} : { 'aria-describedby': descriptionId })}
          data-testid={`settings-control-${control.id}`}
        >
          <div id={`${controlId}-label`} className={styles.controlLabel}>
            {control.label}
          </div>
          {control.description === undefined ? null : (
            <p id={descriptionId} className={styles.controlDescription}>
              {control.description}
            </p>
          )}
          <div className={styles.segmentedRow}>
            {control.options.map((option) => (
              <button
                key={`${control.id}-${option.value}`}
                type="button"
                className={styles.segmentButton}
                aria-pressed={control.value === option.value}
                disabled={control.disabled}
                data-testid={`settings-control-${control.id}-${option.value}`}
                onClick={() => {
                  control.onSelect(option.value);
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      );
    case 'select':
      return (
        <label
          key={control.id}
          className={styles.controlBlock}
          data-testid={`settings-control-${control.id}`}
        >
          <span className={styles.controlLabel}>{control.label}</span>
          {control.description === undefined ? null : (
            <span id={descriptionId} className={styles.controlDescription}>{control.description}</span>
          )}
          <select
            id={controlId}
            className={styles.select}
            value={control.value}
            disabled={control.disabled}
            {...(descriptionId === undefined ? {} : { 'aria-describedby': descriptionId })}
            onChange={(event) => {
              control.onSelect(event.currentTarget.value);
            }}
          >
            {control.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      );
    case 'toggle':
      return (
        <label
          key={control.id}
          className={`${styles.controlBlock} ${styles.toggleRow}`}
          data-testid={`settings-control-${control.id}`}
        >
          <span className={styles.toggleText}>
            <span className={styles.controlLabel}>{control.label}</span>
            {control.description === undefined ? null : (
              <span id={descriptionId} className={styles.controlDescription}>{control.description}</span>
            )}
          </span>
          <input
            id={controlId}
            type="checkbox"
            checked={control.checked}
            disabled={control.disabled}
            onChange={(event) => {
              control.onToggle(event.currentTarget.checked);
            }}
          />
        </label>
      );
    case 'action':
      return (
        <button
          key={control.id}
          type="button"
          className={styles.actionButton}
          disabled={control.disabled}
          data-testid={`settings-control-${control.id}`}
          onClick={() => {
            control.onSelect();
            onClose();
          }}
        >
          <span className={styles.controlLabel}>{control.label}</span>
          {control.description === undefined ? null : (
            <span id={descriptionId} className={styles.controlDescription}>{control.description}</span>
          )}
        </button>
      );
  }
}

function handleMenuKeyDown(
  event: ReactKeyboardEvent<HTMLDivElement>,
  menuElement: HTMLDivElement | null,
): void {
  if (menuElement === null) {
    return;
  }

  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  if (target.tagName === 'SELECT' && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    return;
  }

  const focusableItems = getFocusableItems(menuElement);
  if (focusableItems.length === 0) {
    return;
  }

  const currentIndex = focusableItems.indexOf(target);
  if (currentIndex === -1) {
    return;
  }

  const nextIndex = (() => {
    if (event.key === 'ArrowDown') {
      return (currentIndex + 1) % focusableItems.length;
    }
    if (event.key === 'ArrowUp') {
      return (currentIndex - 1 + focusableItems.length) % focusableItems.length;
    }
    if (event.key === 'Home') {
      return 0;
    }
    if (event.key === 'End') {
      return focusableItems.length - 1;
    }
    return null;
  })();

  if (nextIndex === null) {
    return;
  }

  event.preventDefault();
  focusableItems[nextIndex]?.focus();
}

function focusFirstItem(menuElement: HTMLDivElement | null): void {
  getFocusableItems(menuElement)[0]?.focus();
}

function getFocusableItems(menuElement: HTMLDivElement | null): HTMLElement[] {
  if (menuElement === null) {
    return [];
  }
  return Array.from(menuElement.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}
