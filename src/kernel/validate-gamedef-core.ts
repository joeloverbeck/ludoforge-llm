import type { Diagnostic } from './diagnostics.js';
import { buildAdjacencyGraph, validateAdjacency } from './spatial.js';
import type { GameDef } from './types.js';
import { validateConditionAst, validateEffectAst, validateOptionsQuery, validatePostAdjacencyBehavior } from './validate-gamedef-behavior.js';
import { validateActionPipelines, validateCoupPlan, validateTerminal } from './validate-gamedef-extensions.js';
import {
  buildValidationContext,
  pushMissingReferenceDiagnostic,
  validatePlayerSelector,
  validateInitialPlacementsAgainstStackingConstraints,
  validateStructureSections,
} from './validate-gamedef-structure.js';

export const validateGameDef = (def: GameDef): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];

  validateStructureSections(diagnostics, def);

  const { context, phaseCandidates, actionCandidates } = buildValidationContext(def);

  validateCoupPlan(diagnostics, def);
  validateTerminal(diagnostics, def, context);

  def.setup.forEach((effect, index) => {
    validateEffectAst(diagnostics, effect, `setup[${index}]`, context);
  });

  def.actions.forEach((action, actionIndex) => {
    validatePlayerSelector(diagnostics, action.actor, `actions[${actionIndex}].actor`, context);
    validatePlayerSelector(diagnostics, action.executor, `actions[${actionIndex}].executor`, context);

    const actionPhases = Array.isArray(action.phase) ? action.phase : [action.phase];
    for (const [phaseIndex, phaseId] of actionPhases.entries()) {
      if (phaseCandidates.includes(phaseId)) {
        continue;
      }
      pushMissingReferenceDiagnostic(
        diagnostics,
        'REF_PHASE_MISSING',
        Array.isArray(action.phase) ? `actions[${actionIndex}].phase[${phaseIndex}]` : `actions[${actionIndex}].phase`,
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
