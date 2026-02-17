import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DegeneracyFlag,
  asPlayerId,
  asTokenId,
  asZoneId,
  type Diagnostic,
  type PlayerId,
  type ZoneId,
} from '../../src/kernel/index.js';

describe('kernel type foundations', () => {
  it('enforces brand separation at compile time', () => {
    const playerId: PlayerId = asPlayerId(1);
    const zoneId: ZoneId = asZoneId('market');
    const tokenId = asTokenId('card-1');

    // @ts-expect-error PlayerId must not be assignable to ZoneId.
    const badZoneId: ZoneId = playerId;
    void badZoneId;

    // @ts-expect-error TokenId must not be assignable to PlayerId.
    const badPlayerId: PlayerId = tokenId;
    void badPlayerId;

    assert.equal(typeof playerId, 'number');
    assert.equal(typeof zoneId, 'string');
  });

  it('keeps the exact DegeneracyFlag values', () => {
    assert.deepEqual(Object.values(DegeneracyFlag), [
      'LOOP_DETECTED',
      'NO_LEGAL_MOVES',
      'DOMINANT_ACTION',
      'TRIVIAL_WIN',
      'STALL',
      'TRIGGER_DEPTH_EXCEEDED',
    ]);
  });

  it('requires non-empty diagnostic essentials at runtime', () => {
    const diagnostic: Diagnostic = {
      code: 'REF_ZONE_MISSING',
      path: 'actions[0].effects[0].moveToken.to',
      severity: 'error',
      message: 'Unknown zone ID.',
    };

    assert.ok(diagnostic.code.length > 0);
    assert.ok(diagnostic.path.length > 0);
    assert.ok(diagnostic.message.length > 0);
  });
});
