import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../src/agents/policy-agent.js';
import { evaluatePolicyMove } from '../../src/agents/policy-eval.js';
import { preparePlayableMoves } from '../../src/agents/prepare-playable-moves.js';
import type { PolicyPreviewDependencies } from '../../src/agents/policy-preview.js';
import { buildCompletionChooseCallback } from '../../src/agents/completion-guidance-choice.js';
import { resolveEffectivePolicyProfile } from '../../src/agents/policy-profile-resolution.js';
import { buildPolicyVictorySurface } from '../../src/agents/policy-surface.js';
import { compileGameSpecToGameDef, validateGameSpec } from '../../src/cnl/index.js';
import type { GameSpecConsiderationDef, GameSpecStateFeatureDef } from '../../src/cnl/game-spec-doc.js';
import { applyTrustedMove } from '../../src/kernel/apply-move.js';
import { toMoveIdentityKey } from '../../src/kernel/move-identity.js';
import {
  applyMove,
  asPlayerId,
  asTokenId,
  asZoneId,
  assertValidatedGameDef,
  classifyPlayableMoveCandidate,
  type ClassifiedMove,
  createRng,
  createGameDefRuntime,
  computeFullHash,
  enumerateLegalMoves,
  evaluatePlayableMoveCandidate,
  initialState,
  legalMoves,
  probeMoveViability,
  type GameDef,
  type GameState,
  type Move,
  type PlayerId,
  type Token,
} from '../../src/kernel/index.js';
import { derivePlayerObservation } from '../../src/kernel/observation.js';
import { queryAdjacentZones } from '../../src/kernel/spatial.js';
import { runGame } from '../../src/sim/simulator.js';
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import { requireCardDrivenRuntime } from '../helpers/turn-order-helpers.js';

const SIHANOUK_CARD_ID = 'card-75';
const TAY_NINH = 'tay-ninh:none';
const makeFitlToken = (
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

function rngStatesEqual(left: { readonly algorithm: string; readonly version: number; readonly state: readonly bigint[] }, right: { readonly algorithm: string; readonly version: number; readonly state: readonly bigint[] }): boolean {
  return left.algorithm === right.algorithm
    && left.version === right.version
    && left.state.length === right.state.length
    && left.state.every((entry, index) => entry === right.state[index]);
}

function createPolicyAgents(count: number): PolicyAgent[] {
  return Array.from({ length: count }, () => new PolicyAgent());
}

function advanceSeed6ToVcFreeRally() {
  const { compiled } = compileProductionSpec();
  const def = assertValidatedGameDef(compiled.gameDef);
  const runtime = createGameDefRuntime(def);
  let state = initialState(def, 6, 4).state;
  const openingAgent = new PolicyAgent();
  const openingLegalMoves = enumerateLegalMoves(def, state, undefined, runtime).moves;
  const openingMove = openingAgent.chooseMove({
    def,
    state,
    playerId: state.activePlayer,
    legalMoves: openingLegalMoves,
    rng: createRng(6n),
    runtime,
  });

  state = applyMove(def, state, openingMove.move, undefined, runtime).state;
  return {
    def,
    runtime,
    state,
    legalMoves: enumerateLegalMoves(def, state, undefined, runtime).moves,
  } as const;
}

function createSihanoukVcGrantState() {
  const { compiled } = compileProductionSpec();
  const def = assertValidatedGameDef(compiled.gameDef);
  const runtime = createGameDefRuntime(def);
  const base = clearAllZones(initialState(def, 75003, 4).state);
  const cardDrivenRuntime = requireCardDrivenRuntime(base);
  const eventDeck = def.eventDecks?.[0];
  assert.notEqual(eventDeck, undefined, 'expected FITL event deck');

  const state: GameState = {
    ...base,
    activePlayer: asPlayerId(3),
    globalVars: {
      ...base.globalVars,
      nvaResources: 5,
      vcResources: 5,
      trail: 1,
    },
    turnOrderState: {
      type: 'cardDriven',
      runtime: {
        ...cardDrivenRuntime,
        currentCard: {
          ...cardDrivenRuntime.currentCard,
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
      [eventDeck!.discardZone]: [makeFitlToken(SIHANOUK_CARD_ID, 'card', 'none')],
      [TAY_NINH]: [makeFitlToken('sihanouk-vc-outside', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'underground' })],
      'available-VC:none': [makeFitlToken('sihanouk-vc-rally', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'underground' })],
      'available-NVA:none': [makeFitlToken('sihanouk-nva-rally', 'guerrilla', 'NVA', { type: 'guerrilla', activity: 'underground' })],
    },
  };

  return {
    def,
    runtime,
    state,
    legalMoves: enumerateLegalMoves(def, state, undefined, runtime).moves,
  } as const;
}

function evaluatePreparedPolicyDecision(
  def: GameDef,
  state: GameState,
  legalMoves: readonly ClassifiedMove[],
  runtime: ReturnType<typeof createGameDefRuntime>,
  previewDependencies?: PolicyPreviewDependencies,
) {
  const resolvedProfile = resolveEffectivePolicyProfile(def, state.activePlayer);
  const choose = resolvedProfile === null
    ? undefined
    : buildCompletionChooseCallback({
        state,
        def,
        catalog: resolvedProfile.catalog,
        playerId: state.activePlayer,
        seatId: resolvedProfile.seatId,
        profile: resolvedProfile.profile,
        runtime,
      });
  const prepared = preparePlayableMoves({
    def,
    state,
    legalMoves,
    rng: createRng(12n),
    runtime,
  }, {
    pendingTemplateCompletions: 3,
    ...(choose === undefined ? {} : { choose }),
  });
  const playableMoves = prepared.completedMoves.length > 0 ? prepared.completedMoves : prepared.stochasticMoves;
  const trustedMoveIndex = new Map(
    playableMoves.map((trustedMove) => [toMoveIdentityKey(def, trustedMove.move), trustedMove] as const),
  );

  return evaluatePolicyMove({
    def,
    state,
    playerId: state.activePlayer,
    legalMoves: playableMoves.map((trustedMove) => trustedMove.move),
    trustedMoveIndex,
    rng: prepared.rng,
    runtime,
    completionStatistics: prepared.statistics,
    movePreparations: prepared.movePreparations,
    ...(previewDependencies === undefined ? {} : { previewDependencies }),
  });
}

function prepareGuidedPolicyMoves(
  def: GameDef,
  state: GameState,
  legalMoves: readonly ClassifiedMove[],
  runtime: ReturnType<typeof createGameDefRuntime>,
  seed: bigint,
) {
  const resolvedProfile = resolveEffectivePolicyProfile(def, state.activePlayer);
  const choose = resolvedProfile === null
    ? undefined
    : buildCompletionChooseCallback({
        state,
        def,
        catalog: resolvedProfile.catalog,
        playerId: state.activePlayer,
        seatId: resolvedProfile.seatId,
        profile: resolvedProfile.profile,
        runtime,
      });
  return preparePlayableMoves({
    def,
    state,
    legalMoves,
    rng: createRng(seed),
    runtime,
  }, {
    pendingTemplateCompletions: 3,
    ...(choose === undefined ? {} : { choose }),
  });
}

function selectPreparedGrantedOperation(
  def: GameDef,
  postEventState: GameState,
  runtime: ReturnType<typeof createGameDefRuntime>,
): { move: Move; score: number } | undefined {
  const resolvedProfile = resolveEffectivePolicyProfile(def, postEventState.activePlayer);
  const choose = resolvedProfile === null
    ? undefined
    : buildCompletionChooseCallback({
        state: postEventState,
        def,
        catalog: resolvedProfile.catalog,
        playerId: postEventState.activePlayer,
        seatId: resolvedProfile.seatId,
        profile: resolvedProfile.profile,
        runtime,
      });
  const prepared = preparePlayableMoves({
    def,
    state: postEventState,
    legalMoves: enumerateLegalMoves(def, postEventState, undefined, runtime).moves,
    rng: createRng(13n),
    runtime,
  }, {
    pendingTemplateCompletions: 3,
    ...(choose === undefined ? {} : { choose }),
  });
  const playableMoves = prepared.completedMoves.length > 0 ? prepared.completedMoves : prepared.stochasticMoves;
  const actingSeatId = def.seats?.[Number(postEventState.activePlayer)]?.id;
  if (actingSeatId === undefined || playableMoves.length === 0) {
    return undefined;
  }

  const preMargin = buildPolicyVictorySurface(def, postEventState, runtime).marginBySeat.get(actingSeatId) ?? 0;
  let bestPlayable = playableMoves[0]!;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const candidate of playableMoves) {
    const afterState = applyMove(def, postEventState, candidate.move, undefined, runtime).state;
    const postMargin = buildPolicyVictorySurface(def, afterState, runtime).marginBySeat.get(actingSeatId) ?? preMargin;
    const score = postMargin - preMargin;
    if (score > bestScore) {
      bestPlayable = candidate;
      bestScore = score;
    }
  }

  return {
    move: bestPlayable.move,
    score: bestScore,
  };
}

