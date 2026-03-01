import type { Diagnostic } from '../kernel/diagnostics.js';
import { resolveEffectiveFreeOperationActionDomain } from '../kernel/free-operation-action-domain.js';
import { CNL_COMPILER_DIAGNOSTIC_CODES } from './compiler-diagnostic-codes.js';
import {
  buildChoiceOptionsRuntimeShapeDiagnostic,
  CHOICE_OPTIONS_RUNTIME_SHAPE_DIAGNOSTIC_CODES,
} from '../kernel/choice-options-runtime-shape-diagnostic.js';
import {
  TURN_FLOW_ACTION_CLASS_VALUES,
  hasBindingIdentifier,
  isTurnFlowActionClass,
  rankBindingIdentifierAlternatives,
} from '../contracts/index.js';
import type {
  ConditionAST,
  EffectAST,
  MacroOrigin,
  NumericValueExpr,
  OptionsQuery,
  PlayerSel,
  TransferVarEndpoint,
  TokenFilterPredicate,
  ValueExpr,
  ZoneRef,
} from '../kernel/types.js';
import { inferQueryDomainKinds, type QueryDomainKind } from '../kernel/query-domain-kinds.js';
import { collectDeclaredBinderCandidates, collectSequentialBindings } from './binder-surface-registry.js';
import {
  lowerConditionNode,
  lowerNumericValueNode,
  lowerQueryNode,
  lowerTokenFilterArray,
  lowerValueNode,
  type ConditionLoweringContext,
} from './compile-conditions.js';
import { createBindingShadowWarning } from './binding-diagnostics.js';
import { SUPPORTED_EFFECT_KINDS } from './effect-kind-registry.js';
import { normalizePlayerSelector } from './compile-selectors.js';
import { canonicalizeZoneSelector } from './compile-zones.js';
import { isTrustedMacroOriginCarrier } from './macro-origin-trust.js';
import { collectReservedCompilerMetadataKeyOccurrencesOnRecord } from './reserved-compiler-metadata.js';
import type { TypeInferenceContext } from './type-inference.js';

type ZoneOwnershipKind = 'none' | 'player' | 'mixed';

export interface EffectLoweringContext {
  readonly ownershipByBase: Readonly<Record<string, ZoneOwnershipKind>>;
  readonly bindingScope?: readonly string[];
  readonly freeOperationActionIds?: readonly string[];
  readonly tokenTraitVocabulary?: Readonly<Record<string, readonly string[]>>;
  readonly tokenFilterProps?: readonly string[];
  readonly namedSets?: Readonly<Record<string, readonly string[]>>;
  readonly typeInference?: TypeInferenceContext;
  readonly seatIds?: readonly string[];
}

export interface EffectLoweringResult<TValue> {
  readonly value: TValue | null;
  readonly diagnostics: readonly Diagnostic[];
}

const toInternalDecisionId = (path: string): string => `decision:${path}`;
const EFFECT_KIND_KEYS: ReadonlySet<string> = new Set(SUPPORTED_EFFECT_KINDS as readonly string[]);
const RESERVED_COMPILER_BINDING_PREFIX = '$__';
const TRUSTED_COMPILER_BINDING_PREFIXES: readonly string[] = ['$__macro_'];
type QueryDomainContract = 'agnostic' | 'tokenOnly' | 'zoneOnly';
const AGNOSTIC_QUERY_DOMAIN_CONTRACT: QueryDomainContract = 'agnostic';
const EFFECT_QUERY_DOMAIN_CONTRACTS = {
  chooseOneOptions: AGNOSTIC_QUERY_DOMAIN_CONTRACT,
  chooseNOptions: AGNOSTIC_QUERY_DOMAIN_CONTRACT,
  forEachOver: AGNOSTIC_QUERY_DOMAIN_CONTRACT,
  reduceOver: AGNOSTIC_QUERY_DOMAIN_CONTRACT,
  evaluateSubsetSource: AGNOSTIC_QUERY_DOMAIN_CONTRACT,
  distributeTokensTokens: 'tokenOnly' as const,
  distributeTokensDestinations: 'zoneOnly' as const,
} as const;
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

function lowerSetVarEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  const scopeValue = source.scope;
  const varName = source.var;
  if ((scopeValue !== 'global' && scopeValue !== 'pvar' && scopeValue !== 'zoneVar') || typeof varName !== 'string') {
    return missingCapability(path, 'setVar effect', source);
  }

  const value = lowerValueNode(source.value, makeConditionContext(context, scope), `${path}.value`);
  const diagnostics = [...value.diagnostics];
  if (value.value === null) {
    return { value: null, diagnostics };
  }

  if (scopeValue === 'global') {
    return {
      value: {
        setVar: {
          scope: 'global',
          var: varName,
          value: value.value,
        },
      },
      diagnostics,
    };
  }

  if (scopeValue === 'zoneVar') {
    const zone = lowerZoneSelector(source.zone, context, scope, `${path}.zone`);
    diagnostics.push(...zone.diagnostics);
    if (zone.value === null) {
      return { value: null, diagnostics };
    }
    return {
      value: {
        setVar: {
          scope: 'zoneVar',
          zone: zone.value,
          var: varName,
          value: value.value,
        },
      },
      diagnostics,
    };
  }

  const player = lowerPlayerSelector(source.player, scope, `${path}.player`, context.seatIds);
  diagnostics.push(...player.diagnostics);
  if (player.value === null) {
    return { value: null, diagnostics };
  }

  return {
    value: {
      setVar: {
        scope: 'pvar',
        player: player.value,
        var: varName,
        value: value.value,
      },
    },
    diagnostics,
  };
}

function lowerAddVarEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  const scopeValue = source.scope;
  const varName = source.var;
  if ((scopeValue !== 'global' && scopeValue !== 'pvar' && scopeValue !== 'zoneVar') || typeof varName !== 'string') {
    return missingCapability(path, 'addVar effect', source);
  }

  const delta = lowerNumericValueNode(source.delta, makeConditionContext(context, scope), `${path}.delta`);
  const diagnostics = [...delta.diagnostics];
  if (delta.value === null) {
    return { value: null, diagnostics };
  }

  if (scopeValue === 'global') {
    return {
      value: {
        addVar: {
          scope: 'global',
          var: varName,
          delta: delta.value,
        },
      },
      diagnostics,
    };
  }

  if (scopeValue === 'zoneVar') {
    const zone = lowerZoneSelector(source.zone, context, scope, `${path}.zone`);
    diagnostics.push(...zone.diagnostics);
    if (zone.value === null) {
      return { value: null, diagnostics };
    }
    return {
      value: {
        addVar: {
          scope: 'zoneVar',
          zone: zone.value,
          var: varName,
          delta: delta.value,
        },
      },
      diagnostics,
    };
  }

  const player = lowerPlayerSelector(source.player, scope, `${path}.player`, context.seatIds);
  diagnostics.push(...player.diagnostics);
  if (player.value === null) {
    return { value: null, diagnostics };
  }

  return {
    value: {
      addVar: {
        scope: 'pvar',
        player: player.value,
        var: varName,
        delta: delta.value,
      },
    },
    diagnostics,
  };
}

function lowerSetActivePlayerEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  const player = lowerPlayerSelector(source.player, scope, `${path}.player`, context.seatIds);
  if (player.value === null) {
    return { value: null, diagnostics: player.diagnostics };
  }

  return {
    value: {
      setActivePlayer: {
        player: player.value,
      },
    },
    diagnostics: player.diagnostics,
  };
}

function lowerTransferVarEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  if (!isRecord(source.from) || !isRecord(source.to) || typeof source.from.var !== 'string' || typeof source.to.var !== 'string') {
    return missingCapability(path, 'transferVar effect', source, [
      '{ transferVar: { from: { scope: "global", var } | { scope: "pvar", player, var } | { scope: "zoneVar", zone, var }, to: { scope: "global", var } | { scope: "pvar", player, var } | { scope: "zoneVar", zone, var }, amount, min?, max?, actualBind? } }',
    ]);
  }

  if (
    (source.from.scope !== 'global' && source.from.scope !== 'pvar' && source.from.scope !== 'zoneVar') ||
    (source.to.scope !== 'global' && source.to.scope !== 'pvar' && source.to.scope !== 'zoneVar')
  ) {
    return missingCapability(path, 'transferVar effect', source, [
      '{ transferVar: { from: { scope: "global", var } | { scope: "pvar", player, var } | { scope: "zoneVar", zone, var }, to: { scope: "global", var } | { scope: "pvar", player, var } | { scope: "zoneVar", zone, var }, amount } }',
    ]);
  }

  const amount = lowerNumericValueNode(source.amount, makeConditionContext(context, scope), `${path}.amount`);
  const diagnostics = [...amount.diagnostics];
  if (amount.value === null) {
    return { value: null, diagnostics };
  }

  let fromPlayer: PlayerSel | undefined;
  let fromZone: ZoneRef | undefined;
  if (source.from.scope === 'pvar') {
    const loweredFromPlayer = lowerPlayerSelector(source.from.player, scope, `${path}.from.player`, context.seatIds);
    diagnostics.push(...loweredFromPlayer.diagnostics);
    if (loweredFromPlayer.value === null) {
      return { value: null, diagnostics };
    }
    fromPlayer = loweredFromPlayer.value;
  } else if (source.from.scope === 'zoneVar') {
    const loweredFromZone = lowerZoneSelector(source.from.zone, context, scope, `${path}.from.zone`);
    diagnostics.push(...loweredFromZone.diagnostics);
    if (loweredFromZone.value === null) {
      return { value: null, diagnostics };
    }
    fromZone = loweredFromZone.value;
  }
  if (source.from.scope !== 'pvar' && source.from.player !== undefined) {
    diagnostics.push(...missingCapability(`${path}.from.player`, `transferVar.from.player for ${String(source.from.scope)} scope`, source.from.player, []).diagnostics);
    return { value: null, diagnostics };
  }
  if (source.from.scope !== 'zoneVar' && source.from.zone !== undefined) {
    diagnostics.push(...missingCapability(`${path}.from.zone`, `transferVar.from.zone for ${String(source.from.scope)} scope`, source.from.zone, []).diagnostics);
    return { value: null, diagnostics };
  }

  let toPlayer: PlayerSel | undefined;
  let toZone: ZoneRef | undefined;
  if (source.to.scope === 'pvar') {
    const loweredToPlayer = lowerPlayerSelector(source.to.player, scope, `${path}.to.player`, context.seatIds);
    diagnostics.push(...loweredToPlayer.diagnostics);
    if (loweredToPlayer.value === null) {
      return { value: null, diagnostics };
    }
    toPlayer = loweredToPlayer.value;
  } else if (source.to.scope === 'zoneVar') {
    const loweredToZone = lowerZoneSelector(source.to.zone, context, scope, `${path}.to.zone`);
    diagnostics.push(...loweredToZone.diagnostics);
    if (loweredToZone.value === null) {
      return { value: null, diagnostics };
    }
    toZone = loweredToZone.value;
  }
  if (source.to.scope !== 'pvar' && source.to.player !== undefined) {
    diagnostics.push(...missingCapability(`${path}.to.player`, `transferVar.to.player for ${String(source.to.scope)} scope`, source.to.player, []).diagnostics);
    return { value: null, diagnostics };
  }
  if (source.to.scope !== 'zoneVar' && source.to.zone !== undefined) {
    diagnostics.push(...missingCapability(`${path}.to.zone`, `transferVar.to.zone for ${String(source.to.scope)} scope`, source.to.zone, []).diagnostics);
    return { value: null, diagnostics };
  }

  let min: NumericValueExpr | undefined;
  if (source.min !== undefined) {
    const loweredMin = lowerNumericValueNode(source.min, makeConditionContext(context, scope), `${path}.min`);
    diagnostics.push(...loweredMin.diagnostics);
    if (loweredMin.value === null) {
      return { value: null, diagnostics };
    }
    min = loweredMin.value;
  }

  let max: NumericValueExpr | undefined;
  if (source.max !== undefined) {
    const loweredMax = lowerNumericValueNode(source.max, makeConditionContext(context, scope), `${path}.max`);
    diagnostics.push(...loweredMax.diagnostics);
    if (loweredMax.value === null) {
      return { value: null, diagnostics };
    }
    max = loweredMax.value;
  }

  if (source.actualBind !== undefined && typeof source.actualBind !== 'string') {
    diagnostics.push(...missingCapability(`${path}.actualBind`, 'transferVar actualBind', source.actualBind, ['string']).diagnostics);
    return { value: null, diagnostics };
  }

  const fromEndpoint: TransferVarEndpoint =
    source.from.scope === 'global'
      ? { scope: 'global', var: source.from.var }
      : source.from.scope === 'pvar'
        ? { scope: 'pvar', player: fromPlayer!, var: source.from.var }
        : { scope: 'zoneVar', zone: fromZone!, var: source.from.var };

  const toEndpoint: TransferVarEndpoint =
    source.to.scope === 'global'
      ? { scope: 'global', var: source.to.var }
      : source.to.scope === 'pvar'
        ? { scope: 'pvar', player: toPlayer!, var: source.to.var }
        : { scope: 'zoneVar', zone: toZone!, var: source.to.var };

  return {
    value: {
      transferVar: {
        from: fromEndpoint,
        to: toEndpoint,
        amount: amount.value,
        ...(min === undefined ? {} : { min }),
        ...(max === undefined ? {} : { max }),
        ...(source.actualBind === undefined ? {} : { actualBind: source.actualBind }),
      },
    },
    diagnostics,
  };
}

function lowerMoveTokenEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  if (typeof source.token !== 'string') {
    return missingCapability(path, 'moveToken effect', source, ['{ moveToken: { token, from, to, position? } }']);
  }

  const from = lowerZoneSelector(source.from, context, scope, `${path}.from`);
  const to = lowerZoneSelector(source.to, context, scope, `${path}.to`);
  const position =
    source.position === undefined || source.position === 'top' || source.position === 'bottom' || source.position === 'random'
      ? source.position
      : null;

  const diagnostics = [
    ...from.diagnostics,
    ...to.diagnostics,
    ...validateBindingReference(source.token, scope, `${path}.token`),
  ];
  if (position === null) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_MISSING_CAPABILITY,
      path: `${path}.position`,
      severity: 'error',
      message: `Cannot lower moveToken.position to kernel AST: ${formatValue(source.position)}.`,
      suggestion: 'Use one of: top, bottom, random.',
      alternatives: ['top', 'bottom', 'random'],
    });
  }
  if (from.value === null || to.value === null || position === null) {
    return { value: null, diagnostics };
  }

  return {
    value: {
      moveToken: {
        token: source.token,
        from: from.value,
        to: to.value,
        ...(position === undefined ? {} : { position }),
      },
    },
    diagnostics,
  };
}

function lowerMoveAllEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  const from = lowerZoneSelector(source.from, context, scope, `${path}.from`);
  const to = lowerZoneSelector(source.to, context, scope, `${path}.to`);
  const filter =
    source.filter === undefined
      ? ({ value: undefined, diagnostics: [] } as const)
      : lowerConditionNode(source.filter, makeConditionContext(context, scope), `${path}.filter`);
  const diagnostics = [...from.diagnostics, ...to.diagnostics, ...filter.diagnostics];
  if (from.value === null || to.value === null || filter.value === null) {
    return { value: null, diagnostics };
  }
  return {
    value: {
      moveAll: {
        from: from.value,
        to: to.value,
        ...(filter.value === undefined ? {} : { filter: filter.value }),
      },
    },
    diagnostics,
  };
}

function lowerMoveTokenAdjacentEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  if (typeof source.token !== 'string') {
    return missingCapability(path, 'moveTokenAdjacent effect', source, ['{ moveTokenAdjacent: { token, from, direction? } }']);
  }

  const from = lowerZoneSelector(source.from, context, scope, `${path}.from`);
  const directionValue = source.direction;
  const diagnostics = [...from.diagnostics, ...validateBindingReference(source.token, scope, `${path}.token`)];

  if (directionValue !== undefined && typeof directionValue !== 'string') {
    diagnostics.push(...missingCapability(`${path}.direction`, 'moveTokenAdjacent direction', directionValue, ['string']).diagnostics);
  }
  if (typeof directionValue === 'string') {
    diagnostics.push(...validatePrefixedBindingReference(directionValue, scope, `${path}.direction`));
  }
  if (from.value === null || (directionValue !== undefined && typeof directionValue !== 'string')) {
    return { value: null, diagnostics };
  }

  return {
    value: {
      moveTokenAdjacent: {
        token: source.token,
        from: from.value,
        ...(directionValue === undefined ? {} : { direction: directionValue }),
      },
    },
    diagnostics,
  };
}

function lowerDrawEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  const from = lowerZoneSelector(source.from, context, scope, `${path}.from`);
  const to = lowerZoneSelector(source.to, context, scope, `${path}.to`);
  const diagnostics = [...from.diagnostics, ...to.diagnostics];
  if (!isInteger(source.count) || source.count < 0) {
    diagnostics.push(...missingCapability(`${path}.count`, 'draw count', source.count, ['non-negative integer']).diagnostics);
  }
  if (from.value === null || to.value === null || !isInteger(source.count) || source.count < 0) {
    return { value: null, diagnostics };
  }
  return {
    value: {
      draw: {
        from: from.value,
        to: to.value,
        count: source.count,
      },
    },
    diagnostics,
  };
}

function lowerRevealEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  const zone = lowerZoneSelector(source.zone, context, scope, `${path}.zone`);
  const diagnostics = [...zone.diagnostics];
  if (zone.value === null) {
    return { value: null, diagnostics };
  }

  let to: 'all' | PlayerSel;
  if (source.to === 'all') {
    to = 'all';
  } else {
    const loweredTo = lowerPlayerSelector(source.to, scope, `${path}.to`, context.seatIds);
    diagnostics.push(...loweredTo.diagnostics);
    if (loweredTo.value === null) {
      return { value: null, diagnostics };
    }
    to = loweredTo.value;
  }

  let filter: readonly TokenFilterPredicate[] | undefined;
  if (source.filter !== undefined) {
    if (!Array.isArray(source.filter)) {
      diagnostics.push(...missingCapability(`${path}.filter`, 'reveal filter', source.filter, ['Array<{ prop, op, value }>']).diagnostics);
      return { value: null, diagnostics };
    }
    const loweredFilter = lowerTokenFilterArray(source.filter, makeConditionContext(context, scope), `${path}.filter`);
    diagnostics.push(...loweredFilter.diagnostics);
    if (loweredFilter.value === null) {
      return { value: null, diagnostics };
    }
    filter = loweredFilter.value;
  }

  return {
    value: {
      reveal: {
        zone: zone.value,
        to,
        ...(filter === undefined ? {} : { filter }),
      },
    },
    diagnostics,
  };
}

function lowerConcealEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  const zone = lowerZoneSelector(source.zone, context, scope, `${path}.zone`);
  const diagnostics = [...zone.diagnostics];
  if (zone.value === null) {
    return { value: null, diagnostics };
  }

  let from: 'all' | PlayerSel | undefined;
  if (source.from === 'all') {
    from = 'all';
  } else if (source.from !== undefined) {
    const loweredFrom = lowerPlayerSelector(source.from, scope, `${path}.from`, context.seatIds);
    diagnostics.push(...loweredFrom.diagnostics);
    if (loweredFrom.value === null) {
      return { value: null, diagnostics };
    }
    from = loweredFrom.value;
  }

  let filter: readonly TokenFilterPredicate[] | undefined;
  if (source.filter !== undefined) {
    if (!Array.isArray(source.filter)) {
      diagnostics.push(...missingCapability(`${path}.filter`, 'conceal filter', source.filter, ['Array<{ prop, op, value }>']).diagnostics);
      return { value: null, diagnostics };
    }
    const loweredFilter = lowerTokenFilterArray(source.filter, makeConditionContext(context, scope), `${path}.filter`);
    diagnostics.push(...loweredFilter.diagnostics);
    if (loweredFilter.value === null) {
      return { value: null, diagnostics };
    }
    filter = loweredFilter.value;
  }

  return {
    value: {
      conceal: {
        zone: zone.value,
        ...(from === undefined ? {} : { from }),
        ...(filter === undefined ? {} : { filter }),
      },
    },
    diagnostics,
  };
}

function lowerShuffleEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  const zone = lowerZoneSelector(source.zone, context, scope, `${path}.zone`);
  if (zone.value === null) {
    return { value: null, diagnostics: zone.diagnostics };
  }
  return {
    value: { shuffle: { zone: zone.value } },
    diagnostics: zone.diagnostics,
  };
}

function lowerCreateTokenEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  if (typeof source.type !== 'string') {
    return missingCapability(path, 'createToken effect', source, ['{ createToken: { type, zone, props? } }']);
  }

  const zone = lowerZoneSelector(source.zone, context, scope, `${path}.zone`);
  const diagnostics = [...zone.diagnostics];
  if (zone.value === null) {
    return { value: null, diagnostics };
  }

  if (source.props !== undefined && !isRecord(source.props)) {
    return {
      value: null,
      diagnostics: [
        ...diagnostics,
        ...missingCapability(`${path}.props`, 'createToken props', source.props, ['record of value expressions']).diagnostics,
      ],
    };
  }

  const props: Record<string, ValueExpr> = {};
  if (isRecord(source.props)) {
    Object.entries(source.props).forEach(([propName, propValue]) => {
      const lowered = lowerValueNode(propValue, makeConditionContext(context, scope), `${path}.props.${propName}`);
      diagnostics.push(...lowered.diagnostics);
      if (lowered.value !== null) {
        props[propName] = lowered.value;
      }
    });
  }

  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    return { value: null, diagnostics };
  }

  return {
    value: {
      createToken: {
        type: source.type,
        zone: zone.value,
        ...(Object.keys(props).length === 0 ? {} : { props }),
      },
    },
    diagnostics,
  };
}

function lowerDestroyTokenEffect(
  source: Record<string, unknown>,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  if (typeof source.token !== 'string') {
    return missingCapability(path, 'destroyToken effect', source, ['{ destroyToken: { token } }']);
  }
  const diagnostics = validateBindingReference(source.token, scope, `${path}.token`);
  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    return { value: null, diagnostics };
  }
  return {
    value: { destroyToken: { token: source.token } },
    diagnostics,
  };
}

function lowerSetTokenPropEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  if (typeof source.token !== 'string' || typeof source.prop !== 'string') {
    return missingCapability(path, 'setTokenProp effect', source, ['{ setTokenProp: { token, prop, value } }']);
  }

  const bindingDiagnostics = validateBindingReference(source.token, scope, `${path}.token`);
  const value = lowerValueNode(source.value, makeConditionContext(context, scope), `${path}.value`);
  const diagnostics = [...bindingDiagnostics, ...value.diagnostics];

  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error') || value.value === null) {
    return { value: null, diagnostics };
  }

  return {
    value: { setTokenProp: { token: source.token, prop: source.prop, value: value.value } },
    diagnostics,
  };
}

function lowerIfEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  if (!Array.isArray(source.then)) {
    return missingCapability(path, 'if effect', source, ['{ if: { when, then: [], else?: [] } }']);
  }
  if (source.else !== undefined && !Array.isArray(source.else)) {
    return missingCapability(path, 'if.else effect list', source.else, ['array']);
  }

  const when = lowerConditionNode(source.when, makeConditionContext(context, scope), `${path}.when`);
  const conditionKey = when.value === null ? null : conditionFingerprint(when.value);
  const guardedThenBindings = conditionKey === null ? [] : scope.guardedBindingsFor(conditionKey);
  const baseBindings = new Set(scope.visibleBindings());
  const effectiveBaseBindings = new Set([...baseBindings, ...guardedThenBindings]);

  const thenScope = scope.clone();
  for (const binding of guardedThenBindings) {
    thenScope.register(binding);
  }
  const thenEffects = lowerNestedEffects(source.then as readonly unknown[], context, thenScope, `${path}.then`);
  const thenBindings = new Set(thenScope.visibleBindings());

  const elseScope = scope.clone();
  const elseEffects =
    source.else === undefined
      ? ({ value: undefined, diagnostics: [] as readonly Diagnostic[] } as const)
      : lowerNestedEffects(source.else as readonly unknown[], context, elseScope, `${path}.else`);
  const elseBindings = source.else === undefined ? baseBindings : new Set(elseScope.visibleBindings());

  const diagnostics = [...when.diagnostics, ...thenEffects.diagnostics, ...elseEffects.diagnostics];
  if (when.value === null || thenEffects.value === null || elseEffects.value === null) {
    return { value: null, diagnostics };
  }

  const guaranteedPostIfBindings = [...thenBindings]
    .filter((binding) => elseBindings.has(binding) && !effectiveBaseBindings.has(binding))
    .sort((left, right) => left.localeCompare(right));
  for (const binding of guaranteedPostIfBindings) {
    scope.register(binding);
  }

  if (conditionKey !== null) {
    const conditionallyAvailableBindings = [...thenBindings]
      .filter((binding) => !elseBindings.has(binding) && !effectiveBaseBindings.has(binding))
      .sort((left, right) => left.localeCompare(right));
    for (const binding of conditionallyAvailableBindings) {
      scope.registerGuarded(conditionKey, binding);
    }
  }

  return {
    value: {
      if: {
        when: when.value,
        then: thenEffects.value,
        ...(elseEffects.value === undefined ? {} : { else: elseEffects.value }),
      },
    },
    diagnostics,
  };
}

function lowerForEachEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  if (typeof source.bind !== 'string' || !Array.isArray(source.effects)) {
    return missingCapability(path, 'forEach effect', source, ['{ forEach: { bind, over, effects, limit?, countBind?, in? } }']);
  }

  const condCtx = makeConditionContext(context, scope);
  const over = lowerQueryNode(source.over, condCtx, `${path}.over`);
  const diagnostics = [...over.diagnostics];
  if (over.value !== null) {
    diagnostics.push(
      ...validateQueryDomainContract(
        over.value,
        EFFECT_QUERY_DOMAIN_CONTRACTS.forEachOver,
        `${path}.over`,
      ),
    );
  }

  let loweredLimit: NumericValueExpr | undefined;
  if (source.limit !== undefined) {
    const limitResult = lowerNumericValueNode(source.limit, condCtx, `${path}.limit`);
    diagnostics.push(...limitResult.diagnostics);
    if (limitResult.value === null) {
      return { value: null, diagnostics };
    }
    loweredLimit = limitResult.value;
  }

  diagnostics.push(...scope.shadowWarning(source.bind, `${path}.bind`));
  const loweredEffects = scope.withBinding(source.bind, () =>
    lowerNestedEffects(source.effects as readonly unknown[], context, scope, `${path}.effects`),
  );
  diagnostics.push(...loweredEffects.diagnostics);

  const countBind = typeof source.countBind === 'string' ? source.countBind : undefined;
  const macroOrigin = readMacroOrigin(source.macroOrigin, source, `${path}.macroOrigin`);
  diagnostics.push(...macroOrigin.diagnostics);
  let loweredIn: readonly EffectAST[] | undefined;
  if (countBind !== undefined && Array.isArray(source.in)) {
    diagnostics.push(...scope.shadowWarning(countBind, `${path}.countBind`));
    const inResult = scope.withBinding(countBind, () =>
      lowerNestedEffects(source.in as readonly unknown[], context, scope, `${path}.in`),
    );
    diagnostics.push(...inResult.diagnostics);
    if (inResult.value === null) {
      return { value: null, diagnostics };
    }
    loweredIn = inResult.value;
  }

  if (
    over.value === null
    || loweredEffects.value === null
    || macroOrigin.value === null
  ) {
    return { value: null, diagnostics };
  }

  return {
    value: {
      forEach: {
        bind: source.bind,
        ...(macroOrigin.value === undefined ? {} : { macroOrigin: macroOrigin.value }),
        over: over.value,
        effects: loweredEffects.value,
        ...(loweredLimit !== undefined ? { limit: loweredLimit } : {}),
        ...(countBind !== undefined ? { countBind } : {}),
        ...(loweredIn !== undefined ? { in: loweredIn } : {}),
      },
    },
    diagnostics,
  };
}

function lowerReduceEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  if (
    typeof source.itemBind !== 'string'
    || typeof source.accBind !== 'string'
    || typeof source.resultBind !== 'string'
    || !Array.isArray(source.in)
  ) {
    return missingCapability(path, 'reduce effect', source, [
      '{ reduce: { itemBind, accBind, over, initial, next, limit?, resultBind, in } }',
    ]);
  }
  const itemBind = source.itemBind;
  const accBind = source.accBind;
  const resultBind = source.resultBind;

  if (Object.prototype.hasOwnProperty.call(source, 'macroOrigin')) {
    return {
      value: null,
      diagnostics: [{
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_MACRO_ORIGIN_UNTRUSTED,
        path: `${path}.macroOrigin`,
        severity: 'error',
        message: 'reduce.macroOrigin has been removed and is no longer accepted.',
        suggestion: 'Remove reduce.macroOrigin from authored YAML; compiler emits item/acc/result binder provenance fields.',
      }],
    };
  }

  const itemMacroOrigin = readMacroOrigin(source.itemMacroOrigin, source, `${path}.itemMacroOrigin`);
  const accMacroOrigin = readMacroOrigin(source.accMacroOrigin, source, `${path}.accMacroOrigin`);
  const resultMacroOrigin = readMacroOrigin(source.resultMacroOrigin, source, `${path}.resultMacroOrigin`);

  const duplicateBindings = new Set<string>();
  if (itemBind === accBind) {
    duplicateBindings.add(itemBind);
  }
  if (itemBind === resultBind) {
    duplicateBindings.add(itemBind);
  }
  if (accBind === resultBind) {
    duplicateBindings.add(accBind);
  }
  if (duplicateBindings.size > 0) {
    return {
      value: null,
      diagnostics: [{
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_MISSING_CAPABILITY,
        path,
        severity: 'error',
        message: 'reduce binders itemBind, accBind, and resultBind must be distinct.',
        suggestion: 'Rename reduce binders so each role uses a unique binding identifier.',
      }],
    };
  }

  const condCtx = makeConditionContext(context, scope);
  const over = lowerQueryNode(source.over, condCtx, `${path}.over`);
  const initial = lowerValueNode(source.initial, condCtx, `${path}.initial`);
  const diagnostics = [
    ...itemMacroOrigin.diagnostics,
    ...accMacroOrigin.diagnostics,
    ...resultMacroOrigin.diagnostics,
    ...over.diagnostics,
    ...initial.diagnostics,
    ...scope.shadowWarning(itemBind, `${path}.itemBind`),
    ...scope.shadowWarning(accBind, `${path}.accBind`),
    ...scope.shadowWarning(resultBind, `${path}.resultBind`),
  ];
  if (over.value !== null) {
    diagnostics.push(
      ...validateQueryDomainContract(
        over.value,
        EFFECT_QUERY_DOMAIN_CONTRACTS.reduceOver,
        `${path}.over`,
      ),
    );
  }

  let loweredLimit: NumericValueExpr | undefined;
  if (source.limit !== undefined) {
    const limitResult = lowerNumericValueNode(source.limit, condCtx, `${path}.limit`);
    diagnostics.push(...limitResult.diagnostics);
    if (limitResult.value === null) {
      return { value: null, diagnostics };
    }
    loweredLimit = limitResult.value;
  }

  const next = scope.withBinding(itemBind, () =>
    scope.withBinding(accBind, () =>
      lowerValueNode(source.next, makeConditionContext(context, scope), `${path}.next`),
    ),
  );
  diagnostics.push(...next.diagnostics);

  const loweredIn = scope.withBinding(resultBind, () =>
    lowerNestedEffects(source.in as readonly unknown[], context, scope, `${path}.in`),
  );
  diagnostics.push(...loweredIn.diagnostics);

  if (
    over.value === null
    || initial.value === null
    || next.value === null
    || loweredIn.value === null
    || itemMacroOrigin.value === null
    || accMacroOrigin.value === null
    || resultMacroOrigin.value === null
  ) {
    return { value: null, diagnostics };
  }

  return {
    value: {
      reduce: {
        itemBind,
        accBind,
        ...(itemMacroOrigin.value === undefined ? {} : { itemMacroOrigin: itemMacroOrigin.value }),
        ...(accMacroOrigin.value === undefined ? {} : { accMacroOrigin: accMacroOrigin.value }),
        over: over.value,
        initial: initial.value,
        next: next.value,
        ...(loweredLimit === undefined ? {} : { limit: loweredLimit }),
        resultBind,
        ...(resultMacroOrigin.value === undefined ? {} : { resultMacroOrigin: resultMacroOrigin.value }),
        in: loweredIn.value,
      },
    },
    diagnostics,
  };
}

function lowerRemoveByPriorityEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  if (!Array.isArray(source.groups)) {
    return missingCapability(path, 'removeByPriority effect', source, [
      '{ removeByPriority: { budget, groups: [{ bind, over, to, from?, countBind? }...], remainingBind?, in? } }',
    ]);
  }

  const budgetResult = lowerNumericValueNode(source.budget, makeConditionContext(context, scope), `${path}.budget`);
  const diagnostics: Diagnostic[] = [...budgetResult.diagnostics];
  const macroOrigin = readMacroOrigin(source.macroOrigin, source, `${path}.macroOrigin`);
  diagnostics.push(...macroOrigin.diagnostics);
  const loweredGroups: Array<{
    bind: string;
    over: NonNullable<ReturnType<typeof lowerQueryNode>['value']>;
    to: NonNullable<ReturnType<typeof lowerZoneSelector>['value']>;
    from?: NonNullable<ReturnType<typeof lowerZoneSelector>['value']>;
    countBind?: string;
    macroOrigin?: MacroOrigin;
  }> = [];

  source.groups.forEach((entry, index) => {
    const groupPath = `${path}.groups.${index}`;
    if (!isRecord(entry) || typeof entry.bind !== 'string') {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_MISSING_CAPABILITY,
        path: groupPath,
        severity: 'error',
        message:
          'Cannot lower removeByPriority group to kernel AST: expected { bind, over, to, from?, countBind? }.',
        suggestion: 'Define each group with bind, over query, and destination zone selector.',
      });
      return;
    }

    diagnostics.push(...scope.shadowWarning(entry.bind, `${groupPath}.bind`));
    const condCtx = makeConditionContext(context, scope);
    const over = lowerQueryNode(entry.over, condCtx, `${groupPath}.over`);
    diagnostics.push(...over.diagnostics);

    const toResult = scope.withBinding(entry.bind, () => lowerZoneSelector(entry.to, context, scope, `${groupPath}.to`));
    diagnostics.push(...toResult.diagnostics);

    let fromResult: EffectLoweringResult<ZoneRef> | undefined;
    if (entry.from !== undefined) {
      fromResult = scope.withBinding(entry.bind, () => lowerZoneSelector(entry.from, context, scope, `${groupPath}.from`));
      diagnostics.push(...fromResult.diagnostics);
    }

    const countBind = typeof entry.countBind === 'string' ? entry.countBind : undefined;
    const groupMacroOrigin = readMacroOrigin(entry.macroOrigin, entry, `${groupPath}.macroOrigin`);
    diagnostics.push(...groupMacroOrigin.diagnostics);
    if (over.value === null || toResult.value === null || fromResult?.value === null || groupMacroOrigin.value === null) {
      return;
    }

    loweredGroups.push({
      bind: entry.bind,
      over: over.value,
      to: toResult.value,
      ...(fromResult?.value === undefined ? {} : { from: fromResult.value }),
      ...(countBind === undefined ? {} : { countBind }),
      ...(groupMacroOrigin.value === undefined ? {} : { macroOrigin: groupMacroOrigin.value }),
    });
  });

  const remainingBind = typeof source.remainingBind === 'string' ? source.remainingBind : undefined;
  if (remainingBind !== undefined) {
    diagnostics.push(...scope.shadowWarning(remainingBind, `${path}.remainingBind`));
  }

  let loweredIn: readonly EffectAST[] | undefined;
  if (Array.isArray(source.in)) {
    const inCallback = (): EffectLoweringResult<readonly EffectAST[]> => {
      const countBinds = loweredGroups.flatMap((group) => (group.countBind === undefined ? [] : [group.countBind]));

      const withCountBindings = (offset: number): EffectLoweringResult<readonly EffectAST[]> => {
        if (offset >= countBinds.length) {
          return lowerNestedEffects(source.in as readonly unknown[], context, scope, `${path}.in`);
        }
        const bind = countBinds[offset]!;
        return scope.withBinding(bind, () => withCountBindings(offset + 1));
      };

      if (remainingBind !== undefined) {
        return scope.withBinding(remainingBind, () => withCountBindings(0));
      }
      return withCountBindings(0);
    };

    const inResult = inCallback();
    diagnostics.push(...inResult.diagnostics);
    if (inResult.value === null) {
      return { value: null, diagnostics };
    }
    loweredIn = inResult.value;
  }

  if (budgetResult.value === null || macroOrigin.value === null || diagnostics.some((d) => d.severity === 'error')) {
    return { value: null, diagnostics };
  }

  return {
    value: {
      removeByPriority: {
        budget: budgetResult.value,
        groups: loweredGroups,
        ...(remainingBind === undefined ? {} : { remainingBind }),
        ...(loweredIn === undefined ? {} : { in: loweredIn }),
        ...(macroOrigin.value === undefined ? {} : { macroOrigin: macroOrigin.value }),
      },
    },
    diagnostics,
  };
}

function lowerLetEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  if (typeof source.bind !== 'string' || !Array.isArray(source.in)) {
    return missingCapability(path, 'let effect', source, ['{ let: { bind, value, in } }']);
  }

  const value = lowerValueNode(source.value, makeConditionContext(context, scope), `${path}.value`);
  const diagnostics = [...value.diagnostics, ...scope.shadowWarning(source.bind, `${path}.bind`)];
  const inEffects = scope.withBinding(source.bind, () => lowerNestedEffects(source.in as readonly unknown[], context, scope, `${path}.in`));
  diagnostics.push(...inEffects.diagnostics);

  if (value.value === null || inEffects.value === null) {
    return { value: null, diagnostics };
  }

  return {
    value: {
      let: {
        bind: source.bind,
        value: value.value,
        in: inEffects.value,
      },
    },
    diagnostics,
  };
}

function lowerBindValueEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  if (typeof source.bind !== 'string') {
    return missingCapability(path, 'bindValue effect', source, ['{ bindValue: { bind, value } }']);
  }

  const value = lowerValueNode(source.value, makeConditionContext(context, scope), `${path}.value`);
  const diagnostics = [...value.diagnostics, ...scope.shadowWarning(source.bind, `${path}.bind`)];
  if (value.value === null) {
    return { value: null, diagnostics };
  }

  return {
    value: {
      bindValue: {
        bind: source.bind,
        value: value.value,
      },
    },
    diagnostics,
  };
}

function lowerEvaluateSubsetEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  if (
    typeof source.subsetBind !== 'string'
    || typeof source.resultBind !== 'string'
    || !Array.isArray(source.compute)
    || !Array.isArray(source.in)
  ) {
    return missingCapability(path, 'evaluateSubset effect', source, [
      '{ evaluateSubset: { source, subsetSize, subsetBind, compute, scoreExpr, resultBind, bestSubsetBind?, in } }',
    ]);
  }

  const condCtx = makeConditionContext(context, scope);
  const loweredSource = lowerQueryNode(source.source, condCtx, `${path}.source`);
  const loweredSubsetSize = lowerNumericValueNode(source.subsetSize, condCtx, `${path}.subsetSize`);
  const diagnostics: Diagnostic[] = [
    ...loweredSource.diagnostics,
    ...loweredSubsetSize.diagnostics,
    ...scope.shadowWarning(source.subsetBind, `${path}.subsetBind`),
    ...scope.shadowWarning(source.resultBind, `${path}.resultBind`),
  ];
  if (loweredSource.value !== null) {
    diagnostics.push(
      ...validateQueryDomainContract(
        loweredSource.value,
        EFFECT_QUERY_DOMAIN_CONTRACTS.evaluateSubsetSource,
        `${path}.source`,
      ),
    );
  }

  const bestSubsetBind = typeof source.bestSubsetBind === 'string' ? source.bestSubsetBind : undefined;
  if (source.bestSubsetBind !== undefined && typeof source.bestSubsetBind !== 'string') {
    diagnostics.push(...missingCapability(`${path}.bestSubsetBind`, 'evaluateSubset bestSubsetBind', source.bestSubsetBind, ['string']).diagnostics);
  }
  if (bestSubsetBind !== undefined) {
    diagnostics.push(...scope.shadowWarning(bestSubsetBind, `${path}.bestSubsetBind`));
  }

  const computeAndScore = scope.withBinding(source.subsetBind, () => {
    const loweredCompute = lowerNestedEffects(source.compute as readonly unknown[], context, scope, `${path}.compute`);
    const scoreLowering = (): EffectLoweringResult<NumericValueExpr> =>
      lowerNumericValueNode(source.scoreExpr, makeConditionContext(context, scope), `${path}.scoreExpr`);
    const loweredScoreExpr =
      loweredCompute.value === null
        ? scoreLowering()
        : scope.withBindings(
            loweredCompute.value.flatMap((effect) => collectSequentialBindings(effect)),
            scoreLowering,
          );

    return {
      loweredCompute,
      loweredScoreExpr,
    };
  });
  diagnostics.push(...computeAndScore.loweredCompute.diagnostics, ...computeAndScore.loweredScoreExpr.diagnostics);

  const loweredIn = scope.withBinding(source.resultBind, () => (
    bestSubsetBind === undefined
      ? lowerNestedEffects(source.in as readonly unknown[], context, scope, `${path}.in`)
      : scope.withBinding(bestSubsetBind, () =>
        lowerNestedEffects(source.in as readonly unknown[], context, scope, `${path}.in`))
  ));
  diagnostics.push(...loweredIn.diagnostics);

  if (
    loweredSource.value === null
    || loweredSubsetSize.value === null
    || computeAndScore.loweredCompute.value === null
    || computeAndScore.loweredScoreExpr.value === null
    || loweredIn.value === null
  ) {
    return { value: null, diagnostics };
  }

  return {
    value: {
      evaluateSubset: {
        source: loweredSource.value,
        subsetSize: loweredSubsetSize.value,
        subsetBind: source.subsetBind,
        compute: computeAndScore.loweredCompute.value,
        scoreExpr: computeAndScore.loweredScoreExpr.value,
        resultBind: source.resultBind,
        ...(bestSubsetBind === undefined ? {} : { bestSubsetBind }),
        in: loweredIn.value,
      },
    },
    diagnostics,
  };
}

function lowerRollRandomEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  if (typeof source.bind !== 'string' || !Array.isArray(source.in)) {
    return missingCapability(path, 'rollRandom effect', source, ['{ rollRandom: { bind, min, max, in } }']);
  }

  const condCtx = makeConditionContext(context, scope);
  const minResult = lowerNumericValueNode(source.min, condCtx, `${path}.min`);
  const maxResult = lowerNumericValueNode(source.max, condCtx, `${path}.max`);
  const diagnostics = [...minResult.diagnostics, ...maxResult.diagnostics, ...scope.shadowWarning(source.bind, `${path}.bind`)];
  const inEffects = scope.withBinding(source.bind, () => lowerNestedEffects(source.in as readonly unknown[], context, scope, `${path}.in`));
  diagnostics.push(...inEffects.diagnostics);

  if (minResult.value === null || maxResult.value === null || inEffects.value === null) {
    return { value: null, diagnostics };
  }

  return {
    value: {
      rollRandom: {
        bind: source.bind,
        min: minResult.value,
        max: maxResult.value,
        in: inEffects.value,
      },
    },
    diagnostics,
  };
}

function lowerSetMarkerEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  if (typeof source.marker !== 'string') {
    return missingCapability(path, 'setMarker effect', source, ['{ setMarker: { space, marker, state } }']);
  }

  const space = lowerZoneSelector(source.space, context, scope, `${path}.space`);
  const stateResult = lowerValueNode(source.state, makeConditionContext(context, scope), `${path}.state`);
  const diagnostics = [...space.diagnostics, ...stateResult.diagnostics];

  if (space.value === null || stateResult.value === null) {
    return { value: null, diagnostics };
  }

  return {
    value: {
      setMarker: {
        space: space.value,
        marker: source.marker,
        state: stateResult.value,
      },
    },
    diagnostics,
  };
}

function lowerShiftMarkerEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  if (typeof source.marker !== 'string') {
    return missingCapability(path, 'shiftMarker effect', source, ['{ shiftMarker: { space, marker, delta } }']);
  }

  const space = lowerZoneSelector(source.space, context, scope, `${path}.space`);
  const delta = lowerNumericValueNode(source.delta, makeConditionContext(context, scope), `${path}.delta`);
  const diagnostics = [...space.diagnostics, ...delta.diagnostics];

  if (space.value === null || delta.value === null) {
    return { value: null, diagnostics };
  }

  return {
    value: {
      shiftMarker: {
        space: space.value,
        marker: source.marker,
        delta: delta.value,
      },
    },
    diagnostics,
  };
}

function lowerSetGlobalMarkerEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  if (typeof source.marker !== 'string') {
    return missingCapability(path, 'setGlobalMarker effect', source, ['{ setGlobalMarker: { marker, state } }']);
  }

  const state = lowerValueNode(source.state, makeConditionContext(context, scope), `${path}.state`);
  const diagnostics = [...state.diagnostics];
  if (state.value === null) {
    return { value: null, diagnostics };
  }

  return {
    value: {
      setGlobalMarker: {
        marker: source.marker,
        state: state.value,
      },
    },
    diagnostics,
  };
}

function lowerFlipGlobalMarkerEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  const marker = lowerValueNode(source.marker, makeConditionContext(context, scope), `${path}.marker`);
  const stateA = lowerValueNode(source.stateA, makeConditionContext(context, scope), `${path}.stateA`);
  const stateB = lowerValueNode(source.stateB, makeConditionContext(context, scope), `${path}.stateB`);
  const diagnostics = [...marker.diagnostics, ...stateA.diagnostics, ...stateB.diagnostics];

  if (marker.value === null || stateA.value === null || stateB.value === null) {
    return { value: null, diagnostics };
  }

  return {
    value: {
      flipGlobalMarker: {
        marker: marker.value,
        stateA: stateA.value,
        stateB: stateB.value,
      },
    },
    diagnostics,
  };
}

function lowerShiftGlobalMarkerEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  if (typeof source.marker !== 'string') {
    return missingCapability(path, 'shiftGlobalMarker effect', source, ['{ shiftGlobalMarker: { marker, delta } }']);
  }

  const delta = lowerNumericValueNode(source.delta, makeConditionContext(context, scope), `${path}.delta`);
  const diagnostics = [...delta.diagnostics];
  if (delta.value === null) {
    return { value: null, diagnostics };
  }

  return {
    value: {
      shiftGlobalMarker: {
        marker: source.marker,
        delta: delta.value,
      },
    },
    diagnostics,
  };
}

function lowerGrantFreeOperationEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  if (typeof source.seat !== 'string') {
    return missingCapability(path, 'grantFreeOperation effect', source, [
      '{ grantFreeOperation: { seat, operationClass, actionIds?, executeAsSeat?, zoneFilter?, uses?, id?, sequence? } }',
    ]);
  }
  if (typeof source.operationClass !== 'string' || !isTurnFlowActionClass(source.operationClass)) {
    return missingCapability(`${path}.operationClass`, 'grantFreeOperation operationClass', source.operationClass, [
      ...TURN_FLOW_ACTION_CLASS_VALUES,
    ]);
  }

  const diagnostics: Diagnostic[] = [];
  let effectId: string | undefined;
  if (source.id !== undefined && typeof source.id !== 'string') {
    diagnostics.push(...missingCapability(`${path}.id`, 'grantFreeOperation id', source.id, ['string']).diagnostics);
  } else if (typeof source.id === 'string') {
    effectId = source.id;
  }
  let executeAsSeat: string | undefined;
  if (source.executeAsSeat !== undefined && typeof source.executeAsSeat !== 'string') {
    diagnostics.push(
      ...missingCapability(`${path}.executeAsSeat`, 'grantFreeOperation executeAsSeat', source.executeAsSeat, ['string'])
        .diagnostics,
    );
  } else if (typeof source.executeAsSeat === 'string') {
    executeAsSeat = source.executeAsSeat;
  }
  let actionIds: string[] | undefined;
  if (source.actionIds !== undefined && (!Array.isArray(source.actionIds) || source.actionIds.some((entry) => typeof entry !== 'string'))) {
    diagnostics.push(...missingCapability(`${path}.actionIds`, 'grantFreeOperation actionIds', source.actionIds, ['string[]']).diagnostics);
  } else if (Array.isArray(source.actionIds)) {
    actionIds = [...source.actionIds] as string[];
  }
  let uses: number | undefined;
  if (
    source.uses !== undefined &&
    (!isInteger(source.uses) || source.uses <= 0)
  ) {
    diagnostics.push(
      ...missingCapability(`${path}.uses`, 'grantFreeOperation uses', source.uses, ['positive integer']).diagnostics,
    );
  } else if (isInteger(source.uses) && source.uses > 0) {
    uses = source.uses;
  }

  let loweredZoneFilter: ConditionAST | undefined;
  if (source.zoneFilter !== undefined) {
    const lowered = scope.withBinding('$zone', () =>
      lowerConditionNode(source.zoneFilter, makeConditionContext(context, scope), `${path}.zoneFilter`));
    diagnostics.push(...lowered.diagnostics);
    if (lowered.value === null) {
      return { value: null, diagnostics };
    }
    loweredZoneFilter = lowered.value;
  }

  let loweredSequence: { readonly chain: string; readonly step: number } | undefined;
  if (source.sequence !== undefined) {
    if (!isRecord(source.sequence) || typeof source.sequence.chain !== 'string' || !isInteger(source.sequence.step) || source.sequence.step < 0) {
      diagnostics.push(
        ...missingCapability(`${path}.sequence`, 'grantFreeOperation sequence', source.sequence, [
          '{ chain: string, step: non-negative integer }',
        ]).diagnostics,
      );
    } else {
      loweredSequence = {
        chain: source.sequence.chain,
        step: source.sequence.step,
      };
    }
  }

  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    return { value: null, diagnostics };
  }

  return {
    value: {
      grantFreeOperation: {
        seat: source.seat,
        operationClass: source.operationClass,
        ...(effectId === undefined ? {} : { id: effectId }),
        ...(executeAsSeat === undefined ? {} : { executeAsSeat }),
        ...(actionIds === undefined ? {} : { actionIds }),
        ...(loweredZoneFilter === undefined ? {} : { zoneFilter: loweredZoneFilter }),
        ...(uses === undefined ? {} : { uses }),
        ...(loweredSequence === undefined ? {} : { sequence: loweredSequence }),
      },
    },
    diagnostics,
  };
}

