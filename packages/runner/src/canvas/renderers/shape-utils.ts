import type { ZoneShape } from '../../config/visual-config-defaults.js';

export interface ShapeDimensions {
  readonly width: number;
  readonly height: number;
}

export interface ShapeGraphics {
  roundRect(x: number, y: number, width: number, height: number, radius: number): ShapeGraphics;
  circle(x: number, y: number, radius: number): ShapeGraphics;
  ellipse(x: number, y: number, halfWidth: number, halfHeight: number): ShapeGraphics;
  poly(points: number[]): ShapeGraphics;
}

interface DrawZoneShapeOptions {
  readonly rectangleCornerRadius: number;
  readonly lineCornerRadius: number;
}

interface ParseHexColorOptions {
  readonly allowShortHex?: boolean;
  readonly allowNamedColors?: boolean;
}

const DEFAULT_PARSE_HEX_COLOR_OPTIONS: ParseHexColorOptions = {
  allowShortHex: false,
  allowNamedColors: false,
};

const NAMED_COLOR_MAP: Readonly<Record<string, number>> = {
  red: 0xff0000,
  yellow: 0xffff00,
  orange: 0xffa500,
  olive: 0x808000,
  blue: 0x0000ff,
  'bright-blue': 0x00bfff,
  brightblue: 0x00bfff,
  cyan: 0x00ffff,
  green: 0x008000,
  black: 0x000000,
  white: 0xffffff,
  gray: 0x808080,
  grey: 0x808080,
};

export function resolveVisualDimensions(
  visual: { readonly width?: number; readonly height?: number } | null | undefined,
  defaults: ShapeDimensions,
): ShapeDimensions {
  return {
    width: sanitizePositiveDimension(visual?.width, defaults.width),
    height: sanitizePositiveDimension(visual?.height, defaults.height),
  };
}

export function sanitizePositiveDimension(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return value;
}

export function parseHexColor(
  color: string | undefined,
  options: ParseHexColorOptions = DEFAULT_PARSE_HEX_COLOR_OPTIONS,
): number | null {
  if (typeof color !== 'string') {
    return null;
  }

  const normalized = color.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(normalized)) {
    return Number.parseInt(normalized.slice(1), 16);
  }

  if (options.allowShortHex === true && /^#[0-9a-fA-F]{3}$/.test(normalized)) {
    const [r, g, b] = normalized.slice(1);
    return Number.parseInt(`${r}${r}${g}${g}${b}${b}`, 16);
  }

  if (options.allowNamedColors === true) {
    const named = NAMED_COLOR_MAP[normalized.toLowerCase()];
    if (named !== undefined) {
      return named;
    }
  }

  return null;
}

export function drawZoneShape(
  base: ShapeGraphics,
  shape: ZoneShape | undefined,
  dimensions: ShapeDimensions,
  options: DrawZoneShapeOptions,
): void {
  const { width, height } = dimensions;

  switch (shape) {
    case 'circle': {
      const radius = Math.min(width, height) / 2;
      base.circle(0, 0, radius);
      return;
    }
    case 'ellipse':
      base.ellipse(0, 0, width / 2, height / 2);
      return;
    case 'diamond':
      base.poly([0, -height / 2, width / 2, 0, 0, height / 2, -width / 2, 0]);
      return;
    case 'hexagon':
      base.poly(buildRegularPolygonPoints(6, width, height));
      return;
    case 'triangle':
      base.poly(buildRegularPolygonPoints(3, width, height));
      return;
    case 'octagon':
      base.poly(buildRegularPolygonPoints(8, width, height));
      return;
    case 'line':
      base.roundRect(-width / 2, -height / 2, width, height, options.lineCornerRadius);
      return;
    case 'rectangle':
    default:
      base.roundRect(-width / 2, -height / 2, width, height, options.rectangleCornerRadius);
  }
}

export function buildRegularPolygonPoints(sides: number, width: number, height: number): number[] {
  const points: number[] = [];
  for (let index = 0; index < sides; index += 1) {
    const angle = ((Math.PI * 2) / sides) * index - Math.PI / 2;
    points.push(Math.cos(angle) * (width / 2), Math.sin(angle) * (height / 2));
  }
  return points;
}
