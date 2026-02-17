import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

type CapabilitySide = 'unshaded' | 'shaded';

function getSingleCapabilityMarkerEffect(
  effects: readonly unknown[] | undefined,
  side: CapabilitySide,
  label: string,
): { readonly setGlobalMarker: { readonly marker: string; readonly state: CapabilitySide } } {
  const markerEffects = (effects ?? []).filter(
    (effect): effect is { readonly setGlobalMarker: { readonly marker: string; readonly state: CapabilitySide } } =>
      typeof effect === 'object' &&
      effect !== null &&
      'setGlobalMarker' in effect &&
      typeof (effect as { readonly setGlobalMarker?: unknown }).setGlobalMarker === 'object' &&
      (effect as { readonly setGlobalMarker?: unknown }).setGlobalMarker !== null,
  );

  assert.equal(markerEffects.length, 1, `Expected exactly one setGlobalMarker effect for ${label}`);
  const markerEffect = markerEffects[0];
  if (markerEffect === undefined) {
    assert.fail(`Expected marker effect for ${label}`);
  }
  assert.equal(markerEffect.setGlobalMarker.state, side, `Expected ${label} marker state ${side}`);
  return markerEffect;
}

describe('FITL capability event-card marker validation', () => {
  it('keeps capability cards and capability marker lattices in strict one-to-one alignment', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const allCards = (compiled.gameDef?.eventDecks ?? []).flatMap((deck) => deck.cards);
    const capabilityCards = allCards.filter((card) => card.tags?.includes('capability'));
    const capabilityMarkerLatticeIds = new Set(
      (compiled.gameDef?.globalMarkerLattices ?? [])
        .filter(
          (lattice) =>
            lattice.id.startsWith('cap_') &&
            lattice.defaultState === 'inactive' &&
            lattice.states.length === 3 &&
            lattice.states.includes('inactive') &&
            lattice.states.includes('unshaded') &&
            lattice.states.includes('shaded'),
        )
        .map((lattice) => lattice.id),
    );

    assert.equal(capabilityCards.length, capabilityMarkerLatticeIds.size, 'Capability cards should match capability marker lattice count');

    const markersSetByCards = new Set<string>();
    const allowedFactionTags = new Set(['US', 'ARVN', 'NVA', 'VC']);
    for (const card of capabilityCards) {
      assert.equal(card.sideMode, 'dual', `Capability card ${card.id} should be dual-sided`);
      assert.equal(card.tags !== undefined && card.tags.some((tag) => allowedFactionTags.has(tag)), true, `Capability card ${card.id} should include a faction tag`);

      const unshadedEffect = getSingleCapabilityMarkerEffect(card.unshaded?.effects, 'unshaded', `${card.id} unshaded`);
      const shadedEffect = getSingleCapabilityMarkerEffect(card.shaded?.effects, 'shaded', `${card.id} shaded`);
      const marker = unshadedEffect.setGlobalMarker.marker;

      assert.equal(shadedEffect.setGlobalMarker.marker, marker, `Capability card ${card.id} should target one marker across both sides`);
      assert.equal(capabilityMarkerLatticeIds.has(marker), true, `Capability card ${card.id} references unknown capability marker ${marker}`);
      markersSetByCards.add(marker);
    }

    assert.deepEqual(markersSetByCards, capabilityMarkerLatticeIds, 'Capability card marker coverage should be exact (none missing, none extra)');
  });
});
