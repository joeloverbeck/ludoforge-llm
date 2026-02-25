import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asPhaseId,
  asPlayerId,
  asTokenId,
  initialState,
  initializeTurnFlowEligibilityState,
  legalMoves,
  type GameDef,
  type GameState,
  type Token,
} from '../../src/kernel/index.js';
import { applyMoveWithResolvedDecisionIds } from '../helpers/decision-param-helpers.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const makeToken = (id: string, type: string, faction: string): Token => ({
  id: asTokenId(id),
  type,
  props: { faction, type },
});

const compileDef = (): GameDef => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assert.notEqual(compiled.gameDef, null);
  return compiled.gameDef!;
};

const countTokens = (state: GameState, zoneId: string, faction: string, type: string): number =>
  (state.zones[zoneId] ?? []).filter((token) => token.props.faction === faction && token.props.type === type).length;

const makeCoupState = (def: GameDef, seed: number, zoneOverrides: Record<string, Token[]>): GameState => {
  const base = initialState(def, seed, 4).state;
  const cleared: GameState = {
    ...base,
    zones: Object.fromEntries(Object.keys(base.zones).map((zoneId) => [zoneId, []])),
  };
  const withTurnFlow = initializeTurnFlowEligibilityState(def, cleared);
  return {
    ...withTurnFlow,
    currentPhase: asPhaseId('coupCommitment'),
    activePlayer: asPlayerId(0),
    zones: {
      ...withTurnFlow.zones,
      ...zoneOverrides,
    },
  };
};

