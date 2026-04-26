import * as assert from 'node:assert/strict';

import { buildPolicyExprClosure } from '../../src/agents/compiled-policy-runtime.js';
import { PolicyEvaluationContext } from '../../src/agents/policy-evaluation-core.js';
import {
  asPlayerId,
  createGameDefRuntime,
  initialState,
  type AgentPolicyCatalog,
  type CompiledPolicyCatalog,
  type CompiledPolicyConsideration,
  type CompiledPolicyExpr,
  type GameDef,
  type GameState,
} from '../../src/kernel/index.js';
import { getFitlProductionFixture, getTexasProductionFixture } from './production-spec-helpers.js';

export interface CompiledPolicyFixture {
  readonly label: string;
  readonly def: GameDef;
}

export interface CompiledConsiderationSample {
  readonly fixtureLabel: string;
  readonly profileId: string;
  readonly seatId: string;
  readonly considerationId: string;
  readonly state: GameState;
  readonly ast: CompiledPolicyConsideration;
  readonly compiled: CompiledPolicyConsideration;
}

export interface CompiledPolicyExpressionSample {
  readonly fixtureLabel: string;
  readonly profileId: string;
  readonly seatId: string;
  readonly state: GameState;
  readonly ast: CompiledPolicyExpr;
  readonly compiled: CompiledPolicyExpr;
}

export interface CompiledPolicyCoverageSummary {
  readonly totalConsiderations: number;
  readonly compiledConsiderations: number;
  readonly carrierTotals: Readonly<Record<CompiledPolicyCarrier, number>>;
  readonly compiledCarrierTotals: Readonly<Record<CompiledPolicyCarrier, number>>;
  readonly expressionKinds: Readonly<Record<string, number>>;
}

export type CompiledPolicyCarrier =
  | 'stateFeatures'
  | 'candidateFeatures'
  | 'candidateAggregates'
  | 'pruningRules'
  | 'considerations'
  | 'tieBreakers'
  | 'strategicConditions';

export const COMPILED_POLICY_EXPR_KINDS = [
  'literal',
  'param',
  'ref',
  'op',
  'zoneTokenAgg',
  'globalTokenAgg',
  'globalZoneAgg',
  'adjacentTokenAgg',
  'seatAgg',
  'zoneProp',
] as const;

export const COMPILED_POLICY_CARRIERS: readonly CompiledPolicyCarrier[] = [
  'stateFeatures',
  'candidateFeatures',
  'candidateAggregates',
  'pruningRules',
  'considerations',
  'tieBreakers',
  'strategicConditions',
];

export function loadCompiledPolicyFixtures(): readonly CompiledPolicyFixture[] {
  return [
    { label: 'fitl', def: getFitlProductionFixture().gameDef },
    { label: 'texas', def: getTexasProductionFixture().gameDef },
  ];
}

export function summarizeCompiledPolicyCoverage(fixtures: readonly CompiledPolicyFixture[]): CompiledPolicyCoverageSummary {
  let totalConsiderations = 0;
  let compiledConsiderations = 0;
  const carrierTotals = emptyCarrierTotals();
  const compiledCarrierTotals = emptyCarrierTotals();
  const expressionKinds: Record<string, number> = {};

  for (const { def } of fixtures) {
    const catalog = def.agents;
    if (catalog === undefined) {
      continue;
    }
    totalConsiderations += Object.keys(catalog.library.considerations).length;
    compiledConsiderations += Object.keys(catalog.compiled?.considerations ?? {}).length;
    recordCarrierTotals(catalog, carrierTotals, compiledCarrierTotals);
    recordCompiledCatalogExprKinds(catalog.compiled, expressionKinds);
  }

  return { totalConsiderations, compiledConsiderations, carrierTotals, compiledCarrierTotals, expressionKinds };
}

function recordCarrierTotals(
  catalog: AgentPolicyCatalog,
  carrierTotals: Record<CompiledPolicyCarrier, number>,
  compiledCarrierTotals: Record<CompiledPolicyCarrier, number>,
): void {
  for (const carrier of COMPILED_POLICY_CARRIERS) {
    carrierTotals[carrier] += Object.keys(catalog.library[carrier]).length;
    compiledCarrierTotals[carrier] += Object.keys(catalog.compiled?.[carrier] ?? {}).length;
  }
}

