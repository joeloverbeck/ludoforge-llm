import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileCompilerFixture } from './fitl-events-test-helpers.js';

describe('FITL Domino Theory event-card fixture', () => {
  it('compiles card 82 with deterministic branch ordering and constrained declarative targets', () => {
    const { markdown, parsed, validatorDiagnostics, compiled } = compileCompilerFixture('fitl-events-initial-card-pack.md');

    assert.equal(markdown.includes('data/fitl/'), false);
    assert.equal(parsed.diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length, 0);
    assert.deepEqual(validatorDiagnostics, []);
    assert.deepEqual(compiled.diagnostics, []);

    const domino = compiled.gameDef?.eventCards?.find((card) => card.id === 'card-82');
    assert.notEqual(domino, undefined);
    assert.equal(domino?.title, 'Domino Theory');
    assert.equal(domino?.sideMode, 'dual');

    const unshadedBranchIds = domino?.unshaded?.branches?.map((branch) => branch.id);
    assert.deepEqual(unshadedBranchIds, ['return-from-out-of-play', 'resources-and-aid']);

    const returnBranchTargets = domino?.unshaded?.branches?.[0]?.targets;
    assert.deepEqual(returnBranchTargets?.map((target) => target.id), ['us-out-of-play', 'arvn-out-of-play']);
    assert.deepEqual(returnBranchTargets?.map((target) => target.cardinality), [{ max: 3 }, { max: 6 }]);

    const shadedTargets = domino?.shaded?.targets;
    assert.equal(shadedTargets?.[0]?.id, 'us-troops-available');
    assert.deepEqual(shadedTargets?.[0]?.cardinality, { max: 3 });

    const shadedAidEffect = domino?.shaded?.effects?.find((effect) => effect.op === 'addTrack');
    assert.deepEqual(shadedAidEffect, {
      op: 'addTrack',
      track: 'aid',
      delta: -9,
      clamp: { min: 0, max: 75 },
    });
  });

  it('keeps deterministic event-card ordering and fixture action scope', () => {
    const { compiled } = compileCompilerFixture('fitl-events-initial-card-pack.md');

    assert.deepEqual(compiled.gameDef?.eventCards?.map((card) => card.id), ['card-27', 'card-82']);
    assert.deepEqual(compiled.gameDef?.actions.map((action) => String(action.id)), ['pass']);
  });
});
