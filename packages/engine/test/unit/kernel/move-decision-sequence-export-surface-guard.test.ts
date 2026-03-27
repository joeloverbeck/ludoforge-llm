import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertModuleExportContract,
  parseTypeScriptSource,
} from '../../helpers/kernel-source-ast-guard.js';
import { readKernelSource } from '../../helpers/kernel-source-guard.js';

const moveDecisionSequenceModule = 'src/kernel/move-decision-sequence.ts';
const expectedMoveDecisionSequenceExports = [
  'DiscoveryCache',
  'MoveDecisionSequenceSatisfiabilityOptions',
  'ResolveMoveDecisionSequenceOptions',
  'ResolveMoveDecisionSequenceResult',
  'MoveDecisionSequenceSatisfiabilityResult',
  'resolveMoveDecisionSequence',
  'isMoveDecisionSequenceSatisfiable',
  'classifyMoveDecisionSequenceAdmissionForLegalMove',
  'isMoveDecisionSequenceAdmittedForLegalMove',
  'classifyMoveDecisionSequenceSatisfiability',
] as const;
const forbiddenLegacyHelperName = 'isMoveDecisionSequenceNotUnsatisfiable';

describe('move-decision-sequence export surface architecture guard', () => {
  it('exposes only canonical decision-sequence helper exports', () => {
    const source = readKernelSource(moveDecisionSequenceModule);
    const sourceFile = parseTypeScriptSource(source, moveDecisionSequenceModule);
    assertModuleExportContract(sourceFile, 'move-decision-sequence.ts', {
      expectedNamedExports: expectedMoveDecisionSequenceExports,
      forbiddenNamedExports: [forbiddenLegacyHelperName],
    });
  });

  it('forbids legacy unsatisfiable-only admission helper names in the module source', () => {
    const source = readKernelSource(moveDecisionSequenceModule);
    assert.doesNotMatch(
      source,
      new RegExp(`\\b${forbiddenLegacyHelperName}\\b`, 'u'),
      'move-decision-sequence.ts must not reintroduce legacy unsatisfiable-only admission helper naming',
    );
  });
});
