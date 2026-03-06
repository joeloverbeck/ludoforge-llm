import type { MoveParamScalar, MoveParamValue } from '@ludoforge/engine/runtime';

import { formatIdAsDisplayName } from '../utils/format-display-name.js';

function serializeScalarIdentity(value: MoveParamScalar): string {
  if (typeof value === 'string') {
    return `s:${value.length}:${value}`;
  }
  if (typeof value === 'number') {
    if (Object.is(value, -0)) {
      return 'n:-0';
    }
    if (Number.isNaN(value)) {
      return 'n:NaN';
    }
    return `n:${value}`;
  }
  return value ? 'b:1' : 'b:0';
}

function formatChoiceScalar(value: MoveParamScalar): string {
  if (typeof value === 'string') {
    return formatIdAsDisplayName(value);
  }
  if (typeof value === 'number') {
    return Object.is(value, -0) ? '-0' : `${value}`;
  }
  return value ? 'True' : 'False';
}

function isChoiceVector(value: MoveParamValue): value is readonly MoveParamScalar[] {
  return Array.isArray(value);
}

export function serializeChoiceValueIdentity(value: MoveParamValue): string {
  if (isChoiceVector(value)) {
    return `a:[${value.map((entry) => serializeScalarIdentity(entry)).join('|')}]`;
  }
  return serializeScalarIdentity(value);
}

export function formatChoiceValueFallback(value: MoveParamValue): string {
  if (isChoiceVector(value)) {
    const formattedEntries = value.map((entry) => formatChoiceScalar(entry)).join(', ');
    return `[${formattedEntries}]`;
  }
  return formatChoiceScalar(value);
}

function resolveScalarDisplayName(
  value: MoveParamScalar,
  displayNameById: ReadonlyMap<string, { readonly displayName: string }>,
): string {
  if (typeof value === 'string') {
    return displayNameById.get(value)?.displayName ?? formatIdAsDisplayName(value);
  }
  return formatChoiceScalar(value);
}

export function formatChoiceValueResolved(
  value: MoveParamValue,
  displayNameById: ReadonlyMap<string, { readonly displayName: string }>,
): string {
  if (isChoiceVector(value)) {
    return value.map((entry) => resolveScalarDisplayName(entry, displayNameById)).join(', ');
  }
  return resolveScalarDisplayName(value, displayNameById);
}
