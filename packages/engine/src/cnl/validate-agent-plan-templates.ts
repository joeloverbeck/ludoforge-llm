import type { Diagnostic } from '../kernel/diagnostics.js';
import { CNL_COMPILER_DIAGNOSTIC_CODES } from './compiler-diagnostic-codes.js';
import { isNonEmptyString, isRecord } from './validate-spec-shared.js';

const PLAN_CAP_CLASS_BUDGETS = { standard256: 256, deep1024: 1024 } as const;
const PLAN_TERMINAL_FALLBACKS = new Set(['primitivePolicy', 'traceOnly']);

export function validatePlanTemplates(library: Record<string, unknown>, diagnostics: Diagnostic[]): void {
  const planTemplates = isRecord(library.planTemplates) ? library.planTemplates : undefined;
  if (planTemplates === undefined) {
    return;
  }
  const selectors = isRecord(library.selectors) ? library.selectors : {};
  const templateIds = new Set(Object.keys(planTemplates));
  const fallbackEdges = new Map<string, readonly string[]>();

  for (const [templateId, templateDef] of Object.entries(planTemplates)) {
    if (!isRecord(templateDef)) {
      continue;
    }
    const templatePath = `doc.agents.library.planTemplates.${templateId}`;
    validatePlanTemplateRoles(templateId, templateDef, templatePath, selectors, diagnostics);
    validatePlanTemplateSteps(templateId, templateDef, templatePath, diagnostics);
    validatePlanTemplateCaps(templateId, templateDef.caps, `${templatePath}.caps`, diagnostics);
    fallbackEdges.set(
      templateId,
      validatePlanTemplateFallbacks(templateId, templateDef.fallback, `${templatePath}.fallback`, templateIds, diagnostics),
    );
  }

  validatePlanFallbackCycles(fallbackEdges, diagnostics);
}

function validatePlanTemplateRoles(
  templateId: string,
  templateDef: Record<string, unknown>,
  templatePath: string,
  selectors: Record<string, unknown>,
  diagnostics: Diagnostic[],
): void {
  const roles = isRecord(templateDef.roles) ? templateDef.roles : {};
  const declaredRoles = new Set(Object.keys(roles));
  const boundRoles = new Set<string>();

  for (const [roleName, roleDef] of Object.entries(roles)) {
    const rolePath = `${templatePath}.roles.${roleName}`;
    if (!isRecord(roleDef)) {
      continue;
    }
    const selectorId = roleDef.selector;
    if (!isNonEmptyString(selectorId) || selectors[selectorId] === undefined) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PLAN_TEMPLATE_REF_UNKNOWN,
        path: `${rolePath}.selector`,
        severity: 'error',
        message: `Plan template "${templateId}" role "${roleName}" references unknown selector "${String(selectorId)}".`,
        suggestion: 'Reference a selector declared in doc.agents.library.selectors.',
      });
    } else {
      validatePlanRoleSelectorOrder(templateId, roleName, selectorId, selectors[selectorId], `${rolePath}.selector`, diagnostics);
    }

    const constraints = Array.isArray(roleDef.constraints) ? roleDef.constraints : [];
    for (const [index, constraint] of constraints.entries()) {
      if (!isRecord(constraint)) {
        continue;
      }
      const ref = typeof constraint.notEqual === 'string'
        ? constraint.notEqual
        : (typeof constraint.locatedIn === 'string' ? constraint.locatedIn : undefined);
      if (ref === undefined) {
        continue;
      }
      const referencedRole = normalizeRoleRef(ref);
      if (!declaredRoles.has(referencedRole) || !boundRoles.has(referencedRole)) {
        diagnostics.push({
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PLAN_TEMPLATE_ROLE_UNBOUND,
          path: `${rolePath}.constraints.${index}`,
          severity: 'error',
          message: `Plan template "${templateId}" role "${roleName}" constraint references role "${referencedRole}", but it is not bound before this constraint.`,
          suggestion: `Bind role "${referencedRole}" earlier in roles or remove the constraint.`,
        });
      }
    }
    boundRoles.add(roleName);
  }
}

function validatePlanRoleSelectorOrder(
  templateId: string,
  roleName: string,
  selectorId: string,
  selectorDef: unknown,
  path: string,
  diagnostics: Diagnostic[],
): void {
  const result = isRecord(selectorDef) && isRecord(selectorDef.result) ? selectorDef.result : undefined;
  const order = Array.isArray(result?.order) ? result.order : [];
  if (order.includes('stableKeyAsc') || order.includes('stableKeyDesc')) {
    return;
  }
  diagnostics.push({
    code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PLAN_TEMPLATE_STABLE_TIEBREAKER_REQUIRED,
    path,
    severity: 'error',
    message: `Plan template "${templateId}" role "${roleName}" selector "${selectorId}" must include a stableKeyAsc or stableKeyDesc result order entry for deterministic role binding.`,
    suggestion: 'Add stableKeyAsc or stableKeyDesc to the selector result.order.',
  });
}

