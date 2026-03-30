import type { GameDef } from '@ludoforge/engine/runtime';
import { type ReactElement, useEffect, useRef, useState } from 'react';

import { getOrComputeLayout } from '../layout/layout-cache.js';
import { resolveRunnerBootstrapByGameId } from '../bootstrap/runner-bootstrap.js';
import type { VisualConfigProvider } from '../config/visual-config-provider.js';
import { createEditorCanvas } from './map-editor-canvas.js';
import { createEditorAdjacencyRenderer } from './map-editor-adjacency-renderer.js';
import { exportVisualConfig, triggerDownload } from './map-editor-export.js';
import { createEditorHandleRenderer } from './map-editor-handle-renderer.js';
import { createEditorRouteRenderer } from './map-editor-route-renderer.js';
import { MapEditorToolbar } from './map-editor-toolbar.js';
import { createMapEditorStore, type MapEditorStoreApi } from './map-editor-store.js';
import { createEditorZoneRenderer } from './map-editor-zone-renderer.js';
import { createVertexHandleRenderer } from './vertex-handle-renderer.js';
import { useMapEditorKeyboardShortcuts } from './use-map-editor-keyboard-shortcuts.js';
import type { Position } from './map-editor-types.js';
import styles from './MapEditorScreen.module.css';

interface MapEditorScreenProps {
  readonly gameId: string;
  readonly onBack: () => void;
}

interface ReadyEditorState {
  readonly gameName: string;
  readonly gameDef: GameDef;
  readonly visualConfigProvider: VisualConfigProvider;
  readonly store: MapEditorStoreApi;
}

type ScreenState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready'; readonly editor: ReadyEditorState };

