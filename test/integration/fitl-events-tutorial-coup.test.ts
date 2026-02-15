import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

describe('FITL tutorial coup event-card production spec', () => {
  it('compiles card 125 (Nguyen Khanh) as a single-side coup card with leader handoff effects', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-125');
    assert.notEqual(card, undefined);
    assert.equal(card?.title, 'Nguyen Khanh');
    assert.equal(card?.sideMode, 'single');
    assert.equal(card?.order, 125);
    assert.equal(card?.tags?.includes('coup'), true);
    assert.equal(card?.metadata?.flavorText, 'Corps commanders ascendant.');
    assert.equal(card?.unshaded?.text, 'Transport uses max 1 LoC space.');

    assert.deepEqual(card?.unshaded?.effects, [
      { setGlobalMarker: { marker: 'activeLeader', state: 'khanh' } },
      { addVar: { scope: 'global', var: 'leaderBoxCardCount', delta: 1 } },
    ]);

    // Transport restriction is derived from activeLeader checks in shared action logic.
    assert.equal(card?.unshaded?.lastingEffects, undefined);
    assert.equal(card?.shaded, undefined);
  });
});
