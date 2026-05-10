// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createPolicyAgentChooseNStepInnerPreview } from '../../../src/agents/policy-agent-inner-preview.js';
import { createPreviewIntegrityFixture } from './preview-integrity-fixture.js';

const resolvedProfile = (fixture: ReturnType<typeof createPreviewIntegrityFixture>) => ({
  catalog: fixture.catalog,
  seatId: 'us',
  profileId: 'baseline',
  profile: fixture.catalog.profiles.baseline!,
});

describe('preview coverage rollup', () => {
  it('counts ready and unavailable root options from per-ref statuses', () => {
    const fixture = createPreviewIntegrityFixture(true);
    const preview = createPolicyAgentChooseNStepInnerPreview(fixture.chooseNStepInput, resolvedProfile(fixture));

    assert.ok(preview !== undefined);
    assert.deepEqual(preview.usage.coverage, {
      requestedRefCount: 1,
      evaluatedRootOptionCount: 3,
      readyRootOptionCount: 3,
      unavailableRootOptionCount: 0,
      allRootsUnavailable: false,
      selectedByTieBreakerBecausePreviewUnavailable: false,
      strategy: 'singlePass',
      capClass: 'standard256',
    });
  });

  it('marks all roots unavailable when no requested preview ref is ready', () => {
    const fixture = createPreviewIntegrityFixture(false);
    const preview = createPolicyAgentChooseNStepInnerPreview(fixture.chooseNStepInput, resolvedProfile(fixture));

    assert.ok(preview !== undefined);
    assert.deepEqual(preview.usage.coverage, {
      requestedRefCount: 1,
      evaluatedRootOptionCount: 3,
      readyRootOptionCount: 0,
      unavailableRootOptionCount: 3,
      allRootsUnavailable: true,
      selectedByTieBreakerBecausePreviewUnavailable: true,
      strategy: 'singlePass',
      capClass: 'standard256',
    });
  });
});
