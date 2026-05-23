// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertValidatedGameDef,
  createGameDefRuntime,
  type Agent,
} from '../../src/kernel/index.js';
import { runGame } from '../../src/sim/index.js';
import { getFitlProductionFixture } from '../helpers/production-spec-helpers.js';
import { createSeededChoiceAgents } from '../helpers/test-agents.js';

const PLAYER_COUNT = 4;

const WORKLOAD_VARIANTS = [
  {
    key: 'parity-drive',
    seed: 42,
    maxTurns: 1,
    notes: 'reduced from the four-profile perf gate to a one-turn seeded-choice trajectory',
  },
  {
    key: 'arvn-tournament-parallel',
    seed: 1000,
    maxTurns: 1,
    notes: 'serial one-turn stand-in for the tournament seed set',
  },
  {
    key: 'arvn-tournament-wasm-equivalence',
    seed: 1000,
    maxTurns: 1,
    notes: 'one-turn stand-in for the post-Spec-190 planless-control equivalence surface',
  },
  {
    key: 'policy-preview-parity-arvn-1008',
    seed: 1008,
    maxTurns: 1,
    notes: 'seed-preserving reduced variant of the policy-preview-parity workload',
  },
  {
    key: 'bounded-termination-1002',
    seed: 1002,
    maxTurns: 1,
    notes: 'seed-preserving reduced variant of the bounded-termination workload',
  },
  {
    key: 'diagnose-parity-runGame-1001',
    seed: 1001,
    maxTurns: 1,
    notes: 'seed-preserving reduced variant of the diagnose-parity runGame workload',
  },
] as const;

interface CapturedProfile {
  readonly kind: 'per-decision-profile';
  readonly entries: readonly {
    readonly turnId: number;
    readonly seatId: string;
    readonly decisionKind: string;
    readonly decisionKey: string;
    readonly wallClockMs: number;
    readonly candidateCount: number;
    readonly sourceStateHash: string;
  }[];
}

describe('Spec 192 per-decision profile trajectory identity', () => {
  const def = assertValidatedGameDef(getFitlProductionFixture().gameDef);
  const runtime = createGameDefRuntime(def);

  for (const workload of WORKLOAD_VARIANTS) {
    it(`${workload.key}: ENGINE_PER_DECISION_PROFILE preserves trajectory`, () => {
      const baseline = runReducedWorkload(workload.seed, workload.maxTurns, false);
      const profiled = runReducedWorkload(workload.seed, workload.maxTurns, true);

      assert.equal(
        profiled.trace.finalState.stateHash,
        baseline.trace.finalState.stateHash,
        `${workload.key}: final state hash changed with ENGINE_PER_DECISION_PROFILE=1 (${workload.notes})`,
      );
      assert.equal(
        profiled.trace.decisions.length,
        baseline.trace.decisions.length,
        `${workload.key}: decision count changed with ENGINE_PER_DECISION_PROFILE=1 (${workload.notes})`,
      );
      assert.equal(baseline.profileLines.length, 0, `${workload.key}: env flag unset should not emit profile lines`);
      assert.equal(profiled.profileLines.length, 1, `${workload.key}: env flag set should emit one profile line`);

      const profile = parseProfileLine(profiled.profileLines[0]!);
      assert.equal(profile.kind, 'per-decision-profile');
      assert.ok(profile.entries.length > 0, `${workload.key}: expected at least one per-decision entry`);
      for (const entry of profile.entries) {
        assert.ok(Number.isFinite(entry.turnId), `${workload.key}: finite turnId`);
        assert.ok(entry.seatId.length > 0, `${workload.key}: seatId populated`);
        assert.ok(entry.decisionKind.length > 0, `${workload.key}: decisionKind populated`);
        assert.ok(Number.isFinite(entry.wallClockMs) && entry.wallClockMs >= 0, `${workload.key}: valid wallClockMs`);
        assert.ok(Number.isInteger(entry.candidateCount) && entry.candidateCount >= 0, `${workload.key}: valid candidateCount`);
        assert.match(entry.sourceStateHash, /^0x[0-9a-f]+$/u, `${workload.key}: sourceStateHash is hex`);
      }
    });
  }

  function runReducedWorkload(seed: number, maxTurns: number, profileEnabled: boolean) {
    return withPerDecisionProfileEnv(profileEnabled, () => {
      const agents: readonly Agent[] = createSeededChoiceAgents(PLAYER_COUNT);
      const trace = runGame(
        def,
        seed,
        agents,
        maxTurns,
        PLAYER_COUNT,
        {
          skipDeltas: true,
          traceRetention: 'full',
        },
        runtime,
      );
      return trace;
    });
  }
});

function parseProfileLine(line: string): CapturedProfile {
  const prefix = '[per-decision-profile] ';
  assert.ok(line.startsWith(prefix), `Expected profile line to start with ${prefix}`);
  return JSON.parse(line.slice(prefix.length)) as CapturedProfile;
}

function withPerDecisionProfileEnv<T>(
  enabled: boolean,
  run: () => T,
): { readonly trace: T; readonly profileLines: readonly string[] } {
  const previousEnv = process.env.ENGINE_PER_DECISION_PROFILE;
  const originalWrite = process.stderr.write;
  const chunks: string[] = [];
  const interceptedWrite = ((chunk: string | Uint8Array, encodingOrCallback?: BufferEncoding | ((err?: Error) => void), callback?: (err?: Error) => void): boolean => {
    chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
    if (typeof encodingOrCallback === 'function') {
      encodingOrCallback();
    }
    callback?.();
    return true;
  }) as typeof process.stderr.write;

  try {
    if (enabled) {
      process.env.ENGINE_PER_DECISION_PROFILE = '1';
    } else {
      delete process.env.ENGINE_PER_DECISION_PROFILE;
    }
    process.stderr.write = interceptedWrite;
    const trace = run();
    return {
      trace,
      profileLines: chunks.join('').split('\n').filter((line) => line.startsWith('[per-decision-profile] ')),
    };
  } finally {
    process.stderr.write = originalWrite;
    if (previousEnv === undefined) {
      delete process.env.ENGINE_PER_DECISION_PROFILE;
    } else {
      process.env.ENGINE_PER_DECISION_PROFILE = previousEnv;
    }
  }
}
