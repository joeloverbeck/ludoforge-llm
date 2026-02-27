import type { PlayerId } from './branded.js';
import type {
  AnnotatedActionDescription,
  DisplayAnnotationNode,
  DisplayGroupNode,
  DisplayLineNode,
  DisplayNode,
  LimitUsageInfo,
} from './display-node.js';
import { actionDefToDisplayTree } from './ast-to-display.js';
import { evalCondition } from './eval-condition.js';
import { evalValue } from './eval-value.js';
import type { EvalContext } from './eval-context.js';
import { createCollector } from './execution-collector.js';
import type { ActionDef, ActionUsageRecord, ConditionAST, GameDef, GameState, ValueExpr } from './types.js';
import type { GameDefRuntime } from './gamedef-runtime.js';

// ---------------------------------------------------------------------------
// AnnotationContext — everything the annotator needs from the caller
// ---------------------------------------------------------------------------

export interface AnnotationContext {
  readonly def: GameDef;
  readonly runtime: GameDefRuntime;
  readonly state: GameState;
  readonly activePlayer: PlayerId;
  readonly actorPlayer: PlayerId;
}

// ---------------------------------------------------------------------------
// Comparison operator type guard
// ---------------------------------------------------------------------------

type ComparisonOp = '==' | '!=' | '<' | '<=' | '>' | '>=';

const COMPARISON_OPS: ReadonlySet<string> = new Set<ComparisonOp>([
  '==', '!=', '<', '<=', '>', '>=',
]);

const isComparisonOp = (op: string): op is ComparisonOp => COMPARISON_OPS.has(op);

// ---------------------------------------------------------------------------
// Safe evaluation helpers
// ---------------------------------------------------------------------------

const tryEvalCondition = (
  cond: ConditionAST,
  evalCtx: EvalContext,
): { readonly result: 'pass' | 'fail'; readonly text: string } => {
  try {
    const passed = evalCondition(cond, evalCtx);
    return passed
      ? { result: 'pass', text: '\u2713' }
      : { result: 'fail', text: '\u2717' };
  } catch {
    return { result: 'fail', text: 'depends on choice' };
  }
};

interface ComparisonCondition {
  readonly op: ComparisonOp;
  readonly left: ValueExpr;
  readonly right: ValueExpr;
}

const isComparisonCondition = (cond: ConditionAST): cond is ComparisonCondition =>
  typeof cond !== 'boolean' && 'op' in cond && isComparisonOp(cond.op);

const tryEvalComparisonValues = (
  cond: ConditionAST,
  evalCtx: EvalContext,
): readonly DisplayAnnotationNode[] => {
  if (!isComparisonCondition(cond)) return [];
  try {
    const leftVal = evalValue(cond.left, evalCtx);
    return [{ kind: 'annotation', annotationType: 'value', text: `current: ${String(leftVal)}` }];
  } catch {
    return [];
  }
};

// ---------------------------------------------------------------------------
// Immutable line annotation append
// ---------------------------------------------------------------------------

const appendAnnotations = (
  node: DisplayLineNode,
  annotations: readonly DisplayAnnotationNode[],
): DisplayLineNode => {
  if (annotations.length === 0) return node;
  return { ...node, children: [...node.children, ...annotations] };
};

// ---------------------------------------------------------------------------
// Core lockstep walker
// ---------------------------------------------------------------------------

interface WalkResult {
  readonly annotated: readonly DisplayNode[];
  readonly consumed: number;
}

