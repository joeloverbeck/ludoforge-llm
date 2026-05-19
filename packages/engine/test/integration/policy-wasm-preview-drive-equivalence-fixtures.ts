import { createHash } from 'node:crypto';

import { applyPreviewMove, createPolicyPreviewRuntime } from '../../src/agents/policy-preview.js';
import {
  definePolicyWasmProductionPreviewStateSlots,
  evaluateProductionPreviewDriveBatchWithWasm,
} from '../../src/agents/policy-wasm-production-preview-drive.js';
import type { PolicyWasmProductionPreviewDriveCandidate } from '../../src/agents/policy-wasm-production-preview-drive-types.js';
import type {
  PolicyWasmDecisionStackPublication,
  PolicyWasmPreviewDriveBatchInput,
  PolicyWasmPreviewDriveResult,
  PolicyWasmPreviewDriveRow,
  PolicyWasmPreviewSignalCarrier,
} from '../../src/agents/policy-wasm-preview-drive.js';
import type { PolicyWasmRuntime } from '../../src/agents/policy-wasm-runtime.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  assertValidatedGameDef,
  createTrustedExecutableMove,
  initialState,
  serializeGameState,
  type ActionDef,
  type ActionPipelineDef,
  type GameDef,
  type GameState,
  type TrustedExecutableMove,
} from '../../src/kernel/index.js';
import { eff } from '../helpers/effect-tag-helper.js';
export {
  assertDeepProjectedStateUnsupportedParity,
  assertProductionUnsupportedReasonScoreParity,
  unsupportedPreviewDriveReasonFixtures,
  unsupportedPreviewDriveReasonFor,
  type UnsupportedPreviewDriveOwnerSlug,
  type UnsupportedPreviewDriveReasonFixture,
} from './policy-wasm-preview-drive-unsupported-fixtures.js';

const phaseId = asPhaseId('main');

const readyContinuedDeepeningCarrier: PolicyWasmPreviewSignalCarrier = {
  previewStatus: 'ready',
  previewBranch: 'continuedDeepening',
  tiebreakAfterPreviewNoSignal: false,
  policyPreviewSignalUnavailable: false,
};

const decisionStackPublication: PolicyWasmDecisionStackPublication = {
  maxDepth: 3,
  frames: [
    {
      frameId: 1,
      parentFrameId: null,
      turnId: 0,
      depth: 0,
      variant: 'actionSelection',
      contextId: 'root',
    },
    {
      frameId: 2,
      parentFrameId: 1,
      turnId: 0,
      depth: 1,
      variant: 'chooseOne',
      contextId: 'branch:$pick',
    },
    {
      frameId: 3,
      parentFrameId: 2,
      turnId: 0,
      depth: 2,
      variant: 'chooseNStep',
      contextId: 'branch:$targets',
    },
  ],
};

export interface PreviewDriveParityFixture {
  readonly def: GameDef;
  readonly state: GameState;
  readonly candidate: PolicyWasmProductionPreviewDriveCandidate;
  readonly referencePreviewState: GameState;
  readonly expected: PreviewDriveRowOracle;
}

export interface PreviewDriveRowOracle {
  readonly stableMoveKey: string;
  readonly outcome: PolicyWasmPreviewDriveRow['outcome'];
  readonly value: number;
  readonly previewStateValues: Readonly<Record<string, number>>;
  readonly previewSignalCarrier: PolicyWasmPreviewSignalCarrier;
  readonly candidateGroup: NonNullable<PolicyWasmPreviewDriveRow['candidateGroup']>;
  readonly decisionStackPublication: PolicyWasmDecisionStackPublication;
  readonly continuedDeepeningCompletionRecords: NonNullable<PolicyWasmPreviewDriveRow['continuedDeepeningCompletionRecords']>;
  readonly previewStateHash: string;
  readonly rowDigest: string;
}

const previewScoreSlot = 'global.score';
const previewVictoryMarginSlot = 'surface.victoryCurrentMargin.self';
const previewOpponentVictoryMarginSlot = 'surface.victoryCurrentMargin.1';

