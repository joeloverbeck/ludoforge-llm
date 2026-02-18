import { useEffect, useMemo, type ReactElement } from 'react';
import { flip, offset, shift, useFloating, type VirtualElement } from '@floating-ui/react-dom';
import type { StoreApi } from 'zustand';
import { useStore } from 'zustand';

import type { HoveredCanvasTarget } from '../canvas/GameCanvas.js';
import type { ScreenRect } from '../canvas/coordinate-bridge.js';
import type { RenderToken, RenderZone } from '../model/render-model.js';
import type { GameStore } from '../store/game-store.js';
import styles from './TooltipLayer.module.css';

interface TooltipLayerProps {
  readonly store: StoreApi<GameStore>;
  readonly hoverTarget: HoveredCanvasTarget | null;
  readonly anchorRect: ScreenRect | null;
}

const EMPTY_ZONES: readonly RenderZone[] = [];
const EMPTY_TOKENS: readonly RenderToken[] = [];

export function TooltipLayer({ store, hoverTarget, anchorRect }: TooltipLayerProps): ReactElement | null {
  const zones = useStore(store, (state) => state.renderModel?.zones ?? EMPTY_ZONES);
  const tokens = useStore(store, (state) => state.renderModel?.tokens ?? EMPTY_TOKENS);
  const { x, y, strategy, refs, update } = useFloating({
    placement: 'top',
    middleware: [offset(10), flip(), shift({ padding: 8 })],
  });

  const virtualReference = useMemo<VirtualElement | null>(() => {
    if (anchorRect === null) {
      return null;
    }

    return {
      getBoundingClientRect: () => ({
        x: anchorRect.x,
        y: anchorRect.y,
        width: anchorRect.width,
        height: anchorRect.height,
        top: anchorRect.top,
        right: anchorRect.right,
        bottom: anchorRect.bottom,
        left: anchorRect.left,
      }),
    };
  }, [anchorRect]);

  useEffect(() => {
    refs.setReference(virtualReference);
  }, [refs, virtualReference]);

  useEffect(() => {
    if (virtualReference === null) {
      return;
    }
    void update();
  }, [virtualReference, update]);

  if (hoverTarget === null || anchorRect === null) {
    return null;
  }

  if (hoverTarget.kind === 'zone') {
    const zone = zones.find((candidate) => candidate.id === hoverTarget.id);
    if (zone === undefined) {
      return null;
    }

    return (
      <section
        className={styles.tooltip}
        data-testid="tooltip-layer"
        style={{
          position: strategy,
          left: x ?? 0,
          top: y ?? 0,
        }}
      >
        <h4 className={styles.title}>{zone.displayName}</h4>
        <p className={styles.row}><span>Zone ID:</span> {zone.id}</p>
        <p className={styles.row}><span>Tokens:</span> {zone.tokenIDs.length + zone.hiddenTokenCount}</p>
        <p className={styles.row}><span>Visibility:</span> {zone.visibility}</p>
        <p className={styles.row}><span>Markers:</span> {formatZoneMarkers(zone)}</p>
      </section>
    );
  }

  const token = tokens.find((candidate) => candidate.id === hoverTarget.id);
  if (token === undefined) {
    return null;
  }

  return (
    <section
      className={styles.tooltip}
      data-testid="tooltip-layer"
      style={{
        position: strategy,
        left: x ?? 0,
        top: y ?? 0,
      }}
    >
      <h4 className={styles.title}>{token.type}</h4>
      <p className={styles.row}><span>Token ID:</span> {token.id}</p>
      <p className={styles.row}><span>Owner:</span> {token.ownerID ?? 'none'}</p>
      <p className={styles.row}><span>Face Up:</span> {token.faceUp ? 'yes' : 'no'}</p>
      <p className={styles.row}><span>Zone:</span> {token.zoneID}</p>
      <div className={styles.properties}>
        <span className={styles.propertiesTitle}>Properties</span>
        {formatTokenProperties(token)}
      </div>
    </section>
  );
}

function formatZoneMarkers(zone: RenderZone): string {
  if (zone.markers.length === 0) {
    return 'none';
  }

  return zone.markers.map((marker) => `${marker.displayName}:${marker.state}`).join(', ');
}

function formatTokenProperties(token: RenderToken): ReactElement {
  const entries = Object.entries(token.properties);
  if (entries.length === 0) {
    return <span className={styles.none}>none</span>;
  }

  return (
    <ul className={styles.propertyList}>
      {entries.map(([key, value]) => (
        <li key={key} className={styles.propertyRow}>{key}: {String(value)}</li>
      ))}
    </ul>
  );
}
