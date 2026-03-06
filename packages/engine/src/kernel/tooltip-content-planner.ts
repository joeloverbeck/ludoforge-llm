/**
 * Content planner: transforms a flat TooltipMessage[] into a structured
 * ContentPlan grouped by pipeline stage, with synopsis source identification,
 * modifier extraction, sub-step detection, and rhetorical budget enforcement.
 *
 * This is a purely structural transform — no verbalization.
 * The template realizer (LEGACTTOO-007) converts ContentPlan → RuleCard.
 */

import type { TooltipMessage, ModifierMessage } from './tooltip-ir.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContentPlanStep {
  readonly stepNumber: number;
  readonly header: string;
  readonly messages: readonly TooltipMessage[];
  readonly collapsedCount: number;
  readonly subSteps?: readonly ContentPlanStep[];
}

export interface ContentPlan {
  readonly actionLabel: string;
  readonly synopsisSource?: TooltipMessage;
  readonly steps: readonly ContentPlanStep[];
  readonly modifiers: readonly ModifierMessage[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_SUB_STEPS = 3;
const BUDGET_COMPLEX = 30;
const COMPLEX_STAGE_THRESHOLD = 3;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function filterSuppressed(
  messages: readonly TooltipMessage[],
): readonly TooltipMessage[] {
  return messages.filter((m) => m.kind !== 'suppressed');
}

function extractModifiers(
  messages: readonly TooltipMessage[],
): { readonly modifiers: readonly ModifierMessage[]; readonly content: readonly TooltipMessage[] } {
  const modifiers: ModifierMessage[] = [];
  const content: TooltipMessage[] = [];
  for (const m of messages) {
    if (m.kind === 'modifier') {
      modifiers.push(m);
    } else {
      content.push(m);
    }
  }
  return { modifiers, content };
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
  const matches = astPath.match(/\.(effects|in|then|else)\[/g);
  return matches !== null ? matches.length : 0;
}

/**
 * Extract the parent path at a given depth boundary.
 * For "root.effects[0].forEach.effects[1]" at depth boundary 1,
 * returns "root.effects[0]".
 */
function parentPathAtDepth(astPath: string, targetDepth: number): string {
  let depth = 0;
  const re = /\.(effects|in|then|else)\[/g;
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

// ---------------------------------------------------------------------------
// Stage grouping
// ---------------------------------------------------------------------------

function groupByStage(
  messages: readonly TooltipMessage[],
): ReadonlyMap<string, readonly TooltipMessage[]> {
  const groups = new Map<string, TooltipMessage[]>();
  const DEFAULT_STAGE = '__default__';

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
): { readonly direct: readonly TooltipMessage[]; readonly subSteps: readonly ContentPlanStep[]; readonly collapsed: number } {
  if (messages.length === 0) {
    return { direct: [], subSteps: [], collapsed: 0 };
  }

  const minDepth = Math.min(...messages.map((m) => pathDepth(m.astPath)));
  const direct = messages.filter((m) => pathDepth(m.astPath) === minDepth);
  const deeper = messages.filter((m) => pathDepth(m.astPath) > minDepth);

  if (deeper.length === 0) {
    return { direct, subSteps: [], collapsed: 0 };
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
      stepNumber: stepNum++,
      header: `Sub-step ${allSubSteps.length + 1}`,
      messages: groupMsgs,
      collapsedCount: 0,
    });
  }

  // Collapse sub-steps beyond the limit
  if (allSubSteps.length <= MAX_SUB_STEPS) {
    return { direct, subSteps: allSubSteps, collapsed: 0 };
  }

  const kept = allSubSteps.slice(0, MAX_SUB_STEPS);
  const collapsedCount = allSubSteps.length - MAX_SUB_STEPS;
  return { direct, subSteps: kept, collapsed: collapsedCount };
}

// ---------------------------------------------------------------------------
// Step building
// ---------------------------------------------------------------------------

function buildSteps(
  stageGroups: ReadonlyMap<string, readonly TooltipMessage[]>,
): readonly ContentPlanStep[] {
  const DEFAULT_STAGE = '__default__';
  const steps: ContentPlanStep[] = [];
  let stepNum = 1;

  for (const [stage, messages] of stageGroups) {
    const header = stage === DEFAULT_STAGE ? `Step ${stepNum}` : stage;
    const { direct, subSteps, collapsed } = buildSubSteps(messages);

    steps.push({
      stepNumber: stepNum++,
      header,
      messages: direct,
      collapsedCount: collapsed,
      ...(subSteps.length > 0 ? { subSteps } : {}),
    });
  }

  return steps;
}

// ---------------------------------------------------------------------------
// Message counting
// ---------------------------------------------------------------------------

function countMessages(steps: readonly ContentPlanStep[]): number {
  let count = 0;
  for (const step of steps) {
    count += step.messages.length;
    if (step.subSteps !== undefined) {
      count += countMessages(step.subSteps);
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// Rhetorical budget enforcement
// ---------------------------------------------------------------------------

function enforceBudget(
  steps: readonly ContentPlanStep[],
  budget: number,
): readonly ContentPlanStep[] {
  let total = countMessages(steps);
  if (total <= budget) return steps;

  // Collapse deepest sub-steps first, working backwards through steps
  const result: ContentPlanStep[] = [...steps];

  for (let i = result.length - 1; i >= 0 && total > budget; i--) {
    const step = result[i]!;
    if (step.subSteps !== undefined && step.subSteps.length > 0) {
      const subMsgCount = step.subSteps.reduce(
        (sum, s) => sum + s.messages.length, 0,
      );
      result[i] = {
        stepNumber: step.stepNumber,
        header: step.header,
        messages: step.messages,
        collapsedCount: step.collapsedCount + step.subSteps.length,
      };
      total -= subMsgCount;
    }
  }

  // If still over budget, collapse messages within steps from the back
  for (let i = result.length - 1; i >= 0 && total > budget; i--) {
    const step = result[i]!;
    if (step.messages.length > MAX_SUB_STEPS) {
      const excess = Math.min(
        step.messages.length - MAX_SUB_STEPS,
        total - budget,
      );
      result[i] = {
        stepNumber: step.stepNumber,
        header: step.header,
        messages: step.messages.slice(0, step.messages.length - excess),
        collapsedCount: step.collapsedCount + excess,
        ...(step.subSteps !== undefined ? { subSteps: step.subSteps } : {}),
      };
      total -= excess;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function planContent(
  messages: readonly TooltipMessage[],
  actionLabel: string,
): ContentPlan {
  const filtered = filterSuppressed(messages);
  const { modifiers, content } = extractModifiers(filtered);
  const synopsisSource = findSynopsisSource(content);
  const stageGroups = groupByStage(content);
  const rawSteps = buildSteps(stageGroups);

  const stageCount = stageGroups.size;
  const budget = stageCount >= COMPLEX_STAGE_THRESHOLD ? BUDGET_COMPLEX : BUDGET_COMPLEX;
  const steps = enforceBudget(rawSteps, budget);

  return {
    actionLabel,
    ...(synopsisSource !== undefined ? { synopsisSource } : {}),
    steps,
    modifiers,
  };
}
