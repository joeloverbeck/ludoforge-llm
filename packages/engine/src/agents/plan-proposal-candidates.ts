import type { Decision } from '../kernel/microturn/types.js';
import type { CompiledPlanTemplate, DecisionSurfaceMatch, GameDef, Move } from '../kernel/types.js';
import { toMoveIdentityKey } from '../kernel/move-identity.js';
import type { PolicyEvaluationCandidate } from './policy-evaluation-core.js';
import type { SelectorEvalCandidate } from './policy-selector-eval.js';

export interface PlanProposalRootCandidate {
  readonly decision: Extract<Decision, { readonly kind: 'actionSelection' }>;
  readonly move: Move;
  readonly stableMoveKey: string;
  readonly actionId: string;
  readonly actionTags: readonly string[];
  readonly compoundSpecialActionId?: string;
  readonly compoundSpecialActionTags: readonly string[];
}

export function rootCandidatesFor(
  def: GameDef,
  actionDecisions: readonly Extract<Decision, { readonly kind: 'actionSelection' }>[],
): readonly PlanProposalRootCandidate[] {
  return actionDecisions
    .map((decision) => {
      const move = decision.move;
      if (move === undefined) {
        return null;
      }
      const actionId = String(move.actionId);
      const compoundSpecialActionId = move.compound?.specialActivity.actionId === undefined
        ? undefined
        : String(move.compound.specialActivity.actionId);
      return {
        decision,
        move,
        stableMoveKey: toMoveIdentityKey(def, move),
        actionId,
        actionTags: def.actionTagIndex?.byAction[actionId] ?? [],
        ...(compoundSpecialActionId === undefined ? {} : { compoundSpecialActionId }),
        compoundSpecialActionTags: compoundSpecialActionId === undefined
          ? []
          : (def.actionTagIndex?.byAction[compoundSpecialActionId] ?? []),
      };
    })
    .filter((candidate): candidate is PlanProposalRootCandidate => candidate !== null)
    .sort((left, right) => compareStable(left.stableMoveKey, right.stableMoveKey));
}

export function rootMatchesTemplate(candidate: PlanProposalRootCandidate, template: CompiledPlanTemplate): boolean {
  const ids = new Set(template.root.actionIds.map(String));
  const tags = new Set(template.root.actionTags.map(String));
  const rootMatches = ids.has(candidate.actionId) || candidate.actionTags.some((tag) => tags.has(String(tag)));
  if (!rootMatches) {
    return false;
  }
  if (template.root.compound === undefined) {
    return true;
  }
  if (candidate.compoundSpecialActionId === undefined) {
    return false;
  }
  const specialTags = new Set(template.root.compound.specialTags.map(String));
  return specialTags.has(candidate.compoundSpecialActionId)
    || candidate.compoundSpecialActionTags.some((tag) => specialTags.has(String(tag)));
}

export function decisionSurfaceMatchFor(
  template: CompiledPlanTemplate,
  root: PlanProposalRootCandidate,
): DecisionSurfaceMatch | undefined {
  const expected = template.steps[0]?.match.decisionKind;
  if (expected === undefined) {
    return undefined;
  }
  return expected === root.decision.kind
    ? { kind: 'matched' }
    : { kind: 'mismatched', expected, observed: root.decision.kind };
}

export function selectorCandidateFor(_def: GameDef, root: PlanProposalRootCandidate): SelectorEvalCandidate {
  return {
    stableMoveKey: root.stableMoveKey,
    move: root.move,
    actionId: root.actionId,
  };
}

export function evaluationCandidateFor(root: PlanProposalRootCandidate): PolicyEvaluationCandidate {
  return {
    move: root.move,
    stableMoveKey: root.stableMoveKey,
    actionId: root.actionId,
    previewRefIds: new Set(),
    unknownPreviewRefs: new Map(),
    unknownLookupRefs: new Map(),
    unknownCandidateParamRefs: new Map(),
  };
}

function compareStable(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
