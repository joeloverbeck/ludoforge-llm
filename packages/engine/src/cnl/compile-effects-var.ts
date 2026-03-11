import type { EffectAST, NumericValueExpr, PlayerSel, ZoneRef } from '../kernel/types.js';
import {
  lowerNumericValueNode,
  lowerValueNode,
} from './compile-conditions.js';
import type { EffectLoweringContext, EffectLoweringResult } from './compile-effects-types.js';
import type { BindingScope } from './compile-effects-binding-scope.js';
import {
  isRecord,
  lowerPlayerSelector,
  lowerZoneSelector,
  makeConditionContext,
  missingCapability,
} from './compile-effects-utils.js';

export function lowerSetVarEffect(
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

export function lowerAddVarEffect(
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

export function lowerSetActivePlayerEffect(
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

export function lowerTransferVarEffect(
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

  const fromEndpoint: import('../kernel/types.js').TransferVarEndpoint =
    source.from.scope === 'global'
      ? { scope: 'global', var: source.from.var }
      : source.from.scope === 'pvar'
        ? { scope: 'pvar', player: fromPlayer!, var: source.from.var }
        : { scope: 'zoneVar', zone: fromZone!, var: source.from.var };

  const toEndpoint: import('../kernel/types.js').TransferVarEndpoint =
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
