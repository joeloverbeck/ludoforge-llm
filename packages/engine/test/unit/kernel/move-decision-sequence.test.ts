import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  classifyMoveDecisionSequenceAdmissionForLegalMove,
  classifyMoveDecisionSequenceSatisfiability,
  isMoveDecisionSequenceAdmittedForLegalMove,
  isMoveDecisionSequenceSatisfiable,
  MISSING_BINDING_POLICY_CONTEXTS,
  pickDeterministicChoiceValue,
  resolveMoveDecisionSequence,
  type DecisionKey,
  type ChoicePendingRequest,
  type DiscoveryCache,
  type ActionDef,
  type ActionPipelineDef,
  type GameDef,
  type GameState,
  type Move,
  type Token,
} from '../../../src/kernel/index.js';

const asDecisionKey = (value: string): DecisionKey => value as DecisionKey;
import {
  buildChooserOwnedChoiceEffect,
  ownershipSelection,
  type ChoiceOwnershipPrimitive,
} from '../../helpers/choice-ownership-parity-helpers.js';
import {
  SEQUENCE_CONTEXT_DENIED_ZONE_ID,
  createSequenceContextMismatchTurnOrderState,
  createSequenceContextMismatchZoneState,
  createSequenceContextMismatchZones,
} from '../../helpers/free-operation-sequence-context-fixtures.js';
import { eff } from '../../helpers/effect-tag-helper.js';
import { asTaggedGameDef } from '../../helpers/gamedef-fixtures.js';

const makeBaseDef = (overrides?: {
  actions?: readonly ActionDef[];
  actionPipelines?: readonly ActionPipelineDef[];
}): GameDef =>
  asTaggedGameDef({
    metadata: { id: 'move-decision-sequence-test', players: { min: 2, max: 2 } },
    seats: [{ id: '0' }, { id: '1' }, { id: '2' }, { id: '3' }],
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [{ id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: overrides?.actions ?? [],
    actionPipelines: overrides?.actionPipelines,
    triggers: [],
    terminal: { conditions: [] },
  });

const makeBaseState = (overrides?: Partial<GameState>): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 2,
  zones: { 'board:none': [] },
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 1,
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
  ...overrides,
});

const makeMove = (actionId: string): Move => ({
  actionId: asActionId(actionId),
  params: {},
});

const makeToken = (id: string): Token => ({
  id: asTokenId(id),
  type: 'piece',
  props: {},
});

