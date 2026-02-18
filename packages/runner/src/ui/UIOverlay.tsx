import type { ReactElement, ReactNode } from 'react';

import styles from './UIOverlay.module.css';

interface UIOverlayProps {
  readonly topBarContent?: ReactNode;
  readonly bottomBarContent?: ReactNode;
}

export function UIOverlay({ topBarContent, bottomBarContent }: UIOverlayProps): ReactElement {
  return (
    <div className={styles.overlay} data-testid="ui-overlay">
      <div className={styles.topBar} data-testid="ui-overlay-top">
        {topBarContent}
      </div>
      <div className={styles.sidePanels} data-testid="ui-overlay-side" />
      <div className={styles.bottomBar} data-testid="ui-overlay-bottom">
        {bottomBarContent}
      </div>
      <div className={styles.floating} data-testid="ui-overlay-floating" />
    </div>
  );
}