function validatePlanTemplateSteps(
  templateId: string,
  templateDef: Record<string, unknown>,
  templatePath: string,
  diagnostics: Diagnostic[],
): void {
  const roles = isRecord(templateDef.roles) ? templateDef.roles : {};
  const declaredRoles = new Set(Object.keys(roles));
  const steps = Array.isArray(templateDef.steps) ? templateDef.steps : [];
  for (const [index, step] of steps.entries()) {
    if (!isRecord(step)) {
      continue;
    }
    const role = step.role;
    if (typeof role === 'string' && declaredRoles.has(role)) {
      continue;
    }
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PLAN_TEMPLATE_ROLE_UNBOUND,
      path: `${templatePath}.steps.${index}.role`,
      severity: 'error',
      message: `Plan template "${templateId}" step ${index} references role "${String(role)}", but that role is not declared on the template.`,
      suggestion: 'Reference one of the template roles or add the missing role declaration.',
    });
  }
}

function validatePlanTemplateCaps(
  templateId: string,
  caps: unknown,
  path: string,
  diagnostics: Diagnostic[],
): void {
  if (!isRecord(caps)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PLAN_TEMPLATE_CAPS_INVALID,
      path,
      severity: 'error',
      message: `Plan template "${templateId}" must declare caps with capClass and maxSteps.`,
      suggestion: 'Declare caps: { capClass: "standard256", maxSteps: <positive integer> }.',
    });
    return;
  }
  const capClass = caps.capClass;
  const maxSteps = caps.maxSteps;
  if (!isKnownPlanCapClass(capClass)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PLAN_TEMPLATE_CAPS_INVALID,
      path: `${path}.capClass`,
      severity: 'error',
      message: `Plan template "${templateId}" caps.capClass must be one of ${Object.keys(PLAN_CAP_CLASS_BUDGETS).join(', ')}.`,
      suggestion: 'Use a named plan cap class from the registry, such as standard256.',
    });
    return;
  }
  const capBudget = PLAN_CAP_CLASS_BUDGETS[capClass];
  if (typeof maxSteps !== 'number' || !Number.isSafeInteger(maxSteps) || maxSteps <= 0 || maxSteps > capBudget) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PLAN_TEMPLATE_CAPS_INVALID,
      path: `${path}.maxSteps`,
      severity: 'error',
      message: `Plan template "${templateId}" caps.maxSteps must be a positive safe integer <= capClass ${capClass} budget ${capBudget}.`,
      suggestion: `Set maxSteps to a value from 1 to ${capBudget}.`,
    });
  }
}

function validatePlanTemplateFallbacks(
  templateId: string,
  fallback: unknown,
  path: string,
  templateIds: ReadonlySet<string>,
  diagnostics: Diagnostic[],
): readonly string[] {
  if (fallback === undefined || !isRecord(fallback)) {
    return [];
  }
  const edges: string[] = [];
  for (const key of ['ifSpecialUnavailable', 'ifRoleTargetUnavailable', 'ifPreviewUnavailable'] as const) {
    const target = fallback[key];
    if (target === undefined) {
      continue;
    }
    if (!isNonEmptyString(target)) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PLAN_TEMPLATE_FALLBACK_UNKNOWN,
        path: `${path}.${key}`,
        severity: 'error',
        message: `Plan template "${templateId}" fallback ${key} must name a terminal policy or another template.`,
        suggestion: 'Use primitivePolicy, traceOnly, or the id of another plan template.',
      });
      continue;
    }
    if (PLAN_TERMINAL_FALLBACKS.has(target)) {
      continue;
    }
    if (templateIds.has(target)) {
      edges.push(target);
      continue;
    }
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PLAN_TEMPLATE_FALLBACK_UNKNOWN,
      path: `${path}.${key}`,
      severity: 'error',
      message: `Plan template "${templateId}" fallback ${key} references unknown template or terminal policy "${target}".`,
      suggestion: 'Reference an existing plan template id or a supported terminal fallback policy.',
    });
  }
  return edges;
}

function validatePlanFallbackCycles(
  edges: ReadonlyMap<string, readonly string[]>,
  diagnostics: Diagnostic[],
): void {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];
  const reported = new Set<string>();

  const visit = (templateId: string): void => {
    if (visited.has(templateId)) {
      return;
    }
    if (visiting.has(templateId)) {
      const cycleStart = stack.indexOf(templateId);
      const cycle = cycleStart >= 0 ? [...stack.slice(cycleStart), templateId] : [...stack, templateId];
      const cycleKey = cycle.join(' -> ');
      if (!reported.has(cycleKey)) {
        reported.add(cycleKey);
        diagnostics.push({
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PLAN_TEMPLATE_FALLBACK_CYCLE,
          path: `doc.agents.library.planTemplates.${templateId}.fallback`,
          severity: 'error',
          message: `Plan template fallback cycle is unbounded: ${cycleKey}.`,
          suggestion: 'Break the cycle or route one fallback to primitivePolicy/traceOnly until bounded fallback-attempt metadata exists.',
        });
      }
      return;
    }
    visiting.add(templateId);
    stack.push(templateId);
    for (const next of edges.get(templateId) ?? []) {
      visit(next);
    }
    stack.pop();
    visiting.delete(templateId);
    visited.add(templateId);
  };

  for (const templateId of edges.keys()) {
    visit(templateId);
  }
}

function normalizeRoleRef(ref: string): string {
  return ref.startsWith('role.') ? ref.slice('role.'.length) : ref;
}

function isKnownPlanCapClass(value: unknown): value is keyof typeof PLAN_CAP_CLASS_BUDGETS {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(PLAN_CAP_CLASS_BUDGETS, value);
}
