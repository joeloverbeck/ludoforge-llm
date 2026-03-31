import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../src/agents/policy-agent.js';
import { evaluatePolicyMove } from '../../src/agents/policy-eval.js';
import { preparePlayableMoves } from '../../src/agents/prepare-playable-moves.js';
import { compileGameSpecToGameDef, validateGameSpec } from '../../src/cnl/index.js';
import type { GameSpecScoreTermDef, GameSpecStateFeatureDef } from '../../src/cnl/game-spec-doc.js';
import { applyTrustedMove } from '../../src/kernel/apply-move.js';
import {
  applyMove,
  asPlayerId,
  asZoneId,
  assertValidatedGameDef,
  classifyPlayableMoveCandidate,
  createRng,
  createGameDefRuntime,
  enumerateLegalMoves,
  evaluatePlayableMoveCandidate,
  initialState,
  legalMoves,
  probeMoveViability,
  type GameDef,
  type GameState,
  type PlayerId,
} from '../../src/kernel/index.js';
import { derivePlayerObservation } from '../../src/kernel/observation.js';
import { queryAdjacentZones } from '../../src/kernel/spatial.js';
import { runGame } from '../../src/sim/simulator.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

function rngStatesEqual(left: { readonly algorithm: string; readonly version: number; readonly state: readonly bigint[] }, right: { readonly algorithm: string; readonly version: number; readonly state: readonly bigint[] }): boolean {
  return left.algorithm === right.algorithm
    && left.version === right.version
    && left.state.length === right.state.length
    && left.state.every((entry, index) => entry === right.state[index]);
}

function createPolicyAgents(count: number): PolicyAgent[] {
  return Array.from({ length: count }, () => new PolicyAgent());
}

