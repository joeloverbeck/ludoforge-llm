import { Container, Graphics, Text } from 'pixi.js';

import type { TableOverlayRenderer } from './renderer-types.js';
import type { PresentationMarkerOverlayNode, PresentationOverlayNode, PresentationTextOverlayNode } from '../../presentation/presentation-scene.js';
import { safeDestroyDisplayObject } from './safe-destroy.js';
import { parseHexColor } from './shape-utils.js';

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

  const textSlots: Text[] = [];
  const markerSlots: MarkerSlot[] = [];
  let activeTextCount = 0;
  let activeMarkerCount = 0;

  function acquireTextSlot(index: number): Text {
    if (index < textSlots.length) {
      const slot = textSlots[index]!;
      slot.visible = true;
      slot.renderable = true;
      if (slot.parent !== parentContainer) {
        parentContainer.addChild(slot);
      }
      return slot;
    }
    const slot = new Text({
      text: '',
      style: {
        fill: DEFAULT_TEXT_COLOR,
        fontSize: DEFAULT_TEXT_FONT_SIZE,
        fontFamily: 'monospace',
      },
    });
    slot.eventMode = 'none';
    slot.interactiveChildren = false;
    textSlots.push(slot);
    parentContainer.addChild(slot);
    return slot;
  }

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
    const label = new Text({
      text: DEFAULT_MARKER_LABEL,
      style: {
        fill: '#111827',
        fontSize: 11,
        fontFamily: 'monospace',
      },
    });
    label.anchor.set(0.5, 0.5);
    label.eventMode = 'none';
    label.interactiveChildren = false;

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
    for (let i = textCount; i < activeTextCount; i++) {
      const slot = textSlots[i] as Text | undefined;
      if (slot !== undefined) {
        slot.visible = false;
        slot.renderable = false;
        slot.removeFromParent();
      }
    }
    for (let i = markerCount; i < activeMarkerCount; i++) {
      const slot = markerSlots[i] as MarkerSlot | undefined;
      if (slot !== undefined) {
        slot.container.visible = false;
        slot.container.renderable = false;
        slot.container.removeFromParent();
      }
    }
    activeTextCount = textCount;
    activeMarkerCount = markerCount;
  }

  function destroyAllSlots(): void {
    for (const slot of textSlots) {
      safeDestroyDisplayObject(slot);
    }
    for (const slot of markerSlots) {
      safeDestroyDisplayObject(slot.container);
    }
    textSlots.length = 0;
    markerSlots.length = 0;
    activeTextCount = 0;
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
          const slot = acquireTextSlot(textIndex);
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
