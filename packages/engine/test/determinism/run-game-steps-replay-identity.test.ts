// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertValidatedGameDef,
  asActionId,
  asPhaseId,
  createGameDefRuntime,
  type DecisionLog,
  type ProbeHoleRecoveryLog,
  type ValidatedGameDef,
} from '../../src/kernel/index.js';
import { runGameSteps, type RunGameInput, type RunGameStep } from '../../src/sim/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { eff } from '../helpers/effect-tag-helper.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import { firstLegalAgent } from '../helpers/test-agents.js';

interface StepProjectionBase {
  readonly kind: RunGameStep['kind'];
  readonly stateHash: string;
  readonly turnCount: number;
}

type StepProjection =
  | (StepProjectionBase & {
    readonly kind: 'auto';
    readonly autoResolvedLogs: readonly DecisionLogProjection[];
  })
  | (StepProjectionBase & {
    readonly kind: 'player';
    readonly microturnKind: string;
    readonly frameId: string;
    readonly decisionLog: DecisionLogProjection;
  })
  | (StepProjectionBase & {
    readonly kind: 'recovery';
    readonly logEntry: ProbeHoleRecoveryProjection;
  })
  | (StepProjectionBase & {
    readonly kind: 'terminal' | 'maxTurns' | 'noLegalMoves';
    readonly stopReason: string;
    readonly resultType: string | null;
  });

interface DecisionLogProjection {
  readonly stateHash: string;
  readonly seatId: string;
  readonly playerId: string | null;
  readonly decisionContextKind: string;
  readonly decisionKey: string | null;
  readonly decision: DecisionLog['decision'];
  readonly turnId: string;
  readonly turnRetired: boolean;
  readonly legalActionCount: number;
  readonly triggerFirings: number;
  readonly warnings: number;
  readonly deltas: number;
}

interface ProbeHoleRecoveryProjection {
  readonly stateHashBefore: string;
  readonly stateHashAfter: string;
  readonly seatId: string;
  readonly turnId: string;
  readonly blacklistedActionId: string;
  readonly rolledBackFrames: number;
  readonly reason: string;
}

const collectStepProjection = (input: RunGameInput): readonly StepProjection[] =>
  [...runGameSteps(input)].map(projectStep);

const projectDecisionLog = (log: DecisionLog): DecisionLogProjection => ({
  stateHash: log.stateHash.toString(),
  seatId: String(log.seatId),
  playerId: log.playerId === undefined ? null : String(log.playerId),
  decisionContextKind: log.decisionContextKind,
  decisionKey: log.decisionKey === null ? null : String(log.decisionKey),
  decision: log.decision,
  turnId: String(log.turnId),
  turnRetired: log.turnRetired,
  legalActionCount: log.legalActionCount,
  triggerFirings: log.triggerFirings.length,
  warnings: log.warnings.length,
  deltas: log.deltas.length,
});

const projectProbeHoleRecovery = (logEntry: ProbeHoleRecoveryLog): ProbeHoleRecoveryProjection => ({
  stateHashBefore: logEntry.stateHashBefore.toString(),
  stateHashAfter: logEntry.stateHashAfter.toString(),
  seatId: String(logEntry.seatId),
  turnId: String(logEntry.turnId),
  blacklistedActionId: String(logEntry.blacklistedActionId),
  rolledBackFrames: logEntry.rolledBackFrames,
  reason: logEntry.reason,
});

const projectStep = (step: RunGameStep): StepProjection => {
  const base = {
    kind: step.kind,
    stateHash: step.state.stateHash.toString(),
    turnCount: step.state.turnCount,
  };

  switch (step.kind) {
    case 'auto':
      return {
        ...base,
        kind: step.kind,
        autoResolvedLogs: step.autoResolvedLogs.map(projectDecisionLog),
      };
    case 'player':
      return {
        ...base,
        kind: step.kind,
        microturnKind: step.microturn.kind,
        frameId: String(step.microturn.frameId),
        decisionLog: projectDecisionLog(step.decisionLog),
      };
    case 'recovery':
      return {
        ...base,
        kind: step.kind,
        logEntry: projectProbeHoleRecovery(step.logEntry),
      };
    case 'terminal':
    case 'maxTurns':
    case 'noLegalMoves':
      return {
        ...base,
        kind: step.kind,
        stopReason: step.stopReason,
        resultType: step.result?.type ?? null,
      };
  }
};

const createSyntheticDef = (): ValidatedGameDef =>
  assertValidatedGameDef({
    metadata: { id: 'run-game-steps-replay-identity-synthetic', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 10 }],
    perPlayerVars: [],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [
      {
        id: asActionId('score'),
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [eff({ addVar: { scope: 'global', var: 'score', delta: 1 } })],
        limits: [],
      },
    ],
    triggers: [],
    terminal: {
      conditions: [{ when: { op: '>=', left: { _t: 2 as const, ref: 'gvar', var: 'score' }, right: 2 }, result: { type: 'draw' } }],
    },
  });

const createFitlDef = (): ValidatedGameDef => {
  const compiled = compileProductionSpec();
  assertNoErrors(compiled.parsed);
  assertNoErrors(compiled.compiled);
  return assertValidatedGameDef(compiled.compiled.gameDef);
};

describe('runGameSteps replay identity', () => {
  it('emits byte-identical projected steps for a synthetic game', () => {
    const def = createSyntheticDef();
    const input = {
      def,
      seed: 152004,
      agents: [firstLegalAgent, firstLegalAgent],
      maxTurns: 5,
      runtime: createGameDefRuntime(def),
    } satisfies RunGameInput;

    assert.deepEqual(collectStepProjection(input), collectStepProjection(input));
  });

  it('emits byte-identical projected steps for a FITL representative run', () => {
    const def = createFitlDef();
    const createInput = (): RunGameInput => ({
      def,
      seed: 1005,
      agents: [firstLegalAgent, firstLegalAgent, firstLegalAgent, firstLegalAgent],
      maxTurns: 0,
      playerCount: 4,
      options: { skipDeltas: true },
      runtime: createGameDefRuntime(def),
    });

    assert.deepEqual(collectStepProjection(createInput()), collectStepProjection(createInput()));
  });
});
