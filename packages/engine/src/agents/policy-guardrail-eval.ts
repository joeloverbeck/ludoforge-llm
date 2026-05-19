import type {
  AgentPolicyCatalog,
  GuardrailDef,
  GuardrailOnUnavailable,
  PolicyGuardrailTrace,
} from '../kernel/types.js';
import {
  PolicyEvaluationContext,
  type PolicyEvaluationCandidate,
  PolicyRuntimeError,
} from './policy-evaluation-core.js';

interface GuardrailEvaluationCandidate extends PolicyEvaluationCandidate {
  readonly prunedBy: string[];
}

interface GuardrailDispatchTraceBuilder {
  readonly fired: Map<string, PolicyGuardrailTrace['fired'][number]>;
  readonly notFired: Map<string, PolicyGuardrailTrace['notFiredTop'][number]>;
}

export interface GuardrailDispatchResult<TCandidate extends GuardrailEvaluationCandidate> {
  readonly activeCandidates: TCandidate[];
  readonly penaltiesByStableMoveKey: ReadonlyMap<string, number>;
  readonly trace?: PolicyGuardrailTrace;
}

const createGuardrailTraceBuilder = (): GuardrailDispatchTraceBuilder => ({
  fired: new Map(),
  notFired: new Map(),
});

const guardrailTrace = (builder: GuardrailDispatchTraceBuilder): PolicyGuardrailTrace | undefined => {
  if (builder.fired.size === 0 && builder.notFired.size === 0) {
    return undefined;
  }
  return {
    fired: [...builder.fired.values()].sort((left, right) => left.id.localeCompare(right.id)),
    notFiredTop: [...builder.notFired.values()].sort((left, right) => left.id.localeCompare(right.id)),
  };
};

const recordGuardrailFired = (
  builder: GuardrailDispatchTraceBuilder,
  guardrailId: string,
  guardrail: GuardrailDef,
  status: PolicyGuardrailTrace['fired'][number]['status'],
  penalty?: number,
  onUnavailable?: GuardrailOnUnavailable,
): void => {
  if (builder.fired.has(guardrailId)) {
    return;
  }
  builder.notFired.delete(guardrailId);
  builder.fired.set(guardrailId, {
    id: guardrailId,
    traceLabel: guardrail.traceLabel,
    severity: guardrail.severity,
    ...(penalty === undefined ? {} : { penalty }),
    status,
    ...(onUnavailable === undefined ? {} : { onUnavailable }),
  });
};

const recordGuardrailNotFired = (
  builder: GuardrailDispatchTraceBuilder,
  guardrailId: string,
  reason: PolicyGuardrailTrace['notFiredTop'][number]['reason'],
  onUnavailable?: GuardrailOnUnavailable,
): void => {
  if (builder.fired.has(guardrailId) || builder.notFired.has(guardrailId)) {
    return;
  }
  builder.notFired.set(guardrailId, {
    id: guardrailId,
    reason,
    ...(onUnavailable === undefined ? {} : { onUnavailable }),
  });
};

const guardrailScopesCurrentDecision = (guardrail: GuardrailDef): boolean => guardrail.scopes.includes('move');

const coerceGuardrailPenalty = (
  guardrailId: string,
  guardrail: GuardrailDef,
  evaluation: PolicyEvaluationContext,
  candidate: PolicyEvaluationCandidate | undefined,
): number => {
  if (guardrail.penalty === undefined) {
    return 0;
  }
  const value = evaluation.evaluateCompiledExpr(guardrail.penalty, candidate);
  if (typeof value !== 'number' || value < 0) {
    throw new PolicyRuntimeError({
      code: 'RUNTIME_EVALUATION_ERROR',
      message: `Guardrail "${guardrailId}" demote penalty did not evaluate to a non-negative number.`,
      detail: { guardrailId },
    });
  }
  return value;
};