describe('move decision sequence helpers', () => {
  it('completes a satisfiable chooseOne decision sequence using default chooser', () => {
    const action: ActionDef = {
      id: asActionId('choose-one-op'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const profile: ActionPipelineDef = {
      id: 'choose-one-profile',
      actionId: asActionId('choose-one-op'),
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [
        {
          effects: [
            eff({
              chooseOne: {
                internalDecisionId: 'decision:$target',
                bind: '$target',
                options: { query: 'enums', values: ['a', 'b'] },
              },
            }) as GameDef['actions'][number]['effects'][number],
          ],
        },
      ],
      atomicity: 'partial',
    };

    const def = makeBaseDef({ actions: [action], actionPipelines: [profile] });
    const result = resolveMoveDecisionSequence(def, makeBaseState(), makeMove('choose-one-op'));
    assert.equal(result.complete, true);
    assert.equal(result.move.params['$target'], 'a');
  });

  it('does not satisfy a DecisionKey choice from a legacy bind-name param alias', () => {
    const action: ActionDef = {
      id: asActionId('legacy-alias-op'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const profile: ActionPipelineDef = {
      id: 'legacy-alias-profile',
      actionId: asActionId('legacy-alias-op'),
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [
        {
          effects: [
            eff({
              chooseOne: {
                internalDecisionId: 'decision:$target',
                bind: '$target',
                options: { query: 'enums', values: ['a', 'b'] },
              },
            }) as GameDef['actions'][number]['effects'][number],
          ],
        },
      ],
      atomicity: 'partial',
    };

    const def = makeBaseDef({ actions: [action], actionPipelines: [profile] });
    const result = resolveMoveDecisionSequence(
      def,
      makeBaseState(),
      {
        actionId: asActionId('legacy-alias-op'),
        params: { 'decision:$target': 'a' },
      },
      {
        choose: () => undefined,
      },
    );

    assert.equal(result.complete, false);
    assert.equal(result.nextDecision?.decisionKey, '$target');
    assert.deepEqual(result.move.params, { 'decision:$target': 'a' });
  });

  it('default chooser follows canonical legality precedence', () => {
    const request: ChoicePendingRequest = {
      kind: 'pending',
      complete: false,
      decisionKey: asDecisionKey('$mode'),
      name: '$mode',
      type: 'chooseOne',
      options: [
        { value: 'unknown', legality: 'unknown', illegalReason: null },
        { value: 'legal', legality: 'legal', illegalReason: null },
        { value: 'illegal', legality: 'illegal', illegalReason: null },
      ],
      targetKinds: [],
    };

    assert.equal(pickDeterministicChoiceValue(request), 'legal');
  });

  it('does not false-complete when rollRandom gates a nested decision', () => {
    const action: ActionDef = {
      id: asActionId('random-then-choose-op'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [
        eff({
          rollRandom: {
            bind: '$roll',
            min: 1,
            max: 6,
            in: [
              eff({
                chooseOne: {
                  internalDecisionId: 'decision:$target',
                  bind: '$target',
                  options: { query: 'enums', values: ['a', 'b'] },
                },
              }) as GameDef['actions'][number]['effects'][number],
            ],
          },
        }) as GameDef['actions'][number]['effects'][number],
      ],
      limits: [],
    };

    const def = makeBaseDef({ actions: [action] });
    const result = resolveMoveDecisionSequence(def, makeBaseState(), makeMove('random-then-choose-op'), {
      choose: () => undefined,
    });

    assert.equal(result.complete, false);
    const nestedDecision = result.nextDecision ?? result.nextDecisionSet?.[0];
    assert.equal(nestedDecision?.decisionKey, '$target');
    assert.deepEqual(nestedDecision?.options.map((option) => option.value), ['a', 'b']);
  });

  it('returns stochastic alternatives when rollRandom outcomes require different pending decisions', () => {
    const action: ActionDef = {
      id: asActionId('random-branching-decisions-op'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [
        eff({
          rollRandom: {
            bind: '$roll',
            min: 1,
            max: 2,
            in: [
              eff({
                if: {
                  when: { op: '==', left: { _t: 2, ref: 'binding', name: '$roll' }, right: 1 },
                  then: [
                    eff({
                      chooseOne: {
                        internalDecisionId: 'decision:$alpha',
                        bind: '$alpha',
                        options: { query: 'enums', values: ['a1', 'a2'] },
                      },
                    }) as GameDef['actions'][number]['effects'][number],
                  ],
                  else: [
                    eff({
                      chooseOne: {
                        internalDecisionId: 'decision:$beta',
                        bind: '$beta',
                        options: { query: 'enums', values: ['b1', 'b2'] },
                      },
                    }) as GameDef['actions'][number]['effects'][number],
                  ],
                },
              }) as GameDef['actions'][number]['effects'][number],
            ],
          },
        }) as GameDef['actions'][number]['effects'][number],
      ],
      limits: [],
    };

    const def = makeBaseDef({ actions: [action] });
    const result = resolveMoveDecisionSequence(def, makeBaseState(), makeMove('random-branching-decisions-op'), {
      choose: () => undefined,
    });

    assert.equal(result.complete, false);
    assert.equal(result.nextDecision, undefined);
    assert.equal(result.stochasticDecision?.kind, 'pendingStochastic');
    assert.deepEqual(result.nextDecisionSet?.map((request) => request.decisionKey), ['$alpha', '$beta']);
  });

  it('returns stochastic alternatives when rollRandom outcomes change exact chooseN cardinality for the same decision', () => {
    const action: ActionDef = {
      id: asActionId('random-exact-choose-n-op'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [
        eff({
          rollRandom: {
            bind: '$roll',
            min: 1,
            max: 2,
            in: [
              eff({
                chooseN: {
                  internalDecisionId: 'decision:$targets',
                  bind: '$targets',
                  options: { query: 'enums', values: ['a', 'b', 'c'] },
                  min: { _t: 2, ref: 'binding', name: '$roll' },
                  max: { _t: 2, ref: 'binding', name: '$roll' },
                },
              }) as GameDef['actions'][number]['effects'][number],
            ],
          },
        }) as GameDef['actions'][number]['effects'][number],
      ],
      limits: [],
    };

    const def = makeBaseDef({ actions: [action] });
    const result = resolveMoveDecisionSequence(def, makeBaseState(), makeMove('random-exact-choose-n-op'), {
      choose: () => undefined,
    });

    assert.equal(result.complete, false);
    assert.equal(result.nextDecision, undefined);
    assert.equal(result.stochasticDecision?.kind, 'pendingStochastic');
    assert.deepEqual(
      result.nextDecisionSet?.map((request) => ({
        decisionKey: request.decisionKey,
        min: request.type === 'chooseN' ? request.min : undefined,
        max: request.type === 'chooseN' ? request.max : undefined,
      })),
      [
        { decisionKey: '$targets', min: 1, max: 1 },
        { decisionKey: '$targets', min: 2, max: 2 },
      ],
    );
  });

  it('returns incomplete for unsatisfiable chooseN', () => {
    const action: ActionDef = {
      id: asActionId('unsat-op'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const profile: ActionPipelineDef = {
      id: 'unsat-profile',
      actionId: asActionId('unsat-op'),
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [
        {
          effects: [
            eff({
              chooseN: {
                internalDecisionId: 'decision:$targets',
                bind: '$targets',
                options: { query: 'enums', values: [] },
                min: 1,
                max: 1,
              },
            }) as GameDef['actions'][number]['effects'][number],
          ],
        },
      ],
      atomicity: 'partial',
    };

    const def = makeBaseDef({ actions: [action], actionPipelines: [profile] });
    const result = resolveMoveDecisionSequence(def, makeBaseState(), makeMove('unsat-op'));
    assert.equal(result.complete, false);
    assert.equal(result.illegal?.reason, 'emptyDomain');
    assert.equal(classifyMoveDecisionSequenceSatisfiability(def, makeBaseState(), makeMove('unsat-op')).classification, 'unsatisfiable');
    assert.equal(isMoveDecisionSequenceSatisfiable(def, makeBaseState(), makeMove('unsat-op')), false);
  });

  it('reports satisfiable when at least one downstream branch can complete', () => {
    const action: ActionDef = {
      id: asActionId('branching-op'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const profile: ActionPipelineDef = {
      id: 'branching-profile',
      actionId: asActionId('branching-op'),
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [
        {
          effects: [
            eff({
              chooseOne: {
                internalDecisionId: 'decision:$mode',
                bind: '$mode',
                options: { query: 'enums', values: ['trap', 'safe'] },
              },
            }) as GameDef['actions'][number]['effects'][number],
            eff({
              if: {
                when: { op: '==', left: { _t: 2, ref: 'binding', name: '$mode' }, right: 'trap' },
                then: [
                  eff({
                    chooseOne: {
                      internalDecisionId: 'decision:$trapChoice',
                      bind: '$trapChoice',
                      options: { query: 'enums', values: [] },
                    },
                  }) as GameDef['actions'][number]['effects'][number],
                ],
                else: [
                  eff({
                    chooseOne: {
                      internalDecisionId: 'decision:$safeChoice',
                      bind: '$safeChoice',
                      options: { query: 'enums', values: ['ok'] },
                    },
                  }) as GameDef['actions'][number]['effects'][number],
                ],
              },
            }) as GameDef['actions'][number]['effects'][number],
          ],
        },
      ],
      atomicity: 'partial',
    };

    const def = makeBaseDef({ actions: [action], actionPipelines: [profile] });
    const state = makeBaseState();

    assert.equal(resolveMoveDecisionSequence(def, state, makeMove('branching-op')).complete, false);
    assert.equal(isMoveDecisionSequenceSatisfiable(def, state, makeMove('branching-op')), true);
  });

  it('tries lower-complexity branches first during satisfiability classification', () => {
    const def = asTaggedGameDef({
      ...makeBaseDef(),
      zones: [
        { id: asZoneId('dense:none'), owner: 'none', visibility: 'public', ordering: 'set' },
        { id: asZoneId('sparse:none'), owner: 'none', visibility: 'public', ordering: 'set' },
      ],
    });
    const state = makeBaseState({
      zones: {
        'board:none': [],
        'dense:none': Array.from({ length: 10 }, (_, index) => makeToken(`dense-${index}`)),
        'sparse:none': [],
      },
    });
    const move = makeMove('complexity-ordered-op');

    const result = classifyMoveDecisionSequenceSatisfiability(
      def,
      state,
      move,
      {
        budgets: { maxParamExpansions: 7, maxDecisionProbeSteps: 32 },
        discoverer: (candidateMove) => {
          if (!('$targetSpace' in candidateMove.params)) {
            return {
              kind: 'pending',
              complete: false,
              decisionKey: asDecisionKey('$targetSpace'),
              name: '$targetSpace',
              type: 'chooseOne',
              options: [
                { value: 'dense:none', legality: 'legal', illegalReason: null },
                { value: 'sparse:none', legality: 'legal', illegalReason: null },
              ],
              targetKinds: [],
            } as const;
          }
          if (candidateMove.params.$targetSpace === 'dense:none' && !('$denseBranch' in candidateMove.params)) {
            return {
              kind: 'pending',
              complete: false,
              decisionKey: asDecisionKey('$denseBranch'),
              name: '$denseBranch',
              type: 'chooseN',
              options: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].map((value) => ({
                value,
                legality: 'legal' as const,
                illegalReason: null,
              })),
              min: 8,
              max: 8,
              selected: [],
              canConfirm: false,
              targetKinds: [],
            } as const;
          }
          if (candidateMove.params.$targetSpace === 'dense:none') {
            return {
              kind: 'illegal',
              complete: false,
              reason: 'emptyDomain',
            } as const;
          }
          return { kind: 'complete', complete: true } as const;
        },
      },
    );

    assert.equal(result.classification, 'satisfiable');
  });

  it('uses an injected discoverer instead of the default legalChoicesDiscover path', () => {
    const state = makeBaseState();
    const move = makeMove('external-discoverer-op');
    const seenMoves: Move[] = [];

    const result = classifyMoveDecisionSequenceSatisfiability(
      makeBaseDef(),
      state,
      move,
      {
        discoverer: (candidateMove) => {
          seenMoves.push(candidateMove);
          if ('$target' in candidateMove.params) {
            return { kind: 'complete', complete: true };
          }
          return {
            kind: 'pending',
            complete: false,
            decisionKey: asDecisionKey('$target'),
            name: '$target',
            type: 'chooseOne',
            options: [
              { value: 'a', legality: 'illegal', illegalReason: null },
              { value: 'b', legality: 'legal', illegalReason: null },
            ],
            targetKinds: [],
          };
        },
      },
    );

    assert.equal(result.classification, 'satisfiable');
    assert.deepEqual(seenMoves, [
      move,
      {
        actionId: move.actionId,
        params: { '$target': 'b' },
      },
    ]);
  });

  it('uses discoveryCache for the first resolve step when the original move is cached', () => {
    const action: ActionDef = {
      id: asActionId('cached-resolve-op'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const profile: ActionPipelineDef = {
      id: 'cached-resolve-profile',
      actionId: action.id,
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [
        {
          effects: [
            eff({
              chooseOne: {
                internalDecisionId: 'decision:$target',
                bind: '$target',
                options: { query: 'enums', values: ['pipeline-a', 'pipeline-b'] },
              },
            }) as GameDef['actions'][number]['effects'][number],
          ],
        },
      ],
      atomicity: 'partial',
    };

    const def = makeBaseDef({ actions: [action], actionPipelines: [profile] });
    const state = makeBaseState();
    const move = makeMove('cached-resolve-op');
    const cachedRequest: ChoicePendingRequest = {
      kind: 'pending',
      complete: false,
      decisionKey: asDecisionKey('$target'),
      name: '$target',
      type: 'chooseOne',
      options: [
        { value: 'pipeline-b', legality: 'legal', illegalReason: null },
        { value: 'pipeline-a', legality: 'illegal', illegalReason: null },
      ],
      targetKinds: [],
    };
    const discoveryCache: DiscoveryCache = new Map([[move, cachedRequest]]);

    const result = resolveMoveDecisionSequence(def, state, move, { discoveryCache });

    assert.equal(result.complete, true);
    assert.equal(result.move.params.$target, 'pipeline-b');
  });

  it('falls back to legalChoicesDiscover when discoveryCache misses by move identity', () => {
    const action: ActionDef = {
      id: asActionId('cache-miss-resolve-op'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const profile: ActionPipelineDef = {
      id: 'cache-miss-resolve-profile',
      actionId: action.id,
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [
        {
          effects: [
            eff({
              chooseOne: {
                internalDecisionId: 'decision:$target',
                bind: '$target',
                options: { query: 'enums', values: ['pipeline-a', 'pipeline-b'] },
              },
            }) as GameDef['actions'][number]['effects'][number],
          ],
        },
      ],
      atomicity: 'partial',
    };

    const def = makeBaseDef({ actions: [action], actionPipelines: [profile] });
    const state = makeBaseState();
    const move = makeMove('cache-miss-resolve-op');
    const structurallyEqualMove: Move = { actionId: move.actionId, params: {} };
    const discoveryCache: DiscoveryCache = new Map([[
      structurallyEqualMove,
      {
        kind: 'pending',
        complete: false,
        decisionKey: asDecisionKey('$target'),
        name: '$target',
        type: 'chooseOne',
        options: [
          { value: 'cached-a', legality: 'legal', illegalReason: null },
          { value: 'cached-b', legality: 'illegal', illegalReason: null },
        ],
        targetKinds: [],
      },
    ]]);

    const result = resolveMoveDecisionSequence(def, state, move, { discoveryCache });

    assert.equal(result.complete, true);
    assert.equal(result.move.params.$target, 'pipeline-a');
  });

  it('forwards injected discoverers through legal-move admission helpers', () => {
    const state = makeBaseState();
    const move = makeMove('external-admission-discoverer-op');
    let calls = 0;

    const discoverer = (candidateMove: Move) => {
      calls += 1;
      if ('$target' in candidateMove.params) {
        return { kind: 'complete', complete: true } as const;
      }
      return {
        kind: 'pending',
        complete: false,
        decisionKey: asDecisionKey('$target'),
        name: '$target',
        type: 'chooseOne',
        options: [{ value: 'allowed', legality: 'legal', illegalReason: null }],
        targetKinds: [],
      } as const;
    };

    assert.equal(
      classifyMoveDecisionSequenceAdmissionForLegalMove(
        makeBaseDef(),
        state,
        move,
        MISSING_BINDING_POLICY_CONTEXTS.LEGAL_MOVES_EVENT_DECISION_SEQUENCE,
        { discoverer },
      ),
      'satisfiable',
    );
    assert.equal(
      isMoveDecisionSequenceAdmittedForLegalMove(
        makeBaseDef(),
        state,
        move,
        MISSING_BINDING_POLICY_CONTEXTS.LEGAL_MOVES_EVENT_DECISION_SEQUENCE,
        { discoverer },
      ),
      true,
    );
    assert.equal(calls >= 2, true);
  });

  it('respects custom chooser for decision sequence completion', () => {
    const action: ActionDef = {
      id: asActionId('custom-choose-op'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const profile: ActionPipelineDef = {
      id: 'custom-choose-profile',
      actionId: asActionId('custom-choose-op'),
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [
        {
          effects: [
            eff({
              chooseOne: {
                internalDecisionId: 'decision:$target',
                bind: '$target',
                options: { query: 'enums', values: ['a', 'b', 'c'] },
              },
            }) as GameDef['actions'][number]['effects'][number],
          ],
        },
      ],
      atomicity: 'partial',
    };

    const def = makeBaseDef({ actions: [action], actionPipelines: [profile] });
    const result = resolveMoveDecisionSequence(def, makeBaseState(), makeMove('custom-choose-op'), {
      choose: (request) => request.options[2]?.value,
    });
    assert.equal(result.complete, true);
    assert.equal(result.move.params['$target'], 'c');
  });

  it('returns incomplete with warning when decision probe step budget is exceeded', () => {
    const action: ActionDef = {
      id: asActionId('stuck-op'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const profile: ActionPipelineDef = {
      id: 'stuck-profile',
      actionId: asActionId('stuck-op'),
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [
        {
          effects: [
            eff({
              chooseOne: {
                internalDecisionId: 'decision:$target',
                bind: '$target',
                options: { query: 'enums', values: ['a'] },
              },
            }) as GameDef['actions'][number]['effects'][number],
          ],
        },
      ],
      atomicity: 'partial',
    };

    const def = makeBaseDef({ actions: [action], actionPipelines: [profile] });
    const result = resolveMoveDecisionSequence(def, makeBaseState(), makeMove('stuck-op'), {
      budgets: { maxDecisionProbeSteps: 0 },
    });
    assert.equal(result.complete, false);
    assert.equal(result.nextDecision, undefined);
    assert.equal(
      classifyMoveDecisionSequenceSatisfiability(def, makeBaseState(), makeMove('stuck-op'), {
        budgets: { maxDecisionProbeSteps: 0 },
      }).classification,
      'unknown',
    );
    assert.equal(result.warnings.some((warning) => warning.code === 'MOVE_ENUM_DECISION_PROBE_STEP_BUDGET_EXCEEDED'), true);
  });

  it('legal-move admission helper excludes unsatisfiable decision sequences across admission contexts', () => {
    const action: ActionDef = {
      id: asActionId('unsat-admission-op'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const profile: ActionPipelineDef = {
      id: 'unsat-admission-profile',
      actionId: asActionId('unsat-admission-op'),
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [
        {
          effects: [
            eff({
              chooseOne: {
                internalDecisionId: 'decision:$target',
                bind: '$target',
                options: { query: 'enums', values: [] },
              },
            }) as GameDef['actions'][number]['effects'][number],
          ],
        },
      ],
      atomicity: 'partial',
    };

    const def = makeBaseDef({ actions: [action], actionPipelines: [profile] });
    const contexts = [
      MISSING_BINDING_POLICY_CONTEXTS.LEGAL_MOVES_EVENT_DECISION_SEQUENCE,
      MISSING_BINDING_POLICY_CONTEXTS.LEGAL_MOVES_PIPELINE_DECISION_SEQUENCE,
      MISSING_BINDING_POLICY_CONTEXTS.LEGAL_MOVES_FREE_OPERATION_DECISION_SEQUENCE,
    ] as const;
    for (const context of contexts) {
      assert.equal(
        isMoveDecisionSequenceAdmittedForLegalMove(
          def,
          makeBaseState(),
          makeMove('unsat-admission-op'),
          context,
        ),
        false,
      );
    }
  });

  it('legal-move admission helper treats deferrable missing bindings as admissible unknowns across admission contexts', () => {
    const action: ActionDef = {
      id: asActionId('missing-binding-admission-op'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const profile: ActionPipelineDef = {
      id: 'missing-binding-admission-profile',
      actionId: asActionId('missing-binding-admission-op'),
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [
        {
          effects: [
            eff({
              if: {
                when: { op: '==', left: { _t: 2, ref: 'binding', name: '$missing' }, right: 1 },
                then: [],
              },
            }) as GameDef['actions'][number]['effects'][number],
          ],
        },
      ],
      atomicity: 'partial',
    };

    const def = makeBaseDef({ actions: [action], actionPipelines: [profile] });
    const contexts = [
      MISSING_BINDING_POLICY_CONTEXTS.LEGAL_MOVES_EVENT_DECISION_SEQUENCE,
      MISSING_BINDING_POLICY_CONTEXTS.LEGAL_MOVES_PIPELINE_DECISION_SEQUENCE,
      MISSING_BINDING_POLICY_CONTEXTS.LEGAL_MOVES_FREE_OPERATION_DECISION_SEQUENCE,
    ] as const;
    for (const context of contexts) {
      assert.equal(
        isMoveDecisionSequenceAdmittedForLegalMove(
          def,
          makeBaseState(),
          makeMove('missing-binding-admission-op'),
          context,
        ),
        true,
      );
    }
  });

  it('legal-move admission helper rethrows non-deferrable decision-sequence errors across admission contexts', () => {
    const action: ActionDef = {
      id: asActionId('nondeferrable-admission-op'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const profile: ActionPipelineDef = {
      id: 'nondeferrable-admission-profile',
      actionId: asActionId('nondeferrable-admission-op'),
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [
        {
          effects: [
            eff({
              if: {
                when: { op: '==', left: { _t: 2, ref: 'gvar', var: 'missingVar' }, right: 1 },
                then: [],
              },
            }) as GameDef['actions'][number]['effects'][number],
          ],
        },
      ],
      atomicity: 'partial',
    };

    const def = makeBaseDef({ actions: [action], actionPipelines: [profile] });
    const contexts = [
      MISSING_BINDING_POLICY_CONTEXTS.LEGAL_MOVES_EVENT_DECISION_SEQUENCE,
      MISSING_BINDING_POLICY_CONTEXTS.LEGAL_MOVES_PIPELINE_DECISION_SEQUENCE,
      MISSING_BINDING_POLICY_CONTEXTS.LEGAL_MOVES_FREE_OPERATION_DECISION_SEQUENCE,
    ] as const;
    for (const context of contexts) {
      assert.throws(() =>
        isMoveDecisionSequenceAdmittedForLegalMove(
          def,
          makeBaseState(),
          makeMove('nondeferrable-admission-op'),
          context,
        ),
      );
    }
  });

  it('returns incomplete with warning when deferred predicate budget is exceeded', () => {
    const action: ActionDef = {
      id: asActionId('deferred-op'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const profile: ActionPipelineDef = {
      id: 'deferred-profile',
      actionId: asActionId('deferred-op'),
      legality: { op: '==', left: { _t: 2, ref: 'binding', name: '$missing' }, right: 1 },
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [{ effects: [] }],
      atomicity: 'partial',
    };

    const result = resolveMoveDecisionSequence(
      makeBaseDef({ actions: [action], actionPipelines: [profile] }),
      makeBaseState(),
      makeMove('deferred-op'),
      {
        budgets: { maxDeferredPredicates: 0 },
      },
    );

    assert.equal(result.complete, false);
    assert.equal(result.warnings.some((warning) => warning.code === 'MOVE_ENUM_DEFERRED_PREDICATE_BUDGET_EXCEEDED'), true);
  });

  it('discovers nested templated decision ids in deterministic order', () => {
    const action: ActionDef = {
      id: asActionId('nested-op'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const profile: ActionPipelineDef = {
      id: 'nested-profile',
      actionId: asActionId('nested-op'),
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [
        {
          effects: [
            eff({
              forEach: {
                over: { query: 'enums', values: ['north', 'south'] },
                bind: '$region',
                effects: [
                  eff({
                    chooseOne: {
                      internalDecisionId: 'decision:$mode@{$region}',
                      bind: '$mode@{$region}',
                      options: { query: 'enums', values: ['a', 'b'] },
                    },
                  }),
                ],
              },
            }) as GameDef['actions'][number]['effects'][number],
          ],
        },
      ],
      atomicity: 'partial',
    };

    const def = makeBaseDef({ actions: [action], actionPipelines: [profile] });
    const selectedDecisionIds: string[] = [];
    const result = resolveMoveDecisionSequence(def, makeBaseState(), makeMove('nested-op'), {
      choose: (request) => {
        selectedDecisionIds.push(request.decisionKey);
        return request.options[1]?.value;
      },
    });

    assert.equal(result.complete, true);
    assert.deepEqual(selectedDecisionIds, [
      'decision:$mode@{$region}::$mode@north[0]',
      'decision:$mode@{$region}::$mode@south[1]',
    ]);
    assert.equal(result.move.params['decision:$mode@{$region}::$mode@north[0]'], 'b');
    assert.equal(result.move.params['decision:$mode@{$region}::$mode@south[1]'], 'b');
  });

  it('throws for malformed decision-path expressions instead of treating them as unsatisfiable', () => {
    const action: ActionDef = {
      id: asActionId('broken-decision-op'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const profile: ActionPipelineDef = {
      id: 'broken-decision-profile',
      actionId: asActionId('broken-decision-op'),
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [
        {
          effects: [
            eff({
              if: {
                when: { op: '==', left: { _t: 2, ref: 'gvar', var: 'missingVar' }, right: 1 },
                then: [],
              },
            }) as GameDef['actions'][number]['effects'][number],
          ],
        },
      ],
      atomicity: 'partial',
    };

    const def = makeBaseDef({ actions: [action], actionPipelines: [profile] });
    const state = makeBaseState();
    const move = makeMove('broken-decision-op');

    assert.throws(() => isMoveDecisionSequenceSatisfiable(def, state, move));
  });

  it('applies free-operation zone filters at decision checkpoints for template moves', () => {
    const action: ActionDef = {
      id: asActionId('operation'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const profile: ActionPipelineDef = {
      id: 'operation-profile',
      actionId: asActionId('operation'),
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [
        {
          effects: [
            {
              chooseOne: {
                internalDecisionId: 'decision:$zone',
                bind: '$zone',
                options: { query: 'zones' },
              },
            } as GameDef['actions'][number]['effects'][number],
          ],
        },
      ],
      atomicity: 'partial',
    };

    const def: GameDef = asTaggedGameDef({
      ...makeBaseDef({ actions: [action], actionPipelines: [profile] }),
      zones: createSequenceContextMismatchZones({ includeAdjacency: true }),
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: { seats: ['0', '1'] },

            windows: [],
            actionClassByActionId: { operation: 'operation' },
            optionMatrix: [],
            passRewards: [],
            freeOperationActionIds: ['operation'],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
          },
        },
      },
    });

    const state = makeBaseState({
      zones: { 'board:cambodia': [], 'board:vietnam': [] },
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
          seatOrder: ['0', '1'],
          eligibility: { '0': true, '1': true },
          currentCard: {
            firstEligible: '0',
            secondEligible: '1',
            actedSeats: [],
            passedSeats: [],
            nonPassCount: 0,
            firstActionClass: null,
          },
          pendingEligibilityOverrides: [],
          pendingFreeOperationGrants: [
            {
              grantId: 'grant-0',
              phase: 'ready',
              seat: '0',
              operationClass: 'operation',
              actionIds: ['operation'],
              zoneFilter: {
                op: '==',
                left: { _t: 2, ref: 'zoneProp', zone: '$zone', prop: 'country' },
                right: 'cambodia',
              },
              remainingUses: 1,
            },
          ],
        },
      },
    });

    const result = resolveMoveDecisionSequence(
      def,
      state,
      { actionId: asActionId('operation'), params: {}, freeOperation: true },
      { choose: () => undefined },
    );

    assert.equal(result.complete, false);
    assert.equal(result.nextDecision?.decisionKey, '$zone');
    assert.deepEqual(result.nextDecision?.options.map((option) => option.value), ['board:cambodia']);
  });

  it('defers unresolved non-$zone bindings when probing free-operation zone filters', () => {
    const action: ActionDef = {
      id: asActionId('operation'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const profile: ActionPipelineDef = {
      id: 'operation-profile',
      actionId: asActionId('operation'),
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [
        {
          effects: [
            {
              chooseOne: {
                internalDecisionId: 'decision:$targetProvince',
                bind: '$targetProvince',
                options: { query: 'zones' },
              },
            } as GameDef['actions'][number]['effects'][number],
          ],
        },
      ],
      atomicity: 'partial',
    };

    const def: GameDef = asTaggedGameDef({
      ...makeBaseDef({ actions: [action], actionPipelines: [profile] }),
      zones: [
        { id: asZoneId('board:cambodia'), owner: 'none', visibility: 'public', ordering: 'set', category: 'province', attributes: { population: 1, econ: 0, terrainTags: [], country: 'cambodia', coastal: false }, adjacentTo: [] },
        { id: asZoneId('board:vietnam'), owner: 'none', visibility: 'public', ordering: 'set', category: 'province', attributes: { population: 1, econ: 0, terrainTags: [], country: 'southVietnam', coastal: false }, adjacentTo: [] },
      ],
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: { seats: ['0', '1'] },

            windows: [],
            actionClassByActionId: { operation: 'operation' },
            optionMatrix: [],
            passRewards: [],
            freeOperationActionIds: ['operation'],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
          },
        },
      },
    });

    const state = makeBaseState({
      zones: { 'board:cambodia': [], 'board:vietnam': [] },
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
          seatOrder: ['0', '1'],
          eligibility: { '0': true, '1': true },
          currentCard: {
            firstEligible: '0',
            secondEligible: '1',
            actedSeats: [],
            passedSeats: [],
            nonPassCount: 0,
            firstActionClass: null,
          },
          pendingEligibilityOverrides: [],
          pendingFreeOperationGrants: [
            {
              grantId: 'grant-0',
              phase: 'ready',
              seat: '0',
              operationClass: 'operation',
              actionIds: ['operation'],
              zoneFilter: {
                op: '==',
                left: { _t: 2, ref: 'zoneProp', zone: '$targetProvince', prop: 'country' },
                right: 'cambodia',
              },
              remainingUses: 1,
            },
          ],
        },
      },
    });

    const result = resolveMoveDecisionSequence(
      def,
      state,
      { actionId: asActionId('operation'), params: {}, freeOperation: true },
      { choose: () => undefined },
    );

    assert.equal(result.complete, false);
    assert.equal(result.nextDecision?.decisionKey, '$targetProvince');
    assert.deepEqual(result.nextDecision?.options.map((option) => option.value), ['board:cambodia']);
  });

  it('defers unresolved non-$zone bindings on per-zone candidate filter evaluation', () => {
    const action: ActionDef = {
      id: asActionId('operation'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const profile: ActionPipelineDef = {
      id: 'operation-profile',
      actionId: asActionId('operation'),
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [
        {
          effects: [
            {
              chooseOne: {
                internalDecisionId: 'decision:$targetProvince',
                bind: '$targetProvince',
                options: { query: 'zones' },
              },
            } as GameDef['actions'][number]['effects'][number],
          ],
        },
      ],
      atomicity: 'partial',
    };

    const def: GameDef = asTaggedGameDef({
      ...makeBaseDef({ actions: [action], actionPipelines: [profile] }),
      zones: [
        { id: asZoneId('board:cambodia'), owner: 'none', visibility: 'public', ordering: 'set', category: 'province', attributes: { population: 1, econ: 0, terrainTags: [], country: 'cambodia', coastal: false }, adjacentTo: [] },
        { id: asZoneId('board:vietnam'), owner: 'none', visibility: 'public', ordering: 'set', category: 'province', attributes: { population: 1, econ: 0, terrainTags: [], country: 'southVietnam', coastal: false }, adjacentTo: [] },
      ],
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: { seats: ['0', '1'] },

            windows: [],
            actionClassByActionId: { operation: 'operation' },
            optionMatrix: [],
            passRewards: [],
            freeOperationActionIds: ['operation'],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
          },
        },
      },
    });

    const state = makeBaseState({
      zones: { 'board:cambodia': [], 'board:vietnam': [] },
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
          seatOrder: ['0', '1'],
          eligibility: { '0': true, '1': true },
          currentCard: {
            firstEligible: '0',
            secondEligible: '1',
            actedSeats: [],
            passedSeats: [],
            nonPassCount: 0,
            firstActionClass: null,
          },
          pendingEligibilityOverrides: [],
          pendingFreeOperationGrants: [
            {
              grantId: 'grant-0',
              phase: 'ready',
              seat: '0',
              operationClass: 'operation',
              actionIds: ['operation'],
              zoneFilter: {
                op: '==',
                left: { _t: 2, ref: 'zoneProp', zone: '$targetProvince', prop: 'country' },
                right: { _t: 2, ref: 'binding', name: '$targetCountry' },
              },
              remainingUses: 1,
            },
          ],
        },
      },
    });

    const result = resolveMoveDecisionSequence(
      def,
      state,
      { actionId: asActionId('operation'), params: {}, freeOperation: true },
      { choose: () => undefined },
    );

    assert.equal(result.complete, false);
    assert.equal(result.nextDecision?.decisionKey, '$targetProvince');
    assert.deepEqual(result.nextDecision?.options.map((option) => option.value), ['board:cambodia', 'board:vietnam']);
  });

  it('resolves multi-unresolved zone aliases deterministically during free-operation probe evaluation', () => {
    const action: ActionDef = {
      id: asActionId('operation'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const profile: ActionPipelineDef = {
      id: 'operation-profile',
      actionId: asActionId('operation'),
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [
        {
          effects: [
            {
              chooseOne: {
                internalDecisionId: 'decision:$targetProvince',
                bind: '$targetProvince',
                options: { query: 'zones' },
              },
            } as GameDef['actions'][number]['effects'][number],
          ],
        },
      ],
      atomicity: 'partial',
    };

    const def: GameDef = asTaggedGameDef({
      ...makeBaseDef({ actions: [action], actionPipelines: [profile] }),
      zones: [
        { id: asZoneId('board:cambodia'), owner: 'none', visibility: 'public', ordering: 'set', category: 'province', attributes: { population: 1, econ: 0, terrainTags: [], country: 'cambodia', coastal: false }, adjacentTo: [] },
        { id: asZoneId('board:vietnam'), owner: 'none', visibility: 'public', ordering: 'set', category: 'province', attributes: { population: 1, econ: 0, terrainTags: [], country: 'southVietnam', coastal: false }, adjacentTo: [] },
      ],
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: { seats: ['0', '1'] },

            windows: [],
            actionClassByActionId: { operation: 'operation' },
            optionMatrix: [],
            passRewards: [],
            freeOperationActionIds: ['operation'],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
          },
        },
      },
    });

    const state = makeBaseState({
      zones: { 'board:cambodia': [], 'board:vietnam': [] },
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
          seatOrder: ['0', '1'],
          eligibility: { '0': true, '1': true },
          currentCard: {
            firstEligible: '0',
            secondEligible: '1',
            actedSeats: [],
            passedSeats: [],
            nonPassCount: 0,
            firstActionClass: null,
          },
          pendingEligibilityOverrides: [],
          pendingFreeOperationGrants: [
            {
              grantId: 'grant-0',
              phase: 'ready',
              seat: '0',
              operationClass: 'operation',
              actionIds: ['operation'],
              zoneFilter: {
                op: 'and',
                args: [
                  {
                    op: '==',
                    left: { _t: 2, ref: 'zoneProp', zone: '$targetProvince', prop: 'country' },
                    right: 'cambodia',
                  },
                  {
                    op: '==',
                    left: { _t: 2, ref: 'zoneProp', zone: '$supportProvince', prop: 'country' },
                    right: 'cambodia',
                  },
                ],
              },
              remainingUses: 1,
            },
          ],
        },
      },
    });

    const result = resolveMoveDecisionSequence(
      def,
      state,
      { actionId: asActionId('operation'), params: {}, freeOperation: true },
      { choose: () => undefined },
    );

    assert.equal(result.complete, false);
    assert.equal(result.nextDecision?.decisionKey, '$targetProvince');
    assert.deepEqual(result.nextDecision?.options.map((option) => option.value), ['board:cambodia']);
  });

  it('rejects decision selections outside the free-operation zone filter domain', () => {
    const action: ActionDef = {
      id: asActionId('operation'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const profile: ActionPipelineDef = {
      id: 'operation-profile',
      actionId: asActionId('operation'),
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [
        {
          effects: [
            {
              chooseOne: {
                internalDecisionId: 'decision:$zone',
                bind: '$zone',
                options: { query: 'zones' },
              },
            } as GameDef['actions'][number]['effects'][number],
          ],
        },
      ],
      atomicity: 'partial',
    };

    const def: GameDef = asTaggedGameDef({
      ...makeBaseDef({ actions: [action], actionPipelines: [profile] }),
      zones: [
        { id: asZoneId('board:cambodia'), owner: 'none', visibility: 'public', ordering: 'set', category: 'province', attributes: { population: 1, econ: 0, terrainTags: [], country: 'cambodia', coastal: false }, adjacentTo: [] },
        { id: asZoneId('board:vietnam'), owner: 'none', visibility: 'public', ordering: 'set', category: 'province', attributes: { population: 1, econ: 0, terrainTags: [], country: 'southVietnam', coastal: false }, adjacentTo: [] },
      ],
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: { seats: ['0', '1'] },

            windows: [],
            actionClassByActionId: { operation: 'operation' },
            optionMatrix: [],
            passRewards: [],
            freeOperationActionIds: ['operation'],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
          },
        },
      },
    });

    const state = makeBaseState({
      zones: { 'board:cambodia': [], 'board:vietnam': [] },
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
          seatOrder: ['0', '1'],
          eligibility: { '0': true, '1': true },
          currentCard: {
            firstEligible: '0',
            secondEligible: '1',
            actedSeats: [],
            passedSeats: [],
            nonPassCount: 0,
            firstActionClass: null,
          },
          pendingEligibilityOverrides: [],
          pendingFreeOperationGrants: [
            {
              grantId: 'grant-0',
              phase: 'ready',
              seat: '0',
              operationClass: 'operation',
              actionIds: ['operation'],
              zoneFilter: {
                op: '==',
                left: { _t: 2, ref: 'zoneProp', zone: '$zone', prop: 'country' },
                right: 'cambodia',
              },
              remainingUses: 1,
            },
          ],
        },
      },
    });

    const result = resolveMoveDecisionSequence(def, state, {
      actionId: asActionId('operation'),
      params: { '$zone': 'board:vietnam' },
      freeOperation: true,
    });
    assert.equal(result.complete, false);
    assert.deepEqual(result.illegal, {
      kind: 'illegal',
      complete: false,
      reason: 'freeOperationZoneFilterMismatch',
    });
  });

  it('rejects decision selections outside the captured free-operation sequence context', () => {
    const action: ActionDef = {
      id: asActionId('operation'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };

    const profile: ActionPipelineDef = {
      id: 'operation-profile',
      actionId: asActionId('operation'),
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [
        {
          effects: [
            {
              chooseOne: {
                internalDecisionId: 'decision:$zone',
                bind: '$zone',
                options: { query: 'zones' },
              },
            } as GameDef['actions'][number]['effects'][number],
          ],
        },
      ],
      atomicity: 'partial',
    };

    const def: GameDef = asTaggedGameDef({
      ...makeBaseDef({ actions: [action], actionPipelines: [profile] }),
      zones: [
        { id: asZoneId('board:cambodia'), owner: 'none', visibility: 'public', ordering: 'set', category: 'province', attributes: { population: 1, econ: 0, terrainTags: [], country: 'cambodia', coastal: false }, adjacentTo: [] },
        { id: asZoneId('board:vietnam'), owner: 'none', visibility: 'public', ordering: 'set', category: 'province', attributes: { population: 1, econ: 0, terrainTags: [], country: 'southVietnam', coastal: false }, adjacentTo: [] },
      ],
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
            eligibility: { seats: ['0', '1'] },

            windows: [],
            actionClassByActionId: { operation: 'operation' },
            optionMatrix: [],
            passRewards: [],
            freeOperationActionIds: ['operation'],
            durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
          },
        },
      },
    });

    const state = makeBaseState({
      zones: createSequenceContextMismatchZoneState(),
      turnOrderState: createSequenceContextMismatchTurnOrderState(),
    });

    const result = resolveMoveDecisionSequence(def, state, {
      actionId: asActionId('operation'),
      params: { '$zone': SEQUENCE_CONTEXT_DENIED_ZONE_ID },
      freeOperation: true,
    });
    assert.equal(result.complete, false);
    assert.deepEqual(result.illegal, {
      kind: 'illegal',
      complete: false,
      reason: 'freeOperationSequenceContextMismatch',
    });
  });

  const ownershipPrimitives: readonly ChoiceOwnershipPrimitive[] = ['chooseOne', 'chooseN'];

  it('accepts cross-seat chooser-owned decision params across non-pipeline choice primitives', () => {
    for (const primitive of ownershipPrimitives) {
      const actionId = `cross-seat-${primitive}-op`;
      const action: ActionDef = {
        id: asActionId(actionId),
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [
          buildChooserOwnedChoiceEffect(primitive, 'decision:$target', '$target', ['a', 'b']) as GameDef['actions'][number]['effects'][number],
        ],
        limits: [],
      };

      const def = makeBaseDef({ actions: [action] });
      const state = makeBaseState();

      const resolved = resolveMoveDecisionSequence(def, state, {
        actionId: asActionId(actionId),
        params: { '$target': ownershipSelection(primitive, 'a') },
      });
      assert.equal(resolved.complete, true, `Expected cross-seat ${primitive} resolution to complete`);
    }
  });

  it('accepts cross-seat chooser-owned decision params across pipeline choice primitives', () => {
    for (const primitive of ownershipPrimitives) {
      const actionId = `cross-seat-pipeline-${primitive}-op`;
      const action: ActionDef = {
        id: asActionId(actionId),
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      };
      const profile: ActionPipelineDef = {
        id: `cross-seat-pipeline-${primitive}-profile`,
        actionId: asActionId(actionId),
        legality: null,
        costValidation: null,
        costEffects: [],
        targeting: {},
        stages: [
          {
            effects: [
              buildChooserOwnedChoiceEffect(primitive, 'decision:$target', '$target', ['a', 'b']) as GameDef['actions'][number]['effects'][number],
            ],
          },
        ],
        atomicity: 'partial',
      };

      const def = makeBaseDef({ actions: [action], actionPipelines: [profile] });
      const state = makeBaseState();

      const resolved = resolveMoveDecisionSequence(def, state, {
        actionId: asActionId(actionId),
        params: { '$target': ownershipSelection(primitive, 'a') },
      });
      assert.equal(resolved.complete, true, `Expected cross-seat pipeline ${primitive} resolution to complete`);
    }
  });

  it('returns the current pending decision when a stale replayed decision key is supplied', () => {
    const action: ActionDef = {
      id: asActionId('stale-key-op'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [{ name: 'mode', domain: { query: 'enums', values: ['a', 'b'] } }],
      pre: null,
      cost: [],
      effects: [
        {
          chooseOne: {
            internalDecisionId: 'decision:$pick@{mode}',
            bind: '$pick@{mode}',
            options: { query: 'intsInRange', min: 1, max: 2 },
          },
        } as GameDef['actions'][number]['effects'][number],
      ],
      limits: [],
    };

    const def = makeBaseDef({ actions: [action] });
    const state = makeBaseState();
    const requestA = resolveMoveDecisionSequence(def, state, {
      actionId: asActionId('stale-key-op'),
      params: { mode: 'a' },
    }, {
      choose: () => undefined,
    });
    assert.equal(requestA.complete, false);
    const staleDecisionId = requestA.nextDecision?.decisionKey;
    assert.equal(typeof staleDecisionId, 'string');

    const result = resolveMoveDecisionSequence(def, state, {
      actionId: asActionId('stale-key-op'),
      params: {
        mode: 'b',
        [staleDecisionId as string]: 2,
      },
    }, {
      choose: () => undefined,
    });
    assert.equal(result.complete, false);
    assert.notEqual(result.nextDecision?.decisionKey, staleDecisionId);
    assert.equal(result.nextDecision?.name, '$pick@b');
  });
});
