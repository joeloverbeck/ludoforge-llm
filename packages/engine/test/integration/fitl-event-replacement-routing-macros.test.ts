import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { EffectMacroDef, GameSpecEffect } from '../../src/cnl/game-spec-doc.js';
import { findDeep } from '../helpers/ast-search-helpers.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const getMacroById = (macroId: string): EffectMacroDef => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assert.notEqual(compiled.gameDef, null, 'Expected valid GameDef');

  const macro = (parsed.doc.effectMacros ?? []).find((entry) => entry.id === macroId);
  assert.ok(macro, `Expected effect macro ${macroId}`);
  return macro;
};

describe('FITL event replacement/routing macros', () => {
  it('defines only the narrow replacement/routing helpers needed for follow-on card rewrites', () => {
    const { parsed } = compileProductionSpec();
    assertNoErrors(parsed);

    const macros = parsed.doc.effectMacros ?? [];
    const macroIds = new Set(macros.map((macro) => macro.id));

    for (const macroId of [
      'fitl-route-removed-piece-to-force-pool',
      'fitl-place-selected-piece-in-zone',
      'fitl-place-selected-piece-in-zone-underground-by-type',
    ]) {
      assert.equal(macroIds.has(macroId), true, `Expected macro ${macroId}`);
    }

    assert.equal(
      macroIds.has('fitl-select-spaces-by-terrain-and-occupant'),
      false,
      'Expected this ticket to avoid adding a selector macro that duplicates the query/filter DSL',
    );
  });

  it('keeps the routing macro contract explicit and FITL-local', () => {
    const routingMacro = getMacroById('fitl-route-removed-piece-to-force-pool');

    assert.deepEqual(
      routingMacro.params.map((param) => ({ name: param.name, type: param.type })),
      [{ name: 'piece', type: 'value' }],
      'Expected the routing macro to take only the removed piece binding',
    );

    const serialized = JSON.stringify(routingMacro.effects);
    assert.match(serialized, /available-US:none/, 'Expected explicit US irregular routing to Available');
    assert.match(serialized, /casualties-US:none/, 'Expected explicit non-Irregular US routing to Casualties');
    assert.match(serialized, /available-ARVN:none/, 'Expected explicit ARVN routing to Available');
    assert.match(
      serialized,
      /\"concat\":\[\"available-\".*\"prop\":\"faction\".*\":none\"\]/,
      'Expected VC/NVA routing to derive the Available pool from the removed piece faction',
    );
  });

  it('keeps placement and post-placement underground logic composable', () => {
    const placeMacro = getMacroById('fitl-place-selected-piece-in-zone');
    const placeUndergroundMacro = getMacroById('fitl-place-selected-piece-in-zone-underground-by-type');

    assert.deepEqual(
      placeMacro.params.map((param) => ({ name: param.name, type: param.type })),
      [
        { name: 'piece', type: 'value' },
        { name: 'zone', type: 'zoneSelector' },
      ],
      'Expected the base placement macro to accept only a piece binding plus explicit destination zone',
    );

    assert.deepEqual(
      placeUndergroundMacro.params.map((param) => ({ name: param.name, type: param.type })),
      [
        { name: 'piece', type: 'value' },
        { name: 'zone', type: 'zoneSelector' },
        { name: 'undergroundTypes', type: { kind: 'tokenTraitValues', prop: 'type' } },
      ],
      'Expected the placement+posture macro to expose only piece, destination zone, and underground type allow-list',
    );

    const nestedPlaceCalls = findDeep(
      placeUndergroundMacro.effects as readonly GameSpecEffect[],
      (node) => node?.macro === 'fitl-place-selected-piece-in-zone',
    );
    assert.equal(
      nestedPlaceCalls.length,
      1,
      'Expected the placement+posture macro to delegate movement to the base placement macro exactly once',
    );

    const setUndergroundCalls = findDeep(
      placeUndergroundMacro.effects as readonly GameSpecEffect[],
      (node) => node?.setTokenProp?.prop === 'activity' && node?.setTokenProp?.value === 'underground',
    );
    assert.equal(
      setUndergroundCalls.length,
      1,
      'Expected the placement+posture macro to apply underground posture explicitly after placement',
    );

    const serialized = JSON.stringify(placeUndergroundMacro.effects);
    assert.match(serialized, /\"op\":\"in\"/, 'Expected posture assignment to be guarded by an allow-list check');
    assert.match(serialized, /\"item\":/, 'Expected the membership guard to lower from the canonical "item" field');
    assert.match(serialized, /\"set\":/, 'Expected the membership guard to lower from the canonical "set" field');
    assert.match(serialized, /\"undergroundTypes\"/, 'Expected posture guard to read the supplied underground type allow-list');
  });
});
