import { Container, Graphics, Text } from 'pixi.js';

import type { TableOverlayRenderer } from './renderer-types.js';
import type { PresentationMarkerOverlayNode, PresentationTextOverlayNode } from '../../presentation/presentation-scene.js';
import { safeDestroyDisplayObject } from './safe-destroy.js';
import { parseHexColor } from './shape-utils.js';
import { createKeyedTextReconciler, createManagedText } from '../text/text-runtime.js';

const DEFAULT_TEXT_COLOR = '#f8fafc';
const DEFAULT_TEXT_FONT_SIZE = 12;
const DEFAULT_MARKER_SHAPE = 'circle';
const DEFAULT_MARKER_LABEL = '*';

interface MarkerSlot {
  readonly container: Container;
  readonly badge: Graphics;
  readonly label: Text;
}

export function createTableOverlayRenderer(
  parentContainer: Container,
  _unusedLegacyProvider?: unknown,
): TableOverlayRenderer {
  const textRuntime = createKeyedTextReconciler({ parentContainer });
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
    const label = createManagedText({
      text: DEFAULT_MARKER_LABEL,
      style: {
        fill: '#111827',
        fontSize: 11,
        fontFamily: 'monospace',
      },
      anchor: { x: 0.5, y: 0.5 },
    });

    container.addChild(badge, label);
    parentContainer.addChild(container);

    const slot: MarkerSlot = { container, badge, label };
    markersByKey.set(key, slot);
    return slot;
  }

  function updateMarkerSlot(slot: MarkerSlot, resolved: PresentationMarkerOverlayNode): void {
    slot.container.visible = true;
    slot.container.renderable = true;
    slot.container.position.set(resolved.point.x, resolved.point.y);

    const markerColor =
      parseHexColor(resolved.item.color ?? '#fbbf24', { allowNamedColors: true }) ?? 0xfbbf24;
    const markerShape = resolved.item.markerShape ?? DEFAULT_MARKER_SHAPE;

    slot.badge.clear();
    if (markerShape === 'badge') {
      slot.badge.roundRect(-12, -9, 24, 18, 8);
    } else {
      slot.badge.circle(0, 0, 10);
    }
    slot.badge.fill(markerColor);

    slot.label.text = resolved.item.label ?? DEFAULT_MARKER_LABEL;
    slot.label.style = {
      fill: '#111827',
      fontSize: resolved.item.fontSize ?? 11,
      fontFamily: 'monospace',
    };
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
        .filter((item): item is PresentationTextOverlayNode => item.type === 'text')
        .map((item) => ({
          key: item.key,
          text: item.text,
          style: {
            fill: item.item.color ?? DEFAULT_TEXT_COLOR,
            fontSize: item.item.fontSize ?? DEFAULT_TEXT_FONT_SIZE,
            fontFamily: 'monospace',
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
