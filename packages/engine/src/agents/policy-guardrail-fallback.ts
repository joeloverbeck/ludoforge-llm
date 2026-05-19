import type {
  AgentPolicyCatalog,
  GameDef,
  Move,
  PolicyGuardrailTrace,
} from '../kernel/types.js';
import type { GuardrailDispatchResult, GuardrailEvaluationCandidate } from './policy-guardrail-eval.js';

interface GuardrailFallbackCandidate {
  readonly actionId: string;
  readonly move: Move;
}

export type GuardrailFallbackResolution<TCandidate extends GuardrailFallbackCandidate> =
  | {
      readonly kind: 'notApplicable';
      readonly activeCandidates: readonly TCandidate[];
      readonly trace?: PolicyGuardrailTrace;
    }
  | {
      readonly kind: 'constructible';
      readonly activeCandidates: readonly TCandidate[];
      readonly trace?: PolicyGuardrailTrace;
    }
  | {
      readonly kind: 'notConstructible';
      readonly guardrailId: string;
      readonly actionId: string;
      readonly trace?: PolicyGuardrailTrace;
    };

const findConstructiblePassFallbackCandidate = <TCandidate extends GuardrailFallbackCandidate>(
  def: GameDef,
  candidates: readonly TCandidate[],
  actionId: string,
): TCandidate | undefined => {
  const action = def.actions.find((entry) => entry.id === actionId);
  if (action?.tags?.includes('pass') !== true || action.params.length !== 0) {
    return undefined;
  }
  return candidates.find((candidate) =>
    candidate.actionId === actionId
    && Object.keys(candidate.move.params).length === 0);
};

const withAllPrunedFallbackTrace = (
  trace: PolicyGuardrailTrace | undefined,
  fallback: NonNullable<PolicyGuardrailTrace['allPrunedFallback']>,
): PolicyGuardrailTrace => ({
  fired: trace?.fired ?? [],
  notFiredTop: trace?.notFiredTop ?? [],
  allPrunedFallback: fallback,
});

export function resolveAllPrunedGuardrailFallback<TCandidate extends GuardrailEvaluationCandidate & GuardrailFallbackCandidate>(input: {
  readonly def: GameDef;
  readonly catalog: AgentPolicyCatalog;
  readonly allCandidates: readonly TCandidate[];
  readonly dispatch: GuardrailDispatchResult<TCandidate>;
  readonly collectDiagnostics: boolean;
}): GuardrailFallbackResolution<TCandidate> {
  if (input.dispatch.activeCandidates.length > 0 || input.dispatch.allPrunedGuardrailId === undefined) {
    return {
      kind: 'notApplicable',
      activeCandidates: input.dispatch.activeCandidates,
      ...(input.dispatch.trace === undefined ? {} : { trace: input.dispatch.trace }),
    };
  }

  const guardrailId = input.dispatch.allPrunedGuardrailId;
  const fallbackSpec = input.catalog.compiled.guardrails?.[guardrailId]?.onAllPruned;
  if (fallbackSpec === undefined) {
    return {
      kind: 'notApplicable',
      activeCandidates: input.dispatch.activeCandidates,
      ...(input.dispatch.trace === undefined ? {} : { trace: input.dispatch.trace }),
    };
  }

  const fallbackCandidate = findConstructiblePassFallbackCandidate(input.def, input.allCandidates, fallbackSpec.actionId);
  const trace = input.collectDiagnostics
    ? withAllPrunedFallbackTrace(input.dispatch.trace, {
      guardrailId,
      actionId: fallbackSpec.actionId,
      traceLabel: fallbackSpec.traceLabel,
      ...(fallbackCandidate === undefined ? { constructibilityFailure: true as const } : {}),
    })
    : undefined;
  if (fallbackCandidate === undefined) {
    return {
      kind: 'notConstructible',
      guardrailId,
      actionId: fallbackSpec.actionId,
      ...(trace === undefined ? {} : { trace }),
    };
  }
  return {
    kind: 'constructible',
    activeCandidates: [fallbackCandidate],
    ...(trace === undefined ? {} : { trace }),
  };
}
