// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  unsupportedPreviewDriveReasonFixtures,
} from './policy-wasm-preview-drive-equivalence-fixtures.js';

const expectedEnumeration = [
  'unknown\u0000production-deep-choosenstep-continuation.projectedState\u0000deep preview-drive reached a terminal boundary before materializing a WASM projected state',
  'unsupported-effect\u0000production-preview-drive.cardEventAction\u0000production preview-drive does not route card event action candidates',
  'unsupported-effect\u0000production-preview-drive.actionBatch\u0000production preview-drive requires deterministic shared scalar runtime bindings',
  'agent-guided-completion\u0000production-preview-drive.chooseN\u0000only origin-seat greedy chooseN publication is supported',
  'unsupported-effect\u0000production-preview-drive.effect.popInterruptPhase\u0000unsupported production preview-drive effect popInterruptPhase',
] as const;

describe('policy WASM preview-drive unsupported reason coverage', () => {
  it('maps every enumerated unsupported reason to one parity fixture', () => {
    const fixtureEnumeration = unsupportedPreviewDriveReasonFixtures.map((fixture) =>
      `${fixture.unsupportedDriveClass}\u0000${fixture.unsupportedOwner}\u0000${fixture.reason}`);

    assert.deepEqual(new Set(fixtureEnumeration), new Set(expectedEnumeration));
    assert.equal(fixtureEnumeration.length, expectedEnumeration.length);
    assert.deepEqual(
      unsupportedPreviewDriveReasonFixtures.map((fixture) => fixture.ownerSlug).sort(),
      ['actionBatch', 'cardEventAction', 'chooseN', 'popInterruptPhase', 'projectedState'],
    );
  });
});
