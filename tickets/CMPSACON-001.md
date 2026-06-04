# CMPSACON-001: Compound operation+SA enumeration publishes non-constructible moves

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — `kernel/legal-moves.ts` (compound variant enumeration), `kernel/legal-choices.ts` (`maybeChainCompoundSA`), `kernel/microturn/apply.ts` + `kernel/microturn/drive.ts` (compound continuation guard)
**Deps**: `archive/specs/210-fitl-behavioral-competence-fixture-corpus.md`, `rules/fire-in-the-lake/fire-in-the-lake-rules-section-3.md`, `rules/fire-in-the-lake/fire-in-the-lake-rules-section-4.md`, `docs/FOUNDATIONS.md`

## Problem

On branch `implemented-spec-210` (PR #300), 11 CI lanes fail (determinism parity shards, `policy-canaries`, `fitl-rules`, `slow-parity-a/b/c`, `performance`, `perf`, `policy-preview-parity`). They collapse to one kernel defect: the engine **publishes a compound operation+special-activity move as legal, then throws `MICROTURN_APPLY_DECISION_CONTINUATION_ILLEGAL:chooseNStep` (or `chooseN missing move param binding`) when the move is applied** — a direct violation of Foundation 18 (Constructibility Is Part of Legality).

Captured ground truth (FITL determinism seed 123, instrumented at the throw site in `apply.ts`):

```
actionId=march  saActionId=ambushNva  saTiming=after
topParams = [3 resolved march decision keys]      ← main operation fully resolved
saParams  = []                                    ← special-activity params EMPTY
illegal   = { kind:'illegal', complete:false, reason:'emptyDomain' }
```

The selected move is a **degenerate compound**: `march → $targetSpaces=["binh-dinh"]` but `$movingGuerrillas=[]` and `$movingTroops=[]` — a March that moves **zero units** — paired with an Ambush that then has no target. `applyMove` correctly rejects the bare march as `moveNotLegalInCurrentState / emptyDomain`; the new apply-time compound guard converts that into a hard throw.

### Why this is genuinely illegal (FITL rules)

- **3.3.2 March**: March Operations *move* Guerrillas/Troops *into* spaces, paying 1 Resource per space *moved into*. A March that moves 0 units into its only destination is not a March.
- **4.4.3 Ambush**: "At least 1 NVA Guerrilla that **Marched into**... each space must be Underground." A 0-unit March cannot satisfy Ambush; the compound is unconstructible.

The same defect produces the `chooseN missing move param binding: $usLiftTroops` surface for ARVN Train+Transport compounds (pipeline 18): the committed operation doesn't set up the SA's later-stage binding.

## Assumption Reassessment (2026-06-04)

1. **`compoundVariantsForOperation` is new in this PR.** Confirmed: `git diff origin/main...HEAD -- packages/engine/src/kernel/legal-moves.ts` adds `compoundVariantsForOperation`, `compoundSpecialActivitiesForOperation`, and `compoundPayloadsForOperationSpecialPair` (+141 lines). For a bare `operationPlusSpecialActivity` operation with compound variants, `tryPushOptionMatrixFilteredMove` now **suppresses the standalone operation** and emits only `op+SA(after)` variants with `specialActivity.params: {}`.
2. **`maybeChainCompoundSA` pre-existed; only its `timing === 'after'` post-main-state discovery is new.** Confirmed: `origin/main` already has `maybeChainCompoundSA`/`chainCompoundSA`; commit `60864c7c` (210FITLCOMP-007) added the `compoundDiscoveryState` (post-main-op) probe for `timing:'after'`.
3. **The apply-time guard in `applyChosenMove`/`applyChosenMoveNoFinalHash` is new.** Confirmed: the `if (move.compound !== undefined) { resolveDecisionContinuation(... {choose: () => undefined}); if (illegal) throw }` block is added in this PR (`apply.ts` + `drive.ts`). On `main` there is no such re-probe; the SA decisions were resolved during the microturn and baked into `compound.specialActivity.params` before apply.
4. **The bare-march path on `main` never commits a 0-unit march.** Inference from green `main` CI: standalone March resolution does not yield 0-unit marches; the new lazy compound path does not carry that constraint forward.
5. **The instrumentation hypothesis "fall back to pre-main SA discovery" is REJECTED.** Measured: for `ambushNva`, post-main discovery yields 1 option, pre-main yields 0. Post-main discovery is correct; the inconsistency is between the SA viability seen at *enumeration* (validated against a partial/alternative main resolution) and the SA viability given the agent's *committed* main resolution.

## Architecture Check

1. **Root cause, not symptom (Foundation 15).** The apply-time guard throw is a crude catch for an enumeration↔apply inconsistency. The fix must make publication and execution agree, per Foundation 18: "A move is not legal for clients unless it is constructible under the kernel's bounded deterministic rules protocol." A compound op+SA whose committed operation cannot construct the SA must not be publishable in a form the agent can commit into a non-constructible state.
2. **Determinism is sacred (Foundation 8).** All candidate fixes touch the legal-move enumeration / microturn continuation path. Any change MUST preserve replay identity and incremental-vs-full Zobrist parity across the FITL determinism corpus. Verification is part of acceptance, not optional.
3. **Game-agnosticism (Foundation 1, Foundation 19).** The fix lives in the agnostic kernel; the March/Ambush/Transport semantics come from the compiled `GameSpecDoc`, not from kernel branching. No FITL-specific identifiers may leak into `legal-moves.ts` / `legal-choices.ts`. The compound op+SA pairing is data-driven (`accompanyingOps`, plan-template `compound` payloads); the constructibility check must be expressed generically over "operation resolution must leave the paired SA with ≥1 constructible option."
4. **No backwards-compat shims (Foundation 14).** Do not keep the `emptyDomain → throw` guard as a fallback. Either the move is never published in a committable non-constructible form, or the guard is replaced by a principled rollback (Foundation 18 "Runtime safety net": deterministic rollback to the nearest `actionSelection` frame + blacklist), not an unconditional throw.

## What to Change

### 1. Decide the enforcement layer (design decision required before implementation)

Three candidate shapes were identified during diagnosis; pick one and record the rationale in this ticket before coding:

- **(A) Prune at enumeration** — in `compoundVariantsForOperation` (`legal-moves.ts`), do not emit a compound op+SA variant whose operation cannot productively support the SA. Cleanest semantically; requires resolving operation viability during enumeration within the publication probe budget (Foundation 18 publication contract + Foundation 10 bounded computation).
- **(B) Constrain during resolution** — propagate the SA requirement (e.g. Ambush ⇒ ≥1 Guerrilla marched into the space) into the operation's chooseN legal options so the agent cannot commit the dead-end resolution. Most faithful to FITL 4.4.3; most invasive; risks coupling SA semantics into operation enumeration.
- **(C) Principled runtime rollback** — when the committed operation yields SA `emptyDomain`, invoke the Foundation 18 runtime safety net: deterministically roll back to the nearest `actionSelection` frame, blacklist the offending compound for `(turnId, seatId)`, and re-publish — instead of the current unconditional throw. Smallest blast radius; aligns with the documented recovery pipeline; but only correct if the compound genuinely should be withdrawn rather than degraded to operation-only.

**Recommendation**: Prefer (A) for constructibility-at-publication (Foundation 18's primary contract), with (C) as the residual safety net for state-dependent branches deeper than the publication budget. (B) only if (A) cannot bound the operation-viability probe.

### 2. Remove / replace the unconditional compound guard

The `if (continuation.illegal !== undefined) throw` blocks in `applyChosenMove` (`apply.ts`) and `applyChosenMoveNoFinalHash` (`drive.ts`) must be reconciled with the chosen layer. An unconditional throw on a legally-published move is a Foundation 18 violation regardless of the enumeration fix.

### 3. Reconcile enumeration-time vs apply-time SA discovery state

`maybeChainCompoundSA`'s post-main `compoundDiscoveryState` (added by 210FITLCOMP-007 for Transport destinations) must be applied consistently at both enumeration and apply, so the SA viability seen when the move is published equals the SA viability when the agent's committed operation is executed.

## Files to Touch

- `packages/engine/src/kernel/legal-moves.ts` (modify — compound variant enumeration / constructibility probe)
- `packages/engine/src/kernel/legal-choices.ts` (modify — `maybeChainCompoundSA` discovery-state consistency)
- `packages/engine/src/kernel/microturn/apply.ts` (modify — compound continuation guard)
- `packages/engine/src/kernel/microturn/drive.ts` (modify — `*NoFinalHash` twin)
- `packages/engine/test/...` (new — constructibility regression; see Test Plan)

## Out of Scope

- The lint, runner `ChoiceTargetKind` typecheck, and bootstrap-fixture-drift fixes (already landed on PR #300 in commits `ef185d8` and `4f1a97f`).
- The Train+Transport postState probe `0 !== 1` facet — tracked separately in **CMPSACON-002** (may be subsumed by this fix; verify after landing).
- Any softening of determinism, golden-trace, or convergence-witness tests to make the symptom pass (forbidden by `.claude/rules/testing.md`).

## Acceptance Criteria

### Tests That Must Pass

1. New architectural-invariant: every published compound op+SA move is constructible — for a corpus of FITL states, every move in `legalMoves(def, state)` with a `compound` payload applies via `applyMove` without throwing `MICROTURN_APPLY_DECISION_CONTINUATION_ILLEGAL` or `chooseN missing move param binding`.
2. New convergence-witness (or distilled invariant): FITL determinism seed 123 (`dist/test/determinism/zobrist-incremental-parity-fitl-seed-123.test.js`) reaches a bounded stop reason with incremental-vs-full Zobrist parity — no compound continuation throw.
3. Existing suite (the 11 failing lanes): `pnpm -F @ludoforge/engine test:integration:fitl-rules`, `test:integration:policy-canaries`, `test:integration:slow-parity:shard-a/b/c`, `test:integration:fitl-events:shard-c`, `test:performance`, `test:perf`, `test:architecture:policy-preview-parity`, and `engine-determinism` runtime-parity + zobrist-123 shards.

### Invariants

1. **Constructibility = legality (Foundation 18):** no published move (compound or otherwise) is rejected by `applyMove`. Publication and execution cannot diverge.
2. **Determinism (Foundation 8):** incremental Zobrist hash equals full recompute every move; replay produces identical canonical serialized state for the FITL corpus.
3. **Agnosticism (Foundation 1):** no FITL-specific identifiers introduced into `legal-moves.ts` / `legal-choices.ts`; the constructibility check is generic over op+SA pairings.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/compound-op-sa-constructibility.test.ts` (new, `architectural-invariant`) — for a seed/profile corpus, assert every enumerated `compound` move applies without a continuation/binding throw. This is the regression that would have caught CMPSACON-001.
2. Retarget/keep the existing FITL determinism + slow-parity witnesses (do not soften; consult `.claude/rules/testing.md` Update Protocol per marker class).

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/determinism/zobrist-incremental-parity-fitl-seed-123.test.js`
2. `pnpm -F @ludoforge/engine test:integration:fitl-rules` (fast root reproduction: `fitl-arvn-transport-constraint-migration.test.js`)
3. `pnpm turbo lint typecheck build`
4. `pnpm -F @ludoforge/engine test:all` (full engine sanity; heavy lanes may be deferred to CI per environment constraints)
