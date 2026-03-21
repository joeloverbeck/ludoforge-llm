import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getFitlProductionFixture, getTexasProductionFixture } from '../helpers/production-spec-helpers.js';
import { createGameDefRuntime } from '../../src/kernel/gamedef-runtime.js';
import { initialState } from '../../src/kernel/initial-state.js';
import { describeAction } from '../../src/kernel/condition-annotator.js';
import type { AnnotationContext } from '../../src/kernel/condition-annotator.js';
import { asPlayerId } from '../../src/kernel/branded.js';

const FITL_PRODUCTION_FIXTURE = getFitlProductionFixture();
const TEXAS_PRODUCTION_FIXTURE = getTexasProductionFixture();

describe('tooltip pipeline integration', () => {
  // -----------------------------------------------------------------------
  // FITL production spec
  // -----------------------------------------------------------------------

  it('FITL describeAction produces tooltipPayload for a real action', () => {
    const { compiled } = FITL_PRODUCTION_FIXTURE;
    assert.ok(compiled.gameDef !== null, 'FITL GameDef must compile');
    const def = compiled.gameDef;
    assert.ok(def.actions.length > 0, 'FITL must have at least one action');

    const runtime = createGameDefRuntime(def);
    const { state } = initialState(def, 42);
    const action = def.actions[0]!;

    const context: AnnotationContext = {
      def,
      runtime,
      state,
      activePlayer: asPlayerId(0),
      actorPlayer: asPlayerId(0),
    };

    const result = describeAction(action, context);

    // Core invariants
    assert.ok(Array.isArray(result.sections), 'sections must be an array');
    assert.ok(Array.isArray(result.limitUsage), 'limitUsage must be an array');

    // Tooltip payload
    assert.ok(result.tooltipPayload !== undefined, 'tooltipPayload must be present');
    const { ruleCard, ruleState } = result.tooltipPayload;

    assert.equal(typeof ruleCard.synopsis, 'string', 'synopsis must be a string');
    assert.ok(ruleCard.synopsis.length > 0, 'synopsis must be non-empty');
    assert.ok(Array.isArray(ruleCard.steps), 'steps must be an array');
    assert.ok(Array.isArray(ruleCard.modifiers), 'modifiers must be an array');

    assert.equal(typeof ruleState.available, 'boolean', 'available must be boolean');
    assert.ok(Array.isArray(ruleState.blockers), 'blockers must be an array');
    assert.ok(Array.isArray(ruleState.activeModifierIndices), 'activeModifierIndices must be an array');
  });

  it('FITL RuleCard is cached across multiple describeAction calls', () => {
    const { compiled } = FITL_PRODUCTION_FIXTURE;
    const def = compiled.gameDef!;
    const runtime = createGameDefRuntime(def);
    const { state } = initialState(def, 42);
    const action = def.actions[0]!;

    const context: AnnotationContext = {
      def,
      runtime,
      state,
      activePlayer: asPlayerId(0),
      actorPlayer: asPlayerId(0),
    };

    const result1 = describeAction(action, context);
    const result2 = describeAction(action, context);

    assert.ok(result1.tooltipPayload !== undefined);
    assert.ok(result2.tooltipPayload !== undefined);
    assert.equal(
      result1.tooltipPayload.ruleCard,
      result2.tooltipPayload.ruleCard,
      'RuleCard must be referentially identical (cached)',
    );
  });

  it('FITL verbalization labels appear in RuleCard synopsis', () => {
    const { compiled } = FITL_PRODUCTION_FIXTURE;
    const def = compiled.gameDef!;
    assert.ok(def.verbalization !== undefined, 'FITL must have verbalization');

    const runtime = createGameDefRuntime(def);
    const { state } = initialState(def, 42);

    // Find an action whose id appears as a verbalization label
    const labelKeys = new Set(Object.keys(def.verbalization!.labels));
    const labeledAction = def.actions.find((a) => labelKeys.has(String(a.id)));

    if (labeledAction !== undefined) {
      const context: AnnotationContext = {
        def,
        runtime,
        state,
        activePlayer: asPlayerId(0),
        actorPlayer: asPlayerId(0),
      };
      const result = describeAction(labeledAction, context);
      assert.ok(result.tooltipPayload !== undefined);
      const rawLabel = def.verbalization!.labels[String(labeledAction.id)]!;
      const label = typeof rawLabel === 'string' ? rawLabel : rawLabel.singular;
      assert.ok(
        result.tooltipPayload.ruleCard.synopsis.includes(label),
        `synopsis "${result.tooltipPayload.ruleCard.synopsis}" must include label "${label}"`,
      );
    }
  });

  // -----------------------------------------------------------------------
  // FITL golden tests — verbalization produces readable English
  // -----------------------------------------------------------------------

  it('FITL Train synopsis uses verbalized action label', () => {
    const { compiled } = FITL_PRODUCTION_FIXTURE;
    const def = compiled.gameDef!;
    const runtime = createGameDefRuntime(def);
    const { state } = initialState(def, 42);
    const train = def.actions.find((a) => a.id === 'train');
    assert.ok(train !== undefined, 'train action must exist');

    const context: AnnotationContext = {
      def, runtime, state,
      activePlayer: asPlayerId(0),
      actorPlayer: asPlayerId(0),
    };
    const result = describeAction(train, context);
    assert.ok(result.tooltipPayload !== undefined);

    const { synopsis } = result.tooltipPayload.ruleCard;
    assert.equal(synopsis, 'Train — Place forces and build support');
    assert.ok(result.tooltipPayload.ruleCard.steps.length > 0, 'Train must have steps');
  });

  it('FITL Sweep synopsis uses verbalized action label', () => {
    const { compiled } = FITL_PRODUCTION_FIXTURE;
    const def = compiled.gameDef!;
    const runtime = createGameDefRuntime(def);
    const { state } = initialState(def, 42);
    const sweep = def.actions.find((a) => a.id === 'sweep');
    assert.ok(sweep !== undefined, 'sweep action must exist');

    const context: AnnotationContext = {
      def, runtime, state,
      activePlayer: asPlayerId(0),
      actorPlayer: asPlayerId(0),
    };
    const result = describeAction(sweep, context);
    assert.ok(result.tooltipPayload !== undefined);

    const { synopsis } = result.tooltipPayload.ruleCard;
    assert.equal(synopsis, 'Sweep — Move forces and activate guerrillas');
    assert.ok(result.tooltipPayload.ruleCard.steps.length > 0, 'Sweep must have steps');
  });

  it('FITL Rally synopsis uses verbalized action label', () => {
    const { compiled } = FITL_PRODUCTION_FIXTURE;
    const def = compiled.gameDef!;
    const runtime = createGameDefRuntime(def);
    const { state } = initialState(def, 42);
    const rally = def.actions.find((a) => a.id === 'rally');
    assert.ok(rally !== undefined, 'rally action must exist');

    const context: AnnotationContext = {
      def, runtime, state,
      activePlayer: asPlayerId(0),
      actorPlayer: asPlayerId(0),
    };
    const result = describeAction(rally, context);
    assert.ok(result.tooltipPayload !== undefined);

    const { synopsis } = result.tooltipPayload.ruleCard;
    assert.equal(synopsis, 'Rally — Place forces and build bases');
    assert.ok(result.tooltipPayload.ruleCard.steps.length > 0, 'Rally must have steps');
  });

  it('FITL verbalization labels cover all major action IDs', () => {
    const { compiled } = FITL_PRODUCTION_FIXTURE;
    const def = compiled.gameDef!;
    assert.ok(def.verbalization !== undefined, 'FITL must have verbalization');

    const labels = def.verbalization!.labels;
    const expectedOps = ['train', 'patrol', 'sweep', 'assault', 'rally', 'march', 'attack', 'terror'];
    const expectedSA = ['advise', 'airLift', 'airStrike', 'govern', 'transport', 'raid', 'infiltrate', 'bombard', 'tax', 'subvert'];

    for (const id of [...expectedOps, ...expectedSA]) {
      assert.ok(
        labels[id] !== undefined,
        `verbalization labels must include action "${id}"`,
      );
    }
  });

  it('FITL verbalization labels cover all zone IDs', () => {
    const { compiled } = FITL_PRODUCTION_FIXTURE;
    const def = compiled.gameDef!;
    assert.ok(def.verbalization !== undefined);

    const labels = def.verbalization!.labels;
    // Sample key zones from the map
    const sampleZones = ['saigon:none', 'hue:none', 'da-nang:none', 'available-US:none', 'casualties-US:none'];
    for (const zoneId of sampleZones) {
      assert.ok(
        labels[zoneId] !== undefined,
        `verbalization labels must include zone "${zoneId}"`,
      );
    }
  });

  it('FITL suppress patterns exclude telemetry variables', () => {
    const { compiled } = FITL_PRODUCTION_FIXTURE;
    const def = compiled.gameDef!;
    assert.ok(def.verbalization !== undefined);

    const patterns = def.verbalization!.suppressPatterns;
    assert.ok(patterns.includes('*Count'), 'must suppress *Count');
    assert.ok(patterns.includes('*Tracker'), 'must suppress *Tracker');
    assert.ok(patterns.includes('__*'), 'must suppress __*');
    assert.ok(patterns.includes('mom_*'), 'must suppress mom_*');
    assert.ok(patterns.includes('fitl_*'), 'must suppress fitl_*');
  });

  it('FITL verbalization step text uses resolved labels not raw IDs', () => {
    const { compiled } = FITL_PRODUCTION_FIXTURE;
    const def = compiled.gameDef!;
    const runtime = createGameDefRuntime(def);
    const { state } = initialState(def, 42);
    const rally = def.actions.find((a) => a.id === 'rally');
    assert.ok(rally !== undefined);

    const context: AnnotationContext = {
      def, runtime, state,
      activePlayer: asPlayerId(0),
      actorPlayer: asPlayerId(0),
    };
    const result = describeAction(rally, context);
    assert.ok(result.tooltipPayload !== undefined);

    // Collect all step line texts
    const allText = result.tooltipPayload.ruleCard.steps
      .flatMap((s) => s.lines.map((l) => l.text))
      .join(' ');

    // Resource labels should be resolved — "NVA Resources" not "nvaResources"
    if (allText.includes('NVA')) {
      assert.ok(
        allText.includes('NVA Resources') || allText.includes('NVA Resource'),
        `step text should use "NVA Resources" not raw ID, got: "${allText}"`,
      );
    }
  });

  // -----------------------------------------------------------------------
  // Texas Hold'em production spec
  // -----------------------------------------------------------------------

  it('Texas Hold\'em describeAction produces tooltipPayload', () => {
    const { compiled } = TEXAS_PRODUCTION_FIXTURE;
    assert.ok(compiled.gameDef !== null, 'Texas GameDef must compile');
    const def = compiled.gameDef;
    assert.ok(def.actions.length > 0, 'Texas must have at least one action');

    const runtime = createGameDefRuntime(def);
    const { state } = initialState(def, 99);
    const action = def.actions[0]!;

    const context: AnnotationContext = {
      def,
      runtime,
      state,
      activePlayer: asPlayerId(0),
      actorPlayer: asPlayerId(0),
    };

    const result = describeAction(action, context);

    assert.ok(result.tooltipPayload !== undefined, 'tooltipPayload must be present');
    assert.equal(typeof result.tooltipPayload.ruleCard.synopsis, 'string');
    assert.equal(typeof result.tooltipPayload.ruleState.available, 'boolean');
  });

  // -----------------------------------------------------------------------
  // Texas Hold'em golden tests — verbalization produces readable English
  // -----------------------------------------------------------------------

  it('Texas Hold\'em Fold synopsis uses verbalized action label', () => {
    const { compiled } = TEXAS_PRODUCTION_FIXTURE;
    const def = compiled.gameDef!;
    const runtime = createGameDefRuntime(def);
    const { state } = initialState(def, 99);
    const fold = def.actions.find((a) => a.id === 'fold');
    assert.ok(fold !== undefined, 'fold action must exist');

    const context: AnnotationContext = {
      def, runtime, state,
      activePlayer: asPlayerId(0),
      actorPlayer: asPlayerId(0),
    };
    const result = describeAction(fold, context);
    assert.ok(result.tooltipPayload !== undefined);

    const { synopsis } = result.tooltipPayload.ruleCard;
    assert.equal(synopsis, 'Fold — Surrender hand and forfeit current bets');
  });

  it('Texas Hold\'em Check synopsis uses verbalized action label', () => {
    const { compiled } = TEXAS_PRODUCTION_FIXTURE;
    const def = compiled.gameDef!;
    const runtime = createGameDefRuntime(def);
    const { state } = initialState(def, 99);
    const check = def.actions.find((a) => a.id === 'check');
    assert.ok(check !== undefined, 'check action must exist');

    const context: AnnotationContext = {
      def, runtime, state,
      activePlayer: asPlayerId(0),
      actorPlayer: asPlayerId(0),
    };
    const result = describeAction(check, context);
    assert.ok(result.tooltipPayload !== undefined);

    const { synopsis } = result.tooltipPayload.ruleCard;
    assert.equal(synopsis, 'Check — Pass without adding chips to the pot');
  });

  it('Texas Hold\'em Call synopsis uses verbalized action label', () => {
    const { compiled } = TEXAS_PRODUCTION_FIXTURE;
    const def = compiled.gameDef!;
    const runtime = createGameDefRuntime(def);
    const { state } = initialState(def, 99);
    const call = def.actions.find((a) => a.id === 'call');
    assert.ok(call !== undefined, 'call action must exist');

    const context: AnnotationContext = {
      def, runtime, state,
      activePlayer: asPlayerId(0),
      actorPlayer: asPlayerId(0),
    };
    const result = describeAction(call, context);
    assert.ok(result.tooltipPayload !== undefined);

    const { synopsis } = result.tooltipPayload.ruleCard;
    assert.equal(synopsis, 'Call — Match the current bet to stay in the hand');
  });

  it('Texas Hold\'em Raise synopsis uses verbalized action label', () => {
    const { compiled } = TEXAS_PRODUCTION_FIXTURE;
    const def = compiled.gameDef!;
    const runtime = createGameDefRuntime(def);
    const { state } = initialState(def, 99);
    const raise = def.actions.find((a) => a.id === 'raise');
    assert.ok(raise !== undefined, 'raise action must exist');

    const context: AnnotationContext = {
      def, runtime, state,
      activePlayer: asPlayerId(0),
      actorPlayer: asPlayerId(0),
    };
    const result = describeAction(raise, context);
    assert.ok(result.tooltipPayload !== undefined);

    const { synopsis } = result.tooltipPayload.ruleCard;
    assert.equal(synopsis, 'Raise — Increase the current bet');
  });

  it('Texas Hold\'em verbalization labels cover all action IDs', () => {
    const { compiled } = TEXAS_PRODUCTION_FIXTURE;
    const def = compiled.gameDef!;
    assert.ok(def.verbalization !== undefined, 'Texas must have verbalization');

    const labels = def.verbalization!.labels;
    const expectedActions = ['fold', 'check', 'call', 'raise', 'allIn'];

    for (const id of expectedActions) {
      assert.ok(
        labels[id] !== undefined,
        `verbalization labels must include action "${id}"`,
      );
    }
  });

  it('Texas Hold\'em suppress patterns exclude telemetry variables', () => {
    const { compiled } = TEXAS_PRODUCTION_FIXTURE;
    const def = compiled.gameDef!;
    assert.ok(def.verbalization !== undefined);

    const patterns = def.verbalization!.suppressPatterns;
    assert.ok(patterns.includes('*Count'), 'must suppress *Count');
    assert.ok(patterns.includes('*Tracker'), 'must suppress *Tracker');
    assert.ok(patterns.includes('__*'), 'must suppress __*');
    assert.ok(patterns.includes('actingPosition'), 'must suppress actingPosition');
    assert.ok(patterns.includes('bettingClosed'), 'must suppress bettingClosed');
    assert.ok(patterns.includes('seatIndex'), 'must suppress seatIndex');
  });

  // -----------------------------------------------------------------------
  // Cross-game: structuredClone safety
  // -----------------------------------------------------------------------

  it('tooltipPayload survives structuredClone (worker transfer)', () => {
    const { compiled } = FITL_PRODUCTION_FIXTURE;
    const def = compiled.gameDef!;
    const runtime = createGameDefRuntime(def);
    const { state } = initialState(def, 42);
    const action = def.actions[0]!;

    const context: AnnotationContext = {
      def,
      runtime,
      state,
      activePlayer: asPlayerId(0),
      actorPlayer: asPlayerId(0),
    };

    const result = describeAction(action, context);
    assert.ok(result.tooltipPayload !== undefined);

    const cloned = structuredClone(result);
    assert.deepEqual(cloned.tooltipPayload!.ruleCard, result.tooltipPayload.ruleCard);
    assert.deepEqual(cloned.tooltipPayload!.ruleState, result.tooltipPayload.ruleState);
  });
});
