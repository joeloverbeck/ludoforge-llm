// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../src/agents/policy-agent.js';
import {
  advanceAutoresolvable,
  applyDecision,
  applyMove,
  applyPublishedDecision,
  asPlayerId,
  asTokenId,
  createGameDefRuntime,
  createRng,
  initialState,
  legalMoves,
  publishMicroturn,
  type Decision,
  type GameDef,
  type GameState,
  type Move,
  type Token,
} from '../../src/kernel/index.js';
import { applyMoveWithResolvedDecisionIds } from '../helpers/decision-param-helpers.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import { requireCardDrivenRuntime } from '../helpers/turn-order-helpers.js';

const CARD_ID = 'card-75';
const NE_CAMBODIA = 'northeast-cambodia:none';

const makeToken = (
  id: string,
  type: string,
  faction: string,
  extraProps?: Readonly<Record<string, string | number | boolean>>,
): Token => ({
  id: asTokenId(id),
  type,
  props: {
    faction,
    type,
    ...(extraProps ?? {}),
  },
});

const compileDef = (): GameDef => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assert.notEqual(compiled.gameDef, null);
  return compiled.gameDef!;
};

const setupCardDrivenState = (
  def: GameDef,
  zones: Readonly<Record<string, readonly Token[]>>,
): GameState => {
  const base = clearAllZones(initialState(def, 75004, 4).state);
  const runtime = requireCardDrivenRuntime(base);
  return {
    ...base,
    activePlayer: asPlayerId(3),
    globalVars: {
      ...base.globalVars,
      nvaResources: 5,
      vcResources: 5,
      trail: 0,
    },
    turnOrderState: {
      type: 'cardDriven',
      runtime: {
        ...runtime,
        currentCard: {
          ...runtime.currentCard,
          firstEligible: 'vc',
          secondEligible: 'nva',
          actedSeats: [],
          passedSeats: [],
          nonPassCount: 0,
          firstActionClass: null,
        },
      },
    },
    zones: {
      ...base.zones,
      ...zones,
    },
  };
};

const findCardMove = (
  def: GameDef,
  state: GameState,
): Move | undefined =>
  legalMoves(def, state).find(
    (move) =>
      String(move.actionId) === 'event'
      && (move.params.eventCardId === undefined || move.params.eventCardId === CARD_ID)
      && move.params.side === 'shaded',
  );

const requireDecision = <T extends Decision>(
  decisions: readonly Decision[],
  predicate: (decision: Decision) => decision is T,
  message: string,
): T => {
  const decision = decisions.find(predicate);
  assert.notEqual(decision, undefined, message);
  return decision as T;
};

const setupShadedNvaMarchWitness = (): {
  readonly def: GameDef;
  readonly nvaWindow: GameState;
} => {
  const def = compileDef();
  const setup = setupCardDrivenState(def, {
    'available-NVA:none': [
      makeToken('compound-nva-mover', 'guerrilla', 'NVA', { type: 'guerrilla', activity: 'underground' }),
    ],
  });
  const eventMove = findCardMove(def, setup);
  assert.notEqual(eventMove, undefined, 'Expected Sihanouk shaded event move');
  const afterEvent = applyMoveWithResolvedDecisionIds(def, setup, eventMove!).state;
  const passToNva = legalMoves(def, afterEvent).find((move) => String(move.actionId) === 'pass');
  assert.notEqual(passToNva, undefined, 'Expected pass window before NVA free grants');
  return {
    def,
    nvaWindow: applyMove(def, afterEvent, passToNva!).state,
  };
};

const actionSelectionMoves = (microturn: ReturnType<typeof publishMicroturn>): readonly Move[] => {
  if (microturn.kind !== 'actionSelection') {
    return [];
  }
  return microturn.legalActions
    .map((decision) => decision.kind === 'actionSelection' ? decision.move : undefined)
    .filter((move): move is Move => move !== undefined);
};

const selectCorpusAdvanceDecision = (
  microturn: ReturnType<typeof publishMicroturn>,
  seed: number,
  decisionCount: number,
): Decision => {
  const confirm = microturn.legalActions.find((decision) =>
    decision.kind === 'chooseNStep' && decision.command === 'confirm',
  );
  if (confirm !== undefined) {
    return confirm;
  }

  const add = microturn.legalActions.find((decision) =>
    decision.kind === 'chooseNStep' && decision.command === 'add',
  );
  if (add !== undefined) {
    return add;
  }

  const selected = microturn.legalActions[(seed + decisionCount) % microturn.legalActions.length];
  assert.notEqual(selected, undefined, `seed ${seed} did not expose a deterministic decision`);
  return selected!;
};

