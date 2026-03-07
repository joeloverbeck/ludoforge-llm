import type { ReactElement } from 'react';
import type { RuleState } from '@ludoforge/engine/runtime';

import styles from './AvailabilitySection.module.css';

interface AvailabilitySectionProps {
  readonly ruleState: RuleState;
}

function scopeLabel(scope: 'turn' | 'phase' | 'game'): string {
  switch (scope) {
    case 'turn':
      return 'this turn';
    case 'phase':
      return 'this phase';
    case 'game':
      return 'total';
  }
}

export function AvailabilitySection({ ruleState }: AvailabilitySectionProps): ReactElement {
  const { available, blockers, limitUsage } = ruleState;

  return (
    <div className={styles.section} data-testid="availability-section">
      <div className={styles.status}>
        <span
          className={available ? styles.dotAvailable : styles.dotBlocked}
          data-testid="availability-dot"
        />
        <span className={available ? styles.labelAvailable : styles.labelBlocked}>
          {available ? 'Available' : 'Blocked'}
        </span>
        {limitUsage !== undefined && limitUsage.length > 0 && (
          <span data-testid="limit-usage-list">
            {limitUsage.map((limit, index) => (
              <span key={`${limit.scope}-${limit.max}-${limit.used}-${index}`} className={styles.limit} data-testid="limit-usage-item">
                ({limit.max - limit.used} remaining {scopeLabel(limit.scope)})
              </span>
            ))}
          </span>
        )}
      </div>
      {!available && blockers.length > 0 && (
        <ul className={styles.blockerList} data-testid="blocker-list">
          {blockers.map((blocker, i) => (
            <li key={`${blocker.astPath}-${i}`} className={styles.blockerItem}>
              {blocker.description}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
