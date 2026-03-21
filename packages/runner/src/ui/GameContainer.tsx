import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactElement } from 'react';
import { useStore } from 'zustand';
import type { StoreApi } from 'zustand';

import { GameCanvas } from '../canvas/GameCanvas.js';
import type { ScreenRect } from '../canvas/coordinate-bridge.js';
import type { HoverAnchor, HoveredCanvasTarget } from '../canvas/hover-anchor-contract.js';
import { EMPTY_INTERACTION_HIGHLIGHTS, type InteractionHighlights } from '../canvas/interaction-highlights.js';
import type { DiagnosticBuffer } from '../animation/diagnostic-buffer.js';
import { isEditableTarget } from '../input/editable-target.js';
import { createKeyboardCoordinator } from '../input/keyboard-coordinator.js';
import type { GameBridge } from '../bridge/game-bridge.js';
import type { GameStore } from '../store/game-store.js';
import type { VisualConfigProvider } from '../config/visual-config-provider.js';
import { VisualConfigContext } from '../config/visual-config-context.js';
import { ActionToolbar } from './ActionToolbar.js';
import { ChoicePanel } from './ChoicePanel.js';
import { EligiblePanel } from './EligiblePanel.js';
import { ErrorState } from './ErrorState.js';
import { EventDeckPanel } from './EventDeckPanel.js';
import { LoadingState } from './LoadingState.js';
import { InterruptBanner } from './InterruptBanner.js';
import { PhaseIndicator } from './PhaseIndicator.js';
import { ActiveEffectsPanel } from './ActiveEffectsPanel.js';
import { TurnOrderDisplay } from './TurnOrderDisplay.js';
import { UndoControl } from './UndoControl.js';
import { UIOverlay } from './UIOverlay.js';
import { PlayerHandPanel } from './PlayerHandPanel.js';
import { AITurnOverlay } from './AITurnOverlay.js';
import { WarningsToast } from './WarningsToast.js';
import { TooltipLayer } from './TooltipLayer.js';
import { useActionTooltip } from './useActionTooltip.js';
import { useCardTooltip } from './useCardTooltip.js';
import { ActionTooltip } from './ActionTooltip.js';
import { EventCardTooltip } from './EventCardTooltip.js';
import { resolveTooltipCompanionGroups } from './tooltip-companion-actions.js';
import { PhaseBannerOverlay } from './PhaseBannerOverlay.js';
import { ShowdownOverlay } from './ShowdownOverlay.js';
import { TerminalOverlay } from './TerminalOverlay.js';
import { VictoryStandingsBar } from './VictoryStandingsBar.js';
import { deriveBottomBarState } from './bottom-bar-mode.js';
import { buildFactionCssVariableStyle } from './faction-color-style.js';
import { EventLogPanel } from './EventLogPanel.js';
import { buildRunnerControlSections } from './runner-control-surface.js';
import { createRunnerUiStore } from './runner-ui-store.js';
import { SettingsMenu } from './SettingsMenu.js';
import { SettingsMenuTrigger } from './SettingsMenuTrigger.js';
import { useEventLogEntries } from './useEventLogEntries.js';
import type { OverlayPanelComponent, OverlayPanelDiagnostics, OverlayPanelProps } from './overlay-panel-contract.js';
import styles from './GameContainer.module.css';

interface GameContainerProps {
  readonly store: StoreApi<GameStore>;
  readonly bridge: GameBridge;
  readonly visualConfigProvider: VisualConfigProvider;
  readonly readOnlyMode?: boolean;
  readonly onReturnToMenu?: () => void;
  readonly onNewGame?: () => void;
  readonly onQuit?: () => void;
  readonly onSave?: () => void;
  readonly onLoad?: () => void;
}

type OverlayRegion = 'topStatus' | 'left' | 'right' | 'floating';

const OVERLAY_REGION_PANELS: Readonly<Record<OverlayRegion, readonly OverlayPanelComponent[]>> = {
  topStatus: [
    PhaseIndicator,
    TurnOrderDisplay,
    InterruptBanner,
    EventDeckPanel,
  ],
  left: [
    EligiblePanel,
  ],
  right: [
    ActiveEffectsPanel,
  ],
  floating: [
    WarningsToast,
    PlayerHandPanel,
  ],
};

