// @test-class: golden-trace
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertValidatedGameDef } from '../../src/kernel/index.js';
import type { VerbalizationDef } from '../../src/kernel/verbalization-types.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

// ---------------------------------------------------------------------------
// Compilation
// ---------------------------------------------------------------------------

const compileFitlVerbalization = (): VerbalizationDef => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assertNoErrors(compiled);
  if (compiled.gameDef === null) {
    throw new Error('Expected compiled FITL gameDef to be present');
  }
  const def = assertValidatedGameDef(compiled.gameDef);
  if (def.verbalization === undefined) {
    throw new Error('Expected FITL gameDef to have verbalization');
  }
  return def.verbalization;
};

// ---------------------------------------------------------------------------
// Golden tests: verbalization data completeness
// ---------------------------------------------------------------------------

describe('FITL verbalization golden tests', () => {
  const ALL_US_OPERATION_PROFILES = [
    'train-us-profile',
    'patrol-us-profile',
    'sweep-us-profile',
    'assault-us-profile',
  ] as const;

  const ALL_US_SPECIAL_ACTIVITY_PROFILES = [
    'advise-profile',
    'air-lift-profile',
    'air-strike-profile',
  ] as const;

  const EXPECTED_STAGE_IDS: Readonly<Record<string, readonly string[]>> = {
    'train-us-profile': ['select-spaces', 'resolve-per-space', 'cap-caps-bonus-police', 'sub-action'],
    'patrol-us-profile': ['select-locs', 'move-cubes', 'activate-guerrillas', 'free-assault', 'cap-m48-patrol-penalty'],
    'sweep-us-profile': ['select-spaces', 'move-troops', 'activate-guerrillas', 'cap-cobras-bonus-removal', 'cap-booby-traps-troop-cost'],
    'assault-us-profile': ['select-spaces', 'abrams-select-space', 'resolve-per-space', 'cap-m48-patton-bonus-removal', 'arvn-followup'],
    'advise-profile': ['select-spaces', 'resolve-per-space'],
    'air-lift-profile': ['select-spaces', 'move-us-troops', 'move-coin-lift-pieces', 'air-lift-telemetry'],
    'air-strike-profile': ['select-spaces', 'remove-active-enemy-pieces', 'optional-trail-degrade'],
  };

  const ALL_CAPABILITY_MARKERS = [
    'cap_topGun', 'cap_arcLight', 'cap_abrams', 'cap_cobras',
    'cap_m48Patton', 'cap_caps', 'cap_cords', 'cap_lgbs',
    'cap_searchAndDestroy', 'cap_aaa', 'cap_longRangeGuns', 'cap_migs',
    'cap_sa2s', 'cap_pt76', 'cap_armoredCavalry', 'cap_mandateOfHeaven',
    'cap_boobyTraps', 'cap_mainForceBns', 'cap_cadres',
  ] as const;

  describe('stageDescriptions', () => {
    it('contains all US operation profiles', () => {
      const verb = compileFitlVerbalization();
      const sd = verb.stageDescriptions;

      for (const profileId of ALL_US_OPERATION_PROFILES) {
        assert.ok(
          sd[profileId] !== undefined,
          `stageDescriptions must contain profile "${profileId}"`,
        );
      }
    });

    it('contains all US special activity profiles', () => {
      const verb = compileFitlVerbalization();
      const sd = verb.stageDescriptions;

      for (const profileId of ALL_US_SPECIAL_ACTIVITY_PROFILES) {
        assert.ok(
          sd[profileId] !== undefined,
          `stageDescriptions must contain profile "${profileId}"`,
        );
      }
    });

    it('maps correct stage IDs for each profile', () => {
      const verb = compileFitlVerbalization();
      const sd = verb.stageDescriptions;

      for (const [profileId, expectedStages] of Object.entries(EXPECTED_STAGE_IDS)) {
        const profileDescs = sd[profileId];
        assert.ok(profileDescs !== undefined, `Missing profile "${profileId}"`);

        for (const stageId of expectedStages) {
          assert.ok(
            profileDescs[stageId] !== undefined,
            `Profile "${profileId}" must have stage "${stageId}"`,
          );

          const entry = profileDescs[stageId]!;
          assert.ok(
            typeof entry.label === 'string' && entry.label.length > 0,
            `Stage "${profileId}.${stageId}" must have a non-empty label`,
          );
        }
      }
    });

    it('train-us-profile stage labels resolve to human text', () => {
      const verb = compileFitlVerbalization();
      const trainDescs = verb.stageDescriptions['train-us-profile']!;

      assert.equal(trainDescs['select-spaces']!.label, 'Select training spaces');
      assert.equal(trainDescs['resolve-per-space']!.label, 'Resolve training');
      assert.equal(trainDescs['sub-action']!.label, 'Pacification');
    });

    it('patrol-us-profile stage labels resolve to human text', () => {
      const verb = compileFitlVerbalization();
      const patrolDescs = verb.stageDescriptions['patrol-us-profile']!;

      assert.equal(patrolDescs['select-locs']!.label, 'Select patrol routes');
      assert.equal(patrolDescs['move-cubes']!.label, 'Move cubes');
      assert.equal(patrolDescs['activate-guerrillas']!.label, 'Activate guerrillas');
    });
  });

  describe('modifierEffects', () => {
    it('contains all 19 capability markers', () => {
      const verb = compileFitlVerbalization();
      const me = verb.modifierEffects;

      for (const cap of ALL_CAPABILITY_MARKERS) {
        assert.ok(
          me[cap] !== undefined,
          `modifierEffects must contain capability "${cap}"`,
        );

        const entries = me[cap]!;
        assert.ok(
          entries.length > 0,
          `Capability "${cap}" must have at least one modifier effect entry`,
        );

        for (const entry of entries) {
          assert.ok(
            typeof entry.condition === 'string' && entry.condition.length > 0,
            `Capability "${cap}" entry must have a non-empty condition`,
          );
          assert.ok(
            typeof entry.effect === 'string' && entry.effect.length > 0,
            `Capability "${cap}" entry must have a non-empty effect`,
          );
        }
      }
    });

    it('M48 Patton has shaded and unshaded variants', () => {
      const verb = compileFitlVerbalization();
      const m48 = verb.modifierEffects['cap_m48Patton']!;

      assert.equal(m48.length, 2);
      assert.ok(m48.some(e => e.condition.includes('Unshaded')));
      assert.ok(m48.some(e => e.condition.includes('Shaded')));
    });

    it('Abrams has correct effect text', () => {
      const verb = compileFitlVerbalization();
      const abrams = verb.modifierEffects['cap_abrams']!;

      const unshaded = abrams.find(e => e.condition.includes('Unshaded'));
      assert.ok(unshaded !== undefined);
      assert.ok(unshaded.effect.includes('Assault space'));
    });
  });

  describe('suppressPatterns', () => {
    it('includes $__macro_* pattern', () => {
      const verb = compileFitlVerbalization();
      assert.ok(
        verb.suppressPatterns.includes('$__macro_*'),
        'suppressPatterns must include "$__macro_*"',
      );
    });

    it('preserves existing patterns', () => {
      const verb = compileFitlVerbalization();
      const sp = verb.suppressPatterns;

      assert.ok(sp.includes('*Count'));
      assert.ok(sp.includes('__*'));
      assert.ok(sp.includes('mom_*'));
      assert.ok(sp.includes('fitl_*'));
    });
  });
});
