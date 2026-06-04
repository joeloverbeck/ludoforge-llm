import type { Diagnostic } from '../kernel/diagnostics.js';
import { deriveChoiceTargetKinds } from '../kernel/choice-target-kinds.js';
import {
  isSupportedPlanRoleConstraintKind,
  SUPPORTED_PLAN_ROLE_CONSTRAINT_KINDS,
} from '../kernel/plan-role-constraints.js';
import { CNL_COMPILER_DIAGNOSTIC_CODES } from './compiler-diagnostic-codes.js';
import type { GameSpecDoc } from './game-spec-doc.js';
import {
  collectRouteGraphContext,
  parsePlanRoleConstraint,
  validateLocatedInObserverSafety,
  validatePostStateConstraintRefs,
  validateRouteGraphConstraintRefs,
} from './validate-agent-plan-route-constraints.js';
import { isNonEmptyString, isRecord } from './validate-spec-shared.js';

const PLAN_CAP_CLASS_BUDGETS = { standard256: 256, deep1024: 1024 } as const;
const PLAN_TERMINAL_FALLBACKS = new Set(['primitivePolicy', 'traceOnly']);

export function validatePlanTemplates(
  library: Record<string, unknown>,
  diagnostics: Diagnostic[],
  doc?: GameSpecDoc,
): void {
  const planTemplates = isRecord(library.planTemplates) ? library.planTemplates : undefined;
  if (planTemplates === undefined) {
    return;
  }
  const selectors = isRecord(library.selectors) ? library.selectors : {};
  const templateIds = new Set(Object.keys(planTemplates));
  const fallbackEdges = new Map<string, readonly string[]>();
  const decisionSurfaces = doc === undefined ? [] : collectDecisionSurfaces(doc);
  const compoundWitnesses = doc === undefined ? [] : collectCompoundWitnesses(doc);

  for (const [templateId, templateDef] of Object.entries(planTemplates)) {
    if (!isRecord(templateDef)) {
      continue;
    }
    const templatePath = `doc.agents.library.planTemplates.${templateId}`;
    validatePlanTemplateRoles(templateId, templateDef, templatePath, selectors, diagnostics, doc);
    validatePlanTemplateSteps(templateId, templateDef, templatePath, selectors, decisionSurfaces, diagnostics);
    validatePlanTemplateCompound(templateId, templateDef, templatePath, compoundWitnesses, diagnostics);
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
  doc?: GameSpecDoc,
): void {
  const roles = isRecord(templateDef.roles) ? templateDef.roles : {};
  const declaredRoles = new Set(Object.keys(roles));
  const boundRoles = new Set<string>();
  const routeGraphContext = collectRouteGraphContext(doc);
  const stepLabels = new Set(
    (Array.isArray(templateDef.steps) ? templateDef.steps : [])
      .filter(isRecord)
      .map((step) => step.label)
      .filter(isNonEmptyString),
  );

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
      const constraintPath = `${rolePath}.constraints.${index}`;
      const parsed = parsePlanRoleConstraint(constraint, templateId, roleName, constraintPath, diagnostics);
      if (parsed !== undefined && !isSupportedPlanRoleConstraintKind(parsed.kind)) {
        diagnostics.push({
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PLAN_TEMPLATE_CONSTRAINT_UNSUPPORTED,
          path: `${rolePath}.constraints.${index}.${parsed.kind}`,
          severity: 'error',
          message: `Plan template "${templateId}" role "${roleName}" constraint "${parsed.kind}" has no runtime implementation.`,
          suggestion: `Use one of ${SUPPORTED_PLAN_ROLE_CONSTRAINT_KIND_LABEL} or implement runtime support before authoring "${parsed.kind}".`,
        });
      }
      if (parsed === undefined) {
        continue;
      }
      validateRouteGraphConstraintRefs(parsed, templateId, roleName, constraintPath, routeGraphContext, diagnostics);
      validateLocatedInObserverSafety(parsed, templateId, roleName, constraintPath, roles, selectors, doc, diagnostics);
      validatePostStateConstraintRefs(parsed, templateId, roleName, constraintPath, stepLabels, diagnostics);
      for (const ref of parsed.refs) {
        const referencedRole = normalizeRoleRef(ref);
        if (!declaredRoles.has(referencedRole) || (!boundRoles.has(referencedRole) && referencedRole !== roleName)) {
          diagnostics.push({
            code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PLAN_TEMPLATE_ROLE_UNBOUND,
            path: `${rolePath}.constraints.${index}`,
            severity: 'error',
            message: `Plan template "${templateId}" role "${roleName}" constraint references role "${referencedRole}", but it is not bound before this constraint.`,
            suggestion: `Bind role "${referencedRole}" earlier in roles or remove the constraint.`,
          });
        }
      }
    }
    boundRoles.add(roleName);
  }
}