export const previewStateSlots = definePolicyWasmProductionPreviewStateSlots([
  previewScoreSlot,
  previewVictoryMarginSlot,
  previewOpponentVictoryMarginSlot,
]);

export const createSupportedPreviewDriveParityFixtures = (): readonly PreviewDriveParityFixture[] => {
  const def = createSupportedPreviewDriveDef();
  const state = initialState(def, 174, 2).state;
  const trustedMove = trustedMoveFor(state, 'branch');
  return [0, 1].map((index) => {
    const stableMoveKey = `branch:${index}`;
    const candidateGroup = {
      groupId: 'action:branch',
      ordinalInGroup: index,
      groupSize: 2,
    };
    const continuedDeepeningCompletionRecords = [
      { iterationIndex: 0, residualBudget: 5, outcome: 'completed' },
      { iterationIndex: 1, residualBudget: 4, outcome: 'completed' },
    ] as const;
    const candidate: PolicyWasmProductionPreviewDriveCandidate = {
      move: trustedMove.move,
      stableMoveKey,
      actionId: 'branch',
      candidateGroup,
      decisionStackPublication,
      continuedDeepeningCompletionRecords,
    };
    const previewState = createTsPreviewRuntime(def, state, trustedMove).getPreviewState(candidate);
    if (previewState === undefined || typeof previewState.globalVars.score !== 'number') {
      throw new Error('supported preview-drive fixture did not produce a numeric preview state');
    }
    const projectedSelfMargin = previewState.globalVars.score;
    const expected = {
      stableMoveKey,
      outcome: 'completed',
      value: previewState.globalVars.score,
      previewStateValues: {
        [previewScoreSlot]: previewState.globalVars.score,
        [previewVictoryMarginSlot]: projectedSelfMargin,
        [previewOpponentVictoryMarginSlot]: 0,
      },
      previewSignalCarrier: readyContinuedDeepeningCarrier,
      candidateGroup,
      decisionStackPublication,
      continuedDeepeningCompletionRecords,
      previewStateHash: serializeGameState(previewState).stateHash,
    } satisfies Omit<PreviewDriveRowOracle, 'rowDigest'>;
    return {
      def,
      state,
      candidate,
      referencePreviewState: previewState,
      expected: {
        ...expected,
        rowDigest: digestPreviewDriveRow({
          stableMoveKey: expected.stableMoveKey,
          outcome: expected.outcome,
          value: expected.value,
          previewStateValues: expected.previewStateValues,
          previewSignalCarrier: expected.previewSignalCarrier,
          candidateGroup: expected.candidateGroup,
          decisionStackPublication: expected.decisionStackPublication,
          continuedDeepeningCompletionRecords: expected.continuedDeepeningCompletionRecords,
        }),
      },
    };
  });
};

export const evaluateSupportedPreviewDriveWithWasm = (
  wasm: PolicyWasmRuntime,
  fixtures: readonly PreviewDriveParityFixture[],
): PolicyWasmPreviewDriveResult =>
  evaluateProductionPreviewDriveBatchWithWasm({
    runtime: wasm,
    def: fixtures[0]!.def,
    state: fixtures[0]!.state,
    profileId: 'synthetic-preview-drive-parity',
    originSeatId: '0',
    originTurnId: 0,
    depthCap: 8,
    previewBranch: 'continuedDeepening',
    previewStateSlots,
    candidates: fixtures.map((fixture) => fixture.candidate),
  });

export const projectWasmPreviewDriveRow = (
  row: PolicyWasmPreviewDriveRow,
): Omit<PreviewDriveRowOracle, 'previewStateHash' | 'rowDigest'> & { readonly rowDigest: string } => {
  const projected = {
    stableMoveKey: row.stableMoveKey,
    outcome: row.outcome,
    value: row.value,
    previewStateValues: row.previewStateValues ?? {},
    previewSignalCarrier: row.previewSignalCarrier,
    candidateGroup: row.candidateGroup!,
    decisionStackPublication: row.decisionStackPublication!,
    continuedDeepeningCompletionRecords: row.continuedDeepeningCompletionRecords!,
  };
  return {
    ...projected,
    rowDigest: digestPreviewDriveRow(projected),
  };
};

