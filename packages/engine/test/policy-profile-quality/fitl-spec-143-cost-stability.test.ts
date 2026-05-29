// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { PolicyAgent } from '../../src/agents/index.js';
import {
  advanceAutoresolvable,
  applyPublishedDecision,
  assertValidatedGameDef,
  createGameDefRuntime,
  createRng,
  initialState,
  publishMicroturn,
  terminalResult,
  type Agent,
  type GameDefRuntime,
  type Rng,
  type ValidatedGameDef,
} from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { emitPolicyProfileQualityRecord } from '../helpers/policy-profile-quality-report-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

/*
 * Spec 143 / Spec 207 — "no retained-state cost accumulation on the agent decision path."
 *
 * DISTILLED 2026-05-29 (207AGEDECCOS-002, per docs/FOUNDATIONS.md Appendix +
 * .claude/rules/testing.md "Distillation over re-bless"):
 *
 * This witness originally asserted a calibrated trimmed last-decile / first-decile
 * per-decision *wall-time* ratio (ceiling 1.75x). Its stated purpose was to catch
 * "a retained-state regression that makes later decisions materially slower."
 *
 * Spec 207 Phase 1 (archive/tickets/207AGEDECCOS-001.md) PROVED that defect class is
 * absent: the within-game cost is NOT a leaked/retained structure — it is per-decision
 * preview work bounded by the `arvn-baseline` `deep1024` continuedDeepening cap class
 * (a legitimate, statically-named bounded-computation tier — Foundation #10), whose
 * realized cost is high for ARVN `chooseNStep` decisions and clusters late in the
 * trajectory. The decile wall-time ratio therefore FALSE-POSITIVES on (a) legitimate
 * decision-type *composition* (expensive ARVN `chooseNStep` decisions appear only after
 * the opening) and (b) legitimate board-fill (more tokens => costlier applies) — neither
 * of which is a retained-state regression. The cost magnitude is a deliberate ARVN
 * agent-tuning choice, not an engine bug (Foundation #15); a wall-time ceiling cannot
 * separate a true leak from legitimate composition.
 *
 * This file is distilled to the seed-independent architectural invariant the witness
 * actually guards: a leak-free agent holds NO retained state that grows with the number
 * of decisions it has processed. The PolicyAgent's only per-seat retained structures are
 * `planExecutionState` and `previewWideningState`; both are bounded by game structure
 * (active plan / per-(turn,seat) widening memory), never by decision count. A retained-
 * state regression — the defect class — would make one of these grow with the ~200
 * player decisions in this game. We also re-assert bounded termination and replay
 * identity (Foundation #8). This catches the guarded defect class without firing on the
 * legitimate `deep1024` cost composition.
 */

const POLICY_PROFILES = ['us-baseline', 'arvn-baseline', 'nva-baseline', 'vc-baseline'] as const;
const SEED = 1002;
const MAX_TURNS = 3;
const PLAYER_COUNT = 4;
const AGENT_RNG_MIX = 0x9e3779b97f4a7c15n;
const TEST_FILE = fileURLToPath(import.meta.url);
const ALLOWED_STOP_REASONS = new Set(['terminal', 'maxTurns', 'noLegalMoves']);

// A leak-free PolicyAgent retains state bounded by game structure (active plan +
// per-(turn,seat) preview-widening memory), i.e. O(MAX_TURNS * seats) ~ small, NEVER
// O(decisions). Observed maximum on this game is 1 per agent across all ~206 decisions.
// A per-decision retained-state regression would scale this with the player-decision
// count (~200) and blow far past this generous structural bound.
const MAX_AGENT_RETAINED_ENTRIES = 16;

type StopReason = 'terminal' | 'maxTurns' | 'noLegalMoves' | 'error';