const SUPPORTED_PLAN_ROLE_CONSTRAINT_KIND_LABEL = SUPPORTED_PLAN_ROLE_CONSTRAINT_KINDS
  .map((kind) => `"${kind}"`)
  .join(', ');

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
  selectors: Record<string, unknown>,
  decisionSurfaces: readonly PlanDecisionSurface[],
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
    if (typeof role !== 'string' || !declaredRoles.has(role)) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PLAN_TEMPLATE_ROLE_UNBOUND,
        path: `${templatePath}.steps.${index}.role`,
        severity: 'error',
        message: `Plan template "${templateId}" step ${index} references role "${String(role)}", but that role is not declared on the template.`,
        suggestion: 'Reference one of the template roles or add the missing role declaration.',
      });
      continue;
    }
    validatePlanStepMatch(
      templateId,
      role,
      step,
      index,
      templatePath,
      roles,
      selectors,
      decisionSurfaces,
      diagnostics,
    );
  }
}

interface PlanDecisionSurface {
  readonly decisionKind: string;
  readonly decisionPath: string;
  readonly targetKinds: readonly string[];
  readonly actionId: string;
  readonly actionTags: readonly string[];
  readonly stageIndex?: number;
}

interface PlanCompoundWitness {
  readonly operationActionId: string;
  readonly operationTags: readonly string[];
  readonly specialActionId: string;
  readonly specialTags: readonly string[];
  readonly operationStageCount: number;
}

