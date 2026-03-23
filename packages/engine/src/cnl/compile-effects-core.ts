import type { Diagnostic } from '../kernel/diagnostics.js';
import { VALUE_EXPR_TAG } from '../kernel/types.js';
import type {
  EffectAST,
  FreeOperationExecutionContext,
  FreeOperationTokenInterpretationRule,
  ValueExpr,
} from '../kernel/types.js';
import { lowerTokenFilterExpr, lowerValueNode, type ConditionLoweringContext } from './compile-conditions.js';
import { SUPPORTED_EFFECT_KINDS } from './effect-kind-registry.js';
import type { EffectLoweringContext, EffectLoweringResult } from './compile-effects-types.js';
import { EFFECT_KIND_KEYS, isExecutionContextScalar } from './compile-effects-types.js';
import { BindingScope, registerSequentialBinding } from './compile-effects-binding-scope.js';
import {
  collectDeclaredBindingDeclarationDiagnostics,
  collectReservedCompilerBindingNamespaceDiagnostics,
  collectReservedCompilerMetadataDiagnostics,
  isRecord,
  missingCapability,
  setLowerEffectNode,
} from './compile-effects-utils.js';
import { collectFreeOperationSequenceViabilityWarnings } from './compile-effects-free-op.js';
import { lowerSetVarEffect, lowerAddVarEffect, lowerSetActivePlayerEffect, lowerTransferVarEffect } from './compile-effects-var.js';
import {
  lowerMoveTokenEffect,
  lowerMoveAllEffect,
  lowerMoveTokenAdjacentEffect,
  lowerDrawEffect,
  lowerRevealEffect,
  lowerConcealEffect,
  lowerShuffleEffect,
  lowerCreateTokenEffect,
  lowerDestroyTokenEffect,
  lowerSetTokenPropEffect,
} from './compile-effects-token.js';
import {
  lowerIfEffect,
  lowerForEachEffect,
  lowerReduceEffect,
  lowerRemoveByPriorityEffect,
  lowerLetEffect,
  lowerBindValueEffect,
  lowerEvaluateSubsetEffect,
  lowerRollRandomEffect,
  lowerSetMarkerEffect,
  lowerShiftMarkerEffect,
  lowerSetGlobalMarkerEffect,
  lowerFlipGlobalMarkerEffect,
  lowerShiftGlobalMarkerEffect,
  lowerGotoPhaseExactEffect,
  lowerAdvancePhaseEffect,
  lowerPushInterruptPhaseEffect,
  lowerPopInterruptPhaseEffect,
} from './compile-effects-flow.js';
import {
  lowerChooseOneEffect,
  lowerChooseNEffect,
  lowerDistributeTokensEffects,
} from './compile-effects-choice.js';
import { lowerGrantFreeOperationEffect } from './compile-effects-free-op.js';

export function lowerFreeOperationExecutionContextNode(
  source: unknown,
  context: ConditionLoweringContext,
  path: string,
): EffectLoweringResult<FreeOperationExecutionContext> {
  if (!isRecord(source)) {
    return missingCapability(path, 'grantFreeOperation executionContext', source, [
      '{ key: <ValueExpr-compatible scalar or scalar[]> }',
    ]);
  }

  const diagnostics: Diagnostic[] = [];
  const loweredEntries: Array<readonly [string, import('../kernel/types.js').ValueExpr]> = [];
  for (const [key, value] of Object.entries(source)) {
    if (key.length === 0) {
      diagnostics.push(...missingCapability(`${path}.${key}`, 'grantFreeOperation executionContext key', key, ['non-empty string']).diagnostics);
      continue;
    }
    if (Array.isArray(value)) {
      if (!value.every((entry) => isExecutionContextScalar(entry))) {
        diagnostics.push(...missingCapability(`${path}.${key}`, 'grantFreeOperation executionContext value', value, [
          'scalar literal',
          'scalar literal array',
          'ValueExpr-compatible object',
        ]).diagnostics);
        continue;
      }
      loweredEntries.push([key, { _t: VALUE_EXPR_TAG.SCALAR_ARRAY, scalarArray: [...value] } as ValueExpr]);
      continue;
    }

    const loweredValue = lowerValueNode(value, context, `${path}.${key}`);
    diagnostics.push(...loweredValue.diagnostics);
    if (loweredValue.value !== null) {
      loweredEntries.push([key, loweredValue.value]);
    }
  }

  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    return { value: null, diagnostics };
  }

  return {
    value: Object.fromEntries(loweredEntries),
    diagnostics,
  };
}

