# Spec 113 — Preview-State Policy Surface

## Status

Proposed

## Priority

Medium

## Complexity

Medium

## Dependencies

- `specs/15-gamespec-agent-policy-ir.md`
- `archive/specs/111-multi-step-preview-for-granted-operations.md`
- `specs/112-global-marker-policy-surface.md`

## Problem

The policy preview system can already simulate a candidate move and resolve a narrow set of post-move references:

- `preview.victory.currentMargin.*`
- `preview.victory.currentRank.*`
- `preview.var.global.*`
- `preview.var.player.*`
- preview-visible derived metrics
- preview-visible active-card metadata and annotations

That is enough when the move's value appears immediately in victory margin or a small number of exposed vars.

It is not enough when the move's value is expressed through broader post-move board state:

- extra guerrillas or bases placed by a granted Rally
- changed token posture after March, Infiltrate, Air Lift, or Sweep/Assault sequences
- marker state changes that become meaningful only when combined with other state features
- any authored policy state feature that is meaningful on the previewed state but currently only exists for the current state

This surfaced during Spec 111 validation. Multi-step granted-operation preview now works mechanically, but several real FITL granting-event candidates still score identically to the single-step baseline because the policy profile cannot reuse its authored board-state heuristics against the previewed post-event-plus-operation state.

The current gap is therefore not only "preview depth"; it is also "preview-observable policy surface."

## Goals

1. Let policy scoring reuse authored state features against previewed post-move state
2. Keep the mechanism generic and game-agnostic
3. Preserve determinism and bounded computation
4. Avoid duplicating the expression system with separate preview-only DSL constructs

## Non-Goals

- No arbitrary N-step planning beyond the bounded preview systems that already exist
- No game-specific heuristics in engine code
- No implicit strategy changes; profiles still decide what to value
- No backwards-compatibility shim layer for old preview refs

## FOUNDATIONS Alignment

| Foundation | Alignment |
|-----------|-----------|
| 1 — Engine Agnosticism | Generic preview-state observation for any game, not FITL-specific |
| 2 — Evolution-First | Lets evolution attach weights to meaningful post-move state features |
| 8 — Determinism | Preview-state feature evaluation remains a pure function of preview state |
| 10 — Bounded Computation | Reuses existing bounded feature evaluation; no unbounded search |
| 15 — Architectural Completeness | Closes the gap where preview simulates the move correctly but scoring cannot observe the resulting board state |

## Scope

### What to Change

**1. Add preview-scoped state-feature references**

Extend the policy surface so candidate expressions can reference authored library state features against the previewed state:

```yaml
candidateFeatures:
  projectedVcGuerrillaCount:
    type: number
    expr:
      coalesce:
        - { ref: preview.feature.vcGuerrillaCount }
        - { ref: feature.vcGuerrillaCount }
```

This reuses the already-authored `stateFeatures` library instead of inventing parallel preview-only aggregates.

**2. Evaluate referenced state features against the preview state**

When a candidate expression references `preview.feature.<id>`, evaluate the corresponding compiled state-feature expression using the previewed post-move state, not the current state.

This should support the same expression power the feature already has today, including:

- token aggregates
- zone properties
- global and per-player vars
- derived metrics
- current-turn metadata
- future `globalMarker.*` refs from Spec 112

**3. Keep visibility and preview failure semantics consistent**

If preview cannot resolve because the move is stochastic, hidden, unresolved, or failed, `preview.feature.<id>` should resolve like existing preview refs do today:

- unavailable preview -> `undefined`
- profile authors use `coalesce` explicitly
- no silent fallback inside the engine

**4. Keep feature ownership DRY**

Do not require authors to define both:

- `feature.vcGuerrillaCount`
- `preview.feature.vcGuerrillaCount`

There should be one authored feature definition and two evaluation contexts:

- current state
- preview state

**5. Thread the new family through diagnostics**

Preview usage and unknown-preview reporting should include preview-feature refs just like existing preview ref families, so the trace surface stays audit-friendly.

## Mutable Files

- `packages/engine/src/agents/policy-expr.ts` — parse `preview.feature.<id>`
- `packages/engine/src/agents/policy-evaluation-core.ts` — evaluate preview-feature refs against preview state
- `packages/engine/src/agents/policy-preview.ts` — provide preview-state feature evaluation support
- `packages/engine/src/agents/policy-surface.ts` or adjacent policy-contract files — extend surface-family typing if needed
- `packages/engine/src/kernel/types-core.ts`
- `packages/engine/src/kernel/schemas-core.ts`
- `docs/agent-dsl-cookbook.md`

## Testing Strategy

1. Unit test: `preview.feature.<id>` compiles when `<id>` is an authored state feature
2. Unit test: unknown preview feature id is rejected
3. Unit test: preview feature evaluates the same expression on preview state, not current state
4. Unit test: preview-feature refs respect existing unknown/unresolved preview semantics
5. Integration test: a production FITL granting-event candidate can improve score via a preview-visible board-state feature even when immediate victory margin is unchanged

## Expected Impact

Spec 111 makes granted-operation preview mechanically correct. Spec 112 makes capability-state deltas observable. This spec closes the remaining gap for board-state valuation by letting policies observe their own authored state features on previewed post-move state.

Together, these three specs make event and granted-operation evaluation far more faithful without hard-coding any game strategy into the engine.
