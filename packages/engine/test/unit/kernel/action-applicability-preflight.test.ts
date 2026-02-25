import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveActionApplicabilityPreflight } from '../../../src/kernel/action-applicability-preflight.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asZoneId,
  buildAdjacencyGraph,
  type ActionDef,
  type ActionPipelineDef,
  type GameDef,
  type GameState,
} from '../../../src/kernel/index.js';

const makeDef = (overrides?: {
  readonly action?: ActionDef;
  readonly actionPipelines?: readonly ActionPipelineDef[];
}): GameDef =>
  ({
    metadata: { id: 'action-applicability-preflight-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [{ id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }, { id: asPhaseId('other') }] },
    actions: [
      overrides?.action ?? {
        id: asActionId('op'),
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
    ],
    ...(overrides?.actionPipelines === undefined ? {} : { actionPipelines: overrides.actionPipelines }),
    triggers: [],
    terminal: { conditions: [] },
  }) as unknown as GameDef;

const makeState = (overrides?: Partial<GameState>): GameState => ({
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
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
  ...overrides,
});

describe('resolveActionApplicabilityPreflight()', () => {
  it('returns phaseMismatch when action phase does not match state phase', () => {
    const def = makeDef();
    const state = makeState({ currentPhase: asPhaseId('other') });
    const action = def.actions[0]!;
    const result = resolveActionApplicabilityPreflight({
      def,
      state,
      action,
      adjacencyGraph: buildAdjacencyGraph(def.zones),
      decisionPlayer: state.activePlayer,
      bindings: {},
    });
    assert.deepStrictEqual(result, { kind: 'notApplicable', reason: 'phaseMismatch' });
  });

  it('returns actorNotApplicable when active player is not in actor selector', () => {
    const def = makeDef({
      action: {
        id: asActionId('op'),
        actor: { id: asPlayerId(1) },
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
    });
    const state = makeState({ activePlayer: asPlayerId(0) });
    const action = def.actions[0]!;
    const result = resolveActionApplicabilityPreflight({
      def,
      state,
      action,
      adjacencyGraph: buildAdjacencyGraph(def.zones),
      decisionPlayer: state.activePlayer,
      bindings: {},
    });
    assert.deepStrictEqual(result, { kind: 'notApplicable', reason: 'actorNotApplicable' });
  });

  it('returns executorNotApplicable when executor resolves outside player count', () => {
    const def = makeDef({
      action: {
        id: asActionId('op'),
        actor: 'active',
        executor: { id: asPlayerId(4) },
        phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
    });
    const state = makeState({ playerCount: 2 });
    const action = def.actions[0]!;
    const result = resolveActionApplicabilityPreflight({
      def,
      state,
      action,
      adjacencyGraph: buildAdjacencyGraph(def.zones),
      decisionPlayer: state.activePlayer,
      bindings: {},
    });
    assert.deepStrictEqual(result, { kind: 'notApplicable', reason: 'executorNotApplicable' });
  });

  it('returns actionLimitExceeded when action usage reached configured limit', () => {
    const def = makeDef({
      action: {
        id: asActionId('limitedOp'),
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [{ scope: 'phase', max: 1 }],
      },
    });
    const state = makeState({
      actionUsage: {
        limitedOp: {
          turnCount: 0,
          phaseCount: 1,
          gameCount: 0,
        },
      },
    });
    const action = def.actions[0]!;
    const result = resolveActionApplicabilityPreflight({
      def,
      state,
      action,
      adjacencyGraph: buildAdjacencyGraph(def.zones),
      decisionPlayer: state.activePlayer,
      bindings: {},
    });
    assert.deepStrictEqual(result, { kind: 'notApplicable', reason: 'actionLimitExceeded' });
  });

  it('returns pipelineNotApplicable when pipelines exist but none match', () => {
    const def = makeDef({
      actionPipelines: [
        {
          id: 'op-profile',
          actionId: asActionId('op'),
          applicability: { op: '==', left: { ref: 'activePlayer' }, right: 1 },
          legality: null,
          costValidation: null,
          costEffects: [],
          targeting: {},
          stages: [],
          atomicity: 'atomic',
        },
      ],
    });
    const state = makeState({ activePlayer: asPlayerId(0) });
    const action = def.actions[0]!;
    const result = resolveActionApplicabilityPreflight({
      def,
      state,
      action,
      adjacencyGraph: buildAdjacencyGraph(def.zones),
      decisionPlayer: state.activePlayer,
      bindings: {},
    });
    assert.deepStrictEqual(result, { kind: 'notApplicable', reason: 'pipelineNotApplicable' });
  });

  it('returns applicable with matched pipeline when all gates pass', () => {
    const def = makeDef({
      actionPipelines: [
        {
          id: 'op-profile',
          actionId: asActionId('op'),
          applicability: { op: '==', left: { ref: 'activePlayer' }, right: 0 },
          legality: null,
          costValidation: null,
          costEffects: [],
          targeting: {},
          stages: [],
          atomicity: 'atomic',
        },
      ],
    });
    const state = makeState({ activePlayer: asPlayerId(0) });
    const action = def.actions[0]!;
    const result = resolveActionApplicabilityPreflight({
      def,
      state,
      action,
      adjacencyGraph: buildAdjacencyGraph(def.zones),
      decisionPlayer: state.activePlayer,
      bindings: {},
    });

    assert.equal(result.kind, 'applicable');
    if (result.kind === 'applicable') {
      assert.equal(result.executionPlayer, asPlayerId(0));
      assert.equal(result.pipelineDispatch.kind, 'matched');
    }
  });

  it('returns invalidSpec when actor binding selector is not declared in action params', () => {
    const def = makeDef({
      action: {
        id: asActionId('op'),
        actor: { chosen: '$owner' },
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
    });
    const state = makeState();
    const action = def.actions[0]!;
    const result = resolveActionApplicabilityPreflight({
      def,
      state,
      action,
      adjacencyGraph: buildAdjacencyGraph(def.zones),
      decisionPlayer: state.activePlayer,
      bindings: {},
    });

    assert.equal(result.kind, 'invalidSpec');
    if (result.kind === 'invalidSpec') {
      assert.equal(result.selector, 'actor');
      assert.deepEqual(result.error, {
        role: 'actor',
        kind: 'bindingNotDeclared',
        binding: '$owner',
      });
      assert.deepEqual(result.selectorContractViolations, [
        {
          role: 'actor',
          kind: 'bindingNotDeclared',
          binding: '$owner',
        },
      ]);
    }
  });

  it('covers runtime preflight selector-contract matrix with deterministic first violation', () => {
    for (const actorUsesBinding of [false, true] as const) {
      for (const executorUsesBinding of [false, true] as const) {
        for (const actorDeclared of [false, true] as const) {
          for (const executorDeclared of [false, true] as const) {
            for (const hasPipeline of [false, true] as const) {
              const action: ActionDef = {
                id: asActionId('op'),
                actor: actorUsesBinding ? { chosen: '$actorOwner' } : 'active',
                executor: executorUsesBinding ? { chosen: '$execOwner' } : 'actor',
                phase: [asPhaseId('main')],
                params: [
                  ...(actorUsesBinding && actorDeclared ? [{ name: '$actorOwner', domain: { query: 'players' as const } }] : []),
                  ...(executorUsesBinding && executorDeclared ? [{ name: '$execOwner', domain: { query: 'players' as const } }] : []),
                ],
                pre: null,
                cost: [],
                effects: [],
                limits: [],
              };
              const def = makeDef({
                action,
                ...(hasPipeline
                  ? {
                      actionPipelines: [
                        {
                          id: 'op-profile',
                          actionId: asActionId('op'),
                          applicability: { op: '==', left: 1, right: 1 },
                          legality: null,
                          costValidation: null,
                          costEffects: [],
                          targeting: {},
                          stages: [],
                          atomicity: 'atomic',
                        },
                      ],
                    }
                  : {}),
              });
              const state = makeState();
              const result = resolveActionApplicabilityPreflight({
                def,
                state,
                action: def.actions[0]!,
                adjacencyGraph: buildAdjacencyGraph(def.zones),
                decisionPlayer: state.activePlayer,
                bindings: {
                  $actorOwner: asPlayerId(0),
                  $execOwner: asPlayerId(1),
                },
              });

              const expected = (() => {
                const selectorContractViolations: Array<{
                  role: 'actor' | 'executor';
                  kind: 'bindingNotDeclared' | 'bindingWithPipelineUnsupported';
                  binding: string;
                }> = [];
                if (actorUsesBinding && !actorDeclared) {
                  selectorContractViolations.push({
                    role: 'actor',
                    kind: 'bindingNotDeclared',
                    binding: '$actorOwner',
                  });
                }
                if (executorUsesBinding && !executorDeclared) {
                  selectorContractViolations.push({
                    role: 'executor',
                    kind: 'bindingNotDeclared',
                    binding: '$execOwner',
                  });
                }
                if (executorUsesBinding && hasPipeline) {
                  selectorContractViolations.push({
                    role: 'executor',
                    kind: 'bindingWithPipelineUnsupported',
                    binding: '$execOwner',
                  });
                }
                if (selectorContractViolations.length > 0) {
                  const primary = selectorContractViolations[0]!;
                  return {
                    kind: 'invalidSpec' as const,
                    selector: primary.role,
                    error: primary,
                    selectorContractViolations,
                  };
                }
                return null;
              })();

              if (expected === null) {
                assert.equal(result.kind, 'applicable');
              } else {
                assert.deepEqual(
                  result,
                  expected,
                  `actorUsesBinding=${actorUsesBinding} executorUsesBinding=${executorUsesBinding} actorDeclared=${actorDeclared} executorDeclared=${executorDeclared} hasPipeline=${hasPipeline}`,
                );
              }
            }
          }
        }
      }
    }
  });

  it('returns invalidSpec when pipelined action uses binding-derived executor', () => {
    const def = makeDef({
      action: {
        id: asActionId('op'),
        actor: 'active',
        executor: { chosen: '$owner' },
        phase: [asPhaseId('main')],
        params: [{ name: '$owner', domain: { query: 'players' } }],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
      actionPipelines: [
        {
          id: 'op-profile',
          actionId: asActionId('op'),
          applicability: { op: '==', left: 1, right: 1 },
          legality: null,
          costValidation: null,
          costEffects: [],
          targeting: {},
          stages: [],
          atomicity: 'atomic',
        },
      ],
    });
    const state = makeState();
    const action = def.actions[0]!;
    const result = resolveActionApplicabilityPreflight({
      def,
      state,
      action,
      adjacencyGraph: buildAdjacencyGraph(def.zones),
      decisionPlayer: state.activePlayer,
      bindings: {},
    });

    assert.deepEqual(result, {
      kind: 'invalidSpec',
      selector: 'executor',
      error: {
        role: 'executor',
        kind: 'bindingWithPipelineUnsupported',
        binding: '$owner',
      },
      selectorContractViolations: [
        {
          role: 'executor',
          kind: 'bindingWithPipelineUnsupported',
          binding: '$owner',
        },
      ],
    });
  });
});
