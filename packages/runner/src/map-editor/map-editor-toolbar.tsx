import { type ChangeEvent, type ReactElement } from 'react';

import type { MapEditorStoreApi } from './map-editor-store.js';
import styles from './MapEditorScreen.module.css';

interface MapEditorToolbarProps {
  readonly title: string;
  readonly store: MapEditorStoreApi | null;
  readonly onBack: () => void;
  readonly onExport: () => void;
  readonly exportEnabled?: boolean;
  readonly coordinateReadout?: string | null;
  readonly confirmDiscard?: (message: string) => boolean;
}

interface MapEditorToolbarViewProps {
  readonly title: string;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly showGrid: boolean;
  readonly snapToGrid: boolean;
  readonly gridSize: number;
  readonly dirty: boolean;
  readonly controlsDisabled: boolean;
  readonly exportEnabled: boolean;
  readonly coordinateReadout: string | null;
  readonly onBack: () => void;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onToggleGrid: () => void;
  readonly onGridSizeChange: (event: ChangeEvent<HTMLInputElement>) => void;
  readonly onToggleSnap: () => void;
  readonly onExport: () => void;
}

const DISCARD_CHANGES_MESSAGE = 'Discard unsaved map editor changes and return to the menu?';

export function MapEditorToolbar({
  title,
  store,
  onBack,
  onExport,
  exportEnabled = false,
  coordinateReadout = null,
  confirmDiscard = (message) => window.confirm(message),
}: MapEditorToolbarProps): ReactElement {
  if (store === null) {
    return (
      <MapEditorToolbarView
        title={title}
        canUndo={false}
        canRedo={false}
        showGrid={false}
        snapToGrid={false}
        gridSize={20}
        dirty={false}
        controlsDisabled
        exportEnabled={false}
        coordinateReadout={coordinateReadout}
        onBack={onBack}
        onUndo={() => {}}
        onRedo={() => {}}
        onToggleGrid={() => {}}
        onGridSizeChange={() => {}}
        onToggleSnap={() => {}}
        onExport={onExport}
      />
    );
  }

  return (
    <ConnectedMapEditorToolbar
      title={title}
      store={store}
      onBack={onBack}
      onExport={onExport}
      exportEnabled={exportEnabled}
      coordinateReadout={coordinateReadout}
      confirmDiscard={confirmDiscard}
    />
  );
}

function ConnectedMapEditorToolbar({
  title,
  store,
  onBack,
  onExport,
  exportEnabled,
  coordinateReadout,
  confirmDiscard,
}: Required<Omit<MapEditorToolbarProps, 'store'>> & { readonly store: MapEditorStoreApi }): ReactElement {
  const showGrid = store((state) => state.showGrid);
  const snapToGrid = store((state) => state.snapToGrid);
  const gridSize = store((state) => state.gridSize);
  const dirty = store((state) => state.dirty);
  const canUndo = store((state) => state.undoStack.length > 0);
  const canRedo = store((state) => state.redoStack.length > 0);

  const handleBack = (): void => {
    if (dirty && !confirmDiscard(DISCARD_CHANGES_MESSAGE)) {
      return;
    }
    onBack();
  };

  const handleGridSizeChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const value = Number(event.target.value);
    store.getState().setGridSize(value);
  };

  return (
    <MapEditorToolbarView
      title={title}
      canUndo={canUndo}
      canRedo={canRedo}
      showGrid={showGrid}
      snapToGrid={snapToGrid}
      gridSize={gridSize}
      dirty={dirty}
      controlsDisabled={false}
      exportEnabled={exportEnabled}
      coordinateReadout={coordinateReadout}
      onBack={handleBack}
      onUndo={() => store.getState().undo()}
      onRedo={() => store.getState().redo()}
      onToggleGrid={() => store.getState().toggleGrid()}
      onGridSizeChange={handleGridSizeChange}
      onToggleSnap={() => store.getState().setSnapToGrid(!snapToGrid)}
      onExport={onExport}
    />
  );
}

function MapEditorToolbarView({
  title,
  canUndo,
  canRedo,
  showGrid,
  snapToGrid,
  gridSize,
  dirty,
  controlsDisabled,
  exportEnabled,
  coordinateReadout,
  onBack,
  onUndo,
  onRedo,
  onToggleGrid,
  onGridSizeChange,
  onToggleSnap,
  onExport,
}: MapEditorToolbarViewProps): ReactElement {
  return (
    <div className={styles.toolbar}>
      <button
        type="button"
        className={styles.toolbarButton}
        data-testid="map-editor-back-button"
        onClick={onBack}
      >
        Back
      </button>
      <span className={styles.toolbarTitle}>{title}</span>
      {dirty
        ? (
          <span
            className={styles.dirtyIndicator}
            data-testid="map-editor-dirty-indicator"
            aria-label="Unsaved changes"
            title="Unsaved changes"
          >
            Unsaved
          </span>
        )
        : null}
      {coordinateReadout === null
        ? null
        : (
          <span
            className={styles.coordinateReadout}
            data-testid="map-editor-coordinate-readout"
          >
            {coordinateReadout}
          </span>
        )}
      <span className={styles.toolbarSpacer} />
      <button
        type="button"
        className={styles.toolbarButton}
        data-testid="map-editor-undo-button"
        onClick={onUndo}
        disabled={controlsDisabled || !canUndo}
      >
        Undo
      </button>
      <button
        type="button"
        className={styles.toolbarButton}
        data-testid="map-editor-redo-button"
        onClick={onRedo}
        disabled={controlsDisabled || !canRedo}
      >
        Redo
      </button>
      <button
        type="button"
        className={showGrid ? styles.toolbarToggleActive : styles.toolbarButton}
        data-testid="map-editor-grid-button"
        onClick={onToggleGrid}
        disabled={controlsDisabled}
        aria-pressed={showGrid}
      >
        Grid
      </button>
      <label className={styles.gridSizeControl}>
        <span className={styles.gridSizeLabel}>Grid</span>
        <input
          type="number"
          min="1"
          step="1"
          className={styles.gridSizeInput}
          data-testid="map-editor-grid-size-input"
          value={gridSize}
          onChange={onGridSizeChange}
          disabled={controlsDisabled || !showGrid}
        />
      </label>
      <button
        type="button"
        className={snapToGrid ? styles.toolbarToggleActive : styles.toolbarButton}
        data-testid="map-editor-snap-button"
        onClick={onToggleSnap}
        disabled={controlsDisabled}
        aria-pressed={snapToGrid}
      >
        Snap
      </button>
      <button
        type="button"
        className={styles.toolbarButton}
        data-testid="map-editor-export-button"
        onClick={onExport}
        disabled={!exportEnabled}
      >
        Export YAML
      </button>
    </div>
  );
}
