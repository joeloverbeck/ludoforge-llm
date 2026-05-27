// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { buildPlanProposalTrace } from '../../src/agents/plan-trace.js';
import { proposeAdvisoryTurnPlan } from '../../src/agents/plan-proposal.js';
import {
  constraintsSatisfied,
  probeRoleBoundPostState,
  routeGraphProviderForDef,
} from '../../src/agents/plan-role-constraint-eval.js';
import type { PlanRoleBinding } from '../../src/agents/plan-execution.js';
import {
  asActionId,
  asPlayerId,
  initialState,
  legalMoves,
  type Decision,
  type GameDef,
  type GameState,
} from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const roleBinding = (role: string, selectedId: string): PlanRoleBinding => ({
  role,
  selectedId,
  quality: 0,
  rank: 0,
  components: {},
});

const ARVN_ACTION_WINDOW_FIXTURE_PATH = fileURLToPath(
  new URL('../../../test/fixtures/policy-profile-quality/fitl-arvn-action-distribution-windows.json', import.meta.url),
);
const TRAIN_TRANSPORT_WINDOW_STATE_HASH = '0x7934f5eeaa4514a';
const TRAIN_TRANSPORT_CONTROL_LOSS_STATE_HASH = '0x5133c3d3a52a9965';

interface ArvnWindowFixtureRow {
  readonly stateHash: string;
  readonly state: GameState;
}

const loadTrainTransportWindowState = (
  stateHash = TRAIN_TRANSPORT_WINDOW_STATE_HASH,
): GameState => {
  const rows = JSON.parse(readFileSync(ARVN_ACTION_WINDOW_FIXTURE_PATH, 'utf8')) as readonly ArvnWindowFixtureRow[];
  const row = rows.find((entry) => entry.stateHash === stateHash);
  assert.ok(row, 'expected ARVN action-distribution fixture row with Train+Transport legal window');
  return row.state;
};

const compileFitlDef = (): GameDef => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assertNoErrors(compiled);
  assert.notEqual(compiled.gameDef, null);
  return compiled.gameDef!;
};

const actionDecision = (actionId: string): Extract<Decision, { readonly kind: 'actionSelection' }> => ({
  kind: 'actionSelection',
  actionId: asActionId(actionId),
  move: { actionId: asActionId(actionId), params: {} },
});

const arvnTrainTransportInput = (def: GameDef, state: GameState) => {
  const profile = def.agents?.profiles['arvn-baseline'];
  assert.ok(def.agents, 'expected FITL agents');
  assert.ok(profile, 'expected arvn-baseline profile');
  return {
    def,
    state,
    seatId: 'arvn',
    playerId: asPlayerId(1),
    profile,
    catalog: def.agents,
    actionDecisions: [actionDecision('train'), actionDecision('transport')],
  };
};

