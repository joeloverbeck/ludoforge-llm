import * as assert from 'node:assert/strict';

import type {
  DecisionLog,
  GameDef,
  GameState,
  GameTrace,
  Token,
  TriggerLogEntry,
} from '../../src/kernel/index.js';
import { assertValidatedGameDef, createGameDefRuntime } from '../../src/kernel/index.js';
import { PolicyAgent } from '../../src/agents/index.js';
import { runGame } from '../../src/sim/index.js';
import { createSeededChoiceAgents } from './test-agents.js';
import {
  getFitlProductionFixture,
  getTexasProductionFixture,
  type ProductionGameFixture,
} from './production-spec-helpers.js';

export const FITL_PLAYER_COUNT = 4;
export const TEXAS_PLAYER_COUNT = 6;
export const FITL_BASELINE_PROFILES = ['us-baseline', 'arvn-baseline', 'nva-baseline', 'vc-baseline'] as const;

export type CardTokenMultiset = ReadonlyMap<string, number>;

export const cardTokenMultiset = (state: GameState): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const tokens of Object.values(state.zones)) {
    for (const token of tokens as readonly Token[]) {
      if (token.type !== 'card') {
        continue;
      }
      const tokenId = String(token.id);
      counts.set(tokenId, (counts.get(tokenId) ?? 0) + 1);
    }
  }
  return counts;
};

export const cardTokenCount = (state: GameState): number => {
  let count = 0;
  for (const tokens of Object.values(state.zones)) {
    for (const token of tokens as readonly Token[]) {
      if (token.type === 'card') {
        count += 1;
      }
    }
  }
  return count;
};

export const assertCardTokenMultisetEqual = (
  actual: CardTokenMultiset,
  expected: CardTokenMultiset,
  label: string,
): void => {
  assert.equal(actual.size, expected.size, `${label}: card-token id set size`);
  for (const [tokenId, count] of expected) {
    assert.equal(actual.get(tokenId), count, `${label}: token ${tokenId}`);
  }
};

export const lifecycleTraceEntries = (
  triggerFirings: readonly TriggerLogEntry[],
): readonly Extract<TriggerLogEntry, { readonly kind: 'turnFlowLifecycle' }>[] =>
  triggerFirings.filter(
    (entry): entry is Extract<TriggerLogEntry, { readonly kind: 'turnFlowLifecycle' }> =>
      entry.kind === 'turnFlowLifecycle',
  );

export const assertTraceHasLifecycleActivity = (trace: GameTrace, label: string): void => {
  const lifecycleEntryCount = trace.decisions.reduce(
    (total, decision) => total + lifecycleTraceEntries(decision.triggerFirings).length,
    0,
  );
  assert.ok(lifecycleEntryCount > 0, `${label}: expected at least one lifecycle trace entry`);
};

const isPlayerOrStochasticDecision = (decision: DecisionLog): boolean =>
  decision.playerId !== undefined || decision.seatId === '__chance';

export const assertDecisionBeforeTurnRetirement = (trace: GameTrace, label: string): void => {
  const observedDecisionByTurn = new Set<string>();
  for (const decision of trace.decisions) {
    const turnId = String(decision.turnId);
    const hasPriorDecision = observedDecisionByTurn.has(turnId);
    const currentDecisionCounts = isPlayerOrStochasticDecision(decision);
    if (decision.turnRetired) {
      assert.ok(
        hasPriorDecision || currentDecisionCounts,
        `${label}: turn ${turnId} retired before any player or stochastic decision`,
      );
    }
    if (currentDecisionCounts) {
      observedDecisionByTurn.add(turnId);
    }
  }
  assert.ok(observedDecisionByTurn.size > 0, `${label}: expected at least one player or stochastic decision`);
};

export const assertNoTerminalAtOrBeforeTurn = (trace: GameTrace, maxEarlyTurn: number, label: string): void => {
  assert.ok(
    trace.stopReason !== 'terminal' || trace.turnsCount > maxEarlyTurn,
    `${label}: terminal stop fired at turn ${trace.turnsCount}, expected > ${maxEarlyTurn}`,
  );
};

export const createFitlBaselineAgents = (): readonly PolicyAgent[] =>
  FITL_BASELINE_PROFILES.map((profileId) => new PolicyAgent({ profileId, traceLevel: 'summary' }));

export const runFitlBaselineTrace = (seed: number, maxTurns: number, fixture = getFitlProductionFixture()): GameTrace => {
  const def = assertValidatedGameDef(fixture.gameDef);
  const runtime = createGameDefRuntime(def);
  return runGame(
    def,
    seed,
    createFitlBaselineAgents(),
    maxTurns,
    FITL_PLAYER_COUNT,
    { skipDeltas: true },
    runtime,
  );
};

export const runFitlSeededChoiceTrace = (seed: number, maxTurns: number, fixture = getFitlProductionFixture()): GameTrace => {
  const def = assertValidatedGameDef(fixture.gameDef);
  const runtime = createGameDefRuntime(def);
  return runGame(
    def,
    seed,
    createSeededChoiceAgents(FITL_PLAYER_COUNT),
    maxTurns,
    FITL_PLAYER_COUNT,
    { skipDeltas: true },
    runtime,
  );
};

export const runTexasSeededChoiceTrace = (seed: number, maxTurns: number, fixture = getTexasProductionFixture()): GameTrace => {
  const def = assertValidatedGameDef(fixture.gameDef);
  const runtime = createGameDefRuntime(def);
  return runGame(
    def,
    seed,
    createSeededChoiceAgents(TEXAS_PLAYER_COUNT),
    maxTurns,
    TEXAS_PLAYER_COUNT,
    { skipDeltas: true },
    runtime,
  );
};

export const assertCardDrivenProductionFixture = (fixture: ProductionGameFixture, label: string): GameDef => {
  const def = assertValidatedGameDef(fixture.gameDef);
  assert.equal(def.turnOrder?.type, 'cardDriven', `${label}: expected cardDriven turnOrder`);
  return def;
};
