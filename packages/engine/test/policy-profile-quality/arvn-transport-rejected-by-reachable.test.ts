// @test-class: convergence-witness
// @profile-variant: arvn-baseline
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { evaluateRoleConstraints, routeGraphProviderForDef } from '../../src/agents/plan-role-constraint-eval.js';
import type { PlanRoleBinding } from '../../src/agents/plan-execution.js';
import { asActionId, asPlayerId, initialState, type GameDef } from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { emitPolicyProfileQualityRecord } from '../helpers/policy-profile-quality-report-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const SEED = 196_004;

const roleBinding = (role: string, selectedId: string): PlanRoleBinding => ({
  role,
  selectedId,
  quality: 0,
  rank: 0,
  components: {},
});

const compileFitlDef = (): GameDef => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assertNoErrors(compiled);
  assert.notEqual(compiled.gameDef, null);
  return compiled.gameDef!;
};

describe('Spec 200 ARVN Transport rejectedByConstraint witness', () => {
  it('emits a reachable/unreachable rejection record for an ARVN Transport candidate rejected by route semantics', () => {
    const def = compileFitlDef();
    const state = initialState(def, SEED, 4).state;
    const template = def.agents?.library.planTemplates?.['arvn.trainTransport'];
    const constraints = template?.roles.transportDestination?.constraints
      .filter((constraint) => constraint.kind !== 'postState');
    const routeGraph = routeGraphProviderForDef(def);
    assert.ok(template, 'expected arvn.trainTransport template');
    assert.ok(constraints, 'expected transportDestination constraints');
    assert.ok(routeGraph, 'expected FITL routeGraph provider');

    const result = evaluateRoleConstraints(
      roleBinding('transportDestination', 'saigon:none'),
      constraints,
      {
        trainSpace: roleBinding('trainSpace', 'hue:none'),
        transportOrigin: roleBinding('transportOrigin', 'da-nang:none'),
      },
      state,
      routeGraph,
      {
        def,
        rootMove: { actionId: asActionId('train'), params: {} },
        root: template.root,
        steps: template.steps,
        playerId: asPlayerId(1),
      },
    );
    const passed = result.kind === 'reject'
      && result.rejection.kind === 'reachable'
      && result.rejection.reason === 'unreachable';

    emitPolicyProfileQualityRecord({
      file: TEST_FILE,
      variantId: 'arvn-baseline',
      seed: SEED,
      passed,
      stopReason: result.kind,
      decisions: 1,
    });

    assert.deepEqual(result, {
      kind: 'reject',
      rejection: {
        kind: 'reachable',
        reason: 'unreachable',
        via: 'land',
        from: 'da-nang:none',
        to: 'saigon:none',
      },
    });
  });
});
