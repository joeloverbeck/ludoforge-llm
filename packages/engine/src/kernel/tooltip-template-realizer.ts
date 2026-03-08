/**
 * Template realizer: converts a ContentPlan (with TooltipMessage arrays)
 * into a RuleCard (with English string arrays).
 *
 * Each message kind has a template function that produces a human-readable
 * string. Label resolution is delegated to the shared tooltip-label-resolver.
 */

import type { ContentPlan, ContentPlanStep } from './tooltip-content-planner.js';
import type {
  TooltipMessage,
  SelectMessage,
  PlaceMessage,
  MoveMessage,
  PayMessage,
  GainMessage,
  TransferMessage,
  ShiftMessage,
  ActivateMessage,
  DeactivateMessage,
  RemoveMessage,
  CreateMessage,
  DestroyMessage,
  RevealMessage,
  DrawMessage,
  ShuffleMessage,
  SetMessage,
  ChooseMessage,
  RollMessage,
  ModifierMessage,
  BlockerMessage,
  PhaseMessage,
  GrantMessage,
  ConcealMessage,
  SummaryMessage,
} from './tooltip-ir.js';
import type { ContentStep, ContentModifier, RealizedLine, RuleCard } from './tooltip-rule-card.js';
import type { VerbalizationDef } from './verbalization-types.js';
import type { LabelContext } from './tooltip-label-resolver.js';
import { buildLabelContext, resolveLabel, resolveSentencePlan } from './tooltip-label-resolver.js';
import { humanizeConditionWithLabels } from './tooltip-modifier-humanizer.js';

// ---------------------------------------------------------------------------
// Template functions — one per message kind
// ---------------------------------------------------------------------------

const singularTarget = (target: string): string => {
  if (target === 'spaces') return 'space';
  if (target === 'zones') return 'zone';
  if (target === 'items') return 'item';
  if (target === 'players') return 'player';
  if (target === 'values') return 'value';
  if (target === 'markers') return 'marker';
  if (target === 'rows') return 'row';
  if (target === 'options') return 'option';
  if (target === 'tokens') return 'token';
  return target;
};

const resolveSelectFilter = (msg: SelectMessage, ctx: LabelContext, count?: number): string | undefined => {
  // Prefer re-rendered condition from raw AST when available
  if (msg.conditionAST !== undefined) return humanizeConditionWithLabels(msg.conditionAST, ctx, count);
  // Fall back to pre-rendered filter string with label resolution
  if (msg.filter !== undefined) return resolveLabel(msg.filter, ctx, count);
  return undefined;
};

const realizeSelect = (msg: SelectMessage, ctx: LabelContext): string => {
  if (msg.optionHints !== undefined && msg.optionHints.length > 0 && msg.optionHints.length <= 5) {
    const options = msg.optionHints.map((h) => resolveLabel(h, ctx)).join(', ');
    return `Choose from: ${options}`;
  }

  const targetLabel = resolveSelectFilter(msg, ctx) ?? msg.target;

  if (msg.bounds === undefined) {
    return `Select ${targetLabel}`;
  }

  const { min, max } = msg.bounds;

  const hasFilter = msg.conditionAST !== undefined || msg.filter !== undefined;

  if (min === max) {
    const label = hasFilter
      ? (resolveSelectFilter(msg, ctx, min) ?? msg.target)
      : min === 1 ? singularTarget(msg.target) : msg.target;
    return `Select ${min} ${label}`;
  }

  if (min === 0) {
    const label = max === 1
      ? (hasFilter ? (resolveSelectFilter(msg, ctx, 1) ?? singularTarget(msg.target)) : singularTarget(msg.target))
      : targetLabel;
    return `Select up to ${max} ${label}`;
  }

  return `Select ${min}-${max} ${targetLabel}`;
};

const realizePlace = (msg: PlaceMessage, ctx: LabelContext): string => {
  const token = resolveLabel(msg.tokenFilter, ctx);
  const zone = resolveLabel(msg.targetZone, ctx);
  return `Place ${token} in ${zone}`;
};

const realizeMove = (msg: MoveMessage, ctx: LabelContext): string => {
  const token = resolveLabel(msg.tokenFilter, ctx);
  if (msg.variant === 'adjacent') {
    return `Move ${token} from adjacent spaces`;
  }
  const from = resolveLabel(msg.fromZone, ctx);
  const to = resolveLabel(msg.toZone, ctx);
  return `Move ${token} from ${from} to ${to}`;
};

const realizePay = (msg: PayMessage, ctx: LabelContext): string => {
  const resource = resolveLabel(msg.resource, ctx, msg.amount);
  return `Pay ${msg.amount} ${resource}`;
};

const realizeGain = (msg: GainMessage, ctx: LabelContext): string => {
  const resource = resolveLabel(msg.resource, ctx, msg.amount);
  return `Gain ${msg.amount} ${resource}`;
};

