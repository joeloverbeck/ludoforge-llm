import { useCallback, useEffect, useMemo, type ReactElement } from 'react';
import { flip, offset, shift, useFloating, type VirtualElement } from '@floating-ui/react-dom';
import type { StoreApi } from 'zustand';
import { useStore } from 'zustand';

import type { HoveredCanvasTarget } from '../canvas/hover-anchor-contract.js';
import type { ScreenRect } from '../canvas/coordinate-bridge.js';
import {
  selectTooltipPayloadFromStoreState,
  selectTooltipPayloadSignature,
} from '../model/tooltip-payload.js';
import type { GameStore } from '../store/game-store.js';
import styles from './TooltipLayer.module.css';

interface TooltipLayerProps {
  readonly store: StoreApi<GameStore>;
  readonly hoverTarget: HoveredCanvasTarget | null;
  readonly anchorRect: ScreenRect | null;
}

export function TooltipLayer({ store, hoverTarget, anchorRect }: TooltipLayerProps): ReactElement | null {
  const payloadSignatureSelector = useCallback(
    (state: GameStore) => selectTooltipPayloadSignature(state, hoverTarget),
    [hoverTarget],
  );
  const payloadSignature = useStore(store, payloadSignatureSelector);
  const { x, y, strategy, refs, update } = useFloating({
    placement: 'top',
    middleware: [offset(10), flip(), shift({ padding: 8 })],
  });
  const payload = useMemo(
    () => selectTooltipPayloadFromStoreState(store.getState(), hoverTarget),
    [store, hoverTarget, payloadSignature],
  );

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

  if (hoverTarget === null || anchorRect === null || payload === null) {
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
      <h4 className={styles.title}>{payload.title}</h4>
      {payload.rows.map((row) => (
        <p key={`${payload.kind}-${row.label}`} className={styles.row}><span>{row.label}:</span> {row.value}</p>
      ))}
      {payload.sections.map((section) => (
        <div key={`${payload.kind}-${section.title}`} className={styles.properties}>
          <span className={styles.propertiesTitle}>{section.title}</span>
          <ul className={styles.propertyList}>
            {section.rows.map((row) => (
              <li key={`${section.title}-${row.label}`} className={styles.propertyRow}>{row.label}: {row.value}</li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
