import * as assert from 'node:assert/strict';

import {
  applyDecision,
  createGameDefRuntime,
  initialState,
  type Decision,
  type GameDef,
  type GameDefRuntime,
  type GameState,
} from '../../src/kernel/index.js';
import { publishMicroturn } from '../../src/kernel/microturn/publish.js';

const SEED = 1001;
const PLAYER_COUNT = 4;

// Deterministic, rules-derived decision prefix that drives the production FITL
// game (seed 1001) to ARVN's first `$governMode` chooseOne microturn.
//
// These are fixed kernel moves, not agent decisions: replaying them reaches the
// Govern microturn regardless of which policy profile is bound. Spec 201's
// ARVN doctrine no longer *selects* Govern on seed 1001 (the regenerated
// `seed-1001-nva-march-dead-end` probe-recovery fixture has zero govern-mode
// decisions), but the Govern action and its `$governMode` chooseOne microturn
// are unchanged and remain reachable by these moves. Tests that prove a
// microturn-scope consideration scores the Govern options therefore drive here
// directly instead of depending on the production agent's drifting trajectory.
export const GOVERN_REACHING_DECISION_PREFIX = [
  {
    kind: 'actionSelection',
    actionId: 'event',
    move: {
      actionId: 'event',
      params: { eventCardId: 'card-48', eventDeckId: 'fitl-events-initial-card-pack', side: 'shaded' },
      actionClass: 'event',
    },
  },
  { kind: 'chooseOne', decisionKey: 'decision:eventTarget:0:$targetProvince::$targetProvince', value: 'pleiku-darlac:none' },
  { kind: 'chooseOne', decisionKey: 'decision:doc.eventDecks.0.cards.47.shaded.targets.0.effects.0.chooseOne::$coinBaseToRemove', value: 'tok_us-bases_46' },
  {
    kind: 'actionSelection',
    actionId: 'govern',
    move: { actionId: 'govern', params: {}, actionClass: 'operationPlusSpecialActivity' },
  },
  { kind: 'chooseNStep', decisionKey: 'decision:doc.actionPipelines.20.stages[0].effects.0.if.else.0.if.else.0.chooseN::$targetSpaces', command: 'add', value: 'an-loc:none' },
  { kind: 'chooseNStep', decisionKey: 'decision:doc.actionPipelines.20.stages[0].effects.0.if.else.0.if.else.0.chooseN::$targetSpaces', command: 'confirm' },
] as unknown as readonly Decision[];

export interface GovernChooseOneMicroturn {
  readonly state: GameState;
  readonly microturn: ReturnType<typeof publishMicroturn>;
  readonly runtime: GameDefRuntime;
}

const isGovernModeChooseOne = (microturn: ReturnType<typeof publishMicroturn>): boolean =>
  microturn.kind === 'chooseOne'
  && microturn.legalActions.some((action) => action.kind === 'chooseOne' && String(action.decisionKey).includes('$governMode@'));

/**
 * Drives the supplied FITL def to ARVN's first `$governMode` chooseOne microturn
 * by replaying {@link GOVERN_REACHING_DECISION_PREFIX}, returning the state and
 * published microturn so callers can evaluate microturn-scope considerations
 * against the Govern options. Asserts the prefix still lands on the expected
 * microturn so a future rules change surfaces here rather than as an opaque
 * downstream failure.
 */
export const driveToGovernChooseOneMicroturn = (def: GameDef): GovernChooseOneMicroturn => {
  const runtime = createGameDefRuntime(def);
  let state: GameState = initialState(def, SEED, PLAYER_COUNT, undefined, runtime).state;
  for (const decision of GOVERN_REACHING_DECISION_PREFIX) {
    state = applyDecision(def, state, decision, undefined, runtime).state;
  }
  const microturn = publishMicroturn(def, state, runtime);
  assert.equal(microturn.kind, 'chooseOne', 'govern-reaching prefix must land on a chooseOne microturn');
  assert.equal(String(microturn.seatId), 'arvn', 'govern-reaching prefix must land on an ARVN microturn');
  assert.ok(isGovernModeChooseOne(microturn), 'govern-reaching prefix must land on a $governMode chooseOne microturn');
  return { state, microturn, runtime };
};