function recordCompiledCatalogExprKinds(
  compiled: CompiledPolicyCatalog | undefined,
  expressionKinds: Record<string, number>,
): void {
  if (compiled === undefined) {
    return;
  }
  for (const feature of Object.values(compiled.stateFeatures)) {
    recordExprKinds(feature.expr, expressionKinds);
  }
  for (const feature of Object.values(compiled.candidateFeatures)) {
    recordExprKinds(feature.expr, expressionKinds);
  }
  for (const aggregate of Object.values(compiled.candidateAggregates)) {
    recordExprKinds(aggregate.of, expressionKinds);
    recordExprKinds(aggregate.where, expressionKinds);
  }
  for (const rule of Object.values(compiled.pruningRules)) {
    recordExprKinds(rule.when, expressionKinds);
  }
  for (const consideration of Object.values(compiled.considerations)) {
    recordExprKinds(consideration.when, expressionKinds);
    recordExprKinds(consideration.weight, expressionKinds);
    recordExprKinds(consideration.value, expressionKinds);
  }
  for (const tieBreaker of Object.values(compiled.tieBreakers)) {
    recordExprKinds(tieBreaker.value, expressionKinds);
  }
  for (const condition of Object.values(compiled.strategicConditions)) {
    recordExprKinds(condition.target, expressionKinds);
    if (condition.proximity !== undefined) {
      recordExprKinds(condition.proximity.current, expressionKinds);
    }
  }
}

export function collectCompiledConsiderationSamples(
  fixtures: readonly CompiledPolicyFixture[],
): readonly CompiledConsiderationSample[] {
  const samples: CompiledConsiderationSample[] = [];

  for (const { label, def } of fixtures) {
    const catalog = def.agents;
    if (catalog === undefined) {
      continue;
    }
    const compiledConsiderations = catalog.compiled?.considerations ?? {};
    const state = initialState(def, 147001, undefined, undefined, createGameDefRuntime(def)).state;
    for (const [profileId, profile] of Object.entries(catalog.profiles)) {
      const seatId = resolveSeatId(catalog, profileId);
      if (seatId === undefined) {
        continue;
      }
      for (const considerationId of profile.use.considerations) {
        const compiled = compiledConsiderations[considerationId];
        const ast = compiled;
        if (compiled === undefined || ast === undefined) {
          continue;
        }
        samples.push({ fixtureLabel: label, profileId, seatId, considerationId, state, ast, compiled });
      }
    }
  }

  return samples;
}

export function collectSyntheticCompiledPolicyExpressionSamples(
  fixtures: readonly CompiledPolicyFixture[],
): readonly CompiledPolicyExpressionSample[] {
  const fixture = fixtures.find((entry) => entry.label === 'fitl') ?? fixtures[0];
  if (fixture === undefined || fixture.def.agents === undefined) {
    return [];
  }
  const [profileId] = Object.keys(fixture.def.agents.profiles);
  assert.ok(profileId, 'expected a production profile for synthetic compiled expression samples');
  const seatId = resolveSeatId(fixture.def.agents, profileId);
  assert.ok(seatId, `expected a bound seat for profile ${profileId}`);
  const state = initialState(fixture.def, 147002, undefined, undefined, createGameDefRuntime(fixture.def)).state;
  const anchorZone = fixture.def.zones[0]?.id;
  assert.ok(anchorZone, 'expected at least one zone for synthetic compiled expression samples');
  const globalZoneAgg = {
    kind: 'globalZoneAgg',
    source: 'attribute',
    field: 'category',
    aggOp: 'count',
    zoneScope: 'all',
  } satisfies CompiledPolicyExpr;
  const adjacentTokenAgg = {
    kind: 'adjacentTokenAgg',
    anchorZone,
    aggOp: 'count',
  } satisfies CompiledPolicyExpr;
  const seatAgg = {
    kind: 'seatAgg',
    over: 'all',
    expr: { kind: 'literal', value: 1 },
    aggOp: 'count',
  } satisfies CompiledPolicyExpr;
  const zoneProp = {
    kind: 'zoneProp',
    zone: anchorZone,
    prop: 'category',
  } satisfies CompiledPolicyExpr;

  return [globalZoneAgg, adjacentTokenAgg, seatAgg, zoneProp].map((expr) => ({
    fixtureLabel: `${fixture.label}:synthetic-${expr.kind}`,
    profileId,
    seatId,
    state,
    ast: expr,
    compiled: expr,
  }));
}

