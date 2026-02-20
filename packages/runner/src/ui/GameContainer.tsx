import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { useStore } from 'zustand';
import type { StoreApi } from 'zustand';

import { GameCanvas } from '../canvas/GameCanvas.js';
import type { ScreenRect } from '../canvas/coordinate-bridge.js';
import type { HoverAnchor, HoveredCanvasTarget } from '../canvas/hover-anchor-contract.js';
import { createKeyboardCoordinator } from '../input/keyboard-coordinator.js';
import type { GameStore } from '../store/game-store.js';
import type { VisualConfigProvider } from '../config/visual-config-provider.js';
import { VisualConfigContext } from '../config/visual-config-context.js';
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
import { TerminalOverlay } from './TerminalOverlay.js';
import { AnimationControls } from './AnimationControls.js';
import { deriveBottomBarState } from './bottom-bar-mode.js';
import { buildFactionCssVariableStyle } from './faction-color-style.js';
import { useKeyboardShortcuts } from './useKeyboardShortcuts.js';
import styles from './GameContainer.module.css';

interface GameContainerProps {
  readonly store: StoreApi<GameStore>;
  readonly visualConfigProvider: VisualConfigProvider;
  readonly onReturnToMenu?: () => void;
  readonly onNewGame?: () => void;
  readonly onQuit?: () => void;
}

type OverlayRegionPanel = (props: { readonly store: StoreApi<GameStore> }) => ReactElement | null;
type OverlayRegion = 'top' | 'side' | 'floating';

const OVERLAY_REGION_PANELS: Readonly<Record<OverlayRegion, readonly OverlayRegionPanel[]>> = {
  top: [
    InterruptBanner,
    PhaseIndicator,
    TurnOrderDisplay,
    EventDeckPanel,
    AnimationControls,
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

interface TooltipAnchorState {
  readonly hoverTarget: HoveredCanvasTarget | null;
  readonly anchorRect: ScreenRect | null;
}

export function resolveTooltipAnchorState(hoverAnchor: HoverAnchor | null): TooltipAnchorState {
  if (hoverAnchor === null || hoverAnchor.space !== 'screen') {
    return {
      hoverTarget: null,
      anchorRect: null,
    };
  }
  return {
    hoverTarget: hoverAnchor.target,
    anchorRect: hoverAnchor.rect,
  };
}

export function GameContainer({ store, visualConfigProvider, onReturnToMenu, onNewGame, onQuit }: GameContainerProps): ReactElement {
  const gameLifecycle = useStore(store, (state) => state.gameLifecycle);
  const error = useStore(store, (state) => state.error);
  const renderModel = useStore(store, (state) => state.renderModel);
  const gameDefFactions = useStore(store, (state) => state.gameDef?.factions);
  const [hoverAnchor, setHoverAnchor] = useState<HoverAnchor | null>(null);
  const keyboardShortcutsEnabled = error === null && (gameLifecycle === 'playing' || gameLifecycle === 'terminal');
  const keyboardCoordinator = useMemo(
    () => (typeof document === 'undefined' ? null : createKeyboardCoordinator(document)),
    [],
  );

  useKeyboardShortcuts(store, keyboardShortcutsEnabled, keyboardCoordinator ?? undefined);

  useEffect(() => {
    return () => {
      keyboardCoordinator?.destroy();
    };
  }, [keyboardCoordinator]);

  const onHoverAnchorChange = useCallback((anchor: HoverAnchor | null): void => {
    setHoverAnchor(anchor);
  }, []);

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
  const factionCssVariableStyle = buildFactionCssVariableStyle(
    gameDefFactions?.map((faction) => faction.id),
    (factionId) => visualConfigProvider.getFactionColor(factionId),
  );
  const tooltipAnchorState = resolveTooltipAnchorState(hoverAnchor);

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
    <VisualConfigContext.Provider value={visualConfigProvider}>
      <div className={styles.container} style={factionCssVariableStyle}>
        <div className={styles.canvasLayer}>
          <GameCanvas
            store={store}
            visualConfigProvider={visualConfigProvider}
            {...(keyboardCoordinator === null ? {} : { keyboardCoordinator })}
            onHoverAnchorChange={onHoverAnchorChange}
          />
        </div>
        <UIOverlay
          topBarContent={(
            <>
              {renderOverlayRegionPanels(OVERLAY_REGION_PANELS.top, store)}
              {onQuit === undefined ? null : (
                <button
                  type="button"
                  className={styles.quitButton}
                  data-testid="session-quit-button"
                  onClick={onQuit}
                >
                  Quit
                </button>
              )}
            </>
          )}
          sidePanelContent={renderOverlayRegionPanels(OVERLAY_REGION_PANELS.side, store)}
          bottomBarContent={bottomBarContent}
          floatingContent={(
            <>
              {renderOverlayRegionPanels(OVERLAY_REGION_PANELS.floating, store)}
              <TerminalOverlay
                store={store}
                {...(onNewGame === undefined ? {} : { onNewGame })}
                {...(onReturnToMenu === undefined ? {} : { onReturnToMenu })}
              />
              <TooltipLayer
                store={store}
                hoverTarget={tooltipAnchorState.hoverTarget}
                anchorRect={tooltipAnchorState.anchorRect}
              />
            </>
          )}
        />
      </div>
    </VisualConfigContext.Provider>
  );
}
