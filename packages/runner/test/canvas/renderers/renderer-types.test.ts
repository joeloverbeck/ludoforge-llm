import { describe, expect, expectTypeOf, it } from 'vitest';
import { asPlayerId } from '@ludoforge/engine/runtime';
import type { PlayerId } from '@ludoforge/engine/runtime';
import type { Container } from 'pixi.js';

import type {
  AdjacencyRenderer,
  TokenRenderer,
  TokenRenderStyleProvider,
  ZoneRenderer,
} from '../../../src/canvas/renderers/renderer-types';
import type { Position } from '../../../src/canvas/geometry';
import type {
  RenderAdjacency,
  RenderZone,
} from '../../../src/model/render-model';
import type { PresentationTokenNode } from '../../../src/presentation/token-presentation';

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
      update: (
        _tokens: readonly PresentationTokenNode[],
        _zoneContainers: ReadonlyMap<string, Container>,
      ) => {},
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

  it('accepts a mock TokenRenderStyleProvider contract', () => {
    const provider: TokenRenderStyleProvider = {
      getTokenTypeVisual: (_tokenTypeId: string) => ({
        shape: 'circle',
        color: null,
        size: 28,
        symbol: null,
        backSymbol: null,
      }),
      getTokenTypePresentation: (_tokenTypeId: string) => ({
        lane: null,
        scale: 1,
      }),
      resolveZoneTokenLayout: (_zoneId: string, _category: string | null) => ({
        mode: 'grid',
        columns: 6,
        spacingX: 36,
        spacingY: 36,
      }),
      getStackBadgeStyle: () => ({
        fontFamily: 'monospace',
        fontSize: 10,
        fill: '#f8fafc',
        stroke: '#000000',
        strokeWidth: 0,
        anchorX: 1,
        anchorY: 0,
        offsetX: -2,
        offsetY: 2,
      }),
      getZoneLayoutRole: (_zoneId: string) => null,
      isSharedZone: (_zoneId: string) => false,
      resolveTokenSymbols: (_tokenTypeId, _tokenProperties) => ({
        symbol: null,
        backSymbol: null,
      }),
      getCardTemplateForTokenType: (_tokenTypeId: string) => null,
      getColor: (_factionId: string | null, _playerId: PlayerId) => '#ffffff',
    };

    expectTypeOf<TokenRenderStyleProvider['getTokenTypeVisual']>().parameters.toEqualTypeOf<[string]>();
    expectTypeOf<TokenRenderStyleProvider['getColor']>().parameters.toEqualTypeOf<[string | null, PlayerId]>();
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
