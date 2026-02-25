import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  asActionId,
  asPhaseId,
  asZoneId,
  createRng,
  initialState,
  legalChoicesDiscover,
  legalChoicesEvaluate,
  legalMoves,
  type GameDef,
  type GameState,
  type Move,
  type ActionPipelineDef,
} from '../../src/kernel/index.js';
import { RandomAgent } from '../../src/agents/random-agent.js';
import { GreedyAgent } from '../../src/agents/greedy-agent.js';
import { completeTemplateMove } from '../../src/kernel/move-completion.js';

// ---------------------------------------------------------------------------
// Synthetic fixture: 2 players, reserve with 3 tokens, deploy operation + simple action
// ---------------------------------------------------------------------------

const PHASE_MAIN = asPhaseId('main');
const ACTION_DEPLOY = asActionId('deploy');
const ACTION_SIMPLE = asActionId('simpleScore');
const ZONE_RESERVE = asZoneId('reserve:none');
const ZONE_FIELD = asZoneId('fieldA:none');

const DEPLOY_PROFILE: ActionPipelineDef = {
  id: 'deployProfile',
  actionId: ACTION_DEPLOY,
  legality: null,
  costValidation: { op: '>=', left: { ref: 'gvar', var: 'resources' }, right: 3 },
          costEffects: [],
  targeting: {},
  stages: [
    {
      stage: 'select',
      effects: [
        // Decision 1: choose a mode (chooseOne from enums)
        {
          chooseOne: {
            internalDecisionId: 'decision:$mode',
            bind: '$mode',
            options: { query: 'enums', values: ['normal', 'bonus'] },
          },
        },
        // Decision 2: choose 1-3 tokens from reserve (chooseN range mode)
        {
          chooseN: {
            internalDecisionId: 'decision:$selectedTokens',
            bind: '$selectedTokens',
            options: { query: 'tokensInZone', zone: 'reserve:none' },
            min: 1,
            max: 3,
          },
        },
      ],
    },
    {
      stage: 'resolve',
      effects: [
        // Move each selected token + pay per-space cost (unless free)
        {
          forEach: {
            bind: '$token',
            over: { query: 'binding', name: '$selectedTokens' },
            effects: [
              { moveToken: { token: '$token', from: 'reserve:none', to: 'fieldA:none' } },
              {
                if: {
                  when: { op: '!=', left: { ref: 'binding', name: '__freeOperation' }, right: true },
                  then: [{ addVar: { scope: 'global', var: 'resources', delta: -3 } }],
                },
              },
              { addVar: { scope: 'global', var: 'score', delta: 1 } },
            ],
          },
        },
        // Bonus point if mode == 'bonus'
        {
          if: {
            when: { op: '==', left: { ref: 'binding', name: '$mode' }, right: 'bonus' },
            then: [{ addVar: { scope: 'global', var: 'score', delta: 1 } }],
          },
        },
      ],
    },
  ],
  atomicity: 'atomic',
} as unknown as ActionPipelineDef;

