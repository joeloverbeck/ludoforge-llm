import type {
  EdgeStrokeStyle,
  ResolvedEdgeVisual,
} from '../config/visual-config-provider.js';
import { parseHexColor } from './color-utils.js';

/**
 * Resolves edge visuals into the numeric stroke shape Pixi expects.
 * Callers remain responsible for path construction and stroke timing.
 */
export function resolveEdgeStrokeStyle(
  resolved: ResolvedEdgeVisual,
  fallback: ResolvedEdgeVisual,
): EdgeStrokeStyle {
  const fallbackColor = parseHexColor(fallback.color ?? undefined, {
    allowNamedColors: true,
  });
  const parsedColor = parseHexColor(resolved.color ?? undefined, {
    allowNamedColors: true,
  });

  return {
    color: parsedColor ?? fallbackColor ?? 0xffffff,
    width: resolved.width,
    alpha: resolved.alpha,
  };
}
