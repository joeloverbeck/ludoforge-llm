import { asPlayerId } from '@ludoforge/engine/runtime';
import { describe, expect, it } from 'vitest';

import {
  createCanvasEqualityComparators,
  adjacenciesVisuallyEqual,
  tokensVisuallyEqual,
  zonesVisuallyEqual,
} from '../../src/canvas/canvas-equality';
import type {
  RenderAdjacency,
  RenderToken,
  RenderZone,
} from '../../src/model/render-model';

function makeZone(overrides: Partial<RenderZone> = {}): RenderZone {
  return {
    id: 'zone:a',
    displayName: 'Zone A',
    ordering: 'set',
    tokenIDs: ['token:1', 'token:2'],
    hiddenTokenCount: 0,
    markers: [
      {
        id: 'control',
        displayName: 'Control',
        state: 'blue',
        possibleStates: ['blue', 'red'],
      },
    ],
    visibility: 'public',
    isSelectable: false,
    isHighlighted: false,
    ownerID: null,
    category: null,
    attributes: {},
    visual: null,
    metadata: {},
    ...overrides,
  };
}

function makeToken(overrides: Partial<RenderToken> = {}): RenderToken {
  return {
    id: 'token:1',
    type: 'unit',
    zoneID: 'zone:a',
    ownerID: asPlayerId(0),
    factionId: 'faction:a',
    faceUp: true,
    properties: { stamina: 2 },
    isSelectable: false,
    isSelected: false,
    ...overrides,
  };
}

function makeAdjacency(overrides: Partial<RenderAdjacency> = {}): RenderAdjacency {
  return {
    from: 'zone:a',
    to: 'zone:b',
    isHighlighted: false,
    ...overrides,
  };
}

describe('zonesVisuallyEqual', () => {
  it('returns true for same array reference', () => {
    const zones = [makeZone()];

    expect(zonesVisuallyEqual(zones, zones)).toBe(true);
  });

  it('returns true for two empty arrays', () => {
    expect(zonesVisuallyEqual([], [])).toBe(true);
  });

  it('returns false when lengths differ', () => {
    expect(zonesVisuallyEqual([makeZone()], [])).toBe(false);
  });

  it('returns false when id changes', () => {
    expect(zonesVisuallyEqual([makeZone()], [makeZone({ id: 'zone:b' })])).toBe(false);
  });

  it('returns false when isSelectable changes', () => {
    expect(zonesVisuallyEqual([makeZone()], [makeZone({ isSelectable: true })])).toBe(false);
  });

  it('returns false when isHighlighted changes', () => {
    expect(zonesVisuallyEqual([makeZone()], [makeZone({ isHighlighted: true })])).toBe(false);
  });

  it('returns false when hiddenTokenCount changes', () => {
    expect(zonesVisuallyEqual([makeZone()], [makeZone({ hiddenTokenCount: 1 })])).toBe(false);
  });

  it('returns false when tokenIDs change', () => {
    expect(
      zonesVisuallyEqual([makeZone()], [makeZone({ tokenIDs: ['token:2', 'token:1'] })]),
    ).toBe(false);
  });

  it('returns false when marker state changes', () => {
    expect(
      zonesVisuallyEqual(
        [makeZone()],
        [makeZone({ markers: [{ id: 'control', displayName: 'Control', state: 'red', possibleStates: ['blue', 'red'] }] })],
      ),
    ).toBe(false);
  });

  it('returns false when marker displayName changes', () => {
    expect(
      zonesVisuallyEqual(
        [makeZone()],
        [makeZone({ markers: [{ id: 'control', displayName: 'Influence', state: 'blue', possibleStates: ['blue', 'red'] }] })],
      ),
    ).toBe(false);
  });

  it('returns false when displayName changes', () => {
    expect(zonesVisuallyEqual([makeZone()], [makeZone({ displayName: 'Zone Prime' })])).toBe(false);
  });

  it('returns false when visibility changes', () => {
    expect(zonesVisuallyEqual([makeZone()], [makeZone({ visibility: 'owner' })])).toBe(false);
  });

  it('returns false when ownerID changes', () => {
    expect(zonesVisuallyEqual([makeZone()], [makeZone({ ownerID: asPlayerId(1) })])).toBe(false);
  });

  it('returns false when category changes', () => {
    expect(zonesVisuallyEqual([makeZone()], [makeZone({ category: 'city' })])).toBe(false);
  });

  it('returns false when visual hints change', () => {
    expect(
      zonesVisuallyEqual(
        [makeZone()],
        [makeZone({ visual: { shape: 'hexagon', color: '#345678' } })],
      ),
    ).toBe(false);
  });

  it('returns true when all compared fields are equal', () => {
    expect(
      zonesVisuallyEqual(
        [makeZone()],
        [
          makeZone({
            metadata: { debug: true },
          }),
        ],
      ),
    ).toBe(true);
  });

  it('ignores metadata-only changes', () => {
    const prev = [makeZone({ metadata: { source: 'a' } })];
    const next = [makeZone({ metadata: { source: 'b' } })];

    expect(zonesVisuallyEqual(prev, next)).toBe(true);
  });
});

