import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { findDeep } from '../helpers/ast-search-helpers.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

describe('FITL remaining coup event-card production spec', () => {
  it('compiles cards 126-130 with marker-driven leader handoff semantics', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const cards = compiled.gameDef?.eventDecks?.[0]?.cards ?? [];
    const getCard = (id: string) => cards.find((card) => card.id === id);

    const card126 = getCard('card-126');
    const card127 = getCard('card-127');
    const card128 = getCard('card-128');
    const card129 = getCard('card-129');
    const card130 = getCard('card-130');

    assert.notEqual(card126, undefined);
    assert.notEqual(card127, undefined);
    assert.notEqual(card128, undefined);
    assert.notEqual(card129, undefined);
    assert.notEqual(card130, undefined);

    assert.equal(card126?.title, 'Young Turks');
    assert.equal(card126?.sideMode, 'single');
    assert.equal(card126?.order, 126);
    assert.equal(card126?.tags?.includes('coup'), true);
    assert.equal(card126?.shaded, undefined);
    assert.equal(card126?.unshaded?.lastingEffects, undefined);
    assert.deepEqual(card126?.unshaded?.effects, [
      { setGlobalMarker: { marker: 'activeLeader', state: 'youngTurks' } },
      { addVar: { scope: 'global', var: 'leaderBoxCardCount', delta: 1 } },
    ]);

    assert.equal(card127?.title, 'Nguyen Cao Ky');
    assert.equal(card127?.sideMode, 'single');
    assert.equal(card127?.order, 127);
    assert.equal(card127?.tags?.includes('coup'), true);
    assert.equal(card127?.shaded, undefined);
    assert.equal(card127?.unshaded?.lastingEffects, undefined);
    assert.deepEqual(card127?.unshaded?.effects, [
      { setGlobalMarker: { marker: 'activeLeader', state: 'ky' } },
      { addVar: { scope: 'global', var: 'leaderBoxCardCount', delta: 1 } },
    ]);

    assert.equal(card128?.title, 'Nguyen Van Thieu');
    assert.equal(card128?.sideMode, 'single');
    assert.equal(card128?.order, 128);
    assert.equal(card128?.tags?.includes('coup'), true);
    assert.equal(card128?.shaded, undefined);
    assert.equal(card128?.unshaded?.lastingEffects, undefined);
    assert.deepEqual(card128?.unshaded?.effects, [
      { setGlobalMarker: { marker: 'activeLeader', state: 'thieu' } },
      { addVar: { scope: 'global', var: 'leaderBoxCardCount', delta: 1 } },
    ]);

    assert.equal(card129?.title, 'Failed Attempt');
    assert.equal(card129?.sideMode, 'single');
    assert.equal(card129?.order, 129);
    assert.equal(card129?.tags?.includes('coup'), true);
    assert.equal(card129?.shaded, undefined);
    assert.equal(card129?.unshaded?.lastingEffects, undefined);
    const card129FirstEffect = card129?.unshaded?.effects?.[0];
    assert.ok(card129FirstEffect && 'addVar' in card129FirstEffect);
    assert.equal(card129FirstEffect.addVar.var, 'leaderBoxCardCount');
    assert.equal(card129FirstEffect.addVar.delta, 1);
    assert.equal(
      card129?.unshaded?.effects?.some((effect) => 'setGlobalMarker' in effect),
      false,
    );
    const card129HasDesertion = findDeep(card129?.unshaded?.effects, (node) =>
      node?.forEach?.limit?.op === '/' &&
      node?.forEach?.limit?.right === 3 &&
      findDeep(node.forEach?.over ?? {}, (child) => child?.prop === 'faction' && child?.value === 'ARVN').length > 0,
    );
    assert.ok(card129HasDesertion.length >= 1, 'Card 129 should encode ARVN cube-thirds desertion loop');

    assert.equal(card130?.title, 'Failed Attempt');
    assert.equal(card130?.sideMode, 'single');
    assert.equal(card130?.order, 130);
    assert.equal(card130?.tags?.includes('coup'), true);
    assert.equal(card130?.shaded, undefined);
    assert.equal(card130?.unshaded?.lastingEffects, undefined);
    const card130FirstEffect = card130?.unshaded?.effects?.[0];
    assert.ok(card130FirstEffect && 'addVar' in card130FirstEffect);
    assert.equal(card130FirstEffect.addVar.var, 'leaderBoxCardCount');
    assert.equal(card130FirstEffect.addVar.delta, 1);
    assert.equal(
      card130?.unshaded?.effects?.some((effect) => 'setGlobalMarker' in effect),
      false,
    );
    const card130HasDesertion = findDeep(card130?.unshaded?.effects, (node) =>
      node?.forEach?.limit?.op === '/' &&
      node?.forEach?.limit?.right === 3 &&
      findDeep(node.forEach?.over ?? {}, (child) => child?.prop === 'faction' && child?.value === 'ARVN').length > 0,
    );
    assert.ok(card130HasDesertion.length >= 1, 'Card 130 should encode ARVN cube-thirds desertion loop');
  });
});