function advanceSeed11ToVcFreeRally() {
  const { compiled } = compileProductionSpec();
  const def = assertValidatedGameDef(compiled.gameDef);
  const runtime = createGameDefRuntime(def);
  let state = initialState(def, 11, 4).state;
  const openingAgent = new PolicyAgent();
  const openingLegalMoves = enumerateLegalMoves(def, state, undefined, runtime).moves;
  const openingMove = openingAgent.chooseMove({
    def,
    state,
    playerId: state.activePlayer,
    legalMoves: openingLegalMoves,
    rng: createRng(11n),
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

function disableVcCompletionGuidance(def: ReturnType<typeof assertValidatedGameDef>) {
  const vcProfile = def.agents?.profiles['vc-evolved'];
  assert.ok(vcProfile, 'expected vc-evolved profile in FITL production catalog');
  if (vcProfile === undefined || def.agents === undefined) {
    throw new Error('Expected vc-evolved policy profile');
  }

  return assertValidatedGameDef({
    ...def,
    agents: {
      ...def.agents,
      profiles: {
        ...def.agents.profiles,
        'vc-evolved': {
          ...vcProfile,
          use: {
            ...vcProfile.use,
            completionScoreTerms: [],
          },
          completionGuidance: {
            enabled: false,
            fallback: 'random',
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
    readonly scoreTerms?: Readonly<Record<string, GameSpecScoreTermDef>>;
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

  const profileId = overlay.profileId ?? `${seat}-aggregation-test`;
  const scoreTermIds = Object.keys(overlay.scoreTerms ?? {});
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
      scoreTerms: {
        ...doc.agents.library.scoreTerms,
        ...(overlay.scoreTerms ?? {}),
      },
    },
    profiles: {
      ...doc.agents.profiles,
      [profileId]: {
        params: {},
        use: {
          pruningRules: [],
          scoreTerms: scoreTermIds,
          completionScoreTerms: [],
          tieBreakers: ['stableMoveKey'],
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

function advanceSeed1ToVcDecision() {
  const { compiled } = compileProductionSpec();
  const def = assertValidatedGameDef(compiled.gameDef);
  const runtime = createGameDefRuntime(def);
  const initial = initialState(def, 1, 4).state;
  const openingChoice = new PolicyAgent().chooseMove({
    def,
    state: initial,
    playerId: initial.activePlayer,
    legalMoves: enumerateLegalMoves(def, initial, undefined, runtime).moves,
    rng: createRng(1n),
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
      scoreTerms: {
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
    assert.deepEqual(profile?.use.scoreTerms, ['reportVcBaseCount']);
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
      scoreTerms: {
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
      scoreTerms: {
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
      scoreTerms: {
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

  it('activates aggregation-driven scoreTerms at the intended VC base threshold', () => {
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
      scoreTerms: {
        preferRallyWhenFewBases: {
          weight: 5,
          when: {
            lt: [
              { ref: 'feature.selfBaseCount' },
              4,
            ],
          },
          value: {
            boolToNumber: { ref: 'feature.isRally' },
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
            boolToNumber: { ref: 'feature.isTax' },
          },
        },
      },
    });
    const runtime = createGameDefRuntime(def);
    const base = advanceSeed1ToVcDecision();
    const fewBasesState: GameState = {
      ...base.state,
      zones: {
        ...base.state.zones,
      },
    };
    const manyBasesState: GameState = {
      ...base.state,
      zones: {
        ...base.state.zones,
        'tay-ninh:none': [
          ...(base.state.zones['tay-ninh:none'] ?? []),
          { id: 'vc-threshold-base-a' as never, type: 'base', props: { seat: base.state.activePlayer, strength: 1 } },
        ],
        'quang-tri-thua-thien:none': [
          ...(base.state.zones['quang-tri-thua-thien:none'] ?? []),
          { id: 'vc-threshold-base-b' as never, type: 'base', props: { seat: base.state.activePlayer, strength: 1 } },
        ],
        'kien-phong:none': [
          ...(base.state.zones['kien-phong:none'] ?? []),
          { id: 'vc-threshold-base-c' as never, type: 'base', props: { seat: base.state.activePlayer, strength: 1 } },
        ],
        'quang-duc-long-khanh:none': [
          ...(base.state.zones['quang-duc-long-khanh:none'] ?? []),
          { id: 'vc-threshold-base-d' as never, type: 'base', props: { seat: base.state.activePlayer, strength: 1 } },
        ],
      },
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
      arvn: 'arvn-baseline',
      nva: 'nva-baseline',
      vc: 'vc-evolved',
    });
    assert.deepEqual(agents.profiles['vc-evolved']?.use.completionScoreTerms, ['preferPopulousTargets']);
    assert.deepEqual(agents.profiles['vc-evolved']?.completionGuidance, {
      enabled: true,
      fallback: 'random',
    });
    assert.ok(agents.library.completionScoreTerms.preferPopulousTargets);
  });

  it('compiles vc-evolved profile with preview.tolerateRngDivergence from production YAML', () => {
    const { compiled } = compileProductionSpec();
    const agents = compiled.gameDef?.agents;

    assert.ok(agents);
    assert.deepEqual(agents.profiles['vc-evolved']?.preview, {
      tolerateRngDivergence: true,
    });
    assert.equal(agents.profiles['us-baseline']?.preview, undefined);
    assert.equal(agents.profiles['arvn-baseline']?.preview, undefined);
    assert.equal(agents.profiles['nva-baseline']?.preview, undefined);
  });

  it('produces stochastic preview outcomes for VC when allowWhenHiddenSampling is enabled alongside tolerateRngDivergence', () => {
    const { compiled } = compileProductionSpec();
    const baseDef = assertValidatedGameDef(compiled.gameDef);

    assert.ok(baseDef.agents);
    const vcProfile = baseDef.agents.profiles['vc-evolved'];
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
          'vc-evolved': {
            ...vcProfile,
            use: {
              ...vcProfile.use,
              scoreTerms: [
                ...vcProfile.use.scoreTerms,
                'preferProjectedSelfMargin',
              ],
            },
          },
        },
      },
    });

    const runtime = createGameDefRuntime(def);
    const base = advanceSeed1ToVcDecision();
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
    assert.equal(result.agentDecision.resolvedProfileId, 'vc-evolved');
    assert.equal(result.agentDecision.emergencyFallback, false);

    if (result.agentDecision.candidates === undefined) {
      assert.fail('expected verbose policy candidates');
    }
    const nonPassCandidates = result.agentDecision.candidates.filter((c) => c.actionId !== 'pass');
    const stochasticCandidates = nonPassCandidates.filter((c) => c.previewOutcome === 'stochastic');
    const readyCandidates = nonPassCandidates.filter((c) => c.previewOutcome === 'ready');

    assert.ok(
      stochasticCandidates.length > 0 || readyCandidates.length > 0,
      `expected at least one stochastic or ready preview outcome for VC with tolerateRngDivergence (got outcomes: ${nonPassCandidates.map((c) => c.previewOutcome).join(', ')})`,
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

  it('keeps FITL preview margins unknown in the fixed-seed opening because post-move observation still requires hidden sampling', () => {
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
    assert.equal(observation.requiresHiddenSampling, true);

    const result = new PolicyAgent({ traceLevel: 'verbose' }).chooseMove(input);

    assert.equal(result.agentDecision?.kind, 'policy');
    if (result.agentDecision?.kind !== 'policy') {
      assert.fail('expected policy trace metadata');
    }
    assert.equal(result.agentDecision.emergencyFallback, false);
    assert.deepEqual(result.agentDecision.previewUsage.refIds, ['victoryCurrentMargin.currentMargin.self']);
    assert.deepEqual(result.agentDecision.previewUsage.unknownRefs, [
      { refId: 'victoryCurrentMargin.currentMargin.self', reason: 'hidden' },
    ]);
    assert.deepEqual(result.agentDecision.previewUsage.outcomeBreakdown, {
      ready: 0,
      unknownRandom: 0,
      unknownHidden: 18,
      unknownUnresolved: 0,
      unknownFailed: 0,
    });
    if (result.agentDecision.candidates === undefined) {
      assert.fail('expected verbose policy candidates');
    }

    const evaluatedNonPassCandidate = result.agentDecision.candidates.find((candidate) => candidate.actionId !== 'pass');

    assert.ok(evaluatedNonPassCandidate, 'expected at least one evaluated non-pass candidate');
    assert.equal(evaluatedNonPassCandidate?.previewOutcome, 'hidden');
    assert.deepEqual(
      evaluatedNonPassCandidate?.unknownPreviewRefs,
      [{ refId: 'victoryCurrentMargin.currentMargin.self', reason: 'hidden' }],
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
          || move.agentDecision.resolvedProfileId === 'arvn-baseline'
          || move.agentDecision.resolvedProfileId === 'nva-baseline'
          || move.agentDecision.resolvedProfileId === 'vc-evolved',
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

  it('uses production VC guidance with preferPopulousTargets scoring on seed-11 free Rally target-space set', () => {
    const guided = advanceSeed11ToVcFreeRally();
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

    assert.equal(String(guidedMove.move.move.actionId), 'rally');
    assert.equal(String(unguidedMove.move.move.actionId), 'rally');
    assert.deepEqual(
      guidedMove.move.move.params['decision:doc.actionPipelines.9.stages[0].effects.0.if.else.0.chooseN::$targetSpaces'],
      ['sihanoukville:none'],
    );
    assert.deepEqual(
      unguidedMove.move.move.params['decision:doc.actionPipelines.9.stages[0].effects.0.if.else.0.chooseN::$targetSpaces'],
      ['sihanoukville:none'],
    );
  });

  it('does not mutate the external pre-move snapshot while guided completion runs', () => {
    const guided = advanceSeed11ToVcFreeRally();
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
