import type { Diagnostic } from '../kernel/diagnostics.js';
import { CNL_COMPILER_DIAGNOSTIC_CODES } from './compiler-diagnostic-codes.js';
import type { GameSpecDoc } from './game-spec-doc.js';
import { isNonEmptyString, isRecord } from './validate-spec-shared.js';

export interface ParsedPlanRoleConstraint {
  readonly kind: string;
  readonly refs: readonly string[];
  readonly via?: string;
  readonly locatedInContainer?: string;
  readonly postStateStep?: string;
  readonly postStateMaxSteps?: number;
}

export function parsePlanRoleConstraint(
  constraint: Record<string, unknown>,
  templateId: string,
  roleName: string,
  path: string,
  diagnostics: Diagnostic[],
): ParsedPlanRoleConstraint | undefined {
  if (typeof constraint.notEqual === 'string') {
    return { kind: 'notEqual', refs: [constraint.notEqual] };
  }
  if (constraint.locatedIn !== undefined) {
    if (!isRecord(constraint.locatedIn)) {
      pushInvalidPlanRoleConstraintDiagnostic(
        diagnostics,
        path,
        templateId,
        roleName,
        'locatedIn requires an object payload with role and container references.',
      );
      return { kind: 'locatedIn', refs: [] };
    }
    const { role, container } = constraint.locatedIn;
    if (!isRoleRef(role)) {
      pushInvalidPlanRoleConstraintDiagnostic(
        diagnostics,
        `${path}.locatedIn.role`,
        templateId,
        roleName,
        'locatedIn requires a role reference.',
      );
      return { kind: 'locatedIn', refs: [] };
    }
    if (!isZoneOrRoleRef(container)) {
      pushInvalidPlanRoleConstraintDiagnostic(
        diagnostics,
        `${path}.locatedIn.container`,
        templateId,
        roleName,
        'locatedIn requires a container reference to a zone.* or role.* value.',
      );
    }
    return {
      kind: 'locatedIn',
      refs: [role, ...(isRoleRef(container) ? [container] : [])],
      ...(typeof container === 'string' ? { locatedInContainer: container } : {}),
    };
  }
  if (constraint.distinctOriginDestination !== undefined) {
    if (!isRecord(constraint.distinctOriginDestination)) {
      pushInvalidPlanRoleConstraintDiagnostic(
        diagnostics,
        path,
        templateId,
        roleName,
        'distinctOriginDestination requires an object payload with origin and destination role references.',
      );
      return { kind: 'distinctOriginDestination', refs: [] };
    }
    const { origin, destination } = constraint.distinctOriginDestination;
    const refs = collectRequiredRoleRefs(
      diagnostics,
      `${path}.distinctOriginDestination`,
      templateId,
      roleName,
      { origin, destination },
      'distinctOriginDestination',
    );
    return { kind: 'distinctOriginDestination', refs };
  }
  if (constraint.reachable !== undefined) {
    if (!isRecord(constraint.reachable)) {
      pushInvalidPlanRoleConstraintDiagnostic(
        diagnostics,
        path,
        templateId,
        roleName,
        'reachable requires an object payload with from and to role references.',
      );
      return { kind: 'reachable', refs: [] };
    }
    const { from, to, via, maxHops } = constraint.reachable;
    const refs = collectRequiredRoleRefs(
      diagnostics,
      `${path}.reachable`,
      templateId,
      roleName,
      { from, to },
      'reachable',
    );
    if (via !== undefined && !isRouteClassRef(via)) {
      pushInvalidPlanRoleConstraintDiagnostic(
        diagnostics,
        `${path}.reachable.via`,
        templateId,
        roleName,
        'reachable via must be a routeClass.* reference when provided.',
      );
    }
    if (maxHops !== undefined && (typeof maxHops !== 'number' || !Number.isInteger(maxHops) || maxHops <= 0)) {
      pushInvalidPlanRoleConstraintDiagnostic(
        diagnostics,
        `${path}.reachable.maxHops`,
        templateId,
        roleName,
        'reachable maxHops must be a positive integer.',
      );
    }
    return { kind: 'reachable', refs, ...(typeof via === 'string' ? { via } : {}) };
  }
  if (constraint.adjacent !== undefined) {
    if (!isRecord(constraint.adjacent)) {
      pushInvalidPlanRoleConstraintDiagnostic(
        diagnostics,
        path,
        templateId,
        roleName,
        'adjacent requires an object payload with a and b role references.',
      );
      return { kind: 'adjacent', refs: [] };
    }
    const { a, b } = constraint.adjacent;
    const refs = collectRequiredRoleRefs(
      diagnostics,
      `${path}.adjacent`,
      templateId,
      roleName,
      { a, b },
      'adjacent',
    );
    return { kind: 'adjacent', refs };
  }
  if (constraint.postState !== undefined) {
    if (!isRecord(constraint.postState)) {
      pushInvalidPlanRoleConstraintDiagnostic(
        diagnostics,
        path,
        templateId,
        roleName,
        'postState requires an object payload with step, role, maxSteps, and predicate.',
      );
      return { kind: 'postState', refs: [] };
    }
    const { step, role, maxSteps, predicate } = constraint.postState;
    const refs: string[] = [];
    if (!isNonEmptyString(step)) {
      pushInvalidPlanRoleConstraintDiagnostic(
        diagnostics,
        `${path}.postState.step`,
        templateId,
        roleName,
        'postState step must name a plan step label.',
      );
    }
    if (!isRoleRef(role)) {
      pushInvalidPlanRoleConstraintDiagnostic(
        diagnostics,
        `${path}.postState.role`,
        templateId,
        roleName,
        'postState role must be a role.* reference.',
      );
    } else {
      refs.push(role);
    }
    if (typeof maxSteps !== 'number' || !Number.isInteger(maxSteps) || maxSteps <= 0) {
      pushInvalidPlanRoleConstraintDiagnostic(
        diagnostics,
        `${path}.postState.maxSteps`,
        templateId,
        roleName,
        'postState maxSteps must be a positive integer.',
      );
    }
    if (!isRecord(predicate)) {
      pushInvalidPlanRoleConstraintDiagnostic(
        diagnostics,
        `${path}.postState.predicate`,
        templateId,
        roleName,
        'postState predicate requires roleLocatedIn or condition.',
      );
    } else if (isRecord(predicate.roleLocatedIn)) {
      const { role: predicateRole, container } = predicate.roleLocatedIn;
      if (!isRoleRef(predicateRole)) {
        pushInvalidPlanRoleConstraintDiagnostic(
          diagnostics,
          `${path}.postState.predicate.roleLocatedIn.role`,
          templateId,
          roleName,
          'postState roleLocatedIn predicate requires a role reference.',
        );
      } else {
        refs.push(predicateRole);
      }
      if (!isZoneOrRoleRef(container)) {
        pushInvalidPlanRoleConstraintDiagnostic(
          diagnostics,
          `${path}.postState.predicate.roleLocatedIn.container`,
          templateId,
          roleName,
          'postState roleLocatedIn predicate requires a container reference to a zone.* or role.* value.',
        );
      } else if (isRoleRef(container)) {
        refs.push(container);
      }
    } else if (isRecord(predicate.condition)) {
      const { when, bindings } = predicate.condition;
      if (when === undefined) {
        pushInvalidPlanRoleConstraintDiagnostic(
          diagnostics,
          `${path}.postState.predicate.condition.when`,
          templateId,
          roleName,
          'postState condition predicate requires a condition expression.',
        );
      }
      if (!isRecord(bindings)) {
        pushInvalidPlanRoleConstraintDiagnostic(
          diagnostics,
          `${path}.postState.predicate.condition.bindings`,
          templateId,
          roleName,
          'postState condition predicate requires bindings from condition parameter names to role references.',
        );
      } else {
        for (const [bindingName, bindingRole] of Object.entries(bindings)) {
          if (!isRoleRef(bindingRole)) {
            pushInvalidPlanRoleConstraintDiagnostic(
              diagnostics,
              `${path}.postState.predicate.condition.bindings.${bindingName}`,
              templateId,
              roleName,
              `postState condition predicate binding "${bindingName}" must reference a role.`,
            );
          } else {
            refs.push(bindingRole);
          }
        }
      }
    } else {
      pushInvalidPlanRoleConstraintDiagnostic(
        diagnostics,
        `${path}.postState.predicate`,
        templateId,
        roleName,
        'postState predicate requires roleLocatedIn with role/container refs or condition with when/bindings.',
      );
    }
    return {
      kind: 'postState',
      refs,
      ...(isNonEmptyString(step) ? { postStateStep: step } : {}),
      ...(typeof maxSteps === 'number' ? { postStateMaxSteps: maxSteps } : {}),
    };
  }
  const [kind] = Object.keys(constraint);
  if (kind !== undefined) {
    return { kind, refs: [] };
  }
  return undefined;
}

