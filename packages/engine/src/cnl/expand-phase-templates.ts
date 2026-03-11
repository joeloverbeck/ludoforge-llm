import type { Diagnostic } from '../kernel/diagnostics.js';
import { CNL_COMPILER_DIAGNOSTIC_CODES } from './compiler-diagnostic-codes.js';
import type { ExpansionPass } from './expansion-pass.js';
import type {
  GameSpecDoc,
  GameSpecPhaseDef,
  GameSpecPhaseFromTemplate,
  GameSpecPhaseTemplateDef,
} from './game-spec-doc.js';

// ---------------------------------------------------------------------------
// Type guard
// ---------------------------------------------------------------------------

function isFromTemplateEntry(
  entry: GameSpecPhaseDef | GameSpecPhaseFromTemplate,
): entry is GameSpecPhaseFromTemplate {
  return 'fromTemplate' in entry;
}

// ---------------------------------------------------------------------------
// Deep substitution helper
//
// This performs deep object/array recursion and preserves raw arg types.
// For the ID-only variant (string result, normalized), see
// `resolvePhaseIdFromTemplate` in `validate-spec-shared.ts`.
// ---------------------------------------------------------------------------

function substituteParams(
  value: unknown,
  args: Readonly<Record<string, unknown>>,
): unknown {
  if (typeof value === 'string') {
    // Entire-string match: "{paramName}" → raw arg value (enables type coercion)
    for (const [paramName, argValue] of Object.entries(args)) {
      if (value === `{${paramName}}`) {
        return argValue;
      }
    }
    // Embedded placeholders in longer strings
    let result = value;
    for (const [paramName, argValue] of Object.entries(args)) {
      result = result.replaceAll(`{${paramName}}`, String(argValue));
    }
    return result;
  }

  if (Array.isArray(value)) {
    return value.map((item) => substituteParams(item, args));
  }

  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      out[key] = substituteParams(val, args);
    }
    return out;
  }

  // Primitives (number, boolean, null).
  // Callers must never pass undefined args — guarded by expandPhaseArray.
  if (value === undefined) {
    throw new Error(
      'substituteParams: value is undefined; caller must validate args before substitution',
    );
  }
  return value;
}

// ---------------------------------------------------------------------------
// Provenance tuple — compiler-internal, never surfaces in GameDef
// ---------------------------------------------------------------------------

interface ExpandedPhaseEntry {
  readonly phase: GameSpecPhaseDef;
  readonly fromTemplate?: string;
  readonly inputIndex: number;
}

// ---------------------------------------------------------------------------
// Shared expansion helper
// ---------------------------------------------------------------------------

function expandPhaseArray(
  entries: readonly (GameSpecPhaseDef | GameSpecPhaseFromTemplate)[],
  templateMap: ReadonlyMap<string, GameSpecPhaseTemplateDef>,
  pathPrefix: string,
  diagnostics: Diagnostic[],
): readonly ExpandedPhaseEntry[] {
  const expanded: ExpandedPhaseEntry[] = [];

  for (const [entryIdx, entry] of entries.entries()) {
    if (!isFromTemplateEntry(entry)) {
      expanded.push({ phase: entry, inputIndex: entryIdx });
      continue;
    }

    const path = `${pathPrefix}[${entryIdx}]`;
    const template = templateMap.get(entry.fromTemplate);

    if (template === undefined) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_PHASE_TEMPLATE_MISSING,
        path,
        severity: 'error',
        message: `Phase template "${entry.fromTemplate}" not found.`,
      });
      continue;
    }

    // Validate: all declared params are provided
    const declaredNames = new Set(template.params.map((p) => p.name));
    const providedNames = new Set(Object.keys(entry.args));

    let hasMissing = false;
    for (const name of declaredNames) {
      if (!providedNames.has(name)) {
        hasMissing = true;
        diagnostics.push({
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_PHASE_TEMPLATE_PARAM_MISSING,
          path: `${path}.args`,
          severity: 'error',
          message: `Missing required param "${name}" for template "${entry.fromTemplate}".`,
        });
      }
    }

    let hasExtra = false;
    for (const name of providedNames) {
      if (!declaredNames.has(name)) {
        hasExtra = true;
        diagnostics.push({
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_PHASE_TEMPLATE_PARAM_EXTRA,
          path: `${path}.args.${name}`,
          severity: 'error',
          message: `Extra param "${name}" not declared in template "${entry.fromTemplate}".`,
        });
      }
    }

    // Note: this loop catches explicitly-supplied args whose value is undefined
    // (e.g. { args: { roundId: undefined } }).  Absent keys — where a declared
    // param has no entry in args at all — are caught by the PARAM_MISSING loop
    // above.  YAML-parsed input cannot produce undefined values (null/~ → JS
    // null), so this guard defends against programmatic callers.
    let hasUndefined = false;
    for (const [name, value] of Object.entries(entry.args)) {
      if (value === undefined) {
        hasUndefined = true;
        diagnostics.push({
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_PHASE_TEMPLATE_ARG_UNDEFINED,
          path: `${path}.args.${name}`,
          severity: 'error',
          message: `Arg "${name}" for template "${entry.fromTemplate}" is undefined.`,
        });
      }
    }

    if (hasMissing || hasExtra || hasUndefined) {
      continue;
    }

    // Perform substitution
    const substituted = substituteParams(template.phase, entry.args) as Record<string, unknown>;
    const phaseWithOrigin = {
      ...substituted,
      _origin: { pass: 'phaseTemplates', template: entry.fromTemplate },
    };
    expanded.push({
      phase: phaseWithOrigin as unknown as GameSpecPhaseDef,
      fromTemplate: entry.fromTemplate,
      inputIndex: entryIdx,
    });
  }

  return expanded;
}

