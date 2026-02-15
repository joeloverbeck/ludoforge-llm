import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  asPlayerId,
  asTokenId,
  initialState,
  legalMoves,
  type GameDef,
  type GameState,
  type Token,
} from '../../src/kernel/index.js';
import { applyMoveWithResolvedDecisionIds } from '../helpers/decision-param-helpers.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
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

describe('FITL commitment phase production wiring', () => {
  it('declares commitment in turnStructure and wires card-73 to request and advance to it', () => {
    const { parsed, compiled } = compileProductionSpec();
    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const phaseIds = compiled.gameDef?.turnStructure.phases.map((phase) => phase.id);
    assert.deepEqual(phaseIds, ['main', 'commitment']);

    const card73 = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-73');
    assert.notEqual(card73, undefined);
    assert.deepEqual(card73?.unshaded?.effects, [
      { setVar: { scope: 'global', var: 'commitmentPhaseRequested', value: true } },
      { pushInterruptPhase: { phase: 'commitment', resumePhase: 'main' } },
    ]);
  });

  it('executes card-73 unshaded by running commitment casualty transfer', () => {
    const def = compileDef();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined, 'Expected at least one event deck');

    const baseState = clearAllZones(initialState(def, 7301, 2));
    const setup: GameState = {
      ...baseState,
      activePlayer: asPlayerId(0),
      zones: {
        ...baseState.zones,
        [eventDeck!.discardZone]: [makeToken('card-73', 'card', 'none')],
        'casualties-US:none': [
          makeToken('us-cas-t-1', 'troops', 'US'),
          makeToken('us-cas-t-2', 'troops', 'US'),
          makeToken('us-cas-t-3', 'troops', 'US'),
          makeToken('us-cas-t-4', 'troops', 'US'),
          makeToken('us-cas-t-5', 'troops', 'US'),
          makeToken('us-cas-b-1', 'base', 'US'),
          makeToken('us-cas-b-2', 'base', 'US'),
          makeToken('us-cas-i-1', 'irregular', 'US'),
        ],
      },
    };

    const eventMoves = legalMoves(def, setup).filter((move) => String(move.actionId) === 'event');
    const unshadedMove = eventMoves.find((move) => move.params.side === 'unshaded');
    assert.notEqual(unshadedMove, undefined, 'Expected unshaded card-73 event move');

    const result = applyMove(def, setup, unshadedMove!).state;

    assert.equal(result.currentPhase, 'commitment', 'Expected card-73 to advance into commitment phase');

    const commitmentMove = legalMoves(def, result).find((move) => String(move.actionId) === 'resolveCommitment');
    assert.notEqual(commitmentMove, undefined, 'Expected resolveCommitment move in commitment phase');

    const defWithoutTurnOrder = { ...def, turnOrder: undefined } as unknown as GameDef;
    const commitmentApplied = applyMoveWithResolvedDecisionIds(defWithoutTurnOrder, result, commitmentMove!).state;

    assert.equal(countTokens(commitmentApplied, 'out-of-play-US:none', 'US', 'troops'), 1, 'Expected floor(5/3) US troops out of play');
    assert.equal(countTokens(commitmentApplied, 'out-of-play-US:none', 'US', 'base'), 2, 'Expected all US base casualties out of play');
    assert.equal(countTokens(commitmentApplied, 'available-US:none', 'US', 'troops'), 4, 'Expected remaining US troop casualties in Available');
    assert.equal(countTokens(commitmentApplied, 'available-US:none', 'US', 'irregular'), 1, 'Expected non-base US casualties in Available');
    assert.equal(commitmentApplied.zones['casualties-US:none']?.length ?? 0, 0, 'Expected casualties-US to be emptied');
    assert.equal(commitmentApplied.globalVars.commitmentPhaseRequested, false, 'Expected commitment request flag reset');
    assert.equal(commitmentApplied.currentPhase, 'main', 'Expected to return to main phase after resolveCommitment');
  });
});
