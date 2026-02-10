import type { Diagnostic } from '../kernel/diagnostics.js';
import { createEmptyGameSpecDoc, type GameSpecDoc } from './game-spec-doc.js';
import type { GameSpecSourceMap } from './source-map.js';
import { lintYamlHardening } from './yaml-linter.js';

export interface ParseGameSpecResult {
  readonly doc: GameSpecDoc;
  readonly sourceMap: GameSpecSourceMap;
  readonly diagnostics: readonly Diagnostic[];
}

export function parseGameSpec(markdown: string): ParseGameSpecResult {
  const diagnostics: Diagnostic[] = [];
  const yamlBlocks = extractYamlBlocks(markdown);

  for (const [index, block] of yamlBlocks.entries()) {
    diagnostics.push(
      ...lintYamlHardening(block, {
        pathPrefix: `yaml.block.${index}`,
      }),
    );
  }

  return {
    doc: createEmptyGameSpecDoc(),
    sourceMap: { byPath: {} },
    diagnostics,
  };
}

function extractYamlBlocks(markdown: string): readonly string[] {
  const blocks: string[] = [];
  const fencePattern = /```([A-Za-z0-9_-]*)\n([\s\S]*?)```/g;

  let match: RegExpExecArray | null;
  while ((match = fencePattern.exec(markdown)) !== null) {
    const fenceLabel = (match[1] ?? '').trim().toLowerCase();
    if (fenceLabel !== '' && fenceLabel !== 'yaml' && fenceLabel !== 'yml') {
      continue;
    }

    blocks.push(match[2] ?? '');
  }

  return blocks;
}
