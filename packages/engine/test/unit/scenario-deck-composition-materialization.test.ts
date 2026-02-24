import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileGameSpecToGameDef, parseGameSpec } from '../../src/cnl/index.js';
import { initialState } from '../../src/kernel/index.js';

const buildMarkdown = (): string => `\`\`\`yaml
metadata:
  id: scenario-deck-materialization
  players: { min: 2, max: 2 }
  defaultScenarioAssetId: scenario-a
zones:
  - { id: deck:none, owner: none, visibility: hidden, ordering: stack }
  - { id: played:none, owner: none, visibility: public, ordering: queue }
tokenTypes: []
setup: []
turnStructure:
  phases:
    - { id: main }
actions:
  - { id: pass, actor: active, executor: 'actor', phase: [main], params: [], pre: null, cost: [], effects: [], limits: [] }
terminal:
  conditions: []
dataAssets:
  - id: scenario-a
    kind: scenario
    payload:
      eventDeckAssetId: deck-a
      deckComposition:
        materializationStrategy: pile-coup-mix-v1
        pileCount: 2
        eventsPerPile: 1
        coupsPerPile: 1
        excludedCardTags: [pivotal]
eventDecks:
  - id: deck-a
    drawZone: deck:none
    discardZone: played:none
    cards:
      - id: card-event-1
        title: Event 1
        sideMode: single
        tags: []
        unshaded: { text: event }
      - id: card-event-2
        title: Event 2
        sideMode: single
        tags: []
        unshaded: { text: event }
      - id: card-event-3
        title: Event 3
        sideMode: single
        tags: [pivotal]
        unshaded: { text: event }
      - id: card-coup-1
        title: Coup 1
        sideMode: single
        tags: [coup]
        unshaded: { text: coup }
      - id: card-coup-2
        title: Coup 2
        sideMode: single
        tags: [coup]
        unshaded: { text: coup }
\`\`\`
`;

describe('scenario deckComposition runtime setup materialization', () => {
  it('synthesizes an event-card token type and compiles setup materialization effects', () => {
    const parsed = parseGameSpec(buildMarkdown());
    const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });

    assert.notEqual(compiled.gameDef, null);
    const gameDef = compiled.gameDef!;
    const syntheticCardType = gameDef.tokenTypes.find(
      (tokenType) =>
        tokenType.props.cardId === 'string'
        && tokenType.props.eventDeckId === 'string'
        && tokenType.props.isCoup === 'boolean',
    );
    assert.notEqual(syntheticCardType, undefined, 'Expected synthesized event-card token type');

    const createTokenEffects = gameDef.setup.filter((effect) => 'createToken' in effect);
    assert.equal(createTokenEffects.length > 0, true);
    assert.equal(
      createTokenEffects.every((effect) => effect.createToken.type === syntheticCardType!.id),
      true,
      'Expected scenario deck materialization createToken effects to use synthesized card token type',
    );
  });

  it('materializes pile-constrained card composition into draw zone at initial state', () => {
    const parsed = parseGameSpec(buildMarkdown());
    const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });
    assert.notEqual(compiled.gameDef, null);
    const gameDef = compiled.gameDef!;

    const initial = initialState(gameDef, 12345, 2);
    const drawDeck = initial.state.zones['deck:none'] ?? [];
    assert.equal(drawDeck.length, 4, 'Expected only configured pile cards to enter draw zone');

    const coupsByPile = [drawDeck.slice(0, 2), drawDeck.slice(2, 4)].map(
      (pile) => pile.filter((token) => token.props.isCoup === true).length,
    );
    assert.deepEqual(coupsByPile, [1, 1], 'Expected each synthesized pile to contain exactly one coup');

    const drawCardIds = new Set(
      drawDeck
        .map((token) => token.props.cardId)
        .filter((value): value is string => typeof value === 'string'),
    );
    for (const cardId of drawCardIds) {
      assert.equal(
        ['card-event-1', 'card-event-2', 'card-coup-1', 'card-coup-2'].includes(cardId),
        true,
      );
    }

    const eventsPoolZoneIds = gameDef.zones
      .filter((zone) => String(zone.id).includes('_events_pool_') && String(zone.id).endsWith(':none'))
      .map((zone) => zone.id);
    const coupsPoolZoneId = gameDef.zones.find((zone) => String(zone.id).endsWith('_coups_pool:none'))?.id;
    const pileWorkZoneId = gameDef.zones.find((zone) => String(zone.id).endsWith('_pile_work:none'))?.id;
    assert.equal(eventsPoolZoneIds.length > 0, true);
    assert.notEqual(coupsPoolZoneId, undefined);
    assert.notEqual(pileWorkZoneId, undefined);
    const syntheticZoneIds = new Set<string>([
      ...eventsPoolZoneIds.map((zoneId) => String(zoneId)),
      String(coupsPoolZoneId),
      String(pileWorkZoneId),
    ]);
    for (const zone of gameDef.zones) {
      if (!syntheticZoneIds.has(String(zone.id))) {
        continue;
      }
      assert.equal(zone.isInternal, true, `Expected synthetic scenario zone ${String(zone.id)} to be marked internal`);
    }
    for (const eventsPoolZoneId of eventsPoolZoneIds) {
      assert.equal((initial.state.zones[String(eventsPoolZoneId)] ?? []).length, 0);
    }
    assert.equal((initial.state.zones[String(coupsPoolZoneId)] ?? []).length, 0);
    assert.equal((initial.state.zones[String(pileWorkZoneId)] ?? []).length, 0);
  });
});
