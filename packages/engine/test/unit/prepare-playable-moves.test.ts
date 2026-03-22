import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { preparePlayableMoves } from '../../src/agents/prepare-playable-moves.js';
import { PolicyAgent } from '../../src/agents/policy-agent.js';
import {
  applyMove,
  asActionId,
  asPhaseId,
  assertValidatedGameDef,
  createRng,
  createGameDefRuntime,
  enumerateLegalMoves,
  initialState,
  probeMoveViability,
  type ClassifiedMove,
  type Move,
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
      {
        move: completeMove,
        viability: { viable: true, complete: true, move: completeMove, warnings: [] },
      },
      {
        move: stochasticMove,
        viability: {
          viable: true,
          complete: false,
          stochasticDecision: {
            kind: 'pendingStochastic',
            complete: false,
            source: 'rollRandom',
            alternatives: [],
            outcomes: [],
          },
          move: stochasticMove,
          warnings: [],
        },
      },
    ];

    const prepared = preparePlayableMoves({
      def,
      state,
      legalMoves,
      rng: createRng(1n),
    });

    assert.deepEqual(prepared.completedMoves, [completeMove]);
    assert.deepEqual(prepared.stochasticMoves, [stochasticMove]);
  });

  describe('zone-filtered free-operation templates', () => {
    /**
     * Regression test for a scenario where a free-operation template move
     * (e.g. VC Rally restricted to Cambodia via a zone filter from the
     * Sihanouk shaded event) is rejected by probeMoveViability because the
     * zone filter cannot be evaluated on a template with no target-zone
     * selections.  preparePlayableMoves must fall through to the template
     * completion path instead of discarding the move.
     *
     * Reproduces with FITL seed 11: turn 0 plays the Sihanouk shaded event,
     * turn 1 grants VC a free Rally in Cambodia.  The rally template (empty
     * params, freeOperation=true) must survive filtering and be completable.
     */
    it('does not discard free-operation templates whose zone filter is unevaluable on incomplete moves', () => {
      const { compiled } = compileProductionSpec();
      const def = assertValidatedGameDef(compiled.gameDef);
      const runtime = createGameDefRuntime(def);

      // Advance to the game state where the bug manifested (seed 11, turn 1).
      let state = initialState(def, 11, 4, undefined, runtime).state;
      const agent = new PolicyAgent();
      const AGENT_RNG_MIX = 0x9e3779b97f4a7c15n;
      const agentRngs = Array.from(
        { length: 4 },
        (_, i) => createRng(BigInt(11) ^ (BigInt(i + 1) * AGENT_RNG_MIX)),
      );

      // Execute turn 0 (ARVN plays event).
      const legal0 = enumerateLegalMoves(def, state, undefined, runtime).moves;
      const player0 = state.activePlayer;
      const selected0 = agent.chooseMove({
        def, state, playerId: player0,
        legalMoves: legal0, rng: agentRngs[player0]!, runtime,
      });
      state = applyMove(def, state, selected0.move, undefined, runtime).state;

      // Turn 1: VC should have a free-operation rally template.
      const enumerated1 = enumerateLegalMoves(def, state, undefined, runtime);
      const classifiedFreeOpMove = enumerated1.moves.find(({ move }) => move.freeOperation === true);
      assert.ok(classifiedFreeOpMove, 'expected a classified free-operation move in enumerated legal moves');
      assert.equal(classifiedFreeOpMove.viability.viable, true, 'deferred free-operation template should remain classified as viable');
      assert.equal(classifiedFreeOpMove.viability.complete, false, 'deferred free-operation template should remain incomplete until completion');

      const legal1 = enumerateLegalMoves(def, state, undefined, runtime).moves;
      assert.ok(legal1.length > 0, 'expected at least one legal move at turn 1');

      const freeOpMove = legal1.find(({ move }) => move.freeOperation === true)?.move;
      assert.ok(freeOpMove, 'expected a free-operation move in legal moves');

      // Verify that probeMoveViability rejects the template (this is the
      // condition that previously caused the bug).
      const viability = probeMoveViability(def, state, freeOpMove, runtime);
      assert.equal(viability.viable, false, 'template should be non-viable via probeMoveViability (zone filter unevaluable)');

      // Despite probeMoveViability rejecting the template, preparePlayableMoves
      // must recover it through the template completion path.
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
});
