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
});
