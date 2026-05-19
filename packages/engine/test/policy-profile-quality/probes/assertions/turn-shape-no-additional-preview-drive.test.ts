// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { dispatchAssertion } from './index.js';
import { match, testProbe } from './assertion-test-helpers.js';

describe('turnShapeNoAdditionalPreviewDrive assertion', () => {
  it('passes when no unregistered preview-drive runtime signal is observed', () => {
    const assertion = { kind: 'turnShapeNoAdditionalPreviewDrive' } as const;
    const outcome = dispatchAssertion(assertion, {
      probe: testProbe(assertion),
      matches: [match()],
    });

    assert.equal(outcome.kind, 'pass');
  });

  it('fails when a turn-shape evaluator triggers an unregistered preview drive', () => {
    const assertion = { kind: 'turnShapeNoAdditionalPreviewDrive' } as const;
    const outcome = dispatchAssertion(assertion, {
      probe: testProbe(assertion),
      matches: [
        match({
          runtimeFailure: {
            code: 'RUNTIME_EVALUATION_ERROR',
            message: 'Turn-shape evaluator "impact" triggered an unregistered preview drive.',
            signal: 'POLICY_TURNSHAPE_UNREGISTERED_PREVIEW_DRIVE',
          },
        }),
      ],
    });

    assert.equal(outcome.kind, 'fail');
    assert.match(outcome.kind === 'fail' ? outcome.reason : '', /unregistered preview drive/u);
  });
});
