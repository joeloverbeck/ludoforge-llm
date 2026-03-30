# Spec 98: Preview Pipeline RNG Tolerance

**Status**: Draft
**Priority**: P1
**Complexity**: M
**Dependencies**: Spec 93 (completed), Spec 95 (completed)
**Blocks**: None (independent, but unlocks richer agent evolution for all games)
**Estimated effort**: 3-5 days

## Problem Statement

Specs 93 and 95 fixed the template-vs-completed-move mismatch and added policy-guided completion. The preview pipeline now correctly looks up completed moves in `trustedMoveIndex` and calls `tryApplyPreview`. However, the preview **still returns `unknown`** for virtually all non-pass moves in games with complex effect chains (confirmed empirically in the FITL VC agent evolution campaign, 15 experiments post-specs 93-97).

The failure occurs at `policy-preview.ts:214`:

```typescript
if (!rngStatesEqual(previewState.rng, input.state.rng)) {
  return { kind: 'unknown', reason: 'random' };
}
```

This RNG-invariance check rejects ANY move whose effect execution changes the PRNG state — even when the RNG consumption is incidental (trigger dispatch bookkeeping, internal resolution paths) rather than semantic (dice rolls, random draws). In FITL, virtually every action pipeline touches RNG indirectly, making the preview surface inert for 100% of non-pass moves.

**Consequence**: The `preview.victory.currentMargin.self` surface (and all other preview refs) still resolve to `unknown` for all action candidates. The `projectedSelfMargin` feature falls back to the constant `selfMargin` via `coalesce`, providing zero candidate differentiation. The entire preview system designed in Spec 15, fixed in Spec 93, and guided in Spec 95 produces no value for complex games.

### Second Problem: Completion Guidance RNG Contamination

A separate but related issue: when completion guidance (`completionScoreTerms`) doesn't produce a positive score for an inner decision, the system falls back to random selection (`completion-guidance-choice.ts:122-123`). This consumes PRNG bits during the completion phase, making the completed move's RNG path diverge from a clean application of the same move against the original state.

Even for actions with no `rollRandom` effects (Rally, Tax, March), the completion fallback's RNG consumption can cause the preview RNG check to fail.

## Root Cause Analysis

Two independent issues compound:

1. **Over-strict RNG invariance**: The `rngStatesEqual` check treats ANY RNG divergence as disqualifying. But many RNG-consuming operations in effect chains are deterministic given the same params — they always consume the same number of RNG bits. The preview result is still valid and deterministic; the check is simply too conservative.

2. **Non-deterministic completion fallback**: When completion guidance has no matching score term for an inner decision, it falls back to `selectChoiceOptionValuesByLegalityPrecedence` which uses PRNG. This means completions for decisions without completion score terms are random, and the completed move's execution path may differ from a fresh application.

## Goals

- Make the preview surface produce values for completed moves in games with complex effect chains
- Maintain determinism: same state + same policy + same seed = identical agent decision
- Maintain visibility safety: preview must respect the `allowWhenHiddenSampling` contract
- Provide a clear opt-in mechanism so existing behavior is preserved for games that rely on strict RNG invariance
- Add a deterministic completion fallback mode that avoids PRNG consumption

## Non-Goals

- Multi-state preview (comparing outcomes across multiple random completions) — that's search, not preview
- Removing the RNG check entirely — it correctly identifies genuinely stochastic outcomes
- Making `rollRandom` effects previewable — those are inherently non-deterministic
- Changes to kernel effect execution or move enumeration

## FOUNDATIONS.md Alignment

| Principle | Alignment |
|-----------|-----------|
| **1. Engine Agnosticism** | No game-specific logic. Changes are in the agent layer (policy-preview, completion-guidance) and surface visibility config (YAML). |
| **2. Evolution-First** | Completion fallback mode and preview tolerance are declared in YAML `agents` section. Evolvable. |
| **5. Determinism** | Deterministic completion fallback (`ordinal`) ensures same completion every time. RNG-tolerant preview still produces deterministic results for the same completed move. |
| **6. Bounded Computation** | No new iteration. Preview applies one move, reads one state. Same cost as current. |
| **7. Immutability** | Preview already creates a new state object. No mutation. |
| **8. Compiler-Kernel Boundary** | Preview tolerance is agent-layer config compiled from YAML. No kernel changes. |
| **11. Testing as Proof** | Golden tests for preview outcomes, determinism tests for completion, property tests for RNG contamination. |