const createDecisionSequenceDef = (): GameDef =>
  ({
    metadata: { id: 'decision-sequence-int', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [
      { name: 'score', type: 'int', init: 0, min: 0, max: 100 },
      { name: 'resources', type: 'int', init: 10, min: 0, max: 100 },
    ],
    perPlayerVars: [],
    zones: [
      { id: ZONE_RESERVE, owner: 'none', visibility: 'public', ordering: 'set' },
      { id: ZONE_FIELD, owner: 'none', visibility: 'public', ordering: 'set' },
    ],
    tokenTypes: [{ id: 'piece', props: {} }],
    setup: [
      { createToken: { type: 'piece', zone: 'reserve:none' } },
      { createToken: { type: 'piece', zone: 'reserve:none' } },
      { createToken: { type: 'piece', zone: 'reserve:none' } },
    ],
    turnStructure: { phases: [{ id: PHASE_MAIN }] },
    actionPipelines: [DEPLOY_PROFILE],
    actions: [
      {
        id: ACTION_DEPLOY,
actor: 'active',
executor: 'actor',
phase: [PHASE_MAIN],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
      {
        id: ACTION_SIMPLE,
actor: 'active',
executor: 'actor',
phase: [PHASE_MAIN],
        params: [],
        pre: null,
        cost: [],
        effects: [{ addVar: { scope: 'global', var: 'score', delta: 1 } }],
        limits: [],
      },
    ],
    triggers: [],
    terminal: { conditions: [] },
  }) as unknown as GameDef;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const findTemplateMove = (moves: readonly Move[], actionId: Move['actionId']): Move | undefined =>
  moves.find((m) => m.actionId === actionId && Object.keys(m.params).length === 0);

const findSimpleMove = (moves: readonly Move[], actionId: Move['actionId']): Move | undefined =>
  moves.find((m) => m.actionId === actionId);

const runRandomAgentTurn = (
  def: GameDef,
  state: GameState,
  seed: number,
): { readonly state: GameState; readonly move: Move } => {
  const agent = new RandomAgent();
  const moves = legalMoves(def, state);
  const rng = createRng(BigInt(seed));
  const { move } = agent.chooseMove({ def, state, playerId: state.activePlayer, legalMoves: moves, rng });
  const result = applyMove(def, state, move);
  return { state: result.state, move };
};

const runGreedyAgentTurn = (
  def: GameDef,
  state: GameState,
  seed: number,
): { readonly state: GameState; readonly move: Move } => {
  const agent = new GreedyAgent({ completionsPerTemplate: 3 });
  const moves = legalMoves(def, state);
  const rng = createRng(BigInt(seed));
  const { move } = agent.chooseMove({ def, state, playerId: state.activePlayer, legalMoves: moves, rng });
  const result = applyMove(def, state, move);
  return { state: result.state, move };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('decision sequence integration', () => {
  it('keeps satisfiable templates while evaluated legality marks unsatisfiable first-branch options illegal', () => {
    const actionId = asActionId('branchingDeploy');
    const def = {
      metadata: { id: 'decision-sequence-branching-int', players: { min: 2, max: 2 } },
      constants: {},
      globalVars: [],
      perPlayerVars: [],
      zones: [{ id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set' }],
      tokenTypes: [],
      setup: [],
      turnStructure: { phases: [{ id: asPhaseId('main') }] },
      actionPipelines: [
        {
          id: 'branchingDeployProfile',
          actionId,
          legality: null,
          costValidation: null,
          costEffects: [],
          targeting: {},
          stages: [
            {
              effects: [
                {
                  chooseOne: {
                    internalDecisionId: 'decision:$mode',
                    bind: '$mode',
                    options: { query: 'enums', values: ['trap', 'safe'] },
                  },
                },
                {
                  if: {
                    when: { op: '==', left: { ref: 'binding', name: '$mode' }, right: 'trap' },
                    then: [
                      {
                        chooseOne: {
                          internalDecisionId: 'decision:$trapChoice',
                          bind: '$trapChoice',
                          options: { query: 'enums', values: [] },
                        },
                      },
                    ],
                    else: [
                      {
                        chooseOne: {
                          internalDecisionId: 'decision:$safeChoice',
                          bind: '$safeChoice',
                          options: { query: 'enums', values: ['ok'] },
                        },
                      },
                    ],
                  },
                },
              ],
            },
          ],
          atomicity: 'partial',
        },
      ],
      actions: [
        {
          id: actionId,
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
      triggers: [],
      terminal: { conditions: [] },
    } as unknown as GameDef;

    const state = initialState(def, 123, 2).state;
    const template = findTemplateMove(legalMoves(def, state), actionId);
    assert.ok(template !== undefined, 'template remains legal when at least one downstream branch is satisfiable');

    const evaluated = legalChoicesEvaluate(def, state, { actionId, params: {} });
    assert.equal(evaluated.kind, 'pending');
    if (evaluated.kind !== 'pending') {
      throw new Error('Expected pending evaluated choices.');
    }
    assert.deepEqual(evaluated.options, [
      { value: 'trap', legality: 'illegal', illegalReason: null },
      { value: 'safe', legality: 'legal', illegalReason: null },
    ]);
  });

  it('legalMoves returns template move for profiled action and full move for simple action', () => {
    const def = createDecisionSequenceDef();
    const state = initialState(def, 42, 2).state;
    const moves = legalMoves(def, state);

    const template = findTemplateMove(moves, ACTION_DEPLOY);
    assert.ok(template !== undefined, 'deploy template move should exist');
    assert.deepEqual(template.params, {}, 'template move should have empty params');

    const simple = findSimpleMove(moves, ACTION_SIMPLE);
    assert.ok(simple !== undefined, 'simpleScore move should exist');
  });

  it('RandomAgent plays a multi-choice operation from template to completion, state is correct', () => {
    const def = createDecisionSequenceDef();
    const state = initialState(def, 42, 2).state;

    const reserveBefore = state.zones[String(ZONE_RESERVE)]!;
    assert.equal(reserveBefore.length, 3, 'reserve should have 3 tokens initially');

    const { state: after, move } = runRandomAgentTurn(def, state, 100);

    // If the agent chose the deploy action, verify state changes
    if (move.actionId === ACTION_DEPLOY) {
      assert.ok('decision:$mode' in move.params, 'completed move should have decision:$mode param');
      assert.ok('decision:$selectedTokens' in move.params, 'completed move should have decision:$selectedTokens param');

      const selectedTokens = move.params['decision:$selectedTokens'] as readonly string[];
      assert.ok(Array.isArray(selectedTokens), '$selectedTokens should be an array');
      assert.ok(selectedTokens.length >= 1 && selectedTokens.length <= 3, 'should select 1-3 tokens');

      const reserveAfter = after.zones[String(ZONE_RESERVE)]!;
      const fieldAfter = after.zones[String(ZONE_FIELD)]!;
      assert.equal(reserveAfter.length, 3 - selectedTokens.length, 'reserve should lose selected tokens');
      assert.equal(fieldAfter.length, selectedTokens.length, 'field should gain selected tokens');

      // Score = 1 per token + 1 if bonus mode
      const expectedScore = selectedTokens.length + (move.params['decision:$mode'] === 'bonus' ? 1 : 0);
      assert.equal(after.globalVars.score, expectedScore, 'score should reflect token count + bonus');

      // Resources deducted: 3 per token (not free)
      const expectedResources = 10 - selectedTokens.length * 3;
      assert.equal(after.globalVars.resources, expectedResources, 'resources should be deducted per token');
    } else {
      // If simpleScore was chosen, verify that path works too
      assert.equal(after.globalVars.score, 1, 'simpleScore should add 1 to score');
    }
  });

  it('GreedyAgent plays a multi-choice operation from template to completion, state is correct', () => {
    const def = createDecisionSequenceDef();
    const state = initialState(def, 42, 2).state;

    const { state: after, move } = runGreedyAgentTurn(def, state, 200);

    if (move.actionId === ACTION_DEPLOY) {
      assert.ok('decision:$mode' in move.params, 'completed move should have decision:$mode param');
      assert.ok('decision:$selectedTokens' in move.params, 'completed move should have decision:$selectedTokens param');

      const selectedTokens = move.params['decision:$selectedTokens'] as readonly string[];
      const reserveAfter = after.zones[String(ZONE_RESERVE)]!;
      const fieldAfter = after.zones[String(ZONE_FIELD)]!;

      assert.equal(reserveAfter.length + fieldAfter.length, 3, 'total tokens should be conserved');
      assert.equal(fieldAfter.length, selectedTokens.length, 'field should have selected tokens');

      const expectedScore = selectedTokens.length + (move.params['decision:$mode'] === 'bonus' ? 1 : 0);
      assert.equal(after.globalVars.score, expectedScore, 'score should be correct');
    } else {
      assert.equal(after.globalVars.score, 1, 'simpleScore should add 1');
    }
  });

  it('same seed produces identical final state hash for template-based moves (determinism)', () => {
    const def = createDecisionSequenceDef();
    const seed = 42;
    const agentSeed = 999;

    const run = (): { readonly hash: bigint; readonly move: Move } => {
      const state = initialState(def, seed, 2).state;
      const { state: after, move } = runRandomAgentTurn(def, state, agentSeed);
      return { hash: after.stateHash, move };
    };

    const first = run();
    const second = run();

    assert.equal(first.hash, second.hash, 'state hashes should be identical for same seed');
    assert.deepEqual(first.move.params, second.move.params, 'move params should be identical');
    assert.equal(first.move.actionId, second.move.actionId, 'action IDs should be identical');
  });

  it('free operation via template move skips per-space cost (resources unchanged)', () => {
    const def = createDecisionSequenceDef();
    const state = initialState(def, 42, 2).state;

    // Complete a template move manually, then apply with freeOperation: true
    const moves = legalMoves(def, state);
    const template = findTemplateMove(moves, ACTION_DEPLOY);
    assert.ok(template !== undefined, 'deploy template should exist');

    const rng = createRng(BigInt(500));
    const completed = completeTemplateMove(def, state, template, rng);
    assert.ok(completed !== null, 'template should be completeable');

    const freeMove: Move = { ...completed.move, freeOperation: true };
    const result = applyMove(def, state, freeMove);

    const selectedTokens = freeMove.params['decision:$selectedTokens'] as readonly string[];

    // Resources should be UNCHANGED (per-space cost skipped via __freeOperation)
    assert.equal(result.state.globalVars.resources, 10, 'resources should not be deducted for free operation');

    // Score should still reflect token count + bonus
    const expectedScore = selectedTokens.length + (freeMove.params['decision:$mode'] === 'bonus' ? 1 : 0);
    assert.equal(result.state.globalVars.score, expectedScore, 'score should still be awarded');

    // Tokens should still move
    const reserveAfter = result.state.zones[String(ZONE_RESERVE)]!;
    assert.equal(reserveAfter.length, 3 - selectedTokens.length, 'tokens should still move for free operation');
  });

  it('non-free operation via template move deducts per-space cost correctly', () => {
    const def = createDecisionSequenceDef();
    const state = initialState(def, 42, 2).state;

    const moves = legalMoves(def, state);
    const template = findTemplateMove(moves, ACTION_DEPLOY);
    assert.ok(template !== undefined);

    const rng = createRng(BigInt(500));
    const completed = completeTemplateMove(def, state, template, rng);
    assert.ok(completed !== null);

    // Apply without freeOperation (defaults to false)
    const result = applyMove(def, state, completed.move);

    const selectedTokens = completed.move.params['decision:$selectedTokens'] as readonly string[];
    const expectedResources = 10 - selectedTokens.length * 3;
    assert.equal(result.state.globalVars.resources, expectedResources, 'resources should be deducted per token');
  });

  it('simple actions (no profile) still work end-to-end alongside template moves', () => {
    const def = createDecisionSequenceDef();
    const state = initialState(def, 42, 2).state;

    const moves = legalMoves(def, state);
    const simple = findSimpleMove(moves, ACTION_SIMPLE);
    assert.ok(simple !== undefined, 'simpleScore should be in legal moves');
    // Verify legalChoices reports complete immediately for simple action
    const choices = legalChoicesDiscover(def, state, simple);
    assert.equal(choices.complete, true, 'simple action should have no choices');

    // Apply the simple move
    const result = applyMove(def, state, simple);
    assert.equal(result.state.globalVars.score, 1, 'simpleScore should increment score by 1');
    assert.equal(result.state.globalVars.resources, 10, 'simpleScore should not touch resources');
  });

  it('__actionClass binding is available in decision sequence context (FITLOPEFULEFF-001)', () => {
    const def = createDecisionSequenceDef();
    const state = initialState(def, 42, 2).state;

    const moves = legalMoves(def, state);
    const template = findTemplateMove(moves, ACTION_DEPLOY);
    assert.ok(template !== undefined, 'deploy template should exist');

    // With actionClass set, legalChoicesDiscover should still work (binding doesn't affect choice enumeration)
    const withActionClass: Move = { ...template, actionClass: 'limitedOperation' };
    const choices = legalChoicesDiscover(def, state, withActionClass);
    assert.equal(choices.complete, false, 'should still have pending decisions');
    assert.equal(choices.decisionId, 'decision:$mode', 'first decision should be decision:$mode');
    assert.equal(choices.name, '$mode', 'first decision should be $mode');

    // Without actionClass (default 'operation'), same behavior
    const withoutActionClass: Move = { ...template };
    const choicesDefault = legalChoicesDiscover(def, state, withoutActionClass);
    assert.equal(choicesDefault.complete, false, 'should still have pending decisions');
    assert.equal(choicesDefault.decisionId, 'decision:$mode', 'first decision should be decision:$mode');
    assert.equal(choicesDefault.name, '$mode', 'first decision should be $mode');
  });

  it('legalChoices returns decision points incrementally for profiled action', () => {
    const def = createDecisionSequenceDef();
    const state = initialState(def, 42, 2).state;

    const moves = legalMoves(def, state);
    const template = findTemplateMove(moves, ACTION_DEPLOY);
    assert.ok(template !== undefined);

    // First call: should ask for $mode (chooseOne)
    const first = legalChoicesDiscover(def, state, template);
    assert.equal(first.complete, false);
    assert.equal(first.kind, 'pending');
    if (first.kind !== 'pending') {
      throw new Error('Expected pending first decision.');
    }
    assert.equal(first.decisionId, 'decision:$mode');
    assert.equal(first.name, '$mode');
    assert.equal(first.type, 'chooseOne');
    assert.deepEqual(first.options.map((option) => option.value), ['normal', 'bonus']);

    // Fill $mode, second call: should ask for $selectedTokens (chooseN)
    const withMode: Move = { ...template, params: { ...template.params, 'decision:$mode': 'normal' } };
    const second = legalChoicesDiscover(def, state, withMode);
    assert.equal(second.complete, false);
    assert.equal(second.kind, 'pending');
    if (second.kind !== 'pending') {
      throw new Error('Expected pending second decision.');
    }
    assert.equal(second.decisionId, 'decision:$selectedTokens');
    assert.equal(second.name, '$selectedTokens');
    assert.equal(second.type, 'chooseN');
    assert.equal(second.min, 1);
    assert.ok(second.max !== undefined && second.max <= 3);
    assert.equal(second.options.length, 3, 'should offer 3 tokens');

    // Fill $selectedTokens, third call: should be complete
    // chooseN expects an array of scalars as the param value
    const tokenIds = second.options
      .slice(0, 2)
      .map((option) => option.value) as unknown as readonly import('../../src/kernel/types.js').MoveParamScalar[];
    const withTokens: Move = { ...withMode, params: { ...withMode.params, 'decision:$selectedTokens': tokenIds } };
    const third = legalChoicesDiscover(def, state, withTokens);
    assert.equal(third.complete, true, 'all decisions filled → complete');
  });
});
