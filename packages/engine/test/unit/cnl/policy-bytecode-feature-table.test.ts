// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildEncodedStateLayout,
  type CompiledPolicyExpr,
  type GameDef,
} from '../../../src/kernel/index.js';
import {
  buildFeatureTable,
  canonicalKey,
  collectFeatureRefsFromCompiledPolicyExpr,
  getFeatureId,
  type FeatureRef,
} from '../../../src/cnl/policy-bytecode/index.js';
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

function collectExpectedKeys(def: GameDef): readonly string[] {
  const layout = buildEncodedStateLayout(def);
  const keys = new Set<string>();
  const compiled = def.agents?.compiled;
  assert.ok(compiled, 'expected compiled policy catalog');

  for (const feature of Object.values(compiled.stateFeatures)) {
    for (const ref of collectFeatureRefsFromCompiledPolicyExpr(feature.expr, layout)) keys.add(canonicalKey(ref));
  }
  for (const feature of Object.values(compiled.candidateFeatures)) {
    for (const ref of collectFeatureRefsFromCompiledPolicyExpr(feature.expr, layout)) keys.add(canonicalKey(ref));
  }
  for (const aggregate of Object.values(compiled.candidateAggregates)) {
    for (const ref of collectFeatureRefsFromCompiledPolicyExpr(aggregate.of, layout)) keys.add(canonicalKey(ref));
    if (aggregate.where !== undefined) {
      for (const ref of collectFeatureRefsFromCompiledPolicyExpr(aggregate.where, layout)) keys.add(canonicalKey(ref));
    }
  }
  for (const rule of Object.values(compiled.pruningRules)) {
    for (const ref of collectFeatureRefsFromCompiledPolicyExpr(rule.when, layout)) keys.add(canonicalKey(ref));
  }
  for (const consideration of Object.values(compiled.considerations)) {
    if (consideration.when !== undefined) {
      for (const ref of collectFeatureRefsFromCompiledPolicyExpr(consideration.when, layout)) keys.add(canonicalKey(ref));
    }
    for (const ref of collectFeatureRefsFromCompiledPolicyExpr(consideration.weight, layout)) keys.add(canonicalKey(ref));
    for (const ref of collectFeatureRefsFromCompiledPolicyExpr(consideration.value, layout)) keys.add(canonicalKey(ref));
  }
  for (const tieBreaker of Object.values(compiled.tieBreakers)) {
    if (tieBreaker.value !== undefined) {
      for (const ref of collectFeatureRefsFromCompiledPolicyExpr(tieBreaker.value, layout)) keys.add(canonicalKey(ref));
    }
  }
  for (const condition of Object.values(compiled.strategicConditions)) {
    for (const ref of collectFeatureRefsFromCompiledPolicyExpr(condition.target, layout)) keys.add(canonicalKey(ref));
    if (condition.proximity !== undefined) {
      for (const ref of collectFeatureRefsFromCompiledPolicyExpr(condition.proximity.current, layout)) keys.add(canonicalKey(ref));
    }
  }

  return [...keys].sort((left, right) => left.localeCompare(right));
}

describe('policy bytecode feature table', () => {
  it('assigns deterministic dense ids for the FITL production GameDef', () => {
    const def = getFitlProductionFixture().gameDef;
    const layout = buildEncodedStateLayout(def);
    const first = buildFeatureTable(def, layout);
    const second = buildFeatureTable(def, layout);

    assert.deepEqual(first, second);
    assert.equal(JSON.stringify(first), JSON.stringify(second));
    assert.deepEqual(first.refs.map((ref: FeatureRef) => canonicalKey(ref)), Object.keys(first.refToId));
    assert.deepEqual(Object.values(first.refToId), first.refs.map((_ref: FeatureRef, index: number) => index));
  });

  it('covers every distinct feature ref used by the four FITL baseline profiles', () => {
    const def = getFitlProductionFixture().gameDef;
    const layout = buildEncodedStateLayout(def);
    const table = buildFeatureTable(def, layout);
    const profileExprs = collectProfileExprs(def, FITL_BASELINE_PROFILES);
    const missing: string[] = [];

    for (const expr of profileExprs) {
      for (const ref of collectFeatureRefsFromCompiledPolicyExpr(expr, layout)) {
        if (getFeatureId(table, ref) === undefined) {
          missing.push(canonicalKey(ref));
        }
      }
    }

    assert.deepEqual(missing, []);
    assert.ok(table.refs.some((ref: FeatureRef) => ref.kind === 'globalVar'), 'expected global var feature refs');
    assert.ok(table.refs.some((ref: FeatureRef) => ref.kind === 'playerInt'), 'expected per-player integer feature refs');
    assert.ok(table.refs.some((ref: FeatureRef) => ref.kind === 'globalTokenAgg'), 'expected token aggregate feature refs');
  });

  it('works for the Texas Holdem production GameDef without game-specific feature names', () => {
    const def = getTexasProductionFixture().gameDef;
    const layout = buildEncodedStateLayout(def);
    const table = buildFeatureTable(def, layout);

    assert.ok(table.refs.length > 0);
    assert.equal(table.refs.some((ref: FeatureRef) => ref.kind.includes('fitl')), false);
    assert.equal(table.refs.some((ref: FeatureRef) => canonicalKey(ref).includes('fire-in-the-lake')), false);
    assert.deepEqual(table.refs.map((ref: FeatureRef) => canonicalKey(ref)), collectExpectedKeys(def));
  });
});