describe('tokensVisuallyEqual', () => {
  it('returns true for same array reference', () => {
    const tokens = [makeToken()];

    expect(tokensVisuallyEqual(tokens, tokens)).toBe(true);
  });

  it('returns false when type changes', () => {
    expect(tokensVisuallyEqual([makeToken()], [makeToken({ type: 'leader' })])).toBe(false);
  });

  it('returns false when zoneID changes', () => {
    expect(tokensVisuallyEqual([makeToken()], [makeToken({ zoneID: 'zone:b' })])).toBe(false);
  });

  it('returns false when ownerID changes', () => {
    expect(tokensVisuallyEqual([makeToken()], [makeToken({ ownerID: asPlayerId(1) })])).toBe(false);
  });

  it('returns false when factionId changes', () => {
    expect(tokensVisuallyEqual([makeToken()], [makeToken({ factionId: 'faction:b' })])).toBe(false);
  });

  it('returns false when faceUp changes', () => {
    expect(tokensVisuallyEqual([makeToken()], [makeToken({ faceUp: false })])).toBe(false);
  });

  it('returns false when isSelectable changes', () => {
    expect(tokensVisuallyEqual([makeToken()], [makeToken({ isSelectable: true })])).toBe(false);
  });

  it('returns false when isSelected changes', () => {
    expect(tokensVisuallyEqual([makeToken()], [makeToken({ isSelected: true })])).toBe(false);
  });

  it('returns true when properties change only', () => {
    expect(
      tokensVisuallyEqual(
        [makeToken({ properties: { stamina: 2 } })],
        [makeToken({ properties: { stamina: 999, title: 'upgraded' } })],
      ),
    ).toBe(true);
  });
});

describe('adjacenciesVisuallyEqual', () => {
  it('returns true for same array reference', () => {
    const adjacencies = [makeAdjacency()];

    expect(adjacenciesVisuallyEqual(adjacencies, adjacencies)).toBe(true);
  });

  it('returns false when a pair is added', () => {
    expect(adjacenciesVisuallyEqual([makeAdjacency()], [makeAdjacency(), makeAdjacency({ to: 'zone:c' })])).toBe(false);
  });

  it('returns false when from/to values change', () => {
    expect(adjacenciesVisuallyEqual([makeAdjacency()], [makeAdjacency({ from: 'zone:z' })])).toBe(false);
  });

  it('returns false when highlight state changes', () => {
    expect(adjacenciesVisuallyEqual([makeAdjacency()], [makeAdjacency({ isHighlighted: true })])).toBe(false);
  });

  it('returns false when pair ordering changes', () => {
    const prev = [
      makeAdjacency({ from: 'zone:a', to: 'zone:b' }),
      makeAdjacency({ from: 'zone:c', to: 'zone:d' }),
    ];
    const next = [
      makeAdjacency({ from: 'zone:c', to: 'zone:d' }),
      makeAdjacency({ from: 'zone:a', to: 'zone:b' }),
    ];

    expect(adjacenciesVisuallyEqual(prev, next)).toBe(false);
  });

  it('returns true for identical adjacency lists', () => {
    const prev = [makeAdjacency(), makeAdjacency({ from: 'zone:b', to: 'zone:c' })];
    const next = [makeAdjacency(), makeAdjacency({ from: 'zone:b', to: 'zone:c' })];

    expect(adjacenciesVisuallyEqual(prev, next)).toBe(true);
  });
});

describe('createCanvasEqualityComparators', () => {
  it('uses default behavior when no overrides are provided', () => {
    const comparators = createCanvasEqualityComparators();

    expect(
      comparators.zonesVisuallyEqual(
        [makeZone({ metadata: { a: 1 } })],
        [makeZone({ metadata: { a: 2 } })],
      ),
    ).toBe(true);
    expect(comparators.tokensVisuallyEqual([makeToken()], [makeToken({ type: 'leader' })])).toBe(false);
    expect(comparators.adjacenciesVisuallyEqual([makeAdjacency()], [makeAdjacency({ to: 'zone:c' })])).toBe(false);
  });

  it('supports custom zone comparator injection', () => {
    const comparators = createCanvasEqualityComparators({
      zoneComparator: (prev, next) => prev.id === next.id,
    });

    expect(
      comparators.zonesVisuallyEqual(
        [makeZone({ category: 'city' })],
        [makeZone({ category: 'fort' })],
      ),
    ).toBe(true);
    expect(comparators.zonesVisuallyEqual([makeZone({ id: 'zone:a' })], [makeZone({ id: 'zone:b' })])).toBe(false);
  });

  it('supports custom token and adjacency comparator injection', () => {
    const comparators = createCanvasEqualityComparators({
      tokenComparator: (prev, next) => prev.id === next.id && prev.zoneID === next.zoneID,
      adjacencyComparator: (prev, next) => prev.from === next.from,
    });

    expect(
      comparators.tokensVisuallyEqual(
        [makeToken({ faceUp: true })],
        [makeToken({ faceUp: false })],
      ),
    ).toBe(true);
    expect(
      comparators.adjacenciesVisuallyEqual(
        [makeAdjacency({ from: 'zone:a', to: 'zone:b' })],
        [makeAdjacency({ from: 'zone:a', to: 'zone:z' })],
      ),
    ).toBe(true);
  });
});
