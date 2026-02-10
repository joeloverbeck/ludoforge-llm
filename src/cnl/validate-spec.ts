import type { Diagnostic } from '../kernel/diagnostics.js';
import type { GameSpecDoc } from './game-spec-doc.js';
import type { GameSpecSourceMap } from './source-map.js';

export interface ValidateGameSpecOptions {
  readonly sourceMap?: GameSpecSourceMap;
}

export function validateGameSpec(
  _doc: GameSpecDoc,
  _options?: ValidateGameSpecOptions,
): readonly Diagnostic[] {
  return [];
}
