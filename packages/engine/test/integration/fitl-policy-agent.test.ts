import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../src/agents/policy-agent.js';
import { preparePlayableMoves } from '../../src/agents/prepare-playable-moves.js';
import { applyTrustedMove } from '../../src/kernel/apply-move.js';
import {
  applyMove,
  assertValidatedGameDef,
  classifyPlayableMoveCandidate,
  createRng,
  createGameDefRuntime,
  enumerateLegalMoves,
  evaluatePlayableMoveCandidate,
  initialState,
  legalMoves,
  probeMoveViability,
} from '../../src/kernel/index.js';
import { derivePlayerObservation } from '../../src/kernel/observation.js';
import { runGame } from '../../src/sim/simulator.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

function rngStatesEqual(left: { readonly algorithm: string; readonly version: number; readonly state: readonly bigint[] }, right: { readonly algorithm: string; readonly version: number; readonly state: readonly bigint[] }): boolean {
  return left.algorithm === right.algorithm
    && left.version === right.version
    && left.state.length === right.state.length
    && left.state.every((entry, index) => entry === right.state[index]);
}

describe('FITL policy agent integration', () => {
  it('compiles the production FITL spec with authored policy bindings for all four seats', () => {
    const { compiled } = compileProductionSpec();
    const agents = compiled.gameDef?.agents;

    assert.ok(agents);
    assert.deepEqual(agents.bindingsBySeat, {
      us: 'us-baseline',
      arvn: 'arvn-baseline',
      nva: 'nva-baseline',
      vc: 'vc-evolved',
    });
  });

  it('concretizes incomplete FITL legal-move templates before policy evaluation', () => {
    const { compiled } = compileProductionSpec();
    const def = assertValidatedGameDef(compiled.gameDef);
    const runtime = createGameDefRuntime(def);
    const state = initialState(def, 7, 4).state;
    const rawLegalMoves = legalMoves(def, state, undefined, runtime);
    const rawEventMove = rawLegalMoves.find((move) => String(move.actionId) === 'event');

    assert.ok(rawEventMove, 'expected an event template move in the initial FITL legal move set');
    if (rawEventMove === undefined) {
      return;
    }
    const rawEventViability = probeMoveViability(def, state, rawEventMove, runtime);
    assert.equal(rawEventViability.viable, true);
    if (!rawEventViability.viable) {
      assert.fail('expected the raw event template to remain viable');
    }
    assert.equal(rawEventViability.complete, false);

    const rawEventCandidate = evaluatePlayableMoveCandidate(def, state, rawEventMove, createRng(7n), runtime);
    assert.equal(
      rawEventCandidate.kind === 'playableComplete' || rawEventCandidate.kind === 'playableStochastic',
      true,
      'expected shared evaluator to produce a playable candidate classification for the raw event template',
    );

    const agent = new PolicyAgent();
    const selected = agent.chooseMove({
      def,
      state,
      playerId: state.activePlayer,
      legalMoves: enumerateLegalMoves(def, state, undefined, runtime).moves,
      rng: createRng(7n),
      runtime,
    });
    const selectedViability = probeMoveViability(def, state, selected.move, runtime);

    assert.equal(selectedViability.viable, true);
    if (!selectedViability.viable) {
      assert.fail('expected the selected move to be viable');
    }
    assert.equal(selectedViability.complete, true);
    const selectedCandidate = classifyPlayableMoveCandidate(def, state, selected.move, runtime);
    assert.equal(selectedCandidate.kind, 'playableComplete');
    assert.doesNotThrow(() => applyMove(def, state, selected.move, undefined, runtime));
    assert.equal(selected.agentDecision?.kind, 'policy');
    if (selected.agentDecision?.kind !== 'policy') {
      assert.fail('expected policy trace metadata');
    }
    assert.equal(selected.agentDecision.resolvedProfileId, 'us-baseline');
    assert.equal(selected.agentDecision.emergencyFallback, false);
  });

  it('keeps FITL preview margins unknown in the fixed-seed opening because post-move observation still requires hidden sampling', () => {
    const { compiled } = compileProductionSpec();
    const def = assertValidatedGameDef(compiled.gameDef);
    const runtime = createGameDefRuntime(def);
    const state = initialState(def, 7, 4).state;
    const legalMoves = enumerateLegalMoves(def, state, undefined, runtime).moves;
    const input = {
      def,
      state,
      playerId: state.activePlayer,
      legalMoves,
      rng: createRng(7n),
      runtime,
    } as const;
    const prepared = preparePlayableMoves(input, {
      pendingTemplateCompletions: 3,
    });
    const completedNonPassMove = prepared.completedMoves.find((candidate) => String(candidate.move.actionId) !== 'pass');

    assert.ok(completedNonPassMove, 'expected at least one completed non-pass FITL move');
    if (completedNonPassMove === undefined) {
      return;
    }

    const previewState = applyTrustedMove(def, state, completedNonPassMove, undefined, runtime).state;
    const observation = derivePlayerObservation(def, previewState, state.activePlayer);

    assert.equal(rngStatesEqual(previewState.rng, state.rng), true);
    assert.equal(observation.requiresHiddenSampling, true);

    const result = new PolicyAgent({ traceLevel: 'verbose' }).chooseMove(input);

    assert.equal(result.agentDecision?.kind, 'policy');
    if (result.agentDecision?.kind !== 'policy') {
      assert.fail('expected policy trace metadata');
    }
    assert.equal(result.agentDecision.emergencyFallback, false);
    assert.deepEqual(result.agentDecision.previewUsage.refIds, ['victoryCurrentMargin.currentMargin.self']);
    assert.deepEqual(result.agentDecision.previewUsage.unknownRefs, [
      { refId: 'victoryCurrentMargin.currentMargin.self', reason: 'hidden' },
    ]);
    assert.deepEqual(result.agentDecision.previewUsage.outcomeBreakdown, {
      ready: 0,
      unknownRandom: 0,
      unknownHidden: 18,
      unknownUnresolved: 0,
      unknownFailed: 0,
    });
    if (result.agentDecision.candidates === undefined) {
      assert.fail('expected verbose policy candidates');
    }

    const evaluatedNonPassCandidate = result.agentDecision.candidates.find((candidate) => candidate.actionId !== 'pass');

    assert.ok(evaluatedNonPassCandidate, 'expected at least one evaluated non-pass candidate');
    assert.equal(evaluatedNonPassCandidate?.previewOutcome, 'hidden');
    assert.deepEqual(
      evaluatedNonPassCandidate?.unknownPreviewRefs,
      [{ refId: 'victoryCurrentMargin.currentMargin.self', reason: 'hidden' }],
    );
  });

  it('runs fixed-seed FITL policy self-play without runtime failures or fallback', () => {
    const { compiled } = compileProductionSpec();
    const def = assertValidatedGameDef(compiled.gameDef);
    const agents = [new PolicyAgent(), new PolicyAgent(), new PolicyAgent(), new PolicyAgent()];

    const trace = runGame(def, 11, agents, 5, 4);

    assert.equal(trace.moves.length > 0, true);
    for (const move of trace.moves) {
      assert.equal(move.agentDecision?.kind, 'policy');
      if (move.agentDecision?.kind !== 'policy') {
        assert.fail('expected policy trace metadata');
      }
      assert.equal(move.agentDecision.emergencyFallback, false);
      assert.ok(
        move.agentDecision.resolvedProfileId === 'us-baseline'
          || move.agentDecision.resolvedProfileId === 'arvn-baseline'
          || move.agentDecision.resolvedProfileId === 'nva-baseline'
          || move.agentDecision.resolvedProfileId === 'vc-evolved',
      );
    }
  });

  it('handles seed 17 free-operation outcome-policy dead-end without runtime failure or fallback', () => {
    const { compiled } = compileProductionSpec();
    const def = assertValidatedGameDef(compiled.gameDef);
    const agents = [new PolicyAgent(), new PolicyAgent(), new PolicyAgent(), new PolicyAgent()];

    const trace = runGame(def, 17, agents, 5, 4);

    assert.equal(trace.moves.length > 0, true);
    assert.equal(trace.stopReason === 'noLegalMoves' || trace.stopReason === 'maxTurns' || trace.stopReason === 'terminal', true);
    for (const move of trace.moves) {
      assert.equal(move.agentDecision?.kind, 'policy');
      if (move.agentDecision?.kind !== 'policy') {
        assert.fail('expected policy trace metadata');
      }
      assert.equal(move.agentDecision.emergencyFallback, false);
    }
  });
});
