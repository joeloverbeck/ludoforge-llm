## 139CCONLEGCONT-003: Classifier full-path certificate + memoization + explicitStochastic verdict (Foundation 14 atomic cut)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — kernel classifier, wrapper helpers, runtime-warning schema, agent sampler consumer migrations
**Deps**: `archive/tickets/139CCONLEGCONT-001.md`, `archive/tickets/139CCONLEGCONT-002.md`

## Problem

Spec 139 D2 replaces Spec 138's head-only `canonicalViableHeadSelection` with a full-path `CompletionCertificate` emitted by a memoized DFS with failed-prefix nogoods. Spec 139 D2.1 also expands `DecisionSequenceSatisfiability` with `'explicitStochastic'` as a first-class admission verdict so that `pendingStochastic` frontiers don't collapse into `'unknown'` (which the new contract rejects). Spec 139 D4 adds per-classification-call memoization keyed on `(projectedStateHash, actionId, normalized-partial-binding, pending-request-fingerprint)` plus nogood recording.

Per Foundation #14, this ticket is an **atomic cut**: every consumer of the deleted Spec 138 artifacts (`emitCanonicalViableHeadSelection`, `canonicalViableHeadSelection`, `buildCanonicalGuidedChoose`, `GUIDED_COMPLETION_UNEXPECTED_MISS`) is migrated in the same change. The agent's retry loop and the three agent `Error(...)` throws remain in place until ticket 005 — their removal waits on the certificate fallback path, which in turn waits on ticket 004's admission contract and `certificateIndex`. The atomic cut here targets only the head-guidance machinery, which becomes dead code once the full-path certificate supersedes it.

The diff exceeds a typical review size because the atomic cut touches every consumer of the deleted symbols. Per the Foundation 14 exception in `spec-to-tickets`, the uniformity of the mechanical deletions (3 source files, 2 test files migrated, 1 test file deleted) keeps the diff reviewable.

## Assumption Reassessment (2026-04-19)

1. `decision-sequence-satisfiability.ts` (323 lines) exposes `classifyDecisionSequenceSatisfiability` and has the head-only opt-in at lines 28, 225+, 269-317. The `'pendingStochastic' → return 'unknown'` mapping is at line 141 — that single line is the lever for D2.1.
2. `canonicalViableHeadSelection` / `emitCanonicalViableHeadSelection` / `buildCanonicalGuidedChoose` / `GUIDED_COMPLETION_UNEXPECTED_MISS` are referenced in: `decision-sequence-satisfiability.ts`, `move-decision-sequence.ts`, `prepare-playable-moves.ts` (source); `decision-sequence-satisfiability.test.ts`, `prepare-playable-moves-retry.test.ts`, `prepare-playable-moves-guided-convergence.test.ts`, `fitl-seed-guided-classifier-coverage.test.ts` (tests). Agent prepared migration table: see T0 below.
3. The `CompletionCertificate` type and materialization (ticket 001) and set-variable propagation (ticket 002) are prerequisites — the classifier composes them.
4. `move-decision-sequence.ts:170` (`isMoveDecisionSequenceSatisfiable`) and `:203` (`isMoveDecisionSequenceAdmittedForLegalMove`) are the wrapper booleans that must handle the new `'explicitStochastic'` verdict as admissible (return `true`).
5. The `GUIDED_COMPLETION_UNEXPECTED_MISS` runtime-warning code is registered in the `types-core.ts` warning schema — that registration must be deleted along with the emission site.

## Architecture Check