function validatePlanTemplateCompound(
  templateId: string,
  templateDef: Record<string, unknown>,
  templatePath: string,
  witnesses: readonly PlanCompoundWitness[],
  diagnostics: Diagnostic[],
): void {
  const root = isRecord(templateDef.root) ? templateDef.root : undefined;
  const compound = isRecord(root?.compound) ? root.compound : undefined;
  if (root === undefined || compound === undefined) {
    return;
  }

  const actionIds = stringArray(root.actionIds);
  const actionTags = stringArray(root.actionTags);
  const specialTags = stringArray(compound.specialTags);
  if (specialTags.length === 0) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PLAN_TEMPLATE_COMPOUND_UNPROVABLE,
      path: `${templatePath}.root.compound.specialTags`,
      severity: 'error',
      message: `Plan template "${templateId}" root.compound must name at least one special activity tag.`,
      suggestion: 'Add specialTags that identify an authored special-activity action, or remove root.compound.',
    });
    return;
  }

  const timing = compound.timing === undefined ? 'during' : compound.timing;
  if (timing !== 'before' && timing !== 'during' && timing !== 'after') {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PLAN_TEMPLATE_COMPOUND_UNPROVABLE,
      path: `${templatePath}.root.compound.timing`,
      severity: 'error',
      message: `Plan template "${templateId}" root.compound timing must be before, during, or after.`,
      suggestion: 'Use before, during, or after.',
    });
    return;
  }

  const interruptAfterStage = compound.interruptAfterStage;
  if (interruptAfterStage !== undefined) {
    if (timing !== 'during') {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PLAN_TEMPLATE_COMPOUND_UNPROVABLE,
        path: `${templatePath}.root.compound.interruptAfterStage`,
        severity: 'error',
        message: `Plan template "${templateId}" root.compound interruptAfterStage requires timing "during".`,
        suggestion: 'Set timing: during or remove interruptAfterStage.',
      });
      return;
    }
    if (typeof interruptAfterStage !== 'number' || !Number.isSafeInteger(interruptAfterStage) || interruptAfterStage < 0) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PLAN_TEMPLATE_COMPOUND_UNPROVABLE,
        path: `${templatePath}.root.compound.interruptAfterStage`,
        severity: 'error',
        message: `Plan template "${templateId}" root.compound interruptAfterStage must be a non-negative safe integer.`,
        suggestion: 'Use a stage index from the matching operation pipeline.',
      });
      return;
    }
  }

  const specialTagVocabulary = new Set(witnesses.flatMap((witness) => witness.specialTags));
  for (const [tagIndex, tag] of specialTags.entries()) {
    if (!specialTagVocabulary.has(tag)) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PLAN_TEMPLATE_COMPOUND_UNPROVABLE,
        path: `${templatePath}.root.compound.specialTags[${tagIndex}]`,
        severity: 'error',
        message: `Unknown special tag "${tag}" in plan template root.compound — no accompanyingOps entry references this tag.`,
        suggestion: 'Align compound.specialTags with tags on a special-activity action that can accompany an operation pipeline.',
      });
    }
  }

  const hasWitness = witnesses.some((witness) =>
    matchesRootAction(witness, actionIds, actionTags)
    && specialTags.every((tag) => witness.specialTags.includes(tag))
    && (interruptAfterStage === undefined || interruptAfterStage < witness.operationStageCount),
  );

  if (!hasWitness) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PLAN_TEMPLATE_COMPOUND_UNPROVABLE,
      path: `${templatePath}.root.compound`,
      severity: 'error',
      message: `Plan template "${templateId}" root.compound has no authored operation/special-activity continuation witness for the requested tags and timing.`,
      suggestion: 'Align root.actionTags/actionIds and compound.specialTags with an action pipeline whose special activity accompanyingOps can accompany the operation, or remove ungrantable compound metadata.',
    });
  }
}

function matchesRootAction(
  witness: PlanCompoundWitness,
  actionIds: readonly string[],
  actionTags: readonly string[],
): boolean {
  const idMatches = actionIds.length === 0 || actionIds.includes(witness.operationActionId);
  const tagsMatch = actionTags.length === 0 || actionTags.every((tag) => witness.operationTags.includes(tag));
  return idMatches && tagsMatch;
}

function validatePlanStepMatch(
  templateId: string,
  roleName: string,
  step: Record<string, unknown>,
  stepIndex: number,
  templatePath: string,
  roles: Record<string, unknown>,
  selectors: Record<string, unknown>,
  decisionSurfaces: readonly PlanDecisionSurface[],
  diagnostics: Diagnostic[],
): void {
  const match = isRecord(step.match) ? step.match : undefined;
  if (match === undefined) {
    return;
  }
  const selectorId = isRecord(roles[roleName]) ? roles[roleName].selector : undefined;
  const selectorTargetKind = typeof selectorId === 'string'
    ? selectorTargetKindFor(selectors[selectorId])
    : null;
  const targetKind = match.targetKind;
  if (
    match.selectedValue === undefined
    && typeof targetKind === 'string'
    && selectorTargetKind !== null
    && targetKind !== selectorTargetKind
  ) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PLAN_TEMPLATE_STEP_MATCH_INVALID,
      path: `${templatePath}.steps.${stepIndex}.match.targetKind`,
      severity: 'error',
      message: `Plan template "${templateId}" step ${stepIndex} role "${roleName}" targetKind "${targetKind}" does not match selector target kind "${selectorTargetKind}".`,
      suggestion: `Use targetKind "${selectorTargetKind}" or bind the role with a selector that yields "${targetKind}".`,
    });
    return;
  }

  if (
    match.selectedValue !== undefined
    && match.decisionKind !== 'chooseOne'
    && match.decisionKind !== 'chooseNStep'
  ) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PLAN_TEMPLATE_STEP_MATCH_INVALID,
      path: `${templatePath}.steps.${stepIndex}.match.selectedValue`,
      severity: 'error',
      message: `Plan template "${templateId}" step ${stepIndex} selectedValue can only be used with chooseOne or chooseNStep decisions.`,
      suggestion: 'Remove selectedValue or use a choice decision kind.',
    });
  }
  if (decisionSurfaces.length === 0) {
    return;
  }
  const matchedSurface = decisionSurfaces.some((surface) =>
    surface.decisionKind === match.decisionKind
    && surface.decisionPath === match.decisionPath
    && typeof targetKind === 'string'
    && (surface.targetKinds.length === 0 || surface.targetKinds.includes(targetKind))
    && (typeof match.actionTag !== 'string' || surface.actionTags.includes(match.actionTag))
    && (typeof match.stageIndex !== 'number' || surface.stageIndex === match.stageIndex),
  );
  if (!matchedSurface) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PLAN_TEMPLATE_STEP_MATCH_INVALID,
      path: `${templatePath}.steps.${stepIndex}.match`,
      severity: 'error',
      message: `Plan template "${templateId}" step ${stepIndex} role "${roleName}" match does not resolve to a declared decision surface.`,
      suggestion: 'Check decisionKind, decisionPath, targetKind, actionTag, and stageIndex against authored action and pipeline choices.',
    });
  }
}