export function validatePostStateConstraintRefs(
  parsed: ParsedPlanRoleConstraint,
  templateId: string,
  roleName: string,
  path: string,
  stepLabels: ReadonlySet<string>,
  diagnostics: Diagnostic[],
): void {
  if (parsed.kind !== 'postState') {
    return;
  }
  if (parsed.postStateStep !== undefined && !stepLabels.has(parsed.postStateStep)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PLAN_TEMPLATE_REF_UNKNOWN,
      path: `${path}.postState.step`,
      severity: 'error',
      message: `Plan template "${templateId}" role "${roleName}" postState constraint references unknown step "${parsed.postStateStep}".`,
      suggestion: 'Reference a label declared in the same plan template steps list.',
      alternatives: [...stepLabels].sort(),
    });
  }
}

export interface RouteGraphValidationContext {
  readonly present: boolean;
  readonly routeClassIds: ReadonlySet<string>;
}

export function collectRouteGraphContext(doc: GameSpecDoc | undefined): RouteGraphValidationContext {
  const routeClassIds = new Set<string>();
  const routeGraphAssets = doc?.dataAssets?.filter((asset) => isRecord(asset) && asset.kind === 'routeGraph') ?? [];
  for (const asset of routeGraphAssets) {
    const payload = isRecord(asset.payload) ? asset.payload : undefined;
    const routeClasses = Array.isArray(payload?.routeClasses) ? payload.routeClasses : [];
    for (const routeClass of routeClasses) {
      if (isRecord(routeClass) && isNonEmptyString(routeClass.id)) {
        routeClassIds.add(routeClass.id);
      }
    }
  }
  return { present: routeGraphAssets.length > 0, routeClassIds };
}

