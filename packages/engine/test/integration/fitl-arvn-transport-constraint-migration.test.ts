// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildPlanProposalTrace } from '../../src/agents/plan-trace.js';
import { proposeAdvisoryTurnPlan } from '../../src/agents/plan-proposal.js';
import {
  constraintsSatisfied,
  routeGraphProviderForDef,
} from '../../src/agents/plan-role-constraint-eval.js';
import type { PlanRoleBinding } from '../../src/agents/plan-execution.js';
import {
  asActionId,
  asPlayerId,
  initialState,
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
});
