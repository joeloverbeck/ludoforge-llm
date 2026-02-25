import type { PlayerId, ZoneId } from './branded.js';
import type { TriggerEvent, EffectTraceResourceEndpoint, EffectTraceVarChange, VariableValue } from './types.js';

export type RuntimeScopedVarEndpoint =
  | Readonly<{
      scope: 'global';
      var: string;
    }>
  | Readonly<{
      scope: 'pvar';
      player: PlayerId;
      var: string;
    }>
  | Readonly<{
      scope: 'zone';
      zone: ZoneId;
      var: string;
    }>;

export type RuntimeScopedVarChangePayload =
  | Omit<Extract<EffectTraceVarChange, { readonly scope: 'global' }>, 'kind' | 'provenance'>
  | Omit<Extract<EffectTraceVarChange, { readonly scope: 'perPlayer' }>, 'kind' | 'provenance'>
  | Omit<Extract<EffectTraceVarChange, { readonly scope: 'zone' }>, 'kind' | 'provenance'>;

type RequiredVarChangedEvent = Extract<TriggerEvent, { readonly type: 'varChanged' }> & {
  readonly scope: 'global' | 'perPlayer' | 'zone';
  readonly var: string;
  readonly oldValue: VariableValue;
  readonly newValue: VariableValue;
};

export const toTraceResourceEndpoint = (endpoint: RuntimeScopedVarEndpoint): EffectTraceResourceEndpoint => {
  if (endpoint.scope === 'global') {
    return {
      scope: 'global',
      varName: endpoint.var,
    };
  }

  if (endpoint.scope === 'pvar') {
    return {
      scope: 'perPlayer',
      player: endpoint.player,
      varName: endpoint.var,
    };
  }

  return {
    scope: 'zone',
    zone: endpoint.zone,
    varName: endpoint.var,
  };
};

export const toTraceVarChangePayload = (
  endpoint: RuntimeScopedVarEndpoint,
  oldValue: VariableValue,
  newValue: VariableValue,
): RuntimeScopedVarChangePayload => {
  if (endpoint.scope === 'global') {
    return {
      scope: 'global',
      varName: endpoint.var,
      oldValue,
      newValue,
    };
  }

  if (endpoint.scope === 'pvar') {
    return {
      scope: 'perPlayer',
      player: endpoint.player,
      varName: endpoint.var,
      oldValue,
      newValue,
    };
  }

  return {
    scope: 'zone',
    zone: endpoint.zone,
    varName: endpoint.var,
    oldValue,
    newValue,
  };
};

export const toVarChangedEvent = (
  endpoint: RuntimeScopedVarEndpoint,
  oldValue: VariableValue,
  newValue: VariableValue,
): RequiredVarChangedEvent => {
  if (endpoint.scope === 'global') {
    return {
      type: 'varChanged',
      scope: 'global',
      var: endpoint.var,
      oldValue,
      newValue,
    };
  }

  if (endpoint.scope === 'pvar') {
    return {
      type: 'varChanged',
      scope: 'perPlayer',
      player: endpoint.player,
      var: endpoint.var,
      oldValue,
      newValue,
    };
  }

  return {
    type: 'varChanged',
    scope: 'zone',
    zone: endpoint.zone,
    var: endpoint.var,
    oldValue,
    newValue,
  };
};
