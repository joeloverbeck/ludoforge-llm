// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertNoDeterminismTerminalPin,
  assertProfileVariantAdjacency,
  assertWitnessAdjacency,
  getMarkerCheck,
} from '../../helpers/test-class-marker-helpers.js';

describe('test class marker profile-variant helpers', () => {
  it('accepts a policy-profile-quality convergence witness with exactly one adjacent @profile-variant marker', () => {
    const source = [
      '// @test-class: convergence-witness',
      '// @profile-variant: all-baselines',
      'export {};',
      '',
    ].join('\n');

    const markerCheck = getMarkerCheck(source, 'policy-profile-quality/variant.test.ts');
    assert.equal(markerCheck.testClass, 'convergence-witness');
    assert.doesNotThrow(() =>
      assertProfileVariantAdjacency(source, 'policy-profile-quality/variant.test.ts', markerCheck.markerLine),
    );
  });

  it('rejects a policy-profile-quality convergence witness without @profile-variant', () => {
    const source = [
      '// @test-class: convergence-witness',
      'export {};',
      '',
    ].join('\n');

    const markerCheck = getMarkerCheck(source, 'policy-profile-quality/missing-variant.test.ts');
    assert.throws(
      () => assertProfileVariantAdjacency(source, 'policy-profile-quality/missing-variant.test.ts', markerCheck.markerLine),
      /missing @profile-variant marker/u,
    );
  });

  it('rejects a policy-profile-quality convergence witness that declares both @witness and @profile-variant', () => {
    const source = [
      '// @test-class: convergence-witness',
      '// @profile-variant: arvn-evolved',
      '// @witness: fitl-canary',
      'export {};',
      '',
    ].join('\n');

    const markerCheck = getMarkerCheck(source, 'policy-profile-quality/both.test.ts');
    assert.throws(
      () => assertProfileVariantAdjacency(source, 'policy-profile-quality/both.test.ts', markerCheck.markerLine),
      /must use only @profile-variant/u,
    );
  });

  it('rejects an integration convergence witness that declares @profile-variant instead of @witness', () => {
    const source = [
      '// @test-class: convergence-witness',
      '// @profile-variant: arvn-evolved',
      'export {};',
      '',
    ].join('\n');

    const markerCheck = getMarkerCheck(source, 'integration/variant-misplaced.test.ts');
    assert.throws(
      () => assertWitnessAdjacency(source, 'integration/variant-misplaced.test.ts', markerCheck.markerLine),
      /declares @profile-variant outside policy-profile-quality/u,
    );
  });

  it('rejects a determinism file that pins stopReason to terminal', () => {
    const source = [
      '// @test-class: architectural-invariant',
      "assert.equal(trace.stopReason === 'terminal', true);",
      '',
    ].join('\n');

    assert.throws(
      () => assertNoDeterminismTerminalPin(source, 'determinism/terminal-pin.test.ts'),
      /pins stopReason to terminal/u,
    );
  });

  it('accepts a determinism file that checks bounded stop reasons via set membership', () => {
    const source = [
      '// @test-class: architectural-invariant',
      'const BOUNDED_STOP_REASONS = new Set(["terminal", "maxTurns", "noLegalMoves"]);',
      'assert.ok(BOUNDED_STOP_REASONS.has(trace.stopReason));',
      '',
    ].join('\n');

    assert.doesNotThrow(() =>
      assertNoDeterminismTerminalPin(source, 'determinism/bounded-membership.test.ts'),
    );
  });
});