const annotateConditionNodes = (
  nodes: readonly DisplayNode[],
  cond: ConditionAST,
  evalCtx: EvalContext,
  offset: number,
): WalkResult => {
  if (typeof cond === 'boolean') {
    const node = nodes[offset]!;
    const { result, text } = tryEvalCondition(cond, evalCtx);
    const annotation: DisplayAnnotationNode = { kind: 'annotation', annotationType: result, text };
    const annotated = node.kind === 'line'
      ? appendAnnotations(node, [annotation])
      : node;
    return { annotated: [annotated], consumed: 1 };
  }

  switch (cond.op) {
    case 'and':
    case 'or': {
      const header = nodes[offset]!;
      let cursor = offset + 1;
      const childNodes: DisplayNode[] = [];
      for (const arg of cond.args) {
        const childResult = annotateConditionNodes(nodes, arg, evalCtx, cursor);
        childNodes.push(...childResult.annotated);
        cursor += childResult.consumed;
      }
      const { result, text } = tryEvalCondition(cond, evalCtx);
      const annotation: DisplayAnnotationNode = { kind: 'annotation', annotationType: result, text };
      const annotatedHeader = header.kind === 'line'
        ? appendAnnotations(header, [annotation])
        : header;
      return { annotated: [annotatedHeader, ...childNodes], consumed: cursor - offset };
    }
    case 'not': {
      const header = nodes[offset]!;
      const childResult = annotateConditionNodes(nodes, cond.arg, evalCtx, offset + 1);
      const { result, text } = tryEvalCondition(cond, evalCtx);
      const annotation: DisplayAnnotationNode = { kind: 'annotation', annotationType: result, text };
      const annotatedHeader = header.kind === 'line'
        ? appendAnnotations(header, [annotation])
        : header;
      return { annotated: [annotatedHeader, ...childResult.annotated], consumed: 1 + childResult.consumed };
    }
    default: {
      // Leaf condition
      const node = nodes[offset]!;
      const { result, text } = tryEvalCondition(cond, evalCtx);
      const passFailAnnotation: DisplayAnnotationNode = { kind: 'annotation', annotationType: result, text };
      const valueAnnotations = tryEvalComparisonValues(cond, evalCtx);
      const annotated = node.kind === 'line'
        ? appendAnnotations(node, [...valueAnnotations, passFailAnnotation])
        : node;
      return { annotated: [annotated], consumed: 1 };
    }
  }
};

// ---------------------------------------------------------------------------
// Group-level annotators
// ---------------------------------------------------------------------------

const annotateConditionGroup = (
  group: DisplayGroupNode,
  cond: ConditionAST,
  evalCtx: EvalContext,
): DisplayGroupNode => {
  const { annotated } = annotateConditionNodes(group.children, cond, evalCtx, 0);
  return { ...group, children: annotated };
};

const scopeToUsageField = (scope: 'turn' | 'phase' | 'game'): keyof ActionUsageRecord => {
  switch (scope) {
    case 'turn': return 'turnCount';
    case 'phase': return 'phaseCount';
    case 'game': return 'gameCount';
  }
};

const annotateLimitsGroup = (
  group: DisplayGroupNode,
  action: ActionDef,
  state: GameState,
): { readonly annotatedGroup: DisplayGroupNode; readonly limitUsage: readonly LimitUsageInfo[] } => {
  const usage: ActionUsageRecord | undefined =
    state.actionUsage[String(action.id)] as ActionUsageRecord | undefined;

  const limitUsage: LimitUsageInfo[] = action.limits.map((limit) => {
    const current = usage !== undefined ? usage[scopeToUsageField(limit.scope)] : 0;
    return { ...limit, current };
  });

  const annotatedChildren = group.children.map((child, idx) => {
    const info = limitUsage[idx];
    if (child.kind !== 'line' || info === undefined) return child;
    const annotation: DisplayAnnotationNode = {
      kind: 'annotation',
      annotationType: 'usage',
      text: `${info.current}/${info.max}`,
    };
    return appendAnnotations(child, [annotation]);
  });

  return {
    annotatedGroup: { ...group, children: annotatedChildren },
    limitUsage,
  };
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function describeAction(
  action: ActionDef,
  context: AnnotationContext,
): AnnotatedActionDescription {
  try {
    const sections = actionDefToDisplayTree(action);

    const evalCtx: EvalContext = {
      def: context.def,
      adjacencyGraph: context.runtime.adjacencyGraph,
      state: context.state,
      activePlayer: context.activePlayer,
      actorPlayer: context.actorPlayer,
      bindings: {},
      runtimeTableIndex: context.runtime.runtimeTableIndex,
      collector: createCollector(),
    };

    let limitUsage: readonly LimitUsageInfo[] = [];

    const annotatedSections = sections.map((section) => {
      if (section.label === 'Preconditions' && action.pre !== null) {
        return annotateConditionGroup(section, action.pre, evalCtx);
      }
      if (section.label === 'Limits') {
        const result = annotateLimitsGroup(section, action, context.state);
        limitUsage = result.limitUsage;
        return result.annotatedGroup;
      }
      return section;
    });

    return { sections: annotatedSections, limitUsage };
  } catch {
    // Safety net: never throw from describeAction
    const sections = actionDefToDisplayTree(action);
    return { sections, limitUsage: [] };
  }
}

