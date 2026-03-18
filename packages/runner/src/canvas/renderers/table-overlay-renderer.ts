import { Container, Graphics, Text } from 'pixi.js';

import type { TableOverlayRenderer } from './renderer-types.js';
import type { PresentationMarkerOverlayNode, PresentationOverlayNode, PresentationTextOverlayNode } from '../../presentation/presentation-scene.js';
import { safeDestroyDisplayObject } from './safe-destroy.js';
import { parseHexColor } from './shape-utils.js';
import { createManagedText, createTextSlotPool } from '../text/text-runtime.js';

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
  let lastSignature: string | null = null;

  const textSlots = createTextSlotPool({
    parentContainer,
    createText: () => createManagedText({
      style: {
        fill: DEFAULT_TEXT_COLOR,
        fontSize: DEFAULT_TEXT_FONT_SIZE,
        fontFamily: 'monospace',
      },
    }),
  });
  const markerSlots: MarkerSlot[] = [];
  let allocatedTextCount = 0;
  let activeMarkerCount = 0;

  function acquireMarkerSlot(index: number): MarkerSlot {
    if (index < markerSlots.length) {
      const slot = markerSlots[index]!;
      slot.container.visible = true;
      slot.container.renderable = true;
      if (slot.container.parent !== parentContainer) {
        parentContainer.addChild(slot.container);
      }
      return slot;
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
    const slot: MarkerSlot = { container, badge, label };
    markerSlots.push(slot);
    parentContainer.addChild(container);
    return slot;
  }

  function updateTextSlot(slot: Text, resolved: PresentationTextOverlayNode): void {
    slot.text = resolved.text;
    slot.position.set(resolved.point.x, resolved.point.y);
    const style = slot.style as { fill?: string; fontSize?: number };
    const nextFill = resolved.item.color ?? DEFAULT_TEXT_COLOR;
    const nextSize = resolved.item.fontSize ?? DEFAULT_TEXT_FONT_SIZE;
    if (style.fill !== nextFill) {
      style.fill = nextFill;
    }
    if (style.fontSize !== nextSize) {
      style.fontSize = nextSize;
    }
  }

  function updateMarkerSlot(slot: MarkerSlot, resolved: PresentationMarkerOverlayNode): void {
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
    const labelStyle = slot.label.style as { fontSize?: number };
    const nextSize = resolved.item.fontSize ?? 11;
    if (labelStyle.fontSize !== nextSize) {
      labelStyle.fontSize = nextSize;
    }
  }

  function hideExcessSlots(textCount: number, markerCount: number): void {
    for (let i = textCount; i < allocatedTextCount; i += 1) {
      const slot = textSlots.acquire(i);
      slot.visible = false;
      slot.renderable = false;
      slot.removeFromParent();
    }
    for (let i = markerCount; i < activeMarkerCount; i++) {
      const slot = markerSlots[i] as MarkerSlot | undefined;
      if (slot !== undefined) {
        slot.container.visible = false;
        slot.container.renderable = false;
        slot.container.removeFromParent();
      }
    }
    allocatedTextCount = textSlots.allocatedCount;
    activeMarkerCount = markerCount;
  }

  function destroyAllSlots(): void {
    textSlots.destroyAll();
    for (const slot of markerSlots) {
      safeDestroyDisplayObject(slot.container);
    }
    markerSlots.length = 0;
    allocatedTextCount = 0;
    activeMarkerCount = 0;
  }

  return {
    update(resolvedItems): void {
      if (resolvedItems.length === 0) {
        if (lastSignature !== null) {
          hideExcessSlots(0, 0);
          lastSignature = null;
        }
        return;
      }
      const nextSignature = buildOverlaySignature(resolvedItems);
      if (lastSignature === nextSignature) {
        return;
      }

      lastSignature = nextSignature;

      let textIndex = 0;
      let markerIndex = 0;

      for (const resolved of resolvedItems) {
        if (resolved.type === 'text') {
          const slot = textSlots.acquire(textIndex);
          updateTextSlot(slot, resolved);
          textIndex += 1;
        } else {
          const slot = acquireMarkerSlot(markerIndex);
          updateMarkerSlot(slot, resolved);
          markerIndex += 1;
        }
      }

      hideExcessSlots(textIndex, markerIndex);
    },

    destroy(): void {
      destroyAllSlots();
      lastSignature = null;
    },
  };
}

function buildOverlaySignature(items: readonly PresentationOverlayNode[]): string {
  return items.map((item) => item.signature).join('\n');
}
