import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { parseDocument } from 'yaml';

import { composeGameSpec } from './compose-gamespec.js';
import type { LoadedGameSpecBundle } from './gamespec-bundle.js';
import { extractYamlBlocks, type ParseGameSpecOptions } from './parser.js';

export interface LoadedGameSpecSource {
  readonly markdown: string;
  readonly sourcePaths: readonly string[];
}

export interface LoadedGameSpecBundleSources {
  readonly entryPath: string;
  readonly sources: LoadedGameSpecBundle['sources'];
  readonly sourceFingerprint: string;
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

export function loadGameSpecBundleSourcesFromEntrypoint(entryPath: string): LoadedGameSpecBundleSources {
  const resolvedEntryPath = resolve(entryPath);
  const entryStats = statSync(resolvedEntryPath);
  if (!entryStats.isFile()) {
    throw new Error(`GameSpec entrypoint must be a markdown file: ${entryPath}`);
  }

  const sourceMarkdownByPath = new Map<string, string>();
  const sourceOrder: string[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  const visit = (sourcePath: string): void => {
    const resolvedSourcePath = resolve(sourcePath);
    if (visited.has(resolvedSourcePath)) {
      return;
    }
    if (visiting.has(resolvedSourcePath)) {
      throw new Error(`Import cycle detected while loading GameSpec sources: ${resolvedSourcePath}`);
    }

    visiting.add(resolvedSourcePath);
    const markdown = loadEntrypointSource(resolvedSourcePath, sourceMarkdownByPath);
    if (markdown === null) {
      throw new Error(`Unable to load imported source "${resolvedSourcePath}".`);
    }

    for (const importPath of extractImportPaths(markdown)) {
      visit(resolve(dirname(resolvedSourcePath), importPath));
    }

    visiting.delete(resolvedSourcePath);
    visited.add(resolvedSourcePath);
    sourceOrder.push(resolvedSourcePath);
  };

  visit(resolvedEntryPath);

  const sources = sourceOrder.map((sourcePath) => {
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

function extractImportPaths(markdown: string): readonly string[] {
  const importPaths: string[] = [];
  for (const block of extractYamlBlocks(markdown)) {
    const yamlDoc = parseDocument(block.text, {
      schema: 'core',
      strict: true,
      uniqueKeys: true,
    });
    if (yamlDoc.errors.length > 0) {
      continue;
    }

    const parsedRoot = yamlDoc.toJSON() as { readonly imports?: unknown };
    const imports = parsedRoot.imports;
    if (!Array.isArray(imports)) {
      continue;
    }

    for (const entry of imports) {
      if (typeof entry === 'string') {
        importPaths.push(entry);
        continue;
      }
      if (entry !== null && typeof entry === 'object' && typeof (entry as { readonly path?: unknown }).path === 'string') {
        importPaths.push((entry as { readonly path: string }).path);
      }
    }
  }
  return importPaths;
}

function fingerprintGameSpecBundleSources(sources: readonly LoadedGameSpecBundle['sources'][number][]): string {
  return sources
    .reduce(
      (hash, source) => hash.update(source.path).update('\0').update(source.markdown).update('\0'),
      createHash('sha256'),
    )
    .digest('hex');
}
