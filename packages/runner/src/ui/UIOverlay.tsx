import type { ReactElement, ReactNode } from 'react';

import styles from './UIOverlay.module.css';

interface UIOverlayProps {
  readonly topBarContent?: ReactNode;
  readonly scoringBarContent?: ReactNode;
  readonly leftPanelContent?: ReactNode;
  readonly sidePanelContent?: ReactNode;
  readonly bottomBarContent?: ReactNode;
  readonly floatingContent?: ReactNode;
}

export function UIOverlay({
  topBarContent,
  scoringBarContent,
  leftPanelContent,
  sidePanelContent,
  bottomBarContent,
  floatingContent,
}: UIOverlayProps): ReactElement {
  return (
    <div className={styles.overlay} data-testid="ui-overlay">
      <div className={styles.topBar} data-testid="ui-overlay-top">
        {topBarContent}
      </div>
      {scoringBarContent != null && (
        <div className={styles.scoringBar} data-testid="ui-overlay-scoring">
          {scoringBarContent}
        </div>
      )}
      <div className={styles.leftPanel} data-testid="ui-overlay-left">
        {leftPanelContent}
      </div>
      <div className={styles.sidePanels} data-testid="ui-overlay-side">
        {sidePanelContent}
      </div>
      <div className={styles.bottomBar} data-testid="ui-overlay-bottom">
        {bottomBarContent}
      </div>
      <div className={styles.floating} data-testid="ui-overlay-floating">
        {floatingContent}
      </div>
    </div>
  );
}
