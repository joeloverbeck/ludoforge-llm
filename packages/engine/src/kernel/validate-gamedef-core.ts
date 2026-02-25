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
  validateStructureSections,
} from './validate-gamedef-structure.js';

export const validateGameDef = (def: GameDef): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];

  validateStructureSections(diagnostics, def);

  const { context, phaseCandidates, actionCandidates } = buildValidationContext(def);
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
      validateConditionAst(diagnostics, action.pre, `actions[${actionIndex}].pre`, context);
    }

    action.cost.forEach((effect, effectIndex) => {
      validateEffectAst(diagnostics, effect, `actions[${actionIndex}].cost[${effectIndex}]`, context);
    });
    action.effects.forEach((effect, effectIndex) => {
      validateEffectAst(diagnostics, effect, `actions[${actionIndex}].effects[${effectIndex}]`, context);
    });
  });

  validateActionPipelines(diagnostics, def, actionCandidates);

  const adjacencyGraph = buildAdjacencyGraph(def.zones);
  diagnostics.push(...validateAdjacency(adjacencyGraph, def.zones));

  validatePostAdjacencyBehavior(diagnostics, def, context, phaseCandidates, actionCandidates);

  return diagnostics;
};

export { validateInitialPlacementsAgainstStackingConstraints };
