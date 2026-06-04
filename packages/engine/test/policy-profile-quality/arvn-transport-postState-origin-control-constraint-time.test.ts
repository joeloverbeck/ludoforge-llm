// @test-class: architectural-invariant
// @proof-tier: executed-outcome
// @proof-tier: adversarial
import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { evaluateRoleConstraints, routeGraphProviderForDef } from '../../src/agents/plan-role-constraint-eval.js';
import type { PlanRoleBinding } from '../../src/agents/plan-execution.js';
import { asActionId, asPlayerId, legalMoves, type GameDef, type GameState } from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { emitPolicyProfileQualityRecord } from '../helpers/policy-profile-quality-report-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import { executePublishedArvnCompoundRoot, loadArvnPlanFixture } from './arvn-plan-witness-helpers.js';
import { withCoupLookahead } from './shared-competence-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const ARVN_ACTION_WINDOW_FIXTURE_PATH = fileURLToPath(
  new URL('../../../test/fixtures/policy-profile-quality/fitl-arvn-action-distribution-windows.json', import.meta.url),
);
const TRAIN_TRANSPORT_CONTROL_LOSS_STATE_HASH = '0x5133c3d3a52a9965';

interface ArvnWindowFixtureRow {
  readonly stateHash: string;
  readonly state: GameState;
}

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

const loadControlLossWindowState = (): GameState => {
  const rows = JSON.parse(readFileSync(ARVN_ACTION_WINDOW_FIXTURE_PATH, 'utf8')) as readonly ArvnWindowFixtureRow[];
  const row = rows.find((entry) => entry.stateHash === TRAIN_TRANSPORT_CONTROL_LOSS_STATE_HASH);
  assert.ok(row, 'expected ARVN Train+Transport fixture row with a marginal origin-Control state');
  return row.state;
};

describe('Spec 205 ARVN Transport postState origin-Control constraint-time witness', () => {
  it('rejects origin-Control-losing Transport at destination role-constraint time', () => {
    const def = compileFitlDef();
    const state = loadControlLossWindowState();
    const template = def.agents?.library.planTemplates?.['arvn.trainTransport'];
    assert.ok(template, 'expected arvn.trainTransport template');

    const originConstraints = template.roles.transportOrigin?.constraints ?? [];
    const destinationConstraints = template.roles.transportDestination?.constraints ?? [];
    const postStateConstraint = destinationConstraints.find((constraint) => constraint.kind === 'postState');
    assert.ok(postStateConstraint, 'expected transportDestination postState constraint');
    const trainTransportMove = legalMoves(def, state)
      .find((move) =>
        move.actionId === asActionId('train')
        && move.actionClass === 'operationPlusSpecialActivity'
        && move.compound?.specialActivity.actionId === asActionId('transport'));
    assert.ok(trainTransportMove, 'expected production legal move enumeration to publish Train+Transport');

    const context = {
      def,
      rootMove: trainTransportMove,
      root: template.root,
      steps: template.steps,
      playerId: asPlayerId(1),
    };
    const routeGraph = routeGraphProviderForDef(def);

    const rejected = evaluateRoleConstraints(
      roleBinding('transportDestination', 'da-nang:none'),
      [postStateConstraint],
      {
        trainSpace: roleBinding('trainSpace', 'hue:none'),
        transportOrigin: roleBinding('transportOrigin', 'hue:none'),
      },
      state,
      routeGraph,
      context,
    );
    const admitted = evaluateRoleConstraints(
      roleBinding('transportDestination', 'binh-dinh:none'),
      [postStateConstraint],
      {
        trainSpace: roleBinding('trainSpace', 'da-nang:none'),
        transportOrigin: roleBinding('transportOrigin', 'da-nang:none'),
      },
      state,
      routeGraph,
      context,
    );
    const executed = executePublishedArvnCompoundRoot(loadArvnPlanFixture(1), {
      actionId: 'train',
      specialActionId: 'transport',
      seed: 1,
      prepareState: (caseDef, base) => ({
        ...withCoupLookahead(caseDef, base),
        globalMarkers: { ...base.globalMarkers, activeLeader: 'youngTurks' },
      }),
    });
    const transportExecuted = Number(executed.postState.globalVars.transportCount) > Number(executed.preState.globalVars.transportCount);
    const passed = originConstraints.every((constraint) => constraint.kind !== 'postState')
      && postStateConstraint?.kind === 'postState'
      && postStateConstraint.role === 'transportDestination'
      && postStateConstraint.step === 'transport-destination'
      && postStateConstraint.maxSteps === 8
      && rejected.kind === 'reject'
      && rejected.rejection.kind === 'postState'
      && rejected.rejection.reason === 'postStatePredicateFailed'
      && admitted.kind === 'pass'
      && transportExecuted;

    emitPolicyProfileQualityRecord({
      file: TEST_FILE,
      variantId: 'arvn-baseline',
      seed: 205_003,
      passed,
      stopReason: rejected.kind === 'reject' ? rejected.rejection.reason : rejected.kind,
      decisions: 2 + executed.decisions.length,
    });

    assert.equal(originConstraints.every((constraint) => constraint.kind !== 'postState'), true);
    assert.equal(postStateConstraint?.role, 'transportDestination');
    assert.equal(postStateConstraint?.step, 'transport-destination');
    assert.equal(postStateConstraint?.maxSteps, 8);
    assert.deepEqual(rejected, {
      kind: 'reject',
      rejection: { kind: 'postState', reason: 'postStatePredicateFailed' },
    });
    assert.deepEqual(admitted, { kind: 'pass' });
    assert.equal(transportExecuted, true, 'expected selected Train+Transport route to execute');
  });
});