export function validateRouteGraphConstraintRefs(
  parsed: ParsedPlanRoleConstraint,
  templateId: string,
  roleName: string,
  path: string,
  routeGraphContext: RouteGraphValidationContext,
  diagnostics: Diagnostic[],
): void {
  if (parsed.kind !== 'reachable' && parsed.kind !== 'adjacent') {
    return;
  }
  if (!routeGraphContext.present) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PLAN_TEMPLATE_ROUTE_GRAPH_MISSING,
      path,
      severity: 'error',
      message: `Plan template "${templateId}" role "${roleName}" ${parsed.kind} constraint requires a routeGraph data asset.`,
      suggestion: 'Add a routeGraph data asset before authoring reachable or adjacent role constraints.',
    });
    return;
  }
  if (parsed.kind === 'reachable' && parsed.via !== undefined) {
    const routeClassId = normalizeRouteClassRef(parsed.via);
    if (!routeGraphContext.routeClassIds.has(routeClassId)) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PLAN_TEMPLATE_ROUTE_CLASS_UNRESOLVED,
        path: `${path}.reachable.via`,
        severity: 'error',
        message: `Plan template "${templateId}" role "${roleName}" reachable constraint references unknown route class "${routeClassId}".`,
        suggestion: 'Reference a routeClass declared by the authored routeGraph data asset.',
        alternatives: [...routeGraphContext.routeClassIds].sort(),
      });
    }
  }
}

