import type { Diagnostic } from '../kernel/diagnostics.js';
import { createEmptyGameSpecDoc, type GameSpecDoc } from './game-spec-doc.js';
import type { GameSpecSourceMap } from './source-map.js';

export interface ParseGameSpecResult {
  readonly doc: GameSpecDoc;
  readonly sourceMap: GameSpecSourceMap;
  readonly diagnostics: readonly Diagnostic[];
}

export function parseGameSpec(_markdown: string): ParseGameSpecResult {
  return {
    doc: createEmptyGameSpecDoc(),
    sourceMap: { byPath: {} },
    diagnostics: [],
  };
}