describe('compound operation+special-activity constructibility', () => {
  it('keeps policy preview inside executable compound March mover decisions', () => {
    const { def, nvaWindow } = setupShadedNvaMarchWitness();
    const agent = new PolicyAgent({ traceLevel: 'summary' });
    let state = nvaWindow;

    for (const expected of [
      (decision: Decision) => decision.kind === 'actionSelection' && decision.actionId === 'rally',
      (decision: Decision) => decision.kind === 'chooseNStep' && decision.command === 'add' && decision.value === NE_CAMBODIA,
      (decision: Decision) => decision.kind === 'chooseNStep' && decision.command === 'confirm',
      (decision: Decision) => decision.kind === 'chooseOne' && decision.value === 'place-guerrilla',
      (decision: Decision) => decision.kind === 'chooseOne' && decision.value === 'no',
      (decision: Decision) => decision.kind === 'actionSelection' && decision.actionId === 'march',
      (decision: Decision) => decision.kind === 'chooseNStep' && decision.command === 'add' && decision.value === 'pleiku-darlac:none',
      (decision: Decision) => decision.kind === 'chooseNStep' && decision.command === 'confirm',
    ]) {
      const microturn = publishMicroturn(def, state);
      const decision = requireDecision(
        microturn.legalActions,
        expected as (decision: Decision) => decision is Decision,
        'Expected scripted compound witness decision',
      );
      state = applyDecision(def, state, decision).state;
    }

    const moverMicroturn = publishMicroturn(def, state);
    assert.equal(
      moverMicroturn.legalActions.some(
        (decision) => decision.kind === 'chooseNStep' && decision.command === 'confirm',
      ),
      false,
      'compound March mover frontier must not expose an empty confirm branch',
    );

    const selected = agent.chooseDecision({ def, state, microturn: moverMicroturn, rng: createRng(17n) });
    assert.equal(selected.decision.kind, 'chooseNStep');
    assert.equal(selected.decision.command, 'add');
    assert.equal(selected.decision.value, 'compound-nva-mover');
  });

  it('does not publish an empty Patrol confirm that apply cannot replay', () => {
    const seed = 1013;
    const def = compileDef();
    const runtime = createGameDefRuntime(def);
    let state = initialState(def, seed, def.metadata.players.max, undefined, runtime).state;
    let rng = createRng(BigInt(seed) ^ 0x5eed149n);
    let sawPatrolAssaultLocationWitness = false;

    for (let decisionCount = 0; decisionCount <= 20; decisionCount += 1) {
      const auto = advanceAutoresolvable(def, state, rng, runtime);
      state = auto.state;
      rng = auto.rng;

      const microturn = publishMicroturn(def, state, runtime);
      if (decisionCount >= 8 && actionSelectionMoves(microturn).length > 0) {
        assert.equal(sawPatrolAssaultLocationWitness, true);
        return;
      }

      const chooseNStepContext = microturn.kind === 'chooseNStep'
        ? microturn.decisionContext as Extract<typeof microturn.decisionContext, { readonly kind: 'chooseNStep' }>
        : undefined;
      if (
        chooseNStepContext !== undefined
        && String(chooseNStepContext.decisionKey).includes('chooseN::$assaultLoCs')
        && chooseNStepContext.selectedSoFar.length === 0
      ) {
        sawPatrolAssaultLocationWitness = true;
        const emptyConfirm = microturn.legalActions.find((decision) =>
          decision.kind === 'chooseNStep' && decision.command === 'confirm',
        );
        if (emptyConfirm !== undefined) {
          assert.doesNotThrow(
            () => applyPublishedDecision(def, state, microturn, emptyConfirm, undefined, runtime),
            'published empty Patrol assault-location confirm must replay through apply',
          );
        }
      }

      const selected = selectCorpusAdvanceDecision(microturn, seed, decisionCount);
      state = applyPublishedDecision(def, state, microturn, selected, undefined, runtime).state;
    }

    assert.fail('seed 1013 did not reach the patrol constructibility witness');
  });
});