describe('FITL coup commitment phase production wiring', () => {
  it('exposes coupCommitmentResolve and applies Rule 6.5 casualty routing in coupCommitment phase', () => {
    const def = compileDef();
    const setup = makeCoupState(def, 7501, {
      'casualties-US:none': [
        makeToken('us-cas-t-1', 'troops', 'US'),
        makeToken('us-cas-t-2', 'troops', 'US'),
        makeToken('us-cas-t-3', 'troops', 'US'),
        makeToken('us-cas-t-4', 'troops', 'US'),
        makeToken('us-cas-t-5', 'troops', 'US'),
        makeToken('us-cas-t-6', 'troops', 'US'),
        makeToken('us-cas-t-7', 'troops', 'US'),
        makeToken('us-cas-b-1', 'base', 'US'),
        makeToken('us-cas-b-2', 'base', 'US'),
        makeToken('us-cas-i-1', 'irregular', 'US'),
      ],
    });

    const outOfPlayTroopsBefore = countTokens(setup, 'out-of-play-US:none', 'US', 'troops');
    const outOfPlayBasesBefore = countTokens(setup, 'out-of-play-US:none', 'US', 'base');
    const availableTroopsBefore = countTokens(setup, 'available-US:none', 'US', 'troops');
    const availableIrregularBefore = countTokens(setup, 'available-US:none', 'US', 'irregular');

    const resolveMove = legalMoves(def, setup).find((move) => String(move.actionId) === 'coupCommitmentResolve');
    assert.notEqual(resolveMove, undefined, 'Expected coupCommitmentResolve in coupCommitment phase');

    const result = applyMoveWithResolvedDecisionIds(def, setup, resolveMove!).state;

    assert.equal(
      countTokens(result, 'out-of-play-US:none', 'US', 'troops') - outOfPlayTroopsBefore,
      2,
      'Expected floor(7/3)=2 US troop casualties moved out of play',
    );
    assert.equal(
      countTokens(result, 'out-of-play-US:none', 'US', 'base') - outOfPlayBasesBefore,
      2,
      'Expected all US base casualties moved out of play',
    );
    assert.equal(
      countTokens(result, 'available-US:none', 'US', 'troops') - availableTroopsBefore,
      5,
      'Expected remaining US troop casualties moved to Available',
    );
    assert.equal(
      countTokens(result, 'available-US:none', 'US', 'irregular') - availableIrregularBefore,
      1,
      'Expected non-base US casualties moved to Available',
    );
    assert.equal(result.zones['casualties-US:none']?.length ?? 0, 0, 'Expected casualties-US to be emptied');
  });

  it('enforces up-to-10 troops and up-to-2 bases moved from available in a single commitment resolution', () => {
    const def = compileDef();
    const availableTroops = Array.from({ length: 12 }, (_unused, index) => makeToken(`us-av-t-${index + 1}`, 'troops', 'US'));
    const availableBases = Array.from({ length: 4 }, (_unused, index) => makeToken(`us-av-b-${index + 1}`, 'base', 'US'));

    const setup = makeCoupState(def, 7502, {
      'casualties-US:none': [],
      'available-US:none': [...availableTroops, ...availableBases],
    });

    const availableTroopsBefore = countTokens(setup, 'available-US:none', 'US', 'troops');
    const availableBasesBefore = countTokens(setup, 'available-US:none', 'US', 'base');
    const saigonTroopsBefore = countTokens(setup, 'saigon:none', 'US', 'troops');
    const saigonBasesBefore = countTokens(setup, 'saigon:none', 'US', 'base');

    const resolveMove = legalMoves(def, setup).find((move) => String(move.actionId) === 'coupCommitmentResolve');
    assert.notEqual(resolveMove, undefined, 'Expected coupCommitmentResolve in coupCommitment phase');

    const result = applyMoveWithResolvedDecisionIds(def, setup, resolveMove!, {
      overrides: [
        {
          when: (request) => /commitTroopsFromAvailable/.test(request.name),
          value: (request) =>
            request.options
              .slice(0, request.max ?? request.options.length)
              .map((option) => option.value as string),
        },
        {
          when: (request) => /commitBasesFromAvailable/.test(request.name),
          value: (request) =>
            request.options
              .slice(0, request.max ?? request.options.length)
              .map((option) => option.value as string),
        },
        {
          when: (request) => /commitTroopDestFromAvailable|commitBaseDestFromAvailable/.test(request.name),
          value: 'saigon:none',
        },
      ],
    }).state;

    assert.equal(
      availableTroopsBefore - countTokens(result, 'available-US:none', 'US', 'troops'),
      10,
      'Expected troop commitment to cap at 10 pieces',
    );
    assert.equal(
      availableBasesBefore - countTokens(result, 'available-US:none', 'US', 'base'),
      2,
      'Expected base commitment to cap at 2 pieces',
    );
    assert.equal(
      countTokens(result, 'saigon:none', 'US', 'troops') - saigonTroopsBefore,
      10,
      'Expected 10 committed troops to move into Saigon under forced destination selection',
    );
    assert.equal(
      countTokens(result, 'saigon:none', 'US', 'base') - saigonBasesBefore,
      2,
      'Expected 2 committed bases to move into Saigon under forced destination selection',
    );
  });

  it('rejects invalid commitment destinations outside Rule 6.5 legal destination set', () => {
    const def = compileDef();
    const setup = makeCoupState(def, 7503, {
      'casualties-US:none': [],
      'available-US:none': [makeToken('us-av-t-illegal', 'troops', 'US')],
    });

    const resolveMove = legalMoves(def, setup).find((move) => String(move.actionId) === 'coupCommitmentResolve');
    assert.notEqual(resolveMove, undefined, 'Expected coupCommitmentResolve in coupCommitment phase');

    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, setup, resolveMove!, {
          overrides: [
            {
              when: (request) => /commitTroopsFromAvailable/.test(request.name),
              value: (request) => request.options.slice(0, 1).map((option) => option.value as string),
            },
            { when: (request) => /commitTroopDestFromAvailable/.test(request.name), value: 'casualties-US:none' },
          ],
        }),
      /invalid selection for chooseOne|EFFECT_RUNTIME/,
      'Expected illegal destination override to be rejected by chooseOne option validation',
    );
  });
});