export function evaluateAstConsiderationSample(
  def: GameDef,
  catalog: AgentPolicyCatalog,
  sample: CompiledConsiderationSample,
): number {
  return createEvaluationContext(def, catalog, sample).evaluateConsideration(
    { [sample.considerationId]: sample.ast },
    sample.considerationId,
    undefined,
  );
}

export function evaluateAstExpressionSample(
  def: GameDef,
  catalog: AgentPolicyCatalog,
  sample: CompiledPolicyExpressionSample,
): ReturnType<PolicyEvaluationContext['evaluateCompiledExpr']> {
  return createEvaluationContext(def, catalog, sample).evaluateCompiledExpr(sample.ast, undefined);
}

export function evaluateCompiledConsiderationSample(
  def: GameDef,
  catalog: AgentPolicyCatalog,
  sample: CompiledConsiderationSample,
): number {
  const evaluation = createEvaluationContext(def, catalog, sample);
  const consideration = sample.compiled;
  if (consideration.when !== undefined) {
    const when = buildPolicyExprClosure(consideration.when, evaluation)(undefined);
    if (when !== true) {
      return 0;
    }
  }
  const weight = buildPolicyExprClosure(consideration.weight, evaluation)(undefined);
  const value = buildPolicyExprClosure(consideration.value, evaluation)(undefined);
  if (typeof weight !== 'number' || typeof value !== 'number') {
    return consideration.unknownAs ?? 0;
  }
  return clampContribution(weight * value, consideration.clamp);
}

export function evaluateCompiledExpressionSample(
  def: GameDef,
  catalog: AgentPolicyCatalog,
  sample: CompiledPolicyExpressionSample,
): ReturnType<PolicyEvaluationContext['evaluateCompiledExpr']> {
  return buildPolicyExprClosure(sample.compiled, createEvaluationContext(def, catalog, sample))(undefined);
}

function createEvaluationContext(
  def: GameDef,
  catalog: AgentPolicyCatalog,
  sample: CompiledConsiderationSample | CompiledPolicyExpressionSample,
): PolicyEvaluationContext {
  const profile = catalog.profiles[sample.profileId];
  assert.ok(profile, `Expected profile ${sample.profileId} to exist`);
  const playerIndex = Math.max(0, def.seats?.findIndex((seat) => seat.id === sample.seatId) ?? 0);
  return new PolicyEvaluationContext({
    def,
    state: sample.state,
    playerId: asPlayerId(playerIndex),
    seatId: sample.seatId,
    catalog,
    parameterValues: profile.params,
    trustedMoveIndex: new Map(),
    runtime: createGameDefRuntime(def),
  }, []);
}

function resolveSeatId(catalog: AgentPolicyCatalog, profileId: string): string | undefined {
  return Object.entries(catalog.bindingsBySeat).find(([, boundProfileId]) => boundProfileId === profileId)?.[0];
}

function clampContribution(
  contribution: number,
  clamp: CompiledPolicyConsideration['clamp'],
): number {
  let clamped = contribution;
  if (clamp?.min !== undefined) {
    clamped = Math.max(clamp.min, clamped);
  }
  if (clamp?.max !== undefined) {
    clamped = Math.min(clamp.max, clamped);
  }
  return clamped;
}

function recordExprKinds(
  expr: CompiledPolicyExpr | undefined,
  counts: Record<string, number>,
): void {
  if (expr === undefined) {
    return;
  }
  counts[expr.kind] = (counts[expr.kind] ?? 0) + 1;
  if (expr.kind === 'op') {
    for (const arg of expr.args) {
      recordExprKinds(arg, counts);
    }
  } else if (expr.kind === 'zoneProp') {
    recordZoneSourceExprKinds(expr.zone, counts);
  } else if (expr.kind === 'zoneTokenAgg') {
    recordZoneSourceExprKinds(expr.zone, counts);
  } else if (expr.kind === 'adjacentTokenAgg') {
    recordZoneSourceExprKinds(expr.anchorZone, counts);
  } else if (expr.kind === 'seatAgg') {
    recordExprKinds(expr.expr, counts);
  }
}

function recordZoneSourceExprKinds(
  source: string | CompiledPolicyExpr,
  counts: Record<string, number>,
): void {
  if (typeof source !== 'string') {
    recordExprKinds(source, counts);
  }
}

function emptyCarrierTotals(): Record<CompiledPolicyCarrier, number> {
  return {
    stateFeatures: 0,
    candidateFeatures: 0,
    candidateAggregates: 0,
    pruningRules: 0,
    considerations: 0,
    tieBreakers: 0,
    strategicConditions: 0,
  };
}
