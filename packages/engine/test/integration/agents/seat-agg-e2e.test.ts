// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildPolicyVictorySurface } from '../../../src/agents/policy-surface.js';
import { compileGameSpecToGameDef, validateGameSpec } from '../../../src/cnl/index.js';
import type {
  GameSpecConsiderationDef,
  GameSpecDoc,
  GameSpecStateFeatureDef,
} from '../../../src/cnl/game-spec-doc.js';
import type { GameSpecSourceMap } from '../../../src/cnl/source-map.js';
import {
  applyMove,
  assertValidatedGameDef,
  createRng,
  createGameDefRuntime,
  initialState,
  legalMoves,
  type GameDef,
  type GameState,
  type PlayerId,
} from '../../../src/kernel/index.js';
import { advanceToDecisionPoint } from '../../../src/kernel/phase-advance.js';
import { evaluatePolicyMove } from '../../../src/agents/policy-eval.js';
import {
  compileProductionSpec,
  compileTexasProductionSpec,
} from '../../helpers/production-spec-helpers.js';

function compilePolicyOverlay(options: {
  readonly label: string;
  readonly doc: GameSpecDoc;
  readonly sourceMap: GameSpecSourceMap;
  readonly bindingSeat: string;
  readonly profileId: string;
  readonly stateFeatures: Readonly<Record<string, GameSpecStateFeatureDef>>;
  readonly considerations: Readonly<Record<string, Omit<GameSpecConsiderationDef, 'scopes'>>>;
}): GameDef {
  const doc = structuredClone(options.doc);

  assert.ok(doc.agents, `${options.label} should author agents`);
  assert.ok(doc.agents?.library, `${options.label} should author an agent library`);
  if (doc.agents === undefined || doc.agents.library === undefined) {
    throw new Error(`${options.label} is missing authored agents`);
  }

  const baseProfileId = doc.agents.bindings?.[options.bindingSeat];
  assert.ok(baseProfileId, `${options.label} should bind seat "${options.bindingSeat}"`);
  if (baseProfileId === undefined) {
    throw new Error(`${options.label} is missing an authored binding for ${options.bindingSeat}`);
  }

  const baseProfile = doc.agents.profiles?.[baseProfileId];
  assert.ok(baseProfile, `${options.label} should define profile "${baseProfileId}"`);
  if (baseProfile === undefined) {
    throw new Error(`${options.label} is missing base profile "${baseProfileId}"`);
  }

  const overlaidDoc: GameSpecDoc = {
    ...doc,
    agents: {
      ...doc.agents,
      library: {
        ...doc.agents.library,
        stateFeatures: {
          ...doc.agents.library.stateFeatures,
          ...options.stateFeatures,
        },
        considerations: {
          ...doc.agents.library.considerations,
          ...Object.fromEntries(
            Object.entries(options.considerations).map(([id, definition]) => [id, { scopes: ['move'], ...definition }]),
          ),
        },
      },
      profiles: {
        ...doc.agents.profiles,
        [options.profileId]: {
          ...baseProfile,
          params: { ...(baseProfile.params ?? {}) },
          use: {
            pruningRules: [],
            considerations: Object.keys(options.considerations),
            tieBreakers: [],
          },
        },
      },
      bindings: {
        ...doc.agents.bindings,
        [options.bindingSeat]: options.profileId,
      },
    },
  };

  const validationDiagnostics = validateGameSpec(overlaidDoc, { sourceMap: options.sourceMap });
  assert.deepEqual(
    validationDiagnostics.filter((diagnostic) => diagnostic.severity === 'error'),
    [],
    `${options.label} overlay should validate cleanly`,
  );

  const compiled = compileGameSpecToGameDef(overlaidDoc, { sourceMap: options.sourceMap });
  assert.deepEqual(
    compiled.diagnostics.filter((diagnostic) => diagnostic.severity === 'error'),
    [],
    `${options.label} overlay should compile cleanly`,
  );
  assert.ok(compiled.gameDef, `${options.label} overlay should produce a compiled GameDef`);

  return assertValidatedGameDef(compiled.gameDef);
}

function compileFitlSeatAggOverlay(): GameDef {
  const parsed = compileProductionSpec().parsed;
  return compilePolicyOverlay({
    label: 'FITL seatAgg',
    doc: parsed.doc,
    sourceMap: parsed.sourceMap,
    bindingSeat: 'arvn',
    profileId: 'arvn-seat-agg-test',
    stateFeatures: {
      maxOpponentMargin: {
        type: 'number',
        expr: {
          seatAgg: {
            over: 'opponents',
            expr: { ref: 'victory.currentMargin.$seat' },
            aggOp: 'max',
          },
        },
      },
      namedUsNvaMarginSum: {
        type: 'number',
        expr: {
          seatAgg: {
            over: ['us', 'nva'],
            expr: { ref: 'victory.currentMargin.$seat' },
            aggOp: 'sum',
          },
        },
      },
    },
    considerations: {
      reportMaxOpponentMargin: {
        weight: 1,
        value: { ref: 'feature.maxOpponentMargin' },
      },
      reportNamedUsNvaMarginSum: {
        weight: 1,
        value: { ref: 'feature.namedUsNvaMarginSum' },
      },
    },
  });
}

