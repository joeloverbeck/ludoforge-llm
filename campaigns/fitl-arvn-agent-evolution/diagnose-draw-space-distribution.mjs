#!/usr/bin/env node
/**
 * Spec 138 / I1: characterize the head chooseN draw-space outcomes for the
 * failing NVA march template on a captured pre-terminal state.
 *
 * Usage:
 *   node diagnose-draw-space-distribution.mjs --seed 1002 [--max-turns 200]
 */

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
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
const MAX_TURNS = Number(getArg('max-turns', '200'));
const EVOLVED_SEAT = getArg('evolved-seat', 'arvn');
const PLAYER_COUNT = 4;

const { loadGameSpecBundleFromEntrypoint, runGameSpecStagesFromBundle } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/cnl/index.js'));
const { assertValidatedGameDef, createGameDefRuntime } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/kernel/index.js'));
const { PolicyAgent } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/agents/index.js'));
const { runGame } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/sim/index.js'));
const { completeMoveDecisionSequence } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/kernel/move-decision-completion.js'));
const { classifyMoveDecisionSequenceSatisfiability } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/kernel/move-decision-sequence.js'));
const { legalChoicesDiscover } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/kernel/legal-choices.js'));
const { isEffectRuntimeReason } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/kernel/effect-error.js'));
const { EFFECT_RUNTIME_REASONS } =
  await import(join(REPO_ROOT, 'packages/engine/dist/src/kernel/runtime-reasons.js'));

const entrypoint = join(REPO_ROOT, 'data', 'games', 'fire-in-the-lake.game-spec.md');
const bundle = loadGameSpecBundleFromEntrypoint(entrypoint);
const staged = runGameSpecStagesFromBundle(bundle);
if (staged.validation.blocked || staged.compilation.blocked) {
  console.error('Compilation/validation blocked');
  process.exit(1);
}

const def = assertValidatedGameDef(staged.compilation.result.gameDef);
const runtime = createGameDefRuntime(def);

const seats = def.seats ?? [];
const seatProfiles = seats.map((seat) => {
  const seatId = seat.id.toLowerCase();
  return seatId === EVOLVED_SEAT.toLowerCase() ? `${seatId}-evolved` : `${seatId}-baseline`;
});

let capturedInput = null;
class CaptureAgent {
  constructor(config) {
    this.inner = new PolicyAgent(config);
  }

  chooseMove(input) {
    try {
      return this.inner.chooseMove(input);
    } catch (error) {
      if (capturedInput === null) {
        capturedInput = input;
      }
      throw error;
    }
  }
}

const asHexBigInt = (value) => (typeof value === 'bigint' ? `0x${value.toString(16)}` : String(value));

const isBudgetExceeded = (message) => typeof message === 'string' && /BUDGET|EXCEEDED/i.test(message);
const isChoiceValidationFailure = (message) =>
  typeof message === 'string' &&
  /(CHOICE_RUNTIME_VALIDATION_FAILED|LEGAL_CHOICES_VALIDATION_FAILED)/i.test(message);

const classifyOutcome = (request, classification, warnings, error) => {
  const warningCodes = warnings.map((warning) => String(warning.code ?? ''));
  if (warningCodes.some((code) => isBudgetExceeded(code))) {
    return 'budgetExceeded';
  }
  if (request?.kind === 'pendingStochastic') {
    return 'stochasticUnresolved';
  }
  if (request?.kind === 'complete') {
    return 'completed';
  }
  if (request?.kind === 'illegal' || classification === 'unsatisfiable') {
    return 'illegal';
  }
  const code = error?.code ?? error?.cause?.code;
  const message = error?.message ?? error?.cause?.message;
  if (isChoiceValidationFailure(code) || isChoiceValidationFailure(message)) {
    return 'choiceValidationFailed';
  }
  if (isBudgetExceeded(code) || isBudgetExceeded(message)) {
    return 'budgetExceeded';
  }
  if (classification === 'satisfiable') {
    return 'completed';
  }
  return 'unknown';
};

