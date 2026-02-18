import { useCallback, useMemo, useState, type ReactElement } from 'react';
import { useStore } from 'zustand';
import type { StoreApi } from 'zustand';

import { GameCanvas, type HoverBoundsResolver, type HoveredCanvasTarget } from '../canvas/GameCanvas.js';
import type { CoordinateBridge, ScreenRect } from '../canvas/coordinate-bridge.js';
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
import { PlayerHandPanel } from './PlayerHandPanel.js';
import { AITurnOverlay } from './AITurnOverlay.js';
import { WarningsToast } from './WarningsToast.js';
import { TooltipLayer } from './TooltipLayer.js';
import { deriveBottomBarState } from './bottom-bar-mode.js';
import styles from './GameContainer.module.css';

interface GameContainerProps {
  readonly store: StoreApi<GameStore>;
}

type OverlayRegionPanel = (props: { readonly store: StoreApi<GameStore> }) => ReactElement | null;
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
  floating: [
    WarningsToast,
    PlayerHandPanel,
  ],
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
  const [coordinateBridge, setCoordinateBridge] = useState<CoordinateBridge | null>(null);
  const [hoverTarget, setHoverTarget] = useState<HoveredCanvasTarget | null>(null);
  const [hoverBoundsResolver, setHoverBoundsResolver] = useState<HoverBoundsResolver | null>(null);

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
  const onCoordinateBridgeReady = useCallback((bridge: CoordinateBridge | null) => {
    setCoordinateBridge(bridge);
  }, []);
  const onHoverTargetChange = useCallback((target: HoveredCanvasTarget | null) => {
    setHoverTarget(target);
  }, []);
  const onHoverBoundsResolverReady = useCallback((resolver: HoverBoundsResolver | null) => {
    setHoverBoundsResolver(() => resolver);
  }, []);
  const tooltipAnchorRect = useMemo<ScreenRect | null>(() => {
    if (coordinateBridge === null || hoverTarget === null || hoverBoundsResolver === null) {
      return null;
    }
    const worldBounds = hoverBoundsResolver(hoverTarget);
    if (worldBounds === null) {
      return null;
    }
    return coordinateBridge.worldBoundsToScreenRect(worldBounds);
  }, [coordinateBridge, hoverBoundsResolver, hoverTarget]);

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
        return <AITurnOverlay store={store} />;
      case 'hidden':
        return null;
      default:
        return null;
    }
  })();

  return (
    <div className={styles.container}>
      <div className={styles.canvasLayer}>
        <GameCanvas
          store={store}
          onCoordinateBridgeReady={onCoordinateBridgeReady}
          onHoverTargetChange={onHoverTargetChange}
          onHoverBoundsResolverReady={onHoverBoundsResolverReady}
        />
      </div>
      <UIOverlay
        topBarContent={renderOverlayRegionPanels(OVERLAY_REGION_PANELS.top, store)}
        sidePanelContent={renderOverlayRegionPanels(OVERLAY_REGION_PANELS.side, store)}
        bottomBarContent={bottomBarContent}
        floatingContent={(
          <>
            {renderOverlayRegionPanels(OVERLAY_REGION_PANELS.floating, store)}
            <TooltipLayer
              store={store}
              hoverTarget={hoverTarget}
              anchorRect={tooltipAnchorRect}
            />
          </>
        )}
      />
    </div>
  );
}
