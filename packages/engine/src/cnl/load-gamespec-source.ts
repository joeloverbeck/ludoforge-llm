import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';

import { composeGameSpec } from './compose-gamespec.js';
import type { LoadedGameSpecBundle } from './gamespec-bundle.js';
import type { ParseGameSpecOptions } from './parser.js';

export interface LoadedGameSpecSource {
  readonly markdown: string;
  readonly sourcePaths: readonly string[];
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

export function loadGameSpecBundleFromEntrypoint(
  entryPath: string,
  options: {
    readonly parseOptions?: Omit<ParseGameSpecOptions, 'sourceId'>;
  } = {},
): LoadedGameSpecBundle {
  const resolvedEntryPath = resolve(entryPath);
  const entryStats = statSync(resolvedEntryPath);
  if (!entryStats.isFile()) {
    throw new Error(`GameSpec entrypoint must be a markdown file: ${entryPath}`);
  }
  const sourceMarkdownByPath = new Map<string, string>();

  const composeOptions = {
    loadSource: (sourceId: string) => loadEntrypointSource(sourceId, sourceMarkdownByPath),
    resolveImport: (importPath: string, importerSourceId: string) => resolve(dirname(importerSourceId), importPath),
    ...(options.parseOptions === undefined ? {} : { parseOptions: options.parseOptions }),
  };

  const result = composeGameSpec(resolvedEntryPath, {
    ...composeOptions,
  });

  const sources = result.sourceOrder.map((sourcePath) => {
    const markdown = sourceMarkdownByPath.get(sourcePath);
    if (markdown === undefined) {
      throw new Error(`Missing loaded source content for "${sourcePath}".`);
    }
    return { path: sourcePath, markdown };
  });

  return {
    entryPath: resolvedEntryPath,
    sources,
    sourceFingerprint: fingerprintGameSpecBundleSources(sources),
    parsed: {
      doc: result.doc,
      sourceMap: result.sourceMap,
      diagnostics: result.diagnostics,
    },
  };
}

function loadEntrypointSource(sourceId: string, sourceMarkdownByPath: Map<string, string>): string | null {
  const resolvedSourceId = resolve(sourceId);
  try {
    const stats = statSync(resolvedSourceId);
    if (!stats.isFile()) {
      return null;
    }
  } catch {
    return null;
  }
  const markdown = readFileSync(resolvedSourceId, 'utf8');
  sourceMarkdownByPath.set(resolvedSourceId, markdown);
  return markdown;
}

function fingerprintGameSpecBundleSources(sources: readonly LoadedGameSpecBundle['sources'][number][]): string {
  return sources
    .reduce(
      (hash, source) => hash.update(source.path).update('\0').update(source.markdown).update('\0'),
      createHash('sha256'),
    )
    .digest('hex');
}
