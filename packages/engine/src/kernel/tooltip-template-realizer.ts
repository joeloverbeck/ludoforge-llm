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
import { humanizeIdentifier } from './tooltip-humanizer.js';

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

/** Sentinel threshold: bounds >= this value mean "unlimited". */
const UNLIMITED_SENTINEL = 99;

const isUnlimited = (n: number): boolean => n >= UNLIMITED_SENTINEL;

const realizeSelect = (msg: SelectMessage, ctx: LabelContext): string => {
  // When optionHints exist and there are few options, show them as choices
  if (msg.optionHints !== undefined && msg.optionHints.length > 0 && msg.optionHints.length <= 5) {
    const options = msg.optionHints.map((h) => resolveLabel(h, ctx)).join(', ');
    // When bounds are present with 'items' target, include hints as context
    if (msg.bounds !== undefined && msg.target === 'items') {
      const { min, max } = msg.bounds;
      if (min === 0 && max === 0) return '';
      if (isUnlimited(max)) return `Select from: ${options}`;
      if (min === max) return `Select ${min} from: ${options}`;
      if (min === 0) return `Select up to ${max} from: ${options}`;
      if (min > max) return `Select ${min} from: ${options}`;
      return `Select ${min}-${max} from: ${options}`;
    }
    return `Choose from: ${options}`;
  }

  // Use choiceBranchLabel when target is generic 'items' and a branch label is available
  const branchResolved = msg.target === 'items' && msg.choiceBranchLabel !== undefined
    ? resolveLabel(msg.choiceBranchLabel, ctx)
    : undefined;

  // When target is 'items' and optionHints exist (>5 options), append hint summary
  const hintSuffix = msg.target === 'items'
    && branchResolved === undefined
    && msg.optionHints !== undefined
    && msg.optionHints.length > 5
    ? ` from: ${msg.optionHints.slice(0, 5).map((h) => resolveLabel(h, ctx)).join(', ')}...`
    : undefined;

  const targetLabel = branchResolved ?? resolveSelectFilter(msg, ctx) ?? msg.target;

  if (msg.bounds === undefined) {
    return `Select ${targetLabel}${hintSuffix ?? ''}`;
  }

  const { min, max } = msg.bounds;

  // Suppress zero-selection lines (select 0 of 0 is a no-op)
  if (min === 0 && max === 0) return '';

  const hasFilter = msg.conditionAST !== undefined || msg.filter !== undefined;
  const hasContext = branchResolved !== undefined || hasFilter;

  // Unlimited upper bound: omit the count
  if (isUnlimited(max)) {
    return `Select ${targetLabel}${hintSuffix ?? ''}`;
  }

  // Inverted range (min > max): use min as single value
  if (min > max) {
    const label = hasContext
      ? (branchResolved ?? resolveSelectFilter(msg, ctx, min) ?? msg.target)
      : min === 1 ? singularTarget(msg.target) : msg.target;
    return `Select ${min} ${label}${hintSuffix ?? ''}`;
  }

  if (min === max) {
    const label = hasContext
      ? (branchResolved ?? resolveSelectFilter(msg, ctx, min) ?? msg.target)
      : min === 1 ? singularTarget(msg.target) : msg.target;
    return `Select ${min} ${label}${hintSuffix ?? ''}`;
  }

  if (min === 0) {
    const label = max === 1
      ? (hasContext ? (branchResolved ?? resolveSelectFilter(msg, ctx, 1) ?? singularTarget(msg.target)) : singularTarget(msg.target))
      : targetLabel;
    return `Select up to ${max} ${label}${hintSuffix ?? ''}`;
  }

  return `Select ${min}-${max} ${targetLabel}${hintSuffix ?? ''}`;
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

/**
 * Detect kebab-case tokens (3+ segments) and humanize them.
 * Matches patterns like "Cap-assault-cobras-shaded-cost", "Sweep-loc-hop",
 * "Place-from-available-or-map" but avoids short hyphenated words.
 */
const KEBAB_PATTERN = /\b[A-Za-z]+-[a-z]+-[a-z]+(?:-[a-z]+)*/g;

const humanizeKebabTokens = (text: string): string =>
  text.replace(KEBAB_PATTERN, (match) => humanizeIdentifier(match));

/** Detect $variableName references and humanize them (strip $ and title-case). */
const DOLLAR_VAR_PATTERN = /\$([a-zA-Z_]\w*)/g;

const humanizeDollarVars = (text: string): string =>
  text.replace(DOLLAR_VAR_PATTERN, (_match, name: string) => humanizeIdentifier(name));

const realizeModifier = (msg: ModifierMessage): string => {
  const condition = humanizeKebabTokens(msg.condition);
  const description = humanizeKebabTokens(msg.description);
  // When description is empty (no pre-authored effect text), render just the condition
  if (description.length === 0) return condition;
  // When description duplicates the condition, render just once
  if (description === condition) return description;
  // Render "condition: effect description" (no "If " prefix — condition is already clean)
  return `${condition}: ${description}`;
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
    const raw = realizeMessage(m, ctx);
    if (raw.length > 0) {
      // Post-realization pass: humanize $variables and kebab-case tokens
      const text = humanizeKebabTokens(humanizeDollarVars(raw));
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
  if (plan.authoredSynopsis !== undefined) {
    return `${label} — ${plan.authoredSynopsis}`;
  }
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
