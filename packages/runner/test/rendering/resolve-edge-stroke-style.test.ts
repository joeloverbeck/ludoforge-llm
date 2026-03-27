import { describe, expect, it } from 'vitest';

import {
  DEFAULT_EDGE_STYLE,
  HIGHLIGHTED_EDGE_STYLE,
  type ResolvedEdgeVisual,
} from '../../src/config/visual-config-provider.js';
import { resolveEdgeStrokeStyle } from '../../src/rendering/resolve-edge-stroke-style.js';

describe('resolveEdgeStrokeStyle', () => {
  it('converts a resolved visual into the numeric stroke shape Pixi expects', () => {
    expect(resolveEdgeStrokeStyle(
      { color: '#ff0000', width: 5, alpha: 0.8 },
      DEFAULT_EDGE_STYLE,
    )).toEqual({ color: 0xff0000, width: 5, alpha: 0.8 });
  });

  it('falls back to the provided fallback color when the resolved color is missing or invalid', () => {
    const fallback: ResolvedEdgeVisual = { color: '#123456', width: 3.5, alpha: 0.85 };

    expect(resolveEdgeStrokeStyle(
      { color: null, width: 4, alpha: 0.6 },
      fallback,
    )).toEqual({ color: 0x123456, width: 4, alpha: 0.6 });

    expect(resolveEdgeStrokeStyle(
      { color: 'invalid', width: 4, alpha: 0.6 },
      fallback,
    )).toEqual({ color: 0x123456, width: 4, alpha: 0.6 });
  });

  it('supports named fallback colors for highlighted edge styles', () => {
    expect(resolveEdgeStrokeStyle(
      { color: 'invalid', width: 8, alpha: 0.9 },
      { ...HIGHLIGHTED_EDGE_STYLE, color: 'white' },
    )).toEqual({ color: 0xffffff, width: 8, alpha: 0.9 });
  });
});
