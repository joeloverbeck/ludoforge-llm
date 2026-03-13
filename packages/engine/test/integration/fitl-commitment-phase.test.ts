import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asActionId,
  applyMove,
  asPlayerId,
  asPhaseId,
  asTokenId,
  createRng,
  initialState,
  legalChoicesDiscover,
  legalChoicesEvaluate,
  legalMoves,
  resolveMoveDecisionSequence,
  type GameDef,
  type GameState,
  type Move,
  type Token,
} from '../../src/kernel/index.js';
import { completeTemplateMove } from '../../src/kernel/move-completion.js';
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

const completeIfPending = (
  def: GameDef,
  state: GameState,
  move: Move,
  seed: bigint,
): Move => {
  const probe = legalChoicesEvaluate(def, state, move);
  if (probe.kind === 'complete') {
    return move;
  }
  assert.equal(probe.kind, 'pending', 'Expected event move to be complete or pending');
  const completed = completeTemplateMove(def, state, move, createRng(seed));
  assert.equal(completed.kind, 'completed', 'Expected pending event template to be completable');
  if (completed.kind !== 'completed') throw new Error('unreachable');
  return completed.move;
};

describe('FITL commitment phase production wiring', () => {
  it('declares commitment in turnStructure and wires card-73 to request and advance to it', () => {
    const { parsed, compiled } = compileProductionSpec();
    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const phaseIds = compiled.gameDef?.turnStructure.phases.map((phase) => phase.id);
    const interruptIds = compiled.gameDef?.turnStructure.interrupts?.map((phase) => phase.id) ?? [];
    assert.deepEqual(phaseIds, [
      'main',
      'coupVictory',
      'coupResources',
      'coupSupport',
      'coupRedeploy',
      'coupCommitment',
      'coupReset',
    ]);
    assert.deepEqual(interruptIds, ['commitment', 'honoluluPacify']);

    const card73 = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-73');
    assert.notEqual(card73, undefined);
    assert.deepEqual(card73?.unshaded?.effects, [
      { pushInterruptPhase: { phase: 'commitment', resumePhase: 'main' } },
    ]);
  });

  it('executes card-73 unshaded by running commitment casualty transfer', () => {
    const def = compileDef();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined, 'Expected at least one event deck');

    const baseState = initialState(def, 7301, 4).state;
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

    const outOfPlayTroopsBefore = countTokens(setup, 'out-of-play-US:none', 'US', 'troops');
    const outOfPlayBasesBefore = countTokens(setup, 'out-of-play-US:none', 'US', 'base');
    const availableTroopsBefore = countTokens(setup, 'available-US:none', 'US', 'troops');
    const availableIrregularBefore = countTokens(setup, 'available-US:none', 'US', 'irregular');

    const eventMoves = legalMoves(def, setup).filter((move) => String(move.actionId) === 'event');
    const unshadedMove = eventMoves.find((move) => move.params.side === 'unshaded');
    assert.notEqual(unshadedMove, undefined, 'Expected unshaded card-73 event move');

    const result = applyMove(def, setup, completeIfPending(def, setup, unshadedMove!, 7301n)).state;

    assert.equal(result.currentPhase, 'commitment', 'Expected card-73 to advance into commitment phase');

    const commitmentMove = legalMoves(def, result).find((move) => String(move.actionId) === 'resolveCommitment');
    assert.notEqual(commitmentMove, undefined, 'Expected resolveCommitment move in commitment phase');

    const commitmentApplied = applyMoveWithResolvedDecisionIds(
      def,
      { ...result, turnOrderState: setup.turnOrderState },
      commitmentMove!,
    ).state;

    assert.equal(
      countTokens(commitmentApplied, 'out-of-play-US:none', 'US', 'troops') - outOfPlayTroopsBefore,
      1,
      'Expected floor(5/3) US troop casualties moved out of play',
    );
    assert.equal(
      countTokens(commitmentApplied, 'out-of-play-US:none', 'US', 'base') - outOfPlayBasesBefore,
      2,
      'Expected all US base casualties moved out of play',
    );
    assert.equal(
      countTokens(commitmentApplied, 'available-US:none', 'US', 'troops') - availableTroopsBefore,
      4,
      'Expected remaining US troop casualties moved to Available',
    );
    assert.equal(
      countTokens(commitmentApplied, 'available-US:none', 'US', 'irregular') - availableIrregularBefore,
      1,
      'Expected non-base US casualties moved to Available',
    );
    assert.equal(commitmentApplied.zones['casualties-US:none']?.length ?? 0, 0, 'Expected casualties-US to be emptied');
    assert.equal(commitmentApplied.currentPhase, 'main', 'Expected to return to main phase after resolveCommitment');
  });

  it('applies Medevac unshaded during commitment: no US troop casualties go out of play and effect persists through Coup', () => {
    const def = compileDef();
    const baseState = clearAllZones(initialState(def, 7310, 4).state);
    const setup: GameState = {
      ...baseState,
      currentPhase: asPhaseId('commitment'),
      activePlayer: asPlayerId(0),
      interruptPhaseStack: [{ phase: asPhaseId('commitment'), resumePhase: asPhaseId('main') }],
      globalVars: {
        ...baseState.globalVars,
        mom_medevacUnshaded: true,
      },
      zones: {
        ...baseState.zones,
        'casualties-US:none': [
          makeToken('med-cas-t-1', 'troops', 'US'),
          makeToken('med-cas-t-2', 'troops', 'US'),
          makeToken('med-cas-t-3', 'troops', 'US'),
          makeToken('med-cas-t-4', 'troops', 'US'),
          makeToken('med-cas-t-5', 'troops', 'US'),
          makeToken('med-cas-b-1', 'base', 'US'),
          makeToken('med-cas-i-1', 'irregular', 'US'),
        ],
      },
    };

    const outOfPlayTroopsBefore = countTokens(setup, 'out-of-play-US:none', 'US', 'troops');
    const outOfPlayBasesBefore = countTokens(setup, 'out-of-play-US:none', 'US', 'base');
    const availableTroopsBefore = countTokens(setup, 'available-US:none', 'US', 'troops');
    const availableIrregularBefore = countTokens(setup, 'available-US:none', 'US', 'irregular');

    const commitmentMove = legalMoves(def, setup).find((move) => String(move.actionId) === 'resolveCommitment');
    assert.notEqual(commitmentMove, undefined, 'Expected resolveCommitment move with Medevac momentum active');

    const result = applyMoveWithResolvedDecisionIds(def, setup, commitmentMove!).state;

    assert.equal(
      countTokens(result, 'out-of-play-US:none', 'US', 'troops') - outOfPlayTroopsBefore,
      0,
      'Medevac unshaded should prevent troop casualties from moving out of play',
    );
    assert.equal(
      countTokens(result, 'out-of-play-US:none', 'US', 'base') - outOfPlayBasesBefore,
      1,
      'Base casualties should still move out of play under Medevac',
    );
    assert.equal(
      countTokens(result, 'available-US:none', 'US', 'troops') - availableTroopsBefore,
      5,
      'All troop casualties should move to Available under Medevac',
    );
    assert.equal(
      countTokens(result, 'available-US:none', 'US', 'irregular') - availableIrregularBefore,
      1,
      'Other non-base casualties should still move to Available',
    );
    assert.equal(result.zones['casualties-US:none']?.length ?? 0, 0, 'Expected casualties-US to be emptied');
    assert.equal(result.currentPhase, 'main', 'Expected to return to main phase after resolveCommitment');
    assert.equal(result.globalVars.mom_medevacUnshaded, true, 'Medevac should remain in effect until Coup reset');
  });

  it('applies Great Society unshaded under Medevac to the immediate Commitment Phase and preserves Medevac afterward', () => {
    const def = compileDef();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined, 'Expected at least one event deck');

    const baseState = clearAllZones(initialState(def, 7311, 4).state);
    const setup: GameState = {
      ...baseState,
      activePlayer: asPlayerId(1),
      globalVars: {
        ...baseState.globalVars,
        mom_medevacUnshaded: true,
      },
      zones: {
        ...baseState.zones,
        [eventDeck!.discardZone]: [makeToken('card-73', 'card', 'none')],
        'casualties-US:none': [
          makeToken('great-med-cas-t-1', 'troops', 'US'),
          makeToken('great-med-cas-t-2', 'troops', 'US'),
          makeToken('great-med-cas-t-3', 'troops', 'US'),
          makeToken('great-med-cas-b-1', 'base', 'US'),
        ],
      },
    };

    const eventMove = legalMoves(def, setup).find(
      (move) =>
        String(move.actionId) === 'event'
        && move.params.side === 'unshaded'
        && (move.params.eventCardId === undefined || move.params.eventCardId === 'card-73'),
    );
    assert.notEqual(eventMove, undefined, 'Expected Great Society unshaded event move');

    const inCommitment = applyMove(def, setup, completeIfPending(def, setup, eventMove!, 7311n)).state;
    assert.equal(inCommitment.currentPhase, 'commitment', 'Great Society should interrupt into Commitment Phase immediately');

    const commitmentMove = legalMoves(def, inCommitment).find((move) => String(move.actionId) === 'resolveCommitment');
    assert.notEqual(commitmentMove, undefined, 'Expected resolveCommitment move after Great Society');

    const result = applyMoveWithResolvedDecisionIds(def, inCommitment, commitmentMove!).state;

    assert.equal(countTokens(result, 'out-of-play-US:none', 'US', 'troops'), 0, 'Medevac should block troop casualty out-of-play routing during Great Society commitment');
    assert.equal(countTokens(result, 'out-of-play-US:none', 'US', 'base'), 1, 'Base casualties should still move out of play during Great Society commitment');
    assert.equal(countTokens(result, 'available-US:none', 'US', 'troops'), 3, 'All troop casualties should move to Available during Great Society commitment under Medevac');
    assert.equal(result.globalVars.mom_medevacUnshaded, true, 'Medevac should remain active after the immediate Great Society commitment');
    assert.equal(result.currentPhase, 'main', 'Great Society commitment should resume main phase when done');
  });

  it('routes Great Society shaded piece selection to US and allows bases among the chosen Available pieces', () => {
    const def = compileDef();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined, 'Expected at least one event deck');

    const baseState = clearAllZones(initialState(def, 7312, 4).state);
    const setup: GameState = {
      ...baseState,
      activePlayer: asPlayerId(0),
      zones: {
        ...baseState.zones,
        [eventDeck!.discardZone]: [makeToken('card-73', 'card', 'none')],
        'available-US:none': [
          makeToken('great-av-base-1', 'base', 'US'),
          makeToken('great-av-troop-1', 'troops', 'US'),
          makeToken('great-av-troop-2', 'troops', 'US'),
          makeToken('great-av-troop-3', 'troops', 'US'),
        ],
      },
    };

    const eventMove: Move = {
      actionId: asActionId('event'),
      params: {
        side: 'shaded',
        eventCardId: 'card-73',
      },
    };

    const pending = resolveMoveDecisionSequence(def, setup, eventMove, { choose: () => undefined });
    assert.equal(pending.complete, false);
    assert.notEqual(pending.nextDecision, undefined, 'Expected Great Society shaded to request a chooser-owned decision');
    assert.equal(pending.nextDecision?.name, '$greatSocietyUsPieces');
    assert.equal(pending.nextDecision?.decisionPlayer, asPlayerId(0), 'US should choose the removed Available pieces');
    assert.equal(pending.nextDecision?.type, 'chooseN');
    assert.equal(pending.nextDecision?.min, 3);
    assert.equal(pending.nextDecision?.max, 3);
    assert.equal(
      pending.nextDecision?.options.some((option) => String(option.value) === 'great-av-base-1'),
      true,
      'Available US Bases should be legal Great Society shaded selections',
    );

    const result = applyMove(def, setup, {
      ...eventMove,
      params: {
        ...eventMove.params,
        [pending.nextDecision!.decisionKey]: ['great-av-base-1', 'great-av-troop-1', 'great-av-troop-2'],
      },
    }).state;

    assert.equal(countTokens(result, 'out-of-play-US:none', 'US', 'base'), 1, 'Chosen Available base should move out of play');
    assert.equal(countTokens(result, 'out-of-play-US:none', 'US', 'troops'), 2, 'Chosen Available troops should move out of play');
    assert.equal(countTokens(result, 'available-US:none', 'US', 'troops'), 1, 'Unchosen Available US pieces should remain');
  });

  it('surfaces Great Society shaded from legalMoves() when the executing seat is turn-flow eligible', () => {
    const def = compileDef();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined, 'Expected at least one event deck');

    const baseState = clearAllZones(initialState(def, 7314, 4).state);
    const setup: GameState = {
      ...baseState,
      zones: {
        ...baseState.zones,
        [eventDeck!.discardZone]: [makeToken('card-73', 'card', 'none')],
        'available-US:none': [
          makeToken('great-surface-base-1', 'base', 'US'),
          makeToken('great-surface-troop-1', 'troops', 'US'),
          makeToken('great-surface-troop-2', 'troops', 'US'),
          makeToken('great-surface-troop-3', 'troops', 'US'),
        ],
      },
    };

    const eventMove = legalMoves(def, setup).find(
      (move) =>
        String(move.actionId) === 'event'
        && move.params.side === 'shaded'
        && (move.params.eventCardId === undefined || move.params.eventCardId === 'card-73'),
    );
    assert.notEqual(eventMove, undefined, 'Expected Great Society shaded event move to be surfaced by legalMoves()');

    const pending = resolveMoveDecisionSequence(def, setup, eventMove!, { choose: () => undefined });
    assert.equal(pending.complete, false);
    assert.notEqual(pending.nextDecision, undefined, 'Expected Great Society shaded surfaced move to remain choiceful');
    assert.equal(pending.nextDecision?.name, '$greatSocietyUsPieces');
    assert.equal(pending.nextDecision?.decisionPlayer, asPlayerId(0), 'US should still own the shaded choice');
    assert.equal(pending.nextDecision?.type, 'chooseN');
    assert.equal(pending.nextDecision?.min, 3);
    assert.equal(pending.nextDecision?.max, 3);
  });

  it('caps Great Society shaded removal at the number of Available US pieces', () => {
    const def = compileDef();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined, 'Expected at least one event deck');

    const baseState = clearAllZones(initialState(def, 7313, 4).state);
    const setup: GameState = {
      ...baseState,
      activePlayer: asPlayerId(0),
      zones: {
        ...baseState.zones,
        [eventDeck!.discardZone]: [makeToken('card-73', 'card', 'none')],
        'available-US:none': [
          makeToken('great-small-1', 'troops', 'US'),
          makeToken('great-small-2', 'base', 'US'),
        ],
      },
    };

    const eventMove: Move = {
      actionId: asActionId('event'),
      params: {
        side: 'shaded',
        eventCardId: 'card-73',
      },
    };

    const pending = legalChoicesDiscover(def, setup, eventMove);
    assert.equal(pending.kind, 'pending');
    assert.equal(pending.name, '$greatSocietyUsPieces');
    assert.equal(pending.decisionPlayer, asPlayerId(0), 'US should own the Great Society shaded choice even when another faction executes it');
    assert.equal(pending.min, 2);
    assert.equal(pending.max, 2);
    assert.deepEqual(
      pending.options.map((option) => String(option.value)).sort(),
      ['great-small-1', 'great-small-2'],
      'All remaining Available US pieces should be selectable when fewer than 3 exist',
    );

    const result = applyMoveWithResolvedDecisionIds(def, setup, eventMove).state;
    assert.equal(result.zones['available-US:none']?.length ?? 0, 0, 'All Available US pieces should be removed when fewer than 3 exist');
    assert.equal(result.zones['out-of-play-US:none']?.length ?? 0, 2, 'Great Society shaded should move every available US piece out of play up to the cap');
  });
});
