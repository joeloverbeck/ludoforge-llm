// @test-class: convergence-witness
// @witness: spec-161-choosenstep-differentiation
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../../src/agents/index.js';
import {
  choosenStepPreviewWitnessId,
  createChoosenStepPreviewFixture,
  legalAddStableKeys,
} from './policy-preview-inner-choosenstep-fixture.js';

describe('chooseNStep policy-agent inner preview differentiation', () => {
  it('uses per-option preview refs to pick the higher-delta ADD', () => {
    const fixture = createChoosenStepPreviewFixture(true);
    const agent = new PolicyAgent({ traceLevel: 'verbose' });

    const result = agent.chooseDecision(fixture.input);

    assert.equal(result.decision.kind, 'chooseNStep');
    assert.equal(result.decision.command, 'add');
    assert.equal(result.decision.value, 'high');
    const [highKey] = legalAddStableKeys(fixture.microturn);
    assert.equal(highKey, 'chooseNStep:$picks:add:"high"');
    const trace = result.agentDecision;
    assert.ok(trace !== undefined);
    assert.equal(trace.previewUsage.mode, 'exactWorld');
    assert.equal(trace.previewUsage.utility, 'differentiating');
    assert.equal(trace.previewUsage.outcomeBreakdown?.ready, 3);
    assert.equal(
      trace.previewUsage.readyRefStats['preview.option.delta.victory.currentMargin.self']?.distinctValueCount,
      2,
    );
    assert.equal(trace.selectedStableMoveKey, highKey);

    const candidates = trace.candidates ?? [];
    const high = candidates.find((candidate) => candidate.stableMoveKey === highKey);
    const low = candidates.find((candidate) => candidate.stableMoveKey === 'chooseNStep:$picks:add:"low"');
    const spare = candidates.find((candidate) => candidate.stableMoveKey === 'chooseNStep:$picks:add:"spare"');
    assert.deepEqual(high?.previewRefIds, ['preview.option.delta.victory.currentMargin.self']);
    assert.deepEqual(high?.scoreContributions, [{ termId: 'preferProjectedMargin', contribution: 5 }]);
    assert.deepEqual(low?.scoreContributions, [{ termId: 'preferProjectedMargin', contribution: 1 }]);
    assert.deepEqual(spare?.scoreContributions, [{ termId: 'preferProjectedMargin', contribution: 1 }]);
  });

  it('keeps chooseNStep inner preview disabled when the profile flag is off', () => {
    const fixture = createChoosenStepPreviewFixture(false);
    const agent = new PolicyAgent({ traceLevel: 'verbose' });

    const result = agent.chooseDecision(fixture.input);

    assert.equal(result.decision.kind, 'chooseNStep');
    const trace = result.agentDecision;
    assert.ok(trace !== undefined);
    assert.equal(trace.previewUsage.mode, 'disabled');
    assert.equal(trace.previewUsage.utility, 'none');
    assert.equal(trace.candidates?.every((candidate) => candidate.previewRefIds.length === 0), true);
  });

  it('records the constructed convergence witness id', () => {
    assert.equal(choosenStepPreviewWitnessId, 'spec-161-choosenstep-differentiation');
  });
});
