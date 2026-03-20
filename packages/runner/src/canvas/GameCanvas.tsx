import { useEffect, useRef, useState, type ReactElement } from 'react';
import type { StoreApi } from 'zustand';

import type { KeyboardCoordinator } from '../input/keyboard-coordinator.js';
import type { DiagnosticBuffer } from '../animation/diagnostic-buffer.js';
import type { GameStore } from '../store/game-store';
import type { VisualConfigProvider } from '../config/visual-config-provider.js';
import type { HoverAnchor } from './hover-anchor-contract';
import { EMPTY_INTERACTION_HIGHLIGHTS, type InteractionHighlights } from './interaction-highlights.js';
import { createCanvasCrashRecovery } from './canvas-crash-recovery.js';
import {
  createGameCanvasRuntime,
  createScopedLifecycleCallback,
  type GameCanvasRuntime,
  type GameCanvasRuntimeOptions,
} from './game-canvas-runtime.js';

const DEFAULT_BACKGROUND_COLOR = 0x0b1020;

const LIVE_REGION_STYLE = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  margin: '-1px',
  padding: '0',
  border: '0',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
} as const;

export interface GameCanvasProps {
  readonly store: StoreApi<GameStore>;
  readonly visualConfigProvider: VisualConfigProvider;
  readonly backgroundColor?: number;
  readonly keyboardCoordinator?: KeyboardCoordinator;
  readonly interactionHighlights?: InteractionHighlights;
  readonly onHoverAnchorChange?: (anchor: HoverAnchor | null) => void;
  readonly onAnimationDiagnosticBufferChange?: (buffer: DiagnosticBuffer | null) => void;
  readonly onError?: (error: unknown) => void;
}

export function GameCanvas({
  store,
  visualConfigProvider,
  backgroundColor = DEFAULT_BACKGROUND_COLOR,
  keyboardCoordinator,
  interactionHighlights = EMPTY_INTERACTION_HIGHLIGHTS,
  onHoverAnchorChange,
  onAnimationDiagnosticBufferChange,
  onError,
}: GameCanvasProps): ReactElement {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<GameCanvasRuntime | null>(null);
  const recoveryPendingRef = useRef(false);
  const [recoveryRevision, setRecoveryRevision] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) {
      return;
    }

    let cancelled = false;
    let runtime: GameCanvasRuntime | null = null;
    const hoverAnchorCallback = createScopedLifecycleCallback(onHoverAnchorChange);
    const diagnosticBufferCallback = createScopedLifecycleCallback(onAnimationDiagnosticBufferChange);
    const crashRecovery = createCanvasCrashRecovery({
      store,
      onRecoveryNeeded: () => {
        recoveryPendingRef.current = true;
        setRecoveryRevision((revision) => revision + 1);
      },
    });

    const runtimeOptions: GameCanvasRuntimeOptions = {
      container,
      store,
      visualConfigProvider,
      backgroundColor,
      ...(keyboardCoordinator === undefined ? {} : { keyboardCoordinator }),
      interactionHighlights: interactionHighlights ?? EMPTY_INTERACTION_HIGHLIGHTS,
      ...(onHoverAnchorChange === undefined
        ? {}
        : {
            onHoverAnchorChange: (anchor) => {
              hoverAnchorCallback.invoke(anchor);
            },
          }),
      ...(onAnimationDiagnosticBufferChange === undefined
        ? {}
        : {
            onAnimationDiagnosticBufferChange: (buffer) => {
              diagnosticBufferCallback.invoke(buffer);
            },
          }),
      onError: (error) => {
        crashRecovery.handleCrash(error);
        onError?.(error);
      },
    };

    void createGameCanvasRuntime(runtimeOptions).then((createdRuntime) => {
      if (cancelled) {
        createdRuntime.destroy();
        return;
      }
      runtime = createdRuntime;
      runtimeRef.current = createdRuntime;
      if (recoveryPendingRef.current) {
        recoveryPendingRef.current = false;
        store.getState().canvasRecovered();
      }
    }).catch((error: unknown) => {
      if (!cancelled) {
        hoverAnchorCallback.invoke(null);
        diagnosticBufferCallback.invoke(null);
        onError?.(error);
      }
    });

    return () => {
      cancelled = true;
      crashRecovery.destroy();
      hoverAnchorCallback.deactivate();
      diagnosticBufferCallback.deactivate();
      onHoverAnchorChange?.(null);
      onAnimationDiagnosticBufferChange?.(null);
      runtime?.destroy();
      runtimeRef.current = null;
    };
  }, [
    store,
    visualConfigProvider,
    backgroundColor,
    keyboardCoordinator,
    onHoverAnchorChange,
    onAnimationDiagnosticBufferChange,
    onError,
    recoveryRevision,
  ]);

  useEffect(() => {
    runtimeRef.current?.setInteractionHighlights(interactionHighlights);
  }, [interactionHighlights]);

  return (
    <div ref={rootRef} style={{ width: '100%', height: '100%' }}>
      <div ref={containerRef} role="application" aria-label="Game board" style={{ width: '100%', height: '100%' }} />
      <div
        data-ludoforge-live-region="true"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={LIVE_REGION_STYLE}
      />
    </div>
  );
}
