import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileGameSpecToGameDef, parseGameSpec } from '../../src/cnl/index.js';

const buildMarkdown = (deckCompositionYaml: string): string => `\`\`\`yaml
metadata:
  id: scenario-deck-validation
  players: { min: 2, max: 2 }
  defaultScenarioAssetId: scenario-a
zones:
  - { id: deck:none, owner: none, visibility: hidden, ordering: stack }
  - { id: played:none, owner: none, visibility: public, ordering: queue }
tokenTypes:
  - id: card
    props: { isCoup: boolean }
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
${deckCompositionYaml}
eventDecks:
  - id: deck-a
    drawZone: deck:none
    discardZone: played:none
    cards:
      - id: card-1
        title: Event
        sideMode: single
        tags: [pivotal]
        unshaded: { text: event }
      - id: card-2
        title: Coup
        sideMode: single
        tags: [coup]
        unshaded: { text: coup }
\`\`\`
`;

const buildPileFilterMarkdown = (deckCompositionYaml: string): string => `\`\`\`yaml
metadata:
  id: scenario-deck-pile-filter-validation
  players: { min: 2, max: 2 }
  defaultScenarioAssetId: scenario-a
zones:
  - { id: deck:none, owner: none, visibility: hidden, ordering: stack }
  - { id: played:none, owner: none, visibility: public, ordering: queue }
tokenTypes:
  - id: card
    props: { isCoup: boolean }
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
${deckCompositionYaml}
eventDecks:
  - id: deck-a
    drawZone: deck:none
    discardZone: played:none
    cards:
      - id: card-1964-a
        title: 1964 A
        sideMode: single
        tags: []
        metadata: { period: "1964" }
        unshaded: { text: event }
      - id: card-1964-b
        title: 1964 B
        sideMode: single
        tags: []
        metadata: { period: "1964" }
        unshaded: { text: event }
      - id: card-1965-a
        title: 1965 A
        sideMode: single
        tags: []
        metadata: { period: "1965" }
        unshaded: { text: event }
      - id: card-1965-b
        title: 1965 B
        sideMode: single
        tags: []
        metadata: { period: "1965" }
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

describe('scenario deckComposition compiler validations', () => {
  it('emits unknown-strategy diagnostics for unregistered materialization strategies', () => {
    const markdown = buildMarkdown(`        materializationStrategy: unsupported-strategy
        pileCount: 1
        eventsPerPile: 1
        coupsPerPile: 1`);
    const parsed = parseGameSpec(markdown);
    const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });

    const codes = new Set(compiled.diagnostics.map((diagnostic) => diagnostic.code));
    assert.equal(codes.has('CNL_COMPILER_SCENARIO_DECK_COMPOSITION_STRATEGY_UNKNOWN'), true);
  });

  it('emits unknown-card diagnostics for included/excluded ids not present in selected eventDeck', () => {
    const markdown = buildMarkdown(`        pileCount: 1
        materializationStrategy: pile-coup-mix-v1
        eventsPerPile: 1
        coupsPerPile: 1
        includedCardIds: [card-404]
        excludedCardIds: [card-405]`);
    const parsed = parseGameSpec(markdown);
    const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });

    const codes = new Set(compiled.diagnostics.map((diagnostic) => diagnostic.code));
    assert.equal(codes.has('CNL_COMPILER_SCENARIO_DECK_COMPOSITION_UNKNOWN_CARD'), true);
  });

  it('emits unknown-tag diagnostics for included/excluded tags not present in selected eventDeck', () => {
    const markdown = buildMarkdown(`        pileCount: 1
        materializationStrategy: pile-coup-mix-v1
        eventsPerPile: 1
        coupsPerPile: 1
        includedCardTags: [missing-tag]
        excludedCardTags: [another-missing-tag]`);
    const parsed = parseGameSpec(markdown);
    const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });

    const codes = new Set(compiled.diagnostics.map((diagnostic) => diagnostic.code));
    assert.equal(codes.has('CNL_COMPILER_SCENARIO_DECK_COMPOSITION_UNKNOWN_TAG'), true);
  });

  it('emits conflicting-filter diagnostics when include and exclude tag filters overlap', () => {
    const markdown = buildMarkdown(`        pileCount: 1
        materializationStrategy: pile-coup-mix-v1
        eventsPerPile: 1
        coupsPerPile: 1
        includedCardTags: [coup]
        excludedCardTags: [coup]`);
    const parsed = parseGameSpec(markdown);
    const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });

    const codes = new Set(compiled.diagnostics.map((diagnostic) => diagnostic.code));
    assert.equal(codes.has('CNL_COMPILER_SCENARIO_DECK_COMPOSITION_CONFLICTING_FILTERS'), true);
  });

  it('emits insufficient-coups diagnostics when filters remove required coup cards', () => {
    const markdown = buildMarkdown(`        pileCount: 1
        materializationStrategy: pile-coup-mix-v1
        eventsPerPile: 1
        coupsPerPile: 1
        excludedCardIds: [card-2]`);
    const parsed = parseGameSpec(markdown);
    const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });

    const codes = new Set(compiled.diagnostics.map((diagnostic) => diagnostic.code));
    assert.equal(codes.has('CNL_COMPILER_SCENARIO_DECK_COMPOSITION_INSUFFICIENT_COUPS'), true);
  });

  it('accepts valid deckComposition filters and counts without new errors', () => {
    const markdown = buildMarkdown(`        pileCount: 1
        materializationStrategy: pile-coup-mix-v1
        eventsPerPile: 1
        coupsPerPile: 1
        includedCardTags: [pivotal, coup]
        excludedCardIds: []
        excludedCardTags: []`);
    const parsed = parseGameSpec(markdown);
    const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });

    const deckCompositionDiagnostics = compiled.diagnostics.filter((diagnostic) =>
      diagnostic.code.startsWith('CNL_COMPILER_SCENARIO_DECK_COMPOSITION_'),
    );
    assert.deepEqual(deckCompositionDiagnostics, []);
    assert.notEqual(compiled.gameDef, null);
  });

  it('accepts disjoint full pile coverage with pileFilters metadata selectors', () => {
    const markdown = buildPileFilterMarkdown(`        pileCount: 2
        materializationStrategy: pile-coup-mix-v1
        eventsPerPile: 1
        coupsPerPile: 1
        pileFilters:
          - piles: [1]
            metadataEquals: { period: "1964" }
          - piles: [2]
            metadataEquals: { period: "1965" }`);
    const parsed = parseGameSpec(markdown);
    const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });

    const deckCompositionDiagnostics = compiled.diagnostics.filter((diagnostic) =>
      diagnostic.code.startsWith('CNL_COMPILER_SCENARIO_DECK_COMPOSITION_'),
    );
    assert.deepEqual(deckCompositionDiagnostics, []);
    assert.notEqual(compiled.gameDef, null);
  });

  it('emits pile-filter coverage diagnostics when not all piles are assigned', () => {
    const markdown = buildPileFilterMarkdown(`        pileCount: 2
        materializationStrategy: pile-coup-mix-v1
        eventsPerPile: 1
        coupsPerPile: 1
        pileFilters:
          - piles: [1]
            metadataEquals: { period: "1964" }`);
    const parsed = parseGameSpec(markdown);
    const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });

    const codes = new Set(compiled.diagnostics.map((diagnostic) => diagnostic.code));
    assert.equal(codes.has('CNL_COMPILER_SCENARIO_DECK_COMPOSITION_PILE_FILTER_COVERAGE_INCOMPLETE'), true);
  });

  it('emits pile-filter overlap diagnostics when selectors overlap on card cohorts', () => {
    const markdown = buildPileFilterMarkdown(`        pileCount: 2
        materializationStrategy: pile-coup-mix-v1
        eventsPerPile: 1
        coupsPerPile: 1
        pileFilters:
          - piles: [1]
            metadataEquals: { period: "1964" }
          - piles: [2]
            includedCardIds: [card-1964-a]`);
    const parsed = parseGameSpec(markdown);
    const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });

    const codes = new Set(compiled.diagnostics.map((diagnostic) => diagnostic.code));
    assert.equal(codes.has('CNL_COMPILER_SCENARIO_DECK_COMPOSITION_PILE_FILTER_OVERLAP'), true);
  });
});
