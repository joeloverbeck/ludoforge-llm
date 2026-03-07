import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  asPlayerId,
  asTokenId,
  initialState,
  legalMoves,
  pickDeterministicChoiceValue,
  resolveMoveDecisionSequence,
  type GameDef,
  type GameState,
  type MoveParamValue,
  type Token,
} from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const makeToken = (
  id: string,
  type: string,
  faction: string,
  extraProps?: Readonly<Record<string, unknown>>,
): Token => ({
  id: asTokenId(id),
  type,
  props: { faction, type, ...(extraProps ?? {}) },
});

const compileDef = (): GameDef => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assert.notEqual(compiled.gameDef, null);
  return compiled.gameDef!;
};

const findChouEnLaiMove = (def: GameDef, state: GameState, side: 'unshaded' | 'shaded') =>
  legalMoves(def, state).find(
    (move) =>
      String(move.actionId) === 'event'
      && move.params.side === side
      && (move.params.eventCardId === undefined || move.params.eventCardId === 'card-42'),
  );

const setupState = (def: GameDef, seed: number, zones: Readonly<Record<string, readonly Token[]>>, vars?: Record<string, number>): GameState => {
  const base = clearAllZones(initialState(def, seed, 4).state);
  return {
    ...base,
    activePlayer: asPlayerId(2),
    turnOrderState: { type: 'roundRobin' },
    globalVars: {
      ...base.globalVars,
      ...(vars ?? {}),
    },
    zones: {
      ...base.zones,
      'played:none': [makeToken('card-42', 'card', 'none')],
      ...zones,
    },
  };
};

const countNVATroopsOnMap = (state: GameState): number =>
  Object.entries(state.zones)
    .filter(([zone]) => !zone.startsWith('available-') && !zone.startsWith('casualties-') && !zone.startsWith('out-of-play-'))
    .flatMap(([, tokens]) => tokens)
    .filter((token) => token.props.faction === 'NVA' && token.type === 'troops').length;

describe('FITL card-42 Chou En Lai', () => {
  it('unshaded always applies NVA -10 resources (clamped) and requires NVA-selected troop removal up to die roll', () => {
    const def = compileDef();
    const setup = setupState(
      def,
      4201,
      {
        'hue:none': [
          makeToken('nva-troop-1', 'troops', 'NVA'),
          makeToken('nva-base-1', 'base', 'NVA', { tunnel: 'untunneled' }),
        ],
      },
      { nvaResources: 7 },
    );

    const move = findChouEnLaiMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Expected card-42 unshaded event move');

    const resolved = resolveMoveDecisionSequence(def, setup, move!, {
      choose: (request): MoveParamValue | undefined => {
        if (request.type === 'chooseN') {
          const required = Math.max(1, request.min ?? 0);
          if (request.options.length < required) {
            return undefined;
          }
          return request.options.slice(0, required).map((option) => option.value as string | number | boolean);
        }
        return pickDeterministicChoiceValue(request);
      },
    });
    assert.equal(resolved.complete, true, 'Expected discovery-driven decision resolution for card-42 unshaded');

    const after = applyMove(def, setup, resolved.move).state;
    assert.equal(after.globalVars.nvaResources, 0, 'Unshaded should subtract 10 NVA resources with floor at 0');
    assert.equal(countNVATroopsOnMap(after), 0, 'Single NVA troop on map should be removed');
    assert.equal(
      (after.zones['hue:none'] ?? []).some((token) => token.id === asTokenId('nva-base-1')),
      true,
      'Unshaded should not remove non-troop NVA pieces',
    );
  });

  it('unshaded remains legal with no NVA troops on map and still applies resource penalty', () => {
    const def = compileDef();
    const setup = setupState(def, 4202, {}, { nvaResources: 12 });
    const move = findChouEnLaiMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Expected card-42 unshaded event move');

    const after = applyMove(def, setup, move!).state;
    assert.equal(after.globalVars.nvaResources, 2, 'Unshaded should still subtract resources when no troop-removal choices exist');
    assert.equal(countNVATroopsOnMap(after), 0);
  });

  it('shaded adds +10 NVA resources and VC gains trail-value resources with track clamping', () => {
    const def = compileDef();
    const setup = setupState(def, 4203, {}, { nvaResources: 70, vcResources: 72, trail: 6 });
    const move = findChouEnLaiMove(def, setup, 'shaded');
    assert.notEqual(move, undefined, 'Expected card-42 shaded event move');

    const after = applyMove(def, setup, move!).state;
    assert.equal(after.globalVars.nvaResources, 75, 'Shaded NVA +10 should clamp at 75');
    assert.equal(after.globalVars.vcResources, 75, 'Shaded VC +trail should clamp at 75');
    assert.equal(after.globalVars.trail, 6, 'Shaded should read trail value without modifying trail');
  });
});
