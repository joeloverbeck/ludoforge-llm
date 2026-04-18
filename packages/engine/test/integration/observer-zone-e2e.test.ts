// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '../../src/cnl/index.js';
import { compileProductionSpec, compileTexasProductionSpec } from '../helpers/production-spec-helpers.js';
import { GameDefSchema } from '../../src/kernel/schemas-core.js';
import { assertNoDiagnostics } from '../helpers/diagnostic-helpers.js';

describe('observer zone integration', () => {
  // --- AC 1: FITL compiles with observer zones (no zone overrides, defers to ZoneDef.visibility) ---
  it('FITL compiles with observers — no zone overrides', () => {
    const spec = compileProductionSpec();
    const def = spec.compiled.gameDef;
    assert.ok(def.observers !== undefined, 'FITL GameDef should have observers');
    const currentPlayer = def.observers!.observers['currentPlayer'];
    assert.ok(currentPlayer !== undefined, 'FITL should have currentPlayer observer');
    assert.equal(currentPlayer.zones, undefined, 'FITL currentPlayer should have no zone overrides');
  });

  // --- AC 2: Texas Hold'em compiles with observer zone overrides ---
  it('Texas Hold\'em compiles with observer zone overrides', () => {
    const spec = compileTexasProductionSpec();
    const def = spec.compiled.gameDef;
    assert.ok(def.observers !== undefined, 'Texas GameDef should have observers');
    const currentPlayer = def.observers!.observers['currentPlayer'];
    assert.ok(currentPlayer !== undefined, 'Texas should have currentPlayer observer');
    assert.ok(currentPlayer.zones !== undefined, 'Texas currentPlayer should have zone overrides');
  });

  // --- AC 3: Both GameDefs compile successfully (Zod tested on minimal spec below) ---
  it('FITL compiles successfully', () => {
    const spec = compileProductionSpec();
    assert.ok(spec.compiled.gameDef !== null, 'FITL should compile');
  });

  it('Texas Hold\'em compiles successfully', () => {
    const spec = compileTexasProductionSpec();
    assert.ok(spec.compiled.gameDef !== null, 'Texas should compile');
  });

  // --- AC 4: Texas Hold'em observers include expected zone entries ---
  it('Texas Hold\'em currentPlayer has expected zone entries', () => {
    const def = compileTexasProductionSpec().compiled.gameDef;
    const zones = def.observers!.observers['currentPlayer']!.zones!;

    assert.deepEqual(zones.entries['hand'], { tokens: 'owner', order: 'owner' });
    assert.deepEqual(zones.entries['deck'], { tokens: 'hidden', order: 'hidden' });
    assert.deepEqual(zones.entries['community'], { tokens: 'public', order: 'public' });
    assert.deepEqual(zones.entries['burn'], { tokens: 'hidden', order: 'hidden' });
    assert.deepEqual(zones.entries['muck'], { tokens: 'hidden', order: 'hidden' });
  });

  // --- AC 5: FITL observer profiles have zones: undefined (no zone overrides) ---
  it('FITL observer profiles have no zone overrides', () => {
    const def = compileProductionSpec().compiled.gameDef;
    const observers = def.observers!.observers;
    assert.equal(observers['currentPlayer']!.zones, undefined);
    assert.equal(observers['default']!.zones, undefined);
  });

  // --- AC 6: omniscient built-in has zone defaultEntry ---
  it('omniscient built-in has zone defaultEntry all public', () => {
    const def = compileProductionSpec().compiled.gameDef;
    const omniscient = def.observers!.observers['omniscient']!;
    assert.ok(omniscient.zones !== undefined);
    assert.deepEqual(omniscient.zones!.entries, {});
    assert.deepEqual(omniscient.zones!.defaultEntry, { tokens: 'public', order: 'public' });
  });

  // --- Zone observer with minimal spec ---
  it('minimal spec with zone overrides compiles and validates', () => {
    const spec = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'zone-observer-e2e', players: { min: 2, max: 2 } },
      globalVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 99 }],
      perPlayerVars: [{ name: 'health', type: 'int', init: 10, min: 0, max: 99 }],
      zones: [
        { id: 'deck', owner: 'none', visibility: 'hidden', ordering: 'stack' },
        { id: 'hand', owner: 'player', visibility: 'owner', ordering: 'set' },
      ],
      turnStructure: { phases: [{ id: 'main' }] },
      actions: [{ id: 'pass', actor: 'active', executor: 'actor', phase: ['main'], params: [], pre: null, cost: [], effects: [], limits: [] }],
      terminal: { conditions: [{ when: { op: '==', left: 1, right: 1 }, result: { type: 'draw' } }] },
      observability: {
        observers: {
          player: {
            zones: {
              hand: { tokens: 'owner', order: 'owner' },
              deck: { tokens: 'hidden', order: 'hidden' },
            },
          },
        },
      },
    };

    const result = compileGameSpecToGameDef(spec as never);
    assertNoDiagnostics(result);
    assert.ok(result.gameDef !== null);

    const zones = result.gameDef!.observers!.observers['player']!.zones!;
    assert.deepEqual(zones.entries['hand'], { tokens: 'owner', order: 'owner' });
    assert.deepEqual(zones.entries['deck'], { tokens: 'hidden', order: 'hidden' });

    const zodResult = GameDefSchema.safeParse(result.gameDef);
    assert.ok(zodResult.success, `Zod validation failed: ${JSON.stringify(zodResult.error?.issues ?? [])}`);
  });
});
