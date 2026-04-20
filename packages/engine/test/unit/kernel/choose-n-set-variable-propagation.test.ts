// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asZoneId,
  classifyMoveDecisionSequenceSatisfiability,
  legalChoicesDiscover,
  propagateChooseNSetVariable,
  resolveMoveEnumerationBudgets,
  type ChoicePendingChooseNRequest,
  type ChoiceRequest,
  type GameDef,
  type GameState,
  type Move,
  type MoveParamScalar,
} from '../../../src/kernel/index.js';
import { asTaggedGameDef } from '../../helpers/gamedef-fixtures.js';
import { eff } from '../../helpers/effect-tag-helper.js';

const makeBaseState = (): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 2,
  zones: {
    'board:none': [],
  },
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [7n, 13n] },
  stateHash: 0n,
  _runningHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
  reveals: undefined,
  globalMarkers: undefined,
  activeLastingEffects: undefined,
  interruptPhaseStack: undefined,
});

const makeMove = (): Move => ({
  actionId: asActionId('propagation-op'),
  params: {},
});

const makeChooseNRequest = (
  options: readonly string[],
  supportedSelections: readonly (readonly string[])[],
  config?: {
    readonly selected?: readonly string[];
    readonly min?: number;
    readonly max?: number;
  },
): ChoicePendingChooseNRequest => ({
  kind: 'pending',
  complete: false,
  decisionKey: 'decision:$pickMany' as never,
  name: '$pickMany',
  type: 'chooseN',
  min: config?.min ?? 0,
  max: config?.max ?? options.length,
  selected: (config?.selected ?? []) as readonly MoveParamScalar[],
  canConfirm: (config?.selected?.length ?? 0) >= (config?.min ?? 0),
  targetKinds: [],
  options: options.map((value) => ({
    value,
    legality: supportedSelections.some((selection) => selection.includes(value)) ? 'unknown' : 'unknown',
    illegalReason: null,
  })),
});

const asSelection = (value: unknown): readonly string[] =>
  Array.isArray(value) ? [...value].map((entry) => String(entry)).sort() : [];

const isSubset = (subset: readonly string[], superset: readonly string[]): boolean =>
  subset.every((value) => superset.includes(value));

const createSyntheticSupportContext = (
  request: ChoicePendingChooseNRequest,
  supportedSelections: readonly (readonly string[])[],
) => ({
  evaluateProbeMove: (move: Move): ChoiceRequest => {
    const selection = asSelection(move.params[request.decisionKey]);
    if (selection.length === 0 && request.selected.length === 0) {
      return request;
    }
    if (selection.length > (request.max ?? request.options.length)) {
      return { kind: 'illegal', complete: false, reason: 'pipelineLegalityFailed' };
    }
    if (supportedSelections.some((candidate) => candidate.join('|') === selection.join('|'))) {
      return { kind: 'complete', complete: true };
    }
    if (supportedSelections.some((candidate) => isSubset(selection, candidate))) {
      return {
        ...request,
        selected: selection as readonly MoveParamScalar[],
        canConfirm: selection.length >= (request.min ?? 0),
      };
    }
    return { kind: 'illegal', complete: false, reason: 'pipelineLegalityFailed' };
  },
  classifyProbeMoveSatisfiability: (move: Move) => {
    const selection = asSelection(move.params[request.decisionKey]);
    return supportedSelections.some((candidate) => isSubset(selection, candidate))
      ? 'satisfiable'
      : 'unsatisfiable';
  },
});

