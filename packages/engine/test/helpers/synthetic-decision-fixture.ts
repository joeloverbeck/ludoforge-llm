import {
  asActionId,
  asPhaseId,
  asPlayerId,
  assertValidatedGameDef,
  createTrustedExecutableMove,
  initialState,
  type ActionDef,
  type ActionPipelineDef,
  type GameDef,
} from '../../src/kernel/index.js';
import { createPolicyPreviewRuntime } from '../../src/agents/policy-preview.js';
import { eff } from './effect-tag-helper.js';

const phaseId = asPhaseId('main');

export const createSyntheticDecisionDef = (): GameDef => assertValidatedGameDef({
  metadata: { id: 'synthetic-decision-trace', players: { min: 2, max: 2 } },
  constants: {},
  globalVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 20 }],
  perPlayerVars: [],
  zones: [],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [{ id: phaseId }] },
  actions: [
    {
      id: asActionId('branch'),
      actor: 'active',
      executor: 'actor',
      phase: [phaseId],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    },
  ] satisfies ActionDef[],
  actionPipelines: [{
    id: 'branch-profile',
    actionId: asActionId('branch'),
    legality: null,
    costValidation: null,
    costEffects: [],
    targeting: {},
    stages: [{
      effects: [
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
  terminal: { conditions: [] },
});

export const captureSyntheticDecisionPreviewDrive = () => {
  const def = createSyntheticDecisionDef();
  const state = initialState(def, 156, 2).state;
  const move = { actionId: asActionId('branch'), params: {} };
  const trustedMove = createTrustedExecutableMove(move, state.stateHash, 'enumerateLegalMoves');
  const runtime = createPolicyPreviewRuntime({
    def,
    state,
    playerId: asPlayerId(0),
    seatId: '0',
    trustedMoveIndex: new Map([['candidate', trustedMove]]),
    previewMode: 'exactWorld',
    completionPolicy: 'greedy',
    completionDepthCap: 8,
    captureSyntheticDecisions: true,
  });
  const candidate = { move, stableMoveKey: 'candidate', actionId: 'branch' };
  return {
    outcome: runtime.getOutcome(candidate),
    previewDrive: runtime.getPreviewDrive(candidate),
  };
};
