import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

interface MapSpaceLike {
  readonly id: string;
  readonly spaceType: string;
  readonly terrainTags: readonly string[];
  readonly adjacentTo: readonly string[];
}

interface TrackLike {
  readonly id: string;
}

interface MarkerLatticeLike {
  readonly id: string;
  readonly states: readonly string[];
}

interface GlobalMarkerLatticeLike {
  readonly id: string;
  readonly states: readonly string[];
  readonly defaultState: string;
}

interface PieceTypeLike {
  readonly id: string;
}

interface InventoryEntryLike {
  readonly total: number;
}

interface EventCardLike {
  readonly id: string;
  readonly title: string;
  readonly order?: number;
}

describe('FITL production data integration compilation', () => {
  it('parses and validates the canonical production GameSpecDoc with required invariants', () => {
    const { parsed, validatorDiagnostics, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    // All required sections now present — no expected validation warnings
    const actualValidationProfile = new Set(validatorDiagnostics.map((diagnostic) => `${diagnostic.code}|${diagnostic.path}`));
    assert.deepEqual(actualValidationProfile, new Set());

    // Compilation must succeed (gameDef non-null)
    assert.notEqual(compiled.gameDef, null, 'Expected gameDef to compile successfully');
    const zoneIds = new Set((compiled.gameDef?.zones ?? []).map((zone) => String(zone.id)));
    assert.equal(zoneIds.has('out-of-play-US:none'), true, 'Expected explicit US out-of-play pool zone');
    assert.equal(zoneIds.has('out-of-play-ARVN:none'), true, 'Expected explicit ARVN out-of-play pool zone');
    assert.equal(compiled.gameDef?.turnOrder?.type, 'cardDriven', 'Production FITL should declare cardDriven turnOrder');
    if (compiled.gameDef?.turnOrder?.type === 'cardDriven') {
      assert.deepEqual(compiled.gameDef.turnOrder.config.turnFlow.cardLifecycle, {
        played: 'played:none',
        lookahead: 'lookahead:none',
        leader: 'leader:none',
      });
      assert.deepEqual(compiled.gameDef.turnOrder.config.turnFlow.durationWindows, ['turn', 'nextTurn', 'round', 'cycle']);
      assert.equal(
        compiled.gameDef.turnOrder.config.turnFlow.eligibility.overrideWindows.some(
          (windowDef) => windowDef.id === 'remain-eligible' && windowDef.duration === 'nextTurn',
        ),
        true,
        'Expected remain-eligible nextTurn override window for stay-eligible event cards',
      );
      assert.deepEqual(compiled.gameDef.turnOrder.config.turnFlow.monsoon, { restrictedActions: [] });
    }
    const profileBackedActionIds = new Set((compiled.gameDef!.actionPipelines ?? []).map((profile) => String(profile.actionId)));
    for (const action of compiled.gameDef!.actions) {
      if (!profileBackedActionIds.has(String(action.id))) {
        continue;
      }
      assert.deepEqual(action.effects, [], `Expected profile-backed action ${String(action.id)} to have no fallback action effects`);
    }
    assert.equal(
      compiled.gameDef!.actions.some((action) => String(action.id) === 'event'),
      true,
      'Expected synthesized card-driven event action in production GameDef',
    );
    const operationActionIds = new Set(['train', 'patrol', 'sweep', 'assault', 'rally', 'march', 'attack', 'terror']);
    const operationProfiles = (compiled.gameDef!.actionPipelines ?? []).filter((profile) =>
      operationActionIds.has(String(profile.actionId)),
    );
    assert.equal(operationProfiles.length, 16, 'Expected exactly 16 operation profiles (8 operations x 2 factions)');
    assert.deepEqual(
      new Set(operationProfiles.map((profile) => String(profile.id))),
      new Set([
        'train-us-profile',
        'train-arvn-profile',
        'patrol-us-profile',
        'patrol-arvn-profile',
        'sweep-us-profile',
        'sweep-arvn-profile',
        'assault-us-profile',
        'assault-arvn-profile',
        'rally-nva-profile',
        'rally-vc-profile',
        'march-nva-profile',
        'march-vc-profile',
        'attack-nva-profile',
        'attack-vc-profile',
        'terror-nva-profile',
        'terror-vc-profile',
      ]),
      'Expected canonical FITL faction-specific operation profile IDs',
    );
    for (const actionId of operationActionIds) {
      const profilesForAction = operationProfiles.filter((profile) => String(profile.actionId) === actionId);
      assert.equal(profilesForAction.length, 2, `Expected exactly 2 profiles for operation action ${actionId}`);
      assert.equal(
        profilesForAction.every((profile) => profile.applicability !== undefined),
        true,
        `Expected explicit applicability on all profiles for operation action ${actionId}`,
      );
    }

    const mapAsset = (parsed.doc.dataAssets ?? []).find((asset) => asset.id === 'fitl-map-production' && asset.kind === 'map');
    assert.ok(mapAsset, 'Expected fitl-map-production map asset');
    const mapPayload = mapAsset.payload as {
      readonly spaces?: readonly MapSpaceLike[];
      readonly tracks?: readonly TrackLike[];
      readonly markerLattices?: readonly MarkerLatticeLike[];
    };

    assert.ok(Array.isArray(mapPayload.spaces), 'Expected map spaces array');
    const spaces = [...mapPayload.spaces];
    assert.equal(spaces.length, 47);

    const spaceById = new Map(spaces.map((space) => [space.id, space]));
    for (const space of spaces) {
      for (const adjacentId of space.adjacentTo) {
        assert.equal(space.id === adjacentId, false, `${space.id} must not self-reference in adjacentTo`);
        const adjacent = spaceById.get(adjacentId);
        assert.ok(adjacent, `${space.id} references unknown adjacent space ${adjacentId}`);
        assert.equal(adjacent.adjacentTo.includes(space.id), true, `${space.id} -> ${adjacentId} must be symmetric`);
      }
    }

    const locs = spaces.filter((space) => space.spaceType === 'loc');
    assert.equal(
      locs.every((space) => space.terrainTags.includes('highway') || space.terrainTags.includes('mekong')),
      true,
      'Every LoC must include at least one of highway or mekong terrain tags',
    );

    assert.ok(Array.isArray(mapPayload.tracks), 'Expected tracks array');
    const trackIds = new Set(mapPayload.tracks.map((track) => track.id));
    assert.equal(trackIds.size, 8);
    assert.deepEqual(
      trackIds,
      new Set(['nvaResources', 'vcResources', 'arvnResources', 'aid', 'patronage', 'trail', 'totalEcon', 'terrorSabotageMarkersPlaced']),
    );

    assert.ok(Array.isArray(mapPayload.markerLattices), 'Expected markerLattices array');
    const supportOpposition = mapPayload.markerLattices.find((lattice) => lattice.id === 'supportOpposition');
    assert.ok(supportOpposition, 'Expected supportOpposition lattice');
    assert.equal(supportOpposition.states.length, 5);
    assert.deepEqual(
      new Set((compiled.gameDef?.tracks ?? []).map((track) => track.id)),
      trackIds,
      'Compiled GameDef tracks must be lowered from selected map asset',
    );
    const globalTrackVars = new Map(
      (compiled.gameDef?.globalVars ?? [])
        .filter((variable) => trackIds.has(variable.name))
        .map((variable) => [variable.name, variable.init] as const),
    );
    assert.deepEqual(
      globalTrackVars,
      new Map([
        ['aid', 15],
        ['patronage', 15],
        ['trail', 1],
        ['vcResources', 5],
        ['nvaResources', 10],
        ['arvnResources', 30],
        ['totalEcon', 10],
        ['terrorSabotageMarkersPlaced', 0],
      ]),
      'Track globalVars must be initialized from selected scenario initialTrackValues with map defaults for omitted tracks',
    );
    assert.deepEqual(
      new Set((compiled.gameDef?.markerLattices ?? []).map((lattice) => lattice.id)),
      new Set(mapPayload.markerLattices.map((lattice) => lattice.id)),
      'Compiled GameDef marker lattices must be lowered from selected map asset',
    );
    const expectedCapabilityMarkers = new Set([
      'cap_topGun',
      'cap_arcLight',
      'cap_abrams',
      'cap_cobras',
      'cap_m48Patton',
      'cap_caps',
      'cap_cords',
      'cap_lgbs',
      'cap_searchAndDestroy',
      'cap_aaa',
      'cap_longRangeGuns',
      'cap_migs',
      'cap_sa2s',
      'cap_pt76',
      'cap_armoredCavalry',
      'cap_mandateOfHeaven',
      'cap_boobyTraps',
      'cap_mainForceBns',
      'cap_cadres',
    ]);
    const compiledGlobalMarkerLattices = (compiled.gameDef?.globalMarkerLattices ?? []) as readonly GlobalMarkerLatticeLike[];
    const globalMarkerById = new Map(compiledGlobalMarkerLattices.map((lattice) => [lattice.id, lattice] as const));

    assert.equal(
      [...expectedCapabilityMarkers].every((id) => globalMarkerById.has(id)),
      true,
      'Compiled GameDef global marker lattices must include all capability markers',
    );

    const capabilityLattices = [...expectedCapabilityMarkers].map((id) => globalMarkerById.get(id));
    assert.equal(
      capabilityLattices.every(
        (lattice) =>
          lattice !== undefined &&
          lattice.defaultState === 'inactive' &&
          lattice.states.length === 3 &&
          new Set(lattice.states).size === 3 &&
          lattice.states.includes('inactive') &&
          lattice.states.includes('unshaded') &&
          lattice.states.includes('shaded'),
      ),
      true,
      'Each capability global marker lattice must be tri-state with inactive default',
    );

    const activeLeader = globalMarkerById.get('activeLeader');
    assert.notEqual(activeLeader, undefined, 'Expected activeLeader global marker lattice');
    assert.deepEqual(activeLeader?.states, ['minh', 'khanh', 'youngTurks', 'ky', 'thieu']);
    assert.equal(activeLeader?.defaultState, 'minh');

    const pieceCatalogAsset = (parsed.doc.dataAssets ?? []).find(
      (asset) => asset.id === 'fitl-piece-catalog-production' && asset.kind === 'pieceCatalog',
    );
    assert.ok(pieceCatalogAsset, 'Expected fitl-piece-catalog-production piece catalog asset');
    const pieceCatalogPayload = pieceCatalogAsset.payload as {
      readonly pieceTypes?: readonly PieceTypeLike[];
      readonly inventory?: readonly InventoryEntryLike[];
    };
    assert.ok(Array.isArray(pieceCatalogPayload.pieceTypes), 'Expected pieceTypes array');
    assert.ok(Array.isArray(pieceCatalogPayload.inventory), 'Expected inventory array');

    assert.equal(pieceCatalogPayload.pieceTypes.length, 12);
    const inventoryTotal = pieceCatalogPayload.inventory.reduce((sum, entry) => sum + entry.total, 0);
    assert.equal(inventoryTotal, 229);

    const allAssets = parsed.doc.dataAssets ?? [];
    const scenarioAssets = allAssets.filter((asset) => asset.kind === 'scenario');
    assert.equal(scenarioAssets.length, 3, 'Expected exactly 3 scenario assets');
    const scenarioIds = new Set(scenarioAssets.map((asset) => asset.id));
    assert.deepEqual(
      scenarioIds,
      new Set(['fitl-scenario-full', 'fitl-scenario-short', 'fitl-scenario-medium']),
      'Expected scenario IDs: fitl-scenario-full, fitl-scenario-short, fitl-scenario-medium',
    );
    assert.equal(
      allAssets.some((asset) => asset.id === 'fitl-scenario-production'),
      false,
      'Placeholder fitl-scenario-production must not exist',
    );

    const eventDeck = parsed.doc.eventDecks?.find((deck) => deck.id === 'fitl-events-initial-card-pack');
    assert.ok(eventDeck, 'Expected fitl-events-initial-card-pack event deck');
    const cardIds = (eventDeck?.cards ?? []).map((card: EventCardLike) => card.id);
    assert.ok(cardIds.includes('card-27'), 'Expected card-27');
    assert.ok(cardIds.includes('card-68'), 'Expected card-68');
    assert.ok(cardIds.includes('card-82'), 'Expected card-82');
    assert.ok(cardIds.includes('card-17'), 'Expected card-17');
    assert.ok(cardIds.includes('card-101'), 'Expected card-101');
    const cardOrderById = new Map((eventDeck?.cards ?? []).map((card: EventCardLike) => [card.id, card.order]));
    assert.equal(cardOrderById.get('card-17'), 17);
    assert.equal(cardOrderById.get('card-27'), 27);
    assert.equal(cardOrderById.get('card-68'), 68);
    assert.equal(cardOrderById.get('card-82'), 82);
    assert.equal(cardOrderById.get('card-101'), 101);
  });
});