const makeAdversarialDef = (): GameDef =>
  asTaggedGameDef({
    metadata: { id: 'choose-n-propagation-test', players: { min: 2, max: 2 } },
    seats: [{ id: '0' }, { id: '1' }],
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [{ id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [{
      id: asActionId('propagation-op'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    }],
    actionPipelines: [{
      id: 'propagation-op-profile',
      actionId: asActionId('propagation-op'),
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [{
        effects: [
          eff({
            chooseN: {
              internalDecisionId: 'decision:$march',
              bind: '$march',
              options: {
                query: 'enums',
                values: Array.from({ length: 27 }, (_, index) => `space-${index}`),
              },
              min: 1,
              max: 27,
            },
          }) as GameDef['actions'][number]['effects'][number],
          eff({
            chooseOne: {
              internalDecisionId: 'decision:$followup',
              bind: '$followup',
              options: {
                query: 'enums',
                values: ['commit', 'hold'],
              },
            },
          }) as GameDef['actions'][number]['effects'][number],
        ],
      }],
      atomicity: 'partial',
    }],
    triggers: [],
    terminal: { conditions: [] },
  });

describe('chooseN set-variable propagation', () => {
  it('returns unsat when the lower bound already exceeds max', () => {
    const request = makeChooseNRequest(['alpha', 'beta'], [['alpha']], {
      selected: ['alpha', 'beta'],
      min: 1,
      max: 1,
    });

    const result = propagateChooseNSetVariable(
      request,
      makeMove(),
      createSyntheticSupportContext(request, [['alpha']]),
    );

    assert.deepEqual(result, { kind: 'unsat' });
  });

  it('returns unsat when the upper bound cannot satisfy min', () => {
    const request = makeChooseNRequest(['alpha', 'beta'], [['alpha']], {
      min: 3,
      max: 3,
    });

    const result = propagateChooseNSetVariable(
      request,
      makeMove(),
      createSyntheticSupportContext(request, [['alpha']]),
    );

    assert.deepEqual(result, { kind: 'unsat' });
  });

  it('determines the lower bound exactly when forced exclusions collapse to max', () => {
    const request = makeChooseNRequest(['alpha', 'beta', 'gamma'], [['alpha', 'beta']], {
      min: 2,
      max: 2,
    });

    const result = propagateChooseNSetVariable(
      request,
      makeMove(),
      createSyntheticSupportContext(request, [['alpha', 'beta']]),
    );

    assert.deepEqual(result, { kind: 'determined', selection: ['alpha', 'beta'] });
  });

  it('determines the upper bound exactly when unsupported options are removed down to min', () => {
    const request = makeChooseNRequest(['alpha', 'beta', 'gamma'], [['alpha', 'beta']], {
      min: 2,
      max: 3,
    });

    const result = propagateChooseNSetVariable(
      request,
      makeMove(),
      createSyntheticSupportContext(request, [['alpha', 'beta']]),
    );

    assert.deepEqual(result, { kind: 'determined', selection: ['alpha', 'beta'] });
  });

  it('returns the supported singleton union in canonical branching order', () => {
    const supportedSelections = [['gamma'], ['alpha']] as const;
    const request = makeChooseNRequest(
      ['gamma', 'epsilon', 'alpha', 'delta', 'beta'],
      supportedSelections,
      { min: 1, max: 3 },
    );

    const result = propagateChooseNSetVariable(
      request,
      makeMove(),
      createSyntheticSupportContext(request, supportedSelections),
    );

    assert.deepEqual(result, {
      kind: 'branching',
      candidateSelections: [['alpha'], ['gamma']],
    });
  });

  it('stays within default move-enumeration budgets on the adversarial 27-option shape', () => {
    const def = makeAdversarialDef();
    const state = makeBaseState();
    const move = makeMove();
    const warnings: string[] = [];
    let classificationCalls = 0;

    const request = legalChoicesDiscover(def, state, move);
    assert.equal(request.kind, 'pending');
    assert.equal(request.type, 'chooseN');

    const budgets = resolveMoveEnumerationBudgets();
    const result = propagateChooseNSetVariable(request, move, {
      evaluateProbeMove: (probeMove) => legalChoicesDiscover(def, state, probeMove),
      classifyProbeMoveSatisfiability: (probeMove) => {
        classificationCalls += 1;
        return classifyMoveDecisionSequenceSatisfiability(def, state, probeMove, {
          budgets,
          onWarning: (warning) => warnings.push(warning.code),
        }).classification;
      },
      budgets,
    });

    assert.notEqual(result.kind, 'unsat');
    assert.equal(warnings.includes('MOVE_ENUM_PARAM_EXPANSION_BUDGET_EXCEEDED'), false);
    assert.ok(classificationCalls > 0);
    assert.ok(classificationCalls <= budgets.maxParamExpansions);
  });

  it('emits byte-identical branching candidates regardless of option permutation', () => {
    const supportedSelections = [['alpha'], ['gamma']] as const;
    const canonicalRequest = makeChooseNRequest(
      ['alpha', 'beta', 'gamma', 'delta'],
      supportedSelections,
      { min: 1, max: 2 },
    );
    const permutedRequest = makeChooseNRequest(
      ['gamma', 'delta', 'beta', 'alpha'],
      supportedSelections,
      { min: 1, max: 2 },
    );

    const canonical = propagateChooseNSetVariable(
      canonicalRequest,
      makeMove(),
      createSyntheticSupportContext(canonicalRequest, supportedSelections),
    );
    const permuted = propagateChooseNSetVariable(
      permutedRequest,
      makeMove(),
      createSyntheticSupportContext(permutedRequest, supportedSelections),
    );

    assert.deepEqual(canonical, permuted);
  });
});
