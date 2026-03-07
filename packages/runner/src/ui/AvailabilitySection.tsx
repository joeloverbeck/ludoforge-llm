import type { ReactElement } from 'react';
import type { RuleState } from '@ludoforge/engine/runtime';

import styles from './AvailabilitySection.module.css';

interface AvailabilitySectionProps {
  readonly ruleState: RuleState;
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
        {limitUsage !== undefined && (
          <span className={styles.limit} data-testid="limit-usage">
            ({limitUsage.max - limitUsage.used} remaining this turn)
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
