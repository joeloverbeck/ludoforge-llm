// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { PolicyEvaluationMetadata } from '../../../src/agents/policy-eval.js';
import { evaluatePolicyMoveCore } from '../../../src/agents/policy-eval.js';
import { toMoveIdentityKey } from '../../../src/kernel/move-identity.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  createRng,
  createTrustedExecutableMove,
  initialState,
  legalMoves,
  type ActionDef,
  type AgentPolicyCatalog,
  type AgentPolicyExpr,
  type CompiledAgentPolicyRef,
  type ConditionAST,
  type GameDef,
  type Move,
} from '../../../src/kernel/index.js';
import { eff } from '../../helpers/effect-tag-helper.js';

const phaseId = asPhaseId('main');

const literal = (value: string | number | boolean): AgentPolicyExpr => ({
  kind: 'literal',
  value,
});

const refExpr = (ref: CompiledAgentPolicyRef): AgentPolicyExpr => ({
  kind: 'ref',
  ref,
});

function eqGlobalVar(varName: string, value: number | boolean): ConditionAST {
  return {
    op: '==',
    left: { _t: 2 as const, ref: 'gvar', var: varName },
    right: value,
  };
}

function createAction(
  id: string,
  pre: ConditionAST | null,
  effects: ActionDef['effects'],
  params: ActionDef['params'] = [],
): ActionDef {
  return {
    id: asActionId(id),
    actor: 'active',
    executor: 'actor',
    phase: [phaseId],
    params,
    pre,
    cost: [],
    effects,
    limits: [],
  };
}

function createCatalog(): AgentPolicyCatalog {
  return {
    schemaVersion: 2,
    catalogFingerprint: 'granted-op-policy',
    surfaceVisibility: {
      globalVars: {
        usMargin: {
          current: 'public',
          preview: { visibility: 'public', allowWhenHiddenSampling: true },
        },
      },
      globalMarkers: {},
      perPlayerVars: {},
      derivedMetrics: {},
      victory: {
        currentMargin: {
          current: 'hidden',
          preview: { visibility: 'hidden', allowWhenHiddenSampling: false },
        },
        currentRank: {
          current: 'hidden',
          preview: { visibility: 'hidden', allowWhenHiddenSampling: false },
        },
      },
      activeCardIdentity: {
        current: 'hidden',
        preview: { visibility: 'hidden', allowWhenHiddenSampling: false },
      },
      activeCardTag: {
        current: 'hidden',
        preview: { visibility: 'hidden', allowWhenHiddenSampling: false },
      },
      activeCardMetadata: {
        current: 'hidden',
        preview: { visibility: 'hidden', allowWhenHiddenSampling: false },
      },
      activeCardAnnotation: {
        current: 'hidden',
        preview: { visibility: 'hidden', allowWhenHiddenSampling: false },
      },
    },
    parameterDefs: {},
    candidateParamDefs: {},
    library: {
      stateFeatures: {},
      candidateFeatures: {},
      candidateAggregates: {},
      pruningRules: {},
      considerations: {
        scorePreviewMargin: {
          scopes: ['move'],
          costClass: 'candidate',
          weight: literal(1),
          value: refExpr({ kind: 'previewSurface', family: 'globalVar', id: 'usMargin' }),
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
        },
      },
      tieBreakers: {
        stableMoveKey: {
          kind: 'stableMoveKey',
          costClass: 'state',
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
        },
      },
      strategicConditions: {},
    },
    profiles: {
      baseline: {
        fingerprint: 'baseline',
        params: {},
        preview: { mode: 'exactWorld' },
        selection: { mode: 'argmax' },
        use: {
          pruningRules: [],
          considerations: ['scorePreviewMargin'],
          tieBreakers: ['stableMoveKey'],
        },
        plan: {
          stateFeatures: [],
          candidateFeatures: [],
          candidateAggregates: [],
          considerations: ['scorePreviewMargin'],
        },
      },
    },
    bindingsBySeat: {
      us: 'baseline',
    },
  };
}