export function lowerFreeOperationTokenInterpretationsNode(
  source: unknown,
  context: ConditionLoweringContext,
  path: string,
): EffectLoweringResult<readonly FreeOperationTokenInterpretationRule[]> {
  if (!Array.isArray(source) || source.length === 0) {
    return missingCapability(path, 'grantFreeOperation tokenInterpretations', source, [
      '[{ when: <TokenFilterExpr>, assign: { prop: <scalar> } }]',
    ]);
  }

  const diagnostics: Diagnostic[] = [];
  const loweredRules: FreeOperationTokenInterpretationRule[] = [];
  for (const [index, entry] of source.entries()) {
    if (!isRecord(entry) || !isRecord(entry.assign)) {
      diagnostics.push(...missingCapability(`${path}.${index}`, 'grantFreeOperation tokenInterpretations entry', entry, [
        '{ when: <TokenFilterExpr>, assign: { prop: <scalar> } }',
      ]).diagnostics);
      continue;
    }
    const loweredWhen = lowerTokenFilterExpr(entry.when, context, `${path}.${index}.when`);
    diagnostics.push(...loweredWhen.diagnostics);
    const loweredAssignEntries: Array<readonly [string, string | number | boolean]> = [];
    for (const [key, value] of Object.entries(entry.assign)) {
      if (key.length === 0 || !isExecutionContextScalar(value)) {
        diagnostics.push(...missingCapability(`${path}.${index}.assign.${key}`, 'grantFreeOperation tokenInterpretations assign value', value, [
          'scalar literal',
        ]).diagnostics);
        continue;
      }
      loweredAssignEntries.push([key, value]);
    }
    if (loweredWhen.value !== null && loweredAssignEntries.length > 0) {
      loweredRules.push({
        when: loweredWhen.value,
        assign: Object.fromEntries(loweredAssignEntries),
      });
    }
  }

  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    return { value: null, diagnostics };
  }

  return {
    value: loweredRules,
    diagnostics,
  };
}

export function lowerEffectArray(
  source: readonly unknown[],
  context: EffectLoweringContext,
  path: string,
): EffectLoweringResult<readonly EffectAST[]> {
  const diagnostics: Diagnostic[] = [];
  const values: EffectAST[] = [];
  let loweredEntryCount = 0;
  const scope = new BindingScope(context.bindingScope ?? []);

  source.forEach((entry, index) => {
    const lowered = lowerEffectNode(entry, context, scope, `${path}.${index}`);
    diagnostics.push(...lowered.diagnostics);
    if (lowered.value !== null) {
      loweredEntryCount += 1;
      for (const loweredEffect of lowered.value) {
        values.push(loweredEffect);
        registerSequentialBinding(loweredEffect, scope);
      }
    }
  });

  if (!diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    diagnostics.push(...collectFreeOperationSequenceViabilityWarnings(values, path, context.freeOperationActionIds));
  }

  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error') && loweredEntryCount !== source.length) {
    return { value: null, diagnostics };
  }

  return { value: values, diagnostics };
}

const wrapSingleEffectLowering = (result: EffectLoweringResult<EffectAST>): EffectLoweringResult<readonly EffectAST[]> => (
  result.value === null
    ? { value: null, diagnostics: result.diagnostics }
    : { value: [result.value], diagnostics: result.diagnostics }
);

