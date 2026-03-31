# Spec 98: Preview Pipeline RNG Tolerance

**Status**: Draft
**Priority**: P1
**Complexity**: M
**Dependencies**: Spec 93 (completed), Spec 95 (completed)
**Blocks**: None (independent, but unlocks richer agent evolution for all games)
**Estimated effort**: 2-3 days

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

### Completion Guidance RNG Contamination (Already Solved)

A separate but related issue was previously identified: when completion guidance doesn't produce a positive score for an inner decision, the system could fall back to random selection, consuming PRNG bits and causing the preview RNG check to fail even for actions with no `rollRandom` effects.

**This is already solved.** The codebase has `completionGuidance.fallback: 'first'` (`policy-contract.ts:31`, `completion-guidance-choice.ts:125`), which returns the first legal option deterministically without consuming RNG bits. Profiles that want deterministic completion need only set:

```yaml
completionGuidance:
  enabled: true
  fallback: first
```

No new code is needed for this part.

## Root Cause Analysis

The single remaining issue:

**Over-strict RNG invariance**: The `rngStatesEqual` check treats ANY RNG divergence as disqualifying. But many RNG-consuming operations in effect chains are deterministic given the same params — they always consume the same number of RNG bits. The preview result is still valid and deterministic for that specific completed move; the check is simply too conservative.

The preview pipeline correctly applies a fully completed, trusted move to the current state and reads the resulting values. The fact that the PRNG state changed during effect execution does not make the result non-deterministic — it IS deterministic for that completion. The RNG check conflates "the PRNG was touched" with "the outcome is random", which are different things.

## Goals

- Make the preview surface produce values for completed moves in games with complex effect chains
- Maintain determinism: same state + same policy + same seed = identical agent decision
- Maintain visibility safety: preview must respect the `allowWhenHiddenSampling` contract
- Provide a clear opt-in mechanism so existing behavior is preserved by default
- Record stochastic preview outcomes in traces for observability

## Non-Goals

- Multi-state preview (comparing outcomes across multiple random completions) — that's search, not preview
- Removing the RNG check entirely — it correctly identifies genuinely stochastic outcomes when the flag is off
- Making `rollRandom` effects previewable in the "expected value" sense — the preview shows ONE outcome
- Changes to kernel effect execution or move enumeration
- Per-surface RNG tolerance flags — RNG divergence is per-move, not per-surface (see Design Rationale)

## FOUNDATIONS.md Alignment

| Principle | Alignment |
|-----------|-----------|
| **F1. Engine Agnosticism** | No game-specific logic. Changes are in the agent layer (`policy-preview.ts`, `compile-agents.ts`) and profile YAML. |
| **F2. Evolution-First** | `preview.tolerateRngDivergence` is a single YAML field — one mutation target for the evolution pipeline. Simpler than per-surface flags. |
| **F5. Determinism** | A completed move applied to a given state always produces the same result. The preview value is deterministic for that candidate. Same seed + same policy + same state = same agent decision. |
| **F6. Bounded Computation** | No new iteration. Preview applies one move, reads one state. Same cost as current. |
| **F7. Immutability** | Preview already creates a new state object via `applyMove`. No mutation. |
| **F8. Compiler-Kernel Boundary** | Preview tolerance is agent-layer config compiled from YAML. No kernel changes. |
| **F11. Testing as Proof** | Golden tests for preview outcomes, determinism tests for repeated runs, backward compatibility tests for default behavior. |

## Design

### Design Rationale: Profile-Level vs Per-Surface

The existing `allowWhenHiddenSampling` is per-surface because different surfaces have genuinely different risk profiles for hidden information access (globalVars are public, victory margins are hidden). RNG divergence is fundamentally different — it's a per-move property (the effect chain either touched PRNG or it didn't), not a per-surface one. In FITL, where virtually every action touches RNG, per-surface flags would require setting `allowWhenStochastic: true` on every surface — pure boilerplate with no selectivity value.

A single profile-level flag is:
- **Simpler YAML** — one field vs N surface fields
- **More evolvable** — one mutation target (F2)
- **Architecturally honest** — matches the actual granularity of the problem (per-move, not per-surface)

### Part A: Profile-Level RNG Tolerance Flag

Add a `preview` config section to the agent profile:

```yaml
profiles:
  vc-agent:
    preview:
      tolerateRngDivergence: true    # NEW: default false
    completionGuidance:
      enabled: true
      fallback: first
    # ... rest of profile
```

**Type change** in `types-core.ts`:

```typescript
export interface PreviewToleranceConfig {
  readonly tolerateRngDivergence: boolean;
}

export interface CompiledAgentProfile {
  // ... existing fields ...
  readonly preview?: PreviewToleranceConfig;
}
```

**Schema** in `schemas-core.ts`:

```typescript
preview: z.object({
  tolerateRngDivergence: BooleanSchema,
}).strict().optional(),
```

**Compilation** in `compile-agents.ts`: Read `preview.tolerateRngDivergence` from the authored profile YAML, default to `false`.

### Part B: Stochastic Preview Outcome Type

Add `'stochastic'` to the preview outcome types:

```typescript
// policy-preview.ts
export type PolicyPreviewUnavailabilityReason = 'random' | 'hidden' | 'unresolved' | 'failed';
export type PolicyPreviewTraceOutcome = 'ready' | 'stochastic' | PolicyPreviewUnavailabilityReason;
```

Extend the internal `PreviewOutcome` discriminated union:

