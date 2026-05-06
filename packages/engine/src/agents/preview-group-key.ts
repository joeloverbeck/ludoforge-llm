import type { Move, MoveParamValue } from '../kernel/types.js';

export interface PreviewGroupCandidate {
  readonly actionId: string;
  readonly move: Move;
}

export function compareCodepoint(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function previewGroupKey(candidate: PreviewGroupCandidate): string {
  return [
    candidate.actionId,
    parameterShapeSignature(candidate.move.params),
    sideTag(candidate.move.params),
  ].filter((part) => part.length > 0).join('|');
}

function parameterShapeSignature(params: Readonly<Record<string, MoveParamValue>>): string {
  return Object.keys(params)
    .sort(compareCodepoint)
    .map((key) => `${key}:${valueShape(params[key] as MoveParamValue)}`)
    .join(',');
}

function valueShape(value: MoveParamValue): string {
  if (Array.isArray(value)) {
    return `array:${value.length}`;
  }
  if (value !== null && typeof value === 'object') {
    return `object:${Object.keys(value).sort(compareCodepoint).length}`;
  }
  return typeof value;
}

function sideTag(params: Readonly<Record<string, MoveParamValue>>): string {
  const value = params.sideTag ?? params.side ?? params.cardSide;
  return typeof value === 'string' ? `side:${value}` : '';
}
