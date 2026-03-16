/* eslint-disable no-console */
/**
 * CI diagnostics reporter — writes JSONL to MCTS_DIAGNOSTICS_DIR if set,
 * and logs human-readable progress to console for key events.
 *
 * Test-only — not imported by production source.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import type { MctsSearchEvent, MctsSearchVisitor } from '../../src/agents/index.js';

export interface CiDiagnosticsReporterOptions {
  /** Scenario label for JSONL records. */
  readonly scenario: string;
  /** Override for MCTS_DIAGNOSTICS_DIR (defaults to env var). */
  readonly outputDir?: string;
}

/**
 * Create a CiDiagnosticsReporter that implements MctsSearchVisitor.
 *
 * When `MCTS_DIAGNOSTICS_DIR` (or `outputDir` option) is set, appends one
 * JSONL line per event to `<dir>/<scenario>.jsonl`.
 * Always logs human-readable summaries for key events to console.
 */
export function createCiDiagnosticsReporter(
  options: CiDiagnosticsReporterOptions,
): MctsSearchVisitor {
  const dir = options.outputDir ?? process.env.MCTS_DIAGNOSTICS_DIR;
  const scenario = options.scenario;

  let filePath: string | undefined;
  if (dir !== undefined && dir !== '') {
    fs.mkdirSync(dir, { recursive: true });
    // Sanitize scenario name for filesystem
    const safeName = scenario.replace(/[^a-zA-Z0-9_-]/g, '_');
    filePath = path.join(dir, `${safeName}.jsonl`);
  }

  const writeJsonl = (event: MctsSearchEvent): void => {
    if (filePath === undefined) return;
    const line = JSON.stringify({ timestamp: Date.now(), scenario, event });
    fs.appendFileSync(filePath, line + '\n', 'utf8');
  };

  const logConsole = (event: MctsSearchEvent): void => {
    switch (event.type) {
      case 'searchStart':
        console.log(
          `[MCTS] ${scenario} — search start: ${event.totalIterations} iterations, ` +
          `${event.legalMoveCount} moves (${event.concreteCount} concrete, ${event.templateCount} templates), ` +
          `pool=${event.poolCapacity}`,
        );
        break;
      case 'iterationBatch':
        console.log(
          `[MCTS] ${scenario} — iterations ${event.fromIteration}-${event.toIteration}, ` +
          `${event.rootChildCount} children, ${event.elapsedMs}ms, ` +
          `top: ${event.topChildren.map((c) => `${c.actionId}(${c.visits})`).join(', ')}`,
        );
        break;
      case 'searchComplete':
        console.log(
          `[MCTS] ${scenario} — complete: ${event.iterations} iterations in ${event.elapsedMs}ms, ` +
          `stop=${event.stopReason}, best=${event.bestActionId}(${event.bestVisits} visits)`,
        );
        break;
      case 'poolExhausted':
        console.log(
          `[MCTS] ${scenario} — pool exhausted at iteration ${event.iteration} (capacity=${event.capacity})`,
        );
        break;
      case 'templateDropped':
        console.log(
          `[MCTS] ${scenario} — template dropped: ${event.actionId} (${event.reason})`,
        );
        break;
      default:
        // Other events only go to JSONL, not console
        break;
    }
  };

  return {
    onEvent(event: MctsSearchEvent): void {
      writeJsonl(event);
      logConsole(event);
    },
  };
}
