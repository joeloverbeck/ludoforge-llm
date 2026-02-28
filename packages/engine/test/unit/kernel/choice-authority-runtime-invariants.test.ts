import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  EFFECT_RUNTIME_REASONS,
  applyEffect,
  applyEffects,
  asActionId,
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  createCollector,
  isEffectErrorCode,
  type ActionDef,
  type EffectAST,
  type GameDef,
  type GameState,
} from '../../../src/kernel/index.js';
import {
  makeDiscoveryEffectContext,
  makeDiscoveryProbeEffectContext,
  makeExecutionEffectContext,
} from '../../helpers/effect-context-test-helpers.js';
import {
  CHOICE_OWNER_PLAYER,
  buildChooserOwnedChoiceEffect,
  ownershipSelection,
  type ChoiceOwnershipPrimitive,
} from '../../helpers/choice-ownership-parity-helpers.js';

const makeDef = (effects: readonly EffectAST[]): GameDef =>
  ({
    metadata: { id: 'choice-authority-runtime-invariants', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [
      { id: asZoneId('hand:0'), owner: 'player', visibility: 'owner', ordering: 'stack' },
      { id: asZoneId('discard:none'), owner: 'none', visibility: 'public', ordering: 'stack' },
    ],
    tokenTypes: [{ id: 'piece', props: {} }],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [
      {
        id: asActionId('decide'),
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects,
        limits: [],
      } as ActionDef,
    ],
    triggers: [],
    terminal: { conditions: [] },
  }) as unknown as GameDef;

const makeState = (): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 2,
  zones: {
    'hand:0': [{ id: asTokenId('tok-1'), type: 'piece', props: {} }],
    'discard:none': [],
  },
  nextTokenOrdinal: 1,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
  stateHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
});

const assertEffectRuntimeReason = (fn: () => unknown, expectedReason: string): void => {
  assert.throws(fn, (error: unknown) => {
    assert.ok(isEffectErrorCode(error, 'EFFECT_RUNTIME'));
    assert.equal(error.context?.reason, expectedReason);
    return true;
  });
};

describe('choice authority runtime invariants', () => {
  const primitives: readonly ChoiceOwnershipPrimitive[] = ['chooseOne', 'chooseN'];

  it('emits choiceProbeAuthorityMismatch only in discovery+probe ownership enforcement', () => {
    for (const primitive of primitives) {
      const effect = buildChooserOwnedChoiceEffect(primitive, 'decision:$target', '$target', ['a', 'b']);
      const context = makeDiscoveryProbeEffectContext({
        def: makeDef([effect]),
        state: makeState(),
        moveParams: { 'decision:$target': ownershipSelection(primitive, 'a') },
        collector: createCollector(),
      });

      assertEffectRuntimeReason(
        () => applyEffect(effect, context),
        EFFECT_RUNTIME_REASONS.CHOICE_PROBE_AUTHORITY_MISMATCH,
      );
    }
  });

  it('emits choiceRuntimeValidationFailed in discovery+strict ownership enforcement', () => {
    for (const primitive of primitives) {
      const effect = buildChooserOwnedChoiceEffect(primitive, 'decision:$target', '$target', ['a', 'b']);
      const context = makeDiscoveryEffectContext({
        def: makeDef([effect]),
        state: makeState(),
        moveParams: { 'decision:$target': ownershipSelection(primitive, 'a') },
        collector: createCollector(),
      });

      assertEffectRuntimeReason(
        () => applyEffect(effect, context),
        EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED,
      );
    }
  });

  it('emits choiceRuntimeValidationFailed in execution+strict ownership enforcement', () => {
    for (const primitive of primitives) {
      const effect = buildChooserOwnedChoiceEffect(primitive, 'decision:$target', '$target', ['a', 'b']);
      const context = makeExecutionEffectContext({
        def: makeDef([effect]),
        state: makeState(),
        moveParams: { 'decision:$target': ownershipSelection(primitive, 'a') },
        collector: createCollector(),
      });

      assertEffectRuntimeReason(
        () => applyEffect(effect, context),
        EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED,
      );
    }
  });

  it('accepts chooser-owned submissions in strict execution contexts', () => {
    for (const primitive of primitives) {
      const effect = buildChooserOwnedChoiceEffect(primitive, 'decision:$target', '$target', ['a', 'b']);
      const context = makeExecutionEffectContext({
        def: makeDef([effect]),
        state: makeState(),
        activePlayer: asPlayerId(0),
        decisionAuthorityPlayer: CHOICE_OWNER_PLAYER,
        moveParams: { 'decision:$target': ownershipSelection(primitive, 'a') },
        collector: createCollector(),
      });

      const result = applyEffect(effect, context);
      assert.ok(result.bindings?.$target !== undefined);
    }
  });

  it('rejects execution mode with probe authority at applyEffect entry', () => {
    const effect = buildChooserOwnedChoiceEffect('chooseOne', 'decision:$target', '$target', ['a', 'b']);
    const probeDiscoveryContext = makeDiscoveryProbeEffectContext({
      def: makeDef([effect]),
      state: makeState(),
      collector: createCollector(),
    });
    const malformedExecutionContext = {
      ...probeDiscoveryContext,
      mode: 'execution',
    } as unknown as typeof probeDiscoveryContext;

    assertEffectRuntimeReason(
      () => applyEffect(effect, malformedExecutionContext),
      EFFECT_RUNTIME_REASONS.INTERNAL_INVARIANT_VIOLATION,
    );
  });

  it('rejects execution mode with probe authority at applyEffects entry', () => {
    const effect = buildChooserOwnedChoiceEffect('chooseN', 'decision:$target', '$target', ['a', 'b']);
    const probeDiscoveryContext = makeDiscoveryProbeEffectContext({
      def: makeDef([effect]),
      state: makeState(),
      collector: createCollector(),
    });
    const malformedExecutionContext = {
      ...probeDiscoveryContext,
      mode: 'execution',
    } as unknown as typeof probeDiscoveryContext;

    assertEffectRuntimeReason(
      () => applyEffects([effect], malformedExecutionContext),
      EFFECT_RUNTIME_REASONS.INTERNAL_INVARIANT_VIOLATION,
    );
  });
});