export function dispatchGuardrails<TCandidate extends GuardrailEvaluationCandidate>(input: {
  readonly profile: AgentPolicyCatalog['profiles'][string];
  readonly catalog: AgentPolicyCatalog;
  readonly evaluation: PolicyEvaluationContext;
  readonly activeCandidates: readonly TCandidate[];
  readonly collectDiagnostics: boolean;
}): GuardrailDispatchResult<TCandidate> {
  let activeCandidates = [...input.activeCandidates];
  const penaltiesByStableMoveKey = new Map<string, number>();
  const traceBuilder = createGuardrailTraceBuilder();

  for (const guardrailId of input.profile.use.guardrails ?? []) {
    const guardrail = input.catalog.compiled.guardrails?.[guardrailId];
    if (guardrail === undefined) {
      throw new PolicyRuntimeError({
        code: 'RUNTIME_EVALUATION_ERROR',
        message: `Unknown guardrail "${guardrailId}".`,
        detail: { guardrailId },
      });
    }
    if (!guardrailScopesCurrentDecision(guardrail)) {
      if (input.collectDiagnostics) {
        recordGuardrailNotFired(traceBuilder, guardrailId, 'scopeFiltered');
      }
      continue;
    }

    const evaluationTargets = guardrail.costClass === 'state'
      ? [undefined]
      : [...activeCandidates];
    let prunedAny = false;

    for (const candidate of evaluationTargets) {
      const rawShouldFire = input.evaluation.evaluateGuardrailWhen(guardrailId, candidate);
      const unavailable = typeof rawShouldFire !== 'boolean';
      const shouldFire = unavailable
        ? guardrail.onUnavailable === 'fire'
        : rawShouldFire;
      const status = unavailable ? 'unavailable' : 'ready';
      const onUnavailable = unavailable ? guardrail.onUnavailable : undefined;
      if (!shouldFire) {
        if (input.collectDiagnostics) {
          recordGuardrailNotFired(
            traceBuilder,
            guardrailId,
            unavailable ? 'previewUnavailable' : 'whenFalse',
            onUnavailable,
          );
        }
        continue;
      }

      switch (guardrail.severity) {
        case 'prune': {
          if (candidate === undefined) {
            activeCandidates.forEach((entry) => entry.prunedBy.push(guardrailId));
            activeCandidates = [];
          } else {
            candidate.prunedBy.push(guardrailId);
            activeCandidates = activeCandidates.filter((entry) => entry.stableMoveKey !== candidate.stableMoveKey);
          }
          prunedAny = true;
          if (input.collectDiagnostics) {
            recordGuardrailFired(traceBuilder, guardrailId, guardrail, status, undefined, onUnavailable);
          }
          break;
        }
        case 'demote': {
          const penalty = coerceGuardrailPenalty(guardrailId, guardrail, input.evaluation, candidate);
          const penalized = candidate === undefined ? activeCandidates : [candidate];
          for (const entry of penalized) {
            penaltiesByStableMoveKey.set(entry.stableMoveKey, (penaltiesByStableMoveKey.get(entry.stableMoveKey) ?? 0) + penalty);
          }
          if (input.collectDiagnostics) {
            recordGuardrailFired(traceBuilder, guardrailId, guardrail, status, penalty, onUnavailable);
          }
          break;
        }
        case 'warn':
        case 'auditOnly':
          if (input.collectDiagnostics) {
            recordGuardrailFired(traceBuilder, guardrailId, guardrail, status, undefined, onUnavailable);
          }
          break;
      }
    }

    if (prunedAny) {
      if (activeCandidates.length === 0) {
        throw new PolicyRuntimeError({
          code: 'PRUNING_RULE_EMPTIED_CANDIDATES',
          message: `Guardrail "${guardrailId}" removed every candidate.`,
          detail: { guardrailId },
        });
      }
      input.evaluation.setCurrentCandidates(activeCandidates);
    }
  }

  const trace = input.collectDiagnostics ? guardrailTrace(traceBuilder) : undefined;
  return {
    activeCandidates,
    penaltiesByStableMoveKey,
    ...(trace === undefined ? {} : { trace }),
  };
}
