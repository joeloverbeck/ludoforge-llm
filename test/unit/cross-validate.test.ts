import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asActionId, asPhaseId } from '../../src/kernel/branded.js';
import type { CompileSectionResults } from '../../src/cnl/compiler-core.js';
import type { GameSpecDoc } from '../../src/cnl/game-spec-doc.js';
import {
  compileGameSpecToGameDef,
  createEmptyGameSpecDoc,
  crossValidateSpec,
  parseGameSpec,
} from '../../src/cnl/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec, readCompilerFixture } from '../helpers/production-spec-helpers.js';

function requireValue<T>(value: T): NonNullable<T> {
  assert.notEqual(value, undefined);
  assert.notEqual(value, null);
  return value as NonNullable<T>;
}

function createRichCompilableDoc(): GameSpecDoc {
  return {
    ...createEmptyGameSpecDoc(),
    metadata: { id: 'cross-validate-rich', players: { min: 2, max: 2 } },
    globalVars: [{ name: 'resources', type: 'int', init: 0, min: 0, max: 50 }],
    zones: [
      { id: 'deck', owner: 'none', visibility: 'hidden', ordering: 'stack' },
      { id: 'discard', owner: 'none', visibility: 'public', ordering: 'stack' },
      { id: 'played', owner: 'none', visibility: 'public', ordering: 'stack' },
      { id: 'lookahead', owner: 'none', visibility: 'hidden', ordering: 'stack' },
      { id: 'leader', owner: 'none', visibility: 'hidden', ordering: 'stack' },
    ],
    tokenTypes: [{ id: 'cube', props: {} }],
    setup: [{ createToken: { type: 'cube', zone: 'discard:none' } }],
    turnStructure: { phases: [{ id: 'main' }] },
    turnOrder: {
      type: 'cardDriven',
      config: {
        turnFlow: {
          cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
          eligibility: { factions: ['us', 'arvn'], overrideWindows: [{ id: 'window-a', duration: 'nextTurn' as const }] },
          optionMatrix: [{ first: 'event' as const, second: ['pass' as const] }],
          passRewards: [{ factionClass: 'coin', resource: 'resources', amount: 2 }],
          durationWindows: ['turn' as const],
        },
        coupPlan: { phases: [{ id: 'main', steps: ['check-thresholds'] }] },
      },
    },
    actions: [
      {
        id: 'act',
        actor: 'active',
        phase: 'main',
        params: [],
        pre: null,
        cost: [],
        effects: [{ draw: { from: 'deck:none', to: 'discard:none', count: 1 } }],
        limits: [],
      },
    ],
    actionPipelines: [
      {
        id: 'act-profile',
        actionId: 'act',
        legality: null,
        costValidation: null, costEffects: [],
        targeting: {},
        stages: [{ effects: [] }],
        atomicity: 'atomic',
        linkedWindows: ['window-a'],
      },
    ],
    triggers: [{ id: 'on-act', event: { type: 'actionResolved', action: 'act' }, effects: [] }],
    eventDecks: [
      {
        id: 'events-core',
        drawZone: 'deck:none',
        discardZone: 'discard:none',
        cards: [
          {
            id: 'card-1',
            title: 'Card 1',
            sideMode: 'single',
            unshaded: {
              effects: [{ shuffle: { zone: 'deck:none' } }],
            },
          },
        ],
      },
    ],
    terminal: {
      conditions: [{ when: { op: '==', left: 1, right: 1 }, result: { type: 'draw' } }],
      checkpoints: [{ id: 'cp-1', faction: 'us', timing: 'duringCoup' as const, when: { op: '==', left: 1, right: 1 } }],
      margins: [{ faction: 'arvn', value: 1 }],
      ranking: { order: 'desc' as const },
    },
  };
}

function compileRichSections(): CompileSectionResults {
  const result = compileGameSpecToGameDef(createRichCompilableDoc());
  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
  return result.sections;
}

