#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = (() => {
  let cur = HERE;
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(join(cur, 'pnpm-workspace.yaml'))) return cur;
    cur = join(cur, '..');
  }
  return process.cwd();
})();

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] !== undefined ? args[index + 1] : fallback;
};

const SEED = Number(getArg('seed', '1002'));
const PROFILE = getArg('profile', SEED === 123 ? 'random' : 'arvn-evolved');
const MAX_TURNS = Number(getArg('max-turns', '200'));
const PLAYER_COUNT = 4;

const { loadGameSpecBundleFromEntrypoint, runGameSpecStagesFromBundle } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/cnl/index.js'));
const { assertValidatedGameDef, createGameDefRuntime } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/kernel/index.js'));
const { PolicyAgent, RandomAgent } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/agents/index.js'));
const { runGame } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/sim/index.js'));
const { classifyMoveDecisionSequenceSatisfiability } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/kernel/move-decision-sequence.js'));
const { toMoveIdentityKey } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/kernel/move-identity.js'));
const { createPerfProfiler } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/kernel/perf-profiler.js'));

const entrypoint = join(REPO_ROOT, 'data', 'games', 'fire-in-the-lake.game-spec.md');
const bundle = loadGameSpecBundleFromEntrypoint(entrypoint);
const staged = runGameSpecStagesFromBundle(bundle);
if (staged.validation.blocked || staged.compilation.blocked) {
  console.error('Compilation/validation blocked');
  process.exit(1);
}
const def = assertValidatedGameDef(staged.compilation.result.gameDef);
const runtime = createGameDefRuntime(def);

const profileIds = (def.seats ?? []).map((seat) => {
  const seatId = seat.id.toLowerCase();
  if (PROFILE === 'random') {
    return null;
  }
  return seatId === 'arvn' ? PROFILE : `${seatId}-baseline`;
});

let captured = null;

const makeAgent = (profileId) => {
  if (PROFILE === 'random') {
    const inner = new RandomAgent();
    return {
      chooseMove(input) {
        if (captured === null) {
          const certificateCandidate = input.legalMoves.find((classified) => {
            if (classified.viability.complete || classified.viability.stochasticDecision !== undefined) {
              return false;
            }
            const stableMoveKey = toMoveIdentityKey(def, classified.move);
            return input.certificateIndex?.has(stableMoveKey) ?? false;
          });
          if (certificateCandidate !== undefined) {
            const stableMoveKey = toMoveIdentityKey(def, certificateCandidate.move);
            captured = {
              mode: 'live replay witness capture',
              playerId: input.playerId,
              state: input.state,
              stateHash: input.state.stateHash,
              move: certificateCandidate.move,
              certificate: input.certificateIndex.get(stableMoveKey),
              runtime: input.runtime,
              warnings: certificateCandidate.viability.warnings ?? [],
            };
          }
        }
        return inner.chooseMove(input);
      },
    };
  }

  const inner = new PolicyAgent({ profileId, traceLevel: 'summary' });
  return {
    chooseMove(input) {
      if (captured === null) {
        const certificateCandidate = input.legalMoves.find((classified) => {
          if (classified.viability.complete || classified.viability.stochasticDecision !== undefined) {
            return false;
          }
          const stableMoveKey = toMoveIdentityKey(def, classified.move);
          return input.certificateIndex?.has(stableMoveKey) ?? false;
        });
        if (certificateCandidate !== undefined) {
          const stableMoveKey = toMoveIdentityKey(def, certificateCandidate.move);
          captured = {
            mode: 'live replay witness capture',
            playerId: input.playerId,
            state: input.state,
            stateHash: input.state.stateHash,
            move: certificateCandidate.move,
            certificate: input.certificateIndex.get(stableMoveKey),
            runtime: input.runtime,
            warnings: certificateCandidate.viability.warnings ?? [],
          };
        }
      }
      return inner.chooseMove(input);
    },
  };
};

const agents = profileIds.map((profileId) => makeAgent(profileId));
runGame(def, SEED, agents, MAX_TURNS, PLAYER_COUNT, { skipDeltas: true }, runtime);

if (captured === null) {
  console.error(`No certificate-search witness found for seed=${SEED} profile=${PROFILE}.`);
  process.exit(1);
}

const profiler = createPerfProfiler();
const classification = classifyMoveDecisionSequenceSatisfiability(
  def,
  captured.state,
  captured.move,
  {
    emitCompletionCertificate: true,
    profiler,
  },
  captured.runtime,
);

console.log(`# Spec 139 I2 certificate-search diagnostic`);
console.log(`seed=${SEED}`);
console.log(`profile=${PROFILE}`);
console.log(`witnessMode=${captured.mode}`);
console.log(`stateHash=${captured.stateHash.toString()}`);
console.log(`playerId=${captured.playerId}`);
console.log(`actionId=${String(captured.move.actionId)}`);
console.log(`terminalVerdict=${classification.classification}`);
console.log(`witnessWarnings=${JSON.stringify(captured.warnings)}`);
console.log(`probeStepsConsumed=${classification.certificate?.diagnostics?.probeStepsConsumed ?? 0}`);
console.log(`paramExpansionsConsumed=${classification.certificate?.diagnostics?.paramExpansionsConsumed ?? 0}`);
console.log(`memoHits=${classification.certificate?.diagnostics?.memoHits ?? 0}`);
console.log(`nogoodsRecorded=${classification.certificate?.diagnostics?.nogoodsRecorded ?? 0}`);
console.log(`generatedCertificate=${JSON.stringify(classification.certificate ?? null)}`);
