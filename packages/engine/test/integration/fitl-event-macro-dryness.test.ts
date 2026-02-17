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
});
