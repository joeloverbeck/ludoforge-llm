import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

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
