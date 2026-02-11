import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileCompilerFixture } from './fitl-events-test-helpers.js';

describe('FITL Phoenix Program event-card fixture', () => {
  it('compiles card 27 with dual-use sides and qualifier/cardinality constraints for constrained resolution', () => {
    const { parsed, validatorDiagnostics, compiled } = compileCompilerFixture('fitl-events-initial-card-pack.md');

    assert.equal(parsed.diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length, 0);
    assert.deepEqual(validatorDiagnostics, []);
    assert.deepEqual(compiled.diagnostics, []);

    const phoenix = compiled.gameDef?.eventCards?.find((card) => card.id === 'card-27');
    assert.notEqual(phoenix, undefined);
    assert.equal(phoenix?.title, 'Phoenix Program');
    assert.equal(phoenix?.sideMode, 'dual');

    const unshadedTarget = phoenix?.unshaded?.targets?.[0];
    assert.equal(unshadedTarget?.id, 'vc-in-coin-control');
    assert.deepEqual(unshadedTarget?.cardinality, { max: 3 });
    assert.deepEqual(unshadedTarget?.selector, {
      query: 'piecesInSpaces',
      orderBy: ['spaceIdAsc', 'pieceIdAsc'],
      filters: {
        faction: 'vc',
        coinControl: true,
        allowTunneledBaseRemoval: false,
      },
    });

    const shadedTarget = phoenix?.shaded?.targets?.[0];
    assert.equal(shadedTarget?.id, 'terror-spaces');
    assert.deepEqual(shadedTarget?.cardinality, { max: 2 });
    assert.deepEqual(shadedTarget?.selector, {
      query: 'spaces',
      orderBy: ['spaceIdAsc'],
      filters: {
        coinControl: true,
        hasFactionPieces: 'vc',
        excludeIds: ['saigon:none'],
      },
    });

    assert.deepEqual(phoenix?.shaded?.effects, [
      { op: 'addTerrorToSelectedSpaces' },
      { op: 'setSupportOpposition', to: 'activeOpposition' },
    ]);
  });
});
