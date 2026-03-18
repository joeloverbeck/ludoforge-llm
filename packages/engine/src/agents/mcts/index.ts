export { sampleBeliefState } from './belief.js';
export type { BeliefSample } from './belief.js';

export { DEFAULT_MCTS_CONFIG, MCTS_PRESETS, MCTS_PRESET_NAMES, validateMctsConfig, resolvePreset, BUDGET_PROFILES, BUDGET_PROFILE_NAMES, resolveBudgetProfile } from './config.js';
export type { MctsConfig, MctsPreset, LeafEvaluator, WideningMode, MctsBudgetProfile, FallbackPolicy } from './config.js';

export { canonicalMoveKey, familyKey, abstractMoveKey } from './move-key.js';
export type { MoveKey } from './move-key.js';

export { createRootNode, createChildNode, createDecisionChildNode } from './node.js';
export type { MctsNode, ProvenResult } from './node.js';

export { selectChild } from './isuct.js';

export { maxChildren, shouldExpand, selectExpansionCandidate } from './expansion.js';
export type { ConcreteMoveCandidate } from './expansion.js';

export { classifyMovesForSearch, materializeMovesForRollout, filterAvailableCandidates, classifySingleMove } from './materialization.js';
export type { MoveClassification, SingleMoveClassificationKind } from './materialization.js';

export { createNodePool } from './node-pool.js';
export type { NodePool } from './node-pool.js';

export { rollout, simulateToCutoff } from './rollout.js';
export type { SimulationResult } from './rollout.js';

export { terminalToRewards, sigmoid, evaluateForAllPlayers } from './evaluate.js';
export type { EvalDiagnosticsOut } from './evaluate.js';

export { createMastStats, updateMastStats, mastSelectMove } from './mast.js';
export type { MastStats, MastEntry } from './mast.js';

export { backpropagate, runOneIteration, runSearch, selectRootDecision } from './search.js';

export { canActivateSolver, updateSolverResult, selectSolverAwareChild } from './solver.js';

export {
  createStateInfoCache, evictIfNeeded,
  getOrComputeTerminal, getOrComputeLegalMoves, getOrComputeRewards, getOrComputeClassification,
  initClassificationEntry, classifyNextCandidate, classifySpecificMove,
  getClassifiedMovesByStatus, exhaustClassificationToLegacy,
  getRepresentedFamilies, countByFamily,
} from './state-cache.js';
export type {
  CachedStateInfo, StateInfoCache,
  ClassificationStatus, CachedLegalMoveInfo, CachedClassificationEntry,
} from './state-cache.js';

export { collectDiagnostics, createAccumulator, recordHeuristicEvalSpread } from './diagnostics.js';
export type { MctsSearchDiagnostics, MutableDiagnosticsAccumulator } from './diagnostics.js';

export type {
  MctsSearchEvent,
  MctsSearchStartEvent,
  MctsIterationBatchEvent,
  MctsExpansionEvent,
  MctsDecisionNodeCreatedEvent,
  MctsDecisionCompletedEvent,
  MctsDecisionIllegalEvent,
  MctsMoveDroppedEvent,
  MctsApplyMoveFailureEvent,
  MctsPoolExhaustedEvent,
  MctsSearchCompleteEvent,
  MctsRootCandidatesEvent,
  MctsSearchVisitor,
} from './visitor.js';

export { decisionNodeKey, templateDecisionRootKey } from './decision-key.js';

export { expandDecisionNode } from './decision-expansion.js';
export type {
  DecisionExpansionContext,
  DecisionExpansionResult,
  DecisionExpandedResult,
  DecisionCompleteResult,
  DecisionIllegalResult,
  DecisionStochasticResult,
  DecisionPoolExhaustedResult,
  DiscoverChoicesFn,
} from './decision-expansion.js';

export { MctsAgent } from './mcts-agent.js';
