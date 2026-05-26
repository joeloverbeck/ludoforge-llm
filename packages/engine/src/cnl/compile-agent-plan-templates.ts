import type { Diagnostic } from '../kernel/diagnostics.js';
import type {
  CompiledAgentDependencyRefs,
  CompiledPlanRoleConstraint,
  CompiledPlanTemplate,
  SelectorId,
} from '../kernel/types.js';
import type { GameSpecPlanTemplateDef } from './game-spec-doc.js';
import { CNL_COMPILER_DIAGNOSTIC_CODES } from './compiler-diagnostic-codes.js';
import { compileRoleSelector } from './compile-agent-role-selectors.js';

export interface CompilePlanTemplateOptions {
  readonly templateId: string;
  readonly def: GameSpecPlanTemplateDef;
  readonly diagnostics: Diagnostic[];
  readonly compileSelector: (selectorId: string) => Parameters<typeof compileRoleSelector>[2] | null;
}

export function compilePlanTemplateDefinition({
  templateId,
  def,
  diagnostics,
  compileSelector,
}: CompilePlanTemplateOptions): CompiledPlanTemplate | null {
  const basePath = `doc.agents.library.planTemplates.${templateId}`;
  let failed = false;
  const roles: Record<string, CompiledPlanTemplate['roles'][string]> = {};
  const dependencyRefs: CompiledAgentDependencyRefs[] = [];

  for (const roleName of Object.keys(def.roles ?? {}).sort()) {
    const role = def.roles[roleName];
    if (role === undefined) {
      continue;
    }
    const selector = compileSelector(role.selector);
    if (selector === null) {
      failed = true;
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PROFILE_USE_UNKNOWN_ID,
        path: `${basePath}.roles.${roleName}.selector`,
        severity: 'error',
        message: `Plan template "${templateId}" role "${roleName}" references unknown selector "${role.selector}".`,
        suggestion: 'Reference a selector declared in doc.agents.library.selectors.',
      });
      continue;
    }
    dependencyRefs.push(selector.dependencies);
    roles[roleName] = {
      selectorId: role.selector as SelectorId,
      required: role.required ?? true,
      constraints: lowerRoleConstraints(role.constraints ?? []),
      selector: compileRoleSelector(roleName, role.selector, selector),
    };
  }

  const steps = (def.steps ?? []).map((step) => ({
    label: step.label,
    role: step.role,
    match: {
      decisionKind: step.match.decisionKind,
      targetKind: step.match.targetKind,
      decisionPath: step.match.decisionPath,
      ...(step.match.actionTag === undefined ? {} : { actionTag: step.match.actionTag }),
      ...(step.match.stageIndex === undefined ? {} : { stageIndex: step.match.stageIndex }),
    },
  }));

  if (Object.keys(roles).length === 0 || steps.length === 0) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
      path: basePath,
      severity: 'error',
      message: `Plan template "${templateId}" must declare at least one role and one step.`,
      suggestion: 'Declare roles and steps for the composed turn shape.',
    });
    failed = true;
  }

  const caps = lowerPlanCaps(def.caps, `${basePath}.caps`, templateId, diagnostics);
  if (caps === null) {
    failed = true;
  }

  if (failed || caps === null) {
    return null;
  }

  return {
    traceLabel: def.traceLabel ?? templateId,
    root: {
      actionTags: [...(def.root.actionTags ?? [])].sort(),
      actionIds: [...(def.root.actionIds ?? [])].sort(),
      ...(def.root.compound === undefined ? {} : {
        compound: {
          specialTags: [...(def.root.compound.specialTags ?? [])].sort(),
          timing: def.root.compound.timing ?? 'during',
          ...(def.root.compound.interruptAfterStage === undefined
            ? {}
            : { interruptAfterStage: def.root.compound.interruptAfterStage }),
        },
      }),
    },
    roles,
    steps,
    caps,
    ...(def.postureHook === undefined ? {} : { postureHook: def.postureHook }),
    fallback: {
      ...(def.fallback?.ifSpecialUnavailable === undefined ? {} : {
        ifSpecialUnavailable: def.fallback.ifSpecialUnavailable,
      }),
      ...(def.fallback?.ifRoleTargetUnavailable === undefined ? {} : {
        ifRoleTargetUnavailable: def.fallback.ifRoleTargetUnavailable,
      }),
      ...(def.fallback?.ifPreviewUnavailable === undefined ? {} : {
        ifPreviewUnavailable: def.fallback.ifPreviewUnavailable,
      }),
    },
    dependencies: mergePlanDependencies(dependencyRefs),
  };
}

function lowerPlanCaps(
  caps: GameSpecPlanTemplateDef['caps'] | undefined,
  path: string,
  templateId: string,
  diagnostics: Diagnostic[],
): CompiledPlanTemplate['caps'] | null {
  if (caps === undefined || typeof caps !== 'object' || caps === null) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
      path,
      severity: 'error',
      message: `Plan template "${templateId}" must declare caps with capClass and maxSteps.`,
      suggestion: 'Declare caps: { capClass: "standard256", maxSteps: <positive integer> } on the plan template.',
    });
    return null;
  }
  return {
    capClass: String(caps.capClass),
    maxSteps: caps.maxSteps,
  };
}

