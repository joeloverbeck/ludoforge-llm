import type { PlayerId } from './branded.js';
import { ifEffect } from './ast-builders.js';
import type {
  AnnotatedActionDescription,
  DisplayAnnotationNode,
  DisplayGroupNode,
  DisplayLineNode,
  DisplayNode,
  LimitUsageInfo,
} from './display-node.js';
import {
  actionDefToDisplayTree,
  actionPipelineDefToDisplayTree,
  conditionToDisplayNodes,
  displayGroup,
  effectToDisplayNodes,
} from './ast-to-display.js';
import { evalCondition } from './eval-condition.js';
import { unwrapEvalCondition } from './eval-result.js';
import { evalValue } from './eval-value.js';
import { createEvalContext, createEvalRuntimeResources, type ReadContext } from './eval-context.js';
import type { ActionDef, ActionUsageRecord, ConditionAST, GameDef, GameState, ValueExpr } from './types.js';
import type { ActionPipelineDef } from './types-operations.js';
import type { EffectAST } from './types-ast.js';
import type { GameDefRuntime } from './gamedef-runtime.js';
import type { ActionTooltipPayload, ContentStep, RuleCard, RuleState, RuleStateLimitUsage } from './tooltip-rule-card.js';
import { normalizeEffect, type NormalizerContext } from './tooltip-normalizer.js';
import { planContent } from './tooltip-content-planner.js';
import { realizeContentPlan } from './tooltip-template-realizer.js';
import { extractBlockers } from './tooltip-blocker-extractor.js';
import { isCardEventAction } from './action-capabilities.js';
import { getActionPipelinesForAction } from './action-pipeline-lookup.js';
import type { EventCardDef } from './types-events.js';

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
  evalCtx: ReadContext,
): { readonly result: 'pass' | 'fail'; readonly text: string } => {
  const condResult = evalCondition(cond, evalCtx);
  if (condResult.outcome === 'error') return { result: 'fail', text: 'depends on choice' };
  return condResult.value
    ? { result: 'pass', text: '\u2713' }
    : { result: 'fail', text: '\u2717' };
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
  evalCtx: ReadContext,
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
  evalCtx: ReadContext,
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
  evalCtx: ReadContext,
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

export const annotateLimitsGroup = (
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
  const limitUsageById = new Map(limitUsage.map((limit) => [limit.id, limit] as const));

  const annotatedChildren = group.children.map((child) => {
    if (child.kind !== 'line') return child;
    const sourceRef = child.sourceRef;
    if (sourceRef === undefined || sourceRef.entity !== 'limit') {
      // Invariant: every line in a Limits group must carry a limit sourceRef.
      // Missing identity is treated as an explicit failure, not a silent no-op.
      const failAnnotation: DisplayAnnotationNode = {
        kind: 'annotation',
        annotationType: 'fail',
        text: 'missing limit identity',
      };
      return appendAnnotations(child, [failAnnotation]);
    }
    const info = limitUsageById.get(sourceRef.id);
    if (info === undefined) {
      // Invariant: sourceRef id must resolve to a known limit on this action.
      // Mismatched identity is treated as an explicit failure.
      const failAnnotation: DisplayAnnotationNode = {
        kind: 'annotation',
        annotationType: 'fail',
        text: 'unresolved limit identity',
      };
      return appendAnnotations(child, [failAnnotation]);
    }
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
// Pipeline annotation helpers
// ---------------------------------------------------------------------------

const buildAnnotatedPipelineSection = (
  pipeline: ActionPipelineDef,
  evalCtx: ReadContext,
): DisplayGroupNode => {
  const children: DisplayGroupNode[] = [];

  if (pipeline.applicability !== undefined) {
    const raw = displayGroup('Applicability', conditionToDisplayNodes(pipeline.applicability, 0), 'check');
    children.push(annotateConditionGroup(raw, pipeline.applicability, evalCtx));
  }

  if (pipeline.legality !== null) {
    const raw = displayGroup('Legality', conditionToDisplayNodes(pipeline.legality, 0), 'check');
    children.push(annotateConditionGroup(raw, pipeline.legality, evalCtx));
  }

  if (pipeline.costValidation !== null) {
    const raw = displayGroup('Cost Validation', conditionToDisplayNodes(pipeline.costValidation, 0), 'check');
    children.push(annotateConditionGroup(raw, pipeline.costValidation, evalCtx));
  }

  if (pipeline.costEffects.length > 0) {
    children.push(displayGroup(
      'Costs',
      pipeline.costEffects.flatMap((e) => effectToDisplayNodes(e, 0)),
      'cost',
    ));
  }

  for (const stage of pipeline.stages) {
    const stageChildren: DisplayGroupNode[] = [];
    if (stage.legality != null) {
      const raw = displayGroup('Legality', conditionToDisplayNodes(stage.legality, 0), 'check');
      stageChildren.push(annotateConditionGroup(raw, stage.legality, evalCtx));
    }
    if (stage.costValidation != null) {
      const raw = displayGroup('Cost Validation', conditionToDisplayNodes(stage.costValidation, 0), 'check');
      stageChildren.push(annotateConditionGroup(raw, stage.costValidation, evalCtx));
    }
    if (stage.effects.length > 0) {
      stageChildren.push(...stage.effects.flatMap((e) => effectToDisplayNodes(e, 0)) as DisplayGroupNode[]);
    }
    if (stageChildren.length > 0) {
      const label = stage.stage !== undefined ? `Stage: ${stage.stage}` : 'Effects';
      children.push(displayGroup(label, stageChildren));
    }
  }

  return { kind: 'group', label: `Pipeline: ${pipeline.id}`, collapsible: true, children };
};

const pipelineApplicabilityPasses = (
  pipeline: ActionPipelineDef,
  evalCtx: ReadContext,
): boolean => {
  if (pipeline.applicability === undefined) return true;
  const result = evalCondition(pipeline.applicability, evalCtx);
  if (result.outcome === 'error') return false;
  return result.value;
};

const collectRuleCardEffects = (
  action: ActionDef,
  def: GameDef,
): readonly EffectAST[] => {
  const pipelines = getActionPipelinesForAction(def, action.id);
  if (pipelines.length === 0) {
    return [...action.cost, ...action.effects];
  }

  return pipelines.flatMap((pipeline) => {
    const pipelineEffects = [
      ...pipeline.costEffects,
      ...pipeline.stages.flatMap((stage) => stage.effects),
    ];
    if (pipeline.applicability === undefined) {
      return pipelineEffects;
    }
    return [ifEffect({
      when: pipeline.applicability,
      then: pipelineEffects,
    })];
  });
};

// ---------------------------------------------------------------------------
// Event card resolution for event-action tooltip enrichment
// ---------------------------------------------------------------------------

const resolveCurrentEventCard = (def: GameDef, state: GameState): EventCardDef | null => {
  const turnOrder = def.turnOrder;
  if (turnOrder?.type !== 'cardDriven') return null;
  const playedZoneId = turnOrder.config.turnFlow.cardLifecycle?.played;
  if (playedZoneId === undefined) return null;
  const token = state.zones[playedZoneId]?.[0];
  if (token === undefined) return null;
  const cardId = typeof token.props.cardId === 'string' && token.props.cardId.length > 0
    ? token.props.cardId
    : String(token.id);
  for (const deck of def.eventDecks ?? []) {
    const card = deck.cards.find((c) => c.id === cardId);
    if (card !== undefined) return card;
  }
  return null;
};

const buildEventRuleCard = (eventCard: EventCardDef): RuleCard => {
  const synopsis = eventCard.order !== undefined
    ? `${eventCard.title} #${eventCard.order}`
    : eventCard.title;
  const steps: ContentStep[] = [];
  let stepNumber = 1;
  if (eventCard.unshaded?.text !== undefined) {
    steps.push({
      stepNumber: stepNumber++,
      header: 'Unshaded',
      lines: [{ text: eventCard.unshaded.text, astPath: 'event.unshaded.text' }],
    });
  }
  if (eventCard.shaded?.text !== undefined) {
    steps.push({
      stepNumber,
      header: 'Shaded',
      lines: [{ text: eventCard.shaded.text, astPath: 'event.shaded.text' }],
    });
  }
  return { synopsis, steps, modifiers: [] };
};

// ---------------------------------------------------------------------------
// Tooltip pipeline
// ---------------------------------------------------------------------------

const buildRuleCard = (
  action: ActionDef,
  def: GameDef,
  runtime: GameDefRuntime,
  evalCtx: ReadContext,
  state?: GameState,
): RuleCard => {
  // For event actions, build a card-content-based RuleCard instead of AST-derived one
  if (isCardEventAction(action) && state !== undefined) {
    const eventCard = resolveCurrentEventCard(def, state);
    if (eventCard !== null) {
      const eventRuleCard = buildEventRuleCard(eventCard);
      runtime.ruleCardCache.set(`${String(action.id)}:event:${eventCard.id}`, eventRuleCard);
      return eventRuleCard;
    }
  }

  // Extract __actionClass from runtime bindings to enable context-aware branch selection
  const actionClassBinding = evalCtx.bindings.__actionClass as string | undefined;

  // Cache key includes action class so LimOp and FullOp variants are cached separately
  const cacheKey = `${String(action.id)}:${actionClassBinding ?? 'static'}`;
  const cached = runtime.ruleCardCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const normCtx: NormalizerContext = {
    verbalization: def.verbalization,
    suppressPatterns: def.verbalization?.suppressPatterns ?? [],
    ...(actionClassBinding !== undefined ? { actionClassBinding } : {}),
  };

  const normalizedEffects = collectRuleCardEffects(action, def);
  const messages = normalizedEffects.flatMap((e, i) => normalizeEffect(e, normCtx, `root[${i}]`));
  const authoredSynopsis = def.verbalization?.actionSummaries?.[String(action.id)];
  const plan = planContent(
    messages,
    String(action.id),
    authoredSynopsis !== undefined ? { authoredSynopsis } : {},
  );
  const ruleCard = realizeContentPlan(plan, def.verbalization);

  runtime.ruleCardCache.set(cacheKey, ruleCard);
  return ruleCard;
};

const buildRuleState = (
  action: ActionDef,
  ruleCard: RuleCard,
  evalCtx: ReadContext,
  limitUsage: readonly LimitUsageInfo[],
  def: GameDef,
): RuleState => {
  // Blocker extraction from preconditions
  let available = true;
  let blockerDetails: RuleState['blockers'] = [];
  if (action.pre !== null) {
    const blockerInfo = extractBlockers(
      action.pre,
      (c) => unwrapEvalCondition(evalCondition(c, evalCtx)),
      def.verbalization,
    );
    available = blockerInfo.satisfied;
    blockerDetails = blockerInfo.blockers;
  }

  // Active modifier detection via conditionAST evaluation
  const activeModifierIndices: number[] = [];
  for (let i = 0; i < ruleCard.modifiers.length; i++) {
    const mod = ruleCard.modifiers[i]!;
    if (mod.conditionAST !== undefined) {
      const modResult = evalCondition(mod.conditionAST, evalCtx);
      // Skip modifiers whose condition depends on runtime bindings (error result)
      if (modResult.outcome === 'success' && modResult.value) {
        activeModifierIndices.push(i);
      }
    }
  }

  // Limit usage summary
  const limitSummary: readonly RuleStateLimitUsage[] | undefined = limitUsage.length > 0
    ? limitUsage.map((limit) => ({
      id: limit.id,
      scope: limit.scope,
      used: limit.current,
      max: limit.max,
    }))
    : undefined;

  return {
    available,
    blockers: blockerDetails,
    activeModifierIndices,
    ...(limitSummary !== undefined ? { limitUsage: limitSummary } : {}),
  };
};

const buildTooltipPayload = (
  action: ActionDef,
  context: AnnotationContext,
  evalCtx: ReadContext,
  limitUsage: readonly LimitUsageInfo[],
): ActionTooltipPayload | undefined => {
  try {
    const ruleCard = buildRuleCard(action, context.def, context.runtime, evalCtx, context.state);
    const ruleState = buildRuleState(action, ruleCard, evalCtx, limitUsage, context.def);
    return { ruleCard, ruleState };
  } catch {
    return undefined;
  }
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

    const evalCtx = createEvalContext({
      def: context.def,
      adjacencyGraph: context.runtime.adjacencyGraph,
      state: context.state,
      activePlayer: context.activePlayer,
      actorPlayer: context.actorPlayer,
      bindings: {},
      runtimeTableIndex: context.runtime.runtimeTableIndex,
      resources: createEvalRuntimeResources(),
    });

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

    // Append pipeline sections for pipeline-backed actions
    const pipelines = getActionPipelinesForAction(context.def, action.id);
    const applicablePipelines = pipelines.filter((p) => pipelineApplicabilityPasses(p, evalCtx));
    const pipelineSections = applicablePipelines.map((p) => buildAnnotatedPipelineSection(p, evalCtx));

    // Build tooltip payload (graceful — undefined on error)
    const tooltipPayload = buildTooltipPayload(action, context, evalCtx, limitUsage);

    return {
      sections: [...annotatedSections, ...pipelineSections],
      limitUsage,
      ...(tooltipPayload !== undefined ? { tooltipPayload } : {}),
    };
  } catch {
    // Safety net: never throw from describeAction
    const sections = actionDefToDisplayTree(action);
    const pipelines = getActionPipelinesForAction(context.def, action.id);
    const pipelineSections = pipelines.map((p) => actionPipelineDefToDisplayTree(p));
    return { sections: [...sections, ...pipelineSections], limitUsage: [] };
  }
}
