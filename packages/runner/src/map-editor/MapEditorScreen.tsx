import { type ReactElement, useEffect, useRef, useState } from 'react';

import { getOrComputeLayout } from '../layout/layout-cache.js';
import { resolveMapEditorBootstrapByGameId } from '../bootstrap/map-editor-bootstrap.js';
import type { VisualConfigProvider } from '../config/visual-config-provider.js';
import { createEditorCanvas } from './map-editor-canvas.js';
import { createMapEditorStore, type MapEditorStoreApi } from './map-editor-store.js';
import { createEditorZoneRenderer } from './map-editor-zone-renderer.js';
import styles from './MapEditorScreen.module.css';

interface MapEditorScreenProps {
  readonly gameId: string;
  readonly onBack: () => void;
}

interface ReadyEditorState {
  readonly gameName: string;
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

  useEffect(() => {
    let cancelled = false;
    setScreenState({ status: 'loading' });

    void resolveMapEditorBootstrapByGameId(gameId)
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

    void createEditorCanvas(container, screenState.editor.store)
      .then((canvas) => {
        if (!active) {
          canvas.destroy();
          return;
        }

        const zoneRenderer = createEditorZoneRenderer(
          canvas.layers.zone,
          screenState.editor.store,
          screenState.editor.visualConfigProvider,
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

  const title = screenState.status === 'ready' ? screenState.editor.gameName : gameId;

  return (
    <main className={styles.container} data-testid="map-editor-screen">
      <div className={styles.toolbar}>
        <button
          type="button"
          className={styles.toolbarButton}
          data-testid="map-editor-back-button"
          onClick={onBack}
        >
          Back to Menu
        </button>
        <span className={styles.toolbarTitle}>{title}</span>
        <span className={styles.toolbarSpacer} />
        <span className={styles.toolbarHint}>Toolbar controls land in later tickets.</span>
      </div>

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
          <div
            ref={canvasContainerRef}
            className={styles.canvasContainer}
            data-testid="map-editor-canvas-container"
          />
        )
        : null}
    </main>
  );
}
