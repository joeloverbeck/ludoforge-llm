import type { ReactElement } from 'react';

import styles from './UnsavedChangesDialog.module.css';

interface UnsavedChangesDialogProps {
  readonly isOpen: boolean;
  readonly onDiscard: () => void;
  readonly onCancel: () => void;
}

export function UnsavedChangesDialog({ isOpen, onDiscard, onCancel }: UnsavedChangesDialogProps): ReactElement | null {
  if (!isOpen) {
    return null;
  }

  return (
    <section className={styles.backdrop} data-testid="unsaved-changes-dialog" aria-label="Unsaved changes dialog">
      <article className={styles.card}>
        <h2 className={styles.title}>Unsaved Changes</h2>
        <p className={styles.message}>You have unsaved progress. Discard and return to menu?</p>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.cancelButton}
            data-testid="unsaved-changes-cancel"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.discardButton}
            data-testid="unsaved-changes-discard"
            onClick={onDiscard}
          >
            Discard
          </button>
        </div>
      </article>
    </section>
  );
}