function renderOverlayRegionPanels(
  panels: readonly OverlayPanelComponent[],
  props: OverlayPanelProps,
): ReactElement[] {
  return panels.map((Panel, index) => (
    <Panel key={Panel.name || `overlay-panel-${index}`} {...props} />
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

function useActionSurfaceRevision(renderModel: GameStore['renderModel']): number {
  const surfaceStateRef = useRef<{ readonly renderModel: GameStore['renderModel']; readonly revision: number }>({
    renderModel: null,
    revision: 0,
  });

  if (surfaceStateRef.current.renderModel !== renderModel) {
    surfaceStateRef.current = {
      renderModel,
      revision: surfaceStateRef.current.revision + 1,
    };
  }

  return surfaceStateRef.current.revision;
}

export function GameContainer({
  store,
  bridge,
  visualConfigProvider,
  readOnlyMode = false,
  onReturnToMenu,
  onNewGame,
  onQuit,
  onSave,
  onLoad,
}: GameContainerProps): ReactElement {
  const gameLifecycle = useStore(store, (state) => state.gameLifecycle);
  const error = useStore(store, (state) => state.error);
  const renderModel = useStore(store, (state) => state.renderModel);
  const gameDefFactions = useStore(store, (state) => state.gameDef?.seats);
  const runnerUiStore = useMemo(createRunnerUiStore, []);
  const [hoverAnchor, setHoverAnchor] = useState<HoverAnchor | null>(null);
  const settingsMenuOpen = useStore(runnerUiStore, (state) => state.settingsMenuOpen);
  const eventLogVisible = useStore(runnerUiStore, (state) => state.eventLogVisible);
  const settingsMenuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const settingsMenuId = useId();
  const settingsMenuTriggerId = useId();
  const animationPlaying = useStore(store, (state) => state.animationPlaying);
  const animationPaused = useStore(store, (state) => state.animationPaused);
  const animationPlaybackSpeed = useStore(store, (state) => state.animationPlaybackSpeed);
  const aiPlaybackDetailLevel = useStore(store, (state) => state.aiPlaybackDetailLevel);
  const aiPlaybackAutoSkip = useStore(store, (state) => state.aiPlaybackAutoSkip);
  const setAnimationPlaybackSpeed = useStore(store, (state) => state.setAnimationPlaybackSpeed);
  const setAnimationPaused = useStore(store, (state) => state.setAnimationPaused);
  const requestAnimationSkipCurrent = useStore(store, (state) => state.requestAnimationSkipCurrent);
  const setAiPlaybackDetailLevel = useStore(store, (state) => state.setAiPlaybackDetailLevel);
  const setAiPlaybackAutoSkip = useStore(store, (state) => state.setAiPlaybackAutoSkip);
  const [interactionHighlights, setInteractionHighlights] = useState<InteractionHighlights>(EMPTY_INTERACTION_HIGHLIGHTS);
  const [selectedEventLogEntryId, setSelectedEventLogEntryId] = useState<string | null>(null);
  const [animationDiagnosticBuffer, setAnimationDiagnosticBuffer] = useState<DiagnosticBuffer | undefined>(undefined);
  const eventLogEntries = useEventLogEntries(store, visualConfigProvider);
  const {
    tooltipState: actionTooltipState,
    onActionHoverStart,
    onActionHoverEnd,
    onTooltipPointerEnter,
    onTooltipPointerLeave,
    invalidateActionTooltip,
  } = useActionTooltip(bridge);
  const {
    cardTooltipState,
    onCardHoverStart,
    onCardHoverEnd,
    onCardTooltipPointerEnter,
    onCardTooltipPointerLeave,
  } = useCardTooltip();
  const keyboardCoordinator = useMemo(
    () => (typeof document === 'undefined' ? null : createKeyboardCoordinator(document)),
    [],
  );

  useEffect(() => {
    return () => {
      keyboardCoordinator?.destroy();
    };
  }, [keyboardCoordinator]);

  useEffect(() => {
    if (keyboardCoordinator === null) {
      return;
    }

    return keyboardCoordinator.register((event) => {
      if (event.defaultPrevented || isEditableTarget(event.target) || event.key.toLowerCase() !== 'l') {
        return false;
      }

      runnerUiStore.getState().toggleEventLogVisible();
      return true;
    }, { priority: 15 });
  }, [keyboardCoordinator, runnerUiStore]);

  useEffect(() => {
    runnerUiStore.getState().resetChromeState();
  }, [runnerUiStore, store]);

  useEffect(() => {
    setInteractionHighlights(EMPTY_INTERACTION_HIGHLIGHTS);
    setSelectedEventLogEntryId(null);
  }, [store]);
  useEffect(() => {
    setAnimationDiagnosticBuffer(undefined);
  }, [store]);

  const bottomBarKind = readOnlyMode
    ? ('hidden' as const)
    : deriveBottomBarState(renderModel).kind;
  const actionSurfaceRevision = useActionSurfaceRevision(renderModel);

  useEffect(() => {
    const hoveredSourceKey = actionTooltipState.sourceKey;
    if (hoveredSourceKey === null) {
      return;
    }
    if (bottomBarKind !== 'actions' || hoveredSourceKey.surfaceRevision !== actionSurfaceRevision) {
      invalidateActionTooltip();
    }
  }, [actionSurfaceRevision, actionTooltipState.sourceKey, bottomBarKind, invalidateActionTooltip]);

  const onHoverAnchorChange = useCallback((anchor: HoverAnchor | null): void => {
    setHoverAnchor(anchor);
  }, []);
  const onAnimationDiagnosticBufferChange = useCallback((buffer: DiagnosticBuffer | null): void => {
    setAnimationDiagnosticBuffer(buffer ?? undefined);
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

  const bottomBarState = { kind: bottomBarKind };
  const factionCssVariableStyle = buildFactionCssVariableStyle(
    gameDefFactions?.map((seat) => seat.id),
    (factionId) => visualConfigProvider.getFactionColor(factionId),
  );
  const tooltipAnchorState = resolveTooltipAnchorState(hoverAnchor);
  const tooltipCompanionGroups = renderModel === null || actionTooltipState.sourceKey === null
    ? []
    : resolveTooltipCompanionGroups(
      actionTooltipState.sourceKey.groupKey,
      visualConfigProvider.getActionGroupPolicy(),
      renderModel.hiddenActionsByClass,
    );
  const overlayDiagnostics: OverlayPanelDiagnostics | undefined = animationDiagnosticBuffer === undefined
    ? undefined
    : { animationDiagnosticBuffer };
  const overlayPanelProps: OverlayPanelProps = {
    store,
    onCardHoverStart,
    onCardHoverEnd,
    ...(overlayDiagnostics !== undefined ? { diagnostics: overlayDiagnostics } : {}),
  };
  const runnerControlSections = buildRunnerControlSections(
    {
      animationPlaying,
      animationPaused,
      animationPlaybackSpeed,
      aiPlaybackDetailLevel,
      aiPlaybackAutoSkip,
    },
    {
      setAnimationPlaybackSpeed,
      setAnimationPaused,
      requestAnimationSkipCurrent,
      setAiPlaybackDetailLevel,
      setAiPlaybackAutoSkip,
    },
    {
      ...(animationDiagnosticBuffer === undefined || !import.meta.env.DEV
        ? {}
        : {
          diagnostics: {
            available: true,
            download: () => {
              animationDiagnosticBuffer.downloadAsJson();
            },
          },
        }),
    },
  );
  const rightRailContent = renderOverlayRegionPanels(OVERLAY_REGION_PANELS.right, overlayPanelProps);

  const bottomPrimaryContent = (() => {
    switch (bottomBarState.kind) {
      case 'actions':
        return (
          <>
            <ActionToolbar
              store={store}
              surfaceRevision={actionSurfaceRevision}
              onActionHoverStart={onActionHoverStart}
              onActionHoverEnd={onActionHoverEnd}
            />
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

  const bottomRightDockContent = eventLogVisible ? (
    <EventLogPanel
      entries={eventLogEntries}
      selectedEntryId={selectedEventLogEntryId}
      onSelectEntry={(entry) => {
        setSelectedEventLogEntryId(entry.id);
        setInteractionHighlights({
          zoneIDs: entry.zoneIds,
          tokenIDs: entry.tokenIds,
        });
      }}
    />
  ) : null;

  const topStatusContent = renderOverlayRegionPanels(OVERLAY_REGION_PANELS.topStatus, overlayPanelProps);
  const topSessionContent = (
    <div className={styles.sessionChrome}>
      <div className={styles.settingsMenuAnchor}>
        <SettingsMenuTrigger
          ref={settingsMenuTriggerRef}
          id={settingsMenuTriggerId}
          menuId={settingsMenuId}
          open={settingsMenuOpen}
          onClick={() => {
            runnerUiStore.getState().toggleSettingsMenu();
          }}
        />
        <SettingsMenu
          id={settingsMenuId}
          triggerId={settingsMenuTriggerId}
          triggerRef={settingsMenuTriggerRef}
          open={settingsMenuOpen}
          sections={runnerControlSections}
          onClose={() => {
            runnerUiStore.getState().closeSettingsMenu();
          }}
        />
      </div>
      <div className={styles.sessionButtons}>
        <button
          type="button"
          className={`${styles.sessionButton} ${eventLogVisible ? styles.eventLogToggleActive : ''}`}
          data-testid="event-log-toggle-button"
          onClick={() => {
            runnerUiStore.getState().toggleEventLogVisible();
          }}
        >
          {eventLogVisible ? 'Hide Log' : 'Show Log'}
        </button>
        {onSave === undefined ? null : (
          <button
            type="button"
            className={styles.sessionButton}
            data-testid="session-save-button"
            onClick={onSave}
          >
            Save
          </button>
        )}
        {onLoad === undefined ? null : (
          <button
            type="button"
            className={styles.sessionButton}
            data-testid="session-load-button"
            onClick={onLoad}
          >
            Load
          </button>
        )}
      </div>
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
    </div>
  );

  return (
    <VisualConfigContext.Provider value={visualConfigProvider}>
      <div className={styles.container} style={factionCssVariableStyle}>
        <div className={styles.canvasLayer}>
          <GameCanvas
            store={store}
            visualConfigProvider={visualConfigProvider}
            interactionHighlights={interactionHighlights}
            {...(keyboardCoordinator === null ? {} : { keyboardCoordinator })}
            onHoverAnchorChange={onHoverAnchorChange}
            onAnimationDiagnosticBufferChange={onAnimationDiagnosticBufferChange}
          />
        </div>
        <UIOverlay
          leftRailContent={renderOverlayRegionPanels(OVERLAY_REGION_PANELS.left, overlayPanelProps)}
          scoringBarContent={<VictoryStandingsBar store={store} />}
          topBarPresentation={visualConfigProvider.getRunnerChromeTopBar()}
          topStatusContent={topStatusContent}
          topSessionContent={topSessionContent}
          rightRailContent={rightRailContent}
          bottomPrimaryContent={bottomPrimaryContent}
          bottomRightDockContent={bottomRightDockContent}
          floatingContent={(
            <>
              {renderOverlayRegionPanels(OVERLAY_REGION_PANELS.floating, overlayPanelProps)}
              <PhaseBannerOverlay store={store} />
              <ShowdownOverlay store={store} />
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
              {bottomBarKind === 'actions' && actionTooltipState.description !== null && actionTooltipState.anchorElement !== null && (
                <ActionTooltip
                  description={actionTooltipState.description}
                  anchorElement={actionTooltipState.anchorElement}
                  companionGroups={tooltipCompanionGroups}
                  onPointerEnter={onTooltipPointerEnter}
                  onPointerLeave={onTooltipPointerLeave}
                />
              )}
              {cardTooltipState.card !== null && cardTooltipState.anchorElement !== null && (
                <EventCardTooltip
                  card={cardTooltipState.card}
                  anchorElement={cardTooltipState.anchorElement}
                  onPointerEnter={onCardTooltipPointerEnter}
                  onPointerLeave={onCardTooltipPointerLeave}
                />
              )}
            </>
          )}
        />
      </div>
    </VisualConfigContext.Provider>
  );
}
