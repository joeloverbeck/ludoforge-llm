// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../src/agents/index.js';
import { assertValidatedGameDef, createGameDefRuntime, type GameTrace } from '../../src/kernel/index.js';
import { runGame } from '../../src/sim/index.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

interface OutcomeParityFixture {
  readonly seed: number;
  readonly maxTurns: number;
  readonly profileId: 'arvn-evolved';
  readonly decisions: readonly OutcomeParityDecision[];
}

interface OutcomeParityDecision {
  readonly turnCount: number | null;
  readonly turnId: number | null;
  readonly decisionKey: string;
  readonly selectedValue: unknown;
  readonly selectedStableMoveKey: string | null;
  readonly previewUsage: unknown;
  readonly advisories: readonly unknown[];
  readonly scoreContributionsByOption: readonly unknown[];
}

const WITNESS_SEEDS = [1005, 1011, 1008, 1013, 1009] as const;
const PLAYER_COUNT = 4;
const PROFILE_ID = 'arvn-evolved';
const WITNESS_MAX_TURNS = 1;
const { compiled: PRODUCTION_COMPILE_RESULT } = compileProductionSpec();
const PRODUCTION_GAME_DEF = assertValidatedGameDef(PRODUCTION_COMPILE_RESULT.gameDef);

const resolveRepoRoot = (): string => {
  let cursor = process.cwd();
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(join(cursor, 'pnpm-workspace.yaml'))) {
      return cursor;
    }
    cursor = join(cursor, '..');
  }
  return process.cwd();
};

const fixturePathForSeed = (seed: number): string =>
  join(resolveRepoRoot(), 'packages', 'engine', 'test', 'architecture', 'fixtures', `178-outcome-parity-${seed}.json`);

const readFixture = (seed: number): OutcomeParityFixture =>
  JSON.parse(readFileSync(fixturePathForSeed(seed), 'utf8')) as OutcomeParityFixture;

const profileForSeat = (seatId: string): string =>
  seatId.toLowerCase() === 'arvn' ? PROFILE_ID : `${seatId.toLowerCase()}-baseline`;

const createPolicyAgents = (): readonly PolicyAgent[] =>
  (PRODUCTION_GAME_DEF.seats ?? []).map((seat) => new PolicyAgent({
    profileId: profileForSeat(String(seat.id)),
    traceLevel: 'verbose',
  }));

const selectedValueFor = (decision: GameTrace['decisions'][number]['decision']): unknown =>
  'value' in decision ? decision.value : null;

const collectCandidates = (
  agentDecision: NonNullable<GameTrace['decisions'][number]['agentDecision']>,
): readonly unknown[] => (agentDecision.candidates ?? []).map((candidate) => ({
  stableMoveKey: candidate.stableMoveKey,
  score: candidate.score,
  scoreContributions: candidate.scoreContributions,
  unknownPreviewRefs: candidate.unknownPreviewRefs ?? [],
  previewFallbackFired: candidate.previewFallbackFired ?? null,
  selectionReason: candidate.selectionReason,
  previewOutcome: candidate.previewOutcome ?? null,
  previewDrive: candidate.previewDrive ?? null,
}));

const normalize = <T>(value: T): T =>
  JSON.parse(`${JSON.stringify(value, (_key, nested) => (typeof nested === 'bigint' ? nested.toString() : nested), 2)}\n`) as T;

const captureOutcomeParity = (seed: number, maxTurns: number): OutcomeParityFixture => {
  assert.equal(maxTurns, WITNESS_MAX_TURNS, 'outcome parity fixtures intentionally pin the first-turn witness window');
  const runtime = createGameDefRuntime(PRODUCTION_GAME_DEF);
  const trace = runGame(
    PRODUCTION_GAME_DEF,
    seed,
    createPolicyAgents(),
    maxTurns,
    PLAYER_COUNT,
    { skipDeltas: true },
    runtime,
  );
  const decisions: readonly OutcomeParityDecision[] = trace.decisions
    .filter((entry) => entry.decisionContextKind === 'chooseOne')
    .filter((entry) => entry.agentDecision?.resolvedProfileId === PROFILE_ID)
    .filter((entry) => entry.agentDecision?.previewUsage.coverage.strategy === 'continuedDeepening')
    .map((entry) => {
      const agentDecision = entry.agentDecision;
      assert.ok(agentDecision, 'continuedDeepening ARVN chooseOne decisions must include policy trace metadata');
      return {
        turnCount: null,
        turnId: entry.turnId ?? null,
        decisionKey: String(entry.decisionKey),
        selectedValue: selectedValueFor(entry.decision),
        selectedStableMoveKey: agentDecision.selectedStableMoveKey ?? null,
        previewUsage: agentDecision.previewUsage,
        advisories: agentDecision.advisories ?? [],
        scoreContributionsByOption: collectCandidates(agentDecision),
      };
    });
  assert.ok(decisions.length > 0, `seed ${seed} must exercise arvn-evolved continuedDeepening chooseOne decisions`);
  return normalize({ seed, maxTurns, profileId: PROFILE_ID, decisions });
};

describe('Spec 178 chooseOne inner-preview outcome parity', () => {
  for (const seed of WITNESS_SEEDS) {
    it(`preserves ARVN continuedDeepening chooseOne outcomes for seed ${seed}`, { timeout: 90_000 }, () => {
      const expected = readFixture(seed);
      const actual = captureOutcomeParity(seed, expected.maxTurns);
      assert.deepEqual(actual, expected);
    });
  }
});