function lowerEffectNode(
  source: unknown,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<readonly EffectAST[]> {
  if (!isRecord(source)) {
    return wrapSingleEffectLowering(missingCapability(path, 'effect node', source, SUPPORTED_EFFECT_KINDS));
  }
  const reservedMetadataDiagnostics: Diagnostic[] = [
    ...collectReservedCompilerMetadataDiagnostics(source, path),
  ];
  for (const [key, value] of Object.entries(source)) {
    if (!EFFECT_KIND_KEYS.has(key) || !isRecord(value)) {
      continue;
    }
    reservedMetadataDiagnostics.push(...collectReservedCompilerMetadataDiagnostics(value, `${path}.${key}`));
  }
  if (reservedMetadataDiagnostics.length > 0) {
    return { value: null, diagnostics: reservedMetadataDiagnostics };
  }
  const reservedBindingNamespaceDiagnostics = collectReservedCompilerBindingNamespaceDiagnostics(source, path);
  if (reservedBindingNamespaceDiagnostics.length > 0) {
    return { value: null, diagnostics: reservedBindingNamespaceDiagnostics };
  }
  const declaredBindingDiagnostics = collectDeclaredBindingDeclarationDiagnostics(source, path);
  if (declaredBindingDiagnostics.length > 0) {
    return { value: null, diagnostics: declaredBindingDiagnostics };
  }

  if (isRecord(source.setVar)) {
    return wrapSingleEffectLowering(lowerSetVarEffect(source.setVar, context, scope, `${path}.setVar`));
  }
  if (isRecord(source.setActivePlayer)) {
    return wrapSingleEffectLowering(lowerSetActivePlayerEffect(source.setActivePlayer, context, scope, `${path}.setActivePlayer`));
  }
  if (isRecord(source.addVar)) {
    return wrapSingleEffectLowering(lowerAddVarEffect(source.addVar, context, scope, `${path}.addVar`));
  }
  if (isRecord(source.transferVar)) {
    return wrapSingleEffectLowering(lowerTransferVarEffect(source.transferVar, context, scope, `${path}.transferVar`));
  }
  if (isRecord(source.moveToken)) {
    return wrapSingleEffectLowering(lowerMoveTokenEffect(source.moveToken, context, scope, `${path}.moveToken`));
  }
  if (isRecord(source.moveAll)) {
    return wrapSingleEffectLowering(lowerMoveAllEffect(source.moveAll, context, scope, `${path}.moveAll`));
  }
  if (isRecord(source.moveTokenAdjacent)) {
    return wrapSingleEffectLowering(lowerMoveTokenAdjacentEffect(source.moveTokenAdjacent, context, scope, `${path}.moveTokenAdjacent`));
  }
  if (isRecord(source.draw)) {
    return wrapSingleEffectLowering(lowerDrawEffect(source.draw, context, scope, `${path}.draw`));
  }
  if (isRecord(source.reveal)) {
    return wrapSingleEffectLowering(lowerRevealEffect(source.reveal, context, scope, `${path}.reveal`));
  }
  if (isRecord(source.conceal)) {
    return wrapSingleEffectLowering(lowerConcealEffect(source.conceal, context, scope, `${path}.conceal`));
  }
  if (isRecord(source.shuffle)) {
    return wrapSingleEffectLowering(lowerShuffleEffect(source.shuffle, context, scope, `${path}.shuffle`));
  }
  if (isRecord(source.createToken)) {
    return wrapSingleEffectLowering(lowerCreateTokenEffect(source.createToken, context, scope, `${path}.createToken`));
  }
  if (isRecord(source.destroyToken)) {
    return wrapSingleEffectLowering(lowerDestroyTokenEffect(source.destroyToken, scope, `${path}.destroyToken`));
  }
  if (isRecord(source.setTokenProp)) {
    return wrapSingleEffectLowering(lowerSetTokenPropEffect(source.setTokenProp, context, scope, `${path}.setTokenProp`));
  }
  if (isRecord(source.if)) {
    return wrapSingleEffectLowering(lowerIfEffect(source.if, context, scope, `${path}.if`));
  }
  if (isRecord(source.forEach)) {
    return wrapSingleEffectLowering(lowerForEachEffect(source.forEach, context, scope, `${path}.forEach`));
  }
  if (isRecord(source.reduce)) {
    return wrapSingleEffectLowering(lowerReduceEffect(source.reduce, context, scope, `${path}.reduce`));
  }
  if (isRecord(source.removeByPriority)) {
    return wrapSingleEffectLowering(lowerRemoveByPriorityEffect(source.removeByPriority, context, scope, `${path}.removeByPriority`));
  }
  if (isRecord(source.let)) {
    return wrapSingleEffectLowering(lowerLetEffect(source.let, context, scope, `${path}.let`));
  }
  if (isRecord(source.bindValue)) {
    return wrapSingleEffectLowering(lowerBindValueEffect(source.bindValue, context, scope, `${path}.bindValue`));
  }
  if (isRecord(source.evaluateSubset)) {
    return wrapSingleEffectLowering(lowerEvaluateSubsetEffect(source.evaluateSubset, context, scope, `${path}.evaluateSubset`));
  }
  if (isRecord(source.chooseOne)) {
    return wrapSingleEffectLowering(lowerChooseOneEffect(source.chooseOne, context, scope, `${path}.chooseOne`));
  }
  if (isRecord(source.chooseN)) {
    return wrapSingleEffectLowering(lowerChooseNEffect(source.chooseN, context, scope, `${path}.chooseN`));
  }
  if (isRecord(source.distributeTokens)) {
    return lowerDistributeTokensEffects(source.distributeTokens, context, scope, `${path}.distributeTokens`);
  }
  if (isRecord(source.rollRandom)) {
    return wrapSingleEffectLowering(lowerRollRandomEffect(source.rollRandom, context, scope, `${path}.rollRandom`));
  }
  if (isRecord(source.setMarker)) {
    return wrapSingleEffectLowering(lowerSetMarkerEffect(source.setMarker, context, scope, `${path}.setMarker`));
  }
  if (isRecord(source.shiftMarker)) {
    return wrapSingleEffectLowering(lowerShiftMarkerEffect(source.shiftMarker, context, scope, `${path}.shiftMarker`));
  }
  if (isRecord(source.setGlobalMarker)) {
    return wrapSingleEffectLowering(lowerSetGlobalMarkerEffect(source.setGlobalMarker, context, scope, `${path}.setGlobalMarker`));
  }
  if (isRecord(source.flipGlobalMarker)) {
    return wrapSingleEffectLowering(lowerFlipGlobalMarkerEffect(source.flipGlobalMarker, context, scope, `${path}.flipGlobalMarker`));
  }
  if (isRecord(source.shiftGlobalMarker)) {
    return wrapSingleEffectLowering(lowerShiftGlobalMarkerEffect(source.shiftGlobalMarker, context, scope, `${path}.shiftGlobalMarker`));
  }
  if (isRecord(source.grantFreeOperation)) {
    return wrapSingleEffectLowering(lowerGrantFreeOperationEffect(source.grantFreeOperation, context, scope, `${path}.grantFreeOperation`));
  }
  if (isRecord(source.gotoPhaseExact)) {
    return wrapSingleEffectLowering(lowerGotoPhaseExactEffect(source.gotoPhaseExact, `${path}.gotoPhaseExact`));
  }
  if (isRecord(source.advancePhase)) {
    return wrapSingleEffectLowering(lowerAdvancePhaseEffect(source.advancePhase, `${path}.advancePhase`));
  }
  if (isRecord(source.pushInterruptPhase)) {
    return wrapSingleEffectLowering(lowerPushInterruptPhaseEffect(source.pushInterruptPhase, `${path}.pushInterruptPhase`));
  }
  if (isRecord(source.popInterruptPhase)) {
    return wrapSingleEffectLowering(lowerPopInterruptPhaseEffect(source.popInterruptPhase, `${path}.popInterruptPhase`));
  }

  return wrapSingleEffectLowering(missingCapability(path, 'effect node', source, SUPPORTED_EFFECT_KINDS));
}

// Register lowerEffectNode for the circular dependency in lowerNestedEffects
setLowerEffectNode(lowerEffectNode);