export function MapEditorScreen({ gameId, onBack }: MapEditorScreenProps): ReactElement {
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const [screenState, setScreenState] = useState<ScreenState>({ status: 'loading' });
  const [exportError, setExportError] = useState<string | null>(null);
  const [pointerWorldPosition, setPointerWorldPosition] = useState<Position | null>(null);
  const [selectedZonePosition, setSelectedZonePosition] = useState<Position | null>(null);
  const readyStore = screenState.status === 'ready' ? screenState.editor.store : null;
  const coordinateReadout = formatCoordinateReadout(pointerWorldPosition, selectedZonePosition);

  useMapEditorKeyboardShortcuts(readyStore);

  useEffect(() => {
    let cancelled = false;
    setScreenState({ status: 'loading' });
    setExportError(null);
    setPointerWorldPosition(null);
    setSelectedZonePosition(null);

    void resolveRunnerBootstrapByGameId(gameId)
      .then((resolved) => {
        if (cancelled) {
          return;
        }
        if (resolved === null) {
          setScreenState({
            status: 'error',
            message: `Unknown game "${gameId}".`,
          });
          return;
        }
        if (!resolved.capabilities.supportsMapEditor) {
          setScreenState({
            status: 'error',
            message: `${resolved.descriptor.gameMetadata.name} does not support the map editor.`,
          });
          return;
        }

        const initialLayout = getOrComputeLayout(resolved.gameDef, resolved.visualConfigProvider);
        setScreenState({
          status: 'ready',
          editor: {
            gameName: resolved.descriptor.gameMetadata.name,
            gameDef: resolved.gameDef,
            visualConfigProvider: resolved.visualConfigProvider,
            store: createMapEditorStore(
              resolved.gameDef,
              resolved.visualConfig,
              initialLayout.worldLayout.positions,
            ),
          },
        });
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setScreenState({
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to load the map editor.',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [gameId]);

  useEffect(() => {
    if (screenState.status !== 'ready') {
      return;
    }

    const container = canvasContainerRef.current;
    if (container === null) {
      return;
    }

    let active = true;
    let removeWindowListeners = (): void => {};
    let destroyRuntime = (): void => {};

    void createEditorCanvas(container, screenState.editor.store, {
      onPointerWorldPositionChange: setPointerWorldPosition,
    })
      .then((canvas) => {
        if (!active) {
          canvas.destroy();
          return;
        }

        const adjacencyRenderer = createEditorAdjacencyRenderer(
          canvas.layers.adjacencyLayer,
          screenState.editor.store,
          screenState.editor.visualConfigProvider,
        );
        const zoneRenderer = createEditorZoneRenderer(
          canvas.layers.cityZoneLayer,
          screenState.editor.store,
          screenState.editor.visualConfigProvider,
          { dragSurface: canvas.viewport },
        );
        const routeRenderer = createEditorRouteRenderer(
          canvas.layers.connectionRouteLayer,
          screenState.editor.store,
          screenState.editor.gameDef,
          screenState.editor.visualConfigProvider,
        );
        const handleRenderer = createEditorHandleRenderer(
          canvas.layers.handleLayer,
          screenState.editor.store,
          screenState.editor.gameDef,
          screenState.editor.visualConfigProvider,
          { dragSurface: canvas.viewport },
        );
        const vertexHandleRenderer = createVertexHandleRenderer(
          canvas.layers.handleLayer,
          screenState.editor.store,
          { dragSurface: canvas.viewport },
        );

        const syncCanvasSize = (): void => {
          const nextWidth = Math.max(container.clientWidth, 1);
          const nextHeight = Math.max(container.clientHeight, 1);
          canvas.resize(nextWidth, nextHeight);
        };

        syncCanvasSize();
        canvas.centerOnContent();
        window.addEventListener('resize', syncCanvasSize);
        removeWindowListeners = () => {
          window.removeEventListener('resize', syncCanvasSize);
        };

        destroyRuntime = () => {
          removeWindowListeners();
          adjacencyRenderer.destroy();
          vertexHandleRenderer.destroy();
          handleRenderer.destroy();
          routeRenderer.destroy();
          zoneRenderer.destroy();
          canvas.destroy();
        };
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }
        setScreenState({
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to initialize the editor canvas.',
        });
      });

    return () => {
      active = false;
      destroyRuntime();
      removeWindowListeners();
    };
  }, [screenState]);

  useEffect(() => {
    if (screenState.status !== 'ready') {
      setSelectedZonePosition(null);
      return;
    }

    const store = screenState.editor.store;
    const syncSelectedZonePosition = (): void => {
      const state = store.getState();
      const selectedZoneId = state.selectedZoneId;
      setSelectedZonePosition(
        selectedZoneId === null ? null : state.zonePositions.get(selectedZoneId) ?? null,
      );
    };

    syncSelectedZonePosition();
    const unsubscribe = store.subscribe((state, previousState) => {
      if (
        state.selectedZoneId === previousState.selectedZoneId
        && state.zonePositions === previousState.zonePositions
      ) {
        return;
      }
      syncSelectedZonePosition();
    });

    return () => {
      unsubscribe();
      setSelectedZonePosition(null);
    };
  }, [screenState]);

  useEffect(() => {
    if (screenState.status !== 'ready') {
      return;
    }

    const store = screenState.editor.store;
    const handleBeforeUnload = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
      event.returnValue = '';
    };

    let listening = false;
    const syncBeforeUnload = (dirty: boolean): void => {
      if (dirty && !listening) {
        window.addEventListener('beforeunload', handleBeforeUnload);
        listening = true;
        return;
      }
      if (!dirty && listening) {
        window.removeEventListener('beforeunload', handleBeforeUnload);
        listening = false;
      }
    };

    syncBeforeUnload(store.getState().dirty);
    const unsubscribe = store.subscribe((state, previousState) => {
      if (state.dirty === previousState.dirty) {
        return;
      }
      syncBeforeUnload(state.dirty);
    });

    return () => {
      unsubscribe();
      if (listening) {
        window.removeEventListener('beforeunload', handleBeforeUnload);
      }
    };
  }, [screenState]);

  const title = screenState.status === 'ready' ? screenState.editor.gameName : gameId;
  const handleExport = (): void => {
    if (screenState.status !== 'ready') {
      return;
    }

    try {
      const { originalVisualConfig, zonePositions, zoneVertices, connectionAnchors, connectionRoutes, markSaved } =
        screenState.editor.store.getState();
      const yaml = exportVisualConfig({
        originalVisualConfig,
        zonePositions,
        zoneVertices,
        connectionAnchors,
        connectionRoutes,
      });
      triggerDownload(yaml, 'visual-config.yaml');
      markSaved();
      setExportError(null);
    } catch (error: unknown) {
      setExportError(error instanceof Error ? error.message : 'Failed to export visual config.');
    }
  };

  return (
    <main className={styles.container} data-testid="map-editor-screen">
      <MapEditorToolbar
        title={title}
        store={readyStore}
        onBack={onBack}
        onExport={handleExport}
        exportEnabled={screenState.status === 'ready'}
        coordinateReadout={coordinateReadout}
      />

      {screenState.status === 'loading'
        ? (
          <div className={styles.statusPanel} data-testid="map-editor-loading">
            <section className={styles.statusCard}>
              <h1>Loading map editor</h1>
              <p>Resolving bootstrap data and initial layout.</p>
            </section>
          </div>
        )
        : null}

      {screenState.status === 'error'
        ? (
          <div className={styles.statusPanel} data-testid="map-editor-error">
            <section className={styles.statusCard}>
              <h1>Map editor unavailable</h1>
              <p>{screenState.message}</p>
            </section>
          </div>
        )
        : null}

      {screenState.status === 'ready'
        ? (
          <>
            {exportError === null
              ? null
              : (
                <div className={styles.statusPanel} data-testid="map-editor-export-error">
                  <section className={styles.statusCard}>
                    <h2>Export failed</h2>
                    <p>{exportError}</p>
                  </section>
                </div>
              )}
            <div
              ref={canvasContainerRef}
              className={styles.canvasContainer}
              data-testid="map-editor-canvas-container"
            />
          </>
        )
        : null}
    </main>
  );
}

function formatCoordinateReadout(
  pointerWorldPosition: Position | null,
  selectedZonePosition: Position | null,
): string | null {
  if (pointerWorldPosition !== null) {
    return `Cursor ${formatPosition(pointerWorldPosition)}`;
  }
  if (selectedZonePosition !== null) {
    return `Selected ${formatPosition(selectedZonePosition)}`;
  }
  return null;
}

function formatPosition(position: Position): string {
  return `(${Math.round(position.x)}, ${Math.round(position.y)})`;
}
