import { type BitmapText, Graphics } from 'pixi.js';

import type { PresentationZoneRenderSpec } from '../../presentation/presentation-scene.js';
import { parseHexColor } from '../../rendering/color-utils.js';
import { LABEL_FONT_NAME, STROKE_LABEL_FONT_NAME } from '../text/bitmap-font-registry.js';
import { createManagedBitmapText } from '../text/bitmap-text-runtime.js';

type PresentationZoneLabelSpec = PresentationZoneRenderSpec['markersLabel'];
type PresentationZoneBadgeSpec = NonNullable<PresentationZoneRenderSpec['badge']>;

export interface ZoneBadgeVisuals {
  readonly badgeGraphics: Graphics;
  readonly badgeLabel: BitmapText;
}

export function createZoneMarkersLabel(
  position: { readonly x: number; readonly y: number } = { x: 0, y: 0 },
): BitmapText {
  return createManagedBitmapText({
    text: '',
    style: {
      fontName: STROKE_LABEL_FONT_NAME,
      fill: '#f5f7fa',
      fontSize: 11,
      stroke: { color: '#000000', width: 2 },
    },
    anchor: { x: 0.5, y: 0 },
    position,
    visible: false,
  });
}

export function updateZoneMarkersLabel(
  label: BitmapText,
  spec: PresentationZoneLabelSpec,
  positionOverrides?: Partial<{ readonly x: number; readonly y: number }>,
): void {
  label.text = spec.text;
  label.position.set(positionOverrides?.x ?? spec.x, positionOverrides?.y ?? spec.y);
  label.visible = spec.visible;
}

export function createZoneBadgeVisuals(): ZoneBadgeVisuals {
  const badgeGraphics = new Graphics();
  badgeGraphics.eventMode = 'none';
  badgeGraphics.interactiveChildren = false;
  badgeGraphics.visible = false;

  const badgeLabel = createManagedBitmapText({
    text: '',
    style: {
      fontName: LABEL_FONT_NAME,
      fill: '#ffffff',
      fontSize: 10,
      fontWeight: 'bold',
    },
    anchor: { x: 0.5, y: 0.5 },
    visible: false,
  });

  return { badgeGraphics, badgeLabel };
}

export function updateZoneBadgeVisuals(
  visuals: ZoneBadgeVisuals,
  badge: PresentationZoneBadgeSpec | null,
): void {
  if (badge === null) {
    visuals.badgeGraphics.visible = false;
    visuals.badgeLabel.visible = false;
    return;
  }

  const fillColor = parseHexColor(badge.color);
  visuals.badgeGraphics.clear();
  visuals.badgeGraphics.roundRect(badge.x, badge.y, badge.width, badge.height, 4);
  visuals.badgeGraphics.fill({ color: fillColor ?? 0x6b7280 });
  visuals.badgeGraphics.visible = true;

  visuals.badgeLabel.text = badge.text;
  visuals.badgeLabel.position.set(badge.x + badge.width / 2, badge.y + badge.height / 2);
  visuals.badgeLabel.visible = true;
}
