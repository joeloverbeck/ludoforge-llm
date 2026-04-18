// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asPhaseId } from '../../../src/kernel/branded.js';
import { findPhaseDef } from '../../../src/kernel/phase-lookup.js';
import type { GameDef, PhaseDef } from '../../../src/kernel/types.js';

/**
 * Minimal GameDef stub with only the fields required by findPhaseDef.
 */
function stubPhase(id: string): PhaseDef {
  return { id: asPhaseId(id) } as PhaseDef;
}

function stubDef(
  phases: PhaseDef[],
  interrupts?: PhaseDef[],
): GameDef {
  return {
    turnStructure: {
      phases,
      interrupts,
    },
  } as unknown as GameDef;
}

describe('findPhaseDef', () => {
  it('finds a phase in the phases array', () => {
    const def = stubDef([stubPhase('combat'), stubPhase('diplomacy')]);
    const result = findPhaseDef(def, 'combat');
    assert.ok(result);
    assert.equal(result.id, asPhaseId('combat'));
  });

  it('finds a phase in the interrupts array', () => {
    const def = stubDef([stubPhase('main')], [stubPhase('interrupt-coup')]);
    const result = findPhaseDef(def, 'interrupt-coup');
    assert.ok(result);
    assert.equal(result.id, asPhaseId('interrupt-coup'));
  });

  it('returns undefined for an unknown phase id', () => {
    const def = stubDef([stubPhase('main')], [stubPhase('interrupt')]);
    assert.equal(findPhaseDef(def, 'nonexistent'), undefined);
  });

  it('returns undefined when interrupts is undefined', () => {
    const def = stubDef([stubPhase('main')]);
    assert.equal(findPhaseDef(def, 'nonexistent'), undefined);
  });

  it('prefers phases over interrupts when ids collide', () => {
    const def = stubDef([stubPhase('shared')], [stubPhase('shared')]);
    // The ?? operator means phases.find runs first; if found, interrupts
    // are never searched.  Verify we get the phases entry.
    const result = findPhaseDef(def, 'shared');
    assert.ok(result);
    // Both have the same id, but the result should be referentially
    // identical to the phases array entry.
    assert.strictEqual(result, def.turnStructure.phases[0]);
  });

  it('handles an empty phases array gracefully', () => {
    const def = stubDef([], [stubPhase('only-interrupt')]);
    const result = findPhaseDef(def, 'only-interrupt');
    assert.ok(result);
    assert.equal(result.id, asPhaseId('only-interrupt'));
  });
});
