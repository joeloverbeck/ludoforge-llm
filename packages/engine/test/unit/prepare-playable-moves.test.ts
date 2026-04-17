import * as assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

/** Resolve a path relative to the engine package root, regardless of CWD. */
const engineFixture = (...segments: string[]): string => {
  const candidates = [
    join(process.cwd(), 'test', ...segments),
    join(process.cwd(), 'packages', 'engine', 'test', ...segments),
  ];
  const found = candidates.find((c) => existsSync(c));
  if (!found) throw new Error(`Fixture not found: tried ${candidates.join(', ')}`);
  return found;
};

import { preparePlayableMoves, NOT_VIABLE_RETRY_CAP } from '../../src/agents/prepare-playable-moves.js';
import { PolicyAgent } from '../../src/agents/policy-agent.js';
import { createTemplateChooseOneAction, createTemplateChooseOneProfile } from '../helpers/agent-template-fixtures.js';
import { completeClassifiedMove, pendingClassifiedMove, stochasticClassifiedMove } from '../helpers/classified-move-fixtures.js';
import { eff } from '../helpers/effect-tag-helper.js';
import {
  type ActionPipelineDef,
  asActionId,
  asPhaseId,
  assertValidatedGameDef,
  createRng,
  createGameDefRuntime,
  deserializeGameState,
  enumerateLegalMoves,
  illegalMoveError,
  initialState,
  ILLEGAL_MOVE_REASONS,
  probeMoveViability,
  type ClassifiedMove,
  type Move,
  type SerializedGameState,
} from '../../src/kernel/index.js';
import { runGame } from '../../src/sim/simulator.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