function createAnnotationIndex(
  entries: readonly {
    readonly cardId: string;
    readonly side: 'shaded' | 'unshaded';
    readonly seats: readonly string[];
  }[],
): NonNullable<GameDef['cardAnnotationIndex']> {
  return {
    entries: Object.fromEntries(entries.map((entry) => [
      entry.cardId,
      {
        cardId: entry.cardId,
        [entry.side]: {
          tokenPlacements: {},
          tokenRemovals: {},
          tokenCreations: {},
          tokenDestructions: {},
          markerModifications: 0,
          globalMarkerModifications: 0,
          globalVarModifications: 0,
          perPlayerVarModifications: 0,
          varTransfers: 0,
          drawCount: 0,
          shuffleCount: 0,
          grantsOperation: true,
          grantOperationSeats: entry.seats,
          hasEligibilityOverride: false,
          hasLastingEffect: false,
          hasBranches: false,
          hasPhaseControl: false,
          hasDecisionPoints: false,
          effectNodeCount: 0,
        },
      },
    ])),
  };
}

function createDef(actions: readonly ActionDef[], annotations?: NonNullable<GameDef['cardAnnotationIndex']>): GameDef {
  return {
    metadata: { id: 'policy-eval-granted-op', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [
      { name: 'usMargin', type: 'int', init: 0, min: -100, max: 100 },
      { name: 'grantOpen', type: 'int', init: 0, min: 0, max: 1 },
      { name: 'chainOpen', type: 'int', init: 0, min: 0, max: 1 },
    ],
    perPlayerVars: [],
    zones: [],
    derivedMetrics: [],
    seats: [{ id: 'us' }, { id: 'arvn' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: phaseId }] },
    agents: createCatalog(),
    actions,
    triggers: [],
    terminal: {
      conditions: [],
      margins: [
        { seat: 'us', value: { _t: 2 as const, ref: 'gvar', var: 'usMargin' } },
        { seat: 'arvn', value: 0 },
      ],
    },
    ...(annotations === undefined ? {} : { cardAnnotationIndex: annotations }),
  };
}

function buildTrustedMoveIndex(def: GameDef, state: ReturnType<typeof initialState>['state'], moves: readonly Move[]) {
  return new Map(
    moves.map((move) => [toMoveIdentityKey(def, move), createTrustedExecutableMove(move, state.stateHash, 'templateCompletion')]),
  );
}

function createTopLevelInput(def: GameDef, seed: bigint) {
  const state = initialState(def, Number(seed), 2).state;
  const moves = legalMoves(def, state);
  return {
    def,
    state,
    legalMoves: moves,
    trustedMoveIndex: buildTrustedMoveIndex(def, state, moves),
    playerId: asPlayerId(0),
    rng: createRng(seed),
  } as const;
}

function findCandidateScore(metadata: PolicyEvaluationMetadata, actionId: string): number {
  const candidate = metadata.candidates.find((entry) => entry.actionId === actionId);
  assert.ok(candidate, `expected candidate ${actionId} to exist`);
  return candidate.score;
}

