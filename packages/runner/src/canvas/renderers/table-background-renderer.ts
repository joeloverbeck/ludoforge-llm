import { Graphics, type Container } from 'pixi.js';

import type { TableBackgroundConfig } from '../../config/visual-config-types.js';
import { parseHexColor } from './shape-utils.js';

export interface TableBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

const DEFAULT_BACKGROUND_COLOR = '#0a5c2e';
const DEFAULT_SHAPE = 'ellipse';
const DEFAULT_PADDING_X = 80;
const DEFAULT_PADDING_Y = 60;

export function drawTableBackground(
  container: Container,
  background: TableBackgroundConfig | null,
  bounds: TableBounds,
): void {
  clearContainer(container);
  if (background === null) {
    return;
  }

  const shape = background.shape ?? DEFAULT_SHAPE;
  const paddingX = background.paddingX ?? DEFAULT_PADDING_X;
  const paddingY = background.paddingY ?? DEFAULT_PADDING_Y;
  const borderWidth = background.borderWidth ?? 0;
  const fillColor = parseHexColor(background.color ?? DEFAULT_BACKGROUND_COLOR, { allowNamedColors: true }) ?? 0x0a5c2e;
  const borderColor = parseHexColor(background.borderColor, { allowNamedColors: true }) ?? fillColor;

  const width = Math.max(0, bounds.maxX - bounds.minX) + (paddingX * 2);
  const height = Math.max(0, bounds.maxY - bounds.minY) + (paddingY * 2);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const left = centerX - (width / 2);
  const top = centerY - (height / 2);

  const graphics = new Graphics();
  switch (shape) {
    case 'rectangle':
      graphics.rect(left, top, width, height);
      break;
    case 'roundedRect':
      graphics.roundRect(left, top, width, height, Math.min(32, Math.min(width, height) * 0.12));
      break;
    case 'ellipse':
    default:
      graphics.ellipse(centerX, centerY, width / 2, height / 2);
      break;
  }

  graphics.fill(fillColor);
  if (borderWidth > 0) {
    graphics.stroke({ color: borderColor, width: borderWidth, alpha: 1 });
  }

  container.addChild(graphics);
}

function clearContainer(container: Container): void {
  const removed = container.removeChildren();
  for (const child of removed) {
    child.destroy();
  }
}
