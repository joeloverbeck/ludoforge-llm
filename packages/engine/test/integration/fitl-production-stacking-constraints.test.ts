import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyEffect,
  asPlayerId,
  asTokenId,
  buildAdjacencyGraph,
  createCollector,
  createRng,
  isEffectErrorCode,
  type EffectContext,
  type GameDef,
  type GameState,
  type Token,
} from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { makeIsolatedInitialState } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const makeToken = (id: string, type: string, faction: string): Token => ({
  id: asTokenId(id),
  type,
  props: { faction },
});

describe('FITL production stacking constraints', () => {
  it('projects map-level stacking constraints into the compiled GameDef', () => {
    const { parsed, validatorDiagnostics, compiled } = compileProductionSpec();
    assertNoErrors(parsed);
    assert.deepEqual(
      validatorDiagnostics.filter((diag) => diag.code === 'STACKING_CONSTRAINT_VIOLATION'),
      [],
    );
    assertNoErrors(compiled);
    assert.notEqual(compiled.gameDef, null);

    const constraintIds = (compiled.gameDef?.stackingConstraints ?? []).map((constraint) => constraint.id);
    assert.deepEqual(constraintIds, [
      'max-2-bases-per-space',
      'no-bases-on-locs',
      'north-vietnam-insurgent-only',
    ]);
  });

  describe('runtime enforcement from compiled production constraints', () => {
    const makeCtx = (state: GameState, def: GameDef): EffectContext => ({
      def,
      state,
      rng: createRng(42n),
      activePlayer: asPlayerId(0),
      actorPlayer: asPlayerId(0),
      bindings: {},
      moveParams: {},
      collector: createCollector(),
      adjacencyGraph: buildAdjacencyGraph(def.zones),
    });

    it('rejects a 3rd base in a city/province', () => {
      const { parsed, compiled } = compileProductionSpec();
      assertNoErrors(parsed);
      assertNoErrors(compiled);
      const def = compiled.gameDef!;

      const baseState = makeIsolatedInitialState(def, 77, 4);
      const cityZone = 'hue:none';
      const fromZone = 'available-US:none';

      const state: GameState = {
        ...baseState,
        zones: {
          ...baseState.zones,
          [cityZone]: [
            makeToken('base_1', 'us-bases', 'US'),
            makeToken('base_2', 'arvn-bases', 'ARVN'),
          ],
          [fromZone]: [makeToken('base_3', 'us-bases', 'US')],
        },
      };

      const ctx = makeCtx(state, def);

      assert.throws(
        () =>
          applyEffect(
            { moveToken: { token: '$token', from: fromZone, to: cityZone } },
            { ...ctx, bindings: { $token: 'base_3' } },
          ),
        (error: unknown) => isEffectErrorCode(error, 'STACKING_VIOLATION'),
      );
    });

    it('rejects placing a base on a LoC', () => {
      const { parsed, compiled } = compileProductionSpec();
      assertNoErrors(parsed);
      assertNoErrors(compiled);
      const def = compiled.gameDef!;

      const state = makeIsolatedInitialState(def, 91, 4);
      const locZone = 'loc-hue-da-nang:none';
      const ctx = makeCtx(state, def);

      assert.throws(
        () => applyEffect({ createToken: { type: 'us-bases', zone: locZone, props: { faction: 'US' } } }, ctx),
        (error: unknown) => isEffectErrorCode(error, 'STACKING_VIOLATION'),
      );
    });

    it('rejects US/ARVN forces in North Vietnam and allows NVA/VC', () => {
      const { parsed, compiled } = compileProductionSpec();
      assertNoErrors(parsed);
      assertNoErrors(compiled);
      const def = compiled.gameDef!;

      const baseState = makeIsolatedInitialState(def, 111, 4);
      const northVietnamZone = 'north-vietnam:none';
      const state: GameState = {
        ...baseState,
        zones: {
          ...baseState.zones,
          'available-US:none': [makeToken('us_troops_1', 'us-troops', 'US')],
          'available-NVA:none': [makeToken('nva_troops_1', 'nva-troops', 'NVA')],
        },
      };

      const blockedCtx = makeCtx(state, def);
      assert.throws(
        () =>
          applyEffect(
            { moveToken: { token: '$token', from: 'available-US:none', to: northVietnamZone } },
            { ...blockedCtx, bindings: { $token: 'us_troops_1' } },
          ),
        (error: unknown) => isEffectErrorCode(error, 'STACKING_VIOLATION'),
      );

      const allowedCtx = makeCtx(state, def);
      const result = applyEffect(
        { moveToken: { token: '$token', from: 'available-NVA:none', to: northVietnamZone } },
        { ...allowedCtx, bindings: { $token: 'nva_troops_1' } },
      );
      assert.equal(result.state.zones[northVietnamZone]?.some((token) => token.id === asTokenId('nva_troops_1')), true);
    });
  });
});
