import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { evaluatePolicyMove } from '../../../src/agents/policy-eval.js';
import { compileGameSpecToGameDef, validateGameSpec } from '../../../src/cnl/index.js';
import type { GameSpecConsiderationDef } from '../../../src/cnl/game-spec-doc.js';
import { toMoveIdentityKey } from '../../../src/kernel/move-identity.js';
import {
  applyMove,
  assertValidatedGameDef,
  asPlayerId,
  enumerateLegalMoves,
  createGameDefRuntime,
  createRng,
  initialState,
  type ClassifiedMove,
  type GameDef,
  type GameState,
  type PlayerId,
  type TrustedExecutableMove,
} from '../../../src/kernel/index.js';
import { preparePlayableMoves } from '../../../src/agents/prepare-playable-moves.js';
import { resolveEffectivePolicyProfile } from '../../../src/agents/policy-profile-resolution.js';
import { buildCompletionChooseCallback } from '../../../src/agents/completion-guidance-choice.js';
import { PolicyAgent } from '../../../src/agents/policy-agent.js';
import { compileProductionSpec } from '../../helpers/production-spec-helpers.js';

function moveConsiderationDefs(
  definitions: Readonly<Record<string, Omit<GameSpecConsiderationDef, 'scopes'>>>,
): Readonly<Record<string, GameSpecConsiderationDef>> {
  return Object.fromEntries(
    Object.entries(definitions).map(([id, definition]) => [id, { scopes: ['move'], ...definition }]),
  );
}