function moveConsiderationDefs(
  definitions: Readonly<Record<string, Omit<GameSpecConsiderationDef, 'scopes'>>>,
): Readonly<Record<string, GameSpecConsiderationDef>> {
  return Object.fromEntries(
    Object.entries(definitions).map(([id, definition]) => [id, { scopes: ['move'], ...definition }]),
  );
}

function completionConsiderationDefs(
  definitions: Readonly<Record<string, Omit<GameSpecConsiderationDef, 'scopes'>>>,
): Readonly<Record<string, GameSpecConsiderationDef>> {
  return Object.fromEntries(
    Object.entries(definitions).map(([id, definition]) => [id, { scopes: ['completion'], ...definition }]),
  );
}

function disableVcCompletionGuidance(def: ReturnType<typeof assertValidatedGameDef>) {
  const vcProfile = def.agents?.profiles['vc-baseline'];
  assert.ok(vcProfile, 'expected vc-baseline profile in FITL production catalog');
  if (vcProfile === undefined || def.agents === undefined) {
    throw new Error('Expected vc-baseline policy profile');
  }
  const catalogConsiderations = def.agents.library.considerations;
  const moveOnlyConsiderations = vcProfile.use.considerations.filter(
    (considerationId) => catalogConsiderations[considerationId]?.scopes?.includes('completion') !== true,
  );

  return assertValidatedGameDef({
    ...def,
    agents: {
      ...def.agents,
      profiles: {
        ...def.agents.profiles,
        'vc-baseline': {
          ...vcProfile,
          use: {
            ...vcProfile.use,
            considerations: moveOnlyConsiderations,
          },
        },
      },
    },
  });
}

function compileFitlPolicyOverlay(
  seat: 'us' | 'vc',
  overlay: {
    readonly stateFeatures?: Readonly<Record<string, GameSpecStateFeatureDef>>;
    readonly considerations?: Readonly<Record<string, Omit<GameSpecConsiderationDef, 'scopes'>>>;
    readonly completionConsiderations?: Readonly<Record<string, Omit<GameSpecConsiderationDef, 'scopes'>>>;
    readonly profileId?: string;
  },
): GameDef {
  const { parsed } = compileProductionSpec();
  const doc = structuredClone(parsed.doc);

  assert.ok(doc.agents, 'expected FITL production doc to author agents');
  if (doc.agents === undefined) {
    throw new Error('Expected FITL agents authoring');
  }
  assert.ok(doc.agents.library, 'expected FITL production doc to author agent library');
  if (doc.agents.library === undefined) {
    throw new Error('Expected FITL agent library authoring');
  }

  const baseProfileId = doc.agents.bindings?.[seat];
  assert.ok(baseProfileId, `expected authored binding for seat "${seat}"`);
  if (baseProfileId === undefined) {
    throw new Error(`Expected authored binding for seat "${seat}"`);
  }
  const baseProfile = doc.agents.profiles?.[baseProfileId];
  assert.ok(baseProfile, `expected authored profile "${baseProfileId}" for seat "${seat}"`);
  if (baseProfile === undefined) {
    throw new Error(`Expected authored profile "${baseProfileId}"`);
  }

  const profileId = overlay.profileId ?? `${seat}-aggregation-test`;
  const considerationIds = [
    ...Object.keys(overlay.considerations ?? {}),
    ...Object.keys(overlay.completionConsiderations ?? {}),
  ];
  const overlaidDoc = {
    ...doc,
    agents: {
      ...doc.agents,
      library: {
        ...doc.agents.library,
        stateFeatures: {
          ...doc.agents.library.stateFeatures,
          ...(overlay.stateFeatures ?? {}),
        },
        considerations: {
          ...doc.agents.library.considerations,
          ...moveConsiderationDefs(overlay.considerations ?? {}),
          ...completionConsiderationDefs(overlay.completionConsiderations ?? {}),
        },
      },
      profiles: {
        ...doc.agents.profiles,
        [profileId]: {
          ...baseProfile,
          params: { ...(baseProfile.params ?? {}) },
          use: {
            pruningRules: [],
            considerations: considerationIds,
            tieBreakers: [],
          },
        },
      },
      bindings: {
        ...doc.agents.bindings,
        [seat]: profileId,
      },
    },
  };

  const validationDiagnostics = validateGameSpec(overlaidDoc);
  assert.deepEqual(
    validationDiagnostics.filter((diagnostic) => diagnostic.severity === 'error'),
    [],
    'FITL aggregation overlay should validate cleanly',
  );

  const compiled = compileGameSpecToGameDef(overlaidDoc, { sourceMap: parsed.sourceMap });
  assert.deepEqual(
    compiled.diagnostics.filter((diagnostic) => diagnostic.severity === 'error'),
    [],
    'FITL aggregation overlay should compile cleanly',
  );
  assert.ok(compiled.gameDef, 'expected compiled FITL aggregation overlay gameDef');

  return assertValidatedGameDef(compiled.gameDef);
}