function lowerRoleConstraints(
  constraints: readonly NonNullable<GameSpecPlanTemplateDef['roles'][string]['constraints']>[number][],
): readonly CompiledPlanRoleConstraint[] {
  const lowered: CompiledPlanRoleConstraint[] = [];
  for (const constraint of constraints) {
    if ('notEqual' in constraint) {
      lowered.push({ kind: 'notEqual', role: normalizeRoleRef(constraint.notEqual) });
    } else if ('locatedIn' in constraint && isLocatedInPayload(constraint.locatedIn)) {
      lowered.push({
        kind: 'locatedIn',
        role: normalizeRoleRef(constraint.locatedIn.role),
        container: normalizeZoneOrRoleRef(constraint.locatedIn.container),
      });
    } else if (
      'distinctOriginDestination' in constraint
      && isDistinctOriginDestinationPayload(constraint.distinctOriginDestination)
    ) {
      lowered.push({
        kind: 'distinctOriginDestination',
        origin: normalizeRoleRef(constraint.distinctOriginDestination.origin),
        destination: normalizeRoleRef(constraint.distinctOriginDestination.destination),
      });
    } else if ('reachable' in constraint && isReachablePayload(constraint.reachable)) {
      lowered.push({
        kind: 'reachable',
        from: normalizeRoleRef(constraint.reachable.from),
        to: normalizeRoleRef(constraint.reachable.to),
        ...(constraint.reachable.via === undefined ? {} : { via: normalizeRouteClassRef(constraint.reachable.via) }),
        ...(constraint.reachable.maxHops === undefined ? {} : { maxHops: constraint.reachable.maxHops }),
      });
    } else if ('adjacent' in constraint && isAdjacentPayload(constraint.adjacent)) {
      lowered.push({
        kind: 'adjacent',
        a: normalizeRoleRef(constraint.adjacent.a),
        b: normalizeRoleRef(constraint.adjacent.b),
      });
    }
  }
  return lowered;
}

function normalizeRoleRef(ref: string): string {
  return ref.startsWith('role.') ? ref.slice('role.'.length) : ref;
}

function normalizeZoneOrRoleRef(ref: string): string {
  if (ref.startsWith('zone.')) return ref.slice('zone.'.length);
  return normalizeRoleRef(ref);
}

function normalizeRouteClassRef(ref: string): string {
  return ref.startsWith('routeClass.') ? ref.slice('routeClass.'.length) : ref;
}

function isLocatedInPayload(value: unknown): value is { readonly role: string; readonly container: string } {
  return isRecord(value) && typeof value.role === 'string' && typeof value.container === 'string';
}

function isDistinctOriginDestinationPayload(
  value: unknown,
): value is { readonly origin: string; readonly destination: string } {
  return isRecord(value) && typeof value.origin === 'string' && typeof value.destination === 'string';
}

function isReachablePayload(
  value: unknown,
): value is { readonly from: string; readonly to: string; readonly via?: string; readonly maxHops?: number } {
  return isRecord(value)
    && typeof value.from === 'string'
    && typeof value.to === 'string'
    && (value.via === undefined || typeof value.via === 'string')
    && (value.maxHops === undefined || typeof value.maxHops === 'number');
}

function isAdjacentPayload(value: unknown): value is { readonly a: string; readonly b: string } {
  return isRecord(value) && typeof value.a === 'string' && typeof value.b === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergePlanDependencies(
  dependencies: readonly CompiledAgentDependencyRefs[],
): CompiledAgentDependencyRefs {
  const selectors = uniqueSorted(dependencies.flatMap((entry) => entry.selectors ?? []));
  const strategyModules = uniqueSorted(dependencies.flatMap((entry) => entry.strategyModules ?? []));
  const planTemplates = uniqueSorted(dependencies.flatMap((entry) => entry.planTemplates ?? []));
  const guardrails = uniqueSorted(dependencies.flatMap((entry) => entry.guardrails ?? []));
  const turnShapeEvaluators = uniqueSorted(dependencies.flatMap((entry) => entry.turnShapeEvaluators ?? []));
  const postureEvaluators = uniqueSorted(dependencies.flatMap((entry) => entry.postureEvaluators ?? []));
  return {
    parameters: uniqueSorted(dependencies.flatMap((entry) => entry.parameters)),
    stateFeatures: uniqueSorted(dependencies.flatMap((entry) => entry.stateFeatures)),
    candidateFeatures: uniqueSorted(dependencies.flatMap((entry) => entry.candidateFeatures)),
    aggregates: uniqueSorted(dependencies.flatMap((entry) => entry.aggregates)),
    ...(selectors.length === 0 ? {} : { selectors }),
    ...(strategyModules.length === 0 ? {} : { strategyModules }),
    ...(planTemplates.length === 0 ? {} : { planTemplates }),
    ...(guardrails.length === 0 ? {} : { guardrails }),
    ...(turnShapeEvaluators.length === 0 ? {} : { turnShapeEvaluators }),
    ...(postureEvaluators.length === 0 ? {} : { postureEvaluators }),
    strategicConditions: uniqueSorted(dependencies.flatMap((entry) => entry.strategicConditions)),
  };
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}
