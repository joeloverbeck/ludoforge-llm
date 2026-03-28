import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameDef, GameState } from '@ludoforge/engine/runtime';

const { computeAllVictoryStandings } = vi.hoisted(() => ({
  computeAllVictoryStandings: vi.fn(),
}));

vi.mock('@ludoforge/engine/runtime', () => ({
  computeAllVictoryStandings,
}));

import { deriveVictoryStandings } from '../../src/model/derive-victory-standings.js';

describe('deriveVictoryStandings', () => {
  beforeEach(() => {
    computeAllVictoryStandings.mockReset();
  });

  it('returns null when the game definition does not define victory standings', () => {
    const result = deriveVictoryStandings({} as GameDef, {} as GameState);

    expect(result).toBeNull();
    expect(computeAllVictoryStandings).not.toHaveBeenCalled();
  });

  it('preserves full component breakdowns instead of flattening them to aggregates', () => {
    computeAllVictoryStandings.mockReturnValue([
      {
        seat: 'vc',
        score: 18,
        threshold: 25,
        components: {
          breakdowns: [
            {
              componentId: 'markerTotal',
              aggregate: 11,
              spaces: [
                {
                  spaceId: 'saigon:none',
                  contribution: 6,
                  factors: { population: 3, multiplier: 2 },
                },
                {
                  spaceId: 'hue:none',
                  contribution: 5,
                  factors: { population: 5, multiplier: 1 },
                },
              ],
            },
            {
              componentId: 'mapBases',
              aggregate: 7,
              spaces: [
                {
                  spaceId: 'tay-ninh:none',
                  contribution: 1,
                  factors: { count: 1 },
                },
              ],
            },
          ],
        },
      },
    ]);

    const result = deriveVictoryStandings(
      { victoryStandings: { entries: [] } } as unknown as GameDef,
      {} as GameState,
    );

    expect(result).toEqual([
      {
        seat: 'vc',
        score: 18,
        threshold: 25,
        rank: 1,
        components: [
          {
            componentId: 'markerTotal',
            aggregate: 11,
            spaces: [
              {
                spaceId: 'saigon:none',
                contribution: 6,
                factors: { population: 3, multiplier: 2 },
              },
              {
                spaceId: 'hue:none',
                contribution: 5,
                factors: { population: 5, multiplier: 1 },
              },
            ],
          },
          {
            componentId: 'mapBases',
            aggregate: 7,
            spaces: [
              {
                spaceId: 'tay-ninh:none',
                contribution: 1,
                factors: { count: 1 },
              },
            ],
          },
        ],
      },
    ]);
  });
});
