import type { ReactElement } from 'react';

import styles from './ErrorState.module.css';

interface DisplayError {
  readonly message: string;
}

interface ErrorStateProps {
  readonly error: DisplayError;
  readonly onRetry: () => void;
}

export function ErrorState({ error, onRetry }: ErrorStateProps): ReactElement {
  return (
    <section className={styles.container} role="alert" aria-live="assertive">
      <h2 className={styles.title}>Failed to load game</h2>
      <p className={styles.message}>{error.message}</p>
      <button type="button" className={styles.retryButton} onClick={onRetry}>
        Retry
      </button>
    </section>
  );
}