const realizeTransfer = (msg: TransferMessage, ctx: LabelContext): string => {
  const resource = resolveLabel(msg.resource, ctx, msg.amount);
  const from = resolveLabel(msg.from, ctx);
  const to = resolveLabel(msg.to, ctx);
  const amount = msg.amountExpr !== undefined ? msg.amountExpr : String(msg.amount);
  return `Transfer ${amount} ${resource} from ${from} to ${to}`;
};

const realizeShift = (msg: ShiftMessage, ctx: LabelContext): string => {
  const deltaStr = msg.deltaExpr !== undefined ? msg.deltaExpr : (msg.amount >= 0 ? `+${msg.amount}` : String(msg.amount));
  const plan = resolveSentencePlan('shiftMarker', msg.marker, deltaStr, ctx);
  if (plan !== undefined) return plan;

  const marker = resolveLabel(msg.marker, ctx);
  return `Shift ${marker} by ${deltaStr}`;
};

const realizeActivate = (msg: ActivateMessage, ctx: LabelContext): string => {
  const token = resolveLabel(msg.tokenFilter, ctx);
  const zone = resolveLabel(msg.zone, ctx);
  return `Activate ${token} in ${zone}`;
};

const realizeDeactivate = (msg: DeactivateMessage, ctx: LabelContext): string => {
  const token = resolveLabel(msg.tokenFilter, ctx);
  const zone = resolveLabel(msg.zone, ctx);
  return `Deactivate ${token} in ${zone}`;
};

const realizeRemove = (msg: RemoveMessage, ctx: LabelContext): string => {
  const token = resolveLabel(msg.tokenFilter, ctx);
  const from = resolveLabel(msg.fromZone, ctx);
  const dest = resolveLabel(msg.destination, ctx);
  const budget = msg.budget !== undefined ? ` (up to ${msg.budget})` : '';
  return `Remove ${token} from ${from} to ${dest}${budget}`;
};

const realizeCreate = (msg: CreateMessage, ctx: LabelContext): string => {
  const token = resolveLabel(msg.tokenFilter, ctx);
  const zone = resolveLabel(msg.targetZone, ctx);
  return `Create ${token} in ${zone}`;
};

const realizeDestroy = (msg: DestroyMessage, ctx: LabelContext): string => {
  const token = resolveLabel(msg.tokenFilter, ctx);
  const from = resolveLabel(msg.fromZone, ctx);
  return `Destroy ${token} from ${from}`;
};

const realizeReveal = (msg: RevealMessage, ctx: LabelContext): string => {
  const target = resolveLabel(msg.target, ctx);
  return `Reveal ${target}`;
};

const realizeDraw = (msg: DrawMessage, ctx: LabelContext): string => {
  const source = resolveLabel(msg.source, ctx);
  return `Draw ${msg.count} from ${source}`;
};

const realizeShuffle = (msg: ShuffleMessage, ctx: LabelContext): string => {
  const target = resolveLabel(msg.target, ctx);
  return `Shuffle ${target}`;
};

const realizeSet = (msg: SetMessage, ctx: LabelContext): string => {
  const plan = resolveSentencePlan('setVar', msg.target, msg.value, ctx);
  if (plan !== undefined) return plan;

  const target = resolveLabel(msg.target, ctx);
  if (msg.toggle === true) {
    return `Toggle ${target}`;
  }
  return `Set ${target} to ${msg.value}`;
};

const realizeChoose = (msg: ChooseMessage, ctx: LabelContext): string => {
  const options = msg.options.map((o) => resolveLabel(o, ctx)).join(', ');
  const suffix = msg.optional === true ? ' (optional)' : '';
  return `Choose: ${options}${suffix}`;
};

const realizeRoll = (msg: RollMessage): string =>
  `Roll ${msg.range.min}-${msg.range.max}`;

const realizeModifier = (msg: ModifierMessage): string => {
  if (msg.description.length === 0) return msg.condition;
  if (msg.description === msg.condition) return msg.description;
  return `${msg.condition}: ${msg.description}`;
};

const realizeBlocker = (msg: BlockerMessage): string =>
  msg.reason;

const realizePhase = (msg: PhaseMessage, ctx: LabelContext): string => {
  const toPhase = resolveLabel(msg.toPhase, ctx);
  return `Advance to ${toPhase} phase`;
};

const realizeGrant = (msg: GrantMessage, ctx: LabelContext): string => {
  const operation = resolveLabel(msg.operation, ctx);
  const player = resolveLabel(msg.targetPlayer, ctx);
  return `Grant free ${operation} to ${player}`;
};

const realizeConceal = (msg: ConcealMessage, ctx: LabelContext): string => {
  const target = resolveLabel(msg.target, ctx);
  return `Conceal ${target}`;
};

