// @test-class: convergence-witness
// @witness: spec-132-template-completion-contract
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../src/agents/policy-agent.js';
import { assertValidatedGameDef, createGameDefRuntime } from '../../src/kernel/index.js';
import { runGame } from '../../src/sim/simulator.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

describe('FITL seed 1000 historical draw-space regression', () => {
  it('keeps the former draw-space witness bounded and non-throwing', { timeout: 15_000 }, () => {
    const { compiled } = compileProductionSpec();
    const def = assertValidatedGameDef(compiled.gameDef);
    const runtime = createGameDefRuntime(def);

    const agents = (def.seats ?? []).map((seat) => {
      const profileId = seat.id.toLowerCase() === 'arvn'
        ? 'arvn-evolved'
        : `${seat.id.toLowerCase()}-baseline`;
      return new PolicyAgent({ profileId, traceLevel: 'summary' });
    });

    const trace = runGame(def, 1000, agents, 200, 4, undefined, runtime);

    // The regression guard is "bounded and non-throwing" — `runGame` returns
    // a trace rather than throwing, which already proves the former
    // draw-space crash is gone. Accept any terminal/maxTurns/noLegalMoves
    // outcome; the exact trajectory depends on admissibility semantics and
    // must not be pinned to a single shape (Spec 17 §4 conformance can
    // legitimately prune previously-surfaced spurious moves).
    assert.equal(
      trace.stopReason === 'terminal'
        || trace.stopReason === 'maxTurns'
        || trace.stopReason === 'noLegalMoves',
      true,
      `seed 1000 must terminate cleanly, got ${trace.stopReason}`,
    );
    assert.ok(trace.decisions.length > 0, 'seed 1000 must produce at least one move');
    assert.ok(trace.decisions.length <= 200, 'seed 1000 must stay within the maxTurns budget');
  });
});
