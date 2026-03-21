import { BitmapText, Container, Graphics } from 'pixi.js';

import type { TableOverlayRenderer } from './renderer-types.js';
import type {
  TableOverlayMarkerNode,
  TableOverlayTextNode,
} from '../../presentation/project-table-overlay-surface.js';
import { safeDestroyDisplayObject } from './safe-destroy.js';
import { parseHexColor } from './shape-utils.js';
import {
  createKeyedBitmapTextReconciler,
  createManagedBitmapText,
  toPixiBitmapTextStyle,
} from '../text/bitmap-text-runtime.js';
import { LABEL_FONT_NAME } from '../text/bitmap-font-registry.js';

const DEFAULT_MARKER_LABEL = '*';

interface MarkerSlot {
  readonly container: Container;
  readonly badge: Graphics;
  readonly label: BitmapText;
}

export function createTableOverlayRenderer(
  parentContainer: Container,
  _unusedLegacyProvider?: unknown,
): TableOverlayRenderer {
  const textRuntime = createKeyedBitmapTextReconciler({ parentContainer });
  const markersByKey = new Map<string, MarkerSlot>();

  function getOrCreateMarkerSlot(key: string): MarkerSlot {
    const existing = markersByKey.get(key);
    if (existing !== undefined) {
      if (existing.container.parent !== parentContainer) {
        parentContainer.addChild(existing.container);
      }
      return existing;
    }

    const container = new Container();
    container.eventMode = 'none';
    container.interactiveChildren = false;

    const badge = new Graphics();
    const label = createManagedBitmapText({
      text: DEFAULT_MARKER_LABEL,
      style: {
        fill: '#111827',
        fontSize: 11,
        fontName: LABEL_FONT_NAME,
      },
      anchor: { x: 0.5, y: 0.5 },
    });

    container.addChild(badge, label);
    parentContainer.addChild(container);

    const slot: MarkerSlot = { container, badge, label };
    markersByKey.set(key, slot);
    return slot;
  }

  function updateMarkerSlot(
    slot: MarkerSlot,
    resolved: TableOverlayMarkerNode,
  ): void {
    slot.container.visible = true;
    slot.container.renderable = true;
    slot.container.position.set(resolved.point.x, resolved.point.y);

    const markerColor =
      parseHexColor(resolved.style.color, { allowNamedColors: true }) ??
      0xfbbf24;
    const markerShape = resolved.style.shape;

    slot.badge.clear();
    if (markerShape === 'badge') {
      slot.badge.roundRect(-12, -9, 24, 18, 8);
    } else {
      slot.badge.circle(0, 0, 10);
    }
    slot.badge.fill(markerColor);

    slot.label.text = resolved.style.label;
    slot.label.style = toPixiBitmapTextStyle({
      fill: resolved.style.textColor,
      fontSize: resolved.style.fontSize,
      fontName: resolved.style.fontName,
    });
  }

  function removeStaleMarkers(activeKeys: ReadonlySet<string>): void {
    for (const [key, slot] of markersByKey) {
      if (activeKeys.has(key)) {
        continue;
      }
      safeDestroyDisplayObject(slot.container);
      markersByKey.delete(key);
    }
  }

  return {
    update(resolvedItems): void {
      const textSpecs = resolvedItems
        .filter(
          (item): item is TableOverlayTextNode => item.type === 'text',
        )
        .map((item) => ({
          key: item.key,
          text: item.text,
          style: {
            fill: item.style.color,
            fontSize: item.style.fontSize,
            fontName: item.style.fontName,
          },
          position: { x: item.point.x, y: item.point.y },
        }));
      textRuntime.reconcile(textSpecs);

      const activeMarkerKeys = new Set<string>();
      for (const item of resolvedItems) {
        if (item.type !== 'marker') {
          continue;
        }
        activeMarkerKeys.add(item.key);
        updateMarkerSlot(getOrCreateMarkerSlot(item.key), item);
      }
      removeStaleMarkers(activeMarkerKeys);
    },

    destroy(): void {
      textRuntime.destroy();
      for (const slot of markersByKey.values()) {
        safeDestroyDisplayObject(slot.container);
      }
      markersByKey.clear();
    },
  };
}