```typescript
type PreviewOutcome =
  | {
      readonly kind: 'ready';
      readonly state: GameState;
      readonly requiresHiddenSampling: boolean;
      readonly metricCache: Map<string, number>;
      victorySurface: PolicyVictorySurface | null;
    }
  | {
      readonly kind: 'stochastic';
      readonly state: GameState;
      readonly requiresHiddenSampling: boolean;
      readonly metricCache: Map<string, number>;
      victorySurface: PolicyVictorySurface | null;
    }
  | {
      readonly kind: 'unknown';
      readonly reason: PolicyPreviewUnavailabilityReason;
    };
```

### Part C: `tryApplyPreview` Change

The `tryApplyPreview` function changes to return `'stochastic'` instead of `'unknown'` when RNG diverges and the profile tolerates it:

```typescript
function tryApplyPreview(trustedMove: TrustedExecutableMove): PreviewOutcome {
  if (trustedMove.sourceStateHash !== input.state.stateHash) {
    return { kind: 'unknown', reason: 'failed' };
  }

  try {
    const previewState = deps.applyMove(
      input.def,
      input.state,
      trustedMove,
      undefined,
      input.runtime,
    ).state;
    const rngDiverged = !rngStatesEqual(previewState.rng, input.state.rng);

    if (rngDiverged && !tolerateRngDivergence) {
      return { kind: 'unknown', reason: 'random' };
    }

    const observation = deps.derivePlayerObservation(input.def, previewState, input.playerId);
    return {
      kind: rngDiverged ? 'stochastic' : 'ready',
      state: previewState,
      requiresHiddenSampling: observation.requiresHiddenSampling,
      metricCache: new Map<string, number>(),
      victorySurface: null,
    };
  } catch {
    return { kind: 'unknown', reason: 'failed' };
  }
}
```

The `tolerateRngDivergence` boolean is passed into `createPolicyPreviewRuntime` via the input, sourced from the resolved profile's `preview?.tolerateRngDivergence ?? false`.

### Part D: `resolveSurface` Change

The `resolveSurface` method treats `'stochastic'` outcomes identically to `'ready'` — the state is valid, the values are readable. The only difference is the trace tag:

```typescript
function resolveSurface(...): PolicyPreviewSurfaceResolution {
  const preview = getPreviewOutcome(candidate);
  if (preview.kind !== 'ready' && preview.kind !== 'stochastic') {
    return { kind: 'unknown', reason: preview.reason };
  }
  // ... rest of surface resolution (unchanged) ...
}
```

The `toPreviewTraceOutcome` function naturally handles `'stochastic'` since it's now in the `PreviewOutcome.kind` union.

### Input Threading

`createPolicyPreviewRuntime` needs the tolerance flag. The `CreatePolicyPreviewRuntimeInput` interface gains:

```typescript
export interface CreatePolicyPreviewRuntimeInput {
  // ... existing fields ...
  readonly tolerateRngDivergence?: boolean;  // NEW, default false
}
```

The call site in the policy evaluation pipeline (`policy-agent.ts` or `policy-evaluation-core.ts`) passes `profile.preview?.tolerateRngDivergence ?? false`.

## Files Modified

| File | Change |
|------|--------|
| `packages/engine/src/kernel/types-core.ts` | Add `PreviewToleranceConfig` interface, add `preview?` field to `CompiledAgentProfile` |
| `packages/engine/src/kernel/schemas-core.ts` | Add `preview` schema to profile schema |
| `packages/engine/src/contracts/policy-contract.ts` | Add `AGENT_POLICY_PREVIEW_KEYS` constant |
| `packages/engine/src/cnl/compile-agents.ts` | Compile `preview.tolerateRngDivergence` from YAML |
| `packages/engine/src/cnl/validate-agents.ts` | Validate the new field |
| `packages/engine/src/agents/policy-preview.ts` | Add `'stochastic'` to outcome types, change `tryApplyPreview` and `resolveSurface`, accept `tolerateRngDivergence` in input |
| `packages/engine/src/agents/policy-evaluation-core.ts` | Thread `tolerateRngDivergence` from profile to preview runtime |
| `packages/engine/src/agents/policy-agent.ts` | Pass profile's preview config when creating preview runtime |

## Testing Requirements

1. **Determinism test**: Same state + same policy with `tolerateRngDivergence: true` produces identical preview values and agent decisions across repeated runs.
2. **Preview value test**: FITL Rally move produces a valid `preview.victory.currentMargin.self` value (not `unknown`) when `tolerateRngDivergence: true` and `completionGuidance.fallback: 'first'`.
3. **Backward compatibility test**: Profiles without `preview` or with `tolerateRngDivergence: false` still get `{ kind: 'unknown', reason: 'random' }` for RNG-divergent previews — no behavioral change.
4. **Stochastic trace test**: When `tolerateRngDivergence: true` and RNG diverges, the preview trace records `'stochastic'` (not `'ready'` or `'unknown'`).
5. **Golden test**: Update `fitl-policy-summary.golden.json` to verify preview outcome type.
6. **Cross-game test**: Texas Hold'em preview behavior unchanged (it uses hidden information, different failure mode).
7. **Compilation test**: Profile YAML with `preview: { tolerateRngDivergence: true }` compiles correctly. Missing field defaults to `false`.

## Risks

- **Stochastic preview accuracy**: For moves with `rollRandom` effects, the preview shows ONE possible outcome, not the expected value. The policy might overweight a lucky roll outcome. Mitigation: `tolerateRngDivergence` is opt-in per profile, and game authors can pair it with `completionGuidance.fallback: 'first'` to minimize random variation in completions.
- **Performance**: No regression expected — same number of move applications, just different return type.
- **V8 hidden class**: Adding a `'stochastic'` variant to `PreviewOutcome` could cause deoptimization if the object shape changes. Mitigation: `'stochastic'` uses the same shape as `'ready'` (state, requiresHiddenSampling, metricCache, victorySurface), only the `kind` tag differs.
