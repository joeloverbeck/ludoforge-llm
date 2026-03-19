import type { ReactElement, ReactNode } from 'react';

import type { ResolvedRunnerChromeTopBar } from '../config/visual-config-provider.js';
import styles from './UIOverlay.module.css';

interface UIOverlayProps {
  readonly topStatusContent?: ReactNode;
  readonly topSessionContent?: ReactNode;
  readonly topBarPresentation?: ResolvedRunnerChromeTopBar;
  readonly scoringBarContent?: ReactNode;
  readonly leftPanelContent?: ReactNode;
  readonly sidePanelContent?: ReactNode;
  readonly bottomBarContent?: ReactNode;
  readonly floatingContent?: ReactNode;
}

export function UIOverlay({
  topStatusContent,
  topSessionContent,
  topBarPresentation,
  scoringBarContent,
  leftPanelContent,
  sidePanelContent,
  bottomBarContent,
  floatingContent,
}: UIOverlayProps): ReactElement {
  const topStatusClassName = topBarPresentation?.statusAlignment === 'start'
    ? `${styles.topStatus} ${styles.topStatusStartAligned}`
    : styles.topStatus;

  return (
    <div className={styles.overlay} data-testid="ui-overlay">
      <div className={styles.topRegion}>
        <div className={styles.topBar} data-testid="ui-overlay-top">
          <div
            className={topStatusClassName}
            data-testid="ui-overlay-top-status"
            data-top-status-alignment={topBarPresentation?.statusAlignment ?? 'center'}
          >
            {topStatusContent}
          </div>
          <div className={styles.topSession} data-testid="ui-overlay-top-session">
            {topSessionContent}
          </div>
        </div>
        {scoringBarContent != null && (
          <div className={styles.scoringBar} data-testid="ui-overlay-scoring">
            {scoringBarContent}
          </div>
        )}
      </div>
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