function lowerGotoPhaseExactEffect(
  source: Record<string, unknown>,
  path: string,
): EffectLoweringResult<EffectAST> {
  if (typeof source.phase !== 'string') {
    return missingCapability(path, 'gotoPhaseExact effect', source, ['{ gotoPhaseExact: { phase: string } }']);
  }

  return {
    value: {
      gotoPhaseExact: {
        phase: source.phase,
      },
    },
    diagnostics: [],
  };
}

function lowerAdvancePhaseEffect(
  source: Record<string, unknown>,
  path: string,
): EffectLoweringResult<EffectAST> {
  if (Object.keys(source).length !== 0) {
    return missingCapability(path, 'advancePhase effect', source, ['{ advancePhase: {} }']);
  }

  return {
    value: {
      advancePhase: {},
    },
    diagnostics: [],
  };
}

function lowerPushInterruptPhaseEffect(
  source: Record<string, unknown>,
  path: string,
): EffectLoweringResult<EffectAST> {
  if (typeof source.phase !== 'string' || typeof source.resumePhase !== 'string') {
    return missingCapability(path, 'pushInterruptPhase effect', source, [
      '{ pushInterruptPhase: { phase: string, resumePhase: string } }',
    ]);
  }

  return {
    value: {
      pushInterruptPhase: {
        phase: source.phase,
        resumePhase: source.resumePhase,
      },
    },
    diagnostics: [],
  };
}

function lowerPopInterruptPhaseEffect(
  source: Record<string, unknown>,
  path: string,
): EffectLoweringResult<EffectAST> {
  if (Object.keys(source).length !== 0) {
    return missingCapability(path, 'popInterruptPhase effect', source, ['{ popInterruptPhase: {} }']);
  }

  return {
    value: {
      popInterruptPhase: {},
    },
    diagnostics: [],
  };
}

function lowerChooseOneEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  if (typeof source.bind !== 'string') {
    return missingCapability(path, 'chooseOne effect', source, ['{ chooseOne: { bind, options } }']);
  }
  const options = lowerQueryNode(source.options, makeConditionContext(context, scope), `${path}.options`);
  const chooser = source.chooser === undefined
    ? { value: undefined, diagnostics: [] }
    : normalizePlayerSelector(source.chooser, `${path}.chooser`, context.seatIds);
  const diagnostics = [...options.diagnostics, ...chooser.diagnostics];
  if (options.value !== null) {
    diagnostics.push(
      ...validateQueryDomainContract(
        options.value,
        EFFECT_QUERY_DOMAIN_CONTRACTS.chooseOneOptions,
        `${path}.options`,
      ),
    );
    diagnostics.push(
      ...validateChoiceOptionsRuntimeShape(
        options.value,
        `${path}.options`,
        'chooseOne',
      ),
    );
  }
  if (options.value === null) {
    return { value: null, diagnostics };
  }
  if (chooser.value === null) {
    return { value: null, diagnostics };
  }
  return {
    value: {
      chooseOne: {
        internalDecisionId: toInternalDecisionId(path),
        bind: source.bind,
        options: options.value,
        ...(chooser.value === undefined ? {} : { chooser: chooser.value }),
      },
    },
    diagnostics,
  };
}

function lowerChooseNEffect(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<EffectAST> {
  if (typeof source.bind !== 'string') {
    return missingCapability(path, 'chooseN effect', source, [
      '{ chooseN: { bind, options, n } }',
      '{ chooseN: { bind, options, max, min? } }',
    ]);
  }
  const options = lowerQueryNode(source.options, makeConditionContext(context, scope), `${path}.options`);
  const condCtx = makeConditionContext(context, scope);
  const chooser = source.chooser === undefined
    ? { value: undefined, diagnostics: [] }
    : normalizePlayerSelector(source.chooser, `${path}.chooser`, context.seatIds);
  const diagnostics = [...options.diagnostics, ...chooser.diagnostics];
  if (options.value !== null) {
    diagnostics.push(
      ...validateQueryDomainContract(
        options.value,
        EFFECT_QUERY_DOMAIN_CONTRACTS.chooseNOptions,
        `${path}.options`,
      ),
    );
    diagnostics.push(
      ...validateChoiceOptionsRuntimeShape(
        options.value,
        `${path}.options`,
        'chooseN',
      ),
    );
  }

  const hasN = source.n !== undefined;
  const hasMin = source.min !== undefined;
  const hasMax = source.max !== undefined;

  if (hasN && (hasMin || hasMax)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_MISSING_CAPABILITY,
      path,
      severity: 'error',
      message: 'chooseN must use either exact "n" or range "min/max", not both.',
      suggestion: 'Use { n } for exact cardinality or { max, min? } for range cardinality.',
      alternatives: ['n', 'max'],
    });
  }

  if (!hasN && !hasMax) {
    diagnostics.push(...missingCapability(path, 'chooseN cardinality', source, ['{ n }', '{ max, min? }']).diagnostics);
  }

  let loweredMin: NumericValueExpr | undefined;
  let loweredMax: NumericValueExpr | undefined;

  if (hasN && (!isInteger(source.n) || source.n < 0)) {
    diagnostics.push(...missingCapability(`${path}.n`, 'chooseN n', source.n, ['non-negative integer']).diagnostics);
  }
  if (hasMax) {
    const maxResult = lowerNumericValueNode(source.max, condCtx, `${path}.max`);
    diagnostics.push(...maxResult.diagnostics);
    if (maxResult.value !== null) {
      loweredMax = maxResult.value;
      if (typeof loweredMax === 'number' && (!isInteger(loweredMax) || loweredMax < 0)) {
        diagnostics.push(...missingCapability(`${path}.max`, 'chooseN max', source.max, ['non-negative integer']).diagnostics);
      }
    }
  }
  if (hasMin) {
    const minResult = lowerNumericValueNode(source.min, condCtx, `${path}.min`);
    diagnostics.push(...minResult.diagnostics);
    if (minResult.value !== null) {
      loweredMin = minResult.value;
      if (typeof loweredMin === 'number' && (!isInteger(loweredMin) || loweredMin < 0)) {
        diagnostics.push(...missingCapability(`${path}.min`, 'chooseN min', source.min, ['non-negative integer']).diagnostics);
      }
    }
  }

  if (
    loweredMax !== undefined
    && loweredMin !== undefined
    && typeof loweredMax === 'number'
    && typeof loweredMin === 'number'
    && loweredMin > loweredMax
  ) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_MISSING_CAPABILITY,
      path,
      severity: 'error',
      message: 'chooseN min cannot exceed max.',
      suggestion: 'Set chooseN.min <= chooseN.max.',
    });
  }

  if (options.value === null || diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    return { value: null, diagnostics };
  }
  const normalizedChooser = chooser.value ?? undefined;

  const cardinality =
    hasN && isInteger(source.n)
      ? { n: source.n }
      : {
          max: loweredMax as NumericValueExpr,
          ...(loweredMin === undefined ? {} : { min: loweredMin }),
        };
  return {
    value: {
      chooseN: {
        internalDecisionId: toInternalDecisionId(path),
        bind: source.bind,
        options: options.value,
        ...(normalizedChooser === undefined ? {} : { chooser: normalizedChooser }),
        ...cardinality,
      },
    },
    diagnostics,
  };
}

function lowerDistributeTokensEffects(
  source: Record<string, unknown>,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<readonly EffectAST[]> {
  if (!isRecord(source.tokens) || !isRecord(source.destinations)) {
    return missingCapability(path, 'distributeTokens effect', source, [
      '{ distributeTokens: { tokens, destinations, n } }',
      '{ distributeTokens: { tokens, destinations, max, min? } }',
    ]);
  }

  const condCtx = makeConditionContext(context, scope);
  const tokenOptions = lowerQueryNode(source.tokens, condCtx, `${path}.tokens`);
  const destinationOptions = lowerQueryNode(source.destinations, condCtx, `${path}.destinations`);
  const diagnostics = [...tokenOptions.diagnostics, ...destinationOptions.diagnostics];
  if (tokenOptions.value !== null) {
    diagnostics.push(
      ...validateQueryDomainContract(
        tokenOptions.value,
        EFFECT_QUERY_DOMAIN_CONTRACTS.distributeTokensTokens,
        `${path}.tokens`,
      ),
    );
  }
  if (destinationOptions.value !== null) {
    diagnostics.push(
      ...validateQueryDomainContract(
        destinationOptions.value,
        EFFECT_QUERY_DOMAIN_CONTRACTS.distributeTokensDestinations,
        `${path}.destinations`,
      ),
    );
  }

  const hasN = source.n !== undefined;
  const hasMin = source.min !== undefined;
  const hasMax = source.max !== undefined;

  if (hasN && (hasMin || hasMax)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_MISSING_CAPABILITY,
      path,
      severity: 'error',
      message: 'distributeTokens must use either exact "n" or range "min/max", not both.',
      suggestion: 'Use { n } for exact cardinality or { max, min? } for range cardinality.',
      alternatives: ['n', 'max'],
    });
  }

  if (!hasN && !hasMax) {
    diagnostics.push(...missingCapability(path, 'distributeTokens cardinality', source, ['{ n }', '{ max, min? }']).diagnostics);
  }

  let loweredMin: NumericValueExpr | undefined;
  let loweredMax: NumericValueExpr | undefined;

  if (hasN && (!isInteger(source.n) || source.n < 0)) {
    diagnostics.push(...missingCapability(`${path}.n`, 'distributeTokens n', source.n, ['non-negative integer']).diagnostics);
  }
  if (hasMax) {
    const maxResult = lowerNumericValueNode(source.max, condCtx, `${path}.max`);
    diagnostics.push(...maxResult.diagnostics);
    if (maxResult.value !== null) {
      loweredMax = maxResult.value;
      if (typeof loweredMax === 'number' && (!isInteger(loweredMax) || loweredMax < 0)) {
        diagnostics.push(...missingCapability(`${path}.max`, 'distributeTokens max', source.max, ['non-negative integer']).diagnostics);
      }
    }
  }
  if (hasMin) {
    const minResult = lowerNumericValueNode(source.min, condCtx, `${path}.min`);
    diagnostics.push(...minResult.diagnostics);
    if (minResult.value !== null) {
      loweredMin = minResult.value;
      if (typeof loweredMin === 'number' && (!isInteger(loweredMin) || loweredMin < 0)) {
        diagnostics.push(...missingCapability(`${path}.min`, 'distributeTokens min', source.min, ['non-negative integer']).diagnostics);
      }
    }
  }

  if (
    loweredMax !== undefined
    && loweredMin !== undefined
    && typeof loweredMax === 'number'
    && typeof loweredMin === 'number'
    && loweredMin > loweredMax
  ) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_MISSING_CAPABILITY,
      path,
      severity: 'error',
      message: 'distributeTokens min cannot exceed max.',
      suggestion: 'Set distributeTokens.min <= distributeTokens.max.',
    });
  }

  if (tokenOptions.value === null || destinationOptions.value === null || diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    return { value: null, diagnostics };
  }

  const selectedBind = makeSyntheticBinding(path, 'selected');
  const tokenBind = makeSyntheticBinding(path, 'token');
  const destinationBind = makeSyntheticBinding(path, 'destination');

  const cardinality =
    hasN && isInteger(source.n)
      ? { n: source.n }
      : {
          max: loweredMax as NumericValueExpr,
          ...(loweredMin === undefined ? {} : { min: loweredMin }),
        };

  return {
    value: [
      {
        chooseN: {
          internalDecisionId: toInternalDecisionId(`${path}.selectTokens`),
          bind: selectedBind,
          options: tokenOptions.value,
          ...cardinality,
        },
      },
      {
        forEach: {
          bind: tokenBind,
          over: {
            query: 'binding',
            name: selectedBind,
          },
          effects: [
            {
              chooseOne: {
                internalDecisionId: toInternalDecisionId(`${path}.chooseDestination`),
                bind: destinationBind,
                options: destinationOptions.value,
              },
            },
            {
              moveToken: {
                token: tokenBind,
                from: { zoneExpr: { ref: 'tokenZone', token: tokenBind } },
                to: { zoneExpr: { ref: 'binding', name: destinationBind } },
              },
            },
          ],
        },
      },
    ],
    diagnostics,
  };
}