describe('crossValidateSpec', () => {
  it('valid spec produces zero cross-ref diagnostics', () => {
    const parsed = parseGameSpec(readCompilerFixture('compile-valid.md'));
    assertNoErrors(parsed);

    const result = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });
    const crossRefDiagnostics = result.diagnostics.filter((diagnostic) => diagnostic.code.startsWith('CNL_XREF_'));

    assert.deepEqual(crossRefDiagnostics, []);
  });

  it('action referencing nonexistent phase emits CNL_XREF_ACTION_PHASE_MISSING with suggestion', () => {
    const sections = compileRichSections();
    const action = requireValue(sections.actions?.[0]);
    const diagnostics = crossValidateSpec({
      ...sections,
      actions: [
        {
          ...action,
          phase: asPhaseId('maim'),
        },
      ],
    });

    const diagnostic = diagnostics.find((entry) => entry.code === 'CNL_XREF_ACTION_PHASE_MISSING');
    assert.notEqual(diagnostic, undefined);
    assert.equal(diagnostic?.path, 'doc.actions.0.phase');
    assert.equal(diagnostic?.suggestion, 'Did you mean "main"?');
  });

  it('profile referencing nonexistent action emits CNL_XREF_PROFILE_ACTION_MISSING', () => {
    const sections = compileRichSections();
    const profile = requireValue(sections.actionPipelines?.[0]);
    const diagnostics = crossValidateSpec({
      ...sections,
      actionPipelines: [
        {
          ...profile,
          actionId: asActionId('acx'),
        },
      ],
    });

    const diagnostic = diagnostics.find((entry) => entry.code === 'CNL_XREF_PROFILE_ACTION_MISSING');
    assert.notEqual(diagnostic, undefined);
    assert.equal(diagnostic?.path, 'doc.actionPipelines.0.actionId');
    assert.equal(diagnostic?.suggestion, 'Did you mean "act"?');
  });

  it('victory checkpoint referencing nonexistent faction emits CNL_XREF_VICTORY_FACTION_MISSING', () => {
    const sections = compileRichSections();
    const checkpoint = requireValue(sections.terminal?.checkpoints?.[0]);
    const diagnostics = crossValidateSpec({
      ...sections,
      terminal: {
        ...sections.terminal!,
        checkpoints: [{ ...checkpoint, faction: 'uss' }],
      },
    });

    const diagnostic = diagnostics.find((entry) => entry.code === 'CNL_XREF_VICTORY_FACTION_MISSING');
    assert.notEqual(diagnostic, undefined);
    assert.equal(diagnostic?.path, 'doc.terminal.checkpoints.0.faction');
    assert.equal(diagnostic?.suggestion, 'Did you mean "us"?');
  });

  it('turnOrder.config.turnFlow.cardLifecycle.played referencing nonexistent zone emits CNL_XREF_LIFECYCLE_ZONE_MISSING', () => {
    const sections = compileRichSections();
    assert.equal(sections.turnOrder?.type, 'cardDriven');
    const turnOrder = requireValue(sections.turnOrder?.type === 'cardDriven' ? sections.turnOrder : undefined);
    const diagnostics = crossValidateSpec({
      ...sections,
      turnOrder: {
        ...turnOrder,
        config: {
          ...turnOrder.config,
          turnFlow: {
            ...turnOrder.config.turnFlow,
            cardLifecycle: {
              ...turnOrder.config.turnFlow.cardLifecycle,
              played: 'plaeyd:none',
            },
          },
        },
      },
    });

    assert.equal(diagnostics.some((entry) => entry.code === 'CNL_XREF_LIFECYCLE_ZONE_MISSING'), true);
  });

  it('cross-ref skips validation when target section is null', () => {
    const sections = compileRichSections();
    const action = requireValue(sections.actions?.[0]);
    const diagnostics = crossValidateSpec({
      ...sections,
      turnStructure: null,
      actions: [
        {
          ...action,
          phase: asPhaseId('unknown-phase'),
        },
      ],
    });

    assert.equal(diagnostics.some((entry) => entry.code === 'CNL_XREF_ACTION_PHASE_MISSING'), false);
  });

  it('FITL production spec produces zero cross-ref diagnostics', () => {
    const production = compileProductionSpec();
    const crossRefDiagnostics = production.compiled.diagnostics.filter((diagnostic) => diagnostic.code.startsWith('CNL_XREF_'));
    assert.deepEqual(crossRefDiagnostics, []);
  });

  it('multiple cross-ref errors are sorted deterministically', () => {
    const sections = compileRichSections();
    const action = requireValue(sections.actions?.[0]);
    const profile = requireValue(sections.actionPipelines?.[0]);
    const withMultipleErrors: CompileSectionResults = {
      ...sections,
      actions: [{ ...action, phase: asPhaseId('maim') }],
      actionPipelines: [{ ...profile, actionId: asActionId('acx') }],
    };

    const first = crossValidateSpec(withMultipleErrors);
    const second = crossValidateSpec(withMultipleErrors);
    assert.deepEqual(first, second);
  });

  it('setup createToken referencing nonexistent zone emits CNL_XREF_SETUP_ZONE_MISSING', () => {
    const sections = compileRichSections();
    const diagnostics = crossValidateSpec({
      ...sections,
      setup: [{ createToken: { type: 'cube', zone: 'discrad:none' } }],
    });

    assert.equal(diagnostics.some((entry) => entry.code === 'CNL_XREF_SETUP_ZONE_MISSING'), true);
  });

  it('passRewards referencing nonexistent globalVar emits CNL_XREF_REWARD_VAR_MISSING', () => {
    const sections = compileRichSections();
    assert.equal(sections.turnOrder?.type, 'cardDriven');
    const turnOrder = requireValue(sections.turnOrder?.type === 'cardDriven' ? sections.turnOrder : undefined);
    const reward = requireValue(
      turnOrder.config.turnFlow.passRewards[0],
    );
    const diagnostics = crossValidateSpec({
      ...sections,
      turnOrder: {
        ...turnOrder,
        config: {
          ...turnOrder.config,
          turnFlow: {
            ...turnOrder.config.turnFlow,
            passRewards: [{ ...reward, resource: 'resorces' }],
          },
        },
      },
    });

    assert.equal(diagnostics.some((entry) => entry.code === 'CNL_XREF_REWARD_VAR_MISSING'), true);
  });

  it('setup createToken referencing nonexistent tokenType emits CNL_XREF_SETUP_TOKEN_TYPE_MISSING', () => {
    const sections = compileRichSections();
    const diagnostics = crossValidateSpec({
      ...sections,
      setup: [{ createToken: { type: 'cubee', zone: 'discard:none' } }],
    });

    const diagnostic = diagnostics.find((entry) => entry.code === 'CNL_XREF_SETUP_TOKEN_TYPE_MISSING');
    assert.notEqual(diagnostic, undefined);
    assert.equal(diagnostic?.suggestion, 'Did you mean "cube"?');
  });

  it('trigger event referencing nonexistent action emits CNL_XREF_TRIGGER_ACTION_MISSING', () => {
    const sections = compileRichSections();
    const trigger = requireValue(sections.triggers?.[0]);
    const diagnostics = crossValidateSpec({
      ...sections,
      triggers: [
        {
          ...trigger,
          event: { type: 'actionResolved', action: asActionId('acx') },
        },
      ],
    });

    const diagnostic = diagnostics.find((entry) => entry.code === 'CNL_XREF_TRIGGER_ACTION_MISSING');
    assert.notEqual(diagnostic, undefined);
    assert.equal(diagnostic?.path, 'doc.triggers.0.event.action');
    assert.equal(diagnostic?.suggestion, 'Did you mean "act"?');
  });

  it('trigger varChanged event referencing nonexistent var emits CNL_XREF_TRIGGER_VAR_MISSING', () => {
    const sections = compileRichSections();
    const trigger = requireValue(sections.triggers?.[0]);
    const diagnostics = crossValidateSpec({
      ...sections,
      triggers: [
        {
          ...trigger,
          event: { type: 'varChanged', scope: 'global', var: 'resorces' },
        },
      ],
    });

    const diagnostic = diagnostics.find((entry) => entry.code === 'CNL_XREF_TRIGGER_VAR_MISSING');
    assert.notEqual(diagnostic, undefined);
    assert.equal(diagnostic?.path, 'doc.triggers.0.event.var');
    assert.equal(diagnostic?.suggestion, 'Did you mean "resources"?');
  });

  it('eventDeck effects referencing nonexistent zone emit CNL_XREF_EVENT_DECK_EFFECT_ZONE_MISSING', () => {
    const sections = compileRichSections();
    const deck = requireValue(sections.eventDecks?.[0]);
    const card = requireValue(deck.cards[0]);
    const diagnostics = crossValidateSpec({
      ...sections,
      eventDecks: [
        {
          ...deck,
          cards: [
            {
              ...card,
              unshaded: {
                effects: [{ draw: { from: 'deck:none', to: 'discrad:none', count: 1 } }],
              },
            },
          ],
        },
      ],
    });

    const diagnostic = diagnostics.find((entry) => entry.code === 'CNL_XREF_EVENT_DECK_EFFECT_ZONE_MISSING');
    assert.notEqual(diagnostic, undefined);
    assert.equal(diagnostic?.path, 'doc.eventDecks.0.cards.0.unshaded.effects.0.draw.to');
    assert.equal(diagnostic?.suggestion, 'Did you mean "discard:none"?');
  });

  it('eventDecks drawZone referencing nonexistent zone emits CNL_XREF_EVENT_DECK_ZONE_MISSING', () => {
    const sections = compileRichSections();
    const deck = requireValue(sections.eventDecks?.[0]);
    const diagnostics = crossValidateSpec({
      ...sections,
      eventDecks: [{ ...deck, drawZone: 'decj:none' }],
    });

    const diagnostic = diagnostics.find((entry) => entry.code === 'CNL_XREF_EVENT_DECK_ZONE_MISSING');
    assert.notEqual(diagnostic, undefined);
    assert.equal(diagnostic?.path, 'doc.eventDecks.0.drawZone');
    assert.equal(diagnostic?.suggestion, 'Did you mean "deck:none"?');
  });

  it('eventDecks discardZone referencing nonexistent zone emits CNL_XREF_EVENT_DECK_ZONE_MISSING', () => {
    const sections = compileRichSections();
    const deck = requireValue(sections.eventDecks?.[0]);
    const diagnostics = crossValidateSpec({
      ...sections,
      eventDecks: [{ ...deck, discardZone: 'discrad:none' }],
    });

    assert.equal(
      diagnostics.some(
        (entry) => entry.code === 'CNL_XREF_EVENT_DECK_ZONE_MISSING' && entry.path === 'doc.eventDecks.0.discardZone',
      ),
      true,
    );
  });

  it('eventDeck freeOperationGrants with unknown faction emits CNL_XREF_EVENT_DECK_GRANT_FACTION_MISSING', () => {
    const sections = compileRichSections();
    const deck = requireValue(sections.eventDecks?.[0]);
    const card = requireValue(deck.cards[0]);
    const diagnostics = crossValidateSpec({
      ...sections,
      eventDecks: [
        {
          ...deck,
          cards: [
            {
              ...card,
              unshaded: {
                ...(card.unshaded ?? {}),
                freeOperationGrants: [{ faction: 'uss' }],
              },
            },
          ],
        },
      ],
    });

    const diagnostic = diagnostics.find((entry) => entry.code === 'CNL_XREF_EVENT_DECK_GRANT_FACTION_MISSING');
    assert.notEqual(diagnostic, undefined);
    assert.equal(diagnostic?.path, 'doc.eventDecks.0.cards.0.unshaded.freeOperationGrants.0.faction');
    assert.equal(diagnostic?.suggestion, 'Did you mean "us"?');
  });

  it('eventDeck branch freeOperationGrants with unknown action emits CNL_XREF_EVENT_DECK_GRANT_ACTION_MISSING', () => {
    const sections = compileRichSections();
    const deck = requireValue(sections.eventDecks?.[0]);
    const card = requireValue(deck.cards[0]);
    const diagnostics = crossValidateSpec({
      ...sections,
      eventDecks: [
        {
          ...deck,
          cards: [
            {
              ...card,
              unshaded: {
                ...(card.unshaded ?? {}),
                branches: [
                  {
                    id: 'branch-a',
                    freeOperationGrants: [{ faction: 'us', actionIds: ['acx'] }],
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    const diagnostic = diagnostics.find((entry) => entry.code === 'CNL_XREF_EVENT_DECK_GRANT_ACTION_MISSING');
    assert.notEqual(diagnostic, undefined);
    assert.equal(
      diagnostic?.path,
      'doc.eventDecks.0.cards.0.unshaded.branches.0.freeOperationGrants.0.actionIds.0',
    );
    assert.equal(diagnostic?.suggestion, 'Did you mean "act"?');
  });

  it('eventDeck freeOperationGrants with valid faction/action references produce no grant cross-ref diagnostics', () => {
    const sections = compileRichSections();
    const deck = requireValue(sections.eventDecks?.[0]);
    const card = requireValue(deck.cards[0]);
    const diagnostics = crossValidateSpec({
      ...sections,
      eventDecks: [
        {
          ...deck,
          cards: [
            {
              ...card,
              unshaded: {
                ...(card.unshaded ?? {}),
                freeOperationGrants: [{ faction: 'us', actionIds: ['act'] }],
              },
            },
          ],
        },
      ],
    });

    const grantDiagnostics = diagnostics.filter((entry) =>
      entry.code === 'CNL_XREF_EVENT_DECK_GRANT_FACTION_MISSING' ||
      entry.code === 'CNL_XREF_EVENT_DECK_GRANT_ACTION_MISSING');
    assert.deepEqual(grantDiagnostics, []);
  });

  it('eventDeck eligibilityOverrides with unknown faction emits CNL_XREF_EVENT_DECK_OVERRIDE_FACTION_MISSING', () => {
    const sections = compileRichSections();
    const deck = requireValue(sections.eventDecks?.[0]);
    const card = requireValue(deck.cards[0]);
    const diagnostics = crossValidateSpec({
      ...sections,
      eventDecks: [
        {
          ...deck,
          cards: [
            {
              ...card,
              unshaded: {
                ...(card.unshaded ?? {}),
                eligibilityOverrides: [{ target: { kind: 'faction', faction: 'uss' }, eligible: true, windowId: 'window-a' }],
              },
            },
          ],
        },
      ],
    });

    const diagnostic = diagnostics.find((entry) => entry.code === 'CNL_XREF_EVENT_DECK_OVERRIDE_FACTION_MISSING');
    assert.notEqual(diagnostic, undefined);
    assert.equal(diagnostic?.path, 'doc.eventDecks.0.cards.0.unshaded.eligibilityOverrides.0.target.faction');
    assert.equal(diagnostic?.suggestion, 'Did you mean "us"?');
  });

  it('eventDeck branch eligibilityOverrides with unknown window emits CNL_XREF_EVENT_DECK_OVERRIDE_WINDOW_MISSING', () => {
    const sections = compileRichSections();
    const deck = requireValue(sections.eventDecks?.[0]);
    const card = requireValue(deck.cards[0]);
    const diagnostics = crossValidateSpec({
      ...sections,
      eventDecks: [
        {
          ...deck,
          cards: [
            {
              ...card,
              unshaded: {
                ...(card.unshaded ?? {}),
                branches: [
                  {
                    id: 'branch-a',
                    eligibilityOverrides: [{ target: { kind: 'active' }, eligible: false, windowId: 'window-b' }],
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    const diagnostic = diagnostics.find((entry) => entry.code === 'CNL_XREF_EVENT_DECK_OVERRIDE_WINDOW_MISSING');
    assert.notEqual(diagnostic, undefined);
    assert.equal(diagnostic?.path, 'doc.eventDecks.0.cards.0.unshaded.branches.0.eligibilityOverrides.0.windowId');
    assert.equal(diagnostic?.suggestion, 'Did you mean "window-a"?');
  });

  it('eventDeck side targets without executable payload emit CNL_XREF_EVENT_DECK_TARGETS_EXECUTABILITY_MISSING', () => {
    const sections = compileRichSections();
    const deck = requireValue(sections.eventDecks?.[0]);
    const card = requireValue(deck.cards[0]);
    const diagnostics = crossValidateSpec({
      ...sections,
      eventDecks: [
        {
          ...deck,
          cards: [
            {
              ...card,
              unshaded: {
                text: 'Move pieces.',
                targets: [
                  {
                    id: '$targetSpaces',
                    selector: { query: 'mapSpaces' },
                    cardinality: { max: 2 },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    const diagnostic = diagnostics.find((entry) => entry.code === 'CNL_XREF_EVENT_DECK_TARGETS_EXECUTABILITY_MISSING');
    assert.notEqual(diagnostic, undefined);
    assert.equal(diagnostic?.path, 'doc.eventDecks.0.cards.0.unshaded.targets');
  });

  it('eventDeck branch targets with executable payload produce no executability diagnostics', () => {
    const sections = compileRichSections();
    const deck = requireValue(sections.eventDecks?.[0]);
    const card = requireValue(deck.cards[0]);
    const diagnostics = crossValidateSpec({
      ...sections,
      eventDecks: [
        {
          ...deck,
          cards: [
            {
              ...card,
              unshaded: {
                branches: [
                  {
                    id: 'branch-a',
                    targets: [
                      {
                        id: '$targetSpaces',
                        selector: { query: 'mapSpaces' },
                        cardinality: { max: 1 },
                      },
                    ],
                    effects: [{ shuffle: { zone: 'deck:none' } }],
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    assert.deepEqual(
      diagnostics.filter((entry) => entry.code === 'CNL_XREF_EVENT_DECK_TARGETS_EXECUTABILITY_MISSING'),
      [],
    );
  });

  it('eventDeck eligibilityOverrides with valid references produce no override cross-ref diagnostics', () => {
    const sections = compileRichSections();
    const deck = requireValue(sections.eventDecks?.[0]);
    const card = requireValue(deck.cards[0]);
    const diagnostics = crossValidateSpec({
      ...sections,
      eventDecks: [
        {
          ...deck,
          cards: [
            {
              ...card,
              unshaded: {
                ...(card.unshaded ?? {}),
                eligibilityOverrides: [
                  { target: { kind: 'active' }, eligible: true, windowId: 'window-a' },
                  { target: { kind: 'faction', faction: 'us' }, eligible: false, windowId: 'window-a' },
                ],
              },
            },
          ],
        },
      ],
    });

    const overrideDiagnostics = diagnostics.filter((entry) =>
      entry.code === 'CNL_XREF_EVENT_DECK_OVERRIDE_FACTION_MISSING' ||
      entry.code === 'CNL_XREF_EVENT_DECK_OVERRIDE_WINDOW_MISSING');
    assert.deepEqual(overrideDiagnostics, []);
  });
});