function evaluateUniformStateScore(def: GameDef, state: GameState, playerId: PlayerId): number {
  const runtime = createGameDefRuntime(def);
  const legalMoveCandidates = legalMoves(def, state, undefined, runtime);
  const result = evaluatePolicyMove({
    def,
    state,
    playerId,
    legalMoves: legalMoveCandidates,
    trustedMoveIndex: new Map(),
    rng: createRng(17n),
    runtime,
  });
  const scores = result.metadata.candidates
    .map((candidate) => candidate.score)
    .filter((score): score is number => typeof score === 'number');

  assert.equal(scores.length > 0, true, 'expected at least one scored candidate');
  assert.equal(scores.every((score) => score === scores[0]), true, 'expected a state-only score term to be uniform across candidates');

  return scores[0]!;
}

function playerIdForSeat(def: GameDef, seatId: 'us' | 'vc'): PlayerId {
  assert.ok(def.seats, 'expected seats in FITL definition');
  const index = def.seats.findIndex((seat) => seat.id === seatId);
  assert.notEqual(index, -1, `expected seat ${seatId}`);
  return asPlayerId(index);
}

function countBoardTokens(
  def: GameDef,
  state: GameState,
  predicate: (token: GameState['zones'][string][number]) => boolean,
): number {
  let total = 0;
  for (const zone of def.zones) {
    if ((zone.zoneKind ?? 'board') !== 'board') {
      continue;
    }
    for (const token of state.zones[String(zone.id)] ?? []) {
      if (predicate(token)) {
        total += 1;
      }
    }
  }
  return total;
}

function sumProvinceVar(def: GameDef, state: GameState, field: string): number {
  let total = 0;
  for (const zone of def.zones) {
    if ((zone.zoneKind ?? 'board') !== 'board' || zone.category !== 'province') {
      continue;
    }
    const value = state.zoneVars[String(zone.id)]?.[field];
    if (typeof value === 'number') {
      total += value;
    }
  }
  return total;
}

function countAdjacentTokens(
  def: GameDef,
  state: GameState,
  anchorZoneId: string,
  predicate: (token: GameState['zones'][string][number]) => boolean,
): number {
  const runtime = createGameDefRuntime(def);
  let total = 0;
  for (const zoneId of queryAdjacentZones(runtime.adjacencyGraph, asZoneId(anchorZoneId))) {
    for (const token of state.zones[String(zoneId)] ?? []) {
      if (predicate(token)) {
        total += 1;
      }
    }
  }
  return total;
}

function advanceSeed6ToVcDecision() {
  const { compiled } = compileProductionSpec();
  const def = assertValidatedGameDef(compiled.gameDef);
  const runtime = createGameDefRuntime(def);
  const initial = initialState(def, 6, 4).state;
  const openingChoice = new PolicyAgent().chooseMove({
    def,
    state: initial,
    playerId: initial.activePlayer,
    legalMoves: enumerateLegalMoves(def, initial, undefined, runtime).moves,
    rng: createRng(6n),
    runtime,
  });
  const state = applyMove(def, initial, openingChoice.move, undefined, runtime).state;
  const legalMoveCandidates = legalMoves(def, state, undefined, runtime);
  const actionIds = new Set(legalMoveCandidates.map((candidate) => String(candidate.actionId)));

  assert.ok(def.seats, 'expected seats in FITL definition');
  assert.equal(def.seats[Number(state.activePlayer)]?.id, 'vc');
  assert.equal(actionIds.has('rally'), true, 'expected VC rally to be legal');
  assert.equal(actionIds.has('tax'), true, 'expected VC tax to be legal');

  return { def, state, legalMoveCandidates };
}

function traceSeedDecision(seed: number, targetPly: number) {
  const { compiled } = compileProductionSpec();
  const def = assertValidatedGameDef(compiled.gameDef);
  const runtime = createGameDefRuntime(def);
  const agents = createPolicyAgents(4).map(() => new PolicyAgent({ traceLevel: 'verbose' }));
  let state = initialState(def, seed, 4).state;

  for (let ply = 0; ply <= targetPly; ply += 1) {
    const legalMoveCandidates = enumerateLegalMoves(def, state, undefined, runtime).moves;
    const result = agents[Number(state.activePlayer)]!.chooseMove({
      def,
      state,
      playerId: state.activePlayer,
      legalMoves: legalMoveCandidates,
      rng: createRng(BigInt(seed * 1000 + ply)),
      runtime,
    });

    if (ply === targetPly) {
      return { def, state, result };
    }

    state = applyMove(def, state, result.move, undefined, runtime).state;
  }

  assert.fail(`Expected to reach seed ${seed} ply ${targetPly}`);
}


function duplicateKeyCount(keys: readonly string[]): number {
  return keys.length - new Set(keys).size;
}