export function validateLocatedInObserverSafety(
  parsed: ParsedPlanRoleConstraint,
  templateId: string,
  roleName: string,
  path: string,
  roles: Record<string, unknown>,
  selectors: Record<string, unknown>,
  doc: GameSpecDoc | undefined,
  diagnostics: Diagnostic[],
): void {
  if (parsed.kind !== 'locatedIn' || parsed.locatedInContainer === undefined || !isRoleRef(parsed.locatedInContainer)) {
    return;
  }
  const containerRole = normalizeRoleRef(parsed.locatedInContainer);
  const containerRoleDef = roles[containerRole];
  const selectorId = isRecord(containerRoleDef) && typeof containerRoleDef.selector === 'string'
    ? containerRoleDef.selector
    : undefined;
  if (selectorId === undefined || !selectorCanExposeHiddenZone(selectors[selectorId], doc)) {
    return;
  }
  diagnostics.push({
    code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PLAN_TEMPLATE_LOCATED_IN_HIDDEN_CONTAINER,
    path,
    severity: 'error',
    message: `Plan template "${templateId}" role "${roleName}" locatedIn constraint uses observer-restricted container role "${containerRole}".`,
    suggestion: 'Use an observer-safe container role or a public zone literal.',
  });
}

function selectorCanExposeHiddenZone(selectorDef: unknown, doc: GameSpecDoc | undefined): boolean {
  if (doc === undefined || !isRecord(selectorDef)) {
    return false;
  }
  const source = isRecord(selectorDef.source) ? selectorDef.source : undefined;
  const collection = isRecord(source?.collection) ? source.collection : undefined;
  if (collection?.kind !== 'zones') {
    return false;
  }
  return (doc.zones ?? []).some((zone) => isRecord(zone) && zone.visibility === 'hidden');
}

function isRoleRef(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('role.');
}

function isZoneOrRoleRef(value: unknown): value is string {
  return typeof value === 'string' && (value.startsWith('zone.') || value.startsWith('role.'));
}

function isRouteClassRef(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('routeClass.');
}

function collectRequiredRoleRefs(
  diagnostics: Diagnostic[],
  path: string,
  templateId: string,
  roleName: string,
  refs: Readonly<Record<string, unknown>>,
  kind: string,
): readonly string[] {
  const validRefs: string[] = [];
  for (const [field, value] of Object.entries(refs)) {
    if (isRoleRef(value)) {
      validRefs.push(value);
      continue;
    }
    pushInvalidPlanRoleConstraintDiagnostic(
      diagnostics,
      `${path}.${field}`,
      templateId,
      roleName,
      `${kind} requires ${field} to be a role.* reference.`,
    );
  }
  return validRefs;
}

function pushInvalidPlanRoleConstraintDiagnostic(
  diagnostics: Diagnostic[],
  path: string,
  templateId: string,
  roleName: string,
  message: string,
): void {
  diagnostics.push({
    code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PLAN_TEMPLATE_CONSTRAINT_INVALID,
    path,
    severity: 'error',
    message: `Plan template "${templateId}" role "${roleName}" constraint is invalid: ${message}`,
    suggestion: 'Use the documented role-constraint payload shape for this constraint kind.',
  });
}

function normalizeRoleRef(ref: string): string {
  return ref.startsWith('role.') ? ref.slice('role.'.length) : ref;
}

function normalizeRouteClassRef(ref: string): string {
  return ref.startsWith('routeClass.') ? ref.slice('routeClass.'.length) : ref;
}
