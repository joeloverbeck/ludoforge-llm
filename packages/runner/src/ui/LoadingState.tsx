import type { ReactElement } from 'react';

import styles from './LoadingState.module.css';

interface LoadingStateProps {
  readonly message?: string;
}

export function LoadingState({ message = 'Loading game...' }: LoadingStateProps): ReactElement {
  return (
    <section className={styles.container} role="status" aria-live="polite" aria-busy="true">
      <div className={styles.spinner} aria-hidden="true" />
      <p className={styles.message}>{message}</p>
    </section>
  );
}
