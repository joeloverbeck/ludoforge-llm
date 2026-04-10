# Spec 124 — Phase 1 Best-of-N Representative Selection

- **Status**: COMPLETED
- **Priority**: High
- **Complexity**: Low-Medium
- **Dependencies**: Spec 63 (Phase 1 Preview for Template Operations) — completed

## Problem Statement

Spec 63 introduced Phase 1 representative preview: one template completion per action type, enabling preview-based discrimination between action types at Phase 1. The implementation selects the **first successful RNG completion** as the representative (`prepared.completedMoves[0]`). This is fast and deterministic but produces low-quality representatives that limit the agent's ability to distinguish between action types.

### Concrete Impact

In the FITL ARVN agent evolution campaign, candidate features that depend on preview state (e.g., projected opponent token counts, projected opponent margins) return **uniform values across all action types** because the randomly-selected representative for each action type happens to produce similar post-move states. For example:

| Action Type | Representative Target | Projected Self-Margin | Differentiation |
|---|---|---|---|
| Govern | random zone | -45 | none |
| Sweep | random zone (no VC presence) | -45 | none |
| Assault | random zone (no activated guerrillas) | -45 | none |
| Train | random zone | -45 | none |

Assault targeting a zone WITH activated VC guerrillas would project a higher margin (removal effect visible). Sweep targeting a zone WITH hidden guerrillas would project different activation states. But the first-successful-RNG completion picks zones randomly, often missing the zones where the action would have maximum impact.

The result: opponent-aware candidate features (projected margins, projected opponent infrastructure changes) cannot differentiate between action types. The agent cannot learn to prefer combat actions when enemy infrastructure is vulnerable because the representative completion doesn't demonstrate the combat action's potential.

### Root Cause

In `policy-agent.ts`, `buildPhase1ActionPreviewIndex` (line ~174):

```typescript
const representative = prepared.completedMoves[0]; // First successful completion
```

The completion budget is `phase1CompletionsPerAction` (default 1). With budget=1, `preparePlayableMoves` generates exactly one completion per action type. The representative is whatever zone/target the RNG happened to draw first.

### Why This Matters for Evolution

The agent policy DSL provides rich opponent-aware features (`preview.feature.vcGuerrillaCount`, `preview.victory.currentMargin.<seat>`, `globalTokenAgg` with preview). These features are architecturally supported but **practically useless** at Phase 1 because the random representative doesn't demonstrate the action's best-case impact. This blocks an entire category of agent evolution: defensive/opponent-disrupting strategies.

## Proposed Solution: Best-of-N Representative Selection

### Core Idea

Generate N>1 completions per action type in Phase 1, preview-evaluate each, and select the one that produces the **most favorable projected margin** as the representative. The existing `phase1CompletionsPerAction` config knob already exists — this spec changes what happens when N>1: instead of discarding all but the first, evaluate all N and keep the best.

### Design

#### 1. Generate N Completions Per Action Type

`buildPhase1ActionPreviewIndex` already passes `pendingTemplateCompletions: completionBudget` to `preparePlayableMoves`. When `phase1CompletionsPerAction > 1`, `preparePlayableMoves` already produces up to N completions in `prepared.completedMoves`. No change needed here.

#### 2. Preview-Evaluate All N Completions

After collecting completions for an action type, apply `applyTrustedMove()` to each and evaluate the profile's candidate features on the resulting state. Extract the projected self-margin (or a configurable ranking expression) from each. Note: `applyTrustedMove` is already called during Phase 1 preview evaluation (`policy-preview.ts:301`), so this is not a new dependency. The selection step follows the established best-of-N pattern from `greedy-agent.ts:73-88`.

```typescript
// Pseudocode for the selection step
const completions = prepared.completedMoves; // up to N
if (completions.length <= 1) {
  // Fast path: no selection needed (backward compatible)
  representative = completions[0];
} else {
  // Evaluate each completion's projected margin
  const scored = completions.map(move => ({
    move,
    projectedMargin: evaluatePreviewMargin(def, state, move, runtime),
  }));
  // Select the completion with the best projected margin
  representative = scored.reduce((best, cur) =>
    cur.projectedMargin > best.projectedMargin ? cur : best
  ).move;
}
```

#### 3. Ranking Criterion

The representative is selected by **maximizing the projected self-margin** (`victory.currentMargin.self` evaluated on the preview state). This is game-agnostic: every game with a victory formula has a self-margin. The agent sees the action type's best-case outcome, not a random outcome.

Alternative ranking criteria (projected opponent margin, composite scores) are deferred — self-margin is the simplest game-agnostic metric and aligns with the existing `projectedSelfMargin` candidate feature.

#### 4. Profile Configuration

The existing `phase1CompletionsPerAction` config controls this:

```yaml
profiles:
  arvn-evolved:
    preview:
      mode: exactWorld
      phase1: true
      phase1CompletionsPerAction: 3  # Generate 3, keep best
```

- `phase1CompletionsPerAction: 1` (default): Current behavior, first successful completion. No preview evaluation cost for selection.
- `phase1CompletionsPerAction: N` where N>1: Generate up to N, preview-evaluate each, select best projected margin.

No new config keys are needed. The behavioral change is: N>1 now means "best-of-N" instead of "first-of-N."

#### 5. Determinism

The selection is deterministic given the same RNG state:
- Same seed produces the same N completions (Foundation 8)
- Completions are evaluated in deterministic order
- Ties are broken by completion order (first encountered wins)
- The selected representative is deterministic