function collectCompoundWitnesses(doc: GameSpecDoc): readonly PlanCompoundWitness[] {
  const actions = Array.isArray(doc.actions) ? doc.actions : [];
  const actionTagsById = new Map<string, readonly string[]>();
  for (const action of actions) {
    if (!isRecord(action) || typeof action.id !== 'string') {
      continue;
    }
    actionTagsById.set(action.id, stringArray(action.tags));
  }

  const pipelines = Array.isArray(doc.actionPipelines) ? doc.actionPipelines : [];
  const operationPipelines = pipelines.filter((pipeline) => isRecord(pipeline) && typeof pipeline.actionId === 'string');
  const specialPipelines = operationPipelines.filter((pipeline) =>
    pipeline.accompanyingOps === 'any' || Array.isArray(pipeline.accompanyingOps));

  const witnesses: PlanCompoundWitness[] = [];
  for (const operationPipeline of operationPipelines) {
    const operationActionId = String(operationPipeline.actionId);
    const operationTags = actionTagsById.get(operationActionId) ?? [];
    const operationStageCount = Array.isArray(operationPipeline.stages) ? operationPipeline.stages.length : 0;
    for (const specialPipeline of specialPipelines) {
      const specialActionId = String(specialPipeline.actionId);
      if (!canSpecialAccompanyOperation(specialPipeline.accompanyingOps, operationActionId)) {
        continue;
      }
      witnesses.push({
        operationActionId,
        operationTags,
        specialActionId,
        specialTags: actionTagsById.get(specialActionId) ?? [],
        operationStageCount,
      });
    }
  }
  return witnesses;
}

function canSpecialAccompanyOperation(accompanyingOps: unknown, operationActionId: string): boolean {
  return accompanyingOps === 'any'
    || (Array.isArray(accompanyingOps) && accompanyingOps.includes(operationActionId));
}

