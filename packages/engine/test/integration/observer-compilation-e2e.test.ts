// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '../../src/cnl/index.js';
import type { GameSpecObservabilitySection } from '../../src/cnl/game-spec-doc.js';
import { assertNoDiagnostics, assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { GameDefSchema } from '../../src/kernel/schemas-core.js';

/** Minimal valid spec skeleton used by all tests in this file. */
function minimalSpec() {
  return {
    ...createEmptyGameSpecDoc(),
    metadata: { id: 'observer-e2e', players: { min: 2, max: 2 } },
    globalVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 99 }],
    perPlayerVars: [{ name: 'health', type: 'int', init: 10, min: 0, max: 99 }],
    zones: [{ id: 'deck', owner: 'none', visibility: 'hidden', ordering: 'stack' }],
    turnStructure: { phases: [{ id: 'main' }] },
    actions: [{ id: 'pass', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] }],
    terminal: { conditions: [{ when: { op: '==', left: 1, right: 1 }, result: { type: 'draw' } }] },
  };
}

function obs(section: GameSpecObservabilitySection): GameSpecObservabilitySection {
  return section;
}

describe('observer compilation end-to-end', () => {
  it('spec with observability section produces GameDef with observers field', () => {
    const result = compileGameSpecToGameDef({
      ...minimalSpec(),
      observability: obs({
        observers: {
          player: {
            description: 'Standard player view',
            surfaces: {
              globalVars: 'public',
              activeCardIdentity: 'public',
            },
          },
        },
      }),
    });
    assertNoErrors(result);
    assert.ok(result.gameDef);
    assert.ok(result.gameDef.observers, 'GameDef should have observers field');
    assert.equal(result.gameDef.observers.schemaVersion, 1);
    assert.equal(result.gameDef.observers.defaultObserverName, 'default');

    // User-defined + built-ins
    assert.ok(result.gameDef.observers.observers['player']);
    assert.ok(result.gameDef.observers.observers['omniscient']);
    assert.ok(result.gameDef.observers.observers['default']);

    // User profile surfaces
    const player = result.gameDef.observers.observers['player']!;
    assert.equal(player.surfaces.globalVars['score']!.current, 'public');
    assert.equal(player.surfaces.activeCardIdentity.current, 'public');
  });

  it('observer compilation wires known global marker ids through the full pipeline', () => {
    const result = compileGameSpecToGameDef({
      ...minimalSpec(),
      globalMarkerLattices: [
        {
          id: 'cap_boobyTraps',
          states: ['inactive', 'shaded', 'unshaded'],
          defaultState: 'inactive',
        },
      ],
      observability: obs({
        observers: {
          player: {
            surfaces: {
              globalMarkers: {
                cap_boobyTraps: 'hidden',
              },
            },
          },
        },
      }),
    });
    assertNoErrors(result);
    assert.ok(result.gameDef?.observers);

    const player = result.gameDef.observers.observers['player']!;
    assert.equal(player.surfaces.globalMarkers['cap_boobyTraps']!.current, 'hidden');
    assert.equal(result.gameDef.observers.observers['default']!.surfaces.globalMarkers['cap_boobyTraps']!.current, 'public');
    assert.equal(result.gameDef.observers.observers['omniscient']!.surfaces.globalMarkers['cap_boobyTraps']!.current, 'public');
  });

  it('spec without observability section produces GameDef without observers field', () => {
    const result = compileGameSpecToGameDef(minimalSpec());
    assertNoErrors(result);
    assert.ok(result.gameDef);
    assert.equal(result.gameDef.observers, undefined, 'GameDef should NOT have observers field');
  });

  it('GameDef with observers validates against Zod schema', () => {
    const result = compileGameSpecToGameDef({
      ...minimalSpec(),
      observability: obs({ observers: {} }),
    });
    assertNoErrors(result);
    assert.ok(result.gameDef);
    assert.ok(result.gameDef.observers);

    // Zod parse should not throw
    const parsed = GameDefSchema.parse(result.gameDef);
    assert.ok(parsed.observers);
  });

  it('GameDef without observers validates against Zod schema', () => {
    const result = compileGameSpecToGameDef(minimalSpec());
    assertNoErrors(result);
    assert.ok(result.gameDef);

    // Zod parse should not throw
    const parsed = GameDefSchema.parse(result.gameDef);
    assert.equal(parsed.observers, undefined);
  });

  it('observers are compiled before agents (pipeline ordering)', () => {
    const result = compileGameSpecToGameDef({
      ...minimalSpec(),
      observability: obs({ observers: {} }),
      agents: {
        profiles: {
          bot: {
            params: {},
            use: {},
          },
        },
      },
    });
    assertNoErrors(result);
    assert.ok(result.gameDef);
    assert.ok(result.gameDef.observers, 'observers should be present');
    assert.ok(result.gameDef.agents, 'agents should be present');
  });

  it('existing specs compile unchanged (no observability)', () => {
    const result = compileGameSpecToGameDef(minimalSpec());
    assertNoDiagnostics(result);
    assert.ok(result.gameDef);
    assert.equal(result.gameDef.observers, undefined);
  });

  it('observer with extends compiles through full pipeline', () => {
    const result = compileGameSpecToGameDef({
      ...minimalSpec(),
      observability: obs({
        observers: {
          base: {
            surfaces: { globalVars: 'public', activeCardIdentity: 'public' },
          },
          spectator: {
            extends: 'base',
            surfaces: { perPlayerVars: 'hidden' },
          },
        },
      }),
    });
    assertNoErrors(result);
    assert.ok(result.gameDef?.observers);

    const spectator = result.gameDef.observers.observers['spectator']!;
    // Inherited from base
    assert.equal(spectator.surfaces.globalVars['score']!.current, 'public');
    assert.equal(spectator.surfaces.activeCardIdentity.current, 'public');
    // Overridden by spectator
    assert.equal(spectator.surfaces.perPlayerVars['health']!.current, 'hidden');
  });

  it('catalogFingerprint is deterministic', () => {
    const spec = {
      ...minimalSpec(),
      observability: obs({
        observers: {
          viewer: { surfaces: { globalVars: 'public' } },
        },
      }),
    };
    const r1 = compileGameSpecToGameDef(spec);
    const r2 = compileGameSpecToGameDef(spec);
    assert.ok(r1.gameDef?.observers);
    assert.ok(r2.gameDef?.observers);
    assert.equal(r1.gameDef.observers.catalogFingerprint, r2.gameDef.observers.catalogFingerprint);
  });
});