function validateQueryDomainContract(
  query: OptionsQuery,
  contract: QueryDomainContract,
  path: string,
): readonly Diagnostic[] {
  if (contract === 'agnostic') {
    return [];
  }

  const expected: QueryDomainKind = contract === 'tokenOnly' ? 'token' : 'zone';
  const domains = inferQueryDomainKinds(query);
  if (domains.size === 1 && domains.has(expected)) {
    return [];
  }

  const expectedLabel = expected === 'token' ? 'token' : 'zone';
  const code = contract === 'tokenOnly'
    ? CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_DISTRIBUTE_TOKENS_TOKEN_DOMAIN_INVALID
    : CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_DISTRIBUTE_TOKENS_DESTINATION_DOMAIN_INVALID;

  return [
    {
      code,
      path,
      severity: 'error',
      message: `distributeTokens ${path.endsWith('.tokens') ? 'tokens' : 'destinations'} query must resolve to ${expectedLabel}-domain options.`,
      suggestion:
        expected === 'token'
          ? 'Use token queries only (tokensInZone, tokensInAdjacentZones, tokensInMapSpaces, or compositions that stay token-only).'
          : 'Use zone queries only (zones, mapSpaces, adjacentZones, connectedZones, or compositions that stay zone-only).',
    },
  ];
}

function validateChoiceOptionsRuntimeShape(
  query: OptionsQuery,
  path: string,
  effectName: 'chooseOne' | 'chooseN',
): readonly Diagnostic[] {
  const diagnostic = buildChoiceOptionsRuntimeShapeDiagnostic({
    code: CHOICE_OPTIONS_RUNTIME_SHAPE_DIAGNOSTIC_CODES.compiler,
    path,
    effectName,
    query,
  });
  if (diagnostic === null) {
    return [];
  }
  return [diagnostic];
}

function lowerNestedEffects(
  source: readonly unknown[],
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<readonly EffectAST[]> {
  const diagnostics: Diagnostic[] = [];
  const values: EffectAST[] = [];
  let loweredEntryCount = 0;
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
  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error') && loweredEntryCount !== source.length) {
    return { value: null, diagnostics };
  }
  return { value: values, diagnostics };
}

function lowerZoneSelector(
  source: unknown,
  context: EffectLoweringContext,
  scope: BindingScope,
  path: string,
): EffectLoweringResult<ZoneRef> {
  if (typeof source === 'string') {
    const zone = canonicalizeZoneSelector(source, context.ownershipByBase, path, context.seatIds);
    if (zone.value === null) {
      return { value: null, diagnostics: zone.diagnostics };
    }

    const diagnostics = validateZoneQualifierBinding(zone.value, scope, path);
    if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
      return { value: null, diagnostics };
    }
    return { value: zone.value, diagnostics };
  }

  if (!isRecord(source)) {
    return {
      value: null,
      diagnostics: [
        {
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_ZONE_SELECTOR_INVALID,
          path,
          severity: 'error',
          message: 'Zone selector must be a string or { zoneExpr: <ValueExpr> }.',
          suggestion: 'Use "zoneBase:qualifier" for static selectors, or wrap dynamic selectors in { zoneExpr: ... }.',
        },
      ],
    };
  }

  if (!('zoneExpr' in source)) {
    return {
      value: null,
      diagnostics: [
        {
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_ZONE_SELECTOR_INVALID,
          path,
          severity: 'error',
          message: 'Dynamic zone selectors must use explicit { zoneExpr: <ValueExpr> }.',
          suggestion: 'Wrap dynamic zone selectors in { zoneExpr: ... }.',
        },
      ],
    };
  }

  const valueResult = lowerValueNode(source.zoneExpr, makeConditionContext(context, scope), `${path}.zoneExpr`);
  if (valueResult.value === null) {
    return { value: null, diagnostics: valueResult.diagnostics };
  }
  return { value: { zoneExpr: valueResult.value }, diagnostics: valueResult.diagnostics };
}

function lowerPlayerSelector(
  source: unknown,
  scope: BindingScope,
  path: string,
  seatIds?: readonly string[],
): EffectLoweringResult<PlayerSel> {
  const selector = normalizePlayerSelector(source, path, seatIds);
  if (selector.value === null) {
    return selector;
  }
  if (typeof selector.value === 'object' && 'chosen' in selector.value) {
    const diagnostics = validateBindingReference(selector.value.chosen, scope, path);
    if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
      return { value: null, diagnostics };
    }
    return {
      value: selector.value,
      diagnostics,
    };
  }
  return selector;
}

function validateZoneQualifierBinding(zoneSelector: string, scope: BindingScope, path: string): readonly Diagnostic[] {
  const splitIndex = zoneSelector.indexOf(':');
  if (splitIndex < 0) {
    return [];
  }
  const qualifier = zoneSelector.slice(splitIndex + 1);
  return validatePrefixedBindingReference(qualifier, scope, path);
}

function validateBindingReference(value: string, scope: BindingScope, path: string): readonly Diagnostic[] {
  if (scope.has(value)) {
    return [];
  }
  return [
    {
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_BINDING_UNBOUND,
      path,
      severity: 'error',
      message: `Unbound binding reference "${value}".`,
      suggestion: 'Use a binding declared by action params or an in-scope effect binder.',
      alternatives: scope.alternativesFor(value),
    },
  ];
}

function validatePrefixedBindingReference(value: string, scope: BindingScope, path: string): readonly Diagnostic[] {
  if (!value.startsWith('$')) {
    return [];
  }
  return validateBindingReference(value, scope, path);
}

function makeConditionContext(context: EffectLoweringContext, scope: BindingScope): ConditionLoweringContext {
  return {
    ownershipByBase: context.ownershipByBase,
    bindingScope: scope.visibleBindings(),
    ...(context.tokenTraitVocabulary === undefined ? {} : { tokenTraitVocabulary: context.tokenTraitVocabulary }),
    ...(context.tokenFilterProps === undefined ? {} : { tokenFilterProps: context.tokenFilterProps }),
    ...(context.namedSets === undefined ? {} : { namedSets: context.namedSets }),
    ...(context.typeInference === undefined ? {} : { typeInference: context.typeInference }),
    ...(context.seatIds === undefined ? {} : { seatIds: context.seatIds }),
  };
}

function missingCapability<TValue>(
  path: string,
  construct: string,
  actual: unknown,
  alternatives?: readonly string[],
): EffectLoweringResult<TValue> {
  return {
    value: null,
    diagnostics: [
      {
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_MISSING_CAPABILITY,
        path,
        severity: 'error',
        message: `Cannot lower ${construct} to kernel AST: ${formatValue(actual)}.`,
        suggestion: 'Rewrite this node to a supported kernel-compatible shape.',
        ...(alternatives === undefined ? {} : { alternatives: [...alternatives] }),
      },
    ],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function collectReservedCompilerBindingNamespaceDiagnostics(
  source: Record<string, unknown>,
  path: string,
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const candidate of collectDeclaredBinderCandidates(source)) {
    if (typeof candidate.value !== 'string' || !candidate.value.startsWith(RESERVED_COMPILER_BINDING_PREFIX)) {
      continue;
    }
    const bindingValue = candidate.value;
    if (TRUSTED_COMPILER_BINDING_PREFIXES.some((prefix) => bindingValue.startsWith(prefix))) {
      continue;
    }
    if (isTrustedCompilerMacroBinderCandidate(source, candidate.path)) {
      continue;
    }
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_RESERVED_BINDING_NAMESPACE_FORBIDDEN,
      path: `${path}.${candidate.path}`,
      severity: 'error',
      message: `Binding "${bindingValue}" uses compiler-owned namespace "${RESERVED_COMPILER_BINDING_PREFIX}".`,
      suggestion: 'Rename authored binders to a non-reserved identifier such as "$token" or "$choice".',
    });
  }
  return diagnostics;
}

function isTrustedCompilerMacroBinderCandidate(source: Record<string, unknown>, binderPath: string): boolean {
  const segments = binderPath.split('.');
  const kind = segments[0];
  if (kind === undefined || !isRecord(source[kind])) {
    return false;
  }
  const effectBody = source[kind];

  if (kind === 'forEach') {
    return isTrustedMacroOriginCarrier(effectBody);
  }
  if (kind === 'reduce') {
    const bindField = segments[1];
    if (bindField === 'itemBind') {
      return isTrustedMacroOriginCarrier(effectBody);
    }
    if (bindField === 'accBind') {
      return isTrustedMacroOriginCarrier(effectBody);
    }
    if (bindField === 'resultBind') {
      return isTrustedMacroOriginCarrier(effectBody);
    }
    return false;
  }
  if (kind === 'removeByPriority') {
    if (segments[1] !== 'groups') {
      return false;
    }
    const groupIndex = Number.parseInt(segments[2] ?? '', 10);
    if (!Number.isInteger(groupIndex) || !Array.isArray(effectBody.groups)) {
      return false;
    }
    const group = effectBody.groups[groupIndex];
    if (!isRecord(group)) {
      return false;
    }
    return isTrustedMacroOriginCarrier(group);
  }

  return false;
}

