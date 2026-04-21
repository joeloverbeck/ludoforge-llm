// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertModuleExportContract,
  parseTypeScriptSource,
} from '../../helpers/kernel-source-ast-guard.js';
import { readKernelSource } from '../../helpers/kernel-source-guard.js';

const continuationModule = 'src/kernel/microturn/continuation.ts';
const expectedContinuationExports = [
  'DecisionContinuationCache',
  'DecisionContinuationAnalysisOptions',
  'ResolveDecisionContinuationOptions',
  'DecisionContinuationResult',
  'DecisionContinuationAnalysisResult',
  'resolveDecisionContinuation',
  'isDecisionContinuationSatisfiable',
  'classifyDecisionContinuationAdmissionForLegalMove',
  'classifyDecisionContinuationForLegalMove',
  'isDecisionContinuationAdmittedForLegalMove',
  'classifyDecisionContinuationSatisfiability',
] as const;
const forbiddenLegacyHelperName = 'isMoveDecisionSequenceNotUnsatisfiable';

describe('microturn continuation export surface architecture guard', () => {
  it('exposes only canonical continuation helper exports', () => {
    const source = readKernelSource(continuationModule);
    const sourceFile = parseTypeScriptSource(source, continuationModule);
    assertModuleExportContract(sourceFile, 'continuation.ts', {
      expectedNamedExports: expectedContinuationExports,
      forbiddenNamedExports: [forbiddenLegacyHelperName],
    });
  });

  it('forbids legacy unsatisfiable-only admission helper names in the module source', () => {
    const source = readKernelSource(continuationModule);
    assert.doesNotMatch(
      source,
      new RegExp(`\\b${forbiddenLegacyHelperName}\\b`, 'u'),
      'continuation.ts must not reintroduce legacy unsatisfiable-only admission helper naming',
    );
  });
});
