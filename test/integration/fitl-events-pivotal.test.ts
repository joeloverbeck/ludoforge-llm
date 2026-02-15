import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { findDeep } from '../helpers/ast-search-helpers.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const expectedCards = [
  { id: 'card-121', title: 'Linebacker II', order: 121, factionTag: 'US', factionOrder: ['US', 'ARVN', 'VC', 'NVA'] },
  { id: 'card-122', title: 'Easter Offensive', order: 122, factionTag: 'NVA', factionOrder: ['NVA', 'VC', 'ARVN', 'US'] },
  { id: 'card-123', title: 'Vietnamization', order: 123, factionTag: 'ARVN', factionOrder: ['ARVN', 'US', 'NVA', 'VC'] },
  { id: 'card-124', title: 'Tet Offensive', order: 124, factionTag: 'VC', factionOrder: ['VC', 'NVA', 'US', 'ARVN'] },
] as const;

describe('FITL pivotal event-card production spec', () => {
  it('compiles cards 121-124 as single-side pivotal cards with play conditions', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    for (const expected of expectedCards) {
      const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === expected.id);
      assert.notEqual(card, undefined, `Expected ${expected.id} to exist`);
      assert.equal(card?.title, expected.title);
      assert.equal(card?.order, expected.order);
      assert.equal(card?.sideMode, 'single');
      assert.equal(card?.tags?.includes('pivotal'), true);
      assert.equal(card?.tags?.includes(expected.factionTag), true);
      assert.deepEqual(card?.metadata?.factionOrder, expected.factionOrder);
      assert.equal(typeof card?.metadata?.flavorText, 'string');
      assert.equal(typeof card?.unshaded?.text, 'string');
      assert.equal(card?.shaded, undefined);
      assert.notEqual(card?.playCondition, undefined, `${expected.id} should include a playCondition`);
    }
  });

  it('encodes faction-specific pivotal play conditions with map-aware token queries', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const getCard = (id: string) => compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === id);
    const card121 = getCard('card-121');
    const card122 = getCard('card-122');
    const card123 = getCard('card-123');
    const card124 = getCard('card-124');

    assert.notEqual(card121, undefined);
    assert.notEqual(card122, undefined);
    assert.notEqual(card123, undefined);
    assert.notEqual(card124, undefined);

    const hasLeaderBoxFloor = (card: typeof card121) =>
      findDeep(card?.playCondition, (node) =>
        node?.op === '>=' && node?.left?.ref === 'gvar' && node?.left?.var === 'leaderBoxCardCount' && node?.right === 2,
      ).length >= 1;
    assert.equal(hasLeaderBoxFloor(card121), true);
    assert.equal(hasLeaderBoxFloor(card122), true);
    assert.equal(hasLeaderBoxFloor(card123), true);
    assert.equal(hasLeaderBoxFloor(card124), true);

    const card121UsesSupportAvailable = findDeep(card121?.playCondition, (node) =>
      node?.op === '>' &&
      node?.right === 40 &&
      findDeep(node?.left, (child) =>
        child?.aggregate?.query?.query === 'tokensInZone' &&
        child?.aggregate?.query?.zone === 'available-US:none' &&
        child?.aggregate?.query?.filter?.some?.((entry: { prop?: string; op?: string; value?: unknown }) =>
          entry.prop === 'type' && entry.op === 'in',
        ),
      ).length >= 1,
    );
    assert.equal(card121UsesSupportAvailable.length >= 1, true, 'Card 121 should gate on support+available > 40');

    const card122HasMapTroopComparison = findDeep(card122?.playCondition, (node) =>
      node?.op === '>' &&
      node?.left?.aggregate?.query?.query === 'tokensInMapSpaces' &&
      node?.right?.aggregate?.query?.query === 'tokensInMapSpaces',
    );
    assert.equal(card122HasMapTroopComparison.length >= 1, true, 'Card 122 should compare NVA vs US troops on map');

    const card123HasUsTroopCap = findDeep(card123?.playCondition, (node) =>
      node?.op === '<' &&
      node?.right === 20 &&
      node?.left?.aggregate?.query?.query === 'tokensInMapSpaces',
    );
    assert.equal(card123HasUsTroopCap.length >= 1, true, 'Card 123 should gate on US troops on map < 20');

    const card124HasSouthFilter = findDeep(card124?.playCondition, (node) =>
      node?.aggregate?.query?.query === 'tokensInMapSpaces' &&
      node?.aggregate?.query?.spaceFilter?.condition?.left?.ref === 'zoneProp' &&
      node?.aggregate?.query?.spaceFilter?.condition?.left?.prop === 'country' &&
      node?.aggregate?.query?.spaceFilter?.condition?.right === 'southVietnam',
    );
    assert.equal(card124HasSouthFilter.length >= 1, true, 'Card 124 should count VC guerrillas in South');
  });

  it('emits no pivotal playCondition-missing cross-validation warnings for cards 121-124', () => {
    const { parsed } = compileProductionSpec();

    const pivotalWarnings = parsed.diagnostics.filter(
      (diagnostic) =>
        diagnostic.code === 'CNL_XREF_PIVOTAL_PLAY_CONDITION_MISSING' &&
        expectedCards.some(({ id }) => diagnostic.message.includes(`"${id}"`)),
    );
    assert.deepEqual(pivotalWarnings, []);
  });
});
