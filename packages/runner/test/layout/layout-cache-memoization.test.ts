import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameDef, ZoneDef } from '@ludoforge/engine/runtime';

import { VisualConfigProvider } from '../../src/config/visual-config-provider.js';

const { hashStableValueMock } = vi.hoisted(() => ({
  hashStableValueMock: vi.fn(() => 'mocked-def-hash'),
}));

vi.mock('../../src/utils/stable-hash.js', () => ({
  hashStableValue: hashStableValueMock,
}));

import { clearLayoutCache, getOrComputeLayout } from '../../src/layout/layout-cache.js';

const NULL_PROVIDER = new VisualConfigProvider(null);

describe('layout-cache memoization', () => {
  beforeEach(() => {
    clearLayoutCache();
    hashStableValueMock.mockClear();
  });

  it('memoizes GameDef hash lookups for repeated requests against the same object', () => {
    const def = makeDef('memoized-hash');

    const first = getOrComputeLayout(def, NULL_PROVIDER);
    const second = getOrComputeLayout(def, NULL_PROVIDER);

    expect(second).toBe(first);
    expect(hashStableValueMock).toHaveBeenCalledTimes(1);
  });
});

function makeDef(id: string): GameDef {
  return {
    metadata: {
      id,
      layoutMode: 'table',
    },
    zones: [zone('board-a'), zone('board-b')],
  } as unknown as GameDef;
}

function zone(id: string): ZoneDef {
  return {
    id,
    owner: 'none',
    visibility: 'public',
    ordering: 'set',
  } as ZoneDef;
}