function compileTexasSeatAggOverlay(): GameDef {
  const parsed = compileTexasProductionSpec().parsed;
  return compilePolicyOverlay({
    label: 'Texas seatAgg',
    doc: parsed.doc,
    sourceMap: parsed.sourceMap,
    bindingSeat: 'neutral',
    profileId: 'baseline-seat-agg-test',
    stateFeatures: {
      opponentCount: {
        type: 'number',
        expr: {
          seatAgg: {
            over: 'opponents',
            expr: 1,
            aggOp: 'count',
          },
        },
      },
    },
    considerations: {
      reportOpponentCount: {
        weight: 1,
        value: { ref: 'feature.opponentCount' },
      },
    },
  });
}

function findDecisionStateForSeat(
  def: GameDef,
  seed: number,
  playerCount: number,
  seatId: string,
): {
  readonly state: GameState;
  readonly playerId: PlayerId;
  readonly runtime: ReturnType<typeof createGameDefRuntime>;
} {
  const runtime = createGameDefRuntime(def);
  let state = initialState(def, seed, playerCount).state;

  for (let step = 0; step < 16; step += 1) {
    const currentSeatId = def.seats?.[Number(state.activePlayer)]?.id;
    const moves = legalMoves(def, state, undefined, runtime);
    if (currentSeatId === seatId && moves.length > 0) {
      return {
        state,
        playerId: state.activePlayer,
        runtime,
      };
    }
    assert.equal(moves.length > 0, true, `Expected at least one legal move before reaching seat "${seatId}"`);
    state = applyMove(def, state, moves[0]!, undefined, runtime).state;
  }

  assert.fail(`Failed to reach a live decision for seat "${seatId}" within the bounded search window`);
}

function evaluateIntegratedStateFeatures(
  def: GameDef,
  state: GameState,
  playerId: PlayerId,
  runtime: ReturnType<typeof createGameDefRuntime>,
) {
  const result = evaluatePolicyMove({
    def,
    state,
    playerId,
    legalMoves: legalMoves(def, state, undefined, runtime),
    trustedMoveIndex: new Map(),
    rng: createRng(999n),
    runtime,
  });

  assert.equal(result.metadata.failure, null);
  assert.ok(result.metadata.stateFeatures, 'Expected evaluated policy state features');

  return result.metadata;
}

describe('seatAgg integration coverage', () => {
  it('evaluates FITL seatAgg opponent max and explicit seat-list sums through the real compile and runtime pipeline', () => {
    const def = compileFitlSeatAggOverlay();
    const { state, playerId, runtime } = findDecisionStateForSeat(def, 6, 4, 'arvn');
    const metadata = evaluateIntegratedStateFeatures(def, state, playerId, runtime);
    const stateFeatures = metadata.stateFeatures ?? {};
    const victorySurface = buildPolicyVictorySurface(def, state, runtime);

    const expectedOpponentMax = Math.max(
      ...Array.from(victorySurface.marginBySeat.entries())
        .filter(([seatId]) => seatId !== 'arvn')
        .map(([_seatId, margin]) => margin),
    );
    const expectedNamedSum = (victorySurface.marginBySeat.get('us') ?? 0) + (victorySurface.marginBySeat.get('nva') ?? 0);

    assert.equal(metadata.seatId, 'arvn');
    assert.equal(stateFeatures.maxOpponentMargin, expectedOpponentMax);
    assert.equal(stateFeatures.namedUsNvaMarginSum, expectedNamedSum);
  });

  it('proves the current Texas shared neutral seat model yields an empty seatAgg opponents set', () => {
    const def = compileTexasSeatAggOverlay();
    const runtime = createGameDefRuntime(def);
    const state = advanceToDecisionPoint(def, initialState(def, 23, 4).state);
    const metadata = evaluateIntegratedStateFeatures(def, state, state.activePlayer, runtime);

    assert.deepEqual(def.seats?.map((seat) => seat.id), ['neutral']);
    assert.deepEqual(def.agents?.bindingsBySeat, { neutral: 'baseline-seat-agg-test' });
    assert.equal(metadata.seatId, 'neutral');
    assert.equal(metadata.stateFeatures?.opponentCount, 0);
  });
});
