import { describe, expect, expectTypeOf, it } from 'vitest';
import { asPlayerId } from '@ludoforge/engine/runtime';
import type { PlayerId } from '@ludoforge/engine/runtime';
import type { Container } from 'pixi.js';

import type {
  AdjacencyRenderer,
  FactionColorProvider,
  TokenRenderer,
  ZoneRenderer,
} from '../../../src/canvas/renderers/renderer-types';
import type { Position } from '../../../src/canvas/geometry';
import type {
  RenderAdjacency,
  RenderToken,
  RenderZone,
} from '../../../src/model/render-model';

describe('renderer-types', () => {
  it('defines Position as a readonly numeric pair', () => {
    expectTypeOf<Position>().toEqualTypeOf<{
      readonly x: number;
      readonly y: number;
    }>();
  });

  it('accepts a mock ZoneRenderer contract', () => {
    const containerMap = new Map<string, Container>();

    const renderer: ZoneRenderer = {
      update: (
        _zones: readonly RenderZone[],
        _positions: ReadonlyMap<string, Position>,
      ) => {},
      getContainerMap: () => containerMap,
      destroy: () => {},
    };

    expect(renderer.getContainerMap()).toBe(containerMap);
  });

  it('accepts a mock TokenRenderer contract', () => {
    const containerMap = new Map<string, Container>();

    const renderer: TokenRenderer = {
      update: (_tokens: readonly RenderToken[], _zoneContainers: ReadonlyMap<string, Container>) => {},
      getContainerMap: () => containerMap,
      destroy: () => {},
    };

    expect(renderer.getContainerMap()).toBe(containerMap);
  });

  it('accepts a mock AdjacencyRenderer contract', () => {
    const renderer: AdjacencyRenderer = {
      update: (_adjacencies: readonly RenderAdjacency[], _positions: ReadonlyMap<string, Position>) => {},
      destroy: () => {},
    };

    expect(renderer.destroy).toBeTypeOf('function');
  });

  it('accepts a mock FactionColorProvider contract', () => {
    const provider: FactionColorProvider = {
      getTokenTypeVisual: (_tokenTypeId: string) => ({
        shape: 'circle',
        color: null,
        size: 28,
        symbol: null,
        backSymbol: null,
      }),
      getColor: (_factionId: string | null, _playerId: PlayerId) => '#ffffff',
    };

    expectTypeOf<FactionColorProvider['getTokenTypeVisual']>().parameters.toEqualTypeOf<[string]>();
    expectTypeOf<FactionColorProvider['getColor']>().parameters.toEqualTypeOf<[string | null, PlayerId]>();
    expect(provider.getTokenTypeVisual('token:a')).toEqual({
      shape: 'circle',
      color: null,
      size: 28,
      symbol: null,
      backSymbol: null,
    });
    expect(provider.getColor(null, asPlayerId(0))).toBe('#ffffff');
  });
});
