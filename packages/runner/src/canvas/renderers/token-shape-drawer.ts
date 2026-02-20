import type { TokenShape } from '../../config/visual-config-defaults.js';
import { buildRegularPolygonPoints } from './shape-utils.js';

export interface TokenShapeDimensions {
  readonly width: number;
  readonly height: number;
}

export interface TokenStrokeStyle {
  readonly color: number;
  readonly width: number;
  readonly alpha: number;
}

interface TokenShapeGraphics {
  clear(): TokenShapeGraphics;
  roundRect(x: number, y: number, width: number, height: number, radius: number): TokenShapeGraphics;
  circle(x: number, y: number, radius: number): TokenShapeGraphics;
  poly(points: number[]): TokenShapeGraphics;
  fill(style: { color: number; alpha?: number }): TokenShapeGraphics;
  stroke(style: TokenStrokeStyle): TokenShapeGraphics;
}

type TokenShapeDrawer = (
  graphics: TokenShapeGraphics,
  dimensions: TokenShapeDimensions,
  fillColor: number,
  stroke: TokenStrokeStyle,
) => void;

const CARD_CORNER_RADIUS = 4;
const SQUARE_CORNER_RADIUS = 3;

const tokenShapeDrawers: Record<TokenShape, TokenShapeDrawer> = {
  circle: (graphics, dimensions, fillColor, stroke) => {
    graphics
      .circle(0, 0, Math.min(dimensions.width, dimensions.height) / 2)
      .fill({ color: fillColor })
      .stroke(stroke);
  },
  square: (graphics, dimensions, fillColor, stroke) => {
    const side = Math.min(dimensions.width, dimensions.height);
    graphics
      .roundRect(-side / 2, -side / 2, side, side, SQUARE_CORNER_RADIUS)
      .fill({ color: fillColor })
      .stroke(stroke);
  },
  triangle: (graphics, dimensions, fillColor, stroke) => {
    graphics
      .poly(buildRegularPolygonPoints(3, dimensions.width, dimensions.height))
      .fill({ color: fillColor })
      .stroke(stroke);
  },
  diamond: (graphics, dimensions, fillColor, stroke) => {
    graphics
      .poly([0, -dimensions.height / 2, dimensions.width / 2, 0, 0, dimensions.height / 2, -dimensions.width / 2, 0])
      .fill({ color: fillColor })
      .stroke(stroke);
  },
  hexagon: (graphics, dimensions, fillColor, stroke) => {
    graphics
      .poly(buildRegularPolygonPoints(6, dimensions.width, dimensions.height))
      .fill({ color: fillColor })
      .stroke(stroke);
  },
  'beveled-cylinder': (graphics, dimensions, fillColor, stroke) => {
    graphics
      .poly(buildRegularPolygonPoints(8, dimensions.width, dimensions.height))
      .fill({ color: fillColor })
      .stroke(stroke);
    graphics
      .poly(buildRegularPolygonPoints(8, dimensions.width * 0.78, dimensions.height * 0.78))
      .stroke({
        color: stroke.color,
        width: Math.max(1, stroke.width * 0.65),
        alpha: Math.min(1, stroke.alpha + 0.05),
      });
  },
  meeple: (graphics, dimensions, fillColor, stroke) => {
    const headRadius = Math.min(dimensions.width, dimensions.height) * 0.2;
    const shoulderY = -dimensions.height * 0.1;
    const hipY = dimensions.height * 0.34;
    const shoulderWidth = dimensions.width * 0.54;
    const hipWidth = dimensions.width * 0.8;

    graphics
      .poly([
        -shoulderWidth / 2,
        shoulderY,
        shoulderWidth / 2,
        shoulderY,
        hipWidth / 2,
        hipY,
        -hipWidth / 2,
        hipY,
      ])
      .fill({ color: fillColor })
      .stroke(stroke);
    graphics
      .circle(0, -dimensions.height * 0.34, headRadius)
      .fill({ color: fillColor })
      .stroke(stroke);
  },
  card: (graphics, dimensions, fillColor, stroke) => {
    graphics
      .roundRect(-dimensions.width / 2, -dimensions.height / 2, dimensions.width, dimensions.height, CARD_CORNER_RADIUS)
      .fill({ color: fillColor })
      .stroke(stroke);
  },
  cube: (graphics, dimensions, fillColor, stroke) => {
    const side = Math.min(dimensions.width, dimensions.height) * 0.8;
    const half = side / 2;
    const topOffset = side * 0.2;
    const skew = side * 0.2;

    graphics
      .roundRect(-half, -half + topOffset, side, side, SQUARE_CORNER_RADIUS)
      .fill({ color: fillColor })
      .stroke(stroke);
    graphics
      .poly([
        -half,
        -half + topOffset,
        -half + skew,
        -half,
        half + skew,
        -half,
        half,
        -half + topOffset,
      ])
      .fill({ color: fillColor, alpha: 0.8 })
      .stroke({
        color: stroke.color,
        width: Math.max(1, stroke.width * 0.85),
        alpha: stroke.alpha,
      });
  },
  'round-disk': (graphics, dimensions, fillColor, stroke) => {
    const radius = Math.min(dimensions.width, dimensions.height) / 2;
    graphics
      .circle(0, 0, radius)
      .fill({ color: fillColor })
      .stroke(stroke);
    graphics
      .circle(0, 0, radius * 0.7)
      .stroke({
        color: stroke.color,
        width: Math.max(1, stroke.width * 0.6),
        alpha: Math.min(1, stroke.alpha + 0.05),
      });
  },
};

export function drawTokenShape(
  graphics: TokenShapeGraphics,
  shape: TokenShape,
  dimensions: TokenShapeDimensions,
  fillColor: number,
  stroke: TokenStrokeStyle,
): void {
  graphics.clear();
  tokenShapeDrawers[shape](graphics, dimensions, fillColor, stroke);
}

export function getTokenShapeDrawerRegistry(): Readonly<Record<TokenShape, TokenShapeDrawer>> {
  return tokenShapeDrawers;
}
