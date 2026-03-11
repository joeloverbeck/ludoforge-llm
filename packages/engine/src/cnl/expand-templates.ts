import { pieceGenerationPass } from './expand-piece-generation.js';
import { batchMarkersPass } from './expand-batch-markers.js';
import { batchVarsPass } from './expand-batch-vars.js';
import { zoneTemplatesPass } from './expand-zone-templates.js';
import { phaseTemplatesPass } from './expand-phase-templates.js';
import type { ExpansionPass, ExpansionPassResult } from './expansion-pass.js';
import { runExpansionPipeline } from './expansion-pass.js';
import type { GameSpecDoc } from './game-spec-doc.js';

/**
 * Default expansion passes in canonical A1-A5 order.
 * All passes are currently independent (disjoint GameSpecDoc fields),
 * but topological sort guarantees correct ordering if dependencies are
 * added in the future.
 */
export const DEFAULT_EXPANSION_PASSES: readonly ExpansionPass[] = [
  pieceGenerationPass,
  batchMarkersPass,
  batchVarsPass,
  zoneTemplatesPass,
  phaseTemplatesPass,
];

/**
 * Orchestrates all template-expansion passes via the expansion pipeline,
 * collecting diagnostics from every pass into a single flat array.
 *
 * Must run **before** condition-macro expansion so that condition macros
 * can reference entities produced by template expansion.
 */
export function expandTemplates(doc: GameSpecDoc): ExpansionPassResult {
  return runExpansionPipeline(DEFAULT_EXPANSION_PASSES, doc);
}
