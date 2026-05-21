// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '../../src/cnl/index.js';
import type { GameSpecAgentLibrary } from '../../src/cnl/game-spec-doc.js';

function createCompileReadyDoc(library: GameSpecAgentLibrary) {
  return {
    ...createEmptyGameSpecDoc(),
    metadata: { id: 'relationship-demo', players: { min: 2, max: 2 } },
    dataAssets: [{
      id: 'seats',
      kind: 'seatCatalog' as const,
      payload: { seats: [{ id: 'alpha' }, { id: 'beta' }] },
    }],
    observability: { observers: { testObserver: { surfaces: { victory: { currentMargin: 'public' as const } } } } },
    zones: [{ id: 'board', owner: 'none', visibility: 'public', ordering: 'set', attributes: {} }],
    turnStructure: { phases: [{ id: 'main' }] },
    actions: [{
      id: 'act',
      actor: 'active',
      executor: 'actor',
      phase: ['main'],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    }],
    terminal: {
      conditions: [{ when: { op: '==', left: 1, right: 0 }, result: { type: 'draw' } }],
      margins: [
        { seat: 'alpha', value: 0 },
        { seat: 'beta', value: 0 },
      ],
      ranking: { order: 'desc' as const },
    },
    agents: {
      library,
      profiles: {},
    },
  };
}

function compileWithLibrary(library: GameSpecAgentLibrary) {
  return compileGameSpecToGameDef(createCompileReadyDoc(library));
}

function hasErrors(diagnostics: readonly { readonly severity: string }[]): boolean {
  return diagnostics.some((d) => d.severity === 'error');
}

describe('relationship library compilation', () => {
  it('compiles relationship roles with condition-gated seat and standing-role bindings deterministically', () => {
    const library: GameSpecAgentLibrary = {
      relationships: {
        ally: { role: 'nominalAlly', seat: 'beta', condition: 'allyReady', priority: 1, gainValue: 3 },
        leader: { role: 'leader', standingRole: 'currentLeader', priority: 2 },
      },
      strategicConditions: {
        allyReady: { target: { gte: [{ ref: 'victory.currentMargin.beta' }, 0] } },
      },
    };

    const first = compileWithLibrary(library);
    const second = compileWithLibrary(library);

    assert.equal(hasErrors(first.diagnostics), false, `Unexpected errors: ${JSON.stringify(first.diagnostics)}`);
    assert.equal(hasErrors(second.diagnostics), false, `Unexpected errors: ${JSON.stringify(second.diagnostics)}`);
    assert.notEqual(first.gameDef, null);
    assert.notEqual(second.gameDef, null);
    assert.deepEqual(first.gameDef!.agents!.library.relationships, second.gameDef!.agents!.library.relationships);
    assert.deepEqual(first.gameDef!.agents!.compiled.relationships, second.gameDef!.agents!.compiled.relationships);
    assert.deepEqual(first.gameDef!.agents!.compiled.relationships?.ally, {
      role: 'nominalAlly',
      seat: 'beta',
      condition: 'allyReady',
      priority: 1,
      gainValue: {
        kind: 'literal',
        value: 3,
      },
    });
    assert.deepEqual(first.gameDef!.agents!.library.relationships?.ally, {
      role: 'nominalAlly',
      seat: 'beta',
      condition: 'allyReady',
      priority: 1,
      hasGainValue: true,
    });
  });

  it('rejects relationship bindings to unknown seats', () => {
    const result = compileWithLibrary({
      relationships: {
        ally: { role: 'nominalAlly', seat: 'missingSeat' },
      },
      strategicConditions: {},
    });

    assert.equal(hasErrors(result.diagnostics), true, 'Expected unknown seat binding to fail');
    assert.ok(
      result.diagnostics.some((diag) => diag.path.includes('relationships.ally.seat')),
      `Expected relationship seat diagnostic: ${JSON.stringify(result.diagnostics)}`,
    );
  });

  it('rejects unknown relationship roles and standing-role selectors', () => {
    const result = compileWithLibrary({
      relationships: {
        badRole: { role: 'friendlyFaction', seat: 'beta' },
        badStanding: { role: 'leader', standingRole: 'frontRunner' },
      },
      strategicConditions: {},
    });

    assert.equal(hasErrors(result.diagnostics), true, 'Expected invalid role metadata to fail');
    assert.ok(
      result.diagnostics.some((diag) => diag.path.includes('relationships.badRole.role')),
      `Expected role diagnostic: ${JSON.stringify(result.diagnostics)}`,
    );
    assert.ok(
      result.diagnostics.some((diag) => diag.path.includes('relationships.badStanding.standingRole')),
      `Expected standing-role diagnostic: ${JSON.stringify(result.diagnostics)}`,
    );
  });
});