function makeSyntheticBinding(path: string, suffix: string): string {
  const stem = path.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return `$__${suffix}_${stem}`;
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function readMacroOrigin(
  value: unknown,
  carrier: Record<string, unknown>,
  path: string,
): EffectLoweringResult<MacroOrigin | undefined> {
  if (value === undefined) {
    return { value: undefined, diagnostics: [] };
  }
  if (!isRecord(value) || typeof value.macroId !== 'string' || typeof value.stem !== 'string') {
    return {
      value: null,
      diagnostics: [{
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_MACRO_ORIGIN_INVALID,
        path,
        severity: 'error',
        message: 'macroOrigin must be { macroId: string, stem: string } when present.',
        suggestion: 'Remove macroOrigin from authored YAML; compiler expansion manages this field.',
      }],
    };
  }
  if (!isTrustedMacroOriginCarrier(carrier)) {
    return {
      value: null,
      diagnostics: [{
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_MACRO_ORIGIN_UNTRUSTED,
        path,
        severity: 'error',
        message: 'macroOrigin is compiler-owned metadata and cannot be authored directly.',
        suggestion: 'Remove macroOrigin from authored YAML and rely on effect macro expansion.',
      }],
    };
  }
  return {
    value: {
      macroId: value.macroId,
      stem: value.stem,
    },
    diagnostics: [],
  };
}

function collectReservedCompilerMetadataDiagnostics(
  value: unknown,
  path: string,
): readonly Diagnostic[] {
  return collectReservedCompilerMetadataKeyOccurrencesOnRecord(value, path).map((occurrence) => ({
    code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_RESERVED_COMPILER_METADATA_FORBIDDEN,
    path: occurrence.path,
    severity: 'error',
    message: `${occurrence.key} is reserved compiler metadata and cannot be authored directly.`,
    suggestion: `Remove ${occurrence.key} from authored YAML.`,
  }));
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') {
    return `"${value}"`;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

type LoweredGrantSequenceEntry = {
  readonly effectIndex: number;
  readonly sequencePath: string;
  readonly operationClass: string;
  readonly actionIds?: readonly string[];
  readonly zoneFilter?: ConditionAST;
  readonly sequence: {
    readonly chain: string;
    readonly step: number;
  };
};

const collectFreeOperationSequenceViabilityWarnings = (
  effects: readonly EffectAST[],
  basePath: string,
  defaultActionIds: readonly string[] | undefined,
): readonly Diagnostic[] => {
  const grants: LoweredGrantSequenceEntry[] = effects.flatMap((effect, effectIndex) =>
    'grantFreeOperation' in effect && effect.grantFreeOperation.sequence !== undefined
      ? [{
          effectIndex,
          sequencePath: `${basePath}.${effectIndex}.grantFreeOperation.sequence`,
          operationClass: effect.grantFreeOperation.operationClass,
          ...(effect.grantFreeOperation.actionIds === undefined ? {} : { actionIds: effect.grantFreeOperation.actionIds }),
          ...(effect.grantFreeOperation.zoneFilter === undefined ? {} : { zoneFilter: effect.grantFreeOperation.zoneFilter }),
          sequence: effect.grantFreeOperation.sequence,
        }]
      : [],
  );
  if (grants.length === 0) {
    return [];
  }

  const byChain = new Map<string, LoweredGrantSequenceEntry[]>();
  for (const grant of grants) {
    const existing = byChain.get(grant.sequence.chain) ?? [];
    existing.push(grant);
    byChain.set(grant.sequence.chain, existing);
  }

  const diagnostics: Diagnostic[] = [];
  for (const [chain, chainEntries] of byChain.entries()) {
    if (chainEntries.length < 2) {
      continue;
    }
    const byStep = new Map<number, LoweredGrantSequenceEntry[]>();
    for (const entry of chainEntries) {
      const existing = byStep.get(entry.sequence.step) ?? [];
      existing.push(entry);
      byStep.set(entry.sequence.step, existing);
    }
    for (const [step, stepEntries] of byStep.entries()) {
      if (stepEntries.length < 2) {
        continue;
      }
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_FREE_OPERATION_SEQUENCE_VIABILITY_RISK,
        path: stepEntries[0]!.sequencePath,
        severity: 'warning',
        message:
          `Free-operation sequence chain "${chain}" has duplicate step ${String(step)}, which can lock later steps until one duplicate is consumed.`,
        suggestion: 'Assign unique `sequence.step` values per chain in event resolution order.',
      });
    }

    const ordered = [...chainEntries].sort((left, right) => left.sequence.step - right.sequence.step);
    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1]!;
      const current = ordered[index]!;
      const currentStepPath = current.sequencePath;

      if (previous.operationClass !== current.operationClass) {
        diagnostics.push({
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_FREE_OPERATION_SEQUENCE_VIABILITY_RISK,
          path: currentStepPath,
          severity: 'warning',
          message:
            `Free-operation sequence chain "${chain}" changes operationClass between step ${String(previous.sequence.step)} and ${String(current.sequence.step)}.`,
          suggestion: 'Confirm earlier sequence steps are reliably playable; otherwise later steps may remain blocked.',
        });
      }

      const previousEffectiveActionIds = resolveEffectiveFreeOperationActionDomain(previous.actionIds, defaultActionIds);
      const currentEffectiveActionIds = resolveEffectiveFreeOperationActionDomain(current.actionIds, defaultActionIds);
      const currentActions = new Set(currentEffectiveActionIds);
      const overlap = previousEffectiveActionIds.some((actionId) => currentActions.has(actionId));
      if (!overlap) {
        diagnostics.push({
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_FREE_OPERATION_SEQUENCE_VIABILITY_RISK,
          path: currentStepPath,
          severity: 'warning',
          message:
            `Free-operation sequence chain "${chain}" has non-overlapping actionIds between step ${String(previous.sequence.step)} and ${String(current.sequence.step)}.`,
          suggestion: 'Ensure the earlier step can be consumed in realistic states, or relax sequence constraints.',
        });
      }

      const previousFilter = previous.zoneFilter === undefined ? null : conditionFingerprint(previous.zoneFilter);
      const currentFilter = current.zoneFilter === undefined ? null : conditionFingerprint(current.zoneFilter);
      if (previousFilter !== null && currentFilter !== previousFilter) {
        diagnostics.push({
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_FREE_OPERATION_SEQUENCE_VIABILITY_RISK,
          path: currentStepPath,
          severity: 'warning',
          message:
            `Free-operation sequence chain "${chain}" uses different zoneFilter conditions between step ${String(previous.sequence.step)} and ${String(current.sequence.step)}.`,
          suggestion: 'Verify earlier step filters are not stricter than later steps in the same chain.',
        });
      }
    }
  }

  return diagnostics;
};

function conditionFingerprint(condition: ConditionAST): string | null {
  try {
    return JSON.stringify(condition);
  } catch {
    return null;
  }
}

class BindingScope {
  private readonly frames: string[][] = [];
  private readonly guardedByCondition = new Map<string, Set<string>>();

  constructor(
    initial: readonly string[],
    frames?: readonly (readonly string[])[],
    guardedByCondition?: ReadonlyMap<string, ReadonlySet<string>>,
  ) {
    if (frames !== undefined) {
      for (const frame of frames) {
        this.frames.push([...frame]);
      }
    } else {
      this.frames.push([...initial]);
    }
    if (guardedByCondition !== undefined) {
      for (const [condition, bindings] of guardedByCondition.entries()) {
        this.guardedByCondition.set(condition, new Set(bindings));
      }
    }
  }

  has(name: string): boolean {
    return this.frames.some((frame) => hasBindingIdentifier(name, frame));
  }

  /** Permanently add a binding to the top frame (for sequential effects). */
  register(name: string): void {
    const top = this.frames[this.frames.length - 1];
    if (top !== undefined) {
      top.push(name);
    }
  }

  visibleBindings(): readonly string[] {
    const deduped = new Set<string>();
    for (let index = this.frames.length - 1; index >= 0; index -= 1) {
      for (const name of this.frames[index] ?? []) {
        deduped.add(name);
      }
    }
    return [...deduped].sort((left, right) => left.localeCompare(right));
  }

  clone(): BindingScope {
    return new BindingScope([], this.frames, this.guardedByCondition);
  }

  registerGuarded(condition: string, name: string): void {
    const existing = this.guardedByCondition.get(condition);
    if (existing !== undefined) {
      existing.add(name);
      return;
    }
    this.guardedByCondition.set(condition, new Set([name]));
  }

  guardedBindingsFor(condition: string): readonly string[] {
    const bindings = this.guardedByCondition.get(condition);
    if (bindings === undefined) {
      return [];
    }
    return [...bindings].sort((left, right) => left.localeCompare(right));
  }

  withBinding<TValue>(name: string, callback: () => TValue): TValue {
    this.frames.push([name]);
    try {
      return callback();
    } finally {
      this.frames.pop();
    }
  }

  withBindings<TValue>(names: readonly string[], callback: () => TValue): TValue {
    this.frames.push([...names]);
    try {
      return callback();
    } finally {
      this.frames.pop();
    }
  }

  shadowWarning(name: string, path: string): readonly Diagnostic[] {
    if (!this.has(name)) {
      return [];
    }
    return [createBindingShadowWarning(name, path)];
  }

  alternativesFor(name: string): readonly string[] {
    return rankBindingIdentifierAlternatives(name, this.visibleBindings());
  }
}

/**
 * After a choice/random effect is lowered, register its `bind` name in the
 * scope so subsequent effects in the same array can reference it.
 */
function registerSequentialBinding(effect: EffectAST, scope: BindingScope): void {
  const bindings = collectSequentialBindings(effect);
  for (const binding of bindings) {
    scope.register(binding);
  }
}
