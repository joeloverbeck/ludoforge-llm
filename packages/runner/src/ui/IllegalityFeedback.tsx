import type { ReactElement } from 'react';

import styles from './IllegalityFeedback.module.css';

export interface IllegalityFeedbackProps {
  readonly illegalReason: string | null;
}

const FALLBACK_REASON = 'This option is currently unavailable.';

function resolveReason(illegalReason: string | null): string {
  const trimmed = illegalReason?.trim();
  return trimmed == null || trimmed.length === 0 ? FALLBACK_REASON : trimmed;
}

export function IllegalityFeedback({ illegalReason }: IllegalityFeedbackProps): ReactElement {
  return (
    <span className={styles.feedback} role="note" data-testid="illegality-feedback">
      <span className={styles.icon} aria-hidden="true">
        !
      </span>
      <span>{resolveReason(illegalReason)}</span>
    </span>
  );
}
