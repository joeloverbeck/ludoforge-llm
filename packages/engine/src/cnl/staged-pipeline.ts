import type { Diagnostic } from '../kernel/diagnostics.js';
import { compileGameSpecToGameDef, type CompileOptions, type CompileResult } from './compiler.js';
import { loadGameSpecEntrypoint } from './load-gamespec-source.js';
import { parseGameSpec, type ParseGameSpecOptions, type ParseGameSpecResult } from './parser.js';
import { validateGameSpec, type ValidateGameSpecOptions } from './validate-spec.js';

export interface RunGameSpecStagesOptions {
  readonly parseOptions?: ParseGameSpecOptions;
  readonly validateOptions?: ValidateGameSpecOptions;
  readonly compileOptions?: CompileOptions;
}

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
  readonly sourcePaths?: readonly string[];
  readonly sourceOrder?: readonly string[];
}

export function runGameSpecStages(
  markdown: string,
  options: RunGameSpecStagesOptions = {},
): RunGameSpecStagesResult {
  const parsed = parseGameSpec(markdown, options.parseOptions);
  return runParsedGameSpecStages(parsed, options);
}

export function runGameSpecStagesFromEntrypoint(
  entryPath: string,
  options: RunGameSpecStagesOptions = {},
): RunGameSpecStagesResult {
  const entryParseOptions = options.parseOptions === undefined ? undefined : omitParseSourceId(options.parseOptions);
  const loaded = loadGameSpecEntrypoint(entryPath, {
    ...(entryParseOptions === undefined ? {} : { parseOptions: entryParseOptions }),
  });
  const staged = runParsedGameSpecStages(loaded.parsed, options);

  return {
    ...staged,
    sourcePaths: loaded.sourcePaths,
    sourceOrder: loaded.sourceOrder,
  };
}

function runParsedGameSpecStages(
  parsed: ParseGameSpecResult,
  options: RunGameSpecStagesOptions,
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

function omitParseSourceId(parseOptions: ParseGameSpecOptions): Omit<ParseGameSpecOptions, 'sourceId'> {
  const entryParseOptions: Omit<ParseGameSpecOptions, 'sourceId'> = { ...parseOptions };
  delete (entryParseOptions as Partial<ParseGameSpecOptions>).sourceId;
  return entryParseOptions;
}