// ---------------------------------------------------------------------------
// Diagnostic message helper
// ---------------------------------------------------------------------------

function formatDuplicateIdMessage(
  phaseId: string,
  firstTemplate: string | undefined,
  currentTemplate: string | undefined,
): string {
  const base = `Duplicate phase id "${phaseId}" after template expansion`;

  if (firstTemplate !== undefined && currentTemplate !== undefined) {
    if (firstTemplate === currentTemplate) {
      return `${base} (from template "${currentTemplate}").`;
    }
    return `${base} (templates "${firstTemplate}" and "${currentTemplate}").`;
  }

  if (currentTemplate !== undefined) {
    return `${base} (conflicts with template "${currentTemplate}"; first occurrence is a literal phase).`;
  }

  if (firstTemplate !== undefined) {
    return `${base} (conflicts with template "${firstTemplate}"; duplicate is a literal phase).`;
  }

  return `${base}.`;
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

export function expandPhaseTemplates(doc: GameSpecDoc): {
  readonly doc: GameSpecDoc;
  readonly diagnostics: readonly Diagnostic[];
} {
  // Early exit: no turnStructure → nothing to expand
  if (doc.turnStructure === null) {
    return { doc, diagnostics: [] };
  }

  const hasTemplateEntries =
    doc.turnStructure.phases.some(isFromTemplateEntry) ||
    (doc.turnStructure.interrupts?.some(isFromTemplateEntry) ?? false);

  // Early exit: no phaseTemplates and no fromTemplate entries
  if (
    (doc.phaseTemplates === null || doc.phaseTemplates.length === 0) &&
    !hasTemplateEntries
  ) {
    return { doc, diagnostics: [] };
  }

  const diagnostics: Diagnostic[] = [];

  // Build template lookup
  const templateMap = new Map<string, GameSpecPhaseTemplateDef>();
  if (doc.phaseTemplates !== null) {
    for (const tmpl of doc.phaseTemplates) {
      templateMap.set(tmpl.id, tmpl);
    }
  }

  // Expand phases
  const expandedPhases = expandPhaseArray(
    doc.turnStructure.phases,
    templateMap,
    'turnStructure.phases',
    diagnostics,
  );

  // Expand interrupts
  const expandedInterrupts =
    doc.turnStructure.interrupts !== undefined
      ? expandPhaseArray(
          doc.turnStructure.interrupts,
          templateMap,
          'turnStructure.interrupts',
          diagnostics,
        )
      : undefined;

  // Check for duplicate IDs across all expanded phases.
  // seenIds maps phase ID → template name of first occurrence (undefined = literal).
  const seenIds = new Map<string, string | undefined>();
  const allEntries = [
    ...expandedPhases.map((e) => ({ ...e, path: `turnStructure.phases[${e.inputIndex}]` })),
    ...(expandedInterrupts ?? []).map((e) => ({ ...e, path: `turnStructure.interrupts[${e.inputIndex}]` })),
  ];

  for (const { phase, fromTemplate, path } of allEntries) {
    if (phase.id !== undefined && seenIds.has(phase.id)) {
      const firstTemplate = seenIds.get(phase.id);
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_PHASE_TEMPLATE_DUPLICATE_ID,
        path,
        severity: 'error',
        message: formatDuplicateIdMessage(phase.id, firstTemplate, fromTemplate),
      });
    }
    if (phase.id !== undefined) {
      seenIds.set(phase.id, fromTemplate);
    }
  }

  return {
    doc: {
      ...doc,
      turnStructure: {
        phases: expandedPhases.map((e) => e.phase),
        ...(expandedInterrupts !== undefined
          ? { interrupts: expandedInterrupts.map((e) => e.phase) }
          : {}),
      },
      phaseTemplates: null,
    },
    diagnostics,
  };
}

export const phaseTemplatesPass: ExpansionPass = {
  id: 'phaseTemplates',
  dependsOn: [],
  expand: expandPhaseTemplates,
};