const analyzeMove = (move, moveIndex, state) => {
  const headProbe = completeMoveDecisionSequence(
    def,
    state,
    move,
    {
      choose: () => undefined,
      chooseStochastic: () => undefined,
    },
    runtime,
  );

  const headDecision = headProbe.nextDecision;
  if (headDecision === undefined || headDecision.type !== 'chooseN') {
    throw new Error(
      `Expected a head chooseN request for move[${moveIndex}] ${String(move.actionId)}, got ${
        headDecision?.type ?? headProbe.complete ? 'resolved' : 'non-chooseN'
      }`,
    );
  }

  const optionOutcomes = headDecision.options.map((option, optionIndex) => {
    let warnings = [];
    let request = undefined;
    let classification = null;
    let error = undefined;
    const forcedMove = {
      ...move,
      params: {
        ...move.params,
        [headDecision.decisionKey]: [option.value],
      },
    };
    try {
      request = legalChoicesDiscover(
        def,
        state,
        forcedMove,
        {
          onDeferredPredicatesEvaluated: () => {},
        },
        runtime,
      );
      if (request.kind === 'pending') {
        classification = classifyMoveDecisionSequenceSatisfiability(
          def,
          state,
          forcedMove,
          {
            onWarning: (warning) => {
              warnings.push(warning);
            },
          },
          runtime,
        ).classification;
      }
    } catch (caught) {
      if (
        isEffectRuntimeReason(caught, EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED)
      ) {
        error = caught;
      } else {
        throw caught;
      }
    }

    if (request === undefined && error === undefined) {
      try {
        const fallback = completeMoveDecisionSequence(
          def,
          state,
          forcedMove,
          {
            choose: () => undefined,
            chooseStochastic: () => undefined,
          },
          runtime,
        );
        if (fallback.complete) {
          request = { kind: 'complete' };
        } else if (fallback.illegal !== undefined) {
          request = fallback.illegal;
        } else if (fallback.stochasticDecision !== undefined) {
          request = { kind: 'pendingStochastic' };
        } else if (fallback.nextDecision !== undefined) {
          request = fallback.nextDecision;
        }
      } catch (caught) {
        error = caught;
      }
    }

    return {
      index: optionIndex,
      value: option.value,
      outcome: classifyOutcome(request, classification, warnings, error),
    };
  });

  return {
    actionId: String(move.actionId),
    headDecisionKey: String(headDecision.decisionKey),
    headOptionCount: headDecision.options.length,
    optionOutcomes,
  };
};

const agents = seatProfiles.map(
  (profileId) => new CaptureAgent({ profileId, traceLevel: 'summary' }),
);

console.error(`Running seed ${SEED} with max-turns=${MAX_TURNS}`);
try {
  runGame(def, SEED, agents, MAX_TURNS, PLAYER_COUNT, undefined, runtime);
} catch (error) {
  console.error(`Run terminated while capturing input: ${error.message}`);
}

if (capturedInput === null) {
  console.error('No captured failing state was found for this seed.');
  process.exit(1);
}

const candidateMoves = capturedInput.legalMoves.filter(
  (classifiedMove) => classifiedMove.viability.viable === true && classifiedMove.viability.complete !== true,
);

if (candidateMoves.length === 0) {
  console.error('No viable incomplete moves were available at the captured state.');
  process.exit(1);
}

const fixture = {
  seed: SEED,
  stateHash: asHexBigInt(capturedInput.state.stateHash),
  activePlayer: Number(capturedInput.state.activePlayer),
  moves: candidateMoves.map((classifiedMove, moveIndex) =>
    analyzeMove(classifiedMove.move, moveIndex, capturedInput.state),
  ),
};

for (const [moveIndex, move] of fixture.moves.entries()) {
  console.error(
    `\nmove[${moveIndex}] actionId=${move.actionId} headDecisionKey=${move.headDecisionKey} options=${move.headOptionCount}`,
  );
  console.error('index\tvalue\toutcome');
  for (const outcome of move.optionOutcomes) {
    console.error(`${outcome.index}\t${JSON.stringify(outcome.value)}\t${outcome.outcome}`);
  }
}

process.stdout.write(`${JSON.stringify(fixture, null, 2)}\n`);
