// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyDecision,
  asActionId,
  asDecisionFrameId,
  asPhaseId,
  asPlayerId,
  asTurnId,
  createGameDefRuntime,
  createTrustedExecutableMove,
  initialState,
  publishMicroturn,
  resolveActiveDeciderSeatIdForPlayer,
  type ActionDef,
  type AgentPolicyCatalog,
  type CompiledAgentProfile,
  type CompiledSurfaceVisibility,
  type GameDef,
  type GameState,
  type TrustedExecutableMove,
} from '../../src/kernel/index.js';
import { createPolicyRuntimeProviders } from '../../src/agents/policy-runtime.js';
import { asZoneId } from '../../src/kernel/branded.js';
import {
  advanceChooseNWithSession,
  createChooseNSession,
  createChooseNTemplate,
  disposeChooseNSession,
  rebuildPendingFromTemplate,
} from '../../src/kernel/choose-n-session.js';
import { toSelectionKey } from '../../src/kernel/choose-n-selection-key.js';
import type { DecisionKey } from '../../src/kernel/decision-scope.js';
import type { LegalChoicesPreparedContext } from '../../src/kernel/legal-choices.js';
import type { PlayerId } from '../../src/kernel/branded.js';
import type { ChoicePendingChooseNRequest } from '../../src/kernel/types.js';
import { withCompiledPolicyCatalog } from '../helpers/policy-catalog-fixtures.js';
import { eff } from '../helpers/effect-tag-helper.js';
import { asTaggedGameDef } from '../helpers/gamedef-fixtures.js';

const phaseId = asPhaseId('main');

const asDecisionKey = (value: string): DecisionKey => value as DecisionKey;
const asPlayer = (id: number): PlayerId => id as unknown as PlayerId;

const PUBLIC_VISIBILITY: CompiledSurfaceVisibility = {
  current: 'public',
  preview: { visibility: 'public', allowWhenHiddenSampling: false },
};

function createMinimalCatalog(): AgentPolicyCatalog {
  const profile: CompiledAgentProfile = {
    fingerprint: 'decision-local-scope-drop-profile',
    params: {},
    use: {
      pruningRules: [],
      considerations: [],
      tieBreakers: [],
    },
    plan: {
      stateFeatures: [],
      candidateFeatures: [],
      candidateAggregates: [],
      considerations: [],
    },
    preview: { mode: 'exactWorld' },
    selection: { mode: 'argmax' as const },
  };

  return withCompiledPolicyCatalog({
    schemaVersion: 2,
    catalogFingerprint: 'decision-local-scope-drop-catalog',
    surfaceVisibility: {
      globalVars: { score: PUBLIC_VISIBILITY },
      globalMarkers: {},
      perPlayerVars: {},
      derivedMetrics: {},
      victory: {
        currentMargin: PUBLIC_VISIBILITY,
        currentRank: PUBLIC_VISIBILITY,
      },
      activeCardIdentity: PUBLIC_VISIBILITY,
      activeCardTag: PUBLIC_VISIBILITY,
      activeCardMetadata: PUBLIC_VISIBILITY,
      activeCardAnnotation: PUBLIC_VISIBILITY,
    },
    parameterDefs: {},
    candidateParamDefs: {},
    library: {
      stateFeatures: {},
      candidateFeatures: {},
      candidateAggregates: {},
      pruningRules: {},
      considerations: {},
      tieBreakers: {},
      strategicConditions: {},
    },
    profiles: { us: profile },
    bindingsBySeat: { us: 'us' },
  });
}

function createPreviewDef(catalog: AgentPolicyCatalog): GameDef {
  return {
    metadata: { id: 'decision-local-preview', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [{ name: 'score', type: 'int', init: 1, min: -10, max: 10 }],
    perPlayerVars: [],
    zones: [{ id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set' }],
    derivedMetrics: [],
    seats: [{ id: 'us' }, { id: 'them' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: phaseId }] },
    agents: catalog,
    actions: [{
      id: asActionId('advance'),
      actor: 'active',
      executor: 'actor',
      phase: [phaseId],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    }],
    triggers: [],
    terminal: { conditions: [] },
  };
}

const createDecisionStackDef = (): GameDef => asTaggedGameDef({
  metadata: { id: 'decision-stack-frame-shape', players: { min: 2, max: 2 } },
  seats: [{ id: '0' }, { id: '1' }],
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [{ id: 'board:none', owner: 'none', visibility: 'public', ordering: 'set' }],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [{ id: phaseId }] },
  actions: [{
    id: asActionId('nested'),
    actor: 'active',
    executor: 'actor',
    phase: [phaseId],
    params: [],
    pre: null,
    cost: [],
    effects: [
      eff({
        chooseOne: {
          internalDecisionId: 'decision:$branch',
          bind: '$branch',
          options: { query: 'enums', values: ['left'] },
        },
      }),
      eff({
        chooseN: {
          internalDecisionId: 'decision:$targets',
          bind: '$targets',
          options: { query: 'enums', values: ['a', 'b'] },
          min: 1,
          max: 2,
        },
      }),
    ],
    limits: [],
  } satisfies ActionDef],
  triggers: [],
  terminal: { conditions: [] },
});

const createDecisionStackState = (def: GameDef): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 2,
  zones: { 'board:none': [] },
  nextTokenOrdinal: 0,
  currentPhase: phaseId,
  activePlayer: asPlayerId(0),
  turnCount: 0,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
  stateHash: 0n,
  _runningHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
  reveals: undefined,
  globalMarkers: undefined,
  activeLastingEffects: undefined,
  interruptPhaseStack: undefined,
  decisionStack: [],
  nextFrameId: asDecisionFrameId(0),
  nextTurnId: asTurnId(0),
  activeDeciderSeatId: resolveActiveDeciderSeatIdForPlayer(def, 0),
});

