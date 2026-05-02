# 153RUNTSOT-003: Add F11 corollary for runtime-mutated structural state field source-of-truth

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — documentation only (`docs/FOUNDATIONS.md`)
**Deps**: `archive/specs/153-turn-flow-runtime-state-source-of-truth.md`

## Problem

Foundation 11 (Immutability) currently mandates that "all state transitions MUST return new objects" and authorizes a scoped internal mutation exception for performance. It does not explicitly enumerate the runtime-rebuild seams where caller-visible field drops can occur — the failure mode that broke PR #231 for one full day on commit `ddcf3ef9`.

The structural fix delivered by ticket 153RUNTSOT-001 closes the gap mechanically: with the four helpers converted to `state → state`, there is no input runtime parameter for callers to thread stale snapshots through. But the principle behind the fix — *internal helpers that further transform a kernel-mutated state MUST source kernel-mutated structural fields from the post-effect state, not from a separately-parameterized runtime snapshot taken before the kernel call* — must be discoverable to future contributors so the same shape is not reintroduced.

This ticket adds a one-paragraph corollary to F11 that codifies the principle. The corollary is referenced by ticket 153RUNTSOT-002's property test marker — together they form the documented + proven contract.

## Assumption Reassessment (2026-05-02)

1. **F11 location** verified: `docs/FOUNDATIONS.md` Section 11 ("Immutability") at lines 69-75, with the "Exception — Scoped internal mutation" paragraph at line 75.
2. **Insertion point**: immediately after the "Exception — Scoped internal mutation" paragraph (line 75), before Section 12 ("Compiler-Kernel Validation Boundary") at line 77.
3. **Cross-reference target**: the corollary is referenced by name from ticket 153RUNTSOT-002's property test marker comment. The corollary's anchor phrase ("Single source of truth for kernel-mutated structural state fields") is the citation key.
4. **Spec 150 dependency** is archived/COMPLETED; this ticket extends the principle Spec 150 introduced rather than depending on its implementation.

## Architecture Check

1. **Foundation 11 (Immutability)**: the corollary is a direct consequence of F11's existing "Scoped internal mutation" exception clause — "no aliasing that can leak outside the scope, and no observation before finalization." The corollary makes the converse explicit: no observation of pre-mutation runtime AS IF it were post-mutation runtime, either. It does not warrant a new principle (#20) because it does not introduce a new architectural commandment — it makes an implicit consequence of F11 explicit.
2. **Foundation 15 (Architectural Completeness)**: the corollary anchors the structural fix delivered by ticket 001. Without the documented principle, future contributors might reintroduce the `runtime → runtime` shape (e.g., when adding a new structural runtime field). The corollary closes that loop.
3. **Foundation 16 (Testing as Proof)**: the corollary's "MUST be enforced by an architectural-invariant test for each kernel-mutated structural field" clause is honored by ticket 002's property test, which references this corollary by name.
4. **Scope discipline**: the corollary is anchored on "internal helpers that further transform that state" — kernel-internal helpers, not all kernel functions. This narrowing prevents misinterpretation as a global lint rule banning all `runtime → runtime` helpers across the kernel.

## What to Change

### 1. Add corollary paragraph to `docs/FOUNDATIONS.md`

Insert the following paragraph immediately after the "Exception — Scoped internal mutation" paragraph in Section 11 (Immutability), before the start of Section 12:

```markdown
**Corollary — Single source of truth for kernel-mutated structural state fields**: When a kernel function returns a new `GameState` whose internal runtime structure has been mutated (e.g., `state.turnOrderState.runtime.lifecycleStatus`, `state.turnOrderState.runtime.consecutiveCoupRounds`, or any future analogous field), internal helpers that further transform that state MUST source the mutated fields from the post-effect state, not from a separately-parameterized snapshot of the runtime taken before the kernel call. The canonical helper shape for state-mutating internal helpers is `state -> state`: take state, derive runtime via the canonical accessor at use-time, mutate one or more fields, return state. The `runtime -> runtime` (or analogous) helper shape is forbidden in kernel internals because it allows callers to thread a stale runtime snapshot through helper composition and silently drop fields the caller does not know about. This corollary MUST be enforced by an architectural-invariant test for each kernel-mutated structural field, asserting that the field's value is observable to every reachable downstream code path.
```

