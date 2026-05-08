// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../src/agents/index.js';
import { applyDecision, serializeGameState, type PolicyAgentDecisionTrace } from '../../src/kernel/index.js';
import {
  createChoosenStepPreviewFixture,
  legalAddStableKeys,
  type ChoosenStepPreviewFlag,
} from '../unit/agents/policy-preview-inner-choosenstep-fixture.js';

interface Spec161NoOpSnapshot {
  readonly serializedFinalState: unknown;
  readonly previewUsage: NonNullable<PolicyAgentDecisionTrace['previewUsage']>;
  readonly selectedStableMoveKey: string | null | undefined;
  readonly candidateStableKeys: readonly string[];
  readonly candidatePreviewDrives: readonly unknown[];
  readonly legalAddKeys: readonly string[];
}

const sourceSnapshotDir = dirname(fileURLToPath(import.meta.url)).replace(
  `${sep}dist${sep}test${sep}`,
  `${sep}test${sep}`,
);
const snapshotPath = join(sourceSnapshotDir, 'spec-161-choosenstep-no-op-default.snapshot.json');
const baseline = JSON.parse(readFileSync(snapshotPath, 'utf8')) as Spec161NoOpSnapshot;

function captureTrace(chooseNStep: ChoosenStepPreviewFlag): Spec161NoOpSnapshot {
  const fixture = createChoosenStepPreviewFixture(chooseNStep);
  const agent = new PolicyAgent({ traceLevel: 'verbose' });
  const result = agent.chooseDecision(fixture.input);
  const finalState = applyDecision(fixture.def, fixture.state, result.decision).state;
  const trace = result.agentDecision;

  return {
    serializedFinalState: serializeGameState(finalState),
    previewUsage: trace?.previewUsage ?? baseline.previewUsage,
    selectedStableMoveKey: trace?.selectedStableMoveKey,
    candidateStableKeys: trace?.candidates?.map((candidate) => candidate.stableMoveKey) ?? [],
    candidatePreviewDrives: trace?.candidates?.map((candidate) => candidate.previewDrive ?? null) ?? [],
    legalAddKeys: legalAddStableKeys(fixture.microturn),
  };
}

describe('Spec 161 chooseNStep inner-preview default-off invariant', () => {
  it('keeps explicit-disabled chooseNStep inner traces byte-identical to the committed baseline', () => {
    const explicitDisabled = captureTrace(false);

    assert.equal(JSON.stringify(explicitDisabled), JSON.stringify(baseline));
    assert.equal(explicitDisabled.previewUsage.mode, 'disabled');
    assert.equal(explicitDisabled.previewUsage.evaluatedCandidateCount, 0);
    assert.equal(explicitDisabled.previewUsage.utility, 'none');
    assert.deepEqual(explicitDisabled.previewUsage.refIds, []);
    assert.deepEqual(explicitDisabled.candidatePreviewDrives, [null, null, null]);
    assert.equal(explicitDisabled.selectedStableMoveKey, 'chooseNStep:$picks:add:"spare"');
  });

  it('treats an omitted inner-preview chooseNStep flag as the same disabled baseline', () => {
    const omitted = captureTrace('omitted');

    assert.equal(JSON.stringify(omitted), JSON.stringify(baseline));
    assert.equal(omitted.previewUsage.mode, 'disabled');
    assert.deepEqual(omitted.legalAddKeys, [
      'chooseNStep:$picks:add:"high"',
      'chooseNStep:$picks:add:"low"',
      'chooseNStep:$picks:add:"spare"',
    ]);
  });
});