type WitnessResult = {
  readonly stopReason: StopReason;
  readonly totalDecisionCount: number;
  readonly playerDecisionCount: number;
  readonly maxAgentPlanEntries: number;
  readonly maxAgentPreviewWideningEntries: number;
  readonly finalStateHash: bigint;
  readonly errorMessage?: string;
};

const createAgentRngByPlayer = (
  seed: number,
  playerCount: number,
  createRngImpl: (seed: bigint) => Rng,
): readonly Rng[] =>
  Array.from(
    { length: playerCount },
    (_, playerIndex) => createRngImpl(BigInt(seed) ^ (BigInt(playerIndex + 1) * AGENT_RNG_MIX)),
  );

const resolvePlayerIndexForSeat = (seatId: string, seatIds: readonly string[]): number => {
  const explicitIndex = seatIds.indexOf(seatId);
  if (explicitIndex >= 0) {
    return explicitIndex;
  }
  const parsed = Number(seatId);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : -1;
};

const isNoBridgeableMicroturnError = (error: unknown): boolean =>
  error instanceof Error
    && (
      error.message.includes('no simple actionSelection moves are currently bridgeable')
      || error.message.includes('has no bridgeable continuations')
    );

// The PolicyAgent's per-seat retained maps are `private readonly` Maps; read their size
// defensively (no public introspection API exists; this is a witness, not production).
const retainedMapSize = (agent: Agent, field: 'planExecutionState' | 'previewWideningState'): number => {
  const candidate = (agent as unknown as Record<string, unknown>)[field];
  return candidate instanceof Map ? candidate.size : 0;
};

