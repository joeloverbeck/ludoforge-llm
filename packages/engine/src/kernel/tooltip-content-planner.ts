/**
 * Content planner: transforms a flat TooltipMessage[] into a structured
 * ContentPlan grouped by pipeline stage, with synopsis source identification,
 * modifier extraction and deduplication, and sub-step detection with
 * semantic headers.
 *
 * This is a purely structural transform — no verbalization.
 * The template realizer converts ContentPlan → RuleCard.
 */

import type { TooltipMessage, ModifierMessage } from './tooltip-ir.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContentPlanStep {
  readonly stepNumber: number;
  readonly header: string;
  readonly messages: readonly TooltipMessage[];
  readonly subSteps?: readonly ContentPlanStep[];
}

export interface ContentPlan {
  readonly actionLabel: string;
  readonly authoredSynopsis?: string;
  readonly synopsisSource?: TooltipMessage;
  readonly steps: readonly ContentPlanStep[];
  readonly modifiers: readonly ModifierMessage[];
}

export interface ContentPlanOptions {
  readonly authoredSynopsis?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_STAGE = '__default__';

/**
 * Map from message kind to a semantic label for sub-step headers.
 */
const SUB_STEP_HEADER_BY_KIND: Readonly<Record<string, string>> = {
  select: 'Select spaces',
  place: 'Place forces',
  move: 'Move forces',
  pay: 'Pay resources',
  gain: 'Gain resources',
  transfer: 'Transfer resources',
  shift: 'Shift markers',
  activate: 'Activate pieces',
  deactivate: 'Deactivate pieces',
  remove: 'Remove pieces',
  create: 'Create tokens',
  destroy: 'Destroy tokens',
  reveal: 'Reveal information',
  draw: 'Draw cards',
  shuffle: 'Shuffle deck',
  set: 'Set values',
  choose: 'Choose option',
  roll: 'Roll dice',
  phase: 'Advance phase',
  grant: 'Grant operation',
  conceal: 'Conceal information',
  summary: 'Summary',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function filterSuppressed(
  messages: readonly TooltipMessage[],
): readonly TooltipMessage[] {
  return messages.filter((m) => m.kind !== 'suppressed');
}

/**
 * Compute a fingerprint for a TooltipMessage by serializing all fields
 * **except** the metadata fields `astPath` and `macroOrigin`.
 */
function messageFingerprint(msg: TooltipMessage): string {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { astPath, macroOrigin, ...semanticFields } = msg;
  return JSON.stringify(semanticFields);
}

/**
 * Collapse structurally identical TooltipMessage entries that differ only
 * in metadata (`astPath`, `macroOrigin`).  Keeps first occurrence, preserves
 * ordering, does not mutate input.
 */
export function deduplicateMessages(
  messages: readonly TooltipMessage[],
): readonly TooltipMessage[] {
  const seen = new Set<string>();
  const result: TooltipMessage[] = [];
  for (const m of messages) {
    const fp = messageFingerprint(m);
    if (!seen.has(fp)) {
      seen.add(fp);
      result.push(m);
    }
  }
  return result;
}

function deduplicateModifiers(
  modifiers: readonly ModifierMessage[],
): readonly ModifierMessage[] {
  const seen = new Set<string>();
  const result: ModifierMessage[] = [];
  for (const m of modifiers) {
    if (!seen.has(m.condition)) {
      seen.add(m.condition);
      result.push(m);
    }
  }
  return result;
}

function extractModifiers(
  messages: readonly TooltipMessage[],
): { readonly modifiers: readonly ModifierMessage[]; readonly content: readonly TooltipMessage[] } {
  const modifiers: ModifierMessage[] = [];
  const content: TooltipMessage[] = [];
  for (const m of messages) {
    if (m.kind === 'modifier') {
      // Include capability, leader, and unclassified (undefined) modifiers.
      // Suppress choiceFlow (internal branching) and state-role modifiers
      // (runtime conditions that aren't player-facing game modifiers).
      if (m.modifierRole !== 'choiceFlow' && m.modifierRole !== 'state') {
        modifiers.push(m);
      }
    } else {
      content.push(m);
    }
  }
  return { modifiers: deduplicateModifiers(modifiers), content };
}

function findSynopsisSource(
  messages: readonly TooltipMessage[],
): TooltipMessage | undefined {
  return messages.find((m) => m.kind === 'select' || m.kind === 'choose');
}

/**
 * Count the nesting depth of an astPath by counting segments that indicate
 * recursion into child effects (`.effects[`, `.in[`, `.then[`, `.else[`).
 */
function pathDepth(astPath: string): number {
  const matches = astPath.match(/\.(effects|in|then|else|groups)\[/g);
  return matches !== null ? matches.length : 0;
}

/**
 * Extract the parent path at a given depth boundary.
 * For "root.effects[0].forEach.effects[1]" at depth boundary 1,
 * returns "root.effects[0]".
 */
function parentPathAtDepth(astPath: string, targetDepth: number): string {
  let depth = 0;
  const re = /\.(effects|in|then|else|groups)\[/g;
  let lastEnd = 0;
  let match: RegExpExecArray | null = re.exec(astPath);
  while (match !== null) {
    depth++;
    if (depth > targetDepth) {
      return astPath.slice(0, match.index);
    }
    lastEnd = re.lastIndex;
    match = re.exec(astPath);
  }
  return astPath.slice(0, lastEnd > 0 ? lastEnd : astPath.length);
}

/**
 * Derive a semantic sub-step header from the first message in a group.
 */
function deriveSubStepHeader(messages: readonly TooltipMessage[], index: number): string {
  if (messages.length > 0) {
    const first = messages[0]!;
    if (first.kind === 'summary' && first.macroClass !== undefined) {
      return first.macroClass;
    }
    const semantic = SUB_STEP_HEADER_BY_KIND[first.kind];
    if (semantic !== undefined) return semantic;
  }
  return `Sub-step ${index}`;
}

// ---------------------------------------------------------------------------
// Stage grouping
// ---------------------------------------------------------------------------

function groupByStage(
  messages: readonly TooltipMessage[],
): ReadonlyMap<string, readonly TooltipMessage[]> {
  const groups = new Map<string, TooltipMessage[]>();

  for (const m of messages) {
    const stage = m.stage ?? DEFAULT_STAGE;
    const existing = groups.get(stage);
    if (existing !== undefined) {
      existing.push(m);
    } else {
      groups.set(stage, [m]);
    }
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Sub-step detection
// ---------------------------------------------------------------------------

function buildSubSteps(
  messages: readonly TooltipMessage[],
): { readonly direct: readonly TooltipMessage[]; readonly subSteps: readonly ContentPlanStep[] } {
  if (messages.length === 0) {
    return { direct: [], subSteps: [] };
  }

  const minDepth = Math.min(...messages.map((m) => pathDepth(m.astPath)));
  const direct = messages.filter((m) => pathDepth(m.astPath) === minDepth);
  const deeper = messages.filter((m) => pathDepth(m.astPath) > minDepth);

  if (deeper.length === 0) {
    return { direct, subSteps: [] };
  }

  // Group deeper messages by their parent path at minDepth+1
  const subGroups = new Map<string, TooltipMessage[]>();
  for (const m of deeper) {
    const parent = parentPathAtDepth(m.astPath, minDepth + 1);
    const existing = subGroups.get(parent);
    if (existing !== undefined) {
      existing.push(m);
    } else {
      subGroups.set(parent, [m]);
    }
  }

  const allSubSteps: ContentPlanStep[] = [];
  let stepNum = 1;
  for (const [, groupMsgs] of subGroups) {
    allSubSteps.push({
      stepNumber: stepNum,
      header: deriveSubStepHeader(groupMsgs, stepNum),
      messages: groupMsgs,
    });
    stepNum++;
  }

  return { direct, subSteps: allSubSteps };
}

// ---------------------------------------------------------------------------
// Step building
// ---------------------------------------------------------------------------

function buildSteps(
  stageGroups: ReadonlyMap<string, readonly TooltipMessage[]>,
): readonly ContentPlanStep[] {
  const steps: ContentPlanStep[] = [];
  let stepNum = 1;

  for (const [stage, messages] of stageGroups) {
    const header = stage === DEFAULT_STAGE ? `Step ${stepNum}` : stage;
    const { direct, subSteps } = buildSubSteps(messages);

    steps.push({
      stepNumber: stepNum++,
      header,
      messages: direct,
      ...(subSteps.length > 0 ? { subSteps } : {}),
    });
  }

  return steps;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function planContent(
  messages: readonly TooltipMessage[],
  actionLabel: string,
  options: ContentPlanOptions = {},
): ContentPlan {
  const filtered = filterSuppressed(messages);
  const deduplicated = deduplicateMessages(filtered);
  const { modifiers, content } = extractModifiers(deduplicated);
  const synopsisSource = findSynopsisSource(content);
  const stageGroups = groupByStage(content);
  const steps = buildSteps(stageGroups);

  return {
    actionLabel,
    ...(options.authoredSynopsis !== undefined ? { authoredSynopsis: options.authoredSynopsis } : {}),
    ...(synopsisSource !== undefined ? { synopsisSource } : {}),
    steps,
    modifiers,
  };
}
