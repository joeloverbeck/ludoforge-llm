export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export interface DiagnosticSourceSpan {
  readonly sourceId?: string;
  readonly blockIndex: number;
  readonly markdownLineStart: number;
  readonly markdownColStart: number;
  readonly markdownLineEnd: number;
  readonly markdownColEnd: number;
}

export interface DiagnosticSourcePointer {
  readonly path: string;
  readonly span?: DiagnosticSourceSpan;
}

export interface DiagnosticMacroOrigin {
  readonly invocation?: DiagnosticSourcePointer;
  readonly declaration?: DiagnosticSourcePointer;
  readonly expanded?: DiagnosticSourcePointer;
}

export interface Diagnostic {
  readonly code: string;
  readonly path: string;
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  readonly suggestion?: string;
  readonly contextSnippet?: string;
  readonly alternatives?: readonly string[];
  readonly assetPath?: string;
  readonly entityId?: string;
  readonly macroOrigin?: DiagnosticMacroOrigin;
}

export enum DegeneracyFlag {
  LOOP_DETECTED = 'LOOP_DETECTED',
  NO_LEGAL_MOVES = 'NO_LEGAL_MOVES',
  DOMINANT_ACTION = 'DOMINANT_ACTION',
  TRIVIAL_WIN = 'TRIVIAL_WIN',
  STALL = 'STALL',
  TRIGGER_DEPTH_EXCEEDED = 'TRIGGER_DEPTH_EXCEEDED',
}
