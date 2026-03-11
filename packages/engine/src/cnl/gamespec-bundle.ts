import type { ParseGameSpecResult } from './parser.js';

export interface GameSpecBundleSource {
  readonly path: string;
  readonly markdown: string;
}

export interface LoadedGameSpecBundle {
  readonly entryPath: string;
  readonly sources: readonly GameSpecBundleSource[];
  readonly sourceFingerprint: string;
  readonly parsed: ParseGameSpecResult;
}