## Design

### Part A: Deterministic Completion Fallback

Extend the `completionGuidance` profile config to support a `fallback` mode:

```yaml
completionGuidance:
  enabled: true
  fallback: ordinal    # NEW: 'ordinal' | 'random' (default: 'random')
```

- `random` (current default): Falls back to PRNG-based selection when no completion score term produces a positive score. Consumes RNG bits.
- `ordinal`: Falls back to first legal option by ordinal position. Deterministic, consumes zero RNG bits. Produces consistent completions without needing score terms for every decision.

**Implementation**: In `completion-guidance-choice.ts`, when `bestScore <= 0`, check the profile's fallback mode. If `ordinal`, return the first option's value instead of `undefined` (which triggers the random fallback in `completeTemplateMove`).

### Part B: RNG-Tolerant Preview Mode

Extend the `agents.visibility.preview` surface config to support an RNG tolerance flag:

```yaml
agents:
  visibility:
    victory:
      currentMargin:
        preview:
          visibility: public
          allowWhenHiddenSampling: false
          allowWhenStochastic: true    # NEW: accept preview even if RNG diverges
```

When `allowWhenStochastic: true`:
- The preview surface applies the move and reads the resulting state, even if RNG diverged
- The preview outcome is tagged as `'stochastic'` (new outcome type) instead of `'unknown'`
- Policy expressions that reference stochastic previews get the computed value (not `unknown`)
- The `previewOutcome` metadata in agent decision traces records the stochastic tag for observability

When `allowWhenStochastic: false` (default, preserving current behavior):
- RNG divergence still returns `{ kind: 'unknown', reason: 'random' }` as today

**Why this is safe**: The move is already completed and fully resolved. Applying it is deterministic for THAT completion. The RNG divergence means other completions might produce different outcomes, but the agent isn't comparing across completions — it's scoring this one candidate. The value is deterministic for this candidate, just not invariant across hypothetical alternative completions.

### Part C: New Preview Outcome Type

Add `'stochastic'` to the `PolicyPreviewTraceOutcome` union:

```typescript
export type PolicyPreviewTraceOutcome = 'ready' | 'stochastic' | PolicyPreviewUnavailabilityReason;
```

The `tryApplyPreview` function becomes:

```typescript
function tryApplyPreview(trustedMove: TrustedExecutableMove): PreviewOutcome {
  // ... existing stateHash check ...
  try {
    const previewState = deps.applyMove(...).state;
    const rngDiverged = !rngStatesEqual(previewState.rng, input.state.rng);
    const observation = deps.derivePlayerObservation(...);
    return {
      kind: rngDiverged ? 'stochastic' : 'ready',
      state: previewState,
      requiresHiddenSampling: observation.requiresHiddenSampling,
      metricCache: new Map(),
      victorySurface: null,
    };
  } catch {
    return { kind: 'unknown', reason: 'failed' };
  }
}
```

The `resolveSurface` method then checks `allowWhenStochastic` before returning values from stochastic previews.

## Testing Requirements

1. **Determinism test**: Same state + same policy with `fallback: ordinal` produces identical completion and identical preview across repeated runs.
2. **Preview value test**: FITL Rally move produces a valid `preview.victory.currentMargin.self` value (not `unknown`) when `allowWhenStochastic: true`.
3. **Backward compatibility test**: Existing profiles without `allowWhenStochastic` still get `unknown` for RNG-divergent previews.
4. **Golden test**: Update `fitl-policy-summary.golden.json` to verify preview outcome type (`'stochastic'` vs `'ready'`).
5. **RNG contamination property test**: Completion with `fallback: ordinal` produces moves where the only RNG consumption comes from effect execution, not from decision resolution.
6. **Cross-game test**: Texas Hold'em preview behavior unchanged (it uses hidden information, different failure mode).

## Risks

- **Stochastic preview accuracy**: For moves with `rollRandom` effects, the preview shows ONE possible outcome, not the expected value. The policy might overweight a lucky roll outcome. Mitigation: `allowWhenStochastic` is opt-in per surface, so game authors control which surfaces tolerate stochastic previews.
- **Performance**: No regression expected — same number of move applications, just different return type.
- **V8 hidden class**: Adding a field to PreviewOutcome could cause deoptimization if the object shape changes. Mitigation: use a consistent shape (always include `kind`, `state`, etc.) regardless of stochastic status.