function stringArray(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function collectDecisionSurfaces(doc: GameSpecDoc): readonly PlanDecisionSurface[] {
  const surfaces: PlanDecisionSurface[] = [];
  const actions = Array.isArray(doc.actions) ? doc.actions : [];
  const effectMacros = new Map(
    (Array.isArray(doc.effectMacros) ? doc.effectMacros : []).map((macro) => [macro.id, macro.effects] as const),
  );
  for (const action of actions) {
    const actionTags = Array.isArray(action.tags)
      ? action.tags.filter((tag: unknown): tag is string => typeof tag === 'string')
      : [];
    surfaces.push({
      decisionKind: 'actionSelection',
      decisionPath: 'actionId',
      targetKinds: ['action'],
      actionId: action.id,
      actionTags,
    });
    collectChoiceSurfaces(action.effects, action.id, actionTags, undefined, surfaces, effectMacros);
    for (const param of action.params) {
      if (!isRecord(param) || typeof param.name !== 'string') {
        continue;
      }
      const targetKinds = targetKindsForDomain(param.domain);
      if (targetKinds.length > 0) {
        surfaces.push({
          decisionKind: 'chooseOne',
          decisionPath: param.name,
          targetKinds,
          actionId: action.id,
          actionTags,
        });
      }
    }
  }
  const actionTagsById = new Map(actions.map((action) => [
    action.id,
    Array.isArray(action.tags) ? action.tags.filter((tag: unknown): tag is string => typeof tag === 'string') : [],
  ]));
  const pipelines = Array.isArray(doc.actionPipelines) ? doc.actionPipelines : [];
  for (const pipeline of pipelines) {
    if (!isRecord(pipeline) || typeof pipeline.actionId !== 'string' || !Array.isArray(pipeline.stages)) {
      continue;
    }
    const actionTags = actionTagsById.get(pipeline.actionId) ?? [];
    for (const [stageIndex, stage] of pipeline.stages.entries()) {
      if (isRecord(stage)) {
        collectChoiceSurfaces(stage.effects, pipeline.actionId, actionTags, stageIndex, surfaces, effectMacros);
      }
    }
  }
  return surfaces;
}

function collectChoiceSurfaces(
  node: unknown,
  actionId: string,
  actionTags: readonly string[],
  stageIndex: number | undefined,
  surfaces: PlanDecisionSurface[],
  effectMacros: ReadonlyMap<string, unknown>,
  macroStack: readonly string[] = [],
): void {
  if (Array.isArray(node)) {
    for (const entry of node) {
      collectChoiceSurfaces(entry, actionId, actionTags, stageIndex, surfaces, effectMacros, macroStack);
    }
    return;
  }
  if (!isRecord(node)) {
    return;
  }
  if (isRecord(node.chooseOne)) {
    collectChoiceSurface(node.chooseOne, 'chooseOne', actionId, actionTags, stageIndex, surfaces);
  }
  if (isRecord(node.chooseN)) {
    collectChoiceSurface(node.chooseN, 'chooseNStep', actionId, actionTags, stageIndex, surfaces);
  }
  if (typeof node.macro === 'string' && !macroStack.includes(node.macro)) {
    collectChoiceSurfaces(
      effectMacros.get(node.macro),
      actionId,
      actionTags,
      stageIndex,
      surfaces,
      effectMacros,
      [...macroStack, node.macro],
    );
  }
  for (const value of Object.values(node)) {
    collectChoiceSurfaces(value, actionId, actionTags, stageIndex, surfaces, effectMacros, macroStack);
  }
}

function collectChoiceSurface(
  choice: Record<string, unknown>,
  decisionKind: 'chooseOne' | 'chooseNStep',
  actionId: string,
  actionTags: readonly string[],
  stageIndex: number | undefined,
  surfaces: PlanDecisionSurface[],
): void {
  const bind = choice.bind;
  const decisionPath = typeof bind === 'string' ? bind.replace(/^\$/, '') : null;
  const targetKinds = targetKindsForDomain(decisionKind === 'chooseOne' ? choice.options : choice.options);
  if (decisionPath !== null) {
    surfaces.push({
      decisionKind,
      decisionPath,
      targetKinds,
      actionId,
      actionTags,
      ...(stageIndex === undefined ? {} : { stageIndex }),
    });
  }
}

function targetKindsForDomain(domain: unknown): readonly string[] {
  try {
    return deriveChoiceTargetKinds(domain as never);
  } catch {
    return [];
  }
}

function selectorTargetKindFor(selector: unknown): string | null {
  if (!isRecord(selector) || !isRecord(selector.source) || !isRecord(selector.source.collection)) {
    return null;
  }
  switch (selector.source.collection.kind) {
    case 'zones':
      return 'zone';
    case 'tokens':
      return 'token';
    default:
      return null;
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
