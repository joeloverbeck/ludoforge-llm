// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { findDeep } from '../helpers/ast-search-helpers.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

describe('FITL event macro DRYness integration', () => {
  it('routes capability marker toggles through shared macros in GameSpecDoc event data', () => {
    const { parsed } = compileProductionSpec();
    assertNoErrors(parsed);

    const macroDefs = parsed.doc.effectMacros ?? [];
    assert.ok(macroDefs.some((macro) => macro.id === 'set-global-marker'));
    assert.ok(macroDefs.some((macro) => macro.id === 'set-global-flag-true'));
    assert.ok(macroDefs.some((macro) => macro.id === 'set-global-flag-false'));

    const eventDecks = parsed.doc.eventDecks ?? [];
    const directCapabilityMarkerSets = findDeep(eventDecks, (node) =>
      typeof node?.setGlobalMarker?.marker === 'string' && node.setGlobalMarker.marker.startsWith('cap_'),
    );
    assert.equal(
      directCapabilityMarkerSets.length,
      0,
      'Capability marker transitions in event payloads should use set-global-marker macro invocations',
    );

    const macroCalls = findDeep(eventDecks, (node) => node?.macro === 'set-global-marker');
    assert.ok(macroCalls.length >= 1, 'Expected set-global-marker macro calls in event cards');
  });

  it('routes momentum round toggles through shared setup/teardown macros', () => {
    const { parsed } = compileProductionSpec();
    assertNoErrors(parsed);

    const eventDecks = parsed.doc.eventDecks ?? [];
    const directMomentumSetVars = findDeep(eventDecks, (node) =>
      node?.setVar?.scope === 'global' &&
      typeof node?.setVar?.var === 'string' &&
      node.setVar.var.startsWith('mom_'),
    );
    assert.equal(
      directMomentumSetVars.length,
      0,
      'Momentum setup/teardown in event payloads should use set-global-flag-{true,false} macros',
    );

    const onCalls = findDeep(eventDecks, (node) => node?.macro === 'set-global-flag-true');
    const offCalls = findDeep(eventDecks, (node) => node?.macro === 'set-global-flag-false');
    assert.ok(onCalls.length >= 1, 'Expected set-global-flag-true macro calls in event momentum setup');
    assert.ok(offCalls.length >= 1, 'Expected set-global-flag-false macro calls in event momentum teardown');
  });

  it('centralizes repeated FITL geography predicates through shared condition macros', () => {
    const { parsed } = compileProductionSpec();
    assertNoErrors(parsed);

    const conditionMacros = parsed.doc.conditionMacros ?? [];
    for (const macroId of ['fitl-space-in-laos-cambodia', 'fitl-space-outside-south', 'fitl-space-outside-south-province']) {
      assert.ok(conditionMacros.some((macro) => macro.id === macroId), `Expected condition macro ${macroId}`);
    }

    const cards = parsed.doc.eventDecks?.[0]?.cards ?? [];
    const card2 = cards.find((card) => card.id === 'card-2');
    const card12 = cards.find((card) => card.id === 'card-12');
    const card55 = cards.find((card) => card.id === 'card-55');
    assert.ok(card2, 'Expected card-2');
    assert.ok(card12, 'Expected card-12');
    assert.ok(card55, 'Expected card-55');

    const card2LaosCambodiaRefs = findDeep(card2, (node) => node?.spaceFilter?.conditionMacro === 'fitl-space-in-laos-cambodia');
    assert.ok(card2LaosCambodiaRefs.length >= 2, 'Expected card-2 to reuse fitl-space-in-laos-cambodia for both source groups');

    const card12OutsideSouthRefs = findDeep(card12, (node) => node?.spaceFilter?.conditionMacro === 'fitl-space-outside-south');
    const card12OutsideSouthProvinceRefs = findDeep(card12, (node) => node?.conditionMacro === 'fitl-space-outside-south-province');
    assert.ok(card12OutsideSouthRefs.length >= 2, 'Expected card-12 to reuse fitl-space-outside-south in unshaded selectors');
    assert.ok(
      card12OutsideSouthProvinceRefs.length >= 2,
      'Expected card-12 shaded base placement checks to reuse fitl-space-outside-south-province',
    );

    const card55LaosCambodiaRefs = findDeep(card55, (node) => node?.spaceFilter?.conditionMacro === 'fitl-space-in-laos-cambodia');
    assert.ok(card55LaosCambodiaRefs.length >= 1, 'Expected card-55 to reuse fitl-space-in-laos-cambodia in shaded base repositioning');

    const actionPipelines = parsed.doc.actionPipelines ?? [];
    const actionGeoMacroRefs = findDeep(actionPipelines, (node) => node?.conditionMacro === 'fitl-space-in-laos-cambodia');
    assert.ok(actionGeoMacroRefs.length >= 3, 'Expected FITL action pipelines to reuse shared Laos/Cambodia geography predicate');
  });
});
