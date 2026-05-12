// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CNL_COMPILER_DIAGNOSTIC_CODES } from '../../../src/cnl/compiler-diagnostic-codes.js';
import type { GameSpecPolicyExpr } from '../../../src/cnl/game-spec-doc.js';
import { baselineAgents, candidateParamRef, compileCandidateParamsDoc } from './candidate-params-fixture.js';

const REQUIRED_CODE =
  CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_CANDIDATE_PARAM_REF_REQUIRES_EXPLICIT_FALLBACK;
const LOOKUP_REQUIRED_CODE = CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_LOOKUP_REF_REQUIRES_EXPLICIT_FALLBACK;

const modeEqualsA = (ref: GameSpecPolicyExpr = { ref: candidateParamRef('mode') }): GameSpecPolicyExpr => ({
  boolToNumber: { eq: [ref, 'A'] },
});

const currentStateLookupExpr = (): GameSpecPolicyExpr => ({
  lookup: {
    surface: 'policyState',
    collection: 'zones',
    keyType: 'ZoneId',
    key: 'board',
    path: ['properties', 'population'],
    onMissing: 'unavailable',
  },
});

describe('candidate.params fallback requirements', () => {
  it('rejects unavailable candidate param refs without explicit candidateParamFallback', () => {
    const result = compileCandidateParamsDoc(baselineAgents({
      missingFallback: {
        scopes: ['move'],
        weight: 1,
        value: modeEqualsA(),
      },
    }));

    const diagnostic = result.diagnostics.find((entry) => entry.code === REQUIRED_CODE);
    assert.equal(result.gameDef, null);
    assert.equal(diagnostic?.severity, 'error');
    assert.equal(diagnostic?.path, 'doc.agents.library.considerations.missingFallback.candidateParamFallback');
    assert.match(diagnostic?.message ?? '', /candidate\.params\.\*/u);
    assert.match(diagnostic?.message ?? '', /candidateParamFallback\.onUnavailable/u);
  });

  it('compiles unavailable candidate param refs with noContribution fallback', () => {
    const result = compileCandidateParamsDoc(baselineAgents({
      explicitFallback: {
        scopes: ['move'],
        weight: 1,
        value: modeEqualsA(),
        candidateParamFallback: { onUnavailable: 'noContribution' },
      },
    }));

    assert.equal(result.diagnostics.some((entry) => entry.severity === 'error'), false);
    assert.deepEqual(
      result.gameDef?.agents?.library.considerations.explicitFallback?.candidateParamFallback,
      { onUnavailable: 'noContribution' },
    );
    assert.deepEqual(
      result.gameDef?.agents?.compiled.considerations.explicitFallback?.candidateParamFallback,
      { onUnavailable: 'noContribution' },
    );
  });

  it('compiles constant onMissing candidate param refs without consideration fallback', () => {
    const result = compileCandidateParamsDoc(baselineAgents({
      constantMissing: {
        scopes: ['move'],
        weight: 1,
        value: modeEqualsA({
          ref: {
            'candidate.params.mode': {
              onMissing: { kind: 'constant', value: '__absent__' },
            },
          },
        }),
      },
    }));

    assert.equal(result.diagnostics.some((entry) => entry.severity === 'error'), false);
    assert.equal(
      result.gameDef?.agents?.compiled.considerations.constantMissing?.candidateParamFallback,
      undefined,
    );
  });

  it('requires every fallback channel for mixed candidate param and lookup refs', () => {
    const missingCandidateFallback = compileCandidateParamsDoc(baselineAgents({
      mixedMissingCandidate: {
        scopes: ['move'],
        weight: 1,
        value: { add: [modeEqualsA(), currentStateLookupExpr()] },
        lookupFallback: { onUnavailable: 'noContribution' },
      },
    }));
    assert.equal(missingCandidateFallback.gameDef, null);
    assert.ok(missingCandidateFallback.diagnostics.some((entry) => entry.code === REQUIRED_CODE));

    const missingLookupFallback = compileCandidateParamsDoc(baselineAgents({
      mixedMissingLookup: {
        scopes: ['move'],
        weight: 1,
        value: { add: [modeEqualsA(), currentStateLookupExpr()] },
        candidateParamFallback: { onUnavailable: 'noContribution' },
      },
    }));
    assert.equal(missingLookupFallback.gameDef, null);
    assert.ok(missingLookupFallback.diagnostics.some((entry) => entry.code === LOOKUP_REQUIRED_CODE));

    const complete = compileCandidateParamsDoc(baselineAgents({
      mixedComplete: {
        scopes: ['move'],
        weight: 1,
        value: { add: [modeEqualsA(), currentStateLookupExpr()] },
        candidateParamFallback: { onUnavailable: 'noContribution' },
        lookupFallback: { onUnavailable: 'noContribution' },
      },
    }));
    assert.equal(complete.diagnostics.some((entry) => entry.severity === 'error'), false);
  });
});
