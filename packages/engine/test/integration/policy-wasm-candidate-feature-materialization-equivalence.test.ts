// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildPolicyVictorySurface,
  resolvePolicyStandingRoleSelector,
} from '../../src/agents/policy-surface.js';
import type { PolicyValue } from '../../src/agents/policy-surface.js';
import { evaluateDynamicCandidateFeatureRows } from '../../src/agents/policy-wasm-dynamic-candidate-feature-rows.js';
import { asPlayerId, createGameDefRuntime, initialState, type CompiledPolicyExpr } from '../../src/kernel/index.js';
import { getFitlProductionFixture } from '../helpers/production-spec-helpers.js';

/*
 * Spec 206 §4.2 / §6 P1 — dynamic candidate-feature row materialization equivalence.
 *
 * `projectedLeaderMarginDelta` is the production FITL ARVN feature ticket 003
 * reclaims for the WASM row path:
 *   coalesce(sub(feature.projectedCurrentLeaderMargin,
 *                seatAgg{role: currentLeader}(victory.currentMargin.$seat)), 0)
 * Its inner leaf is a NON-preview `currentSurface` ref inside a role-selected
 * `seatAgg`, and it cross-refs another (preview-cost) candidate feature. This
 * test proves the dynamic-row evaluator computes it byte-equal to an independent
 * TS reference (the projected leader margin minus the CURRENT leader margin),
 * and that a structurally-unmaterializable leaf aborts the whole row to `null`
 * (→ the per-row TS oracle) rather than coalescing to a silently-wrong `0`
 * (Foundation #8 / #20). No WASM module is required: the feature's
 * `collectPreviewDynamicRefs` set is empty, so the row path never invokes the
 * preview drive.
 */

const literal = (value: number): CompiledPolicyExpr => ({ kind: 'literal', value });

describe('Spec 206 dynamic candidate-feature row materialization equivalence', () => {
  const fixture = getFitlProductionFixture();
  const def = fixture.gameDef;
  const runtime = createGameDefRuntime(def);
  const { state } = initialState(def, 206_206, undefined, undefined, runtime);
  const catalog = def.agents;
  assert.ok(catalog, 'FITL fixture must define an agent catalog');

  const feature = catalog.compiled.candidateFeatures['projectedLeaderMarginDelta'];
  assert.ok(feature, 'projectedLeaderMarginDelta must exist in the FITL catalog');

  // Acting seat is irrelevant to the `currentLeader` role; use the ARVN seat.
  const seatId = 'arvn';
  const playerIndex = Math.max(0, def.seats?.findIndex((seat) => seat.id === seatId) ?? 0);
  const playerId = asPlayerId(playerIndex);

  it('computes projectedLeaderMarginDelta byte-equal to the independent TS reference (cross-ref + currentSurface seatAgg)', () => {
    // Independent reference: the CURRENT leader margin (Spec data confirms aggOp:sum
    // over a single resolved seat, so this equals that seat's current margin).
    const surface = buildPolicyVictorySurface(def, state, runtime);
    const leaderSeat = resolvePolicyStandingRoleSelector(def, state, 'currentLeader', seatId);
    assert.ok(leaderSeat, 'currentLeader must resolve on the initial FITL state');
    const currentLeaderMargin = surface.marginBySeat.get(leaderSeat);
    assert.equal(typeof currentLeaderMargin, 'number', 'leader margin must be a number');

    // Seed the cross-ref dependency (projectedCurrentLeaderMargin) with distinct
    // per-candidate projected values, as the route's accumulator would carry.
    const projectedCurrentLeaderMargin: readonly PolicyValue[] = [12, 7, -3, 0, 25];
    const candidateFeatureRows = new Map<string, readonly PolicyValue[]>([
      ['projectedCurrentLeaderMargin', projectedCurrentLeaderMargin],
    ]);

    const rows = evaluateDynamicCandidateFeatureRows(
      {
        def,
        state,
        seatId,
        playerId,
        candidateCount: projectedCurrentLeaderMargin.length,
        candidateFeatureRows,
        runtime,
      },
      feature.expr,
      [],
    );
    assert.ok(rows !== null, 'projectedLeaderMarginDelta must materialize as a WASM row (not abort to oracle)');
    const expected = projectedCurrentLeaderMargin.map((projected) =>
      typeof projected === 'number' ? projected - (currentLeaderMargin as number) : 0,
    );
    assert.deepEqual(rows, expected);
  });

  it('aborts the whole row to null (oracle) when the cross-ref dependency is absent — never a coalesced 0', () => {
    // Same feature, but the cross-ref dependency row is missing from the accumulator
    // (as if projectedCurrentLeaderMargin had itself been oracle-only). The structural
    // sentinel must propagate through sub(...) and coalesce(..., 0) as a hard abort.
    const rows = evaluateDynamicCandidateFeatureRows(
      {
        def,
        state,
        seatId,
        playerId,
        candidateCount: 3,
        candidateFeatureRows: new Map(),
        runtime,
      },
      feature.expr,
      [],
    );
    assert.equal(rows, null, 'an absent cross-ref dependency must abort the row to the oracle, not coalesce to 0');
  });

  it('aborts to null for a structurally-unmaterializable leaf (stateFeature inside the expr), not a coalesced fallback', () => {
    // coalesce(stateFeature, 0): a library/stateFeature ref is not materialized by
    // the dynamic-row evaluator. The sentinel must abort rather than the coalesce
    // swallowing it into the literal-0 fallback.
    const expr: CompiledPolicyExpr = {
      kind: 'op',
      op: 'coalesce',
      args: [{ kind: 'ref', ref: { kind: 'library', refKind: 'stateFeature', id: 'selfMargin' } }, literal(0)],
    };
    const rows = evaluateDynamicCandidateFeatureRows(
      { def, state, seatId, playerId, candidateCount: 2, candidateFeatureRows: new Map(), runtime },
      expr,
      [],
    );
    assert.equal(rows, null, 'a stateFeature leaf must abort the row to the oracle/bytecode, not coalesce to 0');
  });
});