The paragraph stands as Markdown body text within Section 11; do not promote to a numbered subsection. Do not modify any other Foundation. Do not modify the Appendix.

## Files to Touch

- `docs/FOUNDATIONS.md` (modify) — insert one paragraph in Section 11 between the existing "Exception — Scoped internal mutation" paragraph and Section 12

## Out of Scope

- Promoting the corollary to a standalone numbered Foundation (#20). Spec 153's analysis explicitly rejects this: the corollary is a direct consequence of F11, not a new commandment.
- Generalizing the rule to all kernel modules via a global lint pass. Spec 153 D5 explicitly defers any kernel-wide audit to a follow-up spec if the corollary proves insufficient over time.
- Modifying any code (kernel, compiler, test). This ticket is documentation only.
- Authoring the property test that proves the corollary (owned by ticket 153RUNTSOT-002).
- Converting the runtime helpers to `state → state` (owned by ticket 153RUNTSOT-001).

## Acceptance Criteria

### Tests That Must Pass

1. `docs/FOUNDATIONS.md` parses as valid Markdown (no structural breakage).
2. The new paragraph appears in Section 11 between the "Exception — Scoped internal mutation" paragraph and Section 12.
3. Existing suite: `pnpm turbo test` (no test should regress on a docs-only change).

### Invariants

1. **Corollary anchored on F11**: the paragraph is inside Section 11, not inside a separate section, and its text references F11's "Scoped internal mutation" exception by name.
2. **Anchor phrase preserved**: the bolded lead-in phrase "Single source of truth for kernel-mutated structural state fields" appears verbatim, since ticket 002's property test marker comment cites it.
3. **No other Foundations modified**: a `git diff` against `docs/FOUNDATIONS.md` shows only the additive paragraph; Sections 1-10, 12-19, and the Appendix are unchanged.

## Test Plan

### New/Modified Tests

1. No automated tests — documentation-only change. Verification is by visual inspection of the diff against `docs/FOUNDATIONS.md` and confirmation that ticket 002's marker comment can cite the corollary by anchor phrase.

### Commands

1. `git diff docs/FOUNDATIONS.md` — verify only the additive paragraph was inserted, with no incidental edits to other Foundations or the Appendix.
2. `pnpm turbo test` — confirm no regression (docs-only change should not affect any test).
3. `grep -nF "Single source of truth for kernel-mutated structural state fields" docs/FOUNDATIONS.md` — verify the anchor phrase landed verbatim for ticket 002's reference.

## Outcome (2026-05-02)

Outcome amended: 2026-05-02 — dependency path updated after Spec 153 was archived.

- Added the F11 corollary to `docs/FOUNDATIONS.md` immediately after the existing "Exception — Scoped internal mutation" paragraph and before Section 12.
- Preserved the anchor phrase `Single source of truth for kernel-mutated structural state fields` verbatim for the `153RUNTSOT-002` property-test marker.
- Schema/artifact fallout: none; this is a documentation-only change.
- Deferred sibling scope: helper conversion remains owned by `153RUNTSOT-001`; the architectural-invariant property test remains owned by `153RUNTSOT-002`.
- Verification results:
  - `git diff docs/FOUNDATIONS.md` — passed; only the additive F11 corollary paragraph changed.
  - `grep -nF "Single source of truth for kernel-mutated structural state fields" docs/FOUNDATIONS.md` — passed at line 77.
  - `pnpm turbo test` — passed after rerunning outside the sandbox. The first sandboxed run failed because `packages/engine/test/unit/walker-deletion-enforcement.test.ts` uses `execSync` and the sandbox blocked `/bin/sh` with `EPERM`; the approved rerun completed green.
- No-invalidation note: this result transcription does not change the ticket's scope, acceptance criteria, touched-file boundary, or proof lanes.
