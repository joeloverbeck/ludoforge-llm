// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CNL_COMPILER_DIAGNOSTIC_CODES } from '../../../src/cnl/compiler-diagnostic-codes.js';
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
  it('compiles move and microturn considerations', () => {
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
            microturnOnly: {
              scopes: ['microturn'],
              weight: 1,
              value: 1,
              when: { eq: [{ ref: 'microturn.kind' }, 'chooseOne'] },
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
              considerations: ['moveOnly', 'microturnOnly'],
              guardrails: [],
              tieBreakers: ['stableMoveKey'],
            },
          },
        },
        bindings: { p1: 'baseline' },
      },
    });

    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
    assert.deepEqual(result.gameDef?.agents?.profiles.baseline?.use.considerations, ['moveOnly', 'microturnOnly']);
    assert.deepEqual(result.gameDef?.agents?.library.considerations?.moveOnly?.scopes, ['move']);
    assert.deepEqual(result.gameDef?.agents?.library.considerations?.microturnOnly?.scopes, ['microturn']);
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
              guardrails: [],
              tieBreakers: ['stableMoveKey'],
            },
          },
        },
        bindings: { p1: 'baseline' },
      },
    });

    assert.equal(
      result.diagnostics.some((diagnostic) =>
        diagnostic.code === CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_CONSIDERATION_SCOPE_EMPTY
        && diagnostic.path === 'doc.agents.library.considerations.emptyScopes.scopes'
      ),
      true,
    );
    assert.equal(
      result.diagnostics.some((diagnostic) =>
        diagnostic.code === CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_CONSIDERATION_SCOPE_INVALID
        && diagnostic.path === 'doc.agents.library.considerations.invalidScope.scopes.1'
      ),
      true,
    );
  });

  it('enforces scope-specific refs and rejects mixed scopes', () => {
    const result = compileGameSpecToGameDef({
      ...createDoc(),
      agents: {
        library: {
          considerations: {
            moveRefInMicroturn: {
              scopes: ['microturn'],
              weight: 1,
              value: { boolToNumber: { ref: 'candidate.tag.pass' } },
            },
            microturnRefInMove: {
              scopes: ['move'],
              weight: 1,
              value: 1,
              when: { eq: [{ ref: 'microturn.kind' }, 'chooseOne'] },
            },
            mixedScopes: {
              scopes: ['move', 'microturn'],
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
              considerations: ['moveRefInMicroturn', 'microturnRefInMove', 'mixedScopes'],
              guardrails: [],
              tieBreakers: ['stableMoveKey'],
            },
          },
        },
        bindings: { p1: 'baseline' },
      },
    });

    assert.equal(
      result.diagnostics.some((diagnostic) =>
        diagnostic.code === CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_CONSIDERATION_SCOPE_VIOLATION
        && diagnostic.severity === 'error'
        && diagnostic.path === 'doc.agents.library.considerations.moveRefInMicroturn',
      ),
      true,
    );
    assert.equal(
      result.diagnostics.some((diagnostic) =>
        diagnostic.code === CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_CONSIDERATION_SCOPE_VIOLATION
        && diagnostic.severity === 'error'
        && diagnostic.path === 'doc.agents.library.considerations.microturnRefInMove',
      ),
      true,
    );
    assert.equal(
      result.diagnostics.some((diagnostic) =>
        diagnostic.code === CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_CONSIDERATION_SCOPE_WARNING
        && diagnostic.severity === 'error'
        && diagnostic.path === 'doc.agents.library.considerations.mixedScopes',
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
              guardrails: [],
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
