import * as assert from 'node:assert/strict';

import { buildPolicyExprClosure } from '../../src/agents/compiled-policy-runtime.js';
import { PolicyEvaluationContext } from '../../src/agents/policy-evaluation-core.js';
import {
  asPlayerId,
  createGameDefRuntime,
  initialState,
  type AgentPolicyCatalog,
  type CompiledAgentConsideration,
  type CompiledPolicyConsideration,
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
  readonly ast: CompiledAgentConsideration;
  readonly compiled: CompiledPolicyConsideration;
}

export interface CompiledPolicyCoverageSummary {
  readonly totalConsiderations: number;
  readonly compiledConsiderations: number;
  readonly expressionKinds: Readonly<Record<string, number>>;
}

export function loadCompiledPolicyFixtures(): readonly CompiledPolicyFixture[] {
  return [
    { label: 'fitl', def: getFitlProductionFixture().gameDef },
    { label: 'texas', def: getTexasProductionFixture().gameDef },
  ];
}

export function summarizeCompiledPolicyCoverage(fixtures: readonly CompiledPolicyFixture[]): CompiledPolicyCoverageSummary {
  let totalConsiderations = 0;
  let compiledConsiderations = 0;
  const expressionKinds: Record<string, number> = {};

  for (const { def } of fixtures) {
    const catalog = def.agents;
    if (catalog === undefined) {
      continue;
    }
    totalConsiderations += Object.keys(catalog.library.considerations).length;
    compiledConsiderations += Object.keys(catalog.compiled?.considerations ?? {}).length;
    for (const consideration of Object.values(catalog.compiled?.considerations ?? {})) {
      recordExprKinds(consideration.when, expressionKinds);
      recordExprKinds(consideration.weight, expressionKinds);
      recordExprKinds(consideration.value, expressionKinds);
    }
  }

  return { totalConsiderations, compiledConsiderations, expressionKinds };
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
        const ast = catalog.library.considerations[considerationId];
        if (compiled === undefined || ast === undefined) {
          continue;
        }
        samples.push({ fixtureLabel: label, profileId, seatId, considerationId, state, ast, compiled });
      }
    }
  }

  return samples;
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

function createEvaluationContext(
  def: GameDef,
  catalog: AgentPolicyCatalog,
  sample: CompiledConsiderationSample,
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
  expr: CompiledPolicyConsideration['when'] | CompiledPolicyConsideration['weight'],
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
  }
}
