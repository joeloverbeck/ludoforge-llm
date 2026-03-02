import type { Diagnostic } from '../kernel/diagnostics.js';
import type { GameSpecDoc } from './game-spec-doc.js';
import { expandPieceGeneration } from './expand-piece-generation.js';
import { expandBatchMarkers } from './expand-batch-markers.js';
import { expandBatchVars } from './expand-batch-vars.js';
import { expandZoneTemplates } from './expand-zone-templates.js';
import { expandPhaseTemplates } from './expand-phase-templates.js';

/**
 * Orchestrates all five template-expansion passes in a fixed deterministic
 * order, collecting diagnostics from every pass into a single flat array.
 *
 * Must run **before** condition-macro expansion so that condition macros
 * can reference entities produced by template expansion.
 *
 * Pass ordering:
 *   A1  expandPieceGeneration   — combinatorial piece generation
 *   A2  expandBatchMarkers      — batch marker definitions
 *   A3  expandBatchVars         — batch variable definitions
 *   A4  expandZoneTemplates     — per-player zone templates
 *   A5  expandPhaseTemplates    — phase template definitions
 */
export function expandTemplates(doc: GameSpecDoc): {
  readonly doc: GameSpecDoc;
  readonly diagnostics: readonly Diagnostic[];
} {
  const diagnostics: Diagnostic[] = [];

  const a1 = expandPieceGeneration(doc);
  diagnostics.push(...a1.diagnostics);

  const a2 = expandBatchMarkers(a1.doc);
  diagnostics.push(...a2.diagnostics);

  const a3 = expandBatchVars(a2.doc);
  diagnostics.push(...a3.diagnostics);

  const a4 = expandZoneTemplates(a3.doc);
  diagnostics.push(...a4.diagnostics);

  const a5 = expandPhaseTemplates(a4.doc);
  diagnostics.push(...a5.diagnostics);

  return { doc: a5.doc, diagnostics };
}
