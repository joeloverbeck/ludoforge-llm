import type { Diagnostic } from '../kernel/diagnostics.js';
import { compileGameSpecToGameDef, type CompileOptions, type CompileResult } from './compiler.js';
import type { LoadedGameSpecBundle } from './gamespec-bundle.js';
import { parseGameSpec, type ParseGameSpecOptions, type ParseGameSpecResult } from './parser.js';
import { validateGameSpec, type ValidateGameSpecOptions } from './validate-spec.js';

export interface RunGameSpecStagesOptions {
  readonly parseOptions?: ParseGameSpecOptions;
  readonly validateOptions?: ValidateGameSpecOptions;
  readonly compileOptions?: CompileOptions;
}

export type RunGameSpecBundleStagesOptions = Omit<RunGameSpecStagesOptions, 'parseOptions'>;

export interface ValidationStageResult {
  readonly blocked: boolean;
  readonly diagnostics: readonly Diagnostic[];
}

export interface CompilationStageResult {
  readonly blocked: boolean;
  readonly result: CompileResult | null;
}

export interface RunGameSpecStagesResult {
  readonly parsed: ParseGameSpecResult;
  readonly validation: ValidationStageResult;
  readonly compilation: CompilationStageResult;
  readonly entryPath?: string;
  readonly sourceFingerprint?: string;
  readonly sourcePaths?: readonly string[];
}

export function runGameSpecStages(
  markdown: string,
  options: RunGameSpecStagesOptions = {},
): RunGameSpecStagesResult {
  const parsed = parseGameSpec(markdown, options.parseOptions);
  return runParsedGameSpecStages(parsed, options);
}

export function runGameSpecStagesFromBundle(
  bundle: LoadedGameSpecBundle,
  options: RunGameSpecBundleStagesOptions = {},
): RunGameSpecStagesResult {
  const staged = runParsedGameSpecStages(bundle.parsed, options);

  return {
    ...staged,
    entryPath: bundle.entryPath,
    sourceFingerprint: bundle.sourceFingerprint,
    sourcePaths: bundle.sources.map((source) => source.path),
  };
}

function runParsedGameSpecStages(
  parsed: ParseGameSpecResult,
  options: RunGameSpecBundleStagesOptions,
): RunGameSpecStagesResult {
  if (hasErrorDiagnostics(parsed.diagnostics)) {
    return {
      parsed,
      validation: {
        blocked: true,
        diagnostics: [],
      },
      compilation: {
        blocked: true,
        result: null,
      },
    };
  }

  const validationDiagnostics = validateGameSpec(parsed.doc, {
    ...options.validateOptions,
    sourceMap: options.validateOptions?.sourceMap ?? parsed.sourceMap,
  });
  const compileResult = compileGameSpecToGameDef(parsed.doc, {
    ...options.compileOptions,
    sourceMap: options.compileOptions?.sourceMap ?? parsed.sourceMap,
  });

  return {
    parsed,
    validation: {
      blocked: false,
      diagnostics: validationDiagnostics,
    },
    compilation: {
      blocked: false,
      result: compileResult,
    },
  };
}

function hasErrorDiagnostics(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === 'error');
}
