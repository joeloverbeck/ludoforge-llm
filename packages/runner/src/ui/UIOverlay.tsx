import type { ReactElement } from 'react';

import styles from './UIOverlay.module.css';

export function UIOverlay(): ReactElement {
  return (
    <div className={styles.overlay} data-testid="ui-overlay">
      <div className={styles.topBar} data-testid="ui-overlay-top" />
      <div className={styles.sidePanels} data-testid="ui-overlay-side" />
      <div className={styles.bottomBar} data-testid="ui-overlay-bottom" />
      <div className={styles.floating} data-testid="ui-overlay-floating" />
    </div>
  );
}