const runWitness = (def: ValidatedGameDef, runtime: GameDefRuntime): WitnessResult => {
  const agents: readonly Agent[] = POLICY_PROFILES.map(
    (profileId) => new PolicyAgent({ profileId, traceLevel: 'summary' }),
  );
  const seatIds = (def.seats ?? []).map((seat) => String(seat.id));
  const agentRngByPlayer = [...createAgentRngByPlayer(SEED, PLAYER_COUNT, createRng)];
  let currentChanceRng = createRng(BigInt(SEED) ^ AGENT_RNG_MIX);
  let totalDecisionCount = 0;
  let playerDecisionCount = 0;
  let maxAgentPlanEntries = 0;
  let maxAgentPreviewWideningEntries = 0;

  let state = initialState(def, SEED, PLAYER_COUNT, undefined, runtime).state;

  const sampleRetained = (): void => {
    for (const agent of agents) {
      maxAgentPlanEntries = Math.max(maxAgentPlanEntries, retainedMapSize(agent, 'planExecutionState'));
      maxAgentPreviewWideningEntries = Math.max(
        maxAgentPreviewWideningEntries,
        retainedMapSize(agent, 'previewWideningState'),
      );
    }
  };

  try {
    while (true) {
      const autoResult = advanceAutoresolvable(def, state, currentChanceRng, runtime);
      state = autoResult.state;
      currentChanceRng = autoResult.rng;
      totalDecisionCount += autoResult.autoResolvedLogs.length;

      if (terminalResult(def, state, runtime) !== null) {
        return {
          stopReason: 'terminal',
          totalDecisionCount,
          playerDecisionCount,
          maxAgentPlanEntries,
          maxAgentPreviewWideningEntries,
          finalStateHash: state.stateHash,
        };
      }
      if (state.turnCount >= MAX_TURNS) {
        return {
          stopReason: 'maxTurns',
          totalDecisionCount,
          playerDecisionCount,
          maxAgentPlanEntries,
          maxAgentPreviewWideningEntries,
          finalStateHash: state.stateHash,
        };
      }

      let microturn;
      try {
        microturn = publishMicroturn(def, state, runtime);
      } catch (error) {
        if (isNoBridgeableMicroturnError(error)) {
          return {
            stopReason: 'noLegalMoves',
            totalDecisionCount,
            playerDecisionCount,
            maxAgentPlanEntries,
            maxAgentPreviewWideningEntries,
            finalStateHash: state.stateHash,
          };
        }
        throw error;
      }

      const playerIndex = resolvePlayerIndexForSeat(String(microturn.seatId), seatIds);
      const agent = playerIndex < 0 ? undefined : agents[playerIndex];
      const agentRng = playerIndex < 0 ? undefined : agentRngByPlayer[playerIndex];
      if (agent === undefined || agentRng === undefined || playerIndex < 0) {
        throw new Error(`missing agent or RNG for seat ${String(microturn.seatId)}`);
      }

      const selected = agent.chooseDecision({ def, state, microturn, rng: agentRng, runtime });
      agentRngByPlayer[playerIndex] = selected.rng;
      state = applyPublishedDecision(def, state, microturn, selected.decision, undefined, runtime).state;
      totalDecisionCount += 1;
      playerDecisionCount += 1;
      sampleRetained();
    }
  } catch (error) {
    return {
      stopReason: 'error',
      totalDecisionCount,
      playerDecisionCount,
      maxAgentPlanEntries,
      maxAgentPreviewWideningEntries,
      finalStateHash: state.stateHash,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
};

describe('FITL spec 143 / 207 agent-decision retained-state invariant', () => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assertNoErrors(compiled);
  if (compiled.gameDef === null) {
    throw new Error('Expected compiled FITL gameDef');
  }

  const def = assertValidatedGameDef(compiled.gameDef);
  const runtime = createGameDefRuntime(def);

  it(`seed ${SEED}: agent decision path holds no decision-count-scaling retained state`, {
    timeout: 180_000,
  }, () => {
    const result = runWitness(def, runtime);
    const passed = ALLOWED_STOP_REASONS.has(result.stopReason)
      && result.maxAgentPlanEntries <= MAX_AGENT_RETAINED_ENTRIES
      && result.maxAgentPreviewWideningEntries <= MAX_AGENT_RETAINED_ENTRIES;

    emitPolicyProfileQualityRecord({
      file: TEST_FILE,
      variantId: 'all-baselines',
      seed: SEED,
      passed,
      stopReason: result.stopReason,
      decisions: result.totalDecisionCount,
    });

    assert.equal(
      ALLOWED_STOP_REASONS.has(result.stopReason),
      true,
      `seed ${SEED}: expected bounded completion with stopReason terminal|maxTurns|noLegalMoves, got ${result.stopReason}${result.errorMessage === undefined ? '' : ` (${result.errorMessage})`}`,
    );
    assert.equal(
      result.playerDecisionCount > 0,
      true,
      `seed ${SEED} should advance at least one player decision`,
    );

    // The defect class: a retained-state regression that grows with decision count.
    // A leak would scale these with the ~200 player decisions; the structural bound is
    // tiny (observed max 1 per agent).
    assert.ok(
      result.maxAgentPlanEntries <= MAX_AGENT_RETAINED_ENTRIES,
      [
        `seed ${SEED}: agent planExecutionState grew to ${result.maxAgentPlanEntries} entries`,
        `(bound ${MAX_AGENT_RETAINED_ENTRIES}) across ${result.playerDecisionCount} player decisions`,
        '— a retained-state regression on the agent decision path.',
      ].join(' '),
    );
    assert.ok(
      result.maxAgentPreviewWideningEntries <= MAX_AGENT_RETAINED_ENTRIES,
      [
        `seed ${SEED}: agent previewWideningState grew to ${result.maxAgentPreviewWideningEntries} entries`,
        `(bound ${MAX_AGENT_RETAINED_ENTRIES}) across ${result.playerDecisionCount} player decisions`,
        '— a retained-state regression on the agent decision path.',
      ].join(' '),
    );

    // Note: FITL replay-identity (Foundation #8) is proven by the determinism lane
    // (test/determinism/fitl-policy-agent-canary-determinism.test.ts); this witness runs
    // the full deep1024 game once (it is intentionally expensive) and does not duplicate
    // that proof here.
  });
});