const realizeSummary = (msg: SummaryMessage): string => msg.text;

// ---------------------------------------------------------------------------
// Message dispatch
// ---------------------------------------------------------------------------

const realizeMessage = (msg: TooltipMessage, ctx: LabelContext): string => {
  switch (msg.kind) {
    case 'select': return realizeSelect(msg, ctx);
    case 'place': return realizePlace(msg, ctx);
    case 'move': return realizeMove(msg, ctx);
    case 'pay': return realizePay(msg, ctx);
    case 'gain': return realizeGain(msg, ctx);
    case 'transfer': return realizeTransfer(msg, ctx);
    case 'shift': return realizeShift(msg, ctx);
    case 'activate': return realizeActivate(msg, ctx);
    case 'deactivate': return realizeDeactivate(msg, ctx);
    case 'remove': return realizeRemove(msg, ctx);
    case 'create': return realizeCreate(msg, ctx);
    case 'destroy': return realizeDestroy(msg, ctx);
    case 'reveal': return realizeReveal(msg, ctx);
    case 'draw': return realizeDraw(msg, ctx);
    case 'shuffle': return realizeShuffle(msg, ctx);
    case 'set': return realizeSet(msg, ctx);
    case 'choose': return realizeChoose(msg, ctx);
    case 'roll': return realizeRoll(msg);
    case 'modifier': return realizeModifier(msg);
    case 'blocker': return realizeBlocker(msg);
    case 'phase': return realizePhase(msg, ctx);
    case 'grant': return realizeGrant(msg, ctx);
    case 'conceal': return realizeConceal(msg, ctx);
    case 'summary': return realizeSummary(msg);
    case 'suppressed': return '';
  }
};

// ---------------------------------------------------------------------------
// Step conversion
// ---------------------------------------------------------------------------

const resolveStepHeader = (
  header: string,
  ctx: LabelContext,
  profileId: string | undefined,
): { readonly resolvedHeader: string; readonly description?: string } => {
  if (ctx.verbalization !== undefined && profileId !== undefined) {
    const profileDescs = ctx.verbalization.stageDescriptions[profileId];
    if (profileDescs !== undefined) {
      const entry = profileDescs[header];
      if (entry !== undefined) {
        return {
          resolvedHeader: entry.label,
          ...(entry.description !== undefined ? { description: entry.description } : {}),
        };
      }
    }
  }

  if (ctx.verbalization !== undefined) {
    const stageLabel = ctx.verbalization.stages[header];
    if (stageLabel !== undefined) {
      return { resolvedHeader: stageLabel };
    }
  }

  return { resolvedHeader: resolveLabel(header, ctx) };
};

const realizeStep = (
  planStep: ContentPlanStep,
  ctx: LabelContext,
  profileId: string | undefined,
): ContentStep => {
  const lines: RealizedLine[] = [];
  for (const m of planStep.messages) {
    const text = realizeMessage(m, ctx);
    if (text.length > 0) {
      lines.push({ text, astPath: m.astPath });
    }
  }
  const subSteps = planStep.subSteps !== undefined
    ? planStep.subSteps.map((s) => realizeStep(s, ctx, profileId))
    : undefined;
  const { resolvedHeader, description } = resolveStepHeader(planStep.header, ctx, profileId);
  return {
    stepNumber: planStep.stepNumber,
    header: resolvedHeader,
    ...(description !== undefined ? { description } : {}),
    lines,
    ...(subSteps !== undefined && subSteps.length > 0 ? { subSteps } : {}),
  };
};

// ---------------------------------------------------------------------------
// Synopsis generation
// ---------------------------------------------------------------------------

const realizeSynopsis = (
  plan: ContentPlan,
  ctx: LabelContext,
): string => {
  const label = resolveLabel(plan.actionLabel, ctx);
  if (plan.synopsisSource !== undefined) {
    const detail = realizeMessage(plan.synopsisSource, ctx);
    return `${label} — ${detail}`;
  }
  return label;
};

// ---------------------------------------------------------------------------
// Modifier conversion
// ---------------------------------------------------------------------------

const realizeModifiers = (
  plan: ContentPlan,
): readonly ContentModifier[] =>
  plan.modifiers.map((m) => ({
    condition: m.condition,
    description: m.description,
    ...(m.conditionAST !== undefined ? { conditionAST: m.conditionAST } : {}),
  }));

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const realizeContentPlan = (
  plan: ContentPlan,
  verbalization: VerbalizationDef | undefined,
  profileId?: string,
): RuleCard => {
  const ctx = buildLabelContext(verbalization);

  return {
    synopsis: realizeSynopsis(plan, ctx),
    steps: plan.steps.map((s) => realizeStep(s, ctx, profileId)),
    modifiers: realizeModifiers(plan),
  };
};
