# Spec 63 — Phase 1 Preview for Template Operations

## Problem Statement

PolicyAgent evaluates candidate moves in two phases. Phase 1 scores ALL candidates but **explicitly skips preview-class features** (`costClass: 'preview'`) because template operations — the majority of legal moves in most games — have unresolved sub-decisions and cannot be previewed. Only the Phase 1 winner's action type gets template-completed and preview-evaluated in Phase 2.

This creates a critical blindness: Phase 1 cannot discriminate between operations based on projected game-state outcomes. The `projectedSelfMargin` candidate feature (which uses `preview.victory.currentMargin.self`) returns the same fallback value for all template operations. The only differentiators in Phase 1 are action-type weights — flat bonuses per action type that are fixed per profile, regardless of game state.

### Concrete Impact

In the FITL ARVN agent evolution campaign, all 5 tested seeds produce **identical game traces** regardless of weight tuning. The scoring breakdown for ARVN's first decision shows:

| Candidate | projectedSelfMargin | Action weight | Total |
|-----------|-------------------|---------------|-------|
| Govern | -45 (fallback) | +5 | -39.6 |
| Train | -45 (fallback) | +4 | -40.6 |
| Event | -45 (preview works) | +1.5 | -43.1 |
| Patrol | -45 (fallback) | +1 | -43.6 |

Every operation gets `-45` from `projectedSelfMargin` because preview returns `undefined` → coalesce falls back to `feature.selfMargin` (current margin, shared across all candidates). Only events get actual preview values because they are fully specified moves with no sub-decisions.

The agent cannot learn that "Govern in this game state improves margin by +3" while "Train improves margin by +1" — it just sees the same `-15` margin for both and picks Govern because `governWeight > trainWeight`.

### Root Cause

In `policy-eval.ts` (line ~430):

```typescript
if (feature?.costClass === 'preview') {
  continue; // Skip preview features in Phase 1
}
```

Template operations are classified as `'rejected'` with `previewFailureReason: 'notDecisionComplete'` in Phase 1 because they cannot be applied to game state without resolving their sub-decisions first. Preview requires `applyTrustedMove()` which needs a fully specified `TrustedExecutableMove`.

### Why Phase 2 Works

Phase 2 completes templates for the Phase 1 winner's action ID only:
- `preparePlayableMoves()` generates 3 random completions (default `DEFAULT_COMPLETIONS_PER_TEMPLATE = 3`)
- Each completion resolves sub-decisions via RNG draws and constraint checking
- The completed moves can be applied and previewed
- Phase 2 evaluates WITH preview features, selecting the best completion

## Proposed Solution: Phase 1 Representative Preview

### Core Idea

Complete **one template per action type** in Phase 1 to enable preview-based discrimination between action types. This is a lightweight, bounded extension of the existing template completion mechanism.

### Design

#### 1. Phase 1 Template Completion Budget

Add a configurable budget for Phase 1 template completions:

```typescript
// In PolicyAgent or profile configuration
phase1CompletionsPerAction: number; // Default: 1 (one representative per action type)
```

Before Phase 1 scoring, for each unique action ID among template candidates:
1. Attempt one template completion using the existing `evaluatePlayableMoveCandidate()` mechanism
2. If successful, add the completed move to a Phase 1 trusted move index
3. If completion fails (unsatisfiable constraints), the action type retains fallback scoring

This is bounded: at most `|unique action IDs|` completions (typically 5-10 action types).

#### 2. Phase 1 Preview Evaluation

Remove the `costClass === 'preview'` skip for candidates that have a successful Phase 1 completion:

```typescript
for (const candidate of activeCandidates) {
  for (const featureId of profile.plan.candidateFeatures) {
    const feature = catalog.library.candidateFeatures[featureId];
    if (feature?.costClass === 'preview' && !hasPhase1Completion(candidate)) {
      continue; // Still skip for candidates without completion
    }
    evaluation.evaluateCandidateFeature(candidate, featureId);
  }
}
```

Candidates with Phase 1 completions get actual preview values. Others retain fallback behavior (coalesce to current state features).

#### 3. Phase 1 Representative Selection

For each action type with multiple legal move variants:
- Complete one representative variant
- Use its preview values for ALL candidates of that action type in Phase 1

This is an approximation: the representative's preview values stand in for the best possible target choice. Phase 2 still refines the winner with multiple completions and full preview re-evaluation.

#### 4. Phase 2 Unchanged

Phase 2 remains identical: re-complete the Phase 1 winner's action type with multiple completions and full preview evaluation. The Phase 1 preview is a rough discriminator; Phase 2 is the precise evaluator.

### Determinism Considerations

**RNG consumption**: Phase 1 completions consume RNG state before Phase 1 scoring. This changes the RNG sequence for all downstream operations compared to the current behavior.

