import type { ReactElement } from 'react';
import { useStore } from 'zustand';
import type { StoreApi } from 'zustand';

import { GameCanvas } from '../canvas/GameCanvas.js';
import type { GameStore } from '../store/game-store.js';
import { ActionToolbar } from './ActionToolbar.js';
import { ChoicePanel } from './ChoicePanel.js';
import { ErrorState } from './ErrorState.js';
import { EventDeckPanel } from './EventDeckPanel.js';
import { LoadingState } from './LoadingState.js';
import { InterruptBanner } from './InterruptBanner.js';
import { PhaseIndicator } from './PhaseIndicator.js';
import { Scoreboard } from './Scoreboard.js';
import { GlobalMarkersBar } from './GlobalMarkersBar.js';
import { ActiveEffectsPanel } from './ActiveEffectsPanel.js';
import { TurnOrderDisplay } from './TurnOrderDisplay.js';
import { UndoControl } from './UndoControl.js';
import { UIOverlay } from './UIOverlay.js';
import { VariablesPanel } from './VariablesPanel.js';
import { deriveBottomBarState } from './bottom-bar-mode.js';
import styles from './GameContainer.module.css';

interface GameContainerProps {
  readonly store: StoreApi<GameStore>;
}

type OverlayRegionPanel = (props: { readonly store: StoreApi<GameStore> }) => ReactElement;
type OverlayRegion = 'top' | 'side' | 'floating';

const OVERLAY_REGION_PANELS: Readonly<Record<OverlayRegion, readonly OverlayRegionPanel[]>> = {
  top: [
    InterruptBanner,
    PhaseIndicator,
    TurnOrderDisplay,
    EventDeckPanel,
  ],
  side: [
    VariablesPanel,
    Scoreboard,
    GlobalMarkersBar,
    ActiveEffectsPanel,
  ],
  floating: [],
};

function renderOverlayRegionPanels(
  panels: readonly OverlayRegionPanel[],
  store: StoreApi<GameStore>,
): ReactElement[] {
  return panels.map((Panel, index) => (
    <Panel key={Panel.name || `overlay-panel-${index}`} store={store} />
  ));
}

export function GameContainer({ store }: GameContainerProps): ReactElement {
  const gameLifecycle = useStore(store, (state) => state.gameLifecycle);
  const error = useStore(store, (state) => state.error);
  const renderModel = useStore(store, (state) => state.renderModel);

  if (error !== null) {
    return (
      <div className={styles.container}>
        <ErrorState error={error} onRetry={() => store.getState().clearError()} />
      </div>
    );
  }

  if (gameLifecycle === 'idle' || gameLifecycle === 'initializing') {
    return (
      <div className={styles.container}>
        <LoadingState />
      </div>
    );
  }

  const bottomBarState = deriveBottomBarState(renderModel);
  const bottomBarContent = (() => {
    switch (bottomBarState.kind) {
      case 'actions':
        return (
          <>
            <ActionToolbar store={store} />
            <UndoControl store={store} />
          </>
        );
      case 'choicePending':
      case 'choiceConfirm':
      case 'choiceInvalid':
        return <ChoicePanel store={store} mode={bottomBarState.kind} />;
      case 'aiTurn':
      case 'hidden':
        return null;
      default:
        return null;
    }
  })();

  return (
    <div className={styles.container}>
      <div className={styles.canvasLayer}>
        <GameCanvas store={store} />
      </div>
      <UIOverlay
        topBarContent={renderOverlayRegionPanels(OVERLAY_REGION_PANELS.top, store)}
        sidePanelContent={renderOverlayRegionPanels(OVERLAY_REGION_PANELS.side, store)}
        bottomBarContent={bottomBarContent}
        floatingContent={renderOverlayRegionPanels(OVERLAY_REGION_PANELS.floating, store)}
      />
    </div>
  );
}
