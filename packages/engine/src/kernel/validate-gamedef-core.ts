import type { Diagnostic } from './diagnostics.js';
import { buildAdjacencyGraph, validateAdjacency } from './spatial.js';
import type { GameDef } from './types.js';
import { validateConditionAst, validateEffectAst, validateOptionsQuery, validatePostAdjacencyBehavior } from './validate-gamedef-behavior.js';
import {
  validateActionPipelines,
  validateCardSeatOrderMapping,
  validateCoupPlan,
  validateTerminal,
} from './validate-gamedef-extensions.js';
import {
  buildValidationContext,
  validateDerivedMetrics,
  pushMissingReferenceDiagnostic,
  validatePlayerSelector,
  validateInitialPlacementsAgainstStackingConstraints,
  validateSpaceMarkerLattices,
  validateStructureSections,
} from './validate-gamedef-structure.js';
import { conditionSurfacePathForActionPre, TURN_FLOW_REQUIRED_KEYS } from '../contracts/index.js';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const validateCardDrivenTurnFlowRequiredKeys = (diagnostics: Diagnostic[], def: GameDef): void => {
  if (def.turnOrder?.type !== 'cardDriven') {
    return;
  }

  const turnFlow = def.turnOrder.config.turnFlow as unknown as Record<string, unknown>;

  for (const requiredKey of TURN_FLOW_REQUIRED_KEYS) {
    const value = turnFlow[requiredKey];
    if (value !== undefined) {
      continue;
    }
    diagnostics.push({
      code: 'TURN_FLOW_REQUIRED_KEY_MISSING',
      path: `turnOrder.config.turnFlow.${requiredKey}`,
      severity: 'error',
      message: `turnFlow.${requiredKey} is required for card-driven turn orders.`,
      suggestion: `Define turnFlow.${requiredKey} on the card-driven turnFlow config.`,
    });
  }

  if (turnFlow.actionClassByActionId !== undefined && !isRecord(turnFlow.actionClassByActionId)) {
    diagnostics.push({
      code: 'TURN_FLOW_ACTION_CLASS_MAP_INVALID',
      path: 'turnOrder.config.turnFlow.actionClassByActionId',
      severity: 'error',
      message: 'turnFlow.actionClassByActionId must be an object mapping action ids to action classes.',
      suggestion: 'Define turnFlow.actionClassByActionId as an object whose keys are action ids.',
    });
  }
};

export const validateGameDef = (def: GameDef): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];

  validateStructureSections(diagnostics, def);
  validateCardDrivenTurnFlowRequiredKeys(diagnostics, def);

  const { context, phaseCandidates, actionCandidates } = buildValidationContext(def);
  validateSpaceMarkerLattices(diagnostics, def, context);
  validateDerivedMetrics(diagnostics, def, context);

  validateCoupPlan(diagnostics, def);
  validateCardSeatOrderMapping(diagnostics, def);
  validateTerminal(diagnostics, def, context);

  def.setup.forEach((effect, index) => {
    validateEffectAst(diagnostics, effect, `setup[${index}]`, context);
  });

  def.actions.forEach((action, actionIndex) => {
    validatePlayerSelector(diagnostics, action.actor, `actions[${actionIndex}].actor`, context);
    validatePlayerSelector(diagnostics, action.executor, `actions[${actionIndex}].executor`, context);

    if (!Array.isArray(action.phase) || action.phase.length === 0) {
      diagnostics.push({
        code: 'ACTION_PHASE_INVALID',
        path: `actions[${actionIndex}].phase`,
        severity: 'error',
        message: 'Action phase must be a non-empty array of phase ids.',
        suggestion: 'Set action.phase to a non-empty list of phase ids.',
      });
      return;
    }

    const phaseSeen = new Set<string>();
    for (const [phaseIndex, phaseId] of action.phase.entries()) {
      if (typeof phaseId !== 'string' || phaseId.trim() === '') {
        diagnostics.push({
          code: 'ACTION_PHASE_INVALID',
          path: `actions[${actionIndex}].phase[${phaseIndex}]`,
          severity: 'error',
          message: 'Action phase ids must be non-empty strings.',
          suggestion: 'Set each action.phase entry to a non-empty phase id string.',
        });
        continue;
      }
      if (phaseSeen.has(phaseId)) {
        diagnostics.push({
          code: 'ACTION_PHASE_DUPLICATE',
          path: `actions[${actionIndex}].phase[${phaseIndex}]`,
          severity: 'error',
          message: `Duplicate action phase "${phaseId}".`,
          suggestion: 'Keep each phase id unique within action.phase.',
        });
        continue;
      }
      phaseSeen.add(phaseId);
      if (phaseCandidates.includes(phaseId)) {
        continue;
      }
      pushMissingReferenceDiagnostic(
        diagnostics,
        'REF_PHASE_MISSING',
        `actions[${actionIndex}].phase[${phaseIndex}]`,
        `Unknown phase "${phaseId}".`,
        phaseId,
        phaseCandidates,
      );
    }

    action.params.forEach((param, paramIndex) => {
      validateOptionsQuery(diagnostics, param.domain, `actions[${actionIndex}].params[${paramIndex}].domain`, context);
    });

    if (action.pre) {
      validateConditionAst(diagnostics, action.pre, conditionSurfacePathForActionPre(actionIndex), context);
    }

    action.cost.forEach((effect, effectIndex) => {
      validateEffectAst(diagnostics, effect, `actions[${actionIndex}].cost[${effectIndex}]`, context);
    });
    action.effects.forEach((effect, effectIndex) => {
      validateEffectAst(diagnostics, effect, `actions[${actionIndex}].effects[${effectIndex}]`, context);
    });
  });

  validateActionPipelines(diagnostics, def, actionCandidates, context);

  const adjacencyGraph = buildAdjacencyGraph(def.zones);
  diagnostics.push(...validateAdjacency(adjacencyGraph, def.zones));

  validatePostAdjacencyBehavior(diagnostics, def, context, phaseCandidates, actionCandidates);

  return diagnostics;
};

export { validateInitialPlacementsAgainstStackingConstraints };