describe('policy-eval granted operation callback', () => {
  it('enumerates post-event legal moves and selects the best one via the policy profile', () => {
    const def = createDef([
      createAction(
        'event',
        eqGlobalVar('grantOpen', 0),
        [
          eff({ addVar: { scope: 'global', var: 'usMargin', delta: 1 } }),
          eff({ setVar: { scope: 'global', var: 'grantOpen', value: 1 } }),
        ],
        [
          { name: 'eventCardId', domain: { query: 'enums', values: ['card-outer'] } },
          { name: 'eventDeckId', domain: { query: 'enums', values: ['main'] } },
          { name: 'side', domain: { query: 'enums', values: ['shaded'] } },
        ],
      ),
      createAction(
        'smallOp',
        eqGlobalVar('grantOpen', 1),
        [eff({ addVar: { scope: 'global', var: 'usMargin', delta: 2 } })],
      ),
      createAction(
        'bigOp',
        eqGlobalVar('grantOpen', 1),
        [eff({ addVar: { scope: 'global', var: 'usMargin', delta: 5 } })],
      ),
      createAction('pass', eqGlobalVar('grantOpen', 0), []),
    ], createAnnotationIndex([{ cardId: 'card-outer', side: 'shaded', seats: ['us'] }]));

    const input = createTopLevelInput(def, 7n);
    const result = evaluatePolicyMoveCore(input);

    assert.equal(result.kind, 'success');
    if (result.kind !== 'success') {
      return;
    }

    assert.equal(String(result.move.actionId), 'event');
    assert.equal(result.metadata.finalScore, 6);
    assert.equal(findCandidateScore(result.metadata, 'event'), 6);
    assert.equal(findCandidateScore(result.metadata, 'pass'), 0);
  });

  it('returns undefined from the callback when no granted-operation moves are available to the evaluating seat', () => {
    const def = createDef([
      createAction(
        'event',
        eqGlobalVar('grantOpen', 0),
        [
          eff({ addVar: { scope: 'global', var: 'usMargin', delta: 1 } }),
          eff({ setVar: { scope: 'global', var: 'grantOpen', value: 1 } }),
          eff({ setActivePlayer: { player: { id: asPlayerId(1) } } }),
        ],
        [
          { name: 'eventCardId', domain: { query: 'enums', values: ['card-outer'] } },
          { name: 'eventDeckId', domain: { query: 'enums', values: ['main'] } },
          { name: 'side', domain: { query: 'enums', values: ['shaded'] } },
        ],
      ),
      createAction('pass', eqGlobalVar('grantOpen', 0), []),
      createAction('opponentPass', eqGlobalVar('grantOpen', 1), []),
    ], createAnnotationIndex([{ cardId: 'card-outer', side: 'shaded', seats: ['us'] }]));

    const input = createTopLevelInput(def, 11n);
    const result = evaluatePolicyMoveCore(input);

    assert.equal(result.kind, 'success');
    if (result.kind !== 'success') {
      return;
    }

    assert.equal(findCandidateScore(result.metadata, 'event'), 1);
    assert.equal(findCandidateScore(result.metadata, 'pass'), 0);
  });

  it('does not re-inject multi-step preview into the inner granted-operation evaluation', () => {
    const def = createDef([
      createAction(
        'event',
        eqGlobalVar('grantOpen', 0),
        [
          eff({ addVar: { scope: 'global', var: 'usMargin', delta: 1 } }),
          eff({ setVar: { scope: 'global', var: 'grantOpen', value: 1 } }),
        ],
        [
          { name: 'eventCardId', domain: { query: 'enums', values: ['card-outer'] } },
          { name: 'eventDeckId', domain: { query: 'enums', values: ['main'] } },
          { name: 'side', domain: { query: 'enums', values: ['shaded'] } },
        ],
      ),
      createAction(
        'bigOp',
        eqGlobalVar('grantOpen', 1),
        [eff({ addVar: { scope: 'global', var: 'usMargin', delta: 5 } })],
      ),
      createAction(
        'followupEvent',
        eqGlobalVar('grantOpen', 1),
        [
          eff({ addVar: { scope: 'global', var: 'usMargin', delta: 2 } }),
          eff({ setVar: { scope: 'global', var: 'chainOpen', value: 1 } }),
        ],
        [
          { name: 'eventCardId', domain: { query: 'enums', values: ['card-follow'] } },
          { name: 'eventDeckId', domain: { query: 'enums', values: ['main'] } },
          { name: 'side', domain: { query: 'enums', values: ['shaded'] } },
        ],
      ),
      createAction(
        'chainBigOp',
        eqGlobalVar('chainOpen', 1),
        [eff({ addVar: { scope: 'global', var: 'usMargin', delta: 20 } })],
      ),
      createAction('pass', eqGlobalVar('grantOpen', 0), []),
    ], createAnnotationIndex([
      { cardId: 'card-outer', side: 'shaded', seats: ['us'] },
      { cardId: 'card-follow', side: 'shaded', seats: ['us'] },
    ]));

    const input = createTopLevelInput(def, 13n);
    const result = evaluatePolicyMoveCore(input);

    assert.equal(result.kind, 'success');
    if (result.kind !== 'success') {
      return;
    }

    assert.equal(String(result.move.actionId), 'event');
    assert.equal(findCandidateScore(result.metadata, 'event'), 6);
  });
});
