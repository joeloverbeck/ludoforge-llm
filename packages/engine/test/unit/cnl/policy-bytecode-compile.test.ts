// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  compilePolicyBytecode,
  Opcode,
  validateScoreRange,
} from '../../../src/cnl/policy-bytecode/index.js';
import {
  buildEncodedStateLayout,
  type CompiledPolicyExpr,
  type GameDef,
} from '../../../src/kernel/index.js';
import { getFitlProductionFixture, getTexasProductionFixture } from '../../helpers/production-spec-helpers.js';

const FITL_BASELINE_PROFILES = ['us-baseline', 'arvn-baseline', 'nva-baseline', 'vc-baseline'] as const;

function collectProfileExprs(def: GameDef, profileIds: readonly string[]): readonly CompiledPolicyExpr[] {
  const catalog = def.agents;
  assert.ok(catalog?.compiled, 'expected compiled policy catalog');
  const exprs: CompiledPolicyExpr[] = [];

  for (const profileId of profileIds) {
    const profile = catalog.profiles[profileId];
    assert.ok(profile, `expected profile ${profileId}`);
    for (const featureId of profile.plan.stateFeatures) {
      const feature = catalog.compiled.stateFeatures[featureId];
      assert.ok(feature, `expected state feature ${featureId}`);
      exprs.push(feature.expr);
    }
    for (const featureId of profile.plan.candidateFeatures) {
      const feature = catalog.compiled.candidateFeatures[featureId];
      assert.ok(feature, `expected candidate feature ${featureId}`);
      exprs.push(feature.expr);
    }
    for (const aggregateId of profile.plan.candidateAggregates) {
      const aggregate = catalog.compiled.candidateAggregates[aggregateId];
      assert.ok(aggregate, `expected candidate aggregate ${aggregateId}`);
      exprs.push(aggregate.of);
      if (aggregate.where !== undefined) exprs.push(aggregate.where);
    }
    for (const considerationId of profile.use.considerations) {
      const consideration = catalog.compiled.considerations[considerationId];
      assert.ok(consideration, `expected consideration ${considerationId}`);
      if (consideration.when !== undefined) exprs.push(consideration.when);
      exprs.push(consideration.weight, consideration.value);
    }
    for (const tieBreakerId of profile.use.tieBreakers ?? []) {
      const tieBreaker = catalog.compiled.tieBreakers[tieBreakerId];
      assert.ok(tieBreaker, `expected tie breaker ${tieBreakerId}`);
      if (tieBreaker.value !== undefined) exprs.push(tieBreaker.value);
    }
  }

  return exprs;
}

function instructions(bytecode: { readonly instructions: Int32Array }): readonly number[] {
  return Array.from(bytecode.instructions);
}

function hasOpcode(bytecode: { readonly instructions: Int32Array }, opcode: Opcode): boolean {
  const encoded = instructions(bytecode);
  const singleOperandOps = new Set<Opcode>([
    Opcode.LOAD_FEATURE,
    Opcode.LOAD_CONST,
    Opcode.JUMP_IF_FALSE,
    Opcode.RESOLVE_REF,
    Opcode.RESOLVE_DYNAMIC,
  ]);
  for (let offset = 0; offset < encoded.length;) {
    const current = encoded[offset] as Opcode;
    if (current === opcode) {
      return true;
    }
    offset += 1 + (singleOperandOps.has(current) ? 1 : 0);
  }
  return false;
}

describe('policy bytecode compiler', () => {
  it('compiles all FITL baseline profile expressions without RESOLVE_DYNAMIC', () => {
    const def = getFitlProductionFixture().gameDef;
    const layout = buildEncodedStateLayout(def);
    const dynamicExprs: number[] = [];

    for (const [index, expr] of collectProfileExprs(def, FITL_BASELINE_PROFILES).entries()) {
      const bytecode = compilePolicyBytecode(expr, def, layout);
      if (hasOpcode(bytecode, Opcode.RESOLVE_DYNAMIC)) {
        dynamicExprs.push(index);
      }
    }

    assert.deepEqual(dynamicExprs, []);
  });

  it('is deterministic for repeated compilation of the same production expression', () => {
    const def = getTexasProductionFixture().gameDef;
    const layout = buildEncodedStateLayout(def);
    const catalog = def.agents?.compiled;
    assert.ok(catalog, 'expected compiled Texas policy catalog');
    const consideration = catalog.considerations.preferCheck;
    assert.ok(consideration, 'expected preferCheck consideration');
    const expr = consideration.weight;

    const first = compilePolicyBytecode(expr, def, layout);
    const second = compilePolicyBytecode(expr, def, layout);

    assert.deepEqual(instructions(first), instructions(second));
    assert.deepEqual(Array.from(first.constants), Array.from(second.constants));
    assert.deepEqual(first.featureTable, second.featureTable);
  });

  it('sorts the constants table and references constants by dense id', () => {
    const def = getTexasProductionFixture().gameDef;
    const layout = buildEncodedStateLayout(def);
    const expr: CompiledPolicyExpr = {
      kind: 'op',
      op: 'add',
      args: [
        { kind: 'literal', value: 5 },
        { kind: 'literal', value: 2 },
      ],
    };

    const bytecode = compilePolicyBytecode(expr, def, layout);

    assert.deepEqual(Array.from(bytecode.constants), [2, 5]);
    assert.deepEqual(instructions(bytecode), [
      Opcode.LOAD_CONST, 1,
      Opcode.LOAD_CONST, 0,
      Opcode.ADD_SCORE,
      Opcode.HALT,
    ]);
  });

  it('emits RESOLVE_DYNAMIC and a warning when static range exceeds the score budget', () => {
    const def = getTexasProductionFixture().gameDef;
    const layout = buildEncodedStateLayout(def);
    const warnings: string[] = [];
    const expr: CompiledPolicyExpr = { kind: 'literal', value: 2 ** 30 + 1 };

    const range = validateScoreRange(expr);
    const bytecode = compilePolicyBytecode(expr, def, layout, { logger: { warn: (message) => warnings.push(message) } });

    assert.equal(range.kind, 'bounded');
    assert.equal(range.withinScoreBudget, false);
    assert.deepEqual(instructions(bytecode), [Opcode.RESOLVE_DYNAMIC, 2, Opcode.HALT]);
    assert.match(warnings.join('\n'), /score range exceeds/u);
  });
});
