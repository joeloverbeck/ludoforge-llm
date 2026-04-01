import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '../../../src/cnl/index.js';
import type { GameSpecObservabilitySection } from '../../../src/cnl/game-spec-doc.js';

function createTestObservability(): GameSpecObservabilitySection {
  return {
    observers: {
      testObserver: {
        surfaces: {
          victory: {
            currentMargin: 'public',
          },
        },
      },
    },
  };
}

function createDoc() {
  return {
    ...createEmptyGameSpecDoc(),
    metadata: { id: 'considerations-demo', players: { min: 2, max: 2 } },
    observability: createTestObservability(),
    zones: [{ id: 'zone-a', owner: 'none', visibility: 'public', ordering: 'stack', attributes: { population: 1 } }],
    turnStructure: { phases: [{ id: 'main' }] },
    actions: [
      {
        id: 'play',
        actor: 'active',
        executor: 'actor',
        phase: ['main'],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
        tags: ['pass'],
      },
    ],
    terminal: {
      conditions: [{ when: { op: '==', left: 1, right: 0 }, result: { type: 'draw' } }],
      margins: [{ seat: 'p1', value: 0 }, { seat: 'p2', value: 0 }],
      ranking: { order: 'desc' as const },
    },
    dataAssets: [{
      id: 'seats',
      kind: 'seatCatalog' as const,
      payload: { seats: [{ id: 'p1' }, { id: 'p2' }] },
    }],
  };
}

describe('compile considerations', () => {
  it('compiles move, completion, and dual-scope considerations', () => {
    const result = compileGameSpecToGameDef({
      ...createDoc(),
      agents: {
        library: {
          considerations: {
            moveOnly: {
              scopes: ['move'],
              weight: 1,
              value: { boolToNumber: { ref: 'candidate.tag.pass' } },
            },
            completionOnly: {
              scopes: ['completion'],
              weight: 1,
              value: 1,
              when: { eq: [{ ref: 'decision.type' }, 'chooseOne'] },
            },
            both: {
              scopes: ['move', 'completion'],
              weight: 1,
              value: 1,
            },
          },
          tieBreakers: {
            stableMoveKey: { kind: 'stableMoveKey' },
          },
        },
        profiles: {
          baseline: {
            observer: 'testObserver',
            params: {},
            use: {
              considerations: ['moveOnly', 'completionOnly', 'both'],
              pruningRules: [],
              tieBreakers: ['stableMoveKey'],
            },
          },
        },
        bindings: { p1: 'baseline' },
      },
    });

    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
    assert.deepEqual(result.gameDef?.agents?.profiles.baseline?.use.considerations, ['moveOnly', 'completionOnly', 'both']);
    assert.deepEqual(result.gameDef?.agents?.profiles.baseline?.use.scoreTerms, ['moveOnly', 'both']);
    assert.deepEqual(result.gameDef?.agents?.profiles.baseline?.use.completionScoreTerms, ['completionOnly', 'both']);
    assert.deepEqual(result.gameDef?.agents?.library.considerations?.moveOnly?.scopes, ['move']);
    assert.deepEqual(result.gameDef?.agents?.library.considerations?.completionOnly?.scopes, ['completion']);
    assert.deepEqual(result.gameDef?.agents?.library.considerations?.both?.scopes, ['move', 'completion']);
  });

  it('rejects empty and invalid scopes', () => {
    const result = compileGameSpecToGameDef({
      ...createDoc(),
      agents: {
        library: {
          considerations: {
            emptyScopes: {
              scopes: [],
              weight: 1,
              value: 1,
            },
            invalidScope: {
              scopes: ['move', 'bogus'],
              weight: 1,
              value: 1,
            },
          },
          tieBreakers: {
            stableMoveKey: { kind: 'stableMoveKey' },
          },
        },
        profiles: {
          baseline: {
            observer: 'testObserver',
            params: {},
            use: {
              considerations: ['emptyScopes', 'invalidScope'],
              pruningRules: [],
              tieBreakers: ['stableMoveKey'],
            },
          },
        },
        bindings: { p1: 'baseline' },
      },
    });

    assert.equal(
      result.diagnostics.some((diagnostic) => diagnostic.path === 'doc.agents.library.considerations.emptyScopes.scopes'),
      true,
    );
    assert.equal(
      result.diagnostics.some((diagnostic) => diagnostic.path === 'doc.agents.library.considerations.invalidScope.scopes.1'),
      true,
    );
  });

  it('enforces scope-specific refs and warns on unguarded dual-scope refs', () => {
    const result = compileGameSpecToGameDef({
      ...createDoc(),
      agents: {
        library: {
          considerations: {
            moveRefInCompletion: {
              scopes: ['completion'],
              weight: 1,
              value: { boolToNumber: { ref: 'candidate.tag.pass' } },
            },
            completionRefInMove: {
              scopes: ['move'],
              weight: 1,
              value: 1,
              when: { eq: [{ ref: 'decision.type' }, 'chooseOne'] },
            },
            dualWithoutGuard: {
              scopes: ['move', 'completion'],
              weight: 1,
              value: { boolToNumber: { ref: 'candidate.tag.pass' } },
            },
          },
          tieBreakers: {
            stableMoveKey: { kind: 'stableMoveKey' },
          },
        },
        profiles: {
          baseline: {
            observer: 'testObserver',
            params: {},
            use: {
              considerations: ['moveRefInCompletion', 'completionRefInMove', 'dualWithoutGuard'],
              pruningRules: [],
              tieBreakers: ['stableMoveKey'],
            },
          },
        },
        bindings: { p1: 'baseline' },
      },
    });

    assert.equal(
      result.diagnostics.some((diagnostic) =>
        diagnostic.severity === 'error'
        && diagnostic.path === 'doc.agents.library.considerations.moveRefInCompletion',
      ),
      true,
    );
    assert.equal(
      result.diagnostics.some((diagnostic) =>
        diagnostic.severity === 'error'
        && diagnostic.path === 'doc.agents.library.considerations.completionRefInMove',
      ),
      true,
    );
    assert.equal(
      result.diagnostics.some((diagnostic) =>
        diagnostic.severity === 'warning'
        && diagnostic.path === 'doc.agents.library.considerations.dualWithoutGuard',
      ),
      true,
    );
  });

  it('rejects unknown use.considerations refs', () => {
    const result = compileGameSpecToGameDef({
      ...createDoc(),
      agents: {
        library: {
          considerations: {
            moveOnly: {
              scopes: ['move'],
              weight: 1,
              value: 1,
            },
          },
          tieBreakers: {
            stableMoveKey: { kind: 'stableMoveKey' },
          },
        },
        profiles: {
          baseline: {
            observer: 'testObserver',
            params: {},
            use: {
              considerations: ['missing'],
              pruningRules: [],
              tieBreakers: ['stableMoveKey'],
            },
          },
        },
        bindings: { p1: 'baseline' },
      },
    });

    assert.equal(
      result.diagnostics.some((diagnostic) =>
        diagnostic.severity === 'error'
        && diagnostic.path === 'doc.agents.profiles.baseline.use.considerations.0',
      ),
      true,
    );
  });
});
