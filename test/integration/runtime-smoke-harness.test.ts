import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asActionId, asPhaseId, initialState, type GameDef } from '../../src/kernel/index.js';
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
});
