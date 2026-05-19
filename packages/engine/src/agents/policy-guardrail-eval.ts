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
import {
  buildGuardrailTrace,
  type GuardrailNotFiredTraceInput,
  type GuardrailTraceLevel,
} from './policy-guardrail-trace.js';

export interface GuardrailEvaluationCandidate extends PolicyEvaluationCandidate {
  readonly prunedBy: string[];
}

interface GuardrailDispatchTraceBuilder {
  readonly fired: Map<string, PolicyGuardrailTrace['fired'][number]>;
  readonly notFired: Map<string, GuardrailNotFiredTraceInput>;
}

export interface GuardrailDispatchResult<TCandidate extends GuardrailEvaluationCandidate> {
  readonly activeCandidates: TCandidate[];
  readonly penaltiesByStableMoveKey: ReadonlyMap<string, number>;
  readonly refView: GuardrailRefView;
  readonly allPrunedGuardrailId?: string;
  readonly trace?: PolicyGuardrailTrace;
}

export interface GuardrailRefResult {
  readonly fired: boolean;
  readonly severity: GuardrailDef['severity'];
  readonly status: PolicyGuardrailTrace['fired'][number]['status'];
  readonly penalty: number;
  readonly onUnavailable: GuardrailOnUnavailable;
}

export interface GuardrailRefView {
  readonly byGuardrailId: ReadonlyMap<string, {
    readonly state?: GuardrailRefResult;
    readonly byStableMoveKey: ReadonlyMap<string, GuardrailRefResult>;
  }>;
}

const createGuardrailTraceBuilder = (): GuardrailDispatchTraceBuilder => ({
  fired: new Map(),
  notFired: new Map(),
});

const createGuardrailRefResult = (
  guardrail: GuardrailDef,
  fired: boolean,
  status: GuardrailRefResult['status'],
  penalty = 0,
): GuardrailRefResult => ({
  fired,
  severity: guardrail.severity,
  status,
  penalty,
  onUnavailable: guardrail.onUnavailable,
});

const recordGuardrailRefResult = (
  results: Map<string, {
    state?: GuardrailRefResult;
    byStableMoveKey: Map<string, GuardrailRefResult>;
  }>,
  guardrailId: string,
  candidate: PolicyEvaluationCandidate | undefined,
  result: GuardrailRefResult,
): void => {
  const prior = results.get(guardrailId) ?? { byStableMoveKey: new Map() };
  if (candidate === undefined) {
    results.set(guardrailId, { ...prior, state: result });
    return;
  }
  prior.byStableMoveKey.set(candidate.stableMoveKey, result);
  results.set(guardrailId, prior);
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
  guardrail: GuardrailDef,
  reason: PolicyGuardrailTrace['notFiredTop'][number]['reason'],
  onUnavailable?: GuardrailOnUnavailable,
): void => {
  if (builder.fired.has(guardrailId) || builder.notFired.has(guardrailId)) {
    return;
  }
  builder.notFired.set(guardrailId, {
    id: guardrailId,
    severity: guardrail.severity,
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
  readonly traceLevel?: GuardrailTraceLevel;
}): GuardrailDispatchResult<TCandidate> {
  let activeCandidates = [...input.activeCandidates];
  const penaltiesByStableMoveKey = new Map<string, number>();
  const refResults = new Map<string, {
    state?: GuardrailRefResult;
    byStableMoveKey: Map<string, GuardrailRefResult>;
  }>();
  const traceBuilder = createGuardrailTraceBuilder();
  let allPrunedGuardrailId: string | undefined;

  for (const guardrailId of input.profile.use.guardrails ?? []) {
    if (activeCandidates.length === 0) {
      break;
    }
    const guardrail = input.catalog.compiled.guardrails?.[guardrailId];
    if (guardrail === undefined) {
      throw new PolicyRuntimeError({
        code: 'RUNTIME_EVALUATION_ERROR',
        message: `Unknown guardrail "${guardrailId}".`,
        detail: { guardrailId },
      });
    }
    if (!guardrailScopesCurrentDecision(guardrail)) {
      recordGuardrailRefResult(refResults, guardrailId, undefined, createGuardrailRefResult(guardrail, false, 'ready'));
      if (input.collectDiagnostics) {
        recordGuardrailNotFired(traceBuilder, guardrailId, guardrail, 'scopeFiltered');
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
        recordGuardrailRefResult(refResults, guardrailId, candidate, createGuardrailRefResult(guardrail, false, status));
        if (input.collectDiagnostics) {
          recordGuardrailNotFired(
            traceBuilder,
            guardrailId,
            guardrail,
            unavailable ? 'previewUnavailable' : 'whenFalse',
            onUnavailable,
          );
        }
        continue;
      }

      switch (guardrail.severity) {
        case 'prune': {
          recordGuardrailRefResult(refResults, guardrailId, candidate, createGuardrailRefResult(guardrail, true, status));
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
          recordGuardrailRefResult(refResults, guardrailId, candidate, createGuardrailRefResult(guardrail, true, status, penalty));
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
          recordGuardrailRefResult(refResults, guardrailId, candidate, createGuardrailRefResult(guardrail, true, status));
          if (input.collectDiagnostics) {
            recordGuardrailFired(traceBuilder, guardrailId, guardrail, status, undefined, onUnavailable);
          }
          break;
      }
    }

    if (prunedAny) {
      if (activeCandidates.length === 0) {
        allPrunedGuardrailId = guardrailId;
        break;
      }
      input.evaluation.setCurrentCandidates(activeCandidates);
    }
  }

  const trace = input.collectDiagnostics
    ? buildGuardrailTrace({
        fired: traceBuilder.fired.values(),
        notFired: traceBuilder.notFired.values(),
        ...(input.traceLevel === undefined ? {} : { traceLevel: input.traceLevel }),
      })
    : undefined;
  return {
    activeCandidates,
    penaltiesByStableMoveKey,
    refView: { byGuardrailId: refResults },
    ...(allPrunedGuardrailId === undefined ? {} : { allPrunedGuardrailId }),
    ...(trace === undefined ? {} : { trace }),
  };
}
