// @test-class: architectural-invariant
// @proof-tier: executed-outcome
// @proof-tier: adversarial
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  assertTemplateRole,
  executePublishedNvaRoot,
  emitNvaPolicyQualityRecord,
  loadNvaPlanFixture,
  publishedSecondEligibleNvaActionDecisions,
} from './nva-plan-witness-helpers.js';
import { withCoupLookahead } from './shared-competence-helpers.js';
import { toMoveIdentityKey } from '../../src/kernel/move-identity.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const SEED = 203_005_01;

describe('Spec 203 NVA Rally Trail witness', () => {
  it('executes a low-Trail Rally improvement with March pressure present', () => {
    const fixture = loadNvaPlanFixture(SEED);
    const lib = fixture.def.agents?.library;
    const templates = fixture.profile.plan.planTemplates ?? [];
    const selector = lib?.selectors?.['nva.rallyTrailTarget'];
    const executed = executePublishedNvaRoot(fixture, {
      actionId: 'rally',
      specialActionId: 'infiltrate',
      seed: SEED,
      prepareState: (def, state) => withCoupLookahead(def, state),
    });
    const frontierKeys = publishedSecondEligibleNvaActionDecisions(
      fixture,
      withCoupLookahead(fixture.def, fixture.state),
    ).map((decision) => decision.move === undefined ? '' : toMoveIdentityKey(fixture.def, decision.move));
    const trailDelta = Number(executed.postState.globalVars.trail) - Number(executed.preState.globalVars.trail);

    const hasTemplate = templates.includes('nva.rallyTrail');
    const hasQualityRefs = selector?.dependencies.candidateFeatures.includes('projectedTrailDelta') === true;
    const usesRallyRoot = lib?.planTemplates?.['nva.rallyTrail']?.root.actionTags.includes('rally') === true;
    const hasMarchPressure = frontierKeys.some((key) => key.startsWith('march|') && key.includes('infiltrate'));
    const passed = hasTemplate && hasQualityRefs && usesRallyRoot && hasMarchPressure && trailDelta > 0;

    emitNvaPolicyQualityRecord({
      file: TEST_FILE,
      seed: SEED,
      passed,
      decisions: executed.decisions.length + frontierKeys.length,
    });

    assert.ok(hasTemplate, 'expected nva.rallyTrail bound');
    assertTemplateRole(fixture, 'nva.rallyTrail', 'rallySpace', 'nva.rallyTrailTarget');
    assert.ok(usesRallyRoot, 'expected nva.rallyTrail to root on Rally');
    assert.ok(hasQualityRefs, 'expected nva.rallyTrailTarget to depend on projectedTrailDelta');
    assert.ok(hasMarchPressure, 'expected March+Infiltrate adversarial root in the same frontier');
    assert.ok(trailDelta > 0, `expected Rally to improve Trail, got ${trailDelta}`);
  });
});