describe('FITL policy agent integration', () => {
  it('compiles FITL-derived authored policy overlays with global and adjacent aggregation expressions', () => {
    const def = compileFitlPolicyOverlay('us', {
      stateFeatures: {
        vcBaseCount: {
          type: 'number',
          expr: {
            globalTokenAgg: {
              tokenFilter: {
                type: 'base',
                props: {
                  seat: { eq: '3' },
                },
              },
              aggOp: 'count',
            },
          },
        },
        totalProvinceOpposition: {
          type: 'number',
          expr: {
            globalZoneAgg: {
              source: 'variable',
              field: 'opposition',
              aggOp: 'sum',
              zoneFilter: { category: 'province' },
            },
          },
        },
        usTroopsNearSaigon: {
          type: 'number',
          expr: {
            adjacentTokenAgg: {
              anchorZone: 'saigon:none',
              tokenFilter: {
                type: 'troop',
                props: {
                  seat: { eq: '0' },
                },
              },
              aggOp: 'count',
            },
          },
        },
      },
      considerations: {
        reportVcBaseCount: {
          weight: 1,
          value: { ref: 'feature.vcBaseCount' },
        },
      },
    });
    const profile = def.agents?.profiles['us-aggregation-test'];

    assert.ok(profile, 'expected compiled aggregation profile');
    assert.equal(def.agents?.library.stateFeatures.vcBaseCount?.expr.kind, 'globalTokenAgg');
    assert.equal(def.agents?.library.stateFeatures.totalProvinceOpposition?.expr.kind, 'globalZoneAgg');
    assert.equal(def.agents?.library.stateFeatures.usTroopsNearSaigon?.expr.kind, 'adjacentTokenAgg');
    assert.deepEqual(profile?.use.considerations, ['reportVcBaseCount']);
  });

  it('evaluates authored globalTokenAgg against a manual FITL board count', () => {
    const def = compileFitlPolicyOverlay('us', {
      stateFeatures: {
        vcBaseCount: {
          type: 'number',
          expr: {
            globalTokenAgg: {
              tokenFilter: {
                type: 'base',
                props: {
                  seat: { eq: '3' },
                },
              },
              aggOp: 'count',
            },
          },
        },
      },
      considerations: {
        reportVcBaseCount: {
          weight: 1,
          value: { ref: 'feature.vcBaseCount' },
        },
      },
    });
    const baseState = initialState(def, 7, 4).state;
    const state: GameState = {
      ...baseState,
      zones: {
        ...baseState.zones,
        'tay-ninh:none': [
          ...(baseState.zones['tay-ninh:none'] ?? []),
          { id: 'vc-base-a' as never, type: 'base', props: { seat: '3', strength: 1 } },
        ],
        'quang-tri-thua-thien:none': [
          ...(baseState.zones['quang-tri-thua-thien:none'] ?? []),
          { id: 'vc-base-b' as never, type: 'base', props: { seat: '3', strength: 1 } },
        ],
        'kien-phong:none': [
          ...(baseState.zones['kien-phong:none'] ?? []),
          { id: 'vc-base-c' as never, type: 'base', props: { seat: '3', strength: 1 } },
        ],
      },
    };

    const expected = countBoardTokens(def, state, (token) => token.type === 'base' && String(token.props?.seat) === '3');
    const actual = evaluateUniformStateScore(def, state, playerIdForSeat(def, 'us'));

    assert.equal(actual, expected);
    assert.equal(actual, 3);
  });

  it('evaluates authored globalZoneAgg against a manual FITL province sum', () => {
    const def = compileFitlPolicyOverlay('us', {
      stateFeatures: {
        totalProvinceOpposition: {
          type: 'number',
          expr: {
            globalZoneAgg: {
              source: 'variable',
              field: 'opposition',
              aggOp: 'sum',
              zoneFilter: { category: 'province' },
            },
          },
        },
      },
      considerations: {
        reportProvinceOpposition: {
          weight: 1,
          value: { ref: 'feature.totalProvinceOpposition' },
        },
      },
    });
    const baseState = initialState(def, 7, 4).state;
    const state: GameState = {
      ...baseState,
      zoneVars: {
        ...baseState.zoneVars,
        'tay-ninh:none': { ...(baseState.zoneVars['tay-ninh:none'] ?? {}), opposition: 2 },
        'quang-tri-thua-thien:none': { ...(baseState.zoneVars['quang-tri-thua-thien:none'] ?? {}), opposition: 5 },
        'kien-phong:none': { ...(baseState.zoneVars['kien-phong:none'] ?? {}), opposition: 7 },
        'saigon:none': { ...(baseState.zoneVars['saigon:none'] ?? {}), opposition: 99 },
      },
    };

    const expected = sumProvinceVar(def, state, 'opposition');
    const actual = evaluateUniformStateScore(def, state, playerIdForSeat(def, 'us'));

    assert.equal(actual, expected);
    assert.equal(actual, 14);
  });

  it('evaluates authored adjacentTokenAgg against a manual FITL adjacency count', () => {
    const def = compileFitlPolicyOverlay('us', {
      stateFeatures: {
        usTroopsNearSaigon: {
          type: 'number',
          expr: {
            adjacentTokenAgg: {
              anchorZone: 'saigon:none',
              tokenFilter: {
                type: 'troop',
                props: {
                  seat: { eq: '0' },
                },
              },
              aggOp: 'count',
            },
          },
        },
      },
      considerations: {
        reportUsTroopsNearSaigon: {
          weight: 1,
          value: { ref: 'feature.usTroopsNearSaigon' },
        },
      },
    });
    const baseState = initialState(def, 7, 4).state;
    const state: GameState = {
      ...baseState,
      zones: {
        ...baseState.zones,
        'tay-ninh:none': [
          ...(baseState.zones['tay-ninh:none'] ?? []),
          { id: 'us-troop-a' as never, type: 'troop', props: { seat: '0', strength: 1 } },
          { id: 'us-troop-b' as never, type: 'troop', props: { seat: '0', strength: 1 } },
        ],
        'quang-duc-long-khanh:none': [
          ...(baseState.zones['quang-duc-long-khanh:none'] ?? []),
          { id: 'us-troop-c' as never, type: 'troop', props: { seat: '0', strength: 1 } },
        ],
        'hue:none': [
          ...(baseState.zones['hue:none'] ?? []),
          { id: 'us-troop-d' as never, type: 'troop', props: { seat: '0', strength: 1 } },
        ],
      },
    };

    const expected = countAdjacentTokens(
      def,
      state,
      'saigon:none',
      (token) => token.type === 'troop' && String(token.props?.seat) === '0',
    );
    const actual = evaluateUniformStateScore(def, state, playerIdForSeat(def, 'us'));

    assert.equal(actual, expected);
    assert.equal(actual, 3);
  });

  it('activates aggregation-driven considerations at the intended VC base threshold', () => {
    const def = compileFitlPolicyOverlay('vc', {
      stateFeatures: {
        selfBaseCount: {
          type: 'number',
          expr: {
            globalTokenAgg: {
              tokenFilter: {
                type: 'base',
                props: {
                  seat: { eq: 'self' },
                },
              },
              aggOp: 'count',
            },
          },
        },
      },
      considerations: {
        preferRallyWhenFewBases: {
          weight: 5,
          when: {
            lt: [
              { ref: 'feature.selfBaseCount' },
              4,
            ],
          },
          value: {
            boolToNumber: { ref: 'candidate.tag.rally' },
          },
        },
        preferTaxWhenManyBases: {
          weight: 5,
          when: {
            gte: [
              { ref: 'feature.selfBaseCount' },
              4,
            ],
          },
          value: {
            boolToNumber: { ref: 'candidate.tag.tax' },
          },
        },
      },
    });
    const runtime = createGameDefRuntime(def);
    const base = advanceSeed6ToVcDecision();
    const fewBasesState: GameState = {
      ...base.state,
      zones: {
        ...base.state.zones,
      },
    };
    const manyBasesZones: GameState['zones'] = {
      ...base.state.zones,
      'tay-ninh:none': [
        ...(base.state.zones['tay-ninh:none'] ?? []),
        { id: 'vc-threshold-base-a' as never, type: 'base', props: { seat: 'vc', strength: 1 } },
      ],
      'quang-tri-thua-thien:none': [
        ...(base.state.zones['quang-tri-thua-thien:none'] ?? []),
        { id: 'vc-threshold-base-b' as never, type: 'base', props: { seat: 'vc', strength: 1 } },
      ],
      'kien-phong:none': [
        ...(base.state.zones['kien-phong:none'] ?? []),
        { id: 'vc-threshold-base-c' as never, type: 'base', props: { seat: 'vc', strength: 1 } },
      ],
      'quang-duc-long-khanh:none': [
        ...(base.state.zones['quang-duc-long-khanh:none'] ?? []),
        { id: 'vc-threshold-base-d' as never, type: 'base', props: { seat: 'vc', strength: 1 } },
      ],
    };
    const manyBasesStateDraft: GameState = {
      ...base.state,
      zones: manyBasesZones,
    };
    const manyBasesHash = computeFullHash(runtime.zobristTable, manyBasesStateDraft);
    const manyBasesState: GameState = {
      ...manyBasesStateDraft,
      stateHash: manyBasesHash,
      _runningHash: manyBasesHash,
    };

    const fewBasesResult = evaluatePolicyMove({
      def,
      state: fewBasesState,
      playerId: fewBasesState.activePlayer,
      legalMoves: legalMoves(def, fewBasesState, undefined, runtime),
      trustedMoveIndex: new Map(),
      rng: createRng(23n),
      runtime,
    });
    const manyBasesResult = evaluatePolicyMove({
      def,
      state: manyBasesState,
      playerId: manyBasesState.activePlayer,
      legalMoves: legalMoves(def, manyBasesState, undefined, runtime),
      trustedMoveIndex: new Map(),
      rng: createRng(23n),
      runtime,
    });

    assert.equal(String(fewBasesResult.move.actionId), 'rally');
    assert.equal(String(manyBasesResult.move.actionId), 'tax');
  });

  it('compiles the production FITL spec with authored policy bindings for all four seats', () => {
    const { compiled } = compileProductionSpec();
    const agents = compiled.gameDef?.agents;

    assert.ok(agents);
    assert.deepEqual(agents.bindingsBySeat, {
      us: 'us-baseline',
      arvn: 'arvn-evolved',
      nva: 'nva-baseline',
      vc: 'vc-baseline',
    });
    assert.ok(agents.library.considerations.preferPopulousTargets);
    assert.deepEqual(agents.library.considerations.preferPopulousTargets?.scopes, ['completion']);
  });

  it('compiles vc-baseline profile with the authored preview config from production YAML', () => {
    const { compiled } = compileProductionSpec();
    const agents = compiled.gameDef?.agents;

    assert.ok(agents);
    assert.deepEqual(agents.profiles['vc-baseline']?.preview, {
      mode: 'tolerateStochastic',
      phase1: false,
      phase1CompletionsPerAction: 1,
    });
    assert.deepEqual(agents.profiles['us-baseline']?.preview, { mode: 'exactWorld' });
    assert.deepEqual(agents.profiles['arvn-baseline']?.preview, { mode: 'exactWorld' });
    assert.deepEqual(agents.profiles['nva-baseline']?.preview, { mode: 'exactWorld' });
  });

  it('produces stochastic preview outcomes for VC when allowWhenHiddenSampling is enabled alongside preview.mode tolerateStochastic', () => {
    const { compiled } = compileProductionSpec();
    const baseDef = assertValidatedGameDef(compiled.gameDef);

    assert.ok(baseDef.agents);
    const vcProfile = baseDef.agents.profiles['vc-baseline'];
    assert.ok(vcProfile);

    const def = assertValidatedGameDef({
      ...baseDef,
      agents: {
        ...baseDef.agents,
        surfaceVisibility: {
          ...baseDef.agents.surfaceVisibility,
          victory: {
            ...baseDef.agents.surfaceVisibility.victory,
            currentMargin: {
              current: 'public',
              preview: { visibility: 'public', allowWhenHiddenSampling: true },
            },
            currentRank: {
              current: 'public',
              preview: { visibility: 'public', allowWhenHiddenSampling: true },
            },
          },
          activeCardIdentity: {
            current: 'hidden',
            preview: { visibility: 'hidden', allowWhenHiddenSampling: false },
          },
          activeCardTag: {
            current: 'hidden',
            preview: { visibility: 'hidden', allowWhenHiddenSampling: false },
          },
          activeCardMetadata: {
            current: 'hidden',
            preview: { visibility: 'hidden', allowWhenHiddenSampling: false },
          },
          activeCardAnnotation: {
            current: 'hidden',
            preview: { visibility: 'hidden', allowWhenHiddenSampling: false },
          },
        },
        profiles: {
          ...baseDef.agents.profiles,
          'vc-baseline': {
            ...vcProfile,
            use: {
              ...vcProfile.use,
              considerations: [
                ...vcProfile.use.considerations,
                'preferProjectedSelfMargin',
              ],
            },
          },
        },
      },
    });

    const runtime = createGameDefRuntime(def);
    const base = advanceSeed6ToVcDecision();
    const state = base.state;
    const moves = enumerateLegalMoves(def, state, undefined, runtime).moves;
    const result = new PolicyAgent({ traceLevel: 'verbose' }).chooseMove({
      def,
      state,
      playerId: state.activePlayer,
      legalMoves: moves,
      rng: createRng(1n),
      runtime,
    });

    assert.equal(result.agentDecision?.kind, 'policy');
    if (result.agentDecision?.kind !== 'policy') {
      assert.fail('expected policy trace metadata');
    }
    assert.equal(result.agentDecision.resolvedProfileId, 'vc-baseline');
    assert.equal(result.agentDecision.emergencyFallback, false);

    if (result.agentDecision.candidates === undefined) {
      assert.fail('expected verbose policy candidates');
    }
    const nonPassCandidates = result.agentDecision.candidates.filter((c) => c.actionId !== 'pass');
    const stochasticCandidates = nonPassCandidates.filter((c) => c.previewOutcome === 'stochastic');
    const readyCandidates = nonPassCandidates.filter((c) => c.previewOutcome === 'ready');

    assert.ok(
      stochasticCandidates.length > 0 || readyCandidates.length > 0,
      `expected at least one stochastic or ready preview outcome for VC with preview.mode tolerateStochastic (got outcomes: ${nonPassCandidates.map((c) => c.previewOutcome).join(', ')})`,
    );
  });

  it('concretizes incomplete FITL legal-move templates before policy evaluation', () => {
    const { compiled } = compileProductionSpec();
    const def = assertValidatedGameDef(compiled.gameDef);
    const runtime = createGameDefRuntime(def);
    const state = initialState(def, 7, 4).state;
    const rawLegalMoves = legalMoves(def, state, undefined, runtime);
    const rawEventMove = rawLegalMoves.find((move) => String(move.actionId) === 'event');

    assert.ok(rawEventMove, 'expected an event template move in the initial FITL legal move set');
    if (rawEventMove === undefined) {
      return;
    }
    const rawEventViability = probeMoveViability(def, state, rawEventMove, runtime);
    assert.equal(rawEventViability.viable, true);
    if (!rawEventViability.viable) {
      assert.fail('expected the raw event template to remain viable');
    }
    assert.equal(rawEventViability.complete, false);

    const rawEventCandidate = evaluatePlayableMoveCandidate(def, state, rawEventMove, createRng(7n), runtime);
    assert.equal(
      rawEventCandidate.kind === 'playableComplete' || rawEventCandidate.kind === 'playableStochastic',
      true,
      'expected shared evaluator to produce a playable candidate classification for the raw event template',
    );

    const agent = new PolicyAgent();
    const selected = agent.chooseMove({
      def,
      state,
      playerId: state.activePlayer,
      legalMoves: enumerateLegalMoves(def, state, undefined, runtime).moves,
      rng: createRng(7n),
      runtime,
    });
    const selectedViability = probeMoveViability(def, state, selected.move, runtime);

    assert.equal(selectedViability.viable, true);
    if (!selectedViability.viable) {
      assert.fail('expected the selected move to be viable');
    }
    assert.equal(selectedViability.complete, true);
    const selectedCandidate = classifyPlayableMoveCandidate(def, state, selected.move, runtime);
    assert.equal(selectedCandidate.kind, 'playableComplete');
    assert.doesNotThrow(() => applyMove(def, state, selected.move, undefined, runtime));
    assert.equal(selected.agentDecision?.kind, 'policy');
    if (selected.agentDecision?.kind !== 'policy') {
      assert.fail('expected policy trace metadata');
    }
    assert.equal(selected.agentDecision.resolvedProfileId, 'us-baseline');
    assert.equal(selected.agentDecision.emergencyFallback, false);
  });

  it('evaluates FITL preview margins in the fixed-seed opening because victory preview allows hidden sampling', () => {
    const { compiled } = compileProductionSpec();
    const def = assertValidatedGameDef(compiled.gameDef);
    const runtime = createGameDefRuntime(def);
    const state = initialState(def, 7, 4).state;
    const legalMoves = enumerateLegalMoves(def, state, undefined, runtime).moves;
    const input = {
      def,
      state,
      playerId: state.activePlayer,
      legalMoves,
      rng: createRng(7n),
      runtime,
    } as const;
    const prepared = preparePlayableMoves(input, {
      pendingTemplateCompletions: 3,
    });
    const completedNonPassMove = prepared.completedMoves.find((candidate) => String(candidate.move.actionId) !== 'pass');

    assert.ok(completedNonPassMove, 'expected at least one completed non-pass FITL move');
    if (completedNonPassMove === undefined) {
      return;
    }

    const previewState = applyTrustedMove(def, state, completedNonPassMove, undefined, runtime).state;
    const observation = derivePlayerObservation(def, previewState, state.activePlayer);

    assert.equal(rngStatesEqual(previewState.rng, state.rng), true);
    assert.equal(observation.hiddenSamplingZones.length > 0, true);

    const result = new PolicyAgent({ traceLevel: 'verbose' }).chooseMove(input);

    assert.equal(result.agentDecision?.kind, 'policy');
    if (result.agentDecision?.kind !== 'policy') {
      assert.fail('expected policy trace metadata');
    }
    assert.equal(result.agentDecision.emergencyFallback, false);
    assert.equal(result.agentDecision.previewUsage.mode, 'exactWorld');
    assert.deepEqual(result.agentDecision.previewUsage.refIds, ['victoryCurrentMargin.currentMargin.self']);
    assert.deepEqual(result.agentDecision.previewUsage.unknownRefs, [
      {
        refId: 'victoryCurrentMargin.currentMargin.self',
        reason: 'unresolved',
      },
    ]);
    assert.deepEqual(result.agentDecision.previewUsage.outcomeBreakdown, {
      ready: 0,
      stochastic: 0,
      unknownRandom: 0,
      unknownHidden: 0,
      unknownUnresolved: 6,
      unknownFailed: 0,
    });
    if (result.agentDecision.candidates === undefined) {
      assert.fail('expected verbose policy candidates');
    }

    const evaluatedNonPassCandidate = result.agentDecision.candidates.find((candidate) => candidate.actionId !== 'pass');

    assert.ok(evaluatedNonPassCandidate, 'expected at least one evaluated non-pass candidate');
    assert.equal(evaluatedNonPassCandidate?.previewOutcome, 'unresolved');
    assert.deepEqual(evaluatedNonPassCandidate?.unknownPreviewRefs, [
      {
        refId: 'victoryCurrentMargin.currentMargin.self',
        reason: 'unresolved',
      },
    ]);
  });

  it('deduplicates post-template-completion playable outputs on the seed-6 VC decision reproducer', () => {
    const guided = advanceSeed6ToVcFreeRally();
    const prepared = prepareGuidedPolicyMoves(
      guided.def,
      guided.state,
      guided.legalMoves,
      guided.runtime,
      6001n,
    );
    const completedKeys = prepared.completedMoves.map((candidate) => toMoveIdentityKey(guided.def, candidate.move));

    assert.ok(completedKeys.length > 0, 'expected completed FITL candidates on the VC decision state');
    assert.equal(duplicateKeyCount(completedKeys), 0, 'expected completed playable outputs to be unique by stableMoveKey');
    assert.equal(prepared.statistics.duplicatesRemoved, 10, 'expected the seed-6 VC reproducer to remove the known duplicate playable outputs');
  });

  it('keeps non-event preview differentiation intact on a VC decision with rally, terror, and attack candidates', () => {
    const { result } = traceSeedDecision(1, 1);

    assert.equal(result.agentDecision?.kind, 'policy');
    if (result.agentDecision?.kind !== 'policy') {
      assert.fail('expected policy trace metadata');
    }
    if (result.agentDecision.candidates === undefined) {
      assert.fail('expected verbose policy candidates');
    }

    const relevant = result.agentDecision.candidates.filter(
      (candidate) => candidate.actionId === 'rally' || candidate.actionId === 'terror' || candidate.actionId === 'attack',
    );
    const firstByAction = new Map<string, typeof relevant[number]>();
    for (const candidate of relevant) {
      if (!firstByAction.has(candidate.actionId)) {
        firstByAction.set(candidate.actionId, candidate);
      }
    }
    const scores = [...firstByAction.values()].map((candidate) => candidate.score);

    assert.equal(firstByAction.has('rally'), true, 'expected a rally candidate');
    assert.equal(firstByAction.has('terror'), true, 'expected a terror candidate');
    assert.equal(firstByAction.has('attack'), true, 'expected an attack candidate');
    assert.equal(
      [...firstByAction.values()].every((candidate) => candidate.previewOutcome === 'unresolved'),
      true,
      'expected non-event candidates to remain unresolved during phase-1 template preview evaluation',
    );
    assert.equal(
      new Set(scores).size > 1,
      true,
      'expected non-event action types to retain differentiated total scores',
    );
  });

  it('runs fixed-seed FITL policy self-play without runtime failures or fallback', () => {
    const { compiled } = compileProductionSpec();
    const def = assertValidatedGameDef(compiled.gameDef);
    const agents = createPolicyAgents(4);

    const trace = runGame(def, 11, agents, 5, 4);

    assert.equal(trace.moves.length > 0, true);
    for (const move of trace.moves) {
      assert.equal(move.agentDecision?.kind, 'policy');
      if (move.agentDecision?.kind !== 'policy') {
        assert.fail('expected policy trace metadata');
      }
      assert.equal(move.agentDecision.emergencyFallback, false);
      assert.ok(
        move.agentDecision.resolvedProfileId === 'us-baseline'
          || move.agentDecision.resolvedProfileId === 'arvn-evolved'
          || move.agentDecision.resolvedProfileId === 'nva-baseline'
          || move.agentDecision.resolvedProfileId === 'vc-baseline',
      );
    }
  });

  it('handles seed 17 free-operation outcome-policy dead-end without runtime failure or fallback', () => {
    const { compiled } = compileProductionSpec();
    const def = assertValidatedGameDef(compiled.gameDef);
    const agents = createPolicyAgents(4);

    const trace = runGame(def, 17, agents, 5, 4);

    assert.equal(trace.moves.length > 0, true);
    assert.equal(trace.stopReason === 'noLegalMoves' || trace.stopReason === 'maxTurns' || trace.stopReason === 'terminal', true);
    for (const move of trace.moves) {
      assert.equal(move.agentDecision?.kind, 'policy');
      if (move.agentDecision?.kind !== 'policy') {
        assert.fail('expected policy trace metadata');
      }
      assert.equal(move.agentDecision.emergencyFallback, false);
    }
  });

  it('produces viable moves with and without VC completion guidance on seed-6 free Rally state', () => {
    // Verify that both guided and unguided agents produce valid, executable
    // moves at the seed-6 free-rally decision point. This test is deliberately
    // profile-evolution-resilient: it does not assert specific action choices
    // or target spaces, since the vc-baseline profile's move-level scoring
    // (e.g. preferProjectedSelfMargin) may legitimately favor different actions
    // as the profile evolves.
    const guided = advanceSeed6ToVcFreeRally();
    const unguidedDef = disableVcCompletionGuidance(guided.def);
    const unguidedRuntime = createGameDefRuntime(unguidedDef);
    const guidedAgent = new PolicyAgent();
    const unguidedAgent = new PolicyAgent();

    const guidedMove = guidedAgent.chooseMove({
      def: guided.def,
      state: guided.state,
      playerId: guided.state.activePlayer,
      legalMoves: guided.legalMoves,
      rng: createRng(12n),
      runtime: guided.runtime,
    });
    const unguidedMove = unguidedAgent.chooseMove({
      def: unguidedDef,
      state: guided.state,
      playerId: guided.state.activePlayer,
      legalMoves: enumerateLegalMoves(unguidedDef, guided.state, undefined, unguidedRuntime).moves,
      rng: createRng(12n),
      runtime: unguidedRuntime,
    });

    // Both agents must produce a viable, executable move.
    assert.ok(guidedMove.move, 'guided agent must select a move');
    assert.ok(unguidedMove.move, 'unguided agent must select a move');
    assert.doesNotThrow(
      () => applyMove(guided.def, guided.state, guidedMove.move, undefined, guided.runtime),
      'guided move must be applicable',
    );
    assert.doesNotThrow(
      () => applyMove(unguidedDef, guided.state, unguidedMove.move, undefined, unguidedRuntime),
      'unguided move must be applicable',
    );

    // Both must resolve to a real policy profile (not fallback).
    assert.equal(guidedMove.agentDecision?.kind, 'policy');
    assert.equal(unguidedMove.agentDecision?.kind, 'policy');
    assert.equal(guidedMove.agentDecision?.emergencyFallback, false);
    assert.equal(unguidedMove.agentDecision?.emergencyFallback, false);
  });

  it('keeps FITL overlay action selection and phase-1 ranking stable when completion guidance is added', () => {
    const base = advanceSeed6ToVcDecision();
    const guidedDef = compileFitlPolicyOverlay('vc', {
      profileId: 'vc-two-phase-overlay-guided',
      considerations: {
        preferRally: {
          weight: 5,
          value: {
            boolToNumber: { ref: 'candidate.tag.rally' },
          },
        },
      },
      completionConsiderations: {
        preferHigherPopulation: {
          when: { eq: [{ ref: 'decision.type' }, 'chooseOne'] },
          weight: 1,
          value: {
            coalesce: [
              {
                zoneProp: {
                  zone: { ref: 'option.value' },
                  prop: 'population',
                },
              },
              0,
            ],
          },
        },
      },
    });
    const unguidedDef = compileFitlPolicyOverlay('vc', {
      profileId: 'vc-two-phase-overlay-unguided',
      considerations: {
        preferRally: {
          weight: 5,
          value: {
            boolToNumber: { ref: 'candidate.tag.rally' },
          },
        },
      },
    });
    const guidedRuntime = createGameDefRuntime(guidedDef);
    const unguidedRuntime = createGameDefRuntime(unguidedDef);
    const guidedMoves = enumerateLegalMoves(guidedDef, base.state, undefined, guidedRuntime).moves;
    const unguidedMoves = enumerateLegalMoves(unguidedDef, base.state, undefined, unguidedRuntime).moves;
    const agent = new PolicyAgent({ traceLevel: 'summary' });

    const guidedResult = agent.chooseMove({
      def: guidedDef,
      state: base.state,
      playerId: base.state.activePlayer,
      legalMoves: guidedMoves,
      rng: createRng(12n),
      runtime: guidedRuntime,
    });
    const unguidedResult = agent.chooseMove({
      def: unguidedDef,
      state: base.state,
      playerId: base.state.activePlayer,
      legalMoves: unguidedMoves,
      rng: createRng(12n),
      runtime: unguidedRuntime,
    });

    assert.equal(guidedResult.agentDecision?.kind, 'policy');
    assert.equal(unguidedResult.agentDecision?.kind, 'policy');
    if (guidedResult.agentDecision?.kind !== 'policy' || unguidedResult.agentDecision?.kind !== 'policy') {
      assert.fail('expected policy trace metadata');
    }

    assert.equal(String(guidedResult.move.actionId), 'rally');
    assert.equal(String(unguidedResult.move.actionId), 'rally');
    assert.deepEqual(guidedResult.agentDecision.phase1ActionRanking, unguidedResult.agentDecision.phase1ActionRanking);
    assert.equal(guidedResult.agentDecision.phase1ActionRanking?.[0], 'rally');
    assert.equal(guidedResult.agentDecision.emergencyFallback, false);
    assert.equal(unguidedResult.agentDecision.emergencyFallback, false);
    assert.doesNotThrow(() => applyMove(guidedDef, base.state, guidedResult.move, undefined, guidedRuntime));
    assert.doesNotThrow(() => applyMove(unguidedDef, base.state, unguidedResult.move, undefined, unguidedRuntime));
  });

  it('exposes granted-operation trace metadata on a production Sihanouk VC decision state without perturbing non-event candidate scores', () => {
    const guided = createSihanoukVcGrantState();
    const enabled = evaluatePreparedPolicyDecision(
      guided.def,
      guided.state,
      guided.legalMoves,
      guided.runtime,
      {
        evaluateGrantedOperation: (def, postEventState) => selectPreparedGrantedOperation(def, postEventState, guided.runtime),
      },
    );
    const disabled = evaluatePreparedPolicyDecision(
      guided.def,
      guided.state,
      guided.legalMoves,
      guided.runtime,
      { evaluateGrantedOperation: () => undefined },
    );

    const enabledGrantingCandidate = enabled.metadata.candidates.find((candidate) => candidate.grantedOperationSimulated === true);
    assert.notEqual(enabledGrantingCandidate, undefined, 'expected a granting event candidate in the Sihanouk VC decision state');

    const disabledGrantingCandidate = disabled.metadata.candidates.find(
      (candidate) => candidate.stableMoveKey === enabledGrantingCandidate!.stableMoveKey,
    );
    assert.notEqual(disabledGrantingCandidate, undefined, 'expected the same candidate under single-step preview');

    assert.equal(enabledGrantingCandidate!.actionId, 'event');
    assert.notEqual(enabledGrantingCandidate!.grantedOperationMove, undefined, 'expected granted-operation trace details');
    assert.equal(
      typeof enabledGrantingCandidate!.grantedOperationMarginDelta === 'number',
      true,
      'expected granted-operation margin delta',
    );
    assert.equal(typeof enabledGrantingCandidate!.score, 'number');
    assert.equal(typeof disabledGrantingCandidate!.score, 'number');

    const enabledNonEvents = new Map(
      enabled.metadata.candidates
        .filter((candidate) => candidate.actionId !== 'event')
        .map((candidate) => [candidate.stableMoveKey, candidate.score] as const),
    );
    const disabledNonEvents = new Map(
      disabled.metadata.candidates
        .filter((candidate) => candidate.actionId !== 'event')
        .map((candidate) => [candidate.stableMoveKey, candidate.score] as const),
    );

    assert.deepEqual(enabledNonEvents, disabledNonEvents, 'expected non-event candidate scores to remain unchanged');
  });

  it('does not mutate the external pre-move snapshot while guided completion runs', () => {
    const guided = advanceSeed6ToVcFreeRally();
    const snapshot = structuredClone(guided.state);

    void new PolicyAgent().chooseMove({
      def: guided.def,
      state: guided.state,
      playerId: guided.state.activePlayer,
      legalMoves: guided.legalMoves,
      rng: createRng(12n),
      runtime: guided.runtime,
    });

    assert.deepEqual(guided.state, snapshot);
  });

  it('replays guided FITL policy self-play deterministically across curated seeds without fallback', () => {
    const { compiled } = compileProductionSpec();
    const def = assertValidatedGameDef(compiled.gameDef);
    const seeds = [11, 17, 23];

    for (const seed of seeds) {
      const first = runGame(def, seed, createPolicyAgents(4), 8, 4);
      const second = runGame(def, seed, createPolicyAgents(4), 8, 4);

      assert.equal(first.finalState.stateHash, second.finalState.stateHash, `seed ${seed} should replay to the same final hash`);
      assert.equal(first.moves.length > 0, true, `seed ${seed} should produce at least one move`);
      for (const trace of [first, second]) {
        for (const move of trace.moves) {
          assert.equal(move.agentDecision?.kind, 'policy');
          if (move.agentDecision?.kind !== 'policy') {
            assert.fail(`seed ${seed} expected policy trace metadata`);
          }
          assert.equal(move.agentDecision.emergencyFallback, false, `seed ${seed} should not trigger policy fallback`);
        }
      }
    }
  });
});
