import type { Diagnostic } from '../kernel/diagnostics.js';
import type { ActionDef, CompiledActionTagIndex } from '../kernel/types.js';
import { CNL_COMPILER_DIAGNOSTIC_CODES } from './compiler-diagnostic-codes.js';

const KEBAB_CASE_PATTERN = /^[a-z][a-z0-9-]*$/;

/**
 * Builds a `CompiledActionTagIndex` from compiled action definitions.
 *
 * Returns `undefined` if no action has tags.
 * Pure function — deterministic, no side effects.
 */
export function compileActionTagIndex(
  actions: readonly ActionDef[],
  diagnostics: Diagnostic[],
): CompiledActionTagIndex | undefined {
  const byAction: Record<string, readonly string[]> = {};
  const tagToActions = new Map<string, string[]>();
  let anyTags = false;

  for (const action of actions) {
    const actionId = action.id as string;
    const rawTags = action.tags;

    if (rawTags === undefined || rawTags.length === 0) {
      continue;
    }

    anyTags = true;
    const seen = new Set<string>();
    const validTags: string[] = [];

    for (const tag of rawTags) {
      if (tag.trim() === '') {
        diagnostics.push({
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_ACTION_TAG_EMPTY,
          path: `doc.actions.${actionId}.tags`,
          severity: 'error',
          message: `Action "${actionId}" has an empty tag string.`,
          suggestion: 'Remove empty tags or provide a non-empty kebab-case tag name.',
        });
        continue;
      }

      if (!KEBAB_CASE_PATTERN.test(tag)) {
        diagnostics.push({
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_ACTION_TAG_INVALID_FORMAT,
          path: `doc.actions.${actionId}.tags`,
          severity: 'error',
          message: `Action "${actionId}" has tag "${tag}" which is not valid kebab-case.`,
          suggestion: 'Tag names must match /^[a-z][a-z0-9-]*$/ (e.g., "insurgent-operation").',
        });
        continue;
      }

      if (seen.has(tag)) {
        diagnostics.push({
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_ACTION_TAG_DUPLICATE,
          path: `doc.actions.${actionId}.tags`,
          severity: 'error',
          message: `Action "${actionId}" has duplicate tag "${tag}".`,
          suggestion: 'Remove the duplicate tag entry.',
        });
        continue;
      }

      seen.add(tag);
      validTags.push(tag);

      let actionList = tagToActions.get(tag);
      if (actionList === undefined) {
        actionList = [];
        tagToActions.set(tag, actionList);
      }
      actionList.push(actionId);
    }

    if (validTags.length > 0) {
      byAction[actionId] = [...validTags].sort();
    }
  }

  if (!anyTags) {
    return undefined;
  }

  const byTag: Record<string, readonly string[]> = {};
  for (const [tag, actionIds] of [...tagToActions.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    byTag[tag] = [...actionIds].sort();
  }

  return { byAction, byTag };
}
