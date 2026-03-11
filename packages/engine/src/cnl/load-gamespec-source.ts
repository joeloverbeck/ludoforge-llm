import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';

import type { ParseGameSpecOptions, ParseGameSpecResult } from './parser.js';
import { composeGameSpec } from './compose-gamespec.js';

export interface LoadedGameSpecSource {
  readonly markdown: string;
  readonly sourcePaths: readonly string[];
}

export interface LoadedGameSpecEntrypointSource {
  readonly entryPath: string;
  readonly parsed: ParseGameSpecResult;
  readonly sourcePaths: readonly string[];
  readonly sourceOrder: readonly string[];
}

const MARKDOWN_EXTENSION = '.md';

/**
 * Load a GameSpec source from either:
 * - a single markdown file, or
 * - a directory containing markdown parts (sorted lexicographically).
 */
export function loadGameSpecSource(entryPath: string): LoadedGameSpecSource {
  const entryStats = statSync(entryPath);

  if (entryStats.isFile()) {
    return { markdown: readFileSync(entryPath, 'utf8'), sourcePaths: [entryPath] };
  }

  if (!entryStats.isDirectory()) {
    throw new Error(`GameSpec source must be a file or directory: ${entryPath}`);
  }

  const markdownFiles = readdirSync(entryPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === MARKDOWN_EXTENSION)
    .map((entry) => join(entryPath, entry.name))
    .sort((a, b) => a.localeCompare(b));

  if (markdownFiles.length === 0) {
    throw new Error(`No markdown source files found in GameSpec directory: ${entryPath}`);
  }

  const markdown = markdownFiles.map((filePath) => readFileSync(filePath, 'utf8')).join('\n\n');
  return { markdown, sourcePaths: markdownFiles };
}

export function loadGameSpecEntrypoint(
  entryPath: string,
  options: {
    readonly parseOptions?: Omit<ParseGameSpecOptions, 'sourceId'>;
  } = {},
): LoadedGameSpecEntrypointSource {
  const resolvedEntryPath = resolve(entryPath);
  const entryStats = statSync(resolvedEntryPath);
  if (!entryStats.isFile()) {
    throw new Error(`GameSpec entrypoint must be a markdown file: ${entryPath}`);
  }

  const composeOptions = {
    loadSource: (sourceId: string) => loadEntrypointSource(sourceId),
    resolveImport: (importPath: string, importerSourceId: string) => resolve(dirname(importerSourceId), importPath),
    ...(options.parseOptions === undefined ? {} : { parseOptions: options.parseOptions }),
  };

  const result = composeGameSpec(resolvedEntryPath, {
    ...composeOptions,
  });

  return {
    entryPath: resolvedEntryPath,
    parsed: {
      doc: result.doc,
      sourceMap: result.sourceMap,
      diagnostics: result.diagnostics,
    },
    sourcePaths: result.sourceOrder,
    sourceOrder: result.sourceOrder,
  };
}

function loadEntrypointSource(sourceId: string): string | null {
  const resolvedSourceId = resolve(sourceId);
  try {
    const stats = statSync(resolvedSourceId);
    if (!stats.isFile()) {
      return null;
    }
  } catch {
    return null;
  }
  return readFileSync(resolvedSourceId, 'utf8');
}
