// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../src/agents/index.js';
import { applyDecision, serializeGameState } from '../../src/kernel/index.js';
import {
  createChoosenStepPreviewFixture,
  legalAddStableKeys,
} from '../unit/agents/policy-preview-inner-choosenstep-fixture.js';

const previewDriveArrays = (trace: NonNullable<ReturnType<typeof captureTrace>['trace']>) =>
  trace.candidates?.map((candidate) => candidate.previewDrive?.syntheticDecisions ?? []) ?? [];

const candidateStableKeys = (trace: NonNullable<ReturnType<typeof captureTrace>['trace']>) =>
  trace.candidates?.map((candidate) => candidate.stableMoveKey) ?? [];

function captureTrace() {
  const fixture = createChoosenStepPreviewFixture(true);
  const agent = new PolicyAgent({ traceLevel: 'verbose' });
  const result = agent.chooseDecision(fixture.input);
  const finalState = applyDecision(fixture.def, fixture.state, result.decision).state;

  return {
    trace: result.agentDecision,
    finalState,
    legalAddKeys: legalAddStableKeys(fixture.microturn),
  };
}

describe('Spec 161 chooseNStep inner-preview replay identity', () => {
  it('emits byte-identical state, previewUsage, and synthetic-decision arrays for the same GameDef and seed', () => {
    const first = captureTrace();
    const second = captureTrace();

    assert.equal(JSON.stringify(serializeGameState(first.finalState)), JSON.stringify(serializeGameState(second.finalState)));
    assert.equal(JSON.stringify(first.trace?.previewUsage), JSON.stringify(second.trace?.previewUsage));
    assert.equal(JSON.stringify(previewDriveArrays(first.trace!)), JSON.stringify(previewDriveArrays(second.trace!)));
    assert.deepEqual(first.legalAddKeys, second.legalAddKeys);
    assert.deepEqual(candidateStableKeys(first.trace!), candidateStableKeys(second.trace!));

    assert.equal(first.trace?.previewUsage.mode, 'exactWorld');
    assert.equal(first.trace?.previewUsage.utility, 'differentiating');
    assert.equal(first.trace?.previewUsage.evaluatedCandidateCount, 6);
    assert.deepEqual(first.trace?.previewUsage.refIds, ['preview.option.delta.victory.currentMargin.self']);
    assert.deepEqual(
      [...candidateStableKeys(first.trace!)].sort((left, right) => left.localeCompare(right)),
      [
        'chooseNStep:$picks:add:"high"',
        'chooseNStep:$picks:add:"low"',
        'chooseNStep:$picks:add:"spare"',
      ],
    );
    assert.equal(first.trace?.selectedStableMoveKey, 'chooseNStep:$picks:add:"high"');
  });
});