RNG consumption increases by a factor of N relative to N=1. This changes downstream RNG sequences for profiles that increase N. Per Foundation 14, all affected fixtures must be migrated in the same change.

#### 6. Performance Budget

Per completion: ~60-550 us (from Spec 63 analysis).
Preview evaluation per completion: `applyTrustedMove()` + margin extraction: ~50-200 us.
Total additional cost for N=3 over N=1: ~2 extra completions × ~300 us = ~600 us per action type.
For 8 action types: ~4.8 ms additional per decision point.
With ~30 decisions per game: ~144 ms per game.
Against a ~60-300 second game: <0.2% overhead.

### What This Unlocks

With best-of-3 selection, the representative for Assault would be the completion that targets the zone with the most enemy tokens (because removing them produces the best projected margin). The representative for Sweep would target the zone with the most hidden guerrillas. This makes opponent-aware features differentiate:

| Action Type | Best-of-3 Representative | Projected Self-Margin | Differentiation |
|---|---|---|---|
| Govern | best-margin zone | -45 | baseline |
| Sweep | zone with hidden VC | -43 (activation effect improves margin) | partial |
| Assault | zone with activated VC | -40 (removal effect improves margin) | strong |
| Train | best-margin zone | -45 | baseline |

The agent can now learn: "Assault improves projected self-margin by 5 points in preview, while Govern doesn't change it. When enemy presence is high, prefer Assault."

## Alignment with FOUNDATIONS.md

| Foundation | Alignment |
|---|---|
| **1. Engine Agnosticism** | Selection criterion is `victory.currentMargin.self` — every game has this. No game-specific logic. |
| **7. Specs Are Data** | Controlled by existing `phase1CompletionsPerAction` YAML config. No new code paths exposed. |
| **8. Determinism** | Same seed + same N = same completions = same selection = same result. Tie-breaking by completion order. |
| **10. Bounded Computation** | N is profile-configured with a compile-time validated positive integer. Max attempts per action bounded by `N + NOT_VIABLE_RETRY_CAP`. |
| **11. Immutability** | `applyTrustedMove()` returns new state. No mutation. |
| **14. No Backwards Compat** | N=1 retains current behavior (fast path, no preview evaluation for selection). N>1 is opt-in. Fixture migration required for profiles that change N. |
| **15. Architectural Completeness** | Addresses the root cause (random representative selection) rather than working around it with game-specific heuristics. |
| **16. Testing as Proof** | Determinism proven by same-seed tests. Selection quality proven by asserting that best-of-N projected margin >= first-of-N projected margin. |

## Artifacts

| Artifact | Changes |
|---|---|
| `packages/engine/src/agents/policy-agent.ts` | `buildPhase1ActionPreviewIndex`: add preview evaluation and best-of-N selection when `completionBudget > 1` |
| `packages/engine/src/agents/policy-preview.ts` | Export existing `getSeatMargin()` helper (currently private at line 421) for reuse in selection step |
| `packages/engine/test/unit/agents/` | Tests: best-of-N selects higher-margin completion; N=1 retains first-of behavior; determinism across runs |
| `packages/engine/test/integration/phase1-preview-differentiation.test.ts` | Extend existing test (already has `projectedSelfMarginContribution` helper and `Phase1Witness` interface): add best-of-3 case asserting different projected margins per action type |

## Non-Goals

- **Custom ranking expressions**: The ranking criterion is fixed to projected self-margin. Configurable ranking (e.g., maximize opponent margin reduction, composite scores) is future work.
- **Adaptive N per action type**: All action types use the same N. Future work could use different budgets for action types that benefit more from exploration.
- **Phase 2 changes**: Phase 2 already generates multiple completions with full evaluation. This spec only changes Phase 1 representative selection.

## Success Criteria

1. With `phase1CompletionsPerAction: 3`, opponent-aware candidate features (e.g., features referencing `preview.victory.currentMargin.<seat>`) produce different values for at least 2 action types at the same decision point in FITL.
2. The selected representative has projected self-margin >= the first-of-N representative's margin (best-of-N is never worse than first-of-N).
3. All engine tests pass after fixture migration.
4. Determinism tests confirm same-seed reproducibility.
5. Performance overhead < 5% of per-decision time for N=3.

## Outcome

- Completed: 2026-04-10
- What landed:
  - `packages/engine/src/agents/policy-agent.ts` now keeps the existing `N=1` fast path and, for `phase1CompletionsPerAction > 1`, selects the completion with the best projected `victory.currentMargin.self` as the Phase 1 representative.
  - `packages/engine/src/agents/policy-preview.ts` exports `getSeatMargin()` for reuse by representative selection.
  - Unit coverage was added for `N=1` backward compatibility, best-of-N selection, determinism, and deterministic tie-breaking.
  - FITL integration coverage was extended to prove a bounded ARVN witness where best-of-3 differentiates template action types and keeps projected margins at least as strong as first-of-1 at the same seed/ply.
- Deviations from original plan:
  - No production performance benchmark gate was added in this implementation slice; the existing informational overhead test remains skipped.
  - Delivery was split across `124PHABESREP-001` for engine behavior and `124PHABESREP-002` for the FITL integration proof.
- Verification:
  - `pnpm -F @ludoforge/engine build`
  - `pnpm -F @ludoforge/engine exec node dist/test/unit/agents/policy-agent.test.js`
  - `pnpm -F @ludoforge/engine exec node dist/test/integration/phase1-preview-differentiation.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo test`
