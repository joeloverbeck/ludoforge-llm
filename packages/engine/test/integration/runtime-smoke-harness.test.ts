import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asActionId, asPhaseId, createRng, initialState, nextInt, type GameDef } from '../../src/kernel/index.js';
import {
  firstLegalPolicy,
  runRuntimeSmokeGate,
  seededRandomLegalPolicy,
  selectorPolicy,
  type RuntimeSmokeInvariant,
} from '../helpers/runtime-smoke-harness.js';

const createHarnessFixtureDef = (): GameDef =>
  ({
    metadata: { id: 'runtime-smoke-harness-fixture', players: { min: 2, max: 2 }, maxTriggerDepth: 8 },
    constants: {},
    globalVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 100 }],
    perPlayerVars: [{ name: 'energy', type: 'int', init: 5, min: 0, max: 10 }],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [
      {
        id: asActionId('plusOne'),
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [{ addVar: { scope: 'global', var: 'score', delta: 1 } }],
        limits: [],
      },
      {
        id: asActionId('plusTwo'),
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [{ addVar: { scope: 'global', var: 'score', delta: 2 } }],
        limits: [],
      },
    ],
    triggers: [],
    terminal: {
      conditions: [{ when: { op: '>=', left: { ref: 'gvar', var: 'score' }, right: 12 }, result: { type: 'draw' } }],
    },
  }) as unknown as GameDef;

describe('runtime smoke harness integration', () => {
  it('proves policy determinism and invariant plug-in wiring across policy types', () => {
    const def = createHarnessFixtureDef();
    let observedInvariantCalls = 0;

    const invariant: RuntimeSmokeInvariant = {
      id: 'fixture-score-nonnegative',
      check: ({ state }) => {
        observedInvariantCalls += 1;
        assert.equal(Number(state.globalVars.score) >= 0, true);
      },
    };

    const firstLegal = runRuntimeSmokeGate({
      def,
      seed: 17,
      playerCount: 2,
      maxSteps: 8,
      minAppliedMoves: 6,
      policy: firstLegalPolicy(),
      invariants: [invariant],
      bootstrapState: (targetDef, seed, players) => initialState(targetDef, seed, players),
    });

    const seededRandom = runRuntimeSmokeGate({
      def,
      seed: 17,
      playerCount: 2,
      maxSteps: 8,
      minAppliedMoves: 6,
      policy: seededRandomLegalPolicy(),
      invariants: [invariant],
    });

    const maxActionId = runRuntimeSmokeGate({
      def,
      seed: 17,
      playerCount: 2,
      maxSteps: 8,
      minAppliedMoves: 6,
      policy: selectorPolicy('max-action-id', ({ moves }) => {
        let selectedIndex = 0;
        for (let index = 1; index < moves.length; index += 1) {
          if (String(moves[index]!.actionId) > String(moves[selectedIndex]!.actionId)) {
            selectedIndex = index;
          }
        }
        return selectedIndex;
      }),
      invariants: [invariant],
    });

    assert.equal(observedInvariantCalls > 0, true);
    assert.equal(firstLegal.appliedMoves >= 6, true);
    assert.equal(seededRandom.appliedMoves >= 6, true);
    assert.equal(maxActionId.appliedMoves >= 6, true);
  });

  it('reports invariant failures with policy/seed/step context', () => {
    const def = createHarnessFixtureDef();

    assert.throws(
      () =>
        runRuntimeSmokeGate({
          def,
          seed: 5,
          playerCount: 2,
          maxSteps: 6,
          policy: firstLegalPolicy(),
          invariants: [
            {
              id: 'forced-failure',
              check: ({ step }) => {
                if (step === 2) {
                  throw new Error('forced invariant failure');
                }
              },
            },
          ],
        }),
      /Runtime smoke invariant failed \[forced-failure\] policy=first-legal seed=5 players=2 step=2: forced invariant failure/,
    );
  });

  it('advances harness-managed RNG via drawInt without policy-side RNG threading', () => {
    const def = createHarnessFixtureDef();
    const seed = 19;
    const result = runRuntimeSmokeGate({
      def,
      seed,
      playerCount: 2,
      maxSteps: 12,
      minAppliedMoves: 6,
      policy: selectorPolicy('draw-int-random', ({ moves, drawInt }) => drawInt(0, moves.length - 1)),
    });

    let rng = createRng(BigInt(seed));
    const expectedActionIds: string[] = [];
    for (let step = 0; step < result.appliedMoves; step += 1) {
      const [moveIndex, nextRng] = nextInt(rng, 0, 1);
      rng = nextRng;
      expectedActionIds.push(moveIndex === 0 ? 'plusOne' : 'plusTwo');
    }

    assert.deepEqual(result.actionIds, expectedActionIds);
  });

  it('supports deterministic policy-local state hooks', () => {
    const def = createHarnessFixtureDef();
    const transitionLog: number[] = [];
    const result = runRuntimeSmokeGate({
      def,
      seed: 23,
      playerCount: 2,
      maxSteps: 8,
      minAppliedMoves: 6,
      policy: {
        id: 'stateful-alternating',
        initPolicyState: () => ({ nextMoveIndex: 0 }),
        selectMove: ({ policyState, moves }) => {
          const state = policyState as { readonly nextMoveIndex: number };
          return state.nextMoveIndex % moves.length;
        },
        advancePolicyState: ({ previousState }) => {
          const state = (previousState ?? { nextMoveIndex: 0 }) as { readonly nextMoveIndex: number };
          const nextMoveIndex = state.nextMoveIndex + 1;
          transitionLog.push(nextMoveIndex);
          return { nextMoveIndex };
        },
      },
    });

    assert.equal(transitionLog.length >= result.appliedMoves, true);
    for (let index = 1; index < result.actionIds.length; index += 1) {
      assert.notEqual(result.actionIds[index], result.actionIds[index - 1]);
    }
  });
});