1. **Single source of truth for admission legality.** The classifier's verdict (one of `'satisfiable'`, `'unsatisfiable'`, `'unknown'`, `'explicitStochastic'`) is the sole kernel artifact representing admission legality. No bypasses, no parallel legality paths (Foundation #5).
2. **Type-enforced three-category admission (Foundation #18 precondition).** Adding `'explicitStochastic'` to the union makes D7.1's three-category amendment self-enforcing in the type system rather than checked by convention outside the classifier.
3. **Memo cache is scoped-internal mutation.** The memo lives for the duration of a single `classifyDecisionSequenceSatisfiability` invocation; discarded at the end. No cross-call cache, no aliasing leak. Qualifies under Foundation #11's "Scoped internal mutation" exception. Regression test (T11 below) enforces isolation.
4. **No shims.** Foundation #14 atomic cut — every consumer of deleted symbols is migrated in this change. No deprecated fallbacks, no `_legacy` paths.
5. **Bounded search preserved.** Reuses `MoveEnumerationBudgets` (no new constant). Memoization reduces redundant work; nogoods prune failed prefixes; set-variable propagation from 002 replaces raw subset enumeration in the `supportedSelections` substrate.

## What to Change

### 1. `packages/engine/src/kernel/decision-sequence-satisfiability.ts` — D2.1, D2.2, D2.3

- **D2.1**: Expand the union type: `export type DecisionSequenceSatisfiability = 'satisfiable' | 'unsatisfiable' | 'unknown' | 'explicitStochastic';`
- **D2.1**: Change line 141's `if (request.kind === 'pendingStochastic') return 'unknown';` to `return 'explicitStochastic';`. Apply the same change inside any emit-certificate path (see D2.3).
- **D2.2**: Delete the `emitCanonicalViableHeadSelection?: boolean` field from `DecisionSequenceSatisfiabilityOptions` (line 28). Delete the `canonicalViableHeadSelection?: MoveParamValue` field from `DecisionSequenceSatisfiabilityResult` (line 21). Add `emitCompletionCertificate?: boolean` to the options and `certificate?: CompletionCertificate` to the result.
- **D2.2**: Delete the entire head-only emit-viable-head code path at lines 225-322. Replace with the new memoized DFS that emits full-path certificates.
- **D2.3**: Implement the memoized DFS per spec D2 algorithm. Memo key shape: template-literal `` `${projectedStateHash}:${actionId}:${normalizedPartialBinding}:${pendingRequestFingerprint}` ``. `normalize(move.params)` sorts keys lexicographically and serializes values via the canonical state-hash encoding. `pending-request-fingerprint` includes request type, decision key, options-list hash, and `(min, max)` for `chooseN`.
- **D2.3**: When a `chooseN` request is reached, call `propagateChooseNSetVariable` from ticket 002's module. If `kind === 'determined'`, the selection becomes the next assignment. If `kind === 'branching'`, recurse on each candidate in canonical order. If `kind === 'unsat'`, return `Unsat`.
- **D2.3**: When a child recursion returns `'explicitStochastic'` (mid-sequence stochastic boundary via a specific binding), the parent returns `Sat` with a partial certificate containing only the pre-stochastic decisions — downstream stochastic resolution runs via `chooseStochastic` per spec Edge Cases.
- **D2.3**: Nogood recording — when a child branch returns `Unsat`, record `(parent memo key, selection)` in the per-call memo so repeated subtrees short-circuit. Nogoods are discarded with the memo at end of call.
- Delete `enumerateChooseNSelections` (lines 46-91) and its caller `forEachDecisionSelection` (lines 93-110) — the new memoized DFS calls `propagateChooseNSetVariable` directly. `chooseOne` enumeration continues via `selectChoiceOptionValuesByLegalityPrecedence` (existing helper, retained).

### 2. `packages/engine/src/kernel/move-decision-sequence.ts` — wrapper updates

- `isMoveDecisionSequenceSatisfiable` (line 170): return `true` for `'satisfiable'` AND `'explicitStochastic'`.
- `isMoveDecisionSequenceAdmittedForLegalMove` (line 203): return `true` for `'satisfiable'` AND `'explicitStochastic'`. (Ticket 004 will replace this helper entirely with the new switch-based admission; in this ticket it remains admissive of both verdicts so the build stays green pre-004.)
- `classifyMoveDecisionSequenceSatisfiabilityForLegalMove` (line 219): pass through the new `emitCompletionCertificate` option and `certificate` result field. Delete `emitCanonicalViableHeadSelection` / `canonicalViableHeadSelection` passthrough.
- `classifyMoveDecisionSequenceAdmissionForLegalMove` (line 180): same passthrough updates.

### 3. `packages/engine/src/agents/prepare-playable-moves.ts` — Spec 138 artifact deletion

- Delete `buildCanonicalGuidedChoose` (lines 62-80) entirely.
- Delete `maybeActivateGuidance` (around line 283) and the block at line 304-314 that conditionally wires the guided chooser into the retry loop.
- Delete the `GUIDED_COMPLETION_UNEXPECTED_MISS` warning emission (line 425).
- The retry loop itself remains intact; the dead-end branch continues to exit the loop with `completedMoves = []`, at which point the three agent `Error(...)` throws still fire — those throws are deleted in ticket 005 once the certificate fallback (which needs `certificateIndex` from ticket 004) is wired in.

### 4. `packages/engine/src/kernel/types-core.ts` — warning-schema cleanup

- Delete the `GUIDED_COMPLETION_UNEXPECTED_MISS` entry from the `RuntimeWarning` code union / schema. No downstream consumer survives the atomic cut.

### 5. Test migrations and deletions (T0 from spec § Testing Strategy)

- **Migrate** `packages/engine/test/unit/kernel/decision-sequence-satisfiability.test.ts`: replace `canonicalViableHeadSelection` assertions with `certificate` coverage. Add new assertions for the `'explicitStochastic'` verdict on `pendingStochastic` request kinds (both root-level and mid-sequence boundary cases).
- **Delete** `packages/engine/test/integration/fitl-seed-guided-classifier-coverage.test.ts`: obsoleted when `emitCanonicalViableHeadSelection` is removed.
- **Delete** `packages/engine/test/integration/prepare-playable-moves-guided-convergence.test.ts`: exercises `buildCanonicalGuidedChoose` convergence; the machinery is gone. T4 (ticket 005) supersedes.
- **Migrate** `packages/engine/test/unit/agents/prepare-playable-moves-retry.test.ts`: drop all `GUIDED_COMPLETION_UNEXPECTED_MISS` assertions. Preserve retry-budget assertions (they remain valid under the unchanged retry loop).

### 6. New memo-isolation regression test

File: `packages/engine/test/unit/kernel/decision-sequence-satisfiability-memo-isolation.test.ts`

File-top marker: `// @test-class: architectural-invariant`.

Assertions:

- Call `classifyDecisionSequenceSatisfiability` twice in sequence; assert the second call's memo cache starts empty (no state leak across calls).
- Assert the input `move` object is not mutated during classification (deep equality to a pre-call clone).
- Assert the memo cache is garbage-collectible: no closure retains a reference after the call returns (indirectly verified via a second distinct call producing the same result shape; true leak detection is beyond unit-test scope).

## Files to Touch

- `packages/engine/src/kernel/decision-sequence-satisfiability.ts` (modify — large rewrite)
- `packages/engine/src/kernel/move-decision-sequence.ts` (modify — wrapper updates)
- `packages/engine/src/agents/prepare-playable-moves.ts` (modify — delete buildCanonicalGuidedChoose, maybeActivateGuidance, GUIDED_COMPLETION_UNEXPECTED_MISS emission)
- `packages/engine/src/kernel/types-core.ts` (modify — delete warning-schema entry)
- `packages/engine/test/unit/kernel/decision-sequence-satisfiability.test.ts` (modify — migrate)
- `packages/engine/test/integration/fitl-seed-guided-classifier-coverage.test.ts` (delete)
- `packages/engine/test/integration/prepare-playable-moves-guided-convergence.test.ts` (delete)
- `packages/engine/test/unit/agents/prepare-playable-moves-retry.test.ts` (modify — migrate)
- `packages/engine/test/unit/kernel/decision-sequence-satisfiability-memo-isolation.test.ts` (new)

## Out of Scope

- Admission contract change in `legal-moves.ts` — ticket 004.
- Agent certificate fallback path — ticket 005.
- Agent throw deletion — ticket 005.
- FOUNDATIONS.md amendments — ticket 006.
- Replay-identity corpus sweep — ticket 007.
- Hidden-info and performance gates — ticket 008.

## Acceptance Criteria

### Tests That Must Pass

1. Migrated `decision-sequence-satisfiability.test.ts` passes with new certificate + `'explicitStochastic'` coverage.
2. Migrated `prepare-playable-moves-retry.test.ts` passes without `GUIDED_COMPLETION_UNEXPECTED_MISS` assertions.
3. New memo-isolation regression test passes.
4. No test under `packages/engine/test/**` references `canonicalViableHeadSelection`, `emitCanonicalViableHeadSelection`, `buildCanonicalGuidedChoose`, or `GUIDED_COMPLETION_UNEXPECTED_MISS` after this ticket lands (grep validates).
5. Full suite green except for the three pre-existing CI failures (zobrist-incremental-parity seed=123, fitl-canary seeds 1002/1010 under `arvn-evolved`) — those still fail because the agent throws remain until ticket 005. Note this transitional state in the PR/commit description.
6. Lint, typecheck: `pnpm turbo lint && pnpm turbo typecheck` pass.

### Invariants

1. `DecisionSequenceSatisfiability` union has exactly 4 variants; `'explicitStochastic'` is type-enforced as a first-class admission verdict (Foundation #5, #18).
2. Classifier is pure and deterministic: same `(state, move, options)` → byte-identical `DecisionSequenceSatisfiabilityResult` (Foundation #8).
3. Memo cache does not leak across calls; input state is never mutated (Foundation #11 + scoped-internal-mutation exception).
4. No grep hit in source or test files for the deleted Spec 138 symbols after this ticket (Foundation #14).
5. Wrapper booleans admit both `'satisfiable'` and `'explicitStochastic'` — no verdict is silently dropped.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/decision-sequence-satisfiability.test.ts` — migrate head-only assertions to full-path certificate assertions; add explicitStochastic coverage.
2. `packages/engine/test/unit/agents/prepare-playable-moves-retry.test.ts` — drop GUIDED_COMPLETION_UNEXPECTED_MISS; keep retry-budget assertions.
3. `packages/engine/test/unit/kernel/decision-sequence-satisfiability-memo-isolation.test.ts` (new) — memo scope, no mutation, cross-call isolation.

### Commands

1. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test:unit` — targeted unit + migration.
2. `pnpm -F @ludoforge/engine test:integration` — integration layer (expect known failures on the three seeds until ticket 005).
3. `pnpm turbo lint && pnpm turbo typecheck` — gates.
4. `grep -rE 'canonicalViableHeadSelection|emitCanonicalViableHeadSelection|buildCanonicalGuidedChoose|GUIDED_COMPLETION_UNEXPECTED_MISS' packages/engine/` — must return zero matches (the Foundation #14 atomic-cut invariant).