Requirements:
- **Same seed = same completions** (deterministic, per Foundation 8)
- **Completion order is deterministic**: iterate action IDs in stable sorted order
- **RNG budget is bounded**: at most `|unique action IDs|` completions, each bounded by `NOT_VIABLE_RETRY_CAP` (currently 7) (per Foundation 10)
- **No backward compatibility shim**: existing profiles that don't use preview features are unaffected in scoring, but their RNG sequence changes. Per Foundation 14, migrate all affected fixtures in the same change.

### Performance Budget

Estimated cost per Phase 1 completion:
- Template completion: 1-3 RNG draws + constraint checks (~10-50 us)
- Preview evaluation: `applyTrustedMove()` + surface resolution (~50-500 us)
- Total per action type: ~60-550 us
- Total for 8 action types: ~0.5-4.5 ms

For comparison, the current Phase 2 does 3 completions of 1 action type (~0.2-1.5 ms). Phase 1 preview adds roughly 2-3x the current Phase 2 cost. In the FITL campaign, games run in ~1-5 minutes with ~30 agent decisions; the added cost is negligible (<0.1% of total game time).

### Profile Opt-In

Phase 1 preview is opt-in via profile configuration:

```yaml
profiles:
  arvn-evolved:
    observer: currentPlayer
    preview:
      mode: tolerateStochastic
      phase1: true              # NEW: enable Phase 1 representative preview
      phase1CompletionsPerAction: 1  # NEW: completions per action type (default 1)
```

Profiles without `phase1: true` retain the current Phase 1 behavior (no preview features evaluated). This ensures zero impact on existing profiles and games.

## Alignment with FOUNDATIONS.md

| Foundation | Alignment |
|-----------|-----------|
| **1. Engine Agnosticism** | No game-specific logic. Phase 1 preview uses the same generic template completion and preview evaluation as Phase 2. |
| **7. Specs Are Data** | The feature is configured via declarative YAML profile settings, not code. |
| **8. Determinism** | Same seed = same Phase 1 completions = same Phase 1 scores = same result. RNG consumption changes but remains deterministic. Fixture migration required. |
| **10. Bounded Computation** | Phase 1 completions bounded by `|unique action IDs|` x `NOT_VIABLE_RETRY_CAP`. No unbounded iteration. |
| **11. Immutability** | Preview uses `applyTrustedMove()` which returns new state. No mutation. |
| **14. No Backwards Compat** | No compatibility shim. Existing profiles unaffected (opt-in). Fixture migration for any profile that enables Phase 1 preview. |
| **15. Architectural Completeness** | Addresses the root cause (Phase 1 preview blindness) rather than working around it with action-type weight tuning. |
| **16. Testing as Proof** | Determinism proven by same-seed replay tests. Preview correctness proven by asserting Phase 1 preview values match Phase 2 preview values for the same completion. |

## Artifacts

| Artifact | Changes |
|----------|---------|
| `packages/engine/src/agents/policy-agent.ts` | Add Phase 1 completion step before Phase 1 scoring |
| `packages/engine/src/agents/policy-eval.ts` | Conditionally evaluate preview features in Phase 1 for completed candidates |
| `packages/engine/src/agents/prepare-playable-moves.ts` | Support Phase 1 completion budget (one per action type) |
| `packages/engine/src/kernel/types.ts` | Add `phase1` and `phase1CompletionsPerAction` to agent preview config types |
| `packages/engine/src/cnl/compile-agents.ts` | Compile new profile preview fields |
| `packages/engine/src/cnl/validate-agents.ts` | Validate new profile preview fields |
| `packages/engine/schemas/` | Update schema artifacts for new preview config |
| `packages/engine/test/unit/agents/` | Tests for Phase 1 preview: determinism, scoring impact, opt-in behavior |

## Non-Goals

- **Completing ALL template variants per action type in Phase 1**: This would create combinatorial explosion. One representative per action type is sufficient for rough discrimination.
- **Removing Phase 2**: Phase 2 remains essential for fine-grained target selection within the winning action type.
- **Making preview work for stochastic operations**: Operations with random outcomes (dice rolls, card draws) continue to use `tolerateStochastic` fallbacks. This spec only addresses template operations with deterministic sub-decisions.
- **Changing the representative selection heuristic**: The first successful completion is used as the representative. Future work could use heuristic target selection (e.g., highest-population zone) for better representatives.

## Success Criteria

1. Phase 1 candidate scores for template operations vary based on projected outcomes when `phase1: true`
2. The FITL ARVN agent produces different action distributions on at least some seeds (traces are no longer locked)
3. All engine tests pass after fixture migration
4. Determinism tests confirm same-seed reproducibility
5. No measurable regression in game simulation throughput (< 5% increase in per-decision time)
