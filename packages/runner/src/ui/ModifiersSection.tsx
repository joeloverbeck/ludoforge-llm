import { useState, type ReactElement } from 'react';
import type { ContentModifier } from '@ludoforge/engine/runtime';

import styles from './ModifiersSection.module.css';

interface ModifiersSectionProps {
  readonly modifiers: readonly ContentModifier[];
  readonly activeModifierIndices: readonly number[];
}

const COLLAPSE_THRESHOLD = 2;

export function ModifiersSection({ modifiers, activeModifierIndices }: ModifiersSectionProps): ReactElement | null {
  const activeCount = activeModifierIndices.length;
  const hasActive = activeCount > 0;
  const shouldStartExpanded = modifiers.length <= COLLAPSE_THRESHOLD || hasActive;
  const [expanded, setExpanded] = useState(shouldStartExpanded);

  if (modifiers.length === 0) {
    return null;
  }

  const activeSet = new Set(activeModifierIndices);

  return (
    <div className={styles.section} data-testid="modifiers-section">
      <button
        type="button"
        className={styles.header}
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        data-testid="modifiers-toggle"
      >
        <span className={styles.chevron}>{expanded ? '\u25BE' : '\u25B8'}</span>
        {' '}Modifiers ({activeCount} active)
      </button>
      {expanded && (
        <ul className={styles.list} data-testid="modifiers-list">
          {modifiers.map((mod, i) => {
            const isActive = activeSet.has(i);
            return (
              <li
                key={`${mod.condition}-${i}`}
                className={isActive ? styles.active : styles.inactive}
                data-testid={isActive ? 'modifier-active' : 'modifier-inactive'}
              >
                {isActive && <span className={styles.checkmark} aria-label="active">{'\u2713'}</span>}
                <span className={styles.condition}>{mod.condition}:</span>{' '}
                <span className={styles.description}>{mod.description}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