describe('FITL ARVN Transport route constraint migration', () => {
  it('authors Train+Transport with separate origin and destination route constraints', () => {
    const def = compileFitlDef();
    const template = def.agents?.library.planTemplates?.['arvn.trainTransport'];
    assert.ok(template, 'expected arvn.trainTransport template');

    assert.ok(template.roles.transportOrigin, 'expected separate transportOrigin role');
    assert.ok(template.roles.transportDestination, 'expected separate transportDestination role');
    assert.deepEqual(template.roles.transportDestination?.constraints, [
      { kind: 'reachable', from: 'transportOrigin', to: 'transportDestination', via: 'land' },
      { kind: 'distinctOriginDestination', origin: 'transportOrigin', destination: 'transportDestination' },
      { kind: 'notEqual', role: 'trainSpace' },
      {
        kind: 'postState',
        step: 'transport-destination',
        role: 'transportDestination',
        maxSteps: 8,
        predicate: {
          kind: 'condition',
          bindings: { origin: 'transportOrigin' },
          condition: {
            op: '>',
            left: {
              _t: 5,
              aggregate: {
                op: 'count',
                query: {
                  query: 'tokensInZone',
                  zone: { zoneExpr: { _t: 2, ref: 'binding', name: 'origin' } },
                  filter: { op: 'and', args: [{ prop: 'faction', op: 'in', value: ['US', 'ARVN'] }] },
                },
              },
            },
            right: {
              _t: 5,
              aggregate: {
                op: 'count',
                query: {
                  query: 'tokensInZone',
                  zone: { zoneExpr: { _t: 2, ref: 'binding', name: 'origin' } },
                  filter: { op: 'and', args: [{ prop: 'faction', op: 'in', value: ['NVA', 'VC'] }] },
                },
              },
            },
          },
        },
      },
    ]);
  });

  it('rejects unreachable, same-origin, and trained-space destinations at constraint admissibility', () => {
    const def = compileFitlDef();
    const state = initialState(def, 196_004, 4).state;
    const routeGraph = routeGraphProviderForDef(def);
    const constraints = def.agents?.library.planTemplates?.['arvn.trainTransport']
      ?.roles.transportDestination?.constraints;
    assert.ok(routeGraph, 'expected FITL routeGraph provider');
    assert.ok(constraints, 'expected transportDestination constraints');

    const existing = {
      trainSpace: roleBinding('trainSpace', 'hue:none'),
      transportOrigin: roleBinding('transportOrigin', 'da-nang:none'),
    };

    assert.equal(
      constraintsSatisfied(roleBinding('transportDestination', 'qui-nhon:none'), constraints.filter((constraint) => constraint.kind !== 'postState'), existing, state, routeGraph),
      true,
      'land-reachable destination distinct from origin and trainSpace should admit',
    );
    assert.equal(
      constraintsSatisfied(roleBinding('transportDestination', 'saigon:none'), constraints.filter((constraint) => constraint.kind !== 'postState'), existing, state, routeGraph),
      false,
      'destination outside default land-route hop budget should be rejected before scoring',
    );
    assert.equal(
      constraintsSatisfied(roleBinding('transportDestination', 'da-nang:none'), constraints.filter((constraint) => constraint.kind !== 'postState'), existing, state, routeGraph),
      false,
      'same origin/destination should be rejected before scoring',
    );
    assert.equal(
      constraintsSatisfied(roleBinding('transportDestination', 'hue:none'), constraints.filter((constraint) => constraint.kind !== 'postState'), existing, state, routeGraph),
      false,
      'destination matching the trained space should remain rejected before scoring',
    );
  });

  it('keeps routeGraph and proposal traces byte-identical for repeated inputs', () => {
    const def = compileFitlDef();
    const state = initialState(def, 196_405, 4).state;
    const routeGraph = routeGraphProviderForDef(def);
    assert.ok(routeGraph, 'expected FITL routeGraph provider');

    const firstRouteGraph = JSON.stringify(routeGraph.serialize());
    const secondRouteGraph = JSON.stringify(routeGraphProviderForDef(def)?.serialize());
    assert.equal(secondRouteGraph, firstRouteGraph);

    const input = arvnTrainTransportInput(def, state);
    const firstTrace = JSON.stringify(buildPlanProposalTrace(proposeAdvisoryTurnPlan(input)));
    const secondTrace = JSON.stringify(buildPlanProposalTrace(proposeAdvisoryTurnPlan(input)));
    assert.equal(secondTrace, firstTrace);
  });

  it('probes a production Train+Transport preserving candidate through generic compound postState materialization', () => {
    const def = compileFitlDef();
    const state = loadTrainTransportWindowState();
    const template = def.agents?.library.planTemplates?.['arvn.trainTransport'];
    assert.ok(template, 'expected arvn.trainTransport template');
    const trainTransportMove = legalMoves(def, state)
      .find((move) => move.actionId === asActionId('train') && move.actionClass === 'operationPlusSpecialActivity');
    assert.ok(trainTransportMove, 'expected production legal move enumeration to publish Train+Transport');

    const postState = probeRoleBoundPostState(
      roleBinding('transportDestination', 'binh-dinh:none'),
      {
        kind: 'postState',
        step: 'transport-destination',
        role: 'transportDestination',
        maxSteps: 8,
        predicate: { kind: 'roleLocatedIn', role: 'transportDestination', container: 'binh-dinh:none' },
      },
      {
        trainSpace: roleBinding('trainSpace', 'an-loc:none'),
        transportOrigin: roleBinding('transportOrigin', 'an-loc:none'),
      },
      {
        def,
        rootMove: trainTransportMove,
        root: template.root,
        steps: template.steps,
        playerId: asPlayerId(1),
      },
      state,
    );

    assert.equal(postState.kind, 'ready', 'expected materialized Train+Transport probe to apply');
    assert.equal(Number(postState.postState.globalVars.transportCount), Number(state.globalVars.transportCount) + 1);
  });

  it('rejects origin-control-losing Transport bindings at role-constraint admissibility', () => {
    const def = compileFitlDef();
    const state = loadTrainTransportWindowState(TRAIN_TRANSPORT_CONTROL_LOSS_STATE_HASH);
    const template = def.agents?.library.planTemplates?.['arvn.trainTransport'];
    assert.ok(template, 'expected arvn.trainTransport template');
    const constraints = template.roles.transportDestination?.constraints;
    assert.ok(constraints, 'expected transportDestination constraints');
    const trainTransportMove = legalMoves(def, state)
      .find((move) => move.actionId === asActionId('train') && move.actionClass === 'operationPlusSpecialActivity');
    assert.ok(trainTransportMove, 'expected production legal move enumeration to publish Train+Transport');

    const baseContext = {
      def,
      rootMove: trainTransportMove,
      root: template.root,
      steps: template.steps,
      playerId: asPlayerId(1),
    };

    assert.equal(
      constraintsSatisfied(
        roleBinding('transportDestination', 'binh-dinh:none'),
        constraints,
        {
          trainSpace: roleBinding('trainSpace', 'hue:none'),
          transportOrigin: roleBinding('transportOrigin', 'hue:none'),
        },
        state,
        routeGraphProviderForDef(def),
        baseContext,
      ),
      false,
      'moving all ARVN transport-eligible pieces out of Hue should fail origin-control admissibility',
    );

    assert.equal(
      constraintsSatisfied(
        roleBinding('transportDestination', 'binh-dinh:none'),
        constraints,
        {
          trainSpace: roleBinding('trainSpace', 'da-nang:none'),
          transportOrigin: roleBinding('transportOrigin', 'da-nang:none'),
        },
        state,
        routeGraphProviderForDef(def),
        baseContext,
      ),
      true,
      'Da Nang keeps US pieces after Transport, so the post-state control predicate should admit it',
    );
  });
});
