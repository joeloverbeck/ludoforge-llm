import { describe, expect, it } from 'vitest';
import { asPlayerId, type PlayerId } from '@ludoforge/engine/runtime';

import { VisualConfigProvider } from '../../src/config/visual-config-provider.js';
import { projectRenderModel } from '../../src/model/project-render-model.js';
import type { RunnerProjectionBundle } from '../../src/model/runner-frame.js';

function createBundle(): RunnerProjectionBundle {
  return {
    frame: {
      zones: [],
      adjacencies: [],
      tokens: [],
      activeEffects: [],
      players: [],
      activePlayerID: asPlayerId(0),
      turnOrder: [] as PlayerId[],
      turnOrderType: 'roundRobin',
      simultaneousSubmitted: [] as PlayerId[],
      interruptStack: [],
      isInInterrupt: false,
      phaseName: 'main',
      eventDecks: [],
      actionGroups: [],
      choiceBreadcrumb: [],
      choiceContext: null,
      choiceUi: { kind: 'none' },
      moveEnumerationWarnings: [],
      runtimeEligible: [],
      victoryStandings: [
        {
          seat: 'vc',
          score: 12,
          threshold: 25,
          rank: 1,
          components: [
            {
              aggregate: 11,
              spaces: [
                {
                  spaceId: 'saigon:none',
                  contribution: 6,
                  factors: { population: 3, multiplier: 2 },
                },
                {
                  spaceId: 'central-highlands:none',
                  contribution: 5,
                  factors: { population: 5, multiplier: 1 },
                },
              ],
            },
          ],
        },
      ],
      terminal: null,
    },
    source: {
      globalVars: [],
      playerVars: new Map(),
    },
  };
}

describe('projectRenderModel victory standings', () => {
  it('resolves zone labels for breakdown spaces and falls back to formatted ids', () => {
    const model = projectRenderModel(
      createBundle(),
      new VisualConfigProvider({
        version: 1,
        zones: {
          overrides: {
            'saigon:none': { label: 'Saigon' },
          },
        },
      }),
    );

    expect(model.victoryStandings).toEqual([
      {
        seat: 'vc',
        score: 12,
        threshold: 25,
        rank: 1,
        components: [
          {
            aggregate: 11,
            spaces: [
              {
                spaceId: 'saigon:none',
                displayName: 'Saigon',
                contribution: 6,
                factors: { population: 3, multiplier: 2 },
              },
              {
                spaceId: 'central-highlands:none',
                displayName: 'Central Highlands None',
                contribution: 5,
                factors: { population: 5, multiplier: 1 },
              },
            ],
          },
        ],
      },
    ]);
  });
});