export const evaluateUnsupportedPreviewDriveWithTsOracle = (
  input: PolicyWasmPreviewDriveBatchInput,
): PolicyWasmPreviewDriveResult => {
  const unsupportedStep = input.steps.find((step) => step.kind === 'unsupported');
  if (unsupportedStep === undefined) {
    throw new Error('unsupported preview-drive fixture must include an unsupported step');
  }
  return {
    kind: 'unsupported',
    profileId: input.profileId,
    candidateCount: input.candidates.length,
    unsupportedDriveClass: unsupportedStep.unsupportedClass,
    ...(unsupportedStep.owner === undefined ? {} : { unsupportedOwner: unsupportedStep.owner }),
    reason: `unsupported preview-drive class ${unsupportedStep.unsupportedClass}`,
  };
};

export const createUnsupportedPreviewDriveFixture = (): PolicyWasmPreviewDriveBatchInput => ({
  profileId: 'synthetic-preview-drive-fail-closed',
  originSeatId: '0',
  originTurnId: 0,
  depthCap: 8,
  candidates: [{
    actionId: 'blocked',
    stableMoveKey: 'blocked:0',
    initialValue: 0,
    previewSignalCarrier: {
      previewStatus: 'gated',
      previewBranch: 'continuedDeepening',
      tiebreakAfterPreviewNoSignal: true,
      policyPreviewSignalUnavailable: true,
    },
  }],
  steps: [{
    kind: 'unsupported',
    unsupportedClass: 'gated',
    owner: 'synthetic-preview-drive-fail-closed',
  }],
});

const createSupportedPreviewDriveDef = (): GameDef => assertValidatedGameDef({
  metadata: { id: 'policy-wasm-preview-drive-equivalence', players: { min: 2, max: 2 } },
  constants: {},
  globalVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 20 }],
  perPlayerVars: [],
  zones: [],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [{ id: phaseId }] },
  actions: [{
    id: asActionId('branch'),
    actor: 'active',
    executor: 'actor',
    phase: [phaseId],
    params: [],
    pre: null,
    cost: [],
    effects: [],
    limits: [],
  }] satisfies ActionDef[],
  actionPipelines: [{
    id: 'branch-preview-drive',
    actionId: asActionId('branch'),
    legality: null,
    costValidation: null,
    costEffects: [],
    targeting: {},
    stages: [{
      effects: [
        eff({ addVar: { scope: 'global', var: 'score', delta: 2 } }),
        eff({
          chooseOne: {
            internalDecisionId: 'decision:$pick',
            bind: '$pick',
            options: { query: 'enums', values: ['left', 'right'] },
          },
        }) as ActionPipelineDef['stages'][number]['effects'][number],
        eff({ addVar: { scope: 'global', var: 'score', delta: 3 } }),
      ],
    }],
    atomicity: 'partial',
  }],
  triggers: [],
  terminal: {
    conditions: [],
    margins: [
      { seat: '0', value: { _t: 2 as const, ref: 'gvar', var: 'score' } },
      { seat: '1', value: 0 },
    ],
  },
});

const trustedMoveFor = (
  state: GameState,
  actionId: string,
): TrustedExecutableMove =>
  createTrustedExecutableMove(
    { actionId: asActionId(actionId), params: {} },
    state.stateHash,
    'enumerateLegalMoves',
  );

const createTsPreviewRuntime = (
  def: GameDef,
  state: GameState,
  trustedMove: TrustedExecutableMove,
) =>
  createPolicyPreviewRuntime({
    def,
    state,
    playerId: asPlayerId(0),
    seatId: '0',
    trustedMoveIndex: new Map([['branch:0', trustedMove], ['branch:1', trustedMove]]),
    previewMode: 'exactWorld',
    completionPolicy: 'greedy',
    completionDepthCap: 8,
    dependencies: { applyMove: applyPreviewMove },
  });

const digestPreviewDriveRow = (
  row: Omit<PreviewDriveRowOracle, 'previewStateHash' | 'rowDigest'>,
): string =>
  createHash('sha256')
    .update(JSON.stringify(row))
    .digest('hex');
