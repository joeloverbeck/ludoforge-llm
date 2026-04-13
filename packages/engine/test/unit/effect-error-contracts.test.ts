import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { makeExecutionEffectContext, type EffectContextTestOverrides } from '../helpers/effect-context-test-helpers.js';
import { collectRedundantEffectRuntimeReasonConjunctions } from '../helpers/kernel-source-ast-guard.js';
import { listKernelModulesByPrefix, readKernelSource } from '../helpers/kernel-source-guard.js';
import {
  applyEffect,
  applyEffects,
  asActionId,
  asPhaseId,
  asPlayerId,
  asZoneId,
  buildAdjacencyGraph,
  createCollector,
  createRng,
  EFFECT_RUNTIME_REASONS,
  EffectBudgetExceededError,
  effectRuntimeError,
  EffectRuntimeError,
  effectNotImplementedError,
  isEffectErrorCode,
  isEffectRuntimeReason,
  type EffectErrorContext,
  type EffectRuntimeReason,
  type EffectRuntimeContext,
  type EffectRuntimeReasonsRequiringContext,
  type EffectRuntimeReasonsWithNoContext,
  type EffectRuntimeReasonsWithOptionalContext,
  type EffectAST,
  type EffectContext,
  type GameDef,
  type GameState,
  makeTurnFlowActiveSeatUnresolvableEffectRuntimeContext,
  TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS,
} from '../../src/kernel/index.js';
import { eff } from '../helpers/effect-tag-helper.js';