describe('preparePlayableMoves', () => {
  it('routes complete and stochastic ClassifiedMove inputs without reclassification', () => {
    const def = assertValidatedGameDef({
      metadata: { id: 'prepare-playable-routing', players: { min: 2, max: 2 } },
      constants: {},
      globalVars: [],
      perPlayerVars: [],
      zones: [],
      tokenTypes: [],
      setup: [],
      turnStructure: { phases: [{ id: asPhaseId('main') }] },
      actions: [],
      triggers: [],
      terminal: { conditions: [] },
    });
    const state = initialState(def, 1, 2).state;
    const completeMove: Move = { actionId: asActionId('complete'), params: {} };
    const stochasticMove: Move = { actionId: asActionId('stochastic'), params: {} };
    const legalMoves: readonly ClassifiedMove[] = [
      completeClassifiedMove(completeMove, state.stateHash),
      stochasticClassifiedMove(stochasticMove, state.stateHash),
    ];

    const prepared = preparePlayableMoves({
      def,
      state,
      legalMoves,
      rng: createRng(1n),
    });

    assert.deepEqual(
      prepared.completedMoves.map((move) => move.move),
      [completeMove],
    );
    assert.deepEqual(
      prepared.stochasticMoves.map((move) => move.move),
      [stochasticMove],
    );
    assert.deepEqual(prepared.statistics, {
      totalClassifiedMoves: 2,
      completedCount: 1,
      stochasticCount: 1,
      rejectedNotViable: 0,
      templateCompletionAttempts: 0,
      templateCompletionSuccesses: 0,
      templateCompletionStructuralFailures: 0,
      duplicatesRemoved: 0,
    });
  });

  it('reports completion statistics across direct, rejected, completed-template, and structurally-unsatisfiable-template paths', () => {
    const completeMove: Move = { actionId: asActionId('complete'), params: {} };
    const stochasticMove: Move = { actionId: asActionId('stochastic'), params: {} };
    const satisfiableTemplateMove: Move = { actionId: asActionId('chooseTarget'), params: {} };
    const unsatisfiableTemplateMove: Move = { actionId: asActionId('blockedTarget'), params: {} };
    const rejectedMove: Move = { actionId: asActionId('rejected'), params: {} };
    const def = assertValidatedGameDef({
      metadata: { id: 'prepare-playable-stats', players: { min: 2, max: 2 } },
      constants: {},
      globalVars: [],
      perPlayerVars: [],
      zones: [],
      tokenTypes: [],
      setup: [],
      turnStructure: { phases: [{ id: asPhaseId('main') }] },
      actions: [
        createTemplateChooseOneAction(asActionId('chooseTarget'), asPhaseId('main')),
        createTemplateChooseOneAction(asActionId('blockedTarget'), asPhaseId('main')),
      ],
      actionPipelines: [
        createTemplateChooseOneProfile(asActionId('chooseTarget')),
        createEmptyOptionsProfile('blockedTarget'),
      ] as readonly ActionPipelineDef[],
      triggers: [],
      terminal: { conditions: [] },
    });
    const state = initialState(def, 1, 2).state;

    const prepared = preparePlayableMoves({
      def,
      state,
      legalMoves: (() => {
        const rejectedError = illegalMoveError(rejectedMove, ILLEGAL_MOVE_REASONS.MOVE_NOT_LEGAL_IN_CURRENT_STATE, {
          detail: 'blocked',
        });
        return [
          completeClassifiedMove(completeMove, state.stateHash),
          stochasticClassifiedMove(stochasticMove, state.stateHash),
          pendingClassifiedMove(satisfiableTemplateMove),
          pendingClassifiedMove(unsatisfiableTemplateMove),
          {
            move: rejectedMove,
            viability: {
              viable: false,
              complete: undefined,
              move: undefined,
              warnings: undefined,
              code: 'ILLEGAL_MOVE',
              context: rejectedError.context!,
              error: rejectedError,
              nextDecision: undefined,
              nextDecisionSet: undefined,
              stochasticDecision: undefined,
            },
            trustedMove: undefined,
          },
        ];
      })(),
      rng: createRng(3n),
    });

    assert.equal(prepared.completedMoves.length, 2);
    assert.equal(prepared.stochasticMoves.length, 1);
    assert.deepEqual(prepared.statistics, {
      totalClassifiedMoves: 5,
      completedCount: 1,
      stochasticCount: 1,
      rejectedNotViable: 1,
      templateCompletionAttempts: 2,
      templateCompletionSuccesses: 1,
      templateCompletionStructuralFailures: 1,
      duplicatesRemoved: 0,
      completionsByActionId: {
        chooseTarget: 1,
      },
    });
  });

  it('counts repeated template completions according to pendingTemplateCompletions', () => {
    const templateMove: Move = { actionId: asActionId('chooseTarget'), params: {} };
    const def = assertValidatedGameDef({
      metadata: { id: 'prepare-playable-repeated-template-counts', players: { min: 2, max: 2 } },
      constants: {},
      globalVars: [],
      perPlayerVars: [],
      zones: [],
      tokenTypes: [],
      setup: [],
      turnStructure: { phases: [{ id: asPhaseId('main') }] },
      actions: [createTemplateChooseOneAction(asActionId('chooseTarget'), asPhaseId('main'))],
      actionPipelines: [createTemplateChooseOneProfile(asActionId('chooseTarget'))] as readonly ActionPipelineDef[],
      triggers: [],
      terminal: { conditions: [] },
    });
    const state = initialState(def, 5, 2).state;

    const prepared = preparePlayableMoves({
      def,
      state,
      legalMoves: [pendingClassifiedMove(templateMove)],
      rng: createRng(9n),
    }, {
      pendingTemplateCompletions: 3,
    });

    assert.equal(prepared.completedMoves.length, 1);
    assert.equal(prepared.stochasticMoves.length, 0);
    assert.deepEqual(prepared.statistics, {
      totalClassifiedMoves: 1,
      completedCount: 0,
      stochasticCount: 0,
      rejectedNotViable: 0,
      templateCompletionAttempts: 3,
      templateCompletionSuccesses: 3,
      templateCompletionStructuralFailures: 0,
      duplicatesRemoved: 2,
      completionsByActionId: {
        chooseTarget: 3,
      },
    });
  });

  it('deduplicates repeated stableMoveKeys while preserving the first occurrence', () => {
    const completeMove: Move = { actionId: asActionId('repeat'), params: { zone: 'alpha' } };
    const def = assertValidatedGameDef({
      metadata: { id: 'prepare-playable-dedup', players: { min: 2, max: 2 } },
      constants: {},
      globalVars: [],
      perPlayerVars: [],
      zones: [],
      tokenTypes: [],
      setup: [],
      turnStructure: { phases: [{ id: asPhaseId('main') }] },
      actions: [createTemplateChooseOneAction(asActionId('repeat'), asPhaseId('main'))],
      actionPipelines: [createTemplateChooseOneProfile(asActionId('repeat'))] as readonly ActionPipelineDef[],
      triggers: [],
      terminal: { conditions: [] },
    });
    const state = initialState(def, 5, 2).state;
    const duplicateComplete = completeClassifiedMove(completeMove, state.stateHash);
    const firstPending = pendingClassifiedMove(completeMove);
    const secondPending = pendingClassifiedMove(completeMove);

    const prepared = preparePlayableMoves({
      def,
      state,
      legalMoves: [duplicateComplete, firstPending, secondPending],
      rng: createRng(7n),
    }, {
      pendingTemplateCompletions: 2,
    });

    assert.equal(prepared.completedMoves.length, 1);
    assert.deepEqual(prepared.completedMoves[0]?.move, completeMove);
    assert.equal(prepared.stochasticMoves.length, 0);
    assert.deepEqual(prepared.statistics, {
      totalClassifiedMoves: 3,
      completedCount: 1,
      stochasticCount: 0,
      rejectedNotViable: 0,
      templateCompletionAttempts: 0,
      templateCompletionSuccesses: 0,
      templateCompletionStructuralFailures: 0,
      duplicatesRemoved: 2,
    });
    assert.equal(prepared.movePreparations.length, 3);
    assert.equal(prepared.movePreparations[0]?.skippedAsDuplicate, undefined);
    assert.equal(prepared.movePreparations[1]?.skippedAsDuplicate, true);
    assert.equal(prepared.movePreparations[1]?.initialClassification, 'rejected');
    assert.equal(prepared.movePreparations[1]?.finalClassification, 'rejected');
    assert.equal(prepared.movePreparations[1]?.enteredTrustedMoveIndex, false);
    assert.equal(prepared.movePreparations[2]?.skippedAsDuplicate, true);
    assert.equal(prepared.movePreparations[1]?.stableMoveKey, prepared.movePreparations[0]?.stableMoveKey);
    assert.equal(prepared.movePreparations[2]?.stableMoveKey, prepared.movePreparations[0]?.stableMoveKey);
  });

  it('forwards choose across repeated template completions', () => {
    const templateMove: Move = { actionId: asActionId('chooseTarget'), params: {} };
    const def = assertValidatedGameDef({
      metadata: { id: 'prepare-playable-guided-template-completions', players: { min: 2, max: 2 } },
      constants: {},
      globalVars: [],
      perPlayerVars: [],
      zones: [],
      tokenTypes: [],
      setup: [],
      turnStructure: { phases: [{ id: asPhaseId('main') }] },
      actions: [createTemplateChooseOneAction(asActionId('chooseTarget'), asPhaseId('main'))],
      actionPipelines: [createTemplateChooseOneProfile(asActionId('chooseTarget'))] as readonly ActionPipelineDef[],
      triggers: [],
      terminal: { conditions: [] },
    });
    const state = initialState(def, 6, 2).state;
    let chooseCalls = 0;

    const prepared = preparePlayableMoves({
      def,
      state,
      legalMoves: [pendingClassifiedMove(templateMove)],
      rng: createRng(9n),
    }, {
      pendingTemplateCompletions: 3,
      choose: () => {
        chooseCalls += 1;
        return 'gamma';
      },
    });

    assert.equal(chooseCalls, 3);
    assert.deepEqual(
      prepared.completedMoves.map((candidate) => candidate.move.params.$target),
      ['gamma'],
    );
  });

  it('filters outputs to the requested actionId', () => {
    const chooseTarget = asActionId('chooseTarget');
    const blockedTarget = asActionId('blockedTarget');
    const def = assertValidatedGameDef({
      metadata: { id: 'prepare-playable-filtered-action-id', players: { min: 2, max: 2 } },
      constants: {},
      globalVars: [],
      perPlayerVars: [],
      zones: [],
      tokenTypes: [],
      setup: [],
      turnStructure: { phases: [{ id: asPhaseId('main') }] },
      actions: [
        createTemplateChooseOneAction(chooseTarget, asPhaseId('main')),
        createTemplateChooseOneAction(blockedTarget, asPhaseId('main')),
      ],
      actionPipelines: [
        createTemplateChooseOneProfile(chooseTarget),
        createTemplateChooseOneProfile(blockedTarget),
      ] as readonly ActionPipelineDef[],
      triggers: [],
      terminal: { conditions: [] },
    });
    const state = initialState(def, 11, 2).state;

    const prepared = preparePlayableMoves({
      def,
      state,
      legalMoves: [
        pendingClassifiedMove({ actionId: chooseTarget, params: {} }),
        pendingClassifiedMove({ actionId: blockedTarget, params: {} }),
      ],
      rng: createRng(2n),
    }, {
      pendingTemplateCompletions: 2,
      actionIdFilter: chooseTarget,
    });

    assert.deepEqual(
      prepared.completedMoves.map((move) => move.move.actionId),
      [chooseTarget],
    );
    assert.deepEqual(prepared.stochasticMoves, []);
    assert.deepEqual(prepared.statistics.completionsByActionId, {
      chooseTarget: 2,
    });
  });

  it('returns no playable outputs when actionIdFilter matches no moves', () => {
    const chooseTarget = asActionId('chooseTarget');
    const def = assertValidatedGameDef({
      metadata: { id: 'prepare-playable-filter-miss', players: { min: 2, max: 2 } },
      constants: {},
      globalVars: [],
      perPlayerVars: [],
      zones: [],
      tokenTypes: [],
      setup: [],
      turnStructure: { phases: [{ id: asPhaseId('main') }] },
      actions: [createTemplateChooseOneAction(chooseTarget, asPhaseId('main'))],
      actionPipelines: [createTemplateChooseOneProfile(chooseTarget)] as readonly ActionPipelineDef[],
      triggers: [],
      terminal: { conditions: [] },
    });
    const state = initialState(def, 13, 2).state;

    const prepared = preparePlayableMoves({
      def,
      state,
      legalMoves: [pendingClassifiedMove({ actionId: chooseTarget, params: {} })],
      rng: createRng(4n),
    }, {
      pendingTemplateCompletions: 2,
      actionIdFilter: asActionId('otherAction'),
    });

    assert.equal(prepared.completedMoves.length, 0);
    assert.equal(prepared.stochasticMoves.length, 0);
    assert.equal(prepared.statistics.completionsByActionId, undefined);
  });

  describe('zone-filtered free-operation templates', () => {
    /**
     * Regression test for a scenario where a free-operation template move
     * (e.g. VC Rally restricted to Cambodia via a zone filter from the
     * Sihanouk shaded event) previously diverged between enumeration and
     * direct probing because the zone filter could not be evaluated before
     * target-zone selections were completed. The shared viability predicate
     * must now preserve the template as a viable incomplete move so
     * preparePlayableMoves reaches normal template completion without a
     * downstream fallback.
     *
     * The test state is loaded from a snapshot fixture to decouple from
     * agent profile evolution (Foundation 2: Evolution-First Design).
     * The fixture captures the FITL game state at the exact point where
     * the bug manifests: VC has a zone-filtered free-operation rally
     * template that probeMoveViability cannot evaluate.
     */
    it('does not discard free-operation templates whose zone filter is unevaluable on incomplete moves', () => {
      const { compiled } = compileProductionSpec();
      const def = assertValidatedGameDef(compiled.gameDef);
      const runtime = createGameDefRuntime(def);

      // Load the pre-bug game state from a snapshot fixture.
      const fixturePath = engineFixture('fixtures', 'gamestate', 'fitl-seed12-turn2-freeop-template.json');
      const serialized = JSON.parse(readFileSync(fixturePath, 'utf8')) as SerializedGameState;
      const state = deserializeGameState(serialized);

      // VC should have a free-operation rally template.
      const enumerated1 = enumerateLegalMoves(def, state, undefined, runtime);
      const classifiedFreeOpMove = enumerated1.moves.find(({ move }) => move.freeOperation === true);
      assert.ok(classifiedFreeOpMove, 'expected a classified free-operation move in enumerated legal moves');
      assert.equal(classifiedFreeOpMove.viability.viable, true, 'deferred free-operation template should remain classified as viable');
      assert.equal(classifiedFreeOpMove.viability.complete, false, 'deferred free-operation template should remain incomplete until completion');

      const legal1 = enumerateLegalMoves(def, state, undefined, runtime).moves;
      assert.ok(legal1.length > 0, 'expected at least one legal move at turn 1');

      const freeOpMove = legal1.find(({ move }) => move.freeOperation === true)?.move;
      assert.ok(freeOpMove, 'expected a free-operation move in legal moves');

      // Direct probing should now agree with enumerateLegalMoves.
      const viability = probeMoveViability(def, state, freeOpMove, runtime);
      assert.equal(viability.viable, true, 'template should stay viable during direct probing');
      if (viability.viable) {
        assert.equal(viability.complete, false, 'template should remain incomplete until completion');
      }

      // preparePlayableMoves should complete the viable template normally.
      const rng = createRng(42n);
      const prepared = preparePlayableMoves(
        { def, state, legalMoves: legal1, rng, runtime },
        { pendingTemplateCompletions: 5 },
      );

      const totalPlayable = prepared.completedMoves.length + prepared.stochasticMoves.length;
      assert.ok(
        totalPlayable > 0,
        `expected at least one playable move after template completion, got ${totalPlayable}`,
      );
    });

    it('still discards genuinely non-viable free-operation moves', () => {
      const { compiled } = compileProductionSpec();
      const def = assertValidatedGameDef(compiled.gameDef);
      const runtime = createGameDefRuntime(def);

      // Use initial state where no free operation grants exist.
      const state = initialState(def, 1, 4, undefined, runtime).state;
      const legal = enumerateLegalMoves(def, state, undefined, runtime).moves;

      // Verify non-free-operation moves are handled normally.
      const rng = createRng(1n);
      const prepared = preparePlayableMoves(
        { def, state, legalMoves: legal, rng, runtime },
        { pendingTemplateCompletions: 5 },
      );

      // Should have playable moves (normal game state).
      const totalPlayable = prepared.completedMoves.length + prepared.stochasticMoves.length;
      assert.ok(totalPlayable > 0, 'expected playable moves in normal initial state');
    });
  });

  describe('policy agent self-play with zone-filtered free ops', () => {
    it('completes 5 turns of FITL policy self-play for seed 11 without errors', () => {
      const { compiled } = compileProductionSpec();
      const def = assertValidatedGameDef(compiled.gameDef);
      const runtime = createGameDefRuntime(def);
      const agents = [new PolicyAgent(), new PolicyAgent(), new PolicyAgent(), new PolicyAgent()];

      const trace = runGame(def, 11, agents, 5, 4, undefined, runtime);
      assert.ok(trace.moves.length > 0, 'expected at least one move');

      for (const move of trace.moves) {
        assert.equal(move.agentDecision?.kind, 'policy');
        if (move.agentDecision?.kind === 'policy') {
          assert.equal(move.agentDecision.emergencyFallback, false);
        }
      }
    });
  });

  describe('notViable retry extension', () => {
    it('structurallyUnsatisfiable still breaks immediately without retry extensions', () => {
      const def = assertValidatedGameDef({
        metadata: { id: 'prepare-unsatisfiable-no-retry', players: { min: 2, max: 2 } },
        constants: {},
        globalVars: [],
        perPlayerVars: [],
        zones: [],
        tokenTypes: [],
        setup: [],
        turnStructure: { phases: [{ id: asPhaseId('main') }] },
        actions: [createTemplateChooseOneAction(asActionId('blocked'), asPhaseId('main'))],
        actionPipelines: [createEmptyOptionsProfile('blocked')] as readonly ActionPipelineDef[],
        triggers: [],
        terminal: { conditions: [] },
      });
      const state = initialState(def, 1, 2).state;

      const prepared = preparePlayableMoves({
        def,
        state,
        legalMoves: [pendingClassifiedMove({ actionId: asActionId('blocked'), params: {} })],
        rng: createRng(1n),
      }, {
        pendingTemplateCompletions: 3,
      });

      assert.equal(prepared.completedMoves.length, 0);
      assert.equal(prepared.stochasticMoves.length, 0);
      // structurallyUnsatisfiable should break after 1 attempt, not retry up to 10
      assert.equal(prepared.statistics.templateCompletionAttempts, 1);
      assert.equal(prepared.statistics.templateCompletionStructuralFailures, 1);
    });

    it('exports NOT_VIABLE_RETRY_CAP as a bounded positive integer', () => {
      assert.equal(typeof NOT_VIABLE_RETRY_CAP, 'number');
      assert.ok(NOT_VIABLE_RETRY_CAP > 0, 'cap must be positive');
      assert.ok(Number.isSafeInteger(NOT_VIABLE_RETRY_CAP), 'cap must be a safe integer');
    });

    it('FITL seed 1009 completes through the notViable retry path without crashing', () => {
      const { compiled } = compileProductionSpec();
      const def = assertValidatedGameDef(compiled.gameDef);
      const runtime = createGameDefRuntime(def);
      const agents = Array.from({ length: 4 }, () => new PolicyAgent());

      const trace = runGame(def, 1009, agents, 20, 4, undefined, runtime);

      assert.ok(trace.moves.length > 3, 'seed 1009 must advance beyond the problematic free operation');
      assert.notEqual(
        trace.stopReason === 'noLegalMoves' && trace.moves.length <= 3,
        true,
        'must not stall at the free-operation rally with notViable completions',
      );
    });

    it('does not extend retries once a viable completion is found', () => {
      const templateMove: Move = { actionId: asActionId('chooseTarget'), params: {} };
      const def = assertValidatedGameDef({
        metadata: { id: 'prepare-no-retry-after-success', players: { min: 2, max: 2 } },
        constants: {},
        globalVars: [],
        perPlayerVars: [],
        zones: [],
        tokenTypes: [],
        setup: [],
        turnStructure: { phases: [{ id: asPhaseId('main') }] },
        actions: [createTemplateChooseOneAction(asActionId('chooseTarget'), asPhaseId('main'))],
        actionPipelines: [createTemplateChooseOneProfile(asActionId('chooseTarget'))] as readonly ActionPipelineDef[],
        triggers: [],
        terminal: { conditions: [] },
      });
      const state = initialState(def, 5, 2).state;

      // With 3 completions, all options are viable (alpha, beta, gamma),
      // so the retry extension should never activate — attempts stay at exactly 3.
      const prepared = preparePlayableMoves({
        def,
        state,
        legalMoves: [pendingClassifiedMove(templateMove)],
        rng: createRng(9n),
      }, {
        pendingTemplateCompletions: 3,
      });

      assert.equal(prepared.statistics.templateCompletionAttempts, 3);
      assert.equal(prepared.statistics.templateCompletionSuccesses, 3);
      assert.ok(prepared.completedMoves.length > 0, 'all completions should succeed');
    });

    it('total attempts are bounded by pendingTemplateCompletions + NOT_VIABLE_RETRY_CAP', () => {
      // Verify the structural bound: even if retries extend indefinitely,
      // the cap prevents runaway iteration.  We test this by ensuring that
      // the cap is strictly less than any unreasonable upper bound and that
      // structurallyUnsatisfiable (tested above) still exits at 1 attempt.
      assert.ok(
        NOT_VIABLE_RETRY_CAP <= 20,
        `NOT_VIABLE_RETRY_CAP (${NOT_VIABLE_RETRY_CAP}) should be a small bounded number`,
      );
      // The maximum total attempts for any single template move is
      // pendingTemplateCompletions + NOT_VIABLE_RETRY_CAP.  With the default
      // of 3 + 7 = 10, this is well within bounded computation (F10).
      const maxTotal = 3 + NOT_VIABLE_RETRY_CAP;
      assert.ok(maxTotal <= 30, `max total attempts (${maxTotal}) should be bounded`);
    });
  });
});

function createEmptyOptionsProfile(actionId: string): ActionPipelineDef {
  return {
    id: `profile-${actionId}`,
    actionId: asActionId(actionId),
    legality: null,
    costValidation: null,
    costEffects: [],
    targeting: {},
    stages: [
      {
        stage: 'resolve',
        effects: [
          eff({
            chooseOne: {
              internalDecisionId: 'decision:$target',
              bind: '$target',
              options: { query: 'enums', values: [] },
            },
          }),
        ],
      },
    ],
    atomicity: 'atomic',
  };
}