describe('decision-local scope drop', () => {
  it('clears chooseN session caches at session exit without mutating retained selection witnesses', () => {
    const template = createChooseNTemplate({
      decisionKey: asDecisionKey('test-choice'),
      name: 'TestChoice',
      normalizedOptions: ['a', 'b', 'c'],
      targetKinds: [],
      minCardinality: 1,
      maxCardinality: 3,
      prioritizedTierEntries: null,
      qualifierMode: 'none',
      preparedContext: {} as LegalChoicesPreparedContext,
      partialMoveIdentity: { actionId: 'test-action', params: {} },
      choiceDecisionPlayer: asPlayer(0),
      chooser: undefined,
    });
    const pending = rebuildPendingFromTemplate(template, []) as ChoicePendingChooseNRequest;
    const session = createChooseNSession(template, [], pending, 1);

    advanceChooseNWithSession(session, { type: 'add', value: 'a' });
    session.probeCache.set(toSelectionKey(session.template.domainIndex, ['a']), { kind: 'confirmable' });

    assert.equal(session.legalityCache.size, 1);
    assert.equal(session.probeCache.size, 1);

    disposeChooseNSession(session);

    assert.equal(session.legalityCache.size, 0);
    assert.equal(session.probeCache.size, 0);
    assert.deepEqual(session.currentSelected, ['a']);
    assert.deepEqual(session.currentPending.selected, ['a']);
  });

  it('drops preview-local cached state when the provider scope is disposed', () => {
    const catalog = createMinimalCatalog();
    const def = createPreviewDef(catalog);
    const state = initialState(def, 1, 2).state;
    const providers = createPolicyRuntimeProviders({
      def,
      state,
      playerId: asPlayerId(0),
      seatId: 'us',
      trustedMoveIndex: new Map(),
      catalog,
      previewDependencies: {
        applyMove: (_def: GameDef, baseState: GameState, _move: TrustedExecutableMove) => ({
          state: {
            ...baseState,
            globalVars: { ...baseState.globalVars, score: 4 },
          },
        }),
      },
      runtimeError: (code: string, message: string) => new Error(`${code}: ${message}`),
    });
    const candidate = {
      move: createTrustedExecutableMove(
        { actionId: asActionId('advance'), params: {} },
        state.stateHash,
        'enumerateLegalMoves',
      ),
      stableMoveKey: 'advance|{}|false|unclassified',
      actionId: 'advance',
    };

    assert.equal(providers.previewSurface.getPreviewState(candidate)?.globalVars.score, 4);
    assert.equal(providers.previewSurface.getOutcome(candidate), 'ready');

    providers.dispose();

    assert.equal(providers.previewSurface.getPreviewState(candidate), undefined);
    assert.equal(providers.previewSurface.getOutcome(candidate), 'failed');
    assert.equal(providers.previewSurface.getFailureReason(candidate), 'previewRuntimeDisposed');
    assert.equal(providers.previewSurface.getGrantedOperation(candidate), undefined);
    assert.equal(providers.previewSurface.hasPreviewData(candidate), false);
  });

  it('retains continuation bindings only on the root frame after chooseN scope updates', () => {
    const def = createDecisionStackDef();
    const runtime = createGameDefRuntime(def);

    const initial = createDecisionStackState(def);
    const actionSelection = publishMicroturn(def, initial, runtime);
    const afterAction = applyDecision(def, initial, actionSelection.legalActions[0]!, undefined, runtime).state;

    assert.equal(afterAction.decisionStack?.length, 2);
    assert.deepEqual(afterAction.decisionStack?.[0]?.continuationBindings, {});
    assert.equal(afterAction.decisionStack?.[1]?.continuationBindings, undefined);

    const chooseOne = publishMicroturn(def, afterAction, runtime);
    const branch = chooseOne.legalActions.find((entry) => entry.kind === 'chooseOne');
    assert.ok(branch);
    const afterChooseOne = applyDecision(def, afterAction, branch!, undefined, runtime).state;

    assert.equal(afterChooseOne.decisionStack?.length, 2);
    assert.equal(afterChooseOne.decisionStack?.[1]?.continuationBindings, undefined);

    const chooseN = publishMicroturn(def, afterChooseOne, runtime);
    const addDecision = chooseN.legalActions.find(
      (entry) => entry.kind === 'chooseNStep' && entry.command === 'add' && entry.value === 'a',
    );
    assert.ok(addDecision);
    const afterAdd = applyDecision(def, afterChooseOne, addDecision!, undefined, runtime).state;

    assert.deepEqual(afterAdd.decisionStack?.[0]?.continuationBindings, {
      '$branch': 'left',
      '$targets': ['a'],
    });
    assert.equal(afterAdd.decisionStack?.[1]?.continuationBindings, undefined);
  });
});