describe('effect error context contracts', () => {
  const baseDef: GameDef = {
    metadata: { id: 'effect-error-contracts', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [{ id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'stack' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [{
      id: asActionId('op'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    }],
    triggers: [],
    terminal: { conditions: [] },
  };

  const baseState: GameState = {
    globalVars: {},
    perPlayerVars: {},
    zoneVars: {},
    playerCount: 2,
    zones: { 'board:none': [] },
    nextTokenOrdinal: 0,
    currentPhase: asPhaseId('main'),
    activePlayer: asPlayerId(0),
    turnCount: 1,
    rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
    stateHash: 0n,
    _runningHash: 0n,
    actionUsage: {},
    turnOrderState: { type: 'roundRobin' },
    markers: {},
  reveals: undefined,
  globalMarkers: undefined,
  activeLastingEffects: undefined,
  interruptPhaseStack: undefined,
  };

  const makeContext = (overrides?: EffectContextTestOverrides): EffectContext => makeExecutionEffectContext({
    def: baseDef,
    adjacencyGraph: buildAdjacencyGraph(baseDef.zones),
    state: baseState,
    rng: createRng(7n),
    activePlayer: baseState.activePlayer,
    actorPlayer: baseState.activePlayer,
    bindings: {},
    moveParams: {},
    collector: createCollector(),
  ...overrides,
  });

  it('effectNotImplementedError emits typed EFFECT_NOT_IMPLEMENTED context', () => {
    const effect: EffectAST = eff({ draw: { from: 'deck', to: 'hand', count: 1 } });
    const error = effectNotImplementedError('draw', { effect });

    assert.equal(error.code, 'EFFECT_NOT_IMPLEMENTED');
    const context: EffectErrorContext<'EFFECT_NOT_IMPLEMENTED'> = error.context!;
    assert.equal(context.effectType, 'draw');
    assert.deepEqual(context.effect, effect);
  });

  it('EffectBudgetExceededError emits typed EFFECT_BUDGET_EXCEEDED context', () => {
    const error = new EffectBudgetExceededError('budget exceeded', {
      effectType: 'moveToken',
      maxEffectOps: 500,
    });

    assert.ok(isEffectErrorCode(error, 'EFFECT_BUDGET_EXCEEDED'));
    assert.equal(error.code, 'EFFECT_BUDGET_EXCEEDED');
    const context: EffectErrorContext<'EFFECT_BUDGET_EXCEEDED'> = error.context!;
    assert.equal(context.effectType, 'moveToken');
    assert.equal(context.maxEffectOps, 500);
  });

  it('spatial destination errors expose typed contexts', () => {
    const requiredError = new EffectRuntimeError('SPATIAL_DESTINATION_REQUIRED', 'missing direction', {
      effectType: 'moveTokenAdjacent',
      availableBindings: ['$dest'],
      direction: '$dest',
    });
    assert.ok(isEffectErrorCode(requiredError, 'SPATIAL_DESTINATION_REQUIRED'));
    const requiredContext: EffectErrorContext<'SPATIAL_DESTINATION_REQUIRED'> = requiredError.context!;
    assert.equal(requiredContext.effectType, 'moveTokenAdjacent');
    assert.deepEqual(requiredContext.availableBindings, ['$dest']);
    assert.equal(requiredContext.direction, '$dest');

    const adjacentError = new EffectRuntimeError('SPATIAL_DESTINATION_NOT_ADJACENT', 'not adjacent', {
      effectType: 'moveTokenAdjacent',
      fromZoneId: 'a',
      toZoneId: 'b',
      adjacentZones: ['c'],
    });
    assert.ok(isEffectErrorCode(adjacentError, 'SPATIAL_DESTINATION_NOT_ADJACENT'));
    const adjacentContext: EffectErrorContext<'SPATIAL_DESTINATION_NOT_ADJACENT'> = adjacentError.context!;
    assert.equal(adjacentContext.fromZoneId, 'a');
    assert.equal(adjacentContext.toZoneId, 'b');
    assert.deepEqual(adjacentContext.adjacentZones, ['c']);
  });

  it('effectRuntimeError helper emits canonical reasons on runtime failures', () => {
    assert.throws(
      () => applyEffect(eff({ setVar: { scope: 'global', var: 'x', value: 'bad' } }), makeContext()),
      (error: unknown) => {
        assert.ok(isEffectErrorCode(error, 'EFFECT_RUNTIME'));
        assert.equal(error.context?.reason, EFFECT_RUNTIME_REASONS.VARIABLE_RUNTIME_VALIDATION_FAILED);
        return true;
      },
    );

    assert.throws(
      () => applyEffect(
        eff({ reveal: { zone: asZoneId('board:none'), to: 'all' } }),
        makeContext({
          state: {
            ...baseState,
            zones: {},
          },
        }),
      ),
      (error: unknown) => {
        assert.ok(isEffectErrorCode(error, 'EFFECT_RUNTIME'));
        assert.equal(error.context?.reason, EFFECT_RUNTIME_REASONS.REVEAL_RUNTIME_VALIDATION_FAILED);
        return true;
      },
    );

    assert.throws(
      () => applyEffect(
        eff({ conceal: { zone: asZoneId('board:none') } }),
        makeContext({
          state: {
            ...baseState,
            zones: {},
          },
        }),
      ),
      (error: unknown) => {
        assert.ok(isEffectErrorCode(error, 'EFFECT_RUNTIME'));
        assert.equal(error.context?.reason, EFFECT_RUNTIME_REASONS.CONCEAL_RUNTIME_VALIDATION_FAILED);
        return true;
      },
    );
  });

  it('effectRuntimeError enforces typed turn-flow active-seat invariant context', () => {
    const context: EffectRuntimeContext<'turnFlowRuntimeValidationFailed'> =
      makeTurnFlowActiveSeatUnresolvableEffectRuntimeContext({
        invariant: 'turnFlow.activeSeat.unresolvable',
        surface: TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS.FREE_OPERATION_GRANT_APPLICATION,
        activePlayer: 0,
        seatOrder: ['0', '1'],
      });

    const error = effectRuntimeError(
      EFFECT_RUNTIME_REASONS.TURN_FLOW_RUNTIME_VALIDATION_FAILED,
      'turn-flow invariant failed',
      context,
    );
    assert.ok(isEffectErrorCode(error, 'EFFECT_RUNTIME'));
    assert.equal(error.context?.reason, EFFECT_RUNTIME_REASONS.TURN_FLOW_RUNTIME_VALIDATION_FAILED);
    assert.equal(error.context?.invariant, 'turnFlow.activeSeat.unresolvable');
    assert.equal(error.context?.surface, TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS.FREE_OPERATION_GRANT_APPLICATION);
    assert.equal(error.context?.activePlayer, 0);
    assert.deepEqual(error.context?.seatOrder, ['0', '1']);
  });

  it('effectRuntimeError reason matrix enforces required vs optional/no-context contracts', () => {
    const requiredContextReasons = [
      EFFECT_RUNTIME_REASONS.TURN_FLOW_RUNTIME_VALIDATION_FAILED,
      EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED,
      EFFECT_RUNTIME_REASONS.CHOICE_PROBE_AUTHORITY_MISMATCH,
    ] as const;
    const optionalContextReasons = [
      EFFECT_RUNTIME_REASONS.EFFECT_BUDGET_CONFIG_INVALID,
      EFFECT_RUNTIME_REASONS.INTERNAL_INVARIANT_VIOLATION,
      EFFECT_RUNTIME_REASONS.SUBSET_RUNTIME_VALIDATION_FAILED,
      EFFECT_RUNTIME_REASONS.CONTROL_FLOW_RUNTIME_VALIDATION_FAILED,
      EFFECT_RUNTIME_REASONS.RESOURCE_RUNTIME_VALIDATION_FAILED,
      EFFECT_RUNTIME_REASONS.CONCEAL_RUNTIME_VALIDATION_FAILED,
      EFFECT_RUNTIME_REASONS.REVEAL_RUNTIME_VALIDATION_FAILED,
      EFFECT_RUNTIME_REASONS.TOKEN_RUNTIME_VALIDATION_FAILED,
      EFFECT_RUNTIME_REASONS.VARIABLE_RUNTIME_VALIDATION_FAILED,
    ] as const;
    const noContextReasons = [] as const;

    type ListedRequiredReasons = (typeof requiredContextReasons)[number];
    type ListedOptionalReasons = (typeof optionalContextReasons)[number];
    type ListedNoContextReasons = (typeof noContextReasons)[number];
    type ListedReasons = ListedRequiredReasons | ListedOptionalReasons | ListedNoContextReasons;

    const assertRequiredReasonCoverage: Exclude<EffectRuntimeReasonsRequiringContext, ListedRequiredReasons> extends never
      ? true
      : never = true;
    const assertOptionalReasonCoverage: Exclude<EffectRuntimeReasonsWithOptionalContext, ListedOptionalReasons> extends never
      ? true
      : never = true;
    const assertNoContextReasonCoverage: Exclude<EffectRuntimeReasonsWithNoContext, ListedNoContextReasons> extends never
      ? true
      : never = true;
    const assertNoExtraRequiredReasons: Exclude<ListedRequiredReasons, EffectRuntimeReasonsRequiringContext> extends never
      ? true
      : never = true;
    const assertNoExtraOptionalReasons: Exclude<ListedOptionalReasons, EffectRuntimeReasonsWithOptionalContext> extends never
      ? true
      : never = true;
    const assertNoExtraNoContextReasons: Exclude<ListedNoContextReasons, EffectRuntimeReasonsWithNoContext> extends never
      ? true
      : never = true;
    const assertAllReasonsListed: Exclude<EffectRuntimeReason, ListedReasons> extends never ? true : never = true;
    const assertOnlyEffectRuntimeReasonsListed: Exclude<ListedReasons, EffectRuntimeReason> extends never ? true : never = true;
    void assertRequiredReasonCoverage;
    void assertOptionalReasonCoverage;
    void assertNoContextReasonCoverage;
    void assertNoExtraRequiredReasons;
    void assertNoExtraOptionalReasons;
    void assertNoExtraNoContextReasons;
    void assertAllReasonsListed;
    void assertOnlyEffectRuntimeReasonsListed;
    assert.equal(
      requiredContextReasons.length + optionalContextReasons.length + noContextReasons.length,
      Object.keys(EFFECT_RUNTIME_REASONS).length,
    );
    assert.equal(
      new Set([...requiredContextReasons, ...optionalContextReasons, ...noContextReasons]).size,
      Object.keys(EFFECT_RUNTIME_REASONS).length,
    );

    const assertCompileTimeReasonMatrix = (): void => {
      effectRuntimeError(EFFECT_RUNTIME_REASONS.TURN_FLOW_RUNTIME_VALIDATION_FAILED, 'turn-flow context required', {
        effectType: 'grantFreeOperation',
      });
      effectRuntimeError(EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED, 'choice context required', {
        effectType: 'chooseOne',
      });
      effectRuntimeError(EFFECT_RUNTIME_REASONS.CHOICE_PROBE_AUTHORITY_MISMATCH, 'probe mismatch context required', {
        effectType: 'chooseOne',
      });
      // @ts-expect-error required-context reason must reject missing context
      effectRuntimeError(EFFECT_RUNTIME_REASONS.TURN_FLOW_RUNTIME_VALIDATION_FAILED, 'missing required context');
      // @ts-expect-error required-context reason must reject missing context
      effectRuntimeError(EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED, 'missing required context');
      // @ts-expect-error required-context reason must reject missing context
      effectRuntimeError(EFFECT_RUNTIME_REASONS.CHOICE_PROBE_AUTHORITY_MISMATCH, 'missing required context');

      for (const reason of optionalContextReasons) {
        effectRuntimeError(reason, 'optional context reason without payload');
      }
      effectRuntimeError(EFFECT_RUNTIME_REASONS.INTERNAL_INVARIANT_VIOLATION, 'optional with payload', {
        mode: 'execution',
      });
    };
    void assertCompileTimeReasonMatrix;

    const untypedEffectRuntimeError = effectRuntimeError as unknown as (
      reason: EffectRuntimeReason,
      message: string,
      context?: unknown,
    ) => EffectRuntimeError<'EFFECT_RUNTIME'>;
    assert.throws(
      () => untypedEffectRuntimeError(EFFECT_RUNTIME_REASONS.TURN_FLOW_RUNTIME_VALIDATION_FAILED, 'missing context'),
      /turnFlowRuntimeValidationFailed requires effectType in EFFECT_RUNTIME context\./,
    );
    assert.throws(
      () => untypedEffectRuntimeError(EFFECT_RUNTIME_REASONS.TURN_FLOW_RUNTIME_VALIDATION_FAILED, 'missing effectType', {}),
      /turnFlowRuntimeValidationFailed requires effectType in EFFECT_RUNTIME context\./,
    );
    assert.throws(
      () => untypedEffectRuntimeError(EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED, 'missing context'),
      /choiceRuntimeValidationFailed requires effectType in EFFECT_RUNTIME context\./,
    );
    assert.throws(
      () => untypedEffectRuntimeError(EFFECT_RUNTIME_REASONS.CHOICE_PROBE_AUTHORITY_MISMATCH, 'missing context'),
      /choiceProbeAuthorityMismatch requires effectType in EFFECT_RUNTIME context\./,
    );
    assert.doesNotThrow(() =>
      untypedEffectRuntimeError(EFFECT_RUNTIME_REASONS.INTERNAL_INVARIANT_VIOLATION, 'optional context omitted'),
    );
  });

  it('kernel effect-runtime reason consumers avoid redundant conjunction guards and keep known canonical guard sites', () => {
    const kernelModules = listKernelModulesByPrefix('');
    const reasonConsumerModules = kernelModules
      .filter((moduleName) => readKernelSource(`src/kernel/${moduleName}`).includes('isEffectRuntimeReason('))
      .sort();

    assert.ok(reasonConsumerModules.length > 0, 'Expected discoverable isEffectRuntimeReason consumers in src/kernel');

    const redundantGuardViolations: string[] = [];
    for (const moduleName of reasonConsumerModules) {
      const file = `src/kernel/${moduleName}`;
      const source = readKernelSource(file);
      const matches = collectRedundantEffectRuntimeReasonConjunctions(source, moduleName);
      for (const match of matches) {
        const sourceFile = match.getSourceFile();
        const start = sourceFile.getLineAndCharacterOfPosition(match.getStart(sourceFile));
        const normalizedExpression = match.getText(sourceFile).replace(/\s+/gu, ' ').trim();
        redundantGuardViolations.push(
          `${file}:${start.line + 1}:${start.character + 1}: ${normalizedExpression}`,
        );
      }
    }

    assert.equal(
      redundantGuardViolations.length,
      0,
      `Redundant EFFECT_RUNTIME + reason conjunction guard(s) detected in kernel reason consumers.\n`
        + `Use canonical single-guard isEffectRuntimeReason(...) only.\n`
        + redundantGuardViolations.join('\n'),
    );

    const applyMoveSource = readKernelSource('src/kernel/apply-move.ts');
    assert.match(applyMoveSource, /isEffectRuntimeReason\(\s*err,\s*EFFECT_RUNTIME_REASONS\.CHOICE_RUNTIME_VALIDATION_FAILED\s*\)/u);
    assert.doesNotMatch(applyMoveSource, /context\?\.reason\s*===\s*'choiceRuntimeValidationFailed'/u);

    const legalChoicesSource = readKernelSource('src/kernel/legal-choices.ts');
    assert.match(legalChoicesSource, /isEffectRuntimeReason\(\s*error,\s*EFFECT_RUNTIME_REASONS\.CHOICE_PROBE_AUTHORITY_MISMATCH\s*\)/u);
    assert.doesNotMatch(legalChoicesSource, /context\?\.reason\s*===\s*'choiceProbeAuthorityMismatch'/u);
  });

  it('kernel effect-runtime reason surfaces reject raw string literals', () => {
    const kernelModules = listKernelModulesByPrefix('');
    const effectRuntimeEmitterModules = kernelModules
      .filter((moduleName) => readKernelSource(`src/kernel/${moduleName}`).includes('effectRuntimeError('))
      .sort();

    assert.ok(effectRuntimeEmitterModules.length > 0, 'Expected discoverable effectRuntimeError emitters in src/kernel');
    for (const moduleName of effectRuntimeEmitterModules) {
      const file = `src/kernel/${moduleName}`;
      const source = readKernelSource(file);
      assert.doesNotMatch(
        source,
        /effectRuntimeError\(\s*['"`][^'"`]+['"`]\s*,/u,
        `${file} must not pass raw reason string literals to effectRuntimeError`,
      );
    }

    const normalizedResolverModules = kernelModules
      .filter((moduleName) => {
        const source = readKernelSource(`src/kernel/${moduleName}`);
        return /resolve(?:SinglePlayer|Players|Zone)WithNormalization\(/u.test(source);
      })
      .sort();

    assert.ok(normalizedResolverModules.length > 0, 'Expected discoverable selector-normalization modules in src/kernel');
    for (const moduleName of normalizedResolverModules) {
      const file = `src/kernel/${moduleName}`;
      const source = readKernelSource(file);
      assert.doesNotMatch(
        source,
        /\bcode\s*:\s*['"`][^'"`]+['"`]/u,
        `${file} must not pass raw reason string literals through normalization code fields`,
      );
    }
  });

  it('effectRuntimeError construction path stays free of unsafe context casts', () => {
    const source = readKernelSource('src/kernel/effect-error.ts');
    const constructionSectionMatch = source.match(
      /export function effectRuntimeError\s*\(\s*reason:\s*EffectRuntimeReason[\s\S]*?export function isEffectRuntimeError/u,
    );
    const constructionSection = constructionSectionMatch?.[0];

    assert.notEqual(
      constructionSection,
      undefined,
      'Failed to locate effectRuntimeError implementation section for architecture guard',
    );
    if (constructionSection === undefined) {
      return;
    }

    assert.doesNotMatch(
      constructionSection,
      /\bas\s+EffectRuntimeErrorContextForReason(?:<[^>]+>)?\b/u,
      'effectRuntimeError construction must not assert reason context via cast; keep type-proofed branch construction',
    );
    assert.doesNotMatch(
      constructionSection,
      /\bas\s+EffectErrorContext<'EFFECT_RUNTIME'>\b/u,
      'effectRuntimeError construction must not cast to EFFECT_RUNTIME context',
    );
  });

  it('isEffectRuntimeReason narrows effect runtime context by reason', () => {
    const error = effectRuntimeError(EFFECT_RUNTIME_REASONS.INTERNAL_INVARIANT_VIOLATION, 'invariant violated', {
      mode: 'execution',
      ownershipEnforcement: 'probe',
    });

    assert.equal(isEffectRuntimeReason(error, EFFECT_RUNTIME_REASONS.INTERNAL_INVARIANT_VIOLATION), true);
    if (!isEffectRuntimeReason(error, EFFECT_RUNTIME_REASONS.INTERNAL_INVARIANT_VIOLATION)) {
      assert.fail('expected reason-specific narrowing for internalInvariantViolation');
    }
    assert.equal(error.context.mode, 'execution');
    assert.equal(error.context.ownershipEnforcement, 'probe');
    assert.equal(isEffectRuntimeReason(error, EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED), false);
  });

  it('effect entry invariant violations emit internalInvariantViolation with mode/ownership context', () => {
    const malformedContext = {
      ...makeContext(),
      mode: 'execution',
      decisionAuthority: {
        source: 'engineRuntime',
        player: asPlayerId(0),
        ownershipEnforcement: 'probe',
      },
    } as unknown as EffectContext;

    for (const invoke of [
      () => applyEffect(eff({ bindValue: { bind: '$noop', value: 1 } }), malformedContext),
      () => applyEffects([eff({ bindValue: { bind: '$noop', value: 1 } })], malformedContext),
    ]) {
      assert.throws(invoke, (error: unknown) => {
        assert.ok(isEffectErrorCode(error, 'EFFECT_RUNTIME'));
        assert.equal(error.context?.reason, EFFECT_RUNTIME_REASONS.INTERNAL_INVARIANT_VIOLATION);
        assert.equal(error.context?.mode, 'execution');
        assert.equal(error.context?.ownershipEnforcement, 'probe');
        return true;
      });
    }
  });
});