function compileFitlPreviewFeatureOverlay(seat: 'vc'): GameDef {
  const { parsed } = compileProductionSpec();
  const doc = structuredClone(parsed.doc);

  assert.ok(doc.agents?.library, 'expected FITL production doc to author agents');
  const baseProfileId = doc.agents?.bindings?.[seat];
  assert.ok(baseProfileId, `expected authored binding for seat "${seat}"`);
  const baseProfile = baseProfileId === undefined ? undefined : doc.agents?.profiles?.[baseProfileId];
  assert.ok(baseProfile, `expected authored profile "${baseProfileId}"`);
  if (doc.agents === undefined || doc.agents.library === undefined || baseProfileId === undefined || baseProfile === undefined) {
    throw new Error('Expected FITL agent authoring');
  }

  const profileId = 'vc-preview-feature-test';
  const overlaidDoc = {
    ...doc,
    agents: {
      ...doc.agents,
      library: {
        ...doc.agents.library,
        candidateFeatures: {
          ...doc.agents.library.candidateFeatures,
          projectedVcGuerrillaCount: {
            type: 'number',
            expr: {
              coalesce: [
                { ref: 'preview.feature.vcGuerrillaCount' },
                { ref: 'feature.vcGuerrillaCount' },
              ],
            },
          },
        },
        considerations: {
          ...doc.agents.library.considerations,
          ...moveConsiderationDefs({
            preferProjectedVcGuerrillaCount: {
              weight: 1,
              value: { ref: 'feature.projectedVcGuerrillaCount' },
            },
          }),
        },
      },
      profiles: {
        ...doc.agents.profiles,
        [profileId]: {
          ...baseProfile,
          params: { ...(baseProfile.params ?? {}) },
          use: {
            pruningRules: [],
            considerations: ['preferProjectedVcGuerrillaCount'],
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
    'FITL preview-feature overlay should validate cleanly',
  );

  const compiled = compileGameSpecToGameDef(overlaidDoc, { sourceMap: parsed.sourceMap });
  assert.deepEqual(
    compiled.diagnostics.filter((diagnostic) => diagnostic.severity === 'error'),
    [],
    'FITL preview-feature overlay should compile cleanly',
  );
  assert.ok(compiled.gameDef, 'expected compiled FITL preview-feature overlay gameDef');

  return assertValidatedGameDef(compiled.gameDef);
}

function advanceSeed6ToVcDecision(def: GameDef) {
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
  const legalMoveCandidates = enumerateLegalMoves(def, state, undefined, runtime).moves;
  const actionIds = new Set(legalMoveCandidates.map((candidate) => String(candidate.move.actionId)));

  assert.ok(def.seats, 'expected seats in FITL definition');
  assert.equal(def.seats[Number(state.activePlayer)]?.id, 'vc');
  assert.equal(actionIds.has('rally'), true, 'expected VC rally to be legal');
  assert.equal(actionIds.has('tax'), true, 'expected VC tax to be legal');

  return { runtime, state, legalMoveCandidates } as const;
}

function evaluatePreparedPolicyDecision(
  def: GameDef,
  state: GameState,
  legalMoveCandidates: readonly ClassifiedMove[],
  runtime: ReturnType<typeof createGameDefRuntime>,
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
      legalMoves: legalMoveCandidates,
    rng: createRng(12n),
    runtime,
  }, {
    pendingTemplateCompletions: 3,
    ...(choose === undefined ? {} : { choose }),
  });
  const playableMoves = prepared.completedMoves.length > 0 ? prepared.completedMoves : prepared.stochasticMoves;
  const trustedMoveIndex = new Map<string, TrustedExecutableMove>(
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
  });
}

function playerIdForSeat(def: GameDef, seatId: 'vc'): PlayerId {
  assert.ok(def.seats, 'expected seats in FITL definition');
  const index = def.seats.findIndex((seat) => seat.id === seatId);
  assert.notEqual(index, -1, `expected seat ${seatId}`);
  return asPlayerId(index);
}

describe('FITL preview.feature policy surface integration', () => {
  it('evaluates preview.feature.vcGuerrillaCount against preview state and reports it in trace metadata', () => {
    const def = compileFitlPreviewFeatureOverlay('vc');
    const { runtime, state, legalMoveCandidates } = advanceSeed6ToVcDecision(def);

    const result = evaluatePreparedPolicyDecision(def, state, legalMoveCandidates, runtime);
    const rallyCandidate = result.metadata.candidates.find((candidate) => candidate.actionId === 'rally');
    const taxCandidate = result.metadata.candidates.find((candidate) => candidate.actionId === 'tax');

    assert.ok(rallyCandidate, 'expected rally candidate in prepared evaluation');
    assert.ok(taxCandidate, 'expected tax candidate in prepared evaluation');
    assert.deepEqual(result.metadata.previewUsage.refIds, ['feature.vcGuerrillaCount']);
    assert.equal(rallyCandidate?.previewOutcome, 'ready');
    assert.deepEqual(rallyCandidate?.previewRefIds, ['feature.vcGuerrillaCount']);
    assert.equal((rallyCandidate?.score ?? Number.NEGATIVE_INFINITY) > (taxCandidate?.score ?? Number.NEGATIVE_INFINITY), true);
  });

  it('reports preview.feature.vcGuerrillaCount in unknownPreviewRefs when raw FITL preview is unresolved', () => {
    const def = compileFitlPreviewFeatureOverlay('vc');
    const { runtime, state, legalMoveCandidates } = advanceSeed6ToVcDecision(def);
    const playerId = playerIdForSeat(def, 'vc');

    const result = evaluatePolicyMove({
      def,
      state,
      playerId,
      legalMoves: legalMoveCandidates.map((candidate) => candidate.move),
      trustedMoveIndex: new Map(),
      rng: createRng(12n),
      runtime,
    });

    assert.deepEqual(result.metadata.previewUsage.refIds, ['feature.vcGuerrillaCount']);
    const unresolved = result.metadata.candidates.find(
      (candidate) => candidate.unknownPreviewRefs.some((entry) => entry.refId === 'feature.vcGuerrillaCount'),
    );
    assert.ok(unresolved, 'expected at least one candidate with unresolved preview.feature metadata');
  });
});
