// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { emitPolicyProfileQualityRecord } from '../helpers/policy-profile-quality-report-helpers.js';
import { loadUsPlanFixture, proposeUsPlan } from './us-plan-witness-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const SEED = 202_006_08;

// Competence requirement (§1): Air Lift before Assault must mass Troops without abandoning Control.
// Structurally: us.airLiftAssault binds us.airLiftAssaultOrigin (an origin selector that demotes
// high-population / control-critical origins via a negative population weight) and routes via a
// reachable + distinctOriginDestination constraint to us.airLiftRouteDestination; the
// us.avoidOvercommitment guardrail vetoes Air Lift/Assault that increase US-on-map without Support
// yield. (Air Lift/Assault yield no proposal at the initial state → architectural invariant.)
describe('Spec 202 US Air Lift+Assault no-control-abandonment witness', () => {
  it('wires the control-aware Air Lift route and the overcommitment guardrail', () => {
    const fixture = loadUsPlanFixture(SEED);
    const lib = fixture.def.agents?.library;
    const templates = fixture.profile.plan.planTemplates ?? [];
    const guardrails = fixture.profile.use.guardrails ?? [];
    const roles = lib?.planTemplates?.['us.airLiftAssault']?.roles;

    const hasAirLiftAssault = templates.includes('us.airLiftAssault');
    const originSelector = roles?.assaultOrigin?.selectorId === 'us.airLiftAssaultOrigin';
    const destinationSelector = roles?.airLiftDestination?.selectorId === 'us.airLiftRouteDestination';
    const reachableRoute = (roles?.airLiftDestination?.constraints ?? [])
      .some((c) => c.kind === 'reachable');
    const guardsOvercommitment = guardrails.includes('us.avoidOvercommitment');

    const passed = hasAirLiftAssault && originSelector && destinationSelector
      && reachableRoute && guardsOvercommitment;

    emitPolicyProfileQualityRecord({
      file: TEST_FILE,
      variantId: 'us-baseline',
      seed: SEED,
      passed,
      stopReason: proposeUsPlan(fixture, ['train']).status,
      decisions: templates.length,
    });

    assert.ok(hasAirLiftAssault, 'expected us.airLiftAssault bound');
    assert.ok(originSelector, 'expected assaultOrigin role to bind us.airLiftAssaultOrigin');
    assert.ok(destinationSelector, 'expected airLiftDestination role to bind us.airLiftRouteDestination');
    assert.ok(reachableRoute, 'expected a reachable route constraint on the Air Lift destination');
    assert.ok(guardsOvercommitment, 'expected us.avoidOvercommitment guardrail bound');
  });
});
