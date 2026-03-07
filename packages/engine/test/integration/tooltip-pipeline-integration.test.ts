import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileProductionSpec, compileTexasProductionSpec } from '../helpers/production-spec-helpers.js';
import { createGameDefRuntime } from '../../src/kernel/gamedef-runtime.js';
import { initialState } from '../../src/kernel/initial-state.js';
import { describeAction } from '../../src/kernel/condition-annotator.js';
import type { AnnotationContext } from '../../src/kernel/condition-annotator.js';
import { asPlayerId } from '../../src/kernel/branded.js';

describe('tooltip pipeline integration', () => {
  // -----------------------------------------------------------------------
  // FITL production spec
  // -----------------------------------------------------------------------

  it('FITL describeAction produces tooltipPayload for a real action', () => {
    const { compiled } = compileProductionSpec();
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
    const { compiled } = compileProductionSpec();
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
    const { compiled } = compileProductionSpec();
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
  // Texas Hold'em production spec
  // -----------------------------------------------------------------------

  it('Texas Hold\'em describeAction produces tooltipPayload', () => {
    const { compiled } = compileTexasProductionSpec();
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
  // Cross-game: structuredClone safety
  // -----------------------------------------------------------------------

  it('tooltipPayload survives structuredClone (worker transfer)', () => {
    const { compiled } = compileProductionSpec();
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
