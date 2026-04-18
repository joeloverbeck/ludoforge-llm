// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  createGameDefRuntime,
  initialState,
  legalMoves,
  type GameState,
  type ValidatedGameDef,
} from '../../../src/kernel/index.js';
import {
  compileProductionSpec,
  compileTexasProductionSpec,
} from '../../helpers/production-spec-helpers.js';
import { assertNoErrors } from '../../helpers/diagnostic-helpers.js';

const CORPUS_SEEDS = [7, 17] as const;
const STEPS_PER_SEED = 4;

type GameFixture = {
  readonly label: string;
  readonly def: ValidatedGameDef;
};

const compileFitlDef = (): ValidatedGameDef => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assertNoErrors(compiled);
  assert.notEqual(compiled.gameDef, null, 'expected FITL production compilation to produce a gameDef');
  return compiled.gameDef;
};

const compileTexasDef = (): ValidatedGameDef => {
  const { parsed, compiled } = compileTexasProductionSpec();
  assertNoErrors(parsed);
  assertNoErrors(compiled);
  assert.notEqual(compiled.gameDef, null, 'expected Texas production compilation to produce a gameDef');
  return compiled.gameDef;
};

const stateKeySignature = (state: GameState): string => Object.keys(state).sort().join(',');

const collectStateWitnesses = (
  fixture: GameFixture,
): readonly { readonly signature: string; readonly witness: string }[] => {
  const runtime = createGameDefRuntime(fixture.def);
  const witnesses: { signature: string; witness: string }[] = [];

  for (const seed of CORPUS_SEEDS) {
    let state = initialState(fixture.def, seed, undefined, undefined, runtime).state;
    witnesses.push({
      signature: stateKeySignature(state),
      witness: `${fixture.label} seed=${seed} step=initial`,
    });

    for (let step = 0; step < STEPS_PER_SEED; step += 1) {
      const moves = legalMoves(fixture.def, state, undefined, runtime);
      if (moves.length === 0) {
        break;
      }
      const move = moves[0];
      assert.notEqual(move, undefined, `${fixture.label} seed=${seed} step=${step} should provide a legal move`);
      if (move === undefined) {
        break;
      }
      state = applyMove(fixture.def, state, move, undefined, runtime).state;
      witnesses.push({
        signature: stateKeySignature(state),
        witness: `${fixture.label} seed=${seed} step=${step + 1}`,
      });
    }
  }

  return witnesses;
};

describe('GameState canonical shape consistency', () => {
  it('preserves one Object.keys() signature across FITL and Texas runtime states', () => {
    const fixtures: readonly GameFixture[] = [
      { label: 'FITL', def: compileFitlDef() },
      { label: 'Texas', def: compileTexasDef() },
    ];

    const signatureToWitnesses = new Map<string, string[]>();

    for (const fixture of fixtures) {
      for (const entry of collectStateWitnesses(fixture)) {
        const witnesses = signatureToWitnesses.get(entry.signature);
        if (witnesses === undefined) {
          signatureToWitnesses.set(entry.signature, [entry.witness]);
        } else {
          witnesses.push(entry.witness);
        }
      }
    }

    assert.equal(
      signatureToWitnesses.size,
      1,
      `GameState produced ${signatureToWitnesses.size} key signatures:\n${
        [...signatureToWitnesses.entries()]
          .map(([signature, witnesses]) => `${signature} <= ${witnesses.join(', ')}`)
          .join('\n')
      }`,
    );
  });
});
