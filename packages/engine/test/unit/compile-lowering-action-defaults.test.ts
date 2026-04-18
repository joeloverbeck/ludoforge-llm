// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { lowerTurnStructure, type EffectLoweringSharedContext } from '../../src/cnl/compile-lowering.js';
import { canonicalizeNamedSets } from '../../src/cnl/named-set-utils.js';
import type { Diagnostic } from '../../src/kernel/diagnostics.js';
import type { PhaseDef } from '../../src/kernel/types-core.js';
import { asPhaseId } from '../../src/kernel/branded.js';
import { tagEffectAsts } from '../../src/kernel/tag-effect-asts.js';

const makeContext = (): EffectLoweringSharedContext => ({
  ownershipByBase: { board: 'none' },
  tokenTraitVocabulary: {},
  tokenFilterProps: [],
  namedSets: canonicalizeNamedSets({}),
  seatIds: ['0', '1'],
});

describe('compile-lowering actionDefaults', () => {
  it('actionDefaults.pre is correctly lowered', () => {
    const diagnostics: Diagnostic[] = [];
    const result = lowerTurnStructure(
      {
        phases: [
          {
            id: 'main',
            actionDefaults: {
              pre: { op: '==', left: { ref: 'gvar', var: 'gate' }, right: 1 },
            },
          },
        ],
      },
      diagnostics,
      makeContext(),
    );
    assert.equal(diagnostics.length, 0, 'no diagnostics expected');
    assert.equal(result.phases.length, 1);
    const phase = result.phases[0] as PhaseDef;
    assert.ok(phase.actionDefaults !== undefined, 'actionDefaults should be present');
    assert.ok(phase.actionDefaults.pre !== undefined, 'pre should be present');
    assert.deepEqual(phase.actionDefaults.pre, {
      op: '==',
      left: { _t: 2, ref: 'gvar', var: 'gate' },
      right: 1,
    });
  });

  it('actionDefaults.afterEffects is correctly lowered', () => {
    const diagnostics: Diagnostic[] = [];
    const result = lowerTurnStructure(
      {
        phases: [
          {
            id: 'main',
            actionDefaults: {
              afterEffects: [
                { addVar: { scope: 'global', var: 'counter', delta: 1 } },
              ],
            },
          },
        ],
      },
      diagnostics,
      makeContext(),
    );
    assert.equal(diagnostics.length, 0, 'no diagnostics expected');
    const phase = result.phases[0] as PhaseDef;
    assert.ok(phase.actionDefaults !== undefined, 'actionDefaults should be present');
    assert.ok(phase.actionDefaults.afterEffects !== undefined, 'afterEffects should be present');
    assert.equal(phase.actionDefaults.afterEffects.length, 1);
    assert.deepEqual(phase.actionDefaults.afterEffects[0], tagEffectAsts({
      addVar: { scope: 'global', var: 'counter', delta: 1 },
    }));
  });

  it('phase without actionDefaults lowers as before (no field in output)', () => {
    const diagnostics: Diagnostic[] = [];
    const result = lowerTurnStructure(
      {
        phases: [{ id: 'main' }],
      },
      diagnostics,
      makeContext(),
    );
    assert.equal(diagnostics.length, 0);
    const phase = result.phases[0] as PhaseDef;
    assert.equal(phase.id, asPhaseId('main'));
    assert.equal(phase.actionDefaults, undefined, 'actionDefaults should be absent');
  });

  it('phase with empty actionDefaults (no pre, no afterEffects) → field omitted', () => {
    const diagnostics: Diagnostic[] = [];
    const result = lowerTurnStructure(
      {
        phases: [{ id: 'main', actionDefaults: {} }],
      },
      diagnostics,
      makeContext(),
    );
    assert.equal(diagnostics.length, 0);
    const phase = result.phases[0] as PhaseDef;
    assert.equal(phase.actionDefaults, undefined, 'actionDefaults should be omitted when empty');
  });

  it('actionDefaults.pre: null → pre omitted in output', () => {
    const diagnostics: Diagnostic[] = [];
    const result = lowerTurnStructure(
      {
        phases: [
          {
            id: 'main',
            actionDefaults: {
              pre: null,
              afterEffects: [
                { addVar: { scope: 'global', var: 'counter', delta: 1 } },
              ],
            },
          },
        ],
      },
      diagnostics,
      makeContext(),
    );
    assert.equal(diagnostics.length, 0);
    const phase = result.phases[0] as PhaseDef;
    assert.ok(phase.actionDefaults !== undefined, 'actionDefaults should be present (afterEffects exist)');
    assert.equal(phase.actionDefaults.pre, undefined, 'pre should be omitted when source is null');
    assert.ok(phase.actionDefaults.afterEffects !== undefined, 'afterEffects should be present');
  });

  it('actionDefaults with both pre and afterEffects lowered correctly', () => {
    const diagnostics: Diagnostic[] = [];
    const result = lowerTurnStructure(
      {
        phases: [
          {
            id: 'main',
            actionDefaults: {
              pre: { op: '>=', left: { ref: 'gvar', var: 'counter' }, right: 0 },
              afterEffects: [
                { addVar: { scope: 'global', var: 'counter', delta: -1 } },
              ],
            },
          },
        ],
      },
      diagnostics,
      makeContext(),
    );
    assert.equal(diagnostics.length, 0);
    const phase = result.phases[0] as PhaseDef;
    assert.ok(phase.actionDefaults !== undefined);
    assert.ok(phase.actionDefaults.pre !== undefined);
    assert.ok(phase.actionDefaults.afterEffects !== undefined);
    assert.equal(phase.actionDefaults.afterEffects.length, 1);
  });
});
